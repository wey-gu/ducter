// Rendering of Log events into the partner's input.
//   L4 deltas:   renderTrigger()   one origin-tagged line (block) per trigger event
//   cold seed:   renderProjection() background blocks for a fresh session (L2, simplified)
// Rule (principle 4, research/13): a fresh session reads as an ongoing conversation.
// Nothing rendered here may say the session was reset, restarted, or lost.
import type { Bodies, LogEvent, TaskCard } from "../../protocol/src/index.ts";

const CJK = /[㐀-鿿豈-﫿]/;
export function isChinese(text: string): boolean {
  return CJK.test(text);
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+\n/g, "\n").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderTime(now: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `[time] ${hhmm(now.toISOString())} ${days[now.getDay()]}`;
}

function renderReport(r: Bodies["report"], title?: string): string {
  const head = `[task ${r.taskId}${title ? ` "${title}"` : ""} report: ${r.state}] ${clip(r.summary, 600)}`;
  const lines = [head];
  for (const ev of r.evidence ?? []) lines.push(`  evidence (${ev.kind}): ${ev.label} -> ${ev.ref}`);
  for (const q of r.questions ?? []) {
    lines.push(
      `  question ${q.id}${q.blocking ? " (blocking)" : ""}: ${q.text}` +
        (q.default ? ` [default: ${q.default}${q.reversible ? "" : ", not reversible"}]` : ""),
    );
  }
  if (r.state === "done" && (r.evidence ?? []).length === 0) lines.push("  (no evidence attached)");
  return lines.join("\n");
}

export interface RenderCtx {
  taskTitle(taskId: string): string | undefined;
  decision(decisionId: string): Bodies["decision"] | undefined;
}

/** One L4 delta for a trigger event, tagged by origin. */
export function renderTrigger(e: LogEvent, ctx: RenderCtx): string {
  switch (e.kind) {
    case "user_msg":
      return `[user] ${(e.body as Bodies["user_msg"]).text}`;
    case "report": {
      const r = e.body as Bodies["report"];
      return renderReport(r, ctx.taskTitle(r.taskId));
    }
    case "decision_resolved": {
      const b = e.body as Bodies["decision_resolved"];
      const d = ctx.decision(b.decisionId);
      const about = d ? ` (task ${d.taskId}: "${d.question}")` : ` (decision ${b.decisionId})`;
      const by = b.by === "default" ? " by default" : "";
      return `[decision resolved: ${b.option}${by}]${about}${b.text ? ` ${b.text}` : ""}`;
    }
    case "job_status": {
      const b = e.body as Bodies["job_status"];
      if (e.origin === "waiter") return `[timer fired] ${b.text}${b.taskId ? ` (task ${b.taskId})` : ""}`;
      return `[job ${b.jobId} ${b.state}] ${b.text}`;
    }
    case "ai_msg":
      return `[${e.origin}] ${(e.body as Bodies["ai_msg"]).text}`;
    default:
      return `[${e.origin} ${e.kind}] ${clip(JSON.stringify(e.body), 400)}`;
  }
}

/** Compact one-line rendering of a channel event for the background block, or null to skip. */
export function renderHistoryLine(e: LogEvent, ctx: RenderCtx): string | null {
  const t = hhmm(e.ts);
  switch (e.kind) {
    case "user_msg":
      return `[${t} user] ${clip((e.body as Bodies["user_msg"]).text, 1200)}`;
    case "ai_msg":
      return `[${t} you] ${clip((e.body as Bodies["ai_msg"]).text, 800)}`;
    case "ack":
      return `[${t} you] ${clip((e.body as Bodies["ack"]).text, 300)}`;
    case "job_status": {
      const b = e.body as Bodies["job_status"];
      if (e.origin === "waiter") return `[${t} timer] ${b.text} (${b.state === "running" ? "set" : "fired"})`;
      if (!b.taskId) return null;
      return `[${t} task ${b.taskId} ${b.state}] ${clip(b.text, 160)}`;
    }
    case "report": {
      const r = e.body as Bodies["report"];
      const ev = (r.evidence ?? []).map((x) => `${x.kind}:${x.label}`).join(", ");
      return `[${t} task ${r.taskId} report: ${r.state}] ${clip(r.summary, 300)}${ev ? ` (evidence: ${ev})` : ""}`;
    }
    case "decision": {
      const d = e.body as Bodies["decision"];
      return `[${t} task ${d.taskId} asks] ${clip(d.question, 300)} (Go: ${d.goLabel}, default ${d.defaultOption})`;
    }
    case "decision_resolved": {
      const b = e.body as Bodies["decision_resolved"];
      const d = ctx.decision(b.decisionId);
      return `[${t} decision resolved: ${b.option}${b.by === "default" ? " by default" : ""}]${d ? ` "${clip(d.question, 120)}"` : ""}${b.text ? ` ${clip(b.text, 300)}` : ""}`;
    }
    default:
      return null; // living_msg is a rendering of reports; read receipts etc. carry nothing
  }
}

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

export function renderTasks(cards: TaskCard[], maxDone = 8): string {
  const open = cards.filter((c) => ACTIVE.has(c.attention));
  const closed = cards
    .filter((c) => !ACTIVE.has(c.attention))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, maxDone);
  const line = (c: TaskCard) => {
    const where =
      c.place.kind === "repo" ? ` · repo ${c.place.repoPath}` : c.place.kind === "folder" ? ` · folder ${c.place.path}` : c.place.kind === "browser" ? " · browser" : "";
    const last = c.lastReport ? ` · last report (${c.lastReport.state}): ${clip(c.lastReport.summary, 200)}` : "";
    return `- ${c.taskId} "${c.title}" · ${c.attention}${where}${last}`;
  };
  const out: string[] = [];
  out.push("Open:");
  out.push(...(open.length ? open.map(line) : ["- (none)"]));
  if (closed.length) {
    out.push("Recently finished:");
    out.push(...closed.map(line));
  }
  return out.join("\n");
}

/** Background for a fresh session: last N channel events + tasks. No reset language. */
export function renderProjection(history: LogEvent[], cards: TaskCard[], ctx: RenderCtx): string {
  const lines = history.map((e) => renderHistoryLine(e, ctx)).filter((x): x is string => x !== null);
  const parts: string[] = [];
  if (lines.length) parts.push(`<conversation_so_far>\n${lines.join("\n")}\n</conversation_so_far>`);
  if (cards.length) parts.push(`<tasks>\n${renderTasks(cards)}\n</tasks>`);
  return parts.join("\n\n");
}
