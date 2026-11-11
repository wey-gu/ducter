import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { afterCompaction, createOarHarnessPort, createRunner, NUDGE, PRECOMPACT_NOTE, REOPENED, RESUME_AFTER_RESTART, registerTaskTools, SAVE_BEFORE_COMPACT, taskBrief } from "../src/index.ts";
import { git, worktreeFor } from "../src/places.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

// ---------- helpers ----------

const FORBIDDEN = ["install", "login", "logout", "upgrade", "accountUsage", "redeemLimitReset", "skills", "commands", "mcpServers", "tools"];

/** An OAR runtime whose model is a script, wrapped so any forbidden member call fails the test. */
function trippedRuntime(turn: (t: ScriptedTurn) => void | Promise<void>, seen: { options?: any }): Runtime {
  const rt = scriptedRuntime({ id: "claude", turn });
  return new Proxy(rt, {
    get(target, prop, recv) {
      if (typeof prop === "string" && FORBIDDEN.includes(prop)) {
        return () => {
          throw new Error(`forbidden OAR call: ${prop}`);
        };
      }
      if (prop === "session") {
        return (inst: any, options: any, ctx: any) => {
          seen.options = options;
          return target.session(inst, options, ctx);
        };
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

let dir: string;
let core: FakeCore;
let ids: string[];
const nextId = () => ids.shift()!;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-runner-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  ids = ["tsk00001", "tsk00002", "tsk00003"];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function makeRepo(): Promise<string> {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "hi\n");
  Bun.spawnSync(["git", "-C", repo, "add", "."]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  return repo;
}

const taskEvents = (taskId: string) =>
  core.events.filter((e) => e.kind === "task_event" && (e.body as Bodies["task_event"]).taskId === taskId).map((e) => e.body as Bodies["task_event"]);

// ---------- tests ----------

describe("places", () => {
  test("repo place creates a worktree on ducter/<slug> from current HEAD", async () => {
    const repo = await makeRepo();
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => trippedRuntime(async () => {}, seen) });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "Fix the flaky test!", brief: "b", place: { kind: "repo", device: "mac", repoPath: repo } });
    await runner.whenStarted(card.taskId);
    // D198: <worktrees>/<repo name>/<branch slug>, readable in Finder and an editor's recent list.
    const wt = join(core.dataDir, "ducter", "worktrees", "repo", "fix-the-flaky-test");
    expect(existsSync(join(wt, "README.md"))).toBe(true);
    expect((await git(wt, ["rev-parse", "--abbrev-ref", "HEAD"])).out).toBe("ducter/fix-the-flaky-test");
    expect(card.place).toMatchObject({ kind: "repo", worktree: wt, branch: "ducter/fix-the-flaky-test", baseBranch: "main" });
    expect(seen.options.cwd).toBe(wt);

    // Same title again: branch name collides, so the task id is appended.
    const card2 = await runner.openTask({ persona: "p1", title: "Fix the flaky test!", brief: "b", place: { kind: "repo", device: "mac", repoPath: repo } });
    await runner.whenStarted(card2.taskId);
    expect((card2.place as any).branch).toBe("ducter/fix-the-flaky-test-tsk00002");
    expect((card2.place as any).worktree).toBe(join(core.dataDir, "ducter", "worktrees", "repo", "fix-the-flaky-test-tsk00002"));
    await runner.dispose();
  });

  test("D198: a worktree's folder is the repo and the branch's slug; a taken one gets -2, -3", () => {
    const data = join(dir, "d198");
    const repo = "/Users/me/code/My Repo";
    expect(worktreeFor(data, repo, "ducter/fix-login")).toBe(join(data, "ducter", "worktrees", "My-Repo", "fix-login"));
    // Planned in this process but not on disk yet: never handed out twice.
    expect(worktreeFor(data, repo, "ducter/fix-login")).toBe(join(data, "ducter", "worktrees", "My-Repo", "fix-login-2"));
    // Already on disk (a task of a branch of the same name before): the next free number.
    mkdirSync(join(data, "ducter", "worktrees", "My-Repo", "wal-bench"), { recursive: true });
    mkdirSync(join(data, "ducter", "worktrees", "My-Repo", "wal-bench-2"), { recursive: true });
    expect(worktreeFor(data, repo, "ducter/wal-bench")).toBe(join(data, "ducter", "worktrees", "My-Repo", "wal-bench-3"));
    // A branch not under ducter/ keeps its words; a slash or dots never climb out of the folder.
    expect(worktreeFor(data, repo, "feature/a b")).toBe(join(data, "ducter", "worktrees", "My-Repo", "feature-a-b"));
    expect(worktreeFor(data, "/r/..", "ducter/../..")).toBe(join(data, "ducter", "worktrees", "task", "task"));
  });

  test("none place gets a scratch dir; folder uses the path; bad repo fails the task", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => trippedRuntime(async () => {}, seen) });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const a = await runner.openTask({ persona: "p1", title: "a", brief: "b" });
    await runner.whenStarted(a.taskId);
    expect(seen.options.cwd).toBe(join(core.dataDir, "scratch", "tsk00001"));
    expect(existsSync(seen.options.cwd)).toBe(true);

    const b = await runner.openTask({ persona: "p1", title: "b", brief: "b", place: { kind: "folder", device: "mac", path: dir } });
    await runner.whenStarted(b.taskId);
    expect(seen.options.cwd).toBe(dir);

    const c = await runner.openTask({ persona: "p1", title: "c", brief: "b", place: { kind: "repo", device: "mac", repoPath: join(dir, "nope") } });
    await runner.whenStarted(c.taskId);
    expect(core.tasks.get(c.taskId)?.attention).toBe("failed");
    await runner.dispose();
  });
});

