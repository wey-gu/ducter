// Pure projection: OAR Event -> Ducter HarnessEvent. Only structural OAR shapes are used here
// (type imports are free; values stay in oar.ts), so no OAR type leaks out of this package.
import type { HarnessEvent } from "@ducter/protocol/src/internal.ts";
import type { NativeCompact, NativeUsage } from "./native-usage.ts";
import { readFreeLimit } from "@ducter/protocol/src/free-budget.ts";

export const PREVIEW_MAX = 2048;

export function preview(s: string | undefined, max = PREVIEW_MAX): string | undefined {
  if (s == null) return undefined;
  if (s.length <= max) return s;
  const head = s.slice(0, max - 40);
  return `${head}\n…[truncated ${s.length - head.length} chars]`;
}

/** Tool input: parse JSON when it is small enough to keep, else a truncated string preview. */
export function previewInput(input: string | undefined): unknown {
  if (input == null || input === "") return undefined;
  if (input.length <= PREVIEW_MAX) {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return preview(input);
}

type OarEventLike = { kind: string; agentPath?: readonly string[]; [k: string]: any };

/**
 * D266: a task the harness runs beside its turn (OAR `task_started`: a Claude Code background
 * shell, Monitor or background subagent; a Codex subagent thread). `shown` once it is known to
 * run in the background: flagged so (`background`, at its start or by a later `task_updated`), or
 * still live when the turn that started it ended (a foreground one always ends first).
 */
interface HarnessTask {
  type: string;
  description?: string;
  background: boolean;
  ambient: boolean;
  shown: boolean;
  ended: boolean;
  /** D515: a tool call still running when its turn completed (a Codex background terminal), by its call id. */
  call?: boolean;
  /** D518: the tool that started it (Claude Code's Monitor names a watch). */
  tool?: string;
}

/** D515: how much of a background job's own output its end carries to the task (the tail: where results are). */
export const BG_OUTPUT_TAIL = 1500;

/** A background act as the runner logs it (raw.background), and blocksOf reads it. */
export type BackgroundAct = "started" | "ended" | "stopped" | "failed";

/** D515: what a background job's end says beyond its words: its exit code, its output's tail, the harness's summary, the file its output went to. */
export type BackgroundSaid = { exitCode?: number; output?: string; summary?: string; outputFile?: string };

/** The last `max` characters of a text, marked when cut. */
function tail(s: string, max: number): string {
  return s.length <= max ? s : `…${s.slice(s.length - max + 1)}`;
}

/** D515: a background terminal said by its command, without the shell wrapper Codex runs it in (`/bin/zsh -lc '…'`). */
function commandWords(input: string | undefined): string | undefined {
  const s = (input ?? "").trim();
  if (!s) return undefined;
  const m = /^\S*\/(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/.exec(s);
  return m ? m[2] : s;
}

/** What a background task is said as: its own description; a Codex subagent's last path part. */
function taskWords(d: string | undefined): string | undefined {
  const s = (d ?? "").split("\n")[0]!.trim();
  if (!s) return undefined;
  const tail = /^\/[\w/-]+$/.test(s) ? s.split("/").filter(Boolean).at(-1) : s;
  return tail ? tail.slice(0, 160) : undefined;
}

interface PendingTool {
  name: string;
  mcp?: boolean; // an MCP server's tool (never a background terminal)
  stale?: boolean; // open when a turn was aborted or failed: never counted as background work
  input?: string;
  partial?: string; // streamed input so far (until a title is found)
  titled?: boolean;
  headed?: boolean; // the head before "brief" was emitted (or given up on)
}

/**
 * The top-level fields of a streamed JSON object written before `key` starts, parsed, or null
 * while `key` hasn't started yet. `{"title":"x","place":{…},"brief":"…` → {title, place}.
 */
export function headBefore(partial: string, key: string): Record<string, unknown> | null {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < partial.length; i++) {
    const c = partial[i]!;
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === '"') {
      if (depth === 1 && partial.startsWith(`"${key}"`, i)) {
        const rest = partial.slice(i + key.length + 2);
        if (/^\s*$/.test(rest)) return null; // can't tell yet whether it is the key
        if (/^\s*:/.test(rest)) {
          const before = partial.slice(0, i).replace(/,\s*$/, "");
          try {
            const v = JSON.parse(`${before}}`);
            return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
          } catch {
            return null;
          }
        }
      }
      inStr = true;
    }
  }
  return null;
}

