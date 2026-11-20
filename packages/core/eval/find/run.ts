// research/178: the hand-over's finder, before (0.1.1) and after (D428), on a pile shaped like the
// author's real one (pile.ts) and 28 sentences (sentences.ts).
//   bun packages/core/eval/find/run.ts                 code only (no model): before and after
//   bun packages/core/eval/find/run.ts --model haiku   with the cheapest model too (claude -p, no tools)
// Scored per sentence against the gold: the ticked set (what Go would hand over) and the shown set,
// micro-averaged over all sentences. The model is `claude -p --model <m>` with no tools, no MCP, no
// settings, no session; its scratch cwd is removed at the end.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createHandover } from "../../src/task-sources/handover.ts";
import { findBefore } from "./before.ts";
import { evalPile, ME, NOW, type EvalItem } from "./pile.ts";
import { SENTENCES, type Sentence } from "./sentences.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MODEL = arg("model");
const ONLY = arg("only");
const scratch = mkdtempSync(join(tmpdir(), "ducter-find-"));
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

const pile = evalPile();
const ask = MODEL ? async (p: string) => ({ text: await claude(p), tokens: 0 }) : undefined;

function handoverFor(lang: "zh" | "en", withModel: boolean) {
  const dir = join(scratch, `ho-${lang}-${withModel ? "m" : "c"}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return createHandover({
    dataDir: dir,
    pile: { all: () => pile, model: () => (withModel ? ask : undefined), sortedAt: () => "2026-11-20T08:10:03.969Z", subjects: () => [] } as never,
    now: () => NOW,
    lang: () => lang,
    name: () => "Ducter",
    me: () => ME,
    changed: () => {},
  } as never);
}

interface Score {
  id: string;
  gold: number;
  shown: number;
  shownHit: number;
  ticked: number;
  tickedHit: number;
  ok?: boolean;
  chips?: string[];
  subject?: string;
  unknown?: string[];
  note?: string;
  wrong?: string[];
  unticked?: string[];
}
const score = (s: Sentence, shown: string[], ticked: string[], extra: Partial<Score> = {}): Score => {
  const gold = new Set(pile.filter((p) => s.gold(p)).map((p) => p.item.ref));
  const short = (r: string) => r.replace(/^.*\/(?=[^/]+#)/, "");
  return { id: s.id, gold: gold.size, shown: shown.length, shownHit: shown.filter((r) => gold.has(r)).length, ticked: ticked.length, tickedHit: ticked.filter((r) => gold.has(r)).length, wrong: ticked.filter((r) => !gold.has(r)).slice(0, 12).map(short), unticked: [...gold].filter((r) => !ticked.includes(r)).slice(0, 12).map(short), ...extra };
};

async function runAll(fn: (s: Sentence) => Promise<Score>): Promise<Score[]> {
  const list = SENTENCES.filter((s) => !ONLY || ONLY.split(",").includes(s.id));
  const out: Score[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < list.length) {
        const k = next++;
        out[k] = await fn(list[k]!);
      }
    }),
  );
  return out;
}

const before = (withModel: boolean) =>
  runAll(async (s) => {
    const r = await findBefore(s.words, pile, s.lang, withModel && ask ? async (p) => (await ask(p)).text : undefined);
    return score(s, r.found, r.ticked, { ...(r.subject ? { subject: r.subject } : {}), ...(s.unknown ? { ok: false } : {}) });
  });
const after = (withModel: boolean) =>
  runAll(async (s) => {
    const ho = handoverFor(s.lang, withModel);
    const r = await ho.find({ words: s.words });
    const unknown = (r.said?.unknown ?? []).flatMap((u) => u.closest);
    return score(
      s,
      r.items.map((p) => p.item.ref),
      r.ticked,
      { chips: (r.said?.facets ?? []).map((f) => f.text), ...(r.found.subject ? { subject: r.found.subject } : {}), ...(r.said?.unknown?.length ? { unknown } : {}), ...(r.said?.note ? { note: r.said.note } : {}), ...(s.unknown ? { ok: r.ticked.length === 0 && unknown.includes(s.unknown) } : {}) },
    );
  });

const total = (xs: Score[]) => {
  const t = xs.reduce((a, x) => ({ gold: a.gold + x.gold, shown: a.shown + x.shown, shownHit: a.shownHit + x.shownHit, ticked: a.ticked + x.ticked, tickedHit: a.tickedHit + x.tickedHit }), { gold: 0, shown: 0, shownHit: 0, ticked: 0, tickedHit: 0 });
  const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 100);
  // Recall of the ticked set is against all the gold: the after side ticks at most TICK_MAX (10) a sentence by design, so its ceiling is below 100%.
  const reach = t.gold;
  return { ...t, tickedP: pct(t.tickedHit, t.ticked), tickedR: pct(t.tickedHit, reach), shownP: pct(t.shownHit, t.shown), shownR: pct(t.shownHit, t.gold), exact: xs.filter((x) => x.gold > 0 && x.tickedHit === Math.min(x.gold, 10) && x.ticked === x.tickedHit).length + xs.filter((x) => x.gold === 0 && x.ticked === 0).length };
};

const runs: Record<string, Score[]> = {};
runs["before-code"] = await before(false);
runs["after-code"] = await after(false);
if (MODEL) {
  runs[`before-${MODEL}`] = await before(true);
  runs[`after-${MODEL}`] = await after(true);
}

const lines: string[] = [];
lines.push(`| run | ticked P | ticked R | shown P | shown R | sentences exactly right |`, `|---|---|---|---|---|---|`);
for (const [k, xs] of Object.entries(runs)) {
  const t = total(xs);
  lines.push(`| ${k} | ${t.tickedP}% (${t.tickedHit}/${t.ticked}) | ${t.tickedR}% | ${t.shownP}% (${t.shownHit}/${t.shown}) | ${t.shownR}% (${t.shownHit}/${t.gold}) | ${t.exact}/${xs.length} |`);
}
lines.push("", "| sentence | gold | " + Object.keys(runs).map((k) => `${k} ticked/hit (shown)`).join(" | ") + " |", "|---|---|" + Object.keys(runs).map(() => "---").join("|") + "|");
for (let i = 0; i < runs["after-code"]!.length; i++) {
  const id = runs["after-code"]![i]!.id;
  lines.push(`| ${id} | ${runs["after-code"]![i]!.gold} | ` + Object.values(runs).map((xs) => `${xs[i]!.ticked}/${xs[i]!.tickedHit} (${xs[i]!.shown})`).join(" | ") + " |");
}
console.log(lines.join("\n"));
const last = runs[MODEL ? `after-${MODEL}` : "after-code"]!;
for (const x of last) console.log(`${x.id}: chips=${JSON.stringify(x.chips)} subject=${x.subject ?? ""}${x.unknown ? ` unknown→${x.unknown.join(",")}` : ""}${x.note ? ` note=${x.note}` : ""}${x.ok !== undefined ? ` ok=${x.ok}` : ""}`);
console.log(`model calls ${calls}, tokens ${tokens}`);

const outDir = join(import.meta.dir, "results");
mkdirSync(outDir, { recursive: true });
const name = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${MODEL ?? "code"}.json`;
writeFileSync(join(outDir, name), JSON.stringify({ model: MODEL ?? null, pile: pile.length, sentences: SENTENCES.length, calls, tokens, totals: Object.fromEntries(Object.entries(runs).map(([k, xs]) => [k, total(xs)])), runs }, null, 1) + "\n");
console.log(`wrote ${join(outDir, name)}`);
rmSync(scratch, { recursive: true, force: true });
const proj = join(homedir(), ".claude", "projects", scratch.replace(/[^A-Za-z0-9]/g, "-"));
if (existsSync(proj)) rmSync(proj, { recursive: true, force: true });
