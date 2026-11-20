// research/186: another AI's one look (D437) on task results with known defects and clean ones.
//   bun packages/core/eval/second-look/run.ts --model haiku [--runs 2] [--only <id>]
// The look is exactly what Ducter sends (lookPrompt, then parseLook); the check of a fix is
// checkPrompt / parseCheck on the case's fixed and unfixed next result. The model is
// `claude -p --model <m>` with no tools, no MCP, no settings, no session; its scratch cwd is
// removed at the end. Scored: defects caught (a finding that names the seeded one), false alarms
// (any finding on a clean result), other findings on a defect case (read by hand: noise or real),
// and the check's verdicts.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPrompt, lookPrompt, parseCheck, parseLook } from "../../src/second-look.ts";
import { CASES, type LookCase } from "./cases.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MODEL = arg("model") ?? "haiku";
const RUNS = Number(arg("runs") ?? 1);
const ONLY = arg("only");
const scratch = mkdtempSync(join(tmpdir(), "ducter-look-"));
let tokens = 0;
let calls = 0;
let ms = 0;

async function claude(prompt: string): Promise<string> {
  calls++;
  const t0 = performance.now();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const proc = Bun.spawn(["claude", "-p", "--model", MODEL, "--strict-mcp-config", "--setting-sources", "", "--tools", "", "--no-session-persistence", "--output-format", "json", "--system-prompt", "You answer with one line of JSON and nothing else. You never use tools."], { cwd: scratch, stdin: new TextEncoder().encode(prompt), stdout: "pipe", stderr: "pipe" });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      try {
        const j = JSON.parse(out) as { result?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
        tokens += (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0);
        if (j.result) return j.result;
      } catch {
        /* once more */
      }
    }
    throw new Error("claude -p gave no answer");
  } finally {
    ms += performance.now() - t0;
  }
}

interface Row {
  id: string;
  run: number;
  kind: LookCase["kind"];
  defect: boolean;
  found: string[];
  caught?: boolean;
  others?: string[];
  falseAlarm?: boolean;
  error?: string;
  check?: { fixedLeft: string[]; unfixedLeft: string[]; ok: boolean };
}

const cases = CASES.filter((c) => !ONLY || c.id === ONLY);
const rows: Row[] = [];
for (let run = 1; run <= RUNS; run++) {
  await Promise.all(
    cases.map(async (c) => {
      const row: Row = { id: c.id, run, kind: c.kind, defect: !!c.defect, found: [] };
      try {
        row.found = parseLook(await claude(lookPrompt({ asked: c.asked, ...(c.told ? { told: c.told } : {}), summary: c.summary, ...(c.sends ? { sends: c.sends } : {}), ...(c.diff ? { diff: c.diff } : {}), lang: c.lang })));
      } catch (err) {
        row.error = (err as Error).message;
      }
      if (c.defect) {
        row.caught = row.found.some((f) => c.defect!.match.test(f));
        row.others = row.found.filter((f) => !c.defect!.match.test(f));
      } else row.falseAlarm = row.found.length > 0;
      if (c.defect && c.fixed && c.unfixed) {
        const found = [c.defect.what];
        const left = async (next: NonNullable<LookCase["fixed"]>) => {
          try {
            return parseCheck(await claude(checkPrompt({ asked: c.asked, summary: next.summary, ...(next.sends ? { sends: next.sends } : {}), ...(next.diff ? { diff: next.diff } : {}), lang: c.lang, found })), found);
          } catch {
            return ["(no answer)"];
          }
        };
        const [fixedLeft, unfixedLeft] = await Promise.all([left(c.fixed), left(c.unfixed)]);
        row.check = { fixedLeft, unfixedLeft, ok: fixedLeft.length === 0 && unfixedLeft.length === 1 };
      }
      rows.push(row);
      const mark = c.defect ? (row.caught ? "caught" : "MISSED") : row.falseAlarm ? "FALSE ALARM" : "quiet";
      console.log(`${run} ${c.id.padEnd(32)} ${mark.padEnd(12)} ${row.error ? `error: ${row.error}` : JSON.stringify(row.found)}${row.check ? `  check ${row.check.ok ? "ok" : `WRONG ${JSON.stringify(row.check)}`}` : ""}`);
    }),
  );
}

const defect = rows.filter((r) => r.defect);
const clean = rows.filter((r) => !r.defect);
const checks = rows.filter((r) => r.check);
const by = (k: LookCase["kind"]) => {
  const d = defect.filter((r) => r.kind === k);
  const c = clean.filter((r) => r.kind === k);
  return { caught: d.filter((r) => r.caught).length, defects: d.length, falseAlarms: c.filter((r) => r.falseAlarm).length, clean: c.length };
};
const summary = {
  model: MODEL,
  runs: RUNS,
  at: new Date().toISOString(),
  cases: cases.length,
  defectCases: cases.filter((c) => c.defect).length,
  cleanCases: cases.filter((c) => !c.defect).length,
  caught: defect.filter((r) => r.caught).length,
  defects: defect.length,
  falseAlarms: clean.filter((r) => r.falseAlarm).length,
  clean: clean.length,
  otherFindingsOnDefects: defect.reduce((n, r) => n + (r.others?.length ?? 0), 0),
  errors: rows.filter((r) => r.error).length,
  checksRight: checks.filter((r) => r.check!.ok).length,
  checks: checks.length,
  code: by("code"),
  outward: by("outward"),
  calls,
  tokens,
  secondsPerCall: calls ? Math.round(ms / calls / 100) / 10 : 0,
};
console.log(JSON.stringify(summary, null, 2));
const dir = join(import.meta.dir, "results");
mkdirSync(dir, { recursive: true });
const stamp = summary.at.slice(0, 16).replace(/[:T]/g, "-");
writeFileSync(join(dir, `${stamp}-${MODEL}.json`), JSON.stringify({ summary, rows: rows.sort((a, b) => a.run - b.run || a.id.localeCompare(b.id)) }, null, 2) + "\n");
rmSync(scratch, { recursive: true, force: true });
