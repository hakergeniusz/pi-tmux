// pi-tmux: move the running Pi session into a detached tmux session with `/tmux`,
// so the conversation survives closing or losing the terminal.
//
// How it works / why a restart:
// Relocating an already-running TUI process into a new terminal needs a pty
// stealer (reptyr) that isn't installed in this environment (and pi cannot
// sudo to install it). So instead we resume the *same* session — same
// transcript, model, thinking level and cwd, all of which Pi persists to the
// session file — inside a fresh detached Pi running in tmux, then quit this
// one. The only state that does not survive is an in-flight tool call or a
// still-streaming assistant message.
//
// Flow:
//   1. /tmux          -> create a detached tmux session whose pane runs a tiny
//                        launcher script.
//   2. launcher      -> wait until THIS Pi process exits (so the session file
//                        is released), then `exec pi --session <file>`.
//   3. this process  -> ctx.shutdown() flushes + releases the file and exits.
//   4. launcher sees the PID gone -> starts the resumed Pi in the tmux pane.
//   The user does `tmux a -t <name>` to get back to Pi, and `prefix-d` to
//   detach again later, leaving Pi running.
//
// Usage:  /tmux [name]   (name overrides the tmux session name)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PREFIX = "pi";
/** How long the launcher waits (in seconds) for the old Pi to exit before giving up. */
const WAIT_SECONDS = 120;

export function sanitize(text: string): string {
	// tmux session names: alnum, dash, underscore, dot; max 233 chars.
	return text.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
}

export function sessionName(id: string, override?: string): string {
	const base = override && sanitize(override) ? sanitize(override) : sanitize(id);
	return `${PREFIX}-${base}`;
}

/** Single-quote a string for POSIX shell (safe for paths with spaces/quotes). */
export function shq(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tmux", {
		description:
			"Move this Pi session into a detached tmux session so it survives closing the terminal",
		handler: async (args, ctx) => {
			const sessionFile = ctx.sessionManager.getSessionFile();
			const sessionId = ctx.sessionManager.getSessionId();

			if (!sessionFile) {
				ctx.ui.notify(
					"pi-tmux: this session is ephemeral (not saved to disk); cannot resume it in tmux",
					"error",
				);
				return;
			}

			const name = sessionName(sessionId ?? "session", args?.trim());
			const pid = String(process.pid);
			const cwd = ctx.cwd;

			// Make sure tmux and a `pi` binary are available.
			const check = await pi.exec(
				"bash",
				["-c", "command -v tmux && command -v pi && echo ok"],
				{ timeout: 8_000 },
			);
			if (check.code !== 0 || !(check.stdout || "").includes("ok")) {
				ctx.ui.notify(
					"pi-tmux: `tmux` or `pi` is not on PATH in this shell",
					"error",
				);
				return;
			}

			// Don't double-book: if a session with this name exists, tell the user.
			const has = await pi.exec("tmux", ["has-session", "-t", name], {
				timeout: 8_000,
			});
			if (has.code === 0) {
				ctx.ui.notify(
					`pi-tmux: tmux session "${name}" already exists. Attach with:  tmux a -t ${name}`,
					"warning",
				);
				return;
			}

			// Launcher script as a single line (avoids `do;` syntax errors). It
			// deliberately contains NO single quotes so the outer shell's
			// single-quoting (see `command` below) stays intact. The dynamic
			// values arrive as positional args ($1 pid, $2 session file, $3 cwd) so
			// they are never re-interpreted by the outer shell.
			const script =
				`set -u` +
				`; pid=$1; session=$2; start=$3` +
				`; for i in $(seq 1 ${WAIT_SECONDS / 0.25}); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done` +
				// One last chance for the dying Pi to release the session file.
				`; sleep 0.5` +
				`; cd "$start" 2>/dev/null || true` +
				`; exec pi --session "$session"`;

			const command = `bash -c ${shq(script)} _ ${shq(pid)} ${shq(sessionFile)} ${shq(cwd)}`;

			const res = await pi.exec(
				"tmux",
				["new-session", "-d", "-s", name, "-c", cwd, command],
				{ timeout: 15_000 },
			);
			if (res.code !== 0 || res.killed) {
				const out = (res.stderr || res.stdout || "").trim();
				ctx.ui.notify(
					`pi-tmux: failed to create tmux session "${name}": ${out || `exit ${res.code}`}`,
					"error",
				);
				return;
			}

			ctx.ui.notify(
				`pi-tmux: session moved to tmux "${name}". This Pi is quitting. Attach with:  tmux a -t ${name}`,
				"info",
			);

			// Let the notification render before we tear the TUI down.
			await new Promise((r) => setTimeout(r, 500));
			ctx.shutdown();
		},
	});
}
