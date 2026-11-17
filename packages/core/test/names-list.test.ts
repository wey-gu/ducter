// research/124: three agents read "Claude Code and Codex and pi" (and 「Claude Code 和 Codex 和 pi」) live.
import { expect, test } from "bun:test";
import { namesOf } from "../src/first-words.ts";

test("the agents' names are a list: the last two by and, the rest by the list mark", () => {
  const zh = { and: " 和 ", sep: "、" };
  const en = { and: " and ", sep: ", " };
  expect(namesOf(zh, ["Claude Code", "Codex", "pi"])).toBe("Claude Code、Codex 和 pi");
  expect(namesOf(en, ["Claude Code", "Codex", "pi"])).toBe("Claude Code, Codex and pi");
  expect(namesOf(en, ["Claude Code", "Codex"])).toBe("Claude Code and Codex");
  expect(namesOf(zh, ["Codex"])).toBe("Codex");
});
