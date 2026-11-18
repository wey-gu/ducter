// A demo core for D379's quick web look in the conversation: the person asks tomorrow's weather,
// the partner names the look in one line, and the waiting line says 在网上查… / Looking it up on
// the web… (DEMO_STAGE=looking); then the answer with where it's from (DEMO_STAGE=done, the
// default). No model and no web: the look's record is written as the real one would be.
//   DUCTER_PORT=7981 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=looking bun apps/web/demo-weblook.ts
// then open http://127.0.0.1:7981/app
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "done";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", update: { homeName: "home-server" }, bridgeLink: { run: async () => undefined, env: {} } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const say = (origin: "user" | "partner", text: string, replyTo?: number) =>
  core.log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: origin === "user" ? { text } : { text, ...(replyTo !== undefined ? { replyTo } : {}) } } as never);

// Earlier in the day, so the conversation isn't empty.
const u0 = say("user", zh ? "下午三点的会挪到四点了" : "The 3 pm meeting moved to 4");
say("partner", zh ? "好，记下了，四点前十分钟提醒你。" : "Got it, I'll remind you ten minutes before 4.", u0.seq);

const q = zh ? "明天上海会下雨吗？" : "Will it rain in Shanghai tomorrow?";
const u = say("user", q);
say("partner", zh ? "我看一下明天上海的天气。" : "Checking tomorrow's Shanghai forecast.", u.seq);
const lookId = "look_demo1";
const question = zh ? "明天（11 月 20 日）上海会下雨吗" : "Will it rain in Shanghai tomorrow (Nov 20)?";
core.log.append({ stream: "channel", origin: "partner", kind: "web_look", body: { lookId, question, state: "looking", replyTo: u.seq } });
if (stage === "looking") {
  const since = ago(0.2);
  core.activity?.set({ step: "web", since, stepSince: since });
} else {
  core.log.append({
    stream: "channel",
    origin: "system",
    kind: "web_look",
    body: { lookId, question, replyTo: u.seq, state: "found", answer: zh ? "明天上海小雨转阴，9 到 13 度，降水概率 80%" : "Light rain turning cloudy, 9 to 13 °C, 80% chance of rain", sources: ["https://www.weather.com.cn/weather/58362.shtml"], confidence: "high", harness: "claude-code", model: "haiku", ms: 18200 },
  });
  say("partner", zh ? "明天上海有小雨，之后转阴，9 到 13 度，记得带伞（中国天气网）。" : "Light rain in Shanghai tomorrow, then cloudy, 9 to 13 °C; take an umbrella (China Weather).", u.seq);
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
