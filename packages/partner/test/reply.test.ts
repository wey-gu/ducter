// D236: 回复 / Reply to one message, through the real core: the quote is read from the Log and
// travels inside the reply; the partner sees which message and which task it is about; two
// replies are two turns with no cross-talk; a reply to an open question answers it; and the quote
// still reads right when its message has left the window.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { startCore, type Core } from "../../core/src/core.ts";
import { logUserMessage, plainWords, resolveReply, clipQuote } from "../../core/src/reply.ts";
import { createPartner, turnLength, type PartnerHandle } from "../src/partner.ts";
import { renderHistoryLine } from "../src/render.ts";
import { fakeRunner, type FakeSession } from "./fakes.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "ducter-reply-"));
  const core: Core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin" });
  stops.push(() => rmSync(dir, { recursive: true, force: true }), () => core.stop());
  core.setPartner({ onTrigger() {} }); // the seeded history is background, not new work
  return { core };
}

/** A task the partner opened for a user message, finished, and the partner's words about it. */
function seedTask(core: Core, ask: string, taskId: string, title: string, said: string) {
  const u = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
  const jobId = `job_${taskId}`;
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "foo", place: { kind: "none" }, harness: "claude-code", brief: ask } });
  core.log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId, text: "好，我去弄。", replyTo: u.seq } });
  core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: title, state: "running", taskId } });
  core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: said, questions: [], evidence: [] } });
  core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: title, state: "done", taskId } });
  return core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: said, replyTo: u.seq } });
}

