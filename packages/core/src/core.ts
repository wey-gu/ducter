// Assembles the control plane: Log, registry, decisions, living message, MCP hub, WS server.
import { effectiveBrain } from "./brain.ts";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname as osHostname } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Bodies, LogEvent, OnHand, Place } from "@ducter/protocol";
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
import { createHarnessAsk, createHarnessJudge } from "./judge.ts";
import { createProactive, type Proactive } from "./proactive/engine.ts";
import { modelTriage, type Triage } from "./proactive/triage.ts";
import { modelJudge, type FindJudge } from "./proactive/judge.ts";
import { registerProactiveTools } from "./proactive/tools.ts";
import { createWsHandler, type WsData } from "./ws.ts";
import { createGate, openDeviceAuth, type DeviceAuth } from "./auth.ts";
import { createWorkers, deviceRoutes, splitSockets, type Workers, type WorkerSocketData } from "./workers.ts";
import { createPusher, openPushStore, type Pusher, type PushStore } from "./push.ts";
import { createApnsSender, createAppPushSender, loadApnsConfig, type ApnsSender } from "./apns.ts";
import { createRelayClient, relayUrl, type RelayFetch } from "./push-relay.ts";
import { webApi, webStatic } from "./web.ts";
import { createDevicesView, type DeviceProbes, type DevicesView } from "./devices.ts";
import { openSettings, type SettingsStore } from "./settings.ts";
import { openRules, type RulesStore } from "./rules.ts";
import { createLoadout, isRuleHint, registerRuleTools, type Loadout } from "./loadout.ts";
import { openConnections, type ConnectionsStore, type Linker, type OoSource } from "./connections.ts";
import { registerConnectionTools } from "./connection-tools.ts";
import { createChanges, type Changes } from "./changes.ts";
import { newTaskOptions, openYourTask, type GitRun, type NewTaskInput } from "./newtask.ts";
import { createReleaseWatch, type Fetch as ReleaseFetch, type ReleaseWatch } from "./release.ts";
import { createUpdates, type Updates, type UpdatesDeps } from "./updates.ts";
import { createAgentLatest, createAgentUpdates, type AgentUpdates, type AgentUpdatesDeps } from "./agents.ts";
import { bundledPiVersion, detectAgent, probeHarnesses } from "./harness-probe.ts";
import { createMemPlugins, type MemPlugins } from "./mem-plugins.ts";
import { inspectMemPlugins, nmemInspectExec } from "@ducter/protocol/src/mem-plugins.ts";
import { realSys, updateHow, writeAlive, type UpdateSys } from "./update.ts";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { createDucterBrowser, type DucterBrowser, type DucterBrowserOptions } from "./browser/index.ts";
import { readSites } from "./browser/sites.ts";
import { createClosing, registerClosingTool } from "./closing.ts";
import { workerProfile } from "./browser/remote.ts";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";

declare const DUCTER_COMMIT: string | undefined; // set by packages/cli/build.sh via --define
/** The build this core runs ("dev" from a checkout): /health says it, so Ducter.app can tell a background
 *  Ducter still on the helper it replaced (the app dragged in by hand) and restart it. */
