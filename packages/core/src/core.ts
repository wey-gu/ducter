// Assembles the control plane: Log, registry, decisions, living message, MCP hub, WS server.
import { createPreviews, loopbackOf } from "./preview.ts";
import { createWbFrames } from "./workbench.ts";
import { effectiveBrain } from "./brain.ts";
import { createMediaStore } from "./media.ts";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { thisComputer } from "./this-computer.ts";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { HARNESSES, fill, harnessName, normalizeTag, sameComputer, pickTag, words, type Bodies, type HarnessId, type LangTag, type LogEvent, type OnHand, type PartnerAsk, type Place, type TaskCard } from "@ducter/protocol";
import { intlLocale, talkLang } from "./lang.ts";
import type { CoreApi, ListedModel, MemIdentity, Partner, Runner, TaskMemoryPort } from "@ducter/protocol/src/internal.ts";
import { migrateKeys, readKeys, scrubKeysFromEnv } from "@ducter/protocol/src/keys.ts";
import { realClock, type Clock } from "./clock.ts";
import { createDecisions, forwardFrom, type Decisions } from "./decisions.ts";
import { createLiving, type Living } from "./living.ts";
import { openLog, type SqliteLog } from "./log.ts";
import { createMcpHub, type CoreMcpHub } from "./mcp.ts";
import { DEFAULT_IDENTITY, otherIdentity, type Persona } from "./persona.ts";
import { createRegistry, type CoreRegistry } from "./registry.ts";
import { createMarks, createPast } from "./past.ts";
import { createOutside } from "./outside.ts";
import { createLocalAgents, type LocalAgents } from "./local-agents/index.ts";
import { bridgeOnWords, connectsByItself, createBridgeAuto } from "./bridge-auto.ts";
import { createDid } from "./did.ts";
import { registerDidTool } from "./did-tool.ts";
import { recentFolders } from "./first-words.ts";
import { createOngoing } from "./ongoing.ts";
import { registerCoreTools } from "./tools.ts";
import type { Waiters } from "./waiters.ts";
import { createWork, type Work } from "./work.ts";
import { createHarnessAsk, createHarnessJudge } from "./judge.ts";
import { createProactive, type Proactive } from "./proactive/engine.ts";
import { modelTriage, type Triage } from "./proactive/triage.ts";
import { modelJudge, type FindJudge } from "./proactive/judge.ts";
import { registerProactiveTools } from "./proactive/tools.ts";
import { createWsHandler, type WsData } from "./ws.ts";
import { openPartners, type Partners } from "./partners.ts";
import { DEFAULT_PARTNER, channelOf, isOtherChannel } from "@ducter/protocol/src/partners.ts";
import { asSeenBy, createWhose, partnerView } from "./partner-view.ts";
import { createGate, openDeviceAuth, type DeviceAuth } from "./auth.ts";
import { createWorkers, deviceRoutes, splitSockets, type Workers, type WorkerSocketData } from "./workers.ts";
import { createPusher, openPushStore, type Pusher, type PushStore } from "./push.ts";
import { createApnsSender, createAppPushSender, http2Transport, loadApnsConfig, type ApnsSender, type ApnsTransport } from "./apns.ts";
import { createActivitySender, createAmbient, openAmbientStore } from "./ambient.ts";
import { createRelayClient, relayUrl, type RelayFetch } from "./push-relay.ts";
import { webApi, webStatic } from "./web.ts";
import { CHECK_PATH, createAnywhere, type AnywhereCtl, type TunnelSys } from "./anywhere.ts";
import { createLend } from "./lend.ts";
import { callAbility, createDevicesView, publicAddress, qrRows, homeName as savedHomeName, type DeviceProbes, type DevicesView } from "./devices.ts";
import { openSettings, type SettingsStore } from "./settings.ts";
import { createBridgeLink, nmemCall, type NmemCall } from "./bridge-link.ts";
import { createMemGlance } from "./mem-glance.ts";
import { identityIdFor, readMemIdentity } from "./mem-identity.ts";
import { openRules, type RulesStore } from "./rules.ts";
import { createLoadout, isRuleHint, registerRuleTools, registerSwitchTool, type Loadout } from "./loadout.ts";
import { openConnections, type ConnectionsStore, type Linker, type OoSource } from "./connections.ts";
import { callWakes, neverCall, openPhone, type Phone } from "./phone.ts";
import { openOwnPhone } from "./phone-own/index.ts";
import { providerOf } from "./phone-provider.ts";
import { registerConnectionTools } from "./connection-tools.ts";
import { createCalendar, type Calendar } from "./calendar.ts";
import { briefOf, createTaskSources, placeForRepo, type TaskSources, type TaskSourcesDeps } from "./task-sources/index.ts";
import { dayKey } from "./proactive/detect.ts";
import { createChanges, type Changes } from "./changes.ts";
import { createModelCatalog, type ModelCatalog } from "./models.ts";
import { browseFolders, cloneProject, createFoundRepos, ghInstallHome, gitLoginOn, isOldOp, newFolderProject, languageOf, newTaskOptions, openYourTask, type FolderProjects, type GitLoginAction, type GitRun, type NewTaskComputers, type NewTaskInput } from "./newtask.ts";
import { projectRepos, realFs, type BrowseResult } from "@ducter/protocol/src/repos.ts";
import { cloneRepo, type CloneResult } from "@ducter/protocol/src/clone.ts";
import { newProjectFolder, type NewFolderResult } from "@ducter/protocol/src/new-folder.ts";
import { createGitLogin, type GitLogin, type GitLoginState } from "@ducter/protocol/src/git-login.ts";
import { createGhInstaller, useOwnTools, type GhInstaller } from "./gh-install.ts";
import { ducterFolder } from "@ducter/protocol/src/ducter-folder.ts";
import { createProjects } from "./projects.ts";
import { createTaskGroups, type TaskGroups } from "./task-groups.ts";
import { createReleaseWatch, type Fetch as ReleaseFetch, type ReleaseWatch } from "./release.ts";
import { createUpdates, type Updates, type UpdatesDeps } from "./updates.ts";
import { createAgentLatest, createAgentUpdates, type AgentUpdates, type AgentUpdatesDeps } from "./agents.ts";
import { createUpdateAll, type UpdateAll } from "./update-all.ts";
import { bundledPiVersion, detectAgent, probeHarnesses } from "./harness-probe.ts";
import { createMemPlugins, type MemPlugins } from "./mem-plugins.ts";
import { inspectMemPlugins, nmemInspectExec } from "@ducter/protocol/src/mem-plugins.ts";
import { realSys, updateHow, writeAlive, type UpdateSys } from "./update.ts";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { createAutofill, type Autofill } from "./saved/index.ts";
import { createKeys } from "./saved/keys.ts";
import { createDucterBrowser, type DucterBrowser, type DucterBrowserOptions } from "./browser/index.ts";
import { createDucterPhone, type DucterPhone, type DucterPhoneOptions } from "./android/index.ts";
import { createHandsets } from "./handset/index.ts";
import { createComputerUse, type ComputerUse, type ComputerUseOptions } from "./computer/index.ts";
import { readSites } from "./browser/sites.ts";
import { createClosing, registerClosingTool } from "./closing.ts";
import { createAccountUsage } from "./account-usage.ts";
import { createLimitWaits } from "./limits.ts";
import { workerProfile } from "./browser/remote.ts";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";
import { createChannels, type ChannelDeps, type Channels } from "./channels/index.ts";
import { homeIdentity, okNonce } from "./home-key.ts";
import { addWay, bookHas, createReach, removeWay, viaOf, type ReachWatch } from "./reach-book.ts";
import { CHALLENGE_PATH } from "@ducter/protocol/src/reach.ts";
import { proveHome } from "@ducter/protocol/src/reach-verify.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { createAgentSetup, realAgentSetupSys } from "./agent-setup.ts";
import { widenAgentPath } from "./agent-path.ts";

declare const DUCTER_COMMIT: string | undefined; // set by packages/cli/build.sh via --define
/** The build this core runs ("dev" from a checkout): /health says it, so Ducter.app can tell a background
 *  Ducter still on the helper it replaced (the app dragged in by hand) and restart it. */
const BUILD = typeof DUCTER_COMMIT === "string" ? DUCTER_COMMIT : "dev";

/** D228: the Go card for a tunnel in the person's own Cloudflare account (D292: zh and en; ko → en). */
const ANYWHERE_ASK = {
  zh: {
    question: "在你的 Cloudflare 账号里建一条通道，把 {hostname} 指到 {name}？以后在哪儿打开 {hostname}，都是这台电脑上的 Ducter。想用别的名字，直接回我。",
    go: "建好它",
  },
  en: {
    question: "Create a tunnel in your Cloudflare account and point {hostname} at {name}? Opening {hostname} anywhere will then reach Ducter on this computer. Want another name? Just reply with it.",
    go: "Set it up",
  },
};

