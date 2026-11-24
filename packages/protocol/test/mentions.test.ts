// D534: @ and / in the composers: the shared cases (the Mac's mentions_test.go passes them too).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanRefs, labelOf, liveRefs, matchScore, mentionAt, placeToken, refPieces, refSpans, slashAt, splitRefs, withRefs, type Ref } from "../src/mentions.ts";

const fx = JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", "mentions.json"), "utf8"));

test("the @ being typed", () => {
  for (const c of fx.mentionAt) {
    const got = mentionAt(c.text, c.caret);
    if (c.start === null) expect(got).toBeUndefined();
    else expect(got).toEqual({ start: c.start, q: c.q });
  }
});

test("the / being typed: at the start in a task, after a space too for the partner", () => {
  for (const c of fx.slashAt) {
    const got = slashAt(c.text, c.caret, c.task);
    if (c.start === null) expect(got).toBeUndefined();
    else expect(got).toEqual({ start: c.start, q: c.q });
  }
});

test("a picked token replaces what was typed, with one space after it", () => {
  for (const c of fx.placeToken) expect(placeToken(c.text, c.start, c.caret, c.token)).toEqual({ text: c.want, caret: c.wantCaret });
});

test("a reference's name: one line, no @, cut at a word end", () => {
  for (const c of fx.labelOf) expect(labelOf(c.name)).toBe(c.want);
});

test("tokens in the words: longer names first, never overlapping", () => {
  for (const c of fx.refSpans) expect(refSpans(c.text, c.refs).map((s) => [s.start, s.end, s.ref.id])).toEqual(c.want);
});

test("matching forgives the hand", () => {
  for (const c of fx.match) expect(matchScore(c.q, c.name) > 0).toBe(c.hit);
});

test("only the references still in the words go, once each", () => {
  const refs: Ref[] = [
    { kind: "task", id: "t1", label: "修复登录" },
    { kind: "task", id: "t1", label: "修复登录" },
    { kind: "task", id: "t2", label: "deleted one" },
  ];
  expect(liveRefs("@修复登录 再看看", refs)).toEqual([refs[0]!]);
});

test("a client's references are cleaned and bounded", () => {
  const got = cleanRefs([{ kind: "task", id: " t1 ", label: "a\u0007b" }, { kind: "nope", id: "x", label: "y" }, "junk", { kind: "file", id: "", label: "z" }]);
  expect(got).toEqual([{ kind: "task", id: "t1", label: "a b" }]);
  expect(cleanRefs(Array.from({ length: 20 }, (_, i) => ({ kind: "task", id: `t${i}`, label: `n${i}` }))).length).toBe(8);
});

test("a sent message's pieces: words and chips", () => {
  const refs: Ref[] = [{ kind: "task", id: "t1", label: "修复登录" }];
  expect(refPieces("看 @修复登录 吧", refs)).toEqual([{ text: "看 " }, { ref: refs[0]! }, { text: " 吧" }]);
});

test("a task reads its references after the words; its own transcript shows only the words", () => {
  const sent = withRefs("@修复登录 的改动也带上", [{ kind: "task", id: "t1", label: "修复登录", state: "done", about: "Its latest report: fixed\nIts code: branch x" }]);
  expect(sent).toContain("<ducter-refs>");
  expect(sent).toContain('- @修复登录 [task t1]: task "修复登录" (t1, done)');
  expect(splitRefs(sent)).toEqual({ text: "@修复登录 的改动也带上", refs: [{ kind: "task", id: "t1", label: "修复登录" }] });
  expect(splitRefs("plain words")).toEqual({ text: "plain words", refs: [] });
  expect(withRefs("plain", [])).toBe("plain");
});
