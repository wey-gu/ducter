// D574: the eval counts what a rubric counts, and holds a run against a baseline by majority.
import { expect, test } from "bun:test";
import { lineCount, sentenceCount } from "../eval/counts.ts";
import { against, majority, toConfirm } from "../eval/stable.ts";

test("lines and sentences, counted the same way every time", () => {
  // Messages from past runs whose count the judge read differently from run to run.
  expect(sentenceCount("好，以后 review 评审直接发，不再问你。想收回说一声就行。")).toBe(2);
  expect(lineCount("好，以后 review 评审直接发，不再问你。想收回说一声就行。")).toBe(1);
  expect(sentenceCount("On it: changing HawDB's default checkpoint interval to 30s and updating the tests. I'll tell you when it's clear.")).toBe(2);
  expect(sentenceCount("Looking into why HawDB's CI is red again; usually about 10–15 minutes, and I'll tell you what I find.")).toBe(1);
  expect(sentenceCount("TCPは信頼性を保証する通信、UDPは速さを優先してそのまま送る通信です。\n\nTCPは届いたか確認して再送し、順番も揃えて届けます。UDPは確認も再送もせず、届かないことがあります。")).toBe(3);
  expect(lineCount("TCPは信頼性を保証する通信です。\n\nUDPは速さです。")).toBe(2);
  // A closing quote stays with its sentence; numbers, versions and paths don't end one.
  expect(sentenceCount("他说「好了。」我就去改。")).toBe(2);
  expect(sentenceCount("v0.1.70 is out on ~/dev/hawdb, 1.5x faster.")).toBe(1);
  expect(sentenceCount("Should I regenerate that table too? It takes about 6 minutes.")).toBe(2);
  // A list: every item its own line and sentence; markers and bold aren't words.
  const list = "三个待办：\n\n1. hawdb #1592：压缩测试\n2. ducter #6：task abstraction\n- **ducter #9**：错别字";
  expect(lineCount(list)).toBe(4);
  expect(sentenceCount(list)).toBe(4);
  expect(lineCount("")).toBe(0);
  expect(sentenceCount("  \n ")).toBe(0);
});

test("a verdict is the majority; only disagreements run again; a change is real when every attempt agrees", () => {
  expect(majority([true])).toBe(true);
  expect(majority([true, false])).toBe(false);
  expect(majority([false, true, true])).toBe(true);
  const base = new Map([["a", true], ["b", false], ["c", true], ["d", true], ["e", false]]);
  expect(toConfirm(new Map([["a", true], ["b", true], ["c", false], ["n", false], ["m", true]]), base)).toEqual(["b", "c", "n"]);
  const ag = against(
    base,
    new Map([
      ["a", [true]], // agrees
      ["b", [true, true, true]], // fixed
      ["c", [false, false, false]], // regressed
      ["d", [false, true, false]], // both ways
      ["e", [true]], // disagrees once, never run again
      ["n", [false, false, false]], // new, failing
    ]),
  );
  expect(ag).toEqual({ regressions: ["c"], fixes: ["b"], flaky: ["d"], newFails: ["n"], unconfirmed: ["e"] });
});
