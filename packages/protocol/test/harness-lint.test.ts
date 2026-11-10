// Guardrail (research/48 G3): per-harness switches live in one registry (harness-facts.ts,
// harnesses.ts, native-browser.ts) and are applied by one adapter (runner/oar.ts). Parallel
// branches added such literals in passing (an env in partner.ts, a meta key in core/mcp.ts) and
// the probe never saw them. This fails on a harness flag, env or config key written anywhere else,
// so a new one goes into the registry (with its evidence) and the probe can check it.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SCAN = ["packages/core/src", "packages/partner/src", "packages/runner/src", "packages/cli/src", "packages/protocol/src", "apps/web/src"];

/** Where these may be written, and why. */
const ALLOWED: Record<string, string> = {
  "packages/protocol/src/harness-facts.ts": "the registry",
  "packages/protocol/src/harnesses.ts": "the registry (identity, isolation method, login env)",
  "packages/protocol/src/native-browser.ts": "the registry for native browser tools",
  "packages/runner/src/oar.ts": "the one adapter",
  "packages/runner/src/browser.ts": "a browser place's sidecar declares its Claude launch (D126); applied by oar.ts",
  "packages/core/src/harness-probe.ts": "login probes read each harness's own credential files",
};

/** Harness switches: Claude Code env/flags/settings, Codex -c keys, pi flags, DeepSeek Harness env. */
const PATTERNS: RegExp[] = [
  /\bCLAUDE_CODE_[A-Z_]{4,}\b/,
  /\bCLAUDE_AUTOCOMPACT_[A-Z_]+\b/,
  /\bENABLE_TOOL_SEARCH\b/,
  /anthropic\/alwaysLoad/,
  /["'`]--(chrome|tools|settings|setting-sources|strict-mcp-config|mcp-config|bare|no-skills|no-extensions|no-context-files|no-prompt-templates|no-themes)["'`]/,
  /\b(model_context_window|model_auto_compact_token_limit|sandbox_mode|features\.(plugins|hooks|apps|memories))\b/,
  /\benabledPlugins\b/,
  /\bDSH_(HOME|AGENTS_HOME|TELEMETRY_DISABLED)\b/,
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** The code of a line: comments and doc comments say why, and may name a switch. */
function code(line: string): string {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
  const i = line.indexOf(" // ");
  return i >= 0 ? line.slice(0, i) : line;
}

test("harness switches are written only in the registry and the adapter", () => {
  const hits: string[] = [];
  for (const d of SCAN) {
    for (const f of files(join(ROOT, d))) {
      const rel = relative(ROOT, f);
      if (ALLOWED[rel]) continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const c = code(line);
          for (const p of PATTERNS) if (p.test(c)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
  }
  expect(hits).toEqual([]);
});
