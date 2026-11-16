// D288: a task's context and its agent's account limits, from what each harness reports (recorded
// native shapes from Claude Code 2.1.325, codex-cli 0.169.0's app-server and pi, research/94): the
// normalizer's per-turn usage and window, the sizes a compaction had before and after, the limits
// a running session says, the runner's meter lines, and 现在压缩 / Compact now routed per agent.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { Normalizer } from "../src/normalize.ts";
import { codexLimits, nativeUsage } from "../src/native-usage.ts";
import { accountUsageOf } from "../src/oar.ts";
import { createRunner, registerTaskTools, slashOf } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

describe("native frames OAR's events leave out", () => {
  test("Claude Code: compact_boundary's pre_tokens and post_tokens; a subagent's is not the task's", () => {
    const frame = { type: "system", subtype: "compact_boundary", session_id: "s", compact_metadata: { trigger: "auto", pre_tokens: 158_204, post_tokens: 31_877 } };
    expect(nativeUsage("system/compact_boundary", frame)).toEqual({ compact: { before: 158_204, after: 31_877, trigger: "auto" } });
    expect(nativeUsage("system/compact_boundary", { ...frame, compact_metadata: { trigger: "manual", pre_tokens: 90_000 } })).toEqual({ compact: { before: 90_000, trigger: "manual" } });
    expect(nativeUsage("system/compact_boundary", { ...frame, parent_tool_use_id: "toolu_1" })).toBeUndefined();
  });

  test("Claude Code: a rate_limit_event says a limit refuses until its reset; allowed says nothing is refused", () => {
    const rejected = { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1_795_000_000, rateLimitType: "seven_day_opus", overageStatus: "rejected" } };
    expect(nativeUsage("rate_limit_event", rejected)).toEqual({
      limits: { limited: true, windows: [{ id: "seven_day_opus", label: "Current week (Opus)", used: 1, resetsAt: new Date(1_795_000_000_000).toISOString(), durationMs: 168 * 3_600_000 }] },
    });
    expect(nativeUsage("rate_limit_event", { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "five_hour" } })).toEqual({ limits: { windows: [], limited: false } });
    // Paid overage takes the requests: not refused.
    expect(nativeUsage("rate_limit_event", { ...rejected, rate_limit_info: { ...rejected.rate_limit_info, overageStatus: "allowed" } })?.limits?.limited).toBe(false);
  });

  test("Codex: account/rateLimits/updated as the read's buckets (usedPercent 0..100, minutes, unix s)", () => {
    const frame = {
      method: "account/rateLimits/updated",
      params: { rateLimits: { limitId: "codex", primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1_795_003_600 }, secondary: { usedPercent: 40, windowDurationMins: 10_080, resetsAt: 1_795_500_000 }, planType: "plus", rateLimitReachedType: null } },
    };
    const n = nativeUsage("account/rateLimits/updated", frame)!;
    expect(n.limits!.plan).toBe("plus");
    expect(n.limits!.limited).toBe(false);
    expect(n.limits!.windows).toEqual([
      { id: "codex:primary", label: "Codex", used: 0.12, resetsAt: new Date(1_795_003_600_000).toISOString(), durationMs: 300 * 60_000 },
      { id: "codex:secondary", label: "Codex", used: 0.4, resetsAt: new Date(1_795_500_000_000).toISOString(), durationMs: 10_080 * 60_000 },
    ]);
    expect(codexLimits({ primary: { usedPercent: 100, windowDurationMins: 300 } })!.limits!.limited).toBe(true);
    expect(codexLimits({ primary: { usedPercent: 140 } })).toBeUndefined();
  });

  test("pi: compaction_end's result.tokensBefore", () => {
    expect(nativeUsage("compaction_end", { type: "compaction_end", reason: "threshold", result: { summary: "…", tokensBefore: 120_400 } })).toEqual({ compact: { before: 120_400, trigger: "threshold" } });
  });

  test("anything else says nothing", () => {
    expect(nativeUsage("assistant", { type: "assistant", message: {} })).toBeUndefined();
    expect(nativeUsage("x", null)).toBeUndefined();
  });
});

