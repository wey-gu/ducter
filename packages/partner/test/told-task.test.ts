// D340 (research/124 F1): the partner sees what the person said straight to a task, with that task's
// report, as the person's own ask; and a card whose Go deletes something never defaults to it.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { renderHistoryLine, renderTrigger } from "../src/render.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-told-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  return { fc, fr, partner };
}

const said = (fc: ReturnType<typeof fakeCore>, taskId: string, text: string, extra: Partial<Bodies["task_event"]> = {}) =>
  fc.core.log.append({ stream: `task:${taskId}`, origin: "user", kind: "task_event", body: { taskId, role: "user", from: "user", text, ...extra } });
const report = (fc: ReturnType<typeof fakeCore>, taskId: string, summary: string) =>
  fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary, questions: [], evidence: [] } });

test("a report carries the person's own words to the task since its last report, marked as theirs", async () => {
  let turn = 0;
  let fc!: ReturnType<typeof fakeCore>;
  const s = setup(async (_i, sess) => {
    turn++;
    if (turn === 1) await fc.callTool("task_open", { title: "fib 模块", brief: "b" });
    else sess.say("好了。");
    sess.end();
  });
  fc = s.fc;
  s.partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "写个 fib 模块" } }));
  await s.partner.idle();
  said(fc, "t1", "再加一个 README");
  fc.core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "user", from: "partner", text: "partner's own steer" } });
  fc.core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "Added README.md" } });
  s.partner.onTrigger(report(fc, "t1", "Added README.md"));
  await s.partner.idle();
  said(fc, "t1", "再写一个 NOTES.md，记下\n今天做了什么");
  s.partner.onTrigger(report(fc, "t1", "Wrote NOTES.md"));
  await s.partner.idle();
  const inputs = s.fr.sessions[0]!.inputs;
  expect(inputs[1]).toContain('the user told it directly: "再加一个 README"');
  expect(inputs[1]).not.toContain("partner's own steer");
  // Only what came since the previous report, the line breaks folded.
  expect(inputs[2]).toContain('the user told it directly: "再写一个 NOTES.md，记下 今天做了什么"');
  expect(inputs[2]).not.toContain("再加一个 README");
});

test("rendering: the latest few, clipped; the history line carries them too; none, nothing added", () => {
  const e = { seq: 9, ts: "2026-11-17T04:00:00.000Z", persona: "p", stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "ok", questions: [], evidence: [] } } as LogEvent;
  const told = ["a", "b", "c", "d", "e", "x".repeat(400)];
  const ctx = { taskTitle: () => undefined, decision: () => undefined, told: () => told };
  const t = renderTrigger(e, ctx);
  expect(t).toContain('the user told it directly (and 2 earlier): "c"; "d"; "e"; "xxx');
  expect(t).toContain("this is what they asked; never call it unrequested");
  expect(t).not.toContain('"a"');
  expect(renderHistoryLine(e, ctx)).toContain('(the user told it directly (and 2 earlier): "c"');
  const none = { taskTitle: () => undefined, decision: () => undefined, told: () => [] };
  expect(renderTrigger(e, none)).not.toContain("told it directly");
});

test("the partner's ask about deleting files is never reversible and waits on Hold", async () => {
  let fc!: ReturnType<typeof fakeCore>;
  const s = setup(async (_i, sess) => {
    await fc.callTool("ask", { question: "要把它自己加的 README.md 和 NOTES.md 删掉吗？", goLabel: "删掉", default: "go", reversible: true });
    sess.end();
  });
  fc = s.fc;
  s.partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "清理一下" } }));
  await s.partner.idle();
  const d = fc.events.find((e) => e.kind === "decision")!.body as Bodies["decision"];
  expect(d).toMatchObject({ reversible: false, defaultOption: "hold" });
  expect(d.defaultAt).toBeUndefined();
});
