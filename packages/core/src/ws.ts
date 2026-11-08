// Client WebSocket protocol (ClientFrame / ServerFrame) over Bun's built-in WS.
import type { ServerWebSocket } from "bun";
import type { ClientFrame, EventKind, LogEvent, ServerFrame } from "@ducter/protocol";
import type { CoreApi, Runner } from "@ducter/protocol/src/internal.ts";
import type { Decisions } from "./decisions.ts";
import { PROJECTED_KINDS, taskStream } from "./registry.ts";

export interface WsData {
  live: boolean;
  watching: Set<string>; // task streams this client opened (task_history) and gets live
  buf: LogEvent[];
  onHandDirty: boolean;
}

// Transcript-level kinds go only to clients that opened the task.
const TRANSCRIPT_KINDS = new Set<EventKind>(["task_event", "checkpoint"]);
const ON_HAND_KINDS = new Set<string>(PROJECTED_KINDS);
const REPLAY_FRESH = 500;
const REPLAY_MAX = 5000;

export interface WsDeps {
  core: CoreApi;
  decisions: Decisions;
  runner: () => Runner | undefined;
  batchMs?: number;
}

const REPLAY_KINDS: EventKind[] = [
  "user_msg", "ai_msg", "ack", "job_status", "living_msg", "decision", "decision_resolved", "read_receipt",
  "task_open", "task_state", "report",
];

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

  const unsubscribe = log.subscribe((e) => {
    let any = false;
    for (const ws of sockets) {
      if (!ws.data.live) continue;
      if (!TRANSCRIPT_KINDS.has(e.kind) || ws.data.watching.has(e.stream)) ws.data.buf.push(e), (any = true);
      if (ON_HAND_KINDS.has(e.kind)) (ws.data.onHandDirty = true), (any = true);
    }
    if (any && !flushTimer) flushTimer = setTimeout(flush, batchMs);
  });

  const handle = async (ws: ServerWebSocket<WsData>, f: ClientFrame) => {
    if (f.t !== "hello" && !ws.data.live) throw new Error("send hello first");
    switch (f.t) {
      case "hello": {
        send(ws, { t: "welcome", persona: core.persona.id, personaName: core.persona.name, headSeq: log.head() });
        const events =
          f.cursor && f.cursor > 0
            ? log.read({ fromSeq: f.cursor + 1, limit: REPLAY_MAX, kinds: REPLAY_KINDS })
            : log.read({ limit: REPLAY_FRESH, kinds: REPLAY_KINDS });
        send(ws, { t: "events", events: dropSuperseded(events) });
        send(ws, { t: "on_hand", onHand: tasks.onHand() });
        ws.data.live = true; // synchronous since the read: no event can be missed in between
        return;
      }
      case "send": {
        if (!f.text?.trim()) throw new Error("empty message");
        log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: f.text, clientId: f.clientId } });
        return; // the partner is triggered by core's user_msg subscription
      }
      case "decide":
        decisions.decide(f.decisionId, f.option, f.text);
        return;
      case "task_send": {
        const r = deps.runner();
        if (!r) throw new Error("runner is not available");
        await r.send(f.taskId, f.text);
        return;
      }
      case "task_action": {
        const card = tasks.get(f.taskId);
        if (!card) throw new Error(`unknown task ${f.taskId}`);
        const r = deps.runner();
        if (f.action === "interrupt") {
          if (!r) throw new Error("runner is not available");
          await r.interrupt(f.taskId);
        } else if (f.action === "drop") {
          await r?.drop(f.taskId);
          const now = tasks.get(f.taskId)!;
          if (now.attention !== "dropped") tasks.setState(f.taskId, "dropped", now.residency, "Dropped by user");
        } else if (f.action === "reopen") {
          tasks.setState(f.taskId, "working", card.residency, "Reopened by user");
        }
        return;
      }
      case "read":
        log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: f.upToSeq } });
        return;
      case "task_history": {
        const stream = taskStream(f.taskId);
        ws.data.watching.add(stream);
        const events = log.read({ stream, beforeSeq: f.beforeSeq, limit: Math.min(f.limit ?? 200, 2000) });
        send(ws, { t: "task_history", taskId: f.taskId, events });
        return;
      }
      default:
        throw new Error(`unknown frame ${(f as { t?: string }).t}`);
    }
  };

  return {
    newData: (): WsData => ({ live: false, watching: new Set(), buf: [], onHandDirty: false }),
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        sockets.add(ws);
      },
      close(ws: ServerWebSocket<WsData>) {
        sockets.delete(ws);
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
    stop() {
      unsubscribe();
      if (flushTimer) clearTimeout(flushTimer);
      for (const ws of sockets) ws.close(1001, "shutting down");
    },
  };
}
