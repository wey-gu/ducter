// The living message (principle 7, conversation.md): at most one open `living_msg` on the
// channel, rendered deterministically from task cards, reports and decisions. Revisions
// supersede the open one; a read receipt freezes it and the next change starts a fresh one.
import type { Bodies, LivingItem, LogEvent, TaskCard } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import type { Decisions } from "./decisions.ts";
import type { CoreRegistry } from "./registry.ts";

const RENDER_KINDS = new Set(["report", "decision", "decision_resolved", "decision_later", "decision_back", "task_state", "task_open"]);
const KIND_ORDER: LivingItem["kind"][] = ["decision", "blocked", "failed", "progress", "done"];
const WINDOW_MS = 24 * 3600 * 1000;

// D382: a question back from Ask me later is new again, even where it was read before it went.
const sig = (i: LivingItem) => JSON.stringify([i.taskId, i.kind, i.text, i.decisionId ?? "", i.back ?? ""]);

export function itemsFor(c: TaskCard, decisions: Decisions, pending: string[]): LivingItem[] {
  const base = { taskId: c.taskId, title: c.title };
  const r = c.lastReport;
  const live = pending.filter((id) => decisions.isPending(id));
  // D382: a question put off is out of the message until it is back (then said once as back).
  const open = live.filter((id) => decisions.laterUntil(id) === undefined);
  if (open.length) {
    const backAt = c.pendingDecision?.backAt;
    return open.map((id) => ({ ...base, kind: "decision" as const, text: decisions.get(id)!.question, decisionId: id, ...(backAt && c.pendingDecisionId === id ? { back: backAt } : {}) }));
  }
  if (live.length) return [];
  // D584: a routine's round that went well or is under way is a silent round (standing-work.md
  // "How it reports"): its lantern and its page carry it, never a template line here. What the
  // round found worth saying the partner says in its own words; a round that didn't work stays, and
  // so does every round of a routine the person asked to hear each time (a digest: reports "every").
  if (c.fromRoutine && c.fromRoutine.reports !== "every" && c.attention !== "failed" && c.attention !== "blocked") return [];
  switch (c.attention) {
    case "blocked":
      return [{ ...base, kind: "blocked", text: r?.state === "blocked" ? r.summary : c.reason ?? "Waiting" }];
    case "failed":
      return [{ ...base, kind: "failed", text: r?.summary ?? c.reason ?? "Failed" }];
    case "done":
    case "done_claimed": {
      const item: LivingItem = { ...base, kind: "done", text: r?.summary ?? "Done" };
      if (r?.evidence.length) item.evidence = r.evidence;
      return [item];
    }
    case "working":
    case "queued":
      return r?.state === "progress" ? [{ ...base, kind: "progress", text: r.summary }] : [];
    default:
      return [];
  }
}

export interface Living {
  render(): LogEvent<"living_msg"> | undefined;
  openSeq(): number | undefined;
  stop(): void;
}

/**
 * D312: with more than one partner, each partner's conversation has its own living message, of
 * its own tasks (streamOf: a task's conversation; default: every task is the one conversation's).
 */
export function createLiving(opts: { log: LogStore; tasks: CoreRegistry; decisions: Decisions; clock?: Clock; streamOf?: (c: TaskCard) => string }): Living {
  const { log, tasks, decisions } = opts;
  const clock = opts.clock ?? realClock;
  const streamOf = opts.streamOf ?? (() => "channel");
  const seen = new Set<string>(); // items already shown in a frozen (read) message
  const opens = new Map<string, { seq: number; key: string; items: LivingItem[] }>(); // by conversation

  // Rebuild open/seen from history.
  const history = log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["living_msg", "read_receipt"] });
  const readUpTo = new Map<string, number>();
  for (const e of history) if (e.kind === "read_receipt") readUpTo.set(e.stream, Math.max(readUpTo.get(e.stream) ?? 0, (e.body as Bodies["read_receipt"]).upToSeq));
  for (const e of history) {
    if (e.kind !== "living_msg") continue;
    const items = (e.body as Bodies["living_msg"]).items;
    if (e.seq <= (readUpTo.get(e.stream) ?? 0)) items.forEach((i) => seen.add(sig(i)));
    else if (items.length) opens.set(e.stream, { seq: e.seq, key: JSON.stringify(items), items });
    else opens.delete(e.stream);
  }

  const compute = (stream: string): LivingItem[] => {
    const now = clock.now();
    const items: LivingItem[] = [];
    // D584: one routine's rounds that didn't work are one line, its newest: three mornings of
    // "Gmail needs signing in again" are one thing to fix.
    const newestRound = new Map<string, TaskCard>();
    for (const c of tasks.list()) {
      if (!c.fromRoutine || c.attention !== "failed") continue;
      const was = newestRound.get(c.fromRoutine.routineId);
      if (!was || Date.parse(c.updatedAt) >= Date.parse(was.updatedAt)) newestRound.set(c.fromRoutine.routineId, c);
    }
    for (const c of tasks.list()) {
      if (c.fromRoutine && c.attention === "failed" && newestRound.get(c.fromRoutine.routineId)?.taskId !== c.taskId) continue;
      if (c.attention === "dropped" || c.attention === "superseded") continue;
      if (streamOf(c) !== stream) continue;
      const pending = tasks.pendingDecisions(c.taskId);
      if (!pending.length && now - Date.parse(c.updatedAt) > WINDOW_MS) continue;
      for (const i of itemsFor(c, decisions, pending)) if (!seen.has(sig(i))) items.push(i);
    }
    return items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  };

  const renderIn = (stream: string) => {
    const open = opens.get(stream);
    const items = compute(stream);
    const key = JSON.stringify(items);
    if (open ? open.key === key : !items.length) return undefined;
    const e = log.append({
      stream,
      origin: "system",
      kind: "living_msg",
      body: { items },
      ...(open ? { supersedes: open.seq } : {}),
    });
    // An emptied message is retired; the next change starts a fresh one.
    if (items.length) opens.set(stream, { seq: e.seq, key, items });
    else opens.delete(stream);
    return e;
  };
  /** Every conversation that has a task or an open message; the default's result is returned. */
  const render = () => {
    const streams = new Set(["channel", ...opens.keys(), ...tasks.list().map(streamOf)]);
    let out: LogEvent<"living_msg"> | undefined;
    for (const s of streams) {
      const e = renderIn(s);
      if (s === "channel" || !out) out = e ?? out;
    }
    return out;
  };

  let scheduled = false;
  let stopped = false;
  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "read_receipt") {
      const open = opens.get(e.stream);
      if (open && (e.body as Bodies["read_receipt"]).upToSeq >= open.seq) {
        open.items.forEach((i) => seen.add(sig(i)));
        opens.delete(e.stream);
      }
      return;
    }
    if (!RENDER_KINDS.has(e.kind) || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!stopped) render();
    });
  });

  return {
    render,
    openSeq: () => opens.get("channel")?.seq,
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}
