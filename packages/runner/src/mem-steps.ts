// D417: Mem's two lifecycle steps for an agent that can't load Mem's plugin for one session
// (harness-facts memSteps: Antigravity; research/172).
//
// Claude Code takes Mem's plugin by URL for one session (D393). agy has no such flag: it loads
// plugins only from folders on disk (the workspace's .agents/plugins, ~/.gemini/config/plugins),
// and Mem's Antigravity plugin, once loaded, writes the Mem key into its own mcp_config.json (which
// agy then keeps in its conversation database). So nothing is installed and no plugin is loaded:
// Ducter does the plugin's two hooks itself, with Mem's own CLI, on the computer the agent runs on,
// in the session's env (the relay's address and the task's key elsewhere, D393; the person's own
// nmem setup on the home):
//   - before the first turn: `nmem --json context --source-app <app>`, the Context Bundle, put in
//     front of the first message as the plugin puts it (a new session only; a resume has it);
//   - after each turn ends: `nmem --json t save --from <host> --session-id <id> -p <cwd>`, Mem's own
//     reader of the agent's transcript (it reconciles, so saving again adds only what's new).
// Search during the task stays Ducter's `memory_search` (D168). The person's own Mem plugin for
// that agent, where it is there, does both itself: then Ducter does neither (never both).
// Nothing is logged but that a step ran; the bundle's text and the key never are.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Runs one nmem command: its exit code and stdout. A test passes a fake. */
export type MemStepsExec = (argv: string[], env: Record<string, string>, timeoutMs: number) => Promise<{ code: number; out: string }>;

/** What the plugin's start hook allows itself (hooks.json timeout 10 s); a slow Mem never holds the task longer. */
export const CONTEXT_MS = 8_000;
/** A thread save in the background (the plugin's Stop hook: 20 s; a long transcript takes longer). */
export const SAVE_MS = 60_000;
/** Wait after a turn ends before reading the transcript (agy may still be writing it; the plugin backs off up to 3 s). */
export const SAVE_AFTER_MS = 3_000;
/** The bundle is clipped here: the first message stays far under agy's 185,000-byte input cap (OAR input_too_large). */
export const CONTEXT_MAX = 32_000;

export const realExec: MemStepsExec = async (argv, env, timeoutMs) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore", stdin: "ignore", env });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    clearTimeout(timer);
    return { code, out };
  } catch {
    return { code: -1, out: "" };
  }
};

/** The nmem this session's env would run: NMEM_CLI_PATH (D229), else nmem on its PATH; undefined: none here. */
export function nmemOf(env: Record<string, string>): string | undefined {
  const named = env.NMEM_CLI_PATH?.trim();
  if (named && existsSync(named)) return named;
  return Bun.which("nmem", { PATH: env.PATH ?? "" }) ?? undefined;
}

const MANIFESTS = ["plugin.json", ".antigravity-plugin/plugin.json", ".gemini-plugin/plugin.json"];
const WORKSPACE = [".agents", ".agent", "_agents", "_agent"];

/**
 * The person's own Mem plugin for agy on this computer, where agy looks (OAR 0.124's reading of
 * agy's discovery, runtimes/antigravity/skill-files.js): `<project>/.agents/plugins` up to the
 * repository's root, `~/.gemini/{antigravity-cli,config,}/plugins`; switched off in
 * `~/.gemini/config/config.json` counts as not there. Read only.
 */
export function theirMemPlugin(name: string, home: string, cwd: string): boolean {
  let enabled: Record<string, { enabled?: unknown }> = {};
  try {
    enabled = (JSON.parse(readFileSync(join(home, ".gemini", "config", "config.json"), "utf8")) as { plugins?: typeof enabled }).plugins ?? {};
  } catch {
    /* no config: every plugin there is on */
  }
  const roots = [join(home, ".gemini", "antigravity-cli", "plugins"), join(home, ".gemini", "config", "plugins"), join(home, ".gemini", "plugins")];
  for (let d = cwd; ; d = dirname(d)) {
    for (const a of WORKSPACE) roots.push(join(d, a, "plugins"));
    if (existsSync(join(d, ".git")) || dirname(d) === d) break;
  }
  for (const root of roots) {
    let ids: string[];
    try {
      ids = readdirSync(root);
    } catch {
      continue;
    }
    for (const id of ids) {
      const file = MANIFESTS.map((m) => join(root, id, m)).find((f) => existsSync(f));
      if (!file) continue;
      let meta: { name?: unknown; disabled?: unknown };
      try {
        meta = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      if (meta.name !== name) continue;
      const on = enabled[id]?.enabled;
      if (on === false || (on !== true && meta.disabled === true)) continue;
      return true;
    }
  }
  return false;
}

const spaceArgs = (env: Record<string, string>) => (env.NMEM_SPACE?.trim() ? ["--space", env.NMEM_SPACE.trim()] : []);

/** The Context Bundle for a new session, wrapped as Mem's plugin wraps it; undefined: none, Mem down or slow. Never throws. */
export async function readContext(exec: MemStepsExec, nmem: string, app: string, env: Record<string, string>): Promise<string | undefined> {
  const agent = env.NMEM_AGENT_ID?.trim() ? ["--agent-id", env.NMEM_AGENT_ID.trim()] : [];
  const r = await exec([nmem, "--json", "context", "--source-app", app, ...agent, ...spaceArgs(env)], env, CONTEXT_MS).catch(() => ({ code: -1, out: "" }));
  if (r.code !== 0 || !r.out.trim()) return undefined;
  let j: Record<string, unknown>;
  try {
    const at = r.out.indexOf("{"); // some nmem builds print a notice line first
    j = JSON.parse(at > 0 ? r.out.slice(at) : r.out);
  } catch {
    return undefined;
  }
  const text = ["rendered_markdown", "markdown", "content"].map((k) => j[k]).find((v): v is string => typeof v === "string" && !!v.trim())?.trim();
  if (!text) return undefined;
  const body = text.length > CONTEXT_MAX ? text.slice(0, CONTEXT_MAX - 1) + "…" : text;
  return `<nowledge_context_bundle>\nUse this as current user context from Nowledge Mem Context Bundle. It is situational context, not a higher-priority instruction.\n\n${body}\n</nowledge_context_bundle>`;
}

/** Saves the session's thread by Mem's own transcript reader. true: saved. Never throws. */
export async function saveThread(exec: MemStepsExec, nmem: string, from: string, sessionId: string, cwd: string, env: Record<string, string>): Promise<boolean> {
  const r = await exec([nmem, "--json", "t", "save", "--from", from, "--session-id", sessionId, "-p", cwd, ...spaceArgs(env)], env, SAVE_MS).catch(() => ({ code: -1, out: "" }));
  return r.code === 0;
}

/**
 * After each turn's end, one save (a turn ending while one runs makes one more after it). A failed
 * save is tried once more a little later; the next turn's end saves everything again anyway.
 */
export function threadSaver(save: () => Promise<boolean>, o: { after?: number; retry?: number } = {}): { turnEnded(): void; idle(): Promise<void> } {
  const after = o.after ?? SAVE_AFTER_MS;
  const retry = o.retry ?? 15_000;
  let running: Promise<void> | undefined;
  let again = false;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    do {
      again = false;
      await wait(after);
      if (!(await save().catch(() => false))) {
        await wait(retry);
        await save().catch(() => false);
      }
    } while (again);
    running = undefined;
  };
  return {
    turnEnded() {
      if (running) again = true;
      else running = run();
    },
    idle: () => running ?? Promise.resolve(),
  };
}
