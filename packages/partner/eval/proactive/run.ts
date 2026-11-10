// The triage-bar eval (D165 build step 3): bun packages/partner/eval/proactive/run.ts [--en]
// Prints, per scenario, what would be said, misses and false alarms, and per kind the totals, and
// how often the cap of 3 bites. Recorded triage and code's bar by default: no model, no network.
// A live run (the cheapest model for triage, the partner's model for the bar) needs a signed-in
// harness and is owed with the live trial (design/todo.md); the seams are runScenario's options.
import { SCENARIOS } from "./inboxes.ts";
import { perKind, runScenario } from "./bar.ts";

const zh = !process.argv.includes("--en");
const results = [];
for (const s of SCENARIOS) {
  const r = await runScenario(s, { zh });
  results.push(r);
  const ok = !r.misses.length && !r.falseAlarms.length && !r.urgentMissed.length;
  console.log(`${ok ? "ok  " : "FAIL"} ${s.name}: ${s.why}`);
  for (const x of r.said) console.log(`       ${x.urgent ? "now " : "    "}${x.kind}: ${x.text}`);
  for (const x of r.misses) console.log(`       missed ${x.kind} ("${x.contains}")`);
  for (const x of r.falseAlarms) console.log(`       false alarm ${x.kind}: ${x.text}`);
  if (r.overCap) console.log(`       ${r.overCap} over the cap of 3 (wait for the next morning)`);
}
console.log("\nper kind: said / missed / false alarms");
for (const k of perKind(results)) console.log(`  ${k.kind.padEnd(16)} ${k.said} / ${k.misses} / ${k.falseAlarms}`);
const bites = results.filter((r) => r.overCap > 0).length;
console.log(`\nthe cap of 3 bites on ${bites} of ${results.length} mornings`);
process.exit(results.some((r) => r.misses.length || r.falseAlarms.length || r.urgentMissed.length) ? 1 : 0);
