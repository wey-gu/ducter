// What each harness actually does, as checked against the installed build: model names and the
// windows they get, the compactor's knobs, hooks, resume, usage reports, browser facts. The one
// place these live (design/harnesses.md is its readable twin). The runner turns them into flags
// and env (runner/oar.ts); `bun scripts/probe-harnesses.ts` re-checks what it cheaply can and
// reports drift; `ducter doctor` warns when an installed version is outside the verified range.
//
// Every fact carries its evidence: VERIFIED (how, date, version), DOCUMENTED (source) or
// INFERRED (why). A new harness version is not trusted until the probe has run against it.
import type { HarnessId } from "./harnesses.ts";
import type { ContextWindows } from "./index.ts";

export type Evidence =
  | { kind: "VERIFIED"; how: string; date: string; version: string }
  | { kind: "DOCUMENTED"; source: string }
  | { kind: "INFERRED"; why: string };

export interface Fact<T> {
  value: T;
  evidence: Evidence;
}

export interface ModelFact {
  /** The concrete id the name resolves to. */
  id: string;
  /** The window this name gets on the verified build, with the user's own default setup. */
  window: number;
  /** The window with 1M context turned off (Claude Code: CLAUDE_CODE_DISABLE_1M_CONTEXT=1). */
  standardWindow?: number;
}

/** A tunable the harness reads: where it goes, its unit and its accepted range. */
export interface Knob {
  via: "env" | "config" | "settings" | "flag" | "none";
  key: string;
  unit?: "tokens" | "percent" | "bool";
  min?: number;
  max?: number;
  note?: string;
}

export interface HarnessFacts {
  harness: HarnessId;
  /** How to read the installed version, and a pattern that pulls it out of the output. */
  version: { command: string[]; pattern: RegExp };
  /** The installed versions these facts were checked against (inclusive). */
  verified: { from: string; to: string };
  /** Model names Ducter may pass, and what each becomes. Keys are aliases and ids alike. */
  models: Fact<Record<string, ModelFact>>;
  /** The suffix that asks for a 1M-context variant, if the harness has one. */
  oneMillionSuffix?: Fact<string>;
  /** Turns 1M context off for a session (the model then runs on its standard window). */
  standardWindowSwitch?: Fact<Knob>;
  /** The window the compactor counts against. */
  windowKnob: Fact<Knob>;
  /** Where the compactor fires. */
  compactAtKnob: Fact<Knob>;
  /** How the compaction point follows from the window when compactAtKnob is not set. */
  defaultCompactAt: Fact<string>;
  /** Other compactor settings Ducter sets. */
  compactSettings?: Fact<Record<string, unknown>>;
  /** A hook that runs before compaction, and what its output does. */
  preCompactHook: Fact<{ supported: boolean; how?: string }>;
  /** Which compaction events reach Ducter through OAR. */
  compactionEvents: Fact<{ started: boolean; ended: boolean }>;
  /** How the live context size is reported (OAR contextUsage). */
  contextReport: Fact<string>;
  /** Deferred tool loading and how Ducter keeps its own tools loaded. */
  toolSearch: Fact<string>;
  resume: Fact<{ supported: boolean; how: string }>;
  /** Its own browser / computer use (research/38). */
  browser: Fact<string>;
  /** D153: where it's installed from and how each copy updates (research/42). */
  channels: Fact<AgentChannels>;
}

/**
 * How one AI agent is installed and updated (D153, research/42). A copy's real path decides its
 * channel; each channel names where its latest version is read and how it updates. `{v}` in a
 * command is the version to install.
 */
export interface AgentChannels {
  /** The npm package (`npm install -g <pkg>@<v>`, which pins). */
  npm?: string;
  /** The Homebrew cask (`brew upgrade --cask <token>`; no pinning). */
  cask?: string;
  /** The agent's own installer: a path segment that marks its copies, its updater, and a pinned install when it has one. */
  installer?: {
    /** A real-path segment, or a marker file found in a parent folder ("file:<name>"). */
    mark: string;
    update: string[];
    pin?: string[];
    /** Where the installer's latest version is read: a URL answering a bare version or JSON {version}. */
    latest: string;
  };
  /** Real-path segments of copies a desktop app carries (never touched), and the app's name. */
  app?: { marks: string[]; name: string };
}

/** Where a channel's latest version is read (research/42). */
export const NPM_LATEST = (pkg: string) => `https://registry.npmjs.org/${pkg}/latest`;
export const CASK_LATEST = (token: string) => `https://formulae.brew.sh/api/cask/${token}.json`;

