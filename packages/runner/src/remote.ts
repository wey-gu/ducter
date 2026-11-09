// Where a task's place lives: this machine, or a worker (design/system.md "Workers").
// PlaceOps is everything the runner does on the machine that holds the place: plan and provision
// the worktree, run the harness session, merge, open a PR. Local ops call places.ts / OAR /
// integrate.ts directly; remote ops send the same calls down the worker's outbound socket
// (WorkerLink), where worker-host.ts runs them. The runner keeps all task state on the main.
import { randomBytes } from "node:crypto";
import type { BranchChanges, Place } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec, WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import type { ActionResult } from "./integrate.ts";
import type { ResolvedPlace } from "./places.ts";

export interface PlaceOps {
  /** Set for a worker; undefined for this machine. */
  device?: { id: string; name: string; online(): boolean; onOnline(fn: () => void): () => void };
  plan(place: Place | undefined, taskId: string, title: string): Promise<ResolvedPlace>;
  provision(r: ResolvedPlace): Promise<void>;
  harness: HarnessPort;
  merge(place: Place): Promise<ActionResult>;
  openPr(place: Place): Promise<ActionResult>;
  /** What the task branch holds that its base doesn't (undefined: can't tell). */
  changes(place: Place): Promise<BranchChanges | undefined>;
  /** After a merge: remove the clean worktree Ducter made, keep the branch (integrate.ts). */
  archive(place: Place): Promise<ActionResult & { removed: boolean }>;
}

/** The device a place names; "local", empty, or absent mean this machine. */
export function deviceOf(place: Place | undefined): string | undefined {
  const d = (place as { device?: string } | undefined)?.device?.trim();
  return d && d !== "local" ? d : undefined;
}

/** Thrown when a session or request can't reach its worker. */
export class DeviceOfflineError extends Error {
  readonly offline = true;
  constructor(readonly device: string) {
    super(`${device} is not connected`);
  }
}
export const isOffline = (err: unknown): boolean => Boolean((err as { offline?: boolean } | undefined)?.offline);

/** Turn sent to a task resumed after its worker came back. */
export const DEVICE_BACK =
  "The machine you run on lost its connection to Ducter for a while and is back. Check where the work stands, then continue the task. Report via report_to_main when done, blocked, or needing a decision.";

/** A HarnessSession whose process runs on a worker. Events arrive as WorkerSessionFrames. */
function remoteSession(link: WorkerLink, key: string, init: { sessionId?: string; canSteer: boolean }): HarnessSession {
  let id = init.sessionId ?? "";
  let busy = false;
  const queue: HarnessEvent[] = [];
  let done: { error?: string; offline?: boolean } | undefined;
  let wake: (() => void) | undefined;
  const off = link.onSession(key, (f: WorkerSessionFrame) => {
    if (f.t === "ev") {
      busy = f.busy;
      if (f.sessionId) id = f.sessionId;
      queue.push(f.ev);
    } else done = { ...(f.error ? { error: f.error } : {}), ...(f.offline ? { offline: true } : {}) };
    wake?.();
  });
  const call = (op: string, args: object) =>
    link.call<{ busy?: boolean }>(op, { key, ...args }).then((r) => {
      if (typeof r?.busy === "boolean") busy = r.busy;
    });
  return {
    get id() {
      return id;
    },
    canSteer: init.canSteer,
    busy: () => busy,
    async send(text, mode) {
      busy = busy || mode === "turn" || mode === undefined;
      await call("send", { text, mode });
    },
    interrupt: () => call("interrupt", {}),
    async close() {
      off();
      await link.call("close", { key }, 10_000).catch(() => {});
    },
    async *events() {
      for (;;) {
        while (queue.length) yield queue.shift()!;
        if (done) {
          off();
          if (done.offline) throw new DeviceOfflineError(link.name);
          if (done.error) throw new Error(done.error);
          return;
        }
        await new Promise<void>((r) => (wake = r));
        wake = undefined;
      }
    },
  };
}

export function remoteOps(link: WorkerLink): PlaceOps {
  const guard = <T>(p: Promise<T>) => p.catch((err) => Promise.reject(isOffline(err) ? new DeviceOfflineError(link.name) : err));
  return {
    device: link,
    plan: (place, taskId, title) => guard(link.call<ResolvedPlace>("plan", { place, taskId, title })),
    provision: (r) => guard(link.call<void>("provision", { resolved: r }, 10 * 60_000)),
    harness: {
      async start(spec: SessionSpec) {
        const key = randomBytes(8).toString("hex");
        // The worker answers start before it sends the session's first frame, on one ordered
        // socket; the answer resolves in a microtask, so the listener is in place in time.
        const r = await guard(link.call<{ sessionId?: string; canSteer: boolean }>("start", { key, spec }, 5 * 60_000));
        return remoteSession(link, key, r);
      },
      available: async () => [],
    },
    merge: (place) => guard(link.call<ActionResult>("merge", { place }, 5 * 60_000)),
    openPr: (place) => guard(link.call<ActionResult>("openPr", { place }, 5 * 60_000)),
    // An older worker doesn't know "changes": unknown, never an error in a report.
    changes: (place) => link.call<BranchChanges | undefined>("changes", { place }, 10_000).catch(() => undefined),
    // An older worker doesn't know "archive": its worktree stays, as before.
    archive: (place) => link.call<ActionResult & { removed: boolean }>("archive", { place }, 60_000).catch((err) => ({ ok: false, removed: false, message: `Kept the worktree on ${link.name}: ${err instanceof Error ? err.message : String(err)}` })),
  };
}
