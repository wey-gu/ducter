// D593: hel's 2026-11-26 review Keep 「持续评审 nowledge-co 的 PR」, replayed with fakes (a fake gh, a
// fake clock, a stub runner; no model, no network). What happened there (hel's Log): "只看 review，不
// 用看 100gle" went into the Keep's goal (until), then "这轮直接 review #551" overwrote that goal, and
// "以后只发 /lgtm" went into the one-round ask and was gone after one round. No round heard the goal
// until the person edited it, and then as the loop's end condition: the run-now round reviewed #551
// again, reported done and ended the Keep for good. Each wake opened with the agent's own note from
// its last round (100gle, Backbone deploys, Cloud gates), so the old work went on. Now: the person's
// words stand first in every wake, verbatim, with what they added from now on; a round's ask is that
// round's only; edits are said as what changed; the review requests the sources see go to the round.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import { cutEdit } from "../src/keeps.ts";
import type { StandingSaying } from "../src/standing.ts";
import { afterCompaction } from "../../runner/src/brief.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir, tick } from "./helpers.ts";

const MIN = 60_000;
const NOW = Date.parse("2026-11-26T03:00:00Z");
const BRIEF = "你能帮我准备好能 review nowledge-co 这个 org 下的 repo at 我们和 request 我们为了 code review 请求么，然后请你按照 nowledge-co/mem 里 review skill 的方式仔细进行 review。你大概每 45 分钟查看一轮就好，每一轮仔细 review，结束之前，要再看一次有没有新的请求";
const SAID = "送过来的 pr 如果没有 review 就自己安排 subagent（astra） review 并且，做必要的验证，好了的话对于 prow 驱动的 ci 评论 /lgtm";
const ONLY_REVIEWS = "这个 loop 只需要看 review，不用看 100gle 的工作";
const LGTM = "千万别自己 merge Mem 等有 prow ci tide merge batch 的 repo 的 pr，用 /lgtm 就会触发 batch 合并";
const STEER = "本轮优先直接评审 https://github.com/nowledge-co/nowledge-labs-website/pull/551 的最新改动，检查已有评审避免重复";
const NOTE = "45 分钟后复查新邀评、100gle 分派、Backbone 生产部署及 Cloud 小时门禁";

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
  const gh = fakeGh([pr("nowledge-co/nowledge-labs-website", 551, "fix(labs): restore Inception heading hierarchy in all locales"), pr("nowledge-co/mem", 11196, "feat(identity): store and render AI Identity souls on Desktop")], { login: "wey-gu" });
  const core: Core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, clock, defaultDelayMs: 60_000, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-26", now: () => clock.now() } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const woke: { taskId: string; text: string }[] = [];
  const runner = {
    harness: { start: async () => Promise.reject(new Error("no model in this test")), available: async () => [] },
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
const task = (b: Boot, tool: string, args: unknown) => b.core.mcp.call({ role: "task", taskId: "swj3zc4w" } as never, tool, args);
const keep = (b: Boot) => b.core.keeps.get(b.core.keeps.ofTask("swj3zc4w")!.id)!;

/** The round rests on its own timer again, with its own note (as hel's agent wrote it), and the next wake fires. */
async function nextRound(b: Boot) {
  await task(b, "wait_for", { reason: NOTE, afterMinutes: 45 });
  b.core.tasks.setState("swj3zc4w", "blocked", "warm");
  await flush();
  b.clock.advance(46 * MIN);
  await flush();
  return b.woke.at(-1)!.text;
}

async function rounds(b: Boot) {
  await b.ts.add("github");
  await b.ts.look();
  b.core.log.append({ stream: "task:swj3zc4w", origin: "partner", kind: "task_open", body: { taskId: "swj3zc4w", title: "持续评审 nowledge-co 的 PR", project: "", place: { kind: "none", device: "local" }, harness: "codex", brief: BRIEF, needs: { reviews: true } } });
  b.core.tasks.setState("swj3zc4w", "working", "hot");
  b.core.standing.hear("tool:30746", grant, new Date(NOW).toISOString(), 30746);
  await task(b, "wait_for", { reason: NOTE, afterMinutes: 45 });
  b.core.tasks.setState("swj3zc4w", "blocked", "warm");
  await flush();
  b.core.keeps.sync();
}

test("hel's sequence: from now on, then a round's ask with run now, then the next round, then a new review request", async () => {
  const b = boot();
  await rounds(b);

  // 「这个 loop 只需要看 review，不用看 100gle 的工作」 and later the /lgtm line: from now on, every round.
  expect(await partner(b, "keep_change", { id: "swj3zc4w", also: ONLY_REVIEWS })).toMatchObject({ ok: true });
  expect(await partner(b, "keep_change", { id: "swj3zc4w", also: LGTM })).toMatchObject({ ok: true });
  let k = keep(b);
  expect(k.said).toBe(`${BRIEF}\n\n${ONLY_REVIEWS}\n\n${LGTM}`);
  expect(k.until).toBeUndefined();
  expect(k.next).toBeUndefined();
  // Said among its rounds as what was added, one line each, never the whole words twice.
  const lines = b.core.keeps.page(k.keepId)!.rounds.filter((r) => r.edit).flatMap((r) => r.edit!.edits);
  expect(lines).toContainEqual({ field: "said", to: ONLY_REVIEWS });
  expect(lines).toContainEqual({ field: "said", to: LGTM });

  // 11:56 「请 review 的 loop 直接 review #551 吧」, then 现在看一次: this round only, never its goal.
  const r = await partner(b, "keep_change", { id: "swj3zc4w", next_round: STEER, action: "look_now" });
  expect(r).toMatchObject({ ok: true, roundAsk: STEER, starts: "now" });
  b.clock.advance(2_000);
  await flush();
  k = keep(b);
  expect(k.until).toBeUndefined();
  expect(k.life).toBe("on");
  const now = b.woke.at(-1)!.text;
  // The Keep first, verbatim: their words with what they added, then the round's own ask.
  expect(now.startsWith("到时间了：「持续评审 nowledge-co 的 PR」。接着做。\n\n「持续评审 nowledge-co 的 PR」现在的要求（每一轮都以这里为准）：")).toBe(true);
  expect(now).toContain(`对方的话：「${BRIEF}\n\n${ONLY_REVIEWS}\n\n${LGTM}」`);
  expect(now).toContain(`这一轮对方交代先做（只限这一轮）：「${STEER}」`);
  // The agent's own note from last round comes after the person's words, as its note.
  expect(now.indexOf(NOTE)).toBeGreaterThan(now.indexOf(LGTM));
  expect(now).toContain(`上一轮你给自己记下要查的：「${NOTE}」。那是你的笔记`);
  expect(now).toContain("上面没要求的事不再做");
  // A round in a Keep with no end never reports done.
  expect(now).toContain("不要报 done");
  // The permission and the review requests the sources see come with it (hel's #11196 was waiting).
  expect(now).toContain("对方说过 PR 评审不用问");
  expect(now).toContain("https://github.com/nowledge-co/mem/pull/11196");
  // Its context compacted mid-round: the Keep and the round's ask are said again, first.
  const again = afterCompaction(BRIEF, "第349轮…", b.core.keepNow!("swj3zc4w"));
  expect(again.indexOf("现在的要求")).toBeLessThan(again.indexOf("<brief>"));
  expect(again).toContain(STEER);

  // The next scheduled round: the ask is over; what they said from now on still stands first.
  const next = await nextRound(b);
  expect(next).not.toContain(STEER);
  expect(next).not.toContain("只限这一轮");
  expect(next.startsWith("到时间了：「持续评审 nowledge-co 的 PR」。接着做。\n\n「持续评审 nowledge-co 的 PR」现在的要求")).toBe(true);
  expect(next).toContain(ONLY_REVIEWS);
  expect(next).toContain(LGTM);
  expect(keep(b).now).toBeUndefined();

  // A new review request arrives (hel's mem#11320): the round after the sources saw it is handed it.
  b.gh.issues.push({ ...pr("nowledge-co/mem", 11320, "fix(team): keep profile edits with the selected member"), state: "open" });
  b.gh.touch(b.gh.issues.at(-1)!);
  await b.ts.look();
  const after = await nextRound(b);
  expect(after).toContain("https://github.com/nowledge-co/mem/pull/11320");
  expect(after).toContain("最新提交上还没有对方评审的都要评审");
});

test("a round that brings a new request and reviews it says it was reviewed, never that it waits", async () => {
  const b = boot();
  await rounds(b);
  await task(b, "review_report", { prs: [{ ref: "nowledge-co/nowledge-labs-website#551", head: "b4bb875", changed: false }] });
  await flush();
  await task(b, "review_report", { prs: [{ ref: "nowledge-co/nowledge-labs-website#551", head: "b4bb875", changed: false }, { ref: "nowledge-co/mem#11196", head: "55c5394b8729", changed: true, body: "Re-reviewed 55c5394b8729. One remaining value-preservation case in the first-edit path." }] });
  await flush();
  const said = b.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 50 }).map((e) => String((e.body as Bodies["ai_msg"]).text));
  const line = said.find((t) => t.includes("11196") && t.includes("评审请求"));
  expect(line).toContain("这一轮已经评审并发到 GitHub");
  expect(line).not.toContain("新来了一个评审请求");
});