function partnerOn(core: Core, say = "好。") {
  const fr = fakeRunner(async (_input, s) => {
    s.say(say);
    s.end();
  });
  const partner: PartnerHandle = createPartner(core as never, fr.runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
  core.setPartner(partner);
  stops.push(() => partner.close());
  const inputs = () => fr.sessions.flatMap((s: FakeSession) => s.inputs);
  return { partner, fr, inputs };
}

test("a reply carries its quote and its task from the Log, and the partner reads which task it is about", async () => {
  const { core } = rig();
  const ttl = seedTask(core, "修一下 foo 里 TTL 那个测试", "t_ttl", "foo: TTL 测试", "TTL 测试修好了：它用真实计时去等 1 秒过期，现在改成假时钟。");
  seedTask(core, "给 lru 加个 values()", "t_val", "foo: lru values()", "values() 加好了，测试也补上了。");
  const { partner, inputs } = partnerOn(core);
  const u = logUserMessage(core.log, core.decisions, { text: "这个再补个测试", reply: { seq: ttl.seq } });
  const ref = (u.body as Bodies["user_msg"]).reply!;
  expect(ref).toMatchObject({ seq: ttl.seq, from: "partner", kind: "message", taskIds: ["t_ttl"] });
  expect(ref.quote).toBe("TTL 测试修好了：它用真实计时去等 1 秒过期，现在改成假时钟。");
  await partner.idle();
  const last = inputs().at(-1)!;
  expect(last).toContain(`[user, replying to your message of`);
  expect(last).toContain(`(#${ttl.seq}): "TTL 测试修好了`);
  expect(last).toContain('task t_ttl "foo: TTL 测试"');
  expect(last).toContain("task_send it there");
  expect(last.split("[user, replying")[1]).not.toContain("t_val"); // only the one it replies to
  // The answer replies to the reply.
  const ai = core.log.read({ stream: "channel", kinds: ["ai_msg"] }).at(-1)!;
  expect((ai.body as Bodies["ai_msg"]).replyTo).toBe(u.seq);
});

test("two replies to two tasks are two turns, each with its own message and no cross-talk", async () => {
  const { core } = rig();
  const a = seedTask(core, "foo 的 values()", "t_a", "foo: values()", "values() 加好了。");
  const b = seedTask(core, "hawdb 的 checkpoint", "t_b", "hawdb: checkpoint", "checkpoint 的间隔调好了。");
  const { partner, fr } = partnerOn(core);
  const ua = logUserMessage(core.log, core.decisions, { text: "keys() 也加上", reply: { seq: a.seq } });
  const ub = logUserMessage(core.log, core.decisions, { text: "做成能配置的", reply: { seq: b.seq } });
  await partner.idle();
  const turns = fr.sessions.flatMap((s) => s.inputs);
  expect(turns).toHaveLength(2);
  const delta = (s: string) => s.slice(s.lastIndexOf("[user"));
  expect(delta(turns[0]!)).toContain("keys() 也加上");
  expect(delta(turns[0]!)).toContain("t_a");
  expect(delta(turns[0]!)).not.toContain("t_b");
  expect(turns[0]!).not.toContain("做成能配置的"); // the second reply waits for its own turn, not even as history
  expect(delta(turns[1]!)).toContain("做成能配置的");
  expect(delta(turns[1]!)).toContain("t_b");
  expect(delta(turns[1]!)).not.toContain("t_a");
  const replies = core.log.read({ stream: "channel", kinds: ["ai_msg"] }).slice(-2).map((e) => (e.body as Bodies["ai_msg"]).replyTo);
  expect(replies).toEqual([ua.seq, ub.seq]);
});

test("a reply to one find of a note carries that find", async () => {
  const { core } = rig();
  const note = core.log.append({
    stream: "channel",
    origin: "partner",
    kind: "finds",
    body: {
      noteId: "n1",
      rung: "morning",
      opening: "早。两件事：",
      finds: [
        { findId: "f1", kind: "reply", text: "王磊周二问的报价还没回。", how: [] },
        { findId: "f2", kind: "bill", text: "ducter.dev 11 月 20 日到期，自动续费的卡过期了。", how: [], decisionId: "d_f2", goLabel: "去续费" },
      ],
    } as unknown as Bodies["finds"],
  });
  const { partner, inputs } = partnerOn(core);
  const u = logUserMessage(core.log, core.decisions, { text: "帮我续上", reply: { seq: note.seq, findId: "f2" } });
  expect((u.body as Bodies["user_msg"]).reply).toMatchObject({ kind: "find", findId: "f2", decisionId: "d_f2", quote: "ducter.dev 11 月 20 日到期，自动续费的卡过期了。" });
  await partner.idle();
  expect(inputs().at(-1)).toContain("replying to something you noticed");
  expect(inputs().at(-1)).toContain("a find from their accounts with a next step offered");
});

test("a reply to an open task question answers it: core forwards the words, the partner is told not to", async () => {
  const { core } = rig();
  core.log.append({ stream: "task:t_q", origin: "partner", kind: "task_open", body: { taskId: "t_q", title: "foo: TTL", project: "foo", place: { kind: "none" }, harness: "claude-code", brief: "x" } });
  core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d1", taskId: "t_q", question: "Also fix the lru test?", goLabel: "Fix both", defaultOption: "go", reversible: true } });
  const said = core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "TTL 修好了。lru 的测试也一起改掉吗？", decisionId: "d1" } });
  const forwarded: string[] = [];
  core.decisions.setHook((_id, text) => void forwarded.push(text));
  const { partner, inputs } = partnerOn(core);
  const u = logUserMessage(core.log, core.decisions, { text: "lru 的先别动", reply: { seq: said.seq } });
  const r = core.log.read({ stream: "channel", kinds: ["decision_resolved"] }).at(-1)!.body as Bodies["decision_resolved"];
  expect(r).toMatchObject({ decisionId: "d1", option: "reply", text: "lru 的先别动", by: "user", msgSeq: u.seq });
  expect(core.decisions.isPending("d1")).toBe(false);
  await partner.idle();
  expect(inputs().at(-1)).toContain("[decision resolved: reply] (task t_q: \"Also fix the lru test?\") lru 的先别动");
  expect(inputs().at(-1)).toContain("already forwarded to the task");
});

