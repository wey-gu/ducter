// D487: compare two sides of an A/B (main against a branch) over several runs each, as written by
// run.ts (`results/*.md`). One run of a haiku partner flips about 40 of 264 cases against the next
// run of the same code (D478), so a total alone can't say which side is better. This says, over the
// cases both sides ran: each side's totals and mean; which cases flip within a side (high variance:
// no conclusion from them); which pass on every run of one side and fail on every run of the other
// (the real signal); and a two-sided sign test over the cases whose pass rates differ.
//
//   bun run eval:compare --a results/x-main-1.md results/x-main-2.md --b results/x-branch-1.md results/x-branch-2.md
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type Verdicts = Map<string, boolean>;

/** The scenario rows of one run: `| id | lang | pass |` or `| id | lang | **fail** |`. */
export function parseRun(md: string): Verdicts {
  const out: Verdicts = new Map();
  for (const line of md.split("\n")) {
    const m = /^\| ([a-z0-9][\w.-]*) \| [\w-]+ \| (pass|\*\*fail\*\*) \|/.exec(line);
    if (m) out.set(m[1]!, m[2] === "pass");
  }
  return out;
}

/** P(at least this lopsided) under no difference: two-sided binomial at 1/2. */
export function signTest(wins: number, losses: number): number {
  const n = wins + losses;
  if (!n) return 1;
  const k = Math.min(wins, losses);
  let p = 0;
  let c = 1; // C(n, 0)
  for (let i = 0; i <= k; i++) {
    p += c;
    c = (c * (n - i)) / (i + 1);
  }
  return Math.min(1, (2 * p) / 2 ** n);
}

export interface Side {
  runs: Verdicts[];
}
export interface Comparison {
  cases: string[];
  totals: { a: number[]; b: number[] };
  flaky: { a: string[]; b: string[] };
  steadyWins: string[]; // pass on every b run, fail on every a run
  steadyLosses: string[];
  better: string[]; // b's pass rate higher
  worse: string[];
  p: number;
}

export function compare(a: Side, b: Side, keep: (id: string) => boolean = () => true): Comparison {
  const all = [...a.runs, ...b.runs];
  const cases = [...all[0]!.keys()].filter((id) => keep(id) && all.every((r) => r.has(id))).sort();
  const rate = (s: Side, id: string) => s.runs.filter((r) => r.get(id)).length / s.runs.length;
  const total = (r: Verdicts) => cases.filter((id) => r.get(id)).length;
  const flaky = (s: Side) => cases.filter((id) => rate(s, id) > 0 && rate(s, id) < 1);
  const better = cases.filter((id) => rate(b, id) > rate(a, id));
  const worse = cases.filter((id) => rate(b, id) < rate(a, id));
  return {
    cases,
    totals: { a: a.runs.map(total), b: b.runs.map(total) },
    flaky: { a: flaky(a), b: flaky(b) },
    steadyWins: cases.filter((id) => rate(b, id) === 1 && rate(a, id) === 0),
    steadyLosses: cases.filter((id) => rate(b, id) === 0 && rate(a, id) === 1),
    better,
    worse,
    p: signTest(better.length, worse.length),
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function report(name: string, c: Comparison): string {
  const n = c.cases.length;
  return [
    `## ${name} (${n} cases both sides ran)`,
    "",
    `| | runs | mean | within-side flips |`,
    `|---|---|---|---|`,
    `| a | ${c.totals.a.join(", ")} | ${mean(c.totals.a).toFixed(1)} | ${c.flaky.a.length} |`,
    `| b | ${c.totals.b.join(", ")} | ${mean(c.totals.b).toFixed(1)} | ${c.flaky.b.length} |`,
    "",
    `- b passes more often: ${c.better.length}; less often: ${c.worse.length}; sign test p = ${c.p.toFixed(3)}`,
    `- every b run passes, every a run fails: ${c.steadyWins.join(", ") || "none"}`,
    `- every a run passes, every b run fails: ${c.steadyLosses.join(", ") || "none"}`,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const side = (flag: string) => {
    const i = argv.indexOf(flag);
    const out: string[] = [];
    for (let j = i + 1; i >= 0 && j < argv.length && !argv[j]!.startsWith("--"); j++) out.push(argv[j]!);
    return out;
  };
  const af = side("--a");
  const bf = side("--b");
  if (!af.length || !bf.length) {
    console.error("usage: compare.ts --a <run.md>… --b <run.md>…");
    process.exit(2);
  }
  const load = (fs: string[]): Side => ({ runs: fs.map((f) => parseRun(readFileSync(f, "utf8"))) });
  const a = load(af);
  const b = load(bf);
  console.log(`# A/B: a = ${af.map((f) => basename(f)).join(", ")}; b = ${bf.map((f) => basename(f)).join(", ")}\n`);
  const puzzle = (id: string) => id.startsWith("wp-");
  console.log(report("Without the world puzzles", compare(a, b, (id) => !puzzle(id))));
  console.log(report("World puzzles", compare(a, b, puzzle)));
}