describe("session spec", () => {
  test("brief, MCP entry, disallowed tools, and model reach OAR", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => trippedRuntime(async () => {}, seen) });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "THE BRIEF TEXT", model: "haiku", language: "en" });
    await runner.whenStarted(card.taskId);
    const o = seen.options;
    expect(o.model).toBe("claude-haiku-5-5"); // D135: the alias as its concrete id
    expect(o.appendSystemPrompt).toContain("**Language: English.**");
    expect((core.events.find((e) => e.kind === "task_open")!.body as { language?: string }).language).toBe("en");
    expect(o.appendSystemPrompt).toContain("THE BRIEF TEXT");
    expect(o.appendSystemPrompt).toContain("report_to_main");
    expect(o.systemPrompt).toBeUndefined();
    expect(o.mcpServers).toEqual([{ name: "ducter", type: "http", url: "http://127.0.0.1:0/mcp", headers: { Authorization: "Bearer task-token-tsk00001" } }]);
    expect(o.disallowedTools).toContain("AskUserQuestion");
    expect(o.userConfiguration).toBeUndefined(); // tasks keep the user's own Claude Code setup by default
    // D135: a 200K window on the standard (non-1M) model, compaction at 160K, a PreCompact note.
    expect(o.env?.CLAUDE_CODE_DISABLE_1M_CONTEXT).toBe("1");
    expect(o.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("200000");
    expect(Number(o.env?.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)).toBeCloseTo(88.8889, 3); // (200K - 20K) x 88.89% = 160K
    const settings = JSON.parse(o.launchArgs[o.launchArgs.indexOf("--settings") + 1]);
    expect(settings.idleCompaction).toBe(false);
    expect(settings.hooks.PreCompact[0].hooks[0].command).toContain("This is a Ducter task.");
    expect(existsSync(join(o.cwd, ".claude"))).toBe(false); // the task's folder stays clean
    const open = core.events.find((e) => e.kind === "task_open")!;
    expect(open.stream).toBe("task:tsk00001");
    expect(open.origin).toBe("system");
    await runner.dispose();
  });

  test("brief template snapshot", () => {
    expect(
      taskBrief({
        partnerName: "Ducter", taskId: "abc123", title: "Fix flaky test", brief: "Fix the flaky test in ~/dev/foo, then tell me.",
        place: { kind: "repo", device: "mac", repoPath: "/r", branch: "ducter/fix-flaky-test", baseBranch: "main" },
        cwd: "/home/.ducter/worktrees/abc123", project: "foo", mcpServerName: "ducter",
      }),
    ).toMatchSnapshot();
    const b = taskBrief({ partnerName: "Ducter", taskId: "x", title: "t", brief: "b", place: { kind: "repo", device: "mac", repoPath: "/r", branch: "ducter/t" }, cwd: "/w", mcpServerName: "ducter" });
    expect(b).toContain("always commit, even if the brief says \"no commits\"");
    expect(b).toContain("**Hold** = pause and wait (it never means \"no\")");
    expect(b).toContain("{kind:\"diff\", label:\"commit\", ref:\"<sha>\"}");
    // The summary is read as-is on On hand and the phone: the user's language, outcome first,
    // no "Branch ducter/x, commit abc." opener (live review 2026-11-09).
    expect(b).toContain("in the language of the user's own words in the brief");
    expect(b).toContain("Open with the outcome in one sentence anyone could follow");
    expect(b).not.toContain("plus the branch name in the summary");
    // Fresh-user QA: a haiku task with an English brief reported in Chinese. The language the
    // user reads is named when the partner knows it.
    const en = taskBrief({ partnerName: "Ducter", taskId: "x", title: "t", brief: "b", place: { kind: "none" }, cwd: "/w", mcpServerName: "ducter", language: "en" });
    expect(en).toContain("**Language: English.** The user reads English");
    expect(en).not.toContain("in the language of the user's own words");
    const zh = taskBrief({ partnerName: "Ducter", taskId: "x", title: "t", brief: "b", place: { kind: "none" }, cwd: "/w", mcpServerName: "ducter", language: "zh" });
    expect(zh).toContain("**Language: Chinese (简体中文).**");
  });
});

