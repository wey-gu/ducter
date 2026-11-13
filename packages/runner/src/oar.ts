// HarnessPort over OAR. This is the ONLY module that imports OAR values, and it imports the
// per-runtime entries (never the root entry: ~50 MB heap, and it fails to load under Bun 1.3.1
// because runtimes/kimi imports node:util getSystemErrorMap). No OAR type crosses this file's
// exports: callers see only Ducter's HarnessPort / HarnessSession / HarnessEvent.
//
// D85: four first-wave harnesses, each able to carry the partner and tasks. What differs per
// harness (research/34-harness-adapters.md) is decided here, in one place:
//   - the clean setup (isolateUserConfig): claude native exclude; codex `-c` overrides; pi CLI
//     flags on its RPC process; DeepSeek Harness a Ducter-owned DSH_HOME;
//   - the system prompt: native where OAR verified it; else AGENTS.md in the Ducter-owned home
//     (DeepSeek Harness, isolated) or the first message (DeepSeek Harness tasks);
//   - Ducter's MCP endpoint: HTTP with headers, or the stdio bridge (DeepSeek Harness);
//   - tool denials only where the harness can honor them.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DSH_KEY_ENV, HARNESS_IDS, type HarnessId } from "@ducter/protocol";
import { readEnvFile, readKeys } from "@ducter/protocol/src/keys.ts";
import { CLAUDE_SWITCHES, DSH_PROFILE, HARNESS_FACTS, PI_READ_ONLY_TOOLS, modelForWindow, windowKnobs } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, ListedModel, SessionSpec } from "@ducter/protocol/src/internal.ts";
import type { Runtime, Session, SessionOptions, McpServer } from "@botiverse/oar/browser";
import { Normalizer } from "./normalize.ts";
import { bridgeCommand, writeBridgeTarget } from "./mcp-bridge.ts";
import { childEnvOverlay } from "./child-env.ts";
import { CODEX_NATIVE_MCP, CODEX_NATIVE_PLUGINS } from "@ducter/protocol/src/native-browser.ts";

export type { HarnessId };

/** Native features that compete with Ducter (it owns waits, wakes, and talking to the human). */
const DISALLOWED: Partial<Record<HarnessId, string[]>> = {
  "claude-code": ["EnterPlanMode", "ExitPlanMode", "ScheduleWakeup", "CronCreate", "CronList", "CronDelete", "AskUserQuestion"],
};

/** pi's own CLI flags that leave the user's pi setup out (pi --help, 1.4.0+). Login and models stay. */
export const PI_CLEAN_FLAGS = ["--no-skills", "--no-context-files", "--no-prompt-templates", "--no-extensions", "--no-themes"];
/**
 * Memory off in a pi task that keeps the user's setup (harness-facts memPlugin "flag"): pi has no
 * per-package switch, so every extension the user installed is off for that session, Mem's among
 * them; their skills, context files and prompt templates stay (research/48 M3).
 */
export const PI_MEM_OFF_FLAGS = ["--no-extensions"];
/**
 * D177: a read-only (partner) pi session keeps only pi's reading tools, by allowlist, so a tool a
 * later pi adds is off until named here; Ducter's MCP tools (its RPC extension's) stay (research/50 §2).
 */
export const PI_READ_ONLY_FLAGS = ["--tools", PI_READ_ONLY_TOOLS.join(",")];

export type PiVariant = { clean?: boolean; extensionsOff?: boolean; noTools?: boolean; readOnly?: boolean };

/** Which pi runtime a session needs: Ducter's clean setup, the user's setup without extensions (memory off), or the user's own. */
export function piVariant(spec: Pick<SessionSpec, "harness" | "isolateUserConfig" | "disablePlugins" | "noTools" | "readOnly">): PiVariant | undefined {
  if (spec.harness !== "pi") return undefined;
  if (spec.isolateUserConfig) return { clean: true, ...(spec.noTools ? { noTools: true } : spec.readOnly ? { readOnly: true } : {}) };
  if (spec.disablePlugins?.length) return { extensionsOff: true, ...(spec.readOnly ? { readOnly: true } : {}) };
  return spec.readOnly ? { readOnly: true } : undefined;
}

/** The flags one pi variant runs with (exported for tests). */
export function piFlags(v: PiVariant | undefined): string[] {
  return [
    ...(v?.clean ? PI_CLEAN_FLAGS : v?.extensionsOff ? PI_MEM_OFF_FLAGS : []),
    ...(v?.noTools ? HARNESS_FACTS.pi.noTools.value.args : v?.readOnly ? PI_READ_ONLY_FLAGS : []),
  ];
}

/**
 * D177: DeepSeek Harness's profile layer for a home Ducter owns (DSH_PROFILE, research/50): the
 * session's prompt as the whole system-prompt opener, the tools a read-only or tool-less session
 * may not have dropped, the session-log upload off, and the compaction point.
 */
