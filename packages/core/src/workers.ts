// Workers dial in at /worker with a worker device token (auth.ts) and stay connected. This file
// is the main's side of that socket: presence (who is online, with which harnesses) and a small
// request/response + session-frame transport (WorkerLink) that the runner uses to place tasks
// on a worker (runner/src/remote.ts; docs/design/system.md "Workers").
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
  harnesses?: { id: string; installed: boolean; loggedIn: boolean }[];
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
 * process (the CLI), so a live socket of a revoked device is closed here with CLOSE_REVOKED.
 */
export function splitSockets(
  client: Handlers,
  workers: Workers,
  opts: { isLive?: (deviceId: string) => boolean; sweepMs?: number } = {},
): Handlers & { stop(): void } {
  const isWorker = (ws: any) => ws.data?.worker === true;
  const withDevice = new Set<any>();
  const timer = opts.isLive
    ? setInterval(() => {
        for (const ws of withDevice) if (!opts.isLive!(ws.data.device.id)) ws.close(CLOSE_REVOKED, "device disconnected");
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
    if (g.via !== "device" || g.device.kind !== "worker") return new Response("a worker pairing code is needed (ducter pair --worker)", { status: 403 });
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
}): Workers {
  const now = opts.now ?? (() => new Date());
  type Live = { ws: ServerWebSocket<WorkerSocketData>; hello?: WorkerHello };
  const live = new Map<string, Live>();
  const send = (ws: ServerWebSocket<WorkerSocketData>, f: object) => ws.send(JSON.stringify(f));

  // Per worker: pending requests, session listeners, online listeners. Kept across reconnects.
  interface State {
    device: Device;
    pending: Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>;
    sessions: Map<string, (f: WorkerSessionFrame) => void>;
    onOnline: Set<() => void>;
    link: WorkerLink;
  }
  const states = new Map<string, State>();
  let nextId = 0;
  const nameOf = (st: State) => live.get(st.device.id)?.hello?.name || st.device.name;

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
        name: hello?.name || ws.data.device.name,
        since: ws.data.since,
        ...(hello ? { hello } : {}),
      })),
    link(device) {
      const byLive = [...live.values()].find((l) => l.ws.data.device.id === device || l.hello?.name === device || l.ws.data.device.name === device);
      const d = byLive?.ws.data.device ?? [...states.values()].find((st) => st.device.id === device || st.device.name === device)?.device ?? opts.find?.(device);
      if (!d || d.kind !== "worker") return undefined;
      return stateFor(d).link;
    },
    list(): WorkerInfo[] {
      return [...live.values()]
        .filter((l) => l.hello)
        .map(({ ws, hello }) => ({
          id: ws.data.device.id,
          name: hello!.name || ws.data.device.name,
          online: true,
          ...(hello!.os ? { os: hello!.os } : {}),
          ...(hello!.arch ? { arch: hello!.arch } : {}),
          ...(hello!.harnesses ? { harnesses: hello!.harnesses } : {}),
        }));
    },
    websocket: {
      open(ws) {
        // A second connection from the same worker replaces the first.
        const old = live.get(ws.data.device.id);
        live.set(ws.data.device.id, { ws });
        if (old) {
          old.ws.close(4000, "replaced");
          lost(stateFor(ws.data.device));
        }
      },
      close(ws) {
        if (live.get(ws.data.device.id)?.ws !== ws) return;
        live.delete(ws.data.device.id);
        lost(stateFor(ws.data.device));
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
          send(ws, { t: "welcome", personaName: opts.personaName(), deviceId: ws.data.device.id, at: now().toISOString() });
          for (const fn of st.onOnline) queueMicrotask(fn);
        } else if (f?.t === "ping") send(ws, { t: "pong" });
        else if (f?.t === "res") {
          const p = st.pending.get(f.id);
          if (!p) return;
          st.pending.delete(f.id);
          clearTimeout(p.timer);
          if (f.ok) p.resolve(f.result);
          else p.reject(new Error(String(f.error ?? "worker error")));
        } else if (f?.t === "ev" || f?.t === "end") {
          st.sessions.get(f.key)?.(f as WorkerSessionFrame);
          if (f.t === "end") st.sessions.delete(f.key);
        } else send(ws, { t: "error", message: `unknown frame ${f?.t}` });
      },
    },
    stop() {
      for (const { ws } of live.values()) ws.close(1001, "shutting down");
      live.clear();
    },
  };
}
