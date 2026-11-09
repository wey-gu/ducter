// The partner's settings (D71): the Partner page and the phone's Settings sheet read and change
// them over the client socket. Each lives where it already lived, so the CLI and the phone's own
// endpoints keep working: the name in persona.json (read by every `ducter up`), notifications
// and quiet hours in push.json (push.ts), the rest in settings.json.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, Brain, MemView, QuietHours, Settings, SettingsPatch, TalkLanguage } from "@ducter/protocol";
import { DEFAULT_AFTER_CHOICES, HARNESSES, isHarnessId, type HarnessId } from "@ducter/protocol";
import type { LogStore, SettingsApi } from "@ducter/protocol/src/internal.ts";
import type { PushStore } from "./push.ts";

export const SETTINGS_FILE = "settings.json";
export const PERSONA_FILE = "persona.json";
const NOTED_SHOWN = 12;
const HIDDEN_MAX = 500;

interface SettingsFile {
  language?: TalkLanguage;
  memory?: boolean;
  defaultAfterMin?: number;
  /** D85/D89: what the partner thinks with, and which accounts tasks may use. */
  brain?: Brain;
  taskAccounts?: Partial<Record<HarnessId, { enabled: boolean }>>;
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
  /** A reversible decision's wait, from the setting. */
  defaultAfterMs(): number;
}

export function openSettings(opts: {
  dataDir: string;
  log: LogStore;
  push: PushStore;
  persona: { name: string; identity: string };
  /** DUCTER_MEMORY=off pins memory off for this run. */
  memoryPinnedOff?: boolean;
  /** DUCTER_PARTNER_HARNESS / DUCTER_PARTNER_MODEL pick the brain until the user sets one (default process.env). */
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
      return { settings: s, mem: { state, noted: noted() } };
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
      // What it thinks with (D89): only a harness that can be the partner; a new harness starts
      // on its own default model unless one is given. Whether it is signed in on the home Mac is
      // checked by the socket before it gets here (ws.ts).
      const b = patch.brain;
      if (b && typeof b === "object" && isHarnessId(b.harness) && HARNESSES[b.harness].partner) {
        const model = typeof b.model === "string" && b.model.trim() ? b.model.trim().slice(0, 120) : undefined;
        const now = get().brain;
        if (now.harness !== b.harness || now.model !== model) {
          data.brain = { harness: b.harness, ...(model ? { model } : {}) };
          did.push("brain");
        }
      }
      const ta = patch.taskAccounts;
      if (ta && typeof ta === "object") {
        for (const [id, v] of Object.entries(ta)) {
          if (!isHarnessId(id) || typeof v?.enabled !== "boolean") continue;
          const was = data.taskAccounts?.[id]?.enabled !== false;
          if (was === v.enabled) continue;
          data.taskAccounts = { ...data.taskAccounts, [id]: { enabled: v.enabled } };
          did.push("taskAccounts");
        }
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
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The brain before the user picks one: env for tests and the CLI, else Claude Code with Opus. */
export function defaultBrain(env: Record<string, string | undefined>): Brain {
  const h = env.DUCTER_PARTNER_HARNESS;
  const harness: HarnessId = isHarnessId(h) && HARNESSES[h].partner ? h : "claude-code";
  const model = env.DUCTER_PARTNER_MODEL?.trim() || (harness === "claude-code" ? "opus" : undefined);
  return { harness, ...(model ? { model } : {}) };
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
