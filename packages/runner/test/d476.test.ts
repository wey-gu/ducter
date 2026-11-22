// D476 (hel, 2026-11-22): an Antigravity task on the Mac went working, then idle within a second,
// then "stalled", and the partner was handed a stall to read. Its agent never did anything: it
// didn't really start. That is said as a start failure, with the agent's own words, so the mend
// asks for another agent or a sign-in instead. A real stall (it did work, then stopped) is unchanged.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { compareVersions, versionStanding } from "@ducter/protocol/src/harness-facts.ts";
import { antigravityRuntime } from "@botiverse/oar/runtimes/antigravity";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

class FakeSession implements HarnessSession {
  sent: string[] = [];
  canSteer = true;
  closed = false;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  constructor(
    readonly id: string,
    private onSend: (s: FakeSession, text: string) => void,
  ) {}
  busy() {
    return false;
  }
  async send(text: string) {
    this.sent.push(text);
    this.onSend(this, text);
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
  constructor(private onSend: (s: FakeSession, text: string) => void) {}
  async start(spec: SessionSpec) {
    const s = new FakeSession(`${spec.harness}-${this.sessions.length + 1}`, this.onSend);
    this.sessions.push(s);
    return s;
  }
  async available() {
    return [];
  }
}

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-d476-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ended = (s: FakeSession, words?: string) => {
  if (words) s.emit({ role: "assistant", text: words });
  s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
};
const states = (id: string) => core.events.filter((e) => e.kind === "task_state" && (e.body as Bodies["task_state"]).taskId === id).map((e) => e.body as Bodies["task_state"]);

test("an agent that ends its first turns at once, doing nothing: a start failure with its own words, never a stall", async () => {
  const port = new FakePort((s) => queueMicrotask(() => ended(s, "Please sign in to Antigravity to continue.")));
  const runner = createRunner(core, { harness: port, newId: () => "jj6efivf" });
  const card = await runner.openTask({ persona: "p1", title: "用 Gemini 审改 Mem 长文案并开 PR", brief: "b", harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  const failed = await waitFor(() => states(card.taskId).find((s) => s.attention === "failed"), "failed");
  expect(failed.cant).toMatchObject({ why: "signed_out", detail: "Please sign in to Antigravity to continue.", harness: "antigravity" });
  // No stall line, never needs_you: the mend reads it as a start, not as work to carry on.
  const evs = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]);
  expect(evs.some((b) => (b.raw as { stall?: boolean } | undefined)?.stall)).toBe(false);
  expect(states(card.taskId).some((s) => s.attention === "needs_you")).toBe(false);
  expect(port.sessions[0]!.closed).toBe(true);
  expect(port.sessions[0]!.sent).toHaveLength(2); // the kickoff and the one nudge
  await runner.dispose();
});

test("its words name no cause: 'agent', with what it said; silent: 'agent' with no words", async () => {
  const port = new FakePort((s) => queueMicrotask(() => ended(s, "I can't do that right now.")));
  const runner = createRunner(core, { harness: port, newId: () => "tskagy01" });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  const failed = await waitFor(() => states(card.taskId).find((s) => s.attention === "failed"), "failed");
  expect(failed.cant).toMatchObject({ why: "agent", detail: "I can't do that right now." });
  await runner.dispose();
});

test("the process ends before the agent did anything: a crash on start, said with its exit line", async () => {
  const port = new FakePort((s) =>
    queueMicrotask(() => {
      s.emit({ role: "system", text: "harness exited (code 1): agy: model gemini-3-pro not available", raw: { kind: "exited" } });
      s.end();
    }),
  );
  const runner = createRunner(core, { harness: port, newId: () => "tskagy02" });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  const failed = await waitFor(() => states(card.taskId).find((s) => s.attention === "failed"), "failed");
  expect(failed.cant).toMatchObject({ why: "agent", detail: "harness exited (code 1): agy: model gemini-3-pro not available" });
  await runner.dispose();
});

test("an agent that did work and then stopped without a report is still a stall", async () => {
  let n = 0;
  const port = new FakePort((s) =>
    queueMicrotask(() => {
      if (n++ === 0) s.emit({ role: "tool", tool: { name: "Read", input: { path: "README.md" }, output: "hi", ok: true } });
      ended(s, "Looked at it.");
    }),
  );
  const runner = createRunner(core, { harness: port, newId: () => "tskagy03" });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.events.some((e) => e.kind === "task_event" && ((e.body as Bodies["task_event"]).raw as { stall?: boolean } | undefined)?.stall), "stall");
  expect(states(card.taskId).some((s) => s.attention === "failed")).toBe(false);
  await runner.dispose();
});

test("a long answer in words (it only forgot to report) is still a stall, not a start failure", async () => {
  const port = new FakePort((s) => queueMicrotask(() => ended(s, "Here is the review of the copy. ".repeat(20))));
  const runner = createRunner(core, { harness: port, newId: () => "tskagy05" });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.events.some((e) => e.kind === "task_event" && ((e.body as Bodies["task_event"]).raw as { stall?: boolean } | undefined)?.stall), "stall");
  expect(states(card.taskId).some((s) => s.attention === "failed")).toBe(false);
  await runner.dispose();
});

test("B: the person's word is kept on the task and handed to who-does-it", async () => {
  const chose: unknown[] = [];
  core.bodies = { choose: async (w) => void chose.push(w.bound) } as never;
  const port = new FakePort(() => {});
  const runner = createRunner(core, { harness: port, newId: () => "tskagy04" });
  await runner.openTask({ persona: "p1", title: "x", brief: "b", harness: "antigravity", bound: { only: "local", not: ["d1f365f665"] } });
  const open = core.events.find((e) => e.kind === "task_open")!.body as Bodies["task_open"];
  expect(open.bound).toEqual({ only: "local", not: ["d1f365f665"] });
  expect(chose).toEqual([{ only: "local", not: ["d1f365f665"] }]);
  await runner.dispose();
});

test("E: Antigravity 1.5.14 is newer than Ducter verified, a note only: OAR's floor lets it start", () => {
  expect(versionStanding("antigravity", "1.5.14")).toBe("newer");
  const floor = (antigravityRuntime as { minVersion?: string }).minVersion ?? "";
  expect(floor).toBe("1.5.0");
  expect(compareVersions("1.5.14", floor)).toBeGreaterThan(0);

});
