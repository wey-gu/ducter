// D562: a demo core for walking the small apps end to end (research/229), with the author's own
// cases: the Beijing trip filled from his bookings ("给我做个小应用，记一下这趟北京出差的花销"), the review
// board a routine keeps over nowledge-co's PRs (pinned), a habit app whose page broke, a shopping list
// never opened. A stand-in partner does what the app tool does (no model): words about an app change it
// a moment later (改好了, 改回去). For screenshots of the web and the Mac, before and after D562.
//   DUCTER_PORT=7991 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-apps-polish.ts
// DEMO_CTL_PORT=<port> serves POST /fill (the trip's taxi and dinner added, as from inside the app).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { REVIEW_BOARD_HTML, REVIEW_BOARD_NAME } from "../../packages/core/src/review-board.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }], kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const persona = core.persona.id;
const file = (n: string) => readFileSync(join(import.meta.dir, n), "utf8");
const tiny = (title: string, line: string) => `<main class="k-app"><section class="k-sum"><span class="k-sum-label">${title}</span><span class="k-sum-value">${line}</span></section></main>`;
const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const w = zh
  ? {
      book: "帮我订明天去北京的高铁，再订两晚酒店，离 agibar 近一点",
      booked: "订好了：11/20 G1 07:00 上海虹桥到北京南，¥662；亚朵酒店（望京）11/20 和 11/21 两晚，¥1,036。",
      ask: "给我做个小应用，记一下这趟北京出差的花销",
      trip: "北京出差 11/20–21",
      made: "做好了，就叫「北京出差 11/20–21」。高铁和两晚酒店已经从你的预订里填进去了，路上的打车、吃饭随手记。",
      note: "高铁和两晚酒店，来自你的预订",
      xs: [
        { id: 1, what: "高铁 G1 上海虹桥 → 北京南", yuan: 662, cat: "go", day: "2026-11-20", from: "booking" },
        { id: 2, what: "亚朵酒店（望京）两晚", yuan: 1036, cat: "stay", day: "2026-11-20", from: "booking" },
      ],
      more: [
        { id: 3, what: "打车 北京南 → 望京", yuan: 86, cat: "go", day: "2026-11-20" },
        { id: 4, what: "和 agibar 的人吃饭", yuan: 130, cat: "eat", day: "2026-11-20" },
      ],
      changed: "加好了：每天下面有当天的小计，超过 ¥800 的那天标红。",
      changeNote: "每天加了小计，超过 ¥800 的那天标红",
      habit: { name: "每日习惯", summary: "读书连续 6 天" },
      shop: { name: "这周要买的" },
      task: "看 nowledge-co 里请我 review 的 PR",
    }
  : {
      book: "Book me a train to Beijing tomorrow and two nights at a hotel near agibar",
      booked: "Booked: G1 on 11/20, 07:00 Shanghai Hongqiao to Beijing South, ¥662; Atour Hotel (Wangjing), two nights 11/20 and 11/21, ¥1,036.",
      ask: "Make me a little app to keep this Beijing trip's costs",
      trip: "Beijing trip, Nov 20–21",
      made: "Done, it's called “Beijing trip, Nov 20–21”. Your train and two hotel nights are already in, from your bookings; add taxis and meals as you go.",
      note: "Your train and two hotel nights, from your bookings",
      xs: [
        { id: 1, what: "Train G1 Shanghai Hongqiao → Beijing South", yuan: 662, cat: "go", day: "2026-11-20", from: "booking" },
        { id: 2, what: "Atour Hotel (Wangjing), two nights", yuan: 1036, cat: "stay", day: "2026-11-20", from: "booking" },
      ],
      more: [
        { id: 3, what: "Taxi, Beijing South → Wangjing", yuan: 86, cat: "go", day: "2026-11-20" },
        { id: 4, what: "Dinner with the agibar people", yuan: 130, cat: "eat", day: "2026-11-20" },
      ],
      changed: "Done: each day now shows its subtotal, and a day over ¥800 shows red.",
      changeNote: "each day's subtotal; a day over ¥800 shows red",
      habit: { name: "Daily habits", summary: "Reading 6 days in a row" },
      shop: { name: "To buy this week" },
      task: "Review my requests in nowledge-co",
    };

