// D521: a task's background work on its card (TaskCard.background), the list the opened task's
// tray and On hand's quiet count read. Driven end to end: OAR-shaped events through the runner's
// own Normalizer (a Claude Code background shell, a Monitor watch, a subagent, a Codex background
// terminal), the runner's log, core's index over the Log; Stop through the client's task_action.
import { afterEach, describe, expect, test } from "bun:test";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { backgroundOf, bgRunning, shortAtWord, tailLines, type ServerFrame, type TaskCard } from "@ducter/protocol";
import { createRunner } from "../../runner/src/index.ts";
import { Normalizer } from "../../runner/src/normalize.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** A session fed OAR-shaped events through the runner's real Normalizer; Stop answers as the agent would (its task ends stopped). */
class OarLikeSession implements HarnessSession {
  canSteer = true;
  sent: string[] = [];
  stopped: string[] = [];
  private n: Normalizer;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  constructor(
    readonly id: string,
    canStop: boolean,
  ) {
    this.n = new Normalizer(() => undefined, { canStop });
    if (!canStop) this.stopBackground = undefined;
  }
  busy() {
    return false;
  }
  async send(text: string) {
    this.sent.push(text);
  }
  async interrupt() {}
  stopBackground?: (id: string) => Promise<void> = async (id: string) => {
    this.stopped.push(id);
    queueMicrotask(() => this.oar({ kind: "task_ended", taskId: id, status: "stopped" }));
  };
  async close() {
    this.done = true;
    this.wake?.();
  }
  oar(ev: Record<string, unknown> & { kind: string }) {
    this.buf.push(...this.n.push(ev));
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

class Port implements HarnessPort {
  sessions: OarLikeSession[] = [];
  constructor(private canStop: (spec: SessionSpec) => boolean) {}
  async start(spec: SessionSpec) {
    const s = new OarLikeSession(`s${this.sessions.length + 1}`, this.canStop(spec));
    this.sessions.push(s);
    return s;
  }
  // Both agents installed and signed in, as on a CI runner with none of them (the core's own probe never runs).
  async available() {
    return ["claude-code", "codex"].map((harness) => ({ harness, installed: true, loggedIn: true }));
  }
}

async function boot(canStop: (spec: SessionSpec) => boolean = (s) => s.harness !== "pi") {
  const t = tempDir();
  // Both agents installed and signed in here (a CI runner has none; the real probe never runs).
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, platform: "darwin", push: false, deviceProbes: { cua: async () => ({ missing: "test" }), native: async () => undefined, harnesses: async () => ["claude-code", "codex"].map((harness) => ({ harness, installed: true, loggedIn: true })), kind: async () => "laptop" } });
  const port = new Port(canStop);
  let n = 0;
  const runner = createRunner(core, { harness: port, newId: () => `bgt${String(++n).padStart(5, "0")}`, parkIdleMs: 0, backgroundSettleMs: 60_000 });
  core.setRunner(runner);
  stops.push(t.cleanup, () => core.stop(), () => runner.dispose());
  return { core, runner, port };
}

const until = async (what: string, ok: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await Bun.sleep(10);
  }
};

const cardOf = (core: Core, id: string): TaskCard => core.tasks.onHand().tasks.find((c) => c.taskId === id)!;

