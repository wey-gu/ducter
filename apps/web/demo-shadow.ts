// A demo core for D674 (research/247 Brief B): the shadow gets a verdict. A Monday morning note
// carries, at its foot, the week's line 这周我注意到 {n} 处没跟你说; the sheet lists what last week's
// shadow passes noticed, with the facts each joined, in the shapes of the author's own week (a trip
// to Tokyo, the ducter.dev renewal, the weekly sync, a talk), in invented words. One item is already
// labelled, so the settled state shows.
//   DUCTER_PORT=7513 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-shadow.ts
// DEMO_STAGE: review (default) as above; empty = the sheet with nothing noticed.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { ShadowFact, ShadowRun } from "@ducter/protocol";
import { shadowItemId } from "../../packages/core/src/proactive/shadow-review.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "review";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const H = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const fact = (id: string, type: string, src: ShadowFact["src"], label: string, ago: number, from?: string): ShadowFact => ({ id, type, src, label, ...(from ? { from } : {}), at: iso(now - ago * H) });
const W = zh
  ? {
      tokyo: { text: "12 月 3 日 MU 523 下午落地大阪关西，那晚订的涩谷酒店在东京，从机场过去要三个多小时。", why: "第一晚可能白付", next: "看看酒店能不能改到 12 月 4 日" },
      renew: { text: "ducter.dev 12 月 1 日续费，扣款的那张卡上周五在 Stripe 被拒了。", why: "域名可能过期", next: "换一张卡，或者先手动续上" },
      sync: { text: "周三 10:00 的 Nowledge 周会，你那时在 HO 1333 上，还没落地。", why: "周会缺席", next: "跟 Weizhen 说一声改到下午" },
      talk: { text: "AGI Bar 的分享日历上是 11/21 周六，Lina 的周报写的是 11/20 周五。", why: "去错日子", next: "先跟主办方确认是哪天" },
      hotels: { text: "12 月 16 日和 17 日两晚，新加坡订了两家酒店，一家在 Booking，一家在 Agoda。", why: "重复付了两晚", next: "看看哪一家能免费取消" },
      gh: { text: "GitHub Pro 每月扣 $4，这个月的收据来了，没有别的不对。", why: "", next: "" },
      det: "11/21 的 CA929 晚上 21:40 到成田，新宿的酒店却是 11/22 才入住，那晚还没地方住。",
    }
  : {
      tokyo: { text: "MU 523 lands at Osaka Kansai on the afternoon of Dec 3, but that night's hotel is in Shibuya, Tokyo, over three hours away.", why: "the first night paid for nothing", next: "see if the hotel can move to Dec 4" },
      renew: { text: "ducter.dev renews on Dec 1, and the card it charges was declined at Stripe last Friday.", why: "the domain could lapse", next: "switch the card, or renew it by hand first" },
      sync: { text: "The Nowledge weekly sync is Wednesday 10:00, when you're still on HO 1333.", why: "missing the sync", next: "ask Weizhen to move it to the afternoon" },
      talk: { text: "Your calendar has the AGI Bar talk on Sat 11/21; Lina's weekly report says Fri 11/20.", why: "going on the wrong day", next: "check the day with the organiser" },
      hotels: { text: "Two hotels in Singapore for the nights of Dec 16 and 17, one on Booking, one on Agoda.", why: "paying twice for two nights", next: "see which one cancels for free" },
      gh: { text: "GitHub Pro charged its monthly $4; the receipt came, nothing else is off.", why: "", next: "" },
      det: "CA929 lands at Narita at 21:40 on 11/21, but the Shinjuku hotel starts 11/22: nowhere to stay that night.",
    };

