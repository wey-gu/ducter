// Assembles the control plane: Log, registry, decisions, living message, MCP hub, WS server.
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { CoreApi, Partner, Runner } from "@ducter/protocol/src/internal.ts";
import { migrateKeys, readKeys, scrubKeysFromEnv } from "@ducter/protocol/src/keys.ts";
import { realClock, type Clock } from "./clock.ts";
import { createDecisions, type Decisions } from "./decisions.ts";
import { createLiving, type Living } from "./living.ts";
import { openLog, type SqliteLog } from "./log.ts";
import { createMcpHub, type CoreMcpHub } from "./mcp.ts";
import { DEFAULT_IDENTITY, type Persona } from "./persona.ts";
import { createRegistry, type CoreRegistry } from "./registry.ts";
import { registerCoreTools } from "./tools.ts";
import type { Waiters } from "./waiters.ts";
import { createWork, type Work } from "./work.ts";
import { createHarnessJudge } from "./judge.ts";
import { createWsHandler, type WsData } from "./ws.ts";
import { createGate, openDeviceAuth, type DeviceAuth } from "./auth.ts";
import { createWorkers, deviceRoutes, splitSockets, type Workers, type WorkerSocketData } from "./workers.ts";
import { createPusher, openPushStore, type Pusher, type PushStore } from "./push.ts";
import { createApnsSender, loadApnsConfig, type ApnsSender } from "./apns.ts";
import { webApi, webStatic } from "./web.ts";
import { createDevicesView, type DeviceProbes, type DevicesView } from "./devices.ts";
import { openSettings, type SettingsStore } from "./settings.ts";
import { openRules, type RulesStore } from "./rules.ts";
import { createLoadout, isRuleHint, registerRuleTools, type Loadout } from "./loadout.ts";
import { openConnections, type ConnectionsStore, type Linker, type OoSource } from "./connections.ts";
import { registerConnectionTools } from "./connection-tools.ts";

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
  /** Sends to the iPhone app (tests pass a fake; default: <dataDir>/apns.json or DUCTER_APNS_*). */
  apns?: ApnsSender;
  /** Test seams for Your devices and abilities (cua-driver, harness logins, device kind). */
  deviceProbes?: Partial<DeviceProbes>;
  /** Test seams for connections: the MCP link, and the oo CLI's config. */
  connectionLinker?: Linker;
  ooSource?: OoSource;
  /** Work over time test seams (D112-D114): fake commands, a lower look floor, the judge. */
  work?: { exec?: import("@ducter/protocol/src/checks-run.ts").Exec; minEveryMs?: number; judgeMinMs?: number; restartLookMs?: number; defaultZone?: string; judge?: import("./waiters.ts").Judge; connectionFetch?: (url: string, init: RequestInit) => Promise<Response> };
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
  /** Waiters, until loops and routines (D112-D114). */
  work: Work;
  push: PushStore;
  pusher: Pusher;
  /** The partner's settings (D71). */
  settings: SettingsStore;
  /** 你的规则 / Your rules and who does the tasks (D89). */
  rules: RulesStore;
  loadout: Loadout;
  /** The user's connections (D96). */
  connections: ConnectionsStore;
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
  if (e.kind === "waiter") {
    const w = e.body as Bodies["waiter"];
    // A routine's watch starts a run; a task's own check wakes that task, not the partner.
    if (w.routineId) return false;
    if (w.state === "expired") return true;
    return w.state === "fired" && !(w.taskId && (w.check || w.event));
  }
  // An `until` loop that ends (met or stopped short) is said once, by the partner (D113).
  if (e.kind === "until") return (e.body as Bodies["until"]).state !== "on" && (e.body as Bodies["until"]).stop !== "user";
  // A routine Ducter paused by itself (failures, unread, budget) is said once (D114).
  if (e.kind === "routine") {
    const r = e.body as Bodies["routine"];
    return r.state === "paused" && r.pausedBy === "system" && r.pauseReason !== "review";
  }
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress";
  if (e.kind === "bridge_msg") return (e.body as Bodies["bridge_msg"]).direction === "in";
  // The second switch the same way: the partner offers a rule once (loadout.ts).
  if (isRuleHint(e)) return true;
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
  // Owner-only when we create it: it holds the Log, worktrees, browser profiles, the key file.
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // An existing dir from an older install (0755/0775) is tightened too, when it is ours.
  try {
    const st = statSync(dataDir);
    if (process.getuid && st.uid === process.getuid() && (st.mode & 0o077) !== 0) chmodSync(dataDir, 0o700);
  } catch {
    /* not ours or not a plain dir: leave it */
  }
  // D102: keys live in <dataDir>/keys.env (0600), read only by the code that passes each one to
  // its harness. Keys an older install left in <dataDir>/env move there, and any a server's unit
  // already loaded from that file leave this process's environment.
  try {
    const moved = migrateKeys(dataDir).moved;
    if (moved.length) console.log(`[ducter] moved ${moved.length} key(s) from ${join(dataDir, "env")} to ${join(dataDir, "keys.env")}`);
    scrubKeysFromEnv(readKeys(dataDir));
  } catch (err) {
    console.warn(`[ducter] could not move keys to keys.env: ${(err as Error).message}`);
  }
  const clock = opts.clock ?? realClock;
  const persona = opts.persona ?? { id: "default", name: "Ducter", identity: DEFAULT_IDENTITY };

  const log = openLog({ path: join(dataDir, "ducter.db"), persona: persona.id, clock });
  const tasks = createRegistry(log, clock);
  let runner: Runner | undefined;
  let partner: Partner | undefined;
  const push = openPushStore(dataDir);
  const settings = openSettings({ dataDir, log, push, persona, memoryPinnedOff: process.env.DUCTER_MEMORY === "off" });
  const decisions = createDecisions({
    log,
    tasks,
    clock,
    // DUCTER_DECISION_DEFAULT_MS: how long a reversible default waits (soak runs and demos use seconds).
    defaultDelayMs: opts.defaultDelayMs ?? (Number(process.env.DUCTER_DECISION_DEFAULT_MS) || undefined),
    delayMs: () => settings.defaultAfterMs(),
    onDecision: async (taskId, text) => {
      if (!runner) return console.warn(`[core] no runner: decision for ${taskId} not forwarded`);
      await runner.send(taskId, text, undefined, "user");
    },
  });
  const living = createLiving({ log, tasks, decisions, clock });
  const mcp = createMcpHub({ secret: loadSecret(dataDir) });
  registerCoreTools(mcp, log, tasks);
  const rules = openRules(dataDir);
  registerRuleTools(mcp, rules);
  const connections = openConnections({ dataDir, log, linker: opts.connectionLinker, oo: opts.ooSource, fetcher: opts.work?.connectionFetch });
  registerConnectionTools(mcp, connections);
  let workersRef: Workers | undefined;
  const work = createWork({
    log,
    tasks,
    mcp,
    runner: () => runner,
    workers: () => workersRef,
    connections,
    clock,
    persona: persona.id,
    exec: opts.work?.exec,
    minEveryMs: opts.work?.minEveryMs,
    judgeMinMs: opts.work?.judgeMinMs,
    restartLookMs: opts.work?.restartLookMs,
    defaultZone: opts.work?.defaultZone,
  });
  const waiters = work.waiters;
  tasks.setDecorator((o) => work.decorate(o));
  if (opts.work?.judge) work.setJudge(opts.work.judge);

  const early: LogEvent[] = []; // triggers that arrive before the partner is wired
  const trigger = (e: LogEvent) => {
    try {
      partner!.onTrigger(e);
    } catch (err) {
      console.error(`[core] partner.onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  const unsubscribePartner = log.subscribe((e) => {
    if (!triggersPartner(e) || !work.wakes(e)) return;
    if (partner) trigger(e);
    else if (early.length < 100) early.push(e);
  });

  let devicesView: DevicesView | undefined;
  const loadout = createLoadout({ log, tasks, settings, rules, devices: () => devicesView });
  const api = { log, tasks, mcp, persona, dataDir, settings, connections, bodies: loadout } as CoreApi;
  const ws = createWsHandler({ core: api, decisions, runner: () => runner, devices: () => devicesView, settings, connections, rules, loadout, work: work.frames, batchMs: opts.batchMs });
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
      // A renamed worker still answers to its old name (tasks placed before the rename, D84).
      const was = devices.formerly(d);
      return devices.list().find(hit) ?? (was?.kind === "worker" ? was : undefined) ?? devices.list({ all: true }).reverse().find(hit);
    },
  });
  workersRef = workers;
  api.workers = workers; // the runner places tasks on workers through this (runner/src/remote.ts)
  devicesView = createDevicesView({ dataDir, auth: devices, workers, connected: () => ws.connected(), probes: opts.deviceProbes });
  const sockets = splitSockets(ws.websocket, workers, { isLive: (id) => devices.isLive(id), nameOf: (id) => devices.list().find((d) => d.id === id)?.name, sweepMs: opts.sweepMs });
  const apns = opts.apns ?? createApnsSender(loadApnsConfig(dataDir));
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
    apns,
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
      const api = await webApi(req, g, { decisions, push, pusher, apns, personaName: () => persona.name });
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
    work,
    push,
    pusher,
    settings,
    rules,
    loadout,
    connections,
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    setRunner(r) {
      runner = r;
      // The cheap judge (D112, D113) runs on the harness the partner thinks with, on its small model.
      if (!opts.work?.judge)
        work.setJudge(createHarnessJudge({ harness: () => runner?.harness, pick: () => settings.get().brain, dataDir }));
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
      work.stop();
      pusher.stop();
      void server.stop(true); // awaiting hangs in Bun 1.3 when a WebSocket was open
      log.close();
      devices.close();
    },
  };
}
