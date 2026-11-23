// D502: cross-source findings, measured. Each fixture (fixtures.ts) is a home's open facts; the
// hand-written detectors (detect.ts) run on it, and with --model the cheapest model's shadow pass
// (cross.ts: the same prompt and code's guards as the home). Scored over the planted conflicts:
//   recall    planted conflicts a kept finding cites (all of `all`, one of `any`) ÷ planted
//   precision kept findings that match a planted conflict ÷ kept findings (a second finding on the
//             same conflict counts as neither)
// and for the detectors the same recall, with their mismatch claims on fine ledgers as false.
//   bun run eval:findings                    the detectors only
//   bun run eval:findings --model haiku      and the model (claude -p, no tools), in --lang en|zh|both (default both)
// The model is `claude -p --model <m>` with no tools, no MCP, no settings and no session, in a
// scratch cwd removed at the end. Results go to results/<stamp>-<model>.json and LATEST.json.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LangTag } from "@ducter/protocol";
import { crossFacts, guardFindings, modelCross } from "../../src/proactive/cross.ts";
import { detect } from "../../src/proactive/detect.ts";
import type { Fact, FactType, Ledger } from "../../src/proactive/ledger.ts";
import { fixtures, NOW, TODAY, ZONE, type Expect, type Fixture } from "./fixtures.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MODEL = arg("model");
const LANGS: LangTag[] = arg("lang") === "en" ? ["en"] : arg("lang") === "zh" ? ["zh"] : ["en", "zh"];
const scratch = mkdtempSync(join(tmpdir(), "ducter-findings-"));
let tokens = 0;
let calls = 0;

async function claude(prompt: string): Promise<string> {
  calls++;
  for (let attempt = 0; attempt < 2; attempt++) {
    const proc = Bun.spawn(["claude", "-p", "--model", MODEL!, "--strict-mcp-config", "--setting-sources", "", "--tools", "", "--no-session-persistence", "--output-format", "json", "--system-prompt", "You answer with one JSON array and nothing else. You never use tools."], { cwd: scratch, stdin: new TextEncoder().encode(prompt), stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    try {
      const j = JSON.parse(out) as { result?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
      tokens += (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0);
      if (typeof j.result === "string") return j.result;
    } catch {
      /* try once more */
    }
  }
  throw new Error("claude -p gave no answer");
}

const memLedger = (facts: Fact[]): Ledger => ({
  add: () => [],
  all: (type?: FactType) => (type ? facts.filter((f) => f.type === type) : [...facts]),
  of: <T extends FactType>(type: T) => facts.filter((f) => f.type === type) as Extract<Fact, { type: T }>[],
  sweep: () => 0,
  drop: () => 0,
  size: () => facts.length,
});

const matches = (cited: string[], e: Expect) => e.all.every((id) => cited.includes(id)) && (!e.any || e.any.some((id) => cited.includes(id)));
const HEADS_UP = new Set(["coming_up", "meeting"]);

interface Tally {
  planted: number;
  found: number;
  kept: number;
  right: number;
  wrong: number;
}
const zero = (): Tally => ({ planted: 0, found: 0, kept: 0, right: 0, wrong: 0 });
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");
const groupOf = (id: string) => id.split("-")[0]!;

const all = fixtures();
const ctx = { now: NOW, zone: ZONE };

// ---------- the detectors ----------
const det = zero();
const detRows: Record<string, { found: string[]; claims: string[] }> = {};
for (const f of all) {
  const cands = detect(memLedger(f.facts), ctx).filter((c) => !HEADS_UP.has(c.kind));
  const found = f.expect.filter((e) => cands.some((c) => matches(c.facts, e)));
  const claims = cands.filter((c) => c.kind === "mismatch" || c.kind === "plan_changed");
  det.planted += f.expect.length;
  det.found += found.length;
  if (!f.expect.length) det.wrong += claims.length;
  detRows[f.id] = { found: found.map((e) => e.what), claims: claims.map((c) => `${c.kind}: ${c.words.en}`) };
}
console.log(`detectors: recall ${pct(det.found, det.planted)} (${det.found}/${det.planted}), conflict claims on fine ledgers ${det.wrong}`);
for (const f of all) if (f.expect.length && !detRows[f.id]!.found.length) console.log(`  detectors miss ${f.id}`);

const runs: Record<string, unknown> = { detectors: { ...det, rows: detRows } };

// ---------- the model ----------
if (MODEL) {
  const ask = modelCross(async (p) => ({ text: await claude(p), tokens: 0 }));
  for (const lang of LANGS) {
    const t = zero();
    const byGroup: Record<string, Tally> = {};
    const rows: Record<string, unknown> = {};
    let unknown = 0;
    for (const f of all as Fixture[]) {
      const shown = crossFacts(f.facts, NOW);
      const r = await ask(shown, { lang, today: TODAY, zone: ZONE });
      const g = guardFindings(r.findings, shown);
      unknown += g.dropped.find((d) => d.why === "unknown_fact")?.n ?? 0;
      const hit = new Set<number>();
      let right = 0;
      let wrong = 0;
      for (const k of g.kept) {
        const i = f.expect.findIndex((e) => matches(k.facts, e));
        if (i < 0) wrong++;
        else if (!hit.has(i)) (hit.add(i), right++);
      }
      const tally = (byGroup[groupOf(f.id)] ??= zero());
      for (const x of [t, tally]) {
        x.planted += f.expect.length;
        x.found += hit.size;
        x.kept += g.kept.length;
        x.right += right;
        x.wrong += wrong;
      }
      const mark = f.expect.length ? (hit.size === f.expect.length ? "found" : "MISSED") : wrong ? "FALSE" : "quiet";
      console.log(`  ${lang} ${f.id}: ${mark}${g.kept.length ? ` (${g.kept.length} kept)` : ""}${g.dropped.length ? `, dropped ${g.dropped.map((d) => `${d.why} ${d.n}`).join(" ")}` : ""}`);
      for (const k of g.kept) if (!f.expect.some((e) => matches(k.facts, e))) console.log(`      not planted (${k.confidence}): ${k.text}`);
      rows[f.id] = { mark, kept: g.kept.map((k) => ({ text: k.text, why: k.why, next: k.next, confidence: k.confidence, planted: f.expect.some((e) => matches(k.facts, e)) })), dropped: g.dropped };
    }
    const precision = t.kept ? t.right / t.kept : 1;
    const recall = t.planted ? t.found / t.planted : 1;
    console.log(`${MODEL} ${lang}: recall ${pct(t.found, t.planted)} (${t.found}/${t.planted}), precision ${pct(t.right, t.kept)} (${t.right}/${t.kept}), false findings ${t.wrong} (on fine/noise ledgers ${(byGroup.f?.wrong ?? 0) + (byGroup.n?.wrong ?? 0)}), made-up ids dropped ${unknown}`);
    runs[`${MODEL}-${lang}`] = { ...t, precision, recall, byGroup, unknownDropped: unknown, rows };
  }
}

rmSync(scratch, { recursive: true, force: true });
const outDir = join(import.meta.dir, "results");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
const name = `${stamp}-${MODEL ?? "detectors"}.json`;
const body = JSON.stringify({ model: MODEL ?? null, fixtures: all.length, planted: all.reduce((n, f) => n + f.expect.length, 0), calls, tokens, runs }, null, 1) + "\n";
writeFileSync(join(outDir, name), body);
if (MODEL) writeFileSync(join(outDir, "LATEST.json"), body);
console.log(`results/${name} (${calls} calls, ${tokens} tokens)`);