export function dshLayer(o: { prompt?: string; readOnly?: boolean; noTools?: boolean; compaction?: Record<string, unknown>[] }): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  if (o.prompt) rows.push({ id: DSH_PROFILE.systemPrompt, config: { includeHarnessIdentity: false, personaPrefix: o.prompt } });
  if (o.readOnly || o.noTools) {
    for (const id of DSH_PROFILE.readOnlyOff) rows.push({ id, disabled: true });
    if (o.noTools) for (const id of DSH_PROFILE.noToolsOff) rows.push({ id, disabled: true });
    else rows.push({ id: DSH_PROFILE.fs, config: { write: false, edit: false, applyPatch: false } });
  }
  rows.push({ id: DSH_PROFILE.sessionLog, config: { enabled: false } });
  rows.push(...(o.compaction ?? []));
  return rows;
}

/** Writes a Ducter-owned DSH home: its profile layer and its user-global AGENTS.md. */
function writeDshHome(home: string, layer: Record<string, unknown>[], agentsMd: string): { home: string; agents: string } {
  const agents = join(home, "agents");
  const profile = join(home, "profiles", DSH_PROFILE.profile);
  mkdirSync(agents, { recursive: true, mode: 0o700 });
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  // JSON is YAML: no `!!js` tag can ride in on the prompt's text.
  writeFileSync(join(profile, DSH_PROFILE.layerFile), JSON.stringify(layer, null, 2) + "\n", { mode: 0o600 });
  // No file when there is nothing to say: an empty one still costs an empty "workspace instructions" message.
  if (agentsMd) writeFileSync(join(home, "AGENTS.md"), agentsMd + "\n", { mode: 0o600 });
  else rmSync(join(home, "AGENTS.md"), { force: true });
  return { home, agents };
}

/**
 * `-c` overrides that give a codex session Ducter's clean setup while it keeps CODEX_HOME (the
 * login, the provider route, resume): every MCP server the user configured is disabled by name
 * (a `mcp_servers={}` override merges, it does not replace: research/34), and the features that
 * load the user's hooks, plugins (their skills and MCP servers), apps and memories are off. The
 * partner also leaves out images and computer use. Goals (Ducter owns when a task's turn ends) and
 * subagents stay off for tasks too (D240): a Claude Code subagent never sees the task's brief
 * (research/76, verified), a Codex one is not checked, and a task under this setup has Codex's
 * browser or Computer Use, whose rules live in that brief.
 *
 * `nativeTools` (tasks, D130): Codex's own browser and Computer Use stay. Plugins stay on as a
 * feature, every plugin the user enabled is turned off by id except the four bundled browser /
 * computer-use ones, and the desktop app's `node_repl` server stays. The plugin id goes in bare
 * (`plugins.chatcut@chatcut-inc.enabled=false`): a quoted id is not matched (verified against
 * `mcpServerStatus/list`, codex-cli 0.167.0, 2026-11-09; research/38 §1).
 */
export function codexCleanArgs(config: CodexConfig | undefined, keep: string[] = [], o: { nativeTools?: boolean } = {}): string[] {
  const keepServers = o.nativeTools ? [...keep, ...CODEX_NATIVE_MCP] : keep;
  const names = Object.keys(config?.mcp_servers ?? {}).filter((n) => !keepServers.includes(n));
  const key = (n: string) => (/^[A-Za-z0-9_-]+$/.test(n) ? n : JSON.stringify(n));
  const native = ["computer_use", "browser_use"];
  // D206: a task keeps Codex's image generation (画一张… / Draw…: the picture comes back in its
  // report); the partner never draws itself, it opens a task for that.
  const off = ["hooks", "codex_hooks", "plugin_hooks", "plugins", "apps", "memories", "js_repl", "goals", "multi_agent", "image_generation", ...native].filter(
    (f) => !(o.nativeTools && (f === "plugins" || f === "plugin_hooks" || f === "image_generation" || native.includes(f))),
  );
  // Plugin ids that a dotted -c path can name (an id with a dot can't be addressed bare).
  const plugins = o.nativeTools
    ? Object.entries(config?.plugins ?? {})
        .filter(([id, p]) => p?.enabled !== false && !CODEX_NATIVE_PLUGINS.includes(id) && /^[A-Za-z0-9_@-]+$/.test(id))
        .map(([id]) => id)
    : [];
  return [
    ...names.flatMap((n) => ["-c", `mcp_servers.${key(n)}.enabled=false`]),
    ...plugins.flatMap((id) => ["-c", `plugins.${id}.enabled=false`]),
    ...off.flatMap((f) => ["-c", `features.${f}=false`]),
    "-c",
    "notify=[]",
  ];
}

/**
 * D135: every session runs on a small window, with the values protocol/harness-facts.ts holds
 * for the installed build (research/11 §7.3.7):
 *   - Claude Code 2.1.319: CLAUDE_CODE_DISABLE_1M_CONTEXT=1 (otherwise every model name gets 1M
 *     on a Max account, alias or full id), CLAUDE_CODE_AUTO_COMPACT_WINDOW=<window>, and
 *     CLAUDE_AUTOCOMPACT_PCT_OVERRIDE when the compaction point sits below the default one
 *     (window - 33K). The partner's folder gets `idleCompaction: false` and
 *     `precomputeCompactionEnabled: false` in .claude/settings.local.json (its clean setup keeps
 *     the project and local sources; `--settings` is OAR's under userConfiguration "exclude").
 *     A task gets `idleCompaction: false` and a PreCompact hook through `--settings`, so its
 *     worktree stays clean; under "exclude" (a browser place) through its folder's settings file.
 *   - Codex 0.167: `-c model_context_window=<window> -c model_auto_compact_token_limit=<n>`.
 * pi and DeepSeek Harness: no per-session knob (design/todo.md).
 */
