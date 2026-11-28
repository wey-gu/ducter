// Test fakes: an in-memory core and a scripted HarnessPort / Runner.
import type { EventKind, LogEvent, Place, TaskCard } from "../../protocol/src/index.ts";
import { aboutHits, type MemoryAdd, type MemoryClient, type ThreadHit } from "../src/memory.ts";
import { createHandoffs } from "../../core/src/handoffs.ts";
import type {
  AppendInput,
  CoreApi,
  HarnessEvent,
  HarnessPort,
  HarnessSession,
  Runner,
  SendImage,
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
      setState(id, attention, residency, reason, _cant, waitsFor) {
        const c = cards.get(id);
        if (!c) return;
        c.attention = attention;
        c.residency = residency;
        c.reason = reason;
        if (waitsFor) c.waitsFor = waitsFor;
        else delete c.waitsFor;
      },
    },
    mcp: {
      register(role, name, description, schema, handler) {
        tools.set(`${role}:${name}`, { description, schema, handler });
      },
      configFor: (role) => ({ name: "ducter", url: "http://127.0.0.1:7777/mcp", headers: { authorization: `Bearer ${typeof role === "string" ? role : role.taskId}` } }),
    },
  };
  // D609: the one hand-off record every door in these tests goes through, over the fake Log.
  (core as { handoffs?: unknown }).handoffs = createHandoffs({
    log: core.log,
    helper: (id) => (core as { helpers?: { get(id: string): never } }).helpers?.get(id),
    now: clock.now,
    tellTask: async () => true,
    tellAgent: async () => true,
    backfill: false,
  });
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
  /** D206: the pictures each input carried (undefined: none). */
  images: (SendImage[] | undefined)[] = [];
  readonly canSteer = true;
  busy() {
    return false;
  }
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
  async send(text: string, _mode?: string, images?: SendImage[]) {
    this.inputs.push(text);
    this.images.push(images);
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
  const sent: { taskId: string; text: string; mode?: string; media?: import("../../protocol/src/index.ts").MediaRef[] }[] = [];
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
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      cardsRef?.set(card.taskId, card);
      return card;
    },
    async send(taskId, text, mode, _from, _clientId, media) {
      sent.push({ taskId, text, mode, ...(media ? { media } : {}) });
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

/** D563: what a Mem that can't be used answers, as the real client says it: none on the home (`true`), signed out, or switched off. */
function downResult(down: true | "signed_out" | "off" | "unreachable") {
  // D590: Mem there and signed in, but not answering (the real client's "unavailable").
  if (down === "unreachable") return { ok: false as const, reason: "unavailable" as const, message: "Nowledge Mem didn't answer (timed out)." };
  if (down === "signed_out") return { ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't connected.", why: "signed_out" as const };
  if (down === "off") return { ok: false as const, reason: "not_configured" as const, message: "Memory is off for this partner.", why: "off" as const };
  return { ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't installed on this machine.", why: "missing" as const };
}

/** In-memory stand-in for Nowledge Mem: tests never reach the user's real Mem. */
export function fakeMemory(seed: { id?: string; title: string; content: string; date?: string; kind?: string; source?: string }[] = [], opts: { down?: boolean | "signed_out" | "off" | "unreachable"; threads?: ThreadHit[] } = {}) {
  const searches: { query: string; limit: number }[] = [];
  const threadSearches: { query: string; limit: number }[] = [];
  const added: MemoryAdd[] = [];
  const abouts: number[] = [];
  const archived: string[] = [];
  // D304: every seeded memory has Mem's id and source (the person's words to Ducter by default).
  const all = seed.map((m, i) => ({ ...m, id: m.id ?? `mem-seed-${i + 1}`, source: m.source ?? "ducter" }));
  const memory: MemoryClient = {
    async search(query, limit) {
      searches.push({ query, limit });
      if (opts.down) return downResult(opts.down);
      const words = query.toLowerCase().split(/[\s,，。]+/).filter(Boolean);
      const score = (m: (typeof all)[number]) => words.filter((w) => `${m.title} ${m.content}`.toLowerCase().includes(w)).length;
      const hits = all.filter((m) => score(m) > 0).sort((a, b) => score(b) - score(a));
      return { ok: true, hits: (hits.length ? hits : all).slice(0, limit) };
    },
    // D368 (G3): the person's past conversations with other tools, matched by any query word.
    async threads(query, limit) {
      threadSearches.push({ query, limit });
      if (opts.down) return downResult(opts.down);
      const words = query.toLowerCase().split(/[\s,，。]+/).filter(Boolean);
      const ts = (opts.threads ?? []).filter((t) => words.some((w) => `${t.title} ${t.lines.map((l) => l.text).join(" ")}`.toLowerCase().includes(w)));
      return { ok: true, threads: ts.slice(0, limit) };
    },
    // D444: what Mem knows about the person, by D321's rule (preferences from anyone; decisions and facts only theirs).
    async about() {
      abouts.push(1);
      if (opts.down) return downResult(opts.down);
      const hits = (["preference", "decision", "fact"] as const).flatMap((k) => aboutHits(all.filter((m) => m.kind === k).map((m) => ({ ...m, created_at: m.date })), k));
      return { ok: true, hits };
    },
    // D329, D444: an undone save is archived (taken back by a tap or by 别记这个).
    async archive(id) {
      if (opts.down) return false;
      archived.push(id);
      return true;
    },
    async add(m) {
      if (opts.down) return downResult(opts.down);
      added.push(m);
      return { ok: true, id: `mem-${added.length}` };
    },
  };
  return { memory, searches, added, threadSearches, abouts, archived };
}
