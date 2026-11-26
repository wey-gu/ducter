// HarnessPort over OAR. This is the ONLY module that imports OAR values, and it imports the
// per-runtime entries (never the root entry: ~50 MB heap, and it fails to load under Bun 1.3.1
// because runtimes/kimi imports node:util getSystemErrorMap). No OAR type crosses this file's
// exports: callers see only Ducter's HarnessPort / HarnessSession / HarnessEvent.
//
// D85: four first-wave harnesses, each able to carry the partner and tasks, and (D416) Antigravity
// for tasks only. What differs per harness (research/34-harness-adapters.md) is decided here, in one place:
//   - the clean setup (isolateUserConfig): claude native exclude; codex `-c` overrides; pi CLI
//     flags on its RPC process; DeepSeek Harness a Ducter-owned DSH_HOME;
//   - the system prompt: native where OAR verified it; else AGENTS.md in the Ducter-owned home
//     (DeepSeek Harness, isolated) or the first message (DeepSeek Harness tasks);
//   - Ducter's MCP endpoint: HTTP with headers, or the stdio bridge (DeepSeek Harness; Antigravity,
//     which refuses an entry carrying env or headers);
//   - tool denials only where the harness can honor them.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DSH_KEY_ENV, HARNESS_IDS, directOnly, harnessName, type AccountUsage, type HarnessId } from "@ducter/protocol";
import { readEnvFile, readKeys } from "@ducter/protocol/src/keys.ts";
import { CLAUDE_SWITCHES, DSH_PROFILE, HARNESS_FACTS, PI_READ_ONLY_TOOLS, liveModels, modelForWindow, parseCodexCatalog, windowKnobs } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, ListedModel, SessionSpec } from "@ducter/protocol/src/internal.ts";
import type { Runtime, Session, SessionOptions, McpServer } from "@botiverse/oar/browser";
import { Normalizer } from "./normalize.ts";
import { nativeUsage } from "./native-usage.ts";
import { bridgeCommand, writeBridgeTarget } from "./mcp-bridge.ts";
import { nmemOf, readContext, realExec, saveThread, theirMemPlugin, threadSaver, type MemStepsExec } from "./mem-steps.ts";
import { childEnvOverlay } from "./child-env.ts";
import { taskCredentials } from "./task-credentials.ts";
import { CODEX_NATIVE_MCP, CODEX_NATIVE_PLUGINS } from "@ducter/protocol/src/native-browser.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { dshCredentialKey as ownDshKey, dshCredentialsFile, dshModel, dshOwnSignIns } from "@ducter/protocol/src/dsh.ts";

export type { HarnessId };

/**
 * Native features that compete with Ducter, each re-justified in D282 (research/92 §3):
 *   - EnterPlanMode / ExitPlanMode: a plan's approval is the person's turn, which Ducter owns (a
 *     report_to_main with the plan and a default); headless, no one is at Claude Code's prompt.
 *   - ScheduleWakeup, CronCreate / CronList / CronDelete: a second, invisible clock that dies when
 *     Ducter parks the session; the task's own timer is wait_for with a time (D267).
 *   - AskUserQuestion: the person is never at the harness's prompt; report_to_main asks instead.
 *   - PushNotification (a push to the person's terminal and phone, around Ducter) and
 *     RemoteTrigger (scheduled remote agents on the person's claude.ai account, outliving the task).
 * Allowed since D282: Workflow, like Agent. A workflow's agents report back to the task, which
 * holds the brief (D241's own reason for keeping Agent); only a browser place, whose tools enforce
 * none of D62's rules, denies both (browser.ts), and the read-only partner denies it (READ_ONLY_DENY).
 */
export const DISALLOWED: Partial<Record<HarnessId, string[]>> = {
  "claude-code": ["EnterPlanMode", "ExitPlanMode", "ScheduleWakeup", "CronCreate", "CronList", "CronDelete", "AskUserQuestion", "PushNotification", "RemoteTrigger"],
};

/**
 * D282: the skill listing a task sends, as large as in the person's own session. Claude Code
 * 2.1.325 gives the listing a fraction of the context window (default 0.01 x window x 4 chars):
 * Ducter's small window (D135, CLAUDE_CODE_DISABLE_1M_CONTEXT) cut it from 40K to 8K chars, and a
 * person with many skills got their names without descriptions (measured, research/92 §2). 0.05 of
 * 200K is the 40K of a 1M window. Codex 0.169 sizes it at 2% of model_context_window (measured:
 * 18.0K chars at its default, 13.8K at Ducter's 200K); skills.max_context_tokens puts back the
 * default 272K window's share.
 */
export const CLAUDE_SKILL_LISTING = { skillListingBudgetFraction: 0.05 } as const;
export const CODEX_SKILL_TOKENS = 5440;

/** pi's own CLI flags that leave the user's pi setup out (pi --help, 1.4.0+). Login and models stay. */
export const PI_CLEAN_FLAGS = ["--no-skills", "--no-context-files", "--no-prompt-templates", "--no-extensions", "--no-themes"];
/** pi's own context-file names, in its order: the first one found in a folder is that folder's (pi 1.5 resource-loader). */
const PI_CONTEXT_FILES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

/**
 * D241: the project's own context files for a pi task under the clean setup, rendered the way pi
 * renders them (`<project_instructions path=…>`). pi's walk minus the person's: from the task's
 * folder up to its repository's top (the folder holding `.git`), or the folder alone outside a
 * repository, outermost first; never pi's global agent dir, nor folders above the repository
 * (the person's home), which are the person's own. Undefined when there are none.
 */
