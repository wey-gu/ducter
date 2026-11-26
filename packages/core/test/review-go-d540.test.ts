// D540: hel's 2026-11-24 review loop and PR #551, replayed with fakes (a fake gh, a fake clock, a
// stub runner; no model, no network). The person had said reviews go without asking; the partner
// "arranged" a round for #551 by writing the Keep's goal, which no round reads; the round found
// nothing to change in #551, and review_report had no way to post a review without line comments;
// asked again, the task drafted a file and handed it to "Ducter" in a progress report, which nobody
// acts on. Now: the one-off ask and the standing permission both reach the round's wake, a review
// with only its conclusion posts at once, and nothing waits for the next round.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import type { StandingSaying } from "../src/standing.ts";
import { goesBrief } from "../../runner/src/brief.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir, tick } from "./helpers.ts";

const MIN = 60_000;
const NOW = Date.parse("2026-11-24T09:03:00Z");
const BRIEF = "你能帮我准备好能 review nowledge-co 这个 org 下的 repo at 我们和 request 我们为了 code review 请求么，然后请你按照 nowledge-co/mem 里 review skill 的方式仔细进行 review。你大概每 45 分钟查看一轮就好，每一轮仔细 review，结束之前，要再看一次有没有新的请求";
const SAID = "我说了很多遍了， review 评审直接发，别问我确认";
const STEER = "这一轮优先直接评审 https://github.com/nowledge-co/nowledge-labs-website/pull/551 的最新改动，核对已有评审避免重复，直接在 PR 上提交评审";
const HEAD = "b4bb87552193a1c0ffee0000000000000000abcd";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const flush = async () => {
  for (let i = 0; i < 30; i++) await tick();
};
const pr = (repo: string, number: number, title: string): FakeIssue => ({ repo, number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number).toISOString(), diff: "diff --git a/x b/x\n+x\n" });

function boot() {
  const t = tempDir();
  const clock = new FakeClock(NOW);
  const gh = fakeGh([pr("nowledge-co/nowledge-labs-website", 551, "fix(labs): restore Inception heading hierarchy in all locales"), pr("nowledge-co/mem", 11041, "fix(codex): sync new messages after history conflicts"), pr("acme/site", 7, "Pricing page")], { login: "wey-gu" });
  const core: Core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, clock, defaultDelayMs: 60_000, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-24", now: () => clock.now() } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const woke: { taskId: string; text: string }[] = [];
  const runner = {
    harness: {
      start: async () => {
        throw new Error("no model in this test");
      },
      available: async () => [],
    },
    async openTask(): Promise<TaskCard> {
      throw new Error("no");
    },
    send: async (taskId: string, text: string) => {
      woke.push({ taskId, text });
      core.tasks.setState(taskId, "working", "hot");
      return { delivered: "prompted" as const };
    },
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner as unknown as Runner);
  return { core, clock, gh, woke, ts: core.taskSources };
}
type Boot = ReturnType<typeof boot>;

const grant: StandingSaying = { kind: "grant", action: "pr_review", orgs: ["nowledge-co"], quote: SAID };
const partner = (b: Boot, tool: string, args: unknown) => b.core.mcp.call({ role: "partner" } as never, tool, args) as Promise<Record<string, unknown>>;
const report = (b: Boot, args: unknown) => b.core.mcp.call({ role: "task", taskId: "swj3zc4w" } as never, "review_report", args) as Promise<string>;
const cards = (b: Boot) => b.core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]).filter((d) => d.src?.kind === "reviews");
const writes = (b: Boot) => b.core.log.read({ stream: "channel", kinds: ["source_write"], limit: 100 }).map((e) => e.body as Bodies["source_write"]);

/** The loop as hel had it: the review task in rounds, resting on its 45-minute timer. */
async function rounds(b: Boot) {
  await b.ts.add("github");
  await b.ts.look();
  b.core.log.append({ stream: "task:swj3zc4w", origin: "partner", kind: "task_open", body: { taskId: "swj3zc4w", title: "持续评审 nowledge-co 的 PR", project: "", place: { kind: "none", device: "local" }, harness: "codex", brief: BRIEF, needs: { reviews: true } } });
  b.core.tasks.setState("swj3zc4w", "working", "hot");
  b.core.standing.hear("tool:30746", grant, new Date(NOW).toISOString(), 30746);
  await b.core.mcp.call({ role: "task", taskId: "swj3zc4w" } as never, "wait_for", { reason: "45 分钟后复查 nowledge-co 评审请求", afterMinutes: 45 });
  b.core.tasks.setState("swj3zc4w", "blocked", "warm");
  await flush();
  b.core.keeps.sync();
}

