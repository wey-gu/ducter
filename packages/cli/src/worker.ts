// `ducter worker <address> --code <code>`: this machine joins a Ducter running elsewhere as a
// worker, with the same one-time code a phone or an app window uses (D83; `--join` is a hidden
// alias for the address). It dials OUT (no inbound port here), says which harnesses it has, and stays
// connected. The main places tasks here over that socket; @ducter/runner's worker host runs
// them on this disk with this machine's harnesses (design/system.md "Workers").
import { startMemoryWatch } from "@ducter/core/src/memory-watch.ts";
import { refreshOnStart } from "@ducter/core/src/unit-refresh.ts";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { thisComputer } from "@ducter/core/src/this-computer.ts";
import { dirname, join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import type { Args } from "./args.ts";
import { realHost, runDoctor, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";
import * as runnerMod from "@ducter/runner";
import { scriptedHarness } from "./scripted.ts";
import { localDeviceKind } from "@ducter/core/src/devices.ts";
import { bundledPiVersion, detectAgent, probeHarnesses as probeLocalHarnesses, signedInNow } from "@ducter/core/src/harness-probe.ts";
import { agentSignature, captureLoginPath, saveLoginPath, widenAgentPath } from "@ducter/core/src/agent-path.ts";
import { createAgentSetup, realAgentSetupSys, type AgentSetup } from "@ducter/core/src/agent-setup.ts";
import { createWorkerMem, realWorkerMemSys } from "@ducter/core/src/worker-mem.ts";
import { createWorkerRecords } from "@ducter/core/src/worker-records.ts";
import { createLocalAgents } from "@ducter/core/src/local-agents/index.ts";
import { ducterFolder } from "@ducter/protocol/src/ducter-folder.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { createResourceProbe } from "@ducter/protocol/src/resources.ts";
import { probeEnv } from "./doctor.ts";
import { createWorkerAgentUpdater } from "@ducter/core/src/agents.ts";
import { migrateKeys, readKeys, scrubKeysFromEnv } from "@ducter/protocol/src/keys.ts";
import { isCompiled } from "./doctor.ts";
import { createWorkerUpdater, lastOutcome, type WorkerUpdater } from "./update.ts";
import { realSys, updateHow, writeAlive } from "@ducter/core/src/update.ts";
import { createWorkerBrowse } from "@ducter/core/src/worker-browse.ts";
import { createPhoneHost } from "@ducter/core/src/android/host.ts";
import { packagesFor } from "@ducter/core/src/android/sdk.ts";
import { inspectMemBridge, inspectMemPlugins, nmemInspectExec } from "@ducter/protocol/src/mem-plugins.ts";
import { createKeeper, fpFromLink, normalizeBase, race, type ReachWay } from "@ducter/protocol/src/reach.ts";
import { proveHome } from "@ducter/protocol/src/reach-verify.ts";
import { createHold, createPinger, realClock } from "./uplink.ts";

/** Exit status when the main refuses this worker; the unit sets RestartPreventExitStatus to it. */
export const EXIT_REFUSED = 3;

export interface WorkerSaved {
  url: string; // http(s) base of the main: the way in use now (D293)
  token: string;
  deviceId: string;
  persona: string;
  name: string;
  /** D293: every way to reach the home, as it last said them. */
  ways?: ReachWay[];
  /** D293: the home's key fingerprint, pinned when this worker joined (from the link, else the home's answer). */
  fp?: string;
}

/** Address as typed or the whole pairing link (…/pair#c=CODE) → http(s) base and maybe a code. */
export function parseJoin(raw: string): { base: string; code?: string } {
  let s = raw.trim();
  const m = /[#?&]c=([A-Za-z0-9-]+)/.exec(s);
  const code = m?.[1];
  s = s.replace(/[#?].*$/, "");
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(127\.|localhost|\[::1\])/.test(s) ? "http://" : "https://") + s;
  const u = new URL(s);
  if (u.protocol === "ws:") u.protocol = "http:";
  if (u.protocol === "wss:") u.protocol = "https:";
  u.pathname = u.pathname.replace(/\/+$/, "").replace(/\/(pair|ws|worker)$/, "");
  u.hash = u.search = "";
  return { base: u.toString().replace(/\/+$/, ""), ...(code ? { code } : {}) };
}

const wsBase = (base: string) => base.replace(/^http/, "ws");

function load(file: string): WorkerSaved | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function save(file: string, s: WorkerSaved) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** The four first-wave harnesses on this machine (D85), as the main's Your devices shows them. */
async function probeHarnesses(_t: T, dataDir: string, setup?: AgentSetup) {
  const host = realHost();
  // D363: the person's own agent folders and Ducter's tools folder, looked at again each time (an
  // nvm node installed since shows up without a restart).
  widenAgentPath({ dataDir });
  const found = await probeLocalHarnesses({
    exec: async (argv, ms) => {
      const r = await host.run(argv, ms);
      return { code: r.code, out: r.stdout, ...(r.stderr ? { err: r.stderr } : {}) };
    },
    which: (c) => host.which(c),
    dataDir,
    piBundled: bundledPiVersion,
  });
  // D156: each agent's version and how it was installed ride along; the main reads its latest.
  // D503: whose account it is, as a fingerprint, so the main can tell one limit from two.
  const rows = found.map((h) => ({ id: h.harness, installed: h.installed, loggedIn: h.loggedIn, ...(h.version ? { version: h.version } : {}), ...(h.how ? { how: h.how } : {}), ...(h.account ? { account: h.account } : {}), ...(h.trouble ? { trouble: h.trouble } : {}) }));
  return setup ? setup.decorate(rows) : rows;
}

/**
 * D363: the worker's PATH at start: the login shell's (captured again now, kept for the next
 * start), the usual per-user folders and Ducter's tools folder. A service's own PATH is not the
 * person's shell's, so an agent in ~/.nvm or ~/.npm-global was never found before.
 */
async function startAgentPath(dataDir: string): Promise<void> {
  const host = realHost();
  const login = await captureLoginPath({ run: async (argv, ms) => ((r) => ({ code: r.code, out: r.stdout }))(await host.run(argv, ms)) });
  if (login?.length) saveLoginPath(dataDir, login);
  widenAgentPath({ dataDir, ...(login?.length ? { login } : {}) });
}

/** D156: the main's `agent_update` op on this machine (core agents.ts), with the real updaters. */
function workerAgentUpdater(t: T, dataDir: string, held: () => boolean) {
  const host = realHost();
  const exec = async (argv: string[], ms?: number) => {
    const r = await realSys.run(argv, { timeoutMs: ms ?? 15_000 });
    return { code: r.code, out: r.out };
  };
  const probe = { exec, which: (c: string) => host.which(c), env: process.env, dataDir };
  return createWorkerAgentUpdater({
    sys: realSys,
    detect: (h) => detectAgent(h, probe),
    loggedIn: async (h) => (await probeLocalHarnesses({ ...probe, only: [h] }))[0]?.loggedIn ?? false,
    probe: () => probeHarnesses(t, dataDir),
    // D227: kept on disk while it runs (the next process reports a cut-off one; the Mac app holds
    // its restart), and it waits while this computer's own Ducter update is under way.
    dataDir,
    held,
  });
}

/**
 * D347: is this computer already a worker of the home at base, with a token that still works?
 * (A rerun of the lend line must not spend a fresh code, nor fail on the used one.)
 */
export async function stillJoined(saved: WorkerSaved | undefined, base: string): Promise<boolean> {
  if (!saved?.token) return false;
  const same = (a: string) => normalizeBase(a) === normalizeBase(base);
  if (!same(saved.url) && !(saved.ways ?? []).some((w) => same(w.url))) return false;
  try {
    const r = await fetch(`${saved.url}/worker`, { headers: { authorization: `Bearer ${saved.token}` }, signal: AbortSignal.timeout(10_000) });
    return r.status !== 401 && r.status !== 403;
  } catch {
    return false;
  }
}

export async function cmdWorker(o: {
  t: T;
  style: Style;
  args: Args;
  dataDir: string;
  /** D347: `--service`: install the worker service once joined (main.ts runs `ducter service install --worker`). */
  installService?: () => Promise<number>;
}): Promise<number> {
  const { t, style, args } = o;
  const file = join(o.dataDir, "worker.json");
  let saved = existsSync(file) ? load(file) : undefined;

  // D347: the lend line run again (or on a computer already joined there): keep what works.
  const already = args.join ? await stillJoined(saved, parseJoin(args.join).base) : false;
  if (already) console.log(`  ${style.ok("✓")} ${t("worker.already", { name: saved!.name, url: saved!.url })}`);
  if (args.join && !already) {
    const { base, code: linkCode } = parseJoin(args.join);
    const code = args.code ?? linkCode;
    if (!code) return console.log(t("worker.usage")), 2;
    const name = args.name || thisComputer();
    let res: Response;
    try {
      res = await fetch(`${base}/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // role: the code is open to any device (D83); this one joins to do tasks.
        // D155: computer = this host, so the app and the command line here fold into its card.
        body: JSON.stringify({ code, name, platform: `${platform()}-${arch()}`, role: "worker", computer: thisComputer() }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return console.log(t("worker.err.unreachable", { url: base })), 1;
    }
    if (res.status === 429) return console.log(t("worker.err.locked")), 1;
    if (res.status !== 200) {
      const why = await res.json().then((j: any) => j?.error).catch(() => undefined);
      // D347: the lend line (--service) came from Add a computer for tasks: its next step is there, not `ducter pair`.
      return console.log(t(why === "expired" ? "worker.err.expired" : args.service ? "worker.err.codeLend" : "worker.err.code")), 1;
    }
    const j: any = await res.json();
    // D293: the link named the home's key; a home that answers with another isn't that home.
    const linkFp = fpFromLink(args.join);
    if (linkFp && typeof j.fp === "string" && j.fp !== linkFp) return console.log(t("worker.err.notHome", { url: base })), 1;
    const fp = typeof j.fp === "string" ? j.fp : linkFp;
    saved = { url: base, token: j.token, deviceId: j.deviceId, persona: j.personaName ?? "Ducter", name, ...(fp ? { fp } : {}), ...(Array.isArray(j.ways) ? { ways: j.ways } : {}) };
    save(file, saved);
    console.log(`  ${style.ok("✓")} ${t("worker.joined", { name, persona: saved.persona, url: base })}`);
  }
  if (!saved) return console.log(t("worker.usage")), 2;
  // D347: joined; the service keeps it running from here (this process doesn't stay connected).
  if (args.service && o.installService) return o.installService();
  // D102: a worker's keys live in its own <dataDir>/keys.env, as on the main.
  try {
    migrateKeys(o.dataDir);
    scrubKeysFromEnv(readKeys(o.dataDir));
  } catch {
    /* an unreadable data folder fails louder below */
  }

  // D157: this computer browses for tasks with its own browsers; 上网 rides in the hello.
  let sendUp: (f: object) => void = () => {};
  // D234: an Apple Silicon Mac has Ducter's phone of its own (installed from its card on the home).
  const phone = packagesFor(platform(), arch()).ok ? createPhoneHost({ dataDir: o.dataDir }) : undefined;
  const browse = createWorkerBrowse({ dataDir: o.dataDir, send: (f) => sendUp(f), ...(phone ? { phone } : {}) });
  const kind = await localDeviceKind();
  let updater: WorkerUpdater | undefined;
  const agentUpdater = workerAgentUpdater(t, o.dataDir, () => updater?.underWay() ?? false);
  // D363: the person's own agents, wherever their shell would find them; then putting agents here
  // and signing them in, asked for from the home (the agent_setup op).
  await startAgentPath(o.dataDir);
  let rows: Awaited<ReturnType<typeof probeHarnesses>> = [];
  const sendAgents = (harnesses: typeof rows) => ((rows = harnesses), (hello.harnesses = harnesses), sendUp({ t: "agents", harnesses }));
  const reprobe = () => probeHarnesses(t, o.dataDir, setup).then(sendAgents);
  const setup: AgentSetup = createAgentSetup({
    dataDir: o.dataDir,
    // D416: an agent's own sign-out through OAR (Antigravity's ACP logout), on this computer.
    sys: { ...realAgentSetupSys({ platform: platform(), arch: arch(), which: (c) => whichNow(c), env: (cmd) => probeEnv([cmd]) }), logout: async (h: string) => (await runnerMod.createOarHarnessPort({ dataDir: o.dataDir }).logout?.(h)) ?? { ok: false } },
    probe: reprobe,
    changed: () => sendAgents(setup.decorate(rows)),
    // D518: a sign-in is done when the agent's own check, run now, says so.
    signedIn: async (h) => {
      widenAgentPath({ dataDir: o.dataDir });
      const host = realHost();
      // D523: both streams (agy may say "Please sign in" on either), and agy's "can't tell".
      return signedInNow(h, { exec: async (argv, ms) => ((r) => ({ code: r.code, out: r.stdout, ...(r.stderr ? { err: r.stderr } : {}) }))(await host.run(argv, ms)), which: (c) => host.which(c), dataDir: o.dataDir });
    },
  });
  // D366: Nowledge Mem on this computer for tasks: where it stands (Mem's own doctor), putting its
  // command line here, signing it in with the person's one-time link and connecting the agents here.
  // Its view rides in the hello once looked at, and as `mem` frames after each change.
  const mem = createWorkerMem({
    dataDir: o.dataDir,
    // D386: `path` asks on another PATH (the person's own nmem, outside Ducter's tools folder).
    sys: realWorkerMemSys({ platform: platform(), arch: arch(), which: (c, p) => whichNow(c, p === undefined ? process.env : { PATH: p }), env: () => probeEnv(["nmem"]) }),
    // D386: Ducter's own nmem went ahead of the person's too-old one on PATH (or stepped back).
    pathChanged: () => void widenAgentPath({ dataDir: o.dataDir }),
    agents: () => rows.filter((h) => h.installed).map((h) => h.id),
    changed: () => {
      const v = mem.view();
      (hello as { mem?: unknown }).mem = v;
      sendUp({ t: "mem", mem: v });
    },
  });
  // D377: the person's own agents' records here (Claude Code, Codex, pi), for the partner at the
  // home: read only after the person's yes for this computer, kept here (records.json).
  const records = createWorkerRecords({
    dataDir: o.dataDir,
    reader: process.env.DUCTER_OUTSIDE === "0" ? createLocalAgents({ home: join(o.dataDir, "no-outside"), env: {} }) : createLocalAgents(process.env.DUCTER_OUTSIDE_HOME ? { home: process.env.DUCTER_OUTSIDE_HOME, env: {} } : {}),
    ducterFolder: () => ducterFolder({ dataDir: o.dataDir }).path,
    changed: () => {
      const v = records.view();
      (hello as { records?: unknown }).records = v;
      sendUp({ t: "records", records: v });
    },
  });
  const hello = {
    t: "hello",
    name: saved.name,
    records: records.view(),
    os: platform(),
    arch: arch(),
    kind,
    abilities: await browse.abilities(),
    alwaysOn: browse.alwaysOn(kind),
    version: pkg.version,
    harnesses: (rows = await probeHarnesses(t, o.dataDir, setup)),
    // D148: how this computer updates, and how its last update went (once, after its restart).
    how: updateHow({ compiled: isCompiled(), platform: platform(), execPath: process.execPath }),
    // D187: a Mac's worker asks its app to update (the phone's 更新 reaches it).
    asksApp: updateHow({ compiled: isCompiled(), platform: platform(), execPath: process.execPath }) === "app",
    ...((u) => (u ? { update: u } : {}))(lastOutcome(o.dataDir, { version: pkg.version })),
    // D227: this process, and the agents it is updating now: a home that sees another boot knows
    // an update this one doesn't run was cut off by the restart.
    boot: `${process.pid}-${Date.now().toString(36)}`,
    get agentUpdates(): string[] {
      return agentUpdater.updating();
    },
    // D538: what this computer has and has free now (memory, cores, disk, the kernel's stops), also
    // on every heartbeat (the ping), so placement sees it without asking anyone.
    resources: undefined as unknown,
  };
  const probe = createResourceProbe({ dir: o.dataDir });
  const lookRes = () => probe.look().then((r) => void (hello.resources = r)).catch(() => {});
  await lookRes();
  const resTimer = setInterval(lookRes, 15_000);
  (resTimer as { unref?: () => void }).unref?.();
  // DUCTER_SCRIPTED_MODEL=1: canned model words, real tools (scripted.ts), for demos and e2e.
  const harness = process.env.DUCTER_SCRIPTED_MODEL === "1" ? scriptedHarness(runnerMod) : runnerMod.createOarHarnessPort({ dataDir: o.dataDir });
  const s = saved;
  const dataDir = o.dataDir;
  updater = createWorkerUpdater({ dataDir, version: pkg.version, how: hello.how, agentsInstalling: () => agentUpdater.installing() });
  await agentUpdater.leftovers().catch(() => {});
  // D524: a worker runs tasks too: its children go before it when memory runs out, and an older unit gets today's settings.
  startMemoryWatch({ dataDir });
  refreshOnStart(dataDir);
  // D539: the keys Ducter keeps on this computer for its tasks here (copied with the person's Go).
  const keptKeys = runnerMod.createKeyShelf({ dataDir });
  const makeHost = (send: (f: object) => void) => {
    sendUp = send;
    // D293: one host for the life of this process; its sessions outlive a dropped socket for the
    // grace. mainBase follows the way in use, for the sessions started after a switch.
    const host = runnerMod.createWorkerHost({ dataDir, harness, get mainBase() { return s.url; }, deviceToken: s.token, send, keys: keptKeys, browser: { ducter: browse.ducter }, extraOps: { ...browse.ops, ...records.ops, mem_plugins: async () => (await inspectMemPlugins(nmemInspectExec(process.env))) ?? null, mem_bridge_look: async () => (await inspectMemBridge(nmemInspectExec(process.env))) ?? null, mem_connect: (a: { harnesses?: unknown }) => mem.connectTools(Array.isArray(a?.harnesses) ? a.harnesses.filter((x): x is string => typeof x === "string") : []) }, abilities: browse });
    // Nobody to drive Ducter's browser here once the socket is gone: quit it (sign-ins saved).
    const closeAll = host.closeAll;
    host.closeAll = async () => {
      await Promise.all([closeAll(), browse.stopAll().catch(() => {})]);
    };
    return host;
  };
  let outcomeWatch: ReturnType<typeof setInterval> | undefined;
  let agentsTimer: ReturnType<typeof setInterval> | undefined;
  let agentsFull: ReturnType<typeof setInterval> | undefined;
  // D363: agent_setup from the home: install, sign in, a pasted code, cancel, look again.
  const onSetup = async (f: any, up: (x: object) => void) => {
    const a = f.args ?? {};
    // D366: Nowledge Mem here: put its command line in, or sign it in (the link goes to nmem only).
    if (f.op === "mem_setup") {
      if (a.action === "install") mem.install();
      else if (a.action === "connect") mem.connect(typeof a.link === "string" && a.link ? a.link : undefined);
      else if (a.action === "look") void mem.look(); // D375: 再看一次 on its Mem row
      else return up({ t: "res", id: f.id, ok: false, error: `unknown action ${a.action}` });
      return up({ t: "res", id: f.id, ok: true, result: { ok: true } });
    }
    const hs: string[] = Array.isArray(a.harnesses) ? a.harnesses.filter((x: unknown) => typeof x === "string") : [];
    const h = typeof a.harness === "string" ? a.harness : "";
    if (a.action === "install") setup.install(hs);
    else if (a.action === "login") setup.login(h);
    else if (a.action === "code") setup.code(h, String(a.code ?? ""));
    else if (a.action === "cancel") setup.cancel(h);
    else if (a.action === "logout") setup.logout(h);
    else if (a.action === "look") {
      await startAgentPath(dataDir);
      await reprobe().catch(() => {});
      void mem.look(); // D366: its card opened: where Mem stands there now
    } else return up({ t: "res", id: f.id, ok: false, error: `unknown action ${a.action}` });
    up({ t: "res", id: f.id, ok: true, result: { ok: true } });
  };
  const code = await stayConnected(s, hello, t, style, makeHost, updater, agentUpdater, file, onSetup, () => {
    // Reached the main: a restart after an update is healthy now (update.ts waitHealthy).
    writeAlive(dataDir, pkg.version);
    lastOutcome(dataDir, { markReported: true, version: pkg.version });
    // The helper writes the outcome only after it saw alive.json, so after this hello: look for
    // it a while longer and send it up when it comes (D167).
    if (!outcomeWatch) {
      const end = Date.now() + 10 * 60_000;
      outcomeWatch = setInterval(() => {
        const f = lastOutcome(dataDir, { markReported: true, version: pkg.version });
        if (f) sendUp(f);
        if (f || Date.now() > end) clearInterval(outcomeWatch);
      }, 3000);
      (outcomeWatch as any).unref?.();
    }
    // 上网 may have changed while it was away (Claude in Chrome connected, Chrome installed).
    void browse.abilities().then((abilities) => sendUp({ t: "abilities", abilities }));
    // D366: and where Nowledge Mem stands here (Mem's own doctor; a sign-in may have changed).
    void mem.look();
    // D377: and which of the person's agents wrote here since (file times alone).
    sendUp({ t: "records", records: ((hello as { records?: unknown }).records = records.view()) });
    // The AI agents too: the hello was probed when this worker started, and an agent updated
    // since (by Ducter before a reconnect, or by hand) must not be offered again at its old
    // version (that update then "fails" with nothing newer). Fresh on every welcome, and every
    // 30 min while connected.
    // D363: and within seconds of a change made by hand: a cheap look (where each agent's command
    // is, when its sign-in files changed; no process started) every 5 s, a real probe when it moved.
    const agents = () => void reprobe().catch(() => {});
    agents();
    let seen = "";
    const look = () => agentSignature({ dataDir, which: (c) => whichNow(c) });
    agentsTimer ??= setInterval(() => {
      if (setup.busy()) return; // its own probe follows each step
      widenAgentPath({ dataDir });
      const now = look();
      if (seen && now !== seen) agents();
      seen = now;
    }, 5000);
    (agentsTimer as any).unref?.();
    agentsFull ??= setInterval(agents, 30 * 60_000);
    (agentsFull as any).unref?.();
  });
  return refusedExit(code, process.env);
}

/**
 * D155: under launchd (a Mac's LaunchAgent restarts only an exit that isn't clean) a worker the
 * main refused exits 0, so it isn't started again every few seconds; systemd keeps exit 3
 * (RestartPreventExitStatus).
 */
export function refusedExit(code: number, env: Record<string, string | undefined>): number {
  return code === EXIT_REFUSED && env.DUCTER_SUPERVISOR === "launchd" ? 0 : code;
}

/** D293: the way to dial now: the best way that proves it is the home, else the one in use. */
export async function pickWay(s: Pick<WorkerSaved, "url" | "ways" | "fp">, probe?: (url: string) => Promise<boolean>): Promise<string> {
  if (!s.fp || !s.ways?.length) return s.url;
  const ways = s.ways.some((w) => normalizeBase(w.url) === normalizeBase(s.url)) ? s.ways : [...s.ways, { kind: "domain" as const, url: s.url }];
  return (await race(ways, { probe: probe ?? proveHome(s.fp), sleep: (ms) => Bun.sleep(ms) })) ?? s.url;
}

/**
 * One outbound socket, reconnecting with backoff; exits only when the main refuses this worker.
 * D293: one host across sockets (its sessions held for the grace after a drop), a ping deadline,
 * a redial at once after the computer slept, and the best way to the home re-checked every 30 s.
 */
async function stayConnected(
  s: WorkerSaved,
  hello: Record<string, unknown>,
  t: T,
  style: Style,
  makeHost: (send: (f: object) => void) => runnerMod.WorkerHost,
  updater: WorkerUpdater | undefined,
  agentUpdater: ReturnType<typeof createWorkerAgentUpdater> | undefined,
  file: string,
  onSetup?: (f: any, up: (x: object) => void) => Promise<void>,
  onWelcome?: () => void,
): Promise<number> {
  let backoff = 1000;
  let announced = false;
  let current: WebSocket | undefined;
  const hold = createHold({ clock: realClock, expire: () => host.closeAll() });
  // Nobody to report to past the grace: stop the sessions; the main resumes them by id when we're back.
  const host = makeHost((f) => hold.send(f));
  const keeper = createKeeper({ ways: () => s.ways ?? [], current: () => s.url, probe: (u) => (s.fp ? proveHome(s.fp)(u) : Promise.resolve(false)) });
  let keepTimer: ReturnType<typeof setInterval> | undefined;
  const persist = () => {
    try {
      save(file, s);
    } catch {}
  };
  for (;;) {
    // D293: the best way that proves it is the home (only with a pinned key and more than one way).
    const url = await pickWay(s);
    if (url !== s.url) (s.url = url), persist();
    let switching = false;
    const outcome = await new Promise<"closed" | "refused" | "app">((resolve) => {
      const ws = new WebSocket(`${wsBase(s.url)}/worker`, { headers: { authorization: `Bearer ${s.token}` } } as any);
      current = ws;
      const up = (x: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(x));
      const pinger = createPinger({
        clock: realClock,
        // D538: the computer's own look rides on the heartbeat (an older home ignores it).
        ping: () => up({ t: "ping", ...(hello.resources ? { res: hello.resources } : {}) }),
        // A half-open socket after a network change, or a wake from sleep: drop it and dial again.
        kill: (why) => {
          if (why === "woke") backoff = 1000;
          try {
            ws.close(4000, why);
          } catch {}
        },
      });
      ws.onopen = () => {
        ws.send(JSON.stringify({ ...hello, held: hold.held(host.held()) }));
        pinger.start();
      };
      ws.onmessage = (m) => {
        pinger.heard();
        const f = JSON.parse(String(m.data));
        // D148: the update op runs beside the host; it reports over whichever socket is up.
        if (f.t === "req" && f.op === "update" && updater) return void updater.handle(f, up, host);
        // D156: updating one of this machine's AI agents, the same way.
        if (f.t === "req" && f.op === "agent_update" && agentUpdater) return void agentUpdater.handle(f, up, host);
        // D362: 停止 on one of them (a slow download).
        if (f.t === "req" && f.op === "agent_update_stop" && agentUpdater) return void agentUpdater.stop(f, up);
        // D363: putting an agent here, signing it in, looking again.
        // D366: Nowledge Mem on this computer for tasks (its command line, its sign-in), the same way.
        if (f.t === "req" && (f.op === "agent_setup" || f.op === "mem_setup") && onSetup) return void onSetup(f, up).catch((e) => up({ t: "res", id: f.id, ok: false, error: String(e) }));
        if (f.t === "req") return void host.handle(f);
        // D293: the home's ways changed (a domain added, the tunnel turned off).
        if (f.t === "ways" && Array.isArray(f.ways)) return void ((s.ways = f.ways), persist());
        if (f.t === "welcome") {
          backoff = 1000;
          if (Array.isArray(f.ways)) s.ways = f.ways;
          if (!s.fp && typeof f.fp === "string") s.fp = f.fp;
          if (Array.isArray(f.ways) || f.fp) persist();
          hold.up(up);
          updater?.attach(up);
          agentUpdater?.attach(up);
          onWelcome?.();
          if (!announced) console.log(`  ${style.ok("●")} ${t("worker.connected", { url: s.url, name: s.name })}`);
          announced = true;
          clearInterval(keepTimer);
          keepTimer = setInterval(async () => {
            const next = await keeper.tick().catch(() => undefined);
            if (!next || current !== ws || normalizeBase(next) === normalizeBase(s.url)) return;
            console.log(style.dim(t("worker.moved", { url: next })));
            s.url = next;
            persist();
            switching = true;
            ws.close(4000, "another way");
          }, 30_000);
          (keepTimer as any).unref?.();
        }
      };
      ws.onclose = async () => {
        pinger.stop();
        clearInterval(keepTimer);
        // D293: the sessions wait for the grace; past it, they close (the hold's expire).
        hold.down(host.sessions());
        if (switching) return resolve("closed");
        // Was it the gate? A GET with the token answers 401 when the token is gone.
        try {
          const r = await fetch(`${s.url}/worker`, { headers: { authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(5000) });
          if (r.status === 401) return resolve("refused");
          // Joined as an app (a Ducter older than D83 ignores role): it can't do tasks with this token.
          if (r.status === 403) return resolve("app");
        } catch {}
        resolve("closed");
      };
    });
    if (outcome === "app" || outcome === "refused") {
      await host.closeAll();
      console.log(t(outcome === "app" ? "worker.asApp" : "worker.refused", { url: s.url }));
      return EXIT_REFUSED;
    }
    if (switching) continue;
    console.log(style.dim(t("worker.lost", { url: s.url, s: Math.round(backoff / 1000) })));
    await Bun.sleep(backoff);
    backoff = Math.min(backoff * 2, 30_000);
  }
}