describe("event pumping and reports (OAR scripted runtime)", () => {
  test("text, tool previews, report, and residency transitions", async () => {
    const seen: { options?: any } = {};
    const big = "x".repeat(10_000);
    const turn = async (t: ScriptedTurn) => {
      t.say("Looking at the repo. ");
      t.say("Found it.");
      await t.tool("Bash", JSON.stringify({ command: "cat big" }), () => big);
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done", summary: "done" }), () =>
        core.call("report_to_main", { state: "done", summary: "Created hello.txt", evidence: [{ kind: "file", label: "hello", ref: "hello.txt" }] }, "tsk00001"),
      );
    };
    const port = createOarHarnessPort({ loadRuntime: async () => trippedRuntime(turn, seen) });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");

    const evs = taskEvents(card.taskId);
    expect(evs.find((e) => e.role === "user")?.text).toContain("Start the task");
    expect(evs.find((e) => e.role === "assistant")?.text).toBe("Looking at the repo. Found it.");
    const bash = evs.find((e) => e.tool?.name === "Bash")!;
    expect(bash.tool!.input).toEqual({ command: "cat big" });
    expect(bash.tool!.output!.length).toBeLessThanOrEqual(2048);
    expect(bash.tool!.output).toContain("truncated");
    expect(evs.at(-1)).toMatchObject({ role: "system", text: "turn completed" });
    expect((evs.at(-1)!.raw as any).turnEnd).toBe(true);

    const report = core.events.find((e) => e.kind === "report")!;
    expect(report.body).toMatchObject({ taskId: card.taskId, state: "done", summary: "Created hello.txt" });
    expect(core.states(card.taskId)).toEqual(["queued/provisioning", "working/hot", "done_claimed/hot", "done_claimed/warm"]);
    // Reported: no nudge was sent.
    expect(evs.some((e) => e.role === "user" && e.text === NUDGE)).toBe(false);
    await runner.dispose();
  });
});

describe("nudge (stall rule)", () => {
  test("one nudge after a silent turn, then leave it", async () => {
    const inputs: string[] = [];
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        trippedRuntime((t) => {
          inputs.push(t.input);
          t.say("working quietly");
        }, {}),
    });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    await waitFor(() => taskEvents(card.taskId).some((e) => (e.raw as any)?.stall), "stall note");
    await Bun.sleep(50);
    expect(inputs).toEqual([expect.stringContaining("Start the task"), NUDGE]);
    await runner.dispose();
  });

  test("a nudge that yields a report clears the stall", async () => {
    const inputs: string[] = [];
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        trippedRuntime(async (t) => {
          inputs.push(t.input);
          if (t.input === NUDGE) await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "progress", summary: "halfway" }, "tsk00001"));
        }, {}),
    });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.events.some((e) => e.kind === "report"), "report");
    await Bun.sleep(80);
    expect(inputs).toEqual([expect.stringContaining("Start the task"), NUDGE]);
    expect(taskEvents(card.taskId).some((e) => (e.raw as any)?.stall)).toBe(false);
    await runner.dispose();
  });
});

