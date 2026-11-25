// D375: Nowledge Mem's own health on a computer, from Mem's own `nmem --json doctor` (research/144).
// Its answer is `{checks: [{name, status, detail, tool}], failed}`: "credential home", "server
// reachable", "api key", then one line per AI tool Mem's `connect` knows (`tool`: claude-code,
// codex-cli, cursor, gemini-cli, opencode). This turns it into the one thing worth saying about
// Mem there, or nothing (all well). Pure: the home (Settings › 记忆) and a computer lent for tasks
// (its Mem row, D366) read it the same way. Never reads or returns a detail line: the
// credential home's carries the tail of the key.
import type { MemHealth } from "./index.ts";

/**
 * Mem's own tool id for each Ducter agent that `nmem connect --tool` registers by itself
 * (`nmem connect --help` 0.10.119/0.10.120: claude-code, codex-cli, cursor, gemini-cli, opencode;
 * Ducter's pi and DeepSeek Harness are not among them, so their plugin goes in by a task, D169).
 */
export const MEM_CONNECT_TOOLS: Readonly<Record<string, string>> = { "claude-code": "claude-code", codex: "codex-cli" };

/**
 * D560: the first version of each agent's Mem plugin that gets every new session ready to receive by
 * itself (SessionStart prepares the native Bridge session unless `NMEM_BRIDGE_SESSION_MAILBOX=0`;
 * research/226 2.6: Claude Code 0.7.35, Codex 0.1.50). A reply to a message from such a session goes
 * back to that session; nothing is opened by hand. The Mac app keeps the same table (views/peers_reach.go).
 */
export const MEM_AUTO_SESSION: Readonly<Record<string, string>> = { "claude-code": "0.7.35", codex: "0.1.50" };

/** D560: "auto" when this plugin version prepares its sessions by itself, "old" when it is older, undefined when not known. */
export function memSessions(harness: string, version: string | undefined): "auto" | "old" | undefined {
  const min = MEM_AUTO_SESSION[harness];
  const v = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version?.trim() ?? "");
  const m = min ? /^(\d+)\.(\d+)\.(\d+)/.exec(min) : null;
  if (!v || !m) return undefined;
  for (let i = 1; i <= 3; i++) if (Number(v[i]) !== Number(m[i])) return Number(v[i]) > Number(m[i]) ? "auto" : "old";
  return "auto";
}

/**
 * D560: whether the partner's replies reach one of the person's agents, from Mem's facts only:
 * yes (Mem has an active connection labelled with it, or a message came from one of its sessions:
 * a reply goes back to that session); next (its plugin readies each new session by itself and none has
 * connected yet: the next one the person opens will); old (its plugin is older than that: updating it
 * is the fix); unknown (Mem hasn't said). The Settings row and the partner's facts read the same.
 */
export type AgentBack = "yes" | "next" | "old" | "unknown";
export function agentBack(harness: string, o: { open?: boolean; heard?: boolean; versions: readonly (string | undefined)[] }): AgentBack {
  if (o.open || o.heard) return "yes";
  const s = o.versions.map((v) => memSessions(harness, v));
  if (s.includes("auto")) return "next";
  if (s.includes("old")) return "old";
  return "unknown";
}

interface Check {
  name?: unknown;
  status?: unknown;
  detail?: unknown;
  tool?: unknown;
}

// clap's (the current Rust nmem) and argparse's (the old Python nmem, D386: `argument COMMAND:
// invalid choice: 'connect' (choose from status, plugins, …)`) answers to a command it doesn't have.
const OLD = /unrecognized subcommand|unexpected argument|invalid subcommand|no such (sub)?command|invalid choice/i;

/** D386: nmem said it doesn't have that command (or that flag): a usage error, never a line to show. */
export function nmemTooOld(text: string): boolean {
  return OLD.test(text) || /^usage: nmem\b/im.test(text);
}
const LOOPBACK = /127\.0\.0\.1|localhost|\[::1\]|local server/i;

/** The doctor's checks, or undefined when the text isn't its answer. */
export function doctorChecks(out: string): Check[] | undefined {
  const at = out.indexOf("{");
  if (at < 0) return undefined;
  try {
    const j = JSON.parse(out.slice(at));
    return Array.isArray(j?.checks) ? (j.checks as Check[]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Mem's health from its doctor's run (undefined when nmem didn't run): what's wrong, in order of
 * what blocks the most, else {} (all well). `agents`: the agents installed on that computer
 * (harness ids), the only ones whose connection is worth a word. Undefined when it can't tell.
 */
export function memHealthOf(run: { code: number; out: string; err?: string } | undefined, agents: readonly string[], checkedAt?: string): MemHealth | undefined {
  if (!run) return undefined;
  const at = checkedAt ? { checkedAt } : {};
  const checks = doctorChecks(run.out);
  if (!checks) return run.code !== 0 && OLD.test(`${run.err ?? ""}\n${run.out}`) ? { issue: "old", ...at } : undefined;
  const by = (n: string) => checks.find((c) => String(c.name ?? "").toLowerCase() === n);
  const server = by("server reachable");
  const key = by("api key");
  const cred = by("credential home");
  if (!server || !key) return undefined;
  const text = (c: Check | undefined) => (typeof c?.detail === "string" ? c.detail : "");
  // Set up: Mem's credential home names a saved address (not its built-in default: a local Mem).
  const configured = !!cred && !/\bdefault\b/i.test(text(cred));
  const local = LOOPBACK.test(text(server)) || LOOPBACK.test(text(cred));
  if (server.status !== "pass") return configured ? { issue: "unreachable", ...at } : { issue: "signed_out", fresh: true, ...at };
  // The server answers; the key: a local Mem needs none, a remote one rejected or missing it.
  if (key.status === "fail") return { issue: "signed_out", ...at };
  if (key.status !== "pass" && !local) return { issue: "signed_out", ...(/no (api )?key/i.test(text(key)) ? { fresh: true as const } : {}), ...at };
  const left = agents.filter((h) => {
    const id = MEM_CONNECT_TOOLS[h];
    if (!id) return false;
    const c = checks.find((x) => x.tool === id);
    // An agent Mem's doctor can't find there (not on its PATH) isn't one it failed to connect.
    return !!c && c.status !== "pass" && !/not (installed|found)/i.test(text(c));
  });
  return left.length ? { issue: "plugin", agents: left, ...at } : { ...at };
}
