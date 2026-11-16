// An opened task as turns (D210, after D152): each turn opens with what someone said to the agent
// (the brief, your words, the partner's) and holds the agent's answer in order: what it said and
// the progress it saved, and between them its steps, a run of them as one summary line (D268:
// "Read 9 files, ran 2 commands"), a failure, a subagent and a stretch of thinking each its own.
// Pure and language-neutral: the clients word blocks from their fields in their i18n. The
// Go port (apps/desktop/internal/views/transcript.go) passes the same cases
// (fixtures/transcript.json). Every text in a block has its keys hidden (redact.ts): the home
// already hides them in what it sends, this is the second wall.
import type { Bodies, LogEvent } from "./index.ts";
import type { MediaRef } from "./media.ts";
import { redact } from "./redact.ts";
import { splitTool, stepOf, type Step } from "./steps.ts";
import { harnessName } from "./harnesses.ts";
import { editDiff } from "./editdiff.ts";

/** How a step came out: done, a real failure, or a look that found nothing (a probe's non-zero exit). */
export type Outcome = "ok" | "error" | "missing";

export interface StepRow {
  seq: number;
  /** Absent on a stretch of thinking (its headings are `thought`). */
  step?: Step;
  thought?: string;
  /** The same step this many times in a row. */
  n: number;
  outcome: Outcome;
  /** The command as it ran (shell steps), keys hidden: what opens on a tap, in mono. */
  command?: string;
  /** What it printed, keys hidden, at most 40 lines. */
  output?: string;
  /** A real failure in words (D268): the service's own message, unwrapped from its JSON, else the
   *  telling line, keys hidden; `code` the HTTP status it named. The raw output stays in `output`. */
  hint?: string;
  code?: number;
  /** How long it took, from the event before it (a stretch of thinking, a subagent), in ms. */
  ms?: number;
  /** An edit's lines (editdiff.ts), keys hidden; `diffMore` past them; its counts. */
  diff?: string[];
  diffMore?: number;
  added?: number;
  removed?: number;
}

/** One kind of step in a group's summary (D268): how many, and a connected service's name. */
export interface Tally {
  kind: TallyKind;
  n: number;
  name?: string;
}
export type TallyKind = "edited" | "ran" | "used" | "read" | "searched" | "web" | "browsed" | "computer" | "waited" | "other";

/**
 * A line of a stretch (D268): one step, or a run of steps between two things said as one summary
 * line, its tally in priority order (edits, then commands, then the rest by count); the clients
 * say at most two and count the rest. A failure, a subagent and thinking stand on their own.
 */
export type Line = { k: "row"; row: StepRow } | { k: "group"; seq: number; rows: StepRow[]; n: number; tally: Tally[] };

/** An item of the agent's plan (its todo list), as its harness last wrote it (D268). */
export interface PlanItem {
  text: string;
  state: "todo" | "doing" | "done";
}

/** A turn (D210): what someone said to the agent, then everything up to the next thing said to it. */
export interface Turn {
  seq: number;
  prompt?: Block;
  body: Block[];
}

export type Block =
  // media (D206): the pictures that came with it (a brief, your words, the partner's) or that a report showed.
  | { k: "brief"; seq: number; text: string; by: "you" | "partner"; media?: MediaRef[] }
  /** The agent's own words: a message, or progress it saved (`saved`), said once. */
  | { k: "voice"; seq: number; text: string; saved?: boolean }
  /** A stretch of steps between two things said; `live` = the one under way. */
  | { k: "steps"; seq: number; lines: Line[]; live?: boolean }
  /** The user's words to the task; `go` = their Go relayed (its label, may be ""). */
  | { k: "you"; seq: number; text: string; go?: string; media?: MediaRef[] }
  | { k: "partner"; seq: number; text: string; media?: MediaRef[] }
  /** An earlier report to the partner (the latest is the outcome, said above the transcript). */
  | { k: "report"; seq: number; state: Bodies["report"]["state"]; text: string; media?: MediaRef[] }
  /**
   * A runner's or harness's note that says something to a person (D207): `say` is what the clients
   * word in their i18n (`note.<say>`, `name` filled in), never the English it was logged in; `text`
   * is that line as logged, keys hidden, shown only on a tap for an error; `bad` = something failed.
   */
  | { k: "note"; seq: number; say: NoteSay; name?: string; text: string; bad?: boolean }
  /** The agent's plan (D268): one per task, where it first wrote it, holding its latest items. */
  | { k: "plan"; seq: number; items: PlanItem[] };

