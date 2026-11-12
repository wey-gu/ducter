// A demo core for 回复 / Reply to one message (D236): two finished tasks and a morning note, then
// two replies sent one after the other (the TTL result, then the domain find), each answered by
// its own message, the second answer carrying the imprint of the reply it answers.
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-reply.ts
// DEMO_STAGE: 0 = before any reply (to swipe on); 1 = the two replies and their answers.
import { startCore, stubRunner } from "@ducter/core";
import { logUserMessage } from "../../packages/core/src/reply.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "1");
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const w = zh
  ? {
      ask1: "修一下 ~/dev/foo 里 TTL 那个时好时坏的测试",
      ack1: "我去看看 foo 里那个时好时坏的 TTL 测试，弄清楚了告诉你。",
      title1: "foo：TTL 测试不稳定",
      done1: "TTL 测试修好了：它用真实计时去等 1 秒过期，机器一忙就抢跑，现在改成假时钟。",
      ask2: "再给 Cache 加一个 values()，只要没过期的",
      ack2: "我去给 foo 的 Cache 加 values()。",
      title2: "foo：给 Cache 加 values()",
      done2: "加好了：values() 只返回没过期的值，加了 2 个测试。",
      opening: "早。有两件事：",
      find1: "王磊周二问的 HawDB 报价，你还没回。",
      find2: "ducter.dev 11 月 20 日到期，Cloudflare 上自动续费的那张卡过期了。",
      go2: "去续费",
      reply1: "这个再补一条测试，覆盖正好到期那一刻",
      reply2: "帮我把这个弄好",
      ack3: "我接着给 TTL 补一条正好到期的测试。",
      ack4: "好，我去 Cloudflare 把 ducter.dev 的续费卡换上。",
    }
  : {
      ask1: "Fix the flaky TTL test in ~/dev/foo",
      ack1: "I'll look into foo's flaky TTL test and tell you when it's clear.",
      title1: "foo: flaky TTL test",
      done1: "The TTL test is fixed: it waited on real time for a 1 s expiry and ran early when the machine was busy. It uses a fake clock now.",
      ask2: "Also add values() to the Cache, live entries only",
      ack2: "I'll add values() to foo's Cache.",
      title2: "foo: Cache.values()",
      done2: "Done: values() returns only the live entries, with 2 new tests.",
      opening: "Morning. Two things:",
      find1: "Wang Lei asked for the HawDB quote on Tuesday; you haven't answered.",
      find2: "ducter.dev expires on Nov 20 and the card Cloudflare renews it with has expired.",
      go2: "Renew it",
      reply1: "add one more test for the exact moment it expires",
      reply2: "sort this out for me",
      ack3: "I'll add a test for the exact moment it expires.",
      ack4: "On it: putting a working card on ducter.dev's renewal at Cloudflare.",
    };

function task(n: number, ask: string, ack: string, title: string, done: string) {
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
  const taskId = `t_${n}`;
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: `j${n}`, text: ack, replyTo: u.seq } });
  log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "foo", place: { kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" }, harness: "claude-code", brief: ask } });
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `j${n}`, text: title, state: "running", taskId } });
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: done, questions: [], evidence: [{ kind: "test", label: "bun test 14/14", ref: "bun test" }] } });
  core.tasks.setState(taskId, "done", "warm");
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `j${n}`, text: title, state: "done", taskId } });
  return log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: done, replyTo: u.seq } });
}

const r1 = task(1, w.ask1, w.ack1, w.title1, w.done1);
await tick();
task(2, w.ask2, w.ack2, w.title2, w.done2);
await tick();
const note = log.append({
  stream: "channel",
  origin: "partner",
  kind: "finds",
  body: {
    noteId: "n1",
    rung: "morning",
    opening: w.opening,
    finds: [
      { findId: "f1", kind: "waiting_on_you", text: w.find1, how: [] },
      { findId: "f2", kind: "deadline", text: w.find2, how: [], decisionId: "d_f2", goLabel: w.go2 },
    ],
  },
});
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_f2", question: w.find2, goLabel: w.go2, defaultOption: "hold", reversible: false, findId: "f2" } });
await tick();
if (stage >= 1) {
  // Two replies, one after the other, each to its own thing; each answer replies to its own.
  const a = logUserMessage(log, core.decisions, { text: w.reply1, reply: { seq: r1.seq } });
  const b = logUserMessage(log, core.decisions, { text: w.reply2, reply: { seq: note.seq, findId: "f2" } });
  await tick();
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j3", text: w.ack3, replyTo: a.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.ack4, replyTo: b.seq } });
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
const pair = await core.devicesView.pairCode();
console.log(`[demo] phone: xcrun simctl launch booted co.nowledge.ducter.ios -pairLink 'http://127.0.0.1:${core.port}/pair#c=${pair.code}'`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
