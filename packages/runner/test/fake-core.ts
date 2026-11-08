// Minimal in-memory CoreApi for runner tests (core itself is W1).
import type { Attention, Bodies, EventKind, LogEvent, OnHand, Residency, TaskCard } from "@ducter/protocol";
import type { AppendInput, CoreApi, ToolHandler } from "@ducter/protocol/src/internal.ts";

export interface FakeCore extends CoreApi {
  events: LogEvent[];
  tools: Map<string, { role: string; description: string; inputSchema: object; handler: ToolHandler }>;
  call(name: string, args: unknown, taskId: string): Promise<unknown>;
  states(taskId: string): string[];
  setMcpUrl(url: string): void;
}

export function createFakeCore(dataDir: string): FakeCore {
  const events: LogEvent[] = [];
  const subs = new Set<(e: LogEvent) => void>();
  const cards = new Map<string, TaskCard>();
  const tools: FakeCore["tools"] = new Map();
  let mcpUrl = "http://127.0.0.1:0/mcp";

  const fold = (e: LogEvent) => {
    if (e.kind === "task_open") {
      const b = e.body as Bodies["task_open"];
      cards.set(b.taskId, {
        taskId: b.taskId, persona: e.persona, title: b.title, project: b.project, place: b.place, harness: b.harness,
        model: b.model, attention: "queued", residency: "provisioning", openedAt: e.ts, updatedAt: e.ts,
      });
    } else if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      const c = cards.get(b.taskId);
      if (c) Object.assign(c, { attention: b.attention, residency: b.residency, reason: b.reason, updatedAt: e.ts });
    } else if (e.kind === "report") {
      const b = e.body as Bodies["report"];
      const c = cards.get(b.taskId);
      if (c) c.lastReport = b;
    }
  };

  const log: CoreApi["log"] = {
    append<K extends EventKind>(i: AppendInput<K>): LogEvent<K> {
      const e: LogEvent<K> = {
        seq: events.length + 1, ts: new Date().toISOString(), persona: i.persona ?? "p1", stream: i.stream,
        origin: i.origin, kind: i.kind, body: i.body, supersedes: i.supersedes,
      };
      events.push(e as LogEvent);
      fold(e as LogEvent);
      for (const s of subs) s(e as LogEvent);
      return e;
    },
    read(o) {
      return events.filter((e) => (!o.stream || e.stream === o.stream) && (!o.kinds || o.kinds.includes(e.kind))).slice(0, o.limit ?? 1e9);
    },
    search(q) {
      return events.filter((e) => JSON.stringify(e.body).includes(q));
    },
    head: () => events.length,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };

  const core: FakeCore = {
    log,
    tasks: {
      get: (id) => cards.get(id),
      list: () => [...cards.values()],
      onHand: (): OnHand => ({ tasks: [...cards.values()], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 } }),
      setState(taskId: string, attention: Attention, residency: Residency, reason?: string) {
        log.append({ persona: cards.get(taskId)?.persona, stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency, reason } });
      },
    },
    mcp: {
      register(role, name, description, inputSchema, handler) {
        tools.set(name, { role, description, inputSchema, handler });
      },
      configFor(role) {
        const token = typeof role === "string" ? "partner-token" : `task-token-${role.taskId}`;
        return { name: "ducter", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } };
      },
    },
    persona: { id: "p1", name: "Ducter", identity: "" },
    dataDir,
    events,
    tools,
    async call(name, args, taskId) {
      const t = tools.get(name);
      if (!t) throw new Error(`no tool ${name}`);
      return t.handler(args, { role: "task", taskId });
    },
    states(taskId) {
      return events
        .filter((e) => e.kind === "task_state" && (e.body as any).taskId === taskId)
        .map((e) => `${(e.body as any).attention}/${(e.body as any).residency}`);
    },
    setMcpUrl(url) {
      mcpUrl = url;
    },
  };
  return core;
}

export async function waitFor<T>(fn: () => T | undefined | false, label: string, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
