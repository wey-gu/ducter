// Test fakes: an in-memory core and a scripted HarnessPort / Runner.
import type { EventKind, LogEvent, Place, TaskCard } from "../../protocol/src/index.ts";
import type {
  AppendInput,
  CoreApi,
  HarnessEvent,
  HarnessPort,
  HarnessSession,
  Runner,
  SessionSpec,
  ToolHandler,
} from "../../protocol/src/internal.ts";

export class FakeClock {
  t = Date.parse("2026-11-08T14:00:00Z");
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

export function fakeCore(clock: FakeClock, dataDir: string) {
  const events: LogEvent[] = [];
  const subs = new Set<(e: LogEvent) => void>();
  const cards = new Map<string, TaskCard>();
  const tools = new Map<string, { description: string; schema: object; handler: ToolHandler }>();
  const core: CoreApi = {
    dataDir,
    persona: { id: "p1", name: "Ducter", identity: "IDENTITY-L1: Weyl's partner. Likes short answers." },
    log: {
      append<K extends EventKind>(e: AppendInput<K>): LogEvent<K> {
        const ev: LogEvent<K> = {
          seq: events.length + 1,
          ts: new Date(clock.now()).toISOString(),
          persona: e.persona ?? "p1",
          stream: e.stream,
          origin: e.origin,
          kind: e.kind,
          body: e.body,
          ...(e.supersedes !== undefined ? { supersedes: e.supersedes } : {}),
        };
        events.push(ev as LogEvent);
        for (const s of subs) s(ev as LogEvent);
        return ev;
      },
      read(o) {
        let r = events.filter(
          (e) =>
            (!o.stream || e.stream === o.stream) &&
            (!o.kinds || o.kinds.includes(e.kind)) &&
            (o.fromSeq === undefined || e.seq >= o.fromSeq) &&
            (o.beforeSeq === undefined || e.seq < o.beforeSeq),
        );
        if (o.limit !== undefined) r = o.beforeSeq !== undefined ? r.slice(-o.limit) : r.slice(0, o.limit);
        return r;
      },
      search: (q) => events.filter((e) => JSON.stringify(e.body).includes(q)),
      head: () => events.length,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
    },
    tasks: {
      get: (id) => cards.get(id),
      list: () => [...cards.values()],
      onHand: () => ({ tasks: [...cards.values()], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 } }),
      setState(id, attention, residency) {
        const c = cards.get(id);
        if (c) Object.assign(c, { attention, residency });
      },
    },
    mcp: {
      register(role, name, description, schema, handler) {
        tools.set(`${role}:${name}`, { description, schema, handler });
      },
      configFor: (role) => ({ name: "ducter", url: "http://127.0.0.1:7777/mcp", headers: { authorization: `Bearer ${typeof role === "string" ? role : role.taskId}` } }),
    },
  };
  const callTool = (name: string, args: unknown) => {
    const t = tools.get(`partner:${name}`);
    if (!t) throw new Error(`no tool ${name}`);
    return t.handler(args, { role: "partner" });
  };
  return { core, events, cards, tools, callTool };
}

class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private ended = false;
  push(v: T) {
    const w = this.waiters.shift();
    if (w) w({ value: v, done: false });
    else this.items.push(v);
  }
  end() {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }
  iterator(): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.ended) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((res) => this.waiters.push(res));
      },
    };
  }
}

export type Script = (input: string, s: FakeSession, turnIndex: number) => Promise<void> | void;

export class FakeSession implements HarnessSession {
  q = new AsyncQueue<HarnessEvent>();
  inputs: string[] = [];
  closed = false;
  constructor(
    public id: string,
    public spec: SessionSpec,
    private script: Script,
    private counter: { n: number },
  ) {}
  emit(ev: HarnessEvent) {
    this.q.push(ev);
  }
  say(text: string) {
    this.emit({ role: "assistant", text });
  }
  end() {
    this.emit({ role: "system", turnEnd: true });
  }
  async send(text: string) {
    this.inputs.push(text);
    await this.script(text, this, this.counter.n++);
  }
  async interrupt() {}
  async close() {
    this.closed = true;
    this.q.end();
  }
  events(): AsyncIterable<HarnessEvent> {
    const it = this.q.iterator();
    return { [Symbol.asyncIterator]: () => it };
  }
}

export function fakeRunner(script: Script) {
  const sessions: FakeSession[] = [];
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  const sent: { taskId: string; text: string; mode?: string }[] = [];
  const counter = { n: 0 };
  let cardsRef: Map<string, TaskCard> | null = null;
  const harness: HarnessPort = {
    async start(spec) {
      const s = new FakeSession(spec.resumeSessionId ?? `sess-${sessions.length + 1}`, spec, script, counter);
      sessions.push(s);
      return s;
    },
    available: async () => [{ harness: "claude-code", installed: true, loggedIn: true }],
  };
  const runner: Runner = {
    harness,
    async openTask(input) {
      opened.push(input);
      const card: TaskCard = {
        taskId: `t${opened.length}`,
        persona: input.persona,
        title: input.title,
        project: input.project ?? "",
        place: input.place ?? ({ kind: "none" } as Place),
        harness: input.harness ?? "claude-code",
        attention: "working",
        residency: "hot",
        updatedAt: new Date().toISOString(),
      };
      cardsRef?.set(card.taskId, card);
      return card;
    },
    async send(taskId, text, mode) {
      sent.push({ taskId, text, mode });
      return { delivered: "steered" };
    },
    async interrupt() {},
    async drop() {},
  };
  return {
    runner,
    sessions,
    opened,
    sent,
    bindCards(m: Map<string, TaskCard>) {
      cardsRef = m;
    },
  };
}
