// Client WebSocket protocol (ClientFrame / ServerFrame) over Bun's built-in WS.
import type { ServerWebSocket } from "bun";
import type { Bodies, ClientFrame, Delivery, LogEvent, ServerFrame } from "@ducter/protocol";
import type { CoreApi, Runner } from "@ducter/protocol/src/internal.ts";
import type { Decisions } from "./decisions.ts";
import type { DevicesView } from "./devices.ts";
import { PROJECTED_KINDS, taskStream } from "./registry.ts";
import { machineId } from "./machine.ts";
import type { SettingsStore } from "./settings.ts";
import type { ConnectionsStore } from "./connections.ts";

export interface WsData {
  live: boolean;
  buf: LogEvent[];
  onHandDirty: boolean;
  /** Asked for devices: gets a fresh devices frame whenever one changes. */
  devices?: boolean;
  /** Asked for settings: gets a fresh settings frame whenever they change. */
  settings?: boolean;
  /** Asked for connections: gets a fresh connections frame whenever they change. */
  connections?: boolean;
  /** The paired device behind a remote socket (core.ts). */
  device?: { id: string };
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
  /** The user's connections (connections.ts); absent in tests that don't need it. */
  connections?: ConnectionsStore;
  batchMs?: number;
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
        ws.data.live = true; // synchronous since the read: no event can be missed in between
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
        const result = (ok: boolean, message?: string, ref?: string) =>
          send(ws, { t: "action_result", taskId: f.taskId, action: f.action, ok, ...(message ? { message } : {}), ...(ref ? { ref } : {}) });
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
      case "task_history": {
        const stream = taskStream(f.taskId);
        const events = log.read({ stream, beforeSeq: f.beforeSeq, limit: Math.min(f.limit ?? 200, 2000) });
        send(ws, { t: "task_history", taskId: f.taskId, events });
        return;
      }
      default:
        throw new Error(`unknown frame ${(f as { t?: string }).t}`);
    }
  };

  return {
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
        try {
          await handle(ws, f);
        } catch (err) {
          send(ws, { t: "error", message: `${f?.t ?? "frame"}: ${(err as Error).message}` });
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
      offConnections?.();
      offNoted();
      unsubscribe();
      if (flushTimer) clearTimeout(flushTimer);
      for (const ws of sockets) ws.close(1001, "shutting down");
    },
  };
}
