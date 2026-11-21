// D297 (research/101): a turn that failed on the agent's usage limit, per agent, from the shapes each
// one really sends (VERIFIED or INFERRED as research/101 says), and what the runner does with it:
// one calm line with the reset, no nudge and no failure; the next turn resumes the same native
// session by its id, after a home restart too.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { limitHit, mergeLimits, resetFromWords, seenReset } from "../src/limit-hit.ts";
import { codexLimits, nativeUsage } from "../src/native-usage.ts";
import { Normalizer } from "../src/normalize.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

// 2026-11-17 17:40 UTC = 01:40 in Shanghai.
const NOW = Date.parse("2026-11-17T17:40:00Z");
const RESET_S = Math.floor(Date.parse("2026-11-17T19:12:00Z") / 1000); // 03:12 Shanghai

// ---------- the shapes ----------

/** Claude Code 2.1.325's stream-json: the rate_limit_event it sends before the refused request's error and the result (SDKRateLimitInfo). */
const CLAUDE_EVENT = { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: RESET_S, rateLimitType: "five_hour", overageStatus: "rejected", isUsingOverage: false }, uuid: "u1", session_id: "s1" };
/** What OAR 0.95.1 makes of the failed turn after it (claudeFailure: category rate_limit + claudeLimitReset). */
const CLAUDE_TURN = { kind: "turn_ended", outcome: { kind: "failed", failure: "quota", reason: "You've hit your limit · resets 3am (Asia/Shanghai)", status: 429, resetsAt: new Date(RESET_S * 1000).toISOString() } };
/** Codex app-server (codex-rs 2026-11-16): the snapshot it sends with the usage-limit error (session/turn.rs update_rate_limits). */
const CODEX_UPDATE = { method: "account/rateLimits/updated", params: { rateLimits: { limitId: "codex", limitName: null, primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: RESET_S }, secondary: { usedPercent: 41, windowDurationMins: 10080, resetsAt: RESET_S + 4 * 86400 }, credits: null, planType: "plus", rateLimitReachedType: "rateLimitReached" } } };
/** …and the failed turn: codexErrorInfo usageLimitExceeded is OAR's quota, with no resetsAt (codexFailure). */
const CODEX_TURN = { kind: "turn_ended", outcome: { kind: "failed", failure: "quota", reason: "You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 3:12 AM." } };
/** pi: an OpenAI-compatible provider's 429 body (failureFromErrorBody: usage_limit_reached is quota), no reset anywhere. */
const PI_TURN = { kind: "turn_ended", outcome: { kind: "failed", failure: "quota", reason: '429 {"error":{"code":"usage_limit_reached","message":"The usage limit has been reached","type":"usage_limit_reached"}}' } };
/** DeepSeek Harness: an LlmFailure code ACCOUNT_QUOTA (dshFailureClass), no reset. */
const DSH_TURN = { kind: "turn_ended", outcome: { kind: "failed", failure: "quota", reason: "Your account quota is used up", status: 429 } };
/** Claude Code throttled past its own retries (a 429 without limit headers): rate_limited, no reset. */
const CLAUDE_THROTTLE = { kind: "turn_ended", outcome: { kind: "failed", failure: "rate_limited", reason: "API Error: 429 rate_limit_error", status: 429 } };

/** The turn end as the runner logs it, through the Normalizer. */
const turnRaw = (oar: object) => new Normalizer(() => undefined).push(oar as never).at(-1)!.raw as Record<string, unknown>;

