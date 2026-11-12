// Workers dial in at /worker with a worker device token (auth.ts) and stay connected. This file
// is the main's side of that socket: presence (who is online, with which harnesses) and a small
// request/response + session-frame transport (WorkerLink) that the runner uses to place tasks
// on a worker (runner/src/remote.ts; design/system.md "Workers").
import type { ServerWebSocket } from "bun";
import type { WorkerInfo, WorkerLink, WorkerLinks, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import type { Device } from "./auth.ts";

/** A request to a worker that is (or went) offline. The runner turns it into 连不上 / Can't reach. */
export class WorkerOfflineError extends Error {
  readonly offline = true;
  constructor(name: string) {
    super(`${name} is not connected`);
  }
}

export interface WorkerHello {
  t: "hello";
  name?: string;
  os?: string;
  arch?: string;
  version?: string;
  /** laptop | mini | server: how the device is drawn on Your devices and abilities. */
  kind?: string;
  /** D156: version and how each agent was installed ride along. */
  harnesses?: { id: string; installed: boolean; loggedIn: boolean; version?: string; how?: string }[];
  /** D148: how it updates (self · app · source), and the outcome of its last update when it restarted for one. */
  how?: string;
  /** D187: how "app", and it can ask the app on its Mac to update (app-update.ts). */
  asksApp?: boolean;
  update?: import("./updates.ts").WorkerUpdateFrame;
  /** D157: what it can do for tasks, as its own probes say (上网 with where: chrome | ducter). */
  abilities?: import("@ducter/protocol").DeviceAbility[];
  /** D157: it doesn't sleep (a server, a desktop Mac). */
  alwaysOn?: boolean;
  /** D227: one id per worker process: another one means its Ducter restarted since the last hello. */
  boot?: string;
  /** D227: the agents this process is updating now. */
  agentUpdates?: string[];
}

/** What the main last knew of a worker that isn't connected now. */
export interface WorkerAway {
  lastSeen: string;
  /** The worker said it was going to sleep ({t:"sleep"}) before its socket went. */
  asleep: boolean;
  hello?: WorkerHello;
}

export interface OnlineWorker {
  deviceId: string;
  name: string;
  since: string;
  hello?: WorkerHello;
}

export interface WorkerSocketData {
  worker: true;
  device: Device;
  since: string;
}

export interface Workers extends WorkerLinks {
  online(): OnlineWorker[];
  /** Workers seen since the main started that aren't connected now, by device id. */
  away(): Map<string, WorkerAway>;
  /** Runs fn when a worker comes, goes, or says it is going to sleep. */
  onChange(fn: () => void): () => void;
  /** A paired worker got a new name (D84): links, tasks and frames use it from now on. */
  renamed(deviceId: string, name: string): void;
  websocket: {
    open(ws: ServerWebSocket<WorkerSocketData>): void;
    close(ws: ServerWebSocket<WorkerSocketData>): void;
    message(ws: ServerWebSocket<WorkerSocketData>, raw: string | Buffer): void;
  };
  stop(): void;
}

type Handlers = { open(ws: any): void; close(ws: any, code?: number, reason?: string): void; message(ws: any, m: string | Buffer): void | Promise<void> };

/** Close code sent to a socket whose device was disconnected (`ducter devices disconnect`). */
export const CLOSE_REVOKED = 4401;

/**
 * One Bun.serve socket handler for both kinds: client sockets (ws.ts) and worker sockets.
 * Sockets opened with a device token are re-checked every `sweepMs`: revoking happens in another
 * process (the CLI), so a live socket of a revoked device is closed here with CLOSE_REVOKED, and
 * a worker renamed there takes its new name.
 */
export function splitSockets(
  client: Handlers,
  workers: Workers,
  opts: { isLive?: (deviceId: string) => boolean; nameOf?: (deviceId: string) => string | undefined; sweepMs?: number } = {},
): Handlers & { stop(): void } {
  const isWorker = (ws: any) => ws.data?.worker === true;
  const withDevice = new Set<any>();
  const timer = opts.isLive
    ? setInterval(() => {
        for (const ws of withDevice) {
          if (!opts.isLive!(ws.data.device.id)) ws.close(CLOSE_REVOKED, "device disconnected");
          // Renamed from the CLI (another process): the worker's links pick up the new name.
          else if (isWorker(ws)) {
            const name = opts.nameOf?.(ws.data.device.id);
            if (name && name !== ws.data.device.name) workers.renamed(ws.data.device.id, name);
          }
        }
      }, opts.sweepMs ?? 10_000)
    : undefined;
  return {
    open: (ws) => {
      if (ws.data?.device) withDevice.add(ws);
      return isWorker(ws) ? workers.websocket.open(ws) : client.open(ws);
    },
    close: (ws, code, reason) => {
      withDevice.delete(ws);
      return isWorker(ws) ? workers.websocket.close(ws) : client.close(ws, code, reason);
    },
    message: (ws, m) => (isWorker(ws) ? workers.websocket.message(ws, m) : client.message(ws, m)),
    stop: () => clearInterval(timer),
  };
}

type Gated = { pass: true; via: "local" } | { pass: true; via: "device"; device: Device };

/**
 * Routes that concern devices, after the gate let the request through. Returns undefined when
 * the path isn't one of them. A worker token opens only /worker; a client token never does.
 */
export function deviceRoutes(req: Request, g: Gated, srv: { upgrade(req: Request, o: { data: WorkerSocketData }): boolean }, workers: Workers): Response | "upgraded" | undefined {
  const path = new URL(req.url).pathname;
  if (path === "/worker") {
    if (g.via !== "device" || g.device.kind !== "worker") return new Response("this device joined as an app; to run tasks here, join with: ducter worker <address> --code <code>", { status: 403 });
    return srv.upgrade(req, { data: { worker: true, device: g.device, since: new Date().toISOString() } }) ? "upgraded" : new Response("upgrade failed", { status: 400 });
  }
  if (g.via === "device" && g.device.kind === "worker" && path !== "/mcp") return new Response("workers only use /worker and /mcp", { status: 403 });
  if (path === "/devices/online") {
    if (g.via !== "local") return new Response("not found", { status: 404 });
    return Response.json({ workers: workers.online() });
  }
}

export function createWorkers(opts: {
  personaName: () => string;
  now?: () => Date;
  /** Paired devices by id or name, for links to workers that are offline right now. */
  find?: (idOrName: string) => Device | undefined;
  /** D148: a worker said how its update goes (a frame, or the outcome in its hello). */
  onUpdate?: (deviceId: string, name: string, f: import("./updates.ts").WorkerUpdateFrame) => void;
  /** D156: a worker said how an agent update goes. */
  onAgentUpdate?: (deviceId: string, name: string, f: import("./agents.ts").WorkerAgentFrame) => void;
  /**
   * D227: a worker said hello; restarted when it is another process than the last hello's (its
   * boot id, or for a worker from before D227 another version than it said last).
   */
  onHello?: (deviceId: string, name: string, hello: WorkerHello, o: { restarted: boolean }) => void;
}): Workers {
  const now = opts.now ?? (() => new Date());
  type Live = { ws: ServerWebSocket<WorkerSocketData>; hello?: WorkerHello };
  const live = new Map<string, Live>();
  const gone = new Map<string, WorkerAway>();
  const sleeping = new Set<string>();
  const changeFns = new Set<() => void>();
  const changed = () => {
    for (const fn of changeFns) queueMicrotask(fn);
  };
  const send = (ws: ServerWebSocket<WorkerSocketData>, f: object) => ws.send(JSON.stringify(f));

  // Per worker: pending requests, session listeners, online listeners. Kept across reconnects.
  interface State {
    device: Device;
    pending: Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>;
    sessions: Map<string, (f: WorkerSessionFrame) => void>;
    onOnline: Set<() => void>;
    link: WorkerLink;
    /** The last hello's boot id and version (D227), kept across reconnects. */
    boot?: string;
    version?: string;
  }
  const states = new Map<string, State>();
  let nextId = 0;
  // The paired name is the worker's name: a hello can't rename it (or claim another worker's tasks).
  const nameOf = (st: State) => st.device.name;

  function stateFor(device: Device): State {
    let st = states.get(device.id);
    if (st) return st;
    const s: State = {
      device,
      pending: new Map(),
      sessions: new Map(),
      onOnline: new Set(),
      link: undefined as unknown as WorkerLink,
    };
    s.link = {
      id: device.id,
      get name() {
        return nameOf(s);
      },
      online: () => Boolean(live.get(device.id)?.hello),
      call<T>(op: string, args: unknown, timeoutMs = 120_000): Promise<T> {
        const l = live.get(device.id);
        if (!l?.hello) return Promise.reject(new WorkerOfflineError(nameOf(s)));
        const id = ++nextId;
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            s.pending.delete(id);
            reject(new Error(`${nameOf(s)} didn't answer ${op} in ${Math.round(timeoutMs / 1000)} s`));
          }, timeoutMs);
          s.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
          send(l.ws, { t: "req", id, op, args });
        });
      },
      onSession(key, fn) {
        s.sessions.set(key, fn);
        return () => s.sessions.get(key) === fn && s.sessions.delete(key);
      },
      onOnline(fn) {
        s.onOnline.add(fn);
        return () => s.onOnline.delete(fn);
      },
    } as WorkerLink;
    states.set(device.id, s);
    return s;
  }

  /** The socket is gone: fail what was in flight and end every remote session (offline). */
  function lost(st: State) {
    for (const [id, p] of st.pending) {
      clearTimeout(p.timer);
      p.reject(new WorkerOfflineError(nameOf(st)));
      st.pending.delete(id);
    }
    for (const [key, fn] of [...st.sessions]) {
      st.sessions.delete(key);
      fn({ t: "end", key, offline: true, error: `${nameOf(st)} disconnected` });
    }
  }

  return {
    online: () =>
      [...live.values()].map(({ ws, hello }) => ({
        deviceId: ws.data.device.id,
        name: ws.data.device.name,
        since: ws.data.since,
        ...(hello ? { hello } : {}),
      })),
    away: () => new Map(gone),
    renamed(deviceId, name) {
      const st = states.get(deviceId);
      if (st) st.device.name = name;
      const l = live.get(deviceId);
      if (l) l.ws.data.device.name = name;
      if (l?.hello) l.hello.name = name;
      const g = gone.get(deviceId);
      if (g?.hello) g.hello.name = name;
      changed();
    },
    onChange(fn) {
      changeFns.add(fn);
      return () => changeFns.delete(fn);
    },
    link(device) {
      const byLive = [...live.values()].find((l) => l.ws.data.device.id === device || l.ws.data.device.name === device);
      const d = byLive?.ws.data.device ?? [...states.values()].find((st) => st.device.id === device || st.device.name === device)?.device ?? opts.find?.(device);
      if (!d || d.kind !== "worker") return undefined;
      return stateFor(d).link;
    },
    list(): WorkerInfo[] {
      const info = (id: string, name: string, online: boolean, hello: WorkerHello, asleep?: boolean): WorkerInfo => {
        const web = hello.abilities?.find((a) => a.id === "web");
        return {
          id,
          name,
          online,
          ...(asleep ? { asleep: true } : {}),
          ...(hello.os ? { os: hello.os } : {}),
          ...(hello.arch ? { arch: hello.arch } : {}),
          ...(hello.harnesses ? { harnesses: hello.harnesses } : {}),
          ...(web?.state === "on" && web.where ? { web: web.where } : {}),
          ...(hello.alwaysOn != null ? { alwaysOn: hello.alwaysOn } : hello.kind ? { alwaysOn: hello.kind !== "laptop" } : {}),
        };
      };
      const up = [...live.values()].filter((l) => l.hello).map(({ ws, hello }) => info(ws.data.device.id, ws.data.device.name, true, hello!));
      // D157: a worker that is away still runs tasks when it's back (asleep: a task can wait for it).
      const away = [...gone.entries()].filter(([id, g]) => g.hello && !live.has(id)).map(([id, g]) => info(id, states.get(id)?.device.name ?? g.hello!.name ?? id, false, g.hello!, g.asleep));
      return [...up, ...away];
    },
    websocket: {
      open(ws) {
        // A second connection from the same worker replaces the first.
        const old = live.get(ws.data.device.id);
        live.set(ws.data.device.id, { ws });
        sleeping.delete(ws.data.device.id);
        if (old) {
          old.ws.close(4000, "replaced");
          lost(stateFor(ws.data.device));
        }
      },
      close(ws) {
        const entry = live.get(ws.data.device.id);
        if (entry?.ws !== ws) return;
        live.delete(ws.data.device.id);
        gone.set(ws.data.device.id, { lastSeen: now().toISOString(), asleep: sleeping.delete(ws.data.device.id), ...(entry.hello ? { hello: entry.hello } : {}) });
        lost(stateFor(ws.data.device));
        changed();
      },
      message(ws, raw) {
        let f: any;
        try {
          f = JSON.parse(String(raw));
        } catch {
          return send(ws, { t: "error", message: "invalid JSON" });
        }
        const st = stateFor(ws.data.device);
        if (f?.t === "hello") {
          const entry = live.get(ws.data.device.id);
          if (entry?.ws !== ws) return;
          entry.hello = f as WorkerHello;
          gone.delete(ws.data.device.id);
          const restarted = typeof f.boot === "string" && st.boot !== undefined ? st.boot !== f.boot : st.version !== undefined && typeof f.version === "string" && st.version !== f.version;
          st.boot = typeof f.boot === "string" ? f.boot : undefined;
          st.version = typeof f.version === "string" ? f.version : undefined;
          send(ws, { t: "welcome", personaName: opts.personaName(), deviceId: ws.data.device.id, at: now().toISOString() });
          for (const fn of st.onOnline) queueMicrotask(fn);
          changed();
          if (f.update?.t === "update") opts.onUpdate?.(ws.data.device.id, nameOf(st), f.update);
          opts.onHello?.(ws.data.device.id, nameOf(st), f as WorkerHello, { restarted });
        } else if (f?.t === "ping") send(ws, { t: "pong" });
        // The worker's OS is putting it to sleep: when its socket goes, it is 睡着了 / Asleep,
        // not 连不上 / Can't reach (A3: "Asleep" only when the device told us).
        else if (f?.t === "sleep") sleeping.add(ws.data.device.id), changed();
        else if (f?.t === "update") opts.onUpdate?.(ws.data.device.id, nameOf(st), f);
        // D156: an agent update on that worker, and its agents as they are after it.
        else if (f?.t === "agent_update") opts.onAgentUpdate?.(ws.data.device.id, nameOf(st), f);
        // D157: its abilities changed (上网 added or removed there, its browser installed).
        else if (f?.t === "abilities") {
          const entry = live.get(ws.data.device.id);
          if (entry?.hello && Array.isArray(f.abilities)) (entry.hello.abilities = f.abilities), changed();
        }
        else if (f?.t === "agents") {
          const entry = live.get(ws.data.device.id);
          if (entry?.hello && Array.isArray(f.harnesses)) (entry.hello.harnesses = f.harnesses), changed();
        }
        else if (f?.t === "res") {
          const p = st.pending.get(f.id);
          if (!p) return;
          st.pending.delete(f.id);
          clearTimeout(p.timer);
          if (f.ok) p.resolve(f.result);
          else p.reject(new Error(String(f.error ?? "worker error")));
        } else if (f?.t === "ev" || f?.t === "end" || f?.t === "cdp") {
          st.sessions.get(f.key)?.(f as WorkerSessionFrame);
          if (f.t === "end") st.sessions.delete(f.key);
          else if (f.t === "cdp" && f.closed) st.sessions.delete(f.key);
        } else send(ws, { t: "error", message: `unknown frame ${f?.t}` });
      },
    },
    stop() {
      for (const { ws } of live.values()) ws.close(1001, "shutting down");
      live.clear();
    },
  };
}