describe("a task's background work on its card (D521)", () => {
  test("Claude Code: a background shell, a Monitor watch and a subagent; their ends, an exit code and an output's tail; Stop through the agent's own stop", async () => {
    const { core, runner, port } = await boot();
    const card = await runner.openTask({ persona: "default", title: "Run the LoCoMo eval", brief: "b", harness: "claude-code" });
    await runner.whenStarted(card.taskId);
    const s = port.sessions[0]!;
    expect(cardOf(core, card.taskId).background).toBeUndefined();
    s.oar({ kind: "task_started", taskId: "b1", taskType: "shell", nativeType: "local_bash", description: "Wait for the LoCoMo store to finish building before the eval starts", background: true });
    s.oar({ kind: "tool_call_started", callId: "tu-mon", tool: "Monitor", input: "{}" });
    s.oar({ kind: "task_started", taskId: "m1", taskType: "shell", toolCallId: "tu-mon", description: "Watch the eval log for errors", background: true });
    s.oar({ kind: "tool_call_ended", callId: "tu-mon", result: "ok", content: [{ type: "text", text: "Monitor started" }] });
    s.oar({ kind: "task_started", taskId: "a1", taskType: "agent", nativeType: "local_agent", description: "S0: per-question eval ledger" });
    s.oar({ kind: "turn_ended", outcome: { kind: "completed" } });
    await until("three running", () => bgRunning(cardOf(core, card.taskId).background) === 3);
    const b = cardOf(core, card.taskId).background!;
    expect(b.done).toBe(0);
    expect(b.jobs.map((j) => [j.id, j.kind, j.state, j.stop])).toEqual([
      ["b1", "shell", "running", true],
      ["m1", "watch", "running", true],
      ["a1", "agent", "running", true],
    ]);
    // The title is the agent's own words, cut at a word end.
    expect(b.jobs[0]!.title).toBe("Wait for the LoCoMo store to finish building before the eval starts");
    expect(b.jobs[0]!.at).toBeTruthy();

    // The shell ends with output; the subagent fails.
    s.oar({ kind: "task_ended", taskId: "b1", status: "completed", summary: "Background command completed\nstore built: 1,986 sessions" });
    s.oar({ kind: "task_ended", taskId: "a1", status: "failed" });
    await until("two finished", () => cardOf(core, card.taskId).background!.done === 2);
    const after = cardOf(core, card.taskId).background!;
    expect(after.jobs.map((j) => [j.id, j.state])).toEqual([
      ["m1", "running"],
      ["b1", "done"],
      ["a1", "failed"],
    ]);
    expect(after.jobs[1]!.tail).toContain("store built: 1,986 sessions");
    expect(after.jobs[1]!.stop).toBeUndefined();

    // Stop, as a client asks it: through the agent's own stop; its end says the person stopped it.
    const ws = new WebSocket(core.url);
    stops.push(() => ws.close());
    const frames: ServerFrame[] = [];
    ws.onmessage = (m) => void frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    ws.send(JSON.stringify({ t: "hello" }));
    ws.send(JSON.stringify({ t: "task_action", taskId: card.taskId, action: "stop_background", job: "m1" }));
    await until("the answer", () => frames.some((f) => f.t === "action_result" && f.action === "stop_background"));
    expect(frames.find((f) => f.t === "action_result" && f.action === "stop_background")).toMatchObject({ ok: true });
    expect(s.stopped).toEqual(["m1"]);
    await until("stopped", () => cardOf(core, card.taskId).background!.jobs.find((j) => j.id === "m1")?.state === "stopped");
    expect(bgRunning(cardOf(core, card.taskId).background)).toBe(0);
    const logged = core.log.read({ stream: `task:${card.taskId}`, kinds: ["task_event"] }).map((e) => (e.body as { raw?: any }).raw?.background).filter(Boolean);
    expect(logged.find((x: any) => x.id === "m1" && x.act === "stopped")).toMatchObject({ by: "person", tool: "Monitor" });
    // A second stop of the same one: it isn't running any more.
    ws.send(JSON.stringify({ t: "task_action", taskId: card.taskId, action: "stop_background", job: "m1" }));
    await until("the second answer", () => frames.filter((f) => f.t === "action_result" && f.action === "stop_background").length === 2);
    expect(frames.filter((f) => f.t === "action_result" && f.action === "stop_background")[1]).toMatchObject({ ok: false });
  }, 30_000);

  test("Codex: a background terminal is listed by its command with its exit code, and offers no Stop (OAR has none for a tool call)", async () => {
    const { core, runner, port } = await boot();
    const card = await runner.openTask({ persona: "default", title: "Bench", brief: "b", harness: "codex" });
    await runner.whenStarted(card.taskId);
    const s = port.sessions[0]!;
    s.oar({ kind: "tool_call_started", callId: "exec-1", tool: "commandExecution", input: "/bin/zsh -lc 'cargo bench --bench wal'" });
    s.oar({ kind: "task_started", taskId: "th-2", taskType: "agent", nativeType: "subAgent", childSessionId: "th-2", background: true, description: "/root/explorer" });
    s.oar({ kind: "turn_ended", outcome: { kind: "completed" } });
    await until("two running", () => bgRunning(cardOf(core, card.taskId).background) === 2);
    const jobs = cardOf(core, card.taskId).background!.jobs;
    expect(jobs.find((j) => j.id === "exec-1")).toMatchObject({ kind: "shell", title: "cargo bench --bench wal", state: "running" });
    expect(jobs.find((j) => j.id === "exec-1")!.stop).toBeUndefined();
    // A Codex subagent can be stopped (its turn interrupted).
    expect(jobs.find((j) => j.id === "th-2")).toMatchObject({ kind: "agent", title: "explorer", stop: true });
    s.oar({ kind: "tool_call_ended", callId: "exec-1", result: "error", exitCode: 101, content: [{ type: "text", text: "compiling\nerror[E0425]: cannot find value `wal`" }] });
    await until("ended", () => cardOf(core, card.taskId).background!.done === 1);
    expect(cardOf(core, card.taskId).background!.jobs.find((j) => j.id === "exec-1")).toMatchObject({ state: "failed", exit: 101 });
    expect(cardOf(core, card.taskId).background!.jobs.find((j) => j.id === "exec-1")!.tail).toContain("error[E0425]");
  }, 30_000);

  test("an agent with no stop of its own: no Stop offered, and a stop asked anyway is refused in words", async () => {
    const { core, runner, port } = await boot(() => false);
    const card = await runner.openTask({ persona: "default", title: "Watch", brief: "b", harness: "claude-code" });
    await runner.whenStarted(card.taskId);
    const s = port.sessions[0]!;
    s.oar({ kind: "task_started", taskId: "b1", taskType: "shell", description: "tail -f server.log", background: true });
    await until("running", () => bgRunning(cardOf(core, card.taskId).background) === 1);
    expect(cardOf(core, card.taskId).background!.jobs[0]!.stop).toBeUndefined();
    expect(await runner.stopBackground!(card.taskId, "b1")).toMatchObject({ ok: false });
  }, 30_000);

  test("the session gone (Ducter restarted, the session let go): one still open is unknown, never running forever", async () => {
    const { core, runner, port } = await boot();
    const card = await runner.openTask({ persona: "default", title: "t", brief: "b", harness: "claude-code" });
    await runner.whenStarted(card.taskId);
    port.sessions[0]!.oar({ kind: "task_started", taskId: "b1", taskType: "shell", description: "bun run dev", background: true });
    await until("running", () => bgRunning(cardOf(core, card.taskId).background) === 1);
    core.tasks.setState(card.taskId, "done", "parked");
    expect(cardOf(core, card.taskId).background!.jobs[0]).toMatchObject({ state: "unknown" });
    expect(cardOf(core, card.taskId).background!.jobs[0]!.stop).toBeUndefined();
  }, 30_000);
});