const BUILD = typeof DUCTER_COMMIT === "string" ? DUCTER_COMMIT : "dev";

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
  /** Test seam: how the notification relay is called (default fetch to DUCTER_PUSH_RELAY or ducter.ai). */
  relayFetch?: RelayFetch;
  /** Test seams for Your devices and abilities (cua-driver, harness logins, device kind). */
  deviceProbes?: Partial<DeviceProbes>;
  /** Test seams for connections: the MCP link, and the oo CLI's config. */
  connectionLinker?: Linker;
  ooSource?: OoSource;
  /** Test seam for New task (D128): how newtask.ts runs its repo commands. */
  git?: GitRun;
  /** D148 test seams: the release feed, the update side effects, how this process updates. */
  update?: { fetch?: ReleaseFetch; sys?: UpdateSys; run?: UpdatesDeps["run"]; how?: import("@ducter/protocol").UpdateHow; version?: string; homeName?: string; execPath?: string; autoEveryMs?: number; graceMs?: number; criticalWaitMs?: number };
  /** D156 test seams: the channels' feed, the agents' updaters, this machine's copies. */
  agents?: { fetch?: ReleaseFetch; sys?: UpdateSys; which?: (c: string) => string | null; detect?: AgentUpdatesDeps["detect"]; loggedIn?: AgentUpdatesDeps["loggedIn"]; exists?: (p: string) => boolean; settleMs?: number; autoEveryMs?: number };
  /** D169 test seams: the Mem plugin check on the home (default: the real `nmem`, never in tests). */
  memPlugins?: { inspectLocal?: () => Promise<Record<string, import("@ducter/protocol").MemPluginView> | undefined>; everyMs?: number; now?: () => number; connected?: () => boolean };
  /** D151 test seams for Ducter's own browser (false: none). */
  browser?: false | Partial<Omit<DucterBrowserOptions, "mcp" | "log" | "tasks" | "decisions" | "persona" | "dataDir">>;
  /** The machine's platform as Devices sees it (tests: "linux"). */
  platform?: string;
  /** Work over time test seams (D112-D114): fake commands, a lower look floor, the judge. */
  work?: { exec?: import("@ducter/protocol/src/checks-run.ts").Exec; minEveryMs?: number; judgeMinMs?: number; restartLookMs?: number; defaultZone?: string; judge?: import("./waiters.ts").Judge; connectionFetch?: (url: string, init: RequestInit) => Promise<Response> };
  /** D165 test seams: the cheap triage and the bar (faked in tests; real ones need the runner's harness), the month's budget. */
  proactive?: { triage?: Triage; judge?: FindJudge; monthTokens?: number; zone?: string };
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
  /** D165: what Ducter notices in them, and how it says so. */
  proactive: Proactive;
  /** What each repo task changed so far (D128). */
  changes: Changes;
  /** D148: updating devices in place, and the newest release. */
  updates: Updates;
  release: ReleaseWatch;
  /** D156: the AI agents' own versions and their updates. */
  agents: AgentUpdates;
  /** D169: Nowledge Mem's plugin in each device's own agents. */
  memPlugins: MemPlugins;
  /** D151: Ducter's own browser. */
  ducterBrowser?: DucterBrowser;
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
    // D145: it can no longer come true (a check failed): said once, by the partner.
    if (w.state === "cancelled" && w.unmet && e.origin === "waiter" && !w.taskId) return true;
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
  // An incoming Bridge message wakes the partner, unless it was set aside or predates Bridge (D170).
  if (e.kind === "bridge_msg") return (e.body as Bodies["bridge_msg"]).direction === "in" && !(e.body as Bodies["bridge_msg"]).state;
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
  let workRef: Work | undefined; // set below: until loops hold their tries' done reports (D113)
  const decisions = createDecisions({
    log,
    tasks,
    clock,
    // DUCTER_DECISION_DEFAULT_MS: how long a reversible default waits (soak runs and demos use seconds).
    defaultDelayMs: opts.defaultDelayMs ?? (Number(process.env.DUCTER_DECISION_DEFAULT_MS) || undefined),
    delayMs: () => settings.defaultAfterMs(),
    holds: (taskId) => Boolean(workRef?.untils.active(taskId)),
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
  workRef = work;
  const waiters = work.waiters;
  // D128: what each repo task changed (cached counts), for On hand by project.
  let onHandChanged = () => {};
  const changes = createChanges({ log, tasks, runner: () => runner, onChange: () => onHandChanged() });
  let decorateBrowsing = (o: OnHand) => o; // D190: set once Ducter's browser is made (below)
  tasks.setDecorator((o) => decorateBrowsing(changes.decorate(work.decorate(o))));
  if (opts.work?.judge) work.setJudge(opts.work.judge);

  let proactiveRef: Proactive | undefined;
  const early: LogEvent[] = []; // triggers that arrive before the partner is wired
  const trigger = (e: LogEvent) => {
    try {
      partner!.onTrigger(e);
    } catch (err) {
      console.error(`[core] partner.onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  const unsubscribePartner = log.subscribe((e) => {
    if (!triggersPartner(e) || !work.wakes(e) || (proactiveRef && !proactiveRef.wakes(e))) return;
    if (partner) trigger(e);
    else if (early.length < 100) early.push(e);
  });

  // D151: Ducter's own browser (a server's 上网): its tools are listed only for tasks attached to it.
  const browser =
    opts.browser === false
      ? undefined
      : createDucterBrowser({ dataDir, mcp, log, tasks, decisions, persona: persona.id, device: () => opts.update?.homeName ?? osHostname().replace(/\.local$/, ""), ...(opts.platform ? { platform: opts.platform } : {}), lang: () => (settings.get().language === "zh" ? "zh-CN" : "en-US"), workers: () => workersRef, workerBrowserVersion: (id) => workersRef?.online().find((w) => w.deviceId === id)?.hello?.abilities?.find((a) => a.id === "web")?.detail, tell: (taskId, text) => runner?.send(taskId, text, undefined, "user").catch((e) => console.warn(`[core] couldn't tell ${taskId} the browser is back:`, (e as Error).message)), ...(opts.browser ?? {}) });
  if (browser) decorateBrowsing = (o) => browser.decorate(o);
  let devicesView: DevicesView | undefined;
  // D157: the sites Ducter's own browser on each computer is signed in to (the ranking prefers the
  // computer where the user already signed in, over their Chrome: least access that does the job).
  const sitesOn = (deviceId: string) => {
    const p = profileName(persona.id);
    try {
      return readSites(dataDir, deviceId === "local" ? p : workerProfile(deviceId, p)).map((s) => s.site);
    } catch {
      return [];
    }
  };
  const loadout = createLoadout({ log, tasks, settings, rules, devices: () => devicesView, sites: sitesOn });
  // D157: 我要合电脑了 / Move before closing: one decision for a computer.
  const closing = createClosing({ log, tasks, loadout, runner: () => runner });
  registerClosingTool(mcp, closing, () => settings.get().language === "zh");
  const api = { log, tasks, mcp, persona, dataDir, settings, connections, bodies: loadout, spine: log.spine, ...(browser ? { browser: browser.port } : {}) } as CoreApi;
  // D150: the one helper (brain.ts) the runner and the settings frame share.
  api.partnerFallback = () => {
    const e = effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow());
    return e.why ? { harness: e.harness } : undefined;
  };
  // 开一件事 / New task (D128): the one opening path the card and `ducter task` share.
  const newTaskDeps = { log, tasks, runner: () => runner, persona, dataDir, loadout, settings, ...(opts.git ? { git: opts.git } : {}) };
  const newTask = { open: (i: NewTaskInput) => openYourTask(newTaskDeps, i), options: (p?: Place) => newTaskOptions(newTaskDeps, p) };
  const ws = createWsHandler({ core: api, decisions, runner: () => runner, devices: () => devicesView, settings, connections, rules, loadout, closing, work: work.frames, newTask, updates: () => updatesRef, agents: () => agentsRef, memPlugins: () => memPluginsRef, proactive: () => proactiveRef, batchMs: opts.batchMs, ...(browser ? { browser } : {}) });
  onHandChanged = ws.onHandChanged;
  // D156: a partner turn in flight keeps an update of the agent it thinks with waiting.
  let partnerTurn = false;
  api.activity = {
    set: (a) => {
      partnerTurn = !!a;
      ws.setActivity(a);
    },
  };
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
  let updatesRef: Updates | undefined;
  let agentsRef: AgentUpdates | undefined;
  let memPluginsRef: MemPlugins | undefined;
  const workers = createWorkers({
    personaName: () => persona.name,
    onUpdate: (id, name, f) => updatesRef?.fromWorker(id, name, f),
    onAgentUpdate: (id, name, f) => agentsRef?.fromWorker(id, name, f),
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
  // D148: the newest release (no network in tests unless a feed is given) and updating in place.
  const u = opts.update ?? {};
  const testing = process.env.NODE_ENV === "test" && !u.fetch;
  const release = createReleaseWatch({ dataDir, fetch: u.fetch, timer: !testing, env: testing ? { ...process.env, DUCTER_UPDATE_CHECK: "off" } : process.env });
  const compiled = import.meta.url.includes("$bunfs") || import.meta.path.includes("$bunfs");
  const selfHow = u.how ?? updateHow({ compiled, platform: process.platform, execPath: u.execPath ?? process.execPath });
  const version = u.version ?? DUCTER_VERSION;
  const updates = createUpdates({
    dataDir,
    log,
    release,
    sys: u.sys ?? realSys,
    self: { execPath: u.execPath ?? process.execPath, how: selfHow, arch: process.arch, port: opts.port ?? Number(process.env.DUCTER_PORT || 7777), env: process.env },
    name: () => u.homeName ?? osHostname().replace(/\.local$/, ""),
    version,
    workers: () => ({
      online: () =>
        workers.online().map((w) => ({ id: w.deviceId, name: w.name, ...(w.hello?.version ? { version: w.hello.version } : {}), how: (w.hello?.how === "self" || w.hello?.how === "app" || w.hello?.how === "source" ? w.hello.how : "manual") as import("@ducter/protocol").UpdateHow })),
      update: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false, reason: "offline" };
        return link.call<{ ok: boolean; reason?: import("@ducter/protocol").UpdateReason; detail?: string }>("update", args, 30_000);
      },
    }),
    critical: () => runner?.critical?.() ?? [],
    holdCritical: (why) => runner?.holdCritical?.(why),
    working: () => tasks.list().filter((c) => c.attention === "working").length,
    settings: () => settings.get(),
    ...(u.run ? { run: u.run } : {}),
    ...(u.autoEveryMs !== undefined ? { autoEveryMs: u.autoEveryMs } : testing ? { autoEveryMs: 0 } : {}),
    ...(u.graceMs !== undefined ? { graceMs: u.graceMs } : {}),
    ...(u.criticalWaitMs !== undefined ? { criticalWaitMs: u.criticalWaitMs } : {}),
  });
  updatesRef = updates;
  // D156: the AI agents' own versions and their updates (agents.ts). No channel is read in tests
  // unless a fetch is given.
  const a = opts.agents ?? {};
  const agentTesting = process.env.NODE_ENV === "test";
  const agentSys = a.sys ?? u.sys ?? realSys;
  const agentLatest = createAgentLatest({ dataDir, ...(a.fetch ? { fetch: a.fetch } : agentTesting ? {} : { fetch: (x, i) => fetch(x, i) }), env: process.env });
  const agentProbe = { exec: (argv: string[], ms?: number) => agentSys.run(argv, { timeoutMs: ms ?? 15_000 }), which: a.which ?? ((c: string) => Bun.which(c)), env: process.env, dataDir, ...(agentTesting ? {} : { piBundled: bundledPiVersion }) };
  const isWorker = (dev: string) => devices.list().some((x) => x.kind === "worker" && (x.id === dev || x.name === dev));
  const agents = createAgentUpdates({
    log,
    sys: agentSys,
    latest: agentLatest,
    name: () => u.homeName ?? osHostname().replace(/\.local$/, ""),
    detect: a.detect ?? ((h) => detectAgent(h, agentProbe)),
    loggedIn: a.loggedIn ?? (async (h) => (await probeHarnesses({ ...agentProbe, only: [h] }))[0]?.loggedIn ?? false),
    busy: (device, h) => {
      const here = (c: { place?: Place }) => {
        const dev = c.place && "device" in c.place ? c.place.device : undefined;
        return device === "local" ? !dev || dev === "local" || !isWorker(dev) : dev === device || (!!dev && devices.list().some((x) => x.id === device && x.name === dev));
      };
      const n = tasks.list().filter((c) => c.attention === "working" && c.harness === h && here(c)).length;
      const partner = device === "local" && partnerTurn && effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow()).harness === h ? 1 : 0;
      return n + partner;
    },
    hold: (h, on) => runner?.holdHarness?.(h, on),
    workers: () => ({
      online: () => workers.online().map((w) => ({ id: w.deviceId, name: w.name })),
      update: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false, reason: "offline" };
        return link.call<{ ok: boolean; reason?: import("@ducter/protocol").AgentReason; detail?: string }>("agent_update", args, 30_000);
      },
    }),
    settings: () => settings.get(),
    devices: async () => ((await devicesView?.frame())?.devices ?? []).map((x) => ({ id: x.id, name: x.name, awake: x.state === "awake", harnesses: x.harnesses })),
    probed: () => devicesView?.refresh(),
    ...(a.settleMs !== undefined ? { settleMs: a.settleMs } : {}),
    ...(a.autoEveryMs !== undefined ? { autoEveryMs: a.autoEveryMs } : agentTesting ? { autoEveryMs: 0 } : {}),
    ...(a.exists ? { exists: a.exists } : {}),
  });
  agentsRef = agents;
  devicesView = createDevicesView({ dataDir, auth: devices, workers, connected: () => ws.connected(), probes: opts.deviceProbes, ...(u.homeName ? { hostname: u.homeName } : {}), updates: () => updates, agents: () => agents, mem: () => memPluginsRef, ...(agentTesting ? {} : { piBundled: bundledPiVersion }), self: { version, how: selfHow, platform: `${process.platform}-${process.arch}` }, ...(browser ? { browser } : {}), ...(opts.platform ? { platform: opts.platform } : {}), onDisconnect: (id) => {
    for (const s of push.forget(id)) void apns.revoke?.(s);
  } });
  updates.onChange(() => devicesView?.changed());
  agents.onChange(() => devicesView?.changed());
  // D169: Nowledge Mem in the user's own agents, per device. Checked at start, each day, when a
  // computer comes online, and after a sign-in or an agent update (both refresh the devices).
  const mp = opts.memPlugins ?? {};
  // D169: only for someone who already has Mem connected (its identity bound, D141, and Mem not
  // answering "missing"); without Mem, nothing about its plugin shows, anywhere.
  const memConnected = mp.connected ?? (() => !!persona.mem && !settings.memMissing());
  const memOn = () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && memConnected();
  const memPlugins = createMemPlugins({
    dataDir,
    log,
    tasks,
    persona,
    runner: () => runner,
    on: memOn,
    zh: () => settings.get().language === "zh",
    inspectLocal:
      mp.inspectLocal ??
      (agentTesting ? async () => undefined : () => inspectMemPlugins(nmemInspectExec(process.env))),
    inspectWorker: async (id) => {
      const link = workers.link(id);
      if (!link?.online()) return undefined;
      return link.call<Record<string, import("@ducter/protocol").MemPluginView> | null>("mem_plugins", {}, 30_000).then((r) => r ?? undefined).catch(() => undefined);
    },
    devices: async () => ((await devicesView?.frame())?.devices ?? []).map((x) => ({ id: x.id, name: x.name, home: x.home, awake: x.state === "awake", harnesses: x.harnesses })),
    ...(mp.everyMs !== undefined ? { everyMs: mp.everyMs } : agentTesting ? { everyMs: 0 } : {}),
    ...(mp.now ? { now: mp.now } : {}),
  });
  memPluginsRef = memPlugins;
  api.memPluginIn = (device, harness) => memPlugins.present(device, harness); // D168: a task there has it, in any form (research/48 M1)
  memPlugins.onChange(() => devicesView?.changed());
  {
    // A sign-in, a sign-out or an agent update refreshes the devices: read the check again.
    const v = devicesView;
    const refresh = v.refresh.bind(v);
    let soon: ReturnType<typeof setTimeout> | undefined;
    v.refresh = () => {
      refresh();
      if (soon) clearTimeout(soon);
      soon = setTimeout(() => void memPlugins.check(), 1_500);
    };
    // A computer that comes online is checked once it said hello.
    let up = new Set(workers.online().map((w) => w.deviceId));
    workers.onChange(() => {
      const now = new Set(workers.online().filter((w) => w.hello).map((w) => w.deviceId));
      for (const id of now) if (!up.has(id)) void memPlugins.check(id);
      up = now;
    });
    // Memory switched back on: check everything again.
    let wasOn = memOn();
    settings.onChange(() => {
      const on = memOn();
      if (on && !wasOn) void memPlugins.check();
      wasOn = on;
    });
    void memPlugins.check();
  }
  devicesView.harnessesNow(); // probe once at start, so the partner's first turn knows who is signed in
  const sockets = splitSockets(ws.websocket, workers, { isLive: (id) => devices.isLive(id), nameOf: (id) => devices.list().find((d) => d.id === id)?.name, sweepMs: opts.sweepMs });
  // The iPhone app: this home's own Apple key if it has one, else the notification relay (D159).
  const relayAt = relayUrl();
  const apns = opts.apns ?? createAppPushSender(createApnsSender(loadApnsConfig(dataDir)), relayAt ? createRelayClient(relayAt, opts.relayFetch) : undefined);
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
  // D165: the person's zone: their quiet hours', else the server's (a client's hello sets routines').
  const zone = () => opts.proactive?.zone ?? settings.get().quiet?.tz ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const proactive = createProactive({
    dataDir,
    log,
    clock,
    persona,
    connections,
    settings,
    push,
    pusher,
    rules,
    decisions,
    runner: () => runner,
    ...(opts.proactive?.triage ? { triage: opts.proactive.triage } : {}),
    ...(opts.proactive?.judge ? { judge: opts.proactive.judge } : {}),
    ...(opts.proactive?.monthTokens ? { monthTokens: opts.proactive.monthTokens } : {}),
    present: () => ws.present(),
    zone,
  });
  proactiveRef = proactive;
  registerProactiveTools(mcp, rules);

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
      if (url.pathname === "/health") return Response.json({ ok: true, headSeq: log.head(), build: BUILD, version });
      return new Response("not found", { status: 404 });
    },
    websocket: sockets,
  });
  const port = server.port!;
  // Up and listening: an update's helper waiting on this restart knows it's this version (update.ts
  // waitHealthy), also when /health doesn't name the version to it.
  try {
    writeAlive(dataDir, version);
  } catch {}
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
    proactive,
    changes,
    updates,
    release,
    agents,
    memPlugins,
    ...(browser ? { ducterBrowser: browser } : {}),
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    setRunner(r) {
      runner = r;
      // The cheap judge (D112, D113) runs on the harness the partner thinks with, on its small model.
      if (!opts.work?.judge)
        work.setJudge(createHarnessJudge({ harness: () => runner?.harness, pick: () => settings.get().brain, dataDir }));
      // D165: triage on the cheapest model of the harness the partner thinks with; the bar on its own model.
      const port = () => runner?.harness;
      const pick = () => settings.get().brain;
      proactive.setModels({
        ...(opts.proactive?.triage ? {} : { triage: modelTriage(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "triage" })) }),
        ...(opts.proactive?.judge ? {} : { judge: modelJudge(createHarnessAsk({ harness: port, pick, dataDir, cheap: false, dir: "judge" })) }),
      });
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
      await browser?.stop().catch(() => {});
      devicesView?.stop();
      workers.stop();
      sockets.stop();
      unsubscribePartner();
      decisions.stop();
      living.stop();
      work.stop();
      proactive.stop();
      changes.stop();
      pusher.stop();
      updates.stop();
      agents.stop();
      memPlugins.stop();
      release.stop();
      void server.stop(true); // awaiting hangs in Bun 1.3 when a WebSocket was open
      log.close();
      devices.close();
    },
  };
}