describe("each agent's limit shape", () => {
  test("Claude Code: the reset from OAR's quota resetsAt (its rate_limit_event)", () => {
    const raw = turnRaw(CLAUDE_TURN);
    expect(raw).toMatchObject({ kind: "turn_ended", outcome: "failed", failure: "quota", resetsAt: "2026-11-17T19:12:00.000Z" });
    const seen = nativeUsage("rate_limit_event", CLAUDE_EVENT)?.limits;
    expect(limitHit("claude-code", raw, seen, NOW)).toMatchObject({ harness: "claude-code", failure: "quota", resetsAt: "2026-11-17T19:12:00.000Z", source: "event" });
  });

  test("Claude Code: a reset OAR's time says already passed falls back to the session's own event, then to the words", () => {
    const raw = { ...turnRaw(CLAUDE_TURN), resetsAt: "2026-11-17T10:00:00.000Z" };
    const seen = nativeUsage("rate_limit_event", CLAUDE_EVENT)?.limits;
    expect(limitHit("claude-code", raw, seen, NOW)).toMatchObject({ resetsAt: "2026-11-17T19:12:00.000Z", source: "limits" });
    const words = limitHit("claude-code", raw, undefined, NOW);
    expect(words?.source).toBe("words");
    // 3am in Shanghai, the next one: 19:00 UTC.
    expect(words?.resetsAt).toBe("2026-11-17T19:00:00.000Z");
  });

  test("Codex: no time on the failure; the reset of the used-up window it sent just before", () => {
    const raw = turnRaw(CODEX_TURN);
    expect(raw.resetsAt).toBeUndefined();
    const seen = nativeUsage("account/rateLimits/updated", CODEX_UPDATE)?.limits;
    expect(seen?.limited).toBe(true);
    expect(seenReset(seen, NOW)).toBe("2026-11-17T19:12:00.000Z");
    expect(limitHit("codex", raw, seen, NOW)).toMatchObject({ harness: "codex", resetsAt: "2026-11-17T19:12:00.000Z", source: "limits" });
    // Without the update, its own words: "try again at 3:12 AM" in the home's local time.
    const w = limitHit("codex", raw, undefined, NOW);
    expect(w?.source).toBe("words");
    const d = new Date(w!.resetsAt!);
    expect([d.getHours(), d.getMinutes()]).toEqual([3, 12]);
  });

  test("Codex's dated words, another day", () => {
    const at = resetFromWords("You’ve hit your usage limit. Try again at Nov 20th, 2026 9:05 PM.", NOW, "Asia/Shanghai");
    expect(at).toBe("2026-11-20T13:05:00.000Z");
    expect(resetFromWords("You’ve hit your usage limit. Try again later.", NOW)).toBeUndefined();
  });

  test("Claude Code's older words: usage limit reached|<unix seconds>", () => {
    expect(resetFromWords(`Claude AI usage limit reached|${RESET_S}`, NOW)).toBe("2026-11-17T19:12:00.000Z");
    expect(resetFromWords("resets 3:30pm (America/Los_Angeles)", NOW)).toBe("2026-11-17T23:30:00.000Z");
  });

  test("pi and DeepSeek Harness: a limit with no reset said", () => {
    expect(limitHit("pi", turnRaw(PI_TURN), undefined, NOW)).toMatchObject({ harness: "pi", failure: "quota", source: "none" });
    expect(limitHit("pi", turnRaw(PI_TURN), undefined, NOW)?.resetsAt).toBeUndefined();
    expect(limitHit("deepseek-harness", turnRaw(DSH_TURN), undefined, NOW)).toMatchObject({ failure: "quota", source: "none" });
  });

  test("D449: pi on a free key, whatever OAR called it: the provider's own words carry its reset through the Normalizer", () => {
    const resetMs = Date.parse("2026-11-18T00:00:00Z");
    const body = `429 {"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${resetMs}"},"provider_name":null}}}`;
    const raw = turnRaw({ kind: "turn_ended", outcome: { kind: "failed", failure: "provider", reason: body } });
    expect(String(raw.reason)).toContain("X-RateLimit-Reset");
    expect(limitHit("pi", raw, undefined, NOW)).toMatchObject({ harness: "pi", failure: "quota", resetsAt: new Date(resetMs).toISOString(), source: "provider", free: "openrouter" });
    // Gemini's minute: a throttle until its own retry delay.
    const g = turnRaw({ kind: "turn_ended", outcome: { kind: "failed", failure: "unknown", reason: "429 You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10 (GenerateRequestsPerMinutePerProjectPerModel-FreeTier). Please retry in 20s." } });
    expect(limitHit("pi", g, undefined, NOW)).toMatchObject({ failure: "rate_limited", resetsAt: new Date(NOW + 20_000).toISOString(), free: "google" });
  });

  test("a throttle past the agent's own retries is a limit with no reset; other failures are not limits", () => {
    expect(limitHit("claude-code", turnRaw(CLAUDE_THROTTLE), undefined, NOW)).toMatchObject({ failure: "rate_limited", source: "none" });
    for (const failure of ["auth", "billing", "overloaded", "provider", "unknown"])
      expect(limitHit("claude-code", turnRaw({ kind: "turn_ended", outcome: { kind: "failed", failure, reason: "x" } }), undefined, NOW)).toBeUndefined();
    expect(limitHit("claude-code", turnRaw({ kind: "turn_ended", outcome: { kind: "completed" } }), undefined, NOW)).toBeUndefined();
  });

  test("what a session says is merged by window; allowed again clears the hit", () => {
    const hit = nativeUsage("rate_limit_event", CLAUDE_EVENT)!.limits!;
    const ok = nativeUsage("rate_limit_event", { type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "five_hour" } })!.limits!;
    expect(mergeLimits(hit, ok).limited).toBe(false);
    expect(seenReset(mergeLimits(hit, ok), NOW)).toBeUndefined();
    const both = mergeLimits(codexLimits(CODEX_UPDATE.params.rateLimits)!.limits, hit);
    expect(both.windows.map((w) => w.id)).toEqual(["codex:primary", "codex:secondary", "five_hour"]);
  });
});