describe("send: steer vs queue", () => {
  test("busy scripted session: steer lands in the running turn; idle: a new turn", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const steeredSeen: string[][] = [];
    const inputs: string[] = [];
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        trippedRuntime(async (t) => {
          inputs.push(t.input);
          if (inputs.length === 1) await gate;
          steeredSeen.push([...t.steered]);
          await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "ok" }, "tsk00001"));
        }, {}),
    });
    const runner = createRunner(core, { harness: port, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    await waitFor(() => inputs.length === 1, "turn running");
    expect(await runner.send(card.taskId, "also do X")).toEqual({ delivered: "steered" });
    release();
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");
    expect(steeredSeen[0]).toEqual(["also do X"]);
    expect(await runner.send(card.taskId, "next thing")).toEqual({ delivered: "prompted" });
    await waitFor(() => inputs.length === 2, "second turn");
    expect(inputs[1]).toBe("next thing");
    await runner.dispose();
  });

  test("fake port: steer when supported, queue when not or when asked", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    expect(s.sent).toEqual([{ text: expect.stringContaining("Start the task"), mode: "turn" }]);
    s.busyFlag = true;
    expect(await runner.send(card.taskId, "a")).toEqual({ delivered: "steered" });
    expect(await runner.send(card.taskId, "b", "queue")).toEqual({ delivered: "queued" });
    s.canSteer = false;
    expect(await runner.send(card.taskId, "c", "steer")).toEqual({ delivered: "queued" });
    expect(s.sent.slice(1)).toEqual([{ text: "a", mode: "steer" }, { text: "b", mode: "queue" }, { text: "c", mode: "queue" }]);
    // A user's task_send carries its clientId into the logged input (core dedupes resends by it).
    s.busyFlag = false;
    await runner.send(card.taskId, "d", undefined, "user", "cid-d");
    const input = core.log.read({ stream: `task:${card.taskId}`, kinds: ["task_event"] }).find((e) => (e.body as { text?: string }).text === "d");
    expect(input?.body).toMatchObject({ role: "user", from: "user", clientId: "cid-d", raw: { delivered: "turn" } });

    await runner.interrupt(card.taskId);
    expect(s.interrupted).toBe(1);
    await runner.drop(card.taskId);
    expect(s.closed).toBe(true);
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "dropped", residency: "parked" });
    await expect(runner.send(card.taskId, "x")).rejects.toThrow("dropped");
    await runner.dispose();
  });

  test("D141: a task runs as the persona's Mem identity (NMEM_AGENT_ID / NMEM_SPACE only); none bound, none set", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const plain = await runner.openTask({ persona: "p1", title: "a", brief: "b" });
    await runner.whenStarted(plain.taskId);
    expect(fake.specs[0]!.env).toBeUndefined();
    core.persona.mem = { agentId: "ducter", space: "ducter-scratch", owned: true };
    const bound = await runner.openTask({ persona: "p1", title: "c", brief: "d" });
    await runner.whenStarted(bound.taskId);
    expect(fake.specs[1]!.env).toEqual({ NMEM_AGENT_ID: "ducter", NMEM_SPACE: "ducter-scratch", NMEM_NO_MAILBOX_NOTICE: "1" }); // D168
    delete core.persona.mem;
    await runner.dispose();
  });

  test("D141: through the real port, a task gets the identity env and none of the host's NMEM_* set", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => trippedRuntime((t) => t.say("ok"), seen), dataDir: join(dir, "data") });
    const host = { NMEM_AGENT_ID: "the-users-own", NMEM_SPACE: "Work", NMEM_API_KEY: "nmem-fake-key-0010", NMEM_API_URL: "https://example.invalid/mem" };
    const prev = Object.fromEntries(Object.keys(host).map((k) => [k, process.env[k]]));
    Object.assign(process.env, host);
    try {
      const s = await port.start({ harness: "claude-code", cwd: dir, mcp: [], permissionMode: "bypass", env: { NMEM_AGENT_ID: "ducter" } });
      await s.close();
    } finally {
      for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const env = seen.options.env as Record<string, string | null>;
    expect(env.NMEM_AGENT_ID).toBe("ducter");
    for (const k of ["NMEM_SPACE", "NMEM_API_KEY", "NMEM_API_URL"]) expect(env[k] ?? null).toBeNull();
  });

  test("who does it (D89): core's pick reaches the session and the card; nobody left fails the open", async () => {
    const fake = new FakePort();
    (core as any).bodies = { choose: async () => ({ harness: "codex", why: { kind: "rule", ruleId: "r1", text: "后端的事 → Codex" } }) };
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "后端重构", brief: "b" });
    await runner.whenStarted(card.taskId);
    expect(fake.specs[0]!.harness).toBe("codex");
    const sel = core.events.find((e) => e.kind === "body_selected")!.body as Bodies["body_selected"];
    expect(sel).toEqual({ taskId: card.taskId, harness: "codex", why: { kind: "rule", ruleId: "r1", text: "后端的事 → Codex" } });
    (core as any).bodies = { choose: async () => ({ none: "no AI agent can take this task right now" }) };
    await expect(runner.openTask({ persona: "p1", title: "x", brief: "b" })).rejects.toThrow("no AI agent");
    delete (core as any).bodies;
    await runner.dispose();
  });

  test("D202: the effort core kept reaches the session, the card and the Log, and a restart resumes with it", async () => {
    const fake = new FakePort();
    (core as any).bodies = { choose: async (w: any) => ({ harness: "claude-code", model: "opus", effort: w.effort, why: { kind: "you" } }) };
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "深想一下", brief: "b", harness: "claude-code", model: "opus", effort: "high", origin: "you" });
    await runner.whenStarted(card.taskId);
    expect(fake.specs[0]).toMatchObject({ harness: "claude-code", model: "opus", effort: "high" });
    const open = core.events.find((e) => e.kind === "task_open")!.body as Bodies["task_open"];
    expect(open.effort).toBe("high");
    expect((core.events.find((e) => e.kind === "body_selected")!.body as Bodies["body_selected"]).effort).toBe("high");
    // The process dies mid-turn; the next one resumes the session with the same effort.
    const fake2 = new FakePort();
    const r2 = createRunner(core, { harness: fake2, newId: nextId });
    await r2.whenStarted(card.taskId);
    expect(fake2.specs[0]).toMatchObject({ resumeSessionId: "fake-1", effort: "high" });
    delete (core as any).bodies;
    await runner.dispose();
    await r2.dispose();
  });

  test("D202: an effort the chosen model doesn't offer is never sent; the task says so in one line", async () => {
    const fake = new FakePort();
    (core as any).bodies = { choose: async () => ({ harness: "claude-code", model: "sonnet", effortDropped: "effort ultra was left out: Sonnet 5.5 doesn't offer effort ultra", why: { kind: "you" } }) };
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "claude-code", model: "sonnet", effort: "ultra", origin: "you" });
    await runner.whenStarted(card.taskId);
    expect(fake.specs[0]!.effort).toBeUndefined();
    expect(taskEvents(card.taskId).some((e) => e.role === "system" && /effort ultra was left out/.test(e.text ?? ""))).toBe(true);
    // No chooser to check it against (no device info): left out too.
    delete (core as any).bodies;
    const c2 = await runner.openTask({ persona: "p1", title: "y", brief: "b", harness: "claude-code", effort: "high", origin: "you" });
    await runner.whenStarted(c2.taskId);
    expect(fake.specs[1]!.effort).toBeUndefined();
    await runner.dispose();
  });

  test("switching a running task hands it off: the old session closes, the new one starts from saved progress", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness: "codex" });
    await runner.whenStarted(card.taskId);
    core.log.append({ stream: `task:${card.taskId}`, origin: "task", kind: "checkpoint", body: { taskId: card.taskId, text: "found the failing test" } });
    fake.sessions[0]!.busyFlag = true;
    expect(await runner.switchBody!(card.taskId, "claude-code", "opus")).toEqual({ ok: true });
    expect(fake.sessions[0]!.closed).toBe(true);
    expect(fake.specs[1]).toMatchObject({ harness: "claude-code", model: "opus" });
    expect(fake.specs[1]!.resumeSessionId).toBeUndefined();
    const first = fake.sessions[1]!.sent[0]!.text;
    expect(first).toContain("started by codex");
    expect(first).toContain("found the failing test");
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    expect(await runner.switchBody!(card.taskId, "nope")).toMatchObject({ ok: false });
    await runner.dispose();
  });

  test("switching a waiting task: the answer starts a new session on the new agent from the brief and saved progress", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness: "codex" });
    await runner.whenStarted(card.taskId);
    core.log.append({ stream: `task:${card.taskId}`, origin: "task", kind: "checkpoint", body: { taskId: card.taskId, text: "found the failing test" } });
    await core.call("report_to_main", { state: "needs_input", summary: "which file?", questions: [] }, card.taskId);
    expect(await runner.switchBody!(card.taskId, "claude-code")).toEqual({ ok: true });
    expect(fake.sessions).toHaveLength(1); // nothing starts until there is something to say
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "needs_you", residency: "parked" });
    expect(await runner.send(card.taskId, "src/a.ts", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(fake.specs[1]).toMatchObject({ harness: "claude-code" });
    expect(fake.specs[1]!.resumeSessionId).toBeUndefined();
    const first = fake.sessions[1]!.sent[0]!.text;
    expect(first).toContain("started by codex");
    expect(first).toContain("found the failing test");
    expect(first).toEndWith("src/a.ts");
    // The transcript shows the user's words, not the seed.
    expect(taskEvents(card.taskId).filter((e) => e.role === "user").at(-1)!.text).toBe("src/a.ts");
    expect(runner.sessionId(card.taskId)).toBe("fake-2");
    await runner.dispose();
  });

  test("switching a finished task: a follow-up (and reopen) carries on on the new agent", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness: "codex" });
    await runner.whenStarted(card.taskId);
    await core.call("report_to_main", { state: "done", summary: "fixed", evidence: [] }, card.taskId);
    await runner.switchBody!(card.taskId, "claude-code", "sonnet");
    expect(await runner.reopen(card.taskId)).toEqual({ delivered: "prompted" });
    expect(fake.specs[1]).toMatchObject({ harness: "claude-code", model: "sonnet" });
    expect(fake.sessions[1]!.sent[0]!.text).toContain("started by codex");
    expect(fake.sessions[1]!.sent[0]!.text).toEndWith(REOPENED);
    await runner.dispose();
  });

  test("restart after a switch: the old agent's session id is not resumed on the new one", async () => {
    const fake1 = new FakePort();
    const r1 = createRunner(core, { harness: fake1, newId: nextId });
    const card = await r1.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness: "codex" });
    await r1.whenStarted(card.taskId);
    await core.call("report_to_main", { state: "needs_input", summary: "which?", questions: [] }, card.taskId);
    await r1.switchBody!(card.taskId, "claude-code");
    // core records who does it now (loadout.switchTask's body_selected)
    core.tasks.get(card.taskId)!.body = { harness: "claude-code", why: { kind: "you" } };
    await r1.dispose();

    const fake2 = new FakePort();
    const r2 = createRunner(core, { harness: fake2, newId: nextId });
    expect(r2.sessionId(card.taskId)).toBeUndefined();
    expect(await r2.send(card.taskId, "src/a.ts", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(fake2.specs[0]).toMatchObject({ harness: "claude-code" });
    expect(fake2.specs[0]!.resumeSessionId).toBeUndefined();
    expect(fake2.sessions[0]!.sent[0]!.text).toContain("started by codex");
    await r2.dispose();
    // Once the new agent has its own session, a later restart resumes that one.
    const fake3 = new FakePort();
    const r3 = createRunner(core, { harness: fake3, newId: nextId });
    expect(r3.sessionId(card.taskId)).toBe("fake-1");
    await r3.dispose();
  });

  test("a rejected resume starts a new session in the same task from the brief and every checkpoint", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    for (const text of ["step one", "step two"]) core.log.append({ stream: `task:${card.taskId}`, origin: "task", kind: "checkpoint", body: { taskId: card.taskId, text } });
    fake.sessions[0]!.end();
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "parked", "parked");
    const start = fake.start.bind(fake);
    fake.start = async (spec) => {
      if (spec.resumeSessionId) throw new Error("No conversation found with session ID");
      return start(spec);
    };
    expect(await runner.send(card.taskId, "continue")).toEqual({ delivered: "prompted" });
    expect(fake.specs.at(-1)!.resumeSessionId).toBeUndefined();
    const first = fake.sessions.at(-1)!.sent[0]!.text;
    expect(first).toContain("couldn't be resumed");
    expect(first).toContain("- step one\n- step two");
    expect(first).toEndWith("continue");
    expect(taskEvents(card.taskId).some((e) => e.role === "system" && (e.raw as any)?.fresh === "resume_rejected")).toBe(true);
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    await runner.dispose();
  });

  test("parked task resumes by session id on send", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    fake.sessions[0]!.end(); // process went away
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "parked", "parked");
    expect(await runner.send(card.taskId, "continue")).toEqual({ delivered: "prompted" });
    expect(fake.specs[1]!.resumeSessionId).toBe("fake-1");
    expect(fake.sessions[1]!.sent).toEqual([{ text: "continue", mode: "turn" }]);
    await runner.dispose();
  });
});

