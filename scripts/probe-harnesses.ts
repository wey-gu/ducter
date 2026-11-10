// Re-checks protocol/src/harness-facts.ts against the harnesses installed on this machine and
// reports drift. Cheap on purpose: version commands, help text, binary strings, config-schema
// errors and model catalogs. No model calls, no logins, nothing written.
//   bun scripts/probe-harnesses.ts            # print what holds and what drifted
//   bun scripts/probe-harnesses.ts --strict   # exit 1 on any drift (for a periodic re-verify)
//   bun scripts/probe-harnesses.ts --offline  # skip reading each channel's latest version (D156)
// A version outside the verified range is drift until someone re-runs the live checks behind the
// facts (design/harnesses.md) and widens `verified`.
import { readFileSync, realpathSync } from "node:fs";
import { HARNESS_IDS, type HarnessId } from "../packages/protocol/src/harnesses.ts";
import { CLAUDE_SWITCHES, HARNESS_FACTS, versionStanding } from "../packages/protocol/src/harness-facts.ts";

type Line = { harness: HarnessId | "mem"; what: string; ok: boolean | null; detail: string };
const lines: Line[] = [];
const say = (harness: HarnessId | "mem", what: string, ok: boolean | null, detail = "") => lines.push({ harness, what, ok, detail });

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
    // The switches Ducter's code sets (harness-facts CLAUDE_SWITCHES): gone = Ducter sets a dead switch.
    [CLAUDE_SWITCHES.toolSearchEnv, "tool search switch (clean sessions load Ducter's tools up front)"],
    [CLAUDE_SWITCHES.alwaysLoadMeta, "per-tool alwaysLoad meta (tasks keep Ducter's tools loaded)"],
    [CLAUDE_SWITCHES.readCapEnv, "Read output cap (the partner's working set)"],
    ["claudeMdExcludes", "user memory exclusion (the partner's clean setup)"],
    ['"--chrome"', "Claude in Chrome flag (browser places, D126)"],
    ["enabledPlugins", "per-session plugin switch (memory off turns the Mem plugin off, D168)"],
  ];
  for (const [s, what] of needles) say("claude-code", what, data.includes(s), s);
  // A minified name moves with every build (2.1.322: the 20K reserve's variable was renamed, and
  // the compaction code now has per-window entries and a fork rule for the percent override), so
  // this one only informs; the live checks in design/harnesses.md decide.
  say("claude-code", "summary reserve (20K)", data.includes("var AZr=20000") ? true : null, "minified name; re-run the live compaction check when it moves");
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
probeMem();

/**
 * D168/D169 (research/48 M4): the Mem plugin facts. pi must still have the flag memory-off uses,
 * and Mem's own read-only check must still name every host the registry knows (a renamed host
 * would make the device card and the task's memory mode silently wrong).
 */
function probeMem() {
  if (Bun.which("pi")) {
    const r = run(["pi", "--help"]);
    say("pi", "memory off: --no-extensions", r.out.includes("--no-extensions"), "harness-facts memPlugin.off = flag");
  }
  for (const h of HARNESS_IDS) {
    const m = HARNESS_FACTS[h].memPlugin;
    if (m && m.evidence.kind === "INFERRED") say(h, "memory off", null, `INFERRED: ${m.evidence.why.slice(0, 120)}`);
    if (m && m.value.contextCost === "unknown") say(h, "Mem plugin context size", null, "not measured (design/todo.md)");
  }
  if (!Bun.which("nmem")) return say("mem", "nmem plugins inspect", null, "nmem not on PATH");
  const r = run(["nmem", "--json", "plugins", "inspect"]);
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf("{"))) as { plugins?: { host?: string }[] };
    const hosts = new Set((j.plugins ?? []).map((p) => p.host));
    for (const h of HARNESS_IDS) {
      const m = HARNESS_FACTS[h].memPlugin;
      if (m) say(h, `Mem host "${m.value.host}"`, hosts.has(m.value.host), hosts.has(m.value.host) ? "in nmem's inspect" : "gone from nmem's inspect");
    }
  } catch {
    say("mem", "nmem plugins inspect", null, "no JSON");
  }
}
/**
 * D177 (research/50): the read-only partner's switches. pi must still take the allowlist and the
 * denylist; DeepSeek Harness's acp profile must still have every row Ducter's profile layer names
 * (a renamed tool row would stay on in the partner). The dump runs under a throwaway DSH_HOME, so
 * the user's own home is never touched.
 */
async function probeReadOnly() {
  if (Bun.which("pi")) {
    const r = run(["pi", "--help"]);
    for (const f of ["--tools", "--exclude-tools", "--no-tools"]) say("pi", `read-only: ${f}`, r.out.includes(f), "harness-facts readOnly / noTools");
  }
  if (!Bun.which("dsh")) return;
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { DSH_PROFILE } = await import("../packages/protocol/src/harness-facts.ts");
  const home = mkdtempSync(join(tmpdir(), "ducter-probe-dsh-"));
  try {
    const r = Bun.spawnSync(["dsh", "--profile", DSH_PROFILE.profile, "--dump-config"], { cwd: home, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000, env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: "1", NO_COLOR: "1" } });
    const ids = new Set([...r.stdout.toString().matchAll(/^- id: (\S+)/gm)].map((m) => m[1]));
    if (!ids.size) return say("deepseek-harness", "profile rows", null, "no --dump-config output");
    const want = [DSH_PROFILE.systemPrompt, DSH_PROFILE.fs, DSH_PROFILE.compaction, DSH_PROFILE.sessionLog, ...DSH_PROFILE.readOnlyOff, ...DSH_PROFILE.noToolsOff];
    const gone = want.filter((id) => !ids.has(id));
    say("deepseek-harness", "profile rows the partner's layer names", gone.length === 0, gone.length ? `gone: ${gone.join(", ")}` : `${want.length} rows present`);
    // A new tool row stays on in the partner until it is named: drift, not a note.
    const known: readonly string[] = [...want, ...DSH_PROFILE.notTools, "tool-fs-search", "tool-web"];
    const fresh = [...ids].filter((id) => id!.startsWith("tool-") && !known.includes(id!));
    say("deepseek-harness", "every tool row is named (read-only or off)", fresh.length === 0, fresh.length ? `new: ${fresh.join(", ")}: read-only, or add it to DSH_PROFILE.readOnlyOff` : "");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}
await probeReadOnly();

if (!process.argv.includes("--offline")) await probeChannels();

/**
 * D156: the latest version on every channel each agent ships on (harness-facts `channels`), and
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
