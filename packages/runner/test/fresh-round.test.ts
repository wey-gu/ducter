// D394: a task's own round starts in a fresh session once its last session compacted (research/158).
// Seen live: one Codex review session ran a 45-minute routine for days, compacting dozens of
// times a day. The fake models what a round costs: the agent reads its whole session each turn
// (the brief, every earlier round's tool output), and compacts at 160k down to a 30k summary.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

const BRIEF_TOKENS = 4_000; // the task's system prompt and brief
const ROUND_TOKENS = 28_000; // one review round's tool output (GitHub search, PR heads, CI, diffs)
const COMPACT_AT = 160_000;
const SUMMARY_TOKENS = 30_000;
const tokensOf = (s: string) => Math.ceil(s.length / 4);

let core: FakeCore;
let waitMinutes = 45;
const rounds: { session: string; read: number }[] = [];

class FakeSession implements HarnessSession {
  canSteer = true;
  context = BRIEF_TOKENS;
  sent: string[] = [];
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  constructor(readonly id: string, readonly taskId: () => string) {}
  busy() {
    return false;
  }
  async send(text: string) {
    this.sent.push(text);
    // What this turn reads: everything the session holds, plus the new words.
    this.context += tokensOf(text);
    rounds.push({ session: this.id, read: this.context });
    this.context += ROUND_TOKENS;
    if (this.context > COMPACT_AT) {
      this.emit({ role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "auto", before: this.context, after: SUMMARY_TOKENS } });
      this.context = SUMMARY_TOKENS;
    }
    // Nothing new this round: it saves where it stands (about 1.5k tokens, as the live task's
    // checkpoints were), arms the next one and ends its turn (no report owed).
    const id = this.taskId();
    await core.call("checkpoint", { text: `Round ${rounds.length}: 8 requests wait; 10287, 10473 and 10419 reviewed at their new heads, 5 unchanged. `.repeat(60) }, id);
    core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_${rounds.length}`, taskId: id, wakes: "task", at: new Date(Date.now() + waitMinutes * 60_000).toISOString(), reason: "再看一轮评审", state: "armed" } });
    this.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
  }
  async interrupt() {}
  async close() {
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
  constructor(readonly taskId: () => string) {}
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    const s = new FakeSession(`s${this.sessions.length + 1}`, this.taskId);
    this.sessions.push(s);
    return s;
  }
  async available(): Promise<never> {
    throw new Error("forbidden");
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-fresh-round-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  rounds.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const turnEnds = (id: string) => core.log.read({ stream: `task:${id}`, kinds: ["task_event"] }).filter((e) => (e.body as Bodies["task_event"]).raw && ((e.body as Bodies["task_event"]).raw as { turnEnd?: boolean }).turnEnd).length;

/** Twelve rounds of a review every 45 minutes, each woken by its own timer as core does it. */
async function run(freshRounds: boolean, harness = "codex", every = 45) {
  let id = "";
  waitMinutes = every;
  const port = new FakePort(() => id);
  const runner = createRunner(core, { harness: port, newId: () => "tskround1", freshRounds, parkIdleMs: 0 });
  const card = await runner.openTask({ persona: "p1", title: "看 nowledge-co 的评审请求", brief: "每 45 分钟看一次 nowledge-co 里请我 review 的 PR。", harness } as never);
  id = card.taskId;
  await runner.whenStarted(id);
  for (let i = 1; i < 12; i++) {
    await waitFor(() => turnEnds(id) === i, `round ${i} ended`);
    const armed = core.log.read({ kinds: ["waiter"] }).at(-1)!.body as Bodies["waiter"];
    core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { ...armed, state: "fired" } });
    await runner.send(id, "到时间了：「再看一轮评审」。接着做。", undefined, "partner");
  }
  await waitFor(() => turnEnds(id) === 12, "round 12 ended");
  await runner.dispose();
  return { port, id, reads: rounds.map((r) => r.read), sessions: new Set(rounds.map((r) => r.session)).size };
}

describe("D394: a round after a long rest or a compaction starts afresh", () => {
  test("tokens read per round, before and after (the fake's model of a review round)", async () => {
    const before = await run(false);
    rounds.length = 0;
    core = createFakeCore(join(dir, "data2"));
    registerTaskTools(core);
    const after = await run(true);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const max = (xs: number[]) => Math.max(...xs);
    console.log(`[fresh-round] before: ${sum(before.reads)} read over 12 rounds, max ${max(before.reads)}, 1 session; after: ${sum(after.reads)}, max ${max(after.reads)}, ${after.sessions} sessions`);
    expect(before.sessions).toBe(1);
    expect(after.sessions).toBeGreaterThan(1);
    // A fresh round reads the brief and its latest progress, never a summary of days of rounds.
    expect(sum(after.reads)).toBeLessThan(sum(before.reads) * 0.8);
    expect(max(after.reads)).toBeLessThanOrEqual(max(before.reads));
    // The fresh session's first turn says what it is, and is not "couldn't be resumed".
    const firsts = after.port.sessions.slice(1).map((x) => x.sent[0] ?? "");
    expect(firsts.length).toBe(after.sessions - 1);
    expect(firsts.every((x) => x.includes("This is the next round of work that repeats") && !x.includes("couldn't be resumed"))).toBe(true);
    // Only the latest progress goes with it, never every round's.
    expect(firsts.at(-1)!.split("Round ").length - 1).toBeLessThanOrEqual(6 * 60);
    expect(core.log.read({ stream: `task:${after.id}`, kinds: ["task_event"] }).some((e) => ((e.body as Bodies["task_event"]).raw as { fresh?: string } | undefined)?.fresh === "round")).toBe(true);
  });

  test("pi keeps its one session", async () => {
    const pi = await run(true, "pi");
    expect(pi.sessions).toBe(1);
  });

  test("a short wait (CI in 5 minutes) keeps its session until it compacts", async () => {
    const short = await run(true, "codex", 5);
    // Twelve rounds over one compaction: the round after it starts afresh, the others resume.
    expect(short.sessions).toBe(2);
  });
});
