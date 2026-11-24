// Client WebSocket protocol (ClientFrame / ServerFrame) over Bun's built-in WS.
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { brainNow } from "./brain.ts";
import { CLIENT_SHAPES, HARNESSES, harnessName, isHarnessId, isProactiveYesNo, PILE_GROUPS, shapeOfModel, TRY_LIVE, WATCH_LIVE } from "@ducter/protocol";
import type { ServerWebSocket } from "bun";
import type { Bodies, ClientFrame, ClientKind, Delivery, FileOpenError, LogEvent, MediaRef, MemCheckAnswer, OoApp, PartnerActivity, Place, ServerFrame, UndoConfirm } from "@ducter/protocol";
import type { NewTaskInput, NewTaskResult } from "./newtask.ts";
import type { CoreApi, LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import type { Decisions } from "./decisions.ts";
import { logUserMessage } from "./reply.ts";
import { talkLang } from "./lang.ts";
import { words as wordsIn, APP_ASK_MAX, keyRoutes } from "@ducter/protocol";

/** Said when no runner is up, in the conversation's language (a zh screen never reads it in English). */
const NO_RUNNER = { en: "Tasks can't run right now.", zh: "现在开不了任务。" };
import type { DevicesView } from "./devices.ts";
import { redactDeep } from "@ducter/protocol/src/redact.ts";
import { PROJECTED_KINDS, isActive, taskStream } from "./registry.ts";
import { briefOf, placeForRepo } from "./task-sources/index.ts";
import { sessionIndexes } from "./session-index.ts";
import { indexFrom } from "@ducter/protocol/src/session.ts";
import { machineId } from "./machine.ts";
import type { SettingsStore } from "./settings.ts";
import type { RulesStore } from "./rules.ts";
import type { Loadout } from "./loadout.ts";
import type { ConnectionsStore } from "./connections.ts";
import { firstScreen, partnerScreen, starters, type FirstScreenInput } from "./first-screen.ts";
import { firstWords, forgetFirstWords, lookWords } from "./first-words.ts";
import { addKey } from "./api-key.ts";
import { keyWords, normalizeTag } from "@ducter/protocol";
import type { FirstFolder } from "./first-words.ts";
import type { FirstScreen } from "@ducter/protocol";
import type { DucterBrowser } from "./browser/index.ts";
import type { LiveSink } from "./browser/live.ts";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";
import { DEFAULT_PARTNER, channelOf, partnerOfStream } from "@ducter/protocol/src/partners.ts";
import type { Partners } from "./partners.ts";
import { actAs } from "./acting.ts";
import { appIdeas } from "./app-ideas.ts";

export interface WsData {
  live: boolean;
  /** D309: the partner whose conversation this socket shows (hello.persona); absent: the default. */
  partner?: string;
  buf: LogEvent[];
  onHandDirty: boolean;
  /** Asked for devices: gets a fresh devices frame whenever one changes. */
  devices?: boolean;
  /** Asked for settings: gets a fresh settings frame whenever they change. */
  settings?: boolean;
  /** Asked for rules: gets a fresh rules frame whenever they change. */
  rules?: boolean;
  /** Asked for connections: gets a fresh connections frame whenever they change. */
  connections?: boolean;
  /** D276: asked for the chat apps: gets a fresh channels frame whenever they change. */
  channels?: boolean;
  /** D341: subscribed to 待办来源 / To-do sources. */
  sources?: boolean;
  /** The paired device behind a remote socket (core.ts). */
  device?: { id: string };
  /** Settles when this socket's hello is handled: frames sent right behind it wait for it. */
  greeting?: Promise<void>;
  /** What connected (hello.client); absent = an app. */
  client?: ClientKind;
  /** D284: the client reads a large frame as one binary message, its JSON gzipped (hello.gzip). */
  gzip?: boolean;
  /** D298: the language and zone the client said in its hello (the first words, a key's result). */
  locale?: import("@ducter/protocol").LangTag;
  tz?: string;
  /** D151: this socket's end of its live views (frames go only to the socket that opened one). */
  sink?: LiveSink;
  /** D217: this socket's end of its phone views. */
  phoneSink?: import("./android/live.ts").PhoneSink;
  /** D238: the page on the person's own phone, relaying its app (handset_hello). */
  handset?: import("./handset/index.ts").HandsetSocket;
  /** D277: this Mac app's iMessage bridge, as it last said (channel_status). */
  imessage?: "on" | "needs_permission" | "not_signed_in" | "off" | "error";
  /** D323: the Mac that bridge runs on, as the Mac app named it (its Computer Name). */
  imessageOn?: string;
  /** D293: how this socket reached the home (core reads it off the upgrade request). */
  via?: import("@ducter/protocol").DeviceVia & { url?: string };
}

const ON_HAND_KINDS = new Set<string>([...PROJECTED_KINDS, "phone_call"]);
/** D284: frames longer than this go gzipped to a client that asked (hello.gzip). */
const GZIP_MIN = 16 * 1024;
const REDACTED = new Set<string>(["events", "channel_history", "task_history", "task_index", "on_hand", "task_new_result", "action_result"]);
/** D390: how long a Settings frame waits on the partner's agent to list its models before giving up on pushing them. */
const BRAIN_MODELS_WAIT_MS = 30_000;
const REPLAY_FRESH = 200; // channel events replayed when hello has no cursor
const REPLAY_MAX = 5000; // cap for a cursor replay
const CHANNEL_PAGE = 300; // D509: an older page of the conversation, by default
const CHANNEL_PAGE_MAX = 2000;
const SEEN_WINDOW = 2000; // user messages (by clientId) remembered for idempotent send
const TASK_SEEN_WINDOW = 500; // task_event lines scanned for a task_send resend

const DELIVERED: Record<string, Delivery> = { turn: "prompted", steer: "steered", queue: "queued" };

export interface WsDeps {
  /**
   * D293: the home's key fingerprint and its ways (sent after every welcome), and what to do when a
   * Mac app says its computer is going to sleep. Absent in tests that don't need them.
   */
  home?: { fp: string; ways(): ServerFrame & { t: "ways" }; sleeping?(device: { id: string }): void; socketsChanged?(): void };
  core: CoreApi;
  decisions: Decisions;
  runner: () => Runner | undefined;
  /** Your devices and abilities (devices.ts); absent in tests that don't need it. */
  devices?: () => DevicesView | undefined;
  /** D347: 加一台做事的电脑 / Add a computer for tasks (lend.ts); absent in tests that don't need it. */
  lend?: () => import("./lend.ts").Lend | undefined;
  /** D205: the persona's Bridge connection (bridge-link.ts); absent in tests that don't need it. */
  bridgeLink?: import("./bridge-link.ts").BridgeLink;
  /** D494: the home's helpers as Settings › Agent 通信 shows them, and their stop and resume. */
  helpers?: { views(): import("@ducter/protocol").HelperView[]; stop(id: string): Promise<unknown>; resume(id: string): unknown };
  /** The partner's settings (settings.ts); absent in tests that don't need it. */
  settings?: SettingsStore;
  /** Your rules and who does the tasks (D89); absent in tests that don't need them. */
  rules?: RulesStore;
  /** D413: 不用问我的 / Without asking, listed with the rules; absent in tests that don't need it. */
  standing?: import("./standing.ts").StandingStore;
  /** D381: 置顶 / Pinned (pins.ts); absent in tests that don't need it. */
  pins?: import("./pins.ts").PinsStore;
  /** D405: 小应用 / Apps (apps.ts); absent in tests that don't need them. */
  apps?: import("./apps.ts").AppsStore;
  loadout?: Loadout;
  /** D390: each agent's live models (models.ts, D202): the partner's on the home, for Settings › Partner; absent in tests that don't need it. */
  models?: import("./models.ts").ModelCatalog;
  /** D288: each agent's account usage limits (account-usage.ts); absent in tests that don't need it. */
  accountUsage?: import("./account-usage.ts").AccountUsageBook;
  /** D157: Move before closing (closing.ts); absent in tests that don't need it. */
  closing?: import("./closing.ts").Closing;
  /** The user's connections (connections.ts); absent in tests that don't need it. */
  connections?: ConnectionsStore;
  /** D193: phone calls (phone.ts); absent in tests that don't need it. */
  phone?: import("./phone.ts").Phone;
  /** D218: the owner's own Android phone and SIM for calls (phone-own/). */
  ownNumber?: import("./phone-own/index.ts").OwnPhone;
  /** Work over time (D112-D114): waiters, until loops, routines; absent in tests that don't need it. */
  work?: WorkFrames;
  /** 开一个任务 / New task (D128, newtask.ts); absent in tests that don't need it. */
  newTask?: NewTaskFrames;
  /** D148: updating devices in place (updates.ts); absent in tests that don't need it. */
  updates?: () => import("./updates.ts").Updates | undefined;
  /** D156: updating the AI agents on each device (agents.ts); absent in tests that don't need it. */
  agents?: () => import("./agents.ts").AgentUpdates | undefined;
  /** D363: putting an agent on a device, signing it in there, looking again (core.ts routes it). */
  agentSetup?: (device: string, f: { action: import("@ducter/protocol").AgentSetupAction; harnesses?: string[]; harness?: string; code?: string }) => Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }>;
  /** D366: Nowledge Mem on a computer for tasks: put its command line there, or sign it in (core.ts routes it). */
  memSetup?: (device: string, action: import("@ducter/protocol").DeviceMemAction, link?: string) => Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }>;
  /** D377: 读它们留下的记录 / 别再看了 on a computer for tasks, saved on that computer (its records_allow op). */
  recordsAllow?: (device: string, on: boolean) => Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }>;
  /** D224: 全部更新 / Update all. */
  updateAll?: () => import("./update-all.ts").UpdateAll | undefined;
  /** D169: Nowledge Mem in each device's own agents (mem-plugins.ts); absent in tests that don't need it. */
  memPlugins?: () => import("./mem-plugins.ts").MemPlugins | undefined;
  /** D375: Mem's own health on the home (Settings › 记忆). */
  memHealth?: { refresh(): Promise<void> };
  /** D228: 从外面连's guided setup (anywhere.ts). */
  anywhere?: () => import("./anywhere.ts").AnywhereCtl | undefined;
  /** D276: 聊天软件 / Chat apps (channels/); absent in tests that don't need it. */
  channels?: import("./channels/index.ts").Channels;
  /** D151: Ducter's own browser (live view, Sites); absent in tests that don't need it. */
  browser?: DucterBrowser;
  /** D214: the opened task's workbench (workbench.ts); absent in tests that don't need it. */
  workbench?: import("./workbench.ts").WbFrames;
  /** D217: Ducter's phone (用手机): install, erase, live view; absent in tests that don't need it. */
  ownPhone?: import("./android/index.ts").DucterPhone;
  /** D235: 用电脑 / Use the computer. */
  computer?: import("./computer/index.ts").ComputerUse;
  /** D238: 用这台手机 / Use this phone. */
  handsets?: import("./handset/index.ts").Handsets;
  /** D191: 密码和银行卡 / Passwords & cards (D336; Autofill in code); absent in tests that don't need it. */
  autofill?: import("./saved/index.ts").Autofill;
  /** D165/D166: what Ducter notices in the accounts; absent in tests that don't need it. */
  proactive?: () => import("./proactive/engine.ts").Proactive | undefined;
  /** D388: `ducter proactive replay`: a dry engine over the last days of the real accounts. */
  replay?: (o: { days?: number; web?: boolean }) => Promise<import("@ducter/protocol").ReplayReport>;
  /** D464: `ducter proactive week`: the offers of the last weeks, counted from the Log. */
  week?: (weeks?: number) => import("@ducter/protocol").WeekReport;
  /** D473: `ducter repairs`: failures and self-repairs counted from the Log. */
  repairs?: (weeks?: number) => import("@ducter/protocol").RepairReport;
  /** D222: the person's calendars (Accounts' calendar rows, today's line, cal_pick). */
  calendar?: () => import("./calendar.ts").Calendar | undefined;
  /** D341: 待办来源 / To-do sources (task-sources/). */
  taskSources?: () => import("./task-sources/index.ts").TaskSources | undefined;
  /** D360: groups of tasks that are one piece of work (task-groups.ts). */
  taskGroups?: () => import("./task-groups.ts").TaskGroups | undefined;
  /** D454: 移走 / Remove, finished cards taken off On hand. */
  onHandAway?: import("./onhand-away.ts").OnHandAway;
  /** D285: 做过的事 / Past tasks (past.ts); absent in tests that don't need it. */
  /** D309: 伙伴们 / Partners (partners.ts); absent in tests that don't need them. */
  partners?: Partners;
  /** D486: removes another partner (core's: its session ends too); absent: partners.remove alone. */
  removePartner?: (id: string) => { ok: true } | { ok: false; error: import("./partners.ts").PartnerError };
  past?: import("./past.ts").Past & { marks: import("./past.ts").Marks; persona: () => string; ongoing?: import("./ongoing.ts").Ongoing; /** D511 */ keeps?: import("./keeps.ts").Keeps; outside?: import("./outside.ts").Outside; made?: import("./made.ts").Made; redo?: import("./redo.ts").Redo };
  /** D300: 替你做过的 / Done for you (did.ts); absent in tests that don't need it. */
  did?: import("./did.ts").Did;
  /**
   * D298: the partner's first words, said once when an app first opens a fresh conversation;
   * projects: the person's recent folders from their own agents' records (local-agents/), read
   * only while settings.localAgents() is on. Absent: no first words (tests that don't need them).
   */
  firstWords?: {
    projects: () => FirstFolder[];
    home?: string;
    /** D327: the agents that wrote records here in the last 14 days, by their files' times alone (nothing in them read). */
    has?: () => import("./local-agents/index.ts").LocalAgent[];
    /** D327: the home's own name, said where the records were read. */
    computer?: () => string | undefined;
    /** D327: drop every summary read so far (looking turned off). */
    forget?: () => void;
  };
  /** D332: the AI agents the person runs themselves here (their records, by file times alone); [] when not looking. */
  ownAgents?: () => import("./local-agents/index.ts").LocalAgent[];
  /** D298: pasted API keys (api-key.ts): where they are kept, and the network and agent seams for tests. */
  keys?: { dataDir: string; fetch?: typeof fetch; canRun?: (h: import("@ducter/protocol").HarnessId) => boolean; /** D440: put the agent a key needs on the home (pi, into its tools folder). */ prepare?: (h: import("@ducter/protocol").HarnessId) => Promise<boolean>; /** D440: tests: the home's time zone. */ tz?: () => string | undefined };
  batchMs?: number;
}

/** What the New task frames do (core.ts wires them to newtask.ts). */
export interface NewTaskFrames {
  open(input: NewTaskInput): Promise<NewTaskResult>;
  options(place?: Place): Promise<Omit<Extract<ServerFrame, { t: "task_new_options" }>, "t">>;
  /** D186: add a folder as a project; absent where projects aren't kept. device (D197): a worker it is on. */
  addProject?(path: string, device?: string): Promise<Omit<Extract<ServerFrame, { t: "project_add_result" }>, "t" | "clientId">>;
  /** D203: a folder's subfolders on that computer (the home's own without device). */
  browse?(device: string | undefined, path: string | undefined): Promise<Omit<Extract<ServerFrame, { t: "folder_browse_result" }>, "t" | "clientId" | "device">>;
  /** D204: clone a Git address on that computer (the home's own without device) and add it as a project. */
  clone?(device: string | undefined, address: string): Promise<Omit<Extract<ServerFrame, { t: "project_clone_result" }>, "t" | "clientId" | "device">>;
  /** D272: make a folder in that computer's Ducter folder and add it as a project. */
  newFolder?(device: string | undefined, name: string): Promise<Omit<Extract<ServerFrame, { t: "project_new_result" }>, "t" | "clientId" | "device">>;
  /** D272: a GitHub sign-in step on that computer (git-login.ts); wait: the end of the one in flight. */
  gitLogin?(device: string | undefined, action: "status" | "start" | "wait" | "token" | "cancel", token?: string): Promise<import("@ducter/protocol").GitLoginState>;
  /** D345: put gh on the home (each step through onState); ends signed_out when it is there, else why not. */
  ghInstall?(onState: (s: import("@ducter/protocol").GitLoginState) => void): Promise<import("@ducter/protocol").GitLoginState>;
}

/** What the client frames for work over time do (core.ts wires them to waiters, untils, routines). */
export interface WorkFrames {
  zone(tz: string): void;
  /** handoff (D297): a limit wait's task goes to another agent now. */
  waiter(waiterId: string, action: "look" | "cancel" | "rearm" | "handoff"): Promise<boolean>;
  routine(routineId: string, action: "pause" | "resume" | "end"): boolean;
  until(taskId: string, action: "stop"): boolean;
}

/** Drops living_msg revisions that a later event in the same batch supersedes. */
export function dropSuperseded(events: LogEvent[]): LogEvent[] {
  const replaced = new Set(events.map((e) => e.supersedes).filter((s) => s != null));
  return events.filter((e) => !replaced.has(e.seq));
}

/**
 * D509: a page of the conversation before `beforeSeq`, oldest first, and whether older events remain.
 * What a newer event superseded is left out: a revision inside the page, and the page's newest
 * living message when the first one after the page revised it (one message is open at a time per
 * conversation, so its next revision is the next living message there).
 */
export function channelPage(log: Pick<LogStore, "read">, stream: string, beforeSeq: number, limit = CHANNEL_PAGE): { events: LogEvent[]; more: boolean } {
  const n = Math.max(1, Math.min(Math.floor(limit) || CHANNEL_PAGE, CHANNEL_PAGE_MAX));
  const page = log.read({ stream, beforeSeq, limit: n + 1 });
  const more = page.length > n;
  let events = dropSuperseded(more ? page.slice(1) : page);
  const next = log.read({ stream, fromSeq: beforeSeq, limit: 1, kinds: ["living_msg"] })[0];
  if (next?.supersedes != null) events = events.filter((e) => e.seq !== next.supersedes);
  return { events, more };
}