export const CLAUDE_COMPACT_SETTINGS = { idleCompaction: false, precomputeCompactionEnabled: false } as const;

function writeClaudeSettings(cwd: string, settings: Record<string, unknown>): void {
  const file = join(cwd, ".claude", "settings.local.json");
  let cur: Record<string, unknown> = {};
  try {
    cur = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    /* none yet */
  }
  if (Object.entries(settings).every(([k, v]) => JSON.stringify(cur[k]) === JSON.stringify(v))) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...cur, ...settings }, null, 2) + "\n");
}

/** A shell-safe PreCompact hook printing the note: Claude Code appends it to its compact instructions. */
export function preCompactHooks(note: string): Record<string, unknown> {
  const quoted = `'${note.replace(/'/g, `'\\''`)}'`;
  return { PreCompact: [{ matcher: "auto", hooks: [{ type: "command", command: `printf '%s\\n' ${quoted}`, timeout: 10 }] }] };
}

type CodexConfig = {
  mcp_servers?: Record<string, unknown>;
  model_providers?: Record<string, { env_key?: unknown }>;
  plugins?: Record<string, { enabled?: unknown } | undefined>;
};

function readCodexConfig(env: Record<string, string | null | undefined>): CodexConfig | undefined {
  const home = env.CODEX_HOME || process.env.CODEX_HOME || join(homedir(), ".codex");
  try {
    return Bun.TOML.parse(readFileSync(join(home, "config.toml"), "utf8")) as CodexConfig;
  } catch {
    return undefined; // no config, or one codex itself would refuse: nothing of the user's to leave out
  }
}

/** The key names Codex's own config routes a custom provider through (`model_providers.<id>.env_key`). */
export function codexKeyNames(config: CodexConfig | undefined): string[] {
  return Object.values(config?.model_providers ?? {})
    .map((p) => p?.env_key)
    .filter((k): k is string => typeof k === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
}

/**
 * A harness key: the env Ducter runs with first, then Ducter's key file (<dataDir>/keys.env,
 * 0600, D102). Never logged, never in the Log, and passed only to the harness HARNESS_KEYS grants.
 */
export function harnessKey(dataDir: string, name: string, env: Record<string, string | null | undefined> = {}): string | undefined {
  const fromEnv = name in env ? env[name] : process.env[name];
  if (fromEnv) return fromEnv;
  return readKeys(dataDir)[name];
}

export { readEnvFile };

/** The env a harness process gets (D102): the allowlist, its own keys, then Ducter's explicit vars. */
function harnessEnv(h: HarnessId, ctx: { env?: Record<string, string | null>; dataDir: string; inherited?: Record<string, string | undefined> }, explicit?: Record<string, string | null>): Record<string, string | null> {
  const grants = h === "codex" ? codexKeyNames(readCodexConfig(ctx.env ?? {})) : [];
  return childEnvOverlay(h, { inherited: ctx.inherited ?? process.env, overlay: ctx.env, keys: readKeys(ctx.dataDir), grants, explicit: { OO_CONFIG_DIR: ooSignedOut(ctx.dataDir), ...explicit } });
}

/**
 * D122: an `oo` a harness runs (a user skill like oo-gmail, or a plain Bash line) finds an empty
 * config folder and is signed out, so no session reaches the user's accounts around the broker's
 * Go gate. Ducter's own oo link runs oo with the user's real config.
 */
function ooSignedOut(dataDir: string): string {
  const dir = join(dataDir, "oo-signed-out");
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    /* the variable alone still points oo away from the user's sign-in */
  }
  return dir;
}

/** Whether DeepSeek Harness has a DeepSeek key anywhere it reads one (env, Ducter's key file, its own credential file). */
function dshHasKey(dataDir: string, env: Record<string, string | null | undefined>): boolean {
  if (harnessKey(dataDir, DSH_KEY_ENV, env)) return true;
  const home = env.DSH_HOME || process.env.DSH_HOME || join(homedir(), ".dsh");
  try {
    return new RegExp(`^\\s+${DSH_KEY_ENV}:\\s*\\S`, "m").test(readFileSync(join(home, ".credentials.yaml"), "utf8"));
  } catch {
    return false;
  }
}

/** pi's RPC process: OAR's bundled pi under node, else the user's `pi`. Bun cannot host it (research/34). */
function piCommand(): { command: string; args: string[] } | undefined {
  try {
    const here = fileURLToPath(import.meta.resolve("@botiverse/oar/runtimes/pi"));
    const entry = Bun.resolveSync("@earendil-works/pi-coding-agent/rpc-entry", dirname(here));
    if (existsSync(entry) && Bun.which("node")) return { command: "node", args: [entry] };
  } catch {
    /* a single binary: no node_modules on disk */
  }
  const pi = Bun.which("pi");
  return pi ? { command: pi, args: [] } : undefined;
}

export type RuntimeLoader = (harness: HarnessId, variant?: PiVariant) => Promise<Runtime | undefined>;

/** Lazy per-runtime import. A failed load is retried next time, never cached. */
const defaultLoader: RuntimeLoader = async (harness, variant) => {
  const key = `${harness}:${piFlags(variant).join(" ")}`;
  const cache = loaded.get(key);
  if (cache) return cache;
  let rt: Runtime | undefined;
  switch (harness) {
    case "claude-code":
      rt = (await import("@botiverse/oar/runtimes/claude")).claudeRuntime as unknown as Runtime;
      break;
    case "codex":
      rt = (await import("@botiverse/oar/runtimes/codex")).codexRuntime as unknown as Runtime;
      break;
    case "pi": {
      const m: any = await import("@botiverse/oar/runtimes/pi");
      const cmd = piCommand();
      if (variant?.clean && !cmd) throw new Error("pi needs node or the pi command on PATH to run with Ducter's clean setup");
      // Memory off must hold (D168): without a pi command to pass the flag to, the task doesn't start.
      if (variant?.extensionsOff && !cmd) throw new Error("pi needs node or the pi command on PATH to run with memory off");
      // One native RPC process per session (in-process pi re-enters the host).
      // A read-only session's allowlist must hold (D177): without a pi command to pass it to, it doesn't start.
      if (variant?.readOnly && !cmd) throw new Error("pi needs node or the pi command on PATH to run read-only");
      const flags = piFlags(variant);
      rt = (cmd ? m.createPiRuntime({ execution: "subprocess", command: cmd.command, args: [...cmd.args, ...flags] }) : m.piRuntime) as Runtime;
      break;
    }
    case "deepseek-harness":
      rt = (await import("@botiverse/oar/runtimes/dsh")).dshRuntime as unknown as Runtime;
      break;
  }
  if (rt) loaded.set(key, rt);
  return rt;
};
const loaded = new Map<string, Runtime>();

export interface OarPortOptions {
  /** Test seam: supply runtimes (e.g. @botiverse/oar/testing scriptedRuntime). */
  loadRuntime?: RuntimeLoader;
  /** Env overlay for every session/probe (e.g. captured login-shell env), filtered per harness like the rest (D102). Never logged. */
  env?: Record<string, string | null>;
  /** Bound retained records per session (OAR retainedBytes). */
  retainedBytes?: number;
  /** Ducter's data folder: its key file (keys.env), the DeepSeek Harness home, MCP bridge targets (default DUCTER_DATA_DIR or ~/.ducter). */
  dataDir?: string;
}

/** What one spec becomes for one harness: OAR options, plus what OAR cannot carry. */
export interface Adapted {
  options: SessionOptions;
  /** Prefixed to the first message of a new session (a harness with no system-prompt channel). */
  preamble?: string;
  clean: boolean;
}

/**
 * The partner's read-only session (SessionSpec.readOnly, principle 6), per harness, checked
 * against the installed builds:
 *   - Claude Code 2.1.319: its write and run tools are denied (and subagents, which could carry
 *     them); Read, Grep, Glob, WebFetch, WebSearch and Ducter's MCP tools stay. A file read is
 *     capped by CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: a bigger one is refused and the model
 *     reads it in parts (principle 5).
 *   - Codex 0.167.0: `-c sandbox_mode="read-only"` after OAR's own danger-full-access override
 *     (the later one wins: app-server config/read shows read-only in the session-flags layer).
 *     Shell commands still run, read-only and without network. No read cap.
 *   - pi: an allowlist on its RPC process (`--tools read,grep,find,ls`, PI_READ_ONLY_FLAGS), and
 *     bash, edit and write excluded by name as well (OAR's excludeTools). Live (research/50 §2).
 *   - DeepSeek Harness: OAR refuses per-session tool denial, so the partner's Ducter-owned home
 *     carries a profile layer that drops every tool that runs or writes (dshLayer), with DSH's
 *     read-only sandbox preset underneath. Live (research/50 §2): before it, the partner wrote a
 *     file and ran a command.
 */
export const READ_ONLY_DENY: Partial<Record<HarnessId, string[]>> = {
  "claude-code": ["Bash", "BashOutput", "KillShell", "KillBash", "Edit", "MultiEdit", "Write", "NotebookEdit", "Task", "Agent"],
  pi: ["bash", "edit", "write"],
};
export const PARTNER_READ_MAX_TOKENS = 8_000;

function readOnlyFor(h: HarnessId, a: { disallowed: string[]; launchArgs?: string[]; env?: Record<string, string | null> }): { disallowed: string[]; launchArgs?: string[]; env?: Record<string, string | null> } {
  const disallowed = [...a.disallowed, ...(READ_ONLY_DENY[h] ?? []).filter((t) => !a.disallowed.includes(t))];
  if (h === "claude-code") return { ...a, disallowed, env: { ...a.env, [CLAUDE_SWITCHES.readCapEnv]: String(PARTNER_READ_MAX_TOKENS) } };
  if (h === "codex") {
    // Under any sandbox codex declines an MCP call not marked readOnlyHint (with approvals off it
    // can't ask; measured: task_open and wait_for refused). See the MCP URL in adaptSpec.
    return { ...a, launchArgs: [...(a.launchArgs ?? []), "-c", 'sandbox_mode="read-only"'] };
  }
  return { ...a, disallowed };
}

/** Ducter's own MCP servers, told the session is sandboxed (?sandbox=read-only), once. */
function sandboxedMcp(servers: McpServer[]): McpServer[] {
  return servers.map((m) => ("url" in m && m.url && !/[?&]sandbox=read-only\b/.test(m.url) ? { ...m, url: m.url + (m.url.includes("?") ? "&" : "?") + "sandbox=read-only" } : m));
}

/** Spec -> OAR options for one harness (exported for tests; no process is started). */
export function adaptSpec(spec: SessionSpec, ctx: { env?: Record<string, string | null>; dataDir: string; refused?: Readonly<Record<string, string>>; inherited?: Record<string, string | undefined> }): Adapted {
  const h = spec.harness;
  const refused = ctx.refused ?? {};
  const clean = !!spec.isolateUserConfig;
  // What Ducter itself sets for this session; the rest of the child's env is the allowlist (D102).
  let env: Record<string, string | null> | undefined = spec.env ? { ...spec.env } : undefined;
  let systemPrompt = spec.systemPrompt;
  let appendSystemPrompt = spec.appendSystemPrompt;
  let preamble: string | undefined;
  let launchArgs: string[] | undefined;
  let disallowed = [...(DISALLOWED[h] ?? []), ...(spec.disallowedTools ?? [])];
  let mcpServers: McpServer[] = spec.mcp.map((m): McpServer =>
    "command" in m
      ? { name: m.name, command: m.command, ...(m.args ? { args: m.args } : {}), ...(m.env ? { env: m.env } : {}) }
      : { name: m.name, type: "http", url: m.url, headers: m.headers },
  );

  // D135: the window and compaction point, as this harness takes them (harness-facts.ts).
  const window = spec.contextWindow ?? spec.harnessCompactAt;
  const knobs = window ? windowKnobs(h, { window, compactAt: spec.harnessCompactAt ?? window }, modelFor(h, spec.model)) : undefined;

  switch (h) {
    case "claude-code":
      if (spec.launchArgs?.length) launchArgs = spec.launchArgs;
      // D175 (3): a one-shot with no tools at all (harness-facts noTools: ~9K input tokens less a call).
      if (spec.noTools) {
        launchArgs = [...(launchArgs ?? []), ...HARNESS_FACTS["claude-code"].noTools.value.args];
        disallowed = [];
      }
      // A clean session has only Ducter's servers: load their tools up front. Deferring them
      // behind tool search cost a model round trip (~3 s) before the partner's ack (live, sonnet).
      // A session's own value wins.
      if (clean && !(CLAUDE_SWITCHES.toolSearchEnv in (env ?? {}))) env = { ...env, [CLAUDE_SWITCHES.toolSearchEnv]: "false" };
      if (knobs) {
        env = { ...env, ...knobs.env };
        if (spec.preCompactNote === undefined) {
          writeClaudeSettings(spec.cwd, knobs.settings); // the partner's own folder
        } else {
          const settings = { idleCompaction: false, hooks: preCompactHooks(spec.preCompactNote) };
          // OAR owns --settings under "exclude"; there the task's folder holds them.
          if (clean || spec.userConfiguration === "exclude") writeClaudeSettings(spec.cwd, settings);
          else launchArgs = [...(launchArgs ?? []), "--settings", JSON.stringify({ ...settings, ...pluginsOff(spec) })];
        }
      }
      // D168: the user's own Mem plugin stays out of a task that keeps the user's setup (memory
      // comes from Ducter there); under the clean setup none of their plugins load anyway.
      if (!clean && spec.userConfiguration !== "exclude" && spec.disablePlugins?.length && !launchArgs?.includes("--settings"))
        launchArgs = [...(launchArgs ?? []), "--settings", JSON.stringify(pluginsOff(spec))];
      break;
    case "codex":
      // Codex denies only MCP tools qualified as mcp__server__tool (OAR tool-denials).
      disallowed = disallowed.filter((n) => /^mcp__[\w-]+__.+$/.test(n));
      // The clean setup: the session's own (isolateUserConfig), or one a browser place asks for
      // (userConfiguration "exclude": its own browser plugins kept, the rest left out). Tasks
      // keep Codex's own browser and Computer Use (keepNativeTools, D130); the partner doesn't.
      if (clean || spec.userConfiguration === "exclude") {
        const nativeTools = !!spec.keepNativeTools || (!clean && spec.userConfiguration === "exclude");
        launchArgs = codexCleanArgs(readCodexConfig(ctx.env ?? {}), mcpServers.map((m) => m.name), { nativeTools });
      }
      else if (spec.disablePlugins?.length)
        // D168: the user's setup stays, their Mem plugin is turned off by id (bare, as above).
        // Only ids the user's config.toml has: an override for a plugin Codex doesn't know is never sent.
        launchArgs = spec.disablePlugins.filter((id) => /^[A-Za-z0-9_@-]+$/.test(id) && readCodexConfig(ctx.env ?? {})?.plugins?.[id]).flatMap((id) => ["-c", `plugins.${id}.enabled=false`]);
      if (knobs) launchArgs = [...(launchArgs ?? []), ...knobs.args];
      // D142: a folder task writes only inside its folder (and the temp folders). OAR passes
      // its own sandbox_mode first; a later -c wins (checked with codex 0.167 config/read, and
      // `codex sandbox` refused a write in the home folder). Network stays on.
      if (spec.confineWrites) {
        launchArgs = [...(launchArgs ?? []), "-c", `sandbox_mode="workspace-write"`, "-c", "sandbox_workspace_write.network_access=true"];
        // Under any sandbox Codex declines an MCP call not marked read-only (2026-11-11: a folder
        // task on hel had report_to_main declined for hours, "approval policy is never"); the URL
        // tells Ducter's MCP the session is sandboxed, and it marks its tools (core/src/mcp.ts).
        mcpServers = sandboxedMcp(mcpServers);
      }
      break;
    case "pi":
      break; // the clean setup is the runtime variant's flags (defaultLoader)
    case "deepseek-harness": {
      disallowed = []; // DSH: per-session tool denial unverified (OAR refuses it)
      // Stdio only: each HTTP server becomes Ducter's bridge, its endpoint in a 0600 file.
      mcpServers = mcpServers.map((m) => {
        if (!("url" in m) || !m.url) return m;
        const file = writeBridgeTarget(join(ctx.dataDir, "mcp-bridge"), { url: m.url, headers: { ...(m.headers ?? {}) } });
        const b = bridgeCommand(file);
        return { name: m.name, command: b.command, args: b.args };
      });
      const instructions = [systemPrompt, appendSystemPrompt].filter(Boolean).join("\n\n");
      // Memory off in a task (harness-facts memPlugin "home"): Mem ships as a DSH profile bundle and
      // DSH has no known per-session profile switch, so the task runs under a Ducter-owned home of
      // its own too (research/48 M3).
      const memOff = !clean && !!spec.disablePlugins?.length;
      if (clean || memOff) {
        // A Ducter-owned home: none of the user's profiles, plugins, AGENTS.md or ~/.agents, and a
        // profile layer of Ducter's own (D177, research/50): the clean session's prompt is the
        // system prompt's whole opener (a prompt with `{{` would be read as DSH template variables,
        // so it rides in AGENTS.md instead), a read-only or tool-less session has no tool that runs
        // or writes, the session-log upload is off, and the compactor fires where the plan says.
        const asPrompt = clean && !!systemPrompt && !systemPrompt.includes("{{") ? systemPrompt : undefined;
        const agentsMd = asPrompt ? (appendSystemPrompt ?? "") : instructions;
        const layer = dshLayer({ prompt: asPrompt, readOnly: spec.readOnly, noTools: spec.noTools, compaction: knobs?.profile });
        // One home per setup: sessions live in their home, so the same prompt and tools resume
        // where they were, and a one-shot starting beside the partner never rewrites its files.
        const key = createHash("sha256").update(JSON.stringify(layer)).update("\0").update(agentsMd).digest("hex").slice(0, 12);
        const at = memOff ? join(ctx.dataDir, "harness", "deepseek-harness-memory-off", createHash("sha256").update(spec.cwd).digest("hex").slice(0, 12)) : join(ctx.dataDir, "harness", "dsh", key);
        const { home, agents } = writeDshHome(at, layer, agentsMd);
        env = { ...env, DSH_HOME: home, DSH_AGENTS_HOME: agents, DSH_TELEMETRY_DISABLED: "1" };
        // Underneath the dropped tools, DSH's own read-only sandbox preset (research/50 §2).
        if (spec.readOnly || spec.noTools) env[DSH_PROFILE.permissionEnv] = "read-only";
      } else if (instructions) {
        preamble = instructions;
      }
      systemPrompt = appendSystemPrompt = undefined;
      break;
    }
  }

  if (spec.readOnly) {
    ({ disallowed, launchArgs, env } = readOnlyFor(h, { disallowed, launchArgs, env }));
    // Codex declines MCP calls under its sandbox unless a tool is marked read-only: the URL tells
    // Ducter's MCP the session is sandboxed, and it marks the partner's tools (core/src/mcp.ts).
    if (h === "codex") mcpServers = sandboxedMcp(mcpServers);
  }

  // What the runtime says it cannot honor is never sent (OAR refuses by presence).
  if (refused.systemPrompt && systemPrompt) (preamble = [systemPrompt, preamble].filter(Boolean).join("\n\n")), (systemPrompt = undefined);
  if (refused.appendSystemPrompt && appendSystemPrompt) (preamble = [preamble, appendSystemPrompt].filter(Boolean).join("\n\n")), (appendSystemPrompt = undefined);
  if (refused.disallowedTools) disallowed = [];
  if (refused.launchArgs) launchArgs = undefined;

  const options: SessionOptions = {
    cwd: spec.cwd,
    model: modelFor(h, window ? modelForWindow(h, spec.model, window) : spec.model),
    systemPrompt,
    appendSystemPrompt,
    // D16 bypass: OAR launches every runtime without approval gates (claude
    // --dangerously-skip-permissions, codex approvalPolicy never, DSH danger-full-access).
    mcpServers,
    disallowedTools: disallowed.length ? disallowed : undefined,
    launchArgs,
    resume: spec.resumeSessionId,
    // D202: the effort picked on the New task card (checked against the model's own levels by
    // core), on open and on every resume; only where the agent takes one (harness-facts effort).
    effort: spec.effort && !refused.effort && HARNESS_FACTS[h]?.effort ? spec.effort : undefined,
    env: harnessEnv(h, ctx, env),
    // claude: --setting-sources project,local --strict-mcp-config + claudeMdExcludes. The other
    // runtimes refuse "exclude"; their clean setup is made above. A browser sidecar may ask for
    // it too (spec.userConfiguration, claude only).
    userConfiguration: h === "claude-code" ? (clean ? "exclude" : spec.userConfiguration) : undefined,
  };
  for (const k of Object.keys(options) as (keyof SessionOptions)[]) if (options[k] === undefined) delete (options as any)[k];
  return { options, ...(preamble ? { preamble } : {}), clean };
}

/** D168: Claude Code settings that turn the named plugins off for this session only. */
function pluginsOff(spec: SessionSpec): { enabledPlugins?: Record<string, false> } {
  const ids = spec.disablePlugins ?? [];
  return ids.length ? { enabledPlugins: Object.fromEntries(ids.map((id) => [id, false as const])) } : {};
}

/** DeepSeek Harness routes by provider/model; a bare DeepSeek name gets the official provider. */
function modelFor(h: HarnessId, model: string | undefined): string | undefined {
  if (!model) return undefined;
  if (h === "deepseek-harness" && !model.includes("/")) return `deepseek-official/${model}`;
  return model;
}

export function createOarHarnessPort(opts: OarPortOptions = {}): HarnessPort {
  const load = opts.loadRuntime ?? defaultLoader;
  const dataDir = opts.dataDir ?? process.env.DUCTER_DATA_DIR ?? join(homedir(), ".ducter");
  return {
    async start(spec) {
      const rt = await load(spec.harness, piVariant(spec));
      if (!rt) throw new Error(`harness ${spec.harness} is not supported`);
      const inst = await rt.installation?.({ env: harnessEnv(spec.harness, { env: opts.env, dataDir }) });
      if (!inst || inst.kind !== "available") throw new Error(`harness ${spec.harness} is not installed`);
      const a = adaptSpec(spec, { env: opts.env, dataDir, refused: (rt as { refusedSessionOptions?: Record<string, string> }).refusedSessionOptions });
      const session = await rt.session(inst, { ...a.options, retainedBytes: opts.retainedBytes ?? 8 * 1024 * 1024 });
      return wrapSession(session, spec.resumeSessionId ? undefined : a.preamble, spec.harness);
    },

    async available() {
      const out: { harness: string; installed: boolean; loggedIn: boolean; models?: string[] }[] = [];
      for (const harness of HARNESS_IDS) {
        let rt: Runtime | undefined;
        try {
          rt = await load(harness);
        } catch {
          rt = undefined;
        }
        if (!rt) {
          out.push({ harness, installed: false, loggedIn: false });
          continue;
        }
        try {
          const env = harnessEnv(harness, { env: opts.env, dataDir });
          const inst = await rt.installation?.({ env });
          if (!inst || inst.kind !== "available") {
            out.push({ harness, installed: false, loggedIn: false });
            continue;
          }
          // Pi and DeepSeek Harness have no authStatus. Pi: signed in means "has a usable
          // model". DeepSeek Harness lists its catalog without a key, so: has a DeepSeek key.
          const auth = rt.authStatus ? await rt.authStatus(inst, { env, timeoutMs: 15_000 }).catch(() => undefined) : undefined;
          const listed = await rt.listModels?.(inst, { env, timeoutMs: 30_000 }).catch(() => undefined);
          const models = listed?.kind === "ok" ? listed.models.filter((m) => !m.disabled).map((m) => m.id) : undefined;
          const loggedIn = auth ? auth.kind === "logged_in" : harness === "deepseek-harness" ? dshHasKey(dataDir, opts.env ?? {}) : (models?.length ?? 0) > 0;
          out.push({ harness, installed: true, loggedIn, models });
        } catch {
          out.push({ harness, installed: false, loggedIn: false });
        }
      }
      return out;
    },

    // D202: the account's own models here, with each one's effort levels (token-free: Claude
    // Code answers list_models before any turn, Codex its model/list). Listed in Ducter's own
    // folder, never a project's (a listing starts the agent there, OAR ListModelsOptions.cwd).
    async models(harness) {
      if (!(HARNESS_IDS as readonly string[]).includes(harness)) return undefined;
      try {
        const h = harness as HarnessId;
        const rt = await load(h);
        const env = harnessEnv(h, { env: opts.env, dataDir });
        const inst = await rt?.installation?.({ env });
        if (!rt?.listModels || !inst || inst.kind !== "available") return undefined;
        mkdirSync(dataDir, { recursive: true });
        const r = await rt.listModels(inst, { env, cwd: dataDir, timeoutMs: 20_000 });
        return r.kind === "ok" ? listedModels(r.models) : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/** D202: OAR's model entries as Ducter lists them: the disabled ones left out. */
export function listedModels(models: readonly { id: string; displayName?: string; effortLevels?: readonly string[]; defaultEffort?: string; default?: true; disabled?: unknown }[]): ListedModel[] {
  return models
    .filter((m) => !m.disabled && m.id)
    .map((m) => ({
      id: m.id,
      label: m.displayName || m.id,
      ...(m.effortLevels?.length ? { efforts: [...m.effortLevels] } : {}),
      ...(m.defaultEffort ? { defaultEffort: m.defaultEffort } : {}),
      ...(m.default ? { default: true as const } : {}),
    }));
}

/** Extra members beyond the contract's HarnessSession (see the runner's contract requests). */
export interface HarnessSessionExt extends HarnessSession {
  readonly canSteer: boolean;
  busy(): boolean;
}

/** How instructions ride on the first message when the harness has no channel for them. */
export function withPreamble(preamble: string, text: string): string {
  return `<instructions>\n${preamble.trim()}\n</instructions>\n\n${text}`;
}

/**
 * What the context holds, as the harness last reported it (OAR contextUsage): on Claude Code the
 * last request's input + cache read + cache write; on Codex `last.totalTokens`. Codex builds that
 * report no `last` fall back to the cumulative input with no window: not a context size, unused.
 */
export function contextTokensOf(c: { tokens: number | null; contextWindow: number | null } | null | undefined, harness?: HarnessId): number | undefined {
  if (!c || c.tokens === null || !(c.tokens > 0)) return undefined;
  if (harness === "codex" && c.contextWindow === null) return undefined;
  return c.tokens;
}

function wrapSession(s: Session, preamble?: string, harness?: HarnessId): HarnessSessionExt {
  // At turn_ended OAR has already folded the turn's usage (live, claude 2.1.319: contextUsage()
  // read in the turn_ended callback equals the usage record that follows it).
  const normalizer = new Normalizer(() => {
    const t = s.usage().value.total;
    const contextTokens = contextTokensOf(s.contextUsage?.().value, harness);
    if (!t && contextTokens === undefined) return undefined;
    return { ...(t ? { inputTokens: t.input, outputTokens: t.output, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite } : {}), ...(contextTokens !== undefined ? { contextTokens } : {}) };
  });
  // One buffered queue feeding one async iterator; subscription starts at open (cursor 0).
  const buf: HarnessEvent[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  let firstSend = preamble;
  const push = (evs: HarnessEvent[]) => {
    if (evs.length === 0) return;
    buf.push(...evs);
    wake?.();
  };
  const unsubscribe = s.events((ev) => {
    push(normalizer.push(ev as any));
    if (ev.kind === "exited") {
      push(normalizer.flush());
      ended = true;
      wake?.();
    }
  });
  let iterated = false;

  const reject = (what: string, r: { kind: string; reason?: string }) => {
    if (r.kind === "rejected") throw new Error(`${what} rejected: ${r.reason ?? "unknown"}`);
  };
  const framed = (text: string) => {
    if (!firstSend) return text;
    const t = withPreamble(firstSend, text);
    firstSend = undefined;
    return t;
  };

  return {
    get id() {
      return s.id;
    },
    canSteer: typeof s.steer === "function",
    busy() {
      const st = s.status().value;
      return st.kind === "running" || st.pendingPrompt != null;
    },
    async send(text, mode = "turn", pics) {
      const input = framed(text);
      // D206: the runtime's own image input; a runtime that takes none gets the words only (the
      // runner already told an agent that can't see them, so this is the last guard).
      const images = pics?.length && s.capabilities?.images !== false ? pics.map((p) => ({ path: p.path, mediaType: p.mediaType })) : undefined;
      const o = { origin: { kind: "user" as const, source: "ducter" }, ...(images ? { images } : {}) };
      if (mode === "turn") {
        reject("prompt", await s.prompt(input, o));
      } else if (mode === "steer") {
        // A steer at a cursor takes no images: they go with the next turn instead (OAR rejects them there).
        const r = await s.steerOrQueue(input, o);
        if (r.landed === "rejected") throw new Error(`steer rejected: ${r.reason}`);
      } else {
        reject("queue", await s.queue(input, o));
      }
    },
    async interrupt() {
      await s.abort();
    },
    async close() {
      try {
        await s.dispose();
      } finally {
        unsubscribe();
        push(normalizer.flush());
        ended = true;
        wake?.();
      }
    },
    events() {
      if (iterated) throw new Error("HarnessSession.events() supports a single consumer");
      iterated = true;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<HarnessEvent>> {
              while (buf.length === 0 && !ended) await new Promise<void>((r) => (wake = r));
              wake = undefined;
              const v = buf.shift();
              return v ? { value: v, done: false } : { value: undefined, done: true };
            },
          };
        },
      };
    },
  };
}