describe("protocol v2: logging, usage, recovery", () => {
  test("send logs the text with `from` before delivering it", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    let loggedFirst = false;
    const orig = s.send.bind(s);
    s.send = async (text, mode) => {
      loggedFirst = taskEvents(card.taskId).some((e) => e.role === "user" && e.text === text && e.from === "user");
      return orig(text, mode);
    };
    expect(await runner.send(card.taskId, "use src/a.ts", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(loggedFirst).toBe(true);
    const kick = taskEvents(card.taskId).find((e) => e.role === "user")!;
    expect(kick.from).toBe("runner");
    // A failed delivery stays in the Log, followed by a system note.
    s.send = async () => {
      throw new Error("boom");
    };
    await expect(runner.send(card.taskId, "again", undefined, "partner")).rejects.toThrow("boom");
    const tail = taskEvents(card.taskId).slice(-2);
    expect(tail[0]).toMatchObject({ role: "user", from: "partner", text: "again" });
    expect(tail[1]!.text).toContain("delivery failed");
    await runner.dispose();
  });

  test("usage rides on the turn-end task_event; session id is logged once", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    fake.sessions[0]!.emit({ role: "assistant", text: "hi" });
    fake.sessions[0]!.emit({ role: "system", text: "turn completed", turnEnd: true, usage: { inputTokens: 10, outputTokens: 3 } });
    await waitFor(() => taskEvents(card.taskId).some((e) => e.usage), "usage");
    const end = taskEvents(card.taskId).find((e) => e.usage)!;
    expect(end.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
    expect(taskEvents(card.taskId).find((e) => e.role === "assistant")!.usage).toBeUndefined();
    expect(taskEvents(card.taskId).filter((e) => (e.raw as any)?.sessionId === "fake-1")).toHaveLength(1);
    await runner.dispose();
  });

  test("restart: tasks are rebuilt from the Log; a mid-turn task resumes, a waiting one stays parked", async () => {
    const fake1 = new FakePort();
    const r1 = createRunner(core, { harness: fake1, newId: nextId });
    const a = await r1.openTask({ persona: "p1", title: "working one", brief: "b" });
    const b = await r1.openTask({ persona: "p1", title: "asking one", brief: "b2" });
    await r1.whenStarted(a.taskId);
    await r1.whenStarted(b.taskId);
    await core.call("report_to_main", { state: "needs_input", summary: "which?", questions: [] }, b.taskId);
    // The process dies: no clean close, sessions are simply gone.

    const fake2 = new FakePort();
    const r2 = createRunner(core, { harness: fake2, newId: nextId });
    await r2.whenStarted(a.taskId);
    expect(fake2.specs).toHaveLength(1);
    expect(fake2.specs[0]!.resumeSessionId).toBe("fake-1");
    expect(fake2.specs[0]!.appendSystemPrompt).toContain("working one");
    expect(fake2.sessions[0]!.sent).toEqual([{ text: RESUME_AFTER_RESTART, mode: "turn" }]);
    expect(core.tasks.get(a.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    expect(core.tasks.get(b.taskId)).toMatchObject({ attention: "needs_you", residency: "parked" });

    // The waiting task resumes its own session when the user answers.
    expect(await r2.send(b.taskId, "src/a.ts", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(fake2.specs[1]!.resumeSessionId).toBe("fake-2");
    expect(fake2.sessions[1]!.sent).toEqual([{ text: "src/a.ts", mode: "turn" }]);
    await r2.dispose();
  });
});

describe("after a restart: drop and reopen (desktop regression)", () => {
  test("drop and reopen work on tasks from before the restart; reopen resumes the session", async () => {
    const fake1 = new FakePort();
    const r1 = createRunner(core, { harness: fake1, newId: nextId });
    const a = await r1.openTask({ persona: "p1", title: "finished one", brief: "b" });
    const b = await r1.openTask({ persona: "p1", title: "other", brief: "b" });
    await r1.whenStarted(a.taskId);
    await r1.whenStarted(b.taskId);
    await core.call("report_to_main", { state: "done", summary: "ok", evidence: [{ kind: "test", label: "t", ref: "1 pass" }] }, a.taskId);
    await core.call("report_to_main", { state: "needs_input", summary: "?" }, b.taskId);

    const fake2 = new FakePort();
    const r2 = createRunner(core, { harness: fake2, newId: nextId });
    await r2.drop(b.taskId);
    expect(core.tasks.get(b.taskId)!.attention).toBe("dropped");

    expect(await r2.reopen(a.taskId)).toEqual({ delivered: "prompted" });
    expect(fake2.specs.at(-1)!.resumeSessionId).toBe("fake-1");
    expect(fake2.sessions.at(-1)!.sent).toEqual([{ text: REOPENED, mode: "turn" }]);
    expect(core.tasks.get(a.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    expect(core.tasks.get(a.taskId)!.reason).toBeUndefined();

    // A dropped task can be reopened too.
    expect(await r2.reopen(b.taskId)).toEqual({ delivered: "prompted" });
    expect(fake2.specs.at(-1)!.resumeSessionId).toBe("fake-2");
    await r2.dispose();
  });
});

describe("send to a parked task (live regression)", () => {
  test("the text is logged before the slow resume, and delivered once as the next turn", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    fake.sessions[0]!.end();
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "parked", "parked");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const start = fake.start.bind(fake);
    fake.start = async (spec) => (await gate, start(spec));
    const p = runner.send(card.taskId, "answer: b.ts", undefined, "user");
    await Bun.sleep(5);
    expect(taskEvents(card.taskId).filter((e) => e.text === "answer: b.ts")).toEqual([
      { taskId: card.taskId, role: "user", from: "user", text: "answer: b.ts", raw: { delivered: "turn" } },
    ]);
    release();
    expect(await p).toEqual({ delivered: "prompted" });
    expect(fake.sessions[1]!.sent).toEqual([{ text: "answer: b.ts", mode: "turn" }]);
    expect(taskEvents(card.taskId).filter((e) => e.text === "answer: b.ts")).toHaveLength(1);
    await runner.dispose();
  });
});

describe("user config isolation", () => {
  test("isolateUserConfig maps to OAR userConfiguration: exclude", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => trippedRuntime(async () => {}, seen) });
    const runner = createRunner(core, { harness: port, newId: nextId, isolateUserConfig: true });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    expect(seen.options.userConfiguration).toBe("exclude");
    await runner.dispose();
  });
});

describe("interrupt (live regression)", () => {
  test("a turn the user stopped leaves the card Waiting, not working; the next message resumes work", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    await runner.interrupt(card.taskId);
    s.emit({ role: "system", text: "turn aborted", turnEnd: true, raw: { kind: "turn_ended", outcome: "aborted" } });
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");
    expect(core.tasks.get(card.taskId)!.attention).toBe("blocked");
    expect(s.sent).toHaveLength(1); // no nudge after a stop
    expect(await runner.send(card.taskId, "carry on", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    await runner.dispose();
  });
});

describe("idle parking (soak regression)", () => {
  // Soak 2026-11-09: no warm -> parked transition existed, so every task that ever ran kept its
  // harness process (one claude per task) until the main restarted.
  test("an idle warm session is closed after parkIdleMs and resumed by id on the next input", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId, parkIdleMs: 40 });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    await core.call("report_to_main", { state: "done", summary: "ok", evidence: [{ kind: "log", label: "l", ref: "r" }] }, card.taskId);
    s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "parked", "parked");
    expect(s.closed).toBe(true);
    expect(core.tasks.get(card.taskId)!.attention).toBe("done_claimed"); // attention is untouched
    expect(await runner.send(card.taskId, "one more thing", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(fake.specs[1]!.resumeSessionId).toBe("fake-1");
    expect(fake.sessions[1]!.sent).toEqual([{ text: "one more thing", mode: "turn" }]);
    await runner.dispose();
  });

  test("a busy session or one that got input in time is not parked", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId, parkIdleMs: 60 });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    await core.call("report_to_main", { state: "progress", summary: "going" }, card.taskId);
    s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");
    await runner.send(card.taskId, "next", undefined, "user"); // a new turn starts: no park
    await Bun.sleep(120);
    expect(s.closed).toBe(false);
    expect(core.tasks.get(card.taskId)!.residency).toBe("hot");
    await runner.dispose();
  });
});