/**
 * Stateful normalizer for one session. Text deltas are buffered and flushed as one
 * assistant event when anything else happens; tool start+input+end collapse into one
 * tool event carrying input and an output preview.
 */
export class Normalizer {
  private text = "";
  /** D462: the native message the buffered text belongs to (Codex agentMessage item, Claude API message). */
  private textMsg: string | undefined;
  private thought = "";
  private tools = new Map<string, PendingTool>();
  private lastContext: number | undefined;
  private tasks = new Map<string, HarnessTask>();
  /** D288: the session's totals at the previous turn end (a turn is their difference). */
  private turnBase: { input: number; output: number; cached: number } | undefined;
  /** D288: what the native frame said about a compaction about to be read (before / after). */
  private compactNative: NativeCompact | undefined;

  /** D518: canStop: the session can stop one task by its id (OAR stopTask); a start says so for the ones it can (never a Codex background terminal: OAR has no stop for a tool call). */
  constructor(
    private readonly usage: () => HarnessEvent["usage"] | undefined,
    private readonly opts: { canStop?: boolean } = {},
  ) {}

  /**
   * D288: what OAR leaves in the native frame, read before the frame's events are pushed: a
   * compaction's sizes (stashed for its compaction_ended), and the account's limits as the
   * session said them (an event of their own).
   */
  native(n: NativeUsage | undefined): HarnessEvent[] {
    if (!n) return [];
    if (n.compact) this.compactNative = n.compact;
    return n.limits ? [{ role: "system", limits: n.limits, raw: { kind: "limits" } }] : [];
  }

  /** D288: this turn alone, from the session's running totals. */
  private turnOf(u: HarnessEvent["usage"] | undefined): HarnessEvent["usage"] | undefined {
    if (!u || (u.inputTokens === undefined && u.outputTokens === undefined)) return u;
    const now = { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0, cached: u.cacheRead ?? 0 };
    const b = this.turnBase && now.input >= this.turnBase.input && now.output >= this.turnBase.output ? this.turnBase : { input: 0, output: 0, cached: 0 };
    this.turnBase = now;
    return { ...u, turn: { input: now.input - b.input, output: now.output - b.output, ...(u.cacheRead !== undefined ? { cached: Math.max(0, now.cached - b.cached) } : {}) } };
  }

