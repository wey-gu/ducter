// D222's screens with realistic data: the real core with a silent partner, two Google Calendar
// accounts and Gmail in a fake oo (packages/core/test/fake-oo-calendar.ts, moved to today), and a
// conversation seeded through the calendar module itself: a day card, a week card, a new event's
// card, a move that ran (Go), and an invitation's answer waiting. Never the real oo.
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=<scratch> bun scripts/readme-shots/calendar-demo.ts   # seeds, exits
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=<scratch> bun scripts/readme-shots/calendar-demo.ts   # serves
// LANG_ZH=0 seeds the conversation in English.
import { startCore, stubRunner } from "../../packages/core/src/index.ts";
import type { Bodies } from "../../packages/protocol/src/index.ts";
import { fakeOoCalendar } from "../../packages/core/test/fake-oo-calendar.ts";

const zh = process.env.LANG_ZH !== "0";
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const day = (n = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + n * 86_400_000));
const oo = fakeOoCalendar({ day: day() });
const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  ooSource: oo.source,
  deviceProbes: { kind: async () => "laptop", harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }] },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
if (log.head() > 0) {
  await core.connections.view();
  const pair = await core.devicesView.pairCode();
  console.log(`[calendar-demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
  console.log(`[calendar-demo] phone: xcrun simctl launch booted co.nowledge.ducter.ios -pairLink 'http://127.0.0.1:${core.port}/pair#c=${pair.code}'`);
  process.on("SIGINT", async () => {
    await core.stop();
    process.exit(0);
  });
  await new Promise(() => {});
}
const tick = () => Bun.sleep(30);
const user = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
const ai = (text: string, extra: Partial<Bodies["ai_msg"]> = {}) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ...extra } });

if (!(await core.connections.addFromOo()).ok) throw new Error("fake oo: not added");
core.settings.set({ proactive: "three" });

let u = user(zh ? "我今天都有什么安排？" : "What's on today?");
await tick();
const today = await core.calendar.glance(day(), day());
const { errors: _e, ...todayCard } = today;
ai(zh ? "今天 6 件事，10:00 看牙和 10:30 的 HawDB 周会撞了；Sam 的 Design sync 还没回复。" : "Six things today. The 10:00 dentist overlaps the 10:30 HawDB weekly, and Sam's design sync isn't answered yet.", { cal: todayCard, replyTo: u.seq });
await tick();

u = user(zh ? "看牙那个改到下午 5 点吧" : "Move the dentist to 5pm");
await tick();
const dentist = today.days[0]!.events.find((e) => e.title === "看牙")!;
const mv = await core.calendar.propose({ change: "move", ref: dentist.ref, start: `${day()}T17:00` }, "d_move");
if (!mv.ok) throw new Error(mv.error);
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_move", question: mv.question[zh ? "zh" : "en"], goLabel: mv.goLabel[zh ? "zh" : "en"], defaultOption: "hold", reversible: false, cal: mv.cal } });
await tick();
log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_move", option: "go", by: "user" } });
await Bun.sleep(300); // core runs it (the fake oo answers with the event's link)

u = user(zh ? "明天下午三点加个半小时的会，和 lina@nowledge-labs.ai 对一下 HawDB 的发布，她在洛杉矶" : "Add a 30-minute call tomorrow at 3pm with lina@nowledge-labs.ai about the HawDB release; she's in LA");
await tick();
const add = await core.calendar.propose({ change: "create", title: zh ? "和 Lina 对一下 HawDB 发布" : "HawDB release with Lina", start: `${day(1)}T15:00`, minutes: 30, attendees: ["lina@nowledge-labs.ai"], online: true, theirZone: "America/Los_Angeles", theirName: "Lina" }, "d_add");
if (!add.ok) throw new Error(add.error);
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_add", question: add.question[zh ? "zh" : "en"], goLabel: add.goLabel[zh ? "zh" : "en"], defaultOption: "hold", reversible: false, cal: add.cal } });
await tick();
log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_add", option: "go", by: "user" } });
await Bun.sleep(300);

u = user(zh ? "这周还有什么？" : "And the rest of the week?");
await tick();
const week = await core.calendar.glance(day(), day(6));
const { errors: _w, ...weekCard } = week;
ai(zh ? "这周就今天比较满，其余几天都空着。" : "Today is the busy one; the rest of the week is open.", { cal: weekCard, replyTo: u.seq });
await tick();

u = user(zh ? "Design sync 我不去了" : "I'll skip the design sync");
await tick();
const sync = today.days[0]!.events.find((e) => e.title === "Design sync")!;
const dec = await core.calendar.propose({ change: "respond", ref: sync.ref, response: "declined" }, "d_decline");
if (!dec.ok) throw new Error(dec.error);
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_decline", question: dec.question[zh ? "zh" : "en"], goLabel: dec.goLabel[zh ? "zh" : "en"], defaultOption: "hold", reversible: false, cal: dec.cal } });
await Bun.sleep(300);
console.log(`[calendar-demo] seeded ${log.head()} events in ${core.dataDir}; run again to serve`);
await core.stop();
process.exit(0);
