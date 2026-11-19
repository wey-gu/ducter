// A demo core for D405: 小应用 / Apps. The person asks for a little app to keep their Beijing trip's
// costs; the partner makes it (its card under one line); a few costs are in it; then "加个预算"
// changes it, and the app asks the partner a question from inside. For screenshots of the web and
// Mac clients. The app's file is hand-written here (demo-apps-trip.html) as a stand-in for what the
// partner writes; the eval's own apps are in its results.
//   DUCTER_PORT=7983 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_STAGE=2 bun apps/web/demo-apps.ts
// DEMO_STAGE: 1 = made (the card under the line);
//             2 = changed by talking, and the app's ask answered in the conversation.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "2");
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }], kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
// A stand-in partner that answers an app's ask (ducter.ask) with the demo's words, so the round trip
// through a real client shows: the app's words in the conversation, the answer back in the app.
core.setPartner({
  onTrigger(e) {
    const app = e.kind === "user_msg" ? (e.body as { app?: { id: string; ask?: string } }).app : undefined;
    if (app?.ask && app.ask !== "a1-demo") setTimeout(() => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.a, appAnswer: { id: app.id, ask: app.ask! } } }), 600);
  },
});
const log = core.log;
const tick = () => Bun.sleep(30);

const w = zh
  ? {
      ask: "给我做个小应用，记一下这趟北京出差的花销，按天列，带个合计",
      said: "做好了，记一笔就自动加总，按天排好。",
      name: "北京出差花销",
      change: "预算按 3000 算，超了标红",
      changed: "加好了：上面一条预算条，还剩多少一眼就看到。",
      note: "加了 3000 的预算条",
      q: "报销要准备什么？",
      a: "发票抬头写公司全称，酒店要住宿发票和水单，打车留行程单。高铁票在 12306 里开报销凭证。",
      xs: [
        { what: "高铁 上海虹桥 → 北京南", yuan: 662, cat: "go", day: "2026-11-18" },
        { what: "朗丽兹酒店 两晚", yuan: 1036, cat: "stay", day: "2026-11-18" },
        { what: "打车 北京南 → 酒店", yuan: 46, cat: "go", day: "2026-11-18" },
        { what: "和客户午饭", yuan: 268, cat: "eat", day: "2026-11-19" },
        { what: "咖啡", yuan: 32, cat: "eat", day: "2026-11-19" },
        { what: "打车 去 agibar", yuan: 38, cat: "go", day: "2026-11-19" },
      ],
    }
  : {
      ask: "Make me a little app to keep this Beijing trip's costs, by day, with a total",
      said: "Done: add a cost and it totals itself, sorted by day.",
      name: "Beijing trip expenses",
      change: "Set a 3,000 budget and show red when I'm over",
      changed: "Added a budget bar at the top, so what's left shows at a glance.",
      note: "added a 3,000 budget bar",
      q: "What do I need for the claim?",
      a: "Receipts made out to the company's full name, the hotel's invoice and folio, and the ride receipts. The train ticket's receipt comes from 12306.",
      xs: [
        { what: "Train Shanghai Hongqiao → Beijing South", yuan: 662, cat: "go", day: "2026-11-18" },
        { what: "Langlizi Hotel, two nights", yuan: 1036, cat: "stay", day: "2026-11-18" },
        { what: "Taxi to the hotel", yuan: 46, cat: "go", day: "2026-11-18" },
        { what: "Lunch with the client", yuan: 268, cat: "eat", day: "2026-11-19" },
        { what: "Coffee", yuan: 32, cat: "eat", day: "2026-11-19" },
        { what: "Taxi to agibar", yuan: 38, cat: "go", day: "2026-11-19" },
      ],
    };

const html = readFileSync(join(import.meta.dir, "demo-apps-trip.html"), "utf8");
const persona = core.persona.id;
const q = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
// Version 1: no budget bar yet (the demo's file with its budget parts left out).
const v1 = html.replace('<div class="bar" id="bar"></div>', "").replace('<div class="of" id="of"></div>', "");
const r = core.apps.make(persona, { name: w.name, html: stage >= 2 ? v1 : html, ask: w.ask });
if (!r.ok) throw new Error(`demo-apps: ${r.error}`);
const id = r.app.id;
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said, replyTo: q.seq, app: { id, name: w.name, version: 1, change: "made" } } });
core.apps.put(id, "expenses", w.xs.map((x, i) => ({ id: i + 1, ...x })), "app");
await tick();
if (stage >= 2) {
  const c = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.change, app: { id, name: w.name } } });
  const ch = core.apps.change(id, { html, note: w.note });
  if (!ch.ok) throw new Error(`demo-apps: ${ch.error}`);
  core.apps.put(id, "budget", 3000, "partner");
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.changed, replyTo: c.seq, app: { id, name: w.name, version: ch.app.version, change: "changed" } } });
  await tick();
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.q, app: { id, name: w.name, ask: "a1-demo" } } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.a, appAnswer: { id, ask: "a1-demo" } } });
}
console.log(`demo-apps ready on :${process.env.DUCTER_PORT ?? "?"} (stage ${stage}, ${zh ? "zh" : "en"}, app ${id})`);
