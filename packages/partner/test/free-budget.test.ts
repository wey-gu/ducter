// D449: the partner on a free OpenRouter key. Fakes only: a fake pi whose turns answer (with tool
// calls) until the day's cap, then fail with OpenRouter's own 429 body (free-models-per-day, its
// X-RateLimit-* headers repeated in metadata; OAR doesn't call it a limit), core's real hold and
// the real free-key book on a fake clock. The partner's turns are counted; the cap's line names
// OpenRouter, the provider's own reset and the paid way, never "pi" or an hour; what is sent
// meanwhile is answered at that reset, in order.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBrainHold } from "../../core/src/brain-hold.ts";
import { FakeClock } from "../../core/src/clock.ts";
import { createFreeBudget } from "../../core/src/free-budget.ts";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { clockWords } from "../src/words.ts";
import { FakeClock as PartnerClock, fakeCore, fakeMemory, fakeRunner, type FakeSession } from "./fakes.ts";

const START = Date.parse("2026-11-21T11:30:00Z");
const RESET_MS = Date.parse("2026-11-22T00:00:00Z");
const RESET = new Date(RESET_MS).toISOString();
const OR_DAY = `429 {"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${RESET_MS}"},"provider_name":null}}}`;

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const partnerSaid = (events: LogEvent[]) => events.filter((e) => e.stream === "channel" && e.origin === "partner" && e.kind === "ai_msg").map((e) => e.body as Bodies["ai_msg"]);
const settle = async (p: { idle(): Promise<void> }) => {
  for (let i = 0; i < 5; i++) {
    await p.idle();
    await Bun.sleep(5);
  }
};

function world(lang: "zh" | "en") {
  const clock = new FakeClock(START);
  const dir = mkdtempSync(join(tmpdir(), "ducter-free-budget-"));
  const fc = fakeCore(new PartnerClock(), dir);
  const state = { out: false, ran: 0 };
  const fr = fakeRunner(async (input: string, s: FakeSession) => {
    state.ran++;
    if (state.out) {
      // pi passes the provider's body through; OAR classes it as a provider error, not a quota.
      s.emit({ role: "system", text: `turn failed (provider_error): ${OR_DAY.slice(0, 80)}`, turnEnd: true, raw: { kind: "turn_ended", outcome: "failed", failure: "provider_error", reason: OR_DAY } });
      return;
    }
    // Two tool calls, then the answer: three requests on the key.
    s.emit({ role: "tool", tool: { name: "memory_search", input: {}, output: "[]", ok: true } });
    s.emit({ role: "tool", tool: { name: "log_search", input: {}, output: "[]", ok: true } });
    const lines = [...input.matchAll(/\[user\] ([^\n]+)/g)].map((m) => m[1]!);
    s.say(`答：${lines.join(" / ")}`);
    s.end();
  });
  const budget = createFreeBudget({ dataDir: dir, clock, log: fc.core.log, brain: () => ({ harness: "pi", model: "openrouter/google/gemma-4-31b-it:free" }), lang: () => lang });
  budget.mark("openrouter", true);
  const hold = createBrainHold({ log: fc.core.log, clock, base: () => "pi", home: () => [{ harness: "pi", loggedIn: true }] });
  fc.core.brainHold = hold;
  fc.core.freeBudget = budget;
  // The partner thinks with pi on the free model (as the home sets it from the pasted key).
  fc.core.partnerFallback = () => ({ harness: "pi", model: "openrouter/google/gemma-4-31b-it:free" });
  const partner = createPartner(fc.core, fr.runner, { now: () => clock.now(), persistState: false, prewarm: false, settleMs: 0, onError: () => {}, memory: fakeMemory().memory, bridge: null, harness: undefined });
  stops.push(() => partner.close(), () => hold.stop(), () => budget.stop());
  const user = (text: string) => {
    const e = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
    partner.onTrigger(e);
    return e;
  };
  return { clock, fc, fr, state, budget, hold, partner, user };
}

test("a free OpenRouter key: turns counted; the day's cap said with OpenRouter's own reset; messages answered then, in order", async () => {
  const w = world("zh");
  w.user("帮我看看今天的日程");
  await settle(w.partner);
  // One turn: one request and two tool calls.
  expect(w.budget.view()).toMatchObject({ provider: "openrouter", limit: 50, left: 47 });
  // The cap: the next turn fails with OpenRouter's 429.
  w.state.out = true;
  const m2 = w.user("明天下午有空吗？");
  await settle(w.partner);
  const m3 = w.user("还有，周五呢？");
  await settle(w.partner);
  expect(w.state.ran).toBe(2); // the third message didn't even start a turn
  const said = partnerSaid(w.fc.events);
  expect(said).toHaveLength(2);
  const at = clockWords("zh", RESET, START);
  const line = said[1]!.text;
  expect(line).toStartWith("OpenRouter 的免费额度今天用完了，");
  expect(line).toContain(at);
  expect(line).toContain("充 $10 就能多很多");
  expect(line).not.toMatch(/\bpi\b|小时/);
  expect(w.hold.now()).toMatchObject({ from: "pi", why: "quota", until: RESET, resetKnown: true, waits: true, free: "openrouter" });
  // Settings › Partner reads the same day.
  expect(w.budget.view()).toEqual({ provider: "openrouter", limit: 50, left: 0, resetsAt: RESET, out: true });
  // An hour later (what D435 guessed before): still waiting, nothing tried.
  w.clock.advance(60 * 60_000);
  await settle(w.partner);
  expect(w.state.ran).toBe(2);
  // OpenRouter's day comes: both waiting messages are answered in one turn, the first first.
  w.state.out = false;
  w.clock.advance(RESET_MS - w.clock.now() + 61_000);
  await settle(w.partner);
  expect(w.state.ran).toBe(3);
  const answers = partnerSaid(w.fc.events).slice(2);
  expect(answers).toHaveLength(1);
  expect(answers[0]!.replyTo).toBe(m3.seq);
  const input = w.fr.sessions.at(-1)!.inputs.at(-1)!;
  expect(input.indexOf("明天下午有空吗？")).toBeLessThan(input.indexOf("还有，周五呢？"));
  expect(m2.seq).toBeLessThan(m3.seq);
  expect(w.hold.now()).toBeUndefined();
  expect(w.budget.view()).toMatchObject({ left: 47, resetsAt: "2026-11-23T00:00:00.000Z" });
  expect(w.budget.view()?.out).toBeUndefined();
});

test("in English: the provider's name, its reset and the paid way", async () => {
  const w = world("en");
  w.state.out = true;
  w.user("What's on today?");
  await settle(w.partner);
  const line = partnerSaid(w.fc.events)[0]!.text;
  expect(line).toBe(`OpenRouter's free allowance is used up for today. It's back at ${clockWords("en", RESET, START)}; if you'd rather not wait, $10 of credit lifts it a lot. I'll answer anything you send meanwhile then, in order.`);
});
