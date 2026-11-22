// D373: continuity first. A message names the task the talk was on just before it, and a follow-up
// sent to a finished task takes it up again under the follow-up's own line: the conversation shows
// the task under the new ask (not under the old answer), On hand keeps its one card, and its next
// result closes that line.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, TaskCard } from "../../protocol/src/index.ts";
import { createPartner } from "../src/partner.ts";
import { followsLine } from "../src/render.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-continue-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, fr, partner, user, clock };
}

/** A web errand the partner opened, done, with its answer said. */
function seedErrand(fc: ReturnType<typeof fakeCore>, clock: FakeClock, attention: TaskCard["attention"] = "done") {
  const at = new Date(clock.now()).toISOString();
  fc.cards.set("t_trip", { taskId: "t_trip", title: "查北京 agibar 附近的酒店", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", attention, residency: "parked", openedAt: at, updatedAt: at } as TaskCard);
  const u = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "帮我看看 AGI Bar 附近住哪" } });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "job_a", text: "我去查附近的酒店。", replyTo: u.seq } });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "job_a", text: "查北京 agibar 附近的酒店", state: "running", taskId: "t_trip" } });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "job_a", text: "查北京 agibar 附近的酒店", state: "done", taskId: "t_trip" } });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "住朗丽兹最省事。", replyTo: u.seq } });
}

const ok: Script = (_i, s) => {
  s.say("好。");
  s.end();
};

test("the next message names the task the talk was on, with what continuing means", async () => {
  const { fc, fr, partner, user, clock } = setup(ok);
  seedErrand(fc, clock);
  clock.advance(16 * 60_000);
  user("这个酒店和旁边的汉庭差多少钱？");
  await partner.idle();
  const input = fr.sessions[0]!.inputs.at(-1)!;
  expect(input).toContain('(just before this: task t_trip "查北京 agibar 附近的酒店", done 16 min ago, Codex, a browser.');
  expect(input).toContain("task_send, even done");
});

test("no line once the task is half a day old, dropped, or about another conversation's work", async () => {
  const { fc, fr, partner, user, clock } = setup(ok);
  seedErrand(fc, clock);
  clock.advance(13 * 3600_000);
  user("帮我订一下周二的牙医");
  await partner.idle();
  expect(fr.sessions[0]!.inputs.at(-1)!).not.toContain("just before this");
});

test("merged work says new work is a new task", () => {
  expect(followsLine({ taskId: "t1", title: "foo: values()", attention: "done", agoMin: 5, merged: true })).toBe('  (just before this: task t1 "foo: values()", done 5 min ago; its work was merged: new work is a new task)');
  expect(followsLine({ taskId: "t1", title: "x", attention: "working", agoMin: 0 })).toBe('  (just before this: task t1 "x", still working)');
});

test("a follow-up to a finished task: its line is the task's ack, the task moves under it, its result closes it", async () => {
  const { fc, fr, partner, user, clock } = setup(async (_i, s) => {
    s.say("我接着比一下两家的价格。");
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send" }, raw: { kind: "tool_call_started" } });
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", input: { taskId: "t_trip", text: "比一下朗丽兹和汉庭" } } });
    await fc.callTool("task_send", { taskId: "t_trip", text: "比一下朗丽兹和汉庭" });
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", output: "{}", ok: true } });
    s.say("已经交给它了。");
    s.end();
  });
  seedErrand(fc, clock);
  user("这个酒店和旁边的汉庭差多少钱？");
  await partner.idle();
  expect(fr.sent.map((x) => x.taskId)).toEqual(["t_trip"]);
  const acks = fc.events.filter((e) => e.kind === "ack");
  expect(acks.map((e) => (e.body as Bodies["ack"]).text)).toEqual(["我去查附近的酒店。", "我接着比一下两家的价格。"]);
  const jobId = (acks.at(-1)!.body as Bodies["ack"]).jobId;
  const status = fc.events.filter((e) => e.kind === "job_status").at(-1)!.body as Bodies["job_status"];
  expect(status).toEqual({ jobId, text: "查北京 agibar 附近的酒店", state: "running", taskId: "t_trip" });
  // Nothing else said: no filler, no message beside the ack.
  expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["住朗丽兹最省事。"]);
  // Its next result closes the new line, once.
  fc.cards.get("t_trip")!.attention = "done_claimed";
  partner.onTrigger(fc.core.log.append({ stream: "task:t_trip", origin: "task", kind: "report", body: { taskId: "t_trip", state: "done", summary: "朗丽兹贵 37 元。", questions: [], evidence: [] } }));
  await partner.idle();
  const closed = fc.events.filter((e) => e.kind === "job_status" && (e.body as Bodies["job_status"]).jobId === jobId).map((e) => (e.body as Bodies["job_status"]).state);
  expect(closed).toEqual(["running", "done"]);
});

test("no line before the call: the task still moves under the follow-up, as a line of its own", async () => {
  const { fc, partner, user, clock } = setup(async (_i, s) => {
    await fc.callTool("task_send", { taskId: "t_trip", text: "再看看机票" });
    s.end();
  });
  seedErrand(fc, clock, "failed");
  user("再看看机票");
  await partner.idle();
  const last = fc.events.filter((e) => e.kind === "job_status").at(-1)!.body as Bodies["job_status"];
  expect(last).toMatchObject({ state: "running", taskId: "t_trip" });
  expect(last.jobId).not.toBe("job_a");
});

