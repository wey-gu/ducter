// D463: the live-check kit. Every owed real-world check (a real site, a real key, a real
// microphone, Mem's real shapes, a week on hel) is one entry here: what it needs from the person,
// how long, its steps (automatic where they can be, one human step where they can't), and a dated
// result file that design/todo.md cites. Builder material: English only, not in `ducter help`.
//
// A check never writes outward on its own: it reads (the Log read-only, nmem's read verbs, the
// home's read-only frames, files the person saved) and asks the person for the one step that is
// theirs. The one exception says so in `outward` and asks first (a throwaway key spent on purpose).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClientFrame, ServerFrame } from "@ducter/protocol";
import { redactReport } from "../report.ts";

export type StepOutcome = "pass" | "fail" | "skip" | "not-yet";
/** pass: every step held; fail: one didn't; not-yet: what it measures hasn't happened here yet; incomplete: a step was skipped. */
export type Outcome = "pass" | "fail" | "not-yet" | "incomplete";
export type Value = string | number | boolean | null | string[] | number[];
/** What a step saw: counts, shapes, field names, yes/no. Never a value the person typed, never message text. */
export type Observed = Record<string, Value | undefined>;

/** One event of the Log, read only. */
export interface LoggedEvent {
  seq: number;
  ts: string;
  stream: string;
  kind: string;
  body: any;
}

/** The home's frames a check may send: each only reads. */
export type ReadFrame = Extract<ClientFrame, { t: "devices" } | { t: "folder_browse" } | { t: "browser_sites" }>;
export const READ_FRAMES = new Set<string>(["devices", "folder_browse", "browser_sites"]);

/** Everything a check touches, so every check runs against fakes in tests. */
export interface CheckEnv {
  now(): number;
  wait(ms: number): Promise<void>;
  platform: string;
  arch: string;
  version: string;
  dataDir: string;
  /** The person's home folder, said as ~ in a result. */
  home: string;
  vars: Record<string, string | undefined>;
  which(cmd: string): string | undefined;
  run(argv: string[], ms?: number): Promise<{ code: number; out: string; err: string } | undefined>;
  readText(path: string): string | undefined;
  exists(path: string): boolean;
  /** A folder's entries (empty when it can't be read); optional, so a fake may leave it out. */
  list?(dir: string): string[];
  /** The Log's events of these kinds since then, oldest first; undefined when there is no Log here. */
  events(kinds: string[], sinceMs: number): LoggedEvent[] | undefined;
  /** One read-only frame to the running home and its answer; undefined: no home answered. */
  homeAsk(frame: ReadFrame, match: (f: ServerFrame) => boolean, ms?: number): Promise<ServerFrame | undefined>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  /** A line from the person; undefined when nobody is at the terminal. */
  ask(prompt: string): Promise<string | undefined>;
  /** A secret from the person, not echoed and never kept. */
  secret(prompt: string): Promise<string | undefined>;
  say(line: string): void;
}

export interface Ctx {
  env: CheckEnv;
  opts: Record<string, string[]>;
  startedAt: number;
  /** What one step hands the next (never written to the result). */
  memo: Record<string, unknown>;
}

export const opt = (c: Ctx, name: string): string | undefined => c.opts[name]?.at(-1);

export interface StepDone {
  outcome: StepOutcome;
  observed?: Observed;
  note?: string;
  /** The rest can't run without this one (they are recorded as skipped). */
  stop?: boolean;
}

export interface Step {
  id: string;
  title: string;
  by: "auto" | "person";
  /** Skipping it leaves the check whole (an extra the person may not have). */
  optional?: boolean;
  run(c: Ctx): Promise<StepDone>;
}

