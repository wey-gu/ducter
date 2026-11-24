// D312: a second partner answers. Two pieces:
//
// 1. whose (createWhose): which partner an event belongs to, and where core's own writes to the
//    conversation go. Every core module still writes to "channel"; with more than one partner the
//    Log's append routes such a write to the conversation of the partner it is for: a task's (its
//    card's persona), a question's, a wait's, a call's or a routine's (the partner that started
//    it: its first event was in that partner's conversation), or the partner whose tool call core
//    is handling (acting.ts). Anything else stays the default's (proactive notes, chat apps, the
//    first words, the home's own questions).
//
// 2. partnerView: the core a second partner's session runs on (createPartner(view, runner)). It
//    reads and writes "channel" and "partner" as its own streams (channel:<id>, partner:<id>), sees
//    only its own tasks, conversation and waits, registers its tools on its own partner role, and
//    keeps its own digests, activity and memory port. The default partner keeps the core itself.
import type { LogEvent, TaskCard } from "@ducter/protocol";
import type { AppendInput, CoreApi, LogStore, MemIdentity, SpineStore, TaskMemoryPort, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { DEFAULT_PARTNER, channelOf, partnerOfStream } from "@ducter/protocol/src/partners.ts";
import { actingPersona } from "./acting.ts";
import type { CoreMcpHub } from "./mcp.ts";

/** Body fields that tie later events to the partner whose conversation the first one was in. */
const KEYS = ["decisionId", "waiterId", "callId", "routineId", "noteId"] as const;
/** The kinds that carry those keys, read once at start (a restart keeps routing). */
const KEYED_KINDS = ["decision", "waiter", "phone_call", "routine", "finds", "connection_call"] as const;

export interface Whose {
  /** The partner an event is for: another partner's id, or DEFAULT_PARTNER. */
  ofEvent(e: LogEvent): string;
  /** The partner a task is for. */
  ofTask(taskId: string | undefined): string;
  /** Where a write goes: a write to "channel" that belongs to another partner goes to its conversation. */
  route<K extends AppendInput>(input: K): K;
  /** Learns the keys of an event just written (wired to the Log's subscribe). */
  learn(e: LogEvent): void;
}

export function createWhose(o: { log: LogStore; tasks: Pick<TaskRegistry, "get">; isOther: (id: string | undefined) => boolean }): Whose {
  const keys = new Map<string, string>(); // `${field}:${value}` -> another partner's id
  const ofTask = (taskId: string | undefined): string => {
    const p = taskId ? o.tasks.get(taskId)?.persona : undefined;
    return o.isOther(p) ? p! : DEFAULT_PARTNER;
  };
  const ofStream = (stream: string): string | undefined => {
    const conv = partnerOfStream(stream);
    if (conv !== undefined) return o.isOther(conv) ? conv : DEFAULT_PARTNER;
    if (stream === "partner") return DEFAULT_PARTNER;
    if (stream.startsWith("partner:")) return o.isOther(stream.slice(8)) ? stream.slice(8) : DEFAULT_PARTNER;
    if (stream.startsWith("task:")) return ofTask(stream.slice(5));
    return undefined;
  };
  /** Another partner named by a body's task or keys; undefined: none (the default's, or nobody's). */
  const ofBody = (body: unknown): string | undefined => {
    if (!body || typeof body !== "object") return undefined;
    const b = body as Record<string, unknown>;
    if (typeof b.taskId === "string") {
      const t = ofTask(b.taskId);
      if (t !== DEFAULT_PARTNER) return t;
      if (o.tasks.get(b.taskId)) return undefined; // the default's task
    }
    if (o.isOther(b.persona as string | undefined) && typeof b.routineId === "string") return b.persona as string;
    for (const k of KEYS) {
      const v = b[k];
      if (typeof v === "string") {
        const p = keys.get(`${k}:${v}`);
        if (p) return p;
      }
    }
    return undefined;
  };
  const learn = (e: LogEvent) => {
    const b = e.body as Record<string, unknown> | undefined;
    if (!b || typeof b !== "object") return;
    const owner = e.kind === "routine" ? (o.isOther(b.persona as string) ? (b.persona as string) : undefined) : (() => {
      const s = ofStream(e.stream);
      return s && s !== DEFAULT_PARTNER ? s : undefined;
    })();
    if (!owner) return;
    for (const k of KEYS) if (typeof b[k] === "string") keys.set(`${k}:${b[k]}`, owner);
  };
  for (const e of o.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: [...KEYED_KINDS] })) learn(e);

  return {
    ofTask,
    ofEvent(e) {
      const s = ofStream(e.stream);
      if (s !== undefined) return s;
      if (e.kind === "routine") return o.isOther((e.body as { persona?: string }).persona) ? (e.body as { persona: string }).persona : DEFAULT_PARTNER;
      return ofBody(e.body) ?? (o.isOther(e.persona) ? e.persona : DEFAULT_PARTNER);
    },
    route(input) {
      if (input.stream !== "channel") return input;
      // D486: words passed on by another partner are for the conversation they were addressed to.
      if ((input.body as { passed?: unknown } | undefined)?.passed) return input;
      const acting = actingPersona();
      const owner = ofBody(input.body) ?? (o.isOther(acting) ? acting : undefined);
      if (!owner) return input;
      return { ...input, stream: channelOf(owner), persona: input.persona ?? owner };
    },
    learn,
  };
}

