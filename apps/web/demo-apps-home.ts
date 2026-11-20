// A demo core for D410: 小应用 / Apps, the shelf, and the author's own case (2026-11-20): "给我做个小应用，
// 记一下出差花销" while Ducter knows he is in Beijing today (the morning note) and booked his train and
// hotel. For screenshots of the web and Mac clients, before and after.
//   DUCTER_PORT=7984 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_STAGE=after bun apps/web/demo-apps-home.ts
// DEMO_STAGE: before = what 0.0.99 made (a generic form, nothing filled in, no kit);
//             after  = the same sentence now: named for the trip, the bookings filled in, the kit;
//             shelf  = after, and three more apps on the shelf (one pinned, one a routine keeps current);
//             empty  = no apps yet: the shelf's ideas, the trip first (from the noted booking).
// The apps' files are hand-written stand-ins for what the partner writes (the eval's own are in its results).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "after";
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }], kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const persona = core.persona.id;
const file = (n: string) => readFileSync(join(import.meta.dir, n), "utf8");

// What Ducter noted from the booking mails (the proactive ledger): the train and the hotel.
const ref = (id: string) => ({ connectionId: "conn_demo", service: "gmail", id, thread: `t_${id}` });
core.proactive.ledger.add([
  { ref: ref("g1"), label: "12306 · G1", at: "2026-11-19T21:10:00+08:00", type: "booking", what: "train", name: "G1", from: "上海虹桥", place: "北京南", start: "2026-11-20T07:00:00+08:00", end: "2026-11-20T11:29:00+08:00" },
  { ref: ref("h1"), label: "Atour · 望京", at: "2026-11-19T21:14:00+08:00", type: "booking", what: "hotel", name: "亚朵酒店（望京）", place: "北京", start: "2026-11-20T15:00:00+08:00", end: "2026-11-22T12:00:00+08:00" },
]);

const w = zh
  ? {
      morning: "早上好。今天 09:00 agibar 分享（北京）。",
      book: "帮我订明天去北京的高铁，再订两晚酒店，离 agibar 近一点",
      booked: "订好了：11/20 G1 07:00 上海虹桥到北京南，¥662；亚朵酒店（望京）11/20 和 11/21 两晚，¥1,036。",
      ask: "给我做个小应用，记一下出差花销",
      before: { name: "出差花销", said: "做好了，一个记出差花销的小应用。" },
      after: { name: "北京出差 11/20–21", said: "做好了，就叫「北京出差 11/20–21」。高铁和两晚酒店已经从你的预订里填进去了，路上的打车、吃饭随手记。", note: "高铁和两晚酒店，来自你的预订", summary: "2 笔，合计 ¥1,698" },
      xs: [
        { id: 1, what: "高铁 G1 上海虹桥 → 北京南", yuan: 662, cat: "go", day: "2026-11-20", from: "booking" },
        { id: 2, what: "亚朵酒店（望京）两晚", yuan: 1036, cat: "stay", day: "2026-11-20", from: "booking" },
      ],
      habit: { name: "每日习惯", summary: "读书连续 6 天" },
      shop: { name: "这周要买的", summary: "还剩 4 样" },
      board: { name: "审查看板", summary: "9 个 PR 在等你，3 份草稿", task: "看 nowledge-co 里请我 review 的 PR" },
    }
  : {
      morning: "Morning. Today 09:00 agibar talk (Beijing).",
      book: "Book me a train to Beijing tomorrow and two nights at a hotel near agibar",
      booked: "Booked: G1 on 11/20, 07:00 Shanghai Hongqiao to Beijing South, ¥662; Atour Hotel (Wangjing), two nights 11/20 and 11/21, ¥1,036.",
      ask: "Make me a little app to keep my trip expenses",
      before: { name: "Trip expenses", said: "Done: a little app for your trip expenses." },
      after: { name: "Beijing 11/20–21", said: "Done, it's called “Beijing 11/20–21”. Your train and two hotel nights are already in, from your bookings; add taxis and meals as you go.", note: "Your train and two hotel nights, from your bookings", summary: "2 costs, ¥1,698 in all" },
      xs: [
        { id: 1, what: "Train G1 Shanghai Hongqiao → Beijing South", yuan: 662, cat: "go", day: "2026-11-20", from: "booking" },
        { id: 2, what: "Atour Hotel (Wangjing), two nights", yuan: 1036, cat: "stay", day: "2026-11-20", from: "booking" },
      ],
      habit: { name: "Daily habits", summary: "Reading 6 days in a row" },
      shop: { name: "To buy this week", summary: "4 things left" },
      board: { name: "Review board", summary: "9 PRs wait on you, 3 drafts", task: "Review PRs assigned to me in nowledge-co" },
    };

const say = (text: string, extra: Record<string, unknown> = {}) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ...extra } });
const user = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
const tiny = (title: string, line: string) => `<main class="k-app"><section class="k-sum"><span class="k-sum-label">${title}</span><span class="k-sum-value">${line}</span></section></main>`;