// ---------- a hand-written fake HarnessPort ----------

class FakeSession implements HarnessSession {
  sent: { text: string; mode: string }[] = [];
  busyFlag = false;
  canSteer = true;
  interrupted = 0;
  closed = false;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  constructor(readonly id: string) {}
  busy() {
    return this.busyFlag;
  }
  async send(text: string, mode: "turn" | "steer" | "queue" = "turn") {
    if (this.closed) throw new Error("forbidden: send after close");
    this.sent.push({ text, mode });
  }
  async interrupt() {
    this.interrupted++;
  }
  async close() {
    this.closed = true;
    this.end();
  }
  emit(e: HarnessEvent) {
    this.buf.push(e);
    this.wake?.();
  }
  end() {
    this.done = true;
    this.wake?.();
  }
  events(): AsyncIterable<HarnessEvent> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (self.buf.length === 0 && !self.done) await new Promise<void>((r) => (self.wake = r));
          const v = self.buf.shift();
          if (!v) return;
          yield v;
        }
      },
    };
  }
}

class FakePort implements HarnessPort {
  sessions: FakeSession[] = [];
  specs: SessionSpec[] = [];
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    const s = new FakeSession(spec.resumeSessionId ?? `fake-${this.sessions.length + 1}`);
    this.sessions.push(s);
    return s;
  }
  async available() {
    throw new Error("forbidden: available() during task flow");
  }
}

