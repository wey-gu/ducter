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
import type { ListedModel } from "./internal.ts";
import type { SchemaDialect } from "./tool-schema.ts";

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
  /** profile: a row of DeepSeek Harness's profile layer, in a Ducter-owned home only (DSH_PROFILE). */
  via: "env" | "config" | "settings" | "flag" | "profile" | "none";
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
  /** D156: where it's installed from and how each copy updates (research/42). */
  channels: Fact<AgentChannels>;
  /** D168/D169: the user's Nowledge Mem plugin for this agent, and how Ducter turns it off in one session (research/48 M3, M4). */
  memPlugin?: Fact<MemPluginFact>;
  /**
   * D417: an agent with no way to load Mem's plugin for one session: Ducter runs the plugin's two
   * lifecycle steps itself with Mem's own CLI (contextApp: `nmem context --source-app`;
   * threadFrom: `nmem t save --from`), unless the person's own Mem plugin is there (plugin: its
   * manifest name, which then does both itself).
   */
  memSteps?: Fact<{ contextApp: string; threadFrom: string; plugin: string }>;
  /**
   * D175 (3), research/48 F8: how a one-shot session (the judge, the digest writer) runs with no
   * tools at all, built-ins included. Launch args for the agent; empty: none known, so the named
   * built-ins are denied one by one instead (the old way).
   */
  noTools: Fact<{ args: string[] }>;
  /**
   * D177: how a read-only session (the partner, principle 6) is held to reading on this agent,
   * enforced by the agent rather than asked of the model. `tools`: what the partner can still call
   * of the agent's own (Ducter's MCP tools always stay).
   */
  readOnly: Fact<{ how: string; tools: string[] }>;
  /**
   * D378: how the partner's session runs without the agent's own web tools (search, fetch), so a
   * web page never reaches the one that holds the conversation; a task reads it and reports.
   * deny: built-ins denied by name; args: launch arguments; rows: profile rows dropped; all
   * empty: the agent has no web tool in the partner's setup.
   */
  noWeb: Fact<{ how: string; deny: string[]; args: string[]; rows: string[] }>;
  /**
   * D380: a quick web look (one live fact) runs as its own short session holding nothing but the
   * agent's web tools: no files, no shell, no MCP, no memory, no accounts, so a page that speaks to
   * it has nothing to reach. supported: the agent can be held to its web tools alone; args: launch
   * arguments; rows: profile rows dropped; model: the fast model it runs on.
   */
  webLook: Fact<{ supported: boolean; how: string; args: string[]; rows: string[]; model?: string }>;
  /**
   * D202: the reasoning effort a session can ask for. levels: every level the agent accepts (each
   * model lists its own, through OAR listModels: the New task card offers those); perModel: the
   * listing says which levels each model takes and its default. Absent: no effort is passed.
   */
  effort?: Fact<{ levels: string[]; how: string; perModel: boolean; defaultListed: boolean }>;
  /**
   * D479: the model families this agent hands Ducter's tool schemas to (tool-schema.ts holds each
   * family's limits). Every tool Ducter lists must sit inside all of them: a schema one model
   * refuses fails the session's first call, before any work.
   */
  toolSchema: Fact<SchemaDialect[]>;
}

/**
 * The Nowledge Mem plugin for one agent: its host name in `nmem plugins inspect`, its id(s) in the
 * agent's own plugin registry, and how a single session is run without it when memory is off.
 *  - settings: Claude Code `--settings {"enabledPlugins": {<id>: false}}`, the user's other plugins kept;
 *  - config: Codex `-c plugins.<id>.enabled=false`, only for ids the user's config.toml has;
 *  - flag: pi `--no-extensions` (no per-package switch: every extension the user installed is off
 *    in that session; explicit `-e` extensions, Ducter's MCP among them, stay);
 *  - home: DeepSeek Harness under a Ducter-owned DSH home (Mem ships as a DSH profile bundle; DSH has
 *    no per-session profile switch known), so none of the user's profiles load.
 * contextCost: the size of what the plugin injects at session start (its Context Bundle), per
 * session; "unknown" until measured live (research/48 M2, design/todo.md).
 */
export interface MemPluginFact {
  host: string;
  ids: string[];
  off: "settings" | "config" | "flag" | "home";
  contextCost: "unknown" | number;
}

/**
 * How one AI agent is installed and updated (D156, research/42). A copy's real path decides its
 * channel; each channel names where its latest version is read and how it updates. `{v}` in a
 * command is the version to install.
 */
