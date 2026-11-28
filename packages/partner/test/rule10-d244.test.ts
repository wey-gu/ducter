// research/244 rule 10, the parts code guards by structure: D570's one-turn window is widened to
// the subject (E12: one sentence twice in 80 s), and a report older than the subject's last result
// is never said (E13). The claim/action half is true state for the model (persona rule 10), never
// a phrase filter.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, TaskCard } from "../../protocol/src/index.ts";
import { createPartner, SAME_LINE_MS } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-partner-rule10-")));
  // The person reads Chinese (the fake core has no settings file): a report's line isn't held for language.
  (fc.core as unknown as { settings: unknown }).settings = { get: () => ({ language: "zh" }), setForgetter: () => {} };
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const task = (id: string, title: string) => {
    fc.cards.set(id, { taskId: id, persona: "default", title, project: "", place: { kind: "none" }, harness: "codex", attention: "working", residency: "hot", openedAt: new Date(clock.now()).toISOString(), updatedAt: new Date(clock.now()).toISOString() } as TaskCard);
  };
  const report = (taskId: string, state: Bodies["report"]["state"], summary: string) =>
    fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, questions: [], evidence: [] } });
  return { clock, fc, fr, partner, task, report };
}
const said = (fc: ReturnType<typeof fakeCore>) =>
  fc.events.filter((e) => e.stream === "channel" && e.origin === "partner" && (e.kind === "ai_msg" || e.kind === "ack")).map((e) => `${e.kind}: ${(e.body as Bodies["ai_msg"]).text}`);

test("E12's shape: the same words about the same task are said once inside the window, and again after it", async () => {
  const line = "设置卡这两处都改好了，PR 已经提上去了。";
  const { clock, fc, partner, task, report } = setup(async (_i, s, n) => {
    s.say(line);
    s.end();
    expect(n).toBeLessThan(9);
  });
  task("t1", "设置卡的标签和焦点环");
  report("t1", "done", "标签和焦点环都好了。");
  partner.onTrigger(fc.core.log.read({ kinds: ["report"] }).at(-1)!);
  await partner.idle();
  report("t1", "done", "又看了一遍，都好了。");
  partner.onTrigger(fc.core.log.read({ kinds: ["report"] }).at(-1)!);
  await partner.idle();
  expect(said(fc)).toEqual([`ai_msg: ${line}`]);
  // The window is about a subject, not forever: the same words much later are news again.
  clock.advance(SAME_LINE_MS + 1_000);
  report("t1", "done", "第三遍确认，都好了。");
  partner.onTrigger(fc.core.log.read({ kinds: ["report"] }).at(-1)!);
  await partner.idle();
  expect(said(fc)).toEqual([`ai_msg: ${line}`, `ai_msg: ${line}`]);
});

test("E13's shape: a report older than the subject's last result is never said (only the newest report of a task)", async () => {
  const { fc, fr, partner, task, report } = setup(async (_i, s) => {
    s.say("设置卡改好了。");
    s.end();
  });
  task("t1", "设置卡");
  report("t1", "progress", "还在改设置卡，先别急。");
  report("t1", "done", "设置卡改好了。");
  for (const e of fc.core.log.read({ kinds: ["report"] })) partner.onTrigger(e);
  await partner.idle();
  const input = fr.sessions[0]!.inputs.join("\n");
  expect(input).toContain("设置卡改好了");
  expect(input).not.toContain("先别急");
  expect(said(fc)).toEqual(["ai_msg: 设置卡改好了。"]);
});

test("a progress after that task's result in the same turn never displaces the result", async () => {
  const { fc, fr, partner, task, report } = setup(async (_i, s) => {
    s.say("设置卡改好了。");
    s.end();
  });
  task("t1", "设置卡");
  report("t1", "done", "设置卡改好了。");
  report("t1", "progress", "又在动设置卡，这次是边角。");
  for (const e of fc.core.log.read({ kinds: ["report"] })) partner.onTrigger(e);
  await partner.idle();
  const input = fr.sessions[0]!.inputs.join("\n");
  expect(input).toContain("设置卡改好了");
  expect(input).not.toContain("边角");
});
