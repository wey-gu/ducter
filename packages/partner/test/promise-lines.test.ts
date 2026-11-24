// D462, D490: lines around the partner's calls, and the promises it makes. A line written before a call
// that does something is a preamble (Codex writes one before nearly every call): it waits across the
// call and the line after it says it instead, by where it stands, never by its words. A line that
// promises to come back carries the partner's own [[later]] mark: with nothing that brings it back
// (no task, send, wait or card) it gets one correction round; kept by a task, it is recorded, and the
// turn that task ends in sees it until something is said. No code reads the words for a promise.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { takeLaterMark } from "../src/partner.ts";
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

test("the mark is the partner's, taken out wherever it is; nothing else reads as one", () => {
  expect(takeLaterMark("我去查，查清楚告诉你。 [[later]]")).toEqual({ text: "我去查，查清楚告诉你。", later: true });
  expect(takeLaterMark("I'll check [[ Later ]] and tell you.")).toEqual({ text: "I'll check and tell you.", later: true });
  for (const s of ["我去查一下张江附近的牙医，查清楚告诉你。", "I'll tell you later.", "[[m1]]"]) expect(takeLaterMark(s).later).toBe(false);
});

test("a [[later]] with no tool at all: one correction round, and its call takes the held line as the ack", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s, n) => {
    if (n === 0) s.say("我去查你家附近下周二上午能约的洗牙，查清楚了告诉你。[[later]]");
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
  expect(fr.sessions[0]!.inputs[1]).toContain("nothing this turn will bring you back to it");
  expect(said(fc)).toEqual(["ack: 我去查你家附近下周二上午能约的洗牙，查清楚了告诉你。"]);
});

test("the correction's OK: the line needed no tool and goes out as it was", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s, n) => {
    s.say(n === 0 ? "I'll be here when you're back. [[later]]" : "OK");
    s.end();
  });
  user("back in an hour");
  await partner.idle();
  expect(fr.sessions[0]!.inputs).toHaveLength(2);
  expect(said(fc)).toEqual(["ai_msg: I'll be here when you're back."]);
});

test("the same words with no mark: said as they are, no correction (the words are never read for a promise)", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s) => {
    s.say("我去查你家附近下周二上午能约的洗牙，查清楚了告诉你。");
    s.end();
  });
  user("帮我查一下我家附近下周二上午哪家牙医能约上洗牙");
  await partner.idle();
  expect(fr.sessions[0]!.inputs).toHaveLength(1);
  expect(said(fc)).toEqual(["ai_msg: 我去查你家附近下周二上午能约的洗牙，查清楚了告诉你。"]);
});

test("a [[later]] kept by a wait: no correction; a refused call keeps nothing", async () => {
  const kept = setup(async (_i, s) => {
    s.say("好，三点提醒你回 Alice 的邮件。[[later]]");
    s.emit({ role: "tool", tool: { name: "mcp__ducter__wait_until", input: { at: "2026-11-23T15:00:00+08:00" }, output: '{"ok":true,"waitId":"w1"}', ok: true } });
    s.end();
  });
  kept.user("三点提醒我回 Alice 的邮件");
  await kept.partner.idle();
  expect(kept.fr.sessions[0]!.inputs).toHaveLength(1);
  expect(said(kept.fc)).toEqual(["ai_msg: 好，三点提醒你回 Alice 的邮件。"]);

  const refused = setup(async (_i, s, n) => {
    if (n === 0) {
      s.say("好，三点提醒你回 Alice 的邮件。[[later]]");
      s.emit({ role: "tool", tool: { name: "mcp__ducter__wait_until", input: {}, output: '{"ok":false,"error":"wait_until needs at"}', ok: true } });
    } else s.say("OK");
    s.end();
  });
  refused.user("三点提醒我回 Alice 的邮件");
  await refused.partner.idle();
  expect(refused.fr.sessions[0]!.inputs).toHaveLength(2);
});

