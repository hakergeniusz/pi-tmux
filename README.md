# pi-tmux

Move the running Pi session into a **detached tmux session** with a single slash command (`/tmux`), so the conversation survives closing or losing the terminal.

```
/tmux          # or: /tmux <name>   (override the tmux session name)
```

## Why a restart instead of a live reattach?

Relocating an *already-running* TUI process into a new terminal normally needs a pty stealer such as `reptyr`, which isn't installed here (and Pi can't `sudo` to install it). Instead, Pi resumes the **same session** — same transcript, model, thinking level and cwd, all of which Pi persists to the session file — inside a fresh detached Pi running in tmux, then quits the old one.

The only state that does **not** survive is an in-flight tool call or a still-streaming assistant message.

## How it works

1. `/tmux` creates a detached tmux session whose pane runs a small launcher script.
2. The launcher waits until the **current** Pi process exits (so the session file is released), then `exec pi --session <file>` — resuming the exact session.
3. Pi gracefully shuts down (`ctx.shutdown()`), flushing + releasing the session file and exiting.
4. The launcher sees the PID is gone and starts the resumed Pi in the tmux pane.

Then attach from any terminal:

```
tmux a -t pi-<session-id>
```

…and detach again later with `prefix d` (default `Ctrl-b d`); Pi keeps running in the pane.

## Installation

```bash
git clone git@github.com:hakergeniusz/pi-tmux.git ~/.local/share/... # or wherever
ln -s /path/to/pi-tmux ~/.pi/agent/extensions/pi-tmux
```

Pi auto-discovers extensions from `~/.pi/agent/extensions/`, so `/reload` (or restart Pi) is enough. The extension is also re-discovered inside the tmux-resumed Pi, so `/tmux` is idempotent (it will tell you if the session already exists rather than creating a duplicate).

## Caveats

- Requires `tmux` and `pi` on `PATH` in the launching shell.
- Won't work for ephemeral sessions (`pi --no-session`) — there's no file to resume.
- If you launched Pi with flags not captured by the session file (e.g. a custom `--system-prompt`), the resumed Pi reads its default system prompt; the conversation, model and thinking level are still restored from the session.

## A true in-place move (optional)

If you have `reptyr` installed and want a zero-restart handoff, the same `/tmux` goal can be achieved by reptyr-ing the live Pi process into a tmux pane. This extension intentionally avoids that dependency for portability.
