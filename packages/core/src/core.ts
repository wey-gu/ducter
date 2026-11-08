// Assembles the control plane: Log, registry, decisions, living message, MCP hub, WS server.
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { CoreApi, Partner, Runner } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import { createDecisions, type Decisions } from "./decisions.ts";
import { createLiving, type Living } from "./living.ts";
import { openLog, type SqliteLog } from "./log.ts";
import { createMcpHub, type CoreMcpHub } from "./mcp.ts";
import { DEFAULT_IDENTITY, type Persona } from "./persona.ts";
import { createRegistry, type CoreRegistry } from "./registry.ts";
import { registerCoreTools } from "./tools.ts";
import { createWaiters, type Waiters } from "./waiters.ts";
import { createWsHandler, type WsData } from "./ws.ts";
import { createGate, openDeviceAuth, type DeviceAuth } from "./auth.ts";
import { createWorkers, deviceRoutes, splitSockets, type Workers, type WorkerSocketData } from "./workers.ts";
import { createPusher, openPushStore, type Pusher, type PushStore } from "./push.ts";
import { webApi, webStatic } from "./web.ts";
import { createDevicesView, type DeviceProbes, type DevicesView } from "./devices.ts";

export interface CoreOptions {
  dataDir?: string;
  port?: number; // 0 = random (tests)
  hostname?: string; // default env DUCTER_HOST or 127.0.0.1; anything else is an explicit choice
  persona?: Persona;
  clock?: Clock;
  defaultDelayMs?: number;
  batchMs?: number;
  sweepMs?: number; // how often live device sockets are re-checked for revocation (default 10 s)
  push?: boolean; // send Web Push (default on; env DUCTER_PUSH=off turns it off)
  pushHoldMs?: number;
  pushFetch?: (url: string, init: RequestInit) => Promise<Response>; // tests
  /** Test seams for Your devices and abilities (cua-driver, harness logins, device kind). */
  deviceProbes?: Partial<DeviceProbes>;
}

export interface Core extends CoreApi {
  log: SqliteLog;
  tasks: CoreRegistry;
  mcp: CoreMcpHub;
  decisions: Decisions;
  living: Living;
  devices: DeviceAuth;
  workers: Workers;
  /** 你的设备和本事 / Your devices and abilities. */
  devicesView: DevicesView;
  waiters: Waiters;
  push: PushStore;
  pusher: Pusher;
  port: number;
  url: string; // ws URL for clients
  setRunner(r: Runner): void;
  setPartner(p: Partner): void;
  stop(): Promise<void>;
}

export const defaultDataDir = () => process.env.DUCTER_DATA_DIR || join(homedir(), ".ducter");

/** Events that wake the partner (principle 6): user messages, resolutions, non-progress reports, fired waiters. */
export function triggersPartner(e: LogEvent): boolean {
  if (e.kind === "user_msg" || e.kind === "decision_resolved") return true;
  if (e.kind === "waiter") return (e.body as Bodies["waiter"]).state === "fired";
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress";
  return false;
}

/**
 * No Origin (a native client), or this server's own origin as the browser reached it: the Host
 * itself, or another loopback name for it on the same port (localhost vs 127.0.0.1).
 */
export function sameOriginWs(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin == null) return true;
  try {
    const o = new URL(origin);
    const h = new URL(`http://${req.headers.get("host") ?? ""}`);
    if ((o.protocol !== "http:" && o.protocol !== "https:") || o.pathname !== "/") return false;
    if (o.host === h.host) return true;
    const loop = (n: string) => n === "127.0.0.1" || n === "localhost" || n === "[::1]";
    return loop(o.hostname) && loop(h.hostname) && o.port === h.port;
  } catch {
    return false;
  }
}

function loadSecret(dataDir: string): string {
  const p = join(dataDir, "mcp.secret");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  const s = randomBytes(32).toString("base64url");
  writeFileSync(p, s, { mode: 0o600 });
  chmodSync(p, 0o600);
  return s;
}

