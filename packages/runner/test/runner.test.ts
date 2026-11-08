import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createOarHarnessPort, createRunner, NUDGE, RESUME_AFTER_RESTART, registerTaskTools, taskBrief } from "../src/index.ts";
import { git } from "../src/places.ts";
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
    const wt = join(core.dataDir, "worktrees", "tsk00001");
    expect(existsSync(join(wt, "README.md"))).toBe(true);
    expect((await git(wt, ["rev-parse", "--abbrev-ref", "HEAD"])).out).toBe("ducter/fix-the-flaky-test");
    expect(card.place).toMatchObject({ kind: "repo", worktree: wt, branch: "ducter/fix-the-flaky-test", baseBranch: "main" });
    expect(seen.options.cwd).toBe(wt);

    // Same title again: branch name collides, so the task id is appended.
    const card2 = await runner.openTask({ persona: "p1", title: "Fix the flaky test!", brief: "b", place: { kind: "repo", device: "mac", repoPath: repo } });
    await runner.whenStarted(card2.taskId);
    expect((card2.place as any).branch).toBe("ducter/fix-the-flaky-test-tsk00002");
    await runner.dispose();
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
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "THE BRIEF TEXT", model: "haiku" });
    await runner.whenStarted(card.taskId);
    const o = seen.options;
    expect(o.model).toBe("haiku");
    expect(o.appendSystemPrompt).toContain("THE BRIEF TEXT");
    expect(o.appendSystemPrompt).toContain("report_to_main");
    expect(o.systemPrompt).toBeUndefined();
    expect(o.mcpServers).toEqual([{ name: "ducter", type: "http", url: "http://127.0.0.1:0/mcp", headers: { Authorization: "Bearer task-token-tsk00001" } }]);
    expect(o.disallowedTools).toContain("AskUserQuestion");
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

    await runner.interrupt(card.taskId);
    expect(s.interrupted).toBe(1);
    await runner.drop(card.taskId);
    expect(s.closed).toBe(true);
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "dropped", residency: "parked" });
    await expect(runner.send(card.taskId, "x")).rejects.toThrow("dropped");
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
