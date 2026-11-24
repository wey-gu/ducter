// D543: the tasks this device opened lately, kept in IndexedDB (their newest events and their
// session index), so a task opened while the link is down, or after a cold start offline, reads as
// it last did instead of an empty page. The home's own history replaces it as soon as it answers:
// a kept window is applied as a page the store already understands (task_history, task_index) and
// marked stale, so the next welcome asks the home again (D284, D320).
import type { LogEvent } from "@ducter/protocol";
import type { SessionIndex } from "@ducter/protocol/src/session.ts";
import { kvGet, kvSet } from "./idb.ts";

/** Tasks kept, the most recently opened first. */
export const TASKWIN_KEEP = 12;
/** Newest events kept per task (a first window asks for about this many). */
export const TASKWIN_EVENTS = 300;
const LIST = "taskwin.v1";
const one = (id: string) => `taskwin.v1:${id}`;

export interface TaskWindow {
  device: string;
  taskId: string;
  events: LogEvent[];
  index?: SessionIndex;
  at: number;
}

type Kv = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void> };
export const idbKv: Kv = { get: kvGet, set: kvSet };

export function taskWindows(kv: Kv = idbKv) {
  let chain: Promise<void> = Promise.resolve();
  const later = (f: () => Promise<void>) => (chain = chain.then(f).catch(() => {}));
  return {
    /** Keeps a task's window (the newest TASKWIN_EVENTS), and drops the least recent past TASKWIN_KEEP. */
    keep(w: TaskWindow) {
      const win = { ...w, events: w.events.slice(-TASKWIN_EVENTS) };
      return later(async () => {
        const list = ((await kv.get<{ device: string; ids: string[] }>(LIST)) ?? { device: w.device, ids: [] }) as { device: string; ids: string[] };
        const ids = [w.taskId, ...(list.device === w.device ? list.ids : []).filter((x) => x !== w.taskId)];
        for (const gone of ids.slice(TASKWIN_KEEP)) await kv.set(one(gone), undefined);
        await kv.set(one(w.taskId), win);
        await kv.set(LIST, { device: w.device, ids: ids.slice(0, TASKWIN_KEEP) });
      });
    },
    /** The kept window of a task, if it was kept for this device. */
    async get(device: string, taskId: string): Promise<TaskWindow | undefined> {
      await chain;
      const w = await kv.get<TaskWindow>(one(taskId)).catch(() => undefined);
      return w && w.device === device && Array.isArray(w.events) ? w : undefined;
    },
    /** Forgets them all (a device revoked, a Log that started over). */
    clear() {
      return later(async () => {
        const list = await kv.get<{ ids: string[] }>(LIST);
        for (const id of list?.ids ?? []) await kv.set(one(id), undefined);
        await kv.set(LIST, undefined);
      });
    },
    flushed: () => chain,
  };
}
