// An opened task as blocks (D152, after D127): what you asked, then the agent's own voice (what
// it said and the progress it saved) as the readable layer, each stretch of steps between two
// things it said folded under one gist line ("查看了环境 · 6 步"), the stretch still under way
// live. Pure and language-neutral: the clients word blocks from their fields in their i18n. The
// Go port (apps/desktop/internal/views/transcript.go) passes the same cases
// (fixtures/transcript.json). Every text in a block has its keys hidden (redact.ts): the home
// already hides them in what it sends, this is the second wall.
import type { Bodies, LogEvent } from "./index.ts";
import { redact } from "./redact.ts";
import { stepOf, type Step } from "./steps.ts";

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
}

/** What a stretch of steps was, for its gist line. */
export interface Gist {
  /** look: only reading, searching, probing · edit: changed files · browse: a browser or the computer · run: commands · think: only thinking */
  kind: "look" | "edit" | "browse" | "run" | "think";
  steps: number;
  /** Distinct files edited. */
  files: number;
  app?: string;
  /** Rows that really failed (a probe's "not there" is not one). */
  errors: number;
}

export type Block =
  | { k: "brief"; seq: number; text: string; by: "you" | "partner" }
  /** The agent's own words: a message, or progress it saved (`saved`), said once. */
  | { k: "voice"; seq: number; text: string; saved?: boolean }
  | { k: "steps"; seq: number; rows: StepRow[]; gist: Gist; live?: boolean }
  /** The user's words to the task; `go` = their Go relayed (its label, may be ""). */
  | { k: "you"; seq: number; text: string; go?: string }
  | { k: "partner"; seq: number; text: string }
  /** An earlier report to the partner (the latest is the outcome, said above the transcript). */
  | { k: "report"; seq: number; state: Bodies["report"]["state"]; text: string }
  /** A harness's note that says something to a person; `bad` = a turn or delivery that failed. */
  | { k: "note"; seq: number; text: string; bad?: boolean };

const QUIET_SYSTEM = /^(session started|turn completed|turn complete|turn ended|turn aborted|looking at |compaction )/i;
const FAILED_SYSTEM = /^(turn failed|delivery failed|failed to|event stream error)/i;
const KICKOFF = /^(<brief>|Start the task ")/;

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

function gistOf(rows: StepRow[]): Gist {
  const steps = rows.filter((r) => r.step);
  const n = steps.reduce((a, r) => a + r.n, 0);
  const files = new Set(steps.filter((r) => r.step!.kind === "edited" && r.step!.act !== "mkdir").map((r) => r.step!.target ?? "")).size;
  const errors = rows.filter((r) => r.outcome === "error").length;
  const app = steps.map((r) => r.step!.app).filter(Boolean).at(-1);
  let kind: Gist["kind"] = "run";
  if (!steps.length) kind = "think";
  else if (files > 0) kind = "edit";
  else if (steps.every((r) => looks(r.step!))) kind = "look";
  else if (steps.some((r) => r.step!.kind === "browsed" || r.step!.kind === "computer")) kind = "browse";
  return { kind, steps: n, files, ...(app ? { app } : {}), errors };
}

/** A task's events (its stream, in order) as blocks. `working`: the task is at it now, so its last stretch is live. */
export function blocksOf(harness: string, events: LogEvent[], working: boolean): Block[] {
  const out: Block[] = [];
  const lastReport = events.filter((e) => e.kind === "report").at(-1)?.seq;
  let app = "";
  let briefed = false;
  const stretch = (): Extract<Block, { k: "steps" }> | undefined => {
    const b = out.at(-1);
    return b?.k === "steps" ? b : undefined;
  };
  const addRow = (seq: number, row: StepRow) => {
    let s = stretch();
    if (!s) out.push((s = { k: "steps", seq, rows: [], gist: { kind: "run", steps: 0, files: 0, errors: 0 } }));
    s.rows.push(row);
  };
  for (const ev of events) {
    switch (ev.kind) {
      case "task_open": {
        const b = ev.body as Bodies["task_open"];
        // A task opened before its brief was written (D120) logs an empty one first; a retitle is a later one.
        if (briefed || !b.brief.trim()) break;
        briefed = true;
        out.push({ k: "brief", seq: ev.seq, text: redact(b.brief.trim()), by: b.origin === "you" ? "you" : "partner" });
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
        out.push({ k: "report", seq: ev.seq, state: r.state, text: redact(r.summary) });
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
          const prev = stretch()?.rows.at(-1);
          if (prev?.step && outcome === "ok" && prev.outcome === "ok" && JSON.stringify(prev.step) === JSON.stringify(st)) {
            prev.n++;
            break;
          }
          const command = st.kind === "ran" || st.kind === "searched" || st.kind === "read" || st.kind === "browsed" ? redact(shellCommand(b.tool.input)) : "";
          const output = redact(clipLines((b.tool.output ?? "").trimEnd(), 40));
          addRow(ev.seq, { seq: ev.seq, step: st, n: 1, outcome, ...(command ? { command } : {}), ...(output ? { output } : {}) });
          break;
        }
        const text = (b.text ?? "").trim();
        if (b.role === "system") {
          if (!text || QUIET_SYSTEM.test(text)) break;
          out.push({ k: "note", seq: ev.seq, text: redact(text), ...(FAILED_SYSTEM.test(text) ? { bad: true } : {}) });
          break;
        }
        if (!text) break;
        if (b.role === "user") {
          // The runner's kickoff (the brief again in tags) is not what anyone said.
          if (b.from === "runner" || (!b.from && KICKOFF.test(text))) break;
          if (b.from === "partner" || ev.origin === "partner") out.push({ k: "partner", seq: ev.seq, text: redact(text) });
          else {
            const go = goRelay(text);
            out.push({ k: "you", seq: ev.seq, text: redact(text), ...(go !== undefined ? { go } : {}) });
          }
          break;
        }
        if (b.role === "assistant") out.push({ k: "voice", seq: ev.seq, text: redact(text) });
        break;
      }
    }
  }
  for (const b of out) if (b.k === "steps") b.gist = gistOf(b.rows);
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
