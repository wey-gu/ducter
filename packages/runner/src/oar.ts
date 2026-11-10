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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DSH_KEY_ENV, HARNESS_IDS, type HarnessId } from "@ducter/protocol";
import { readEnvFile, readKeys } from "@ducter/protocol/src/keys.ts";
import { CLAUDE_SWITCHES, modelForWindow, windowKnobs } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
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
 * `-c` overrides that give a codex session Ducter's clean setup while it keeps CODEX_HOME (the
 * login, the provider route, resume): every MCP server the user configured is disabled by name
 * (a `mcp_servers={}` override merges, it does not replace: research/34), and the features that
 * load the user's hooks, plugins (their skills and MCP servers), apps and memories are off. The
 * partner also leaves out the features that compete with Ducter (goals, subagents, images, computer use).
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
  const off = ["hooks", "codex_hooks", "plugin_hooks", "plugins", "apps", "memories", "js_repl", "goals", "multi_agent", "image_generation", ...native].filter(
    (f) => !(o.nativeTools && (f === "plugins" || f === "plugin_hooks" || native.includes(f))),
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

export type RuntimeLoader = (harness: HarnessId, variant?: { clean?: boolean }) => Promise<Runtime | undefined>;

/** Lazy per-runtime import. A failed load is retried next time, never cached. */
const defaultLoader: RuntimeLoader = async (harness, variant) => {
  const key = `${harness}${variant?.clean ? ":clean" : ""}`;
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
      // One native RPC process per session (in-process pi re-enters the host).
      rt = (cmd ? m.createPiRuntime({ execution: "subprocess", command: cmd.command, args: [...cmd.args, ...(variant?.clean ? PI_CLEAN_FLAGS : [])] }) : m.piRuntime) as Runtime;
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
 *   - pi: its bash, edit and write tools are excluded (OAR's excludeTools); read/grep/find/ls stay.
 *   - DeepSeek Harness: no per-session tool denial (OAR refuses it) and its read-only permission
 *     mode is unverified, so nothing changes (design/system.md, known gaps).
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
  const knobs = window ? windowKnobs(h, { window, compactAt: spec.harnessCompactAt ?? window }) : undefined;

  switch (h) {
    case "claude-code":
      if (spec.launchArgs?.length) launchArgs = spec.launchArgs;
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
          else launchArgs = [...(launchArgs ?? []), "--settings", JSON.stringify(settings)];
        }
      }
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
      if (knobs) launchArgs = [...(launchArgs ?? []), ...knobs.args];
      // D142: a folder task writes only inside its folder (and the temp folders). OAR passes
      // its own sandbox_mode first; a later -c wins (checked with codex 0.167 config/read, and
      // `codex sandbox` refused a write in the home folder). Network stays on.
      if (spec.confineWrites) launchArgs = [...(launchArgs ?? []), "-c", `sandbox_mode="workspace-write"`, "-c", "sandbox_workspace_write.network_access=true"];
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
      systemPrompt = appendSystemPrompt = undefined;
      if (clean) {
        // A Ducter-owned home: none of the user's profiles, plugins, AGENTS.md or ~/.agents.
        // Its user-global AGENTS.md is the partner's prompt (DSH loads it as the baseline).
        const home = join(ctx.dataDir, "harness", "deepseek-harness");
        const agents = join(home, "agents");
        mkdirSync(agents, { recursive: true, mode: 0o700 });
        writeFileSync(join(home, "AGENTS.md"), instructions ? instructions + "\n" : "", { mode: 0o600 });
        env = { ...env, DSH_HOME: home, DSH_AGENTS_HOME: agents, DSH_TELEMETRY_DISABLED: "1" };
      } else if (instructions) {
        preamble = instructions;
      }
      break;
    }
  }

  if (spec.readOnly) {
    ({ disallowed, launchArgs, env } = readOnlyFor(h, { disallowed, launchArgs, env }));
    // Codex declines MCP calls under its sandbox unless a tool is marked read-only: the URL tells
    // Ducter's MCP the session is sandboxed, and it marks the partner's tools (core/src/mcp.ts).
    if (h === "codex") mcpServers = mcpServers.map((m) => ("url" in m && m.url ? { ...m, url: m.url + (m.url.includes("?") ? "&" : "?") + "sandbox=read-only" } : m));
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
    env: harnessEnv(h, ctx, env),
    // claude: --setting-sources project,local --strict-mcp-config + claudeMdExcludes. The other
    // runtimes refuse "exclude"; their clean setup is made above. A browser sidecar may ask for
    // it too (spec.userConfiguration, claude only).
    userConfiguration: h === "claude-code" ? (clean ? "exclude" : spec.userConfiguration) : undefined,
  };
  for (const k of Object.keys(options) as (keyof SessionOptions)[]) if (options[k] === undefined) delete (options as any)[k];
  return { options, ...(preamble ? { preamble } : {}), clean };
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
      const clean = !!spec.isolateUserConfig && spec.harness === "pi";
      const rt = await load(spec.harness, clean ? { clean } : undefined);
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
  };
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
    async send(text, mode = "turn") {
      const input = framed(text);
      if (mode === "turn") {
        reject("prompt", await s.prompt(input, { origin: { kind: "user", source: "ducter" } }));
      } else if (mode === "steer") {
        const r = await s.steerOrQueue(input, { origin: { kind: "user", source: "ducter" } });
        if (r.landed === "rejected") throw new Error(`steer rejected: ${r.reason}`);
      } else {
        reject("queue", await s.queue(input, { origin: { kind: "user", source: "ducter" } }));
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
