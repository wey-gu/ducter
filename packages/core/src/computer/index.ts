// 用电脑 / Use the computer (D235, design/computer-use.md): a task whose work is in a Mac app (needs.app)
// runs on a Mac where the person added 用电脑 (the home or a worker Mac), and gets Ducter's app
// tools (tools.ts), gated at the effect. cua-driver reads and acts on that Mac: here through its
// CLI, on a worker through the worker's socket (the worker runs the same CLI, worker.ts). The
// tools, the gate and Stop stay on the home.
import type { Bodies, DeviceAbility, OnHand } from "@ducter/protocol";
import type { LogStore, TaskRegistry, WorkerLink } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub } from "../mcp.ts";
import { computerAbilityOf, computerReady } from "./ability.ts";
import { cuaBin, defaultPermsProbe, localCuaCall, openGrantGuide, type CuaCall, type PermsProbe } from "./driver.ts";
import { COMPUTER_STOPPED, registerComputerTools, type ComputerTools } from "./tools.ts";

export interface ComputerWorkers {
  link(device: string): WorkerLink | undefined;
  /** 用电脑 as that worker last said it. */
  ability(deviceId: string): DeviceAbility | undefined;
}

export interface ComputerUse {
  tools: ComputerTools;
  /** 用电脑 on this computer's card (probes reused for a minute). */
  ability(): Promise<DeviceAbility>;
  /** Forget the probes (after the person flipped a switch or added it). */
  refresh(): void;
  /** Opens cua-driver's guide to the two switches on that Mac ("local" or a worker). */
  grant(where: string): Promise<{ ok: boolean; reason?: "offline" | "cua_missing" | "not_mac" | "failed"; message?: string }>;
  /** 停下 / Stop: the task may no longer use the person's apps. */
  stop(taskId: string): Promise<boolean>;
  computerOf(taskId: string): string;
  attached(taskId: string): boolean;
  decorate(o: OnHand): OnHand;
  close(): void;
}

export interface ComputerUseOptions {
  dataDir: string;
  mcp: CoreMcpHub;
  log: LogStore;
  tasks: TaskRegistry & { get(id: string): any };
  platform?: string;
  env?: Record<string, string | undefined>;
  workers?: () => ComputerWorkers | undefined;
  /** Interrupt the task's turn and tell it (Stop). */
  interrupt?: (taskId: string) => Promise<unknown>;
  tell?: (taskId: string, text: string) => unknown;
  /** Test seams. */
  call?: CuaCall;
  perms?: PermsProbe;
  cua?: () => Promise<{ version: string } | { missing: string }>;
  grantGuide?: () => Promise<{ ok: boolean; reason?: "cua_missing" | "failed"; message?: string }>;
  now?: () => number;
}

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked"]);

