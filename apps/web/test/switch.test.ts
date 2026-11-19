// D282: a switch inside one task says itself as one hairline with its time, in both languages:
// another agent (换成 Codex 接着做), another model or effort (换成 Sonnet（高）), another computer;
// its time is drawn apart (D291).
import { expect, test } from "bun:test";
import { noteOf } from "@ducter/protocol/src/transcript.ts";

test("which runner line is which", () => {
  expect(noteOf("x", { switched: { from: "claude-code", to: "codex" } })).toEqual({ say: "switched", name: "Codex" });
  expect(noteOf("x", { retuned: { harness: "codex", model: "gpt-5.5", effort: "high" } })).toEqual({ say: "retuned", name: "gpt-5.5", effort: "high" });
  // A move to another computer logs both; the computer is what it says.
  expect(noteOf("x", { switched: { from: "codex", to: "codex" }, moved: { from: "hel", to: "MacBook" } })).toEqual({ say: "moved", name: "MacBook" });
  expect(noteOf("could not switch: Claude Code here has no model \"gpt-9\"", { slash: "model" })).toMatchObject({ say: "error_resume", bad: true });
});
