// A demo core for 今天看了什么 / What it looked at today (D226) under the switch in Settings ›
// 通知: the real core and web client; the day itself is a fake (no mail, no model), switched by
// a control port so each state can be looked at on a phone and in a wide browser.
//   DUCTER_PORT=7812 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-quietday.ts
// Then POST http://127.0.0.1:$DEMO_CTL_PORT/state?s=<closed|counts|held|problem|pushoff|catching|off>
// and reload the page (the client asks for the day when the section mounts).
import type { ProactiveDay } from "@ducter/protocol";
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const base: ProactiveDay = { day: "2026-11-12", looked: { mail: 152, events: 3, mentions: 0 }, skipped: { notices: 41, promo: 18, muted: 0 }, read: 0, noted: 0, said: 0, held: [] };
const morning = new Date(Date.now() + 86_400_000);
morning.setHours(8, 30, 0, 0);
const days: Record<string, ProactiveDay> = {
  closed: { ...base, held: [{ reason: "not_urgent", n: 2 }] },
  counts: { ...base, looked: { mail: 152, events: 3, mentions: 7 }, skipped: { notices: 41, promo: 18, muted: 4 }, read: 23, noted: 5, said: 1, held: [] },
  held: {
    ...base,
    read: 23,
    noted: 5,
    said: 3,
    nextNote: morning.toISOString(),
    held: [
      { reason: "not_urgent", n: 2 },
      { reason: "for_morning", n: 1 },
      { reason: "below_bar", n: 4 },
      { reason: "cap", n: 1 },
      { reason: "muted", n: 2 },
      { reason: "budget", n: 1 },
      { reason: "night", n: 1 },
    ],
  },
  problem: { ...base, held: [{ reason: "not_urgent", n: 2 }], problem: { why: "not_installed", agent: "Claude Code", since: new Date(Date.now() - 2 * 3600_000).toISOString(), waiting: 40 } },
  pushoff: { ...base, read: 12, noted: 2, said: 1, pushOff: true },
  catching: { ...base, looked: { mail: 0, events: 0, mentions: 0 }, skipped: { notices: 0, promo: 0, muted: 0 }, catchingUp: true },
};
let state = process.env.DEMO_STATE ?? "held";

const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: process.env.DEMO_LANG === "en" ? "en" : "zh", notify: true, proactive: "urgent", quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" } });
// The user's first words set a client's language when it follows the system (a phone's Safari).
const en = process.env.DEMO_LANG === "en";
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: en ? "Keep an eye on my mail and calendar" : "帮我留意一下邮件和日程" } });
core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: en ? "Will do. I'll only come to you when something can't wait." : "好，有等不到明天的事我再找你。" } });
// The fake day, answered to proactive_day (the engine runs, but has nothing to watch).
(core.proactive as { day: () => ProactiveDay }).day = () => days[state] ?? days.held!;

const ctl = Number(process.env.DEMO_CTL_PORT ?? core.port + 1);
Bun.serve({
  port: ctl,
  hostname: "127.0.0.1",
  fetch(req) {
    const s = new URL(req.url).searchParams.get("s") ?? "";
    if (s === "off") core.settings.set({ proactive: "off" });
    else if (s in days) (state = s), core.settings.set({ proactive: "urgent" });
    else return new Response("unknown state\n", { status: 400 });
    return new Response(`${s}\n`);
  },
});
console.log(`[demo-quietday] ${core.url.replace("ws://", "http://").replace("/ws", "/app")} · ctl ${ctl} · ${state}`);
