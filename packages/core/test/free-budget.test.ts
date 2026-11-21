// D449: a free key's day (protocol free-budget.ts, core free-budget.ts). Fakes only: the providers'
// limit answers as their bodies say them (OpenRouter's free-models-per-day with its X-RateLimit-*
// headers repeated in metadata, Gemini's RESOURCE_EXHAUSTED with a PerDay quota and a retry delay),
// a fake clock and a real Log. Never a real key.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { freeDayReset, readFreeLimit } from "@ducter/protocol/src/free-budget.ts";
import { limitHit as limitHitDirect } from "@ducter/protocol/src/limit-hit.ts";
import type { Bodies } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createFreeBudget, lookOffWords } from "../src/free-budget.ts";
import { openLog } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

// 2026-11-21 10:00 UTC (18:00 in Shanghai).
const NOW = Date.parse("2026-11-21T10:00:00Z");
const OR_RESET_MS = Date.parse("2026-11-22T00:00:00Z");
/** OpenRouter's 429 for the day's free cap, as pi passes it through (the body, headers in metadata). */
const OR_DAY = `429 {"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${OR_RESET_MS}"},"provider_name":null}},"user_id":"user_fake"}`;
const OR_DAY_BARE = "429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day";
const OR_MIN = `429 {"error":{"message":"Rate limit exceeded: free-models-per-min.","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"20","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${NOW + 40_000}"}}}}`;
/** Gemini's free tier, out for the day (its quota id names PerDay) and for the minute. */
const G_DAY = `429 {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 250, model: gemini-3.8-flash","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"250"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"50823s"}]}}`;
const G_MIN = `429 You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-3.8-flash (GenerateRequestsPerMinutePerProjectPerModel-FreeTier). Please retry in 37.5s.`;

test("the providers' own words: OpenRouter's day with its header, its day without one, its minute; Gemini's day and minute", () => {
  expect(readFreeLimit(OR_DAY, NOW)).toEqual({ provider: "openrouter", scope: "day", resetsAt: new Date(OR_RESET_MS).toISOString(), limit: 50, left: 0, source: "header" });
  // No header passed through: the provider's documented day (UTC midnight).
  expect(readFreeLimit(OR_DAY_BARE, NOW)).toEqual({ provider: "openrouter", scope: "day", resetsAt: "2026-11-22T00:00:00.000Z", source: "documented" });
  expect(readFreeLimit(OR_MIN, NOW)).toMatchObject({ provider: "openrouter", scope: "minute", resetsAt: new Date(NOW + 40_000).toISOString() });
  // Gemini's day starts at midnight Pacific (08:00 UTC in November), never "in an hour".
  expect(readFreeLimit(G_DAY, NOW)).toEqual({ provider: "google", scope: "day", resetsAt: "2026-11-22T08:00:00.000Z", limit: 250, left: 0, source: "documented" });
  expect(readFreeLimit(G_MIN, NOW)).toEqual({ provider: "google", scope: "minute", resetsAt: new Date(NOW + 37_500).toISOString(), limit: 10, source: "header" });
  expect(readFreeLimit("429 Too Many Requests", NOW)).toBeUndefined();
  expect(readFreeLimit("You've hit your limit · resets 8:53pm (Asia/Shanghai)", NOW)).toBeUndefined();
  expect(freeDayReset("google", Date.parse("2026-07-01T10:00:00Z"))).toBe("2026-07-02T07:00:00.000Z"); // daylight time
});

test("a failed pi turn with the provider's words is a limit with its true reset, whatever OAR called it", () => {
  const hit = limitHitDirect("pi", { outcome: "failed", failure: "unknown", reason: OR_DAY }, undefined, NOW);
  expect(hit).toMatchObject({ harness: "pi", failure: "quota", resetsAt: new Date(OR_RESET_MS).toISOString(), source: "provider", free: "openrouter" });
  expect(limitHitDirect("pi", { outcome: "failed", failure: "rate_limited", reason: G_MIN }, undefined, NOW)).toMatchObject({ failure: "rate_limited", source: "provider", free: "google" });
  // Not a free tier's words, not a limit: as before.
  expect(limitHitDirect("pi", { outcome: "failed", failure: "unknown", reason: "boom" }, undefined, NOW)).toBeUndefined();
});

function book(o: { model?: string; harness?: string } = {}) {
  const t = tempDir();
  const clock = new FakeClock(NOW);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
  const brain = { harness: o.harness ?? "pi", model: o.model ?? "openrouter/google/gemma-4-31b-it:free" };
  const tasks = new Map<string, string>([["t1", "pi"], ["t2", "claude-code"]]);
  const lang = { v: "zh-CN" };
  const b = createFreeBudget({ dataDir: t.dir, clock, log, brain: () => brain, taskHarness: (id) => tasks.get(id), lang: () => lang.v });
  let changes = 0;
  b.onChange(() => changes++);
  stops.push(() => b.stop(), () => log.close?.(), t.cleanup);
  return { b, clock, log, brain, dir: t.dir, lang, changes: () => changes };
}