/** An event as another partner's session sees it: its own conversation as "channel", its own stream as "partner". */
export function asSeenBy<E extends LogEvent>(id: string, e: E): E {
  if (e.stream === channelOf(id)) return { ...e, stream: "channel" };
  if (e.stream === `partner:${id}`) return { ...e, stream: "partner" };
  return e;
}

/** D312: a second partner's digests, kept in the one spine table under ids of its own (`<id>/S0001`). */
export function scopedSpine(spine: SpineStore, persona: string): SpineStore {
  const pre = `${persona}/`;
  return {
    list: () => spine.list().filter((r) => r.id.startsWith(pre)).map((r) => ({ ...r, id: r.id.slice(pre.length) })),
    freeze: (r) => {
      const rec = spine.freeze({ ...r, id: pre + r.id });
      return { ...rec, id: r.id };
    },
    attempt: (a) => spine.attempt({ ...a, writer: `${persona}:${a.writer}` }),
    attempts: (limit) => spine.attempts(limit),
    recalled: (r) => spine.recalled(r),
  };
}

export interface PartnerViewOptions {
  core: CoreApi;
  id: string;
  whose: Whose;
  mcp: CoreMcpHub;
  /** The partner's name now (a rename shows at its next session). */
  name: () => string;
  /** Its L1 identity text. */
  identity: () => string;
  /** Its own Mem identity, once bound (D18, D141). */
  mem: () => MemIdentity | undefined;
  /** What it is doing while the person waits: to the sockets showing it only. */
  activity: CoreApi["activity"];
  /** Its memory for its own tasks (createPartner sets it). */
  setTaskMemory: (port: TaskMemoryPort | undefined) => void;
}

