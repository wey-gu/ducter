// D169: Nowledge Mem in the user's own AI agents (design/memory.md "Mem and tasks").
// `nmem --json plugins inspect` is local-only and read-only: it reads each agent's own plugin
// registrations on this machine and says what it found. This file turns its answer into the one
// line a device card shows per agent, and names the Mem plugin Ducter turns off inside its tasks
// (D168: inside Ducter's tasks, memory comes from Ducter).
import { HARNESS_FACTS } from "./harness-facts.ts";
import type { MemPluginView, MemPluginWhy } from "./index.ts";
import { nmemEnv } from "./tool-env.ts";
import { compareVersions, isVersion } from "./version.ts";
import { whichNow } from "./which.ts";

// The plugin's facts per agent live in the registry with their evidence (harness-facts memPlugin,
// research/48 M4); these two views are read from it.
const facts = Object.values(HARNESS_FACTS).flatMap((f) => (f.memPlugin ? [[f.harness, f.memPlugin.value] as const] : []));

/** Mem's host name for each Ducter agent (harnesses.ts ids). */
export const MEM_HOSTS: Readonly<Record<string, string>> = Object.fromEntries(facts.map(([h, m]) => [h, m.host]));

/**
 * The Mem plugin's id(s) in each agent's own plugin registry, as Mem's setup guide installs it.
 * Every agent Mem has a plugin for has them, so "memory off" holds on every one (research/48 M3):
 * the adapter (runner/oar.ts) turns them off the way harness-facts says.
 */
/** D597: the commands that update each agent's Mem plugin directly (harness-facts memUpdate); an agent without them updates by a task. */
export const MEM_PLUGIN_UPDATE: Readonly<Record<string, readonly (readonly string[])[]>> = Object.fromEntries(
  Object.values(HARNESS_FACTS).flatMap((f) => (f.memUpdate ? [[f.harness, f.memUpdate.value] as const] : [])),
);

/** D597: one command of a direct update as it ran: what ran, its exit code (-1: it didn't start or ran out of time), its last lines, scrubbed. */
export interface MemUpdateStep {
  cmd: string;
  code: number;
  tail: string;
}

/** D597: a direct update's run on one computer: every command it ran, in order (it stops at the first that fails). */
export interface MemUpdateRun {
  ok: boolean;
  steps: MemUpdateStep[];
}

/**
 * D597: a Nowledge Mem connect link, token or key in words the person typed to a task, hidden
 * before they are kept: Ducter supplies its own Mem connection, so a reply box is never where one
 * goes (haswell, 2026-11-26: a pasted connect prompt reached the task and the Log). Only Mem's own
 * shapes: `nmem_ct_…`/`nmem_ck_…`, a link carrying `nmem_connect=` or `nmem_api_key=` or a
 * `/connect?key=`/`token=`, and the value after `--api-key` (a `<placeholder>` stays).
 */
export function hideMemSecrets(text: string): { text: string; hid: boolean } {
  const out = text
    .replace(/https?:\/\/\S*(?:nmem_connect=|nmem_api_key=|\/connect\?(?:key|token)=)\S*/gi, "<link>")
    .replace(/\bnmem_[a-z]{2}_[A-Za-z0-9_\-]{6,}/g, "nmem_…")
    .replace(/(--api-key[=\s]+)(?!<)("[^"]*"|'[^']*'|\S+)/g, "$1…");
  return { text: out, hid: out !== text };
}

export const MEM_PLUGIN_IDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(facts.map(([h, m]) => [h, m.ids]));

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
    // D466: several copies are said by their versions (the author's Codex: 0.1.10 and 0.1.53).
    const versions = why === "multiple" ? copiesOf(e.installations) : [];
    return { state: "review", why, ...(versions.length > 1 ? { versions } : {}), ...at };
  }
  return undefined;
}

/** Each copy's version from an inspect entry's `installations`, distinct, oldest first. */
function copiesOf(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const vs = list.map((i) => (i && typeof i === "object" ? (i as { version?: unknown }).version : undefined)).filter((v): v is string => typeof v === "string" && isVersion(v));
  return [...new Set(vs)].sort(compareVersions);
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
  const r = await exec([process.env.NMEM_CLI_PATH ?? "nmem", "--json", "plugins", "inspect"], 20_000).catch(() => ({ code: -1, out: "" }));
  if (r.code !== 0 || !r.out.trim()) return undefined;
  try {
    // Some nmem builds print a notice line before the JSON: read from the first brace.
    const at = r.out.indexOf("{");
    return memPluginsFromInspect(JSON.parse(at > 0 ? r.out.slice(at) : r.out), now().toISOString());
  } catch {
    return undefined;
  }
}

