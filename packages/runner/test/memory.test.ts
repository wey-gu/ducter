// D168: a task runs with the user's own Nowledge Mem plugin as the persona's identity where it is
// installed for that agent on that computer; where it isn't, Ducter's recall (the first turn's
// <what_i_know>, logged by id) and read-only memory_search stand in. Memory off in Ducter: the
// plugin is turned off in the session. A browser task gets none; a task proposes `remember`.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_IDS, type Bodies } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { MEM_PLUGIN_IDS } from "@ducter/protocol/src/mem-plugins.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec, TaskMemoryNote } from "@ducter/protocol/src/internal.ts";
import { adaptSpec, PI_MEM_OFF_FLAGS, piVariant } from "../src/oar.ts";
import { createRunner, normalizeReport, registerTaskTools, taskBrief } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-mem-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A harness that records each session's spec and every turn sent, and never answers. */
function recordingPort() {
  const specs: SessionSpec[] = [];
  const turns: string[] = [];
  const port: HarnessPort = {
    async start(spec) {
      specs.push(spec);
      const s: HarnessSession = {
        id: "s1",
        canSteer: false,
        busy: () => false,
        send: async (text) => void turns.push(text),
        interrupt: async () => {},
        close: async () => {},
        events: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<HarnessEvent>>(() => {}) }) }),
      };
      return s;
    },
    available: async () => [],
  };
  return { port, specs, turns };
}

const NOTES: TaskMemoryNote[] = [
  { id: "mem_a1", title: "测试统一用假时钟", content: "The user wants fake clocks in every test, never sleeps.", date: "2026-10-02" },
  { id: "mem_b2", title: "Commit style", content: "Small commits, imperative subject lines." },
];

test("no plugin on that computer: the first turn starts with what memory says matters, logged by id, not text", async () => {
  const asked: { title: string; brief: string }[] = [];
  core.taskMemory = { on: () => true, recall: async (w) => (asked.push(w), NOTES) };
  const h = recordingPort();
  const runner = createRunner(core, { harness: h.port, newId: () => "tsk1" });
  const card = await runner.openTask({ persona: "p1", title: "Fix the flaky test", brief: "Make the scheduler test stable." });
  await runner.whenStarted(card.taskId);
  expect(asked).toEqual([{ taskId: "tsk1", persona: "p1", title: "Fix the flaky test", brief: "Make the scheduler test stable." } as any]);
  expect(h.turns[0]).toStartWith("<what_i_know>\n");
  expect(h.turns[0]).toContain("- [mem_a1] 测试统一用假时钟: The user wants fake clocks in every test, never sleeps. (2026-10-02)");
  expect(h.turns[0]).toContain('Start the task "Fix the flaky test" now');
  // The brief says how to use it and how to propose; never to write.
  expect(h.specs[0]!.appendSystemPrompt).toContain("`memory_search`");
  expect(h.specs[0]!.appendSystemPrompt).toContain("You never save memories yourself");
  const logged = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]).find((b) => (b.raw as any)?.memory === "recall");
  expect((logged!.raw as any).ids).toEqual(["mem_a1", "mem_b2"]);
  expect(logged!.text).not.toContain("fake clocks");
});

test("memory off, Mem slow or nothing found: the first turn is as before and the brief says nothing about memory", async () => {
  for (const port of [
    { on: () => false, recall: async () => NOTES },
    { on: () => true, recall: async () => undefined },
  ]) {
    core.taskMemory = port;
    const h = recordingPort();
    const runner = createRunner(core, { harness: h.port, newId: () => "t" + Math.random().toString(36).slice(2, 8) });
    const card = await runner.openTask({ persona: "p1", title: "Tidy", brief: "Tidy the docs." });
    await runner.whenStarted(card.taskId);
    expect(h.turns[0]).toStartWith('Start the task "Tidy"');
    if (!port.on()) expect(h.specs[0]!.appendSystemPrompt).not.toContain("memory_search");
  }
});

test("the brief speaks of memory only when the task gets it (a browser task never does: memoryMode)", () => {
  const base = { partnerName: "Ducter", taskId: "t", title: "x", brief: "b", place: { kind: "none" as const }, cwd: "/tmp", mcpServerName: "ducter" };
  expect(taskBrief(base)).not.toContain("memory");
  expect(taskBrief({ ...base, memory: "ducter" })).toContain("`memory_search` on the `ducter` server");
  const plugin = taskBrief({ ...base, memory: "plugin" });
  expect(plugin).toContain("Nowledge Mem is on in this session as Ducter's own memory");
  expect(plugin).not.toContain("memory_search` on the");
  expect(plugin).toContain("You never save memories yourself");
});