export interface AgentChannels {
  /** The npm package (`npm install -g <pkg>@<v>`, which pins). */
  npm?: string;
  /**
   * D362: the npm tarball that carries this machine's binary, under the registry (`{v}`, `{os}`:
   * darwin linux win32, `{arch}`: arm64 x64). Ducter fetches it into npm's own cache first, with
   * progress, then npm installs from there; absent: npm downloads it itself, unseen.
   */
  npmBlob?: string;
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
/** D177, research/50: the live partner probe on pi (OAR's bundled 1.5.0 RPC; the user's 1.5.1 --help) with deepseek/deepseek-flash, scratch agent dir. */
const PI_LIVE: Evidence = {
  kind: "VERIFIED",
  how: "research/50 §2: a partner session (clean, read-only) asked to write a file and to run touch: no such tool, neither file made; read and Ducter's MCP tools worked as mcp__ducter__<tool>; the session's tool list held read + Ducter's tools only; resumed by id with its history",
  date: "2026-11-10",
  version: "1.5.0",
};
/** D177, research/50: the live partner probe on DeepSeek Harness 0.2.2-rc.1 (scratch install and home). */
const DSH_LIVE = (how: string): Evidence => ({ kind: "VERIFIED", how, date: "2026-11-10", version: "0.2.2-rc.1" });

/**
 * Claude Code's switches that Ducter's code sets, named once here so the adapter (runner/oar.ts),
 * the MCP hub (core/mcp.ts) and the probe (scripts/probe-harnesses.ts) read the same strings
 * (research/48: a guardrail test fails on these literals anywhere else).
 *  - toolSearchEnv: "false" loads every MCP tool up front. Set for clean (isolated) sessions only:
 *    there no user server competes, and deferral costs a model round trip before the ack (~3 s).
 *  - alwaysLoadMeta: the per-tool `_meta` key that keeps Ducter's own tools loaded in tasks,
 *    which keep the user's servers and so their tool search (2.1.319 binary strings, research/08).
 *  - readCapEnv: the cap on one Read's output, the partner's working-set rule (principle 5).
 */
export const CLAUDE_SWITCHES = {
  toolSearchEnv: "ENABLE_TOOL_SEARCH",
  alwaysLoadMeta: "anthropic/alwaysLoad",
  readCapEnv: "CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS",
} as const;

/**
 * D177: DeepSeek Harness's profile layer, written by Ducter only into a home it owns (the partner's
 * clean setup, a one-shot, a memory-off task): `$DSH_HOME/profiles/acp/cordis.patch.yml`, the user
 * layer DSH applies after every bundle and before OAR's own `--patch` overlay (dsh 0.2.2-rc.1
 * `--help`, research/50). Rows are the plugin ids `dsh --profile acp --dump-config` lists.
 *  - systemPrompt: the system-prompt row; `includeHarnessIdentity: false` + `personaPrefix` make
 *    Ducter's prompt the whole opener, instead of AGENTS.md riding in a user message as
 *    "workspace instructions" that "do not override system instructions".
 *  - readOnlyOff: every row whose tools run, write, delegate or plan (bash, jobs, subagents,
 *    workflow, goals, todos, skills, the working-directory switch); `tool-fs` keeps only `read`.
 *  - noToolsOff: a one-shot (D175 (3)) also drops the read, search, web and MCP-resource tools.
 *  - compaction: the compactor fires at floor(min(W x thresholdRatio, W - O - headroom)).
 *  - sessionLog: DSH uploads the canonical session log to DeepSeek's official API beside every
 *    request (`dsh_session_log`); off in Ducter-owned homes, so nothing but the model call leaves.
 */
export const DSH_PROFILE = {
  profile: "acp",
  layerFile: "cordis.patch.yml",
  systemPrompt: "system-prompt",
  fs: "tool-fs",
  compaction: "compaction-basic",
  sessionLog: "session-log-deepseek",
  /** D371: the credential store's row (dsh-credentials-local; `path` names the file it reads, research/140). */
  credentials: "credentials",
  readOnlyOff: ["tool-bash", "tool-pwsh", "tool-jobs", "tool-subagent", "tool-subagent-fork", "tool-subagent-control", "tool-workflow", "tool-goal", "tool-todo", "tool-skill", "tool-working-directory", "tool-plugin-manager"],
  /** Rows named tool-* that are machinery, not model tools (the probe checks every other tool row is named above). */
  notTools: ["tool-result-pruner", "tool-executor-native", "tool-executor-ptc"],
  noToolsOff: ["tool-fs", "tool-fs-search", "tool-web", "mcp-resources"],
  /** Its sandbox preset (dsh-base: read-only | workspace-write | danger-full-access); OAR sets danger-full-access unless a host names one. */
  permissionEnv: "DSH_PERMISSION_MODE",
  /** The official models' window, as DeepSeek's /models listing and DSH's own catalog declare it. */
  officialWindow: 1_048_576,
} as const;

/**
 * What a read-only pi session keeps (`pi --tools`, an allowlist): pi's reading tools, and the MCP
 * tools OAR's extension registers for the session's own servers (named mcp__<server>__<tool>; a
 * list without the pattern drops them too, live research/50 §2). OAR runs pi with --no-mcp, so no
 * other MCP server is there to match it.
 */
export const PI_READ_ONLY_TOOLS = ["read", "grep", "find", "ls", "mcp__*"] as const;

/** Claude Code's compaction point for a window (2.1.319 binary): window - min(maxOutput, 20K) - 13K. */
export const CLAUDE_SUMMARY_RESERVE = 20_000;
export const CLAUDE_COMPACT_BUFFER = 13_000;

/**
 * D416: Antigravity's CLI as OAR 0.124 drives it (runtimes/antigravity, docs/runtimes/antigravity.md).
 *  - minVersion: OAR's floor (ANTIGRAVITY_MINIMUM_VERSION): a stable agy with native ACP; below
 *    it OAR refuses sessions and readers, but `agy update` still runs on that copy;
 *  - bin: where the official installer puts it (OAR looks there even when it isn't on PATH);
 *  - manifest: Google's release manifest per platform ({version, url, sha512}), what its own
 *    installer and updater read; `{platform}` is darwin_arm64, darwin_amd64, linux_amd64,
 *    linux_arm64 (linux_<arch>_musl on musl);
 *  - app: the desktop app (the IDE), which carries no `agy` of its own: an app alone is "the app,
 *    not its command line"; appLinks: the links an older app put there (dangling after an update);
 *  - token: where agy keeps its Google sign-in when there is no keyring (presence only, never read).
 */
export const ANTIGRAVITY = {
  minVersion: "1.5.0",
  bin: [".local", "bin", "agy"],
  manifest: "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/{platform}.json",
  installPage: "https://antigravity.google/docs/cli",
  app: "Antigravity.app",
  appLinks: [".antigravity", "antigravity", "bin", "agy"],
  token: [".gemini", "antigravity-cli", "antigravity-oauth-token"],
  /** agy's own note when a sign-in is needed (`agy models`, 1.5.5+). */
  signedOut: /please sign in/i,
} as const;

/** D416: the manifest's platform name for this machine (undefined: no agy build for it). */
export function agyPlatform(platform: string, arch: string, musl = false): string | undefined {
  const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : undefined;
  const a = arch === "arm64" || arch === "aarch64" ? "arm64" : arch === "x64" || arch === "amd64" ? "amd64" : undefined;
  if (!os || !a) return undefined;
  return `${os}_${a}${os === "linux" && musl ? "_musl" : ""}`;
}

const AGY = (source: string): Evidence => ({ kind: "DOCUMENTED", source: `OAR 0.124.0 docs/runtimes/antigravity.md: ${source}` });

export const HARNESS_FACTS: Record<HarnessId, HarnessFacts> = {
  "claude-code": {
    harness: "claude-code",
    // D479: Claude models only; Claude Code passes an MCP tool's schema through as input_schema.
    toolSchema: { value: ["anthropic"], evidence: { kind: "DOCUMENTED", source: "Claude Code sends MCP tools to the Messages API as input_schema; Anthropic tool use docs" } },
    version: { command: ["claude", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    // 2.1.322 re-verified live 2026-11-10 (D175 (2), research/48 addendum): windows 1M / 200K,
    // the compaction point with and without the percent override, every switch Ducter sets.
    verified: { from: "2.1.319", to: "2.1.322" },
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
    // OAR 0.124 (D416): a `status: compacting` frame also becomes compaction_started, once per agent.
    compactionEvents: { value: { started: true, ended: true }, evidence: { kind: "VERIFIED", how: "OAR 0.124.0 shared/stream-json/projection.js (read): compact_boundary becomes compaction_ended; a system status \"compacting\" frame compaction_started (OAR #984); not run live", date: "2026-11-20", version: "oar 0.124.0" } },
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
    noTools: {
      value: { args: ["--tools", ""] },
      evidence: {
        kind: "VERIFIED",
        how: "one haiku `-p` call each, scratch folder, --no-session-persistence, --strict-mcp-config, the judge's system prompt: denying 12 named built-ins sent 9,679 input tokens ($0.00194); --tools \"\" sent 629 ($0.00013), both answered {\"ok\": true} (research/48 addendum)",
        date: "2026-11-10",
        version: "2.1.322",
      },
    },
    noWeb: {
      value: { how: "WebFetch and WebSearch denied by name, like the write and run tools", deny: ["WebFetch", "WebSearch"], args: [], rows: [] },
      evidence: { kind: "DOCUMENTED", source: "Claude Code settings docs: disallowedTools takes built-in tool names; the same mechanism the read-only partner and the judge already use (TOOLS_OFF)" },
    },
    webLook: {
      value: { supported: true, how: "--tools WebSearch,WebFetch (an allowlist of built-ins: nothing else exists in the session), no MCP, the clean setup", args: ["--tools", "WebSearch,WebFetch"], rows: [], model: "haiku" },
      evidence: { kind: "VERIFIED", how: "research/149 §2: the init event of a session started so lists tools WebFetch and WebSearch only and no MCP server; §4: seven live looks through Ducter's own path", date: "2026-11-19", version: "2.1.327" },
    },
    readOnly: {
      value: { how: "built-ins that write or run denied by name (Bash, Edit, Write, Task, …); a Read is capped", tools: ["Read", "Grep", "Glob", "WebFetch", "WebSearch"] },
      evidence: { kind: "VERIFIED", how: "the partner eval's readonly smoke (results/2026-11-09-haiku-readonly-smoke.md): no write or run tool call in any scenario", date: D, version: "2.1.319" },
    },
    effort: {
      value: {
        levels: ["low", "medium", "high", "xhigh", "max"],
        how: "--effort <level> on open and again on --resume (it keeps no effort per session); OAR SessionOptions.effort, read back through get_settings",
        perModel: true,
        defaultListed: false,
      },
      evidence: {
        kind: "VERIFIED",
        how: "`claude --help`: `--effort <level>  Effort level for the current session (low, medium, high, xhigh, max)`; OAR listModels (list_models control request, token-free): each alias and id with its supportedEffortLevels (opus, fable, sonnet, haiku: all five; Haiku 4.5: none; Opus 4.6: no xhigh), and no default level listed",
        date: "2026-11-11",
        version: "2.1.322",
      },
    },
    memPlugin: {
      value: { host: "claude-code", ids: ["nowledge-mem@nowledge-community"], off: "settings", contextCost: "unknown" },
      evidence: { kind: "DOCUMENTED", source: "https://mem.nowledge.co/SKILL.md (read 2026-11-10), research/47 §3; enabledPlugins in the --settings JSON (runner/test/memory.test.ts)" },
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
    // D479: OpenAI models; MCP tools go out non-strict (codex-rs/tools/src/responses_api.rs strict: false).
    toolSchema: { value: ["openai"], evidence: { kind: "VERIFIED", how: "read openai/codex main codex-rs/tools/src/{responses_api,json_schema}.rs: MCP tools strict: false, a missing type filled in", date: "2026-11-22", version: "codex main" } },
    version: { command: ["codex", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    // 0.169.1 re-checked 2026-11-18 (D352): `codex debug models` and OAR listModels list two new
    // models (gpt-6.2-sol, gpt-6.2-astra); both knobs' keys are still typed i64.
    verified: { from: "0.167.0", to: "0.169.1" },
    models: {
      value: {
        "gpt-6.2-sol": { id: "gpt-6.2-sol", window: 500_000 },
        "gpt-6.2-astra": { id: "gpt-6.2-astra", window: 272_000 },
        "gpt-6.1-sol": { id: "gpt-6.1-sol", window: 500_000 },
        "gpt-6.1-terra": { id: "gpt-6.1-terra", window: 500_000 },
        "gpt-6-astra": { id: "gpt-6-astra", window: 272_000 },
        "gpt-6-sol": { id: "gpt-6-sol", window: 272_000 },
        "gpt-6-luna": { id: "gpt-6-luna", window: 272_000 },
        "gpt-5.6-sol": { id: "gpt-5.6-sol", window: 272_000 },
        "gpt-5.6-terra": { id: "gpt-5.6-terra", window: 272_000 },
        "gpt-5.6-luna": { id: "gpt-5.6-luna", window: 272_000 },
      },
      evidence: {
        kind: "VERIFIED",
        how: "`codex debug models`: context_window per listed model (max_context_window 872,000 for all), the hidden ones (visibility hide: gpt-reserve, codex-auto-review) left out; the older eight on 0.167.0, gpt-6.2-sol (500,000) and gpt-6.2-astra (272,000) on 0.169.1. A model the installed Codex lists that isn't here takes the window that listing gives it (liveModels, D352)",
        date: "2026-11-18",
        version: "0.169.1",
      },
    },
    effort: {
      value: {
        levels: ["low", "medium", "high", "xhigh", "max", "ultra"],
        how: "model_reasoning_effort on a new thread; a resume sets it on the loaded thread (OAR SessionOptions.effort)",
        perModel: true,
        defaultListed: true,
      },
      evidence: {
        kind: "VERIFIED",
        how: "OAR 0.95.1 listModels (app-server model/list): every model with its effortLevels and defaultEffort (gpt-6.2-sol, gpt-6.2-astra, gpt-6.1-sol, gpt-6.1-terra, gpt-5.6-sol: low..ultra, default low; gpt-6-astra, gpt-6-sol, gpt-5.6-terra: low..ultra, default medium; the luna models: low..max, default medium), the same in `codex debug models`; how it is applied: OAR 0.95.1 SessionOptions.effort docs",
        date: "2026-11-18",
        version: "0.169.1",
      },
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
    noTools: { value: { args: [] }, evidence: { kind: "INFERRED", why: "no per-session switch for Codex's own shell and patch tools is known; the judge's clean setup turns off plugins, apps and MCP, and named MCP tools are denied" } },
    noWeb: {
      value: { how: '-c web_search="disabled" (its hosted web_search tool; the read-only sandbox already keeps the shell off the network)', deny: [], args: ["-c", 'web_search="disabled"'], rows: [] },
      evidence: { kind: "VERIFIED", how: "`codex debug prompt-input -c web_search=\"bogus\"` -> unknown variant `bogus`, expected one of `disabled`, `cached`, `indexed`, `live` in `web_search`; \"disabled\" parses (the tool is hosted, so prompt-input doesn't list it: its absence in a session is DOCUMENTED by Codex's config docs, not measured)", date: "2026-11-19", version: "0.170.0" },
    },
    webLook: {
      value: { supported: false, how: "not offered: its shell can't be turned off for one session (noTools), so a look would hold files and a shell beside the page; a browsing task does it", args: [], rows: [] },
      evidence: { kind: "INFERRED", why: "no per-session switch for Codex's own shell is known (noTools above); a page could steer a read-only shell into a search query" },
    },
    readOnly: {
      value: { how: '-c sandbox_mode="read-only" after OAR\'s own override: shell commands still run, read-only and without network', tools: ["shell (read-only sandbox)"] },
      evidence: { kind: "VERIFIED", how: "app-server config/read shows read-only in the session-flags layer; results/2026-11-10-codex-gpt-6-luna-readonly-smoke.md", date: "2026-11-10", version: "0.167.0" },
    },
    memPlugin: {
      value: { host: "codex-cli", ids: ["nowledge-mem@nowledge-community"], off: "config", contextCost: "unknown" },
      evidence: {
        kind: "INFERRED",
        why: "ids and the bare -c plugin path are DOCUMENTED (https://mem.nowledge.co/SKILL.md (read 2026-11-10), research/47 §3; research/38 §1 for the bare id). Not proven: the setup guide adds 'its hooks script' as well; if that lands in the user's own hooks rather than the plugin's, turning the plugin off may leave its SessionStart hook running. Live check owed (design/todo.md).",
      },
    },
    channels: {
      value: {
        npm: "@openai/codex",
        // D362 (research/131): the binary rides in an optional dependency aliased to this
        // package's own `{v}-{os}-{arch}` version (155 MB for 0.170.0 darwin-arm64).
        npmBlob: "@openai/codex/-/codex-{v}-{os}-{arch}.tgz",
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
        how: "research/42 §2: `codex update --help`, `codex doctor --json` (install context npm, update action npm install -g @openai/codex), install.sh --help (--release VERSION, CODEX_NON_INTERACTIVE), brew info --cask (read-only); research/131: npmBlob, `npm view @openai/codex@0.170.0 optionalDependencies` and a scratch-prefix install from a cache filled with that tarball (2026-11-18)",
        date: "2026-11-10",
        version: "0.167.0",
      },
    },
  },
  pi: {
    harness: "pi",
    // D479: pi runs any provider's model (Anthropic, OpenAI, Google, DeepSeek): the tools must suit them all.
    toolSchema: { value: ["anthropic", "openai", "gemini"], evidence: { kind: "INFERRED", why: "pi passes MCP schemas to whichever provider the session's model is on (OAR's MCP extension registers them as pi tools); its Google provider is the Gemini API" } },
    version: { command: ["pi", "--version"], pattern: /(\d+\.\d+\.\d+)/ },
    // 1.5.1 re-checked 2026-11-10 (D175 (2)): every flag Ducter passes is in `pi --help`, still no
    // window flag, compaction.reserveTokens still in its settings schema.
    verified: { from: "1.4.0", to: "1.5.1" },
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
    noTools: { value: { args: ["--no-tools"] }, evidence: { kind: "DOCUMENTED", source: "`pi --help` 1.5.1: --no-tools disables all tools by default (built-in and extension)" } },
    noWeb: { value: { how: "nothing to drop: its read-only allowlist (read, grep, find, ls) has no web tool", deny: [], args: [], rows: [] }, evidence: PI_LIVE },
    webLook: { value: { supported: false, how: "not offered: pi has no web tool of its own", args: [], rows: [] }, evidence: pi("`pi --help` (research/38): read, bash, edit, write; extensions only") },
    readOnly: {
      value: { how: "an allowlist: `--tools read,grep,find,ls` on its RPC process, and bash, edit and write excluded by name (OAR excludeTools)", tools: [...PI_READ_ONLY_TOOLS] },
      evidence: PI_LIVE,
    },
    memPlugin: {
      value: { host: "pi", ids: ["npm:nowledge-mem-pi"], off: "flag", contextCost: "unknown" },
      evidence: { kind: "DOCUMENTED", source: "https://mem.nowledge.co/SKILL.md (read 2026-11-10), research/47 §3 (`pi install npm:nowledge-mem-pi`); `pi --help`: --no-extensions disables extension discovery, explicit -e paths still load (research/03 §4.1)" },
    },
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
    // D479: DeepSeek's API is OpenAI-compatible function calling.
    toolSchema: { value: ["openai"], evidence: { kind: "INFERRED", why: "DeepSeek's chat API takes OpenAI-shaped tools; DSH bridges MCP tools to it" } },
    // It ships prereleases (0.2.2-rc.1): the version keeps its tag, which orders before 0.2.2.
    version: { command: ["dsh", "--version"], pattern: /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/ },
    // 0.2.2-rc.1 installed into a scratch prefix and run live 2026-11-10 (D177, research/50);
    // 0.2.2-rc.3 run live 2026-11-18 through Ducter's runner, both the copy inside DeepSeek
    // Harness.app and npm's in a scratch prefix: a read-only turn in a home of Ducter's on the key
    // route and on the account route, and a task's shell tool (D371, research/140 §5).
    verified: { from: "0.2.2-rc.1", to: "0.2.2-rc.3" },
    models: {
      value: {
        "deepseek-official/deepseek-flash": { id: "deepseek-official/deepseek-flash", window: DSH_PROFILE.officialWindow },
        "deepseek-official/deepseek-v4-pro": { id: "deepseek-official/deepseek-v4-pro", window: DSH_PROFILE.officialWindow },
        "deepseek-flash": { id: "deepseek-official/deepseek-flash", window: DSH_PROFILE.officialWindow },
        "deepseek-v4-pro": { id: "deepseek-official/deepseek-v4-pro", window: DSH_PROFILE.officialWindow },
        // D371: the same models on the DeepSeek account's route (the app's 登录), research/140 §4:
        // its listing named both, and a turn on it reported the same 1,048,576 window.
        "deepseek-account/deepseek-flash": { id: "deepseek-account/deepseek-flash", window: DSH_PROFILE.officialWindow },
        "deepseek-account/deepseek-v4-pro": { id: "deepseek-account/deepseek-v4-pro", window: DSH_PROFILE.officialWindow },
      },
      evidence: DSH_LIVE("DeepSeek's GET /models: context_window 1,048,576 and max_output_tokens 393,216 for deepseek-flash (DeepSeek-V4.1-Flash) and deepseek-v4-pro; DSH's own catalog (dsh-llm-deepseek OFFICIAL_CONTEXT_WINDOW) the same"),
    },
    windowKnob: {
      value: { via: "none", key: "", note: "the model's catalog window (1M for both official models); only the compaction point is set" },
      evidence: DSH_LIVE("dsh-compaction-basic README: the trigger is a fraction of the routed model's window W; no per-session window"),
    },
    compactAtKnob: {
      value: { via: "profile", key: `${DSH_PROFILE.compaction}.thresholdRatio`, unit: "percent", min: 0, max: 1, note: "a fraction of W, in a Ducter-owned home's profile layer only; a task under the user's own home keeps the user's" },
      evidence: DSH_LIVE("research/50 §3: thresholdRatio set in the home's profile layer moved the compaction point live (compaction_started/ended through OAR at the set size)"),
    },
    defaultCompactAt: { value: "floor(min(W x 0.8, W - O - 65,536)); W 1,048,576: about 590K", evidence: { kind: "DOCUMENTED", source: "dsh-compaction-basic README 0.2.2-rc.1 (thresholdRatio 0.8, headroomTokens 65,536)" } },
    preCompactHook: { value: { supported: false }, evidence: { kind: "INFERRED", why: "no pre-compaction hook among the acp profile's rows (dsh --dump-config 0.2.2-rc.1); retainRatio/retainTokens set what stays verbatim" } },
    compactionEvents: { value: { started: true, ended: true }, evidence: DSH_LIVE("research/50 §3: both reached Ducter through OAR runtimes/dsh/projection.js") },
    contextReport: { value: "the last request's total tokens (input + cache read), OAR contextUsage", evidence: DSH_LIVE("research/50 §2: contextTokens on every turn end, equal to the session log's usage.totalTokens") },
    toolSearch: { value: "stdio MCP through Ducter's bridge; loaded up front, named mcp__<server>__<tool>", evidence: DSH_LIVE("research/50 §2: the session's tool list") },
    resume: { value: { supported: true, how: "OAR SessionOptions.resume, sessions kept under DSH_HOME/sessions" }, evidence: DSH_LIVE("research/50 §2: resumed by id with its history") },
    browser: { value: "none (web_search / web_fetch over DeepSeek's API; no browser)", evidence: DSH_LIVE("the acp profile's tool-web row") },
    noTools: {
      value: { args: [] },
      evidence: DSH_LIVE("research/50 §2: no launch arguments (OAR owns them); a one-shot's Ducter-owned home drops every tool row in its profile layer (DSH_PROFILE.readOnlyOff + noToolsOff), and the session's tool list was empty"),
    },
    noWeb: {
      value: { how: "the partner's Ducter-owned home also drops the tool-web row (web_search, web_fetch)", deny: [], args: [], rows: ["tool-web"] },
      evidence: DSH_LIVE("research/50 §2: a one-shot's home drops tool-web among DSH_PROFILE.noToolsOff and its session's tool list was empty; the row alone for the partner is the same mechanism, not measured on its own"),
    },
    webLook: {
      value: { supported: true, how: "a Ducter-owned home whose profile layer drops every tool row but tool-web (the read-only rows, tool-fs, tool-fs-search, mcp-resources), with DSH's read-only sandbox preset underneath", args: [], rows: ["tool-fs", "tool-fs-search", "mcp-resources"], model: "deepseek-official/deepseek-flash" },
      evidence: { kind: "INFERRED", why: "research/50 §2: the same profile layer dropped every tool row for a one-shot (VERIFIED); keeping tool-web alone is that mechanism, not measured on its own (research/149 §2)" },
    },
    readOnly: {
      value: { how: "a Ducter-owned home whose profile layer drops every tool that runs, writes, delegates or plans (DSH_PROFILE.readOnlyOff), tool-fs keeps only read, and DSH_PERMISSION_MODE=read-only underneath", tools: ["read", "read_image", "glob", "grep", "web_search", "web_fetch"] },
      evidence: DSH_LIVE("research/50 §2: before, the partner session wrote a file and ran touch (bash, write); after, neither tool existed, neither file was made, Ducter's MCP tools still answered"),
    },
    memPlugin: {
      value: { host: "deepseek-harness", ids: ["nowledge-mem"], off: "home", contextCost: "unknown" },
      evidence: { kind: "INFERRED", why: "the author's inspect fixture lists a dsh_profile_bundle 0.1.2 for host deepseek-harness (packages/protocol/fixtures/mem-inspect); DSH is not installed on the verifying Mac, so no per-session profile switch is known; a Ducter-owned DSH_HOME (as the partner's clean setup) loads none of the user's profiles" },
    },
    channels: {
      // D371 (research/140): the desktop app carries its own `dsh` (Resources/runtime/cli/bin, a
      // shell launcher that runs the app's Electron as node) and updates it with itself; its
      // "install the command" puts /usr/local/bin/dsh, a link back into the app.
      value: { npm: "@deepseek-ai/dsh", app: { marks: ["/DeepSeek Harness.app/Contents/"], name: "DeepSeek Harness" } },
      evidence: {
        kind: "VERIFIED",
        how: "OAR 0.95.1 runtimes/dsh/install.js (npm package @deepseek-ai/dsh), research/34, research/42 §4; research/140: DeepSeek Harness.app 0.2.2-rc.3 read only (Contents/Resources/runtime/cli/bin/dsh, its command manager's /usr/local/bin/dsh link, its update feed)",
        date: "2026-11-18",
        version: "0.2.2-rc.3",
      },
    },
  },
  // D416: never run by Ducter yet; every fact is OAR 0.124's own (its docs and shipped source).
  antigravity: {
    harness: "antigravity",
    // D479: agy hands MCP tools to Gemini as FunctionDeclaration.parameters (OpenAPI subset), whichever model is chosen.
    toolSchema: { value: ["gemini"], evidence: { kind: "VERIFIED", how: "hel 2026-11-22: GenerateContentRequest.tools[0].function_declarations[18].parameters... missing field, on Ducter's wait_for", date: "2026-11-22", version: "1.5.14" } },
    // agy prints a bare release ("1.5.13"); OAR accepts only that line (version.js).
    version: { command: ["agy", "--version"], pattern: /^(\d+\.\d+\.\d+)\s*$/m },
    // OAR's own range: its floor to the newest agy its docs report on (1.5.12, real Gemini sessions; its CI pins 1.5.11).
    verified: { from: ANTIGRAVITY.minVersion, to: "1.5.12" },
    models: { value: {}, evidence: AGY("model ids come from its own catalog (listModels opens one temporary ACP session, no prompt); 1.5.0 lists grouped ids such as gemini-3.8-flash") },
    windowKnob: { value: { via: "none", key: "", note: "the model's own window (usage_update.size 1,048,576 on a Gemini account); no per-session setting" }, evidence: AGY("context usage: 474 updates on 1.5.12, size 1,048,576") },
    compactAtKnob: { value: { via: "none", key: "", note: "agy compacts by itself; no setting Ducter can pass" }, evidence: AGY("no compaction setting; /compact advertised but unverified") },
    defaultCompactAt: { value: "agy's own (seen falling from 521,323 to 13,154 tokens at a native compaction)", evidence: AGY("context usage, 1.5.12") },
    preCompactHook: { value: { supported: false }, evidence: AGY("no hook channel") },
    compactionEvents: { value: { started: false, ended: false }, evidence: AGY("manualCompaction unsupported: no structured completion or attribution contract") },
    contextReport: { value: "usage_update.used, the current context size (OAR contextUsage); none after a turn ended on the quota notice", evidence: AGY("context usage, 1.5.12") },
    toolSearch: { value: "Ducter's MCP through its stdio bridge (no credentials in the entry), named mcp_<server>_<tool>", evidence: AGY("session MCP servers: credential-free stdio and HTTP attach; entries with env or headers refused") },
    resume: {
      value: { supported: true, how: "session/resume by id, only in the folder it was made in (ResumeCwdError elsewhere: a fresh session from the brief and saved progress); model, effort and instructions are passed again" },
      evidence: AGY("session creation and resume: a native session/list entry with the same saved cwd is required"),
    },
    browser: { value: "none Ducter uses (its tools are agy's own: run_command, read_file, edit_file, web search)", evidence: AGY("shared activity mappings") },
    noTools: { value: { args: [] }, evidence: { kind: "INFERRED", why: "OAR refuses disallowedTools and has no allowlist for agy: it is never a one-shot (partner false)" } },
    noWeb: { value: { how: "not offered: tool denial is refused, so it is never the partner", deny: [], args: [], rows: [] }, evidence: AGY("disallowed tools: refused before launch") },
    webLook: { value: { supported: false, how: "not offered: no session can be held to its web tools alone", args: [], rows: [] }, evidence: AGY("disallowed tools and userConfiguration exclude refused") },
    readOnly: { value: { how: "not possible: tool denial and leaving the person's setup out are refused, so it never carries the partner", tools: [] }, evidence: AGY("disallowed tools; user configuration") },
    effort: {
      value: { levels: ["low", "medium", "high"], how: "its thought_level config option, set and confirmed on open and again on resume (OAR SessionOptions.effort)", perModel: true, defaultListed: false },
      evidence: AGY("listModels selects each model and reads its own thought_level menu (Flash: low/medium/high; Sonnet, Opus thinking and GPT-OSS none); only the current model's effort can be its default"),
    },
    memSteps: {
      value: { contextApp: "google-antigravity", threadFrom: "antigravity", plugin: "nowledge-mem-google-antigravity" },
      evidence: { kind: "DOCUMENTED", source: "research/172: Mem's Antigravity plugin 0.1.3 (PreInvocation reads `nmem context --source-app google-antigravity`, Stop saves agy's transcript; loaded only from .agents/plugins or ~/.gemini/config/plugins, no per-session flag); `nmem t save --help` 0.10.121 (`--from antigravity` reads agy's brain/<conversationId>/.system_generated/logs/transcript.jsonl)" },
    },
    channels: {
      // Its own installer copies a flat binary to ~/.local/bin/agy and agy updates itself in the
      // background; `agy update` replaces that same file. No npm, no cask, no pinned version.
      value: { installer: { mark: "/bin/agy", update: ["agy", "update"], latest: ANTIGRAVITY.manifest } },
      evidence: { kind: "DOCUMENTED", source: "OAR 0.124.0 runtimes/antigravity/{install,update}.js; https://antigravity.google/cli/install.sh (read 2026-11-20): the manifest, its sha512, ~/.local/bin/agy, \"automatically self-updates in the background\"" },
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
  /** DeepSeek Harness profile-layer rows (DSH_PROFILE), applied only in a home Ducter owns. */
  profile?: Record<string, unknown>[];
  /** Not enforceable on this harness (pi; DeepSeek Harness under the user's own home): left to its defaults. */
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
export function windowKnobs(h: HarnessId, plan: WindowPlan, model?: string, liveWindow?: number): WindowKnobs {
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
    case "codex": {
      // D352: never more than the model's own window (the registry's, else what Codex listed):
      // model_context_window above it would let a turn overflow before the compactor fires.
      const cap = (model && f.models.value[model]?.window) || liveWindow;
      const w = cap ? Math.min(window, cap) : window;
      return { env: {}, args: ["-c", `${f.windowKnob.value.key}=${w}`, "-c", `${f.compactAtKnob.value.key}=${Math.min(compactAt, w)}`], settings: {} };
    }
    case "deepseek-harness": {
      // The compactor fires at a fraction of the model's own window (research/50 §3): the plan's
      // compaction point over that window. The window itself can't be narrowed.
      const w = (model && f.models.value[model]?.window) || DSH_PROFILE.officialWindow;
      const ratio = Math.min(0.8, Math.max(0.01, Math.ceil((compactAt / w) * 1e6) / 1e6));
      // Its default retention (16% of the window, ~104K) at or above the threshold rejects the
      // whole plugin at load, silently: no compaction and no overflow recovery (research/50 §3).
      // A quarter of the compaction point stays verbatim instead.
      return { env: {}, args: [], settings: {}, profile: [{ id: DSH_PROFILE.compaction, config: { thresholdRatio: ratio, retainTokens: Math.round(Math.min(compactAt, w * ratio) / 4) } }] };
    }
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

// ---------- the live model list (D352) ----------

/** One model as the agent's own catalog describes it, beyond what its picker list says. */
export interface CatalogEntry {
  window?: number;
  defaultEffort?: string;
  efforts?: string[];
}

/**
 * `codex debug models` (token-free, local): each visible model's window and effort menu, keyed by
 * slug. Hidden models (visibility "hide": gpt-reserve, codex-auto-review on 0.169.1) are left out,
 * as Codex's own picker leaves them out. Anything that isn't its JSON gives an empty catalog.
 */
export function parseCodexCatalog(out: string): Record<string, CatalogEntry> {
  const at = out.indexOf("{");
  if (at < 0) return {};
  try {
    const j = JSON.parse(out.slice(at)) as { models?: { slug?: unknown; context_window?: unknown; visibility?: unknown; default_reasoning_level?: unknown; supported_reasoning_levels?: { effort?: unknown }[] }[] };
    const cat: Record<string, CatalogEntry> = {};
    for (const m of j.models ?? []) {
      if (typeof m.slug !== "string" || !m.slug || m.visibility === "hide") continue;
      const efforts = (m.supported_reasoning_levels ?? []).map((l) => l?.effort).filter((e): e is string => typeof e === "string");
      cat[m.slug] = {
        ...(typeof m.context_window === "number" && m.context_window > 0 ? { window: m.context_window } : {}),
        ...(typeof m.default_reasoning_level === "string" ? { defaultEffort: m.default_reasoning_level } : {}),
        ...(efforts.length ? { efforts } : {}),
      };
    }
    return cat;
  } catch {
    return {};
  }
}

/**
 * D352: the agent's own list (OAR listModels, the live truth of what this account can run now)
 * merged with the registry. The list decides which models there are and in what order; a model
 * the registry knows takes its window; one it doesn't is marked `fresh` and takes what the
 * agent's catalog says (its window, and its effort menu where the list gave none). A model the
 * catalog hides never comes in through it: only the list adds models.
 */
export function liveModels(h: HarnessId, listed: readonly ListedModel[], catalog: Readonly<Record<string, CatalogEntry>> = {}): ListedModel[] {
  const known = HARNESS_FACTS[h].models.value;
  const registryKnows = Object.keys(known).length > 0;
  return listed.map((m) => {
    const k = known[m.id];
    const c = catalog[m.id];
    const window = k?.window ?? c?.window;
    return {
      ...m,
      ...(!m.efforts?.length && c?.efforts?.length ? { efforts: c.efforts } : {}),
      ...(!m.defaultEffort && c?.defaultEffort ? { defaultEffort: c.defaultEffort } : {}),
      ...(window ? { window } : {}),
      // pi and others whose registry is empty name every model by its own catalog: none is "new".
      ...(registryKnows && !k ? { fresh: true as const } : {}),
    };
  });
}

/** What a user typed for a model, folded so "6.2 sol", "GPT-6.2-Sol" and "gpt 6.2 sol" compare alike. */
const foldModel = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const bareModel = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");

/**
 * D352: the model a person named ("6.2 sol", "opus", "gpt-6.2-sol"), as one of the agent's ids:
 * the list's (live) when there is one, else the registry's. Exact id first, then the label, then
 * the one id that ends with the words they said. Several: which ones; none: what there is.
 */
export function resolveModel(h: HarnessId, said: string, list?: readonly { id: string; label?: string }[]): { id: string } | { ambiguous: string[] } | { none: string[] } {
  const ids = list?.length ? list.map((m) => ({ id: m.id, label: m.label ?? m.id })) : Object.keys(HARNESS_FACTS[h].models.value).map((id) => ({ id, label: id }));
  const s = foldModel(said);
  const b = bareModel(said);
  if (!s) return { none: ids.map((m) => m.id) };
  const exact = ids.filter((m) => foldModel(m.id) === s || foldModel(m.label) === s || bareModel(m.id) === b || bareModel(m.label) === b);
  if (exact.length === 1) return { id: exact[0]!.id };
  // Word-bounded first ("6 sol" is gpt-6-sol, not gpt-5.6-sol), then run together ("6.2sol").
  let tail = ids.filter((m) => foldModel(m.id).endsWith(`-${s}`));
  if (!tail.length && b) tail = ids.filter((m) => bareModel(m.id).endsWith(b));
  if (tail.length === 1) return { id: tail[0]!.id };
  if (tail.length > 1) return { ambiguous: tail.map((m) => m.id) };
  return { none: ids.map((m) => m.id) };
}

// ---------- versions ----------

/** semver order with prereleases (0.2.2-rc.1 < 0.2.2), numeric parts compared as numbers. */
export function compareVersions(a: string, b: string): number {
  const re = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/;
  const x = re.exec(a.trim()) ?? [a, a, undefined];
  const y = re.exec(b.trim()) ?? [b, b, undefined];
  const nums = (v: string) => v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const [cx, cy] = [nums(x[1]!), nums(y[1]!)];
  for (let i = 0; i < Math.max(cx.length, cy.length); i++) {
    const d = (cx[i] ?? 0) - (cy[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (!x[2] || !y[2]) return x[2] ? -1 : y[2] ? 1 : 0;
  const [px, py] = [x[2].split("."), y[2].split(".")];
  for (let i = 0; i < Math.max(px.length, py.length); i++) {
    if (px[i] === undefined) return -1;
    if (py[i] === undefined) return 1;
    const [nx, ny] = [Number(px[i]), Number(py[i])];
    if (/^\d+$/.test(px[i]!) && /^\d+$/.test(py[i]!)) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (px[i] !== py[i]) return px[i]! < py[i]! ? -1 : 1;
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

/**
 * D233: how long one Ducter tool call may wait for the person (ask_for_key holds the call open
 * while its card is fresh, then answers "the card stays; end your turn"). Under each harness's own
 * limit on an MCP call, so an answer is never lost to a timeout the home can't see; past it, the
 * task is resumed with a message when the person answers.
 */
export const MCP_CALL_WAIT: Record<HarnessId, Fact<number>> = {
  "claude-code": { value: 5 * 60_000, evidence: { kind: "DOCUMENTED", source: "Claude Code docs: MCP_TOOL_TIMEOUT sets the MCP tool timeout, default far above minutes (child-env.ts passes a user's own through)" } },
  codex: { value: 50_000, evidence: { kind: "DOCUMENTED", source: "Codex config docs: mcp_servers.<id>.tool_timeout_sec, default 60 s" } },
  pi: { value: 50_000, evidence: { kind: "INFERRED", why: "OAR's MCP bridge for pi names no limit; kept under the shortest known (Codex's 60 s)" } },
  "deepseek-harness": { value: 50_000, evidence: { kind: "INFERRED", why: "no documented MCP call limit; kept under the shortest known (Codex's 60 s)" } },
  antigravity: { value: 50_000, evidence: { kind: "INFERRED", why: "no documented MCP call limit; kept under the shortest known (Codex's 60 s)" } },
};
