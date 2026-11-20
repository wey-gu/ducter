// A demo core for 放手说 / Talk hands-free (D442): the person is cooking and talks to the partner
// without touching the phone. The partner here is scripted (no model): a turn about the stew gets
// an answer and a card that waits for a Go (a reminder), one about the weather a short answer, and
// one about the train ticket a Pay card (the floor: said aloud, answered only by a tap).
//   DUCTER_PORT=7985 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-talk.ts
// then open http://127.0.0.1:7985/app?voice-fake and drive the fakes from the page
// (globalThis.ducterVoiceFake: { rec, spk, talk }). Never the real microphone or speakers.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", bridgeLink: { run: async () => undefined, env: {} } });
core.setRunner(stubRunner(core));
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;

const say = (origin: "user" | "partner", text: string, replyTo?: number) =>
  log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: origin === "user" ? { text } : { text, ...(replyTo !== undefined ? { replyTo } : {}) } } as never);

// Earlier today: what is for dinner.
const u0 = say("user", w("今晚做番茄牛腩，家里有牛腩、番茄、土豆和洋葱。", "Making tomato beef stew tonight: I have beef, tomatoes, potatoes and onions."));
say("partner", w("好搭配。牛腩先焯水，番茄炒出汁再下牛腩，加热水没过，小火慢炖。土豆最后二十分钟再放，不会烂。", "Good mix. Blanch the beef first, cook the tomatoes down, add the beef and hot water to cover, then simmer low. Potatoes go in for the last twenty minutes so they hold."), u0.seq);

let n = 0;
core.setPartner({
  onTrigger(e) {
    if (e.kind !== "user_msg") return;
    const text = String((e.body as { text?: string }).text ?? "");
    const seq = e.seq;
    setTimeout(() => {
      if (/炖|多久|stew|how long/i.test(text)) {
        say("partner", w("小火炖一个半小时，筷子能轻松戳透就好。最后二十分钟放土豆，出锅前尝一下咸淡。要我一个半小时后提醒你关火吗？", "Simmer for an hour and a half, until a chopstick goes through easily. Potatoes for the last twenty minutes, then taste for salt. Want me to remind you to turn it off in an hour and a half?"), seq);
        log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: `d_timer_${++n}`, question: w("一个半小时后提醒你关火？", "Remind you to turn off the stew in an hour and a half?"), goLabel: w("提醒我", "Remind me"), defaultOption: "hold", reversible: true } });
      } else if (/票|车|ticket|train/i.test(text)) {
        say("partner", w("周六早上 8:05 去杭州的那班还有二等座，¥73。", "The 8:05 to Hangzhou on Saturday still has second class, ¥73."), seq);
        log.append({
          stream: "channel",
          origin: "partner",
          kind: "decision",
          body: { decisionId: `d_pay_${++n}`, question: w("付 ¥73 买周六 8:05 去杭州的车票？", "Pay ¥73 for the 8:05 to Hangzhou on Saturday?"), goLabel: w("付款", "Pay"), defaultOption: "hold", reversible: false, pay: { site: "kyfw.12306.cn", amount: "73.00", currency: "CNY", what: w("周六 8:05 上海虹桥 → 杭州东，二等座", "Sat 8:05 Shanghai Hongqiao → Hangzhou East, second class"), handle: "card_1", card: "Visa ••4242", last4: "4242", needsCvc: false, firstHere: false } },
        } as never);
      } else if (/天气|下雨|weather|rain/i.test(text)) {
        say("partner", w("明天上海多云转小雨，最高 14 度，下午三点以后有雨。出门带把伞。", "Tomorrow in Shanghai: cloudy, then light rain after 3 pm, 14 degrees at most. Take an umbrella."), seq);
      } else say("partner", w("好，记下了。", "Got it."), seq);
    }, Number(process.env.DEMO_REPLY_MS ?? 1200));
  },
});
