// The long-conversation memory eval with real models:
//   bun packages/partner/eval/memory/run.ts [--writer sonnet] [--answerer haiku] [--conditions full,window,spine]
//     [--only v1,s1] [--concurrency 4] [--label x] [--oracle-writer]
//
// 1. The corpus (corpus.ts) goes into a real Log in a scratch dir.
// 2. The spine closes its parts and a REAL model writes each digest through the partner's own
//    plumbing (createHarnessWriter over OAR, Claude Code, tool-less); the audit gates every freeze.
// 3. Each probe (probes.ts, 11 types) is asked once per condition, one question per call (research/15
//    found batching hurts retrieval): full transcript / verbatim window only / the spine
//    (digests + ledger + window). Every condition has the same search tool over the whole Log
//    (two rounds at most). Answers are graded by rule (lib.ts grade): accuracy, false memory
//    (a trap answered, or a cited line that doesn't exist), stale assertions.
// 4. A report goes to packages/partner/eval/results/<date>-memory-<label>.md, with the home
//    directory written as /Users/me and the scratch dir as <scratch>.
//
// Safety: no tools for any model; `claude -p --no-session-persistence` for answers; the writer's
// ~/.claude/projects folders (named after the scratch dir, "ducter-eval-mem-") are deleted at the end.
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOarHarnessPort } from "../../../runner/src/index.ts";
import { renderDigest } from "../../src/spine/digest.ts";
import { createHarnessWriter } from "../../src/spine/writer.ts";
import { buildWorld, CONDITIONS, contextFor, EVAL_CUT, EVAL_EPOCH, fakeReport, grade, oracleWriter, probes, runSpine, searchLines, summarize, TYPES, type Condition, type Graded } from "./lib.ts";

const argv = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const WRITER = arg("writer", "sonnet")!;
const ANSWERER = arg("answerer", "haiku")!;
const CONDS = (arg("conditions")?.split(",") ?? CONDITIONS) as Condition[];
const ONLY = arg("only")?.split(",");
const CONC = Number(arg("concurrency", "4"));
const LABEL = arg("label", ANSWERER)!;
const ORACLE = argv.includes("--oracle-writer");
const HOME = homedir();

const SYSTEM =
  "You are Ducter, the user's AI partner. The user asks about your shared conversation. Answer from what you are given; you may search the full conversation log. Never guess: if the conversation never covered it, say so plainly. Answer with one JSON object and nothing else.";

function prompt(background: string, q: string, results?: string): string {
  return [
    "<background>",
    background,
    "</background>",
    "",
    `The user asks: ${q}`,
    "",
    results ? `<search_results>\n${results}\n</search_results>\n` : "",
    results
      ? 'Now answer: {"answer": "<in the user\'s language, at most 3 sentences>", "cites": [<#seq numbers of the lines that support it>]}. If neither the background nor the results show it, say it never came up.'
      : 'If the background answers it: {"answer": "<in the user\'s language, at most 3 sentences>", "cites": [<#seq numbers of the lines that support it>]}. If you need to look it up: {"search": ["<1 to 3 queries, with the distinctive words the user likely used, in their language>"]}. If the conversation never covered it, say so in the answer.',
  ].join("\n");
}

