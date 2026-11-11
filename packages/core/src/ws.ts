// Client WebSocket protocol (ClientFrame / ServerFrame) over Bun's built-in WS.
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { brainNow } from "./brain.ts";
import { harnessName, isHarnessId, TRY_LIVE, WATCH_LIVE } from "@ducter/protocol";
import type { ServerWebSocket } from "bun";
import type { Bodies, ClientFrame, ClientKind, Delivery, LogEvent, MediaRef, OoApp, PartnerActivity, Place, ServerFrame, UndoConfirm } from "@ducter/protocol";
import type { NewTaskInput, NewTaskResult } from "./newtask.ts";
import type { CoreApi, Runner } from "@ducter/protocol/src/internal.ts";
import type { Decisions } from "./decisions.ts";
import type { DevicesView } from "./devices.ts";
import { redactDeep } from "@ducter/protocol/src/redact.ts";
import { PROJECTED_KINDS, taskStream } from "./registry.ts";
import { machineId } from "./machine.ts";
import type { SettingsStore } from "./settings.ts";
import type { RulesStore } from "./rules.ts";
import type { Loadout } from "./loadout.ts";
import type { ConnectionsStore } from "./connections.ts";
import { firstScreen, type FirstScreenInput } from "./first-screen.ts";
import type { FirstScreen } from "@ducter/protocol";
import type { DucterBrowser } from "./browser/index.ts";
import type { LiveSink } from "./browser/live.ts";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";

export interface WsData {
  live: boolean;
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
  /** The paired device behind a remote socket (core.ts). */
  device?: { id: string };
  /** Settles when this socket's hello is handled: frames sent right behind it wait for it. */
  greeting?: Promise<void>;
  /** What connected (hello.client); absent = an app. */
  client?: ClientKind;
  /** D151: this socket's end of its live views (frames go only to the socket that opened one). */
  sink?: LiveSink;
  /** D217: this socket's end of its phone views. */
  phoneSink?: import("./android/live.ts").PhoneSink;
}

const ON_HAND_KINDS = new Set<string>([...PROJECTED_KINDS, "phone_call"]);
const REDACTED = new Set<string>(["events", "task_history", "on_hand", "task_new_result", "action_result"]);
const REPLAY_FRESH = 200; // channel events replayed when hello has no cursor
const REPLAY_MAX = 5000; // cap for a cursor replay
const SEEN_WINDOW = 2000; // user messages (by clientId) remembered for idempotent send
const TASK_SEEN_WINDOW = 500; // task_event lines scanned for a task_send resend

const DELIVERED: Record<string, Delivery> = { turn: "prompted", steer: "steered", queue: "queued" };

export interface WsDeps {
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
  /** D169: Nowledge Mem in each device's own agents (mem-plugins.ts); absent in tests that don't need it. */
  memPlugins?: () => import("./mem-plugins.ts").MemPlugins | undefined;
  /** D151: Ducter's own browser (live view, Sites); absent in tests that don't need it. */
  browser?: DucterBrowser;
  /** D214: the opened task's workbench (workbench.ts); absent in tests that don't need it. */
  workbench?: import("./workbench.ts").WbFrames;
  /** D217: Ducter's phone (用手机): install, erase, live view; absent in tests that don't need it. */
  ownPhone?: import("./android/index.ts").DucterPhone;
  /** D191: 自动填充 / Autofill; absent in tests that don't need it. */
  autofill?: import("./saved/index.ts").Autofill;
  /** D165/D166: what Ducter notices in the accounts; absent in tests that don't need it. */
  proactive?: () => import("./proactive/engine.ts").Proactive | undefined;
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
}