// Made earlier: the review board a routine keeps (pinned), a habit app whose page broke, a list never opened.
const board = core.apps.make(persona, { name: REVIEW_BOARD_NAME[zh ? "zh" : "en"], html: REVIEW_BOARD_HTML, kind: "reviews", task: { id: "t_reviews", title: w.task }, summary: zh ? "9 个 PR 在等你，3 份草稿" : "9 PRs wait on you, 3 drafts" });
const habit = core.apps.make(persona, { name: w.habit.name, html: tiny(w.habit.name, w.habit.summary), icon: "flame", summary: w.habit.summary });
const shop = core.apps.make(persona, { name: w.shop.name, html: tiny(w.shop.name, zh ? "还剩 4 样" : "4 things left"), icon: "cart" });
if (!board.ok || !habit.ok || !shop.ok) throw new Error("demo apps");
const pr = (repo: string, n: number, title: string, ci: string, draft: string, problems: number, suggestions: number, changed: boolean, head: string) => ({ ref: `nowledge-co/${repo}#${n}`, title, ci, draft, problems, suggestions, changed, head });
core.apps.put(board.app.id, "board", {
  at: at(-0.02),
  prs: [
    pr("mem", 10287, "Distill memories in batches of 50", "failing", "drafted", 2, 1, true, "a1b2c3d"),
    pr("mem", 10473, "Keep the pinned message when the window trims", "passing", "drafted", 1, 0, true, "f098abc"),
    pr("hawdb", 412, "Compaction: skip empty runs", "pending", "drafted", 0, 2, true, "0c0ffee"),
    pr("mem", 7743, "Sync: retry on 409 with backoff", "failing", "none", 0, 0, false, "c4f2a10"),
    pr("mem", 8528, "Search: rank exact titles first", "passing", "sent", 1, 0, false, "77e1d02"),
    pr("hawdb", 398, "WAL: fsync the directory after rename", "passing", "sent", 0, 1, false, "9a41c6f"),
    pr("oomol-cli", 211, "Login: keep the device code on screen", "passing", "none", 0, 0, false, "e7d3b88"),
    pr("mem", 6497, "Docs: the CLI's export command", "passing", "none", 0, 0, false, "5b0d1e9"),
    pr("mem", 10332, "Importer: Notion databases", "none", "none", 0, 0, false, "2fd7e05"),
  ],
}, "task");
core.apps.set(board.app.id, { pinned: true });
core.apps.touch(board.app.id);
core.apps.touch(habit.app.id);
core.apps.broke(habit.app.id, 1, "Cannot read properties of null (reading 'streak')");
core.apps.keptBy((taskId) => (taskId === "t_reviews" ? { task: taskId, title: w.task, state: "resting", last: at(-0.02), next: at(0.74), of: { kind: "task", id: taskId } } : undefined));

// The conversation: the booking, the ask, the app made from it with the bookings in.
const say = (text: string, extra: Record<string, unknown> = {}) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ...extra } });
const user = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
const b = user(w.book);
say(w.booked, { replyTo: b.seq });
const q = user(w.ask);
const trip = core.apps.make(persona, { name: w.trip, html: file("demo-apps-trip-v3.html"), ask: w.ask, note: w.note, icon: "suitcase", data: { trip: { from: "2026-11-20", to: "2026-11-21", currency: "CNY" }, expenses: w.xs } });
if (!trip.ok) throw new Error(trip.error);
const id = trip.app.id;
say(w.made, { replyTo: q.seq, app: { id, name: w.trip, version: 1, change: "made" } });

// The stand-in partner: words about an app change it a few seconds later (the strip says it is on it meanwhile).
core.setPartner({
  onTrigger(e: LogEvent) {
    if (e.kind !== "user_msg") return;
    const body = e.body as { text: string; app?: { id: string; ask?: string } };
    if (!body.app || body.app.ask) return;
    const app = body.app.id;
    setTimeout(() => {
      const r = core.apps.change(app, { edits: [{ find: "const fmt = (n) =>", replace: "const OVER = 800;\n  const fmt = (n) =>" }], note: w.changeNote });
      if (!r.ok) return void say(r.error, { replyTo: e.seq });
      say(w.changed, { replyTo: e.seq, app: { id: r.app.id, name: r.app.name, version: r.app.version, change: "changed" } });
    }, Number(process.env.DEMO_CHANGE_MS ?? 6000));
  },
});

const ctl = Number(process.env.DEMO_CTL_PORT ?? 0);
if (ctl)
  Bun.serve({
    port: ctl,
    hostname: "127.0.0.1",
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/fill") core.apps.put(id, "expenses", [...w.xs, ...w.more], "app");
      const home = Object.fromEntries(core.apps.list(persona).map((m) => [m.id, m.home]));
      return Response.json({ ok: true, trip: id, board: board.app.id, habit: habit.app.id, shop: shop.app.id, home });
    },
  });
console.log(`demo-apps-polish ready on :${process.env.DUCTER_PORT ?? "?"} (${zh ? "zh" : "en"}) trip=${id} board=${board.app.id} habit=${habit.app.id} shop=${shop.app.id}`);