let cost = 0;
async function ask(text: string, cwd: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const proc = Bun.spawn(["claude", "-p", text, "--model", ANSWERER, "--system-prompt", SYSTEM, "--strict-mcp-config", "--setting-sources", "", "--tools", "", "--no-session-persistence", "--output-format", "json"], { cwd, stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    try {
      const j = JSON.parse(out) as { result: string; total_cost_usd?: number };
      cost += j.total_cost_usd ?? 0;
      return j.result;
    } catch {
      /* retry once */
    }
  }
  return "";
}
const parse = (s: string): { answer?: string; cites?: number[]; search?: string[] } => {
  const m = /\{[\s\S]*\}/.exec(s);
  try {
    return m ? JSON.parse(m[0]) : { answer: s };
  } catch {
    return { answer: s };
  }
};

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

async function main() {
  const projects = join(HOME, ".claude", "projects");
  const before = new Set(existsSync(projects) ? readdirSync(projects) : []);
  const scratch = realpathSync(mkdtempSync(join(process.env.DUCTER_EVAL_DIR ?? tmpdir(), "ducter-eval-mem-")));
  const scrub = (s: string) => s.replaceAll(scratch, "<scratch>").replaceAll(HOME, "/Users/me");
  const t0 = Date.now();
  try {
    const w = buildWorld(scratch);
    const port = createOarHarnessPort({ dataDir: scratch });
    const writer = ORACLE ? oracleWriter(w) : createHarnessWriter({ harness: () => port, pick: () => ({ harness: "claude-code", model: WRITER }), dataDir: scratch, model: WRITER });
    console.log(`memory eval · writer ${writer.name} · answerer ${ANSWERER} · conditions ${CONDS.join(",")}`);
    const spine = await runSpine(w, writer);
    const tries = w.log.spine.attempts(500);
    const fake = fakeReport(w, spine);
    console.log(`digests: ${fake.digests.segments} segments, ${fake.digests.epochs} epochs, degraded ${fake.digests.degraded}, rewrites ${spine.stats.rewrites}, repaired ${spine.stats.repaired}; ${(Date.now() - t0) / 1000}s`);
    const head = w.log.head();
    const rows: Graded[] = [];
    const list = probes.filter((p) => !ONLY || ONLY.includes(p.id));
    const jobs = CONDS.flatMap((c) => list.map((p) => ({ c, p })));
    const bg = Object.fromEntries(CONDS.map((c) => [c, contextFor(w, spine, c)])) as Record<Condition, string>;
    await pool(jobs, CONC, async ({ c, p }) => {
      let r = parse(await ask(prompt(bg[c], p.q), scratch));
      const searches: string[] = [];
      for (let round = 0; round < 2 && r.search?.length; round++) {
        const qs = r.search.slice(0, 3).map(String);
        searches.push(...qs);
        const res = qs.map((q) => `query: ${q}\n${searchLines(w, q).join("\n") || "(no results)"}`).join("\n\n");
        r = parse(await ask(prompt(bg[c], p.q, res), scratch));
      }
      const answer = String(r.answer ?? "");
      const cites = (Array.isArray(r.cites) ? r.cites : []).map((x) => Number(String(x).replace(/^#/, "")));
      const g = grade(p, answer, cites, head);
      rows.push({ probe: p, cond: c, answer, cites, searches, ...g });
      console.log(`${g.label.padEnd(12)} ${c.padEnd(6)} ${p.id.padEnd(3)} ${answer.replace(/\s+/g, " ").slice(0, 90)}`);
    });
    const sum = summarize(rows);
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const md: string[] = [];
    md.push(`# Memory eval: ${LABEL} (${new Date().toISOString().slice(0, 10)})`, "");
    md.push(`Writer: ${writer.name} via createHarnessWriter (Claude Code over OAR, tool-less). Answerer: ${ANSWERER} (\`claude -p\`, no tools, no session). One question per call; search over the whole Log, at most two rounds.`);
    md.push(`Corpus: packages/partner/eval/memory/corpus.ts (${w.log.read({ stream: "channel", fromSeq: 1, limit: 10000 }).length} channel events, ≈${fake.sizes.full} tokens). Budgets scaled ≈50× down: hi ${EVAL_CUT.hiTokens}, lo ${EVAL_CUT.loTokens}, min ${EVAL_CUT.minTokens}; epoch after ${EVAL_EPOCH.after} segments, ${EVAL_EPOCH.size} per epoch. Graded by rule (lib.ts \`grade\`), no model judge.`, "");
    md.push("## Digests", "");
    md.push(`${fake.digests.segments} segments, ${fake.digests.epochs} epoch(s); degraded ${fake.digests.degraded}; rewrites ${spine.stats.rewrites}; repaired by removal ${spine.stats.repaired}; writer errors ${spine.stats.infraFailures}. Source ≈${fake.digests.srcTokens} tokens, digests as shown ≈${fake.digests.digestTokens} tokens.`, "");
    md.push("| try | range | n | ok | writer | reasons |", "|---|---|---|---|---|---|");
    for (const t of tries) md.push(`| | #${t.fromSeq}–#${t.toSeq} | ${t.n} | ${t.ok ? "yes" : "no"} | ${t.writer} | ${scrub(t.reasons.join("; ")).replace(/\|/g, "/").slice(0, 300)} |`);
    md.push("", `Context sizes (tokens, est.): ${CONDS.map((c) => `${c} ${fake.sizes[c]}`).join(" · ")}`, "");
    md.push("## Results", "");
    md.push(`| condition | accuracy | false memory | stale assertion | abstain | searched | n |`, "|---|---|---|---|---|---|---|");
    for (const c of CONDS) {
      const s = sum[c];
      if (s) md.push(`| ${c} | ${s.acc.toFixed(2)} | ${pct(s.falseMemory)} | ${pct(s.staleRate)} | ${pct(s.abstain)} | ${pct(s.searched)} | ${s.n} |`);
    }
    md.push("", `| type | ${CONDS.join(" | ")} |`, `|---|${CONDS.map(() => "---").join("|")}|`);
    for (const t of TYPES) md.push(`| ${t} | ${CONDS.map((c) => (sum[c]?.byType[t] ?? NaN).toFixed(2)).join(" | ")} |`);
    md.push("", `Fake checks on the same spine: reachable ${CONDS.map((c) => `${c} ${fake.reach[c].reachable}/${fake.reach[c].n}`).join(", ")}; replaced decisions still in force ${fake.stale.stillInForce}/${fake.stale.replaced}; open obligations found ${fake.obligations.found.length}/${fake.obligations.expected.length}; inexact anchors ${fake.falseMemory.badAnchors}/${fake.falseMemory.anchors}; pre-turn recall precision ${fake.recall.precise}/${fake.recall.admitted} admitted hits on ${fake.recall.fired} intent questions.`);
    md.push("", `Answer cost: $${cost.toFixed(3)} (writer cost not metered here). Wall time ${Math.round((Date.now() - t0) / 1000)}s.`, "");
    md.push("## Non-correct answers", "");
    for (const r of rows.filter((r) => r.label !== "correct").sort((a, b) => a.probe.id.localeCompare(b.probe.id) || a.cond.localeCompare(b.cond)))
      md.push(`- **${r.probe.id}** (${r.probe.type}, ${r.cond}) ${r.label}${r.searches.length ? ` · searched: ${r.searches.join(" / ")}` : ""}: ${scrub(r.answer).replace(/\s+/g, " ").slice(0, 240)}`);
    md.push("", "## The spine the answerer saw", "", "```", scrub(spine.digests().map(renderDigest).join("\n\n")), "```");
    const file = resolve(import.meta.dir, "..", "results", `${new Date().toISOString().slice(0, 10)}-memory-${LABEL}.md`);
    writeFileSync(file, md.join("\n") + "\n");
    console.log(`\n${CONDS.map((c) => (sum[c] ? `${c}: acc ${sum[c]!.acc.toFixed(2)} · false memory ${pct(sum[c]!.falseMemory)} · stale ${pct(sum[c]!.staleRate)}` : "")).join("\n")}\nwrote ${file.replace(HOME, "~")}`);
  } finally {
    let removed = 0;
    if (existsSync(projects))
      for (const d of readdirSync(projects))
        if (!before.has(d) && d.includes("ducter-eval-mem-")) (rmSync(join(projects, d), { recursive: true, force: true }), removed++);
    rmSync(scratch, { recursive: true, force: true });
    console.log(`cleaned ${removed} ~/.claude/projects folder(s) and the scratch dir`);
  }
}

await main();
