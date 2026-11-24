// D538: heavy work where there is no room waits, and starts by itself the moment there is (hel,
// 2026-11-24: one task's tsc×3, Playwright and Vite at once on 7.6 GB with no swap stopped the home).
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { roomReason } from "../src/runner.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

class FakeSession implements HarnessSession {
  sent: string[] = [];
  canSteer = true;
  closed = false;
  private wake?: () => void;
  constructor(readonly id: string) {}
  busy() {
    return false;
  }
  async send(text: string) {
    this.sent.push(text);
  }
  async interrupt() {}
  async close() {
    this.closed = true;
    this.wake?.();
  }
  events(): AsyncIterable<HarnessEvent> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!self.closed) await new Promise<void>((r) => (self.wake = r));
      },
    };
  }
}

class FakePort implements HarnessPort {
  specs: SessionSpec[] = [];
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    return new FakeSession(`s${this.specs.length}`);
  }
  async available() {
    return [];
  }
}

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-room-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("heavy work with no room waits, says so, and starts when the room is there", async () => {
  let room = false;
  const asked: string[] = [];
  (core as any).bodies = {
    choose: async () => ({ harness: "codex", why: { kind: "default", where: { device: "hel", kind: "home" } }, waits: "room" as const }),
    room: async (d: string) => (asked.push(d), room),
  };
  const fake = new FakePort();
  const runner = createRunner(core, { harness: fake, newId: () => "tsk00001", roomLookMs: 20 });
  const card = await runner.openTask({ persona: "p1", title: "全部测试和 typecheck 跑一遍", brief: "b", needs: { heavy: true } });
  expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "blocked", reason: roomReason("hel") });
  await Bun.sleep(80);
  expect(fake.specs).toHaveLength(0); // never started where there is no room
  expect(asked.every((d) => d === "local")).toBe(true);
  room = true;
  await waitFor(() => fake.specs.length === 1, "started once there was room");
  await waitFor(() => core.tasks.get(card.taskId)?.attention !== "blocked", "no longer waiting");
  await runner.dispose();
});

test("a light task never waits for room", async () => {
  (core as any).bodies = { choose: async () => ({ harness: "codex", why: { kind: "default" } }), room: async () => false };
  const fake = new FakePort();
  const runner = createRunner(core, { harness: fake, newId: () => "tsk00002", roomLookMs: 20 });
  const card = await runner.openTask({ persona: "p1", title: "回一句话", brief: "b" });
  await runner.whenStarted(card.taskId);
  expect(fake.specs).toHaveLength(1);
  await runner.dispose();
});
