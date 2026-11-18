// A demo core for D376, the two follow-ups D373 left (synthetic, obviously fake content):
//   DEMO_STAGE=move: the trip's hotel was found in Ducter's own browser on the home; the follow-up
//     wants the person's Ctrip account, signed in only in the MacBook's Chrome: the same task moves
//     there and carries on, under the follow-up's own line, its transcript saying where it moved.
//   DEMO_STAGE=own: "接着我终端里那个 Claude 在做的": Ducter says once what it read, then carries the
//     person's own Claude Code conversation on as a task (its earlier turns above, then Ducter's).
//   DUCTER_PORT=7931 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_STAGE=move bun apps/web/demo-continue-more.ts
import { ADOPTED } from "../../packages/runner/src/brief.ts";
import { DEMO_HOME, startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE === "own" ? "own" : "move";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const z = (a: string, b: string) => (zh ? a : b);
const MAC = "MacBook Pro";

if (stage === "move") {
  const taskId = "t_trip";
  const title = z("北京 AGI Bar 周六行程", "Saturday trip to AGI Bar, Beijing");
  const ask1 = z("我周六要去北京参加 AGI Bar 晚上的活动，住一晚第二天回来，帮我看看住哪儿合适", "I'm going to an evening event at AGI Bar in Beijing on Saturday, staying one night. Where should I stay?");
  log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: ask1 } });
  const u1 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask1 } });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: z("我去查 AGI Bar 附近适合住的酒店，查清楚告诉你。", "I'll look for a good hotel near AGI Bar and tell you when it's clear."), replyTo: u1.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: title, state: "running", taskId } });
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: z("首选朗丽兹（中关村苏州街店），散场走 3–5 分钟，前台 24 小时。汉庭也在 10 分钟内。房价要登录携程才看得到。", "Best: Langlizi (Suzhou Street), a 3–5 minute walk, 24-hour desk. Hanting is within 10 minutes too. Prices need a Ctrip sign-in."), questions: [], evidence: [] } });
  core.tasks.setState(taskId, "done", "warm");
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: title, state: "done", taskId } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: z("住朗丽兹最省事：散场走 3–5 分钟就到，前台 24 小时。", "Langlizi is easiest: a 3–5 minute walk after the event, with a 24-hour desk."), replyTo: u1.seq } });
  await tick();
  // The follow-up wants the person's own Ctrip account: the same task moves to the MacBook's Chrome.
  const u2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: z("这个酒店和旁边的汉庭差多少钱？然后也帮我看看机票吧，用我的携程账号看", "How much more is it than the Hanting next door? And look at flights too, with my Ctrip account") } });
  log.append({ stream: `task:${taskId}`, origin: "user", kind: "task_open", body: { taskId, title, project: "", place: { kind: "browser", device: MAC, profile: "default" }, harness: "codex", brief: ask1 } });
  log.append({ stream: `task:${taskId}`, origin: "user", kind: "body_selected", body: { taskId, harness: "codex", why: { kind: "you", where: { device: MAC, kind: "you" } } } });
  log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_event", body: { taskId, role: "system", from: "runner", text: `moved from ${DEMO_HOME} to ${MAC}`, raw: { switched: { from: "codex", to: "codex" }, moved: { from: DEMO_HOME, to: MAC } } } });
  log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_event", body: { taskId, role: "user", from: "partner", text: z("用户的携程账号在 MacBook 的 Chrome 里登着：比一下朗丽兹和汉庭周六一晚的价格，再看周六去、周日回的机票。要验证码就问用户。", "The user's Ctrip account is signed in in the MacBook's Chrome: compare Langlizi and Hanting for Saturday night, then flights out Saturday and back Sunday. Ask the user for any code.") } });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j2", text: z("我到你 MacBook 的 Chrome 上用携程比一下两家的价格，顺便看机票。", "I'll compare the two prices on Ctrip in your MacBook's Chrome, and look at flights too."), replyTo: u2.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j2", text: title, state: "running", taskId } });
  core.tasks.setState(taskId, "working", "hot");
} else {
  const taskId = "t_own";
  const title = z("Raft 快照的竞争", "Raft snapshot race");
  const at = new Date(Date.now() - 50 * 60_000).toISOString();
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: z("接着我终端里那个 Claude 在做的，把剩下的测试补上", "Carry on what Claude was doing in my terminal, and add the missing tests") } });
  // Said by the code, the first time only (D327's scope, D376).
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: z(`我看了 ${DEMO_HOME} 上你在 Claude Code 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。`, `I looked at your Claude Code conversations on ${DEMO_HOME}: only their names, folders, times and your first words, no code or files.`), replyTo: u.seq } });
  log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "hawdb", place: { kind: "folder", device: "local", path: "/Users/demo/src/hawdb" }, harness: "claude-code", brief: z("TestRaftSnapshot 为什么偶尔失败？", "Why is TestRaftSnapshot flaky?"), origin: "you", outside: { agent: "claude-code", sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f", startedAt: at } } });
  const ev = (body: Record<string, unknown>) => log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_event", body: { taskId, ...body } as never });
  ev({ role: "system", from: "runner", raw: { folder: { direct: true } } });
  ev({ role: "system", from: "runner", text: "carried on from a Claude Code session started outside Ducter", raw: { outside: { agent: "claude-code", at, turns: 4 }, sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f", harness: "claude-code" } });
  ev({ role: "user", from: "user", text: z("TestRaftSnapshot 为什么偶尔失败？", "Why is TestRaftSnapshot flaky?"), raw: { outside: true, at } });
  ev({ role: "assistant", text: z("快照计时器和 leader 退位在抢跑：退位后计时器还会触发一次。", "The snapshot timer races the leader step-down: it can fire once after stepping down."), raw: { outside: true, at } });
  ev({ role: "user", from: "user", text: z("加一道 fence，再补个测试", "Add a fence and a test for it"), raw: { outside: true, at } });
  ev({ role: "assistant", text: z("fence 加在 snapshot.rs 了。测试还没补。", "Added the fence in snapshot.rs. The test isn't written yet."), raw: { outside: true, at } });
  ev({ role: "user", from: "ducter", text: `${ADOPTED} It began in Claude Code on ${at.slice(0, 10)}, in /Users/demo/src/hawdb; this is that same session, resumed, so its earlier turns are yours.` });
  ev({ role: "user", from: "partner", text: z("把剩下的测试补上", "Add the missing tests") });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j_own", text: z("我接着做你在 Claude Code 里的 Raft 快照修复，把测试补上。", "I'll carry on your Claude Code fix for the Raft snapshot race and add the tests."), replyTo: u.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j_own", text: title, state: "running", taskId } });
  core.tasks.setState(taskId, "working", "hot");
}
console.log(`demo-continue-more ready on :${process.env.DUCTER_PORT ?? "?"} (${stage}, ${zh ? "zh" : "en"})`);