describe("ack and go (D120): open before the brief is written", () => {
  test("the card and the session start first; the brief is the first turn and the briefed task_open is logged", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    let give!: (b: string) => void;
    const brief = new Promise<string>((r) => (give = r));
    const card = await runner.openTaskEarly!({ persona: "p1", title: "Fix CI" }, brief);
    expect(core.tasks.get(card.taskId)).toBeDefined();
    await waitFor(() => fake.sessions.length === 1);
    expect(fake.specs[0]!.appendSystemPrompt).toContain("It is your first message, between <brief> tags");
    expect(fake.sessions[0]!.sent).toEqual([]); // waits for the brief
    give("User's words: fix CI");
    await runner.whenStarted(card.taskId);
    expect(fake.sessions[0]!.sent).toEqual([{ text: expect.stringMatching(/^<brief>\nUser's words: fix CI\n<\/brief>\n\nStart the task "Fix CI"/), mode: "turn" }]);
    const opens = core.log.read({ stream: `task:${card.taskId}`, kinds: ["task_open"] }).map((e) => (e.body as Bodies["task_open"]).brief);
    expect(opens).toEqual(["", "User's words: fix CI"]);
    await runner.dispose();
  });

  test("a brief that never comes drops the task before it did anything; recovery never starts one", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTaskEarly!({ persona: "p1", title: "t" }, Promise.reject(new Error("no call")));
    await runner.whenStarted(card.taskId);
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "dropped" });
    expect(fake.sessions.every((s) => s.sent.length === 0 && s.closed)).toBe(true);
    await runner.dispose();
    // Cut off before the brief: on restart it is not started with an empty brief.
    const card2 = await createRunner(core, { harness: fake, newId: nextId }).openTaskEarly!({ persona: "p1", title: "t2" }, new Promise<string>(() => {}));
    await waitFor(() => fake.sessions.length === 2);
    const again = new FakePort();
    const r2 = createRunner(core, { harness: again, newId: nextId });
    await r2.whenStarted(card2.taskId);
    expect(again.sessions).toHaveLength(0);
    expect(core.tasks.get(card2.taskId)).toMatchObject({ attention: "dropped" });
    await r2.dispose();
  });
});

