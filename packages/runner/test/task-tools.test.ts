// D241 (research/76 §6): what a task's harness keeps and leaves out, beyond D240's browser places.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { adaptSpec, DISALLOWED, dshCredentialKey, piProjectContext } from "../src/oar.ts";
import { withBrowser } from "../src/runner.ts";
import { BROWSER_DENIED_BUILTINS } from "../src/browser.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-task-tools-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ducterMcp = { name: "ducter", url: "http://127.0.0.1:7777/mcp", headers: { Authorization: "Bearer dtk.test.sig" } };
/** A task's spec: its brief appended, the person's own setup kept. */
const task = (harness: SessionSpec["harness"], over: Partial<SessionSpec> = {}): SessionSpec => ({
  harness,
  cwd: join(dir, "work"),
  appendSystemPrompt: "Task brief.",
  mcp: [ducterMcp],
  permissionMode: "bypass",
  ...over,
});
/** The browser's parts withBrowser reads (a cua-driver place). */
const sidecar = (brief = "\n\nBrowser rules.") => ({ brief, driver: "cua", claude: { disallowedTools: [...BROWSER_DENIED_BUILTINS], launchArgs: [], userConfiguration: "exclude" } }) as any;

describe("Claude Code: what every task denies", () => {
  test("PushNotification, RemoteTrigger and Workflow join Ducter's seven; Agent stays outside a browser place", () => {
    const o = adaptSpec(task("claude-code"), { dataDir: dir }).options;
    expect(o.disallowedTools).toEqual([...DISALLOWED["claude-code"]!]);
    expect(o.disallowedTools).toEqual(expect.arrayContaining(["AskUserQuestion", "CronCreate", "PushNotification", "RemoteTrigger", "Workflow"]));
    expect(o.disallowedTools).not.toContain("Agent");
  });

  test("a browser place adds Agent, and no tool is named twice", () => {
    const o = adaptSpec(withBrowser(task("claude-code"), sidecar(), "Ducter"), { dataDir: dir }).options;
    expect(o.disallowedTools).toContain("Agent");
    expect(o.disallowedTools!.filter((t) => t === "Workflow")).toHaveLength(1);
    expect(new Set(o.disallowedTools).size).toBe(o.disallowedTools!.length);
  });
});

describe("Codex: an ordinary task keeps the person's multi_agent", () => {
  test("no feature override without a browser place; the browser place turns subagents off", () => {
    const plain = adaptSpec(task("codex"), { dataDir: dir, env: { CODEX_HOME: dir } }).options;
    expect((plain.launchArgs ?? []).join(" ")).not.toContain("multi_agent");
    const browsing = adaptSpec(withBrowser(task("codex"), sidecar(), "Ducter"), { dataDir: dir, env: { CODEX_HOME: dir } }).options;
    expect(browsing.launchArgs).toContain("features.multi_agent=false");
  });
});

describe("pi: the project's own context files under the clean setup", () => {
  function repo() {
    const home = join(dir, "home");
    const agentDir = join(home, ".pi", "agent");
    const root = join(home, "dev", "app");
    const sub = join(root, "pkg");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(agentDir, "AGENTS.md"), "GLOBAL: the person's own.");
    writeFileSync(join(home, "dev", "AGENTS.md"), "ABOVE: the person's own folder.");
    writeFileSync(join(root, "AGENTS.md"), "﻿REPO: run bun test.");
    writeFileSync(join(root, "CLAUDE.md"), "REPO-CLAUDE: not read, AGENTS.md comes first.");
    writeFileSync(join(sub, "CLAUDE.md"), "SUB: the package's own.");
    return { agentDir, root, sub };
  }

  test("from the folder up to the repository's top, outermost first; never the global or above the repo", () => {
    const { agentDir, root, sub } = repo();
    const ctx = piProjectContext(sub, { PI_CODING_AGENT_DIR: agentDir })!;
    expect(ctx.startsWith("Project-specific instructions and guidelines:")).toBe(true);
    expect(ctx).toContain(`<project_instructions path="${join(root, "AGENTS.md")}">\nREPO: run bun test.\n</project_instructions>`);
    expect(ctx.indexOf("REPO:")).toBeLessThan(ctx.indexOf("SUB:"));
    for (const not of ["GLOBAL", "ABOVE", "REPO-CLAUDE", "﻿"]) expect(ctx).not.toContain(not);
    // Outside a repository: the folder alone.
    const loose = join(dir, "loose");
    mkdirSync(loose);
    expect(piProjectContext(loose, { PI_CODING_AGENT_DIR: agentDir })).toBeUndefined();
    writeFileSync(join(loose, "AGENTS.md"), "LOOSE");
    expect(piProjectContext(loose, { PI_CODING_AGENT_DIR: agentDir })).toContain("LOOSE");
  });

  test("a clean pi task gets them after its brief; the partner, and a task on the person's setup, don't", () => {
    const { agentDir, root } = repo();
    const env = { PI_CODING_AGENT_DIR: agentDir };
    const clean = adaptSpec(task("pi", { cwd: root, isolateUserConfig: true }), { dataDir: dir, env }).options;
    expect(clean.appendSystemPrompt!.startsWith("Task brief.\n\nProject-specific instructions")).toBe(true);
    expect(clean.appendSystemPrompt).toContain("REPO: run bun test.");
    // On the person's setup pi reads them itself (no --no-context-files there).
    expect(adaptSpec(task("pi", { cwd: root }), { dataDir: dir, env }).options.appendSystemPrompt).toBe("Task brief.");
    // The partner's prompt is its own (D175's eval judged it): nothing added.
    const partner = adaptSpec(task("pi", { cwd: root, isolateUserConfig: true, systemPrompt: "You are Ducter.", appendSystemPrompt: undefined }), { dataDir: dir, env }).options;
    expect(partner.appendSystemPrompt).toBeUndefined();
    // A browser place on pi is clean: its scratch folder has none, so the brief is all.
    const scratch = join(dir, "scratch");
    mkdirSync(scratch);
    expect(adaptSpec(withBrowser(task("pi", { cwd: scratch }), sidecar(), "Ducter"), { dataDir: dir, env }).options.appendSystemPrompt).toBe("Task brief.\n\nBrowser rules.");
  });
});