describe("the normalizer", () => {
  test("each turn end carries the turn alone (the totals' difference), and the window the harness read against", () => {
    let usage: HarnessEvent["usage"] = { inputTokens: 40_000, outputTokens: 1_200, cacheRead: 30_000, contextTokens: 41_200, contextWindow: 200_000 };
    const n = new Normalizer(() => usage);
    const end = () => n.push({ kind: "turn_ended", outcome: { kind: "completed" } }).find((e) => e.turnEnd)!.usage!;
    expect(end().turn).toEqual({ input: 40_000, output: 1_200, cached: 30_000 });
    usage = { inputTokens: 95_000, outputTokens: 2_000, cacheRead: 80_000, contextTokens: 56_000, contextWindow: 200_000 };
    expect(end().turn).toEqual({ input: 55_000, output: 800, cached: 50_000 });
    // A total that went down is a new session's: its first turn is the total.
    usage = { inputTokens: 5_000, outputTokens: 100, contextTokens: 5_100 };
    expect(end().turn).toEqual({ input: 5_000, output: 100 });
  });

  test("a usage reading goes out with its window as it grows", () => {
    const n = new Normalizer(() => ({ contextTokens: 61_000, contextWindow: 200_000 }));
    expect(n.push({ kind: "usage" })).toEqual([{ role: "system", usage: { contextTokens: 61_000, contextWindow: 200_000 }, raw: { kind: "usage" } }]);
    expect(n.push({ kind: "usage" })).toEqual([]); // unchanged
  });

  test("a compaction carries the sizes its native frame gave; the limits a session said are an event of their own", () => {
    const n = new Normalizer(() => undefined);
    n.native({ compact: { before: 158_204, after: 31_877, trigger: "auto" } });
    expect(n.push({ kind: "compaction_ended", outcome: "completed" })[0]!.raw).toEqual({ kind: "compaction_ended", outcome: "completed", trigger: "auto", before: 158_204, after: 31_877 });
    // Used once: the next compaction (Codex, no sizes) has none.
    expect(n.push({ kind: "compaction_ended", outcome: "completed", trigger: "auto" })[0]!.raw).toEqual({ kind: "compaction_ended", outcome: "completed", trigger: "auto" });
    const limits = { windows: [], limited: true };
    expect(n.native({ limits })).toEqual([{ role: "system", limits, raw: { kind: "limits" } }]);
  });
});

test("OAR's account snapshot as Ducter's (the reset credits left out; reauth said as signed out)", () => {
  const at = "2026-11-16T10:00:00.000Z";
  expect(
    accountUsageOf("codex", { kind: "available", plan: "plus", email: "a@b.c", rateLimited: false, windows: [{ label: "Codex · 1 week", usedRatio: 0.4, resetsAt: "2026-11-20T07:55:00.000Z", id: "codex:secondary", durationMs: 604_800_000 }], limitResets: { available: 1 } }, at),
  ).toEqual({ usage: { harness: "codex", plan: "plus", account: "a@b.c", windows: [{ label: "Codex · 1 week", used: 0.4, id: "codex:secondary", resetsAt: "2026-11-20T07:55:00.000Z", durationMs: 604_800_000 }], at } });
  expect(accountUsageOf("claude-code", { kind: "reauth_required", reason: "not_authenticated" }, at)).toEqual({ why: "signed_out" });
  expect(accountUsageOf("claude-code", { kind: "unsupported", reason: "quota_unavailable" }, at)).toEqual({ why: "unsupported" });
});

test("/compact: Ducter's on every agent but Claude Code, whose own runs as typed", () => {
  expect(slashOf("/compact", "codex")).toEqual({ cmd: "compact" });
  expect(slashOf("/compact", "pi")).toEqual({ cmd: "compact" });
  expect(slashOf("/compact", "claude-code")).toBeUndefined();
  expect(slashOf("/compact keep the API notes", "codex")).toBeUndefined();
});

