// research/199: the offers past the accounts (D458), measured. A synthetic week (corpus.ts) with
// planted good offers (g-*) among noise (n-*): code gathers the leads, the spotter picks among them,
// and the picks that pass code's checks are what the morning note would offer.
//   bun packages/core/eval/offers/run.ts                  code only: the leads, and code's joins
//   bun packages/core/eval/offers/run.ts --model haiku    the spotter on the cheapest model (claude -p, no tools)
// Scored over the planted goods: recall (good offered / planted), precision (good offered / offered),
// per source and per language (the spotter writes in zh, then in en). The model is `claude -p
// --model <m>` with no tools, no MCP, no settings and no session, in a scratch cwd removed at the end.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LangTag } from "@ducter/protocol";
import { codeCandidates, gatherLeads, LEADS_MAX, modelSpotter, spotsToCandidates, type Lead } from "../../src/proactive/wider.ts";


const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MODEL = arg("model");
// --set heldout: the week never tuned on (heldout.ts); default: the tuning week (corpus.ts).
const SET = arg("set") ?? "corpus";
const { corpus, fixtureOf, GOOD } = (await import(SET === "heldout" ? "./heldout.ts" : "./corpus.ts")) as typeof import("./corpus.ts");
const scratch = mkdtempSync(join(tmpdir(), "ducter-offers-"));
let tokens = 0;
let calls = 0;

async function claude(prompt: string): Promise<string> {
  calls++;
  for (let attempt = 0; attempt < 2; attempt++) {
    const proc = Bun.spawn(["claude", "-p", "--model", MODEL!, "--strict-mcp-config", "--setting-sources", "", "--tools", "", "--no-session-persistence", "--output-format", "json"], { cwd: scratch, stdin: new TextEncoder().encode(prompt), stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    try {
      const j = JSON.parse(out) as { result?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
      tokens += (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0);
      if (j.result) return j.result;
    } catch {
      /* try once more */
    }
  }
  throw new Error("claude -p gave no answer");
}

const good = new Set(GOOD);

interface Score {
  offered: number;
  hit: number;
  planted: number;
  precision: number;
  recall: number;
}
const score = (offered: string[], only?: string): Score => {
  const want = GOOD.filter((g) => !only || srcOf(g) === only);
  const off = offered.filter((o) => !only || srcOf(o) === only);
  const hit = off.filter((o) => good.has(o)).length;
  return { offered: off.length, hit, planted: want.length, precision: off.length ? hit / off.length : 1, recall: want.length ? hit / want.length : 1 };
};
const bySource = (offered: string[]) => ({ all: score(offered), task: score(offered, "task"), mem: score(offered, "mem"), talk: score(offered, "talk") });

const leads = await gatherLeads(corpus());
const srcMap = new Map(leads.map((l) => [fixtureOf(l.key) ?? "", l.src]));
const srcOf = (id: string) => srcMap.get(id) ?? "?";
const leadIds = leads.map((l) => fixtureOf(l.key) ?? `?${l.key}`);
const cut = [...leads].sort((a, b) => b.cost - a.cost).slice(0, LEADS_MAX);
console.log(`leads: ${leads.length} (${leadIds.join(", ")})`);
const gathered = bySource(leadIds);
console.log(`code's leads: recall ${(gathered.all.recall * 100).toFixed(0)}% (${gathered.all.hit}/${gathered.all.planted}), noise passed ${gathered.all.offered - gathered.all.hit}`);
const missed = GOOD.filter((g) => !leadIds.includes(g));
if (missed.length) console.log(`  not gathered: ${missed.join(", ")}`);

const runs: Record<string, unknown> = { leads: { ids: leadIds, ...gathered, missed } };
for (const lang of ["zh", "en"] as LangTag[]) {
  const code = codeCandidates(cut, lang).map((c) => fixtureOf(c.key.replace(/^wide:/, ""))!);
  runs[`code-${lang}`] = { offered: code, ...bySource(code) };
}
if (MODEL) {
  const spot = modelSpotter(async (p) => ({ text: await claude(p), tokens: 0 }));
  for (const lang of ["zh", "en"] as LangTag[]) {
    const r = await spot(cut, { lang, today: "2026-11-21" });
    const cands = spotsToCandidates(cut, r.spots, lang);
    const offered = cands.map((c) => fixtureOf(c.key.replace(/^wide:/, ""))!);
    const said = r.spots.filter((s) => s.offer).map((s) => cut.find((l: Lead) => l.id === s.id)).filter(Boolean).map((l) => fixtureOf(l!.key)!);
    // Why the model let each planted good one go (its own words), and what it said of the noise it kept.
    const whys = Object.fromEntries(r.spots.map((s) => [fixtureOf(cut.find((l: Lead) => l.id === s.id)?.key ?? "") ?? s.id, `${s.offer ? "offer" : "drop"}: ${s.why ?? ""}`]));
    for (const g of GOOD.filter((g) => !said.includes(g))) console.log(`  ${g} ${whys[g] ?? "(no answer)"}`);
    const s = bySource(offered);
    console.log(`${MODEL} ${lang}: precision ${(s.all.precision * 100).toFixed(0)}% (${s.all.hit}/${s.all.offered}), recall ${(s.all.recall * 100).toFixed(0)}% (${s.all.hit}/${s.all.planted}); task ${s.task.hit}/${s.task.planted}, mem ${s.mem.hit}/${s.mem.planted}, talk ${s.talk.hit}/${s.talk.planted}`);
    const wrong = offered.filter((o) => !good.has(o));
    const lost = GOOD.filter((g) => !offered.includes(g));
    if (wrong.length) console.log(`  offered noise: ${wrong.join(", ")}`);
    if (lost.length) console.log(`  missed: ${lost.join(", ")}`);
    const dropped = said.filter((x) => !offered.includes(x));
    if (dropped.length) console.log(`  offered by the model but failed code's checks: ${dropped.join(", ")}`);
    runs[`${MODEL}-${lang}`] = { offered, wrong, lost, dropped, ...s, lines: cands.map((c) => ({ id: fixtureOf(c.key.replace(/^wide:/, "")), text: c.words.zh, go: c.step?.goLabel.zh, origin: lang === "zh" ? c.origin?.zh : c.origin?.en })) };
  }
}
rmSync(scratch, { recursive: true, force: true });
const outDir = join(import.meta.dir, "results");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
const name = `${stamp}-${MODEL ?? "code"}${SET === "heldout" ? "-heldout" : ""}.json`;
writeFileSync(join(outDir, name), JSON.stringify({ model: MODEL ?? null, set: SET, leads: leads.length, planted: GOOD.length, calls, tokens, runs }, null, 1) + "\n");
console.log(`results/${name} (${calls} calls, ${tokens} tokens)`);
