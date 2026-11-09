// Pure projection: OAR Event -> Ducter HarnessEvent. Only structural OAR shapes are used here
// (type imports are free; values stay in oar.ts), so no OAR type leaks out of this package.
import type { HarnessEvent } from "@ducter/protocol/src/internal.ts";

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

interface PendingTool {
  name: string;
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
  private thought = "";
  private tools = new Map<string, PendingTool>();

  constructor(private readonly usage: () => HarnessEvent["usage"] | undefined) {}

  push(ev: OarEventLike): HarnessEvent[] {
    const out: HarnessEvent[] = [];
    // Root agent only: subagent chatter stays in the native transcript.
    if (ev.agentPath && ev.agentPath.length > 0) return out;
    if (ev.kind === "text_delta") {
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
          out.push({ role: "tool", tool: { name: t.name, input: { title } }, raw: { kind: "tool_call_title", callId: ev.callId } });
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
    if (ev.kind === "usage" || ev.kind === "tool_call_progress") {
      return out; // not logged; usage is folded into turnEnd
    }
    this.flushText(out);
    switch (ev.kind) {
      case "user_message":
        // Native echo of host input. The runner logs what it sends itself, so skip echoes
        // (not every runtime echoes, and echo timing differs for steer/queue).
        break;
      case "tool_call_started": {
        // One name form on every harness: an MCP tool is mcp__<server>__<tool> (claude's own
        // form; codex and pi report the server and tool apart, D85).
        const name = ev.server && ev.toolName ? `mcp__${ev.server}__${ev.toolName}` : ev.tool;
        this.tools.set(ev.callId, { name, input: ev.input });
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
        break;
      }
      case "turn_ended": {
        const o = ev.outcome ?? {};
        const text = o.kind === "completed" ? "turn completed" : o.kind === "aborted" ? "turn aborted" : `turn failed (${o.failure ?? "unknown"}): ${o.reason ?? ""}`;
        out.push({ role: "system", text, turnEnd: true, usage: this.usage(), raw: { kind: "turn_ended", outcome: o.kind, failure: o.failure } });
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
      case "compaction_ended":
        out.push({ role: "system", text: `compaction ${ev.outcome}`, raw: { kind: "compaction_ended", outcome: ev.outcome, trigger: ev.trigger } });
        break;
      default:
        break; // model/effort/turn_started/etc. are lifecycle noise for the Log
    }
    return out;
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
