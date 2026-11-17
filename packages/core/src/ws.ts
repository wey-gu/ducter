// Client WebSocket protocol (ClientFrame / ServerFrame) over Bun's built-in WS.
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { brainNow } from "./brain.ts";
import { CLIENT_SHAPES, harnessName, isHarnessId, isProactiveYesNo, shapeOfModel, TRY_LIVE, WATCH_LIVE } from "@ducter/protocol";
import type { ServerWebSocket } from "bun";
import type { Bodies, ClientFrame, ClientKind, Delivery, LogEvent, MediaRef, OoApp, PartnerActivity, Place, ServerFrame, UndoConfirm } from "@ducter/protocol";
import type { NewTaskInput, NewTaskResult } from "./newtask.ts";
import type { CoreApi, Runner } from "@ducter/protocol/src/internal.ts";
import type { Decisions } from "./decisions.ts";
import { logUserMessage } from "./reply.ts";
import { talkLang } from "./lang.ts";
import type { DevicesView } from "./devices.ts";
import { redactDeep } from "@ducter/protocol/src/redact.ts";
import { PROJECTED_KINDS, taskStream } from "./registry.ts";
import { sessionIndexes } from "./session-index.ts";
import { indexFrom } from "@ducter/protocol/src/session.ts";
import { machineId } from "./machine.ts";
import type { SettingsStore } from "./settings.ts";
import type { RulesStore } from "./rules.ts";
import type { Loadout } from "./loadout.ts";
import type { ConnectionsStore } from "./connections.ts";
import { firstScreen, starters, type FirstScreenInput } from "./first-screen.ts";
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
const REDACTED = new Set<string>(["events", "task_history", "task_index", "on_hand", "task_new_result", "action_result"]);
const REPLAY_FRESH = 200; // channel events replayed when hello has no cursor
const REPLAY_MAX = 5000; // cap for a cursor replay
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
  /** D205: the persona's Bridge connection (bridge-link.ts); absent in tests that don't need it. */
  bridgeLink?: import("./bridge-link.ts").BridgeLink;
  /** The partner's settings (settings.ts); absent in tests that don't need it. */
  settings?: SettingsStore;
  /** Your rules and who does the tasks (D89); absent in tests that don't need them. */
  rules?: RulesStore;
  loadout?: Loadout;
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
  /** 开一件事 / New task (D128, newtask.ts); absent in tests that don't need it. */
  newTask?: NewTaskFrames;
  /** D148: updating devices in place (updates.ts); absent in tests that don't need it. */
  updates?: () => import("./updates.ts").Updates | undefined;
  /** D156: updating the AI agents on each device (agents.ts); absent in tests that don't need it. */
  agents?: () => import("./agents.ts").AgentUpdates | undefined;
  /** D224: 全部更新 / Update all. */
  updateAll?: () => import("./update-all.ts").UpdateAll | undefined;
  /** D169: Nowledge Mem in each device's own agents (mem-plugins.ts); absent in tests that don't need it. */
  memPlugins?: () => import("./mem-plugins.ts").MemPlugins | undefined;
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
  /** D222: the person's calendars (Accounts' calendar rows, today's line, cal_pick). */
  calendar?: () => import("./calendar.ts").Calendar | undefined;
  /** D285: 做过的事 / Past tasks (past.ts); absent in tests that don't need it. */
  /** D309: 伙伴们 / Partners (partners.ts); absent in tests that don't need them. */
  partners?: Partners;
  past?: import("./past.ts").Past & { marks: import("./past.ts").Marks; persona: () => string; ongoing?: import("./ongoing.ts").Ongoing; outside?: import("./outside.ts").Outside };
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
  keys?: { dataDir: string; fetch?: typeof fetch; canRun?: (h: import("@ducter/protocol").HarnessId) => boolean };
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