/** What the client frames for work over time do (core.ts wires them to waiters, untils, routines). */
export interface WorkFrames {
  zone(tz: string): void;
  waiter(waiterId: string, action: "look" | "cancel" | "rearm"): Promise<boolean>;
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
    if (!core.media) throw new Error("Pictures can't be sent here.");
    return (core.media as unknown as { refs(ids: unknown): MediaRef[] }).refs(ids);
  };
  const { log, tasks } = core;
  const sockets = new Set<ServerWebSocket<WsData>>();
  const batchMs = deps.batchMs ?? 50;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  // What the Log holds goes out with every key in it hidden (D152): the Log keeps them (a task
  // needs the key it was given), no client ever shows one. The frames that carry Log text: events,
  // a task's history, On hand (titles, reports, questions).
  const send = (ws: ServerWebSocket<WsData>, f: ServerFrame) => ws.send(JSON.stringify(REDACTED.has(f.t) ? redactDeep(f) : f));

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
  const settingsFrame = async (forgot?: { seq: number; how: "mem" | "hidden" }): Promise<ServerFrame> => {
    const v = await deps.settings!.view();
    // D150: the brain actually in use (core's Codex-only fallback included), so no client claims one
    // the home doesn't have.
    const home = devicesView() ? (await devicesView()!.frame()).devices.find((d) => d.home)?.harnesses : undefined;
    const now = brainNow(v.settings.brain, deps.settings!.brainChosen(), home);
    const bridge = await deps.bridgeLink?.view().catch(() => undefined);
    return { t: "settings", ...v, brainNow: now, ...(forgot ? { forgot } : {}), ...(bridge ? { bridge } : {}) };
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
    const list = deps.connections!.view().map((c) => {
      const look = p?.look(c.id);
      const phone = deps.phone?.view(c.id);
      return { ...c, ...(look ? { look } : {}), ...(phone ? { phone } : {}) };
    });
    const own = deps.ownNumber?.view();
    return { t: "connections", connections: list, oo: deps.connections!.oo(), ...(own ? { ownPhone: own } : {}) };
  };
  const offConnections = deps.connections?.onChange(() => {
    for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
  });
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

  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "user_msg") remember((e.body as Bodies["user_msg"]).clientId, e.seq);
    let any = false;
    for (const ws of sockets) {
      if (!ws.data.live) continue;
      // Channel events and live task events (task_event/task_state/...) for every task.
      ws.data.buf.push(e), (any = true);
      if (ON_HAND_KINDS.has(e.kind)) (ws.data.onHandDirty = true), (any = true);
    }
    if (any && !flushTimer) flushTimer = setTimeout(flush, batchMs);
  });

  // What the partner is doing while the user waits (D104). Presence, not history: never logged.
  // Buffered events go first, so a reply and the activity that ends with it arrive in order.
  let activity: PartnerActivity | null = null;
  const setActivity = (a: PartnerActivity | null) => {
    if (a === null && activity === null) return;
    if (a && activity && a.step === activity.step && a.since === activity.since) return;
    activity = a;
    for (const ws of sockets) {
      if (!ws.data.live) continue;
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
    return firstScreen({
      tasks: tasks.list(),
      onHand: tasks.onHand(),
      noted,
      apps,
      computers,
      talked: log.read({ stream: "channel", kinds: ["user_msg"], limit: 1 }).length > 0,
      now: new Date(),
      ...(tz ? { tz } : {}),
    });
  };

  // Computed once, now: on macOS it shells out (ioreg) with Bun.spawnSync, which runs the event
  // loop, so doing it inside the first hello let the next frame in before hello had finished.
  machineId();

  const handle = async (ws: ServerWebSocket<WsData>, f: ClientFrame) => {
    if (f.t !== "hello" && !ws.data.live) throw new Error("send hello first");
    switch (f.t) {
      case "hello": {
        const machine = machineId();
        send(ws, { t: "welcome", persona: core.persona.id, personaName: core.persona.name, headSeq: log.head(), ...(machine ? { machine } : {}), version: DUCTER_VERSION });
        // Channel only: task streams are pulled with task_history.
        const events =
          f.cursor != null && f.cursor >= 0
            ? log.read({ stream: "channel", fromSeq: f.cursor + 1, limit: REPLAY_MAX })
            : log.read({ stream: "channel", limit: REPLAY_FRESH });
        send(ws, { t: "events", events: dropSuperseded(events) });
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
        if (activity) send(ws, { t: "activity", activity });
        ws.data.live = true; // synchronous since the read: no event can be missed in between
        if (f.client === "desktop" || f.client === "web" || f.client === "cli") ws.data.client = f.client;
        if (typeof f.tz === "string" && f.tz) deps.work?.zone(f.tz);
        // An app newer than the latest release the home knows: that answer is stale.
        if (typeof f.version === "string") deps.updates?.()?.sawVersion(f.version);
        // The empty conversation's words (D149), for the apps only; a failure leaves the client's own.
        if (f.client !== "cli") deps.proactive?.()?.hello();
        if (f.client !== "cli")
          void firstScreenFor(f.tz)
            .then((first) => sockets.has(ws) && send(ws, { t: "first_screen", first }))
            .catch((err) => console.warn("[ws] first screen:", (err as Error).message));
        return;
      }
      case "send": {
        const dup = f.clientId ? seen.get(f.clientId) : undefined;
        if (dup != null) {
          // A resend (the client never saw its echo): don't append again, echo the original.
          send(ws, { t: "events", events: log.read({ fromSeq: dup, limit: 1 }) });
          return;
        }
        // D206: pictures come as ids the upload answered; words may be empty then.
        const media = mediaOf(f.media);
        if (!f.text?.trim() && !media.length) throw new Error("empty message");
        log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: f.text ?? "", clientId: f.clientId, ...(media.length ? { media } : {}) } });
        return; // the partner is triggered by core's user_msg subscription
      }
      case "decide": {
        // D191: a pay card's Go carries the card's security code (never kept, never logged): it
        // waits in memory for that one fill. Go without it is refused, so nothing is half-paid.
        const pay = deps.autofill?.fill;
        if (f.option === "go" && pay?.needsCvc(f.decisionId)) {
          if (!f.cvc) throw new Error("this payment needs the card's security code");
          pay.holdCvc(f.decisionId, f.cvc);
        }
        decisions.decide(f.decisionId, f.option, f.text);
        return;
      }
      case "saved":
      case "saved_put":
      case "saved_remove":
      case "saved_forget_site": {
        // D191: the Autofill list. A put is the one frame that carries a secret; the answer never does.
        const af = deps.autofill;
        if (!af) throw new Error("Autofill isn't available here");
        try {
          if (f.t === "saved_put") af.store.put(f.item);
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
            send(ws, { t: "sent", taskId: f.taskId, delivered: DELIVERED[mode ?? ""] ?? "prompted" });
            return;
          }
          // The first copy is still on its way (the runner logs it once the session is up).
          const inFlight = taskSending.get(key);
          if (inFlight) return void send(ws, { t: "sent", taskId: f.taskId, delivered: await inFlight });
        }
        // Answering the task directly answers its open question too (no later Go re-wakes it).
        decisions.answeredByMessage(f.taskId, f.text ?? "", "user");
        const delivering = r.send(f.taskId, f.text ?? "", undefined, "user", f.clientId, media.length ? media : undefined).then((x) => x.delivered);
        if (key) taskSending.set(key, delivering);
        try {
          send(ws, { t: "sent", taskId: f.taskId, delivered: await delivering });
          return;
        } finally {
          if (key) taskSending.delete(key);
        }
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
        log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: f.upToSeq } });
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
        send(ws, await v.setAbility(f.device, f.ability, f.on));
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
      case "bridge_connect":
      case "bridge_disconnect": {
        // D205: the user's tap on 接上 / 断开 in Settings › 伙伴 is their Go for this one call.
        if (!deps.settings || !deps.bridgeLink) throw new Error("settings are not available");
        ws.data.settings = true;
        // Each step pushes a fresh settings frame (connecting…, then connected or Mem's refusal).
        await (f.t === "bridge_connect" ? deps.bridgeLink.connect() : deps.bridgeLink.disconnect());
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
      case "task_switch": {
        if (!deps.loadout) throw new Error("switching is not available");
        let r: { ok: boolean; message?: string };
        try {
          r = await deps.loadout.switchTask(f.taskId, String(f.harness ?? ""), f.model || undefined, deps.runner(), typeof f.device === "string" && f.device ? f.device : undefined);
        } catch (err) {
          r = { ok: false, message: (err as Error).message };
        }
        send(ws, { t: "action_result", taskId: f.taskId, action: "switch", ok: r.ok, ...(r.message ? { message: r.message } : {}) });
        return;
      }
      case "close_computer": {
        if (!deps.closing) throw new Error("closing is not available");
        const lang = deps.settings?.get().language;
        const r = await deps.closing.ask(String(f.device ?? ""), lang === "zh");
        send(ws, r.ok ? { t: "close_result", device: String(f.device ?? ""), ok: true, ...(r.none ? { none: true } : {}), ...(r.decisionId ? { decisionId: r.decisionId } : {}) } : { t: "close_result", device: String(f.device ?? ""), ok: false, message: r.message });
        return;
      }
      case "connections": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        watchLook();
        watchOwn();
        send(ws, connectionsFrame());
        const si = deps.connections.signInView();
        if (si) send(ws, { t: "connection_signin", signIn: si });
        void deps.connections.recheck().catch(() => {});
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
        if (f.ask !== "first_look" && f.ask !== "keep_note") throw new Error("unknown ask");
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
          deps.newTask.open({
            words: String(f.words ?? ""),
            ...(f.place ? { place: f.place } : {}),
            ...(typeof f.harness === "string" && f.harness ? { harness: f.harness } : {}),
            ...(typeof f.model === "string" && f.model ? { model: f.model } : {}),
            ...(typeof f.effort === "string" && f.effort ? { effort: f.effort } : {}),
            ...(f.when && typeof f.when === "object" && typeof f.when.kind === "string" ? { when: f.when } : {}),
            ...(f.media?.length ? { media: mediaOf(f.media) } : {}),
          });
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
      case "folder_browse": {
        const cid = typeof f.clientId === "string" && f.clientId ? { clientId: f.clientId } : {};
        const device = typeof f.device === "string" && f.device && f.device !== "local" ? f.device : undefined;
        const dev = device ? { device } : {};
        if (!deps.newTask?.browse) return send(ws, { t: "folder_browse_result", ok: false, ...cid, ...dev, reason: "failed", message: "Folders can't be looked through here." });
        const path = typeof f.path === "string" && f.path ? f.path : undefined;
        send(ws, { t: "folder_browse_result", ...cid, ...dev, ...(await deps.newTask.browse(device, path)) });
        return;
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
        const stream = taskStream(f.taskId);
        const events = log.read({ stream, beforeSeq: f.beforeSeq, limit: Math.min(f.limit ?? 200, 2000) });
        send(ws, { t: "task_history", taskId: f.taskId, events });
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
      case "phone_close": {
        const p = deps.ownPhone;
        const where = typeof (f as { device?: unknown }).device === "string" ? String((f as { device?: string }).device) : "local";
        if (f.t === "phone_terms") {
          if (!p || where !== "local") return void send(ws, { t: "phone_terms", ok: false, reason: "not_mac_arm" });
          return void send(ws, { t: "phone_terms", ...(await p.terms()) });
        }
        if (f.t === "phone_install") {
          if (!p || where !== "local") return void send(ws, { t: "phone_install_result", ok: false, reason: "not_mac_arm" });
          const accepted = Array.isArray(f.accepted) ? f.accepted.filter((a) => a && typeof a.id === "string" && typeof a.sha256 === "string").map((a) => ({ id: a.id, sha256: a.sha256 })) : [];
          // It takes minutes: the card shows the progress; the result says only whether it started.
          const started = p.install(accepted);
          const quick = await Promise.race([started, Bun.sleep(300).then(() => undefined)]);
          if (quick && !quick.ok) return void send(ws, { t: "phone_install_result", ok: false, reason: quick.reason, message: quick.message });
          return void send(ws, { t: "phone_install_result", ok: true });
        }
        if (f.t === "phone_erase") {
          if (!p) return void send(ws, { t: "phone_erase_result", ok: false, message: "Ducter's phone isn't here" });
          await p.erase(!!f.keepSdk);
          return void send(ws, { t: "phone_erase_result", ok: true });
        }
        if (f.t === "phone_open" && (ws.data.client === "cli" || !p)) return void send(ws, { t: "phone_view", id: "", state: "closed", mode: f.mode ?? "watch", turn: "agent", here: false, device: "", reason: "failed", message: !p ? "Ducter's phone isn't available here" : "the phone shows in the Mac app or the phone" });
        if (!p) throw new Error("Ducter's phone isn't available here");
        ws.data.phoneSink ??= { send: (fr) => sockets.has(ws) && send(ws, fr) };
        const sink = ws.data.phoneSink;
        if (f.t === "phone_open") {
          const mode = f.mode === "takeover" || f.mode === "signin" ? f.mode : "watch";
          await p.live.open(sink, { mode, ...(typeof f.taskId === "string" && f.taskId ? { taskId: f.taskId } : {}), ...(typeof f.decisionId === "string" && f.decisionId ? { decisionId: f.decisionId } : {}) });
        } else if (f.t === "phone_input") await p.live.input(sink, String(f.id ?? ""), f.input);
        else if (f.t === "phone_ack") p.live.ack(sink, String(f.id ?? ""), Number(f.seq));
        else if (f.t === "phone_turn") await p.live.turn(sink, String(f.id ?? ""), !!f.mine);
        else if (f.t === "phone_pause") p.live.pause(sink, String(f.id ?? ""), !!f.paused);
        else await p.live.close(sink, String(f.id ?? ""), !!f.done);
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
      default:
        throw new Error(`unknown frame ${(f as { t?: string }).t}`);
    }
  };

  return {
    setActivity,
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
      },
      close(ws: ServerWebSocket<WsData>) {
        sockets.delete(ws);
        if (ws.data.sink) void deps.browser?.live.drop(ws.data.sink);
        if (ws.data.phoneSink) void deps.ownPhone?.live.drop(ws.data.phoneSink);
        if (ws.data.device) devicesView()?.changed();
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
      offOwn?.();
      if (ownScan) clearInterval(ownScan);
      if (ownTimer) clearTimeout(ownTimer);
      offLook?.();
      if (lookTimer) clearTimeout(lookTimer);
      offNoted();
      unsubscribe();
      if (flushTimer) clearTimeout(flushTimer);
      for (const ws of sockets) ws.close(1001, "shutting down");
    },
  };
}