describe("small windows (D135): save before a compaction, the brief and progress again after it", () => {
  const usage = (contextTokens: number): HarnessEvent => ({ role: "system", usage: { contextTokens }, raw: { kind: "usage" } });
  const compacted: HarnessEvent = { role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "auto" } };
  const taskEvents = (id: string) => core.log.read({ stream: `task:${id}`, kinds: ["task_event"] }).map((e) => e.body as Bodies["task_event"]);
  const compactions = (id: string) => taskEvents(id).filter((b) => (b.raw as { kind?: string } | undefined)?.kind === "compaction_ended");

  test("mid-turn: one save ask near 140K, the compaction logged with its count, then brief + latest checkpoint steered in", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "Port the parser", brief: "Port the parser to Rust; tests green." });
    await runner.whenStarted(card.taskId);
    expect(fake.specs[0]).toMatchObject({ contextWindow: 200_000, harnessCompactAt: 160_000, preCompactNote: PRECOMPACT_NOTE });
    const s = fake.sessions[0]!;
    s.busyFlag = true;
    s.emit(usage(90_000));
    s.emit(usage(141_000));
    s.emit(usage(150_000)); // asked once per compaction
    await waitFor(() => s.sent.some((x) => x.text === SAVE_BEFORE_COMPACT));
    expect(s.sent.filter((x) => x.text === SAVE_BEFORE_COMPACT)).toEqual([{ text: SAVE_BEFORE_COMPACT, mode: "steer" }]);
    core.log.append({ persona: "p1", stream: `task:${card.taskId}`, origin: "task", kind: "checkpoint", body: { taskId: card.taskId, text: "lexer ported; parser next" } });
    s.emit(compacted);
    await waitFor(() => s.sent.length === 3);
    const back = s.sent[2]!;
    expect(back.mode).toBe("steer");
    expect(back.text).toBe(afterCompaction("Port the parser to Rust; tests green.", "lexer ported; parser next"));
    expect(back.text).toContain("<brief>\nPort the parser to Rust; tests green.\n</brief>");
    expect(compactions(card.taskId)[0]).toMatchObject({ role: "system", text: "compaction completed", raw: { compactions: 1, contextTokens: 150_000, trigger: "auto" } });
    // The next approach asks again; the next compaction counts 2.
    s.emit(usage(145_000));
    s.emit(compacted);
    await waitFor(() => compactions(card.taskId).length === 2);
    expect(compactions(card.taskId).map((b) => (b.raw as { compactions: number }).compactions)).toEqual([1, 2]);
    expect(s.sent.filter((x) => x.text === SAVE_BEFORE_COMPACT)).toHaveLength(2);
    await runner.dispose();
  });

  test("between turns: the brief and progress go first in the next turn, logged apart from the partner's words", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "THE BRIEF" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    s.emit(compacted); // idle: nothing steered
    await waitFor(() => compactions(card.taskId).length === 1);
    expect(s.sent).toHaveLength(1); // only the kickoff
    await runner.send(card.taskId, "also update the README");
    const turn = s.sent[1]!;
    expect(turn.mode).toBe("turn");
    expect(turn.text.startsWith(afterCompaction("THE BRIEF", undefined))).toBe(true);
    expect(turn.text.endsWith("also update the README")).toBe(true);
    const inputs = taskEvents(card.taskId).filter((b) => b.role === "user");
    expect(inputs.at(-2)).toMatchObject({ from: "runner", raw: { delivered: "prefix" } });
    expect(inputs.at(-1)).toMatchObject({ text: "also update the README" });
    await runner.dispose();
  });
});