/** The core as another partner's session sees it. */
export function partnerView(o: PartnerViewOptions): CoreApi {
  const { core, id, whose } = o;
  const conv = channelOf(id);
  const own = `partner:${id}`;
  const raw = core.log;
  const toRaw = (s: string | undefined) => (s === "channel" ? conv : s === "partner" ? own : s);
  const fromRaw = <E extends LogEvent>(e: E): E => (e.stream === conv ? { ...e, stream: "channel" } : e.stream === own ? { ...e, stream: "partner" } : e);
  const mine = (e: LogEvent) => whose.ofEvent(e) === id;
  /** A stream read by name: another partner's conversation or task is none of its business. */
  const readable = (s: string) => {
    if (s === conv || s === own) return true;
    if (partnerOfStream(s) !== undefined || s === "partner" || s.startsWith("partner:")) return false;
    if (s.startsWith("task:")) return whose.ofTask(s.slice(5)) === id;
    return true;
  };
  const log: LogStore = {
    append(input) {
      const s = toRaw(input.stream)!;
      return fromRaw(raw.append({ ...input, stream: s, persona: input.persona ?? id }));
    },
    read(q) {
      const s = toRaw(q.stream);
      if (s !== undefined) return readable(s) ? raw.read({ ...q, stream: s }).map(fromRaw) : [];
      return raw.read(q).filter(mine).map(fromRaw);
    },
    search(query, q) {
      const s = toRaw(q?.stream);
      if (s !== undefined) return readable(s) ? raw.search(query, { ...q, stream: s }).map(fromRaw) : [];
      return raw.search(query, q).filter(mine).map(fromRaw);
    },
    head: () => raw.head(),
    subscribe: (fn) => raw.subscribe((e) => (mine(e) ? fn(fromRaw(e)) : undefined)),
  };
  const ownTask = (c: TaskCard | undefined) => (c && whose.ofTask(c.taskId) === id ? c : undefined);
  const tasks: TaskRegistry = {
    get: (t) => ownTask(core.tasks.get(t)),
    list: () => core.tasks.list().filter((c) => whose.ofTask(c.taskId) === id),
    onHand: () => core.tasks.onHand(),
    setState: (t, a, r, why) => core.tasks.setState(t, a, r, why),
  };
  const settings = core.settings && {
    get: () => core.settings!.get(),
    // Forgetting, correcting and the trusted agents are the default's (Settings › 伙伴), for now.
    setForgetter: () => {},
    setCorrector: () => {},
    setMemState: (s: "connected" | "missing") => core.settings!.setMemState(s),
  };
  let taskMemory: TaskMemoryPort | undefined;
  const view: CoreApi = {
    log,
    tasks,
    mcp: o.mcp.forPersona(id),
    persona: {
      id,
      get name() {
        return o.name();
      },
      get identity() {
        return o.identity();
      },
      get mem() {
        return o.mem();
      },
    } as CoreApi["persona"],
    dataDir: core.dataDir,
    ...(core.workers ? { workers: core.workers } : {}),
    ...(settings ? { settings } : {}),
    ...(core.partnerFallback ? { partnerFallback: () => core.partnerFallback!() } : {}),
    // D435: one hold per agent account, whichever partner's turn found it out.
    ...(core.brainHold ? { brainHold: core.brainHold } : {}),
    ...(core.bodies ? { bodies: core.bodies } : {}),
    ...(core.connections ? { connections: core.connections } : {}),
    ...(o.activity ? { activity: o.activity } : {}),
    ...(core.spine ? { spine: scopedSpine(core.spine, id) } : {}),
    ...(core.browser ? { browser: core.browser } : {}),
    ...(core.phone ? { phone: core.phone } : {}),
    ...(core.memPluginIn ? { memPluginIn: core.memPluginIn } : {}),
    ...(core.media ? { media: core.media } : {}),
    ...(core.limits ? { limits: core.limits } : {}),
    // D368: the person's day's focus is theirs, whichever partner they talk to.
    ...(core.workingMemory ? { workingMemory: core.workingMemory } : {}),
    // D380: a quick web look holds nothing of either partner's, so they share the one service.
    ...(core.webLook ? { webLook: core.webLook } : {}),
    // D486: the person's computers, their agents, the code on each and the agents' limits are the
    // person's, so every partner's [devices] line says the same.
    ...(core.homeDevice ? { homeDevice: () => core.homeDevice!() } : {}),
    ...(core.codeOn ? { codeOn: () => core.codeOn!() } : {}),
    // D538: the person's computer rules and the heavy work on each computer are the household's, not one partner's.
    ...(core.placement ? { placement: () => core.placement!() } : {}),
    ...(core.agentLimits ? { agentLimits: () => core.agentLimits!() } : {}),
    // D486: who the person's partners are, as this one sees them.
    ...(core.partnersNow ? { partnersNow: () => ({ ...core.partnersNow!(), me: id }) } : {}),
    // Bridge is the default's own connection (D205): a second partner has none yet.
    // Events it is handed carry its own streams as "channel" and "partner".
    mine: { event: (e) => mine(e.stream === "channel" ? { ...e, stream: conv } : e.stream === "partner" ? { ...e, stream: own } : e), task: (c) => whose.ofTask(c.taskId) === id },
  };
  Object.defineProperty(view, "taskMemory", {
    enumerable: true,
    get: () => taskMemory,
    set: (p: TaskMemoryPort | undefined) => {
      taskMemory = p;
      o.setTaskMemory(p);
    },
  });
  return view;
}
