// Workers dial in at /worker with a worker device token (auth.ts) and stay connected. This file
// is enrollment and presence only: who is online, with which harnesses. Placing tasks on a
// worker is designed in docs/design/system.md (Workers) and not built yet.
import type { ServerWebSocket } from "bun";
import type { Device } from "./auth.ts";

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

export interface Workers {
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

export function createWorkers(opts: { personaName: () => string; now?: () => Date }): Workers {
  const now = opts.now ?? (() => new Date());
  const live = new Map<string, { ws: ServerWebSocket<WorkerSocketData>; hello?: WorkerHello }>();
  const send = (ws: ServerWebSocket<WorkerSocketData>, f: object) => ws.send(JSON.stringify(f));
  return {
    online: () =>
      [...live.values()].map(({ ws, hello }) => ({
        deviceId: ws.data.device.id,
        name: hello?.name || ws.data.device.name,
        since: ws.data.since,
        ...(hello ? { hello } : {}),
      })),
    websocket: {
      open(ws) {
        // A second connection from the same worker replaces the first.
        live.get(ws.data.device.id)?.ws.close(4000, "replaced");
        live.set(ws.data.device.id, { ws });
      },
      close(ws) {
        if (live.get(ws.data.device.id)?.ws === ws) live.delete(ws.data.device.id);
      },
      message(ws, raw) {
        let f: any;
        try {
          f = JSON.parse(String(raw));
        } catch {
          return send(ws, { t: "error", message: "invalid JSON" });
        }
        if (f?.t === "hello") {
          const entry = live.get(ws.data.device.id);
          if (entry?.ws === ws) entry.hello = f as WorkerHello;
          send(ws, { t: "welcome", personaName: opts.personaName(), deviceId: ws.data.device.id, at: now().toISOString() });
        } else if (f?.t === "ping") send(ws, { t: "pong" });
        else send(ws, { t: "error", message: `unknown frame ${f?.t}` });
      },
    },
    stop() {
      for (const { ws } of live.values()) ws.close(1001, "shutting down");
      live.clear();
    },
  };
}
