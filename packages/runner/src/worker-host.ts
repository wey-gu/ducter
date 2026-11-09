// The worker's side of task placement (design/system.md "Workers"). The main sends
// requests down the worker's outbound socket; this runs them here, on the worker's disk and
// harnesses: plan/provision the place, run the harness session (OAR), merge, open a PR. Session
// events stream back up. The task's MCP tools still live on the main: their URL is rewritten to
// the main's address and the worker's device token is added (the main's gate accepts a worker
// token beside the task's role token on /mcp, nowhere else).
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { runCheck } from "@ducter/protocol/src/checks-run.ts";
import { archiveWorktree, branchChanges, mergeTaskBranch, openDraftPr } from "./integrate.ts";
import { planPlace, provisionPlace } from "./places.ts";
import { createFolderStore } from "./folder.ts";
import { join } from "node:path";

export interface WorkerHostOptions {
  dataDir: string; // the worker's own ~/.ducter (worktrees, scratch)
  harness: HarnessPort;
  /** The main's http(s) base as this worker reaches it, e.g. https://ducter.example.com */
  mainBase: string;
  deviceToken: string;
  send(frame: object): void;
  gh?: string;
}

export interface WorkerHost {
  handle(frame: { t: string; id?: number; op?: string; args?: any }): Promise<void>;
  /** The socket to the main is gone: close every session (the main resumes them by id later). */
  closeAll(): Promise<void>;
  sessions(): number;
}

/** Main's loopback MCP URL → the main's address as seen from here, plus the device token. */
export function rewriteMcp(spec: SessionSpec, mainBase: string, deviceToken: string): SessionSpec {
  const base = mainBase.replace(/\/+$/, "");
  return {
    ...spec,
    mcp: spec.mcp.map((m) => {
      if (!("url" in m)) return m;
      let u: URL;
      try {
        u = new URL(m.url);
      } catch {
        return m;
      }
      if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return m;
      return { ...m, url: base + u.pathname + u.search, headers: { ...m.headers, "X-Ducter-Device": deviceToken } };
    }),
  };
}

/** HarnessEvent.raw can hold anything; keep what the runner reads, and only if it's JSON-safe. */
function wireEvent(ev: HarnessEvent): HarnessEvent {
  if (ev.raw === undefined) return ev;
  try {
    JSON.stringify(ev.raw);
    return ev;
  } catch {
    const r = ev.raw as { kind?: unknown; outcome?: unknown };
    return { ...ev, raw: { kind: r?.kind, outcome: r?.outcome } };
  }
}

export function createWorkerHost(o: WorkerHostOptions): WorkerHost {
  const sessions = new Map<string, HarnessSession>();
  // D130: the copy of a non-git folder lives here, beside the folder (folder.ts).
  const folders = createFolderStore({ root: join(o.dataDir, "snapshots") });
  folders.sweep();
  const busyOf = (s: HarnessSession) => {
    try {
      return Boolean(s.busy());
    } catch {
      return false;
    }
  };
  const idOf = (s: HarnessSession) => {
    try {
      return s.id || undefined;
    } catch {
      return undefined;
    }
  };

  async function pump(key: string, s: HarnessSession) {
    let error: string | undefined;
    try {
      for await (const ev of s.events()) o.send({ t: "ev", key, ev: wireEvent(ev), busy: busyOf(s), sessionId: idOf(s) });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (sessions.get(key) === s) sessions.delete(key);
    o.send({ t: "end", key, ...(error ? { error } : {}) });
  }

  const need = (key: string) => {
    const s = sessions.get(key);
    if (!s) throw new Error("no such session on this worker (it may have restarted)");
    return s;
  };

  const ops: Record<string, (a: any) => Promise<unknown>> = {
    plan: (a) => planPlace(a.place, a.taskId, a.title, o.dataDir),
    provision: (a) => provisionPlace(a.resolved),
    async start(a) {
      const s = await o.harness.start(rewriteMcp(a.spec, o.mainBase, o.deviceToken));
      sessions.set(a.key, s);
      // Answer first, then stream: the main registers its listener when the answer lands.
      setTimeout(() => void pump(a.key, s), 0);
      return { sessionId: idOf(s), canSteer: s.canSteer };
    },
    async send(a) {
      const s = need(a.key);
      await s.send(a.text, a.mode);
      return { busy: busyOf(s) };
    },
    async interrupt(a) {
      await need(a.key).interrupt();
      return {};
    },
    async close(a) {
      const s = sessions.get(a.key);
      sessions.delete(a.key);
      await s?.close().catch(() => {});
      return {};
    },
    merge: (a) => mergeTaskBranch(a.place),
    openPr: (a) => openDraftPr(a.place, { gh: o.gh }),
    changes: (a) => branchChanges(a.place),
    archive: (a) => archiveWorktree(a.place, o.dataDir),
    folderPrepare: (a) => folders.prepare(String(a.taskId), String(a.folder)),
    folderFinish: async (a) => {
      folders.finish(String(a.taskId));
      folders.sweep();
    },
    folderChanges: (a) => folders.changes(String(a.taskId), a.opts),
    folderUndo: (a) => folders.undo(String(a.taskId), a.opts),
    folderKeep: async (a) => folders.keep(String(a.taskId)),
    // D112: a waiter's check runs here when the task works on this device (read-only, validated
    // again here: the worker never trusts the main to have checked).
    check: (a) => runCheck(a.spec),
  };

  return {
    async handle(f) {
      if (f.t !== "req" || typeof f.id !== "number") return;
      const op = ops[f.op ?? ""];
      try {
        if (!op) throw new Error(`unknown op ${f.op}`);
        const result = await op(f.args ?? {});
        o.send({ t: "res", id: f.id, ok: true, result: result ?? null });
      } catch (err) {
        o.send({ t: "res", id: f.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    async closeAll() {
      const all = [...sessions.values()];
      sessions.clear();
      await Promise.all(all.map((s) => s.close().catch(() => {})));
    },
    sessions: () => sessions.size,
  };
}