  push(ev: OarEventLike): HarnessEvent[] {
    const out: HarnessEvent[] = [];
    // Root agent only: subagent chatter stays in the native transcript.
    if (ev.agentPath && ev.agentPath.length > 0) return out;
    if (ev.kind === "text_delta") {
      // D462: two messages of one turn stay two lines (Codex writes a line, then another, with no
      // tool between: joined, "…告诉你。我去帮你找…" read as one two-sentence ack).
      const id = typeof ev.messageId === "string" ? ev.messageId : undefined;
      if (id !== undefined && this.textMsg !== undefined && id !== this.textMsg && this.text.trim()) this.flushText(out);
      if (id !== undefined) this.textMsg = id;
      this.text += ev.text ?? "";
      return out;
    }
    if (ev.kind === "tool_call_input_delta") {
      const t = this.tools.get(ev.callId);
      if (t && !t.headed) {
        t.partial = (t.partial ?? "") + (ev.delta ?? "");
        // Early title: the partner acks a task_open by its title before the brief is written.
        const m = t.titled ? null : /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(t.partial);
        if (m) {
          t.titled = true;
          let title = m[1]!;
          try {
            title = JSON.parse(`"${m[1]}"`);
          } catch {}
          // D360: the group written before it, so a later part of a split isn't acked on its own.
          const g = /"group"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(t.partial);
          let group: string | undefined;
          try {
            group = g ? JSON.parse(`"${g[1]}"`) : undefined;
          } catch {}
          out.push({ role: "tool", tool: { name: t.name, input: { title, ...(group ? { group } : {}) } }, raw: { kind: "tool_call_title", callId: ev.callId } });
        }
        // Early head (D120): everything written before the "brief" key (title, place, …), so
        // the partner can open the task while the model is still writing its brief.
        const head = headBefore(t.partial, "brief");
        if (head) {
          t.headed = true;
          t.partial = undefined;
          out.push({ role: "tool", tool: { name: t.name, input: head }, raw: { kind: "tool_call_head", callId: ev.callId } });
        } else if (t.partial.length > 8192) t.headed = true; // no brief key early on: give up
      }
      return out;
    }
    if (ev.kind === "reasoning") {
      // Thinking is kept as its headings only, for the opened task's Thinking lines (D127).
      if (ev.content?.kind === "text" && typeof ev.content.text === "string") this.thought += ev.content.text;
      return out;
    }
    if (ev.kind === "usage") {
      // Not logged (usage is folded into turnEnd), but the context size goes out as it grows, so
      // a task is asked to save its progress before its harness compacts (D135).
      const u = this.usage();
      const c = u?.contextTokens;
      if (c && c !== this.lastContext) {
        this.lastContext = c;
        out.push({ role: "system", usage: { contextTokens: c, ...(u?.contextWindow ? { contextWindow: u.contextWindow } : {}) }, raw: { kind: "usage" } });
      }
      return out;
    }
    if (ev.kind === "tool_call_progress") return out;
    if (ev.kind === "task_updated" && !this.taskUpdated(ev)) return out;
    this.flushText(out);
    switch (ev.kind) {
      case "user_message":
        // Native echo of host input. The runner logs what it sends itself, so the echo is never
        // logged; D325: it says the agent took the words in, which marks a steer as seen.
        // The input id where the agent keeps one (Claude Code's uuid, Codex's clientId, DeepSeek
        // Harness's id) matches the steer exactly; pi's echo has words only. Live (research/116):
        // each agent echoes at the step its model reads the words, so the echo goes out at once.
        if (typeof ev.input === "string" && ev.input.trim()) out.push({ role: "system", raw: { kind: "user_echo", input: ev.input.slice(0, 4000), ...(typeof ev.inputId === "string" && ev.inputId ? { inputId: ev.inputId } : {}) } });
        break;
      case "tool_call_started": {
        // One name form on every harness: an MCP tool is mcp__<server>__<tool> (claude's own
        // form; codex and pi report the server and tool apart, D85).
        const name = ev.server && ev.toolName ? `mcp__${ev.server}__${ev.toolName}` : ev.tool;
        this.tools.set(ev.callId, { name, input: ev.input, ...(ev.server ? { mcp: true } : {}) });
        // Early signal (no output yet): lets the partner turn its held line into an ack as
        // soon as the model starts a task_open call, not after it finishes writing the brief.
        // The runner does not log these (the ended event carries the full call).
        out.push({ role: "tool", tool: { name }, raw: { kind: "tool_call_started", callId: ev.callId } });
        break;
      }
      case "tool_call_input": {
        const t = this.tools.get(ev.callId);
        if (t) t.input = ev.input;
        else this.tools.set(ev.callId, { name: "unknown", input: ev.input });
        break;
      }
      case "tool_call_ended": {
        const t = this.tools.get(ev.callId) ?? { name: "unknown" };
        this.tools.delete(ev.callId);
        const output = toolOutputText(ev.content);
        out.push({
          role: "tool",
          tool: { name: t.name, input: previewInput(t.input), output: preview(output), ok: ev.result ? ev.result === "ok" : undefined },
          raw: { kind: ev.kind, callId: ev.callId, exitCode: ev.exitCode },
        });
        // D515: a call that outlived its turn (a Codex background terminal) ended: its end, with its output's tail.
        const task = this.tasks.get(ev.callId);
        if (task?.call && !task.ended) {
          task.ended = true;
          const failed = ev.result ? ev.result !== "ok" : typeof ev.exitCode === "number" && ev.exitCode !== 0;
          out.push(this.bgEvent(ev.callId, task, failed ? "failed" : "ended", { ...(typeof ev.exitCode === "number" ? { exitCode: ev.exitCode } : {}), ...(output ? { output: tail(output, BG_OUTPUT_TAIL) } : {}) }));
        }
        break;
      }
      case "task_started": {
        const id = String(ev.taskId ?? "");
        if (!id) break;
        const task: HarnessTask = { type: String(ev.taskType ?? "other"), description: ev.description, background: ev.background === true, ambient: ev.ambient === true, shown: false, ended: false };
        const by = typeof ev.toolCallId === "string" ? this.tools.get(ev.toolCallId)?.name : undefined;
        if (by && /^monitor$/i.test(by)) task.tool = by;
        this.tasks.set(id, task);
        if (task.background) this.show(id, task, out);
        break;
      }
      case "task_updated":
        // taskUpdated() said it is shown now: it went to the background, or it runs again.
        this.show(String(ev.taskId), this.tasks.get(String(ev.taskId))!, out);
        break;
      case "task_ended": {
        const id = String(ev.taskId ?? "");
        const task = this.tasks.get(id);
        if (!task || task.ended) break;
        task.ended = true;
        // D515: what the harness says of its end (Claude Code's summary and output file, DSH's detail).
        const said = { ...(typeof ev.summary === "string" && ev.summary.trim() ? { summary: tail(ev.summary.trim(), 500) } : {}), ...(typeof ev.outputFile === "string" && ev.outputFile ? { outputFile: ev.outputFile } : {}) };
        if (task.shown) out.push(this.bgEvent(id, task, ev.status === "failed" ? "failed" : ev.status === "stopped" ? "stopped" : "ended", said));
        break;
      }
      case "turn_ended": {
        // A task still running when the turn that started it ended runs in the background, flagged or not.
        for (const [id, task] of this.tasks) if (!task.ended && !task.shown) this.show(id, task, out);
        const o = ev.outcome ?? {};
        // D515 (research/222): a tool call still running when its turn completed goes on beside the
        // session: Codex 0.172 keeps a command past its yield as a background terminal and says its
        // end (tool_call_ended, its output) after the turn, with no turn of its own. Counted and shown
        // as background work, so the session isn't parked under it and its result reaches the task.
        if (o.kind === "completed")
          for (const [callId, t] of this.tools)
            if (!t.mcp && !t.stale && !this.tasks.has(callId)) {
              const task: HarnessTask = { type: "shell", description: commandWords(t.input), background: true, ambient: false, shown: false, ended: false, call: true };
              this.tasks.set(callId, task);
              this.show(callId, task, out);
            }
        // An aborted or failed turn's open calls are not counted (no end may ever come for them).
        if (o.kind !== "completed") for (const t of this.tools.values()) t.stale = true;
        const text = o.kind === "completed" ? "turn completed" : o.kind === "aborted" ? "turn aborted" : `turn failed (${o.failure ?? "unknown"}): ${o.reason ?? ""}`;
        // D297: a usage limit's reset, when the agent named it (OAR's quota resetsAt), and its own words.
        // D449: or the provider's own words on a free tier's cap (pi on a free key), whatever OAR called it; kept long enough to hold its X-RateLimit-* headers.
        const limit = o.kind === "failed" && (o.failure === "quota" || o.failure === "rate_limited" || !!readFreeLimit(String(o.reason ?? ""), Date.now()));
        out.push({ role: "system", text, turnEnd: true, usage: this.turnOf(this.usage()), raw: { kind: "turn_ended", outcome: o.kind, failure: o.failure, ...(limit && o.resetsAt ? { resetsAt: o.resetsAt } : {}), ...(limit && o.reason ? { reason: String(o.reason).slice(0, 800) } : {}) } });
        break;
      }
      case "exited":
        out.push({ role: "system", text: `harness exited${ev.code != null ? ` (code ${ev.code})` : ""}${ev.reason ? `: ${ev.reason}` : ""}`, raw: { kind: "exited" } });
        break;
      case "control_rejected":
        out.push({ role: "system", text: `${ev.action} rejected: ${ev.reason}`, raw: { kind: "control_rejected", code: ev.code } });
        break;
      case "input_dropped":
        out.push({ role: "system", text: `input dropped (${ev.reason})`, raw: { kind: "input_dropped" } });
        break;
      case "retry":
        out.push({ role: "system", text: `retry ${ev.attempt}${ev.reason ? `: ${ev.reason}` : ""}`, raw: { kind: "retry" } });
        break;
      case "compaction_started":
        out.push({ role: "system", text: "compaction started", raw: { kind: "compaction_started", trigger: ev.trigger } });
        break;
      case "compaction_ended": {
        this.lastContext = undefined;
        // D288: the sizes the native frame gave (Claude Code's pre_tokens / post_tokens, pi's tokensBefore).
        const n = this.compactNative;
        this.compactNative = undefined;
        const sizes = { ...(n?.before ? { before: n.before } : {}), ...(n?.after ? { after: n.after } : {}) };
        out.push({ role: "system", text: `compaction ${ev.outcome}`, raw: { kind: "compaction_ended", outcome: ev.outcome, trigger: ev.trigger ?? n?.trigger, ...sizes } });
        break;
      }
      default:
        break; // model/effort/turn_started/etc. are lifecycle noise for the Log
    }
    return out;
  }

