// D244: 新结果 / New result. A finished task (done, done as claimed, didn't work) whose card changed
// after this device last had it open, counting only finishes after this device started keeping
// track (so a fresh install shows none). Kept per device in localStorage; opening the task clears
// it. The Mac keeps the same in its data folder (apps/desktop/internal/hints).
//
// The status place of a row (onhand.tsx): needs you > working > new result. A row this page saw
// working that turns into a new result plays the handover once (the reading face sinks, the done
// face pops up).

const KEY = "ducter.seen";
/** How many tasks are remembered at most; the oldest go first. */
const KEEP = 400;

export interface SeenState {
  /** When this device started keeping track (ISO). */
  since: string;
  /** taskId → the card's updatedAt when this device last had it open. */
  seen: Record<string, string>;
}

type Store = { get(): string | null; set(v: string): void };
const ls: Store = {
  get: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (v) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  },
};

export function readSeen(s: Store = ls, now = () => new Date().toISOString()): SeenState {
  try {
    const v = JSON.parse(s.get() ?? "") as Partial<SeenState>;
    if (typeof v.since === "string" && v.seen && typeof v.seen === "object") return { since: v.since, seen: { ...v.seen } };
  } catch {}
  const fresh = { since: now(), seen: {} };
  s.set(JSON.stringify(fresh));
  return fresh;
}

let state: SeenState | undefined;
let store: Store = ls;
const cur = () => (state ??= readSeen(store));

/** For tests: a fresh state over a given store. */
export function resetSeen(s: Store = ls, at?: string) {
  store = s;
  state = undefined;
  if (at) {
    state = { since: at, seen: {} };
    s.set(JSON.stringify(state));
  }
  handed.clear();
  wasWorking.clear();
}

type Card = { attention?: string; updatedAt?: string } | undefined;
const FINISHED = ["done", "done_claimed", "failed"];
const later = (a: string | undefined, b: string | undefined) => !!a && (!b || Date.parse(a) > Date.parse(b));

/** Whether the task is a new result on this device. */
export function isNewResult(taskId: string, attention: string, updatedAt: string | undefined): boolean {
  if (!FINISHED.includes(attention) || !updatedAt) return false;
  const s = cur();
  const mark = s.seen[taskId];
  return later(updatedAt, s.since) && later(updatedAt, mark);
}

/** The task is open on this device: whatever it says now has been seen. */
export function markSeen(taskId: string, updatedAt: string | undefined) {
  if (!updatedAt) return;
  const s = cur();
  if (s.seen[taskId] === updatedAt) return;
  if (!later(updatedAt, s.seen[taskId])) return;
  s.seen[taskId] = updatedAt;
  const ids = Object.keys(s.seen);
  if (ids.length > KEEP) {
    ids.sort((a, b) => Date.parse(s.seen[a]!) - Date.parse(s.seen[b]!));
    for (const id of ids.slice(0, ids.length - KEEP)) delete s.seen[id];
  }
  store.set(JSON.stringify(s));
}

/** A row's one status place, in priority: needs you > working > new result. */
export type Status = "needs" | "working" | "new" | "";
export function statusOf(taskId: string, attention: string, updatedAt: string | undefined): Status {
  if (attention === "needs_you") return "needs";
  if (attention === "working" || attention === "queued") return "working";
  return isNewResult(taskId, attention, updatedAt) ? "new" : "";
}

/** The most urgent status in a group (a folded project keeps its mark). */
export function urgentOf(statuses: Status[]): Status {
  for (const s of ["needs", "working", "new"] as const) if (statuses.includes(s)) return s;
  return "";
}

// The handover: a row this page saw working that turns into a new result plays once.
const wasWorking = new Set<string>();
const handed = new Map<string, number>();
/** HANDOVER_MS: how long the handover's class stays on (the pop is ~520 ms). */
export const HANDOVER_MS = 700;

/** Called as a row draws; true while its handover should play. */
export function handover(taskId: string, status: Status, now = Date.now()): boolean {
  if (status === "working") {
    wasWorking.add(taskId);
    return false;
  }
  if (status === "new" && wasWorking.has(taskId)) {
    wasWorking.delete(taskId);
    handed.set(taskId, now);
  } else if (status !== "new") wasWorking.delete(taskId);
  const at = handed.get(taskId);
  if (at === undefined) return false;
  if (now - at > HANDOVER_MS) {
    handed.delete(taskId);
    return false;
  }
  return true;
}