export function startCore(opts: CoreOptions = {}): Core {
  const dataDir = opts.dataDir ?? defaultDataDir();
  // Owner-only when we create it: it holds the Log, worktrees, browser profiles, the env file.
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // An existing dir from an older install (0755/0775) is tightened too, when it is ours.
  try {
    const st = statSync(dataDir);
    if (process.getuid && st.uid === process.getuid() && (st.mode & 0o077) !== 0) chmodSync(dataDir, 0o700);
  } catch {
    /* not ours or not a plain dir: leave it */
  }
  const clock = opts.clock ?? realClock;
  const persona = opts.persona ?? { id: "default", name: "Ducter", identity: DEFAULT_IDENTITY };

  const log = openLog({ path: join(dataDir, "ducter.db"), persona: persona.id, clock });
  const tasks = createRegistry(log, clock);
  let runner: Runner | undefined;
  let partner: Partner | undefined;
  const decisions = createDecisions({
    log,
    tasks,
    clock,
    // DUCTER_DECISION_DEFAULT_MS: how long a reversible default waits (soak runs and demos use seconds).
    defaultDelayMs: opts.defaultDelayMs ?? (Number(process.env.DUCTER_DECISION_DEFAULT_MS) || undefined),
    onDecision: async (taskId, text) => {
      if (!runner) return console.warn(`[core] no runner: decision for ${taskId} not forwarded`);
      await runner.send(taskId, text, undefined, "user");
    },
  });
  const living = createLiving({ log, tasks, decisions, clock });
  const waiters = createWaiters({ log, clock });
  const mcp = createMcpHub({ secret: loadSecret(dataDir) });
  registerCoreTools(mcp, log, tasks);

  const early: LogEvent[] = []; // triggers that arrive before the partner is wired
  const trigger = (e: LogEvent) => {
    try {
      partner!.onTrigger(e);
    } catch (err) {
      console.error(`[core] partner.onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  const unsubscribePartner = log.subscribe((e) => {
    if (!triggersPartner(e)) return;
    if (partner) trigger(e);
    else if (early.length < 100) early.push(e);
  });

  const api = { log, tasks, mcp, persona, dataDir } as CoreApi;
  let devicesView: DevicesView | undefined;
  const ws = createWsHandler({ core: api, decisions, runner: () => runner, devices: () => devicesView, batchMs: opts.batchMs });
  const devices = openDeviceAuth(dataDir);
  // A device that pairs changes Your devices and abilities (远程打开 / Reach from anywhere).
  const gateAuth = {
    ...devices,
    redeem: (...a: Parameters<typeof devices.redeem>) => {
      const r = devices.redeem(...a);
      if (!("error" in r)) devicesView?.changed();
      return r;
    },
  };
  const gate = createGate({ auth: gateAuth, personaName: () => persona.name });
  const workers = createWorkers({
    personaName: () => persona.name,
    // A disconnected (revoked) worker still resolves, as a link that is never online: its tasks
    // show 连不上 / Can't reach and new ones are refused, instead of silently running here.
    find: (d) => {
      const hit = (x: { id: string; name: string; kind: string }) => x.kind === "worker" && (x.id === d || x.name === d);
      return devices.list().find(hit) ?? devices.list({ all: true }).reverse().find(hit);
    },
  });
  api.workers = workers; // the runner places tasks on workers through this (runner/src/remote.ts)
  devicesView = createDevicesView({ dataDir, auth: devices, workers, connected: () => ws.connected(), probes: opts.deviceProbes });
  const sockets = splitSockets(ws.websocket, workers, { isLive: (id) => devices.isLive(id), sweepMs: opts.sweepMs });
  const push = openPushStore(dataDir);
  const pusher = createPusher({
    log,
    store: push,
    clock,
    personaName: () => persona.name,
    taskTitle: (id) => tasks.get(id)?.title,
    lastSummary: (id) => tasks.get(id)?.lastReport?.summary,
    holdMs: opts.pushHoldMs ?? (Number(process.env.DUCTER_PUSH_HOLD_MS) || undefined),
    enabled: opts.push ?? process.env.DUCTER_PUSH !== "off",
    fetcher: opts.pushFetch,
    alive: (s) => s.deviceId === "local" || devices.isLive(s.deviceId),
  });

  const server = Bun.serve<WsData | WorkerSocketData>({
    hostname: opts.hostname ?? (process.env.DUCTER_HOST || "127.0.0.1"),
    port: opts.port ?? Number(process.env.DUCTER_PORT || 7777),
    idleTimeout: 120,
    async fetch(req, srv) {
      const url = new URL(req.url);
      // The phone/web client's own files are public (web.ts); everything it talks to is not.
      const page = await webStatic(req);
      if (page) return page;
      // Off-machine callers need a paired device token (auth.ts); /pair is answered here.
      const g = await gate.check(req, srv.requestIP(req)?.address);
      if (!g.pass) return g.response;
      const d = deviceRoutes(req, g, srv, workers);
      if (d) return d === "upgraded" ? undefined : d;
      const api = await webApi(req, g, { decisions, push, pusher, personaName: () => persona.name });
      if (api) return api;
      if (url.pathname === "/ws") {
        // Block cross-site WebSocket hijacking from browser pages; native clients send no Origin
        // (the desktop sends its own address). Only this server's own origin counts: a page from
        // another local port (a dev server, another app) is another site. Through an SSH tunnel
        // the Host is the tunnel's, and so is the page's origin.
        // A device token can't ride along ambiently (no cookies), so it needs no origin check.
        if (g.via === "local" && !sameOriginWs(req)) return new Response("forbidden", { status: 403 });
        // The device rides along so a revoked device's live socket can be closed (workers.ts).
        const data = { ...ws.newData(), ...(g.via === "device" ? { device: g.device } : {}) };
        // A browser that offered ["ducter", <token>] gets "ducter" back: Bun echoes the first
        // offered subprotocol by itself (adding the header again would send it twice).
        return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/mcp") return mcp.handle(req);
      if (url.pathname === "/health") return Response.json({ ok: true, headSeq: log.head() });
      return new Response("not found", { status: 404 });
    },
    websocket: sockets,
  });
  const port = server.port!;
  mcp.setPort(port);

  return {
    ...api,
    log,
    tasks,
    mcp,
    decisions,
    living,
    devices,
    workers,
    devicesView,
    waiters,
    push,
    pusher,
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    setRunner(r) {
      runner = r;
      // Answers that were resolved but never handed to their task before a restart (decisions.ts).
      for (const u of decisions.takeUnforwarded()) {
        console.warn(`[core] re-sending the answer to ${u.decisionId} that ${u.taskId} never got (restart)`);
        void Promise.resolve()
          .then(() => r.send(u.taskId, u.text, undefined, "user"))
          .catch((err) => console.error(`[core] re-sending ${u.decisionId} to ${u.taskId} failed:`, (err as Error).message));
      }
    },
    setPartner(p) {
      partner = p;
      early.splice(0).forEach(trigger);
    },
    async stop() {
      ws.stop();
      devicesView?.stop();
      workers.stop();
      sockets.stop();
      unsubscribePartner();
      decisions.stop();
      living.stop();
      waiters.stop();
      pusher.stop();
      void server.stop(true); // awaiting hangs in Bun 1.3 when a WebSocket was open
      log.close();
      devices.close();
    },
  };
}