/** What a note says (D207). Every other system line (session started, memory recalled, a retry, an archive) says nothing. */
export type NoteSay = "compacted" | "interrupted" | "retry" | "stalled" | "offline" | "back" | "waiting_device" | "fresh" | "moved" | "effort_dropped" | "guard" | "to_own_browser" | "error" | "error_delivery" | "error_start" | "error_resume";

const KICKOFF = /^(<brief>|Start the task ")/;

/** A system line as a note, or undefined when it says nothing to a person (D207). Shared by the Go port. */
export function noteOf(text: string, raw: unknown): { say: NoteSay; name?: string; bad?: boolean } | undefined {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const o = (k: string) => (r[k] && typeof r[k] === "object" ? (r[k] as Record<string, unknown>) : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const from = (re: RegExp) => re.exec(text)?.[1]?.trim() || undefined;
  // D268: a divider for a compaction or an interruption; a retry only while it is the latest thing.
  if (r.kind === "compaction_ended" && r.outcome !== "failed") return { say: "compacted" };
  if (r.kind === "turn_ended" && r.outcome === "aborted") return { say: "interrupted" };
  if (r.kind === "retry") return { say: "retry", ...((n) => (n ? { name: n } : {}))(from(/^retry (\d+)/)) };
  if (r.stall) return { say: "stalled" };
  if (r.fresh) return { say: "fresh" };
  if (r.effortDropped) return { say: "effort_dropped", ...(str(r.effortDropped) ? { name: str(r.effortDropped) } : {}) };
  if (o("browser")?.guard) return { say: "guard" };
  if (o("browser")?.driver === "cua") return { say: "to_own_browser" };
  const sw = o("switched");
  const mv = o("moved");
  if (sw || mv) {
    const to = str(sw?.to) ? harnessName(String(sw!.to)) : str(mv?.to);
    return { say: "moved", ...(to ? { name: to } : {}) };
  }
  if (r.device !== undefined && r.offline === true) return { say: "offline", ...((n) => (n ? { name: n } : {}))(str(r.name) ?? from(/^(.+?) disconnected/)) };
  if (r.device !== undefined && r.offline === false) return { say: "back", ...((n) => (n ? { name: n } : {}))(str(r.name) ?? from(/^(.+?) is back/)) };
  if (r.waits === "asleep" || r.waits === "unreachable") return { say: "waiting_device", ...((n) => (n ? { name: n } : {}))(str(r.name) ?? from(/^waiting for (.+?):/)) };
  if (/^delivery failed/i.test(text)) return { say: "error_delivery", bad: true };
  if (/^failed to start/i.test(text)) return { say: "error_start", bad: true };
  if (/^(failed to resume|could not switch|Claude in Chrome isn't connected, and)/i.test(text)) return { say: "error_resume", bad: true };
  if (/^(turn failed|event stream error|nudge failed|failed to)/i.test(text)) return { say: "error", bad: true };
  return undefined;
}

/** The user's Go as Ducter relays it to the task ("User says Go: …."), or undefined. */
export function goRelay(text: string): string | undefined {
  return text.startsWith("User says Go: ") ? text.slice("User says Go: ".length).trim().replace(/[.。]+$/, "") : undefined;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const clipLines = (s: string, n: number) => s.split("\n").slice(0, n).join("\n");

function shellCommand(input: unknown): string {
  if (typeof input === "string") return input;
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const k of ["command", "cmd", "script", "code"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return (v as string[]).join(" ");
  }
  return "";
}

/** A failure's telling line: the first that names an error, else the last that says anything. */
export function failLine(output: string): string {
  const ls = output.split("\n").map((l) => l.trim()).filter(Boolean);
  // The last line that says something; a stack frame ("at f (x.js:8)") says nothing to a person (D268).
  const said = ls.filter((x) => !/^at\s/.test(x));
  const l = ls.find((x) => /error|fail|✗|exception|fatal|denied|not found|cannot|panic/i.test(x) && !/\b0 (fail|error)/i.test(x)) ?? said.at(-1) ?? ls.at(-1) ?? "";
  return [...l].length > 160 ? [...l].slice(0, 159).join("") + "…" : l;
}

/** Output that says nothing ("Action completed."): its step has nothing to open (D268). */
export const trivialOutput = (s: string) => /^(action completed|completed|ok|done|success|succeeded|true|null|\{\}|\[\])?[.!]?$/i.test(s.trim());

/** A failure in words (D268): the message inside a service's JSON and the HTTP status it names. */
export function failOf(output: string): { hint: string; code?: number } {
  const raw = output.trim();
  let hint = "";
  let code: number | undefined;
  const status = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d{3}$/.test(v) ? Number(v) : 0;
    return n >= 100 && n < 600 ? n : undefined;
  };
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const j = raw.indexOf("{");
  const k = raw.lastIndexOf("}");
  if (j >= 0 && k > j) {
    try {
      const o = JSON.parse(raw.slice(j, k + 1)) as Record<string, unknown>;
      const e = (o.error && typeof o.error === "object" ? o.error : {}) as Record<string, unknown>;
      hint = s(o.message) || s(e.message) || s(o.error) || s(o.detail);
      code = status(o.status) ?? status(e.code) ?? status(o.code) ?? status(e.status);
      if (!hint) hint = failLine(raw.slice(0, j)).replace(/[:：]\s*$/, "");
    } catch {}
  }
  if (!hint) hint = failLine(raw);
  if (code === undefined) {
    const m = /\b(?:HTTP|status|error|code)\b[^\d\n]{0,12}([1-5]\d\d)\b/i.exec(raw);
    if (m) code = Number(m[1]);
  }
  if ([...hint].length > 160) hint = [...hint].slice(0, 159).join("") + "…";
  return { hint, ...(code !== undefined ? { code } : {}) };
}

const KNOWN_SERVICES: Record<string, string> = {
  github: "GitHub", gitlab: "GitLab", linear: "Linear", slack: "Slack", notion: "Notion", figma: "Figma", sentry: "Sentry",
  jira: "Jira", stripe: "Stripe", vercel: "Vercel", supabase: "Supabase", "nowledge-mem": "Nowledge Mem", gmail: "Gmail",
};

/** A connected service's name as a person says it: github → GitHub, claude_ai_Gmail → Gmail. */
export function serviceName(server: string): string {
  const s = server.replace(/^claude_ai_/i, "").replace(/^plugin_[^_]+_/i, "");
  const known = KNOWN_SERVICES[s.toLowerCase()];
  if (known) return known;
  return s
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TALLY_ORDER: TallyKind[] = ["edited", "ran", "used", "read", "searched", "web", "browsed", "computer", "waited", "other"];

/** What a run of steps did, by kind: edits first, then commands, then the rest, most first. */
export function tallyOf(rows: StepRow[]): Tally[] {
  const by = new Map<string, Tally>();
  for (const r of rows) {
    const st = r.step!;
    let kind: TallyKind = "other";
    let name = "";
    if (st.kind === "edited" || st.kind === "ran" || st.kind === "read" || st.kind === "browsed" || st.kind === "computer" || st.kind === "waited") kind = st.kind;
    else if (st.kind === "searched") kind = st.act === "web" ? "web" : "searched";
    else if (st.kind === "other" && st.via) (kind = "used"), (name = serviceName(st.via));
    const key = `${kind}:${name}`;
    const t = by.get(key) ?? { kind, n: 0, ...(name ? { name } : {}) };
    t.n += r.n;
    by.set(key, t);
  }
  const rank = (t: Tally) => (t.kind === "edited" ? 0 : t.kind === "ran" ? 1 : 2);
  return [...by.values()].sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.n - a.n : 0) || TALLY_ORDER.indexOf(a.kind) - TALLY_ORDER.indexOf(b.kind));
}

/** A row that stands on its own line: thinking, a failure, a subagent (D268). */
const alone = (r: StepRow) => !r.step || r.outcome === "error" || r.step.kind === "delegated";

/** A stretch's rows as lines (D268): a run of two or more steps is one summary line. */
export function linesOf(rows: StepRow[]): Line[] {
  const out: Line[] = [];
  let run: StepRow[] = [];
  const flush = () => {
    const n = run.reduce((a, r) => a + r.n, 0);
    if (n >= 2) out.push({ k: "group", seq: run[0]!.seq, rows: run, n, tally: tallyOf(run) });
    else for (const r of run) out.push({ k: "row", row: r });
    run = [];
  };
  for (const r of rows) {
    if (alone(r)) {
      flush();
      out.push({ k: "row", row: r });
    } else run.push(r);
  }
  flush();
  return out;
}

/** A harness's plan (Claude Code's TodoWrite, Codex's update_plan) as items, or undefined. */
export function planOf(name: string, input: unknown): PlanItem[] | undefined {
  const [, tool] = splitTool(name);
  const o = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const list = tool === "TodoWrite" || tool === "todo_write" || tool === "todowrite" ? o.todos : tool === "update_plan" ? o.plan : undefined;
  if (!Array.isArray(list)) return undefined;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const items: PlanItem[] = [];
  for (const x of list) {
    const e = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const text = s(e.content) || s(e.step) || s(e.text) || s(e.title);
    if (!text) continue;
    const st = s(e.status).toLowerCase();
    items.push({ text: redact(text), state: /complete|done/.test(st) ? "done" : /progress|doing|active|running/.test(st) ? "doing" : "todo" });
  }
  return items.length ? items : undefined;
}

/** The seq of the last event a block holds (a stretch's last step): how long a turn took (D268). */
export function lastSeq(b: Block): number {
  if (b.k !== "steps") return b.seq;
  let s = b.seq;
  for (const l of b.lines) for (const r of l.k === "row" ? [l.row] : l.rows) s = Math.max(s, r.seq);
  return s;
}

/** Blocks as turns: a brief, your words or the partner's open one (D210). */
export function turnsOf(blocks: Block[]): Turn[] {
  const out: Turn[] = [];
  for (const b of blocks) {
    if (b.k === "brief" || b.k === "you" || b.k === "partner") out.push({ seq: b.seq, prompt: b, body: [] });
    else {
      if (!out.length) out.push({ seq: b.seq, body: [] });
      out.at(-1)!.body.push(b);
    }
  }
  return out;
}

const isRetry = (b: Block | undefined) => b?.k === "note" && b.say === "retry";

/** A task's events (its stream, in order) as blocks. `working`: the task is at it now, so its last stretch is live. */
export function blocksOf(harness: string, events: LogEvent[], working: boolean): Block[] {
  const out: Block[] = [];
  const lastReport = events.filter((e) => e.kind === "report").at(-1)?.seq;
  let app = "";
  let briefed = false;
  // The rows of each stretch, made into lines at the end.
  const rowsOf = new Map<Block, StepRow[]>();
  const stretch = (): StepRow[] | undefined => {
    const b = out.at(-1);
    return b?.k === "steps" ? rowsOf.get(b) : undefined;
  };
  const addRow = (seq: number, row: StepRow) => {
    let s = stretch();
    if (!s) {
      const b: Block = { k: "steps", seq, lines: [] };
      out.push(b);
      rowsOf.set(b, (s = []));
    }
    s.push(row);
  };
  let plan: Extract<Block, { k: "plan" }> | undefined;
  // How long since the event before (thinking ends when what follows begins; a subagent's call is logged when it ends).
  let prevTs = NaN;
  const since = (ts: string) => {
    const ms = Date.parse(ts) - prevTs;
    return Number.isFinite(ms) && ms >= 0 ? { ms } : {};
  };
  for (const ev of events) {
    const took = since(ev.ts);
    prevTs = Date.parse(ev.ts);
    // A retry is said only while it is the latest thing: whatever comes next takes its place.
    const sys = ev.kind === "task_event" ? (ev.body as Bodies["task_event"]) : undefined;
    if (isRetry(out.at(-1)) && !(sys?.role === "system" && !noteOf((sys.text ?? "").trim(), sys.raw))) out.pop();
    switch (ev.kind) {
      case "task_open": {
        const b = ev.body as Bodies["task_open"];
        // A task opened before its brief was written (D120) logs an empty one first; a retitle is a later one.
        if (briefed || !b.brief.trim()) break;
        briefed = true;
        out.push({ k: "brief", seq: ev.seq, text: redact(b.brief.trim()), by: b.origin === "you" ? "you" : "partner", ...(b.media?.length ? { media: b.media } : {}) });
        break;
      }
      case "checkpoint": {
        const text = redact((ev.body as Bodies["checkpoint"]).text.trim());
        if (!text) break;
        // Saved what it just said: the same words once, marked saved.
        const said = [...out].reverse().find((b) => b.k !== "steps");
        if (said?.k === "voice" && norm(said.text) === norm(text)) said.saved = true;
        else out.push({ k: "voice", seq: ev.seq, text, saved: true });
        break;
      }
      case "report": {
        if (ev.seq === lastReport) break;
        const r = ev.body as Bodies["report"];
        out.push({ k: "report", seq: ev.seq, state: r.state, text: redact(r.summary), ...(r.media?.length ? { media: r.media } : {}) });
        break;
      }
      case "task_event": {
        const b = ev.body as Bodies["task_event"];
        if (b.thinking?.length) {
          addRow(ev.seq, { seq: ev.seq, thought: redact(b.thinking.join(" · ")), n: 1, outcome: "ok", ...took });
          break;
        }
        if (b.tool) {
          // D268: the agent's plan, one per task, its latest items where it first wrote it.
          const items = planOf(b.tool.name, b.tool.input);
          if (items) {
            if (plan) plan.items = items;
            else out.push((plan = { k: "plan", seq: ev.seq, items }));
            break;
          }
          const st = stepOf(harness, b.tool);
          if (st.hidden) break;
          // The app a run of browser and computer steps works in carries over to the steps that don't name it.
          if (st.kind === "browsed" || st.kind === "computer") {
            if (!st.app && app) st.app = app;
            else if (st.app) app = st.app;
          }
          if (st.target) st.target = redact(st.target);
          if (st.says) st.says = redact(st.says);
          const outcome: Outcome = b.tool.ok === false ? (st.probe ? "missing" : "error") : "ok";
          const prev = stretch()?.at(-1);
          if (prev?.step && outcome === "ok" && prev.outcome === "ok" && JSON.stringify(prev.step) === JSON.stringify(st)) {
            prev.n++;
            break;
          }
          const command = st.kind === "ran" || st.kind === "searched" || st.kind === "read" || st.kind === "browsed" ? redact(shellCommand(b.tool.input)) : "";
          const full = (b.tool.output ?? "").trimEnd();
          const output = trivialOutput(full) ? "" : redact(clipLines(full, 40));
          const fail = outcome === "error" ? failOf(full) : undefined;
          const hint = fail ? { ...(fail.hint ? { hint: redact(fail.hint) } : {}), ...(fail.code ? { code: fail.code } : {}) } : {};
          const d = st.kind === "edited" && st.act !== "mkdir" ? editDiff(b.tool.input) : undefined;
          const diff = d ? { diff: d.lines.map((l) => redact(l)), ...(d.more ? { diffMore: d.more } : {}), ...(d.added ? { added: d.added } : {}), ...(d.removed ? { removed: d.removed } : {}) } : {};
          addRow(ev.seq, { seq: ev.seq, step: st, n: 1, outcome, ...(command ? { command } : {}), ...(output ? { output } : {}), ...hint, ...diff, ...(st.kind === "delegated" ? took : {}) });
          break;
        }
        const text = (b.text ?? "").trim();
        if (b.role === "system") {
          const n = noteOf(text, b.raw);
          if (n) out.push({ k: "note", seq: ev.seq, ...n, text: redact(text) });
          break;
        }
        if (!text && !b.media?.length) break;
        if (b.role === "user") {
          const media = b.media?.length ? { media: b.media } : {};
          // The runner's kickoff (the brief again in tags) is not what anyone said.
          if (b.from === "runner" || (!b.from && KICKOFF.test(text))) break;
          if (b.from === "partner" || ev.origin === "partner") out.push({ k: "partner", seq: ev.seq, text: redact(text), ...media });
          else {
            const go = goRelay(text);
            out.push({ k: "you", seq: ev.seq, text: redact(text), ...(go !== undefined ? { go } : {}), ...media });
          }
          break;
        }
        if (b.role === "assistant") out.push({ k: "voice", seq: ev.seq, text: redact(text) });
        break;
      }
    }
  }
  for (const b of out) if (b.k === "steps") b.lines = linesOf(rowsOf.get(b)!);
  // A retry says itself only as the latest thing; the stretch before it is still the live one.
  const last = isRetry(out.at(-1)) ? out.at(-2) : out.at(-1);
  if (working && last?.k === "steps") last.live = true;
  return out;
}

/** The agent's latest words (a message or saved progress), first line, or "": where it stands now. */
export function latestVoice(blocks: Block[]): string {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.k === "report") return "";
    if (b.k === "voice") return b.text.split("\n")[0]!;
  }
  return "";
}
