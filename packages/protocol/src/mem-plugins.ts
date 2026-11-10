// D169: Nowledge Mem in the user's own AI agents (design/memory.md "Mem and tasks").
// `nmem --json plugins inspect` is local-only and read-only: it reads each agent's own plugin
// registrations on this machine and says what it found. This file turns its answer into the one
// line a device card shows per agent, and names the Mem plugin Ducter turns off inside its tasks
// (D168: inside Ducter's tasks, memory comes from Ducter).
import type { MemPluginView, MemPluginWhy } from "./index.ts";
import { nmemEnv } from "./tool-env.ts";

/** Mem's host name for each Ducter agent (harnesses.ts ids). */
export const MEM_HOSTS: Readonly<Record<string, string>> = {
  "claude-code": "claude-code",
  codex: "codex-cli",
  pi: "pi",
  "deepseek-harness": "deepseek-harness",
};

/**
 * The Mem plugin's id in each agent's own plugin registry, as Mem's setup guide installs it
 * (https://mem.nowledge.co/SKILL.md, read 2026-11-10). Turned off by id inside Ducter's tasks.
 */
export const MEM_PLUGIN_IDS: Readonly<Record<string, readonly string[]>> = {
  "claude-code": ["nowledge-mem@nowledge-community"],
  codex: ["nowledge-mem@nowledge-community"],
};

/** One host's entry in the inspect answer (schema_version 1). Fields we don't read are ignored. */
interface InspectHost {
  host?: unknown;
  installation?: unknown; // installed | absent | unknown
  enabled?: unknown; // true | false | null
  installed_version?: unknown;
  recommended_action?: unknown; // none | install | review (update / upgrade: a newer Mem)
  installations?: unknown;
  warnings?: unknown;
}

const MULTIPLE = /multiple registrations|cached versions|more than one/i;

/** One agent's line from its inspect entry; undefined when there is nothing honest to say. */
export function memPluginOf(e: InspectHost | undefined, checkedAt?: string): MemPluginView | undefined {
  if (!e || typeof e !== "object") return undefined;
  const at = checkedAt ? { checkedAt } : {};
  const action = typeof e.recommended_action === "string" ? e.recommended_action : "";
  const inst = typeof e.installation === "string" ? e.installation : "unknown";
  const warnings = Array.isArray(e.warnings) ? e.warnings.filter((w): w is string => typeof w === "string") : [];
  const version = typeof e.installed_version === "string" && e.installed_version ? e.installed_version : undefined;
  if (action === "update" || action === "upgrade") return { state: "update", ...(version ? { version } : {}), ...at };
  if (action === "install" || (inst === "absent" && action !== "review")) return { state: "absent", ...at };
  if (action === "none" && inst === "installed" && e.enabled !== false) return { state: "installed", ...(version ? { version } : {}), ...at };
  // Every entry carries "runtime loading is not verified": that alone never makes a review. A
  // review is the check's own word, or an install it can't call enabled.
  if (action === "review" || inst === "installed" || inst === "unknown") {
    const why: MemPluginWhy = warnings.some((w) => MULTIPLE.test(w)) ? "multiple" : "unclear";
    return { state: "review", why, ...at };
  }
  return undefined;
}

/** The inspect answer as one line per Ducter agent; {} when it can't be read. */
export function memPluginsFromInspect(json: unknown, checkedAt?: string): Record<string, MemPluginView> {
  const out: Record<string, MemPluginView> = {};
  const list = json && typeof json === "object" && Array.isArray((json as { plugins?: unknown }).plugins) ? ((json as { plugins: InspectHost[] }).plugins) : [];
  for (const [harness, host] of Object.entries(MEM_HOSTS)) {
    const v = memPluginOf(list.find((p) => p && p.host === host), checkedAt);
    if (v) out[harness] = v;
  }
  return out;
}

/** Runs the check: undefined when nmem isn't here or its answer can't be read (the card then says nothing). */
export type InspectExec = (argv: string[], timeoutMs?: number) => Promise<{ code: number; out: string }>;

export async function inspectMemPlugins(exec: InspectExec, now: () => Date = () => new Date()): Promise<Record<string, MemPluginView> | undefined> {
  const r = await exec(["nmem", "--json", "plugins", "inspect"], 20_000).catch(() => ({ code: -1, out: "" }));
  if (r.code !== 0 || !r.out.trim()) return undefined;
  try {
    // Some nmem builds print a notice line before the JSON: read from the first brace.
    const at = r.out.indexOf("{");
    return memPluginsFromInspect(JSON.parse(at > 0 ? r.out.slice(at) : r.out), now().toISOString());
  } catch {
    return undefined;
  }
}

/**
 * The real check: `nmem` with only its own settings (D102), stdout only (nmem may warn on
 * stderr), at most `ms`. Never used in tests: they pass a fake exec.
 */
export function nmemInspectExec(env: Record<string, string | undefined>): InspectExec {
  return async (argv, ms) => {
    if (!Bun.which(argv[0]!)) return { code: 127, out: "" };
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore", stdin: "ignore", env: nmemEnv(env) });
    const timer = setTimeout(() => p.kill(), ms ?? 20_000);
    try {
      const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
      return { code, out };
    } finally {
      clearTimeout(timer);
    }
  };
}
