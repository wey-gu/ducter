// The partner's settings (D71): the Partner page and the phone's Settings sheet read and change
// them over the client socket. Each lives where it already lived, so the CLI and the phone's own
// endpoints keep working: the name in persona.json (read by every `ducter up`), notifications
// and quiet hours in push.json (push.ts), the rest in settings.json.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, MemItem, MemView, PeersSettings, QuietHours, Settings, SettingsPatch, TalkLanguage } from "@ducter/protocol";
import { FIRST_MEETS, isFirstMeet, DEFAULT_AFTER_CHOICES, DEFAULT_PROACTIVE, HARNESSES, PROACTIVE_MODES, isHarnessId, normalizeTag, type Brain, type HarnessId, type ProactiveMode } from "@ducter/protocol";
import type { LogStore, MemIdentity, SettingsApi } from "@ducter/protocol/src/internal.ts";
import { resolveWindows, type WindowsInput } from "@ducter/protocol/src/harness-facts.ts";
import type { PushStore } from "./push.ts";

export const SETTINGS_FILE = "settings.json";
export const PERSONA_FILE = "persona.json";
const NOTED_SHOWN = 12;
const HIDDEN_MAX = 500;

/** D321: what the Mem glance does for the page's own rows (mem-glance.ts). */
export interface GlanceOps {
  forgot(id: string): void;
  fixed(id: string, title: string): void;
  find(q: string): Promise<MemItem[] | undefined>;
}

interface SettingsFile {
  language?: TalkLanguage;
  memory?: boolean;
  defaultAfterMin?: number;
  /** D85: what the partner thinks with, and which accounts tasks may use. */
  brain?: Brain;
  taskAccounts?: Partial<Record<HarnessId, { enabled: boolean }>>;
  /** D135: context windows, in tokens (env DUCTER_PARTNER_* / DUCTER_TASK_* override them). */
  windows?: WindowsInput;
  /** 记下了 lines forgotten here, by seq (Mem forgot them, or they are only hidden); D304: 想起了 lines too. */
  hidden?: number[];
  /** D304: 记下了 lines the person said are right (这周记下的), by seq. */
  confirmed?: number[];
  /** D304: 记下了 lines the person corrected, by seq: their words now. */
  corrected?: Record<string, string>;
  /** D329: 记下了 lines taken back with 撤销 / Undo, by seq. */
  undone?: number[];
  /** D148: update at night (off by default). */
  autoUpdate?: boolean;
  /** D165: when it notices something (D250: absent = never chosen = DEFAULT_PROACTIVE). */
  proactive?: ProactiveMode;
  /** D250: who set it (absent with a mode: set before D250, source unknown). */
  proactiveBy?: "chosen" | "keep_note";
  /** D170: who of the user's other agents may reach the partner; learned rules; muted senders. */
  peers?: PeersSettings;
  /** D297: hand a task to another signed-in agent at once when a usage limit runs out (off by default). */
  limitHandoff?: boolean;
  /** D298: false after 别再看了 / Stop looking: the first words never read the person's own agents' records. */
  localAgents?: boolean;
  /** D451: the first-time lines already met, on any device. */
  met?: string[];
}