const D = "2026-11-09";
const cc = (how: string): Evidence => ({ kind: "VERIFIED", how, date: D, version: "2.1.319" });
const cx = (how: string): Evidence => ({ kind: "VERIFIED", how, date: D, version: "0.167.0" });
const pi = (how: string): Evidence => ({ kind: "VERIFIED", how, date: D, version: "1.4.0" });

/** Claude Code's compaction point for a window (2.1.319 binary): window - min(maxOutput, 20K) - 13K. */
export const CLAUDE_SUMMARY_RESERVE = 20_000;
export const CLAUDE_COMPACT_BUFFER = 13_000;

export const HARNESS_FACTS: Record<HarnessId, HarnessFacts> = {
  "claude-code": {
    harness: "claude-code",
    version: { command: ["claude", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    verified: { from: "2.1.319", to: "2.1.319" },
    models: {
      value: {
        opus: { id: "claude-opus-5-5", window: 1_000_000, standardWindow: 200_000 },
        sonnet: { id: "claude-sonnet-5-5", window: 1_000_000, standardWindow: 200_000 },
        haiku: { id: "claude-haiku-5-5", window: 1_000_000, standardWindow: 200_000 },
        "claude-opus-5-5": { id: "claude-opus-5-5", window: 1_000_000, standardWindow: 200_000 },
        "claude-sonnet-5-5": { id: "claude-sonnet-5-5", window: 1_000_000, standardWindow: 200_000 },
        "claude-haiku-5-5": { id: "claude-haiku-5-5", window: 1_000_000, standardWindow: 200_000 },
      },
      evidence: cc(
        "`claude -p --model <name> --output-format json`, modelUsage[id].contextWindow: every name, alias or full id, got 1,000,000 on this Max account; with CLAUDE_CODE_DISABLE_1M_CONTEXT=1 each got 200,000. There is no separate standard-window id.",
      ),
    },
    oneMillionSuffix: { value: "[1m]", evidence: cc("binary: /\\[1m\\]/i marks a 1M variant (e.g. opus[1m]); refused with alias_1m_disabled when 1M is off") },
    standardWindowSwitch: {
      value: { via: "env", key: "CLAUDE_CODE_DISABLE_1M_CONTEXT", unit: "bool", note: "1: every model runs on its standard 200K window" },
      evidence: cc("live: contextWindow 1,000,000 -> 200,000 for opus, sonnet, haiku and claude-opus-5-5"),
    },
    windowKnob: {
      value: { via: "env", key: "CLAUDE_CODE_AUTO_COMPACT_WINDOW", unit: "tokens", min: 100_000, max: 1_000_000, note: "the window is the smaller of it and the model's" },
      evidence: cc("binary: range check (below_minimum / above_maximum), clamped to the model window"),
    },
    compactAtKnob: {
      value: { via: "env", key: "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", unit: "percent", min: 0, max: 100, note: "threshold = min(floor((window - 20K) x pct/100), window - 33K)" },
      evidence: cc(
        "binary: L4(e,n) = min(floor(e*pct/100), e-13000), e = window - min(maxOutputTokens, 20000), parseFloat; live (--debug-file, haiku, window 100K, a 49K-token prompt): level=ok without it, level=compact with 50",
      ),
    },
    defaultCompactAt: { value: "window - min(maxOutputTokens, 20K) - 13K (200K window: 167K)", evidence: cc("binary: Ure/L4") },
    compactSettings: {
      value: { idleCompaction: false, precomputeCompactionEnabled: false },
      evidence: cc("binary: settings keys; idle compaction rewrites a cold cache, precompute writes the summary in the background"),
    },
    preCompactHook: {
      value: { supported: true, how: "hooks.PreCompact (matcher manual|auto): exit 0 stdout is appended as custom compact instructions; exit 2 blocks compaction" },
      evidence: cc("binary: the hook catalog's own description of PreCompact"),
    },
    compactionEvents: { value: { started: false, ended: true }, evidence: { kind: "VERIFIED", how: "OAR 0.95.1 shared/stream-json/projection.js: compact_boundary becomes compaction_ended only", date: D, version: "oar 0.95.1" } },
    contextReport: { value: "the last request's input + cache read + cache write (OAR contextUsage); unknown right after a compaction", evidence: cc("live, research/11 and design/context.md") },
    toolSearch: {
      value: "MCP tools are deferred behind tool search by default; ENABLE_TOOL_SEARCH=false loads all up front (the partner); the per-tool _meta anthropic/alwaysLoad keeps Ducter's own tools loaded in tasks",
      evidence: cc("live (core/mcp.ts)"),
    },
    resume: { value: { supported: true, how: "--resume <session id> (OAR SessionOptions.resume)" }, evidence: cc("live, runner park/resume") },
    browser: {
      value: "Claude in Chrome via --chrome (the user's real Chrome, needs the extension); computer use is not available in -p",
      evidence: { kind: "VERIFIED", how: "research/38 §1", date: D, version: "2.1.319" },
    },
    channels: {
      value: {
        npm: "@anthropic-ai/claude-code",
        cask: "claude-code",
        installer: { mark: "/claude/versions/", update: ["claude", "update"], pin: ["claude", "install", "{v}"], latest: "https://downloads.claude.ai/claude-code-releases/latest" },
        app: { marks: ["/Application Support/Claude/claude-code/", "/Claude.app/Contents/"], name: "Claude" },
      },
      evidence: {
        kind: "VERIFIED",
        how: "research/42 §1: `claude update|install --help` (install [target]: stable, latest or a version), ~/.local/share/claude/versions/<v>, the releases pointer, brew info --cask, the Claude app's own copy (read-only)",
        date: "2026-11-10",
        version: "2.1.321",
      },
    },
  },
  codex: {
    harness: "codex",
    version: { command: ["codex", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    verified: { from: "0.167.0", to: "0.167.0" },
    models: {
      value: {
        "gpt-6.1-sol": { id: "gpt-6.1-sol", window: 500_000 },
        "gpt-6.1-terra": { id: "gpt-6.1-terra", window: 500_000 },
        "gpt-6-astra": { id: "gpt-6-astra", window: 272_000 },
        "gpt-6-sol": { id: "gpt-6-sol", window: 272_000 },
        "gpt-6-luna": { id: "gpt-6-luna", window: 272_000 },
        "gpt-5.6-sol": { id: "gpt-5.6-sol", window: 272_000 },
        "gpt-5.6-terra": { id: "gpt-5.6-terra", window: 272_000 },
        "gpt-5.6-luna": { id: "gpt-5.6-luna", window: 272_000 },
      },
      evidence: cx("`codex debug models`: context_window per listed model (max_context_window 872,000 for all)"),
    },
    windowKnob: {
      value: { via: "config", key: "model_context_window", unit: "tokens", note: "-c model_context_window=<n>; Codex counts its window (and the auto-compact clamp) from it" },
      evidence: cx('`codex debug prompt-input -c model_context_window="abc"` -> "expected i64 in `model_context_window`"'),
    },
    compactAtKnob: {
      value: { via: "config", key: "model_auto_compact_token_limit", unit: "tokens", note: "-c model_auto_compact_token_limit=<n>" },
      evidence: cx('`codex debug prompt-input -c model_auto_compact_token_limit="abc"` -> "expected i64"'),
    },
    defaultCompactAt: { value: "90% of the window; a limit above that is clamped to it", evidence: { kind: "INFERRED", why: "codex-rs source read in research/11; not re-read for 0.167" } },
    preCompactHook: {
      value: { supported: true, how: "hooks PreCompact/PostCompact exist; the partner turns hooks off, tasks keep the user's" },
      evidence: cx("binary strings: the hook event list includes PreCompact, PostCompact; config key compact_prompt replaces the summary prompt"),
    },
    compactionEvents: { value: { started: true, ended: true }, evidence: { kind: "VERIFIED", how: "OAR 0.95.1 runtimes/codex/projection.js: contextCompaction item -> compaction_started / compaction_ended", date: D, version: "oar 0.95.1" } },
    contextReport: { value: "last.totalTokens (OAR contextUsage); builds without `last` give a cumulative total, unused", evidence: cx("live (design/context.md)") },
    toolSearch: { value: "MCP tools load directly; no deferral", evidence: { kind: "VERIFIED", how: "core/mcp.ts note", date: D, version: "0.167.0" } },
    resume: { value: { supported: true, how: "thread resume by id (OAR SessionOptions.resume)" }, evidence: cx("live, runner park/resume") },
    browser: {
      value: "Computer Use (cua_repl) works headless under OAR and reaches the user's real Chrome as an app; the in-app browser and Chrome extension do not; only features.plugins=false removes it",
      evidence: { kind: "VERIFIED", how: "research/38 §1", date: D, version: "0.167.0" },
    },
    channels: {
      value: {
        npm: "@openai/codex",
        cask: "codex",
        installer: {
          mark: "/packages/standalone/",
          update: ["codex", "update"],
          pin: ["sh", "-c", "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh -s -- --release {v}"],
          latest: "https://registry.npmjs.org/@openai/codex/latest",
        },
        app: { marks: ["/Codex.app/Contents/", ".app/Contents/"], name: "Codex" },
      },
      evidence: {
        kind: "VERIFIED",
        how: "research/42 §2: `codex update --help`, `codex doctor --json` (install context npm, update action npm install -g @openai/codex), install.sh --help (--release VERSION, CODEX_NON_INTERACTIVE), brew info --cask (read-only)",
        date: "2026-11-10",
        version: "0.167.0",
      },
    },
  },
  pi: {
    harness: "pi",
    version: { command: ["pi", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    verified: { from: "1.4.0", to: "1.4.0" },
    models: { value: {}, evidence: pi("provider/model ids; windows come from pi's own model catalog") },
    windowKnob: { value: { via: "none", key: "", note: "the model catalog's contextWindow; no per-session override" }, evidence: pi("`pi --help`: no context flag") },
    compactAtKnob: {
      value: { via: "settings", key: "compaction.reserveTokens", unit: "tokens", note: "settings.json only (fires at window - reserveTokens); no per-session flag" },
      evidence: { kind: "DOCUMENTED", source: "pi docs (settings.json compaction.enabled / reserveTokens / keepRecentTokens); research/11" },
    },
    defaultCompactAt: { value: "window - reserveTokens (16K default)", evidence: { kind: "DOCUMENTED", source: "pi docs; research/11" } },
    preCompactHook: { value: { supported: true, how: "extension event session_before_compact (return a summary or cancel)" }, evidence: { kind: "DOCUMENTED", source: "research/11 §7.3.7" } },
    compactionEvents: { value: { started: true, ended: true }, evidence: { kind: "INFERRED", why: "OAR runtimes/pi/compaction.js handles both; not run live" } },
    contextReport: { value: "pi get_session_stats context (OAR contextUsage)", evidence: { kind: "INFERRED", why: "OAR pi runtime; not run live" } },
    toolSearch: { value: "MCP through Ducter's extension; loaded directly", evidence: { kind: "INFERRED", why: "no deferral in pi" } },
    resume: { value: { supported: true, how: "session file path (OAR)" }, evidence: { kind: "INFERRED", why: "OAR pi runtime" } },
    browser: { value: "none (read, bash, edit, write; extensions only)", evidence: pi("`pi --help` (research/38)") },
    channels: {
      value: {
        npm: "@earendil-works/pi-coding-agent",
        installer: { mark: "file:managed-install.json", update: ["pi", "update", "--self"], latest: "https://pi.dev/api/latest-version" },
      },
      evidence: { kind: "DOCUMENTED", source: "pi 1.4.0's own updater (dist/config.js, package-manager-cli.js, utils/version-check.js); research/42 §3" },
    },
  },
  "deepseek-harness": {
    harness: "deepseek-harness",
    version: { command: ["dsh", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    verified: { from: "0.0.0", to: "0.0.0" },
    models: { value: {}, evidence: { kind: "INFERRED", why: "not installed on the verifying Mac" } },
    windowKnob: { value: { via: "none", key: "" }, evidence: { kind: "INFERRED", why: "not installed; unknown" } },
    compactAtKnob: { value: { via: "none", key: "" }, evidence: { kind: "INFERRED", why: "not installed; unknown" } },
    defaultCompactAt: { value: "unknown", evidence: { kind: "INFERRED", why: "not installed" } },
    preCompactHook: { value: { supported: false }, evidence: { kind: "INFERRED", why: "not installed; unknown" } },
    compactionEvents: { value: { started: true, ended: true }, evidence: { kind: "INFERRED", why: "OAR runtimes/dsh/projection.js maps both" } },
    contextReport: { value: "unknown", evidence: { kind: "INFERRED", why: "not installed" } },
    toolSearch: { value: "stdio MCP through Ducter's bridge", evidence: { kind: "INFERRED", why: "runner/oar.ts" } },
    resume: { value: { supported: true, how: "OAR SessionOptions.resume" }, evidence: { kind: "INFERRED", why: "OAR dsh runtime" } },
    browser: { value: "none known", evidence: { kind: "INFERRED", why: "research/38" } },
    channels: {
      value: { npm: "@deepseek-ai/dsh" },
      evidence: { kind: "DOCUMENTED", source: "OAR 0.95.1 runtimes/dsh/install.js (npm package @deepseek-ai/dsh); research/34, research/42 §4" },
    },
  },
};

// ---------- the small-window settings (D135) ----------

/** What one kind of session runs with. compactAt: where the harness's own compactor may fire. */
export interface WindowPlan {
  window: number;
  compactAt: number;
}

/** What a plan becomes on one harness: env, launch args and compactor settings. */
export interface WindowKnobs {
  env: Record<string, string>;
  args: string[];
  /** Claude Code settings (the session's settings file or --settings). */
  settings: Record<string, unknown>;
  /** Not enforceable on this harness (pi, DeepSeek Harness): left to its defaults. */
  unbounded?: boolean;
}

/** Claude Code's percentage that puts the compaction point at `compactAt` in `window` (undefined: the default point is lower already). */
export function claudeCompactPct(window: number, compactAt: number): number | undefined {
  const usable = window - CLAUDE_SUMMARY_RESERVE;
  if (compactAt >= usable - CLAUDE_COMPACT_BUFFER) return undefined;
  // Rounded up at four decimals: floor(usable x pct / 100) lands on compactAt.
  return Math.ceil((compactAt / usable) * 1e6) / 1e4;
}

/** The flags and env that hold a session to its window and compaction point. */
export function windowKnobs(h: HarnessId, plan: WindowPlan): WindowKnobs {
  const f = HARNESS_FACTS[h];
  const window = Math.round(plan.window);
  const compactAt = Math.round(Math.min(plan.compactAt, plan.window));
  switch (h) {
    case "claude-code": {
      const wk = f.windowKnob.value;
      const w = Math.min(wk.max!, Math.max(wk.min!, window));
      const env: Record<string, string> = { [wk.key]: String(w) };
      // A window no larger than the standard one: 1M variants off, so the model runs on 200K.
      if (w <= standardWindow(h)) env[f.standardWindowSwitch!.value.key] = "1";
      const pct = claudeCompactPct(w, compactAt);
      if (pct !== undefined) env[f.compactAtKnob.value.key] = String(pct);
      return { env, args: [], settings: { ...(f.compactSettings?.value ?? {}) } };
    }
    case "codex":
      return { env: {}, args: ["-c", `${f.windowKnob.value.key}=${window}`, "-c", `${f.compactAtKnob.value.key}=${compactAt}`], settings: {} };
    default:
      return { env: {}, args: [], settings: {}, unbounded: true };
  }
}

/** The standard (non-1M) window of a harness's models, the smallest a plan may ask for there. */
export function standardWindow(h: HarnessId): number {
  const ws = Object.values(HARNESS_FACTS[h].models.value).map((m) => m.standardWindow ?? m.window);
  return ws.length ? Math.min(...ws) : 200_000;
}

/**
 * The model id to pass for a plan: an alias becomes its concrete id, and a 1M variant its
 * standard one when the plan's window fits the standard window. Unknown names pass as they are.
 */
export function modelForWindow(h: HarnessId, model: string | undefined, window: number): string | undefined {
  if (!model) return undefined;
  const f = HARNESS_FACTS[h];
  const m = model.trim();
  const suffix = f.oneMillionSuffix?.value ?? "";
  const oneM = !!suffix && m.toLowerCase().endsWith(suffix);
  const base = oneM ? m.slice(0, -suffix.length) : m;
  const keep1m = oneM && window > standardWindow(h); // the user asked for a window only 1M holds
  const known = f.models.value[base];
  if (!known) return keep1m ? m : base;
  return keep1m ? known.id + suffix : known.id;
}

/** True when a model's 1M variant would be what this name gets by default (the reason the switch is passed). */
export function defaultsToOneMillion(h: HarnessId, model: string): boolean {
  const m = HARNESS_FACTS[h].models.value[model];
  return !!m && m.window > (m.standardWindow ?? m.window);
}

// ---------- versions ----------

function parts(v: string): number[] {
  return v.split(".").map((x) => Number.parseInt(x, 10) || 0);
}

export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Where an installed version stands against the verified range. */
export function versionStanding(h: HarnessId, installed: string | undefined): "verified" | "newer" | "older" | "unknown" {
  const f = HARNESS_FACTS[h];
  const v = installed ? f.version.pattern.exec(installed)?.[1] : undefined;
  if (!v || f.verified.to === "0.0.0") return "unknown";
  if (compareVersions(v, f.verified.from) < 0) return "older";
  if (compareVersions(v, f.verified.to) > 0) return "newer";
  return "verified";
}

// ---------- the settings (D135) ----------

export const WINDOW_DEFAULTS: ContextWindows = {
  partner: { window: 200_000, recutAt: 120_000, compactAt: 200_000 },
  tasks: { window: 200_000, compactAt: 160_000 },
};
/** Claude Code's accepted window range (CLAUDE_CODE_AUTO_COMPACT_WINDOW), the bounds for every harness. */
export const WINDOW_MIN = 100_000;
export const WINDOW_MAX = 1_000_000;

/** The env names, each overriding settings.json's `windows`. */
export const WINDOW_ENV = {
  partnerWindow: "DUCTER_PARTNER_WINDOW",
  partnerRecutAt: "DUCTER_PARTNER_RECUT_AT",
  partnerCompactAt: "DUCTER_PARTNER_COMPACT_AT",
  taskWindow: "DUCTER_TASK_WINDOW",
  taskCompactAt: "DUCTER_TASK_COMPACT_AT",
} as const;

export type WindowsInput = { partner?: Partial<ContextWindows["partner"]>; tasks?: Partial<ContextWindows["tasks"]> };

/** "200000", "200k", "1m", 200000 -> tokens; anything else undefined. */
export function parseTokens(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
  if (typeof v !== "string") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([km]?)\s*$/i.exec(v);
  if (!m) return undefined;
  const unit = m[2]!.toLowerCase();
  const n = Number(m[1]) * (unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1);
  return n > 0 ? Math.round(n) : undefined;
}

/**
 * The windows to run with: env over settings.json over the defaults, each checked. A value out
 * of range is not used (its default stands) and is named in `problems`:
 *   window 100K-1M; partner recutAt 20K..window-20K, compactAt recutAt+10K..window (default:
 *   the window); tasks compactAt 50K..window (default 160K on a 200K window, else 80%).
 */
export function resolveWindows(file: WindowsInput | undefined, env: Record<string, string | undefined> = {}): { windows: ContextWindows; problems: string[] } {
  const problems: string[] = [];
  const pick = (name: string, envKey: string, fromFile: unknown, ok: (n: number) => boolean, fallback: number): number => {
    const raw = env[envKey] !== undefined && env[envKey] !== "" ? env[envKey] : fromFile;
    if (raw === undefined || raw === null) return fallback;
    const n = parseTokens(raw);
    if (n !== undefined && ok(n)) return n;
    problems.push(`${name}=${String(raw)} is out of range; using ${fallback}`);
    return fallback;
  };
  const inWindow = (n: number) => n >= WINDOW_MIN && n <= WINDOW_MAX;
  const p = file?.partner ?? {};
  const t = file?.tasks ?? {};
  const pw = pick("partner.window", WINDOW_ENV.partnerWindow, p.window, inWindow, WINDOW_DEFAULTS.partner.window);
  const pr = pick("partner.recutAt", WINDOW_ENV.partnerRecutAt, p.recutAt, (n) => n >= 20_000 && n <= pw - 20_000, Math.min(WINDOW_DEFAULTS.partner.recutAt, pw - 20_000));
  const pc = pick("partner.compactAt", WINDOW_ENV.partnerCompactAt, p.compactAt, (n) => n >= pr + 10_000 && n <= pw, pw);
  const tw = pick("tasks.window", WINDOW_ENV.taskWindow, t.window, inWindow, WINDOW_DEFAULTS.tasks.window);
  const tcDefault = tw === WINDOW_DEFAULTS.tasks.window ? WINDOW_DEFAULTS.tasks.compactAt : Math.round(tw * 0.8);
  const tc = pick("tasks.compactAt", WINDOW_ENV.taskCompactAt, t.compactAt, (n) => n >= 50_000 && n <= tw, tcDefault);
  return { windows: { partner: { window: pw, recutAt: pr, compactAt: pc }, tasks: { window: tw, compactAt: tc } }, problems };
}

/** Where a task is asked to save its progress: a little before its compaction point. */
export function saveBeforeAt(compactAt: number): number {
  return Math.max(Math.round(compactAt * 0.85), compactAt - 20_000);
}
