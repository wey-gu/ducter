// D491: the lines Ducter writes for the partner say whose a thing is, and a line that is not a
// question never reads as one (a task's own wait that ended, the checkout, a blocked task).
import { expect, test } from "bun:test";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { renderHistoryLine, renderTrigger } from "../src/render.ts";

const ctx = { taskTitle: () => "Watch PR #10932", decision: () => undefined };
const ev = (kind: string, body: unknown, stream = "channel"): LogEvent => ({ seq: 1, ts: new Date(0).toISOString(), persona: "p1", stream, origin: "waiter", kind, body }) as LogEvent;

test("a task's own wait that couldn't tell reads, in the history, as the task's, with its last readable look", () => {
  const w = { waiterId: "w1", taskId: "t1", reason: "PR #10932 checks complete", kind: "check", check: { argv: ["gh"], succeedWhen: { path: "x", equals: "completed" } }, state: "cancelled", cantTell: "its answer isn't JSON", observed: "2 of 3 match" } as unknown as Bodies["waiter"];
  const line = renderHistoryLine(ev("waiter", w), ctx)!;
  expect(line).toContain("task t1's own wait ended");
  expect(line).toContain("2 of 3 match");
  expect(line).toContain("the task's job");
  expect(line).not.toContain("(cancelled)");
  // A wait of the partner's own, cancelled, is still the bare line.
  const own = renderHistoryLine(ev("waiter", { ...w, taskId: undefined, cantTell: undefined }), ctx)!;
  expect(own).toContain("(cancelled)");
});

test("at the checkout the partner is told the card asks, not to ask again", () => {
  const r = { taskId: "t1", state: "needs_input", summary: "At the checkout", evidence: [], questions: [{ id: "checkout", text: "Ready to pay CNY 73.00", blocking: true, reversible: false, checkout: { site: "kyfw.12306.cn", url: "https://kyfw.12306.cn/", what: "G7311", total: "73.00", currency: "CNY" } }] } as unknown as Bodies["report"];
  const line = renderTrigger(ev("report", r, "task:t1"), ctx);
  expect(line).toContain("This is the checkout");
  expect(line).not.toContain("Ask it in your own words");
  const plain = renderTrigger(ev("report", { ...r, questions: [{ id: "q1", text: "Regenerate the table?", blocking: true }] }, "task:t1"), ctx);
  expect(plain).toContain("Ask it in your own words");
});

test("a blocked report says what can be cleared without the user goes back to the task", () => {
  const r = { taskId: "t1", state: "blocked", summary: "The app must update first", evidence: [], questions: [] } as unknown as Bodies["report"];
  expect(renderTrigger(ev("report", r, "task:t1"), ctx)).toContain("asks the user nothing");
});
