// D304: other AI tools' memories named in a task's first turn: titles and ids only where the task
// has the user's own Mem plugin; attributed where Ducter's own recall stands in.
import { expect, test } from "bun:test";
import { knownTurn, OTHERS_MAX, othersTurn } from "../src/brief.ts";

const notes = [
  { id: "m_cc1", title: "Run gofmt -l before committing Ducter's Go code", content: "secret-ish details that stay in Mem", from: "Claude Code" },
  { id: "m_me", title: "Tests use the fake clock", content: "x" },
  { id: "m_cx1", title: "HawDB's compaction test only flakes on Linux CI", content: "y", from: "Codex" },
  { title: "no id", content: "z", from: "Cursor" },
];

test("the plugin's case: other tools' memories by title and id, never their text", () => {
  const s = othersTurn(notes);
  expect(s).toContain("<from_your_other_tools>");
  expect(s).toContain("[m_cc1] Claude Code: Run gofmt -l");
  expect(s).toContain("[m_cx1] Codex: HawDB's compaction");
  expect(s).not.toContain("Tests use the fake clock"); // the person's own: the plugin gives it
  expect(s).not.toContain("no id");
  expect(s).not.toContain("secret-ish");
  expect(othersTurn([notes[1]!])).toBe("");
  expect(othersTurn(Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, title: `t${i}`, from: "Codex" }))).match(/^- \[/gm)!.length).toBe(OTHERS_MAX.notes);
});

test("Ducter's own recall names who saved each note", () => {
  const s = knownTurn([{ ...notes[0]!, date: "2026-11-15" }, notes[1]!], "Ducter");
  expect(s).toContain("(saved by Claude Code, 2026-11-15)");
  expect(s).toContain("Tests use the fake clock: x\n");
});