// ---------- the runner ----------

class FakeSession implements HarnessSession {
  sent: string[] = [];
  canSteer = true;
  closed = false;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
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
    const s = new FakeSession(spec.resumeSessionId ?? `${spec.harness}-${this.sessions.length + 1}`);
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
  dir = mkdtempSync(join(tmpdir(), "ducter-limits-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const sys = (id: string) =>
  core.log
    .read({ stream: `task:${id}`, kinds: ["task_event"] })
    .map((e) => e.body as Bodies["task_event"])
    .filter((b) => b.role === "system");

test("the runner: one line with the reset, no nudge, not failed; the wake resumes the same session, after a restart too", async () => {
  const fake = new FakePort();
  const runner = createRunner(core, { harness: fake, newId: () => "tsklim01" });
  const card = await runner.openTask({ persona: "p1", title: "Run the WAL bench", brief: "b", harness: "claude-code" });
  await runner.whenStarted(card.taskId);
  const id = card.taskId;
  const s = fake.sessions[0]!;
  const reset = new Date(Date.now() + 90 * 60_000);
  // What OAR's claude session yields: the limits Ducter read from the rate_limit_event, then the failed turn.
  s.emit({ role: "system", limits: { windows: [{ id: "five_hour", label: "Current session", used: 1, resetsAt: reset.toISOString(), durationMs: 5 * 3_600_000 }], limited: true }, raw: { kind: "limits" } });
  s.emit({ role: "system", text: "turn failed (quota): You've hit your limit", turnEnd: true, raw: { kind: "turn_ended", outcome: "failed", failure: "quota", reason: "You've hit your limit" } });
  await waitFor(() => sys(id).some((b) => (b.raw as any)?.limit));
  const line = sys(id).find((b) => (b.raw as any)?.limit)!;
  expect((line.raw as any).limit).toMatchObject({ harness: "claude-code", failure: "quota", resetsAt: reset.toISOString(), source: "limits" });
  await new Promise((r) => setTimeout(r, 30));
  // No nudge (the stall rule is for a turn that ended without a report, not a refused one), not failed.
  expect(s.sent).toHaveLength(1); // the kickoff only
  expect(core.tasks.get(id)!.attention).not.toBe("failed");
  // The reset: core's wake goes to the same native session.
  await runner.send(id, "Claude Code's usage limit has reset. Carry on where you left off.", undefined, "partner");
  expect(fake.specs.at(-1)?.resumeSessionId ?? s.id).toBe("claude-code-1");
  await runner.dispose();
  // A home restart while it waited: the new runner resumes that session by its id.
  const again = new FakePort();
  const r2 = createRunner(core, { harness: again, newId: () => "unused" });
  await r2.send(id, "Claude Code's usage limit has reset. Carry on where you left off.", undefined, "partner");
  expect(again.specs[0]).toMatchObject({ harness: "claude-code", resumeSessionId: "claude-code-1" });
  await r2.dispose();
});