export function piProjectContext(cwd: string, env: Record<string, string | null | undefined> = {}): string | undefined {
  const agentDir = resolve(env.OAR_PI_AGENT_DIR || process.env.OAR_PI_AGENT_DIR || env.PI_CODING_AGENT_DIR || process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
  const dirs: string[] = [];
  let dir = resolve(cwd);
  for (;;) {
    dirs.unshift(dir);
    if (existsSync(join(dir, ".git"))) break;
    const up = dirname(dir);
    if (up === dir) return render([resolve(cwd)]);
    dir = up;
  }
  return render(dirs);
  function render(found: string[]): string | undefined {
    const files: string[] = [];
    for (const d of found) {
      if (d === agentDir) continue;
      for (const name of PI_CONTEXT_FILES) {
        const path = join(d, name);
        try {
          if (!statSync(path).isFile()) continue;
          files.push(`<project_instructions path="${path}">\n${readFileSync(path, "utf8").replace(/^﻿/, "")}\n</project_instructions>`);
          break;
        } catch {
          /* not there */
        }
      }
    }
    return files.length ? ["Project-specific instructions and guidelines:", ...files].join("\n\n") : undefined;
  }
}

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
export function dshLayer(o: { prompt?: string; readOnly?: boolean; noTools?: boolean; noWeb?: boolean; webOnly?: boolean; compaction?: Record<string, unknown>[]; credentials?: string }): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  // D371: the credential store reads the person's own file (the account's sign-in lives there).
  if (o.credentials) rows.push({ id: DSH_PROFILE.credentials, config: { path: o.credentials } });
  if (o.prompt) rows.push({ id: DSH_PROFILE.systemPrompt, config: { includeHarnessIdentity: false, personaPrefix: o.prompt } });
  if (o.webOnly) {
    // D380: a quick web look keeps tool-web and drops every other tool row.
    for (const id of [...DSH_PROFILE.readOnlyOff, ...HARNESS_FACTS["deepseek-harness"].webLook.value.rows]) rows.push({ id, disabled: true });
  } else if (o.readOnly || o.noTools) {
    for (const id of DSH_PROFILE.readOnlyOff) rows.push({ id, disabled: true });
    if (o.noTools) for (const id of DSH_PROFILE.noToolsOff) rows.push({ id, disabled: true });
    else rows.push({ id: DSH_PROFILE.fs, config: { write: false, edit: false, applyPatch: false } });
  }
  // D378: the partner reads no web page itself (a one-shot's noToolsOff already drops the row).
  if (o.noWeb && !o.noTools) for (const id of HARNESS_FACTS["deepseek-harness"].noWeb.value.rows) rows.push({ id, disabled: true });
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
 * subagents stay off for tasks too (D240, D241): a Codex subagent inherits the thread's
 * developerInstructions (codex 0.167.2 source, research/76 §6), but an agent role replaces them,
 * and roles are the person's own config (`[agents]` in config.toml, `~/.codex/agents/`) that `-c`
 * can't leave out; a task under this setup has Codex's browser or Computer Use, whose rules live
 * in that brief. An ordinary task keeps the person's own multi_agent setting.
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
  const off = ["hooks", "codex_hooks", "plugin_hooks", "plugins", "apps", "memories", "js_repl", "goals", "multi_agent", "multi_agent_v2", "image_generation", ...native].filter(
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
 * D333: what Codex itself still loads under the clean setup. codexCleanArgs turns off the servers
 * the person's config.toml names; one from anywhere else (a profile, a managed layer, a plugin a
 * build loads past features.plugins, a config.toml Bun can't parse) would still be there: on hel
 * (2026-11-17, Codex) the partner listed the Mem plugin's own Bridge tools and tried them. So
 * `codex <the args> mcp list --json` (read-only, ~1.6 s) runs once per command, args and config
 * file, and every server it still calls enabled, other than Ducter's own, is turned off by name
 * too. No answer: the args as they were (the read-only sandbox still declines their calls).
 */
export type CodexMcpList = (command: string, args: string[], env: Record<string, string>) => { name: string; enabled: boolean }[] | undefined;
const leftovers = new Map<string, string[]>();
export function codexLeftoverServers(command: string, args: string[], overlay: Record<string, string | null>, keep: string[], list: CodexMcpList = codexMcpList): string[] {
  if (list === codexMcpList && !existsSync(command)) return [];
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...overlay })) if (typeof v === "string") env[k] = v;
  const configFile = join(env.CODEX_HOME || join(homedir(), ".codex"), "config.toml");
  let stamp = "";
  try {
    stamp = String(statSync(configFile).mtimeMs);
  } catch {
    /* no config file */
  }
  const key = [command, stamp, ...args].join("\0");
  const known = leftovers.get(key);
  if (known) return known;
  const listed = list(command, args, env);
  if (!listed) return [];
  const off = listed.filter((s) => s.enabled && !keep.includes(s.name)).map((s) => s.name);
  leftovers.set(key, off);
  return off;
}
/**
 * D512: Ducter's own servers for a clean Codex session, as one `-c mcp_servers={…}` launch
 * override ahead of the overrides that turn the person's servers off, never as OAR's thread/start
 * `config.mcp_servers`. Codex's app-server appends a thread's config to the launch's `-c` list
 * and sets each entry at its dotted path into one layer (codex-rs 0.171.0
 * config/src/overrides.rs `build_cli_overrides_layer`, app-server/src/config_manager.rs
 * `load_with_validation`): a whole `mcp_servers` table there replaced the
 * `mcp_servers.<name>.enabled=false` entries set before it, and the merge with config.toml then
 * brought every one of the person's servers back (the 0.171 eval: context7, Mem, cua-driver and
 * node_repl behind tool search, and context7 called). `codex mcp list` never sees a thread's
 * config, so it showed them off. Here the table comes first and the dotted `enabled=false`
 * entries land inside it. A header's value rides in the session's env (`env_http_headers`), a
 * stdio server's env through `env_vars`: no secret in the process's arguments.
 */
export function codexOwnServers(servers: McpServer[]): { args: string[]; env: Record<string, string> } {
  const env: Record<string, string> = {};
  const key = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
  const str = (v: string) => JSON.stringify(v); // a JSON string is a TOML basic string
  const tables = servers.map((m, i) => {
    const fields: string[] = [];
    if ("url" in m && m.url) {
      fields.push(`url = ${str(m.url)}`);
      const headers = Object.entries(m.headers ?? {});
      if (headers.length) {
        const named = headers.map(([h, v], j) => {
          const name = `DUCTER_CODEX_MCP_${i}_HEADER_${j}`;
          env[name] = v;
          return `${key(h)} = ${str(name)}`;
        });
        fields.push(`env_http_headers = { ${named.join(", ")} }`);
      }
    } else if ("command" in m) {
      fields.push(`command = ${str(m.command)}`, `args = [${(m.args ?? []).map(str).join(", ")}]`);
      const vars = Object.entries(m.env ?? {});
      if (vars.length) {
        for (const [k, v] of vars) env[k] = v;
        fields.push(`env_vars = [${vars.map(([k]) => str(k)).join(", ")}]`);
      }
    }
    fields.push("enabled = true");
    return `${key(m.name)} = { ${fields.join(", ")} }`;
  });
  return { args: tables.length ? ["-c", `mcp_servers={ ${tables.join(", ")} }`] : [], env };
}

