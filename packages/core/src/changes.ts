// What each task changed so far, for On hand and the opened task's Changes header.
// Repo tasks (D128): files, lines added and removed, for On hand by project ("title · branch ·
// +42 −7 · state") and "改动 · 3 个文件 +42 −7". Folder tasks that aren't a repo (D130): what
// was added, changed, removed, moved or renamed against the copy Ducter kept, and until when it
// can be undone. Counting is a few git calls in the task's worktree (the runner's
// branchChanges) or a walk of the folder (folderChanges), on a worker too, so it is cached here
// and counted again only after something could have changed it: a turn ending, a report, a
// state change, an undo. On hand reads the cache and never waits.
import type { BranchChanges, DiffStat, FolderSummary, LogEvent, OnHand } from "@ducter/protocol";
import type { LogStore, Runner, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

export interface Changes {
  /** Adds the cached diff stat to each repo task on On hand (the folder summary to each folder
   *  task); counts the ones never counted. */
  decorate(o: OnHand): OnHand;
  /** Counts one task now (tests, and after a merge or an undo). */
  refresh(taskId: string): Promise<DiffStat | undefined>;
  get(taskId: string): DiffStat | undefined;
  folder(taskId: string): FolderSummary | undefined;
  stop(): void;
}

const stat = (b: BranchChanges | undefined, at: string): DiffStat | undefined =>
  b && b.files != null && b.adds != null && b.dels != null ? { files: b.files, adds: b.adds, dels: b.dels, at } : undefined;

const same = (a: DiffStat | undefined, b: DiffStat | undefined) => !!a && !!b && a.files === b.files && a.adds === b.adds && a.dels === b.dels;

const sameFolder = (a: FolderSummary | undefined, b: FolderSummary | undefined) =>
  !!a && !!b && (["added", "changed", "removed", "moved", "renamed", "folders", "undo", "undoUntil"] as const).every((k) => a[k] === b[k]);

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
  const folders = new Map<string, FolderSummary>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Map<string, Promise<DiffStat | undefined>>();
  const tried = new Set<string>(); // counted at least once since boot (an archived worktree may not answer)

  const kindOf = (taskId: string) => o.tasks.get(taskId)?.place.kind;
  const counted = (taskId: string) => {
    const k = kindOf(taskId);
    return k === "repo" || k === "folder";
  };

  const keep = (taskId: string, s: DiffStat | undefined) => {
    if (!s) return;
    const prev = cache.get(taskId);
    cache.set(taskId, s);
    if (!same(prev, s)) o.onChange();
  };

  const keepFolder = (taskId: string, s: FolderSummary | undefined) => {
    if (!s) return;
    const prev = folders.get(taskId);
    folders.set(taskId, s);
    if (!sameFolder(prev, s)) o.onChange();
  };

  const countFolder = async (r: Runner, taskId: string) => {
    const c = await r.folderChanges!(taskId);
    if (!c) return;
    const { files: _f, more: _m, ...summary } = c;
    keepFolder(taskId, summary);
  };

  const refresh = (taskId: string): Promise<DiffStat | undefined> => {
    const running = inflight.get(taskId);
    if (running) return running;
    tried.add(taskId);
    const r = o.runner();
    const kind = kindOf(taskId);
    if (kind === "folder" && r?.folderChanges) {
      const p = countFolder(r, taskId)
        .catch(() => {})
        .then(() => undefined)
        .finally(() => inflight.delete(taskId));
      inflight.set(taskId, p);
      return p;
    }
    if (!r?.branchChanges || kind !== "repo") return Promise.resolve(cache.get(taskId));
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
    const body = e.body as { taskId?: string; branch?: BranchChanges; folder?: FolderSummary; usage?: unknown; raw?: { effect?: string } };
    const taskId = body?.taskId;
    if (!taskId || !e.stream.startsWith("task:")) return;
    // A report already carries what the branch (or the folder) holds, counted when it was logged.
    if (e.kind === "report") {
      keep(taskId, stat(body.branch, e.ts));
      keepFolder(taskId, body.folder);
      return soon(taskId);
    }
    // The end of a turn (it carries usage), a state change (a merge, an archive), or an undo
    // or keep of a folder (D130).
    const folderEffect = e.kind === "task_event" && /^folder_/.test(body.raw?.effect ?? "");
    if ((e.kind === "task_event" && body.usage) || e.kind === "task_state" || folderEffect) {
      if (counted(taskId)) soon(taskId);
    }
  });

  return {
    decorate(on) {
      for (const c of on.tasks) {
        if (c.place.kind === "folder") {
          const f = folders.get(c.taskId) ?? (c.lastReport?.folder as FolderSummary | undefined);
          if (f) c.folder = f;
        } else if (c.place.kind === "repo") {
          const s = cache.get(c.taskId) ?? stat(c.lastReport?.branch, c.lastReport ? c.updatedAt : "");
          if (s) c.changes = s;
        } else continue;
        if (!tried.has(c.taskId)) {
          tried.add(c.taskId);
          soon(c.taskId);
        }
      }
      return on;
    },
    refresh,
    get: (taskId) => cache.get(taskId),
    folder: (taskId) => folders.get(taskId),
    stop() {
      off();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
