// A demo core for D388 (research/154): what Ducter says by itself about one coming plan whose
// sources disagree, and the follow-up that fills the time it named, each with 怎么知道的 open to
// its sources (where it was read, what it says, a link for the page), what it doesn't know, and
// that it changed nothing. Synthetic: every person, company and page is made up.
//   DUCTER_PORT=7799 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-aha.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.now();
const page = "https://agibar.example.com/events/2026-11-21-beijing";
const w = zh
  ? {
      contra: "日历上「AGI Bar 北京分享」是 11/21（周六），Lina 的周报写的是 11/20（周五）。时间也没定，订票前先跟主办方确认。",
      quota: "Lumen Cloud CDN 流量包的额度已经用了 95%。信里没写还剩多少、哪天重置。",
      fill: "补上刚才缺的时间：「AGI Bar 北京分享」11/21（周六）19:00 开门（agibar.example.com）。你几点上场页面上没写。",
      hold: "11/21（周六），全天，没写时间",
      fri: "11/20（周五）",
      doors: "11/21（周六）19:00（开门）",
      unknownTime: "几点开始",
      unknownSlot: "你几点上场",
      unknownQuota: "还剩多少、哪天重置",
      untouched: "日历我没改。",
      go: "核对哪个对",
      usage: "打开用量页",
    }
  : {
      contra: 'Your calendar has "AGI Bar 北京分享" on Sat 11/21, but Lina\'s weekly report says Fri 11/20. No time yet either: check with the organiser before booking travel.',
      quota: "Lumen Cloud CDN has used 95% of its quota. The mail doesn't say how much is left or when it resets.",
      fill: 'Filling in the time: "AGI Bar 北京分享" is Sat 11/21 at 19:00 (doors), per agibar.example.com. That\'s when the doors open; your slot isn\'t listed.',
      hold: "Sat 11/21, all day, no time",
      fri: "Fri 11/20",
      doors: "Sat 11/21 19:00 (doors)",
      unknownTime: "what time it starts",
      unknownSlot: "when your part starts",
      unknownQuota: "how much is left, when it resets",
      untouched: "I didn't change your calendar.",
      go: "Check which is right",
      usage: "Open the usage page",
    };

const hold = { src: "calendar" as const, what: "AGI Bar 北京分享", at: iso(now - 7 * 24 * H), says: w.hold };
const weekly = { src: "mail" as const, what: "本周周报 W47", from: "Lina Zhou", at: iso(now - 50 * 60_000), says: w.fri };
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "周末前帮我把发布说明理一下" : "Tidy up the release notes before the weekend" } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "好，理好了发你。" : "Sure, I'll send them over when they're tidy." } });
log.append({
  stream: "channel",
  origin: "partner",
  kind: "finds",
  body: {
    noteId: "n_now",
    rung: "now",
    opening: "",
    finds: [
      { findId: "f_contra", kind: "mismatch", text: w.contra, how: [hold, weekly], unknown: w.unknownTime, untouched: w.untouched, decisionId: "d_contra", goLabel: w.go },
      { findId: "f_quota", kind: "deadline", text: w.quota, how: [{ src: "mail", what: "流量包使用已达 95%", from: "Lumen Cloud", at: iso(now - 2 * H) }], unknown: w.unknownQuota, decisionId: "d_quota", goLabel: w.usage },
    ],
  },
});
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_contra", question: w.contra, goLabel: w.go, defaultOption: "hold", reversible: false, findId: "f_contra" } });
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_quota", question: w.quota, goLabel: w.usage, defaultOption: "hold", reversible: false, findId: "f_quota" } });
await Bun.sleep(30);
log.append({
  stream: "channel",
  origin: "partner",
  kind: "finds",
  body: {
    noteId: "n_fill",
    rung: "now",
    opening: "",
    finds: [{ findId: "f_fill", kind: "update", text: w.fill, how: [{ src: "web", what: "agibar.example.com", at: iso(now), says: w.doors, url: page }, { src: "calendar", what: hold.what, at: hold.at }, { src: "mail", what: weekly.what, from: weekly.from, at: weekly.at }], unknown: w.unknownSlot, untouched: w.untouched }],
  },
});

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