/**
 * D515: `-c` overrides that let a sandboxed Codex task call the person's own MCP servers as an
 * unsandboxed one does: `mcp_servers.<name>.default_tools_approval_mode="approve"` for each server
 * their config.toml names (only those: a dotted key for a server Codex doesn't know would make a
 * new, broken entry), unless that server sets an approval of its own (theirs is kept). VERIFIED
 * on codex-cli 0.172.0 (research/222 §3): declined under workspace-write, answered with this.
 */
export function codexApproveTheirServers(config: CodexConfig | undefined): string[] {
  const key = (n: string) => (/^[A-Za-z0-9_-]+$/.test(n) ? n : JSON.stringify(n));
  return Object.entries(config?.mcp_servers ?? {})
    .filter(([, v]) => {
      const m = (v ?? {}) as { enabled?: unknown; default_tools_approval_mode?: unknown; tools?: Record<string, { approval_mode?: unknown } | undefined> };
      return m.enabled !== false && m.default_tools_approval_mode === undefined && !Object.values(m.tools ?? {}).some((t) => t?.approval_mode !== undefined);
    })
    .flatMap(([n]) => ["-c", `mcp_servers.${key(n)}.default_tools_approval_mode="approve"`]);
}

/** `-c` overrides that turn these servers off (a name Codex can't take bare is quoted, as codexCleanArgs does). */
export function codexServersOff(names: string[]): string[] {
  return names.flatMap((n) => ["-c", `mcp_servers.${/^[A-Za-z0-9_-]+$/.test(n) ? n : JSON.stringify(n)}.enabled=false`]);
}
function codexMcpList(command: string, args: string[], env: Record<string, string>): { name: string; enabled: boolean }[] | undefined {
  try {
    const r = Bun.spawnSync([command, ...args, "mcp", "list", "--json"], { env, stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 15_000 });
    if (r.exitCode !== 0) return undefined;
    const j = JSON.parse(r.stdout.toString()) as unknown;
    if (!Array.isArray(j)) return undefined;
    return j.flatMap((s) => (s && typeof s.name === "string" ? [{ name: s.name as string, enabled: s.enabled !== false }] : []));
  } catch {
    return undefined;
  }
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

/**
 * The env a harness process gets (D102): the allowlist, its own keys, the git/GitHub route
 * (task-credentials.ts, D272), then Ducter's explicit vars.
 */
export function harnessEnv(h: HarnessId, ctx: { env?: Record<string, string | null>; dataDir: string; inherited?: Record<string, string | undefined> }, explicit?: Record<string, string | null>): Record<string, string | null> {
  const grants = h === "codex" ? codexKeyNames(readCodexConfig(ctx.env ?? {})) : [];
  const inherited = ctx.inherited ?? process.env;
  const seen: Record<string, string | undefined> = { ...inherited };
  for (const [k, v] of Object.entries(ctx.env ?? {})) seen[k] = v ?? undefined;
  const git = taskCredentials({ kind: "home" }, seen).env;
  return childEnvOverlay(h, { inherited, overlay: ctx.env, keys: readKeys(ctx.dataDir), grants, explicit: { ...git, OO_CONFIG_DIR: ooSignedOut(ctx.dataDir), ...explicit } });
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

/** The person's own DSH settings place: the overlay's DSH_HOME, else this process's. */
const dshEnv = (env: Record<string, string | null | undefined>) => ({ DSH_HOME: env.DSH_HOME || process.env.DSH_HOME });

/**
 * How DeepSeek Harness is signed in for a session (D371): a DeepSeek key anywhere it reads one
 * (the env, Ducter's key file, its own credential file), else the DeepSeek account its desktop
 * app signed in with (its own credential file), which runs on the account route.
 */
export function dshSignIn(dataDir: string, env: Record<string, string | null | undefined>, read?: (p: string) => string | undefined): "key" | "account" | undefined {
  if (harnessKey(dataDir, DSH_KEY_ENV, env)) return "key";
  const own = read ? dshOwnSignIns(dshEnv(env), read) : dshOwnSignIns(dshEnv(env));
  return own.key ? "key" : own.account ? "account" : undefined;
}

/** The DeepSeek key in the person's own DSH credential file (`<DSH_HOME or ~/.dsh>/.credentials.yaml`), if any. Never logged. */
export function dshCredentialKey(env: Record<string, string | null | undefined>): string | undefined {
  return ownDshKey(dshEnv(env));
}

/** pi's RPC process: OAR's bundled pi under node, else the user's `pi`. Bun cannot host it (research/34). */
function piCommand(): { command: string; args: string[] } | undefined {
  try {
    const here = fileURLToPath(import.meta.resolve("@botiverse/oar/runtimes/pi"));
    const entry = Bun.resolveSync("@earendil-works/pi-coding-agent/rpc-entry", dirname(here));
    if (existsSync(entry) && whichNow("node")) return { command: "node", args: [entry] };
  } catch {
    /* a single binary: no node_modules on disk */
  }
  const pi = whichNow("pi");
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
    case "antigravity":
      rt = (await import("@botiverse/oar/runtimes/antigravity")).antigravityRuntime as unknown as Runtime;
      break;
  }
  if (rt) loaded.set(key, rt);
  return rt;
};
const loaded = new Map<string, Runtime>();

/**
 * D549: why this agent won't run here, when it refuses root and this process is root (harness-facts
 * `root`). Ducter never sets an agent's undocumented override (Claude Code's IS_SANDBOX).
 */
export function rootRefusal(h: string, uid: number | undefined): string | undefined {
  const f = (HARNESS_FACTS as Record<string, (typeof HARNESS_FACTS)[HarnessId] | undefined>)[h]?.root?.value;
  if (uid !== 0 || f?.as !== "refuses") return undefined;
  return `${harnessName(h)} refuses to run as root, and Ducter runs as root on this computer: ${f.said ?? "its own check"}`;
}

export interface OarPortOptions {
  /** Test seam: supply runtimes (e.g. @botiverse/oar/testing scriptedRuntime). */
  loadRuntime?: RuntimeLoader;
  /** D549, test seam: the user id this process runs as (default process.getuid; 0 is root). */
  uid?: () => number | undefined;
  /** Env overlay for every session/probe (e.g. captured login-shell env), filtered per harness like the rest (D102). Never logged. */
  env?: Record<string, string | null>;
  /** Bound retained records per session (OAR retainedBytes). */
  retainedBytes?: number;
  /** Ducter's data folder: its key file (keys.env), the DeepSeek Harness home, MCP bridge targets (default DUCTER_DATA_DIR or ~/.ducter). */
  dataDir?: string;
  /** Test seam (D333): Codex's own list of the MCP servers a set of launch args leaves on. */
  codexMcpList?: CodexMcpList;
  /** Test seam (D352): Codex's own catalog (`codex debug models`), for the windows of models the registry doesn't know. */
  codexCatalog?: (command: string, env: Record<string, string>) => Promise<string>;
  /** Test seam (D417): how Mem's steps run nmem, which nmem, whose home holds agy's plugins, and the save's waits. */
  memSteps?: { exec?: MemStepsExec; nmem?: string; home?: string; after?: number; retry?: number };
}

/** A harness env overlay (null: unset) over this process's env, as a child's whole env. */
function fullEnv(overlay: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") out[k] = v;
  for (const [k, v] of Object.entries(overlay)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** D352: `codex debug models` (token-free, local), its stdout; "" when it can't say in 10 s. */
async function readCodexCatalog(command: string, env: Record<string, string>): Promise<string> {
  try {
    const p = Bun.spawn([command, "debug", "models"], { stdout: "pipe", stderr: "ignore", stdin: "ignore", env });
    const timer = setTimeout(() => p.kill(), 10_000);
    const [out] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    clearTimeout(timer);
    return out;
  } catch {
    return "";
  }
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
  "claude-code": ["Bash", "BashOutput", "KillShell", "KillBash", "Edit", "MultiEdit", "Write", "NotebookEdit", "Task", "Agent", "Workflow"],
  pi: ["bash", "edit", "write"],
};
export const PARTNER_READ_MAX_TOKENS = 8_000;

function readOnlyFor(h: HarnessId, a: { disallowed: string[]; launchArgs?: string[]; env?: Record<string, string | null> }): { disallowed: string[]; launchArgs?: string[]; env?: Record<string, string | null> } {
  const disallowed = [...a.disallowed, ...(READ_ONLY_DENY[h] ?? []).filter((t) => !a.disallowed.includes(t))];
  if (h === "claude-code") return { ...a, disallowed, env: { ...a.env, [CLAUDE_SWITCHES.readCapEnv]: String(PARTNER_READ_MAX_TOKENS) } };
  if (h === "codex") {
    // Under any sandbox codex declines an MCP call not marked readOnlyHint (with approvals off it
    // can't ask; measured: task_open and wait_for refused). See the MCP URL in adaptSpec.
    // D512: and no shell at all (harness-facts readOnly): under the read-only sandbox the partner
    // still ran commands (3 scenarios of the 0.171 eval); what a place holds is a task's to read.
    return { ...a, launchArgs: [...(a.launchArgs ?? []), ...(HARNESS_FACTS.codex.readOnly.value.args ?? []), "-c", 'sandbox_mode="read-only"'] };
  }
  return { ...a, disallowed };
}

/** Ducter's own MCP servers, told the session is sandboxed (?sandbox=read-only), once. */
function sandboxedMcp(servers: McpServer[]): McpServer[] {
  return servers.map((m) => ("url" in m && m.url && !/[?&]sandbox=read-only\b/.test(m.url) ? { ...m, url: m.url + (m.url.includes("?") ? "&" : "?") + "sandbox=read-only" } : m));
}

/** Spec -> OAR options for one harness (exported for tests; no process is started). */
export function adaptSpec(spec: SessionSpec, ctx: { env?: Record<string, string | null>; dataDir: string; refused?: Readonly<Record<string, string>>; inherited?: Record<string, string | undefined>; liveWindow?: number }): Adapted {
  const h = spec.harness;
  const refused = ctx.refused ?? {};
  const clean = !!spec.isolateUserConfig;
  // What Ducter itself sets for this session; the rest of the child's env is the allowlist (D102).
  let env: Record<string, string | null> | undefined = spec.env ? { ...spec.env } : undefined;
  let systemPrompt = spec.systemPrompt;
  let appendSystemPrompt = spec.appendSystemPrompt;
  let preamble: string | undefined;
  let launchArgs: string[] | undefined;
  let dshAccount = false;
  let disallowed = [...new Set([...(DISALLOWED[h] ?? []), ...(spec.disallowedTools ?? [])])];
  let mcpServers: McpServer[] = spec.mcp.map((m): McpServer =>
    "command" in m
      ? { name: m.name, command: m.command, ...(m.args ? { args: m.args } : {}), ...(m.env ? { env: m.env } : {}) }
      : { name: m.name, type: "http", url: m.url, headers: m.headers },
  );

  // D135: the window and compaction point, as this harness takes them (harness-facts.ts).
  const window = spec.contextWindow ?? spec.harnessCompactAt;
  const knobs = window ? windowKnobs(h, { window, compactAt: spec.harnessCompactAt ?? window }, modelFor(h, spec.model), ctx.liveWindow) : undefined;

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
          else launchArgs = [...(launchArgs ?? []), "--settings", JSON.stringify({ ...settings, ...CLAUDE_SKILL_LISTING, ...pluginsOff(spec) })];
        }
      }
      // D168: the user's own Mem plugin stays out of a task that keeps the user's setup (memory
      // comes from Ducter there); under the clean setup none of their plugins load anyway.
      if (!clean && spec.userConfiguration !== "exclude" && spec.disablePlugins?.length && !launchArgs?.includes("--settings"))
        launchArgs = [...(launchArgs ?? []), "--settings", JSON.stringify(pluginsOff(spec))];
      // D393: Mem's plugin as the home carries it, for this session only (nothing installed there).
      for (const u of spec.pluginUrls ?? []) if (/^https?:\/\//.test(u)) launchArgs = [...(launchArgs ?? []), "--plugin-url", u];
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
      // D282: a task that keeps the person's setup lists their skills as their own Codex would.
      if (knobs && spec.preCompactNote !== undefined && !clean && spec.userConfiguration !== "exclude") launchArgs = [...(launchArgs ?? []), "-c", `skills.max_context_tokens=${CODEX_SKILL_TOKENS}`];
      // D142: a folder task writes only inside its folder (and the temp folders). OAR passes
      // its own sandbox_mode first; a later -c wins (checked with codex 0.167 config/read, and
      // `codex sandbox` refused a write in the home folder). Network stays on.
      if (spec.confineWrites) {
        launchArgs = [...(launchArgs ?? []), "-c", `sandbox_mode="workspace-write"`, "-c", "sandbox_workspace_write.network_access=true"];
        // D515 (research/222): and the person's own servers keep working there. Under the sandbox
        // with approvals off, Codex 0.172 declines every MCP call not marked read-only ("requires
        // approval, but approval policy is never"), so a folder task lost the person's Mem, docs and
        // app servers; OAR's default (no sandbox) runs them. Each server their config.toml names
        // gets its tools approved for this session, unless they set an approval of their own.
        if (!clean && spec.userConfiguration !== "exclude") launchArgs = [...launchArgs, ...codexApproveTheirServers(readCodexConfig(ctx.env ?? {}))];
        // Under any sandbox Codex declines an MCP call not marked read-only (2026-11-11: a folder
        // task on hel had report_to_main declined for hours, "approval policy is never"); the URL
        // tells Ducter's MCP the session is sandboxed, and it marks its tools (core/src/mcp.ts).
        mcpServers = sandboxedMcp(mcpServers);
      }
      break;
    case "pi":
      // The clean setup is the runtime variant's flags (defaultLoader). D241: `--no-context-files`
      // drops the project's AGENTS.md with the person's global one, and pi has no flag for only the
      // global one; a task (its brief appended, no prompt of its own) gets its project's files back here.
      if (clean && systemPrompt === undefined) {
        const project = piProjectContext(spec.cwd, ctx.env ?? {});
        if (project) appendSystemPrompt = [appendSystemPrompt, project].filter(Boolean).join("\n\n");
      }
      break;
    case "deepseek-harness": {
      disallowed = []; // DSH: per-session tool denial unverified (OAR refuses it)
      // Stdio only: each HTTP server becomes Ducter's bridge, its endpoint in a 0600 file.
      mcpServers = bridged(mcpServers, ctx.dataDir);
      const instructions = [systemPrompt, appendSystemPrompt].filter(Boolean).join("\n\n");
      // Memory off in a task (harness-facts memPlugin "home"): Mem ships as a DSH profile bundle and
      // DSH has no known per-session profile switch, so the task runs under a Ducter-owned home of
      // its own too (research/48 M3).
      const memOff = !clean && !!spec.disablePlugins?.length;
      // D241: a browser place (userConfiguration "exclude", withBrowser) leaves the person's DSH
      // setup out the same way: their profiles, plugins (Mem's bundle among them), AGENTS.md and
      // ~/.agents stay out of a session that reads hostile pages. DSH's own tools are its built-in
      // `acp` profile's, so they all stay (the layer drops none for a session that may write).
      const browser = !clean && spec.userConfiguration === "exclude";
      // D371: signed in only with the DeepSeek account (the desktop app's 登录): the account route.
      dshAccount = !env?.[DSH_KEY_ENV] && dshSignIn(ctx.dataDir, ctx.env ?? {}) === "account";
      if (clean || memOff || browser) {
        // A Ducter-owned home: none of the user's profiles, plugins, AGENTS.md or ~/.agents, and a
        // profile layer of Ducter's own (D177, research/50): the clean session's prompt is the
        // system prompt's whole opener (a prompt with `{{` would be read as DSH template variables,
        // so it rides in AGENTS.md instead), a read-only or tool-less session has no tool that runs
        // or writes, the session-log upload is off, and the compactor fires where the plan says.
        const asPrompt = clean && !!systemPrompt && !systemPrompt.includes("{{") ? systemPrompt : undefined;
        const agentsMd = asPrompt ? (appendSystemPrompt ?? "") : instructions;
        // D371: the account's sign-in is a grant in the person's own credential file, which a home
        // of Ducter's doesn't have: its credential store reads that file where it is (never copied;
        // DSH's own `credentials` row, research/140). A key still rides in the env, as before.
        const credentials = dshAccount ? dshCredentialsFile(dshEnv(ctx.env ?? {})) : undefined;
        const layer = dshLayer({ prompt: asPrompt, readOnly: spec.readOnly, noTools: spec.noTools, noWeb: spec.noWeb, webOnly: spec.webOnly, compaction: knobs?.profile, ...(credentials ? { credentials } : {}) });
        // One home per setup: sessions live in their home, so the same prompt and tools resume
        // where they were, and a one-shot starting beside the partner never rewrites its files.
        const key = createHash("sha256").update(JSON.stringify(layer)).update("\0").update(agentsMd).digest("hex").slice(0, 12);
        // A task's home is its folder's (its brief can change between sessions: the brief written
        // after the open, a browser switch), so its sessions resume in the same home.
        const perTask = (dir: string) => join(ctx.dataDir, "harness", dir, createHash("sha256").update(spec.cwd).digest("hex").slice(0, 12));
        const at = browser ? perTask("deepseek-harness-browser") : memOff ? perTask("deepseek-harness-memory-off") : join(ctx.dataDir, "harness", "dsh", key);
        const { home, agents } = writeDshHome(at, layer, agentsMd);
        env = { ...env, DSH_HOME: home, DSH_AGENTS_HOME: agents, DSH_TELEMETRY_DISABLED: "1" };
        // The person's key where they keep it for DSH itself (its own credential file): a home of
        // Ducter's has no such file, so the key (never the file) rides in the launch env, which
        // DSH reads after the file (research/34). One already in the env or keys.env wins.
        if (!harnessKey(ctx.dataDir, DSH_KEY_ENV, ctx.env ?? {}) && !env[DSH_KEY_ENV]) {
          const own = dshCredentialKey(ctx.env ?? {});
          if (own) env[DSH_KEY_ENV] = own;
        }
        // Underneath the dropped tools, DSH's own read-only sandbox preset (research/50 §2).
        if (spec.readOnly || spec.noTools || spec.webOnly) env[DSH_PROFILE.permissionEnv] = "read-only";
      } else if (instructions) {
        preamble = instructions;
      }
      systemPrompt = appendSystemPrompt = undefined;
      break;
    }
    case "antigravity": {
      // D416 (OAR 0.124 docs/runtimes/antigravity.md). Tool denial is refused (the task keeps agy's
      // own tools; no browser place ever comes here: candidates' no_web).
      disallowed = [];
      // agy writes a session's MCP entries, env and headers included, into its conversation
      // database, and OAR refuses an entry carrying either. Ducter's endpoint goes through its
      // stdio bridge: the entry holds only the bridge's command and the path of a 0600 file with
      // the URL and token, so no credential reaches agy's disk. A stdio entry with its own env is
      // left out (only a browser place's sidecar has one, and none comes here).
      mcpServers = bridged(mcpServers, ctx.dataDir).filter((m) => !("env" in m && m.env && Object.keys(m.env).length));
      // No replacement channel for the system prompt: instructions are appended to agy's own
      // (_meta.antigravity.systemPrompt.append), which OAR sends again on every resume.
      if (systemPrompt) (appendSystemPrompt = [systemPrompt, appendSystemPrompt].filter(Boolean).join("\n\n")), (systemPrompt = undefined);
      break;
    }
  }

  if (spec.readOnly) {
    ({ disallowed, launchArgs, env } = readOnlyFor(h, { disallowed, launchArgs, env }));
    // Codex declines MCP calls under its sandbox unless a tool is marked read-only: the URL tells
    // Ducter's MCP the session is sandboxed, and it marks the partner's tools (core/src/mcp.ts).
    if (h === "codex") mcpServers = sandboxedMcp(mcpServers);
  }

  // D378: the partner has none of the harness's own web tools; a task reads the web and reports.
  if (spec.noWeb) {
    const off = HARNESS_FACTS[h].noWeb.value;
    disallowed = [...disallowed, ...off.deny.filter((t) => !disallowed.includes(t))];
    if (off.args.length) launchArgs = [...(launchArgs ?? []), ...off.args];
  }

  // D380: a quick web look holds the harness's web tools and nothing else (harness-facts webLook).
  if (spec.webOnly) {
    const w = HARNESS_FACTS[h].webLook.value;
    if (!w.supported) throw new Error(`${h} can't run a quick web look (harness-facts webLook)`);
    if (w.args.length) launchArgs = [...(launchArgs ?? []).filter((a, i, all) => a !== "--tools" && all[i - 1] !== "--tools"), ...w.args];
    if (h === "claude-code") disallowed = []; // an allowlist: nothing else is there to deny
    mcpServers = [];
  }

  // D512: a clean Codex session takes Ducter's own servers as one launch override placed before
  // the person's servers are turned off, never as OAR's thread config (codexOwnServers).
  if (h === "codex" && launchArgs && (clean || spec.userConfiguration === "exclude") && mcpServers.length) {
    const own = codexOwnServers(mcpServers);
    launchArgs = [...own.args, ...launchArgs];
    env = { ...env, ...own.env };
    mcpServers = [];
  }

  // What the runtime says it cannot honor is never sent (OAR refuses by presence).
  if (refused.systemPrompt && systemPrompt) (preamble = [systemPrompt, preamble].filter(Boolean).join("\n\n")), (systemPrompt = undefined);
  if (refused.appendSystemPrompt && appendSystemPrompt) (preamble = [preamble, appendSystemPrompt].filter(Boolean).join("\n\n")), (appendSystemPrompt = undefined);
  if (refused.disallowedTools) disallowed = [];
  if (refused.launchArgs) launchArgs = undefined;

  const options: SessionOptions = {
    cwd: spec.cwd,
    model: modelFor(h, window ? modelForWindow(h, spec.model, window) : spec.model, dshAccount),
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

/** Each HTTP server as Ducter's stdio bridge, its endpoint (URL and headers) in a 0600 file under the data folder. */
function bridged(servers: McpServer[], dataDir: string): McpServer[] {
  return servers.map((m) => {
    if (!("url" in m) || !m.url) return m;
    const file = writeBridgeTarget(join(dataDir, "mcp-bridge"), { url: m.url, headers: { ...(m.headers ?? {}) } });
    const b = bridgeCommand(file);
    return { name: m.name, command: b.command, args: b.args };
  });
}

/** D168: Claude Code settings that turn the named plugins off for this session only. */
function pluginsOff(spec: SessionSpec): { enabledPlugins?: Record<string, false> } {
  const ids = spec.disablePlugins ?? [];
  return ids.length ? { enabledPlugins: Object.fromEntries(ids.map((id) => [id, false as const])) } : {};
}

/**
 * DeepSeek Harness routes by provider/model; a bare DeepSeek name gets the official provider, or
 * (D371) the account route when only the DeepSeek account is signed in (dsh.ts dshModel).
 */
function modelFor(h: HarnessId, model: string | undefined, dshAccount = false): string | undefined {
  if (h === "deepseek-harness") return dshModel(model, dshAccount);
  return model || undefined;
}

export function createOarHarnessPort(opts: OarPortOptions = {}): HarnessPort {
  const load = opts.loadRuntime ?? defaultLoader;
  const dataDir = opts.dataDir ?? process.env.DUCTER_DATA_DIR ?? join(homedir(), ".ducter");
  // D352: each listed model's window as the last listing gave it ("<harness> <model>").
  const liveWindows = new Map<string, number>();
  return {
    async start(spec) {
      // D549: an agent that refuses to run as root (Claude Code with approvals off) isn't started
      // as root at all: its own words, at once, instead of a process that exits under a first turn.
      const refusal = rootRefusal(spec.harness, (opts.uid ?? (() => process.getuid?.()))());
      if (refusal) throw new Error(refusal);
      const rt = await load(spec.harness, piVariant(spec));
      if (!rt) throw new Error(`harness ${spec.harness} is not supported`);
      const inst = await rt.installation?.({ env: harnessEnv(spec.harness, { env: opts.env, dataDir }) });
      // D416: a copy OAR refuses (agy below its floor) says why, not "not installed".
      if (inst?.kind === "unsupported") throw new Error(`harness ${spec.harness} can't run here: ${(inst as { reason?: string }).reason ?? "unsupported"}`);
      if (!inst || inst.kind !== "available") throw new Error(`harness ${spec.harness} is not installed`);
      const liveWindow = spec.model ? liveWindows.get(`${spec.harness} ${spec.model}`) : undefined;
      const a = adaptSpec(spec, { env: opts.env, dataDir, refused: (rt as { refusedSessionOptions?: Record<string, string> }).refusedSessionOptions, ...(liveWindow ? { liveWindow } : {}) });
      // D333: a clean Codex session has no server of the person's that Codex itself still lists.
      let launchArgs = a.options.launchArgs;
      if (spec.harness === "codex" && a.clean && launchArgs) {
        const command = (inst as { command?: unknown }).command;
        const off = typeof command === "string" ? codexLeftoverServers(command, [...launchArgs], a.options.env ?? {}, spec.mcp.map((m) => m.name), opts.codexMcpList) : [];
        if (off.length) launchArgs = [...launchArgs, ...codexServersOff(off)];
      }
      // D417: Mem's two steps around an agent that can't load Mem's plugin for one session; the
      // bundle is read while the session opens, so a slow Mem delays it at most CONTEXT_MS.
      const steps = memStepsFor(spec, a.options.env ?? {}, opts.memSteps);
      const [session, bundle] = await Promise.all([
        rt.session(inst, { ...a.options, ...(launchArgs ? { launchArgs } : {}), retainedBytes: opts.retainedBytes ?? 8 * 1024 * 1024 }),
        steps && !spec.resumeSessionId ? readContext(steps.exec, steps.nmem, steps.fact.contextApp, steps.env) : Promise.resolve(undefined),
      ]);
      const saver = steps ? threadSaver(() => saveThread(steps.exec, steps.nmem, steps.fact.threadFrom, session.id, spec.cwd, steps.env), opts.memSteps) : undefined;
      return wrapSession(session, spec.resumeSessionId ? undefined : a.preamble, spec.harness, { ...(bundle ? { lead: bundle } : {}), ...(saver ? { turnEnded: () => saver.turnEnded() } : {}) });
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
          // model". DeepSeek Harness lists its catalog without a key, so: has a DeepSeek key, or
          // (D371) the DeepSeek account its app signed in with.
          const auth = rt.authStatus ? await rt.authStatus(inst, { env, timeoutMs: 15_000 }).catch(() => undefined) : undefined;
          const listed = await rt.listModels?.(inst, { env, timeoutMs: 30_000 }).catch(() => undefined);
          const models = listed?.kind === "ok" ? listed.models.filter((m) => !m.disabled).map((m) => m.id) : undefined;
          const loggedIn = auth ? auth.kind === "logged_in" : harness === "deepseek-harness" ? !!dshSignIn(dataDir, opts.env ?? {}) : (models?.length ?? 0) > 0;
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
        if (r.kind !== "ok") return undefined;
        // D352: merged with the registry; a model it doesn't know yet takes Codex's own window.
        const listed = listedModels(r.models);
        const command = (inst as { command?: unknown }).command;
        const unknown = h === "codex" && listed.some((m) => !HARNESS_FACTS.codex.models.value[m.id]);
        const catalog = unknown && typeof command === "string" ? parseCodexCatalog(await (opts.codexCatalog ?? readCodexCatalog)(command, fullEnv(env)).catch(() => "")) : {};
        const live = liveModels(h, listed, catalog);
        for (const m of live) if (m.window) liveWindows.set(`${h} ${m.id}`, m.window);
        return live;
      } catch {
        return undefined;
      }
    },

    // D534: the agent's own commands or skills in a task's folder, as its composer's / list shows
    // them (OAR's inventories: Claude Code's initialize.commands, Codex's skills/list, pi's
    // get_commands; all token-free). Read with the same env as a task's session.
    async inventory(harness, kind, cwd) {
      if (!(HARNESS_IDS as readonly string[]).includes(harness)) return undefined;
      try {
        const h = harness as HarnessId;
        const rt = await load(h);
        const read = (rt as unknown as Record<string, ((i: unknown, o: unknown) => Promise<{ kind: string; items?: { name: string; description?: string; source?: string; userInvocable?: boolean }[] }>) | undefined> | undefined)?.[kind];
        const env = harnessEnv(h, { env: opts.env, dataDir });
        const inst = await rt?.installation?.({ env });
        if (!read || !inst || inst.kind !== "available") return undefined;
        const r = await read(inst, { env, cwd, timeoutMs: 20_000 });
        if (r.kind !== "ok" || !r.items) return undefined;
        return r.items.map((i) => ({ name: i.name, ...(i.description ? { description: i.description } : {}), ...(i.source ? { source: i.source } : {}), ...(i.userInvocable === false ? { userInvocable: false } : {}) }));
      } catch {
        return undefined;
      }
    },

    // D416: the agent's own sign-out (Antigravity: ACP `logout` on a fresh `agy acp`, then `agy
    // models` decides). Never deletes a credential file itself.
    async logout(harness) {
      if (!(HARNESS_IDS as readonly string[]).includes(harness)) return { ok: false, detail: "unknown agent" };
      try {
        const h = harness as HarnessId;
        const rt = await load(h);
        const out = (rt as { logout?: (i: unknown, o: unknown) => Promise<{ kind: string; detail?: string; reason?: string }> } | undefined)?.logout;
        if (!rt || !out) return { ok: false, detail: "this agent has no sign-out Ducter can run" };
        const env = harnessEnv(h, { env: opts.env, dataDir });
        const inst = await rt.installation?.({ env });
        if (!inst || inst.kind !== "available") return { ok: false, detail: "not installed here" };
        const r = await out(inst, { env, timeoutMs: 60_000 });
        return r.kind === "logged_out" ? { ok: true } : { ok: false, detail: r.detail ?? r.reason ?? r.kind };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },

    // D288: the account's usage limits, as the agent reads them itself with no model call (OAR
    // accountUsage: Claude Code's get_usage control query in --safe-mode, Codex's
    // account/rateLimits/read). Agents without a reader (pi, DeepSeek Harness) don't say.
    async accountUsage(harness) {
      if (!(HARNESS_IDS as readonly string[]).includes(harness)) return { why: "unsupported" };
      // D594: Antigravity's quota is never read by Ducter (OAR's reader runs `agy -p "/usage"`,
      // polling the account on its own): what a running session says (a limit hit) still counts.
      if (directOnly(harness)) return { why: "unsupported" };
      try {
        const h = harness as HarnessId;
        const rt = await load(h);
        const env = harnessEnv(h, { env: opts.env, dataDir });
        const read = (rt as { accountUsage?: (i: unknown, o: unknown) => Promise<unknown> } | undefined)?.accountUsage;
        if (!rt || !read) return { why: "unsupported" };
        const inst = await rt.installation?.({ env });
        if (!inst || inst.kind !== "available") return { why: "unsupported" };
        return accountUsageOf(h, await read(inst, { env, timeoutMs: 30_000, limitResetDetails: false }), new Date().toISOString());
      } catch {
        return { why: "unavailable" };
      }
    },
  };
}

/** D288: OAR's AccountUsageSnapshot as Ducter's AccountUsage (the reset credits left out). */
export function accountUsageOf(harness: string, snap: unknown, at: string): { usage?: AccountUsage; why?: "unsupported" | "signed_out" | "unavailable" } {
  const s = snap as { kind?: string; plan?: string; email?: string; displayName?: string; rateLimited?: boolean; windows?: { label: string; usedRatio: number; resetsAt?: string; id?: string; durationMs?: number }[] } | undefined;
  if (s?.kind === "reauth_required") return { why: "signed_out" };
  if (s?.kind !== "available") return { why: "unsupported" };
  const account = s.email || s.displayName;
  return {
    usage: {
      harness,
      ...(s.plan ? { plan: s.plan } : {}),
      ...(account ? { account } : {}),
      ...(s.rateLimited ? { limited: true } : {}),
      windows: (s.windows ?? []).map((w) => ({ label: w.label, used: w.usedRatio, ...(w.id ? { id: w.id } : {}), ...(w.resetsAt ? { resetsAt: w.resetsAt } : {}), ...(w.durationMs ? { durationMs: w.durationMs } : {}) })),
      at,
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
  /** A turn is running or a prompt is pending. Background work is apart: backgroundLive(). */
  busy(): boolean;
  /**
   * D266: background tasks the harness reported started and not yet ended (OAR task_started /
   * task_ended at the root: a Claude Code background shell, Monitor or background subagent, a
   * Codex subagent; ambient upkeep left out). The runner counts the same from the events, so a
   * worker's session (whose events cross the wire) needs nothing more.
   */
  backgroundLive(): number;
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

/**
 * D417: what Mem's steps need for this session, or undefined: not asked for (memory off, a browser
 * place, an agent with its own way), no fact for the agent, no nmem in the session's env, or the
 * person's own Mem plugin for it there (it does both itself; never both).
 */
function memStepsFor(spec: SessionSpec, overlay: Record<string, string | null>, seam: OarPortOptions["memSteps"]) {
  const fact = HARNESS_FACTS[spec.harness]?.memSteps?.value;
  if (!spec.memSteps || !fact) return undefined;
  const env = fullEnv(overlay);
  const nmem = seam?.nmem ?? nmemOf(env);
  if (!nmem) return undefined;
  const home = seam?.home ?? env.HOME ?? homedir();
  if (theirMemPlugin(fact.plugin, home, spec.cwd)) return undefined;
  return { fact, env, nmem, exec: seam?.exec ?? realExec };
}

function wrapSession(s: Session, preamble?: string, harness?: HarnessId, mem: { lead?: string; turnEnded?: () => void } = {}): HarnessSessionExt {
  // At turn_ended OAR has already folded the turn's usage (live, claude 2.1.319: contextUsage()
  // read in the turn_ended callback equals the usage record that follows it).
  const normalizer = new Normalizer(() => {
    const t = s.usage().value.total;
    const ctx = s.contextUsage?.().value;
    const contextTokens = contextTokensOf(ctx, harness);
    if (!t && contextTokens === undefined) return undefined;
    // D288: the window the harness read it against (Claude Code's modelUsage.contextWindow, Codex's modelContextWindow).
    const contextWindow = contextTokens !== undefined && ctx?.contextWindow && ctx.contextWindow > 0 ? ctx.contextWindow : undefined;
    return { ...(t ? { inputTokens: t.input, outputTokens: t.output, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite } : {}), ...(contextTokens !== undefined ? { contextTokens } : {}), ...(contextWindow ? { contextWindow } : {}) };
  }, { canStop: typeof s.stopTask === "function" });
  // One buffered queue feeding one async iterator; subscription starts at open (cursor 0).
  const buf: HarnessEvent[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  let firstSend = preamble;
  let lead = mem.lead;
  const push = (evs: HarnessEvent[]) => {
    if (evs.length === 0) return;
    buf.push(...evs);
    wake?.();
  };
  // D288: the account's limits as the session says them live (frames OAR reads no events from).
  const unRaw = s.rawEvents?.((r) => {
    if (r.kind !== "frame" || r.agentPath.length) return;
    const n = nativeUsage(r.body.type, r.body.native);
    if (n?.limits) push(normalizer.native({ limits: n.limits }));
  });
  /** D288: a compaction's sizes, from the native frame its compaction_ended was read from. */
  const nativeOf = (seq: number) => {
    const rs = s.records?.() ?? [];
    for (let i = rs.length - 1; i >= 0 && i >= rs.length - 64; i--) {
      const r = rs[i]!;
      if (r.seq === seq) return r.kind === "frame" ? nativeUsage(r.body.type, r.body.native) : undefined;
      if (r.seq < seq) break;
    }
    return undefined;
  };
  const unsubscribe = s.events((ev) => {
    if (ev.kind === "compaction_ended" && !ev.agentPath.length) normalizer.native({ compact: nativeOf(ev.seq)?.compact });
    if (ev.kind === "turn_ended" && !ev.agentPath.length) mem.turnEnded?.();
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
    // D417: Mem's Context Bundle in front of the first message, as Mem's plugin puts it there.
    if (lead) (text = `${lead}\n\n${text}`), (lead = undefined);
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
    backgroundLive: () => (ended ? 0 : normalizer.backgroundLive()),
    async send(text, mode = "turn", pics, _files, inputId) {
      const input = framed(text);
      // D206: the runtime's own image input; a runtime that takes none gets the words only (the
      // runner already told an agent that can't see them, so this is the last guard).
      const images = pics?.length && s.capabilities?.images !== false ? pics.map((p) => ({ path: p.path, mediaType: p.mediaType })) : undefined;
      const o = { origin: { kind: "user" as const, source: "ducter" }, ...(images ? { images } : {}), ...(inputId ? { inputId } : {}) };
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
    // D521: one background job stopped by the agent's own stop (Claude Code's TaskStop, a Codex
    // subagent's turn interrupted, DeepSeek Harness's job kill). Accepted is only the agent's
    // acknowledgement: its end comes as the job's own task_ended.
    ...(typeof s.stopTask === "function"
      ? {
          async stopBackground(id: string) {
            const r = (await s.stopTask!(id)) as { kind?: string; reason?: string };
            if (r?.kind === "rejected") throw new Error(r.reason || "the agent refused to stop it");
          },
        }
      : {}),
    // D282: the runtime's own manual compaction (Codex; Claude Code takes `/compact` as typed).
    ...(typeof s.compact === "function"
      ? {
          async compact() {
            const r = (await s.compact!()) as { kind?: string; reason?: string } | undefined;
            if (r && (r.kind === "rejected" || r.kind === "failed")) throw new Error(`compaction ${r.kind}: ${r.reason ?? "unknown"}`);
          },
        }
      : {}),
    async close() {
      try {
        await s.dispose();
      } finally {
        unsubscribe();
        unRaw?.();
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