test("plugin installed there: it stays on, as the persona, with no Ducter recall; mailbox notices stay out", async () => {
  let asked = 0;
  core.taskMemory = { on: () => true, recall: async () => (asked++, NOTES) };
  core.persona.mem = { agentId: "ducter", owned: true } as any;
  const seen: [string | undefined, string][] = [];
  core.memPluginIn = (device, harness) => (seen.push([device, harness]), harness === "claude-code");
  const h = recordingPort();
  const runner = createRunner(core, { harness: h.port, newId: () => "tsk8" });
  await runner.whenStarted((await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "claude-code" })).taskId);
  expect(h.specs[0]!.disablePlugins).toBeUndefined();
  expect(h.specs[0]!.env).toEqual({ NMEM_AGENT_ID: "ducter", NMEM_NO_MAILBOX_NOTICE: "1" });
  expect(h.specs[0]!.appendSystemPrompt).toContain("Nowledge Mem is on in this session");
  expect(h.turns[0]).toStartWith('Start the task "x"');
  expect(asked).toBe(0);
  expect(seen[0]).toEqual([undefined, "claude-code"]);
});

test("D229: Ducter's nmem named in NMEM_CLI_PATH (put in off PATH) reaches the task's plugin; the lane is left to the plugin", async () => {
  const was = process.env.NMEM_CLI_PATH;
  process.env.NMEM_CLI_PATH = "/home/u/.local/bin/nmem";
  try {
    core.taskMemory = { on: () => true, recall: async () => NOTES };
    core.persona.mem = { agentId: "ducter", owned: true, lane: "lane-1" } as any;
    core.memPluginIn = () => true;
    const h = recordingPort();
    const runner = createRunner(core, { harness: h.port, newId: () => "tsk8b" });
    await runner.whenStarted((await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "claude-code" })).taskId);
    expect(h.specs[0]!.env).toEqual({ NMEM_AGENT_ID: "ducter", NMEM_CLI_PATH: "/home/u/.local/bin/nmem", NMEM_NO_MAILBOX_NOTICE: "1" });
  } finally {
    if (was === undefined) delete process.env.NMEM_CLI_PATH;
    else process.env.NMEM_CLI_PATH = was;
  }
});

test("memory off in Ducter: the user's Mem plugin is off in the task, on Claude Code and Codex; no identity env", async () => {
  core.taskMemory = { on: () => false, recall: async () => undefined };
  core.persona.mem = { agentId: "ducter", owned: true } as any;
  core.memPluginIn = () => true;
  const h = recordingPort();
  const runner = createRunner(core, { harness: h.port, newId: () => "tsk9" });
  await runner.whenStarted((await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "claude-code" })).taskId);
  expect(h.specs[0]!.disablePlugins).toEqual(["nowledge-mem@nowledge-community"]);
  expect(h.specs[0]!.env).toBeUndefined();
  expect(h.specs[0]!.appendSystemPrompt).not.toContain("memory");

  // Claude Code: one --settings, merged with the PreCompact hook, so nothing else of the user's changes.
  const cc = adaptSpec({ ...h.specs[0]!, harness: "claude-code", contextWindow: 200_000, harnessCompactAt: 160_000, preCompactNote: "keep" }, { dataDir: dir, env: {} });
  const at = cc.options.launchArgs!.indexOf("--settings");
  const settings = JSON.parse(cc.options.launchArgs![at + 1]!);
  expect(settings.enabledPlugins).toEqual({ "nowledge-mem@nowledge-community": false });
  expect(settings.hooks).toBeDefined();
  expect(cc.options.launchArgs!.filter((a) => a === "--settings")).toHaveLength(1);
  // Without the window knobs: the settings carry only the plugin.
  const bare = adaptSpec({ harness: "claude-code", cwd: dir, mcp: [], disablePlugins: ["nowledge-mem@nowledge-community"] }, { dataDir: dir, env: {} });
  expect(bare.options.launchArgs).toEqual(["--settings", JSON.stringify({ enabledPlugins: { "nowledge-mem@nowledge-community": false } })]);
  // Under the clean setup none of the user's plugins load: nothing to add.
  const clean = adaptSpec({ harness: "claude-code", cwd: dir, mcp: [], isolateUserConfig: true, disablePlugins: ["nowledge-mem@nowledge-community"] }, { dataDir: dir, env: {} });
  expect(clean.options.launchArgs ?? []).not.toContain("--settings");

  // Codex: turned off by its bare id, only when the user's config.toml has it.
  const home = join(dir, "codex");
  mkdirSync(home);
  const spec: SessionSpec = { harness: "codex", cwd: dir, mcp: [], disablePlugins: ["nowledge-mem@nowledge-community"] };
  writeFileSync(join(home, "config.toml"), '[plugins."other@x"]\nenabled = true\n');
  expect(adaptSpec(spec, { dataDir: dir, env: { CODEX_HOME: home } }).options.launchArgs ?? []).toEqual([]);
  writeFileSync(join(home, "config.toml"), '[plugins."nowledge-mem@nowledge-community"]\nenabled = true\n');
  expect(adaptSpec(spec, { dataDir: dir, env: { CODEX_HOME: home } }).options.launchArgs).toEqual(["-c", "plugins.nowledge-mem@nowledge-community.enabled=false"]);
});