// ---------- the runner ----------

class FakeSession implements HarnessSession {
  sent: string[] = [];
  busyFlag = false;
  canSteer = true;
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
  async send(text: string) {
    this.sent.push(text);
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
  async start(spec: SessionSpec) {
    const s = new FakeSession(`${spec.harness}-${this.sessions.length + 1}`, spec.harness !== "claude-code");
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
  dir = mkdtempSync(join(tmpdir(), "ducter-context-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const events = (id: string) =>
  core.log
    .read({ stream: `task:${id}`, kinds: ["task_event"] })
    .map((e) => e.body as Bodies["task_event"]);
const raws = (id: string, kind: string) => events(id).map((b) => b.raw as Record<string, unknown> | undefined).filter((r) => r?.kind === kind);

async function open(harness = "codex") {
  const fake = new FakePort();
  const ids = ["tsk00001"];
  const runner = createRunner(core, { harness: fake, newId: () => ids.shift()! });
  const card = await runner.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness });
  await runner.whenStarted(card.taskId);
  return { runner, fake, id: card.taskId, s: fake.sessions[0]! };
}

describe("the runner", () => {
  test("logs the meter's readings as the context moves, a compaction's size before and the first reading after", async () => {
    const { runner, id, s } = await open("codex");
    const usage = (n: number) => s.emit({ role: "system", usage: { contextTokens: n, contextWindow: 200_000 }, raw: { kind: "usage" } });
    usage(20_000);
    usage(24_000); // under 5% of the window: not logged
    usage(40_000);
    await waitFor(() => raws(id, "context").length === 2, "two readings");
    expect(raws(id, "context").map((r) => r.contextTokens)).toEqual([20_000, 40_000]);
    expect(raws(id, "context")[0]).toEqual({ kind: "context", contextTokens: 20_000, contextWindow: 200_000, compactAt: 160_000 });
    usage(150_000);
    s.emit({ role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "auto" } });
    usage(30_500);
    await waitFor(() => raws(id, "context").some((r) => r.after), "the reading after");
    const c = raws(id, "compaction_ended")[0]!;
    expect(c).toMatchObject({ before: 150_000, contextWindow: 200_000, compactAt: 160_000, compactions: 1 });
    expect(raws(id, "context").at(-1)).toEqual({ kind: "context", contextTokens: 30_500, contextWindow: 200_000, compactAt: 160_000, after: true });
    // The turn end carries the window and the compaction point with its usage.
    s.emit({ role: "system", text: "turn completed", turnEnd: true, usage: { inputTokens: 900, outputTokens: 40, contextTokens: 31_000, turn: { input: 900, output: 40 } }, raw: { kind: "turn_ended", outcome: "completed" } });
    await waitFor(() => events(id).some((b) => b.usage?.turn), "turn end");
    expect(events(id).find((b) => b.usage?.turn)!.usage).toMatchObject({ contextWindow: 200_000, compactAt: 160_000, turn: { input: 900, output: 40 } });
    await runner.dispose();
  });

  test("Claude Code's own sizes win, and nothing more is owed after", async () => {
    const { runner, id, s } = await open("claude-code");
    s.emit({ role: "system", usage: { contextTokens: 120_000 }, raw: { kind: "usage" } });
    s.emit({ role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "manual", before: 158_204, after: 31_877 } });
    s.emit({ role: "system", usage: { contextTokens: 33_000 }, raw: { kind: "usage" } });
    await waitFor(() => raws(id, "compaction_ended").length, "compaction");
    await Bun.sleep(30);
    expect(raws(id, "compaction_ended")[0]).toMatchObject({ before: 158_204, after: 31_877 });
    expect(raws(id, "context").some((r) => r.after)).toBe(false);
    await runner.dispose();
  });

  test("the limits a session says go to the home's account book, never the Log", async () => {
    const seen: [string, unknown][] = [];
    core.limits = { seen: (h, l) => void seen.push([h, l]) };
    const { runner, id, s } = await open("codex");
    const limits = { windows: [{ id: "codex:primary", label: "Codex", used: 0.5 }], limited: false };
    s.emit({ role: "system", limits, raw: { kind: "limits" } });
    await waitFor(() => seen.length, "limits");
    expect(seen).toEqual([["codex", limits]]);
    expect(raws(id, "limits")).toEqual([]);
    await runner.dispose();
  });

  test("现在压缩 / Compact now: at once when idle, after the turn mid-turn; Claude Code gets /compact as typed", async () => {
    const pi = await open("pi");
    await pi.runner.send(pi.id, "/compact", undefined, "user");
    expect(pi.s.compacted).toBe(1);
    pi.s.busyFlag = true;
    await pi.runner.send(pi.id, "/compact", undefined, "user");
    expect(pi.s.compacted).toBe(1);
    pi.s.busyFlag = false;
    pi.s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    await waitFor(() => pi.s.compacted === 2, "compacted after the turn");
    await pi.runner.dispose();
    const cc = await open("claude-code");
    await cc.runner.send(cc.id, "/compact", undefined, "user");
    expect(cc.s.sent.at(-1)).toBe("/compact");
    await cc.runner.dispose();
  });

  test("Compact now on a finished Claude Code task: no nudge, it stays done, the brief again waits for the next words (research/108)", async () => {
    const { runner, id, s } = await open("claude-code");
    await core.call("report_to_main", { state: "done", summary: "fixed", evidence: [{ kind: "test", label: "t", ref: "1 pass" }] }, id);
    s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    const was = await waitFor(() => { const a = core.tasks.get(id)?.attention; return a === "done" || a === "done_claimed" ? a : undefined; }, "done");
    await runner.send(id, "/compact", undefined, "user", "c1");
    expect(s.sent.at(-1)).toBe("/compact");
    expect(core.tasks.get(id)?.attention).toBe(was);
    s.busyFlag = true;
    s.emit({ role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "manual", before: 39_332, after: 11_144 } });
    await waitFor(() => raws(id, "compaction_ended").length, "compaction");
    await Bun.sleep(20);
    s.busyFlag = false;
    s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    await Bun.sleep(50);
    // Nothing steered into the compacting turn, no "Report status" after it, and still done.
    expect(s.sent).toEqual([s.sent[0]!, "/compact"]);
    expect(core.tasks.get(id)?.attention).toBe(was);
    // The person's next words carry the brief again.
    await runner.send(id, "one more thing", undefined, "user", "c2");
    await waitFor(() => s.sent.length === 3, "next turn");
    expect(s.sent[2]).toContain("Your context was just compacted");
    expect(s.sent[2]).toContain("one more thing");
    await runner.dispose();
  });

  test("Compact now on a parked Claude Code task resumes it for the /compact alone; what waits stays for the next words", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: () => "tsk00002", parkIdleMs: 20 });
    const card = await runner.openTask({ persona: "p1", title: "Fix CI", brief: "b", harness: "claude-code" });
    await runner.whenStarted(card.taskId);
    const id = card.taskId;
    const s = fake.sessions[0]!;
    await core.call("report_to_main", { state: "done", summary: "fixed", evidence: [{ kind: "test", label: "t", ref: "1 pass" }] }, id);
    s.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    const was = await waitFor(() => { const a = core.tasks.get(id)?.attention; return a === "done" || a === "done_claimed" ? a : undefined; }, "done");
    await waitFor(() => core.tasks.get(id)?.residency === "parked", "parked");
    await runner.send(id, "/compact", undefined, "user", "c1");
    const again = await waitFor(() => fake.sessions[1], "resumed");
    expect(again.sent).toEqual(["/compact"]);
    expect(core.tasks.get(id)?.attention).toBe(was);
    again.emit({ role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } });
    await Bun.sleep(50);
    expect(again.sent).toEqual(["/compact"]); // no "Report status" after it
    expect(core.tasks.get(id)?.attention).toBe(was);
    await runner.dispose();
  });
});
