// D243 (research/81): the day dots spoke four times, replayed through the whole proactive engine
// (fake clock, fake accounts, recorded triage, code's bar): what Ducter says by itself, when, and
// what it never says. bun packages/partner/eval/proactive/day.ts [three|urgent|useful]
// Prints the timeline, then the score against DOTS_SAY / DOTS_NEVER. No model, no network.
import type { ProactiveMode } from "../../../protocol/src/index.ts";
import { DOTS_NEVER, DOTS_SAY, DOTS_START, dotsDay } from "../../../core/test/fixtures/dots-day.ts";
import { rig } from "../../../core/test/proactive-rig.ts";

const mode = (process.argv[2] ?? "three") as ProactiveMode;
const { fx, later } = dotsDay();
const r = rig({ mode, fx, start: DOTS_START, present: true });
await r.settle();
const end = Date.parse("2026-11-14T12:00:00+08:00");
const STEP = 10 * 60_000;
const queue = [...later].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
while (r.clock.now() < end) {
  await r.advance(STEP, STEP);
  while (queue.length && Date.parse(queue[0]!.at) <= r.clock.now()) {
    const l = queue.shift()!;
    fx.mail.push({ ...l.mail, date: new Date(r.clock.now() + 1000).toISOString() });
    fx.triage[l.mail.id] = l.triage;
  }
}
const local = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const said: { at: number; kind: string; text: string }[] = [];
console.log(`mode ${mode}: what it said by itself, Wed 11-11 07:00 to Sat 11-14 12:00 (Asia/Shanghai)`);
for (const e of r.notes()) {
  const b = e.body;
  const fresh = b.revises ? (b.added ? b.finds.slice(-b.added) : []) : b.finds;
  if (!fresh.length) continue;
  for (const f of fresh) {
    said.push({ at: Date.parse(e.ts), kind: f.kind, text: f.text });
    console.log(`  ${local(e.ts)}  ${(b.revises ? "fold" : b.rung).padEnd(7)} ${f.kind.padEnd(15)} ${f.text}`);
  }
}
let miss = 0;
console.log("\nscore");
for (const w of DOTS_SAY) {
  const hit = said.find((s) => s.kind === w.kind && s.text.includes(w.contains));
  const late = hit && hit.at > Date.parse(w.by);
  if (!hit || late) miss++;
  console.log(`  ${!hit ? "MISSED" : late ? "LATE  " : "ok    "} ${w.kind} "${w.contains}" by ${local(w.by)}${hit ? ` (said ${local(new Date(hit.at).toISOString())})` : ""}`);
}
const alarms = said.filter((s) => DOTS_NEVER.some((n) => s.text.includes(n)));
for (const a of alarms) console.log(`  FALSE ALARM ${a.kind}: ${a.text}`);
console.log(`\n${DOTS_SAY.length - miss}/${DOTS_SAY.length} in time, ${alarms.length} false alarms, ${said.length} said in all, ${r.sent.length} notifications`);
r.stop();
process.exit(0);
