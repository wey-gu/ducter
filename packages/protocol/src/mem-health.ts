// D374: Nowledge Mem's own health on a computer, from Mem's own `nmem --json doctor` (research/144).
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

interface Check {
  name?: unknown;
  status?: unknown;
  detail?: unknown;
  tool?: unknown;
}

const OLD = /unrecognized subcommand|unexpected argument|invalid subcommand|no such (sub)?command/i;
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
