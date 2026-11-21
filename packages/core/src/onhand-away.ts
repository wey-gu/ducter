// D454: 移走 / Remove: a finished card the person took off On hand. A task that is done or didn't work
// out, or a group none of whose parts is at work, leaves On hand on every device; it stays in Past
// tasks (nothing is deleted, the Log keeps it). A task that goes back to work (再试一次, 接着做) comes
// back by itself, and so does its group. Kept in <dataDir>/onhand-away.json; entries older than a
// few days are let go (a finished task leaves On hand after a day anyway).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Attention, Bodies, LogEvent } from "@ducter/protocol";

export const AWAY_FILE = "onhand-away.json";
/** Back at work: a done that only waits for its merge (done_claimed) is still finished. */
const AT_WORK: Attention[] = ["queued", "working", "needs_you", "blocked"];
/** How long a put-away entry is kept: past it the card would have left On hand on its own. */
const KEEP_MS = 3 * 24 * 3600_000;

export interface OnHandAway {
  /** Takes these tasks and groups off On hand (back: puts them back). */
  put(o: { taskIds?: string[]; groupIds?: string[]; back?: boolean }): void;
  isTask(taskId: string): boolean;
  isGroup(groupId: string): boolean;
  tasks(): string[];
  /** A Log event: a task that goes back to work comes back to On hand, with its group. */
  onEvent(e: LogEvent): void;
}

export interface OnHandAwayDeps {
  dataDir: string;
  now?: () => number;
  /** The group a task is in, if any. */
  groupOf?: (taskId: string) => string | undefined;
  changed?: () => void;
}

export function createOnHandAway(d: OnHandAwayDeps): OnHandAway {
  const file = join(d.dataDir, AWAY_FILE);
  const now = d.now ?? Date.now;
  let tasks: Record<string, string> = {};
  let groups: Record<string, string> = {};
  if (existsSync(file))
    try {
      const j = JSON.parse(readFileSync(file, "utf8")) as { tasks?: Record<string, string>; groups?: Record<string, string> };
      if (j.tasks && typeof j.tasks === "object") tasks = j.tasks;
      if (j.groups && typeof j.groups === "object") groups = j.groups;
    } catch (err) {
      console.warn(`[away] ${file} is unreadable; starting empty:`, (err as Error).message);
    }
  const prune = (m: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const [k, at] of Object.entries(m)) if (now() - Date.parse(at) < KEEP_MS) out[k] = at;
    return out;
  };
  const save = () => {
    tasks = prune(tasks);
    groups = prune(groups);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, tasks, groups }) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
    d.changed?.();
  };
  return {
    put({ taskIds = [], groupIds = [], back }) {
      const at = new Date(now()).toISOString();
      let touched = false;
      for (const id of taskIds.filter((x) => typeof x === "string" && x)) {
        if (back) delete tasks[id];
        else tasks[id] = at;
        touched = true;
      }
      for (const id of groupIds.filter((x) => typeof x === "string" && x)) {
        if (back) delete groups[id];
        else groups[id] = at;
        touched = true;
      }
      if (touched) save();
    },
    isTask: (id) => id in tasks,
    isGroup: (id) => id in groups,
    tasks: () => Object.keys(tasks),
    onEvent(e) {
      if (e.kind !== "task_state") return;
      const b = e.body as Bodies["task_state"];
      if (!(b.taskId in tasks) || !AT_WORK.includes(b.attention as Attention)) return;
      delete tasks[b.taskId];
      const g = d.groupOf?.(b.taskId);
      if (g) delete groups[g];
      save();
    },
  };
}
