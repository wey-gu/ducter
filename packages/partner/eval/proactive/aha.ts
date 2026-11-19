// D388 (research/154): the aha days, replayed through the whole proactive engine (fake clock, fake
// accounts, recorded triage, code's bar, a fake web look): what Ducter says by itself, when, and
// what it never says. bun packages/partner/eval/proactive/aha.ts [three|urgent|useful] [--no-web] [--waiting]
// Prints the timeline with each find's sources, then the score against AHA_SAY / AHA_NEVER and
// the answer to "how did you know?" for the plan. --waiting (D402, research/164) adds hel's eleven
// waiting-for-your-reply mails, rebuilt, and scores them: said, with a draft, false positives.
// No model, no network.
import type { ProactiveMode } from "../../../protocol/src/index.ts";
import { hit, runAha } from "../../../core/test/aha-run.ts";
import { AHA_NEVER, AHA_SAY } from "../../../core/test/fixtures/aha-days.ts";
import { WAITING_CASES, WAITING_DRAFTS } from "../../../core/test/fixtures/waiting-days.ts";
import { recordedDrafter } from "../../../core/src/proactive/reply.ts";

const mode = (process.argv.find((a) => ["three", "urgent", "useful"].includes(a)) ?? "three") as ProactiveMode;
const web = process.argv.includes("--no-web") ? "off" : "found";
const waiting = process.argv.includes("--waiting");
const { r, said, look } = await runAha(mode, { web, waiting, ...(waiting ? { rig: { drafter: recordedDrafter(WAITING_DRAFTS) } } : {}) });
const local = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
console.log(`mode ${mode}${web === "off" ? ", no web look" : ""}${waiting ? ", with hel's waiting mails" : ""}: what it said by itself, ${waiting ? "Mon 11-09" : "Wed 11-18"} 07:00 to Fri 11-20 12:00 (Asia/Shanghai)`);
const notes = new Map<string, number>();
for (const s of said) notes.set(s.noteId, (notes.get(s.noteId) ?? 0) + 1);
for (const s of said) {
  console.log(`  ${local(s.at)}  ${s.rung.padEnd(7)} ${s.kind.padEnd(10)} ${s.text}${(notes.get(s.noteId) ?? 0) > 1 ? "  [one message]" : ""}`);
  for (const h of s.how) console.log(`  ${" ".repeat(26)}${(h.src ?? "").padEnd(9)} ${h.what}${h.says ? ` → ${h.says}` : ""}${h.url ? ` <${h.url}>` : ""}`);
  if (s.unknown) console.log(`  ${" ".repeat(26)}not known yet: ${s.unknown}`);
  if (s.draft) console.log(`  ${" ".repeat(26)}draft (${s.draft.lang ?? "?"}): ${s.draft.text}`);
}
let miss = 0;
console.log("\nscore");
for (const w of AHA_SAY) {
  const h = hit(said, w);
  const late = h && h.at > Date.parse(w.by);
  if (!h || late) miss++;
  console.log(`  ${!h ? "MISSED" : late ? "LATE  " : "ok    "} ${w.case.padEnd(22)} by ${local(Date.parse(w.by))}${h ? ` (said ${local(h.at)})` : ""}`);
}
const alarms = said.filter((s) => AHA_NEVER.some((n) => s.text.includes(n)));
for (const a of alarms) console.log(`  FALSE ALARM ${a.kind}: ${a.text}`);
let wFalse = 0;
if (waiting) {
  const waits = said.filter((s) => s.kind === "waiting_on_you");
  console.log("\nwaiting for your reply (hel's eleven, rebuilt)");
  let saidWorth = 0;
  let drafted = 0;
  for (const c of WAITING_CASES) {
    const s = waits.find((x) => x.text.includes(c.name));
    if (s && c.worth) saidWorth++;
    if (s && !c.worth) wFalse++;
    if (s?.draft) drafted++;
    console.log(`  ${c.worth ? "worth " : "silent"} ${c.id.padEnd(9)} ${s ? `said ${local(s.at)} ${s.rung}${s.draft ? `, draft in ${s.draft.lang}` : ", no draft"}` : "not said"}${(s && !c.worth) || (!s && c.worth) ? "  <-" : ""}`);
  }
  const worth = WAITING_CASES.filter((c) => c.worth).length;
  console.log(`  ${waits.length} waiting finds said (${waits.filter((s) => s.rung === "now").length} on "now"), ${saidWorth}/${worth} worth ones said, ${drafted} with a draft, ${wFalse} false positives`);
}
console.log(`\n${AHA_SAY.length - miss}/${AHA_SAY.length} in time, ${alarms.length} false alarms, ${said.length} said in ${notes.size} messages, ${r.sent.length} notifications, ${look?.asked.length ?? 0} web looks`);
const agi = r.p.noticed().items.filter((i) => i.why && /AGI Bar/.test(i.text));
if (agi.length) {
  console.log('\n"你怎么知道我要去的？" (noticed → why, composed by code)');
  for (const i of agi) console.log(`  ${i.kind}: ${i.why}`);
}
r.stop();
process.exit(miss || alarms.length || wFalse ? 1 : 0);