test("a reply still reads right after its message left the window: the quote travels with it", async () => {
  const { core } = rig();
  const old = core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "hawdb's default WAL flush interval is 200 ms; the checkpoint runs every 5 min." } });
  for (let i = 0; i < 60; i++) {
    const u = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: `note ${i}` } });
    core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: `ok ${i}`, replyTo: u.seq } });
  }
  const { partner, inputs } = partnerOn(core);
  logUserMessage(core.log, core.decisions, { text: "make that 50 for my test cluster", reply: { seq: old.seq } });
  await partner.idle();
  const input = inputs().at(-1)!;
  // The cold seed's window is the last 40 lines: the message itself isn't in it, its quote is.
  expect(input.split("hawdb's default WAL flush").length).toBe(2);
  expect(input).toContain(`(#${old.seq}): "hawdb's default WAL flush interval is 200 ms`);
  // And in history (the spine's lines, a later cold seed) the reply keeps a short quote.
  const line = renderHistoryLine(core.log.read({ stream: "channel", kinds: ["user_msg"] }).at(-1)!, { taskTitle: () => undefined, decision: () => undefined });
  expect(line).toContain('replying to your message of');
  expect(line).toContain("WAL flush interval");
});

test("a reply to a message with pictures shows the pictures to the partner again", async () => {
  const { core } = rig();
  const pic = { id: "3f2a91c04b7e" + "0".repeat(52), type: "image/png", size: 10, w: 10, h: 10, k: "k" };
  const shot = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "看这个报错", media: [pic as never] } });
  const u = logUserMessage(core.log, core.decisions, { text: "这个是不是上次那个问题", reply: { seq: shot.seq } });
  const ref = (u.body as Bodies["user_msg"]).reply!;
  expect(ref).toMatchObject({ from: "you", quote: "看这个报错" });
  expect(ref.media).toHaveLength(1);
});

test("a part the user picked is quoted only when the message has those words; nonsense names nothing", () => {
  const { core } = rig();
  const m = core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "两件事：**CI 挂了**，在修；另外 `values()` 已经合进去了。" } });
  expect(resolveReply(core.log, core.decisions, { seq: m.seq, part: "CI 挂了，在修" })).toMatchObject({ quote: "CI 挂了，在修", part: true, clipped: true });
  expect(resolveReply(core.log, core.decisions, { seq: m.seq, part: "made up words" })).toMatchObject({ quote: "两件事：CI 挂了，在修；另外 values() 已经合进去了。" });
  expect(() => resolveReply(core.log, core.decisions, { seq: 99_999 })).toThrow();
  const inTask = core.log.append({ stream: "task:t9", origin: "task", kind: "task_event", body: { taskId: "t9", role: "assistant", text: "x" } });
  expect(() => resolveReply(core.log, core.decisions, { seq: inTask.seq })).toThrow();
  // Logged as a plain message when the reply names nothing: the words are never lost.
  const u = logUserMessage(core.log, core.decisions, { text: "hm", reply: { seq: inTask.seq } });
  expect((u.body as Bodies["user_msg"]).reply).toBeUndefined();
});

test("quotes are bounded and plain", () => {
  expect(plainWords("## Done\n- **merged** [the PR](https://x/1) and `ran tests`")).toBe("Done merged the PR and ran tests");
  const long = "word ".repeat(80);
  const q = clipQuote(long);
  expect(q.clipped).toBe(true);
  expect(q.text.length).toBeLessThanOrEqual(200);
  expect(q.text.endsWith("…")).toBe(true);
  expect(clipQuote("短的").clipped).toBe(false);
});

test("turnLength: plain messages batch; a reply to another message starts its own turn", () => {
  let n = 0;
  const ev = (body: Partial<Bodies["user_msg"]>, kind: LogEvent["kind"] = "user_msg"): LogEvent => ({ seq: ++n, stream: "channel", origin: "user", kind, ts: "", body: { text: "x", ...body } }) as LogEvent;
  const r = (seq: number, findId?: string) => ({ reply: { seq, from: "partner" as const, kind: "message" as const, quote: "q", ts: "", ...(findId ? { findId } : {}) } });
  expect(turnLength([ev({}), ev({})])).toBe(2);
  expect(turnLength([ev(r(5)), ev(r(5))])).toBe(2);
  expect(turnLength([ev(r(5)), ev(r(6))])).toBe(1);
  expect(turnLength([ev({}), ev(r(6))])).toBe(1);
  expect(turnLength([ev(r(6)), ev({})])).toBe(1);
  expect(turnLength([ev(r(5, "f1")), ev(r(5, "f2"))])).toBe(1);
  // A reply and the question it answered (decision_resolved) go together.
  expect(turnLength([ev(r(5)), ev({}, "decision_resolved")])).toBe(2);
});
