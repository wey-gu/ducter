// D266: the harness's own background work (Claude Code background shells, Monitor, background
// subagents; Codex subagents) is seen: counted from OAR's task events, shown as a step, and it
// keeps the session open and the task working; the report nudge waits for it to end.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTask } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createOarHarnessPort, createRunner, NUDGE, registerTaskTools } from "../src/index.ts";
import { Normalizer } from "../src/normalize.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
let ids: string[];
const nextId = () => ids.shift()!;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-bg-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  ids = ["tsk00001", "tsk00002"];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const taskEvents = (id: string) => core.log.read({ stream: `task:${id}`, kinds: ["task_event"] }).map((e) => e.body as Bodies["task_event"]);
const turnEnd: HarnessEvent = { role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } };
const bgEv = (id: string, act: "started" | "ended" | "failed" | "stopped", what?: string): HarnessEvent => ({
  role: "system",
  text: `${act === "started" ? "running" : "finished"} in the background${what ? `: ${what}` : ""}`,
  raw: { kind: "background", background: { id, act, type: "shell", ...(what ? { what } : {}) } },
});

describe("normalize (D266)", () => {
  test("background work: flagged or still live at the turn's end; foreground, ambient and subagent-internal tasks are not", () => {
    const n = new Normalizer(() => undefined);
    const bg = (out: { raw?: unknown }[]) => out.map((e) => (e.raw as { background?: unknown } | undefined)?.background).filter(Boolean);
    // A background shell (Claude Code run_in_background), said by its own description's first line.
    expect(n.push({ kind: "task_started", taskId: "b1", taskType: "shell", description: "Run the WAL bench\nfor an hour", background: true })).toEqual([
      { role: "system", text: "running in the background: Run the WAL bench", raw: { kind: "background", background: { id: "b1", act: "started", type: "shell", what: "Run the WAL bench" } } },
    ]);
    // A foreground subagent that ends inside its turn: never a background step.
    expect(n.push({ kind: "task_started", taskId: "a1", taskType: "agent", description: "Find the flaky test" })).toEqual([]);
    expect(n.push({ kind: "task_ended", taskId: "a1", status: "completed" })).toEqual([]);
    // Ambient upkeep and a subagent's own tasks stay out.
    expect(n.push({ kind: "task_started", taskId: "x", taskType: "other", background: true, ambient: true })).toEqual([]);
    expect(n.push({ kind: "task_started", taskId: "y", taskType: "shell", background: true, agentPath: ["call-1"] })).toEqual([]);
    // Moved to the background after it started (Claude Code's patch is_backgrounded).
    expect(n.push({ kind: "task_started", taskId: "m1", taskType: "shell", description: "bun run dev" })).toEqual([]);
    expect(bg(n.push({ kind: "task_updated", taskId: "m1", background: true }))).toEqual([{ id: "m1", act: "started", type: "shell", what: "bun run dev" }]);
    expect(n.push({ kind: "task_updated", taskId: "m1", description: "still going" })).toEqual([]);
    // Unflagged but still running when its turn ended: in the background all the same.
    expect(n.push({ kind: "task_started", taskId: "w1", taskType: "agent" })).toEqual([]);
    const end = n.push({ kind: "turn_ended", outcome: { kind: "completed" } });
    expect(bg(end)).toEqual([{ id: "w1", act: "started", type: "agent" }]);
    expect(end.at(-1)).toMatchObject({ turnEnd: true });
    expect(n.backgroundLive()).toBe(3);
    // Ends: completed, failed, stopped; an end said twice counts once.
    expect(n.push({ kind: "task_ended", taskId: "b1", status: "completed" })).toEqual([
      { role: "system", text: "finished in the background: Run the WAL bench", raw: { kind: "background", background: { id: "b1", act: "ended", type: "shell", what: "Run the WAL bench" } } },
    ]);
    expect(n.push({ kind: "task_ended", taskId: "b1", status: "completed" })).toEqual([]);
    expect(bg(n.push({ kind: "task_ended", taskId: "w1", status: "failed" }))).toEqual([{ id: "w1", act: "failed", type: "agent" }]);
    expect(bg(n.push({ kind: "task_ended", taskId: "m1", status: "stopped" }))).toEqual([{ id: "m1", act: "stopped", type: "shell", what: "bun run dev" }]);
    expect(n.backgroundLive()).toBe(0);
    // A Codex subagent: always in the background, said by its path's last part; it can run again.
    expect(bg(n.push({ kind: "task_started", taskId: "th-2", taskType: "agent", nativeType: "subAgent", childSessionId: "th-2", background: true, description: "/root/explorer" }))).toEqual([{ id: "th-2", act: "started", type: "agent", what: "explorer" }]);
    n.push({ kind: "task_ended", taskId: "th-2", status: "completed" });
    expect(bg(n.push({ kind: "task_updated", taskId: "th-2", status: "running" }))).toEqual([{ id: "th-2", act: "started", type: "agent", what: "explorer" }]);
    expect(n.backgroundLive()).toBe(1);
  });
});

