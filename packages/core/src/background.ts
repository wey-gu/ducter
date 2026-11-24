// D518: each task's background work (its agent's background shells, subagents, watches, jobs),
// folded from the task's Log and carried on its card (TaskCard.background), so the opened task's
// tray and On hand's quiet count read one list. A task's acts are read once from its stream, then
// kept as the Log grows; nothing here runs on a task that never went to the background.
import { backgroundOf, type LogEvent, type OnHand, type Residency, type TaskBackground } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

type Act = { ts: string; kind: string; body: unknown };

const isAct = (e: { kind: string; body: unknown }) => {
  if (e.kind !== "task_event") return false;
  const raw = (e.body as { raw?: { background?: unknown; backgroundCeiling?: unknown } } | null)?.raw;
  return !!raw && (raw.background !== undefined || raw.backgroundCeiling !== undefined);
};

/** A session is still there (its background work can still be running) in these. */
const LIVE: Residency[] = ["provisioning", "hot", "warm", "offline"];

export interface BackgroundIndex {
  /** One Log event: a background act is kept; true when it was one (On hand changed). */
  onEvent(e: LogEvent): boolean;
  /** A task's background work as its card says it, or undefined when it never had any. */
  of(taskId: string, residency: Residency): TaskBackground | undefined;
  /** Every card of On hand with its background work. */
  decorate(o: OnHand): OnHand;
}

export function createBackgroundIndex(log: Pick<LogStore, "read">): BackgroundIndex {
  const acts = new Map<string, Act[]>();
  const page = 2000;
  const load = (taskId: string): Act[] => {
    let a = acts.get(taskId);
    if (a) return a;
    a = [];
    // Read forward in pages; only the background acts are kept.
    for (let from = 0; ; ) {
      const evs = log.read({ stream: `task:${taskId}`, kinds: ["task_event"], fromSeq: from, limit: page });
      for (const e of evs) if (isAct(e)) a.push({ ts: e.ts, kind: e.kind, body: e.body });
      if (evs.length < page) break;
      from = evs.at(-1)!.seq + 1;
    }
    acts.set(taskId, a);
    return a;
  };
  const taskOf = (e: LogEvent) => (e.stream.startsWith("task:") ? e.stream.slice(5) : undefined);
  return {
    onEvent(e) {
      if (!isAct(e)) return false;
      const id = taskOf(e);
      if (!id) return false;
      // Not read yet: its first read takes this one too.
      acts.get(id)?.push({ ts: e.ts, kind: e.kind, body: e.body });
      return true;
    },
    of(taskId, residency) {
      const a = load(taskId);
      return a.length ? backgroundOf(a, LIVE.includes(residency)) : undefined;
    },
    decorate(o) {
      let changed = false;
      const tasks = o.tasks.map((c) => {
        const b = this.of(c.taskId, c.residency);
        if (!b) return c;
        changed = true;
        return { ...c, background: b };
      });
      return changed ? { ...o, tasks } : o;
    },
  };
}
