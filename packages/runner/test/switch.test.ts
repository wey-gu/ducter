// D282: switching inside one task. The same agent with another model or effort keeps its native
// session (resumed with them for the next turn); another agent starts from the task's own history
// condensed, or resumes its own earlier session on the task; the person's /model, /effort (and
// Codex's /compact) in the composer are Ducter's; every other slash command goes to the agent.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, ListedModel, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createRunner, registerTaskTools, slashOf } from "../src/index.ts";
import { handedBack, handedOver } from "../src/brief.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

class FakeSession implements HarnessSession {
  sent: { text: string; mode: string }[] = [];
  busyFlag = false;
  canSteer = true;
  closed = false;
  compacted = 0;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  compact?: () => Promise<void>;
  constructor(
    readonly id: string,
    canCompact: boolean,
  ) {
    if (canCompact) this.compact = async () => void this.compacted++;
  }
  busy() {
    return this.busyFlag;
  }
  async send(text: string, mode: "turn" | "steer" | "queue" = "turn") {
    if (this.closed) throw new Error("forbidden: send after close");
    this.sent.push({ text, mode });
  }
  async interrupt() {}
  async close() {
    this.closed = true;
    this.done = true;
    this.wake?.();
  }
  emit(e: HarnessEvent) {
    this.buf.push(e);
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

const MODELS: Record<string, ListedModel[]> = {
  "claude-code": [
    { id: "opus", label: "Opus", efforts: ["low", "medium", "high", "xhigh"], default: true },
    { id: "sonnet", label: "Sonnet", efforts: ["low", "medium", "high"] },
    { id: "haiku", label: "Haiku" },
  ],
  codex: [{ id: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium", "high"], default: true }],
};

class FakePort implements HarnessPort {
  sessions: FakeSession[] = [];
  specs: SessionSpec[] = [];
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    const s = new FakeSession(spec.resumeSessionId ?? `${spec.harness}-${this.sessions.length + 1}`, spec.harness === "codex");
    this.sessions.push(s);
    return s;
  }
  async available() {
    return [];
  }
  async models(h: string) {
    return MODELS[h];
  }
}

let dir: string;
let core: FakeCore;
let ids: string[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-switch-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  ids = ["tsk00001", "tsk00002"];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const sys = (id: string) =>
  core.log
    .read({ stream: `task:${id}`, kinds: ["task_event"] })
    .map((e) => e.body as Bodies["task_event"])
    .filter((b) => b.role === "system");

async function open(harness = "claude-code", model?: string) {
  const fake = new FakePort();
  const runner = createRunner(core, { harness: fake, newId: () => ids.shift()! });
  const card = await runner.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness, ...(model ? { model } : {}) });
  await runner.whenStarted(card.taskId);
  return { fake, runner, id: card.taskId };
}

describe("the same agent, another model or effort: lossless", () => {
  test("idle: the session reopens by its id with the new model; the effort moves with it only when asked", async () => {
    const { fake, runner, id } = await open("claude-code", "opus");
    expect(await runner.switchBody!(id, "claude-code", "sonnet", "high")).toEqual({ ok: true });
    expect(fake.sessions[0]!.closed).toBe(true);
    expect(await runner.send(id, "carry on", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(fake.specs[1]).toMatchObject({ harness: "claude-code", model: "sonnet", effort: "high", resumeSessionId: "claude-code-1" });
    // No seed: the session remembers everything; the person's words go as they are.
    expect(fake.sessions[1]!.sent[0]!.text).toBe("carry on");
    expect(sys(id).find((b) => (b.raw as any)?.retuned)?.raw).toEqual({ retuned: { harness: "claude-code", model: "sonnet", effort: "high" } });
    // Another model without an effort runs at its own default (D202).
    await runner.switchBody!(id, "claude-code", "opus");
    await runner.send(id, "go", undefined, "user");
    expect(fake.specs[2]!.model).toBe("opus");
    expect(fake.specs[2]!.effort).toBeUndefined();
    expect(fake.specs[2]!.resumeSessionId).toBe("claude-code-1");
    await runner.dispose();
  });

  test("mid-turn: the turn finishes on the old model; the next turn reopens with the new one", async () => {
    const { fake, runner, id } = await open("codex");
    fake.sessions[0]!.busyFlag = true;
    await runner.switchBody!(id, "codex", "gpt-5.5", "low");
    expect(fake.sessions[0]!.closed).toBe(false);
    expect(await runner.send(id, "also check the docs", undefined, "user")).toEqual({ delivered: "steered" });
    fake.sessions[0]!.busyFlag = false;
    await runner.send(id, "next", undefined, "user");
    expect(fake.sessions[0]!.closed).toBe(true);
    expect(fake.specs[1]).toMatchObject({ model: "gpt-5.5", effort: "low", resumeSessionId: "codex-1" });
    await runner.dispose();
  });

  test("nothing changes when nothing differs", async () => {
    const { fake, runner, id } = await open("claude-code", "opus");
    expect(await runner.switchBody!(id, "claude-code", "opus")).toEqual({ ok: true });
    expect(fake.sessions[0]!.closed).toBe(false);
    expect(sys(id).some((b) => (b.raw as any)?.retuned)).toBe(false);
    await runner.dispose();
  });
});

describe("another agent: condensed carry-over, or its own session back", () => {
  test("the new agent hears the last report, its questions, the person's words since and the agent's last words", async () => {
    const { fake, runner, id } = await open("claude-code");
    core.log.append({ stream: `task:${id}`, origin: "task", kind: "checkpoint", body: { taskId: id, text: "found the flaky test" } });
    fake.sessions[0]!.emit({ role: "assistant", text: "The retry wrapper hides the race." });
    await waitFor(() => core.log.read({ stream: `task:${id}`, kinds: ["task_event"] }).some((e) => (e.body as Bodies["task_event"]).role === "assistant"));
    await core.call("report_to_main", { state: "needs_input", summary: "Two fixes possible.", questions: [{ id: "q1", text: "Remove the retry?", blocking: true, default: "remove it", reversible: true }] }, id);
    // D372: a task waiting on the person carries on as soon as it is moved (the move is their
    // answer about who does it), so the carry-over goes first and their words follow it.
    await runner.switchBody!(id, "codex", undefined, "high");
    await runner.send(id, "remove it, and keep the log line", undefined, "user");
    const first = fake.sessions[1]!.sent[0]!.text;
    const next = fake.sessions[1]!.sent.at(-1)!.text;
    expect(fake.specs[1]).toMatchObject({ harness: "codex", effort: "high" });
    expect(fake.specs[1]!.resumeSessionId).toBeUndefined();
    expect(first).toContain("started by Claude Code");
    expect(first).toContain("found the flaky test");
    expect(first).toContain("Its last report (needs_input): Two fixes possible.");
    expect(first).toContain("It asked: Remove the retry? (default: remove it)");
    expect(first).toContain("The last thing it said: The retry wrapper hides the race.");
    expect(next).toEndWith("remove it, and keep the log line");
    expect(sys(id).find((b) => (b.raw as any)?.switched)?.raw).toEqual({ switched: { from: "claude-code", to: "codex", effort: "high" } });
    await runner.dispose();
  });

  test("switching back resumes that agent's own session, told what happened since; and after a restart too", async () => {
    const { fake, runner, id } = await open("claude-code");
    await runner.switchBody!(id, "codex");
    await runner.send(id, "try it your way", undefined, "user");
    expect(fake.specs[1]!.resumeSessionId).toBeUndefined();
    await runner.switchBody!(id, "claude-code");
    await runner.send(id, "back to you", undefined, "user");
    expect(fake.specs[2]).toMatchObject({ harness: "claude-code", resumeSessionId: "claude-code-1" });
    const first = fake.sessions[2]!.sent[0]!.text;
    expect(first).toContain("You are back on this task. While you were away, Codex worked on it");
    expect(first).toContain("try it your way");
    expect(sys(id).filter((b) => (b.raw as any)?.switched).at(-1)!.raw).toEqual({ switched: { from: "codex", to: "claude-code", back: true } });
    // A finished task goes back to Codex, then a restart before its next turn: recovery resumes
    // Codex's own session and still tells it what happened since.
    await core.call("report_to_main", { state: "done", summary: "fixed", evidence: [] }, id);
    await runner.switchBody!(id, "codex");
    expect(fake.sessions).toHaveLength(3); // parked until there is something to say
    await runner.dispose();
    core.tasks.get(id)!.body = { harness: "codex", why: { kind: "you" } };
    const again = new FakePort();
    const r2 = createRunner(core, { harness: again, newId: () => "unused" });
    await r2.send(id, "and now", undefined, "user");
    expect(again.specs[0]).toMatchObject({ harness: "codex", resumeSessionId: "codex-2" });
    expect(again.sessions[0]!.sent[0]!.text).toContain("You are back on this task");
    await r2.dispose();
  });
});

describe("slash commands in the task's composer", () => {
  test("which ones Ducter runs, per agent", () => {
    expect(slashOf("/model sonnet", "claude-code")).toEqual({ cmd: "model", arg: "sonnet" });
    expect(slashOf("  /effort HIGH ", "codex")).toEqual({ cmd: "effort", arg: "HIGH" });
    expect(slashOf("/compact", "codex")).toEqual({ cmd: "compact" });
    // Claude Code runs these itself, headless (research/92 §4).
    for (const s of ["/compact", "/compact keep the API notes", "/review", "/context", "/marker-skill", "/model"]) expect(slashOf(s, "claude-code")).toBeUndefined();
    expect(slashOf("/model sonnet please", "claude-code")).toBeUndefined();
    expect(slashOf("use /model sonnet", "claude-code")).toBeUndefined();
  });

  test("/model and /effort switch in place; the card is told; the command shows as the person's words", async () => {
    const { fake, runner, id } = await open("claude-code", "opus");
    expect(await runner.send(id, "/model Sonnet", undefined, "user")).toEqual({ delivered: "prompted" });
    expect(fake.sessions[0]!.sent).toEqual([expect.objectContaining({ text: expect.stringContaining("Start the task") })]);
    expect(fake.sessions[0]!.closed).toBe(true);
    const sel = core.log.read({ stream: `task:${id}`, kinds: ["body_selected"] }).at(-1)!.body as Bodies["body_selected"];
    expect(sel).toMatchObject({ harness: "claude-code", model: "sonnet", why: { kind: "you" } });
    await runner.send(id, "/effort high", undefined, "user");
    await runner.send(id, "go on", undefined, "user");
    expect(fake.specs.at(-1)).toMatchObject({ model: "sonnet", effort: "high", resumeSessionId: "claude-code-1" });
    const said = core.log.read({ stream: `task:${id}`, kinds: ["task_event"] }).map((e) => e.body as Bodies["task_event"]).filter((b) => b.role === "user" && b.from === "user");
    expect(said.map((b) => b.text)).toEqual(["/model Sonnet", "/effort high", "go on"]);
    await runner.dispose();
  });

  test("a model or effort the agent doesn't have is said, and nothing switches", async () => {
    const { fake, runner, id } = await open("claude-code", "opus");
    await runner.send(id, "/model gpt-9", undefined, "user");
    await runner.send(id, "/effort ultra", undefined, "user");
    expect(fake.sessions[0]!.closed).toBe(false);
    const fails = sys(id).filter((b) => /^could not switch/.test(b.text ?? ""));
    expect(fails).toHaveLength(2);
    expect(fails[0]!.text).toContain('no model "gpt-9"');
    expect(fails[1]!.text).toContain("takes effort low, medium, high, xhigh");
    await runner.dispose();
  });

  test("Codex's /compact is its own compaction; Claude Code's goes to Claude Code as typed", async () => {
    const cx = await open("codex");
    await cx.runner.send(cx.id, "/compact", undefined, "user");
    expect(cx.fake.sessions[0]!.compacted).toBe(1);
    expect(cx.fake.sessions[0]!.sent).toHaveLength(1); // only the kickoff
    await cx.runner.dispose();
    const cc = await open("claude-code");
    await cc.runner.send(cc.id, "/compact", undefined, "user");
    expect(cc.fake.sessions[0]!.sent.at(-1)!.text).toBe("/compact");
    await cc.runner.dispose();
  });
});

test("the carry-over words (snapshot of the shape)", () => {
  const carry = { report: { state: "done", summary: "Fixed.", questions: [] }, said: ["also the docs"], lastWords: "Done.", branch: { commits: 2, files: 3, adds: 40, dels: 7, uncommitted: true } };
  const over = handedOver("Codex", ["step one"], carry);
  expect(over).toContain("The branch holds 2 commits, 3 files changed (+40 -7), and uncommitted work.");
  expect(over).toContain("What the user said to it since (oldest first):\n- also the docs");
  expect(handedBack("Codex", [], {})).toStartWith("You are back on this task. While you were away, Codex worked on it");
});