describe("runner (D266)", () => {
  test("a turn that ends with background work running: no nudge, still working, never parked; the nudge goes once it ends with no turn of its own", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId, parkIdleMs: 30, backgroundSettleMs: 40 });
    const card = await runner.openTask({ persona: "p1", title: "Soak the bench", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    s.emit(bgEv("b1", "started", "Run the WAL bench"));
    s.emit(turnEnd);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "hot" && taskEvents(card.taskId).some((e) => e.raw && (e.raw as any).turnEnd), "turn end");
    await Bun.sleep(120); // well past parkIdleMs and backgroundSettleMs
    expect(s.sent.map((x) => x.text)).not.toContain(NUDGE);
    expect(s.closed).toBe(false);
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    // Logged as a step the transcript shows.
    expect(taskEvents(card.taskId).find((e) => (e.raw as any)?.background)).toMatchObject({ role: "system", raw: { background: { act: "started", type: "shell", what: "Run the WAL bench" } } });
    // It ends and the harness takes no turn of its own: the report is asked for after the settle.
    s.emit(bgEv("b1", "ended", "Run the WAL bench"));
    await waitFor(() => s.sent.some((x) => x.text === NUDGE), "nudge after the background work ended");
    expect(s.sent.filter((x) => x.text === NUDGE)).toHaveLength(1);
    expect(currentStall(card.taskId)).toBe(false);
    await runner.dispose();
  });

  test("the harness's own turn after its background work ended reports: no nudge; then it parks as usual", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: nextId, parkIdleMs: 60, backgroundSettleMs: 80 });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    s.emit(bgEv("b1", "started"));
    s.emit(turnEnd);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "hot", "hot");
    s.emit(bgEv("b1", "ended"));
    // Claude Code's own turn on the task's end: it reports.
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm after the background work");
    await core.call("report_to_main", { state: "done", summary: "p99 4.1ms", evidence: [{ kind: "log", label: "bench", ref: "bench.log" }] }, card.taskId);
    s.emit(turnEnd);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "parked", "parked");
    expect(s.sent.map((x) => x.text)).not.toContain(NUDGE);
    expect(s.closed).toBe(true);
    await runner.dispose();
  });

  test("the ceiling: a background job the harness says nothing of for that long stops holding the session", async () => {
    const fake = new FakePort();
    let t = Date.parse("2026-11-16T08:00:00Z");
    const runner = createRunner(core, { harness: fake, newId: nextId, parkIdleMs: 30, backgroundCeilingMs: 12 * 3600_000, now: () => new Date(t) });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    await core.call("report_to_main", { state: "progress", summary: "bench running" }, card.taskId);
    s.emit(bgEv("b1", "started", "tail -f server.log"));
    s.emit(turnEnd);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "hot", "hot");
    await Bun.sleep(80);
    expect(s.closed).toBe(false);
    t += 12 * 3600_000; // twelve hours of nothing
    await waitFor(() => s.closed, "parked past the ceiling");
    expect(taskEvents(card.taskId).some((e) => (e.raw as any)?.backgroundCeiling && /tail -f server\.log/.test(e.text ?? ""))).toBe(true);
    await runner.dispose();
  });

  test("the archive horizon leaves a finished task alone while its background work runs", async () => {
    const fake = new FakePort();
    let t = Date.parse("2026-11-16T08:00:00Z");
    const runner = createRunner(core, { harness: fake, newId: nextId, parkIdleMs: 0, archiveIdleMs: 1000, now: () => new Date(t) });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    const s = fake.sessions[0]!;
    await core.call("report_to_main", { state: "done", summary: "ok", evidence: [{ kind: "log", label: "l", ref: "r" }] }, card.taskId);
    s.emit(bgEv("b1", "started"));
    s.emit(turnEnd);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "hot", "hot");
    t += 3600_000;
    expect(await runner.sweepArchive()).toEqual([]);
    expect(s.closed).toBe(false);
    await runner.dispose();
  });

  test("end to end through OAR's scripted runtime: a background task started in a turn holds the nudge until it ends", async () => {
    const inputs: string[] = [];
    let task: ScriptedTask | undefined;
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        scriptedRuntime({
          id: "claude",
          turn: (tt) => {
            inputs.push(tt.input);
            if (!task) task = tt.task({ taskType: "shell", description: "Run the WAL bench for an hour", background: true });
            tt.say("started the bench in the background");
          },
        }),
    });
    const runner = createRunner(core, { harness: port, newId: nextId, backgroundSettleMs: 30 });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    await waitFor(() => taskEvents(card.taskId).some((e) => (e.raw as any)?.turnEnd), "turn end");
    await Bun.sleep(80);
    expect(inputs).toEqual([expect.stringContaining("Start the task")]);
    expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "working", residency: "hot" });
    task!.end("completed");
    await waitFor(() => inputs.includes(NUDGE), "nudge after the end");
    const acts = taskEvents(card.taskId).map((e) => (e.raw as any)?.background?.act).filter(Boolean);
    expect(acts).toEqual(["started", "ended"]);
    await runner.dispose();
  });
});

function currentStall(id: string): boolean {
  return taskEvents(id).some((e) => (e.raw as any)?.stall);
}

// ---------- a hand-written fake HarnessPort ----------

class FakeSession implements HarnessSession {
  sent: { text: string; mode: string }[] = [];
  canSteer = true;
  closed = false;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  constructor(readonly id: string) {}
  busy() {
    return false;
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