export function createWsHandler(deps: WsDeps) {
  const { core, decisions } = deps;
  /** D206: the refs for the ids a client sent (throws on one the home doesn't hold). */
  const mediaOf = (ids: unknown): MediaRef[] => {
    if (ids === undefined || ids === null || (Array.isArray(ids) && !ids.length)) return [];
    if (!core.media) throw new Error("Pictures and files can't be sent here.");
    return (core.media as unknown as { refs(ids: unknown): MediaRef[] }).refs(ids);
  };
  const { log, tasks } = core;
  const sockets = new Set<ServerWebSocket<WsData>>();
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
        void pushDevices().catch((err) => console.warn("[ws] devices:", (err as Error).message));
        // A sign-in on the home can change what the partner thinks with (brainNow).
        const subs = [...sockets].filter((ws) => ws.data.settings);
        if (subs.length && deps.settings) void settingsFrame().then((f) => subs.forEach((ws) => sockets.has(ws) && send(ws, f)));
      });
  };

  // Settings: every subscriber gets a fresh frame on every change (another window, the phone).
  const settingsFrame = async (forgot?: { seq: number; how: "mem" | "hidden" }, corrected?: { seq: number; how: "mem" | "here" }): Promise<ServerFrame> => {
    const v = await deps.settings!.view();
    // D150: the brain actually in use (core's Codex-only fallback included), so no client claims one
    // the home doesn't have.
    const home = devicesView() ? (await devicesView()!.frame()).devices.find((d) => d.home)?.harnesses : undefined;
    const now = brainNow(v.settings.brain, deps.settings!.brainChosen(), home);
    const bridge = await deps.bridgeLink?.view().catch(() => undefined);
    const own = deps.ownAgents?.() ?? [];
    return { t: "settings", ...v, brainNow: now, ...(forgot ? { forgot } : {}), ...(corrected ? { corrected } : {}), ...(bridge ? { bridge } : {}), ...(own.length ? { ownAgents: own } : {}) };
  };
  const offSettings = deps.settings?.onChange(() => {
    const subs = [...sockets].filter((ws) => ws.data.settings);
    if (!subs.length) return;
    void settingsFrame().then((f) => subs.forEach((ws) => sockets.has(ws) && send(ws, f)));
  });
  const rulesFrame = (): ServerFrame => ({ t: "rules", rules: deps.rules!.list() });
  const offRules = deps.rules?.onChange(() => {
    const f = rulesFrame();
    for (const ws of sockets) if (ws.data.rules) send(ws, f);
  });
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
    if (subs.length) void settingsFrame().then((f) => subs.forEach((ws) => sockets.has(ws) && send(ws, f)));
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
  const partnersFrame = (ws: ServerWebSocket<WsData>): ServerFrame & { t: "partners" } => ({ t: "partners", partners: deps.partners?.list() ?? [], shown: ws.data.partner ?? DEFAULT_PARTNER });
  let partnersTimer: ReturnType<typeof setTimeout> | undefined;
  /** Every live socket gets a fresh partners frame (soon, once for a burst). */
  const partnersChanged = () => {
    if (partnersTimer) return;
    partnersTimer = setTimeout(() => {
      partnersTimer = undefined;
      for (const s of sockets) {
        if (!s.data.live) continue;
        if (s.data.buf.length) send(s, { t: "events", events: s.data.buf.splice(0) });
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
    if (deps.partners?.on() && (e.kind === "decision" || e.kind === "decision_resolved") && partnerOfStream(e.stream)) partnersChanged();
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

  // D149: what the empty conversation says, from names and metadata the home already has.
  const firstScreenFor = async (tz?: string): Promise<FirstScreen> => {
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
    return { ...fs, ...(deps.firstWords && deps.settings ? { looks: deps.settings.localAgents() } : {}), ...(nb ? { noBrain: true } : {}), ...(hidden.length ? { outsideHidden: hidden } : {}), ...(folders.length ? { outsideFolders: folders } : {}), ...(computer ? { computer } : {}), ...(lookDone ? { lookDone: true as const } : {}) };
  };

  /** D298: nothing on the home can think: its agents were probed and none is signed in. */
  const noBrain = (): boolean => {
    const h = devicesView()?.harnessesNow();
    return !!h && !h.some((x) => x.loggedIn);
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
      void firstScreenFor(ws.data.tz)
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
        const shownId = ws.data.partner ?? core.persona.id;
        const shownName = ws.data.partner ? (deps.partners?.nameOf(ws.data.partner) ?? core.persona.name) : core.persona.name;
        ws.data.buf.length = 0; // a hello again (a switch, D309): what was queued was for the other conversation
        send(ws, { t: "welcome", persona: shownId, personaName: shownName, headSeq: log.head(), ...(machine ? { machine } : {}), version: DUCTER_VERSION, ping: true, ...(deps.home ? { fp: deps.home.fp } : {}) });
        if (deps.partners?.on()) send(ws, partnersFrame(ws));
        // D293: the ways to reach the home, so a device can follow it to another one.
        if (deps.home) send(ws, deps.home.ways());
        // Channel only: task streams are pulled with task_history.
        const stream = channelOf(ws.data.partner);
        const events =
          f.cursor != null && f.cursor >= 0
            ? log.read({ stream, fromSeq: f.cursor + 1, limit: REPLAY_MAX })
            : log.read({ stream, limit: REPLAY_FRESH });
        send(ws, { t: "events", events: dropSuperseded(events).map((e) => (stream === "channel" ? e : { ...e, stream: "channel" })) });
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
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
          void firstScreenFor(f.tz)
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
            .catch((err) => console.warn("[ws] first screen:", (err as Error).message));
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
        if (ws.data.partner) {
          logUserMessage(log, decisions, { text: f.text ?? "", clientId: f.clientId, media, ...(f.reply ? { reply: f.reply } : {}), stream: channelOf(ws.data.partner) });
          return;
        }
        logUserMessage(log, decisions, { text: f.text ?? "", clientId: f.clientId, media, ...(f.reply ? { reply: f.reply } : {}), ...(via ? { via } : {}) });
        return; // the partner is triggered by core's user_msg subscription
      }
      case "partners": {
        if (!deps.partners) throw new Error("partners unavailable");
        return send(ws, partnersFrame(ws));
      }
      case "partner_add": {
        if (!deps.partners) throw new Error("partners unavailable");
        const r = deps.partners.add({ name: String(f.name ?? ""), look: f.look });
        // A made one: every socket hears it (onChange); this one also gets its clientId back.
        return send(ws, { ...partnersFrame(ws), ...(typeof f.clientId === "string" ? { clientId: f.clientId.slice(0, 64) } : {}), ...(r.ok ? {} : { error: r.error }) });
      }
      case "partner_set": {
        if (!deps.partners) throw new Error("partners unavailable");
        const r = deps.partners.set(String(f.id ?? ""), { ...(f.name !== undefined ? { name: String(f.name) } : {}), ...(f.look !== undefined ? { look: f.look } : {}) });
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
        const pay = deps.autofill?.fill;
        if (f.option === "go" && pay?.needsCvc(f.decisionId)) {
          if (!f.cvc) throw new Error("this payment needs the card's security code");
          pay.holdCvc(f.decisionId, f.cvc);
        }
        decisions.decide(f.decisionId, f.option, f.text);
        return;
      }
      case "key_add": {
        // D298: the one frame that carries a pasted key. Never logged; the answer never carries it.
        const k = deps.keys;
        const clientId = typeof f.clientId === "string" ? f.clientId.slice(0, 80) : "";
        if (!k) throw new Error("Keys can't be added here");
        const lang = ws.data.locale ?? "en";
        const wasBlind = noBrain();
        const result = await addKey(typeof f.key === "string" ? f.key : "", { dataDir: k.dataDir, lang, ...(k.fetch ? { fetch: k.fetch } : {}), ...(k.canRun ? { canRun: k.canRun } : {}) });
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
              if (!r) return result(false, "Tasks can't run right now.");
              await r.interrupt(f.taskId);
              return result(true);
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
            case "reopen": {
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
      case "update_all": {
        // D224: 全部更新 / Update all (stop: 停止剩下的; dismiss: put a finished plan away).
        const ua = deps.updateAll?.();
        if (!ua) return send(ws, { t: "update_all_result", ok: false, reason: "failed", detail: "updates are not available" });
        watchDevices();
        if (f.stop) return send(ws, { t: "update_all_result", ok: ua.stop(), ...(ua.plan() ? { id: ua.plan()!.id } : {}) });
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
        const r = await mp.install(device, harness);
        return send(ws, r.ok ? { t: "mem_plugin_result", device, harness, ok: true, taskId: r.taskId } : { t: "mem_plugin_result", device, harness, ok: false, reason: r.reason });
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
        // What it thinks with must be an AI agent signed in on the Mac Ducter lives on, and one
        // that can be the partner (D89).
        const b = f.patch?.brain;
        if (b && devicesView()) {
          const home = (await devicesView()!.frame()).devices.find((d) => d.home);
          const h = home?.harnesses.find((x) => x.harness === b.harness);
          if (!h?.canBePartner) {
            // D150: never an agent the home doesn't have signed in (it would break the partner).
            const name = isHarnessId(b.harness) ? harnessName(b.harness) : b.harness;
            send(ws, { t: "error", message: `${name} isn't signed in on ${home?.name ?? "the computer Ducter lives on"}, so it can't be what ${deps.core.persona.name} thinks with.` });
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
        send(ws, rulesFrame());
        return;
      }
      case "rule_remove": {
        if (!deps.rules) throw new Error("rules are not available");
        ws.data.rules = true;
        // A removal pushes a fresh frame to every subscriber; an unknown id: answer this one.
        if (!deps.rules.remove(String(f.id ?? ""))) send(ws, rulesFrame());
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
        // A resend (the client never saw its result): the same answer, nothing opened twice.
        const prior = id ? newTaskSeen.get(id) : undefined;
        const pending =
          prior ??
          // D312: a task or routine made from another partner's conversation is that partner's.
          actAs(ws.data.partner, () => deps.newTask!.open({
            words: String(f.words ?? ""),
            ...(f.place ? { place: f.place } : {}),
            ...(typeof f.harness === "string" && f.harness ? { harness: f.harness } : {}),
            ...(typeof f.model === "string" && f.model ? { model: f.model } : {}),
            ...(typeof f.effort === "string" && f.effort ? { effort: f.effort } : {}),
            ...(f.when && typeof f.when === "object" && typeof f.when.kind === "string" ? { when: f.when } : {}),
            ...(f.media?.length ? { media: mediaOf(f.media) } : {}),
            ...(typeof f.from === "string" && f.from ? { from: f.from } : {}),
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
        } else send(ws, { t: "task_new_result", ok: true, ...cid, taskId: r.card.taskId, card: r.card });
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
        const action = f.action === "start" || f.action === "token" || f.action === "cancel" ? f.action : "status";
        const first = await g(device, action, action === "token" && typeof f.token === "string" ? f.token : undefined);
        send(ws, { ...head, ...first });
        // A sign-in waiting for its code to be entered: its end goes to the same socket.
        if (action === "start" && first.state === "code") send(ws, { ...head, ...(await g(device, "wait")) });
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
      case "past_continue": {
        // 接着做 / Continue: the same task goes back to work. Another agent first when picked
        // (its saved progress carries over, D89); then the person's words, or Ducter's own
        // "carry on". A session that can't be resumed, or a worktree removed after a merge, is
        // the runner's to handle (resumeOrSeed, provision).
        const result = (ok: boolean, message?: string) => send(ws, { t: "action_result", taskId: f.taskId, action: "continue", ok, ...(message ? { message } : {}) });
        const card = tasks.get(f.taskId);
        if (!card) return result(false, "I can't find that task.");
        const r = deps.runner();
        if (!r?.reopen) return result(false, "Tasks can't run right now.");
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
      offDevices?.();
      offSettings?.();
      offRules?.();
      offConnections?.();
      offCalendar?.();
      offChannels?.();
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