export interface CoreOptions {
  /** D299: the reader of the person's own agents' sessions (Past tasks' 也在这台电脑上). Default:
   *  this computer's, at DUCTER_OUTSIDE_HOME or the home folder; none under `bun test` or with
   *  DUCTER_OUTSIDE=0 (tests never read a real person's sessions). */
  localAgents?: LocalAgents;
  dataDir?: string;
  port?: number; // 0 = random (tests)
  hostname?: string; // default env DUCTER_HOST or 127.0.0.1; anything else is an explicit choice
  persona?: Persona;
  /** D309: more than one partner (tests); default: DUCTER_PARTNERS=preview. */
  partners?: boolean;
  clock?: Clock;
  defaultDelayMs?: number;
  /** D233: how long ask_for_key waits in the call for the person (tests); default per harness. */
  keyWaitMs?: number;
  batchMs?: number;
  sweepMs?: number; // how often live device sockets are re-checked for revocation (default 10 s)
  push?: boolean; // send Web Push (default on; env DUCTER_PUSH=off turns it off)
  pushHoldMs?: number;
  pushFetch?: (url: string, init: RequestInit) => Promise<Response>; // tests
  /** Sends to the iPhone app (tests pass a fake; default: <dataDir>/apns.json or DUCTER_APNS_*). */
  apns?: ApnsSender;
  /** Test seam: how the notification relay is called (default fetch to DUCTER_PUSH_RELAY or ducter.ai). */
  relayFetch?: RelayFetch;
  /** D306 test seam: how Live Activity pushes reach Apple with this home's own key. */
  ambientTransport?: ApnsTransport;
  /** Test seams for Your devices and abilities (cua-driver, harness logins, device kind). */
  deviceProbes?: Partial<DeviceProbes>;
  /** D228: test seam for 从外面连's tunnel (cloudflared, its metrics, the network). */
  anywhereSys?: TunnelSys;
  anywherePollMs?: number;
  /** D293 test seam: how the home checks one of its ways (none in tests: no network). */
  reachCheck?: (url: string) => Promise<boolean>;
  anywhereStartMs?: number;
  anywhereStepWaitMs?: number;
  /** Test seams for connections: the MCP link, and the oo CLI's config. */
  connectionLinker?: Linker;
  ooSource?: OoSource;
  /** D193 test seams: how OAuth sign-in reaches the server, and ms per second of its poll interval. */
  oauthFetch?: (url: string, init?: RequestInit) => Promise<Response>;
  signInMsPerSec?: number;
  /** Test seam for New task (D128): how newtask.ts runs its repo commands. */
  git?: GitRun;
  /** D197 test seam: the workers as New task and projects see them (names, a folder read there). */
  newTaskComputers?: NewTaskComputers;
  /**
   * D298: the partner's first words. Present: said once when an app opens a fresh conversation
   * (main.ts turns them on); `home` and `env` say whose agents' records to read (tests: a scratch
   * home with fake Claude Code and Codex folders). Absent: no first words.
   */
  firstWords?: { home?: string; env?: Record<string, string | undefined> };
  /** D298 test seams for a pasted key: the network, and which agents this computer can run. */
  keyFetch?: typeof fetch;
  keyCanRun?: (h: HarnessId) => boolean;
  /** D204 test seam: the home's own Ducter folder and its projects (default: <Ducter folder>/projects here). */
  homeRepos?: () => FolderProjects;
  /** D204 test seam: clone into the home's own Ducter folder (default: git, with this computer's sign-in). */
  cloneHome?: (address: string) => Promise<CloneResult>;
  /** D203 test seam: the home's own subfolders for 找一个文件夹… (default: this computer's home folder). */
  browseHome?: (path: string | undefined) => BrowseResult;
  /** D272 test seam: make a folder in the home's own Ducter folder (default: <Ducter folder>/projects here). */
  newFolderHome?: (name: string) => NewFolderResult;
  /** D272 test seam: the home's own GitHub sign-in (default: this computer's gh). */
  gitLoginHome?: GitLogin;
  /** D345 test seam: puts gh on the home (default: Homebrew or GitHub's own build; tests: none). */
  ghInstaller?: GhInstaller;
  /** D341: 待办来源 / To-do sources: the seams (a fake gh, a scratch home for Obsidian's vault list, the look's pace). Tests default to no gh and no vaults. */
  taskSources?: Partial<Pick<TaskSourcesDeps, "ghRun" | "ghEnv" | "home" | "pollMs" | "boundMs" | "quietMs" | "today" | "now">> & { /** D359: the model the pile sorts and pre-reads with (tests, demos: a fake). */ ask?: import("./task-sources/pile.ts").Ask };
  /** D202 test seam: each agent's models on each computer (else read from the agents themselves). */
  models?: ModelCatalog;
  /** D148 test seams: the release feed, the update side effects, how this process updates. */
  /** D205: the persona's Bridge connection (bridge-link.ts): tests pass a fake nmem. */
  /** D340: whether this home connects to the person's Mem by itself (default: connectsByItself(dataDir)). */
  bridgeByItself?: boolean;
  bridgeLink?: { run?: NmemCall; env?: Record<string, string | undefined>; exec?: import("./bridge-link.ts").MemExec; sys?: import("./mem-cli.ts").MemSys };
  /** D218: seams for the own-number phone (tests and demos: a fake phone, a loopback cable, a fake voice engine). */
  ownNumber?: Partial<import("./phone-own/index.ts").OwnPhoneDeps>;
  update?: { fetch?: ReleaseFetch; sys?: UpdateSys; run?: UpdatesDeps["run"]; how?: import("@ducter/protocol").UpdateHow; version?: string; homeName?: string; execPath?: string; autoEveryMs?: number; graceMs?: number; criticalWaitMs?: number };
  /** D156 test seams: the channels' feed, the agents' updaters, this machine's copies. */
  /** D224 test seams: how often a running plan looks again, and the night's look. */
  updateAll?: { tickMs?: number; nightEveryMs?: number; tz?: string };
  agents?: { fetch?: ReleaseFetch; sys?: UpdateSys; which?: (c: string) => string | null; detect?: AgentUpdatesDeps["detect"]; loggedIn?: AgentUpdatesDeps["loggedIn"]; exists?: (p: string) => boolean; settleMs?: number; autoEveryMs?: number };
  /** D363 test seams: putting agents on the home (default: the real network and npm, never in tests). */
  agentSetup?: { sys?: import("./agent-setup.ts").AgentSetupSys };
  /** D169 test seams: the Mem plugin check on the home (default: the real `nmem`, never in tests). */
  memPlugins?: { inspectLocal?: () => Promise<Record<string, import("@ducter/protocol").MemPluginView> | undefined>; everyMs?: number; now?: () => number; connected?: () => boolean };
  /** D151 test seams for Ducter's own browser (false: none). */
  browser?: false | Partial<Omit<DucterBrowserOptions, "mcp" | "log" | "tasks" | "decisions" | "persona" | "dataDir">>;
  /** D217: Ducter's phone (用手机); false leaves it out (tests). */
  ownPhone?: false | Partial<Omit<DucterPhoneOptions, "mcp" | "log" | "tasks" | "decisions" | "dataDir">>;
  /** D253: test seams for the person's own phone's loan (its timings). */
  handset?: Partial<Pick<import("./handset/index.ts").HandsetsOptions, "callMs" | "beatMs" | "quietMs" | "lostMs" | "graceMs" | "idleMs" | "recordWaitMs" | "recordAskMs" | "endedMs" | "pauseMs">>;
  /** D235: 用电脑 / Use the computer test seams (a fake cua-driver; false leaves it out). */
  computer?: false | Partial<Omit<ComputerUseOptions, "mcp" | "log" | "tasks" | "dataDir">>;
  /** The machine's platform as Devices sees it (tests: "linux"). */
  platform?: string;
  /** Work over time test seams (D112-D114): fake commands, a lower look floor, the judge. */
  work?: { exec?: import("@ducter/protocol/src/checks-run.ts").Exec; minEveryMs?: number; judgeMinMs?: number; restartLookMs?: number; defaultZone?: string; judge?: import("./waiters.ts").Judge; connectionFetch?: (url: string, init: RequestInit) => Promise<Response> };
  /** D165 test seams: the cheap triage and the bar (faked in tests; real ones need the runner's harness), the month's budget. */
  proactive?: { triage?: Triage; judge?: FindJudge; monthTokens?: number; zone?: string };
  /** D276 test seams for 聊天软件 / Chat apps: the adapters against fake servers, the outbox's sleep. */
  channels?: Pick<ChannelDeps, "make" | "sleep" | "gapMs" | "openUrl" | "wechat">;
}

export interface Core extends CoreApi {
  /** D277: a chat app reaches the person now (a Mac app's iMessage bridge says on). */
  channelUp(via: string): boolean;
  /** D226: the harness and model the partner thinks with now (triage, the bar and the cheap judge use it). */
  brainInUse(): { harness: HarnessId; model?: string };
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
  /** D276: 聊天软件 / Chat apps (channels/). */
  channels: Channels;
  /** The partner's settings (D71). */
  settings: SettingsStore;
  /** D205: the persona's Bridge connection (bridge-link.ts). */
  bridgeLink: import("./bridge-link.ts").BridgeLink;
  /** 你的规则 / Your rules and who does the tasks (D89). */
  rules: RulesStore;
  loadout: Loadout;
  /** The user's connections (D96). */
  connections: ConnectionsStore;
  /** D193: phone calls through the calling connection. */
  phone: Phone;
  /** D218: calls from the owner's own phone and number. */
  ownNumber: import("./phone-own/index.ts").OwnPhone;
  /** D165: what Ducter notices in them, and how it says so. */
  proactive: Proactive;
  /** D222: the person's calendars as one day, and changes behind a Go. */
  calendar: Calendar;
  /** D341: 待办来源 / To-do sources: the person's to-dos in other apps and the tasks bound to them. */
  taskSources: TaskSources;
  /** D360: groups of tasks that are one piece of work, and the members held in line. */
  taskGroups: TaskGroups;
  /** What each repo task changed so far (D128). */
  changes: Changes;
  /** D148: updating devices in place, and the newest release. */
  updates: Updates;
  release: ReleaseWatch;
  /** D156: the AI agents' own versions and their updates. */
  agents: AgentUpdates;
  /** D224: 全部更新 / Update all. */
  updateAll: UpdateAll;
  /** D169: Nowledge Mem's plugin in each device's own agents. */
  memPlugins: MemPlugins;
  /** D151: Ducter's own browser. */
  ducterBrowser?: DucterBrowser;
  /** D217: Ducter's phone (用手机). */
  ducterPhone?: DucterPhone;
  /** D238: the person's own phones (用这台手机). */
  handsets: import("./handset/index.ts").Handsets;
  /** D235: 用电脑 / Use the computer. */
  computer?: ComputerUse;
  /** D191: 密码和银行卡 / Passwords & cards (D336; Autofill in code). */
  autofill: Autofill;
  port: number;
  url: string; // ws URL for clients
  setRunner(r: Runner): void;
  /** D228: 从外面连 / From outside (the tunnel and its guided setup). */
  anywhere: AnywhereCtl;
  setPartner(p: Partner): void;
  stop(): Promise<void>;
  /** D309: 伙伴们 / Partners. */
  partners: Partners;
  /**
   * D312: how another partner's session is made (main.ts: createPartner on its view). Each one
   * starts on its first trigger (or at once when it ran before, so a restart picks up what it
   * was doing) and parks itself when idle, like the default.
   */
  setPartnerFactory(make: PartnerFactory): void;
  /** D312: the core another partner's session runs on (tests, the eval). */
  partnerView(id: string): CoreApi;
  /** D312: another partner's own folder (session state, its Mem identity): <dataDir>/partners/<id>. */
  partnerDir(id: string): string;
  /** D312: its Mem identity, once bound (main.ts binds it when Mem is on). */
  setPartnerMem(id: string, mem: MemIdentity | undefined): void;
  /** D312: the other partners' sessions running now, by id (tests). */
  partnerSessions(): Map<string, Partner>;
}

/** D312: makes another partner's session on its own view of core. */
export type PartnerFactory = (view: CoreApi, id: string, o: { dir: string; boot: boolean }) => Partner | Promise<Partner>;

export const defaultDataDir = () => process.env.DUCTER_DATA_DIR || join(homedir(), ".ducter");

