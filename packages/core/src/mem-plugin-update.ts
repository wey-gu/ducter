// D597: a newer Nowledge Mem plugin, put in by its agent's own plugin commands, run by Ducter on
// that computer: no task, no tokens, seconds (research/238). The commands are the agent's own,
// as Mem's community repo documents them (harness-facts memUpdate): Claude Code refreshes the
// nowledge-community marketplace and updates the plugin; Codex upgrades the marketplace, adds the
// plugin again and runs the copy's own hooks setup; pi updates the one package. Each command runs
// with a timeout, in order, and the run stops at the first that fails. Nothing here reads Mem's
// doctor: an update needs no Mem credential, so another agent's doctor line never stands in its
// way. The version is read back after with Mem's own `plugins inspect` (mem-plugins.ts); when it
// didn't move, or a command failed, a task takes over with every command and its output.
//
// This file runs on the home for the home's agents and on a worker for its own (its
// `mem_plugin_update` op), so both run the same commands the same way.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MEM_PLUGIN_UPDATE, type MemUpdateRun, type MemUpdateStep } from "@ducter/protocol/src/mem-plugins.ts";
import { toolEnv } from "@ducter/protocol/src/tool-env.ts";
import { compareVersions } from "@ducter/protocol/src/version.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { scrub } from "./worker-mem.ts";

/** One command's time (a marketplace refresh clones a git repository). */
export const MEM_UPDATE_STEP_MS = 3 * 60_000;

export interface MemUpdateSys {
  run(argv: string[], timeoutMs: number): Promise<{ code: number; out: string }>;
  /** Whether a command is on PATH there (an agent's own command line). */
  which(cmd: string): boolean;
  /** D597: the newest installed Codex copy's hooks setup (`scripts/install_hooks.py`), or undefined. */
  codexHooks(): string | undefined;
}

/** The last lines a person (or the task that takes over) needs: scrubbed of links and keys, at most 600 characters. */
export function tailOf(out: string): string {
  const lines = scrub(out)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  return lines.slice(-6).join("\n").slice(-600);
}

/** Whether this agent's plugin has a direct update here (its commands are known). */
export const hasDirectUpdate = (harness: string): boolean => !!MEM_PLUGIN_UPDATE[harness]?.length;

/**
 * Runs the agent's own update commands in order, each with its timeout; stops at the first that
 * fails. undefined: no commands for this agent. The version is not read here (the caller reads
 * Mem's inspect, the one word on what is installed).
 */
export async function runMemPluginUpdate(harness: string, sys: MemUpdateSys, stepMs = MEM_UPDATE_STEP_MS): Promise<MemUpdateRun | undefined> {
  const plan = MEM_PLUGIN_UPDATE[harness];
  if (!plan?.length) return undefined;
  const steps: MemUpdateStep[] = [];
  for (const raw of plan) {
    let argv = [...raw];
    if (argv.includes("{codexHooks}")) {
      const hooks = sys.codexHooks();
      if (!hooks) {
        steps.push({ cmd: raw.join(" "), code: -1, tail: "no installed copy's scripts/install_hooks.py was found" });
        return { ok: false, steps };
      }
      argv = argv.map((a) => (a === "{codexHooks}" ? hooks : a));
    }
    const cmd = argv.join(" ");
    if (!sys.which(argv[0]!)) {
      steps.push({ cmd, code: 127, tail: `${argv[0]}: not found on PATH` });
      return { ok: false, steps };
    }
    const r = await sys.run(argv, stepMs).catch((e: unknown) => ({ code: -1, out: String((e as Error)?.message ?? e) }));
    steps.push({ cmd, code: r.code, tail: tailOf(r.out) });
    if (r.code !== 0) return { ok: false, steps };
  }
  return { ok: true, steps };
}

/**
 * D597: whether the update took, from the version Mem's inspect read after: at least the one out,
 * or past the one it had (the marketplace may trail Mem's list by a release). Never from an exit
 * code alone: unchanged is not updated.
 */
export function updateTook(from: string | undefined, now: string | undefined, to: string | undefined): boolean {
  if (!now) return false;
  if (to && compareVersions(now, to) >= 0) return true;
  return !!from && compareVersions(now, from) > 0;
}

/** The newest `nowledge-mem/<version>/scripts/install_hooks.py` under Codex's plugin cache. */
export function newestCodexHooks(home = process.env.CODEX_HOME ?? join(homedir(), ".codex"), exists = existsSync, list = (p: string) => readdirSync(p)): string | undefined {
  const cache = join(home, "plugins", "cache");
  const found: { v: string; p: string }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let names: string[];
    try {
      names = list(dir);
    } catch {
      return;
    }
    for (const n of names) {
      const d = join(dir, n);
      if (n === "nowledge-mem") {
        let vs: string[] = [];
        try {
          vs = list(d);
        } catch {
          /* not a folder */
        }
        for (const v of vs) {
          const p = join(d, v, "scripts", "install_hooks.py");
          if (exists(p)) found.push({ v, p });
        }
      } else walk(d, depth + 1);
    }
  };
  walk(cache, 0);
  found.sort((a, b) => compareVersions(a.v, b.v) || a.v.localeCompare(b.v));
  return found.at(-1)?.p;
}

/** The real seams: the agents' commands with the basics and their own homes, never Ducter's keys. */
export function realMemUpdateSys(env: () => Record<string, string> = () => toolEnv({ extra: ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "PI_CODING_AGENT_DIR", "NVM_DIR", "NPM_CONFIG_PREFIX", "SSH_AUTH_SOCK"] })): MemUpdateSys {
  return {
    which: (cmd) => !!whichNow(cmd, env()),
    codexHooks: () => newestCodexHooks(env().CODEX_HOME ?? join(env().HOME ?? homedir(), ".codex")),
    async run(argv, timeoutMs) {
      try {
        const p = Bun.spawn(argv, { env: env(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
        const timer = setTimeout(() => p.kill(), timeoutMs);
        const [a, b] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
        const code = await p.exited;
        clearTimeout(timer);
        return { code: p.signalCode ? -1 : code, out: `${a}\n${b}` };
      } catch (e) {
        return { code: -1, out: String((e as Error)?.message ?? e) };
      }
    },
  };
}