export function createComputerUse(o: ComputerUseOptions): ComputerUse {
  const env = o.env ?? process.env;
  const platform = o.platform ?? process.platform;
  const call = o.call ?? localCuaCall(env);
  const perms = o.perms ?? defaultPermsProbe(env);
  const cua = o.cua ?? (async () => (cuaBin(env) ? { version: "installed" } : { missing: "cua-driver is not installed" }));
  let cached: { at: number; a: DeviceAbility } | undefined;
  const now = o.now ?? Date.now;
  const localAbility = async (): Promise<DeviceAbility> => {
    if (cached && now() - cached.at < 60_000) return cached.a;
    const darwin = platform === "darwin";
    const [c, p] = darwin ? await Promise.all([cua().catch((e) => ({ missing: String((e as Error).message) })), perms().catch(() => undefined)]) : [{ missing: "not a Mac" }, undefined];
    const a = computerAbilityOf({ platform, dataDir: o.dataDir, cua: c, perms: p });
    cached = { at: now(), a };
    return a;
  };
  // The last answer, for the synchronous checks (tools listed, On hand); a stale one is refreshed.
  const localNow = () => {
    if (!cached || now() - cached.at >= 60_000) void localAbility().catch(() => {});
    return cached?.a;
  };

  const workerOf = (where: string) => (where && where !== "local" ? o.workers?.()?.link(where) : undefined);
  const computerOf = (taskId: string): string => {
    const dev = String((o.tasks.get(taskId) as { place?: { device?: string } } | undefined)?.place?.device ?? "").trim();
    if (!dev || dev === "local") return "local";
    return workerOf(dev)?.id ?? dev;
  };
  const readyOn = (where: string) => {
    if (where === "local") return computerReady(localNow());
    const link = workerOf(where);
    return !!link?.online() && computerReady(o.workers?.()?.ability(link.id));
  };

  const needs = new Map<string, boolean>();
  const wantsApp = (taskId: string) => {
    let v = needs.get(taskId);
    if (v === undefined) {
      const open = o.log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0]?.body as Bodies["task_open"] | undefined;
      v = !!open?.needs?.app;
      needs.set(taskId, v);
    }
    return v;
  };
  const stopped = new Set<string>();
  const attached = (taskId: string) => {
    if (!wantsApp(taskId) || !readyOn(computerOf(taskId))) return false;
    const c = o.tasks.get(taskId);
    return !!c && ACTIVE.has(c.attention);
  };

  const using = new Map<string, string>(); // taskId -> the app it is in
  const tools = registerComputerTools({
    mcp: o.mcp,
    log: o.log,
    tasks: o.tasks,
    attached,
    stopped: (taskId) => stopped.has(taskId),
    callFor: (taskId) => {
      const where = computerOf(taskId);
      if (where === "local") return call;
      return async (tool, args) => {
        const link = workerOf(where);
        if (!link?.online()) throw new Error("the Mac this task runs on can't be reached right now");
        return link.call("computer_call", { tool, args }, 90_000);
      };
    },
    note: (taskId, app) => {
      if (app || !using.has(taskId)) using.set(taskId, app);
    },
    ...(o.now ? { now: o.now } : {}),
  });

  const goFor = new Map<string, string>(); // decisionId -> taskId
  const unsubscribe = o.log.subscribe((e) => {
    if (e.kind === "decision") {
      const b = e.body as Bodies["decision"];
      if (b.taskId && b.computer?.kind === "go") goFor.set(b.decisionId, b.taskId);
      return;
    }
    if (e.kind === "decision_resolved") {
      const r = e.body as Bodies["decision_resolved"];
      const t = goFor.get(r.decisionId);
      if (!t) return;
      goFor.delete(r.decisionId);
      if (r.option === "go") tools.allow(t);
      return;
    }
    if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      if (!ACTIVE.has(b.attention)) using.delete(b.taskId);
    }
  });

  return {
    tools,
    ability: localAbility,
    refresh: () => void (cached = undefined),
    async grant(where) {
      if (where === "local" || !where) {
        if (platform !== "darwin") return { ok: false, reason: "not_mac" };
        const r = await (o.grantGuide ?? (() => openGrantGuide(env)))();
        cached = undefined;
        return r;
      }
      const link = workerOf(where);
      if (!link?.online()) return { ok: false, reason: "offline" };
      try {
        return await link.call("computer_grant", {}, 15_000);
      } catch (e) {
        return { ok: false, reason: "failed", message: (e as Error).message };
      }
    },
    async stop(taskId) {
      const had = !stopped.has(taskId);
      stopped.add(taskId);
      using.delete(taskId);
      await o.interrupt?.(taskId)?.catch(() => {});
      void o.tell?.(taskId, COMPUTER_STOPPED);
      return had;
    },
    computerOf,
    attached,
    decorate(on) {
      for (const c of on.tasks) {
        if (!using.has(c.taskId) || stopped.has(c.taskId) || !attached(c.taskId)) continue;
        const app = using.get(c.taskId);
        c.computing = { device: computerOf(c.taskId), ...(app ? { app } : {}) };
      }
      return on;
    },
    close: () => unsubscribe(),
  };
}