describe("the fold (protocol background.ts)", () => {
  const ev = (ts: string, background: Record<string, unknown>) => ({ ts, kind: "task_event", body: { taskId: "t", role: "system", raw: { background } } });
  test("acts logged before D521 have no id: an end closes the oldest open one of its words", () => {
    const b = backgroundOf([ev("2026-11-24T01:00:00Z", { act: "started", type: "shell", what: "make" }), ev("2026-11-24T01:00:05Z", { act: "started", type: "shell", what: "make" }), ev("2026-11-24T01:01:00Z", { act: "ended", type: "shell", what: "make", exitCode: 0 })], true)!;
    expect(b.jobs.map((j) => j.state)).toEqual(["running", "done"]);
    expect(b.jobs[1]!.id).toBe("at:2026-11-24T01:00:00Z");
  });
  test("a non-zero exit is a failure; at most the newest 30 finished are kept and all are counted", () => {
    const evs = [];
    for (let i = 0; i < 40; i++) evs.push(ev(`2026-11-24T01:${String(i).padStart(2, "0")}:00Z`, { id: `j${i}`, act: "started", type: "shell", what: `step ${i}` }), ev(`2026-11-24T01:${String(i).padStart(2, "0")}:30Z`, { id: `j${i}`, act: "ended", type: "shell", exitCode: i === 39 ? 2 : 0 }));
    const b = backgroundOf(evs, true)!;
    expect(b.done).toBe(40);
    expect(b.jobs.length).toBe(30);
    expect(b.jobs.at(-1)).toMatchObject({ id: "j39", state: "failed", exit: 2 });
  });
  test("a title is cut at a word end; an output's tail keeps whole lines", () => {
    expect(shortAtWord("Run the full LoCoMo benchmark against the new store with the per-question ledger turned on and compare")).toBe("Run the full LoCoMo benchmark against the new store with the…");
    expect([...shortAtWord("把第三方仓库的所有提交历史都重新整理一遍然后对照新的设计文档逐条检查每个模块的接口是否一致并且把不一致的地方列出来写成一份报告发给作者看看")].length).toBeLessThanOrEqual(72);
    expect(tailLines("x\n".repeat(400) + "last line", 20)).toBe("x\nx\nx\nx\nx\nlast line");
  });
});
