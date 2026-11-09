// The partner's settings (D71): the Partner page and the phone's Settings sheet read and change
// them over the client socket. Each lives where it already lived, so the CLI and the phone's own
// endpoints keep working: the name in persona.json (read by every `ducter up`), notifications
// and quiet hours in push.json (push.ts), the rest in settings.json.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, MemView, QuietHours, Settings, SettingsPatch, TalkLanguage } from "@ducter/protocol";
import { DEFAULT_AFTER_CHOICES, HARNESSES, isHarnessId, type Brain, type HarnessId } from "@ducter/protocol";
import type { LogStore, MemIdentity, SettingsApi } from "@ducter/protocol/src/internal.ts";
import { resolveWindows, type WindowsInput } from "@ducter/protocol/src/harness-facts.ts";
import type { PushStore } from "./push.ts";

export const SETTINGS_FILE = "settings.json";
export const PERSONA_FILE = "persona.json";
const NOTED_SHOWN = 12;
const HIDDEN_MAX = 500;

interface SettingsFile {
  language?: TalkLanguage;
  memory?: boolean;
  defaultAfterMin?: number;
  /** D85: what the partner thinks with, and which accounts tasks may use. */
  brain?: Brain;
  taskAccounts?: Partial<Record<HarnessId, { enabled: boolean }>>;
  /** D135: context windows, in tokens (env DUCTER_PARTNER_* / DUCTER_TASK_* override them). */
  windows?: WindowsInput;
  /** 记下了 lines forgotten here, by seq (Mem forgot them, or they are only hidden). */
  hidden?: number[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One line, no control characters, at most 24 characters (as cleanName in the CLI's firstrun.ts). */
export function cleanName(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return [...s].slice(0, 24).join("");
}

export interface SettingsStore extends SettingsApi {
  view(): Promise<{ settings: Settings; mem: MemView }>;
  /** Applies a patch; unknown or invalid fields are ignored. Returns what changed. */
  set(patch: SettingsPatch): string[];
  /** Forgets one noted line: in Mem when possible, else hidden here. */
  forget(seq: number): Promise<"mem" | "hidden" | undefined>;
  onChange(fn: () => void): () => void;
  /** The persona's Mem identity was bound (D141): clients show whose name its memories are under. */
  memIdentityChanged(): void;
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
  let memSeen: "connected" | "missing" | undefined;
  // D135: checked once at start (env + file); a value out of range is said once, then its default runs.
  const windowsNow = () => resolveWindows(data.windows, opts.env ?? process.env);
  for (const p of windowsNow().problems) console.warn(`[settings] windows: ${p}`);

  const get = (): Settings => {
    const p = opts.push.settings();
    return {
      name: opts.persona.name,
      language: data.language ?? "auto",
      memory: !opts.memoryPinnedOff && data.memory !== false,
      notify: !p.off,
      quiet: p.quiet,
      defaultAfterMin: data.defaultAfterMin ?? 30,
      brain: data.brain ?? defaultBrain(opts.env ?? process.env),
      ...(data.taskAccounts ? { taskAccounts: data.taskAccounts } : {}),
      windows: windowsNow().windows,
    };
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
    const events = opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 200 });
    const out: MemView["noted"] = [];
    for (let i = events.length - 1; i >= 0 && out.length < NOTED_SHOWN; i--) {
      const e = events[i]!;
      if (hidden.has(e.seq)) continue;
      const b = e.body as Bodies["memory_noted"];
      out.push({ seq: e.seq, title: b.title, at: e.ts, ...(b.memoryId ? { memoryId: b.memoryId } : {}) });
    }
    return out;
  };

  return {
    get,
    brainChosen: () => data.brain !== undefined || Boolean(envHarness((opts.env ?? process.env).DUCTER_PARTNER_HARNESS)),
    setForgetter(fn) {
      forgetter = fn;
    },
    setMemState(s) {
      if (s === memSeen) return;
      memSeen = s;
      changed();
    },
    defaultAfterMs: () => get().defaultAfterMin * 60_000,
    async view() {
      const s = get();
      const state: MemView["state"] = !s.memory ? "off" : memSeen ?? (forgetter ? "connected" : "missing");
      // An identity Ducter enrolled carries the partner's name (kept in step on rename, D141).
      const m = opts.persona.mem;
      const keptUnder = state === "connected" && m ? (m.owned ? opts.persona.name : m.label || m.agentId) : undefined;
      return { settings: s, mem: { state, noted: noted(), ...(keptUnder ? { keptUnder } : {}) } };
    },
    set(patch) {
      const did: string[] = [];
      if (typeof patch.name === "string") {
        const n = cleanName(patch.name);
        if (rename(n)) did.push("name");
      }
      if (patch.language === "auto" || patch.language === "zh" || patch.language === "en") {
        if ((data.language ?? "auto") !== patch.language) (data.language = patch.language), did.push("language");
      }
      if (typeof patch.memory === "boolean" && !opts.memoryPinnedOff) {
        if ((data.memory !== false) !== patch.memory) (data.memory = patch.memory), did.push("memory");
      }
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
      const e = opts.log.read({ stream: "channel", kinds: ["memory_noted"], limit: 500 }).find((x) => x.seq === seq);
      if (!e) return undefined;
      const id = (e.body as Bodies["memory_noted"]).memoryId;
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
    memIdentityChanged: changed,
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
