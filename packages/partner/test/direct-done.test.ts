// D587: the partner's own wake rule says what core's does (principle 6): a done the task made in a
// turn the person opened in its box (report.direct) wakes nobody; the same done from the task's own
// turn, and a direct failure or question, still do.
import { expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { triggersPartner } from "../../core/src/core.ts";
import { isTrigger } from "../src/partner.ts";

const report = (r: Partial<Bodies["report"]>): LogEvent =>
  ({ seq: 1, ts: new Date().toISOString(), persona: "default", stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "Reviewed #551.", questions: [], evidence: [], ...r } }) as LogEvent;

test("a direct done wakes neither; the rest of the reports wake both, as before", () => {
  const cases: [Partial<Bodies["report"]>, boolean][] = [
    [{ state: "done", direct: true }, false],
    [{ state: "done", direct: true, questions: [{ id: "q", text: "Merge #1592 now?", blocking: true, reversible: false }] }, false],
    [{ state: "done" }, true],
    [{ state: "failed", direct: true }, true],
    [{ state: "needs_input", direct: true }, true],
    [{ state: "blocked", direct: true }, true],
    [{ state: "progress", direct: true }, false],
    [{ state: "progress" }, false],
  ];
  for (const [r, wakes] of cases) {
    expect([r, isTrigger(report(r))]).toEqual([r, wakes]);
    expect([r, triggersPartner(report(r))]).toEqual([r, wakes]);
  }
});