export interface Check {
  name: string;
  decisions: string[];
  title: string;
  /** What it needs from the person: a device, an account, a login, a place. */
  needs: string[];
  /** Where to run it. */
  where: string;
  minutes: number;
  /** The todo.md heading whose owed line it closes. */
  todo: string;
  /** What it spends outside, asked first; absent: it only reads. */
  outward?: string;
  /** Options it takes (`--page <file>`), for list. */
  takes?: string[];
  steps: Step[];
}

/** Runs with no person at all. */
export const automatic = (c: Check) => c.steps.every((s) => s.by === "auto");

export interface StepResult {
  id: string;
  title: string;
  by: "auto" | "person";
  outcome: StepOutcome;
  observed: Observed;
  note?: string;
}

export interface CheckResult {
  check: string;
  decisions: string[];
  title: string;
  todo: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  host: { platform: string; arch: string; ducter: string };
  outcome: Outcome;
  steps: StepResult[];
}

/** The whole check's outcome from its steps. */
export function outcomeOf(steps: readonly (StepResult & { optional?: boolean })[]): Outcome {
  if (steps.some((s) => s.outcome === "fail")) return "fail";
  if (steps.some((s) => s.outcome === "not-yet")) return "not-yet";
  if (steps.some((s) => s.outcome === "skip" && !s.optional)) return "incomplete";
  return "pass";
}