  /** D266: the background tasks the harness said it started and hasn't said ended. */
  backgroundLive(): number {
    let n = 0;
    for (const t of this.tasks.values()) if (t.shown && !t.ended) n++;
    return n;
  }

  /** A task_updated patch applied; true when the task is to be shown now. */
  private taskUpdated(ev: OarEventLike): boolean {
    const task = this.tasks.get(String(ev.taskId ?? ""));
    if (!task) return false;
    if (typeof ev.description === "string" && ev.description) task.description ??= ev.description;
    if (ev.background === true) task.background = true;
    // A Codex subagent given more work after it completed (OAR: a later task_updated says so).
    if (task.ended && ev.status === "running") {
      task.ended = false;
      task.shown = false;
      return !task.ambient;
    }
    return !task.ended && !task.shown && task.background && !task.ambient;
  }

  private show(id: string, task: HarnessTask, out: HarnessEvent[]) {
    if (task.ambient || task.shown || task.ended) return; // ambient: the harness's own upkeep (OAR)
    task.shown = true;
    out.push(this.bgEvent(id, task, "started"));
  }

  private bgEvent(id: string, task: HarnessTask, act: BackgroundAct, said: BackgroundSaid = {}): HarnessEvent {
    const what = taskWords(task.description);
    const text = { started: "running in the background", ended: "finished in the background", stopped: "stopped in the background", failed: "failed in the background" }[act];
    const stop = act === "started" && this.opts.canStop && !task.call;
    return { role: "system", text: what ? `${text}: ${what}` : text, raw: { kind: "background", background: { id, act, type: task.type, ...(task.tool ? { tool: task.tool } : {}), ...(what ? { what } : {}), ...said, ...(stop ? { stop: true } : {}) } } };
  }