// ---------- D466: a newer plugin, from Mem's own `plugins check` ----------
//
// `nmem --json plugins check` (read-only) reads Mem's published plugin list, not the person's Mem:
// it answers the same with no Mem server reachable (research/203). Per plugin it says the newest
// version out (`available_version`). Its own `installed` and `update_available` sometimes disagree
// with inspect (OpenClaw: inspect 0.8.31, check "not detected"; Cursor: installed, version null), so
// only its available version is read: inspect stays the one word on what is installed, and "update"
// is inspect's own version below the one out. It lists only some hosts (Codex and pi are not in it
// today): an agent it doesn't list never shows an update.

/** The newest published version per Ducter agent, from the check's answer; {} when it can't be read. */
export function memPluginCatalog(json: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const list = json && typeof json === "object" && Array.isArray((json as { plugins?: unknown }).plugins) ? (json as { plugins: unknown[] }).plugins : [];
  const idOf = (p: unknown) => (p && typeof p === "object" ? (p as { id?: unknown }).id : undefined);
  for (const [harness, host] of Object.entries(MEM_HOSTS)) {
    // Its ids are the hosts' ids (claude-code, openclaw); a Ducter id is taken too (codex beside codex-cli).
    const e = list.find((p) => idOf(p) === host || idOf(p) === harness) as { available_version?: unknown } | undefined;
    const v = e?.available_version;
    if (typeof v === "string" && isVersion(v)) out[harness] = v;
  }
  return out;
}

/**
 * One agent's line with the newest version out laid over it: installed (or inspect's own update)
 * with a version below it is an update from that version to it. Anything else (absent, a review, no
 * version read, a version at or past the one out) stays as inspect said.
 */
export function withAvailable(v: MemPluginView, available: string | undefined): MemPluginView {
  if (!available || !v.version || (v.state !== "installed" && v.state !== "update")) return v;
  if (compareVersions(v.version, available) >= 0) return v;
  return { ...v, state: "update", available };
}

/** Every agent's line with the catalog laid over it. */
export function withCatalog(m: Record<string, MemPluginView>, catalog: Record<string, string> | undefined): Record<string, MemPluginView> {
  if (!catalog) return m;
  return Object.fromEntries(Object.entries(m).map(([h, v]) => [h, withAvailable(v, catalog[h])]));
}

/** Runs the check (network, read-only, under a second here): undefined when nmem isn't here, it's offline, or its answer can't be read. */
export async function checkMemPluginUpdates(exec: InspectExec): Promise<Record<string, string> | undefined> {
  const r = await exec([process.env.NMEM_CLI_PATH ?? "nmem", "--json", "plugins", "check"], 15_000).catch(() => ({ code: -1, out: "" }));
  if (r.code !== 0 || !r.out.trim()) return undefined;
  try {
    const at = r.out.indexOf("{");
    const json = JSON.parse(at > 0 ? r.out.slice(at) : r.out);
    if (!json || typeof json !== "object" || !Array.isArray((json as { plugins?: unknown }).plugins)) return undefined;
    return memPluginCatalog(json);
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
    if (!whichNow(argv[0]!)) return { code: 127, out: "" };
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

// ---------- D480: an agent's mailbox, looked at on its own computer ----------

/** What one computer's own Mem says for opening a mailbox there: signed in, and Mem's passive setup (state and Spaces only). */
export interface MemBridgeLook {
  /** Signed in to a Mem there (`nmem status` answered healthy or ok). */
  signedIn: boolean;
  /** The passive `bridge setup` answer, cut to state and candidates (nothing else leaves the computer). */
  setup?: { state?: string; candidates: unknown[] };
}

const firstJson = (out: string): Record<string, unknown> | undefined => {
  const at = out.indexOf("{");
  if (at < 0) return undefined;
  try {
    const j = JSON.parse(out.slice(at));
    return j && typeof j === "object" ? (j as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * D480: read-only, on the computer the agent runs on: `nmem --json status` (signed in or not)
 * and Mem's passive `nmem --json bridge setup` (no Space, no context,
 * never --enable: it lists the Spaces and picks none). Undefined when nmem isn't there.
 */
export async function inspectMemBridge(exec: InspectExec): Promise<MemBridgeLook | undefined> {
  const nmem = process.env.NMEM_CLI_PATH ?? "nmem";
  const st = await exec([nmem, "--json", "status"], 20_000).catch(() => ({ code: -1, out: "" }));
  if (st.code === 127 || st.code === -1) return undefined;
  const sj = st.code === 0 ? firstJson(st.out) : undefined;
  const signedIn = !!sj && (sj.status === "healthy" || sj.status === "ok");
  if (!signedIn) return { signedIn };
  const s = await exec([nmem, "--json", "bridge", "setup"], 30_000).catch(() => ({ code: -1, out: "" }));
  const j = firstJson(s.out);
  const setup = j ? { ...(typeof j.state === "string" ? { state: j.state } : {}), candidates: Array.isArray(j.candidates) ? j.candidates : [] } : undefined;
  return { signedIn, ...(setup ? { setup } : {}) };
}
