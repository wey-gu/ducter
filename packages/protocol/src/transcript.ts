// An opened task as turns (D210, after D152): each turn opens with what someone said to the agent
// (the brief, your words, the partner's) and holds the agent's answer in order: what it said and
// the progress it saved, and its steps as compact lines between them, one line per step (a run of
// reads and searches folded into one), an edit with its own diff, a failure with its error line.
// Pure and language-neutral: the clients word blocks from their fields in their i18n. The
// Go port (apps/desktop/internal/views/transcript.go) passes the same cases
// (fixtures/transcript.json). Every text in a block has its keys hidden (redact.ts): the home
// already hides them in what it sends, this is the second wall.
import type { Bodies, LogEvent } from "./index.ts";
import type { MediaRef } from "./media.ts";
import { redact } from "./redact.ts";
import { stepOf, type Step } from "./steps.ts";
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
  /** A real failure's line that says what went wrong (D210), keys hidden. */
  hint?: string;
  /** An edit's lines (editdiff.ts), keys hidden; `diffMore` past them; its counts. */
  diff?: string[];
  diffMore?: number;
  added?: number;
  removed?: number;
}

/** A line of a stretch (D210): one step, or a run of two or more looks folded into one. */
export type Line = { k: "row"; row: StepRow } | { k: "looks"; seq: number; rows: StepRow[]; reads: number; searches: number };

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
  | { k: "note"; seq: number; say: NoteSay; name?: string; text: string; bad?: boolean };

/** What a note says (D207). Every other system line (session started, memory recalled, a retry, an archive) says nothing. */
export type NoteSay = "stalled" | "offline" | "back" | "waiting_device" | "fresh" | "moved" | "effort_dropped" | "guard" | "to_own_browser" | "error" | "error_delivery" | "error_start" | "error_resume";

const KICKOFF = /^(<brief>|Start the task ")/;

/** A system line as a note, or undefined when it says nothing to a person (D207). Shared by the Go port. */
export function noteOf(text: string, raw: unknown): { say: NoteSay; name?: string; bad?: boolean } | undefined {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const o = (k: string) => (r[k] && typeof r[k] === "object" ? (r[k] as Record<string, unknown>) : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const from = (re: RegExp) => re.exec(text)?.[1]?.trim() || undefined;
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

/** A step that only looks: reading, searching, a probe, a request or a fetch that reads a page. */
const looks = (s: Step) => s.kind === "read" || s.kind === "searched" || !!s.probe || (s.kind === "browsed" && (s.act === "request" || s.act === "fetch"));
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
  const l = ls.find((x) => /error|fail|✗|exception|fatal|denied|not found|cannot|panic/i.test(x) && !/\b0 (fail|error)/i.test(x)) ?? ls.at(-1) ?? "";
  return [...l].length > 160 ? [...l].slice(0, 159).join("") + "…" : l;
}

/** A stretch's rows as lines: two or more looks in a row fold into one (D210, Lorca's "Explored"). */
export function linesOf(rows: StepRow[]): Line[] {
  const out: Line[] = [];
  let run: StepRow[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const reads = run.filter((r) => r.step!.kind === "read").reduce((a, r) => a + r.n, 0);
      const all = run.reduce((a, r) => a + r.n, 0);
      out.push({ k: "looks", seq: run[0]!.seq, rows: run, reads, searches: all - reads });
    } else for (const r of run) out.push({ k: "row", row: r });
    run = [];
  };
  for (const r of rows) {
    if (r.step && looks(r.step) && r.outcome !== "error") run.push(r);
    else {
      flush();
      out.push({ k: "row", row: r });
    }
  }
  flush();
  return out;
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
  for (const ev of events) {
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
          addRow(ev.seq, { seq: ev.seq, thought: redact(b.thinking.join(" · ")), n: 1, outcome: "ok" });
          break;
        }
        if (b.tool) {
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
          const output = redact(clipLines(full, 40));
          const hint = outcome === "error" ? redact(failLine(full)) : "";
          const d = st.kind === "edited" && st.act !== "mkdir" ? editDiff(b.tool.input) : undefined;
          const diff = d ? { diff: d.lines.map((l) => redact(l)), ...(d.more ? { diffMore: d.more } : {}), ...(d.added ? { added: d.added } : {}), ...(d.removed ? { removed: d.removed } : {}) } : {};
          addRow(ev.seq, { seq: ev.seq, step: st, n: 1, outcome, ...(command ? { command } : {}), ...(output ? { output } : {}), ...(hint ? { hint } : {}), ...diff });
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
  const last = out.at(-1);
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
