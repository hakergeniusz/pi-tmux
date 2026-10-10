import { test, expect } from "bun:test";
import { sanitize, sessionName, shq } from "./index.ts";

test("sanitize keeps tmux-valid chars only", () => {
	expect(sanitize("01a11c4c-667d-77ea-9b52-4dd148e1fb45")).toBe("01a11c4c-667d-77ea-9b52-4dd148e1fb45");
	expect(sanitize("a/b:c d$e")).toBe("abcde");
	expect(sanitize("x".repeat(100))).toHaveLength(64);
});

test("sessionName prefixes and honors override", () => {
	expect(sessionName("01a11c4c-667d-77ea-9b52-4dd148e1fb45")).toBe(
		"pi-01a11c4c-667d-77ea-9b52-4dd148e1fb45",
	);
	expect(sessionName("abc", "my session")).toBe("pi-mysession");
	expect(sessionName("abc", "")).toBe("pi-abc");
	expect(sessionName("abc", "  ")).toBe("pi-abc");
});

test("shq shell-quotes single-quoted strings", () => {
	expect(shq("plain")).toBe("'plain'");
	expect(shq("it's")).toBe("'it'\\''s'");
	expect(shq("/home/me/.pi/agent/sessions/x.jsonl")).toBe("'/home/me/.pi/agent/sessions/x.jsonl'");
});