test("a [[later]] kept by a task: the turn its task ends in sees it; once said, it is let go", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s, n) => {
    if (n === 0) {
      s.say("我去查京都这几晚的住处，看到候选和价格后告诉你。[[later]]");
      s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
      await fc.callTool("task_open", { title: "京都住宿", place: { kind: "browser", profile: "default" }, needs: { browse: true }, brief: "User's words: 京都住哪儿好" });
      s.emit({ role: "tool", tool: { name: T, output: "{}", ok: true } });
    }
    if (n === 1) s.say("找到了：俵屋，三晚含早 ¥18 万。");
    if (n === 2) s.say("好。");
    s.end();
  });
  user("帮我看看京都 12 月 20 号到 23 号住哪儿好");
  await partner.idle();
  const taskId = fc.events.find((e) => e.kind === "job_status" && (e.body as Bodies["job_status"]).taskId)!.body as Bodies["job_status"];
  fc.cards.get(taskId.taskId!)!.attention = "done";
  partner.onTrigger(fc.core.log.append({ stream: `task:${taskId.taskId}`, origin: "task", kind: "report", body: { taskId: taskId.taskId!, state: "done", summary: "Tawaraya, 3 nights with breakfast, ¥180,000.", questions: [], evidence: [] } }));
  await partner.idle();
  user("谢谢");
  await partner.idle();
  const inputs = fr.sessions[0]!.inputs;
  expect(inputs).toHaveLength(3);
  expect(inputs[0]).not.toContain("what you told them you'd come back");
  expect(inputs[1]).toContain("what you told them you'd come back to them with");
  expect(inputs[1]).toContain("我去查京都这几晚的住处，看到候选和价格后告诉你。");
  expect(inputs[1]).toContain("「京都住宿」 done");
  expect(inputs[2]).not.toContain("what you told them you'd come back");
  expect(said(fc).join("\n")).not.toContain("[[later]]");
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

// D511 (many-asks-places-en on Codex: "On it: Diagnose HawDB main CI failure" after the ack): three
// different task_open calls at once in one turn. The line before them is the one ack; the other two
// open their tasks and say nothing of their own, also with no line first (the first gets one from
// its title) and with no stream events at all (the MCP calls alone).
for (const shape of ["a line first", "no line", "no stream events"] as const)
  test(`three parallel task_opens in one turn: one ack, three tasks (${shape})`, async () => {
    const results: any[] = [];
    const inputs = [
      { title: "Diagnose HawDB main CI failure", place: { kind: "repo", repoPath: "~/dev/hawdb" }, brief: "User's words: why is main red" },
      { title: "Check the Linux runner test", place: { kind: "repo", repoPath: "~/dev/foo" }, brief: "User's words: the runner test" },
      { title: "Find a dentist near home", place: { kind: "browser", profile: "default" }, needs: { browse: true }, brief: "User's words: a dentist" },
    ];
    const { fc, partner, user } = setup(async (_i, s) => {
      if (shape === "a line first") s.say("On it: three things at once, I'll tell you as each is clear.");
      if (shape !== "no stream events") {
        inputs.forEach((_, i) => s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: `c${i}` } }));
        inputs.forEach((x, i) => s.emit({ role: "tool", tool: { name: T, input: { title: x.title } }, raw: { kind: "tool_call_title", callId: `c${i}` } }));
      }
      results.push(...(await Promise.all(inputs.map((x) => fc.callTool("task_open", x)))));
      s.end();
    });
    user("Three things: why is HawDB's main CI red, check the Linux runner test in ~/dev/foo, and find me a dentist near home.");
    await partner.idle();
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => r.taskId)).size).toBe(3);
    const acks = said(fc).filter((l) => l.startsWith("ack: "));
    expect(acks).toHaveLength(1);
    if (shape === "a line first") expect(acks[0]).toBe("ack: On it: three things at once, I'll tell you as each is clear.");
    expect(said(fc).filter((l) => l.startsWith("ai_msg: "))).toEqual([]);
    // Each task still has its own job line.
    const jobs = fc.events.filter((e) => e.kind === "job_status").map((e) => (e.body as { jobId: string }).jobId);
    expect(new Set(jobs).size).toBe(3);
  });

