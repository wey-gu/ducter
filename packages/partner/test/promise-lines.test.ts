// D462: lines that only say what the partner is about to do. Codex writes one before nearly every
// tool call and sometimes ends its turn on one: a preamble waits across the call and the line
// after it says it instead; a line that promised work with no tool at all gets one correction round.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { isPromise } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const T = "mcp__ducter__task_open";
function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-partner-promise-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, fr, partner, user };
}
const said = (fc: ReturnType<typeof fakeCore>) =>
  fc.events.filter((e) => e.stream === "channel" && e.origin === "partner" && (e.kind === "ai_msg" || e.kind === "ack")).map((e) => `${e.kind}: ${(e.body as Bodies["ai_msg"]).text}`);

test("what reads as a promise", () => {
  for (const s of ["我去查一下张江附近的牙医，查清楚告诉你。", "好，我把这两件合成一组。", "好，把这两件并成一组，叫「登录页重做」。", "I'll set up a watcher for new invoices.", "On it: booking the ryokan.", "Let me check.", "Setting up a watcher on ~/Downloads/invoices now."]) expect(isPromise(s)).toBe(true);
  for (const s of ["TTL 测试修好了。", "要我现在重新做一份吗？", "好，去跑吧。", "It's 200 ms by default.", "Nothing new came in.", ""]) expect(isPromise(s)).toBe(false);
});

test("a promise with no tool at all: one correction round, and its call takes the held line as the ack", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s, n) => {
    if (n === 0) s.say("我去查你家附近下周二上午能约的洗牙，查清楚了告诉你。");
    if (n === 1) {
      s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
      await fc.callTool("task_open", { title: "约洗牙", place: { kind: "browser", profile: "default" }, needs: { browse: true }, brief: "User's words: 帮我查一下牙医" });
      s.emit({ role: "tool", tool: { name: T, output: "{}", ok: true } });
    }
    s.end();
  });
  user("帮我查一下我家附近下周二上午哪家牙医能约上洗牙");
  await partner.idle();
  expect(fr.sessions[0]!.inputs).toHaveLength(2);
  expect(fr.sessions[0]!.inputs[1]).toContain("but called no tool");
  expect(said(fc)).toEqual(["ack: 我去查你家附近下周二上午能约的洗牙，查清楚了告诉你。"]);
});

test("the correction's OK: the line needed no tool and goes out as it was", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s, n) => {
    s.say(n === 0 ? "I'll be here when you're back." : "OK");
    s.end();
  });
  user("back in an hour");
  await partner.idle();
  expect(fr.sessions[0]!.inputs).toHaveLength(2);
  expect(said(fc)).toEqual(["ai_msg: I'll be here when you're back."]);
});

test("a preamble before a call is settled by the line after it; a promise after a tool is never corrected", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s) => {
    s.say("我来把 #412 和 #340 归到「蒸馏兜底」里。");
    s.emit({ role: "tool", tool: { name: "mcp__ducter__log_search" }, raw: { kind: "tool_call_started", callId: "c1" } });
    s.emit({ role: "tool", tool: { name: "mcp__ducter__task_group", input: {}, output: "{}", ok: true } });
    s.say("好，#412 和 #340 已归到「蒸馏兜底」里了。");
    s.end();
  });
  user("把 #412 和 #340 归到「蒸馏兜底」这个分类里");
  await partner.idle();
  expect(said(fc)).toEqual(["ai_msg: 好，#412 和 #340 已归到「蒸馏兜底」里了。"]);
  expect(fr.sessions[0]!.inputs).toHaveLength(1);
});

test("a block written as a message of its own goes under the line before it", async () => {
  const { fc, partner, user } = setup(async (_i, s) => {
    s.say("I'll make you a list to tick off.");
    s.say('```ducter-ui\n{"type":"checklist","items":["Rerun the eval","Tag it"],"tell":true}\n```');
    s.end();
  });
  user("Make me a list I can tick off: rerun the eval, tag it");
  await partner.idle();
  const msgs = fc.events.filter((e) => e.kind === "ai_msg" && e.origin === "partner").map((e) => e.body as Bodies["ai_msg"]);
  expect(msgs).toHaveLength(1);
  expect(msgs[0]!.text.startsWith("I'll make you a list to tick off.")).toBe(true);
  expect(msgs[0]!.ui?.map((b) => b.type)).toEqual(["checklist"]);
});

test("the same task_open twice in one turn opens one task, with one ack", async () => {
  const results: any[] = [];
  const { fc, fr, partner, user } = setup(async (_i, s) => {
    s.say("I'll make the WAL flush interval configurable and update the README.");
    const input = { title: "Configure WAL flush interval", place: { kind: "repo", repoPath: "~/dev/hawdb" }, brief: "User's words: make it configurable" };
    for (const id of ["c1", "c2"]) s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: id } });
    for (const id of ["c1", "c2"]) s.emit({ role: "tool", tool: { name: T, input: { title: input.title } }, raw: { kind: "tool_call_title", callId: id } });
    results.push(...(await Promise.all([fc.callTool("task_open", input), fc.callTool("task_open", input)])));
    s.end();
  });
  user("In ~/dev/hawdb, make the WAL flush interval configurable and update the README.");
  await partner.idle();
  expect(fr.opened.length + fc.events.filter((e) => e.kind === "task_open").length).toBeGreaterThan(0);
  expect(new Set(results.map((r) => r.taskId)).size).toBe(1);
  expect(said(fc)).toEqual(["ack: I'll make the WAL flush interval configurable and update the README."]);
});

test("the same ack written twice before task_open goes out once", async () => {
  const { fc, partner, user } = setup(async (_i, s) => {
    s.say("我去查查京都这几晚的住处，找到合适的告诉你。");
    s.say("我去帮你找京都这几晚的住处，看到候选和价格后告诉你。");
    s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
    await fc.callTool("task_open", { title: "京都住宿", place: { kind: "browser", profile: "default" }, needs: { browse: true }, brief: "User's words: 京都住哪儿好" });
    s.emit({ role: "tool", tool: { name: T, output: "{}", ok: true } });
    s.end();
  });
  user("帮我看看京都 12 月 20 号到 23 号住哪儿好");
  await partner.idle();
  expect(said(fc)).toEqual(["ack: 我去帮你找京都这几晚的住处，看到候选和价格后告诉你。"]);
});