/** Events that wake the partner (principle 6): user messages, resolutions, non-progress reports, fired waiters. */
export function triggersPartner(e: LogEvent): boolean {
  if (e.kind === "user_msg") return true;
  // D236: a question answered by a reply wakes it through the reply, which says so.
  if (e.kind === "decision_resolved") return !(e.body as Bodies["decision_resolved"]).msgSeq;
  // D222: a calendar change the person said Go to that didn't go through (core ran it; success is the card's).
  if (e.kind === "connection_call") {
    const c = e.body as Bodies["connection_call"];
    return c.op === "write" && c.state === "failed" && !!c.decisionId && /calendar/.test(c.action);
  }
  // D341: new to-dos in a source the person wants told (or taken under the standing go); a write
  // they said Go to that didn't go through. A closed or edited to-do is told to its task and asked
  // on its own card, so it doesn't wake the partner.
  if (e.kind === "source_seen") return (e.body as Bodies["source_seen"]).change === "new";
  if (e.kind === "source_write") {
    const w = e.body as Bodies["source_write"];
    return w.state === "failed" && w.by === "go";
  }
  if (e.kind === "waiter") {
    const w = e.body as Bodies["waiter"];
    // A routine's watch starts a run; a task's own check wakes that task, not the partner.
    if (w.routineId) return false;
    // D297: a task waiting on its agent's limit is the task's own wait; the partner hears it only
    // when it matters (no reset time and nobody else to take it), once.
    if (w.limit) return w.state === "armed" && !!w.limit.tell;
    if (w.wakes === "task") return false; // D267: the task's own timer wakes the task
    if (w.state === "expired") return true;
    // D145: it can no longer come true (a check failed): said once, by the partner.
    if (w.state === "cancelled" && w.unmet && e.origin === "waiter" && !w.taskId) return true;
    return w.state === "fired" && !(w.taskId && (w.check || w.event));
  }
  // An `until` loop that ends (met or stopped short) is said once, by the partner (D113).
  if (e.kind === "until") return (e.body as Bodies["until"]).state !== "on" && (e.body as Bodies["until"]).stop !== "user";
  // A routine Ducter paused by itself (failures, unread, budget) is said once (D114); one that
  // keeps hitting an account error, and then works again, is said once each (D245).
  if (e.kind === "routine") {
    const r = e.body as Bodies["routine"];
    if (r.news) return r.state === "active";
    return r.state === "paused" && r.pausedBy === "system" && r.pauseReason !== "review";
  }
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress";
  // An incoming Bridge message wakes the partner, unless it was set aside or predates Bridge (D170).
  if (e.kind === "bridge_msg") return (e.body as Bodies["bridge_msg"]).direction === "in" && !(e.body as Bodies["bridge_msg"]).state;
  // The second switch the same way: the partner offers a rule once (loadout.ts).
  if (isRuleHint(e)) return true;
  // D193: a call that ended on its own (not the owner's hang-up or Not now) is said once.
  if (e.kind === "phone_call") return callWakes(e.body as Bodies["phone_call"]);
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
  const tasks = createRegistry(log, clock, () => settings.get().quiet?.tz ?? opts.work?.defaultZone);
  let runner: Runner | undefined;
  let partner: Partner | undefined;
  const push = openPushStore(dataDir);
  const settings = openSettings({ dataDir, log, push, persona, memoryPinnedOff: process.env.DUCTER_MEMORY === "off" });
  // D309: the partners on this home (the default is persona; more only in the preview).
  const partners = openPartners({ dataDir, log, persona, ...(opts.partners !== undefined ? { on: opts.partners } : {}) });
  // D312: whose an event is, and where core's own writes to the conversation go: a write that
  // belongs to another partner's task, question, wait, call or routine (or is made while that
  // partner's tool call is handled) lands in that partner's conversation. One partner: as before.
  const isOther = (id: string | undefined) => !!id && id !== DEFAULT_PARTNER && id !== persona.id && partners.has(id);
  const whose = createWhose({ log, tasks, isOther });
  if (partners.on()) {
    const append = log.append.bind(log);
    log.append = ((input: Parameters<typeof append>[0]) => append(whose.route(input))) as typeof log.append;
    log.subscribe(whose.learn);
  }
  let limitsDecorate = (o: OnHand) => o; // D297: set once the limit waits are made (below)
  /** D292: the conversation's language now (the setting, else what the person writes in, else English). */
  const langNow = (): LangTag => talkLang(settings, log) ?? "en";
  let workRef: Work | undefined; // set below: until loops hold their tries' done reports (D113)
  const decisions = createDecisions({
    log,
    tasks,
    clock,
    // DUCTER_DECISION_DEFAULT_MS: how long a reversible default waits (soak runs and demos use seconds).
    defaultDelayMs: opts.defaultDelayMs ?? (Number(process.env.DUCTER_DECISION_DEFAULT_MS) || undefined),
    delayMs: () => settings.defaultAfterMs(),
    holds: (taskId) => Boolean(workRef?.untils.active(taskId)),
    rests: (taskId) => Boolean(workRef?.waiters.views().some((w) => w.taskId === taskId && w.state === "armed" && (w.check || w.event || w.watch || w.judge || w.wakes === "task"))),
    onDecision: async (taskId, text, r) => {
      if (!runner) return console.warn(`[core] no runner: decision for ${taskId} not forwarded`);
      await runner.send(taskId, text, undefined, forwardFrom(r)); // D284: a Go relayed is Ducter's words, a reply the person's
    },
  });
  const living = createLiving({ log, tasks, decisions, clock, ...(partners.on() ? { streamOf: (c: TaskCard) => channelOf(whose.ofTask(c.taskId)) } : {}) });
  const mcp = createMcpHub({ secret: loadSecret(dataDir) });
  registerCoreTools(mcp, log, tasks, partners.on() ? whose : undefined);
  // D312: a task's tool calls carry the partner it is for (its memory_search is that partner's).
  mcp.setTaskPersona((taskId) => {
    const p = whose.ofTask(taskId);
    return p === DEFAULT_PARTNER ? undefined : p;
  });
  const rules = openRules(dataDir);
  registerRuleTools(mcp, rules);
  const connections = openConnections({ dataDir, log, linker: opts.connectionLinker, oo: opts.ooSource, fetcher: opts.work?.connectionFetch, oauthFetch: opts.oauthFetch, signInMsPerSec: opts.signInMsPerSec, clientName: "Ducter", knownName: (ts) => providerOf(ts)?.name });
  registerConnectionTools(mcp, connections);
  let workersRef: Workers | undefined;
  // D234, D235: an ability as a worker last said it (its hello, then its abilities frames).
  const workerAbility = (id: string, ability: "phone" | "computer") => workersRef?.online().find((w) => w.deviceId === id)?.hello?.abilities?.find((a) => a.id === ability);
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
  // D186: the projects the user added by hand; On hand shows them before their first task.
  // D197: a folder on a worker (the user's Mac, for a home on a server) is read there.
  const computers: NewTaskComputers = opts.newTaskComputers ?? {
    nameOf: (dev) => workersRef?.link(dev)?.name,
    homeName: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName),
    async folderInfo(dev, path, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<import("@ducter/protocol/src/folder-info.ts").FolderInfo>("folderInfo", { path }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) throw Object.assign(new Error(`${link.name} runs an older Ducter that can't read its folders for this home yet; update it first.`), { old: true });
        throw err;
      }
    },
    // D203: the workers, the repos each one reports, and its folders one level at a time.
    workers: () => (workersRef?.list() ?? []).map((w) => ({ id: w.id, name: w.name, online: w.online })),
    async repos(dev, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<FolderProjects>("repos", {}, ms);
      } catch (err) {
        // D204: an older Ducter without the op says so (the card asks to update it); away or slow: none.
        return isOldOp(err) ? "old" : "offline";
      }
    },
    async browse(dev, path, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<BrowseResult>("browse", path ? { path } : {}, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) return "old";
        throw err;
      }
    },
    // D272: a new folder in that worker's Ducter folder, and its GitHub sign-in, there.
    async newFolder(dev, name, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<NewFolderResult>("newFolder", { name }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) return "old";
        throw err;
      }
    },
    async gitLogin(dev, action, token, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return { state: "offline" };
      try {
        return await link.call<GitLoginState>("gitLogin", { action, ...(token !== undefined ? { token } : {}) }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return { state: "offline" };
        if (isOldOp(err)) return { state: "old" };
        throw err;
      }
    },
    // D204: 从 Git 地址加… on that worker: it clones into its own Ducter folder, with its own git.
    async clone(dev, address, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<CloneResult>("clone", { address }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) return "old";
        throw err;
      }
    },
  };
  const projects = createProjects({ dataDir, ...(opts.git ? { git: opts.git } : {}), onChange: () => onHandChanged(), remote: (dev, path) => computers.folderInfo(dev, path, 15_000) });
  // D193: phone calls (the partner drafts; the owner's Go places; Ducter polls and keeps the rails).
  let autofillRef: Autofill | undefined;
  const savedPhone = () => {
    try {
      return autofillRef?.store.secret("me.phone") ?? undefined;
    } catch {
      return undefined;
    }
  };
  const callZone = () => settings.get().quiet?.tz ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  // D218: calls from the owner's own Android phone and SIM, plugged into this home.
  const ownNumber = openOwnPhone({
    dataDir,
    clock,
    where: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName),
    partnerName: () => persona.name,
    savedNumber: savedPhone,
    zone: callZone,
    neverCall,
    // D278: a Linux home is a server (devices.ts's rule): never offered as the place for the phone.
    ...(opts.platform ? { platform: opts.platform } : {}),
    ...(opts.ownNumber ?? {}),
    onChange: () => onHandChanged(), // the live call's row in On hand
  });
  const phone = openPhone({
    own: ownNumber,
    dataDir,
    log,
    connections,
    clock,
    quiet: () => push.settings().quiet,
    zone: () => settings.get().quiet?.tz ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    partnerName: () => persona.name,
    // D208: the owner's saved phone (Your details) is their own number: no callee hours for it.
    ownNumbers: () => {
      try {
        const n = autofillRef?.store.secret("me.phone");
        return n ? [n] : [];
      } catch {
        return [];
      }
    },
    onChange: () => onHandChanged(),
    onCalling: () => devicesView?.changed(), // D199: the home's 打电话
  });
  // D360: groups of tasks that are one piece of work; the later members of a line are held here.
  const taskGroups = createTaskGroups({ dataDir, tasks, runner: () => runner, now: () => clock.now(), changed: () => onHandChanged() });
  log.subscribe((e) => taskGroups.onEvent(e));
  tasks.setDecorator((o) => {
    const on = decorateBrowsing(changes.decorate(limitsDecorate(work.decorate(o))));
    const added = projects.list();
    const calls = phone.calls();
    // D312: every partner's own open questions, so On hand lists another partner's (a client leaves out the one it shows).
    const asks: PartnerAsk[] = partners.questions();
    const groups = taskGroups.list();
    return { ...on, ...(added.length ? { projects: added } : {}), ...(calls.length ? { calls } : {}), ...(asks.length ? { asks } : {}), ...(groups.length ? { groups } : {}) };
  });
  if (opts.work?.judge) work.setJudge(opts.work.judge);

  let proactiveRef: Proactive | undefined;
  let calendarRef: Calendar | undefined;
  let taskSourcesRef: TaskSources | undefined;
  // D276: 聊天软件 / Chat apps: the person's own Telegram bot and Slack app, more windows on this
  // one conversation (channels/hub.ts). Their quiet hours and "notifications off" are push's.
  const channels = createChannels({
    dataDir,
    log,
    decisions,
    media: { put: (b, o) => media.put(b, o), path: (id) => media.path(id) },
    clock,
    quiet: () => push.settings().quiet,
    notifyOff: () => push.settings().off === true,
    // D292: the conversation's language, else this computer's (nothing said yet).
    lang: () => talkLang(settings, log) ?? normalizeTag(Intl.DateTimeFormat().resolvedOptions().locale) ?? "en",
    personaName: () => persona.name,
    openUrl: opts.channels?.openUrl ?? (() => {
      const v = anywhereRef?.view();
      return v?.state === "on" && v.hostname ? `https://${v.hostname}/` : undefined;
    }),
    ...(opts.channels?.make ? { make: opts.channels.make } : {}),
    ...(opts.channels?.sleep ? { sleep: opts.channels.sleep } : {}),
    ...(opts.channels?.gapMs !== undefined ? { gapMs: opts.channels.gapMs } : {}),
    ...(opts.channels?.wechat ? { wechat: opts.channels.wechat } : {}),
  });
  const early: LogEvent[] = []; // triggers that arrive before the partner is wired
  const trigger = (e: LogEvent) => {
    try {
      partner!.onTrigger(e);
    } catch (err) {
      console.error(`[core] partner.onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  // D312: the other partners' sessions, each started on its first trigger (others.ts below).
  const sessions = new Map<string, Partner>();
  const starting = new Map<string, LogEvent[]>(); // triggers that came while its session was being made
  let factory: PartnerFactory | undefined;
  const views = new Map<string, CoreApi>();
  const partnerDir = (id: string) => join(dataDir, "partners", id);
  const startOther = (id: string, boot: boolean) => {
    if (!factory || sessions.has(id) || starting.has(id)) return;
    starting.set(id, []);
    void Promise.resolve()
      .then(() => factory!(viewOf(id), id, { dir: partnerDir(id), boot }))
      .then((p) => {
        sessions.set(id, p);
        for (const e of starting.get(id) ?? []) triggerOther(id, e);
      })
      .catch((err) => console.error(`[core] couldn't start partner ${id}:`, err))
      .finally(() => starting.delete(id));
  };
  const triggerOther = (id: string, e: LogEvent) => {
    const p = sessions.get(id);
    if (!p) {
      const q = starting.get(id);
      if (q) return void (q.length < 100 && q.push(e));
      if (!factory) return; // no way to answer yet (a stub home): its conversation is kept
      startOther(id, false);
      return void starting.get(id)?.push(e);
    }
    try {
      p.onTrigger(asSeenBy(id, e));
    } catch (err) {
      console.error(`[core] partner ${id} onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  const unsubscribePartner = log.subscribe((e) => {
    if (!triggersPartner(e) || !work.wakes(e) || (proactiveRef && !proactiveRef.wakes(e)) || (calendarRef && !calendarRef.wakes(e)) || (taskSourcesRef && !taskSourcesRef.wakes(e))) return;
    // D312: another partner's conversation, task, wait or routine wakes that partner, never the default.
    const who = partners.on() ? whose.ofEvent(e) : DEFAULT_PARTNER;
    if (who !== DEFAULT_PARTNER) return triggerOther(who, e);
    if (isOtherChannel(e.stream)) return;
    if (partner) trigger(e);
    else if (early.length < 100) early.push(e);
  });

  // D191: 密码和银行卡 / Passwords & cards (D336; Autofill in code): saved sign-ins, cards and details, filled by reference in Ducter's browser.
  const autofill = createAutofill({ dataDir, persona: persona.id, mcp, log, tasks: tasks as never, ...(opts.platform ? { platform: opts.platform } : {}) });
  autofillRef = autofill;
  // D233: 密钥 / Keys a task asks the person for. No key value ever enters the Log: every event's
  // body is scrubbed of them on the way in (a command that printed one shows dots everywhere).
  const keys = createKeys({ dataDir, mcp, log, decisions, store: autofill.store, tasks, ...(opts.keyWaitMs !== undefined ? { waitMs: () => opts.keyWaitMs! } : {}) });
  autofill.keys = keys;
  {
    const append = log.append.bind(log);
    log.append = ((input: Parameters<typeof log.append>[0]) => append({ ...input, body: keys.scrub(input.body) })) as typeof log.append;
  }
  // D151: Ducter's own browser (a server's 上网): its tools are listed only for tasks attached to it.
  const browser =
    opts.browser === false
      ? undefined
      : createDucterBrowser({ dataDir, mcp, log, tasks, decisions, persona: persona.id, device: () => thisComputer(opts.update?.homeName), ...(opts.platform ? { platform: opts.platform } : {}), lang: () => { const l = settings.get().language; return intlLocale(l === "auto" ? undefined : l); }, workers: () => workersRef, workerBrowserVersion: (id) => workersRef?.online().find((w) => w.deviceId === id)?.hello?.abilities?.find((a) => a.id === "web")?.detail, scrub: (t) => autofill.scrub(t), wants: (taskId, brief) => autofill.wants(brief !== undefined ? { brief } : log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0]?.body as { brief?: string } | undefined), tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} the browser is back:`, (e as Error).message)), ...(opts.browser ?? {}) });
  if (browser) autofill.attachBrowser(browser.host);
  if (browser) decorateBrowsing = (o) => browser.decorate(o);
  // D238: 用这台手机 / Use this phone: the person's own Android phones, through the Ducter app on each.
  let deviceAuthRef: { list(): { id: string; name: string; kind: string }[] } | undefined;
  const handsets = createHandsets({
    dataDir,
    log,
    tasks,
    deviceName: (id) => deviceAuthRef?.list().find((d) => d.id === id && d.kind === "client")?.name,
    interrupt: (taskId) => runner?.interrupt(taskId) ?? Promise.resolve(),
    // The pill speaks the language of the lines the home sends it (zh and en tables; ko → en).
    language: () => { const l = settings.get().language; return l === "auto" ? undefined : pickTag(l, ["zh", "en"]); },
    tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} about the phone:`, (e as Error).message)),
    ...(opts.handset ?? {}),
  });
  // D217: Ducter's phone (an Android emulator on a Mac), on this computer's card as 用手机.
  const ownPhone =
    opts.ownPhone === false
      ? undefined
      : createDucterPhone({ dataDir, mcp, log, tasks, decisions, deviceName: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName), ...(opts.platform ? { platform: opts.platform } : {}), tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} the phone is back:`, (e as Error).message)), workers: () => (workersRef ? { link: (d) => workersRef!.link(d), ability: (id) => workerAbility(id, "phone") } : undefined), handsets: () => handsets, ...(opts.ownPhone ?? {}) });
  if (ownPhone) {
    const before = decorateBrowsing;
    decorateBrowsing = (o) => ownPhone.decorate(before(o));
  }
  // D235: 用电脑 / Use the computer: a task in a Mac app uses the person's apps on the Mac it runs on.
  const computer =
    opts.computer === false
      ? undefined
      : createComputerUse({
          dataDir,
          mcp,
          log,
          tasks,
          ...(opts.platform ? { platform: opts.platform } : {}),
          workers: () => (workersRef ? { link: (d) => workersRef!.link(d), ability: (id) => workerAbility(id, "computer") } : undefined),
          interrupt: (taskId) => runner?.interrupt(taskId) ?? Promise.resolve(),
          tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} it was stopped:`, (e as Error).message)),
          // Tests with fake device probes never ask the real cua-driver.
          ...(opts.deviceProbes ? { perms: async () => undefined, ...(opts.deviceProbes.cua ? { cua: opts.deviceProbes.cua } : {}) } : {}),
          ...(opts.computer ?? {}),
        });
  if (computer) {
    const before = decorateBrowsing;
    decorateBrowsing = (o) => computer.decorate(before(o));
  }
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
  // D202: each agent's models on each computer: the home's through the runner's harness port, a
  // worker's through its `models` op (an older worker can't say: the card keeps the tier table).
  const modelCatalog =
    opts.models ??
    createModelCatalog({
      async read(device, harness) {
        if (device === "local") return runner?.harness.models?.(harness);
        const link = workersRef?.link(device);
        if (!link?.online()) return undefined;
        const r = await link.call<ListedModel[] | null>("models", { harness }, 20_000).catch(() => null);
        return Array.isArray(r) ? r : undefined;
      },
      // D352: the home's agents' versions as last probed: an updated agent's list is read again at once.
      version: (device, harness) => (device === "local" ? devicesView?.harnessesNow()?.find((h) => h.harness === harness)?.version : undefined),
    });
  const loadout = createLoadout({ log, tasks, settings, rules, devices: () => devicesView, sites: sitesOn, models: modelCatalog, handset: () => handsets.any(), handsetOffer: () => handsets.offer() });
  // D157: 我要合电脑了 / Move before closing: one decision for a computer.
  const closing = createClosing({ log, tasks, loadout, runner: () => runner });
  registerClosingTool(mcp, closing, langNow);
  // D352: the partner's 换成 … / "use … for this": a task's model, effort or agent, as the person said it.
  registerSwitchTool(mcp, { loadout, tasks, models: modelCatalog, runner: () => runner });
  // D293: the home's own key pair (made before the Bridge link: D324 names its connection with it).
  const identity = homeIdentity(dataDir);
  // D205: Settings › 伙伴's one-tap Bridge connection for the persona, run by the home's nmem.
  // D340: only the person's own home connects to their Mem by itself; a scratch, demo or test home waits to be asked.
  const byItself = opts.bridgeByItself ?? connectsByItself(dataDir);
  const bridgeLink = createBridgeLink({
    dataDir,
    byItself: () => byItself,
    identity: () => (settings.memMissing() ? undefined : persona.mem?.agentId),
    // D225: before Mem is in, the row still offers to put it in; connect names the persona's own id.
    fallbackIdentity: () => identityIdFor(persona.id),
    // Tests never reach the machine's real nmem (or Mem): without a fake one injected, the row is off.
    memoryOn: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && (process.env.NODE_ENV !== "test" || !!opts.bridgeLink?.run),
    home: () => computers.homeName(),
    // D324: the home's key (D293) names its connection, so Mem's list says which computer holds each one.
    homeFp: () => identity.fp,
    ...(opts.bridgeLink ?? {}),
  });
  bridgeLink.onChange(() => settings.bridgeChanged());
  // D295: a glance at Mem itself for Settings › 记忆 (its count, what other AI tools saved), gated like the row.
  const memGlance = createMemGlance({
    run: opts.bridgeLink?.run ?? nmemCall({ env: opts.bridgeLink?.env }),
    on: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && process.env.DUCTER_BRIDGE !== "0" && !settings.memMissing() && (process.env.NODE_ENV !== "test" || !!opts.bridgeLink?.run),
    changed: () => settings.bridgeChanged(),
  });
  settings.setGlance(() => memGlance.get(), memGlance);
  // D206: pictures and files, content-addressed on the home (media.ts).
  const media = createMediaStore(dataDir);
  // D293: its ways to be reached (the address book, reach-book.ts); the home's own key is made above.
  let reachRef: ReachWatch | undefined;
  const waysFrame = () => ({ t: "ways" as const, ways: reachRef?.ways() ?? [], key: identity.key, fp: identity.fp });
  // D288: each agent's account usage limits on the home, read by the agent itself and kept current by its sessions.
  const accountUsage = createAccountUsage({ read: async (h) => (await runner?.harness.accountUsage?.(h)) ?? { why: "unsupported" } });
  // D297: a task whose agent hits its usage limit waits for the reset (or is handed on) and carries on.
  const limitWaits = createLimitWaits({ log, tasks, waiters: work.waiters, loadout, settings, usage: accountUsage, runner: () => runner, clock });
  limitsDecorate = (o) => ({ ...o, waiters: o.waiters.map((w) => limitWaits.decorate(w)) });
  const workFrames: typeof work.frames = { ...work.frames, waiter: (id, action) => limitWaits.act(id, action) ?? (action === "handoff" ? Promise.resolve(false) : work.frames.waiter(id, action)) };
  const api = { log, tasks, mcp, persona, dataDir, settings, connections, phone, bodies: loadout, spine: log.spine, bridgeLink, media, limits: accountUsage, ...(browser ? { browser: browser.port } : {}) } as CoreApi;
  // D312: with more than one partner, the default partner keeps to its own too, and a task's
  // brief and Mem identity are those of the partner it is for.
  const memOf = new Map<string, MemIdentity | undefined>();
  const otherMem = (id: string) => {
    if (!memOf.has(id)) memOf.set(id, process.env.DUCTER_MEMORY === "off" ? undefined : readMemIdentity(partnerDir(id)));
    return memOf.get(id);
  };
  if (partners.on()) api.mine = { event: (e) => whose.ofEvent(e) === DEFAULT_PARTNER, task: (c) => whose.ofTask(c.taskId) === DEFAULT_PARTNER };
  api.personaFor = (id) => (isOther(id) ? { name: partners.nameOf(id), ...(otherMem(id!) ? { mem: otherMem(id!) } : {}) } : { name: persona.name, ...(persona.mem ? { mem: persona.mem } : {}) });
  // A task's memory is recalled by the partner it is for (each partner's own Mem client).
  const taskMemOf = new Map<string, TaskMemoryPort>();
  let defaultTaskMemory: TaskMemoryPort | undefined;
  const taskMemory: TaskMemoryPort = {
    on: () => defaultTaskMemory?.on() ?? [...taskMemOf.values()].some((p) => p.on()),
    recall: (w) => (isOther(w.persona) ? taskMemOf.get(w.persona) : defaultTaskMemory)?.recall(w) ?? Promise.resolve(undefined),
  };
  Object.defineProperty(api, "taskMemory", {
    enumerable: true,
    get: () => (defaultTaskMemory || taskMemOf.size ? taskMemory : undefined),
    set: (p: TaskMemoryPort | undefined) => void (defaultTaskMemory = p),
  });
  /** The L1 identity of another partner: its own name, and that the person has others. */
  const identityOf = (id: string) => {
    const name = partners.nameOf(id);
    const others = partners.list().filter((p) => p.id !== id).map((p) => p.name);
    return otherIdentity(name, others);
  };
  function viewOf(id: string): CoreApi {
    let v = views.get(id);
    if (!v) {
      v = partnerView({
        core: api,
        id,
        whose,
        mcp,
        name: () => partners.nameOf(id),
        identity: () => identityOf(id),
        mem: () => otherMem(id),
        activity: { set: (a) => ws.setActivity(a, id) },
        setTaskMemory: (p) => (p ? taskMemOf.set(id, p) : taskMemOf.delete(id)),
      });
      views.set(id, v);
    }
    return v;
  }
  // D150: the one helper (brain.ts) the runner and the settings frame share.
  api.partnerFallback = () => {
    const e = effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow());
    return e.why ? { harness: e.harness } : undefined;
  };
  /** D226: what the partner thinks with now: the fallback (D150) when it applies, else the setting. */
  const brainInUse = (): { harness: HarnessId; model?: string } => api.partnerFallback?.() ?? settings.get().brain;
  // 开一件事 / New task (D128): the one opening path the card and `ducter task` share.
  // D204: the home's own Ducter folder (~/ducter, or <dataDir>/ducter for a Ducter with a data
  // folder of its own) and the projects in it; clones go there with this computer's own git.
  const homeFolder = () => ducterFolder({ dataDir }).path;
  const found = createFoundRepos({ computers, home: opts.homeRepos ?? (() => ({ folder: homeFolder(), repos: projectRepos(realFs.real(join(homeFolder(), "projects"))) })) });
  const cloneHome = opts.cloneHome ?? ((address: string) => cloneRepo(address, { dataDir }));
  // D272: a new folder in the home's own Ducter folder, and the home's own GitHub sign-in.
  const newFolderHome = opts.newFolderHome ?? ((name: string) => newProjectFolder(name, { dataDir }));
  const gitLoginHome = opts.gitLoginHome ?? createGitLogin();
  // D345: gh Ducter put in its own folder is first on its PATH (its gh calls and every task's).
  useOwnTools(dataDir);
  const ghInstaller = opts.ghInstaller ?? (process.env.NODE_ENV === "test" ? { plan: () => undefined, install: async () => ({ ok: false as const, how: "release" as const, where: "", reason: "unsupported" as const, message: "not in tests" }) } : createGhInstaller({ dataDir }));
  const newTaskDeps = { log, tasks, runner: () => runner, persona, dataDir, loadout, settings, routines: work.routines, untils: work.untils, projects, computers, models: modelCatalog, found, cloneHome, newFolderHome, gitLoginHome, ghInstaller, ...(opts.browseHome ? { browseHome: opts.browseHome } : {}), ...(opts.git ? { git: opts.git } : {}) };
  // D285: 做过的事 / Past tasks: the person's marks, and every task findable again.
  const marks = createMarks({ dataDir });
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, computerName: (dev) => computers.nameOf(dev) });
  // D299: the sessions the person ran in their own agents here (read only when Past tasks asks).
  const outsideReader = opts.localAgents ?? (process.env.NODE_ENV === "test" || process.env.DUCTER_OUTSIDE === "0" ? createLocalAgents({ home: join(dataDir, "no-outside"), env: {} }) : createLocalAgents(process.env.DUCTER_OUTSIDE_HOME ? { home: process.env.DUCTER_OUTSIDE_HOME, env: {} } : {}));
  // D298: the first words read the same records (D299's reader), or a scratch home's in tests.
  const firstReader = opts.firstWords?.home ? createLocalAgents({ home: opts.firstWords.home, env: opts.firstWords.env ?? {} }) : outsideReader;
  const outside = createOutside({ reader: outsideReader, dataDir, log, tasks, ducterFolder: homeFolder, language: () => languageOf("", settings), looks: () => settings.localAgents() });
  // D327: what the first words may say about the records: whether there are any (file times alone),
  // what they offer once the person asks, the home's name, and forgetting what was read.
  const firstWordsDeps = opts.firstWords
    ? {
        projects: () => recentFolders(firstReader, { exclude: [dataDir, homeFolder()], leftOut: outside.leftOut, ...(opts.firstWords?.home ? { home: opts.firstWords.home } : {}) }),
        has: () => firstReader.active({ since: Date.now() - 14 * 86_400_000, skip: [dataDir, homeFolder(), tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"] }),
        computer: () => computers.homeName(),
        forget: () => {
          firstReader.forget();
          outsideReader.forget();
        },
        ...(opts.firstWords.home ? { home: opts.firstWords.home } : {}),
      }
    : undefined;
  // D332: whether the person runs their own AI agents here (Claude Code, Codex, pi): the agents with a
  // record changed in the last 14 days, by file times alone (D327's rule), Ducter's own and temporary
  // folders left out (unless the records read are themselves in one: a test's, the demo's). Settings
  // shows 和你的其他 agent 通信 / Talk with your other agents to them; read only while looking at records is on; a minute's cache.
  let ownCache: { at: number; agents: import("./local-agents/index.ts").LocalAgent[] } | undefined;
  const ownAgents = () => {
    if (!settings.localAgents()) return [];
    if (ownCache && Date.now() - ownCache.at < 60_000) return ownCache.agents;
    const roots = Object.values(outsideReader.roots()).map((r) => resolve(r));
    const under = (p: string, root: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
    const skip = [dataDir, homeFolder(), tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].map((p) => resolve(p)).filter((t) => !roots.some((r) => under(r, t)));
    let agents: import("./local-agents/index.ts").LocalAgent[] = [];
    try {
      agents = outsideReader.active({ since: Date.now() - 14 * 86_400_000, skip });
    } catch {
      /* unreadable records: nothing to say */
    }
    ownCache = { at: Date.now(), agents };
    return agents;
  };
  // D332: the partner connects with the person's own agents by itself once Mem is ready (no tap), says so
  // once, and the one switch (peers.reach) connects or revokes.
  const bridgeAuto = createBridgeAuto({
    link: bridgeLink,
    on: () => settings.get().peers?.reach !== "off",
    own: () => ownAgents().map((a) => harnessName(a)),
    dataDir,
    byItself: () => byItself,
    say: (agents) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: bridgeOnWords(langNow(), agents) } }),
  });
  let reachWas = settings.get().peers?.reach;
  settings.onChange(() => {
    const r = settings.get().peers?.reach;
    if (r === reachWas) return;
    reachWas = r;
    void bridgeAuto.switched(r !== "off");
  });
  let autoAt: ReturnType<typeof setTimeout> | undefined;
  const autoSoon = () => {
    clearTimeout(autoAt);
    autoAt = setTimeout(() => void bridgeAuto.tick(), 1500);
    (autoAt as { unref?: () => void }).unref?.();
  };
  bridgeLink.onChange(autoSoon);
  autoSoon();
  // D300: 替你做过的 / Done for you: every outward action, read from the Log and Autofill's uses.
  const did = createDid({ log, tasks, uses: () => autofill.store.view().uses, deviceName: (dev) => (dev === "local" ? computers.homeName() : computers.nameOf(dev)), folder: (id) => changes.folder(id), now: () => clock.now() });
  registerDidTool(mcp, did, () => clock.now());
  // D285: 一直在跑的 / Ongoing: routines and tasks that look again on their own, paused and resumed.
  const ongoing = createOngoing({ dataDir, log, tasks, waiters: work.waiters, routines: work.routines, marks, clock, onChange: () => ws.ongoingChanged() });
  const newTask = {
    // D285: 带着它开新任务 / New task from this: the brief carries what that task found.
    open: (i: NewTaskInput) => openYourTask(newTaskDeps, i.from && tasks.get(i.from) ? { ...i, brief: past.seed(i.from, i.words, languageOf(i.words, settings)) } : i),
    options: (p?: Place) => newTaskOptions(newTaskDeps, p),
    // D186: a folder becomes a project; answered as the place the card then offers.
    async addProject(path: string, device?: string) {
      const r = await projects.add(path, device);
      if (!r.ok) return { ok: false as const, reason: r.reason, message: r.message };
      const same = (p: Place) => JSON.stringify(p) === JSON.stringify(r.project.place);
      const fallback = { place: r.project.place, name: r.project.name, added: true, ...(r.info.defaultBranch ? { defaultBranch: r.info.defaultBranch } : {}), ...(r.info.branches?.length ? { branches: r.info.branches } : {}) };
      const place = (await newTaskOptions(newTaskDeps)).places.find((p) => p.added && same(p.place)) ?? fallback;
      return { ok: true as const, place };
    },
    // D203: 找一个文件夹… / Find a folder…, on the home's computer or a worker's.
    browse: (device: string | undefined, path: string | undefined) => browseFolders(newTaskDeps, device, path),
    // D204: 从 Git 地址加… / Add from a Git address…, cloned on that computer, then added there.
    clone: (device: string | undefined, address: string) => cloneProject(newTaskDeps, device, address, (path, dev) => newTask.addProject(path, dev)),
    // D272: 在 {computer} 上新建一个文件夹 / New folder on {computer}, made there, then added there.
    newFolder: (device: string | undefined, name: string) => newFolderProject(newTaskDeps, device, name, (path, dev) => newTask.addProject(path, dev)),
    // D272: 在 {computer} 上登录 GitHub / Sign in to GitHub on {computer}.
    gitLogin: (device: string | undefined, action: GitLoginAction, token?: string) => gitLoginOn(newTaskDeps, device, action, token),
    ghInstall: (onState: (s: GitLoginState) => void) => ghInstallHome(newTaskDeps, onState),
  };
  // D214: the workbench, and the previews of the pages tasks serve (each on a port of its own,
  // on the interface the home listens on).
  const hostname = opts.hostname ?? (process.env.DUCTER_HOST || "127.0.0.1");
  const previews = createPreviews({ hostname, route: (id) => runner?.pageRoute?.(id), loopback: loopbackOf });
  const workbench = createWbFrames({ log, runner: () => runner, previews, exclude: () => [port, ...(previewsPorts())] });
  const previewsPorts = () => previews.list().map((p) => p.previewPort);
  const ws = createWsHandler({
    home: {
      fp: identity.fp,
      ways: waysFrame,
      // D293: a Mac app says its computer is going to sleep: so is the worker on that computer.
      sleeping: (device) => {
        const me = devices.list().find((d) => d.id === device.id);
        const computer = me?.computer || me?.name;
        for (const w of workersRef?.online() ?? []) {
          const d = devices.list().find((x) => x.id === w.deviceId);
          if (d && computer && (d.computer || d.name) === computer) workersRef?.sleeping(w.deviceId);
        }
      },
      socketsChanged: () => reachRef?.refresh(),
    },
    partners,
    core: api, workbench, bridgeLink, decisions, runner: () => runner, devices: () => devicesView, lend: () => lendRef, settings, connections, phone, rules, loadout, accountUsage, closing, work: workFrames, newTask, updates: () => updatesRef, agents: () => agentsRef, agentSetup: (device, f) => agentSetupOp(device, f), memSetup: (device, action, link) => memSetupOp(device, action, link), updateAll: () => updateAllRef, memPlugins: () => memPluginsRef, anywhere: () => anywhereRef, channels, proactive: () => proactiveRef, calendar: () => calendarRef, taskSources: () => taskSourcesRef, taskGroups: () => taskGroups, batchMs: opts.batchMs, autofill, ...(browser ? { browser } : {}), ...(ownPhone ? { ownPhone } : {}), ...(computer ? { computer } : {}), ownNumber, handsets, past: { ...past, marks, persona: () => persona.id, ongoing, outside }, keys: { dataDir, ...(opts.keyFetch ? { fetch: opts.keyFetch } : {}), ...(opts.keyCanRun ? { canRun: opts.keyCanRun } : {}) }, ...(firstWordsDeps ? { firstWords: firstWordsDeps } : {}), did, ownAgents });
  handsets.onChange(() => (devicesView?.changed(), ws.onHandChanged()));
  onHandChanged = ws.onHandChanged;
  // D156: a partner turn in flight keeps an update of the agent it thinks with waiting.
  let partnerTurn = false;
  api.activity = {
    set: (a) => {
      partnerTurn = !!a;
      if (!a) channels.turnEnded();
      ws.setActivity(a);
    },
  };
  const devices = openDeviceAuth(dataDir);
  deviceAuthRef = devices;
  // A device that pairs changes Your devices and abilities (远程打开 / Reach from outside).
  const gateAuth = {
    ...devices,
    redeem: (...a: Parameters<typeof devices.redeem>) => {
      const r = devices.redeem(...a);
      if (!("error" in r)) devicesView?.changed();
      return r;
    },
  };
  const gate = createGate({ auth: gateAuth, personaName: () => persona.name, pairExtra: () => ({ fp: identity.fp, key: identity.key, ways: reachRef?.ways() ?? [] }), onRedeemed: (code, d) => lendRef?.redeemed(code, d) });
  let lendRef: import("./lend.ts").Lend | undefined;
  let updatesRef: Updates | undefined;
  let agentsRef: AgentUpdates | undefined;
  let agentSetupOp: (device: string, f: { action: import("@ducter/protocol").AgentSetupAction; harnesses?: string[]; harness?: string; code?: string }) => Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }> = async () => ({ ok: false, reason: "failed" });
  let updateAllRef: UpdateAll | undefined;
  let memPluginsRef: MemPlugins | undefined;
  // D366: memory on and the home's Mem connected (D169's gate), set once memPlugins is made.
  let memOnRef: (() => boolean) | undefined;
  // D366: Nowledge Mem on a computer for tasks: the worker's own mem_setup op.
  const memSetupOp = async (device: string, action: import("@ducter/protocol").DeviceMemAction, link?: string): Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }> => {
    if (!memOnRef?.()) return { ok: false, reason: "failed" };
    const id = devices.list().find((x) => x.kind === "worker" && (x.id === device || x.name === device))?.id;
    if (!id) return { ok: false, reason: "unknown" };
    const link0 = workers.link(id);
    if (!link0) return { ok: false, reason: "away" };
    try {
      await link0.call("mem_setup", { action, ...(link ? { link } : {}) }, 30_000);
      return { ok: true };
    } catch {
      // A Ducter there from before D366 doesn't know the op.
      return { ok: false, reason: "failed" };
    }
  };
  let anywhereRef: AnywhereCtl | undefined;
  const workers = createWorkers({
    personaName: () => persona.name,
    welcome: () => ({ ways: reachRef?.ways() ?? [], key: identity.key, fp: identity.fp }),
    onUpdate: (id, name, f) => updatesRef?.fromWorker(id, name, f),
    onAgentUpdate: (id, name, f) => agentsRef?.fromWorker(id, name, f),
    // D227: a worker back after its Ducter restarted: an agent update it no longer runs died with it.
    onHello: (id, name, hello, o) => (lendRef?.hello(id), agentsRef?.reconnected(id, name, { restarted: o.restarted, running: Array.isArray(hello.agentUpdates) ? hello.agentUpdates : [], harnesses: (hello.harnesses ?? []).map((h) => ({ id: h.id, ...(h.version ? { version: h.version } : {}) })) })),
    // A disconnected (revoked) worker still resolves, as a link that is never online: its tasks
    // show 连不上 / Can't reach and new ones are refused, instead of silently running here.
    find: (d) => {
      const hit = (x: { id: string; name: string; kind: string }) => x.kind === "worker" && (x.id === d || x.name === d);
      // A renamed worker still answers to its old name (tasks placed before the rename, D84).
      const was = devices.formerly(d);
      // D310: a computer named by another of its names (its Computer Name, or its host name with or
      // without the network's domain) is still that computer, when exactly one live worker is.
      const alias = (x: { kind: string; name: string; computer?: string }) => x.kind === "worker" && (sameComputer(x.name, d) || sameComputer(x.computer, d));
      const aliased = () => {
        const all = devices.list().filter(alias);
        return all.length === 1 ? all[0] : undefined;
      };
      return devices.list().find(hit) ?? (was?.kind === "worker" ? was : undefined) ?? aliased() ?? devices.list({ all: true }).reverse().find(hit);
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
    name: () => thisComputer(u.homeName),
    version,
    workers: () => ({
      online: () =>
        workers.online().map((w) => ({ id: w.deviceId, name: w.name, ...(w.hello?.version ? { version: w.hello.version } : {}), how: (w.hello?.how === "self" || w.hello?.how === "app" || w.hello?.how === "source" ? w.hello.how : "manual") as import("@ducter/protocol").UpdateHow, ...(w.hello?.asksApp ? { asksApp: true } : {}) })),
      update: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false, reason: "offline" };
        return link.call<{ ok: boolean; reason?: import("@ducter/protocol").UpdateReason; detail?: string }>("update", args, 30_000);
      },
    }),
    // D227: the home's own restart also waits for an AI agent updating here (it would cut it off).
    critical: () => [...(runner?.critical?.() ?? []), ...(agentsRef?.updating("local") ?? []).map((h) => `updating ${h}`)],
    holdCritical: (why) => runner?.holdCritical?.(why),
    working: () => tasks.list().filter((c) => c.attention === "working").length,
    settings: () => settings.get(),
    ...(u.run ? { run: u.run } : {}),
    // D224: the night runs Update all's plan (home first); this one's own night look only in tests that ask.
    autoEveryMs: u.autoEveryMs ?? 0,
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
  const agentProbe = { exec: (argv: string[], ms?: number) => agentSys.run(argv, { timeoutMs: ms ?? 15_000 }), which: a.which ?? ((c: string) => whichNow(c)), env: process.env, dataDir, ...(agentTesting ? {} : { piBundled: bundledPiVersion }) };
  const isWorker = (dev: string) => devices.list().some((x) => x.kind === "worker" && (x.id === dev || x.name === dev));
  const agents = createAgentUpdates({
    log,
    sys: agentSys,
    latest: agentLatest,
    name: () => thisComputer(u.homeName),
    detect: a.detect ?? ((h) => detectAgent(h, agentProbe)),
    loggedIn: a.loggedIn ?? (async (h) => (await probeHarnesses({ ...agentProbe, only: [h] }))[0]?.loggedIn ?? false),
    busy: (device, h) => agentBusy(device, h),
    hold: (h, on) => runner?.holdHarness?.(h, on),
    workers: () => ({
      online: () => workers.online().map((w) => ({ id: w.deviceId, name: w.name })),
      update: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false, reason: "offline" };
        return link.call<{ ok: boolean; reason?: import("@ducter/protocol").AgentReason; detail?: string }>("agent_update", args, 30_000);
      },
      // D362: 停止; an older worker doesn't know the op (no).
      stop: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false };
        return link.call<{ ok: boolean }>("agent_update_stop", args, 10_000).catch(() => ({ ok: false }));
      },
    }),
    dataDir,
    settings: () => settings.get(),
    devices: async () => ((await devicesView?.frame())?.devices ?? []).map((x) => ({ id: x.id, name: x.name, awake: x.state === "awake", harnesses: x.harnesses })),
    probed: () => devicesView?.refresh(),
    ...(a.settleMs !== undefined ? { settleMs: a.settleMs } : {}),
    autoEveryMs: a.autoEveryMs ?? 0, // D224: the night is Update all's
    ...(a.exists ? { exists: a.exists } : {}),
  });
  function agentBusy(device: string, h: string): number {
    const here = (c: { place?: Place }) => {
      const dev = c.place && "device" in c.place ? c.place.device : undefined;
      return device === "local" ? !dev || dev === "local" || !isWorker(dev) : dev === device || (!!dev && devices.list().some((x) => x.id === device && x.name === dev));
    };
    const n = tasks.list().filter((c) => c.attention === "working" && c.harness === h && here(c)).length;
    const partner = device === "local" && partnerTurn && effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow()).harness === h ? 1 : 0;
    return n + partner;
  }
  agentsRef = agents;
  // D363: the person's own agent folders and Ducter's tools folder on the home's PATH too.
  if (!agentTesting) widenAgentPath({ dataDir });
  // D363: putting agents on the home itself and signing them in here (a worker has its own, the
  // agent_setup op). No network or npm in tests unless a sys is given.
  const homeSetup =
    opts.agentSetup?.sys || !agentTesting
      ? createAgentSetup({
          dataDir,
          sys: opts.agentSetup?.sys ?? realAgentSetupSys({ platform: process.platform, arch: process.arch, which: (c) => whichNow(c) }),
          probe: async () => {
            widenAgentPath({ dataDir });
            devicesView?.refresh();
            devicesView?.changed();
          },
          changed: () => devicesView?.changed(),
        })
      : undefined;
  agentSetupOp = async (device, f) => {
    const isHome = device === "local" || device === "" || (await devicesView?.frame())?.devices.some((d) => d.home && d.id === device);
    if (isHome) {
      if (f.action === "look") {
        widenAgentPath({ dataDir });
        devicesView?.refresh();
        devicesView?.changed();
        return { ok: true };
      }
      if (!homeSetup) return { ok: false, reason: "failed" };
      if (f.action === "install") homeSetup.install(f.harnesses ?? []);
      else if (f.action === "login") homeSetup.login(f.harness ?? "");
      else if (f.action === "code") homeSetup.code(f.harness ?? "", f.code ?? "");
      else if (f.action === "cancel") homeSetup.cancel(f.harness ?? "");
      return { ok: true };
    }
    const id = devices.list().find((x) => x.kind === "worker" && (x.id === device || x.name === device))?.id;
    if (!id) return { ok: false, reason: "unknown" };
    const link = workers.link(id);
    if (!link) return { ok: false, reason: "away" };
    try {
      await link.call("agent_setup", { action: f.action, ...(f.harnesses ? { harnesses: f.harnesses } : {}), ...(f.harness ? { harness: f.harness } : {}), ...(f.code ? { code: f.code } : {}) }, 30_000);
      return { ok: true };
    } catch {
      // A Ducter there from before D363 doesn't know the op.
      return { ok: false, reason: "failed" };
    }
  };
  // D224: 全部更新 / Update all: the home's one plan, kept on disk, picked up again after its restart.
  const ua = opts.updateAll ?? {};
  const updateAll = createUpdateAll({
    dataDir,
    log,
    now: () => (u.sys ?? realSys).now(),
    updates: () => updates,
    agents: () => agents,
    devices: async () => (await devicesView?.frame())?.devices ?? [],
    busy: (device, h) => agentBusy(device, h),
    working: () => tasks.list().filter((c) => c.attention === "working").length + (runner?.critical?.() ?? []).length,
    settings: () => settings.get(),
    // D329: the home's Nowledge Mem is part of the plan when it is behind and Ducter can update it.
    mem: bridgeLink.memUpdate,
    ...(ua.tickMs !== undefined ? { tickMs: ua.tickMs } : {}),
    ...(ua.nightEveryMs !== undefined ? { nightEveryMs: ua.nightEveryMs } : testing ? { nightEveryMs: 0 } : {}),
    ...(ua.tz ? { tz: ua.tz } : {}),
  });
  updateAllRef = updateAll;
  // D228: 从外面连 / From outside: the person's own Cloudflare tunnel to their own domain, set
  // up by a task they start (its agent runs `ducter anywhere step …` against this home).
  let listening = 0;
  const homeLabel = () => savedHomeName(dataDir) ?? thisComputer(u.homeName);
  const anywhere: AnywhereCtl = createAnywhere({
    dataDir,
    port: () => listening,
    // D293: an address in the book coexists with the tunnel; only one set up by hand is "own".
    own: () => {
      const p = publicAddress(dataDir);
      return p && !bookHas(dataDir, p) ? p : undefined;
    },
    ways: { add: (u) => void addWay(dataDir, "tunnel", u), remove: (u) => void removeWay(dataDir, u) },
    ...(opts.anywhereSys ? { sys: opts.anywhereSys } : {}),
    ...(opts.anywherePollMs ? { pollMs: opts.anywherePollMs } : {}),
    ...(opts.anywhereStartMs ? { startMs: opts.anywhereStartMs } : process.env.DUCTER_ANYWHERE_START_MS ? { startMs: Number(process.env.DUCTER_ANYWHERE_START_MS) || undefined } : {}),
    ...(opts.anywhereStepWaitMs ? { stepWaitMs: opts.anywhereStepWaitMs } : {}),
    setup: {
      async openTask(brief, title) {
        const home = ((await devicesView?.frame())?.devices ?? []).find((d) => d.home);
        const body = home?.harnesses.find((h) => h.installed && h.loggedIn);
        if (!runner || !body) return console.warn(`[anywhere] no agent signed in on the home to set it up (${home ? home.harnesses.map((h) => `${h.harness}:${h.installed ? "installed" : "-"}/${h.loggedIn ? "signed in" : "-"}`).join(", ") || "none probed yet" : "no home"})`), undefined;
        const card = await runner.openTask({ persona: persona.id, title, brief, place: { kind: "none" }, harness: body.harness, language: langNow(), origin: "you" });
        return card.taskId;
      },
      open: (taskId) => {
        const a = tasks.get(taskId)?.attention;
        return !!a && !["done", "done_claimed", "failed", "dropped"].includes(a);
      },
      ask(taskId, hostname) {
        const w = words(ANYWHERE_ASK, langNow());
        const name = homeLabel();
        const decisionId = "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
        log.append({
          stream: "channel",
          origin: "system",
          kind: "decision",
          body: {
            decisionId,
            taskId,
            question: fill(w.question, { hostname, name }),
            goLabel: w.go,
            // Suggested, never applied by itself: it changes the person's own account (no timer).
            defaultOption: "go",
            reversible: false,
            anywhere: { hostname },
          },
        });
        const c = tasks.get(taskId);
        if (c) tasks.setState(taskId, "needs_you", c.residency);
        return decisionId;
      },
      cli: () => {
        const exe = compiled ? process.execPath : `${process.execPath} ${join(import.meta.dir, "../../cli/src/main.ts")}`;
        const q = (x: string) => (/^[\w./~-]+$/.test(x) ? x : `'${x.replaceAll("'", "'\\''")}'`);
        return `${exe.split(" ").map(q).join(" ")} --port ${listening}`;
      },
      homeName: homeLabel,
      lang: langNow,
      qr: qrRows,
    },
  });
  anywhereRef = anywhere;
  log.subscribe((e) => {
    if (e.kind !== "decision_resolved") return;
    const r = e.body as import("@ducter/protocol").Bodies["decision_resolved"];
    if (decisions.get(r.decisionId)?.anywhere) anywhere.answered(r.decisionId, r.option === "go");
  });
  // D293: the book as this home holds it; each way checked from here (never in tests: no network).
  reachRef = createReach({
    dataDir,
    tunnelHost: () => anywhere.view()?.hostname,
    ...(opts.reachCheck ? { check: opts.reachCheck } : process.env.NODE_ENV === "test" ? {} : { check: proveHome(identity.fp) }),
    inUse: () => new Set([...[...ws.vias().values()].map((v) => v.url), ...workers.online().map((w) => w.via?.url)].filter((u): u is string => !!u)),
  });
  reachRef.onChange(() => {
    const f = waysFrame();
    ws.broadcast(f);
    workers.ways(f);
    devicesView?.changed();
  });
  workers.onChange(() => reachRef?.refresh());
  // D347: 加一台做事的电脑 / Add a computer for tasks: a code, the line to paste, and when it arrives.
  lendRef = createLend({ auth: devices, dataDir, bind: hostname, port: () => listening, broadcast: (f) => ws.broadcast(f) });
  devicesView = createDevicesView({ anywhere, dataDir, auth: devices, workers, connected: () => ws.connected(), viaOf: (id) => ws.vias().get(id), ways: () => reachRef?.ways() ?? [], homeKey: identity, probes: opts.deviceProbes, ...(u.homeName ? { hostname: u.homeName } : {}), updates: () => updates, agents: () => agents, agentSetup: () => homeSetup, memOn: () => memOnRef?.() ?? false, updateAll: () => updateAll, mem: () => memPluginsRef, ...(agentTesting ? {} : { piBundled: bundledPiVersion }), self: { version, how: selfHow, platform: `${process.platform}-${process.arch}` }, ...(browser ? { browser } : {}), ...(ownPhone ? { ownPhone } : {}), ...(computer ? { computer } : {}), handsets, ...(opts.platform ? { platform: opts.platform } : {}), call: () => callAbility(phone.available(), connections.view()), onDisconnect: (id) => {
    for (const s of push.forget(id)) void apns.revoke?.(s);
  } });
  updates.onChange(() => devicesView?.changed());
  updateAll.onChange(() => devicesView?.changed());
  connections.onChange(() => devicesView?.changed()); // D199: 打电话 signed in, signed out, removed
  agents.onChange(() => devicesView?.changed());
  // D169: Nowledge Mem in the user's own agents, per device. Checked at start, each day, when a
  // computer comes online, and after a sign-in or an agent update (both refresh the devices).
  const mp = opts.memPlugins ?? {};
  // D169: only for someone who already has Mem connected (its identity bound, D141, and Mem not
  // answering "missing"); without Mem, nothing about its plugin shows, anywhere.
  const memConnected = mp.connected ?? (() => !!persona.mem && !settings.memMissing());
  const memOn = () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && memConnected();
  memOnRef = memOn;
  const memPlugins = createMemPlugins({
    dataDir,
    log,
    tasks,
    persona,
    runner: () => runner,
    on: memOn,
    lang: langNow,
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
    // D366: and once Nowledge Mem there turns ready (signed in, its agents connected), so the
    // agents' own Mem lines and a task's plugin there follow at once.
    const memReady = new Map<string, boolean>();
    workers.onChange(() => {
      const now = new Set(workers.online().filter((w) => w.hello).map((w) => w.deviceId));
      for (const id of now) if (!up.has(id)) void memPlugins.check(id);
      up = now;
      for (const w of workers.online()) {
        const ready = w.hello?.mem?.state === "ready";
        if (ready && memReady.get(w.deviceId) === false) void memPlugins.check(w.deviceId);
        memReady.set(w.deviceId, ready);
      }
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
    // D309: with more than one partner, each notification names whose it is.
    partnerOf: (e) => (partners.on() && partners.list().length > 1 ? partners.nameOf(e.stream.startsWith("channel:") ? e.stream.slice(8) : e.stream.startsWith("task:") ? tasks.get(e.stream.slice(5))?.persona : e.persona) : undefined),
    taskTitle: (id) => tasks.get(id)?.title,
    lastSummary: (id) => tasks.get(id)?.lastReport?.summary,
    holdMs: opts.pushHoldMs ?? (Number(process.env.DUCTER_PUSH_HOLD_MS) || undefined),
    enabled: opts.push ?? process.env.DUCTER_PUSH !== "off",
    fetcher: opts.pushFetch,
    apns,
    alive: (s) => s.deviceId === "local" || devices.isLive(s.deviceId),
    channelUp: (via) => ws.channelUp(via), // D277
    claimed: (k) => channels.claimed(k),
  });
  // D306: the iPhone's Live Activities follow the Log, through the same key or relay as alerts.
  const ambient = createAmbient({
    log,
    store: openAmbientStore(dataDir),
    clock,
    sender: createActivitySender({ config: loadApnsConfig(dataDir), transport: opts.ambientTransport ?? http2Transport(), relayUrl: relayAt, relayFetch: opts.relayFetch }),
    alive: (d) => d === "local" || devices.isLive(d),
  });
  // D165: the person's zone: their quiet hours', else (D243) the one their app last said, else the server's.
  const zone = () => opts.proactive?.zone ?? settings.get().quiet?.tz ?? proactiveRef?.clientZone() ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  // D222: every calendar account's calendars, merged (Accounts, the partner's calendar tool, the watcher).
  const calendar = createCalendar({ dataDir, connections, zone, log });
  calendarRef = calendar;
  // D341: 待办来源 / To-do sources. Tests never reach the real gh or the person's vaults.
  const srcTesting = process.env.NODE_ENV === "test";
  const taskSources = createTaskSources({
    dataDir,
    log,
    tasks,
    platform: opts.platform ?? process.platform,
    computer: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName),
    tell: (taskId, text) => void runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} its to-do changed:`, (e as Error).message)),
    stop: async (taskId) => {
      await runner?.drop(taskId).catch(() => {});
      const c = tasks.get(taskId);
      if (c && c.attention !== "dropped") tasks.setState(taskId, "dropped", c.residency, "its to-do was closed");
    },
    // D359: the pile counts its days in the person's zone and speaks their language.
    dayOf: (ms) => dayKey(ms, zone()),
    lang: () => (langNow().startsWith("zh") ? "zh" : "en"),
    name: () => persona.name,
    // D359: a handed-over to-do opens like 交给{name} on On hand: its repository's folder, its words as the brief.
    openTask: async (item, extra) => {
      const place = item.kind === "github" ? placeForRepo((await newTask.options().catch(() => ({ places: [] }))).places, item.where)?.place : undefined;
      const r = await newTask.open({ words: item.title, ...(place ? { place } : {}), brief: `${item.title}\n\n${briefOf(item)}${extra ? `\n${extra}` : ""}` });
      if (!r.ok) return { ok: false, error: r.message ?? r.reason };
      return "card" in r ? { ok: true, taskId: r.card.taskId } : { ok: false, error: "it became a routine" };
    },
    // D359: the repository's own review guide, read from its folder on this computer when there is one.
    reviewGuide: async (repo) => {
      const p = placeForRepo((await newTask.options().catch(() => ({ places: [] }))).places, repo);
      const root = p && p.place.kind === "repo" && (!p.place.device || p.place.device === "local") ? p.place.repoPath.replace(/^~(?=\/)/, homedir()) : undefined;
      if (!root) return undefined;
      for (const f of [".claude/skills/review/SKILL.md", ".claude/commands/review.md", ".agents/skills/review/SKILL.md", "REVIEW.md", ".github/REVIEW.md"]) {
        try {
          const t = readFileSync(join(root, f), "utf8");
          if (t.trim()) return t.slice(0, 4000);
        } catch {
          // not there: the next
        }
      }
      return undefined;
    },
    ...(srcTesting ? { ghRun: async () => ({ code: 127, out: "", err: "", missing: true as const }), home: join(dataDir, "no-home") } : {}),
    ...(opts.taskSources ?? {}),
  });
  taskSourcesRef = taskSources;
  if (opts.taskSources?.ask) taskSources.setAsk(opts.taskSources.ask);
  const proactive = createProactive({
    calendarIds: (a) => calendar.seenIds(a),
    dataDir,
    log,
    clock,
    persona,
    connections,
    settings,
    push,
    pusher,
    claimed: (k) => channels.claimed(k),
    // D359: the to-dos it can clear today, inside the morning note with their own Go.
    morningFinds: (noteId) => {
      const findId = `find_${randomBytes(6).toString("hex")}`;
      const m = taskSources.pile.morning(noteId, findId);
      return m ? [{ findId, kind: "todos" as const, text: m.text, how: m.how, decisionId: m.decisionId, goLabel: m.goLabel }] : [];
    },
    rules,
    decisions,
    runner: () => runner,
    ...(opts.proactive?.triage ? { triage: opts.proactive.triage } : {}),
    ...(opts.proactive?.judge ? { judge: opts.proactive.judge } : {}),
    ...(opts.proactive?.monthTokens ? { monthTokens: opts.proactive.monthTokens } : {}),
    present: () => ws.present(),
    zone,
    agentName: () => HARNESSES[brainInUse().harness]?.name,
  });
  proactiveRef = proactive;
  registerProactiveTools(mcp, rules, proactive);

  const server = Bun.serve<WsData | WorkerSocketData>({
    hostname,
    port: opts.port ?? Number(process.env.DUCTER_PORT || 7777),
    idleTimeout: 120,
    async fetch(req, srv) {
      const url = new URL(req.url);
      // D228: the tunnel's self-check (does this address still lead here, also as a WebSocket?).
      // A random per-home string; nothing else.
      if (url.pathname === CHECK_PATH) {
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") return srv.upgrade(req, { data: { anywhereCheck: true } as unknown as WsData }) ? undefined : new Response("upgrade failed", { status: 400 });
        return new Response(anywhere.checkToken(), { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
      }
      // D293: the home proves it is itself (its key signs the device's nonce), before the gate:
      // a device asks this of a way it hasn't used yet, before it shows that way its token.
      if (url.pathname === CHALLENGE_PATH) {
        const n = url.searchParams.get("n");
        if (!okNonce(n)) return new Response("bad nonce", { status: 400 });
        return Response.json(identity.prove(n), { headers: { "cache-control": "no-store" } });
      }
      // The phone/web client's own files are public (web.ts); everything it talks to is not.
      const page = await webStatic(req);
      if (page) return page;
      // D206: a picture's bytes, by its key (an <img> sends no token); everything else about it is behind the gate.
      const pic = await media.serve(req);
      if (pic) return pic;
      // Off-machine callers need a paired device token (auth.ts); /pair is answered here.
      const g = await gate.check(req, srv.requestIP(req)?.address);
      if (!g.pass) return g.response;
      // D293: which way this request came in by, for the socket it may open.
      const via = () => viaOf(req, srv.requestIP(req)?.address, reachRef?.ways() ?? []);
      const d = deviceRoutes(req, g, srv, workers, via);
      if (d) return d === "upgraded" ? undefined : d;
      const api = await webApi(req, g, { decisions, push, pusher, apns, personaName: () => persona.name, version, media, handsets, ambient, deviceOf: (r) => gate.deviceOf(r) });
      if (api) return api;
      if (url.pathname === "/ws") {
        // Block cross-site WebSocket hijacking from browser pages; native clients send no Origin
        // (the desktop sends its own address). Only this server's own origin counts: a page from
        // another local port (a dev server, another app) is another site. Through an SSH tunnel
        // the Host is the tunnel's, and so is the page's origin.
        // A device token can't ride along ambiently (no cookies), so it needs no origin check.
        if (g.via === "local" && !sameOriginWs(req)) return new Response("forbidden", { status: 403 });
        // The device rides along so a revoked device's live socket can be closed (workers.ts).
        // D238: a paired app that dials in over loopback (an SSH tunnel) is still that device when
        // it offers its token: its phone's 用这台手机 is spoken for by it alone.
        const own = g.via === "device" ? g.device : gate.deviceOf(req);
        const data = { ...ws.newData(), ...(own ? { device: own } : {}), via: via() };
        // A browser that offered ["ducter", <token>] gets "ducter" back: Bun echoes the first
        // offered subprotocol by itself (adding the header again would send it twice).
        return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/mcp") return mcp.handle(req);
      if (url.pathname === "/health") return Response.json({ ok: true, headSeq: log.head(), build: BUILD, version });
      return new Response("not found", { status: 404 });
    },
    // D228: the self-check's socket says the check string and closes; every other socket is Ducter's.
    websocket: {
      ...sockets,
      open: (w) => ((w.data as { anywhereCheck?: boolean })?.anywhereCheck ? (w.send(anywhere.checkToken()), w.close(1000, "ok")) : sockets.open!(w)),
      message: (w, m) => ((w.data as { anywhereCheck?: boolean })?.anywhereCheck ? undefined : sockets.message(w, m)),
      close: (w, code, reason) => ((w.data as { anywhereCheck?: boolean })?.anywhereCheck ? undefined : sockets.close!(w, code, reason)),
    },
  });
  const port = server.port!;
  listening = port;
  void anywhere.resume().catch((e) => console.warn("[anywhere]", e));
  // D276: the chat apps connected before (their sockets and long polls) start once the home listens.
  void channels.start();
  // Up and listening: an update's helper waiting on this restart knows it's this version (update.ts
  // waitHealthy), also when /health doesn't name the version to it.
  try {
    writeAlive(dataDir, version);
  } catch {}
  mcp.setPort(port);

  return {
    ...api,
    channelUp: (via: string) => ws.channelUp(via),
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
    partners,
    channels,
    settings,
    bridgeLink,
    rules,
    loadout,
    connections,
    phone,
    ownNumber,
    proactive,
    brainInUse,
    calendar,
    taskSources,
    taskGroups,
    changes,
    updates,
    release,
    agents,
    updateAll,
    memPlugins,
    ...(browser ? { ducterBrowser: browser } : {}),
    ...(ownPhone ? { ducterPhone: ownPhone } : {}),
    handsets,
    ...(computer ? { computer } : {}),
    autofill,
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    anywhere,
    setRunner(r) {
      runner = r;
      // D360: what was held in line before a restart opens now if its turn came meanwhile.
      void taskGroups.pump().catch((err) => console.warn("[core] the groups' line couldn't move:", (err as Error).message));
      // The cheap judge (D112, D113) runs on the harness the partner thinks with, on its small model.
      if (!opts.work?.judge)
        work.setJudge(createHarnessJudge({ harness: () => runner?.harness, pick: brainInUse, dataDir }));
      // D165: triage on the cheapest model of the harness the partner thinks with; the bar on its own model.
      // D226: the harness it really thinks with (D150's fallback included), never the unset default:
      // a Codex-only home once triaged every mail on a Claude Code that wasn't there, and said nothing.
      const port = () => runner?.harness;
      const pick = brainInUse;
      proactive.setModels({
        ...(opts.proactive?.triage ? {} : { triage: modelTriage(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "triage" })) }),
        ...(opts.proactive?.judge ? {} : { judge: modelJudge(createHarnessAsk({ harness: port, pick, dataDir, cheap: false, dir: "judge" })) }),
      });
      // D359: the pile is sorted and PRs pre-read on the cheapest model of the harness the partner thinks with.
      if (!opts.taskSources?.ask) taskSources.setAsk(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "pile", timeoutMs: 120_000 }));
      // Answers that were resolved but never handed to their task before a restart (decisions.ts).
      for (const u of decisions.takeUnforwarded()) {
        console.warn(`[core] re-sending the answer to ${u.decisionId} that ${u.taskId} never got (restart)`);
        void Promise.resolve()
          .then(() => r.send(u.taskId, u.text, undefined, u.from))
          .catch((err) => console.error(`[core] re-sending ${u.decisionId} to ${u.taskId} failed:`, (err as Error).message));
      }
    },
    setPartner(p) {
      partner = p;
      early.splice(0).forEach(trigger);
    },
    setPartnerFactory(make) {
      factory = make;
      // One that ran before starts now (its session stays parked until it has something to do),
      // so what it was in the middle of when Ducter stopped is picked up.
      if (partners.on()) for (const p of partners.list()) if (isOther(p.id) && existsSync(partnerDir(p.id))) startOther(p.id, true);
    },
    partnerView: (id) => viewOf(id),
    partnerDir,
    setPartnerMem(id, mem) {
      memOf.set(id, mem);
    },
    partnerSessions: () => sessions,
    async stop() {
      ws.stop();
      previews.close();
      await browser?.stop().catch(() => {});
      await ownPhone?.stop().catch(() => {});
      handsets.stopAll();
      computer?.close();
      autofill.stop();
      keys.stop();
      devicesView?.stop();
      anywhere.close(); // the tunnel itself keeps running: the next Ducter adopts it (same address)
      workers.stop();
      reachRef?.stop();
      sockets.stop();
      unsubscribePartner();
      for (const p of sessions.values()) await (p as { close?(): Promise<void> }).close?.().catch(() => {});
      phone.stop();
      ownNumber.stop();
      decisions.stop();
      living.stop();
      work.stop();
      limitWaits.stop();
      proactive.stop();
      calendar.stop();
      taskSources.stop();
      changes.stop();
      pusher.stop();
      channels.stop();
      updates.stop();
      agents.stop();
      updateAll.stop_();
      memPlugins.stop();
      release.stop();
      void server.stop(true); // awaiting hangs in Bun 1.3 when a WebSocket was open
      log.close();
      devices.close();
    },
  };
}
