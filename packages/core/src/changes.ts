// What each repo task changed so far (D128): files, lines added and removed, for On hand by
// project ("title · branch · +42 −7 · state") and the opened task's Changes header. Counting
// is a few git calls in the task's worktree (the runner's branchChanges, on a worker too), so
// it is cached here and counted again only after something could have changed it: a turn
// ending, a report, a state change. On hand reads the cache and never waits for git.
import type { BranchChanges, DiffStat, LogEvent, OnHand } from "@ducter/protocol";
import type { LogStore, Runner, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

export interface Changes {
  /** Adds the cached diff stat to each repo task on On hand; counts the ones never counted. */
  decorate(o: OnHand): OnHand;
  /** Counts one task now (tests, and after a merge). */
  refresh(taskId: string): Promise<DiffStat | undefined>;
  get(taskId: string): DiffStat | undefined;
  stop(): void;
}

const stat = (b: BranchChanges | undefined, at: string): DiffStat | undefined =>
  b && b.files != null && b.adds != null && b.dels != null ? { files: b.files, adds: b.adds, dels: b.dels, at } : undefined;

const same = (a: DiffStat | undefined, b: DiffStat | undefined) => !!a && !!b && a.files === b.files && a.adds === b.adds && a.dels === b.dels;

export function createChanges(o: {
  log: LogStore;
  tasks: TaskRegistry;
  runner: () => Runner | undefined;
  /** Called when a count changed what On hand shows (ws pushes a fresh on_hand). */
  onChange: () => void;
  clock?: Clock;
  /** A burst of events (a turn ending with a report) counts once. Default 1.5 s. */
  debounceMs?: number;
}): Changes {
  const clock = o.clock ?? realClock;
  const debounceMs = o.debounceMs ?? 1500;
  const cache = new Map<string, DiffStat>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Map<string, Promise<DiffStat | undefined>>();
  const tried = new Set<string>(); // counted at least once since boot (an archived worktree may not answer)

  const isRepo = (taskId: string) => o.tasks.get(taskId)?.place.kind === "repo";

  const keep = (taskId: string, s: DiffStat | undefined) => {
    if (!s) return;
    const prev = cache.get(taskId);
    cache.set(taskId, s);
    if (!same(prev, s)) o.onChange();
  };

  const refresh = (taskId: string): Promise<DiffStat | undefined> => {
    const running = inflight.get(taskId);
    if (running) return running;
    tried.add(taskId);
    const r = o.runner();
    if (!r?.branchChanges || !isRepo(taskId)) return Promise.resolve(cache.get(taskId));
    const p = r
      .branchChanges(taskId)
      .then((b) => {
        keep(taskId, stat(b, new Date(clock.now()).toISOString()));
        return cache.get(taskId);
      })
      .catch(() => cache.get(taskId))
      .finally(() => inflight.delete(taskId));
    inflight.set(taskId, p);
    return p;
  };

  const soon = (taskId: string) => {
    clearTimeout(timers.get(taskId));
    timers.set(
      taskId,
      setTimeout(() => {
        timers.delete(taskId);
        void refresh(taskId);
      }, debounceMs),
    );
  };

  const off = o.log.subscribe((e: LogEvent) => {
    const body = e.body as { taskId?: string; branch?: BranchChanges; usage?: unknown };
    const taskId = body?.taskId;
    if (!taskId || !e.stream.startsWith("task:")) return;
    // A report already carries what the branch holds, counted when it was logged.
    if (e.kind === "report") {
      keep(taskId, stat(body.branch, e.ts));
      return soon(taskId);
    }
    // The end of a turn (it carries usage) or a state change (a merge, an archive).
    if ((e.kind === "task_event" && body.usage) || e.kind === "task_state") {
      if (isRepo(taskId)) soon(taskId);
    }
  });

  return {
    decorate(on) {
      for (const c of on.tasks) {
        if (c.place.kind !== "repo") continue;
        const s = cache.get(c.taskId) ?? stat(c.lastReport?.branch, c.lastReport ? c.updatedAt : "");
        if (s) c.changes = s;
        if (!tried.has(c.taskId)) {
          tried.add(c.taskId);
          soon(c.taskId);
        }
      }
      return on;
    },
    refresh,
    get: (taskId) => cache.get(taskId),
    stop() {
      off();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