export function createWsHandler(deps: WsDeps) {
  const { core, decisions } = deps;
  const noRunnerLine = () => wordsIn(NO_RUNNER, talkLang(deps.settings, core.log));
  /** D206: the refs for the ids a client sent (throws on one the home doesn't hold). */
  const mediaOf = (ids: unknown): MediaRef[] => {
    if (ids === undefined || ids === null || (Array.isArray(ids) && !ids.length)) return [];
    if (!core.media) throw new Error("Pictures and files can't be sent here.");
    return (core.media as unknown as { refs(ids: unknown): MediaRef[] }).refs(ids);
  };
  const { log, tasks } = core;
  const sockets = new Set<ServerWebSocket<WsData>>();
  // Set by stop(). Work started before it (a frame awaiting a probe) may land after the Log and the
  // devices database are closed: it is dropped quietly, never left to reject unhandled.
  let stopped = false;
  /** A background push's failure: said while the home runs, silent once it stopped. */
  const pushFailed = (what: string) => (err: unknown) => {
    if (!stopped) console.warn(`[ws] ${what}:`, (err as Error).message);
  };
  // D320: each opened task's session index, kept as the Log grows.
  const indexes = sessionIndexes(log);
  const batchMs = deps.batchMs ?? 50;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  // What the Log holds goes out with every key in it hidden (D152): the Log keeps them (a task
  // needs the key it was given), no client ever shows one. The frames that carry Log text: events,
  // a task's history, On hand (titles, reports, questions).
  // D242: and with every media ref signed afresh: a client gets keys that open for about a day,
  // whatever key the Log kept.
  const fresh = <T>(v: T): T => (core.media?.fresh ? core.media.fresh(v) : v);
  const send = (ws: ServerWebSocket<WsData>, f: ServerFrame) => {
    const s = JSON.stringify(fresh(REDACTED.has(f.t) ? redactDeep(f) : f));
    // D284: a task's history over a slow link (a VPS behind a tunnel) is mostly tool output that
    // gzips several times over; a client that asked for it gets a large frame gzipped.
    if (ws.data.gzip && s.length > GZIP_MIN) ws.sendBinary(Bun.gzipSync(Buffer.from(s)));
    else ws.send(s);
  };

  const flush = () => {
    flushTimer = undefined;
    for (const ws of sockets) {
      if (!ws.data.live) continue;
      if (ws.data.buf.length) send(ws, { t: "events", events: ws.data.buf.splice(0) });
      if (ws.data.onHandDirty) {
        ws.data.onHandDirty = false;
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
      }
    }
  };

  // Devices: subscribers get a fresh frame on every change; a socket that comes or goes changes
  // who is connected (Reach), so it is a change too.
  const devicesView = () => deps.devices?.();
  const pushDevices = async () => {
    const v = devicesView();
    if (!v) return;
    const subs = [...sockets].filter((ws) => ws.data.devices);
    if (!subs.length) return;
    const frame = await v.frame();
    for (const ws of subs) if (sockets.has(ws)) send(ws, frame);
  };
  let offDevices: (() => void) | undefined;
  const watchDevices = () => {
    if (offDevices) return;
    const v = devicesView();
    if (v)
      offDevices = v.onChange(() => {
        void pushDevices().catch(pushFailed("devices"));
        // A sign-in on the home can change what the partner thinks with (brainNow).
        const subs = [...sockets].filter((ws) => ws.data.settings);
        if (subs.length && deps.settings) pushSettings(subs);
      });
  };

  // D390: the partner's agent's live list on the home, read while Settings is open. The catalog
  // answers from what it holds while the list is fresh, so a frame built from a landed list doesn't
  // ask again; a list that differs from what the frame showed pushes one more frame to every
  // subscriber.
  const brainReading = new Set<string>();
  const modelsKey = (l: { id: string; label: string }[] | undefined) => (l ?? []).map((m) => `${m.id}=${m.label}`).join("|");
  const refreshBrainModels = (harness: string) => {
    const cat = deps.models;
    if (!cat?.peek || brainReading.has(harness)) return;
    const had = modelsKey(cat.peek("local", harness));
    brainReading.add(harness);
    void cat
      .get("local", harness, BRAIN_MODELS_WAIT_MS)
      .then(async (list) => {
        if (!list?.length || modelsKey(list) === had) return;
        const subs = [...sockets].filter((ws) => ws.data.settings);
        if (!subs.length || !deps.settings) return;
        const f = await settingsFrame();
        subs.forEach((ws) => sockets.has(ws) && send(ws, f));
      })
      .catch(pushFailed("brain models"))
      .finally(() => brainReading.delete(harness));
  };
  // Settings: every subscriber gets a fresh frame on every change (another window, the phone).
  const settingsFrame = async (forgot?: { seq: number; how: "mem" | "hidden" }, corrected?: { seq: number; how: "mem" | "here" }): Promise<ServerFrame> => {
    const v = await deps.settings!.view();
    // D150: the brain actually in use (core's Codex-only fallback included), so no client claims one
    // the home doesn't have.
    const home = devicesView() ? (await devicesView()!.frame()).devices.find((d) => d.home)?.harnesses : undefined;
    // D390: the partner's models from its agent's live list on the home, as last read (no wait);
    // a read under way, or one the list is due for, pushes a fresh frame when it lands with news.
    const held = brainNow(v.settings.brain, deps.settings!.brainChosen(), home, (h) => deps.models?.peek?.("local", h), deps.core.brainHold?.now());
    // D449: on a free key, the day's readout (only then).
    const budget = deps.core.freeBudget?.view?.();
    const now = budget ? { ...held, budget } : held;
    refreshBrainModels(now.harness);
    const bridge = await deps.bridgeLink?.view().catch(() => undefined);
    const own = deps.ownAgents?.() ?? [];
    const helpers = deps.helpers?.views() ?? [];
    return { t: "settings", ...v, brainNow: now, ...(forgot ? { forgot } : {}), ...(corrected ? { corrected } : {}), ...(bridge ? { bridge } : {}), ...(own.length ? { ownAgents: own } : {}), ...(helpers.length ? { helpers } : {}) };
  };
  /** A fresh settings frame to these subscribers, from a change rather than a frame they sent. */
  const pushSettings = (subs: ServerWebSocket<WsData>[]) => {
    if (stopped) return;
    void settingsFrame()
      .then((f) => subs.forEach((ws) => !stopped && sockets.has(ws) && send(ws, f)))
      .catch(pushFailed("settings"));
  };
  const offSettings = deps.settings?.onChange(() => {
    const subs = [...sockets].filter((ws) => ws.data.settings);
    if (subs.length) pushSettings(subs);
  });
  // D435: the partner's own agent held, back, or its time came: Settings › Partner and the header say so.
  const offBrainHold = deps.core.brainHold?.onChange(() => {
    const subs = [...sockets].filter((ws) => ws.data.settings);
    if (subs.length) pushSettings(subs);
  });
  // D449: a free key's count moved (or its day came back): the readout follows, at most every few seconds.
  let budgetPush: ReturnType<typeof setTimeout> | undefined;
  const offBudget = deps.core.freeBudget?.onChange?.(() => {
    if (budgetPush) return;
    budgetPush = setTimeout(() => {
      budgetPush = undefined;
      const subs = [...sockets].filter((ws) => ws.data.settings);
      if (subs.length) pushSettings(subs);
    }, 3000);
    (budgetPush as { unref?: () => void }).unref?.();
  });
  // D372: with the built-in default per kind of work (a probe that fails leaves them out).
  const rulesFrame = async (): Promise<ServerFrame> => {
    const defaults = (await deps.loadout?.defaults().catch(() => undefined)) ?? [];
    const standing = deps.standing?.list() ?? [];
    return { t: "rules", rules: deps.rules!.list(), ...(defaults.length ? { defaults } : {}), ...(standing.length ? { standing } : {}) };
  };
  // D381: the pinned blocks go to every socket on the default conversation, after the welcome and on
  // each change (a tap on any device, the partner changing one, a tick).
  const pinsFrame = (refused?: "full" | "gone" | "kind"): ServerFrame => ({ t: "pins", pins: deps.pins!.list(), ...(refused ? { refused } : {}) });
  const offPins = deps.pins?.onChange(() => {
    const f = pinsFrame();
    for (const ws of sockets) if (ws.data.live && !ws.data.partner) send(ws, f);
  });
  // D405: the apps list goes with the pins (default conversation), and a key an app or the partner
  // wrote reaches every device that may have it open.
  const appsPersona = () => deps.past?.persona() ?? "";
  // D410: an empty shelf comes with up to three first ideas from what the home noted (a trip coming up).
  const appsFrame = (): ServerFrame => {
    const apps = deps.apps!.list(appsPersona());
    if (apps.length) return { t: "apps", apps };
    const p = deps.proactive?.();
    return { t: "apps", apps, ideas: appIdeas(p?.ledger.all() ?? [], Date.now(), p?.clientZone()) };
  };
  const offApps = deps.apps?.onChange((c) => {
    if (c.kind === "give") return; // its list frame went with it
    const f: ServerFrame = c.kind === "list" ? appsFrame() : { t: "app_data", id: c.id, key: c.key, value: c.value, by: c.by };
    for (const ws of sockets) if (ws.data.live && !ws.data.partner) send(ws, f);
  });
  const pushRules = () => {
    if (stopped) return;
    void rulesFrame()
      .then((f) => {
        for (const ws of sockets) if (!stopped && ws.data.rules) send(ws, f);
      })
      .catch(pushFailed("rules"));
  };
  const offRules = deps.rules?.onChange(pushRules);
  const offStanding = deps.standing?.onChange(pushRules);
  // Connections: same pattern. The frame never carries a token.
  const connectionsFrame = (): ServerFrame => {
    const p = deps.proactive?.();
    const cal = deps.calendar?.();
    const list = deps.connections!.view().map((c) => {
      let look = p?.look(c.id);
      // D222: a calendar account's tile carries its calendars and which it reads.
      if (look && cal)
        look = {
          ...look,
          apps: look.apps.map((w) => {
            if (!/calendar/.test(w.service)) return w;
            const rows = cal.rows({ connectionId: c.id, service: w.service, account: deps.connections!.apps(c.id).find((a) => a.service === w.service && (a.label ?? a.account) === w.account)?.account, label: w.account });
            return rows ? { ...w, calendars: rows } : w;
          }),
        };
      const phone = deps.phone?.view(c.id);
      return { ...c, ...(look ? { look } : {}), ...(phone ? { phone } : {}) };
    });
    const own = deps.ownNumber?.view();
    return { t: "connections", connections: list, oo: deps.connections!.oo(), ...(own ? { ownPhone: own } : {}) };
  };
  const offConnections = deps.connections?.onChange(() => {
    for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
  });
  // D222: the calendar module is made after this handler; subscribe on the first Accounts frame.
  let offCalendar: (() => void) | undefined;
  const watchCal = () => {
    if (offCalendar) return;
    offCalendar = deps.calendar?.()?.onChange(() => {
      for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
    });
  };
  // D323: which Macs carry iMessage now (a Mac app's bridge that isn't off), for every Chat apps
  // page: the person's own Mac and the web say "on, at the Mac mini" instead of offering a setup.
  const imessageCarriers = (me: ServerWebSocket<WsData>) => {
    const out: { computer: string; state: Exclude<NonNullable<WsData["imessage"]>, "off">; here?: true }[] = [];
    for (const s of sockets) {
      const st = s.data.imessage;
      if (!st || st === "off") continue;
      const computer = s.data.imessageOn ?? "";
      const here = s === me;
      const same = computer ? out.find((c) => c.computer === computer) : undefined;
      if (same) {
        if (here) same.here = true;
        if (st === "on") same.state = "on";
        continue;
      }
      out.push({ computer, state: st, ...(here ? { here: true as const } : {}) });
    }
    return out;
  };
  const channelsFrame = (ws: ServerWebSocket<WsData>) => {
    const f = deps.channels!.frame();
    const im = imessageCarriers(ws);
    return im.length ? { ...f, imessage: im } : f;
  };
  const channelsChanged = () => {
    if (!deps.channels) return;
    for (const ws of sockets) if (ws.data.channels) send(ws, channelsFrame(ws));
  };
  // D276: 聊天软件 / Chat apps: every subscriber gets a fresh frame on every change.
  const offChannels = deps.channels?.onChange(channelsChanged);
  // D341: 待办来源 / To-do sources: made after this handler; subscribed on the first sources frame.
  let offSources: (() => void) | undefined;
  const sourcesChanged = () => {
    const ts = deps.taskSources?.();
    if (!ts) return;
    const v = ts.view();
    for (const ws of sockets) if (ws.data.sources) send(ws, { t: "sources", ...v });
  };
  // D218: the own-number card follows the phone (plugged in, allowed, the test call, a live call).
  let ownTimer: ReturnType<typeof setTimeout> | undefined;
  const offOwn = deps.ownNumber?.onChange(() => {
    if (ownTimer || !deps.connections) return;
    ownTimer = setTimeout(() => {
      ownTimer = undefined;
      for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
    }, 150);
  });
  // While Settings › Accounts is open somewhere, look for the phone every few seconds (plugging it
  // in, tapping Allow on it), so the card moves on by itself.
  let ownScan: ReturnType<typeof setInterval> | undefined;
  const watchOwn = () => {
    if (ownScan || !deps.ownNumber) return;
    void deps.ownNumber.scan().catch(() => undefined);
    ownScan = setInterval(() => {
      if (![...sockets].some((ws) => ws.data.connections)) return void (clearInterval(ownScan), (ownScan = undefined));
      void deps.ownNumber!.scan().catch(() => undefined);
    }, 4000);
  };
  // D193: the device sign-in: every socket that has Settings › Accounts open sees the code and the end.
  const offSignIn = deps.connections?.onSignIn((signIn) => {
    for (const ws of sockets) if (ws.data.connections) send(ws, { t: "connection_signin", signIn });
    if (signIn.state === "done") for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
  });
  // D166: a look, a find or a tile changes the card's status line: coalesced to one frame.
  let lookTimer: ReturnType<typeof setTimeout> | undefined;
  let offLook: (() => void) | undefined;
  const watchLook = () => {
    if (offLook) return;
    const p = deps.proactive?.();
    if (p)
      offLook = p.onChange(() => {
        if (lookTimer) return;
        lookTimer = setTimeout(() => {
          lookTimer = undefined;
          for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
        }, 250);
      });
  };
  // Memory_noted lines change the noted list: subscribers hear about it too.
  const offNoted = log.subscribe((e) => {
    if (e.kind !== "memory_noted" || !deps.settings) return;
    const subs = [...sockets].filter((ws) => ws.data.settings);
    if (subs.length) pushSettings(subs);
  });

  // Idempotent send: clientId -> seq of its user_msg. Seeded from the Log's recent window (the
  // kind index), so a resend after a restart is recognised too; bounded to SEEN_WINDOW ids.
  const seen = new Map<string, number>();
  const remember = (clientId: string | undefined, seq: number) => {
    if (!clientId || seen.has(clientId)) return;
    seen.set(clientId, seq);
    if (seen.size > SEEN_WINDOW) seen.delete(seen.keys().next().value!);
  };
  for (const e of log.read({ stream: "channel", kinds: ["user_msg"], limit: SEEN_WINDOW }))
    remember((e.body as Bodies["user_msg"]).clientId, e.seq);
  // task_new results by clientId (D128): a resend opens nothing twice. In memory, recent only.
  const newTaskSeen = new Map<string, Promise<NewTaskResult>>();
  // D204: a clone in flight by clientId: a resend (the socket came back) waits for the same one.
  const cloneSeen = new Map<string, Promise<Omit<Extract<ServerFrame, { t: "project_clone_result" }>, "t" | "clientId" | "device">>>();
  // task_send ids being delivered right now (the runner logs them after it awaits the session).
  const taskSending = new Map<string, Promise<Delivery>>();
  /** The task_event a task_send with this clientId already logged, if any (recent window). */
  const loggedTaskSend = (taskId: string, clientId: string) =>
    log
      .read({ stream: taskStream(taskId), kinds: ["task_event"], limit: TASK_SEEN_WINDOW })
      .find((e) => (e.body as Bodies["task_event"]).clientId === clientId);

  /**
   * D309: an event as this socket sees it: a conversation only when it is the partner the socket
   * shows (as "channel"), another partner's never; everything else (tasks, On hand) as it is.
   */
  const forSocket = (ws: ServerWebSocket<WsData>, e: LogEvent): LogEvent | undefined => {
    const of = partnerOfStream(e.stream);
    if (of === undefined) return e;
    if (of !== (ws.data.partner ?? DEFAULT_PARTNER)) return undefined;
    return e.stream === "channel" ? e : { ...e, stream: "channel" };
  };
  // D513: with more than one partner, each carries the last thing said in its conversation, for the
  // person's list of partners (this socket is the person's; no partner's own turn ever sees it).
  const partnersList = () => {
    const ps = deps.partners?.list() ?? [];
    if (ps.length < 2 || !deps.partners?.last) return ps;
    return ps.map((p) => {
      const last = deps.partners!.last(p.id);
      return last ? { ...p, last } : p;
    });
  };
  const partnersFrame = (ws: ServerWebSocket<WsData>): ServerFrame & { t: "partners" } => ({ t: "partners", partners: partnersList(), shown: ws.data.partner ?? DEFAULT_PARTNER });
  let partnersTimer: ReturnType<typeof setTimeout> | undefined;
  /** Every live socket gets a fresh partners frame (soon, once for a burst). */
  const partnersChanged = () => {
    if (partnersTimer) return;
    partnersTimer = setTimeout(() => {
      partnersTimer = undefined;
      for (const s of sockets) {
        if (!s.data.live) continue;
        if (s.data.buf.length) send(s, { t: "events", events: s.data.buf.splice(0) });
        // D486: the partner it showed was removed: it shows the default's (the client says hello again).
        if (s.data.partner && !deps.partners?.has(s.data.partner)) delete s.data.partner;
        send(s, partnersFrame(s));
      }
    }, batchMs);
  };
  const offPartners = deps.partners?.onChange(partnersChanged);

  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "user_msg") remember((e.body as Bodies["user_msg"]).clientId, e.seq);
    let any = false;
    for (const ws of sockets) {
      if (!ws.data.live) continue;
      // Channel events and live task events (task_event/task_state/...) for every task.
      // D309: a conversation only to the sockets showing that partner, as its "channel".
      const shown = forSocket(ws, e);
      if (shown) ws.data.buf.push(shown), (any = true);
      if (ON_HAND_KINDS.has(e.kind)) (ws.data.onHandDirty = true), (any = true);
    }
    if (any && !flushTimer) flushTimer = setTimeout(flush, batchMs);
    // D309: a question opened or answered in any conversation changes the partners' counts.
    // D513: with more than one, words said in any conversation change its last line in the list.
    if (deps.partners?.on() && partnerOfStream(e.stream) && (e.kind === "decision" || e.kind === "decision_resolved" || ((e.kind === "user_msg" || e.kind === "ai_msg" || e.kind === "ack") && deps.partners.list().length > 1))) partnersChanged();
  });

  // What the partner is doing while the user waits (D104). Presence, not history: never logged.
  // Buffered events go first, so a reply and the activity that ends with it arrive in order.
  // D312: each partner's own, sent only to the sockets showing it.
  const activities = new Map<string, PartnerActivity>();
  const activityOf = (ws: ServerWebSocket<WsData>) => activities.get(ws.data.partner ?? DEFAULT_PARTNER) ?? null;
  const setActivity = (a: PartnerActivity | null, persona: string = DEFAULT_PARTNER) => {
    const was = activities.get(persona) ?? null;
    if (a === null && was === null) return;
    if (a && was && a.step === was.step && a.since === was.since) return;
    if (a) activities.set(persona, a);
    else activities.delete(persona);
    for (const ws of sockets) {
      if (!ws.data.live || (ws.data.partner ?? DEFAULT_PARTNER) !== persona) continue;
      if (ws.data.buf.length) send(ws, { t: "events", events: ws.data.buf.splice(0) });
      send(ws, { t: "activity", activity: a });
    }
  };

  /**
   * D440: where the home is, for the ways to a key: the key is used from the home's network, so its
   * own time zone; a server on UTC says nothing, so then the app's.
   */
  const keyZone = (clientTz?: string): string | undefined => {
    const own = deps.keys?.tz?.() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return own && !/^(?:Etc\/)?(?:UTC|GMT|Universal|Zulu)$/i.test(own) ? own : clientTz;
  };

  // D149: what the empty conversation says, from names and metadata the home already has.
  const firstScreenFor = async (tz?: string, partner?: string): Promise<FirstScreen> => {
    // D497: a second partner's empty conversation says who it is and starts from its own part.
    const other = partner && partner !== DEFAULT_PARTNER ? deps.partners?.get(partner) : undefined;
    if (other) {
      const own = tasks.list().filter((t) => t.persona === other.id);
      return partnerScreen({
        tasks: own,
        onHand: { missed: [] },
        noted: [],
        apps: [],
        computers: [],
        talked: log.read({ stream: channelOf(other.id), kinds: ["user_msg"], limit: 1 }).length > 0,
        now: new Date(),
        ...(tz ? { tz } : {}),
        about: other.about ?? "",
        defaultName: deps.partners?.nameOf(DEFAULT_PARTNER) || core.persona.name,
      });
    }
    const noted = deps.settings ? (await deps.settings.view()).mem.noted : [];
    const apps: FirstScreenInput["apps"] = [];
    for (const c of deps.connections?.view() ?? []) {
      if (c.state === "unauthorized" || c.state === "unreachable") continue;
      if (c.apps?.length) apps.push(...c.apps);
      else if (c.source !== "oo") apps.push({ service: c.name, title: c.name });
    }
    // Devices probe harnesses (cached); never let a slow probe hold the first screen up.
    const v = devicesView();
    const devs = v ? await Promise.race([v.frame().then((x) => x.devices), new Promise<[]>((r) => setTimeout(() => r([]), 1500))]).catch(() => []) : [];
    const computers = devs
      .filter((d) => (d.kind === "laptop" || d.kind === "mini") && d.state !== "unreachable")
      .sort((a, b) => Number(b.home) - Number(a.home))
      .map((d) => ({ name: d.name, home: d.home }));
    const fs = firstScreen({
      tasks: tasks.list(),
      onHand: tasks.onHand(),
      noted,
      apps,
      computers,
      talked: log.read({ stream: "channel", kinds: ["user_msg"], limit: 1 }).length > 0,
      now: new Date(),
      ...(tz ? { tz } : {}),
    });
    const nb = noBrain();
    const hidden = deps.past?.outside?.hidden() ?? [];
    const o = deps.past?.outside;
    const folders = o ? o.hiddenFolders().map((p) => o.tilde(p)) : [];
    const computer = deps.firstWords?.computer?.();
    const lookDone = log.read({ stream: "channel", kinds: ["ai_msg"], limit: 200 }).some((e) => (e.body as Bodies["ai_msg"]).first?.look);
    return { ...fs, ...(deps.firstWords && deps.settings ? { looks: deps.settings.localAgents() } : {}), ...(nb ? { noBrain: true, keyRoutes: keyRoutes({ tz: keyZone(tz) }) } : {}), ...(hidden.length ? { outsideHidden: hidden } : {}), ...(folders.length ? { outsideFolders: folders } : {}), ...(computer ? { computer } : {}), ...(lookDone ? { lookDone: true as const } : {}) };
  };

  /**
   * D298: nothing on the home can think: its agents were probed and none is signed in. D440: and
   * can run here and may be the partner (a key kept for a pi that isn't there yet thinks nothing).
   */
  const noBrain = (): boolean => {
    const h = devicesView()?.harnessesNow();
    return !!h && !h.some((x) => x.loggedIn && x.installed !== false && isHarnessId(x.harness) && HARNESSES[x.harness].partner);
  };

  /**
   * D298: the partner's first words, once, when an app opens a conversation that has never had a
   * word in it. Synchronous, so the events the hello sends already hold them.
   */
  const sayFirstWords = (lang: import("@ducter/protocol").LangTag, tz: string | undefined) => {
    const fw = deps.firstWords;
    if (!fw) return;
    if (log.read({ stream: "channel", kinds: ["user_msg", "ai_msg"], limit: 1 }).length) return;
    // D327 (amends D298): nothing inside the records is read before the person asks. Their file
    // times say whether there is anything; if so, the first start asks to look (its tap is the yes).
    let canLook: import("./local-agents/index.ts").LocalAgent[] = [];
    if (!deps.settings || deps.settings.localAgents()) {
      try {
        canLook = fw.has?.() ?? [];
      } catch (err) {
        console.warn("[ws] first words: the agents' records:", (err as Error).message);
      }
    }
    const now = new Date();
    const everyday = starters({ tasks: [], onHand: { missed: [] }, noted: [], apps: [], computers: [{ name: "", home: true }], talked: false, now, ...(tz ? { tz } : {}) }).map((s) => s.words);
    // D329: the person's Nowledge Mem answers here (the last look said so): one line, one start; nothing in it read.
    const mem = !!deps.settings?.get().memory && !!deps.bridgeLink?.memSignedIn();
    const out = firstWords({ name: core.persona.name, lang, now, ...(tz ? { tz } : {}), projects: [], everyday, noBrain: noBrain(), canLook, ...(mem ? { mem } : {}), ...(fw.home ? { home: fw.home } : {}) });
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: out.text, first: out.first } });
  };

  /** The channel's messages that hold what the records said (the first words of D298, the answers to a look). */
  const fromRecords = () => log.read({ stream: "channel", kinds: ["ai_msg"], fromSeq: 0, limit: Number.MAX_SAFE_INTEGER }).filter((e) => (e.body as Bodies["ai_msg"]).first?.starts.some((s) => s.from !== "everyday" && s.from !== "look") || (e.body as Bodies["ai_msg"]).first?.look);

  /**
   * D327: forget what the records said: every message holding it is rewritten without it (the Log's
   * one exception to append-only), and every summary read is dropped. `folder`: only that folder's.
   */
  const forgetRecords = (folder?: string) => {
    for (const e of fromRecords()) {
      const b = e.body as Bodies["ai_msg"];
      const next = forgetFirstWords({ text: b.text, ...(b.first ? { first: b.first } : {}) }, { ...(folder ? { folder } : {}), ...(deps.firstWords?.home ? { home: deps.firstWords.home } : {}) });
      if (next) log.forgetIn?.(e.seq, { ...b, ...next });
    }
    if (!folder) deps.firstWords?.forget?.();
  };

  /** D327: the person tapped "look": read their agents' records now and answer with what they offer. */
  const lookNow = (lang: import("@ducter/protocol").LangTag, tz: string | undefined) => {
    const fw = deps.firstWords;
    if (!fw || (deps.settings && !deps.settings.localAgents())) return;
    let projects: FirstFolder[] = [];
    try {
      projects = fw.projects();
    } catch (err) {
      console.warn("[ws] look: the agents' records:", (err as Error).message);
    }
    const agents = fw.has?.() ?? [];
    const computer = fw.computer?.();
    const out = lookWords({ lang, now: new Date(), ...(tz ? { tz } : {}), projects, agents, ...(computer ? { computer } : {}), ...(fw.home ? { home: fw.home } : {}) });
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: out.text, first: out.first } });
  };

  /** Every app's first screen again (the key made it able to think, or looking was turned off). */
  const refreshFirstScreens = () => {
    for (const ws of sockets) {
      if (!ws.data.live || ws.data.client === "cli" || ws.data.client === "handset") continue;
      void firstScreenFor(ws.data.tz, ws.data.partner)
        .then((first) => sockets.has(ws) && send(ws, { t: "first_screen", first }))
        .catch(() => undefined);
    }
  };

  // Computed once, now: on macOS it shells out (ioreg) with Bun.spawnSync, which runs the event
  // loop, so doing it inside the first hello let the next frame in before hello had finished.
  machineId();

  const handle = async (ws: ServerWebSocket<WsData>, f: ClientFrame) => {
    // D255: the Android app's own link while its phone is lent speaks only handset frames, and is never
    // "live" (no conversation, no presence: the person isn't in Ducter because their phone is lent).
    if (f.t !== "hello" && f.t !== "ping" && !ws.data.live && !(ws.data.client === "handset" && f.t.startsWith("handset_"))) throw new Error("send hello first");
    switch (f.t) {
      case "hello": {
        if (f.gzip === true) ws.data.gzip = true;
        if (f.client === "handset") {
          if (!ws.data.device) throw new Error("a paired phone only");
          ws.data.client = "handset";
          send(ws, { t: "welcome", persona: core.persona.id, personaName: core.persona.name, headSeq: log.head(), version: DUCTER_VERSION });
          return;
        }
        const machine = machineId();
        // D309: which partner's conversation this socket shows (one it may show, else the default's).
        const asked = typeof f.persona === "string" && f.persona !== DEFAULT_PARTNER && deps.partners?.has(f.persona) ? f.persona : undefined;
        if (asked) ws.data.partner = asked;
        else delete ws.data.partner;
        const tag = typeof f.locale === "string" ? normalizeTag(f.locale) : undefined;
        if (tag) ws.data.locale = tag;
        if (typeof f.tz === "string" && f.tz) ws.data.tz = f.tz;
        // D298: the first words go in before the read below, so this hello already carries them.
        if (f.client === "desktop" || f.client === "web") {
          try {
            sayFirstWords(ws.data.locale ?? "en", ws.data.tz);
          } catch (err) {
            console.warn("[ws] first words:", (err as Error).message);
          }
        }
        // D344: an app that updated says so in its hello; the person is back: the partner's one
        // line about the update, once per version, in the default conversation (before the read
        // below, so this hello carries it).
        const told = deps.updates?.()?.told;
        if (told && f.client !== "cli") {
          try {
            if (ws.data.device && typeof f.version === "string") told.sawApp(ws.data.device.id, f.version);
            if (!ws.data.partner && (f.client === "desktop" || f.client === "web")) {
              const line = told.due({ lang: ws.data.locale ?? "en", ...(ws.data.tz ? { tz: ws.data.tz } : {}) });
              if (line) log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: line } });
            }
          } catch (err) {
            console.warn("[ws] updated line:", (err as Error).message);
          }
        }
        const shownId = ws.data.partner ?? core.persona.id;
        const shownName = ws.data.partner ? (deps.partners?.nameOf(ws.data.partner) ?? core.persona.name) : core.persona.name;
        ws.data.buf.length = 0; // a hello again (a switch, D309): what was queued was for the other conversation
        send(ws, { t: "welcome", persona: shownId, personaName: shownName, headSeq: log.head(), ...(machine ? { machine } : {}), version: DUCTER_VERSION, ping: true, ...(deps.home ? { fp: deps.home.fp } : {}) });
        if (deps.partners?.on()) send(ws, partnersFrame(ws));
        // D293: the ways to reach the home, so a device can follow it to another one.
        if (deps.home) send(ws, deps.home.ways());
        // Channel only: task streams are pulled with task_history.
        const stream = channelOf(ws.data.partner);
        // D481: everything since the cursor, in frames of REPLAY_MAX. Before, one read of the first
        // REPLAY_MAX was all a long-away client got: what came after it (a resolution among it) never
        // arrived, and the live events moved its cursor past the gap for good.
        const asChannel = (evs: LogEvent[]) => dropSuperseded(evs).map((e) => (stream === "channel" ? e : { ...e, stream: "channel" }));
        if (f.cursor != null && f.cursor >= 0) {
          let from = f.cursor + 1;
          for (;;) {
            const page = log.read({ stream, fromSeq: from, limit: REPLAY_MAX });
            send(ws, { t: "events", events: asChannel(page) });
            if (page.length < REPLAY_MAX) break;
            from = page[page.length - 1]!.seq + 1;
          }
        } else send(ws, { t: "events", events: asChannel(log.read({ stream, limit: REPLAY_FRESH })) });
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
        if (deps.pins && !ws.data.partner) send(ws, pinsFrame());
        if (deps.apps && !ws.data.partner) send(ws, appsFrame());
        const doing = activityOf(ws);
        if (doing) send(ws, { t: "activity", activity: doing });
        ws.data.live = true; // synchronous since the read: no event can be missed in between
        if (f.client === "desktop" || f.client === "web" || f.client === "cli") ws.data.client = f.client;
        // D263: a paired page says what its device is shaped like (a tablet, a foldable), for its clay.
        if (ws.data.device && (CLIENT_SHAPES as readonly unknown[]).includes(f.shape)) devicesView()?.shaped(ws.data.device.id, f.shape!);
        if (typeof f.tz === "string" && f.tz) deps.work?.zone(f.tz);
        // An app newer than the latest release the home knows: that answer is stale.
        if (typeof f.version === "string") deps.updates?.()?.sawVersion(f.version);
        // The empty conversation's words (D149), for the apps only; a failure leaves the client's own.
        if (f.client !== "cli") deps.proactive?.()?.hello(typeof f.tz === "string" ? f.tz : undefined);
        if (f.client !== "cli")
          void firstScreenFor(f.tz, ws.data.partner)
            .then(async (first) => {
              if (!sockets.has(ws)) return;
              send(ws, { t: "first_screen", first });
              // D222: what is still on today, as a second frame once the calendars answered (they read
              // through oo, which takes seconds; the greeting never waits for it).
              const cal = deps.calendar?.();
              if (!cal?.accounts().length) return;
              let today = cal.today();
              // A read only when today wasn't read in the last half hour (never on every hello).
              if (!today && Date.now() - (cal.readAt() ?? 0) > 30 * 60_000) {
                const d = new Intl.DateTimeFormat("en-CA", { timeZone: f.tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
                await cal.glance(d, d).catch(() => undefined);
                today = cal.today();
              }
              if (today && sockets.has(ws)) send(ws, { t: "first_screen", first: { ...first, today } });
            })
            .catch(pushFailed("first screen"));
        return;
      }
      case "send": {
        const dup = f.clientId ? seen.get(f.clientId) : undefined;
        if (dup != null) {
          // A resend (the client never saw its echo): don't append again, echo the original.
          send(ws, { t: "events", events: log.read({ fromSeq: dup, limit: 1 }).flatMap((e) => forSocket(ws, e) ?? []) });
          return;
        }
        // D206: pictures come as ids the upload answered; words may be empty then.
        const media = mediaOf(f.media);
        if (!f.text?.trim() && !media.length) throw new Error("empty message");
        // D236: a reply carries its quote from the Log; one to an open question answers it.
        // D277: only the Mac app's iMessage bridge says via (a desktop socket); anything else is dropped.
        const via = f.via === "imessage" && (ws.data.client ?? "desktop") === "desktop" ? f.via : undefined;
        // D309: words to a second partner go into its own conversation; D312: a reply quotes within it.
        if (ws.data.partner && deps.partners?.has(ws.data.partner)) {
          logUserMessage(log, decisions, { text: f.text ?? "", clientId: f.clientId, media, ...(f.reply ? { reply: f.reply } : {}), stream: channelOf(ws.data.partner) });
          return;
        }
        // D405: typed in an app's sheet: about that app.
        const about = typeof f.app === "string" ? deps.apps?.get(f.app) : undefined;
        const app = about && about.persona === appsPersona() ? { app: { id: about.id, name: about.name } } : {};
        // D511: typed on a Keep's page: about that Keep (the partner changes it with keep_change).
        const kp = typeof f.keep === "string" ? deps.past?.keeps?.get(f.keep) : undefined;
        const keep = kp ? { keep: { id: kp.keepId, title: kp.title } } : {};
        logUserMessage(log, decisions, { text: f.text ?? "", clientId: f.clientId, media, ...(f.reply ? { reply: f.reply } : {}), ...(via ? { via } : {}), ...app, ...keep });
        return; // the partner is triggered by core's user_msg subscription
      }
      case "partners": {
        if (!deps.partners) throw new Error("partners unavailable");
        return send(ws, partnersFrame(ws));
      }
      case "partner_add": {
        if (!deps.partners) throw new Error("partners unavailable");
        const r = deps.partners.add({ name: String(f.name ?? ""), look: f.look, ...(f.about !== undefined ? { about: f.about } : {}) });
        // A made one: every socket hears it (onChange); this one also gets its clientId back.
        return send(ws, { ...partnersFrame(ws), ...(typeof f.clientId === "string" ? { clientId: f.clientId.slice(0, 64) } : {}), ...(r.ok ? {} : { error: r.error }) });
      }
      case "partner_set": {
        if (!deps.partners) throw new Error("partners unavailable");
        const r = deps.partners.set(String(f.id ?? ""), { ...(f.name !== undefined ? { name: String(f.name) } : {}), ...(f.look !== undefined ? { look: f.look } : {}), ...(f.about !== undefined ? { about: f.about } : {}) });
        return send(ws, { ...partnersFrame(ws), ...(typeof f.clientId === "string" ? { clientId: f.clientId.slice(0, 64) } : {}), ...(r.ok ? {} : { error: r.error }) });
      }
      case "partner_remove": {
        if (!deps.partners) throw new Error("partners unavailable");
        const id = String(f.id ?? "");
        const r = deps.removePartner ? deps.removePartner(id) : deps.partners.remove(id);
        if (ws.data.partner === id && r.ok) delete ws.data.partner;
        return send(ws, { ...partnersFrame(ws), ...(typeof f.clientId === "string" ? { clientId: f.clientId.slice(0, 64) } : {}), ...(r.ok ? {} : { error: r.error }) });
      }
      case "channel_status": {
        // D277: how this Mac app's iMessage bridge stands; gone with the socket.
        // D323: and on which Mac, so every Chat apps page can say where it is on.
        if (f.channel !== "imessage") return;
        const on = typeof f.computer === "string" ? f.computer.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, 64) : "";
        const changed = ws.data.imessage !== f.state || (!!on && ws.data.imessageOn !== on);
        ws.data.imessage = f.state;
        if (on) ws.data.imessageOn = on;
        if (changed) channelsChanged();
        return;
      }
      case "decide": {
        // D191: a pay card's Go carries the card's security code (never kept, never logged): it
        // waits in memory for that one fill. Go without it is refused, so nothing is half-paid.
        // D233: a key card: Go carries the key (into Autofill and the task's key file, never the
        // Log); Hold is 不给 / Don't give. Either answers the task, in its waiting call or by resuming it.
        const keys = deps.autofill?.keys;
        if (keys?.isKeyAsk(f.decisionId)) {
          if (f.option === "go") keys.answer(f.decisionId, { value: String(f.key ?? ""), once: f.once === true });
          else if (f.option === "hold") keys.answer(f.decisionId, "refuse");
          else throw new Error("a key card is answered with the key or 不给 / Don't give");
          return;
        }
        // D481: answered already, somewhere else (another window, a chat app, its default, its task
        // ending): this client learns how at once, and words typed into its reply box are not lost:
        // they go to the partner as a message quoting the card.
        if (decisions.get(f.decisionId) && !decisions.isPending(f.decisionId)) {
          const seqs = decisions.seqsOf(f.decisionId);
          const r = decisions.resolution(f.decisionId);
          const text = f.option === "reply" ? String(f.text ?? "").trim() : "";
          if (text && text !== r?.text?.trim() && seqs[0]) logUserMessage(log, decisions, { text, reply: { seq: seqs[0] }, stream: channelOf(ws.data.partner) });
          send(ws, { t: "events", events: seqs.flatMap((s) => log.read({ fromSeq: s, limit: 1 })).flatMap((e) => forSocket(ws, e) ?? []) });
          return;
        }
        const pay = deps.autofill?.fill;
        if (f.option === "go" && pay?.needsCvc(f.decisionId)) {
          if (!f.cvc) throw new Error("this payment needs the card's security code");
          pay.holdCvc(f.decisionId, f.cvc);
        }
        decisions.decide(f.decisionId, f.option, f.text);
        return;
      }
      case "later": {
        // D382: 晚点再问我 / Ask me later (until), or 现在就定 / Decide now (null).
        const until = f.until === null ? null : Date.parse(String(f.until ?? ""));
        decisions.later(f.decisionId, until);
        return;
      }
      case "asks_get": {
        // D481: the questions a client and On hand's openAsks disagree about: each one's own events
        // (its decision, later/back/seen, its resolution), in seq order, in one events frame.
        const ids = Array.isArray(f.ids) ? f.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
        const seqs = [...new Set(ids.flatMap((id) => decisions.seqsOf(id)))].sort((a, b) => a - b);
        const events = seqs.flatMap((s) => log.read({ fromSeq: s, limit: 1 })).flatMap((e) => forSocket(ws, e) ?? []);
        send(ws, { t: "events", events });
        return;
      }
      case "key_add": {
        // D298: the one frame that carries a pasted key. Never logged; the answer never carries it.
        const k = deps.keys;
        const clientId = typeof f.clientId === "string" ? f.clientId.slice(0, 80) : "";
        if (!k) throw new Error("Keys can't be added here");
        const lang = ws.data.locale ?? "en";
        const wasBlind = noBrain();
        // D440: a good key that needs pi here: the person hears it works at once, then pi is put in the home's tools folder.
        const result = await addKey(typeof f.key === "string" ? f.key : "", {
          dataDir: k.dataDir,
          lang,
          ...(k.fetch ? { fetch: k.fetch } : {}),
          ...(k.canRun ? { canRun: k.canRun } : {}),
          ...(k.prepare ? { prepare: k.prepare, onPreparing: (r: import("@ducter/protocol").KeyResult) => send(ws, { t: "key_add_result", clientId, result: { ...r, say: keyWords(r) } }) } : {}),
        });
        // D449: a free key's day is paced from now on; a paid one for the same provider ends it.
        if (result.ok && result.provider) deps.core.freeBudget?.mark?.(result.provider, !!result.free);
        if (result.ok && result.harness && !result.needs) {
          // The person's own choice stays; with nothing chosen and nothing signed in, think with this.
          if (wasBlind) deps.settings?.brainFromKey(result.harness, result.model);
          devicesView()?.refresh();
        }
        send(ws, { t: "key_add_result", clientId, result: { ...result, say: keyWords(result) } });
        if (result.ok) {
          void devicesView()
            ?.frame()
            .catch(() => undefined)
            .finally(refreshFirstScreens);
        }
        return;
      }
      case "notes_seen": {
        // D344: read from a card: the partner's line for that version stays unsaid today.
        if (typeof f.version === "string") deps.updates?.()?.told.sawNotes(f.version, typeof f.tz === "string" && f.tz ? f.tz : ws.data.tz);
        return;
      }
      case "local_agents": {
        deps.settings?.setLocalAgents(f.on === true);
        // D327: off is off everywhere, and what was read is forgotten, not only hidden.
        if (f.on !== true) forgetRecords();
        refreshFirstScreens();
        return;
      }
      case "local_agents_look": {
        lookNow(ws.data.locale ?? "en", typeof f.tz === "string" ? f.tz : ws.data.tz);
        refreshFirstScreens();
        return;
      }
      case "outside_folder": {
        const o = deps.past?.outside;
        if (!o) throw new Error("past tasks are not available");
        const path = String(f.path ?? "").slice(0, 1024);
        o.hideFolder(path, !!f.hidden);
        if (f.hidden) forgetRecords(path);
        refreshFirstScreens();
        return;
      }
      case "saved":
      case "saved_put":
      case "saved_remove":
      case "saved_forget_site":
      case "saved_ask_keys": {
        // D191: the Autofill list. A put is the one frame that carries a secret; the answer never does.
        const af = deps.autofill;
        if (!af) throw new Error("Passwords & cards aren't available here");
        try {
          if (f.t === "saved_put") af.store.put(f.item);
          else if (f.t === "saved_ask_keys") af.store.setAskKeys(f.on !== false);
          else if (f.t === "saved_remove") af.store.remove(String(f.id ?? ""));
          else if (f.t === "saved_forget_site") af.store.forgetSite(String(f.id ?? ""), String(f.site ?? ""));
          send(ws, af.frame(f.t === "saved" ? {} : { ok: true }));
        } catch (err) {
          const e = err as Error & { reason?: "invalid" | "not_found" | "failed" };
          send(ws, af.frame({ ok: false, reason: e.reason ?? "failed", message: e.message }));
        }
        return;
      }
      case "task_send": {
        const r = deps.runner();
        if (!r) throw new Error("runner is not available");
        const media = mediaOf(f.media);
        if (!f.text?.trim() && !media.length) throw new Error("empty message");
        const target = tasks.get(f.taskId);
        if (!target) throw new Error(`unknown task ${f.taskId}`);
        // Before answeredByMessage: a dropped task's question must not be answered by a message
        // the runner then refuses to deliver.
        if (target.attention === "dropped") throw new Error("That task was dropped. Undo the drop first.");
        const key = f.clientId ? `${f.taskId} ${f.clientId}` : undefined;
        if (key) {
          // A resend of a message already delivered: the same ack, nothing delivered twice.
          const prior = loggedTaskSend(f.taskId, f.clientId!);
          if (prior) {
            const mode = ((prior.body as Bodies["task_event"]).raw as { delivered?: string } | undefined)?.delivered;
            send(ws, { t: "sent", taskId: f.taskId, delivered: DELIVERED[mode ?? ""] ?? "prompted", clientId: f.clientId });
            return;
          }
          // The first copy is still on its way (the runner logs it once the session is up).
          const inFlight = taskSending.get(key);
          if (inFlight) return void send(ws, { t: "sent", taskId: f.taskId, delivered: await inFlight, ...(f.clientId ? { clientId: f.clientId } : {}) });
        }
        // Answering the task directly answers its open question too (no later Go re-wakes it).
        decisions.answeredByMessage(f.taskId, f.text ?? "", "user");
        // D268: sent while it works, it steers by default; "queue" waits for the turn to end.
        const mode = f.mode === "queue" || f.mode === "steer" ? f.mode : undefined;
        const delivering = r.send(f.taskId, f.text ?? "", mode, "user", f.clientId, media.length ? media : undefined).then((x) => x.delivered);
        if (key) taskSending.set(key, delivering);
        try {
          send(ws, { t: "sent", taskId: f.taskId, delivered: await delivering, ...(f.clientId ? { clientId: f.clientId } : {}) });
          return;
        } finally {
          if (key) taskSending.delete(key);
        }
      }
      case "task_held": {
        // D325: one of the person's held messages: changed, taken back, or said now. The card's
        // next on_hand shows it; said now, the words are acked like a task_send.
        const r = deps.runner();
        if (!r?.held) throw new Error("runner is not available");
        if (f.op !== "edit" && f.op !== "drop" && f.op !== "now") throw new Error("unknown op");
        if (!tasks.get(f.taskId)) throw new Error(`unknown task ${f.taskId}`);
        const out = await r.held(f.taskId, f.id, f.op, typeof f.text === "string" ? f.text.slice(0, 16 * 1024) : undefined);
        if (out.delivered) send(ws, { t: "sent", taskId: f.taskId, delivered: out.delivered, clientId: f.id });
        return;
      }
      case "task_action": {
        // What the user did by button is part of the conversation: the partner must know it
        // (live: after a Merge click it told the user "I didn't merge this; check who did").
        // Logged as a user-origin job_status on the channel; it does not wake the partner.
        const noteUserAction = (taskId: string, text: string, act?: { act: "merge" | "open_pr"; ref?: string }) =>
          log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${taskId}_${f.action}`, taskId, state: "done", text, ...(act ? { act: act.act, ...(act.ref ? { ref: act.ref } : {}) } : {}) } });
        // Every task_action is acked with action_result (ok or a user-facing reason).
        const result = (ok: boolean, message?: string, ref?: string, confirm?: UndoConfirm) =>
          send(ws, { t: "action_result", taskId: f.taskId, action: f.action, ok, ...(message ? { message } : {}), ...(ref ? { ref } : {}), ...(confirm ? { confirm } : {}) });
        const card = tasks.get(f.taskId);
        if (!card) return result(false, "I can't find that task.");
        const r = deps.runner();
        try {
          switch (f.action) {
            case "interrupt":
              if (!r) return result(false, noRunnerLine());
              await r.interrupt(f.taskId);
              return result(true);
            case "stop_background": {
              // D518: one background job, through its agent's own stop; its end comes as its own act.
              if (!r?.stopBackground) return result(false, noRunnerLine());
              if (typeof f.job !== "string" || !f.job) return result(false, "Which one?");
              const s = await r.stopBackground(f.taskId, f.job);
              return result(s.ok, s.message);
            }
            case "drop": {
              try {
                await r?.drop(f.taskId);
              } catch (err) {
                console.warn(`[ws] runner.drop(${f.taskId}) failed; marking dropped anyway:`, (err as Error).message);
              }
              const now = tasks.get(f.taskId)!;
              if (now.attention !== "dropped") tasks.setState(f.taskId, "dropped", now.residency);
              return result(true);
            }
            case "undrop": {
              if (!r?.undrop) return result(false, "Undo isn't available.");
              const u = await r.undrop(f.taskId);
              return result(u.ok, u.message);
            }
            case "start_in": {
              // D472: 选 {computer} 上的文件夹: the folder the person chose there (D455's sheet) is where it starts.
              const pl = f.place;
              if (!card.cant || !r?.restartAt) return result(false, "That only applies to a task that couldn't start.");
              if (!pl || (pl.kind !== "repo" && pl.kind !== "folder")) return result(false, "Choose a folder for it.");
              const s = await r.restartAt(f.taskId, pl);
              return result(s.ok, s.message);
            }
            case "start_at":
            case "clone_here":
            case "clear_lock":
            case "reopen": {
              // D395: a task that couldn't start where it was to work: 再试一次 asks the computers
              // again (it never repeats the same failure), 在 X 上做 starts on X's copy, 拉一份到这里
              // clones it where it was; the place is re-resolved by core, then started there.
              if (card.cant && core.places && r?.restartAt) {
                const p = await core.places.replan(f.taskId, { action: f.action, ...(f.device ? { device: f.device } : {}) });
                if (!p.ok) return result(false, p.message);
                const s = await r.restartAt(f.taskId, p.place, f.action === "clear_lock" ? { clearLock: true } : undefined);
                return result(s.ok, s.message);
              }
              if (f.action !== "reopen") return result(false, "That only applies to a task that couldn't start.");
              // Truthful state only: the runner resumes the session and the task goes back to work.
              if (!r?.reopen) return result(false, "Reopen isn't available.");
              const { delivered } = await r.reopen(f.taskId);
              send(ws, { t: "sent", taskId: f.taskId, delivered });
              return result(true);
            }
            case "merge": {
              if (!r?.merge) return result(false, "Merging isn't available.");
              const m = await r.merge(f.taskId);
              if (m.ok) noteUserAction(f.taskId, `the user merged this task's branch into its base branch${m.ref ? ` (${m.ref.slice(0, 7)})` : ""}`, { act: "merge", ref: m.ref });
              return result(m.ok, m.message, m.ref);
            }
            case "open_pr": {
              if (!r?.openPr) return result(false, "Opening a PR isn't available.");
              const o = await r.openPr(f.taskId);
              if (o.ok) noteUserAction(f.taskId, `the user opened a draft PR for this task${o.ref ? `: ${o.ref}` : ""}`, { act: "open_pr", ref: o.ref });
              return result(o.ok, o.message, o.ref);
            }
            // D142: a folder that isn't a repo. 改回去 / Undo all changes (or one entry, path), and
            // 就这样 / Keep the changes. An undo of a folder changed since the task finished
            // comes back with confirm; the client asks, then sends force.
            case "undo": {
              if (!r?.undoFolder) return result(false, "Undo isn't available.");
              const u = await r.undoFolder(f.taskId, { ...(f.path ? { path: f.path } : {}), ...(f.force ? { force: true } : {}) });
              if (u.ok) noteUserAction(f.taskId, f.path ? `the user put one file back as it was before this task (${f.path})` : "the user undid all of this task's changes to the folder: it is exactly as it was before the task");
              return result(u.ok, u.message, undefined, u.confirm);
            }
            case "keep": {
              if (!r?.keepFolder) return result(false, "Keeping isn't available.");
              const k = await r.keepFolder(f.taskId);
              if (k.ok) noteUserAction(f.taskId, "the user kept this task's changes to the folder (they can't be undone any more)");
              return result(k.ok, k.message);
            }
            default:
              return result(false, `unknown action ${(f as { action?: string }).action}`);
          }
        } catch (err) {
          return result(false, (err as Error).message);
        }
      }
      case "read":
        log.append({ stream: channelOf(ws.data.partner), origin: "user", kind: "read_receipt", body: { upToSeq: f.upToSeq } }); // D312: the conversation it shows
        // D388: the person is looking (not a socket that reconnected): an early morning may be assembled now.
        if (ws.data.client !== "cli") deps.proactive?.()?.hello(undefined, true);
        return;
      case "devices": {
        const v = devicesView();
        if (!v) throw new Error("devices are not available");
        watchDevices();
        ws.data.devices = true;
        if (f.refresh) v.refresh();
        deps.updates?.()?.freshen(); // "up to date" is never older than 15 min when someone looks
        send(ws, await v.frame());
        return;
      }
      case "ability": {
        const v = devicesView();
        if (!v) throw new Error("devices are not available");
        watchDevices();
        send(ws, await v.setAbility(f.device, f.ability, f.on, f.named && typeof f.named.token === "string" && typeof f.named.hostname === "string" ? f.named : undefined));
        return; // the change pushes a fresh devices frame to every subscriber
      }
      case "pair_code": {
        const v = devicesView();
        if (!v) throw new Error("devices are not available");
        send(ws, await v.pairCode());
        return;
      }
      case "lend_code": {
        const l = deps.lend?.();
        if (!l) throw new Error("lending is not available");
        watchDevices(); // the computer that arrives shows in the devices frames this socket gets
        ws.data.devices = true;
        send(ws, l.mint());
        return;
      }
      case "rename_device": {
        const v = devicesView();
        if (!v) throw new Error("devices are not available");
        watchDevices();
        send(ws, v.rename(String(f.device ?? ""), String(f.name ?? "")));
        return; // a rename pushes a fresh devices frame to every subscriber
      }
      case "disconnect_device": {
        const v = devicesView();
        if (!v) throw new Error("devices are not available");
        watchDevices();
        send(ws, v.disconnect(String(f.device ?? "")));
        return; // pushes a fresh devices frame to every subscriber
      }
      case "device_update": {
        const u = deps.updates?.();
        const device = String(f.device ?? "local");
        if (!u) return send(ws, { t: "update_result", device, ok: false, reason: "failed", detail: "updates are not available" });
        watchDevices();
        if (f.check) {
          await u.check();
          const v = devicesView();
          const view = v ? (await v.frame()).devices.find((x) => x.id === device || x.name === device)?.update : undefined;
          return send(ws, { t: "update_result", device, ok: true, ...(view ? { update: view } : {}) });
        }
        const r = await u.start(device, typeof f.to === "string" && f.to ? { to: f.to } : {});
        send(ws, r.ok ? { t: "update_result", device, ok: true } : { t: "update_result", device, ok: false, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) });
        return; // progress pushes fresh devices frames to every subscriber
      }
      case "agent_update": {
        const ag = deps.agents?.();
        const device = String(f.device ?? "local");
        const harness = String(f.harness ?? "");
        if (!ag) return send(ws, { t: "agent_update_result", device, harness, ok: false, reason: "failed", detail: "agent updates are not available" });
        watchDevices();
        if (f.check) {
          await ag.check();
          devicesView()?.changed();
          return send(ws, { t: "agent_update_result", device, harness, ok: true });
        }
        const r = await ag.start(device, harness, { by: "user" });
        send(ws, r.ok ? { t: "agent_update_result", device, harness, ok: true } : { t: "agent_update_result", device, harness, ok: false, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) });
        return; // progress pushes fresh devices frames to every subscriber
      }
      case "agent_setup": {
        // D363: the device answers with fresh devices frames as each step happens.
        const device = String(f.device ?? "local");
        const action = f.action as import("@ducter/protocol").AgentSetupAction;
        if (!["install", "login", "code", "cancel", "look", "logout"].includes(action)) throw new Error("unknown action");
        watchDevices();
        ws.data.devices = true;
        const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : undefined);
        const hs = strs(f.harnesses);
        const r = deps.agentSetup ? await deps.agentSetup(device, { action, ...(hs ? { harnesses: hs } : {}), ...(typeof f.harness === "string" ? { harness: f.harness } : {}), ...(typeof f.code === "string" ? { code: f.code } : {}) }) : { ok: false, reason: "failed" as const };
        if (!r.ok) send(ws, { t: "agent_setup_result", device, action, ok: false, ...(r.reason ? { reason: r.reason } : {}) });
        return;
      }
      case "mem_setup": {
        // D366: Nowledge Mem on a computer for tasks. The connect link goes to that computer's nmem
        // only: never logged, kept or sent back. Progress arrives as fresh devices frames.
        const device = String(f.device ?? "");
        const action = f.action as import("@ducter/protocol").DeviceMemAction;
        if (!["install", "connect", "look"].includes(action)) throw new Error("unknown action");
        watchDevices();
        ws.data.devices = true;
        const link = typeof f.link === "string" && f.link.trim() ? f.link.trim() : undefined;
        const r = deps.memSetup ? await deps.memSetup(device, action, link) : { ok: false, reason: "failed" as const };
        if (!r.ok) send(ws, { t: "mem_setup_result", device, action, ok: false, ...(r.reason ? { reason: r.reason } : {}) });
        return;
      }
      case "records_allow": {
        // D377: the person's yes (or 别再看了) for their own agents' records on a computer for tasks.
        const device = String(f.device ?? "");
        const on = f.on === true;
        watchDevices();
        ws.data.devices = true;
        const r = deps.recordsAllow ? await deps.recordsAllow(device, on) : { ok: false, reason: "failed" as const };
        if (!r.ok) send(ws, { t: "records_allow_result", device, on, ok: false, ...(r.reason ? { reason: r.reason } : {}) });
        return;
      }
      case "update_all": {
        // D224: 全部更新 / Update all (stop: 停止剩下的; dismiss: put a finished plan away).
        const ua = deps.updateAll?.();
        if (!ua) return send(ws, { t: "update_all_result", ok: false, reason: "failed", detail: "updates are not available" });
        watchDevices();
        if (f.stop) return send(ws, { t: "update_all_result", ok: ua.stop(), ...(ua.plan() ? { id: ua.plan()!.id } : {}) });
        // D362: 停止 on one slow agent step; the rest goes on.
        if (typeof f.stopItem === "string") return send(ws, { t: "update_all_result", ok: await ua.stopItem(f.stopItem), ...(ua.plan() ? { id: ua.plan()!.id } : {}) });
        if (f.dismiss) {
          const ok = ua.dismiss();
          devicesView()?.changed();
          return send(ws, { t: "update_all_result", ok });
        }
        const r = await ua.start(f.by === "cli" ? "cli" : "user");
        send(ws, r.ok ? { t: "update_all_result", ok: true, id: r.id } : { t: "update_all_result", ok: false, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) });
        return; // progress pushes fresh devices frames to every subscriber
      }
      case "mem_plugin_install": {
        // D169: the user tapped 装上 / Install: that is their Go for this one setup task.
        const device = String(f.device ?? "local");
        const harness = String(f.harness ?? "");
        const mp = deps.memPlugins?.();
        if (!mp) return send(ws, { t: "mem_plugin_result", device, harness, ok: false, reason: "failed" });
        watchDevices();
        // D470; D480: the Space the person chose in place, by Mem's exact id.
        const space = f.what === "mailbox" && f.space && typeof f.space.id === "string" && f.space.id ? { id: f.space.id, label: String(f.space.label ?? f.space.id) } : undefined;
        const r = await mp.install(device, harness, f.what === "mailbox" ? "mailbox" : undefined, space);
        return send(ws, r.ok ? { t: "mem_plugin_result", device, harness, ok: true, ...(r.taskId ? { taskId: r.taskId } : {}) } : { t: "mem_plugin_result", device, harness, ok: false, reason: r.reason });
      }
      case "mailbox_look": {
        // D480: 打开它的信箱 / Open its mailbox, in place: that computer's Mem, read only.
        const device = String(f.device ?? "local");
        const harness = String(f.harness ?? "");
        const mp = deps.memPlugins?.();
        if (!mp) return send(ws, { t: "mailbox_look", device, harness, look: { state: "failed" } });
        const b = await deps.bridgeLink?.view().catch(() => undefined);
        const look = await mp.mailboxLook(device, harness, b?.space ? { space: b.space.id } : {});
        return send(ws, { t: "mailbox_look", device, harness, look });
      }
      case "anywhere_setup": {
        // D228: 让 Ducter 帮我设好 (the person's tap is the Go for this one task), and the steps its
        // agent runs through `ducter anywhere step`. Progress reaches every client in devices frames.
        const any = deps.anywhere?.();
        if (!any) return send(ws, { t: "anywhere_setup_result", ok: false, reason: "not_home" });
        watchDevices();
        if (f.op === "begin") {
          const r = await any.begin();
          return send(ws, r.ok ? { t: "anywhere_setup_result", ok: true, taskId: r.taskId } : { t: "anywhere_setup_result", ok: false, reason: r.reason === "failed" ? "failed" : r.reason, ...(r.taskId ? { taskId: r.taskId } : {}) });
        }
        if (f.op === "cancel") return any.cancel(), send(ws, { t: "anywhere_setup_result", ok: true });
        if (f.op === "step" && (f.step === "login" || f.step === "create" || f.step === "run")) {
          const r = await any.step(f.step, typeof f.hostname === "string" ? { hostname: f.hostname } : {});
          return send(ws, { t: "anywhere_setup_result", ok: r.state !== "failed", step: r });
        }
        return send(ws, { t: "anywhere_setup_result", ok: false, reason: "failed", detail: "op" });
      }
      case "helper_stop":
      case "helper_resume": {
        // D494: the person's tap on a helper's row is the Go; the settings frame follows the change.
        if (!deps.helpers || typeof f.id !== "string") throw new Error("helpers are not available");
        ws.data.settings = true;
        await (f.t === "helper_stop" ? deps.helpers.stop(f.id) : deps.helpers.resume(f.id));
        return;
      }
      case "bridge_connect":
      case "bridge_only_here":
      case "bridge_disconnect": {
        // D205: the user's tap on 接上 / 断开 in Settings › 伙伴 is their Go for this one call.
        // D324: 改由这台收 / 只留这台 is the Go for connecting here and ending the other homes' connections.
        if (!deps.settings || !deps.bridgeLink) throw new Error("settings are not available");
        ws.data.settings = true;
        // Each step pushes a fresh settings frame (connecting…, then connected or Mem's refusal).
        await (f.t === "bridge_connect" ? deps.bridgeLink.connect() : f.t === "bridge_only_here" ? deps.bridgeLink.onlyHere() : deps.bridgeLink.disconnect());
        return;
      }
      case "bridge_mem_open": {
        // D329: the Nowledge Mem app on the home isn't open: the tap opens it there.
        if (!deps.settings || !deps.bridgeLink) throw new Error("settings are not available");
        ws.data.settings = true;
        await deps.bridgeLink.openMem();
        return;
      }
      case "bridge_mem_install":
      case "bridge_mem_sign_in": {
        // D225: the tap on 装上 / 更新 / 登录 is the user's Go for this one step on the home. The
        // link is passed straight to nmem: never logged, kept or sent back.
        if (!deps.settings || !deps.bridgeLink) throw new Error("settings are not available");
        ws.data.settings = true;
        await (f.t === "bridge_mem_install" ? deps.bridgeLink.installMem() : deps.bridgeLink.signInMem(typeof f.link === "string" ? f.link : ""));
        // D375: what Mem's doctor says follows a new sign-in or a new nmem at once.
        void deps.memHealth?.refresh();
        return;
      }
      case "mem_health": {
        // D375: 再看一次 / Check again on Settings › 记忆: read-only; the settings frame follows when it changed.
        ws.data.settings = true;
        await deps.memHealth?.refresh();
        return;
      }
      case "settings": {
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        send(ws, await settingsFrame());
        return;
      }
      case "settings_set": {
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        // What it thinks with must be an AI agent signed in on the Mac Ducter runs on, and one
        // that can be the partner (D89).
        const b = f.patch?.brain;
        if (b && devicesView()) {
          const home = (await devicesView()!.frame()).devices.find((d) => d.home);
          const h = home?.harnesses.find((x) => x.harness === b.harness);
          if (!h?.canBePartner) {
            // D150: never an agent the home doesn't have signed in (it would break the partner).
            const name = isHarnessId(b.harness) ? harnessName(b.harness) : b.harness;
            send(ws, { t: "error", message: `${name} isn't signed in on ${home?.name ?? "the computer Ducter runs on"}, so it can't be what ${deps.core.persona.name} thinks with.` });
            send(ws, await settingsFrame());
            return;
          }
        }
        // A change pushes a fresh frame to every subscriber; nothing changed: answer this one.
        if (!deps.settings.set(f.patch ?? {}).length) send(ws, await settingsFrame());
        return;
      }
      case "memory_forget": {
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        const how = await deps.settings.forget(f.seq);
        send(ws, await settingsFrame(how ? { seq: f.seq, how } : undefined));
        return;
      }
      case "memory_undo": {
        // D329: 撤销 / Undo on a fresh Noted line. Taken back: every subscriber gets the frame (undone);
        // not: this socket hears so (undid.ok false), and the line stays as it was.
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        const ok = await deps.settings.undo(Number(f.seq));
        if (!ok) send(ws, { ...(await settingsFrame()), undid: { seq: Number(f.seq), ok: false } } as ServerFrame);
        return;
      }
      case "memory_confirm": {
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        // A change pushes a fresh frame to every subscriber; nothing changed: answer this one.
        if (!deps.settings.confirm(Number(f.seq))) send(ws, await settingsFrame());
        return;
      }
      case "memory_correct": {
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        const how = await deps.settings.correct(Number(f.seq), String(f.title ?? ""));
        send(ws, await settingsFrame(undefined, how ? { seq: f.seq, how } : undefined));
        return;
      }
      case "mem_forget":
      case "mem_fix": {
        // D321: the Memory page's own rows. A change pushes a fresh frame to every subscriber (the
        // glance changed); Mem didn't do it: answer this one, so the row comes back as it was.
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        const ok = f.t === "mem_forget" ? await deps.settings.forgetMem(String(f.id ?? "")) : await deps.settings.fixMem(String(f.id ?? ""), String(f.title ?? ""));
        if (!ok) send(ws, await settingsFrame());
        return;
      }
      case "mem_answer": {
        // D465: one of Mem's asks settled from the page. Mem took it: a fresh frame reaches every
        // subscriber (the ask leaves); it didn't: this socket hears so, and the ask stays.
        if (!deps.settings) throw new Error("settings are not available");
        ws.data.settings = true;
        const answer = String(f.answer ?? "") as MemCheckAnswer;
        const ok = await deps.settings.answerMem(String(f.id ?? ""), answer);
        send(ws, { t: "mem_answered", id: String(f.id ?? ""), answer, ok });
        if (!ok) send(ws, await settingsFrame());
        return;
      }
      case "mem_find": {
        if (!deps.settings) throw new Error("settings are not available");
        const q = String(f.q ?? "").slice(0, 120);
        const items = await deps.settings.findMem(q);
        send(ws, { t: "mem_found", q, ok: items !== undefined, items: items ?? [] });
        return;
      }
      case "rules": {
        if (!deps.rules) throw new Error("rules are not available");
        ws.data.rules = true;
        send(ws, await rulesFrame());
        return;
      }
      case "pin": {
        if (!deps.pins) throw new Error("pins are not available");
        if (ws.data.partner) throw new Error("pinning is only in the default conversation for now");
        const r = deps.pins.pin(Number(f.seq), Number(f.index));
        // A new pin reaches every socket through onChange; a refusal (or one already pinned) only this one.
        if (!r.ok) send(ws, pinsFrame(r.error));
        else if (r.already) send(ws, pinsFrame());
        return;
      }
      case "unpin": {
        if (!deps.pins) throw new Error("pins are not available");
        if (!deps.pins.unpin(String(f.id ?? ""))) send(ws, pinsFrame("gone"));
        return;
      }
      case "apps": {
        if (!deps.apps) throw new Error("apps are not available");
        return send(ws, appsFrame());
      }
      case "app_open": {
        // D405: the document a client runs, composed with its bridge for that client's transport.
        if (!deps.apps) throw new Error("apps are not available");
        const id = String(f.id ?? "");
        const m = deps.apps.get(id);
        if (!m || m.persona !== appsPersona()) return send(ws, { t: "app_open", id, gone: true });
        const app = deps.apps.open(id, { transport: f.transport === "fetch" ? "fetch" : "message", dark: f.dark === true, lang: typeof f.lang === "string" ? f.lang.slice(0, 16) : "en" });
        deps.apps.touch(id);
        // The web frames it from this home by a one-app token (its page forbids inline scripts in srcdoc).
        const token = f.transport === "fetch" ? undefined : deps.apps.frameToken(id, { dark: f.dark === true, ...(typeof f.lang === "string" ? { lang: f.lang.slice(0, 16) } : {}) });
        return send(ws, app ? { t: "app_open", id, app: { ...app, ...(token ? { src: `/app-frame/${token}` } : {}) } } : { t: "app_open", id, gone: true });
      }
      case "app_put": {
        if (!deps.apps) throw new Error("apps are not available");
        const r = deps.apps.put(String(f.id ?? ""), String(f.key ?? ""), f.value ?? null, "app");
        if (!r.ok) throw new Error(r.error);
        return;
      }
      case "app_ask": {
        // D405: the app's ducter.ask: the person's message from that app (they tapped in it), once
        // at a time and at most APP_ASKS_PER_HOUR an hour. Its answer is the partner's next message.
        if (!deps.apps) throw new Error("apps are not available");
        const id = String(f.id ?? "");
        const ref = String(f.ref ?? "").slice(0, 40);
        const text = String(f.text ?? "").replace(/[\p{Cc}]/gu, (c) => (c === "\n" ? c : " ")).trim().slice(0, APP_ASK_MAX);
        const m = deps.apps.get(id);
        const may = !m || m.persona !== appsPersona() ? "gone" : !text ? "empty" : deps.apps.mayAsk(id);
        if (may !== "ok") return send(ws, { t: "app_ask_refused", id, ref, why: may });
        deps.apps.asked(id, ref);
        logUserMessage(log, decisions, { text, app: { id, name: m!.name, ask: ref } });
        return;
      }
      case "app_back": {
        if (!deps.apps) throw new Error("apps are not available");
        const r = deps.apps.back(String(f.id ?? ""));
        if (!r.ok) throw new Error(r.error);
        return;
      }
      case "app_remove": {
        if (!deps.apps) throw new Error("apps are not available");
        deps.apps.remove(String(f.id ?? ""));
        return;
      }
      case "app_restore": {
        // D410: 撤销 / Undo a delete (the shelf's toast, the card's Undo).
        if (!deps.apps) throw new Error("apps are not available");
        const r = deps.apps.restore(String(f.id ?? ""));
        if (!r.ok) throw new Error(r.error);
        return;
      }
      case "app_set": {
        // D410: the shelf's 「⋯」: rename, pin, stop a routine updating it.
        if (!deps.apps) throw new Error("apps are not available");
        const id = String(f.id ?? "");
        const m = deps.apps.get(id);
        if (!m || m.persona !== appsPersona()) throw new Error("gone");
        const r = deps.apps.set(id, { ...(typeof f.name === "string" ? { name: f.name } : {}), ...(typeof f.pinned === "boolean" ? { pinned: f.pinned } : {}), ...(f.untask === true ? { untask: true } : {}) });
        if (!r.ok) throw new Error(r.error);
        return;
      }
      case "app_summary": {
        // D410: the app's own line for its tile (ducter.summary), from whichever device has it open.
        if (!deps.apps) return;
        const id = String(f.id ?? "");
        const m = deps.apps.get(id);
        if (m && m.persona === appsPersona()) deps.apps.summarize(id, String(f.text ?? ""));
        return;
      }
      case "app_error": {
        // D422: the app's page threw on a device: kept on that version, its tile and window say so with a fix.
        if (!deps.apps) return;
        const id = String(f.id ?? "");
        const m = deps.apps.get(id);
        if (m && m.persona === appsPersona() && typeof f.version === "number") deps.apps.broke(id, f.version, String(f.text ?? ""));
        return;
      }
      case "pin_tick": {
        if (!deps.pins) throw new Error("pins are not available");
        if (!deps.pins.tick(String(f.id ?? ""), String(f.item ?? ""), f.on === true)) send(ws, pinsFrame("gone"));
        return;
      }
      case "standing_revoke": {
        if (!deps.standing || !deps.rules) throw new Error("standing permissions are not available");
        ws.data.rules = true;
        // A revoke pushes a fresh frame to every subscriber; an unknown id: answer this one.
        if (!deps.standing.revoke(String(f.id ?? ""))) send(ws, await rulesFrame());
        return;
      }
      case "rule_remove": {
        if (!deps.rules) throw new Error("rules are not available");
        ws.data.rules = true;
        // A removal pushes a fresh frame to every subscriber; an unknown id: answer this one.
        if (!deps.rules.remove(String(f.id ?? ""))) send(ws, await rulesFrame());
        return;
      }
      case "candidates": {
        if (!deps.loadout) throw new Error("candidates are not available");
        send(ws, { t: "candidates", taskId: f.taskId, candidates: await deps.loadout.candidates(f.taskId) });
        return;
      }
      case "account_usage": {
        // D288: the agent's own limits for a task's context card.
        const h = String(f.harness ?? "");
        const a = deps.accountUsage ? await deps.accountUsage.get(h, f.fresh === true) : { why: "unsupported" as const };
        send(ws, { t: "account_usage", harness: h, ...(a.usage ? { usage: a.usage } : {}), ...(a.why ? { why: a.why } : {}) });
        return;
      }
      case "task_switch": {
        if (!deps.loadout) throw new Error("switching is not available");
        let r: { ok: boolean; message?: string };
        try {
          r = await deps.loadout.switchTask(f.taskId, String(f.harness ?? ""), f.model || undefined, deps.runner(), typeof f.device === "string" && f.device ? f.device : undefined, typeof f.effort === "string" && f.effort ? f.effort : undefined);
        } catch (err) {
          r = { ok: false, message: (err as Error).message };
        }
        send(ws, { t: "action_result", taskId: f.taskId, action: "switch", ok: r.ok, ...(r.message ? { message: r.message } : {}) });
        return;
      }
      case "close_computer": {
        if (!deps.closing) throw new Error("closing is not available");
        // D292: the conversation's language (the setting, else what the person writes in).
        const r = await deps.closing.ask(String(f.device ?? ""), talkLang(deps.settings, deps.core.log) ?? "en");
        send(ws, r.ok ? { t: "close_result", device: String(f.device ?? ""), ok: true, ...(r.none ? { none: true } : {}), ...(r.decisionId ? { decisionId: r.decisionId } : {}) } : { t: "close_result", device: String(f.device ?? ""), ok: false, message: r.message });
        return;
      }
      case "connections": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        watchLook();
        watchOwn();
        send(ws, connectionsFrame());
        // D222: list the calendar accounts' calendars (cached); the frame follows when they change.
        watchCal();
        void deps.calendar?.()?.refresh().catch(() => {});
        const si = deps.connections.signInView();
        if (si) send(ws, { t: "connection_signin", signIn: si });
        // D222: a cold home lists its accounts only after the recheck; read the calendar lists then.
        void deps.connections
          .recheck()
          .then(() => deps.calendar?.()?.refresh())
          .catch(() => {});
        return;
      }
      case "connection_signin_cancel": {
        deps.connections?.cancelSignIn();
        return;
      }
      case "connection_reauth": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        const r = await deps.connections.reauth(String(f.id ?? ""));
        if (!r.ok) send(ws, { t: "connection_result", ok: false, reason: r.reason });
        return;
      }
      case "phone_voice": {
        if (!deps.phone) throw new Error("calls are not available");
        ws.data.connections = true;
        const action = f.action;
        if (!["record", "on", "off", "delete", "refresh"].includes(action)) throw new Error("unknown voice action");
        // The owner's own tap on the phone card is their yes; these are the words passed with it.
        const words = `Yes. (The person tapped "${action === "on" ? "use my voice" : action === "off" ? "stop using my voice" : action === "delete" ? "delete my voice" : "record my voice"}" in Ducter's settings.)`;
        const r = await deps.phone.voice(action, words);
        send(ws, { t: "phone_voice_result", action, ok: r.ok, ...(r.url ? { url: r.url } : {}), ...(r.reason ? { reason: r.reason } : {}), ...(r.message ? { message: r.message } : {}) });
        send(ws, connectionsFrame());
        return;
      }
      case "phone_cap": {
        if (!deps.phone) throw new Error("calls are not available");
        ws.data.connections = true;
        const usd = Number(f.usd);
        if (!Number.isFinite(usd) || usd <= 0) throw new Error("a cap is a positive amount");
        await deps.phone.setCap(usd, `Yes. (The person set the daily limit to $${usd} in Ducter's settings.)`);
        send(ws, connectionsFrame());
        return;
      }
      case "own_phone": {
        // D218: the own-number card. The key goes to the home only and never comes back in a frame.
        if (!deps.ownNumber || !deps.connections) throw new Error("calls from your own number are not available here");
        ws.data.connections = true;
        watchOwn();
        const { t: _t, ...a } = f;
        const r = await deps.ownNumber.act(a);
        if (!r.ok) send(ws, { t: "own_phone_result", ok: false, action: a.action, ...(r.error ? { reason: r.error } : {}) });
        send(ws, connectionsFrame());
        return;
      }
      // D278: 在 Pixel Fold 上拨打 / Call on Pixel Fold: a call sheet's own number, dialled by the
      // Ducter app on the person's phone. Only a sheet still open; the do-not-call list holds.
      case "handset_dial": {
        const callId = String(f.callId ?? "");
        const c = deps.phone?.get(callId);
        const result = (r: Omit<Extract<import("@ducter/protocol").ServerFrame, { t: "handset_dial_result" }>, "t" | "callId">) => send(ws, { t: "handset_dial_result", callId, ...r });
        if (!c || c.plan.from !== "self" || !c.plan.sheet || c.state !== "needs_go" || deps.phone?.blocked(c.plan.to)) return result({ ok: false, reason: "no_sheet" });
        if (!deps.handsets) return result({ ok: false, reason: "no_phone" });
        const sh = c.plan.sheet;
        const r = await deps.handsets.dial(typeof f.device === "string" && f.device ? f.device : undefined, { callId, to: c.plan.to, name: c.plan.name, sheet: { goal: c.plan.goal, open: sh.open, ask: sh.ask, dont: sh.dont, note: sh.note } });
        return result(r.ok ? { ok: true, phone: r.phone, how: r.how } : { ok: false, reason: r.reason, ...(r.phone ? { phone: r.phone } : {}), ...(r.error ? { error: r.error } : {}) });
      }
      case "handset_dial_res": {
        const me = ws.data.device?.id;
        if (me) deps.handsets?.dialed(me, { id: String(f.id ?? ""), ok: f.ok === true, ...(f.how === "rang" || f.how === "dialer" || f.how === "note" ? { how: f.how } : {}), ...(typeof f.error === "string" ? { error: f.error.slice(0, 200) } : {}) });
        return;
      }
      case "call_now": {
        if (!deps.phone) throw new Error("calls are not available");
        const r = deps.phone.callNow(String(f.callId ?? ""));
        if (!r.ok) throw new Error(r.error);
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
        return;
      }
      case "call_cancel": {
        if (!deps.phone) throw new Error("calls are not available");
        await deps.phone.cancel(String(f.callId ?? ""), "owner");
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
        return;
      }
      case "connection_add":
      case "connection_oo": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        const r = f.t === "connection_add" ? await deps.connections.add({ url: String(f.url ?? ""), token: f.token, name: f.name }) : await deps.connections.addFromOo();
        // D158: what it can read now goes with the answer (the oo kind's from the connections view).
        const apps: OoApp[] | undefined = r.ok ? (("apps" in r ? (r.apps as OoApp[] | undefined) : undefined) ?? deps.connections.view().find((c) => c.id === r.id)?.apps) : undefined;
        send(ws, r.ok ? { t: "connection_result", ok: true, id: r.id, ...(apps ? { readable: apps } : {}) } : { t: "connection_result", ok: false, reason: r.reason });
        if (!r.ok) send(ws, connectionsFrame());
        // D165 §11: the partner speaks in the conversation, once, at the first add.
        else deps.proactive?.()?.added(r.id);
        return;
      }
      case "app_watch": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        const p = deps.proactive?.();
        const patch = { ...(typeof f.watch === "boolean" ? { watch: f.watch } : {}), ...(typeof f.excluded === "boolean" ? { excluded: f.excluded } : {}) };
        const ok = p ? p.setApp(String(f.id ?? ""), String(f.service ?? ""), f.account, patch) : deps.connections.setApp(String(f.id ?? ""), String(f.service ?? ""), f.account, patch);
        if (!ok) send(ws, connectionsFrame());
        return;
      }
      case "cal_pick": {
        const cal = deps.calendar?.();
        if (!cal) throw new Error("calendars are not available");
        ws.data.connections = true;
        if (!cal.pick(String(f.id ?? ""), String(f.service ?? ""), f.account, String(f.calendarId ?? ""), f.seen === true)) send(ws, connectionsFrame());
        return;
      }
      case "media_keys": {
        // D242: a client whose keys ran out (a window left open for a day) asks for new ones.
        send(ws, { t: "media_keys", mediaKeys: core.media?.keysFor?.(f.ids) ?? {} });
        return;
      }
      case "proactive_day": {
        // D226: 今天看了什么 / What it looked at today, under the switch.
        const p = deps.proactive?.();
        if (p) send(ws, { t: "proactive_day", day: p.day() });
        return;
      }
      case "proactive_replay": {
        // D388: minutes, not seconds: answered when done, on this socket only.
        if (!deps.replay) throw new Error("not available");
        const days = typeof f.days === "number" && Number.isFinite(f.days) ? f.days : undefined;
        void deps
          .replay({ ...(days !== undefined ? { days } : {}), web: f.web !== false })
          .then((report) => send(ws, { t: "proactive_replay_result", report }))
          .catch((err: Error) => send(ws, { t: "proactive_replay_result", error: err.message.slice(0, 200) }));
        return;
      }
      case "proactive_week": {
        // D464: read-only, from the Log; answered on this socket only.
        if (!deps.week) throw new Error("not available");
        const weeks = typeof f.weeks === "number" && Number.isFinite(f.weeks) ? f.weeks : undefined;
        try {
          send(ws, { t: "proactive_week_result", report: deps.week(weeks) });
        } catch (err) {
          send(ws, { t: "proactive_week_result", error: (err as Error).message.slice(0, 200) });
        }
        return;
      }
      case "proactive_cross": {
        // D502: one shadow pass now, logged like the daily one; answered on this socket only, never said.
        const p = deps.proactive?.();
        if (!p) throw new Error("not available");
        void p
          .cross("asked")
          .then((run) => send(ws, { t: "proactive_cross_result", run }))
          .catch((err: Error) => send(ws, { t: "proactive_cross_result", error: err.message.slice(0, 200) }));
        return;
      }
      case "repairs_week": {
        // D473: read-only, from the Log; answered on this socket only.
        if (!deps.repairs) throw new Error("not available");
        const weeks = typeof f.weeks === "number" && Number.isFinite(f.weeks) ? f.weeks : undefined;
        try {
          send(ws, { t: "repairs_week_result", report: deps.repairs(weeks) });
        } catch (err) {
          send(ws, { t: "repairs_week_result", error: (err as Error).message.slice(0, 200) });
        }
        return;
      }
      case "connection_reads": {
        const p = deps.proactive?.();
        send(ws, { t: "connection_reads", id: String(f.id ?? ""), reads: p ? p.reads(String(f.id ?? "")) : [] });
        return;
      }
      case "find_react": {
        const p = deps.proactive?.();
        if (!p) throw new Error("not available");
        p.react(String(f.findId ?? ""), f.reaction === "mute" ? "mute" : "useful");
        return;
      }
      case "find_open": {
        // D464: 怎么知道的 opened, or 还有几条 brought these finds into view: counted, never learned from.
        const p = deps.proactive?.();
        if (!p) return;
        const ids = Array.isArray(f.findIds) ? f.findIds.filter((x: unknown): x is string => typeof x === "string") : [];
        p.opened(ids, f.what === "more" ? "more" : "how");
        return;
      }
      case "find_undo": {
        // D403: 撤回 / Undo on a drafted reply inside its window (a no-op once it went).
        const p = deps.proactive?.();
        if (!p) throw new Error("not available");
        p.undo(String(f.findId ?? ""));
        return;
      }
      case "proactive_answer": {
        const p = deps.proactive?.();
        if (!p) throw new Error("not available");
        if (!isProactiveYesNo(f.ask)) throw new Error("unknown ask");
        void p.answer(String(f.noteId ?? ""), f.ask, f.yes === true).catch((err) => console.warn("[ws] proactive:", (err as Error).message));
        return;
      }
      case "connection_remove": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        const ok = deps.connections.remove(String(f.id ?? ""));
        send(ws, ok ? { t: "connection_result", ok: true, id: f.id } : { t: "connection_result", ok: false, reason: "unknown_connection" });
        if (!ok) send(ws, connectionsFrame());
        return;
      }
      case "waiter_action":
      case "routine_action":
      case "until_action": {
        if (!deps.work) throw new Error("work over time is not available");
        const id = f.t === "waiter_action" ? f.waiterId : f.t === "routine_action" ? f.routineId : f.taskId;
        const action = f.action;
        const ok =
          f.t === "waiter_action" ? await deps.work.waiter(String(id ?? ""), f.action)
          : f.t === "routine_action" ? deps.work.routine(String(id ?? ""), f.action)
          : deps.work.until(String(id ?? ""), f.action);
        send(ws, { t: "action_result", taskId: String(id ?? ""), action, ok, ...(ok ? {} : { message: "not found or already finished" }) });
        // A look that changed nothing logs nothing: send the fresh view anyway.
        if (f.t === "waiter_action") send(ws, { t: "on_hand", onHand: tasks.onHand() });
        return;
      }
      case "task_new_options": {
        if (!deps.newTask) throw new Error("new tasks are not available");
        send(ws, { t: "task_new_options", ...(await deps.newTask.options(f.place)) });
        return;
      }
      case "task_new": {
        if (!deps.newTask) throw new Error("new tasks are not available");
        const id = typeof f.clientId === "string" && f.clientId ? f.clientId : undefined;
        // D341: picked from 待办来源 / To-do sources: a to-do with a live task opens that task, never a second one.
        const ts = deps.taskSources?.();
        const pick = f.item && typeof f.item === "object" && typeof f.item.ref === "string" && typeof f.item.source === "string" ? f.item : undefined;
        const already = pick && ts ? ts.taskOf(pick.ref) : undefined;
        if (already && isActive(already.attention)) return send(ws, { t: "task_new_result", ok: true, ...(id ? { clientId: id } : {}), taskId: already.taskId, card: already });
        const full = pick && ts ? await ts.item(pick.ref, pick.source).catch(() => undefined) : undefined;
        const srcBrief = pick ? briefOf(full ?? pick) : undefined;
        // D357: handed over from On hand (no place given): the repository's own folder when there is one.
        // D395: the one resolver task_open uses: the computer with its code (or a clone there first).
        const handedTo = async () => {
          const r = pick?.where ? await core.places?.preflight({ place: { kind: "none" }, remote: pick.where, texts: [pick.title ?? ""], userTexts: [] }).catch(() => undefined) : undefined;
          return r?.ok && r.place.kind === "repo" ? r.place : placeForRepo((await deps.newTask!.options().catch(() => ({ places: [] }))).places, pick?.where)?.place;
        };
        const place = f.place ?? (pick?.kind === "github" && f.handed === true ? await handedTo() : undefined);
        // A resend (the client never saw its result): the same answer, nothing opened twice.
        const prior = id ? newTaskSeen.get(id) : undefined;
        const pending =
          prior ??
          // D312: a task or routine made from another partner's conversation is that partner's.
          actAs(ws.data.partner, () => deps.newTask!.open({
            words: String(f.words ?? ""),
            ...(place ? { place } : {}),
            ...(typeof f.harness === "string" && f.harness ? { harness: f.harness } : {}),
            ...(typeof f.model === "string" && f.model ? { model: f.model } : {}),
            ...(typeof f.effort === "string" && f.effort ? { effort: f.effort } : {}),
            ...(f.when && typeof f.when === "object" && typeof f.when.kind === "string" ? { when: f.when } : {}),
            ...(f.media?.length ? { media: mediaOf(f.media) } : {}),
            ...(typeof f.from === "string" && f.from ? { from: f.from } : {}),
            ...(srcBrief ? { brief: `${String(f.words ?? "")}\n\n${srcBrief}` } : {}),
          }));
        if (id && !prior) {
          newTaskSeen.set(id, pending);
          if (newTaskSeen.size > 200) newTaskSeen.delete(newTaskSeen.keys().next().value!);
        }
        const r = await pending;
        const cid = id ? { clientId: id } : {};
        if (!r.ok) send(ws, { t: "task_new_result", ok: false, ...cid, reason: r.reason, message: r.message });
        else if ("routine" in r) {
          send(ws, { t: "task_new_result", ok: true, ...cid, routineId: r.routine.routineId, routine: r.routine });
          // A routine lives outside the channel: push On hand so its shelf shows it now.
          send(ws, { t: "on_hand", onHand: tasks.onHand() });
        } else {
          if (pick && ts && !prior) ts.bind(r.card.taskId, full ?? pick, "you");
          send(ws, { t: "task_new_result", ok: true, ...cid, taskId: r.card.taskId, card: tasks.get(r.card.taskId) ?? r.card });
        }
        return;
      }
      case "project_add": {
        const cid = typeof f.clientId === "string" && f.clientId ? { clientId: f.clientId } : {};
        if (!deps.newTask?.addProject) return send(ws, { t: "project_add_result", ok: false, ...cid, reason: "failed", message: "Projects can't be added here." });
        const device = typeof f.device === "string" && f.device && f.device !== "local" ? f.device : undefined;
        send(ws, { t: "project_add_result", ...cid, ...(await deps.newTask.addProject(String(f.path ?? ""), device)) });
        return;
      }
      case "project_clone": {
        const id = typeof f.clientId === "string" && f.clientId ? f.clientId : "";
        const cid = id ? { clientId: id } : {};
        const device = typeof f.device === "string" && f.device && f.device !== "local" ? f.device : undefined;
        const dev = device ? { device } : {};
        if (!deps.newTask?.clone) return send(ws, { t: "project_clone_result", ok: false, ...cid, ...dev, reason: "failed", message: "Projects can't be cloned here." });
        let pending = id ? cloneSeen.get(id) : undefined;
        if (!pending) {
          pending = deps.newTask.clone(device, typeof f.address === "string" ? f.address : "");
          if (id) {
            cloneSeen.set(id, pending);
            if (cloneSeen.size > 50) cloneSeen.delete(cloneSeen.keys().next().value!);
          }
        }
        send(ws, { t: "project_clone_result", ...cid, ...dev, ...(await pending) });
        return;
      }
      case "project_new": {
        const cid = typeof f.clientId === "string" && f.clientId ? { clientId: f.clientId } : {};
        const device = typeof f.device === "string" && f.device && f.device !== "local" ? f.device : undefined;
        const dev = device ? { device } : {};
        if (!deps.newTask?.newFolder) return send(ws, { t: "project_new_result", ok: false, ...cid, ...dev, reason: "failed", message: "Folders can't be made here." });
        send(ws, { t: "project_new_result", ...cid, ...dev, ...(await deps.newTask.newFolder(device, typeof f.name === "string" ? f.name : "")) });
        return;
      }
      case "git_login": {
        // D272: the token (action token) goes to that computer's gh and nowhere else: never logged.
        const cid = typeof f.clientId === "string" && f.clientId ? { clientId: f.clientId } : {};
        const device = typeof f.device === "string" && f.device && f.device !== "local" ? f.device : undefined;
        const head = { t: "git_login_state" as const, host: "github.com" as const, ...cid, ...(device ? { device } : {}) };
        const g = deps.newTask?.gitLogin;
        if (!g) return send(ws, { ...head, state: "failed", reason: "failed", message: "GitHub sign-in isn't available here." });
        // D345: 待办来源's 连上 / Connect: signed in on the home, GitHub becomes a source (the same tap asked for it).
        const forTodos = f.for === "todos" && !device;
        const said = async (s: import("@ducter/protocol").GitLoginState) => {
          if (forTodos && s.state === "signed_in") await deps.taskSources?.()?.add("github").catch(() => undefined);
          send(ws, { ...head, ...s });
        };
        if (f.action === "install") {
          // D345: gh isn't on the home: put it there (each step said), then sign in as start does.
          const inst = deps.newTask?.ghInstall;
          if (device || !inst) return send(ws, { ...head, state: "failed", reason: "unsupported", message: "Only the home can put gh on itself." });
          const got = await inst((s) => send(ws, { ...head, ...s }));
          if (got.state !== "signed_out") return said(got);
        }
        const action = f.action === "start" || f.action === "token" || f.action === "cancel" || f.action === "install" ? (f.action === "install" ? "start" : f.action) : "status";
        const first = await g(device, action, action === "token" && typeof f.token === "string" ? f.token : undefined);
        await (action === "status" || action === "cancel" ? send(ws, { ...head, ...first }) : said(first));
        // A sign-in waiting for its code to be entered: its end goes to the same socket.
        if (action === "start" && first.state === "code") await said(await g(device, "wait"));
        return;
      }
      case "folder_browse": {
        const cid = typeof f.clientId === "string" && f.clientId ? { clientId: f.clientId } : {};
        const device = typeof f.device === "string" && f.device && f.device !== "local" ? f.device : undefined;
        const dev = device ? { device } : {};
        if (!deps.newTask?.browse) return send(ws, { t: "folder_browse_result", ok: false, ...cid, ...dev, reason: "failed", message: "Folders can't be looked through here." });
        const path = typeof f.path === "string" && f.path ? f.path : undefined;
        send(ws, { t: "folder_browse_result", ...cid, ...dev, ...(await deps.newTask.browse(device, path)) });
        return;
      }
      // D300: 替你做过的 / Done for you.
      // D341: 待办来源 / To-do sources (task-sources/).
      case "sources":
      case "source_add":
      case "source_set":
      case "source_remove":
      case "source_items": {
        const ts = deps.taskSources?.();
        if (!ts) throw new Error("to-do sources aren't available here");
        offSources ??= ts.onChange(sourcesChanged);
        if (f.t === "sources") {
          ws.data.sources = true;
          send(ws, { t: "sources", ...ts.view() });
          void ts.look().catch(() => {});
          return;
        }
        if (f.t === "source_items" && typeof f.page === "number") {
          // D357: On hand's fold, a page at a time.
          const r = await ts.browse({
            page: f.page,
            ...(typeof f.id === "string" && f.id ? { source: f.id } : {}),
            ...(typeof f.query === "string" ? { query: f.query.slice(0, 200) } : {}),
            ...(typeof f.where === "string" ? { where: f.where.slice(0, 200) } : {}),
            ...(typeof f.tag === "string" && f.tag ? { tag: f.tag.slice(0, 60) } : {}),
            ...(f.review === true ? { review: true } : {}),
          });
          return send(ws, { t: "source_items_result", ...(typeof f.clientId === "string" ? { clientId: f.clientId.slice(0, 64) } : {}), items: r.items, page: r.page, more: r.more, wheres: r.wheres, tags: r.tags, ...(r.errors.length ? { errors: r.errors } : {}), ...(r.limited ? { limited: true } : {}) });
        }
        if (f.t === "source_items") {
          const r = await ts.items({ ...(typeof f.id === "string" && f.id ? { source: f.id } : {}), ...(typeof f.query === "string" ? { query: f.query.slice(0, 200) } : {}) });
          return send(ws, { t: "source_items_result", ...(typeof f.clientId === "string" ? { clientId: f.clientId.slice(0, 64) } : {}), items: r.items, ...(r.errors.length ? { errors: r.errors } : {}) });
        }
        if (f.t === "source_add") {
          const kind = f.kind === "github" || f.kind === "obsidian" ? f.kind : undefined;
          if (!kind) return send(ws, { t: "source_result", op: "add", ok: false, reason: "unknown" });
          const r = await ts.add(kind, typeof f.path === "string" ? f.path : undefined);
          return send(ws, { t: "source_result", op: "add", ok: r.ok, ...(r.id ? { id: r.id } : {}), ...(r.reason ? { reason: r.reason } : {}) });
        }
        const sid = String(f.id ?? "");
        if (f.t === "source_remove") return send(ws, { t: "source_result", op: "remove", ok: ts.remove(sid), id: sid });
        const ok = ts.set(sid, {
          ...(typeof f.whenNew === "string" ? { whenNew: f.whenNew } : {}),
          ...(typeof f.whenDone === "string" ? { whenDone: f.whenDone } : {}),
          ...(typeof f.folder === "string" ? { folder: f.folder } : {}),
          ...(typeof f.label === "string" ? { label: f.label } : {}),
          ...(Array.isArray(f.repos) ? { repos: f.repos.map(String) } : {}),
        });
        return send(ws, { t: "source_result", op: "set", ok, id: sid });
      }
      // D360: a group of tasks (task-groups.ts): made, renamed, reordered, taken apart, its line moved on.
      case "task_group": {
        const g = deps.taskGroups?.();
        if (!g) throw new Error("groups aren't available here");
        const r = await g.frame(f);
        if (!r.ok) return send(ws, { t: "error", message: r.error });
        return;
      }
      // D454: 移走 / Remove a finished card or group from On hand (back: 撤销 / Undo).
      case "onhand_away": {
        const away = deps.onHandAway;
        if (!away) throw new Error("removing isn't available here");
        const atWork = (id: string) => ["queued", "working", "needs_you", "blocked"].includes(tasks.get(id)?.attention ?? "");
        const ids = (Array.isArray(f.taskIds) ? f.taskIds : []).filter((id): id is string => typeof id === "string" && !!tasks.get(id));
        if (!f.back && ids.some(atWork)) return send(ws, { t: "error", message: "It's still at work; it leaves On hand once it's finished." });
        let groupIds: string[] = [];
        if (typeof f.groupId === "string" && f.groupId) {
          const groups = deps.taskGroups?.();
          const g = groups?.get(f.groupId);
          if (g) {
            const members = g.members.flatMap((m) => ("taskId" in m ? [m.taskId] : []));
            if (!f.back && members.some(atWork)) return send(ws, { t: "error", message: "Part of it is still at work; it leaves On hand once it's finished." });
            // What waits in line after a stopped part is dropped with it (nothing of it ever started).
            if (!f.back && g.members.some((m) => "key" in m)) await groups!.frame({ t: "task_group", op: "drop_rest", groupId: g.id });
            ids.push(...members.filter((id) => !ids.includes(id)));
          }
          groupIds = [f.groupId];
        }
        away.put({ taskIds: ids, groupIds, back: !!f.back });
        return;
      }
      // D359: the pile (task-sources/pile.ts).
      case "pile_sort":
      case "pile_items":
      case "pile_hand":
      case "pile_choose":
      case "pile_close":
      case "pre_read":
      case "pre_read_send":
      case "pile_find":
      case "pile_how":
      case "pile_subject":
      case "plan_answer":
      case "group_review":
      case "group_review_send": {
        const ts = deps.taskSources?.();
        if (!ts) throw new Error("to-do sources aren't available here");
        const pile = ts.pile;
        const id0 = (f as { clientId?: unknown }).clientId;
        const cid = typeof id0 === "string" ? { clientId: id0.slice(0, 64) } : {};
        const refs = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string").slice(0, 200) : []);
        if (f.t === "pile_sort") return void pile.sort("asked").catch(() => {});
        if (f.t === "pile_items") {
          const group = (PILE_GROUPS as readonly string[]).includes(f.group) ? f.group : "do";
          return send(ws, { t: "pile_items_result", ...cid, group, items: pile.items(group) });
        }
        // D385: handing several over (task-sources/handover.ts).
        const ho = ts.handover;
        const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
        const notesOf = (v: unknown) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string").slice(0, 60)) as Record<string, string> : undefined);
        if (f.t === "pile_find") {
          if (!ho) return;
          const r = await ho.find({ ...(str(f.query, 200) ? { query: str(f.query, 200)! } : {}), ...(str(f.words, 400) ? { words: str(f.words, 400)! } : {}),...(str(f.subject, 60) ? { subject: str(f.subject, 60)! } : {}), ...(str(f.setId, 64) ? { setId: str(f.setId, 64)! } : {}), ...(Array.isArray(f.drop) ? { drop: f.drop.filter((k): k is string => typeof k === "string").slice(0, 20).map((k) => k.slice(0, 120)) } : {}) });
          return send(ws, { t: "pile_find_result", ...cid, ...r });
        }
        // D415: the person's own subjects (分类).
        if (f.t === "pile_subject") {
          if (!["put", "take", "rename", "remove", "make"].includes(f.op) || typeof f.name !== "string") return;
          const r = pile.subject({ op: f.op, name: f.name, ...(str(f.to, 80) ? { to: str(f.to, 80)! } : {}), refs: refs(f.refs) });
          return send(ws, { t: "pile_result", ...cid, op: "subject", ok: r.ok, ...(r.n !== undefined ? { done: r.n } : {}), ...(r.name ? { name: r.name } : {}), ...(r.error ? { error: r.error } : {}) });
        }
        if (f.t === "pile_how") {
          if (!ho) return;
          const how = await ho.how({ refs: refs(f.refs), ...(str(f.note, 2000) ? { note: str(f.note, 2000)! } : {}), ...(f.bySubject === true ? { bySubject: true } : {}), ...(str(f.subject, 60) ? { subject: str(f.subject, 60)! } : {}) });
          return send(ws, { t: "pile_how_result", ...cid, how });
        }
        if (f.t === "plan_answer") {
          if (!ho || typeof f.groupId !== "string" || !["go", "hold", "reply"].includes(f.option)) return;
          const r = await ho.answerPlan(f.groupId, f.option, { ...(str(f.text, 2000) ? { text: str(f.text, 2000)! } : {}), ...(notesOf(f.notes) ? { notes: notesOf(f.notes)! } : {}) });
          return send(ws, { t: "pile_result", ...cid, op: "plan", ok: r.ok, groupId: f.groupId, ...(r.error ? { error: r.error } : {}) });
        }
        if (f.t === "group_review") {
          if (!ho || typeof f.groupId !== "string") return;
          const review = await ho.review(f.groupId);
          return send(ws, { t: "group_review_result", ...cid, ...(review ? { review } : { error: "That group isn't there any more." }) });
        }
        if (f.t === "group_review_send") {
          if (!ho || typeof f.groupId !== "string") return;
          const r = await ho.reviewSend(f.groupId, refs(f.keep));
          return send(ws, { t: "pile_result", ...cid, op: "group_review", ok: r.ok, done: r.done, failed: r.failed, groupId: f.groupId, ...(r.error ? { error: r.error } : {}) });
        }
        if (f.t === "pile_hand" && ho && (f.shape || f.note || f.notes || f.group || f.device || f.harness || f.setId || f.subject)) {
          const shape = (["plan", "one", "one_by_one", "side_by_side"] as const).find((s) => s === f.shape);
          const r = await ho.hand({ refs: refs(f.refs), ...(str(f.note, 2000) ? { note: str(f.note, 2000)! } : {}), ...(notesOf(f.notes) ? { notes: notesOf(f.notes)! } : {}), ...(shape ? { shape } : {}), ...(str(f.group, 64) ? { group: str(f.group, 64)! } : {}), ...(str(f.device, 64) ? { device: str(f.device, 64)! } : {}), ...(str(f.harness, 40) ? { harness: str(f.harness, 40)! } : {}), ...(str(f.subject, 60) ? { subject: str(f.subject, 60)! } : {}), ...(f.bySubject === true ? { bySubject: true } : {}), ...(str(f.setId, 64) ? { setId: str(f.setId, 64)! } : {}) });
          return send(ws, { t: "pile_result", ...cid, op: "hand", ok: r.ok, done: r.handed, ...(r.groupId ? { groupId: r.groupId } : {}), ...(r.asked ? { asked: r.asked } : {}), ...(r.error ? { error: r.error } : {}) });
        }
        if (f.t === "pile_hand") {
          const r = await pile.hand(refs(f.refs));
          return send(ws, { t: "pile_result", ...cid, op: "hand", ok: r.queued > 0 && !r.error, done: r.queued, ...(r.error ? { error: r.error } : {}) });
        }
        if (f.t === "pile_choose") {
          if (typeof f.ref !== "string" || !["hand", "close", "later", "keep"].includes(f.pick)) return;
          return void (await pile.choose(f.ref, f.pick));
        }
        if (f.t === "pile_close") {
          const r = await pile.close(refs(f.refs));
          return send(ws, { t: "pile_result", ...cid, op: "close", ok: r.done > 0 && !r.failed, done: r.done, failed: r.failed });
        }
        if (f.t === "pre_read") {
          if (typeof f.ref !== "string") return;
          const read = pile.read(f.ref) ?? (await pile.preRead(f.ref));
          return send(ws, { t: "pile_result", ...cid, op: "pre_read", ok: !!read, ...(read ? { read } : {}) });
        }
        if (f.t !== "pre_read_send" || typeof f.ref !== "string") return;
        const r = await pile.sendRead(f.ref, Array.isArray(f.keep) ? f.keep.filter((k): k is number => typeof k === "number") : []);
        return send(ws, { t: "pile_result", ...cid, op: "review", ok: r.ok, ...(r.error ? { error: r.error } : {}) });
      }
      case "did": {
        if (!deps.did) throw new Error("the record is not available");
        const q = f.query && typeof f.query === "object" ? f.query : {};
        send(ws, { t: "did_result", ...(typeof f.id === "string" ? { id: f.id.slice(0, 64) } : {}), ...deps.did.query(q) });
        return;
      }
      // D285: 做过的事 / Past tasks.
      case "past": {
        if (!deps.past) throw new Error("past tasks are not available");
        const query = f.query && typeof f.query === "object" ? f.query : {};
        const r = deps.past.query(deps.past.persona(), query);
        // D299: the sessions the person ran in their own agents here, beside Ducter's tasks.
        const o = deps.past.outside?.list(query);
        send(ws, { t: "past_result", ...(typeof f.id === "string" ? { id: f.id.slice(0, 64) } : {}), ...r, ...(o ? { outside: o.items, sources: o.sources } : {}) });
        return;
      }
      case "made": {
        // D383: 给你做的 / Made for you: what Ducter made, by words, kind and time.
        if (!deps.past?.made) throw new Error("made things are not available");
        const query = f.query && typeof f.query === "object" ? f.query : {};
        send(ws, { t: "made_result", ...(typeof f.id === "string" ? { id: f.id.slice(0, 64) } : {}), ...deps.past.made.query(deps.past.persona(), query) });
        return;
      }
      case "past_mark": {
        if (!deps.past) throw new Error("past tasks are not available");
        // A task's marks, or (D285, Ongoing) a routine's: the persona's own.
        const card = tasks.get(f.taskId);
        const routine = !card && deps.past.ongoing?.list(deps.past.persona()).some((i) => i.kind === "routine" && i.id === f.taskId);
        if (!card && !routine) throw new Error("I can't find that task.");
        const mark = deps.past.marks.set(card?.persona ?? deps.past.persona(), f.taskId, f.patch && typeof f.patch === "object" ? f.patch : {});
        // Every window: the card here, the same task's title in On hand and the task's head.
        for (const s of sockets) if (s.data.live && s.data.client !== "cli") send(s, { t: "past_marked", taskId: f.taskId, mark: mark ?? null });
        if (!sockets.has(ws)) send(ws, { t: "past_marked", taskId: f.taskId, mark: mark ?? null });
        if (routine) ongoingChanged();
        else {
          for (const s of sockets) if (s.data.live) s.data.onHandDirty = true;
          if (!flushTimer) flushTimer = setTimeout(flush, batchMs);
        }
        return;
      }
      case "ongoing": {
        const o = deps.past?.ongoing;
        if (!o) throw new Error("ongoing work is not available");
        send(ws, { t: "ongoing_result", ...(typeof f.id === "string" ? { id: f.id.slice(0, 64) } : {}), items: o.list(deps.past!.persona()) });
        return;
      }
      case "keep": {
        // D511: one Keep's page.
        const k = deps.past?.keeps;
        if (!k) throw new Error("looking after is not available");
        const id = String(f.id ?? "").slice(0, 64);
        const page = k.page(id);
        send(ws, { t: "keep_result", id, ...(page ? { keep: page } : {}) });
        return;
      }
      case "keep_action": {
        const k = deps.past?.keeps;
        if (!k) throw new Error("looking after is not available");
        const { t: _t, id, ...a } = f;
        const kid = String(id ?? "").slice(0, 64);
        const act = a.action === "pause" ? { action: "pause" as const, ...(typeof a.until === "string" ? { until: a.until } : {}) } : a.action === "resume" || a.action === "look_now" || a.action === "stop" ? { action: a.action } : undefined;
        const r = act ? await k.act(kid, act).catch((err: Error) => ({ ok: false, message: err.message })) : { ok: false, message: "unknown action" };
        send(ws, { t: "action_result", taskId: kid, action: String(a.action ?? ""), ok: r.ok, ...(r.message ? { message: r.message } : {}) });
        const page = k.page(kid);
        send(ws, { t: "keep_result", id: kid, ...(page ? { keep: page } : {}) });
        ongoingChanged();
        return;
      }
      case "ongoing_action": {
        const o = deps.past?.ongoing;
        if (!o) throw new Error("ongoing work is not available");
        const { t: _t, kind, id, ...a } = f;
        const r = await o.act(kind === "routine" ? "routine" : "task", String(id ?? ""), a as import("@ducter/protocol").OngoingAction).catch((err: Error) => ({ ok: false, message: err.message }));
        send(ws, { t: "action_result", taskId: String(id ?? ""), action: a.action, ok: r.ok, ...(r.message ? { message: r.message } : {}) });
        ongoingChanged();
        return;
      }
      case "outside_continue": {
        // D299: a session from outside Ducter carried on as a task (the same agent resumes it).
        const o = deps.past?.outside;
        const done = (r: { ok: boolean; taskId?: string; message?: string }) => send(ws, { t: "outside_adopted", agent: f.agent, id: f.id, ...r });
        if (!o) return done({ ok: false, message: "Past tasks are not available." });
        const harness = typeof f.harness === "string" && f.harness ? f.harness : undefined;
        const model = typeof f.model === "string" && f.model ? f.model : undefined;
        const r = await o.adopt(deps.runner(), deps.past!.persona(), f.agent, String(f.id ?? ""), harness, model);
        if (r.ok && r.taskId) log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${r.taskId}_continue`, taskId: r.taskId, state: "running", text: `the user carried on a ${f.agent} session they had run outside Ducter${harness && harness !== f.agent ? `, with ${harness}` : ""}` } });
        return done(r);
      }
      case "outside_hide": {
        const o = deps.past?.outside;
        if (!o) throw new Error("past tasks are not available");
        o.hide(f.agent, !!f.hidden);
        for (const s of sockets) if (s.data.live && s.data.client !== "cli") send(s, { t: "outside_hidden", agent: f.agent, hidden: !!f.hidden });
        if (!sockets.has(ws)) send(ws, { t: "outside_hidden", agent: f.agent, hidden: !!f.hidden });
        refreshFirstScreens(); // D307: Settings shows what is not shown, and its way back
        return;
      }
      case "past_steps": {
        // D391: a task's steps, for 停在哪儿 / Where it stopped and 从这一步重来 / Redo from here.
        const redo = deps.past?.redo;
        if (!redo) throw new Error("past tasks are not available");
        const card = tasks.get(String(f.taskId ?? ""));
        if (!card || card.persona !== deps.past!.persona()) throw new Error("I can't find that task.");
        const r = await redo.steps(card.taskId);
        send(ws, { t: "past_steps_result", ...(typeof f.id === "string" ? { id: f.id.slice(0, 64) } : {}), taskId: card.taskId, ...r });
        return;
      }
      case "past_fork": {
        // D391: 从这一步重来 / Redo from here: a new task; the original is not touched.
        const redo = deps.past?.redo;
        const step = Number(f.step) || 0;
        const done = (r: { ok: boolean; taskId?: string; message?: string; step?: number }) => send(ws, { t: "past_forked", from: String(f.taskId ?? ""), step: r.step ?? step, ok: r.ok, ...(r.taskId ? { taskId: r.taskId } : {}), ...(r.message ? { message: r.message } : {}) });
        if (!redo) return done({ ok: false, message: "Past tasks are not available." });
        const card = tasks.get(String(f.taskId ?? ""));
        if (!card || card.persona !== deps.past!.persona()) return done({ ok: false, message: "I can't find that task." });
        const r = await redo.fork({ taskId: card.taskId, ...(step ? { step } : {}), ...(typeof f.harness === "string" && f.harness ? { harness: f.harness } : {}), ...(typeof f.model === "string" && f.model ? { model: f.model } : {}), ...(typeof f.words === "string" ? { words: f.words.slice(0, 16_000) } : {}) }).catch((err: Error) => ({ ok: false as const, step, message: err.message }));
        if (!r.ok) return done({ ok: false, step: r.step, message: r.message });
        // The partner knows (it never wakes for this): the person redid an earlier task from a step.
        log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${r.card.taskId}_redo`, taskId: r.card.taskId, state: "running", text: `the user redid step ${r.step} of an earlier task (${card.title}) as this new one${r.card.harness !== card.harness ? `, with ${r.card.harness}` : ""}` } });
        return done({ ok: true, taskId: r.card.taskId, step: r.step });
      }
      case "past_continue": {
        // 接着做 / Continue: the same task goes back to work. Another agent first when picked
        // (its saved progress carries over, D89); then the person's words, or Ducter's own
        // "carry on". A session that can't be resumed, or a worktree removed after a merge, is
        // the runner's to handle (resumeOrSeed, provision).
        const result = (ok: boolean, message?: string) => send(ws, { t: "action_result", taskId: f.taskId, action: "continue", ok, ...(message ? { message } : {}) });
        const card = tasks.get(f.taskId);
        if (!card) return result(false, "I can't find that task.");
        const r = deps.runner();
        if (!r?.reopen) return result(false, noRunnerLine());
        const reopen = r.reopen.bind(r);
        try {
          const harness = typeof f.harness === "string" && f.harness ? f.harness : "";
          const words = typeof f.words === "string" ? f.words.trim() : "";
          const active = ["queued", "working", "needs_you", "blocked", "done_claimed"].includes(card.attention);
          // A dropped task comes back first (a switch refuses a dropped one).
          const reopened = card.attention === "dropped";
          if (reopened) send(ws, { t: "sent", taskId: f.taskId, delivered: (await reopen(f.taskId)).delivered });
          if (harness && (harness !== card.harness || (f.model && f.model !== card.model))) {
            if (!deps.loadout) return result(false, "Switching isn't available.");
            const sw = await deps.loadout.switchTask(f.taskId, harness, f.model || undefined, r);
            if (!sw.ok) return result(false, sw.message);
          }
          if (words) {
            const { delivered } = await r.send(f.taskId, words, reopened ? "queue" : undefined, "user", `past_${Date.now().toString(36)}`);
            send(ws, { t: "sent", taskId: f.taskId, delivered });
          } else if (!active && !reopened) {
            send(ws, { t: "sent", taskId: f.taskId, delivered: (await reopen(f.taskId)).delivered });
          }
          // The partner knows (it never wakes for this): the person took up an earlier task.
          log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${f.taskId}_continue`, taskId: f.taskId, state: "running", text: `the user took this earlier task up again from Past tasks${harness && harness !== card.harness ? ` with ${harness}` : ""}` } });
          return result(true);
        } catch (err) {
          return result(false, (err as Error).message);
        }
      }
      case "open_task": {
        // `ducter open <task>`: every connected app shows it; a CLI socket never does.
        if (!tasks.get(f.taskId)) return send(ws, { t: "open_result", taskId: f.taskId, ok: false, apps: 0, message: "I can't find that task." });
        let apps = 0;
        for (const s of sockets) {
          if (s === ws || !s.data.live || s.data.client === "cli") continue;
          if (s.data.buf.length) send(s, { t: "events", events: s.data.buf.splice(0) });
          send(s, { t: "open_task", taskId: f.taskId });
          apps++;
        }
        send(ws, { t: "open_result", taskId: f.taskId, ok: true, apps });
        return;
      }
      case "channel_history": {
        // D509: an older page of the conversation this socket shows, as the reader nears its top.
        const before = Math.floor(Number(f.beforeSeq));
        if (!Number.isFinite(before) || before < 1) throw new Error("channel_history needs beforeSeq");
        const stream = channelOf(ws.data.partner);
        const { events, more } = channelPage(log, stream, before, f.limit);
        send(ws, { t: "channel_history", events: events.map((e) => (stream === "channel" ? e : { ...e, stream: "channel" })), beforeSeq: before, more });
        return;
      }
      case "task_history": {
        // D284: a page of the task's stream, newest first by its index (stream, seq): the newest
        // window when the task opens, then older pages before beforeSeq. `more`: older ones remain.
        const stream = taskStream(f.taskId);
        const limit = Math.max(1, Math.min(f.limit ?? 200, 2000));
        // D320: afterSeq: the page after a far stretch the client holds, oldest first; more: newer remain.
        if (typeof f.afterSeq === "number") {
          const page = log.read({ stream, fromSeq: f.afterSeq + 1, limit: limit + 1 });
          const more = page.length > limit;
          send(ws, { t: "task_history", taskId: f.taskId, events: more ? page.slice(0, limit) : page, more, afterSeq: f.afterSeq });
          return;
        }
        const page = log.read({ stream, beforeSeq: f.beforeSeq, limit: limit + 1 });
        const more = page.length > limit;
        const events = more ? page.slice(1) : page;
        send(ws, { t: "task_history", taskId: f.taskId, events, more, ...(f.beforeSeq != null ? { beforeSeq: f.beforeSeq } : {}) });
        return;
      }
      case "task_index": {
        // D320: the task's session index, made once and kept as the Log grows; from fromSeq on
        // when the client holds the turns before it.
        if (typeof f.taskId !== "string" || !f.taskId) return;
        const ix = indexes.get(f.taskId);
        const from = typeof f.fromSeq === "number" && f.fromSeq > 0 ? f.fromSeq : undefined;
        send(ws, { t: "task_index", taskId: f.taskId, index: from ? indexFrom(ix, from) : ix, ...(from ? { fromSeq: from } : {}) });
        return;
      }
      case "wb": {
        // D214: one workbench op; a CLI never opens one.
        const id = typeof f.id === "string" ? f.id.slice(0, 64) : "";
        const answer = deps.workbench && ws.data.client !== "cli" ? await deps.workbench.handle(String(f.taskId ?? ""), f.req) : { ok: false as const, error: "unsupported" as const };
        send(ws, { t: "wb", id, taskId: String(f.taskId ?? ""), ...answer });
        return;
      }
      case "file_open": {
        // D356: a link to a file on the home or a worker, opened in the client's own viewer.
        const id = typeof f.id === "string" ? f.id.slice(0, 64) : "";
        const r = deps.runner();
        if (!r?.fileOpen || ws.data.client === "cli") return send(ws, { t: "file_open", id, ok: false, error: "unsupported" });
        try {
          const file = await r.fileOpen(String(f.path ?? ""), typeof f.taskId === "string" && f.taskId ? f.taskId : undefined);
          send(ws, { t: "file_open", id, ok: true, file });
        } catch (e) {
          const code = (e as { code?: unknown })?.code;
          const known: FileOpenError[] = ["missing", "outside", "too_big", "offline", "unsupported", "failed"];
          const error = known.includes(code as FileOpenError) ? (code as FileOpenError) : "failed";
          const message = error === "failed" && (e as Error)?.message ? String((e as Error).message).slice(0, 200) : undefined;
          send(ws, { t: "file_open", id, ok: false, error, ...(message && message !== "failed" ? { message } : {}) });
        }
        return;
      }
      case "folder_changes": {
        // D142: the list behind a folder task's Changes (a walk of the folder, so on request).
        const r = deps.runner();
        const changes = (await r?.folderChanges?.(f.taskId, { files: true }).catch(() => undefined)) ?? null;
        send(ws, { t: "folder_changes", taskId: f.taskId, changes });
        return;
      }
      // D151: the live view of Ducter's browser, and its signed-in sites.
      case "live_open":
      case "live_input":
      case "live_ack":
      case "live_close":
      case "live_turn":
      case "live_pause": {
        const b = deps.browser;
        // A view that can't open says so in its own frame (the client closes it with the
        // reason), never only as a generic error that leaves it at "Opening…".
        const refuse = (message: string) => f.t === "live_open" && send(ws, { t: "live", id: "", decisionId: f.try ? TRY_LIVE : f.taskId ? WATCH_LIVE : String(f.decisionId ?? ""), state: "closed", reason: "failed", message });
        // D190: frames of a page are for the user's own apps, never a CLI.
        if (f.t === "live_open" && ws.data.client === "cli") return void refuse("the browser shows in the Mac app or the phone");
        if (!b) {
          if (f.t === "live_open") return void refuse("Ducter's browser isn't available here");
          throw new Error("Ducter's browser isn't available here");
        }
        ws.data.sink ??= { send: (fr) => sockets.has(ws) && send(ws, fr) };
        const sink = ws.data.sink;
        const size = f.t === "live_open" ? { ...(f.width ? { width: f.width } : {}), ...(f.height ? { height: f.height } : {}), ...(f.scale ? { scale: f.scale } : {}) } : undefined;
        if (f.t === "live_open") {
          try {
            if (f.try) await b.live.tryIt(sink, size, typeof f.device === "string" ? f.device : undefined);
            else if (typeof f.taskId === "string" && f.taskId) await b.live.watch(sink, f.taskId, size);
            else await b.live.open(sink, String(f.decisionId ?? ""), size);
          } catch (e) {
            refuse((e as Error).message);
          }
        } else if (f.t === "live_input") await b.live.input(sink, String(f.id ?? ""), f.input);
        else if (f.t === "live_ack") b.live.ack(sink, String(f.id ?? ""), Number(f.seq));
        else if (f.t === "live_turn") await b.live.turn(sink, String(f.id ?? ""), !!f.mine);
        else if (f.t === "live_pause") await b.live.pause(sink, String(f.id ?? ""), !!f.paused);
        else await b.live.close(sink, String(f.id ?? ""), !!f.done);
        return;
      }
      // D217: 用手机 / Use a phone: install (with the licenses accepted), erase, and its live view.
      case "phone_terms":
      case "phone_install":
      case "phone_erase":
      case "phone_open":
      case "phone_input":
      case "phone_ack":
      case "phone_turn":
      case "phone_pause":
      case "phone_wake":
      case "phone_close": {
        const p = deps.ownPhone;
        const where = typeof (f as { device?: unknown }).device === "string" ? String((f as { device?: string }).device) : "local";
        // D234: on a worker Mac it is that Mac's phone: the request goes there.
        if (f.t === "phone_terms") {
          if (!p) return void send(ws, { t: "phone_terms", ok: false, reason: "not_mac_arm" });
          return void send(ws, { t: "phone_terms", ...(await p.terms(where)) });
        }
        if (f.t === "phone_install") {
          if (!p) return void send(ws, { t: "phone_install_result", ok: false, reason: "not_mac_arm" });
          const accepted = Array.isArray(f.accepted) ? f.accepted.filter((a) => a && typeof a.id === "string" && typeof a.sha256 === "string").map((a) => ({ id: a.id, sha256: a.sha256 })) : [];
          // It takes minutes: the card shows the progress; the result says only whether it started.
          const started = p.install(accepted, where);
          const quick = await Promise.race([started, Bun.sleep(300).then(() => undefined)]);
          if (quick && !quick.ok) return void send(ws, { t: "phone_install_result", ok: false, reason: quick.reason, message: quick.message });
          return void send(ws, { t: "phone_install_result", ok: true });
        }
        if (f.t === "phone_erase") {
          if (!p) return void send(ws, { t: "phone_erase_result", ok: false, message: "Ducter's phone isn't here" });
          const r = await p.erase(!!f.keepSdk, where);
          return void send(ws, { t: "phone_erase_result", ok: r.ok, ...(r.message ? { message: r.message } : {}) });
        }
        if (f.t === "phone_open" && (ws.data.client === "cli" || !p)) return void send(ws, { t: "phone_view", id: "", state: "closed", mode: f.mode ?? "watch", turn: "agent", here: false, device: "", reason: "failed", message: !p ? "Ducter's phone isn't available here" : "the phone shows in the Mac app or the phone" });
        if (!p) throw new Error("Ducter's phone isn't available here");
        ws.data.phoneSink ??= { send: (fr) => sockets.has(ws) && send(ws, fr) };
        const sink = ws.data.phoneSink;
        if (f.t === "phone_open") {
          const mode = f.mode === "takeover" || f.mode === "signin" ? f.mode : "watch";
          // D234: the phone of the computer named, else the one the task (or the card's task) runs on.
          const decTask = typeof f.decisionId === "string" && f.decisionId ? decisions.get(f.decisionId)?.taskId : undefined;
          const taskFor = (typeof f.taskId === "string" && f.taskId) || decTask;
          const on = typeof (f as { device?: unknown }).device === "string" && (f as { device?: string }).device ? where : taskFor ? p.computerOf(taskFor) : "local";
          const lv = p.liveFor(on);
          if (!lv) return void send(ws, { t: "phone_view", id: "", state: "closed", mode, turn: "agent", here: false, device: "", reason: "failed", message: "that computer's phone can't be reached right now" });
          await lv.open(sink, { mode, ...(typeof f.taskId === "string" && f.taskId ? { taskId: f.taskId } : {}), ...(typeof f.decisionId === "string" && f.decisionId ? { decisionId: f.decisionId } : {}) });
          return;
        }
        const lv = p.liveOf(String(f.id ?? "")) ?? p.live;
        if (f.t === "phone_input") await lv.input(sink, String(f.id ?? ""), f.input);
        else if (f.t === "phone_ack") lv.ack(sink, String(f.id ?? ""), Number(f.seq));
        else if (f.t === "phone_turn") await lv.turn(sink, String(f.id ?? ""), !!f.mine);
        else if (f.t === "phone_pause") lv.pause(sink, String(f.id ?? ""), !!f.paused);
        else if (f.t === "phone_wake") await lv.wake(sink, String(f.id ?? ""));
        else await lv.close(sink, String(f.id ?? ""), !!f.done);
        return;
      }
      // D276: 聊天软件 / Chat apps. Tokens come in once and never go back out.
      case "channels":
      case "channel_connect":
      case "channel_code":
      case "channel_unlink":
      case "channel_forget": {
        const ch = deps.channels;
        if (!ch) throw new Error("chat apps aren't available here");
        if (f.t === "channels") {
          ws.data.channels = true;
          return send(ws, channelsFrame(ws));
        }
        const kind = f.kind === "slack" ? "slack" : f.kind === "telegram" ? "telegram" : f.kind === "wechat" ? "wechat" : undefined;
        if (!kind) throw new Error("which chat app?");
        if (f.t === "channel_connect") {
          const r = await ch.connect(kind, { token: f.token, botToken: f.botToken, appToken: f.appToken, ...(f.verifyCode ? { verifyCode: String(f.verifyCode) } : {}) });
          return send(ws, { t: "channel_result", kind, op: "connect", ok: r.ok, ...(r.reason ? { reason: r.reason } : {}) });
        }
        if (f.t === "channel_code") {
          const r = ch.code(kind);
          return send(ws, r.ok ? { t: "channel_result", kind, op: "code", ok: true, code: r.code, expiresAt: new Date(r.expiresAt).toISOString(), ...(r.link ? { link: r.link } : {}) } : { t: "channel_result", kind, op: "code", ok: false, reason: r.reason });
        }
        if (f.t === "channel_unlink") return send(ws, { t: "channel_result", kind, op: "unlink", ok: ch.unlink(kind) });
        ch.forget(kind);
        return send(ws, { t: "channel_result", kind, op: "forget", ok: true });
      }
      // D235: 用电脑 / Use the computer: open the guide to macOS's two switches on that Mac; Stop a task in the person's apps.
      case "computer_grant": {
        const c = deps.computer;
        const device = String(f.device ?? "local") || "local";
        if (!c) return void send(ws, { t: "computer_grant_result", device, ok: false, reason: "not_mac" });
        const r = await c.grant(device);
        deps.devices?.()?.refresh();
        send(ws, { t: "computer_grant_result", device, ok: r.ok, ...(r.reason ? { reason: r.reason } : {}), ...(r.message ? { message: r.message } : {}) });
        return;
      }
      // D238: 用这台手机 / Use this phone. Only the page on that phone (a paired device) speaks for it.
      case "handset_hello": {
        const h = deps.handsets;
        const me = ws.data.device?.id;
        if (!h || !me || !f.state || typeof f.state !== "object") return;
        const s = f.state;
        // D263: the model Android names (a Pixel Fold) says the phone's shape more exactly than its page can.
        const byModel = s.foldable === true ? "foldable" : shapeOfModel(String(s.model ?? "").slice(0, 60)); // D317: its hinge first
        if (byModel) devicesView()?.shaped(me, byModel);
        // D255: the app's own link (hello.client "handset") is preferred over its page's while it is up.
        ws.data.handset ??= { send: (fr) => sockets.has(ws) && send(ws, fr), ...(ws.data.client === "handset" ? { native: true } : {}) };
        const rec = s.recording && typeof s.recording === "object" ? s.recording : undefined;
        h.hello(me, ws.data.handset, {
          bridge: Number(s.bridge) || 0,
          sdk: Number(s.sdk) || 0,
          model: String(s.model ?? "").slice(0, 60),
          ...(s.foldable === true ? { foldable: true } : {}),
          service: s.service === true,
          ...(typeof s.restricted === "boolean" ? { restricted: s.restricted } : {}),
          pictures: s.pictures === true,
          ...(typeof s.session === "string" && s.session ? { session: s.session } : {}),
          // D253: what the phone says of its screen, its background limits, and the loan it ended last.
          ...(typeof s.awake === "boolean" ? { awake: s.awake } : {}),
          ...(typeof s.locked === "boolean" ? { locked: s.locked } : {}),
          ...(s.asleep === true ? { asleep: true } : {}),
          // D331: a loan paused by the person's lock, and a Go waiting for the unlock.
          ...(s.paused === "locked" || s.paused === "asking" ? { paused: s.paused } : {}),
          ...(typeof s.waiting === "string" && s.waiting ? { waiting: s.waiting.slice(0, 64) } : {}),
          ...(typeof s.limited === "boolean" ? { limited: s.limited } : {}),
          ...(s.ended && typeof s.ended === "object" && typeof s.ended.session === "string" && ["stop", "service", "locked", "lost", "network", "taken", "expired"].includes(String(s.ended.why)) ? { ended: { session: s.ended.session, why: s.ended.why } } : {}),
          // D255: the app's run and link, and a recording asked for in a loan.
          ...(typeof s.boot === "string" && s.boot ? { boot: s.boot.slice(0, 40) } : {}),
          ...(s.link === "native" || s.link === "page" ? { link: s.link } : {}),
          ...(typeof s.gen === "number" ? { gen: s.gen } : {}),
          // D278: whether its app can dial a call sheet's number.
          ...(s.dial === "granted" || s.dial === "ask" || s.dial === "denied" ? { dial: s.dial } : {}),
          ...(rec && typeof rec.id === "string" && typeof rec.session === "string" && ["asking", "on", "saving", "saved", "declined", "failed"].includes(String(rec.state))
            ? {
                recording: {
                  id: rec.id.slice(0, 64),
                  session: rec.session.slice(0, 64),
                  state: rec.state,
                  ...(typeof rec.since === "number" ? { since: rec.since } : {}),
                  ...(typeof rec.name === "string" ? { name: rec.name.slice(0, 120) } : {}),
                  ...(typeof rec.ms === "number" ? { ms: rec.ms } : {}),
                  ...(typeof rec.bytes === "number" ? { bytes: rec.bytes } : {}),
                  ...(rec.partial === true ? { partial: true } : {}),
                  ...(typeof rec.error === "string" ? { error: rec.error.slice(0, 200) } : {}),
                },
              }
            : {}),
        });
        return;
      }
      case "handset_res": {
        const me = ws.data.device?.id;
        if (me) deps.handsets?.answer(me, { id: String(f.id ?? ""), ok: f.ok === true, ...(f.result !== undefined ? { result: f.result } : {}), ...(typeof f.error === "string" ? { error: f.error } : {}) });
        return;
      }
      case "handset_set": {
        const device = (typeof f.device === "string" && f.device) || ws.data.device?.id || "";
        const h = deps.handsets;
        // Adding it is done on that phone itself (its switch is there); removing it, from anywhere.
        const r = !h ? { ok: false, reason: "not_android" as const } : f.on && device !== ws.data.device?.id ? { ok: false, reason: "not_android" as const } : h.set(device, !!f.on);
        send(ws, { t: "handset_set_result", device, on: !!f.on, ...r });
        return;
      }
      case "handset_stop": {
        const fromPhone = f.from === "phone" ? ws.data.device?.id : undefined;
        // D253: the phone says why it ended a loan by itself (locked, its switch went off, the home went quiet).
        // D255: network (its own link couldn't reach the home).
        const why = fromPhone && (f.why === "locked" || f.why === "service" || f.why === "lost" || f.why === "network" || f.why === "stop" || f.why === "taken" || f.why === "expired") ? f.why : undefined;
        const ok = deps.handsets ? await deps.handsets.stop(typeof f.taskId === "string" && f.taskId ? f.taskId : undefined, fromPhone, why) : false;
        send(ws, { t: "handset_stop_result", ...(f.taskId ? { taskId: f.taskId } : {}), ok });
        if (ws.data.client !== "handset") send(ws, { t: "on_hand", onHand: tasks.onHand() });
        return;
      }
      case "computer_stop": {
        const ok = deps.computer ? await deps.computer.stop(String(f.taskId ?? "")) : false;
        send(ws, { t: "computer_stop_result", taskId: String(f.taskId ?? ""), ok });
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
        return;
      }
      case "browser_check": {
        // D154: one look at Ducter's own browser (`ducter browser check`), no task.
        const b = deps.browser;
        if (!b) throw new Error("Ducter's browser isn't available here");
        send(ws, { t: "browser_check", ...(await b.check(typeof f.url === "string" && f.url ? f.url : undefined)) });
        return;
      }
      case "browser_sites":
      case "browser_site_signout":
      case "browser_sites_clear": {
        const b = deps.browser;
        if (!b) throw new Error("Ducter's browser isn't available here");
        const profile = profileName(core.persona.id);
        const ready = b.setup().state === "ready";
        let message: string | undefined;
        let ok = true;
        try {
          if (f.t === "browser_site_signout") await b.sites.signOut(profile, String(f.site ?? ""));
          else if (f.t === "browser_sites_clear") await b.sites.clearAll(profile);
        } catch (err) {
          ok = false;
          message = (err as Error).message;
        }
        const sites = ready ? await b.sites.list(profile).catch(() => []) : [];
        send(ws, { t: "browser_sites", ready, sites, ...(f.t !== "browser_sites" ? { ok } : {}), ...(message ? { message } : {}) });
        return;
      }
      // D293: liveness, and the Mac app's "going to sleep" (its socket closes right after).
      case "ping":
        send(ws, { t: "pong" });
        return;
      case "sleep":
        if (ws.data.device) deps.home?.sleeping?.(ws.data.device);
        return;
      default:
        throw new Error(`unknown frame ${(f as { t?: string }).t}`);
    }
  };

  /** D285: every window's Ongoing, fresh after a change (a pause, a resume, a run). */
  function ongoingChanged() {
    const o = deps.past?.ongoing;
    if (!o) return;
    const items = o.list(deps.past!.persona());
    for (const s of sockets) if (s.data.live && s.data.client !== "cli") send(s, { t: "ongoing_result", items });
    for (const s of sockets) if (s.data.live) s.data.onHandDirty = true;
    if (!flushTimer) flushTimer = setTimeout(flush, batchMs);
  }

  return {
    setActivity,
    ongoingChanged,
    /** Something On hand shows changed outside the Log (D128: a task's diff stat): push it. */
    onHandChanged() {
      let any = false;
      for (const ws of sockets) if (ws.data.live) (ws.data.onHandDirty = true), (any = true);
      if (any && !flushTimer) flushTimer = setTimeout(flush, batchMs);
    },
    newData: (): WsData => ({ live: false, buf: [], onHandDirty: false }),
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        sockets.add(ws);
        if (ws.data.device) devicesView()?.changed();
        deps.home?.socketsChanged?.();
      },
      close(ws: ServerWebSocket<WsData>) {
        sockets.delete(ws);
        if (ws.data.sink) void deps.browser?.live.drop(ws.data.sink);
        if (ws.data.phoneSink) void deps.ownPhone?.drop(ws.data.phoneSink);
        if (ws.data.handset && ws.data.device) deps.handsets?.gone(ws.data.device.id, ws.data.handset);
        if (ws.data.device) devicesView()?.changed();
        if (ws.data.imessage && ws.data.imessage !== "off") channelsChanged(); // D323: that Mac no longer carries it
        deps.home?.socketsChanged?.();
      },
      async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
        let f: ClientFrame;
        try {
          f = JSON.parse(String(raw));
        } catch {
          send(ws, { t: "error", message: "invalid JSON" });
          return;
        }
        // A frame sent right behind hello waits for it: hello may yield mid-way (Bun.spawnSync
        // runs the event loop on macOS), and the next frame must not find the socket not live.
        let greeted: (() => void) | undefined;
        if (f?.t === "hello") ws.data.greeting = new Promise<void>((r) => (greeted = r));
        else if (!ws.data.live && ws.data.greeting) await ws.data.greeting;
        try {
          await handle(ws, f);
        } catch (err) {
          send(ws, { t: "error", message: `${f?.t ?? "frame"}: ${(err as Error).message}` });
        } finally {
          greeted?.();
        }
      },
    },
    /** D165: an app (not a CLI) is open on some socket now: the person is in Ducter. */
    present(): boolean {
      for (const ws of sockets) if (ws.data.live && ws.data.client !== "cli") return true;
      return false;
    },
    /** D277: a chat app reaches the person now (a Mac app's iMessage bridge says on). */
    channelUp(via: string): boolean {
      if (via !== "imessage") return false;
      for (const ws of sockets) if (ws.data.imessage === "on") return true;
      return false;
    },
    /** D293: every greeted socket hears that the ways to reach the home changed. */
    broadcast(f: ServerFrame) {
      for (const ws of sockets) if (ws.data.live && ws.data.client !== "handset") send(ws, f);
    },
    /** D293: how each connected client device reaches the home (its newest socket). */
    vias(): Map<string, import("@ducter/protocol").DeviceVia & { url?: string }> {
      const out = new Map<string, import("@ducter/protocol").DeviceVia & { url?: string }>();
      for (const ws of sockets) if (ws.data.device && ws.data.via) out.set(ws.data.device.id, ws.data.via);
      return out;
    },
    /** Paired client devices with a live socket now. */
    connected(): Set<string> {
      const out = new Set<string>();
      for (const ws of sockets) if (ws.data.device) out.add(ws.data.device.id);
      return out;
    },
    stop() {
      stopped = true;
      offPins?.();
      offApps?.();
      offDevices?.();
      offSettings?.();
      offBrainHold?.();
      offBudget?.();
      if (budgetPush) clearTimeout(budgetPush);
      offRules?.();
      offStanding?.();
      offConnections?.();
      offCalendar?.();
      offChannels?.();
      offSources?.();
      offOwn?.();
      if (ownScan) clearInterval(ownScan);
      if (ownTimer) clearTimeout(ownTimer);
      offLook?.();
      if (lookTimer) clearTimeout(lookTimer);
      offNoted();
      indexes.close();
      unsubscribe();
      offPartners?.();
      if (partnersTimer) clearTimeout(partnersTimer);
      if (flushTimer) clearTimeout(flushTimer);
      for (const ws of sockets) ws.close(1001, "shutting down");
    },
  };
}
