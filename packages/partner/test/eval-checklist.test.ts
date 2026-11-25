// D579: a rubric becomes a numbered checklist; the judge answers each point and code takes the verdict.
import { expect, test } from "bun:test";
import { checklist, rubricSentences, verdictOf, type Answer } from "../eval/checklist.ts";
import { scenarios } from "../eval/scenarios.ts";

test("a rubric splits into its sentences, never inside a quote, a parenthesis or an e.g.; a fragment joins the next", () => {
  expect(rubricSentences("One short Chinese ack (e.g. 我接着比一下两家的价格。顺便看机票). No task. Nothing booked.")).toEqual(["One short Chinese ack (e.g. 我接着比一下两家的价格。顺便看机票).", "No task. Nothing booked."]);
  expect(rubricSentences("Live regression: the partner wrote '改名前我先问您一下。请选 Go。' after the card. Pass only if it writes nothing after it.")).toEqual([
    "Live regression: the partner wrote '改名前我先问您一下。请选 Go。' after the card.",
    "Pass only if it writes nothing after it.",
  ]);
  expect(rubricSentences('It says "Done. Merged." nowhere. It doesn\'t ask.')).toEqual(['It says "Done. Merged." nowhere.', "It doesn't ask."]);
});

test("a point that only permits is no must; a may inside a requirement keeps it one", () => {
  const pts = checklist("Answers in one short line, optionally with what it sees now (e.g. still open). A short apology is fine. It may offer one. Naming Codex is fine; no task. Acceptable: a card with default Hold.");
  expect(pts.map((p) => p.must)).toEqual([true, false, false, true, false]);
});

test("the verdict is code's: any must answered no, or left unanswered, fails", () => {
  const pts = checklist("It opens one task. A short apology is fine. No question.");
  const musts = pts.filter((p) => p.must);
  const a = (xs: [number, Answer][]) => new Map(xs);
  expect(verdictOf(musts, a([[0, "yes"], [1, "yes"], [2, "n/a"]])).pass).toBe(true);
  expect(verdictOf(musts, a([[0, "yes"], [1, "yes"], [2, "no"]]))).toEqual({ pass: false, failed: [2] });
  expect(verdictOf(musts, a([[0, "no"], [1, "yes"], [2, "yes"]]))).toEqual({ pass: false, failed: [0] });
  expect(verdictOf(musts, a([[0, "yes"], [1, "yes"]]))).toEqual({ pass: false, failed: [2] });
});

test("every scenario's rubric has at least one must point", () => {
  for (const s of scenarios) expect(checklist(s.rubric).some((p) => p.must)).toBe(true);
});