test("hel's #551: the one-off ask and the standing permission both reach the round; a review with nothing to change posts at once, no card, never the next round", async () => {
  const b = boot();
  await rounds(b);
  // Round 301 had listed #551 with no review of its own (nothing to change, so nothing could post).
  await report(b, { prs: [{ ref: "nowledge-co/nowledge-labs-website#551", head: HEAD, ci: "pending", changed: false, gist: "三语标题层级" }] });
  expect(b.gh.reviews).toEqual([]);

  // 17:47 local: 「请 review 的 loop 直接 review …/pull/551 吧」: the partner steers the next round, now.
  const r = await partner(b, "keep_change", { id: "swj3zc4w", next_round: STEER, action: "look_now" });
  expect(r).toMatchObject({ ok: true, roundAsk: STEER, starts: "now", nextRound: "kept: that round's wake carries it first" });
  // Never its goal: the Keep's end stays as it was.
  const k = b.core.keeps.get(b.core.keeps.ofTask("swj3zc4w")!.id)!;
  expect(k.until).toBeUndefined();
  expect(k.next?.text).toBe(STEER);

  b.clock.advance(2_000);
  await flush();
  expect(b.woke).toHaveLength(1);
  const wake = b.woke[0]!.text;
  expect(wake).toContain("这是循环里的一轮");
  // The steer, first thing in its own line, in the person's words.
  // D593: inside the Keep's own words, as this round's only.
  expect(wake).toContain(`这一轮对方交代先做（只限这一轮）：「${STEER}」`);
  // The standing permission as a fact, with where, their words and the one means.
  expect(wake).toContain("对方说过 PR 评审不用问、直接发（nowledge-co 下的 PR");
  expect(wake).toContain(SAID);
  expect(wake).toContain("review_report");
  expect(wake).toContain("不要自己跑 gh pr review");
  // Taken: the Keep doesn't carry it any more.
  expect(b.core.keeps.get(k.keepId)!.next).toBeUndefined();

  // The round reviews #551 (same head, nothing to change): its conclusion alone is the review.
  const out = await report(b, {
    prs: [
      { ref: "nowledge-co/nowledge-labs-website#551", head: HEAD, ci: "pending", changed: true, body: "Reviewed b4bb875: H2 goes from 14 px to 20 px in the shared template and H3 stays at 16 px; the browser assertions cover en, zh and ja. Nothing blocking. Please attach the candidate screenshots and the Chromium and Firefox runs." },
      { ref: "nowledge-co/mem#11041", head: "4aa1e8eaf457", ci: "failing", changed: false },
    ],
  });
  expect(out).toContain("1 review went to GitHub without asking");
  expect(b.gh.reviews).toHaveLength(1);
  expect(b.gh.reviews[0]).toMatchObject({ repo: "nowledge-co/nowledge-labs-website", number: 551, event: "COMMENT", comments: [] });
  expect(b.gh.reviews[0]!.body).toContain("Nothing blocking");
  // Posted under their words, through the one audited write; no card, nothing parked for a round.
  expect(writes(b).filter((w) => w.op === "review")).toMatchObject([{ by: "rule", state: "done", said: SAID }]);
  expect(cards(b)).toEqual([]);

  // Asked again between rounds, at the same head: posted once, never twice.
  await report(b, { prs: [{ ref: "nowledge-co/nowledge-labs-website#551", head: HEAD, changed: true, body: "Same review." }] });
  expect(b.gh.reviews).toHaveLength(1);

  // The next round's wake: the one-off ask is gone, the standing permission is said again.
  await b.core.mcp.call({ role: "task", taskId: "swj3zc4w" } as never, "wait_for", { reason: "45 分钟后复查 nowledge-co 评审请求", afterMinutes: 45 });
  b.core.tasks.setState("swj3zc4w", "blocked", "warm");
  await flush();
  b.clock.advance(46 * MIN);
  await flush();
  const next = b.woke.at(-1)!.text;
  expect(b.woke.length).toBeGreaterThanOrEqual(2);
  expect(next).not.toContain(STEER);
  expect(next).toContain("对方说过 PR 评审不用问");
});

test("a one-off ask while a round is under way reaches it now; a review outside the permission is on a card at once", async () => {
  const b = boot();
  await rounds(b);
  b.clock.advance(46 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
  expect(b.core.tasks.get("swj3zc4w")!.attention).toBe("working");
  const r = await partner(b, "keep_change", { id: "swj3zc4w", next_round: STEER });
  expect(r).toMatchObject({ ok: true, nextRound: "told: the round under way has it now" });
  expect(b.woke.at(-1)!.text).toContain(`对方刚交代，这一轮先做：「${STEER}」`);
  expect(b.core.keeps.get(b.core.keeps.ofTask("swj3zc4w")!.id)!.next).toBeUndefined();

  // Another org isn't inside what they said: one card now, not a sentence in a report.
  await report(b, { prs: [{ ref: "acme/site#7", head: "d4e5f60", changed: true, body: "Looks right; one question on the price rounding." }] });
  expect(b.gh.reviews).toEqual([]);
  expect(cards(b)).toHaveLength(1);
  // What the card set off (Ongoing's refresh) settles inside this test, never in the next one.
  await flush();
  await new Promise((r) => setTimeout(r, 50));
});

test("the brief says it too: reviews go without asking, through review_report, at once", () => {
  const text = goesBrief([{ action: "pr_review", words: SAID, where: ["nowledge-co"] }]);
  expect(text).toContain("posting PR reviews in nowledge-co");
  expect(text).toContain(SAID);
  expect(text).toContain("review_report");
  expect(text).toContain("never run gh pr review yourself");
});

test("a review task's goes carry the review permission; any other task's don't", async () => {
  const b = boot();
  await rounds(b);
  expect(b.core.goesFor!("swj3zc4w").map((s) => s.action)).toContain("pr_review");
  b.core.log.append({ stream: "task:other", origin: "partner", kind: "task_open", body: { taskId: "other", title: "Fix the flaky test", project: "", place: { kind: "none", device: "local" }, harness: "codex", brief: "Fix the flaky auth test." } });
  expect(b.core.goesFor!("other").map((s) => s.action)).not.toContain("pr_review");
});