let id = "";
// D418: DEMO_STAGE=states: the shelf with every state an app can be in, from one truth each: the
// author's old app (made before the kit), the trip app pinned, the review board a task keeps (next
// round tomorrow 9:00), a fare check whose last round failed, a baby-feeds app being changed now,
// and a habit tracker whose page broke. Ongoing is stood in for by keptBy (no real task runs here).
if (stage === "states") {
  const S = zh
    ? { feeds: { name: "宝宝喝奶", summary: "今天 210ml，上次 9:05" }, fare: { name: "东京机票", summary: "往返 ¥2,480，比昨天便宜 ¥160", task: "每天早上看一眼上海到东京的机票" }, err: "Cannot read properties of null (reading 'streak')" }
    : { feeds: { name: "Baby feeds", summary: "210ml today, last at 9:05" }, fare: { name: "Tokyo fares", summary: "¥2,480 return, ¥160 less than yesterday", task: "Check Shanghai to Tokyo fares each morning" }, err: "Cannot read properties of null (reading 'streak')" };
  const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const old = core.apps.make(persona, { name: w.before.name, html: file("demo-apps-trip-before.html"), ask: w.ask });
  const trip = core.apps.make(persona, { name: w.after.name, html: file("demo-apps-trip-v2.html"), ask: w.ask, summary: w.after.summary, icon: "suitcase", data: { trip: { from: "2026-11-20", to: "2026-11-21", currency: "CNY" }, expenses: w.xs } });
  const board = core.apps.make(persona, { name: w.board.name, html: tiny(w.board.name, w.board.summary), icon: "pr", summary: w.board.summary, task: { id: "t_reviews", title: w.board.task } });
  const fare = core.apps.make(persona, { name: S.fare.name, html: tiny(S.fare.name, S.fare.summary), icon: "plane", summary: S.fare.summary, task: { id: "t_fares", title: S.fare.task } });
  const feeds = core.apps.make(persona, { name: S.feeds.name, html: tiny(S.feeds.name, S.feeds.summary), icon: "bottle", summary: S.feeds.summary });
  const habit = core.apps.make(persona, { name: w.habit.name, html: tiny(w.habit.name, w.habit.summary), icon: "flame", summary: w.habit.summary });
  if (!old.ok || !trip.ok || !board.ok || !fare.ok || !feeds.ok || !habit.ok) throw new Error("demo apps");
  core.apps.set(trip.app.id, { pinned: true });
  for (const a of [trip, board, fare, feeds, habit]) core.apps.touch(a.app.id);
  core.apps.keptBy((taskId) =>
    taskId === "t_reviews"
      ? { task: taskId, title: w.board.task, state: "resting", last: at(-2), next: new Date(new Date().setHours(33, 0, 0, 0)).toISOString(), of: { kind: "task", id: taskId } }
      : taskId === "t_fares"
        ? { task: taskId, title: S.fare.task, state: "failed", last: at(-26), why: zh ? "航司的网站没打开" : "The airline's site didn't load", of: { kind: "task", id: taskId } }
        : undefined,
  );
  say(w.morning);
  core.settings.set({ language: zh ? "zh" : "en" });
  // The person's words about the feeds app are in; the partner hasn't answered yet.
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "加一个按钮：记一笔 120ml" : "Add a button for a 120ml feed", app: { id: feeds.app.id, name: feeds.app.name } } });
  core.apps.changing(feeds.app.id, true);
  core.apps.broke(habit.app.id, 1, S.err);
  id = old.app.id;
}
if (stage !== "empty" && stage !== "states") {
  say(w.morning);
  const b = user(w.book);
  say(w.booked, { replyTo: b.seq });
  const q = user(w.ask);
  if (stage === "before") {
    const r = core.apps.make(persona, { name: w.before.name, html: file("demo-apps-trip-before.html"), ask: w.ask });
    if (!r.ok) throw new Error(r.error);
    id = r.app.id;
    say(w.before.said, { replyTo: q.seq, app: { id, name: w.before.name, version: 1, change: "made" } });
  } else {
    if (stage === "shelf") {
      // Made earlier: a habit tracker, a shopping list, and the review board a routine keeps current.
      const h = core.apps.make(persona, { name: w.habit.name, html: tiny(w.habit.name, w.habit.summary), icon: "check", summary: w.habit.summary });
      const s = core.apps.make(persona, { name: w.shop.name, html: tiny(w.shop.name, w.shop.summary), icon: "list", summary: w.shop.summary });
      const r = core.apps.make(persona, { name: w.board.name, html: tiny(w.board.name, w.board.summary), icon: "board", summary: w.board.summary, task: { id: "t_reviews", title: w.board.task } });
      if (h.ok) core.apps.set(h.app.id, { pinned: true });
      if (h.ok) core.apps.touch(h.app.id);
      if (r.ok) core.apps.touch(r.app.id);
      void s;
    }
    // DEMO_EVAL_APP=<dir>/<scenario>-<id>-v<n> (no extension): an app haiku wrote in the eval (DUCTER_EVAL_APPS_DIR), as a client runs it.
    const ev = process.env.DEMO_EVAL_APP;
    const evApp = ev ? (JSON.parse(readFileSync(`${ev}.json`, "utf8")) as { name: string; data: Record<string, unknown> }) : undefined;
    const r = evApp
      ? core.apps.make(persona, { name: evApp.name, html: readFileSync(`${ev}.html`, "utf8"), ask: w.ask, note: w.after.note, data: evApp.data })
      : core.apps.make(persona, { name: w.after.name, html: file("demo-apps-trip-v2.html"), ask: w.ask, note: w.after.note, summary: w.after.summary, icon: "coins", data: { trip: { from: "2026-11-20", to: "2026-11-21", currency: "CNY" }, expenses: w.xs } });
    if (!r.ok) throw new Error(r.error);
    id = r.app.id;
    say(w.after.said, { replyTo: q.seq, app: { id, name: w.after.name, version: 1, change: "made" } });
  }
}
console.log(`demo-apps-home ready on :${process.env.DUCTER_PORT ?? "?"} (${stage}, ${zh ? "zh" : "en"}${id ? `, app ${id}` : ""})`);
