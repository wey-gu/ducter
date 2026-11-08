// Assembles the control plane: Log, registry, decisions, living message, MCP hub, WS server.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { createWsHandler, type WsData } from "./ws.ts";
import { createGate, openDeviceAuth, type DeviceAuth } from "./auth.ts";
import { createWorkers, deviceRoutes, splitSockets, type Workers, type WorkerSocketData } from "./workers.ts";

export interface CoreOptions {
  dataDir?: string;
  port?: number; // 0 = random (tests)
  hostname?: string; // default env DUCTER_HOST or 127.0.0.1; anything else is an explicit choice
  persona?: Persona;
  clock?: Clock;
  defaultDelayMs?: number;
  batchMs?: number;
  sweepMs?: number; // how often live device sockets are re-checked for revocation (default 10 s)
}

export interface Core extends CoreApi {
  log: SqliteLog;
  tasks: CoreRegistry;
  mcp: CoreMcpHub;
  decisions: Decisions;
  living: Living;
  devices: DeviceAuth;
  workers: Workers;
  port: number;
  url: string; // ws URL for clients
  setRunner(r: Runner): void;
  setPartner(p: Partner): void;
  stop(): Promise<void>;
}

export const defaultDataDir = () => process.env.DUCTER_DATA_DIR || join(homedir(), ".ducter");

/** Events that wake the partner (principle 6). Timers (job_status from "waiter") are fed by the partner itself. */
export function triggersPartner(e: LogEvent): boolean {
  if (e.kind === "user_msg" || e.kind === "decision_resolved") return true;
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress";
  return false;
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
  mkdirSync(dataDir, { recursive: true });
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
    defaultDelayMs: opts.defaultDelayMs,
    onDecision: async (taskId, text) => {
      if (!runner) return console.warn(`[core] no runner: decision for ${taskId} not forwarded`);
      await runner.send(taskId, text);
    },
  });
  const living = createLiving({ log, tasks, decisions, clock });
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
  const ws = createWsHandler({ core: api, decisions, runner: () => runner, batchMs: opts.batchMs });
  const devices = openDeviceAuth(dataDir);
  const gate = createGate({ auth: devices, personaName: () => persona.name });
  const workers = createWorkers({ personaName: () => persona.name });
  const sockets = splitSockets(ws.websocket, workers, { isLive: (id) => devices.isLive(id), sweepMs: opts.sweepMs });

  const server = Bun.serve<WsData | WorkerSocketData>({
    hostname: opts.hostname ?? (process.env.DUCTER_HOST || "127.0.0.1"),
    port: opts.port ?? Number(process.env.DUCTER_PORT || 7777),
    idleTimeout: 120,
    async fetch(req, srv) {
      const url = new URL(req.url);
      // Off-machine callers need a paired device token (auth.ts); /pair is answered here.
      const g = await gate.check(req, srv.requestIP(req)?.address);
      if (!g.pass) return g.response;
      const d = deviceRoutes(req, g, srv, workers);
      if (d) return d === "upgraded" ? undefined : d;
      if (url.pathname === "/ws") {
        // Block cross-site WebSocket hijacking from browser pages; native clients send no Origin.
        // A device token can't ride along ambiently (no cookies), so it needs no origin check.
        const origin = req.headers.get("origin");
        if (g.via === "local" && origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return new Response("forbidden", { status: 403 });
        // The device rides along so a revoked device's live socket can be closed (workers.ts).
        const data = { ...ws.newData(), ...(g.via === "device" ? { device: g.device } : {}) };
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
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    setRunner: (r) => void (runner = r),
    setPartner(p) {
      partner = p;
      early.splice(0).forEach(trigger);
    },
    async stop() {
      ws.stop();
      workers.stop();
      sockets.stop();
      unsubscribePartner();
      decisions.stop();
      living.stop();
      void server.stop(true); // awaiting hangs in Bun 1.3 when a WebSocket was open
      log.close();
      devices.close();
    },
  };
}
