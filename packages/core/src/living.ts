// The living message (principle 7, conversation.md): at most one open `living_msg` on the
// channel, rendered deterministically from task cards, reports and decisions. Revisions
// supersede the open one; a read receipt freezes it and the next change starts a fresh one.
import type { Bodies, LivingItem, LogEvent, TaskCard } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import type { Decisions } from "./decisions.ts";
import type { CoreRegistry } from "./registry.ts";

const RENDER_KINDS = new Set(["report", "decision", "decision_resolved", "task_state", "task_open"]);
const KIND_ORDER: LivingItem["kind"][] = ["decision", "blocked", "failed", "progress", "done"];
const WINDOW_MS = 24 * 3600 * 1000;

const sig = (i: LivingItem) => JSON.stringify([i.taskId, i.kind, i.text, i.decisionId ?? ""]);

export function itemsFor(c: TaskCard, decisions: Decisions, pending: string[]): LivingItem[] {
  const base = { taskId: c.taskId, title: c.title };
  const r = c.lastReport;
  const open = pending.filter((id) => decisions.isPending(id));
  if (open.length) {
    return open.map((id) => ({ ...base, kind: "decision" as const, text: decisions.get(id)!.question, decisionId: id }));
  }
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

export function createLiving(opts: { log: LogStore; tasks: CoreRegistry; decisions: Decisions; clock?: Clock }): Living {
  const { log, tasks, decisions } = opts;
  const clock = opts.clock ?? realClock;
  const seen = new Set<string>(); // items already shown in a frozen (read) message
  let open: { seq: number; key: string; items: LivingItem[] } | undefined;

  // Rebuild open/seen from history.
  const history = log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["living_msg", "read_receipt"] });
  const readUpTo = Math.max(0, ...history.filter((e) => e.kind === "read_receipt").map((e) => (e.body as Bodies["read_receipt"]).upToSeq));
  for (const e of history) {
    if (e.kind !== "living_msg") continue;
    const items = (e.body as Bodies["living_msg"]).items;
    if (e.seq <= readUpTo) items.forEach((i) => seen.add(sig(i)));
    else open = items.length ? { seq: e.seq, key: JSON.stringify(items), items } : undefined;
  }

  const compute = (): LivingItem[] => {
    const now = clock.now();
    const items: LivingItem[] = [];
    for (const c of tasks.list()) {
      if (c.attention === "dropped" || c.attention === "superseded") continue;
      const pending = tasks.pendingDecisions(c.taskId);
      if (!pending.length && now - Date.parse(c.updatedAt) > WINDOW_MS) continue;
      for (const i of itemsFor(c, decisions, pending)) if (!seen.has(sig(i))) items.push(i);
    }
    return items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  };

  const render = () => {
    const items = compute();
    const key = JSON.stringify(items);
    if (open ? open.key === key : !items.length) return undefined;
    const e = log.append({
      stream: "channel",
      origin: "system",
      kind: "living_msg",
      body: { items },
      ...(open ? { supersedes: open.seq } : {}),
    });
    // An emptied message is retired; the next change starts a fresh one.
    open = items.length ? { seq: e.seq, key, items } : undefined;
    return e;
  };

  let scheduled = false;
  let stopped = false;
  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "read_receipt") {
      if (open && (e.body as Bodies["read_receipt"]).upToSeq >= open.seq) {
        open.items.forEach((i) => seen.add(sig(i)));
        open = undefined;
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
    openSeq: () => open?.seq,
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}