/** The local calendar date of an instant, YYYY-MM-DD. */
export function dayOf(ms: number, zone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export async function runCheck(check: Check, env: CheckEnv, opts: Record<string, string[]> = {}): Promise<CheckResult> {
  const c: Ctx = { env, opts, startedAt: env.now(), memo: {} };
  const done: (StepResult & { optional?: boolean })[] = [];
  let stopped: string | undefined;
  for (const s of check.steps) {
    const base = { id: s.id, title: s.title, by: s.by, ...(s.optional ? { optional: true } : {}) };
    if (stopped) {
      done.push({ ...base, outcome: "skip", observed: {}, note: `not run: ${stopped} came first` });
      continue;
    }
    env.say(`${s.by === "person" ? "[you]" : "[auto]"} ${s.title}`);
    let r: StepDone;
    try {
      r = await s.run(c);
    } catch (e) {
      r = { outcome: "fail", note: `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), stop: true };
    }
    done.push({ ...base, outcome: r.outcome, observed: r.observed ?? {}, ...(r.note ? { note: r.note } : {}) });
    env.say(`  ${r.outcome}${r.note ? `: ${r.note}` : ""}`);
    if (r.stop) stopped = s.id;
  }
  const finished = env.now();
  return {
    check: check.name,
    decisions: check.decisions,
    title: check.title,
    todo: check.todo,
    date: dayOf(c.startedAt),
    startedAt: new Date(c.startedAt).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    host: { platform: env.platform, arch: env.arch, ducter: env.version },
    outcome: outcomeOf(done),
    steps: done.map(({ optional: _o, ...s }) => s),
  };
}

/** The result as written: secrets and the home folder taken out (a second net under "observe shapes, not values"). */
export function resultText(r: CheckResult, home: string): string {
  const text = redactReport(JSON.stringify(r, null, 2), { home });
  try {
    JSON.parse(text);
    return text + "\n";
  } catch {
    // The net cut inside a value badly: keep the outcomes, drop what was seen.
    return JSON.stringify({ ...r, steps: r.steps.map((s) => ({ ...s, observed: {}, note: "observed dropped: it held something secret-shaped" })) }, null, 2) + "\n";
  }
}

/** Where results go: DUCTER_CHECKS_DIR, else <data dir>/checks (~/.ducter/checks). */
export const checksDir = (dataDir: string, vars: Record<string, string | undefined>) => vars.DUCTER_CHECKS_DIR || join(dataDir, "checks");

/** Writes YYYY-MM-DD-<check>.json (a second run that day: -2, -3…); returns the path. */
export function writeResult(dir: string, r: CheckResult, home: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let path = join(dir, `${r.date}-${r.check}.json`);
  for (let n = 2; existsSync(path); n++) path = join(dir, `${r.date}-${r.check}-${n}.json`);
  writeFileSync(path, resultText(r, home), { mode: 0o600 });
  return path;
}

export interface Filed {
  file: string;
  result: CheckResult;
}

const RESULT = /^(\d{4}-\d{2}-\d{2})-(.+?)(?:-(\d+))?\.json$/;

/** Every result file in the folder, newest first (by date, then run number). */
export function readResults(dir: string): Filed[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: (Filed & { n: number })[] = [];
  for (const file of names) {
    const m = RESULT.exec(file);
    if (!m) continue;
    try {
      const result = JSON.parse(readFileSync(join(dir, file), "utf8")) as CheckResult;
      if (typeof result?.check !== "string" || typeof result?.outcome !== "string") continue;
      out.push({ file, result, n: Number(m[3] ?? 1) });
    } catch {
      /* not a result */
    }
  }
  return out.sort((a, b) => (a.result.date === b.result.date ? b.n - a.n : a.result.date < b.result.date ? 1 : -1)).map(({ n: _n, ...f }) => f);
}

/** The newest result per check. */
export function latest(dir: string): Map<string, Filed> {
  const m = new Map<string, Filed>();
  for (const f of readResults(dir)) if (!m.has(f.result.check)) m.set(f.result.check, f);
  return m;
}

/** `ducter check list`: each owed check, what it needs, how long, and its last result. */
export function listText(checks: readonly Check[], last: Map<string, Filed>): string {
  const lines: string[] = ["Owed live checks (D463). Run one: ducter check run <name>", ""];
  for (const c of checks) {
    const l = last.get(c.name);
    lines.push(`${c.name}  ${c.decisions.join(" ")}  ~${c.minutes} min  ${automatic(c) ? "automatic" : "needs you"}${l ? `  last: ${l.result.outcome} ${l.result.date}` : ""}`);
    lines.push(`  ${c.title}`);
    lines.push(`  needs: ${c.needs.join("; ")}`);
    lines.push(`  where: ${c.where}`);
    if (c.takes?.length) lines.push(`  takes: ${c.takes.join(" ")}`);
    if (c.outward) lines.push(`  spends: ${c.outward} (asked first)`);
    lines.push("");
  }
  return lines.join("\n");
}

export function listJson(checks: readonly Check[], last: Map<string, Filed>) {
  return checks.map((c) => {
    const l = last.get(c.name);
    return {
      name: c.name,
      decisions: c.decisions,
      title: c.title,
      needs: c.needs,
      where: c.where,
      minutes: c.minutes,
      automatic: automatic(c),
      todo: c.todo,
      ...(c.outward ? { outward: c.outward } : {}),
      ...(c.takes ? { takes: c.takes } : {}),
      ...(l ? { last: { outcome: l.result.outcome, date: l.result.date, file: l.file } } : {}),
    };
  });
}

/** The line design/todo.md carries under an owed item once its check ran (D463's convention). */
export const todoLine = (f: Filed) =>
  f.result.outcome === "pass" ? `Seen live: \`${f.file}\` (pass, ${f.result.host.platform}, Ducter ${f.result.host.ducter})` : `Tried live: \`${f.file}\` (${f.result.outcome}: ${firstWhy(f.result) ?? "see the file"})`;

const firstWhy = (r: CheckResult) => r.steps.find((s) => s.outcome === r.outcome || (r.outcome === "incomplete" && s.outcome === "skip"))?.note ?? r.steps.find((s) => s.outcome === "fail" || s.outcome === "not-yet")?.title;

/** `ducter check report`: where each check stands, and the line to paste into design/todo.md. */
export function reportText(checks: readonly Check[], last: Map<string, Filed>, dir: string): string {
  const by = { pass: 0, fail: 0, "not-yet": 0, incomplete: 0, never: 0 };
  const lines: string[] = [];
  for (const c of checks) {
    const l = last.get(c.name);
    if (!l) {
      by.never++;
      lines.push(`  never run  ${c.name} (${c.decisions.join(" ")}, ~${c.minutes} min)`);
      continue;
    }
    by[l.result.outcome]++;
    lines.push(`  ${l.result.outcome.padEnd(10)} ${c.name} (${l.result.date})`);
    lines.push(`             todo.md, under "${c.todo}": ${todoLine(l)}`);
  }
  const head = `Live checks in ${dir}: ${by.pass} passed, ${by.fail} failed, ${by["not-yet"]} not yet, ${by.incomplete} incomplete, ${by.never} never run`;
  return [head, "", ...lines, ""].join("\n");
}

// ---------- step helpers ----------

const YES = /^(y|yes|是|对|好|ok)$/i;
const NO = /^(n|no|否|不|没有)$/i;

/** A yes/no the person answers; "s" skips. Yes is pass. */
export function yesNo(id: string, title: string, question: string, o: { optional?: boolean } = {}): Step {
  return {
    id,
    title,
    by: "person",
    ...(o.optional ? { optional: true } : {}),
    async run(c) {
      for (let i = 0; i < 3; i++) {
        const a = (await c.env.ask(`${question} [y/n/s] `))?.trim();
        if (a === undefined) return { outcome: "skip", note: "nobody at the terminal" };
        if (YES.test(a)) return { outcome: "pass", observed: { answer: "yes" } };
        if (NO.test(a)) {
          const why = (await c.env.ask("What did you see instead? (one line, no secrets) "))?.trim();
          return { outcome: "fail", observed: { answer: "no" }, ...(why ? { note: why.slice(0, 300) } : {}) };
        }
        if (/^s(kip)?$/i.test(a)) return { outcome: "skip", note: "skipped by the person" };
      }
      return { outcome: "skip", note: "no answer" };
    },
  };
}

/** The person's one step ("now tap the pay button yourself"); Enter when done, "s" skips the rest. */
export function doNow(id: string, title: string, instruction: string): Step {
  return {
    id,
    title,
    by: "person",
    async run(c) {
      const a = (await c.env.ask(`${instruction}\nPress Enter when done (s: skip). `))?.trim();
      if (a === undefined) return { outcome: "skip", note: "nobody at the terminal", stop: true };
      if (/^s(kip)?$/i.test(a)) return { outcome: "skip", note: "skipped by the person", stop: true };
      c.memo[`${id}.at`] = c.env.now();
      return { outcome: "pass" };
    },
  };
}

/** A JSON object in a command's output: the whole text, else its first line that is one. */
export function jsonOf(text: string): any {
  const t = text.trim();
  for (const chunk of [t, ...t.split("\n")]) {
    const s = chunk.trim();
    if (!s.startsWith("{")) continue;
    try {
      return JSON.parse(s);
    } catch {
      /* not JSON */
    }
  }
  return undefined;
}

/** The field names over a list of objects, sorted, at most n. */
export function fieldsOf(list: readonly unknown[], n = 30): string[] {
  const s = new Set<string>();
  for (const x of list) if (x && typeof x === "object" && !Array.isArray(x)) for (const k of Object.keys(x)) s.add(k);
  return [...s].sort().slice(0, n);
}

/** The home answered this frame, or a plain reason. */
export async function askHome<T extends ServerFrame["t"]>(c: Ctx, frame: ReadFrame, t: T, ms = 8000, also: (f: Extract<ServerFrame, { t: T }>) => boolean = () => true): Promise<Extract<ServerFrame, { t: T }> | undefined> {
  if (!READ_FRAMES.has(frame.t)) throw new Error(`not a read-only frame: ${frame.t}`);
  return (await c.env.homeAsk(frame, (f) => f.t === t && also(f as Extract<ServerFrame, { t: T }>), ms)) as Extract<ServerFrame, { t: T }> | undefined;
}
