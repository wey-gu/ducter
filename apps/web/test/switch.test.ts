// D282: a switch inside one task says itself as one hairline with its time, in both languages:
// another agent (换成 Codex 接着做), another model or effort (换成 Sonnet · 高), another computer.
import { expect, test } from "bun:test";
import { noteOf } from "@ducter/protocol/src/transcript.ts";
import { strings } from "../src/i18n.ts";

test("the hairline words, zh and en", () => {
  const zh = strings("zh");
  const en = strings("en");
  expect(zh.t("note.switched", "Codex", "21:40")).toBe("换成 Codex 接着做 · 21:40");
  expect(en.t("note.switched", "Codex", "21:40")).toBe("Continued on Codex · 21:40");
  expect(zh.t("note.retuned", "Sonnet · 高", "21:40")).toBe("换成 Sonnet · 高 · 21:40");
  expect(en.t("note.retuned", "Sonnet · High", "21:40")).toBe("Now on Sonnet · High · 21:40");
  expect(zh.t("note.moved", "hel", "21:40")).toBe("换到 hel 接着做 · 21:40");
  for (const L of [zh, en]) for (const k of ["switch.tune.note", "note.retuned.default"]) expect(L.t(k, "Claude Code")).not.toBe(k);
});

test("which runner line is which", () => {
  expect(noteOf("x", { switched: { from: "claude-code", to: "codex" } })).toEqual({ say: "switched", name: "Codex" });
  expect(noteOf("x", { retuned: { harness: "codex", model: "gpt-5.5", effort: "high" } })).toEqual({ say: "retuned", name: "gpt-5.5", effort: "high" });
  // A move to another computer logs both; the computer is what it says.
  expect(noteOf("x", { switched: { from: "codex", to: "codex" }, moved: { from: "hel", to: "MacBook" } })).toEqual({ say: "moved", name: "MacBook" });
  expect(noteOf("could not switch: Claude Code here has no model \"gpt-9\"", { slash: "model" })).toMatchObject({ say: "error_resume", bad: true });
});
