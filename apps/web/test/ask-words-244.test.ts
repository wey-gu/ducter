// research/244 rules 5 and 7: a question stands alone (the card keeps its own question when the
// partner's words drop a point or the object), and an already-answered decision reads as what was
// done, never as a question.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { keepsPoints, pointCount } from "@ducter/protocol/src/ask-words.ts";
import { Store } from "../src/store.ts";

let n = 0;
const ev = (kind: string, body: unknown, origin = "partner"): LogEvent => ({ seq: ++n, ts: new Date(1_763_000_000_000 + n * 1000).toISOString(), persona: "default", stream: "channel", origin, kind, body }) as LogEvent;

test("the structure, never the meaning: numbered points and #refs", () => {
  expect(pointCount("做四件事：\n1. 去掉开关\n2. 加提示\n3. 改文案\n4. 补测试")).toBe(4);
  expect(pointCount("要不要 rebase？")).toBe(0);
  expect(keepsPoints("1. 去掉开关\n2. 改文案", "1. 去掉开关\n2. 改文案")).toBe(true);
  expect(keepsPoints("1. 去掉开关\n2. 改文案", "我建议去掉开关。")).toBe(false);
  expect(keepsPoints("PR #11230 里的开关去掉吗？", "这个开关去掉吗？")).toBe(false);
  expect(keepsPoints("PR #11230 里的开关去掉吗？", "PR #11230 里的开关去掉吗？")).toBe(true);
  // research/247 Brief A: the card's object in words (the task's or to-do's title) must survive too.
  expect(keepsPoints("「Fix the login redirect」这个任务停下吗？", "这个任务停下吗？", ["Fix the login redirect"])).toBe(false);
  expect(keepsPoints("「Fix the login redirect」这个任务停下吗？", "「Fix the login redirect」还在跑，等你决定。", ["Fix the login redirect"])).toBe(true);
});

test("E9's shape: a four-point task question said with one point keeps its own question; the restating words are not drawn", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
  const q = "PR #11230 的远程访问设置：\n1. 移除「本机访问也需要密钥」这个开关\n2. 加上同事说的提示\n3. 改一处文案\n4. 补一个测试";
  s.apply({
    t: "events",
    events: [
      ev("decision", { decisionId: "d1", question: q, goLabel: "继续", defaultOption: "go", reversible: true }),
      ev("ai_msg", { text: "按同事的建议，移除「本机访问也需要密钥」这个开关吗？", decisionId: "d1" }),
    ],
  });
  const d = s.decisions.get("d1")!;
  expect(d.said).toBeUndefined();
  expect("intro" in d).toBe(false); // no second bubble restating the card
  expect(d.question).toBe(q); // every point still on the card
});

test("words that keep every point are the question (D129 kept); a decision answered before it was drawn is a record", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
  s.apply({
    t: "events",
    events: [
      ev("decision", { decisionId: "d1", question: "1. 去掉开关\n2. 改文案", goLabel: "继续", defaultOption: "go", reversible: true }),
      ev("ai_msg", { text: "去掉开关、改文案，两处都做吗？\n1. 去掉开关\n2. 改文案", decisionId: "d1" }),
      ev("decision", { decisionId: "d2", question: "在这 3 个下面留言？", record: "在「设置卡的标签」（#11108）下留了言：「Fixed in #11163.」", goLabel: "留言", defaultOption: "hold", reversible: false }),
    ],
  });
  expect(s.decisions.get("d1")!.said).toContain("去掉开关");
  expect(s.decisions.get("d2")!.record).toContain("「设置卡的标签」（#11108）");
});

test("a one-point question whose object is dropped keeps its own question (research/247 Brief A)", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
  s.apply({
    t: "events",
    events: [
      ev("task_open", { taskId: "t1", title: "Fix the login redirect", project: "", place: { kind: "none" }, harness: "codex", brief: "x" }),
      ev("decision", { decisionId: "d1", taskId: "t1", question: "这个任务停下吗？", goLabel: "停下", defaultOption: "hold", reversible: true }),
      ev("ai_msg", { text: "它还在跑，等你决定。", decisionId: "d1" }),
    ],
  });
  expect(s.decisions.get("d1")!.said).toBeUndefined();
  s.apply({ t: "events", events: [ev("ai_msg", { text: "「Fix the login redirect」还在跑，等你决定。", decisionId: "d1" })] });
  expect(s.decisions.get("d1")!.said).toContain("Fix the login redirect");
});

test("the view draws a record as words, never as a question with buttons", () => {
  const src = readFileSync(join(import.meta.dir, "../src/views.tsx"), "utf8");
  expect(src).toContain("if (d.record && (d.resolved || d.pending))");
  expect(src).not.toContain("ask-intro"); // the card stands alone; no intro bubble
});