if (stage !== "empty") {
  const rows = {
    fl: fact("f_fl", "booking", "mail", "Flight confirmation MU523 Shanghai–Osaka", 70, "China Eastern"),
    ht: fact("f_ht", "booking", "mail", "Reservation confirmed: Shibuya Stream Excel Hotel", 69, "Hotels.com"),
    rn: fact("f_rn", "renewal", "mail", "Your domain ducter.dev renews soon", 60, "Cloudflare"),
    cd: fact("f_cd", "payment", "mail", "Card ending 4242 was declined", 58, "Stripe"),
    sy: fact("f_sy", "meeting", "calendar", "Weekly sync: Nowledge", 50),
    ho: fact("f_ho", "booking", "mail", "Your trip: HO 1333 Shanghai–Osaka", 49, "Trip.com"),
    tk: fact("f_tk", "plan", "calendar", "AGI Bar 北京分享", 40),
    wr: fact("f_wr", "plan", "mail", "Weekly report: events this week", 39, "Lina"),
    h1: fact("f_h1", "booking", "mail", "Booking confirmed: Parkroyal Collection Marina Bay", 30, "Booking.com"),
    h2: fact("f_h2", "booking", "mail", "Your Agoda booking at Hotel G Singapore", 29, "Agoda"),
    gp: fact("f_gp", "payment", "mail", "[GitHub] Payment receipt", 20, "GitHub"),
    gb: fact("f_gb", "billing", "mail", "Your GitHub Pro plan renews", 20, "GitHub"),
    ca: fact("f_ca", "booking", "mail", "Itinerary: CA929 Beijing – Tokyo Narita, 21 Nov", 26, "Air China"),
    sj: fact("f_sj", "booking", "mail", "Reservation confirmed: 22–25 Nov", 26, "Hotel Gracery Shinjuku"),
  };
  const f = (w: { text: string; why: string; next: string }, r: ShadowFact[], confidence: number, extra: Partial<ShadowRun["findings"][number]> = {}) => {
    const facts = r.map((x) => x.id).sort();
    return { key: facts.join("+"), facts, text: w.text, why: w.why, next: w.next, confidence, alsoBy: [], said: false, rows: r, ...extra };
  };
  const runA: ShadowRun = { runId: "shadow_a", by: "daily", facts: 41, findings: [f(W.tokyo, [rows.fl, rows.ht], 0.92), f(W.renew, [rows.rn, rows.cd], 0.88)], repeats: 0, dropped: [], detectorsOnly: [], tokens: 4200 };
  const runB: ShadowRun = { runId: "shadow_b", by: "daily", facts: 44, findings: [f(W.sync, [rows.sy, rows.ho], 0.81), f(W.talk, [rows.tk, rows.wr], 0.77, { said: true, alsoBy: ["plan_changed"] })], repeats: 1, dropped: [], detectorsOnly: [{ key: "mismatch:f_ca:f_sj", kind: "mismatch", facts: ["f_ca", "f_sj"], text: W.det, said: false, rows: [rows.ca, rows.sj] }], tokens: 4600 };
  const runC: ShadowRun = { runId: "shadow_c", by: "daily", facts: 46, findings: [f(W.hotels, [rows.h1, rows.h2], 0.9), f(W.gh, [rows.gp, rows.gb], 0.31)], repeats: 2, dropped: [], detectorsOnly: [], tokens: 4400 };
  for (const r of [runA, runB, runC]) log.append({ stream: "partner", origin: "system", kind: "shadow_finds", body: r });
  // One already answered last week (the talk): it shows settled, with 改 / Change.
  const talk = runB.findings[1]!;
  log.append({ stream: "partner", origin: "user", kind: "shadow_labels", body: { runId: runB.runId, findingId: shadowItemId("shadow", talk.key), verdict: "yes", at: iso(now - 10 * H) } });
}

// The Monday note: one offer, the week's noted line, and the review's line at its foot.
const finds = [
  {
    findId: "f513a",
    kind: "coming_up",
    text: zh ? "周三 10:00 Nowledge 周会，Weizhen 想先过一下 HawDB compaction 的方案。" : "Nowledge weekly sync Wednesday 10:00; Weizhen wants to go over the HawDB compaction plan first.",
    how: [{ src: "calendar", what: "Weekly sync: Nowledge", at: iso(now - 50 * H) }],
    offer: true,
  },
];
const until = iso(now + 23 * H);
log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n513", rung: "morning", opening: zh ? "早。" : "Morning.", finds, learned: { count: 3 }, shadowReview: { count: stage === "empty" ? 1 : 5, until } } as never });
await Bun.sleep(30);
core.living.render();

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
