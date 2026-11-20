// A demo core for D426: the author's 11-12 message done the new way. One look-up and three calendar
// entries, one browser task; its report says each thing's state, which core turns into the lines
// under the message (the real asks module); the partner's one message back is seeded.
//   DUCTER_PORT=7996 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-many-asks.ts
// DEMO_STATE: working  the look-up done, the three entries at work
//             answered three done, the Thursday one waits for a time (default)
import { startCore, stubRunner } from "./demo-core.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const state = process.env.DEMO_STATE ?? "answered";
const dataDir = process.env.DUCTER_DATA_DIR!;
const persona = { id: "default", name: "Ducter", identity: "" };
const ooSource = { detect: () => ({ installed: false, account: false }), read: () => undefined };
const w = (z: string, e: string) => (zh ? z : e);

const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
const log = seed.log;
const tick = () => Bun.sleep(15);

const msg = log.append({
  stream: "channel",
  origin: "user",
  kind: "user_msg",
  body: {
    text: w(
      "我下周有什么预约么 帮我在 gmail 日历记录我 20 号要去北京 agibar 参加一个分享，这个周日要去杭州 coscon 参加 bof，下周四要参加 Tabs 上海和组织者见面",
      "What's on my calendar next week? Also put these in my Gmail calendar: the agibar talk in Beijing on the 20th, the COSCon BoF in Hangzhou this Sunday, and meeting the Tabs Shanghai organisers next Thursday",
    ),
  },
});
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "job_cal", text: w("好，我去看下周的安排，再把这三项记进日历，弄好了告诉你。", "On it: checking next week and putting the three in your calendar; I'll tell you when it's done."), replyTo: msg.seq } });
const id = "t_cal";
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: w("下周预约和三项日历", "Next week and three calendar entries"), project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "" } });
seed.tasks.setState(id, "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "job_cal", text: w("下周预约和三项日历", "Next week and three calendar entries"), state: "running", taskId: id } });
seed.asks.add(msg.seq, id, [
  w("我下周有什么预约", "What's on next week"),
  w("20 号北京 agibar 分享", "agibar talk in Beijing on the 20th"),
  w("周日杭州 COSCon BoF", "COSCon BoF in Hangzhou on Sunday"),
  w("下周四 Tabs 上海见组织者", "Meet the Tabs Shanghai organisers next Thursday"),
]);
await tick();
const report = (r: Record<string, unknown>) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], evidence: [], ...r } as never });
report({ state: "progress", summary: w("下周日历上没有别的安排。", "Nothing else on next week."), asks: [{ state: "done", note: w("下周日历上没有别的安排", "Nothing else on your calendar") }] });
if (state === "answered") {
  report({
    state: "needs_input",
    summary: w("北京和杭州的两项记好了；周四那项缺个时间。", "Beijing and Hangzhou are in; Thursday needs a time."),
    asks: [
      { state: "done", note: w("下周日历上没有别的安排", "Nothing else on your calendar") },
      { state: "done", note: w("记好了，11 月 20 日", "Added for Nov 20") },
      { state: "done", note: w("记好了，11 月 15 日", "Added for Nov 15") },
      { state: "needs_input", note: w("几点见？说个时间我就记上", "What time? Say it and I'll add it") },
    ],
  });
  seed.tasks.setState(id, "needs_you", "hot");
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w("北京和杭州那两项记好了，下周日历上也没有别的安排。周四跟 Tabs 上海的组织者几点见？", "Two of the three are in your calendar, and nothing else is on next week. What time is the Tabs Shanghai meeting on Thursday?"), replyTo: msg.seq } });
}
await Bun.sleep(200);
await seed.stop();

const core = startCore({ dataDir, persona, push: false, ooSource, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] many asks (${state}, ${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