describe("DeepSeek Harness: a browser task runs in a home of Ducter's", () => {
  const layerOf = (home: string) => JSON.parse(readFileSync(join(home, "profiles", "acp", "cordis.patch.yml"), "utf8")) as { id: string; disabled?: boolean; config?: Record<string, unknown> }[];

  test("the person's DSH setup stays out, DSH's own tools stay, the brief rides in the home's AGENTS.md", () => {
    const own = join(dir, "own-dsh"); // the person's DSH home, with no key in it
    const a = adaptSpec(withBrowser(task("deepseek-harness"), sidecar(), "Ducter"), { dataDir: dir, env: { DSH_HOME: own } });
    const env = a.options.env as Record<string, string>;
    expect(env.DSH_HOME.startsWith(join(dir, "harness", "deepseek-harness-browser") + "/")).toBe(true);
    expect(env).toMatchObject({ DSH_AGENTS_HOME: join(env.DSH_HOME, "agents"), DSH_TELEMETRY_DISABLED: "1" });
    expect(readFileSync(join(env.DSH_HOME, "AGENTS.md"), "utf8")).toBe("Task brief.\n\nBrowser rules.\n");
    expect(a.preamble).toBeUndefined();
    // No tool row is dropped and no read-only sandbox: only the session-log upload is off.
    const layer = layerOf(env.DSH_HOME);
    expect(layer.some((r) => r.disabled)).toBe(false);
    expect(layer.find((r) => r.id === "session-log-deepseek")?.config).toEqual({ enabled: false });
    expect(Object.keys(env).some((k) => /PERMISSION/.test(k))).toBe(false);
    // OAR's dsh runtime refuses userConfiguration: never sent.
    expect("userConfiguration" in a.options).toBe(false);
    // Its folder's home: a changed brief (a driver switch) resumes in the same home.
    const again = adaptSpec(withBrowser(task("deepseek-harness"), sidecar("\n\nOther rules."), "Ducter"), { dataDir: dir, env: { DSH_HOME: own } });
    expect((again.options.env as Record<string, string>).DSH_HOME).toBe(env.DSH_HOME);
    expect(readFileSync(join(env.DSH_HOME, "AGENTS.md"), "utf8")).toBe("Task brief.\n\nOther rules.\n");
    // Without a browser place: the person's own home, the brief on the first message (unchanged).
    const plain = adaptSpec(task("deepseek-harness"), { dataDir: dir, env: { DSH_HOME: own } });
    expect((plain.options.env as Record<string, string>).DSH_HOME).toBe(own);
    expect(plain.preamble).toBe("Task brief.");
  });

  test("the key: the env or Ducter's key file first, else the person's own DSH credential file (the key, never the file)", () => {
    const own = join(dir, "own-dsh");
    mkdirSync(own);
    writeFileSync(join(own, ".credentials.yaml"), 'credentials:\n  DEEPSEEK_API_KEY: "sk-own-not-real"\n', { mode: 0o600 });
    expect(dshCredentialKey({ DSH_HOME: own })).toBe("sk-own-not-real");
    const a = adaptSpec(withBrowser(task("deepseek-harness"), sidecar(), "Ducter"), { dataDir: dir, env: { DSH_HOME: own } });
    const env = a.options.env as Record<string, string>;
    expect(env.DEEPSEEK_API_KEY).toBe("sk-own-not-real");
    expect(existsSync(join(env.DSH_HOME, ".credentials.yaml"))).toBe(false);
    writeFileSync(join(dir, "keys.env"), 'DEEPSEEK_API_KEY="sk-ducter-not-real"\n', { mode: 0o600 });
    const b = adaptSpec(withBrowser(task("deepseek-harness"), sidecar(), "Ducter"), { dataDir: dir, env: { DSH_HOME: own } });
    expect((b.options.env as Record<string, string>).DEEPSEEK_API_KEY).toBe("sk-ducter-not-real");
    // Unquoted, and no file at all.
    writeFileSync(join(own, ".credentials.yaml"), "credentials:\n  DEEPSEEK_API_KEY: sk-bare # note\n");
    expect(dshCredentialKey({ DSH_HOME: own })).toBe("sk-bare");
    expect(dshCredentialKey({ DSH_HOME: join(dir, "none") })).toBeUndefined();
  });
});
