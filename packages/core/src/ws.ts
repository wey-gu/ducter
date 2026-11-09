// Client WebSocket protocol (ClientFrame / ServerFrame) over Bun's built-in WS.
import type { ServerWebSocket } from "bun";
import type { Bodies, ClientFrame, ClientKind, Delivery, LogEvent, PartnerActivity, Place, ServerFrame, UndoConfirm } from "@ducter/protocol";
import type { NewTaskInput, NewTaskResult } from "./newtask.ts";
import type { CoreApi, Runner } from "@ducter/protocol/src/internal.ts";
import type { Decisions } from "./decisions.ts";
import type { DevicesView } from "./devices.ts";
import { PROJECTED_KINDS, taskStream } from "./registry.ts";
import { machineId } from "./machine.ts";
import type { SettingsStore } from "./settings.ts";
import type { RulesStore } from "./rules.ts";
import type { Loadout } from "./loadout.ts";
import type { ConnectionsStore } from "./connections.ts";

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
}

const ON_HAND_KINDS = new Set<string>(PROJECTED_KINDS);
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
  /** The partner's settings (settings.ts); absent in tests that don't need it. */
  settings?: SettingsStore;
  /** Your rules and who does the tasks (D89); absent in tests that don't need them. */
  rules?: RulesStore;
  loadout?: Loadout;
  /** The user's connections (connections.ts); absent in tests that don't need it. */
  connections?: ConnectionsStore;
  /** Work over time (D112-D114): waiters, until loops, routines; absent in tests that don't need it. */
  work?: WorkFrames;
  /** 开一件事 / New task (D128, newtask.ts); absent in tests that don't need it. */
  newTask?: NewTaskFrames;
  batchMs?: number;
}

/** What the New task frames do (core.ts wires them to newtask.ts). */
export interface NewTaskFrames {
  open(input: NewTaskInput): Promise<NewTaskResult>;
  options(place?: Place): Promise<Omit<Extract<ServerFrame, { t: "task_new_options" }>, "t">>;
}

/** What the client frames for work over time do (core.ts wires them to waiters, untils, routines). */
export interface WorkFrames {
  zone(tz: string): void;
  waiter(waiterId: string, action: "look" | "cancel"): Promise<boolean>;
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
  const { log, tasks } = core;
  const sockets = new Set<ServerWebSocket<WsData>>();
  const batchMs = deps.batchMs ?? 50;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const send = (ws: ServerWebSocket<WsData>, f: ServerFrame) => ws.send(JSON.stringify(f));

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
    if (v) offDevices = v.onChange(() => void pushDevices().catch((err) => console.warn("[ws] devices:", (err as Error).message)));
  };

  // Settings: every subscriber gets a fresh frame on every change (another window, the phone).
  const settingsFrame = async (forgot?: { seq: number; how: "mem" | "hidden" }): Promise<ServerFrame> => {
    const v = await deps.settings!.view();
    return { t: "settings", ...v, ...(forgot ? { forgot } : {}) };
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
  const connectionsFrame = (): ServerFrame => ({ t: "connections", connections: deps.connections!.view(), oo: deps.connections!.oo() });
  const offConnections = deps.connections?.onChange(() => {
    for (const ws of sockets) if (ws.data.connections) send(ws, connectionsFrame());
  });
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

  // Computed once, now: on macOS it shells out (ioreg) with Bun.spawnSync, which runs the event
  // loop, so doing it inside the first hello let the next frame in before hello had finished.
  machineId();

  const handle = async (ws: ServerWebSocket<WsData>, f: ClientFrame) => {
    if (f.t !== "hello" && !ws.data.live) throw new Error("send hello first");
    switch (f.t) {
      case "hello": {
        const machine = machineId();
        send(ws, { t: "welcome", persona: core.persona.id, personaName: core.persona.name, headSeq: log.head(), ...(machine ? { machine } : {}) });
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
        return;
      }
      case "send": {
        if (!f.text?.trim()) throw new Error("empty message");
        const dup = f.clientId ? seen.get(f.clientId) : undefined;
        if (dup != null) {
          // A resend (the client never saw its echo): don't append again, echo the original.
          send(ws, { t: "events", events: log.read({ fromSeq: dup, limit: 1 }) });
          return;
        }
        log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: f.text, clientId: f.clientId } });
        return; // the partner is triggered by core's user_msg subscription
      }
      case "decide":
        decisions.decide(f.decisionId, f.option, f.text);
        return;
      case "task_send": {
        const r = deps.runner();
        if (!r) throw new Error("runner is not available");
        if (!f.text?.trim()) throw new Error("empty message");
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
        decisions.answeredByMessage(f.taskId, f.text, "user");
        const delivering = r.send(f.taskId, f.text, undefined, "user", f.clientId).then((x) => x.delivered);
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
        const noteUserAction = (taskId: string, text: string) =>
          log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${taskId}_${f.action}`, taskId, state: "done", text } });
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
              if (m.ok) noteUserAction(f.taskId, `the user merged this task's branch into its base branch${m.ref ? ` (${m.ref.slice(0, 7)})` : ""}`);
              return result(m.ok, m.message, m.ref);
            }
            case "open_pr": {
              if (!r?.openPr) return result(false, "Opening a PR isn't available.");
              const o = await r.openPr(f.taskId);
              if (o.ok) noteUserAction(f.taskId, `the user opened a draft PR for this task${o.ref ? `: ${o.ref}` : ""}`);
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
            send(ws, { t: "error", message: `settings_set: ${b.harness} can't be what the partner thinks with here (it must be signed in on this computer and able to be the partner)` });
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
          r = await deps.loadout.switchTask(f.taskId, String(f.harness ?? ""), f.model || undefined, deps.runner());
        } catch (err) {
          r = { ok: false, message: (err as Error).message };
        }
        send(ws, { t: "action_result", taskId: f.taskId, action: "switch", ok: r.ok, ...(r.message ? { message: r.message } : {}) });
        return;
      }
      case "connections": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        send(ws, connectionsFrame());
        void deps.connections.recheck().catch(() => {});
        return;
      }
      case "connection_add":
      case "connection_oo": {
        if (!deps.connections) throw new Error("connections are not available");
        ws.data.connections = true;
        const r = f.t === "connection_add" ? await deps.connections.add({ url: String(f.url ?? ""), token: f.token, name: f.name }) : await deps.connections.addFromOo();
        send(ws, r.ok ? { t: "connection_result", ok: true, id: r.id } : { t: "connection_result", ok: false, reason: r.reason });
        if (!r.ok) send(ws, connectionsFrame());
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
          });
        if (id && !prior) {
          newTaskSeen.set(id, pending);
          if (newTaskSeen.size > 200) newTaskSeen.delete(newTaskSeen.keys().next().value!);
        }
        const r = await pending;
        send(ws, r.ok ? { t: "task_new_result", ok: true, ...(id ? { clientId: id } : {}), taskId: r.card.taskId, card: r.card } : { t: "task_new_result", ok: false, ...(id ? { clientId: id } : {}), reason: r.reason, message: r.message });
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
      case "folder_changes": {
        // D142: the list behind a folder task's Changes (a walk of the folder, so on request).
        const r = deps.runner();
        const changes = (await r?.folderChanges?.(f.taskId, { files: true }).catch(() => undefined)) ?? null;
        send(ws, { t: "folder_changes", taskId: f.taskId, changes });
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
      offNoted();
      unsubscribe();
      if (flushTimer) clearTimeout(flushTimer);
      for (const ws of sockets) ws.close(1001, "shutting down");
    },
  };
}
