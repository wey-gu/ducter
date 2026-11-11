// The worker's side of task placement (design/system.md "Workers"). The main sends
// requests down the worker's outbound socket; this runs them here, on the worker's disk and
// harnesses: plan/provision the place, run the harness session (OAR), merge, open a PR. Session
// events stream back up. The task's MCP tools still live on the main: their URL is rewritten to
// the main's address and the worker's device token is added (the main's gate accepts a worker
// token beside the task's role token on /mcp, nowhere else).
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { runCheck } from "@ducter/protocol/src/checks-run.ts";
import { folderInfo, realGit, type GitRun } from "@ducter/protocol/src/folder-info.ts";
import { archiveWorktree, branchChanges, mergeTaskBranch, openDraftPr, pushForMove } from "./integrate.ts";
import { planPlace, provisionPlace } from "./places.ts";
import { createFolderStore } from "./folder.ts";
import { browserSidecar, sidecarWire, type BrowserOptions, type BrowserSidecar, type SidecarInput } from "./browser.ts";
import { join } from "node:path";

export interface WorkerHostOptions {
  dataDir: string; // the worker's own ~/.ducter (worktrees, scratch)
  harness: HarnessPort;
  /** The main's http(s) base as this worker reaches it, e.g. https://ducter.example.com */
  mainBase: string;
  deviceToken: string;
  send(frame: object): void;
  gh?: string;
  /** D197 test seam: how folderInfo runs git here. */
  git?: GitRun;
  /** D157: this computer's browsers for browser places (its Chrome and the agents' own tools,
   *  cua-driver, Ducter's own browser), as the home's runner has them. */
  browser?: BrowserOptions;
  /** D157: more ops the main may call (Ducter's own browser here: core/src/browser/remote.ts). */
  extraOps?: Record<string, (a: any) => Promise<unknown>>;
  /** D157: what this computer can do for tasks now (sent up after 上网 changes here). */
  abilities?: { set(id: "web", on: boolean): Promise<{ ok: boolean; reason?: string; detail?: string }> };
}

export interface WorkerHost {
  handle(frame: { t: string; id?: number; op?: string; args?: any }): Promise<void>;
  /** The socket to the main is gone: close every session (the main resumes them by id later). */
  closeAll(): Promise<void>;
  sessions(): number;
  /** D148: ops a restart mustn't cut short (merge, archive, folder undo/keep) running now. */
  critical(): number;
  /** Sessions in the middle of a turn. */
  turning(): number;
  /** D156: sessions on this AI agent in the middle of a turn. */
  turningOn(harness: string): number;
}

/** The ops an update waits for before it restarts this worker (D148 (4)). */
const CRITICAL_OPS = new Set(["merge", "archive", "folderUndo", "folderKeep"]);

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
  // D157: each browser place's browser here, by task (the main reads its tool events).
  const browsers = new Map<string, BrowserSidecar>();
  const harnessOf = new Map<string, string>(); // session key -> its AI agent (D156)
  // D142: the copy of a non-git folder lives here, beside the folder (folder.ts).
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
      harnessOf.set(a.key, String(a.spec?.harness ?? ""));
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
    // D157: a repo task leaving this computer pushes its branch first (E3).
    push: (a) => pushForMove(a.place),
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
    // D197: what a folder here is (missing, a folder, or a repo with its branches), so a home
    // elsewhere can add it as a project and offer its branches. Read-only.
    folderInfo: (a: { path?: unknown }) => folderInfo(String(a.path ?? ""), o.git ?? realGit),
    // D202: the models an AI agent's account offers here, with their effort levels, for the home's
    // New task card (token-free; null when it can't say). Read-only.
    models: async (a: { harness?: unknown }) => (await o.harness.models?.(String(a.harness ?? "")).catch(() => undefined)) ?? null,
    // D157: a browser place on this computer, with this computer's browsers and sign-ins.
    async browser(a: { input?: Omit<SidecarInput, "dataDir"> }) {
      const input = { ...(a.input as SidecarInput), dataDir: o.dataDir };
      if (input.place?.kind !== "browser") throw new Error("not a browser place");
      const sc = await browserSidecar(input, o.browser ?? {});
      if (!sc) throw new Error("this browser place could not be prepared");
      const old = browsers.get(input.taskId);
      browsers.set(input.taskId, sc);
      if (old && old !== sc) await old.close().catch(() => false);
      return sidecarWire(sc);
    },
    async browserReady(a: { taskId?: unknown }) {
      const sc = browsers.get(String(a.taskId ?? ""));
      if (!sc) throw new Error("no browser for that task on this computer (it may have restarted)");
      await sc.ready();
      return {};
    },
    async browserClose(a: { taskId?: unknown }) {
      const id = String(a.taskId ?? "");
      const sc = browsers.get(id);
      browsers.delete(id);
      return { closed: sc ? await sc.close().catch(() => false) : false };
    },
    // D157: 上网 added or removed on this computer's card (from any window of the home).
    async ability(a: { id?: unknown; on?: unknown }) {
      if (a.id !== "web" || !o.abilities) return { ok: false, reason: "failed" };
      return o.abilities.set("web", a.on === true);
    },
    ...(o.extraOps ?? {}),
  };

  let inCritical = 0;
  return {
    async handle(f) {
      if (f.t !== "req" || typeof f.id !== "number") return;
      const op = ops[f.op ?? ""];
      const crit = CRITICAL_OPS.has(f.op ?? "");
      if (crit) inCritical++;
      try {
        if (!op) throw new Error(`unknown op ${f.op}`);
        const result = await op(f.args ?? {});
        o.send({ t: "res", id: f.id, ok: true, result: result ?? null });
      } catch (err) {
        o.send({ t: "res", id: f.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (crit) inCritical--;
      }
    },
    async closeAll() {
      const all = [...sessions.values()];
      sessions.clear();
      await Promise.all(all.map((s) => s.close().catch(() => {})));
    },
    sessions: () => sessions.size,
    critical: () => inCritical,
    turning: () => [...sessions.values()].filter(busyOf).length,
    turningOn: (h) => [...sessions.entries()].filter(([k, s]) => harnessOf.get(k) === h && busyOf(s)).length,
  };
}
