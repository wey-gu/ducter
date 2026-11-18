// A demo core for 接着做 / continuity first (D372): one trip, one task. The hotel search is done;
// the follow-ups (the price gap and flights, then the flight wishes) carry the same task on, each
// under its own line, and On hand keeps the one card.
//   DUCTER_PORT=7799 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-continue.ts
// DEMO_STAGE: 1 = the second follow-up just handed over (the task at work again); 2 = its result.
import { startCore, stubRunner } from "./demo-core.ts";
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
      ask1: "我周六要去北京参加 AGI Bar 晚上的活动，住一晚第二天回来，帮我看看住哪儿合适",
      ack1: "我去查 AGI Bar 附近适合住的酒店，查清楚告诉你。",
      title: "北京 AGI Bar 周六行程",
      done1: "首选朗丽兹（中关村苏州街店），散场走 3–5 分钟，前台 24 小时。汉庭和富驿时尚也在 10 分钟内。",
      said1: "住朗丽兹最省事：散场走 3–5 分钟就到，前台 24 小时。",
      ask2: "这个酒店和旁边的汉庭差多少钱？然后也帮我看看机票吧，用我的携程账号",
      ack2: "我接着比一下两家的房价，顺便看机票。",
      done2: "朗丽兹 477 元、汉庭 440 元，贵 37 元。机票：浦东 11:15 飞大兴，周日 8:00 飞回，往返 800 元。",
      said2: "朗丽兹贵 37 元：477 对 440。机票往返 800 元，但回程早上 8 点从大兴飞，有点赶。",
      ask3: "朗丽兹可以。往返不用一起订吧？大兴太远了，去程尽量有 wifi、别起大早，周日回程别太晚",
      ack3: "我接着按你说的重新挑航班：首都机场、单程分开买。",
      done3: "可以分开买。去程 MU5155 10:35 浦东→首都；回程 CA8501 13:00 首都→浦东。去程 wifi 还没确认。",
      said3: "能分开买。去程 10:35 从浦东飞首都，回程周日 13:00 飞回，下午三点多到家。去程有没有 wifi 还没确认。",
    }
  : {
      ask1: "I'm going to an evening event at AGI Bar in Beijing on Saturday, staying one night. Where should I stay?",
      ack1: "I'll look for a good hotel near AGI Bar and tell you when it's clear.",
      title: "Saturday trip to AGI Bar, Beijing",
      done1: "Best: Langlizi (Suzhou Street), a 3–5 minute walk, 24-hour front desk. Hanting and Fuyi are within 10 minutes too.",
      said1: "Langlizi is easiest: a 3–5 minute walk after the event, with a 24-hour front desk.",
      ask2: "How much more is it than the Hanting next door? And look at flights too, with my Ctrip account",
      ack2: "I'll compare the two hotels' prices and look at flights too.",
      done2: "Langlizi ¥477, Hanting ¥440: ¥37 more. Flights: Pudong 11:15 to Daxing, back Sunday 8:00, ¥800 return.",
      said2: "Langlizi is ¥37 more: ¥477 against ¥440. Flights come to ¥800 return, but the way back leaves Daxing at 8am.",
      ask3: "Langlizi is fine. Do I have to book a return? Daxing's too far; Wi-Fi on the way out if possible, no early start, not too late back Sunday",
      ack3: "I'll pick the flights again your way: Capital airport, two one-ways.",
      done3: "Two one-ways work. Out MU5155 10:35 Pudong→Capital; back CA8501 13:00 Capital→Pudong. Wi-Fi on the way out not confirmed.",
      said3: "Two one-ways work: out at 10:35 to Capital, back Sunday at 13:00, home mid-afternoon. Wi-Fi on the way out isn't confirmed yet.",
    };

const taskId = "t_trip";
log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: w.title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: w.ask1 } });

/** One ask, its line, the task at work under it, and (done) its result. */
function round(n: number, ask: string, ack: string, report?: string, said?: string) {
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: `j${n}`, text: ack, replyTo: u.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `j${n}`, text: w.title, state: "running", taskId } });
  core.tasks.setState(taskId, "working", "hot");
  if (!report) return;
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: report, questions: [], evidence: [{ kind: "url", label: zh ? "携程" : "Ctrip", ref: "https://www.ctrip.com" }] } });
  core.tasks.setState(taskId, "done", "warm");
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `j${n}`, text: w.title, state: "done", taskId } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: said!, replyTo: u.seq } });
}

round(1, w.ask1, w.ack1, w.done1, w.said1);
await tick();
round(2, w.ask2, w.ack2, w.done2, w.said2);
await tick();
if (stage >= 2) round(3, w.ask3, w.ack3, w.done3, w.said3);
else round(3, w.ask3, w.ack3);
console.log(`demo-continue ready on :${process.env.DUCTER_PORT ?? "?"} (stage ${stage}, ${zh ? "zh" : "en"})`);