test("the line written after the call is the ack; filler after it is dropped", async () => {
  const { fc, partner, user, clock } = setup(async (_i, s) => {
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send" }, raw: { kind: "tool_call_started" } });
    await fc.callTool("task_send", { taskId: "t_trip", text: "再看看机票" });
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", input: { taskId: "t_trip" }, output: "{}", ok: true } });
    s.say("我接着看机票。");
    s.say("交给它了。");
    s.end();
  });
  seedErrand(fc, clock);
  user("再看看机票");
  await partner.idle();
  const ack = fc.events.filter((e) => e.kind === "ack").at(-1)!.body as Bodies["ack"];
  expect(ack.text).toBe("我接着看机票。");
  expect(fc.events.filter((e) => e.kind === "job_status").at(-1)!.body).toMatchObject({ jobId: ack.jobId, state: "running", taskId: "t_trip" });
  expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["住朗丽兹最省事。"]);
});

test("a follow-up to a task still at work is a message, as before: no new line", async () => {
  const { fc, partner, user, clock } = setup(async (_i, s) => {
    s.say("我顺便看看机票。");
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", input: { taskId: "t_trip", text: "也看看机票" } } });
    await fc.callTool("task_send", { taskId: "t_trip", text: "也看看机票" });
    s.end();
  });
  seedErrand(fc, clock, "working");
  const before = fc.events.filter((e) => e.kind === "job_status").length;
  user("也看看机票");
  await partner.idle();
  expect(fc.events.filter((e) => e.kind === "job_status")).toHaveLength(before);
  expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text).at(-1)).toBe("我顺便看看机票。");
});

// The second look: the first task_open for a message that follows a task is asked back once.
test("a task_open for a follow-up is asked back once; carried on, the task goes under the line already said", async () => {
  let first: unknown;
  const { fc, fr, partner, user, clock } = setup(async (_i, s) => {
    s.say("我去携程比一下两家的价格。");
    first = await fc.callTool("task_open", { title: "携程比价", brief: "比一下朗丽兹和汉庭", place: { kind: "browser" } });
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_open", output: "{}", ok: false } });
    await fc.callTool("task_send", { taskId: "t_trip", text: "比一下朗丽兹和汉庭" });
    s.end();
  });
  seedErrand(fc, clock);
  user("这个酒店和旁边的汉庭差多少钱？");
  await partner.idle();
  expect(first).toMatchObject({ ok: false });
  expect(String((first as { error: string }).error)).toContain('follows task t_trip "查北京 agibar 附近的酒店"');
  expect(fr.opened).toHaveLength(0);
  expect(fr.sent.map((x) => x.taskId)).toEqual(["t_trip"]);
  const acks = fc.events.filter((e) => e.kind === "ack");
  expect(acks).toHaveLength(2); // the seeded one and this turn's line, said once
  const jobId = (acks.at(-1)!.body as Bodies["ack"]).jobId;
  expect(fc.events.filter((e) => e.kind === "job_status").at(-1)!.body).toEqual({ jobId, text: "查北京 agibar 附近的酒店", state: "running", taskId: "t_trip" });
});

test("separate work opens on the second call; a new one the user asked for opens at once", async () => {
  const { fc, fr, partner, user, clock } = setup(async (_i, s, n) => {
    s.say("我去查。");
    const title = n === 0 ? "牙医" : "机票";
    const r = (await fc.callTool("task_open", { title, brief: "b", place: { kind: "browser" } })) as { ok: boolean };
    if (!r.ok) await fc.callTool("task_open", { title, brief: "b", place: { kind: "browser" } });
    s.end();
  });
  seedErrand(fc, clock);
  user("另外帮我约下周二的牙医");
  await partner.idle();
  expect(fr.opened.map((o) => o.title)).toEqual(["牙医"]);
  expect(fc.events.filter((e) => e.kind === "ack").map((e) => (e.body as Bodies["ack"]).text)).toEqual(["我去查附近的酒店。", "我去查。"]);
  const tries = fr.opened.length;
  user("机票的事开个新的任务单独查吧");
  await partner.idle();
  expect(fr.opened.map((o) => o.title)).toEqual(["牙医", "机票"]);
  expect(tries).toBe(1);
});

test("a follow-up that never reached the task puts its line back", async () => {
  const { fc, fr, partner, user, clock } = setup(async (_i, s) => {
    s.say("我接着看机票。");
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", input: { taskId: "t_trip", text: "机票" } } });
    await fc.callTool("task_send", { taskId: "t_trip", text: "机票" });
    s.end();
  });
  seedErrand(fc, clock);
  fr.runner.send = async () => {
    throw new Error("MacBook is asleep");
  };
  user("再看看机票");
  await partner.idle();
  const states = fc.events.filter((e) => e.kind === "job_status").slice(-2).map((e) => (e.body as Bodies["job_status"]).state);
  expect(states).toEqual(["running", "done"]);
});

// D376, D478: the trip again: a follow-up asking for the user's own account is no longer read by
// code (the OWN_ACCOUNT words): the send goes as the partner made it; where the task browses and
// which computers browse in the user's own Chrome are facts in [live] and [devices] it judges from.
test("a follow-up for the user's own account is sent as the partner made it: no code reads the words", async () => {
  const { fc, fr, partner, user, clock } = setup(async (_i, s) => {
    const r = (await fc.callTool("task_send", { taskId: "t_trip", text: "用携程账号比价" })) as { ok: boolean };
    expect(r.ok).toBe(true);
    s.end();
  });
  seedErrand(fc, clock);
  user("这个酒店和汉庭差多少钱？用我的携程账号登录看");
  await partner.idle();
  expect(fr.sent.map((x) => x.taskId)).toEqual(["t_trip"]);
});