test("on a free OpenRouter key: the day's cap, counted from the partner's turns and the task's calls, true to the provider's word", () => {
  const { b, clock, log, dir } = book();
  expect(b.view()).toBeUndefined(); // no key marked yet: nothing to pace
  b.mark("openrouter", true);
  expect(b.provider()).toBe("openrouter");
  expect(b.frugal("pi")).toBe(true);
  expect(b.frugal("claude-code")).toBe(false);
  expect(b.view()).toEqual({ provider: "openrouter", limit: 50, left: 50, resetsAt: "2026-11-22T00:00:00.000Z" });
  // A partner turn with two tool calls: three requests.
  b.spend("pi", 3);
  // A task on pi: a finished tool call and its turn's end; a task on Claude Code spends nothing.
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "Bash", input: {}, output: "ok", ok: true } } });
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "Bash", input: { title: "x" } } } }); // a call's title, not a request
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "system", text: "turn completed", raw: { turnEnd: true, kind: "turn_ended", outcome: "completed" } } });
  log.append({ stream: "task:t2", origin: "task", kind: "task_event", body: { taskId: "t2", role: "tool", tool: { name: "Bash", output: "ok", ok: true } } });
  expect(b.view()?.left).toBe(45);
  expect(b.low()).toBe(false);
  b.spend("pi", 36);
  expect(b.view()?.left).toBe(9);
  expect(b.low()).toBe(true);
  // The task's turn fails on the day's cap: the runner logs the limit; the day is out until the provider's reset.
  const hit = limitHitDirect("pi", { outcome: "failed", failure: "unknown", reason: OR_DAY }, undefined, clock.now())!;
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "system", from: "runner", text: "usage limit: pi", raw: { limit: hit } } });
  expect(b.view()).toEqual({ provider: "openrouter", limit: 50, left: 0, resetsAt: new Date(OR_RESET_MS).toISOString(), out: true });
  // Kept across a restart (no key, no words in the file).
  const kept = readFileSync(join(dir, "free-budget.json"), "utf8");
  expect(kept).not.toContain("sk-");
  expect(JSON.parse(kept).keys).toEqual({ openrouter: true });
  // The provider's day comes: the count starts again.
  clock.advance(OR_RESET_MS - clock.now() + 1000);
  expect(b.view()).toEqual({ provider: "openrouter", limit: 50, left: 50, resetsAt: "2026-11-23T00:00:00.000Z" });
  // A paid key for the same provider ends the pacing.
  b.mark("openrouter", false);
  expect(b.view()).toBeUndefined();
  expect(b.frugal("pi")).toBe(false);
});

test("the provider's own X-RateLimit-Remaining sets the count right", () => {
  const { b } = book();
  b.mark("openrouter", true);
  b.spend("pi", 5);
  b.limited({ provider: "openrouter", scope: "minute", resetsAt: new Date(NOW + 30_000).toISOString(), left: 12, source: "header" });
  expect(b.view()?.left).toBe(12);
  b.spend("pi", 2);
  expect(b.view()?.left).toBe(10);
  expect(b.view()?.out).toBeUndefined(); // a minute's throttle is not the day
});

test("a Gemini key: no documented cap until the provider says one; its day at midnight Pacific", () => {
  const { b, log } = book({ model: "google/gemini-3.8-flash" });
  b.mark("google", true);
  expect(b.view()).toEqual({ provider: "google", resetsAt: "2026-11-22T08:00:00.000Z" });
  b.limited(readFreeLimit(G_DAY, NOW)!);
  expect(b.view()).toEqual({ provider: "google", limit: 250, left: 0, resetsAt: "2026-11-22T08:00:00.000Z", out: true });
  // The partner's own hold names it too (the brain_held record), and is read once.
  log.append({ stream: "partner", origin: "system", kind: "partner_session", body: { event: "brain_held", harness: "pi", held: { why: "quota", until: "2026-11-22T08:00:00.000Z", resetKnown: true, since: new Date(NOW).toISOString(), free: "google" } } as Bodies["partner_session"] });
  expect(b.view()?.out).toBe(true);
});

test("the partner on Claude Code with tasks on the one free pi key: still paced; with two keys and no model named: not guessed", () => {
  const { b, brain } = book({ harness: "claude-code", model: "opus" });
  b.mark("openrouter", true);
  expect(b.frugal("pi")).toBe(true);
  b.mark("google", false);
  expect(b.frugal("pi")).toBe(false);
  brain.harness = "pi";
  brain.model = "openrouter/google/gemma-4-31b-it:free";
  expect(b.frugal("pi")).toBe(true);
});

test("a skipped look is said once, right after the partner's next words, never again", () => {
  const { b, log, lang } = book();
  b.mark("openrouter", true);
  expect(b.lookSkipped()).toBe(true);
  expect(b.lookSkipped()).toBe(false);
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "做好了：安装目录现在可以用 DUCTER_BIN 改了。" } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "还有别的吗？" } });
  const said = log.read({ stream: "channel", kinds: ["ai_msg"], beforeSeq: log.head() + 1, limit: 10 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said).toEqual(["做好了：安装目录现在可以用 DUCTER_BIN 改了。", lookOffWords(lang.v), "还有别的吗？"]);
  expect(lookOffWords("en")).toBe("I didn't have another AI look this one over: the free allowance is kept for your own asks.");
});

test("no free key, no file read or written", () => {
  const { b, dir } = book({ harness: "claude-code", model: "opus" });
  b.spend("pi", 3);
  expect(b.view()).toBeUndefined();
  expect(existsSync(join(dir, "free-budget.json"))).toBe(false);
});