/** A list of agent names as kept: trimmed, one line, at most 80 characters, 50 names, no repeats. */
const agentList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().replace(/\s+/g, " ").slice(0, 80)).filter(Boolean))].slice(0, 50) : undefined;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One line, no control characters, at most 24 characters (as cleanName in the CLI's firstrun.ts). */
export function cleanName(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return [...s].slice(0, 24).join("");
}

export interface SettingsStore extends SettingsApi {
  view(): Promise<{ settings: Settings; mem: MemView }>;
  /** Applies a patch; unknown or invalid fields are ignored. Returns what changed. A mode in a patch is the person's choice (D250). */
  set(patch: SettingsPatch): string[];
  /** D298: may the first words look at this computer's AI agents' own records (on unless the person said no). */
  localAgents(): boolean;
  setLocalAgents(on: boolean): void;
  /** D298: a pasted key's brain, only when nothing was chosen (the person's own choice stays). */
  brainFromKey(harness: HarnessId, model?: string): boolean;
  /** D250: the mode set by Ducter for a reason the person gave (不再需要 to the morning note). */
  setProactive(mode: ProactiveMode, by: "chosen" | "keep_note"): void;
  /** D295: the glance at Mem itself (mem-glance.ts), read on each view. */
  setGlance(fn: () => MemView["glance"], ops?: GlanceOps): void;
  /** D375: Mem's own health on the home (memory on and Mem connected), cached by its reader. */
  setHealth(fn: () => MemView["health"]): void;
  /** D321: Settings › 记忆's own rows, by Mem's id: forget one in Mem; fix its words in Mem. True when Mem did. */
  forgetMem(id: string): Promise<boolean>;
  fixMem(id: string, title: string): Promise<boolean>;
  /** D321: search Mem for the page (titles only); undefined when Mem didn't answer. */
  findMem(q: string): Promise<MemItem[] | undefined>;
  /** Forgets one noted line (D304: or one 想起了 line's memory): in Mem when possible, else hidden here. */
  forget(seq: number): Promise<"mem" | "hidden" | undefined>;
  /** D329: 撤销 / Undo on a Noted line: true when the save was taken back (archived, or out of the outbox). */
  undo(seq: number): Promise<boolean>;
  setMemHooks(h: Parameters<NonNullable<import("@ducter/protocol/src/internal.ts").SettingsApi["setMemHooks"]>>[0]): void;
  memChanged(): void;
  /** D304: how many lines it noted in the 7 days before `at` that are still there (0 with memory off). */
  learnedThisWeek(at: number): number;
  /** D304: the person said a noted line is right. */
  confirm(seq: number): boolean;
  /** D304: the person corrected a noted line's words: in Mem when it has the id ("mem"), else only here. */
  correct(seq: number, title: string): Promise<"mem" | "here" | undefined>;
  onChange(fn: () => void): () => void;
  /** The persona's Mem identity was bound (D141): clients show whose name its memories are under. */
  memIdentityChanged(): void;
  /** D205: the persona's Bridge connection changed (bridge-link.ts): every settings frame again. */
  bridgeChanged(): void;
  /** Mem answered "not installed or not connected" the last time it was asked (D169: then nothing about its plugin shows). */
  memMissing(): boolean;
  /** D369: Mem's code when the partner's mailbox needs sorting out on Mem's side, else undefined. */
  bridgeTrouble(): { code: string } | undefined;
  /** A reversible decision's wait, from the setting. */
  defaultAfterMs(): number;
  /** The user (or DUCTER_PARTNER_HARNESS) chose what the partner thinks with; else it's the default. */
  brainChosen(): boolean;
}

export function openSettings(opts: {
  dataDir: string;
  log: LogStore;
  push: PushStore;
  persona: { name: string; identity: string; mem?: MemIdentity };
  /** DUCTER_MEMORY=off pins memory off for this run. */
  memoryPinnedOff?: boolean;
  /** DUCTER_PARTNER_HARNESS picks the brain until the user sets one (default process.env). */
  env?: Record<string, string | undefined>;
}): SettingsStore {
  const path = join(opts.dataDir, SETTINGS_FILE);
  let data: SettingsFile = {};
  if (existsSync(path)) {
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as SettingsFile;
    } catch (err) {
      console.warn(`[settings] ${path} is unreadable; using the defaults:`, (err as Error).message);
    }
  }
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());
  let forgetter: ((id: string) => Promise<boolean>) | undefined;
  let memHooks: Parameters<NonNullable<import("@ducter/protocol/src/internal.ts").SettingsApi["setMemHooks"]>>[0] | undefined;
  let glance: (() => MemView["glance"]) | undefined;
  let glanceOps: GlanceOps | undefined;
  let health: (() => MemView["health"]) | undefined;
  let memSeen: "connected" | "missing" | undefined;
  let bridgeTrouble: { code: string } | undefined; // D369: the partner's word, never saved
  // D135: checked once at start (env + file); a value out of range is said once, then its default runs.
  const windowsNow = () => resolveWindows(data.windows, opts.env ?? process.env);
  for (const p of windowsNow().problems) console.warn(`[settings] windows: ${p}`);

  const get = (): Settings => {
    const p = opts.push.settings();
    return {
      name: opts.persona.name,
      language: data.language ?? "auto",
      memory: !opts.memoryPinnedOff && data.memory !== false,
      ...(opts.memoryPinnedOff ? { memoryPinned: true } : {}),
      notify: !p.off,
      quiet: p.quiet,
      defaultAfterMin: data.defaultAfterMin ?? 30,
      brain: data.brain ?? defaultBrain(opts.env ?? process.env),
      ...(data.taskAccounts ? { taskAccounts: data.taskAccounts } : {}),
      windows: windowsNow().windows,
      autoUpdate: data.autoUpdate === true,
      ...(data.limitHandoff ? { limitHandoff: true } : {}),
      // D451: always sent (a client reads its absence as a home too old to keep it).
      met: FIRST_MEETS.filter((m) => data.met?.includes(m)),
      // D250: never chosen is the default (proactive with a morning note), said as such.
      ...(data.proactive ? { proactive: data.proactive, ...(data.proactiveBy ? { proactiveBy: data.proactiveBy } : {}) } : { proactive: DEFAULT_PROACTIVE, proactiveBy: "default" as const }),
      // D332: one switch; a stored "team" (D170) reads as on. D334: 答应 per sender.
      peers: { reach: (data.peers?.reach as string) === "off" ? "off" : "own", trusted: data.peers?.trusted ?? [], muted: data.peers?.muted ?? [], ...(data.peers?.allowed?.length ? { allowed: data.peers.allowed } : {}) },
    };
  };
  /** D170: a change to who may reach the partner, from a client or from the partner itself. */
  const setPeers = (p: Partial<PeersSettings> | undefined): boolean => {
    if (!p || typeof p !== "object") return false;
    const cur = get().peers!;
    const next: PeersSettings = {
      reach: p.reach === "off" ? "off" : p.reach === "own" || (p.reach as unknown) === "team" ? "own" : cur.reach,
      trusted: agentList(p.trusted) ?? cur.trusted,
      muted: agentList(p.muted) ?? cur.muted,
    };
    // D334: teammates' agents let through on their first message's card (kept only while there is one).
    const allowed = agentList(p.allowed) ?? cur.allowed ?? [];
    if (allowed.length) next.allowed = allowed;
    if (JSON.stringify(next) === JSON.stringify(cur)) return false;
    data.peers = next;
    return true;
  };

  const rename = (name: string) => {
    const old = opts.persona.name;
    if (!name || name === old) return false;
    opts.persona.name = name;
    // The identity names the partner; later sessions read the new one.
    opts.persona.identity = opts.persona.identity.split(old).join(name);
    const p = join(opts.dataDir, PERSONA_FILE);
    let prev: Record<string, unknown> = {};
    try {
      if (existsSync(p)) prev = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      /* rewritten below */
    }
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...prev, name, askedAt: prev.askedAt ?? new Date().toISOString() }, null, 2) + "\n");
    renameSync(tmp, p);
    return true;
  };

  const noted = (): MemView["noted"] => {
    const hidden = new Set(data.hidden ?? []);
    const confirmed = new Set(data.confirmed ?? []);
    const events = opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 200 });
    const out: MemView["noted"] = [];
    for (let i = events.length - 1; i >= 0 && out.length < NOTED_SHOWN; i--) {
      const e = events[i]!;
      if (hidden.has(e.seq)) continue;
      const b = e.body as Bodies["memory_noted"];
      const fixed = data.corrected?.[String(e.seq)];
      out.push({ seq: e.seq, title: fixed ?? b.title, at: e.ts, ...(b.memoryId ? { memoryId: b.memoryId } : {}), ...(confirmed.has(e.seq) ? { confirmed: true } : {}), ...(fixed ? { corrected: true } : {}) });
    }
    return out;
  };
  /** D304: the 想起了 lines forgotten (their seqs), so every client stops showing them. */
  const forgottenRecalls = (): number[] => {
    const hidden = new Set(data.hidden ?? []);
    if (!hidden.size) return [];
    return opts.log.read({ stream: "channel", kinds: ["memory_recalled"], limit: 500 }).filter((e) => hidden.has(e.seq)).map((e) => e.seq);
  };
  let corrector: ((id: string, title: string) => Promise<boolean>) | undefined;

  return {
    get,
    brainChosen: () => data.brain !== undefined || Boolean(envHarness((opts.env ?? process.env).DUCTER_PARTNER_HARNESS)),
    setForgetter(fn) {
      forgetter = fn;
    },
    setCorrector(fn) {
      corrector = fn;
    },
    setMemHooks(h) {
      memHooks = h;
    },
    memChanged: changed,
    async undo(seq) {
      // D329: 撤销 / Undo on a Noted line, no question asked (it is the undo): archived in Mem, or
      // taken out of the outbox while it waits; a memory it replaced comes back.
      const e = opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 1000 }).find((x) => x.seq === seq);
      if (!e || !memHooks) return false;
      if ((data.undone ?? []).includes(seq)) return true;
      const ok = await memHooks.undo(e.body as Bodies["memory_noted"]).catch((err) => (console.warn("[settings] undoing in Mem failed:", (err as Error).message), false));
      if (!ok) return false;
      data.undone = [...(data.undone ?? []), seq].slice(-HIDDEN_MAX);
      save();
      changed();
      return true;
    },
    setHealth(fn) {
      health = fn;
    },
    setGlance(fn, ops) {
      glance = fn;
      glanceOps = ops;
    },
    async forgetMem(id) {
      if (!forgetter || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return false;
      const ok = await forgetter(id).catch((err) => (console.warn("[settings] forgetting in Mem failed:", (err as Error).message), false));
      if (ok) glanceOps?.forgot(id);
      return ok;
    },
    async fixMem(id, title) {
      const words = title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!corrector || !words || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return false;
      const ok = await corrector(id, words).catch((err) => (console.warn("[settings] fixing in Mem failed:", (err as Error).message), false));
      if (ok) glanceOps?.fixed(id, words);
      return ok;
    },
    async findMem(q) {
      return glanceOps ? glanceOps.find(q) : undefined;
    },
    setBridgeTrouble(t) {
      if (t?.code === bridgeTrouble?.code) return;
      bridgeTrouble = t;
      changed();
    },
    bridgeTrouble: () => bridgeTrouble,
    setMemState(s) {
      if (s === memSeen) return;
      memSeen = s;
      changed();
    },
    setPeers(p) {
      if (!setPeers(p)) return;
      save();
      changed();
    },
    defaultAfterMs: () => get().defaultAfterMin * 60_000,
    localAgents: () => data.localAgents !== false,
    setLocalAgents(on) {
      if ((data.localAgents !== false) === on) return;
      if (on) delete data.localAgents;
      else data.localAgents = false;
      save();
      changed();
    },
    brainFromKey(harness, model) {
      if (data.brain !== undefined || !HARNESSES[harness]?.partner) return false;
      data.brain = { harness, ...(model ? { model } : {}) };
      save();
      changed();
      return true;
    },
    memMissing: () => memSeen === "missing",
    async view() {
      const s = get();
      const state: MemView["state"] = !s.memory ? "off" : memSeen ?? (forgetter ? "connected" : "missing");
      // An identity Ducter enrolled carries the partner's name (kept in step on rename, D141).
      const m = opts.persona.mem;
      const keptUnder = state === "connected" && m ? (m.owned ? opts.persona.name : m.label || m.agentId) : undefined;
      const g = state !== "off" ? glance?.() : undefined;
      const h = state === "connected" ? health?.() : undefined;
      const forgotten = forgottenRecalls();
      const undone = data.undone ?? [];
      const keys = memHooks?.waiting() ?? new Set<string>();
      const waiting = keys.size ? opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 500 }).filter((x) => keys.has(String((x.body as Bodies["memory_noted"]).waiting ?? "")) && !undone.includes(x.seq)).map((x) => x.seq) : [];
      return { settings: s, mem: { state, noted: noted(), ...(forgotten.length ? { forgotten } : {}), ...(undone.length ? { undone } : {}), ...(waiting.length ? { waiting } : {}), ...(keptUnder ? { keptUnder } : {}), ...(g ? { glance: g } : {}), ...(h ? { health: h } : {}) } };
    },
    set(patch) {
      const did: string[] = [];
      if (typeof patch.name === "string") {
        const n = cleanName(patch.name);
        if (rename(n)) did.push("name");
      }
      // D292: "auto" or any language, stored as its canonical tag (zh-TW → zh-Hant); junk is refused.
      const language: TalkLanguage | undefined = patch.language === "auto" ? "auto" : typeof patch.language === "string" ? normalizeTag(patch.language) : undefined;
      if (language) {
        if ((data.language ?? "auto") !== language) (data.language = language), did.push("language");
      }
      if (typeof patch.memory === "boolean" && !opts.memoryPinnedOff) {
        if ((data.memory !== false) !== patch.memory) (data.memory = patch.memory), did.push("memory");
      }
      // D250: a mode from a client is the person's choice, even the one already on (it settles a default).
      if (typeof patch.proactive === "string" && (PROACTIVE_MODES as readonly string[]).includes(patch.proactive) && (data.proactive !== patch.proactive || data.proactiveBy !== "chosen"))
        (data.proactive = patch.proactive), (data.proactiveBy = "chosen"), did.push("proactive");
      if (typeof patch.autoUpdate === "boolean" && (data.autoUpdate === true) !== patch.autoUpdate) (data.autoUpdate = patch.autoUpdate), did.push("autoUpdate");
      if (typeof patch.limitHandoff === "boolean" && (data.limitHandoff === true) !== patch.limitHandoff) (data.limitHandoff = patch.limitHandoff), did.push("limitHandoff");
      // D451: names are added, never removed by a patch; an empty list starts them all over.
      if (Array.isArray(patch.met)) {
        const had = data.met ?? [];
        const next = patch.met.length ? [...new Set([...had, ...patch.met.filter(isFirstMeet)])] : [];
        if (next.length !== had.length) (data.met = next), did.push("met");
      }
      if (setPeers(patch.peers as Partial<PeersSettings> | undefined)) did.push("peers");
      if (typeof patch.defaultAfterMin === "number" && (DEFAULT_AFTER_CHOICES as readonly number[]).includes(patch.defaultAfterMin)) {
        if ((data.defaultAfterMin ?? 30) !== patch.defaultAfterMin) (data.defaultAfterMin = patch.defaultAfterMin), did.push("defaultAfterMin");
      }
      // The brain: only a harness that can be the partner (v1: Claude Code, Codex). A model names
      // one harness's catalog, so a new harness without a model starts on its own default.
      const b = patch.brain as Partial<Brain> | undefined;
      if (b && typeof b === "object" && isHarnessId(b.harness) && HARNESSES[b.harness].partner) {
        const model = typeof b.model === "string" && b.model.trim() ? b.model.trim().slice(0, 120) : undefined;
        const next: Brain = { harness: b.harness, ...(model ? { model } : {}) };
        const cur = get().brain;
        if (cur.harness !== next.harness || cur.model !== next.model) (data.brain = next), did.push("brain");
      }
      const ta = patch.taskAccounts;
      if (ta && typeof ta === "object") {
        const merged = { ...(data.taskAccounts ?? {}) };
        let touched = false;
        for (const [k, v] of Object.entries(ta)) {
          if (!isHarnessId(k) || !v || typeof v.enabled !== "boolean") continue;
          if ((merged[k]?.enabled ?? true) === v.enabled) continue;
          merged[k] = { enabled: v.enabled };
          touched = true;
        }
        if (touched) (data.taskAccounts = merged), did.push("taskAccounts");
      }
      // D135: only a whole, valid pair of windows is kept (no client sets it yet; settings.json does).
      const w = patch.windows as WindowsInput | undefined;
      if (w && typeof w === "object") {
        const next: WindowsInput = { partner: { ...data.windows?.partner, ...w.partner }, tasks: { ...data.windows?.tasks, ...w.tasks } };
        if (resolveWindows(next).problems.length === 0 && JSON.stringify(next) !== JSON.stringify(data.windows ?? {})) (data.windows = next), did.push("windows");
      }
      const push: Parameters<PushStore["setSettings"]>[0] = {};
      if (typeof patch.notify === "boolean" && !opts.push.settings().off !== patch.notify) (push.off = !patch.notify), did.push("notify");
      if (patch.quiet === null || (patch.quiet && typeof patch.quiet === "object")) {
        const q = parseQuiet(patch.quiet);
        if (q !== undefined) (push.quiet = q), did.push("quiet");
      }
      if (Object.keys(push).length) opts.push.setSettings(push);
      if (did.some((k) => k !== "name" && k !== "notify" && k !== "quiet")) save();
      if (did.length) changed();
      return did;
    },
    async forget(seq) {
      // D304: a 想起了 line forgets the memory it names, the same way.
      const e = opts.log.read({ stream: "channel", kinds: ["memory_noted", "memory_recalled"], limit: 1000 }).find((x) => x.seq === seq);
      if (!e) return undefined;
      const b = e.body as Bodies["memory_noted"] | Bodies["memory_recalled"];
      // D433: a line about a past conversation with another tool only leaves the list: that conversation is the tool's.
      const id = "thread" in b && b.thread ? undefined : b.memoryId;
      let how: "mem" | "hidden" = "hidden";
      if (id && forgetter) {
        try {
          if (await forgetter(id)) how = "mem";
        } catch (err) {
          console.warn("[settings] forgetting in Mem failed:", (err as Error).message);
        }
      }
      data.hidden = [...(data.hidden ?? []).filter((s) => s !== seq), seq].slice(-HIDDEN_MAX);
      save();
      changed();
      return how;
    },
    learnedThisWeek(at) {
      if (!get().memory) return 0;
      const hidden = new Set([...(data.hidden ?? []), ...(data.undone ?? [])]); // D444: one taken back (别记这个) was not kept
      return opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 200 }).filter((e) => !hidden.has(e.seq) && at - Date.parse(e.ts) < 7 * 86_400_000 && Date.parse(e.ts) <= at).length;
    },
    confirm(seq) {
      if (!opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 500 }).some((x) => x.seq === seq)) return false;
      if ((data.confirmed ?? []).includes(seq)) return true;
      data.confirmed = [...(data.confirmed ?? []), seq].slice(-HIDDEN_MAX);
      save();
      changed();
      return true;
    },
    async correct(seq, title) {
      const words = title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
      const e = opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 500 }).find((x) => x.seq === seq);
      if (!e || !words) return undefined;
      const id = (e.body as Bodies["memory_noted"]).memoryId;
      let how: "mem" | "here" = "here";
      if (id && corrector) {
        try {
          if (await corrector(id, words)) how = "mem";
        } catch (err) {
          console.warn("[settings] correcting in Mem failed:", (err as Error).message);
        }
      }
      // Mem refused or has no id: said honestly ("here"), and the line still reads their words.
      data.corrected = { ...(data.corrected ?? {}), [String(seq)]: words };
      // A corrected line is one they looked at: right as it reads now.
      data.confirmed = [...(data.confirmed ?? []).filter((s) => s !== seq), seq].slice(-HIDDEN_MAX);
      save();
      changed();
      return how;
    },
    setProactive(mode, by) {
      if (!(PROACTIVE_MODES as readonly string[]).includes(mode) || (data.proactive === mode && data.proactiveBy === by)) return;
      data.proactive = mode;
      data.proactiveBy = by;
      save();
      changed();
    },
    memIdentityChanged: changed,
    bridgeChanged: changed,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const envHarness = (v: string | undefined): HarnessId | undefined => (isHarnessId(v) && HARNESSES[v].partner ? v : undefined);

/** Claude Code + opus, unless DUCTER_PARTNER_HARNESS names another partner harness (its own default model). */
export function defaultBrain(env: Record<string, string | undefined>): Brain {
  const h = envHarness(env.DUCTER_PARTNER_HARNESS);
  return h && h !== "claude-code" ? { harness: h } : { harness: "claude-code", model: "opus" };
}

function parseQuiet(q: unknown): QuietHours | null | undefined {
  if (q === null) return null;
  if (!q || typeof q !== "object") return undefined;
  const { start, end, tz } = q as Record<string, unknown>;
  if (typeof start !== "string" || typeof end !== "string" || !HHMM.test(start) || !HHMM.test(end)) return undefined;
  let zone = typeof tz === "string" && tz ? tz : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  return { start, end, tz: zone };
}