test("the goal edited by hand is said as what changed, never both full texts", async () => {
  const b = boot();
  await rounds(b);
  const long = "本轮优先直接评审 https://github.com/nowledge-co/nowledge-labs-website/pull/551 的最新改动。完成后继续原来的每45分钟 nowledge-co 全组织 PR 评审及看板规则；不巡查100gle分派、部署或生产。";
  const edited = long.replace("不巡查100gle分派、部署或生产", "不部署或生产");
  expect(cutEdit({ field: "until", from: long, to: edited })).toEqual({ field: "until", from: "…审及看板规则；不巡查100gle分派、部署或生产。", to: "…审及看板规则；不部署或生产。", cut: true });
  // Short ones stay whole.
  expect(cutEdit({ field: "until", from: "每个 PR 能合并", to: "每个 PR 合并" })).toEqual({ field: "until", from: "每个 PR 能合并", to: "每个 PR 合并" });
  await b.core.keeps.change(keep(b).keepId, { until: long }, { by: "you" });
  b.clock.advance(11 * MIN);
  await b.core.keeps.change(keep(b).keepId, { until: edited }, { by: "you" });
  const stored = b.core.log.read({ stream: `keep:${keep(b).keepId}`, kinds: ["keep_edit"], limit: 10 }).map((e) => (e.body as Bodies["keep_edit"]).edits[0]!);
  expect(stored.at(-1)).toMatchObject({ field: "until", cut: true });
  expect(stored.at(-1)!.from!.length).toBeLessThan(40);
  // The round now hears the end as the whole thing's end: done stops it for good.
  const wake = await nextRound(b);
  expect(wake).toContain(`整件事做到：${edited}`);
  expect(wake).toContain("报 done 这件事就彻底停了");
});
