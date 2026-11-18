// D299: a session the person ran in their own agent outside Ducter, carried on as a task. Its
// conversation becomes the task's history; the same agent resumes that very session by its id in
// its own folder (no copy, nothing provisioned there); another agent starts there from what the
// session said (D282's condensed start); a resume the agent refuses falls back to the same.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { blocksOf } from "@ducter/protocol/src/transcript.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { ADOPTED } from "../src/brief.ts";
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
  sessions: FakeSession[] = [];
  specs: SessionSpec[] = [];
  /** Session ids the agent no longer has: resuming one throws, as OAR's SessionNotFoundError does. */
  missing = new Set<string>();
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    if (spec.resumeSessionId && this.missing.has(spec.resumeSessionId)) throw new Error(`session ${spec.resumeSessionId} not found`);
    const s = new FakeSession(spec.resumeSessionId ?? `${spec.harness}-new-${this.sessions.length + 1}`);
    this.sessions.push(s);
    return s;
  }
  async available() {
    return [];
  }
}

let dir: string;
let folder: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-adopt-test-"));
  folder = join(dir, "hawdb");
  mkdirSync(folder, { recursive: true });
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const TURNS = [
  { role: "user" as const, text: "Why is TestRaftSnapshot flaky?", at: "2026-11-12T09:00:00.000Z" },
  { role: "assistant" as const, text: "The snapshot timer races the leader step-down.", at: "2026-11-12T09:01:00.000Z" },
  { role: "user" as const, text: "Add a fence and a test for it.", at: "2026-11-12T09:05:00.000Z" },
  { role: "assistant" as const, text: "Added the fence in snapshot.go; the new test passes 200 runs.", at: "2026-11-12T09:20:00.000Z" },
];

async function adopt(harness: string, fake = new FakePort(), ask?: string) {
  const runner = createRunner(core, { harness: fake, newId: () => "tsk00001" });
  const card = await runner.openTask({
    persona: "p1",
    title: "Why is TestRaftSnapshot flaky?",
    brief: "Carried on from a Claude Code session.",
    place: { kind: "folder", device: "local", path: folder },
    project: "hawdb",
    harness,
    origin: "you",
    adopt: { agent: "claude-code", sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f", startedAt: "2026-11-12T09:00:00.000Z", turns: TURNS, ...(ask ? { ask } : {}) },
  });
  await runner.whenStarted(card.taskId);
  return { fake, runner, card };
}

const events = () => core.log.read({ stream: "task:tsk00001", kinds: ["task_event"] }).map((e) => ({ ...(e.body as Bodies["task_event"]), seq: e.seq }));

describe("carrying on an outside session", () => {
  test("the same agent resumes that very session in its own folder; its turns are the task's history", async () => {
    const { fake, card } = await adopt("claude-code");
    expect(fake.specs).toHaveLength(1);
    expect(fake.specs[0]).toMatchObject({ harness: "claude-code", cwd: folder, resumeSessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f" });
    await waitFor(() => fake.sessions[0]!.sent.length === 1);
    expect(fake.sessions[0]!.sent[0]!.startsWith(ADOPTED)).toBe(true);
    expect(fake.sessions[0]!.sent[0]).toContain(`It began in Claude Code on 2026-11-12, in ${folder}; this is that same session`);
    const open = core.log.read({ kinds: ["task_open"] }).at(-1)!.body as Bodies["task_open"];
    expect(open.outside).toEqual({ agent: "claude-code", sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f", startedAt: "2026-11-12T09:00:00.000Z" });
    expect(card.place).toEqual({ kind: "folder", device: "local", path: folder });
    // The transcript: a hairline saying where it began, the earlier turns, then Ducter's own line.
    const evs = core.log.read({ stream: "task:tsk00001", kinds: ["task_event"] });
    const blocks = blocksOf("claude-code", evs as never, false);
    const kinds = blocks.map((b) => (b.k === "note" ? `note:${b.say}` : b.k === "told" ? `told:${b.say}` : b.k));
    expect(kinds).toEqual(["note:earlier", "you", "voice", "you", "voice", "told:adopted"]);
    const earlier = blocks[0] as Extract<(typeof blocks)[number], { k: "note" }>;
    expect(earlier).toMatchObject({ name: "Claude Code", at: "2026-11-12T09:00:00.000Z" });
    // No copy of the person's folder was kept: they worked there directly.
    expect(events().some((b) => (b.raw as { folder?: { direct?: boolean } })?.folder?.direct)).toBe(true);
  });

  test("D376: carried on from the conversation, the person's next words go with its first turn", async () => {
    const { fake } = await adopt("claude-code", new FakePort(), "Add the missing tests too.");
    await waitFor(() => fake.sessions[0]!.sent.length === 1);
    const first = fake.sessions[0]!.sent[0]!;
    expect(first.startsWith(ADOPTED)).toBe(true);
    expect(first.endsWith("The latest message for you:\nAdd the missing tests too.")).toBe(true);
    const blocks = blocksOf("claude-code", core.log.read({ stream: "task:tsk00001", kinds: ["task_event"] }) as never, false);
    // Ducter's hairline (picked up in Ducter), then the ask as Ducter's words to it.
    expect(blocks.at(-2)).toMatchObject({ k: "told", say: "adopted" });
    expect(blocks.at(-1)).toMatchObject({ k: "partner" });
    expect(JSON.stringify(blocks.at(-1))).toContain("Add the missing tests too.");
  });

  test("another agent starts there from what the session said, never resuming it", async () => {
    const { fake } = await adopt("codex");
    expect(fake.specs[0]).toMatchObject({ harness: "codex", cwd: folder });
    expect(fake.specs[0]!.resumeSessionId).toBeUndefined();
    await waitFor(() => fake.sessions[0]!.sent.length === 1);
    const first = fake.sessions[0]!.sent[0]!;
    expect(first.startsWith(ADOPTED)).toBe(true);
    expect(first).toContain("This work began in Claude Code");
    expect(first).toContain("Add a fence and a test for it.");
    expect(first).toContain("The last thing it said: Added the fence in snapshot.go");
    expect(events().some((b) => (b.raw as { switched?: unknown })?.switched)).toBe(true);
  });

  test("a session the agent no longer has: a new one there, from what it said", async () => {
    const fake = new FakePort();
    fake.missing.add("942ecde2-b387-45c2-bbc6-75da83748a7f");
    const { fake: f } = await adopt("claude-code", fake);
    expect(f.specs.map((s) => s.resumeSessionId)).toEqual(["942ecde2-b387-45c2-bbc6-75da83748a7f", undefined]);
    await waitFor(() => f.sessions[0]!.sent.length === 1);
    expect(f.sessions[0]!.sent[0]).toContain("The last thing it said: Added the fence");
    expect(events().some((b) => (b.raw as { fresh?: string })?.fresh === "resume_rejected")).toBe(true);
  });

  test("after a restart the task resumes the same session by its id", async () => {
    const { fake } = await adopt("claude-code");
    await waitFor(() => fake.sessions[0]!.sent.length === 1);
    const again = new FakePort();
    const runner2 = createRunner(core, { harness: again, newId: () => "tsk00002" });
    await runner2.send("tsk00001", "and push it", undefined, "user");
    expect(again.specs[0]).toMatchObject({ resumeSessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f", cwd: folder });
  });
});
