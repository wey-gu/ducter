// Re-checks protocol/src/harness-facts.ts against the harnesses installed on this machine and
// reports drift. Cheap on purpose: version commands, help text, binary strings, config-schema
// errors and model catalogs. No model calls, no logins, nothing written.
//   bun scripts/probe-harnesses.ts            # print what holds and what drifted
//   bun scripts/probe-harnesses.ts --strict   # exit 1 on any drift (for a periodic re-verify)
//   bun scripts/probe-harnesses.ts --offline  # skip reading each channel's latest version (D153)
// A version outside the verified range is drift until someone re-runs the live checks behind the
// facts (design/harnesses.md) and widens `verified`.
import { readFileSync, realpathSync } from "node:fs";
import { HARNESS_IDS, type HarnessId } from "../packages/protocol/src/harnesses.ts";
import { HARNESS_FACTS, versionStanding } from "../packages/protocol/src/harness-facts.ts";

type Line = { harness: HarnessId; what: string; ok: boolean | null; detail: string };
const lines: Line[] = [];
const say = (harness: HarnessId, what: string, ok: boolean | null, detail = "") => lines.push({ harness, what, ok, detail });

function run(argv: string[], timeoutMs = 15_000): { code: number; out: string } {
  try {
    const r = Bun.spawnSync(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: timeoutMs, env: { ...process.env, NO_COLOR: "1" } });
    return { code: r.exitCode ?? -1, out: r.stdout.toString() + r.stderr.toString() };
  } catch {
    return { code: -1, out: "" };
  }
}

function binaryOf(cmd: string): string | undefined {
  const p = Bun.which(cmd);
  if (!p) return undefined;
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function version(h: HarnessId): string | undefined {
  const f = HARNESS_FACTS[h];
  if (!Bun.which(f.version.command[0]!)) return undefined;
  const r = run(f.version.command);
  return f.version.pattern.exec(r.out)?.[1];
}

/** Claude Code ships one large binary: the knobs Ducter sets must still be spelled in it. */
function probeClaude() {
  const bin = binaryOf("claude");
  if (!bin) return;
  let data: Buffer;
  try {
    data = readFileSync(bin);
  } catch {
    return say("claude-code", "binary strings", null, `can't read ${bin}`);
  }
  const f = HARNESS_FACTS["claude-code"];
  const needles: [string, string][] = [
    [f.standardWindowSwitch!.value.key, "1M off switch"],
    [f.windowKnob.value.key, "window knob"],
    [f.compactAtKnob.value.key, "compaction point knob"],
    ["idleCompaction", "idle compaction setting"],
    ["precomputeCompactionEnabled", "background summary setting"],
    ["stdout appended as custom compact instructions", "PreCompact hook semantics"],
    ["e-13000", "compaction buffer (13K)"],
    ["var AZr=20000", "summary reserve (20K; minified name may move)"],
  ];
  for (const [s, what] of needles) say("claude-code", what, data.includes(s), s);
}

/** Codex validates its config keys' types: a string where it wants a number names the key. */
function probeCodex() {
  if (!Bun.which("codex")) return;
  const f = HARNESS_FACTS.codex;
  for (const key of [f.windowKnob.value.key, f.compactAtKnob.value.key]) {
    const r = run(["codex", "debug", "prompt-input", "-c", `${key}="probe"`, "hi"]);
    say("codex", `config key ${key}`, r.out.includes("expected i64") && r.out.includes(key), r.out.split("\n")[0] ?? "");
  }
  const r = run(["codex", "debug", "models"]);
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf("{"))) as { models?: { slug?: string; context_window?: number; visibility?: string }[] };
    const known = f.models.value;
    for (const m of j.models ?? []) {
      if (!m.slug || m.visibility === "hide") continue;
      const k = known[m.slug];
      if (!k) say("codex", `model ${m.slug}`, false, `not in the registry (window ${m.context_window})`);
      else say("codex", `model ${m.slug}`, k.window === m.context_window, `window ${m.context_window} (registry ${k.window})`);
    }
    for (const slug of Object.keys(known)) if (!(j.models ?? []).some((m) => m.slug === slug)) say("codex", `model ${slug}`, false, "in the registry, gone from the catalog");
  } catch {
    say("codex", "model catalog", null, "codex debug models gave no JSON");
  }
}

for (const h of HARNESS_IDS) {
  const v = version(h);
  if (!v) {
    say(h, "installed", null, "not on PATH");
    continue;
  }
  const standing = versionStanding(h, v);
  const f = HARNESS_FACTS[h].verified;
  say(h, "version", standing === "verified" ? true : standing === "unknown" ? null : false, `${v} (verified ${f.from}${f.to !== f.from ? `–${f.to}` : ""}: ${standing})`);
}
probeClaude();
probeCodex();
if (!process.argv.includes("--offline")) await probeChannels();

/**
 * D153: the latest version on every channel each agent ships on (harness-facts `channels`), and
 * whether Ducter verified it, so widening `verified` starts from what users will get. How this
 * Mac's own copy was installed is said too. Reads only; `--offline` skips it.
 */
async function probeChannels() {
  const { agentHow } = await import("../packages/core/src/harness-probe.ts");
  const { parseLatest, latestUrl, inVerified } = await import("../packages/core/src/agents.ts");
  for (const h of HARNESS_IDS) {
    const bin = binaryOf(HARNESS_FACTS[h].version.command[0]!);
    if (bin) say(h, "installed via", null, agentHow(h, bin).how);
    for (const how of ["npm", "brew", "installer"] as const) {
      const url = latestUrl(h, how);
      if (!url) continue;
      try {
        const r = await fetch(url, { headers: { accept: "application/json, text/plain", "user-agent": "ducter-probe" }, signal: AbortSignal.timeout(10_000) });
        const v = r.ok ? parseLatest(await r.text()) : undefined;
        if (!v) say(h, `latest (${how})`, null, `${url}: ${r.status}`);
        else say(h, `latest (${how})`, inVerified(h, v) ? true : null, `${v}${inVerified(h, v) ? " (verified)" : " (not verified yet)"}`);
      } catch (err) {
        say(h, `latest (${how})`, null, `${url}: ${(err as Error).message}`);
      }
    }
  }
}

const mark = (ok: boolean | null) => (ok === true ? "ok   " : ok === false ? "DRIFT" : "skip ");
for (const l of lines) console.log(`${mark(l.ok)} ${l.harness.padEnd(17)} ${l.what}${l.detail ? `: ${l.detail}` : ""}`);
const drift = lines.filter((l) => l.ok === false).length;
console.log(drift ? `\n${drift} drifted: re-verify those facts (design/harnesses.md) before trusting the small-window settings.` : "\nAll checked facts hold.");
if (drift && process.argv.includes("--strict")) process.exit(1);