  /** Flush buffered text (e.g. on stream end). */
  flush(): HarnessEvent[] {
    const out: HarnessEvent[] = [];
    this.flushText(out);
    return out;
  }

  private flushText(out: HarnessEvent[]) {
    const heads = thinkingHeadings(this.thought);
    this.thought = "";
    if (heads.length) out.push({ role: "assistant", thinking: heads });
    const text = stripThinking(this.text);
    if (text.trim()) out.push({ role: "assistant", text });
    this.text = "";
  }
}

/**
 * The headings of a stretch of thinking (Codex's reasoning summaries open each part with a bold
 * line: "**Opening App Store Connect**"); a markdown heading counts too. Its body is never kept:
 * the opened task shows the headings alone (D127). At most three, each once.
 */
export function thinkingHeadings(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*\*\*([^*\n]{2,120}?)\*\*\s*$/.exec(line) ?? /^\s*#{1,4}\s+(.{2,120}?)\s*#*\s*$/.exec(line);
    const h = m?.[1]?.trim().replace(/[:：]$/, "");
    if (h && !out.includes(h)) out.push(h);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Reasoning some models write into the reply itself (MiniMax through pi: "…</think>\n\nNo."),
 * which the harness does not separate when the model is not marked as reasoning. It never
 * reaches the user. A block with no opening tag runs from the start of the text.
 */
export function stripThinking(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const close = t.indexOf("</think>");
  if (close >= 0) t = t.slice(close + "</think>".length);
  if (t !== text) t = t.replace(/^\s+/, "");
  return t;
}

function toolOutputText(content: readonly any[] | undefined): string | undefined {
  if (!content || content.length === 0) return undefined;
  return content
    .map((p) => (p.type === "text" ? p.text : p.type === "image" ? `[image ${p.mediaType}]` : JSON.stringify(p.value)))
    .join("\n");
}