test("memory off holds on every agent Mem has a plugin for: pi without extensions, DeepSeek Harness under its own home (research/48 M3)", async () => {
  core.taskMemory = { on: () => false, recall: async () => undefined };
  core.memPluginIn = () => true;
  // Every agent in the registry with a Mem plugin gets its ids, read from harness-facts (M4).
  for (const h of HARNESS_IDS) expect(MEM_PLUGIN_IDS[h]?.length ?? 0).toBe(HARNESS_FACTS[h].memPlugin ? HARNESS_FACTS[h].memPlugin!.value.ids.length : 0);
  expect(Object.keys(MEM_PLUGIN_IDS).sort()).toEqual(["claude-code", "codex", "deepseek-harness", "pi"]);
  const specs: SessionSpec[] = [];
  for (const harness of ["pi", "deepseek-harness"] as const) {
    const h = recordingPort();
    const runner = createRunner(core, { harness: h.port, newId: () => `tsk_${harness}` });
    await runner.whenStarted((await runner.openTask({ persona: "p1", title: "x", brief: "b", harness })).taskId);
    specs.push(h.specs[0]!);
  }
  const [pi, dsh] = specs;
  expect(pi!.disablePlugins).toEqual(["npm:nowledge-mem-pi"]);
  expect(piVariant(pi!)).toEqual({ extensionsOff: true });
  expect(PI_MEM_OFF_FLAGS).toEqual(["--no-extensions"]);
  // Memory on: the user's own pi, extensions and all.
  expect(piVariant({ harness: "pi" })).toBeUndefined();
  const a = adaptSpec({ ...dsh!, appendSystemPrompt: "the brief" }, { dataDir: dir, env: {} });
  expect(a.options.env?.DSH_HOME).toContain(join("harness", "deepseek-harness-memory-off"));
  expect(readFileSync(join(a.options.env!.DSH_HOME!, "AGENTS.md"), "utf8")).toContain("the brief");
  // Memory on: the user's own DSH home.
  expect(adaptSpec({ harness: "deepseek-harness", cwd: dir, mcp: [] }, { dataDir: dir, env: {} }).options.env?.DSH_HOME).toBeUndefined();
});

test("remember: at most three, clipped, empty ones dropped; absent when none", () => {
  const r = normalizeReport("t1", {
    state: "done",
    summary: "ok",
    remember: [
      { title: "Prefers pnpm", content: "Uses pnpm in every repo." },
      { title: "", content: "no title" },
      { title: "x".repeat(100), content: "y".repeat(500) },
      { title: "a", content: "b" },
      { title: "c", content: "d" },
    ],
  });
  expect(r.remember).toHaveLength(3);
  expect(r.remember![1]!.title).toHaveLength(80);
  expect(r.remember![1]!.content).toHaveLength(400);
  expect(normalizeReport("t1", { state: "done", summary: "ok" }).remember).toBeUndefined();
});

test("a remember proposal reaches the Log with the report (the partner keeps what is durable)", async () => {
  const h = recordingPort();
  const runner = createRunner(core, { harness: h.port, newId: () => "tsk7" });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "b" });
  await runner.whenStarted(card.taskId);
  await core.call("report_to_main", { state: "done", summary: "done", remember: [{ title: "Prefers pnpm", content: "Uses pnpm everywhere." }] }, card.taskId);
  const rep = await waitFor(() => core.events.find((e) => e.kind === "report"), "report");
  expect((rep.body as Bodies["report"]).remember).toEqual([{ title: "Prefers pnpm", content: "Uses pnpm everywhere." }]);
});
