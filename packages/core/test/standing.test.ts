// D413: 不用问我的 / Without asking. What the person says may go without asking is kept the moment
// it lands; the review routine then posts its drafts inside it (no card), asks for the rest, and
// the floor is never kept. Fake gh, fake clock: never the real GitHub, never a real model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { openStanding, readStanding } from "../src/standing.ts";
import { openLog } from "../src/log.ts";
import { createDid } from "../src/did.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

test("read: the author's own words are a grant; questions, this once, quotes and vague asks are not", () => {
  // hel's Log, 11-19 and 11-20 (VERIFIED, read only).
  expect(readStanding("review 做好了直接发别和我确认")).toEqual([{ kind: "grant", action: "pr_review", quote: "review 做好了直接发别和我确认" }]);
  expect(readStanding("我说了很多遍了， review 评审直接发，别问我确认")[0]).toMatchObject({ kind: "grant", action: "pr_review" });
  expect(readStanding("review 不用问我，请直接发。以后都是如此")[0]).toMatchObject({ kind: "grant" });
  expect(readStanding("Just post the reviews on nowledge-co/mem, don't ask me.")[0]).toMatchObject({ kind: "grant", orgs: ["nowledge-co"] });
  // Not a standing permission.
  expect(readStanding("review 能直接发吗？")).toEqual([]);
  expect(readStanding("这次的评审直接发吧")).toEqual([]);
  expect(readStanding("确认卡也不要")).toEqual([]);
  expect(readStanding("我要休息了你能不问我自动去确认做一切合理的事儿么")).toEqual([]);
  expect(readStanding("> 但我不能跳过 GitHub 发布前的确认；不弹卡的话，评审只能留在草稿里。\n\n为什么？")).toEqual([]);
  // The other way: taken back.
  expect(readStanding("以后评审发之前先问我")[0]).toMatchObject({ kind: "revoke", action: "pr_review" });
  expect(readStanding("Ask me first before posting reviews.")[0]).toMatchObject({ kind: "revoke" });
  expect(readStanding("review 不要直接发")[0]).toMatchObject({ kind: "revoke" });
  // The floor, and what Ducter can't keep yet: never kept, the partner hears why.
  expect(readStanding("付款不用问我，直接付")[0]).toMatchObject({ kind: "floor", what: "pay" });
  expect(readStanding("以后登录不用问我")[0]).toMatchObject({ kind: "floor", what: "secret" });
  expect(readStanding("删除分支不用问我")[0]).toMatchObject({ kind: "floor", what: "delete" });
  expect(readStanding("回邮件不用问我")[0]).toMatchObject({ kind: "unsupported" });
});

test("store: kept once per saying, bounded by where the routine looks, taken back by tap or words, backfilled from the Log", () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: join(t.dir, "log.db"), persona: "p" });
  stops.push(() => log.close());
  const user = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
  user("review 做好了直接发别和我确认");
  const s = openStanding({ log, dataDir: t.dir, reviewOrgs: () => ["nowledge-co"] });
  // Said before Ducter kept these: kept on start.
  const back = s.backfill();
  expect(back).toHaveLength(1);
  expect(back[0]).toMatchObject({ action: "pr_review", orgs: ["nowledge-co"], text: "review 做好了直接发别和我确认" });
  expect(s.allows("pr_review", "nowledge-co/mem#10288")?.id).toBe(back[0]!.id);
  expect(s.allows("pr_review", "acme/site#3")).toBeUndefined(); // another org asks
  expect(s.allows("pr_review", "nowledge-co/mem#1", { mention: true })).toBeUndefined(); // only a mention asks
  expect(s.backfill()).toEqual([]); // once
  expect(s.firstUse(back[0]!.id)).toBe(true);
  expect(s.firstUse(back[0]!.id)).toBe(false);
  // 收回 on the Partner page: gone, and the same words never bring it back.
  expect(s.revoke(back[0]!.id)).toBe(true);
  expect(s.list()).toEqual([]);
  const again = openStanding({ log, dataDir: t.dir, reviewOrgs: () => ["nowledge-co"] });
  expect(again.backfill()).toEqual([]);
  // Said anew: kept anew; then taken back in words.
  const e = user("评审直接发，别问我");
  again.hear(`said:${e.seq}`, readStanding("评审直接发，别问我")[0]!, e.ts, e.seq);
  expect(again.list()).toHaveLength(1);
  expect(again.heardFrom(e.seq)[0]).toMatchObject({ kind: "kept" });
  const r = user("以后评审发之前先问我");
  again.hear(`said:${r.seq}`, readStanding("以后评审发之前先问我")[0]!, r.ts, r.seq);
  expect(again.list()).toEqual([]);
  expect(again.heardFrom(r.seq)[0]).toMatchObject({ kind: "revoked" });
});

const NOW = Date.parse("2026-11-20T02:42:00Z");
const pr = (repo: string, number: number, title: string): FakeIssue => ({ repo, number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number).toISOString(), diff: "diff --git a/x b/x\n+x\n" });
const note = (text: string, line = 12) => ({ kind: "problem", path: "src/distill.rs", line, text });

function boot() {
  const t = tempDir();
  const gh = fakeGh([pr("nowledge-co/mem", 10288, "Re-push messages in pages"), pr("nowledge-co/mem", 10591, "Bump rustls verifier"), pr("acme/site", 7, "Pricing page"), pr("nowledge-co/mem", 10641, "Mention only")], { login: "lin-dev" });
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-20", now: () => NOW } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
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
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner as unknown as Runner);
  core.log.append({ stream: "task:swj3zc4w", origin: "system", kind: "task_open", body: { taskId: "swj3zc4w", title: "看 nowledge-co 的评审请求", project: "", place: { kind: "none" }, harness: "codex", brief: "每 45 分钟 review 一次 nowledge-co 里请我 review 和提到我的 PR。" } });
  core.tasks.setState("swj3zc4w", "working", "hot");
  return { core, gh, told, ts: core.taskSources };
}
const cards = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]).filter((b) => b.src?.kind === "reviews");
const call = (core: ReturnType<typeof startCore>, args: unknown) => core.mcp.call({ role: "task", taskId: "swj3zc4w" } as never, "review_report", args) as Promise<string>;
const said = (core: ReturnType<typeof startCore>, text: string) => core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
const lines = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 100 }).map((e) => (e.body as Bodies["ai_msg"]).text);

test("said → kept at once → the open card's drafts go now → next round posts without a card; out of scope still asks; the first post said once", async () => {
  const { core, gh, told, ts } = boot();
  await ts.add("github");
  await ts.look();
  // Round 1: two drafts on nowledge-co, before anything was said: one card (D394).
  await call(core, { prs: [{ ref: "nowledge-co/mem#10288", head: "a1b2c3d", changed: true, notes: [note("Re-push stalls on a page over the byte budget.")] }, { ref: "nowledge-co/mem#10591", head: "b2c3d4e", changed: true, notes: [note("Keep the verifier at 0.7.1.", 3)] }] });
  expect(cards(core)).toHaveLength(1);
  expect(gh.reviews).toEqual([]);

  // The author's words: kept at once, and what waited on the card goes now.
  const e = said(core, "review 做好了直接发别和我确认");
  expect(core.standing.list()).toHaveLength(1);
  expect(core.standing.list()[0]).toMatchObject({ orgs: ["nowledge-co"], text: "review 做好了直接发别和我确认" });
  expect(core.standing.heardFrom(e.seq)[0]).toMatchObject({ kind: "kept" });
  await until(() => gh.reviews.length === 2 && told.length === 1);
  expect(told[0]!.text).toContain("without asking");
  const c1 = cards(core)[0]!;
  const settled = core.log.read({ stream: "channel", kinds: ["decision_resolved"], limit: 20 }).map((x) => x.body as Bodies["decision_resolved"]);
  expect(settled.find((r) => r.decisionId === c1.decisionId)).toMatchObject({ settled: true, posted: true });
  // The quiet safety net: one line, with links, the first time only.
  const first = lines(core).filter((l) => l.startsWith("刚才等着的"));
  expect(first).toHaveLength(1);
  expect(first[0]).toContain("[mem#10288](https://github.com/nowledge-co/mem/pull/10288");
  expect(first[0]).toContain("mem#10591");
  // Done for you says why: the person's words.
  const writes = core.log.read({ stream: "channel", kinds: ["source_write"], limit: 20 }).map((x) => x.body as Bodies["source_write"]);
  expect(writes.filter((w) => w.op === "review" && w.by === "rule" && w.said === "review 做好了直接发别和我确认")).toHaveLength(2);
  const did = createDid({ log: core.log, tasks: core.tasks, now: () => Date.now() }).query({ since: "2020-01-01T00:00:00Z", before: "2100-01-01T00:00:00Z" });
  expect(did.items.find((i) => i.kind === "sent")?.go).toEqual({ by: "said", words: "review 做好了直接发别和我确认" });

  // Round 2: one new draft inside, one in another org, one that only mentions them.
  const r2 = await call(core, {
    prs: [
      { ref: "nowledge-co/mem#10288", head: "c3d4e5f", changed: true, notes: [note("The retry still drops the cursor.")] },
      { ref: "acme/site#7", head: "d4e5f60", changed: true, notes: [note("The price rounds down.")] },
      { ref: "nowledge-co/mem#10641", head: "e5f6071", changed: true, mention: true, notes: [note("Typo in the doc.")] },
    ],
  });
  expect(r2).toContain("1 review went to GitHub without asking");
  expect(gh.reviews).toHaveLength(3);
  const c2 = cards(core).at(-1)!;
  expect(c2.src!.items!.map((x) => x.item.ref).sort()).toEqual(["acme/site#7", "nowledge-co/mem#10641"]);
  expect(c2.question).toBe("2 个 PR 的评审写好了，发到 GitHub？");
  expect(ts.pile.standing("swj3zc4w")).toMatchObject({ posted: 1, drafted: 2 });
  // After the first time: silence.
  expect(lines(core).filter((l) => l.startsWith("刚才等着的") || l.startsWith("按你说的"))).toHaveLength(1);
  // The board shows it sent.
  expect(ts.pile.board("swj3zc4w")!.prs.find((p) => p.ref === "nowledge-co/mem#10288")!.draft).toBe("sent");

  // Taken back: the next round asks again.
  core.standing.revoke(core.standing.list()[0]!.id);
  await call(core, { prs: [{ ref: "nowledge-co/mem#10591", head: "f60718a", changed: true, notes: [note("Still pinned at 0.6.2.")] }] });
  expect(gh.reviews).toHaveLength(3);
  expect(cards(core).at(-1)!.src!.items!.map((x) => x.item.ref)).toContain("nowledge-co/mem#10591");
});

test("backfill on start: the said line in the Log becomes the standing permission, so the first round after an upgrade posts", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const dataDir = join(t.dir, "data");
  const gh = fakeGh([pr("nowledge-co/mem", 10288, "Re-push messages in pages")], { login: "lin-dev" });
  const opts = { dataDir, port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-20", now: () => NOW } };
  const before = startCore(opts);
  before.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "review 做好了直接发别和我确认" } });
  // What hel had: the saying, and nothing kept (this build kept it at once; wipe it to stand for 0.0.99).
  const id = before.standing.list()[0]!.id;
  await before.stop();
  const { rmSync } = await import("node:fs");
  rmSync(join(dataDir, "standing.json"));
  const after = startCore(opts);
  stops.push(() => after.stop());
  expect(after.standing.list().map((x) => x.text)).toEqual(["review 做好了直接发别和我确认"]);
  expect(after.standing.list()[0]!.id).not.toBe(id);
});

test("said with nothing waiting: the first round that posts says the one line with links, then silence", async () => {
  const { core, gh, ts } = boot();
  await ts.add("github");
  await ts.look();
  await call(core, { prs: [{ ref: "nowledge-co/mem#10591", changed: false }] });
  said(core, "review 不用问我，请直接发。以后都是如此");
  expect(core.standing.list()).toHaveLength(1);
  await call(core, { prs: [{ ref: "nowledge-co/mem#10591", head: "b2c3d4e", changed: true, notes: [note("Keep the verifier at 0.7.1.", 3)] }] });
  expect(gh.reviews).toHaveLength(1);
  expect(cards(core)).toHaveLength(0);
  const l = lines(core).filter((x) => x.startsWith("按你说的"));
  expect(l).toEqual(["按你说的，这份评审直接发到 GitHub 了：[mem#10591](https://github.com/nowledge-co/mem/pull/10591#pullrequestreview-1)。以后照这样发，不再一一说；都在「替你做过的」里，想收回说一声。"]);
  await call(core, { prs: [{ ref: "nowledge-co/mem#10591", head: "c3d4e5f", changed: true, notes: [note("Still pinned.", 3)] }] });
  expect(gh.reviews).toHaveLength(2);
  expect(lines(core).filter((x) => x.startsWith("按你说的"))).toHaveLength(1);
});

async function until(ok: () => unknown, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

// D415: a comment on the person's issues is a second action a standing permission can cover.
test("read (D415): a comment on issues without asking is kept, bounded by the owners named; a hand-over's own note is not one", () => {
  expect(readStanding("以后在 nowledge-co 的 issue 里留言不用问我")).toEqual([{ kind: "grant", action: "issue_comment", orgs: ["nowledge-co"], quote: "以后在 nowledge-co 的 issue 里留言不用问我" }]);
  expect(readStanding("Comment on my issues without asking.")[0]).toMatchObject({ kind: "grant", action: "issue_comment" });
  expect(readStanding("Comment on my issues without asking.")[0]).not.toHaveProperty("orgs");
  expect(readStanding("在 nowledge-co/mem 的 issue 下直接留言就行")[0]).toMatchObject({ kind: "grant", action: "issue_comment", orgs: ["nowledge-co"] });
  expect(readStanding("issue 里留言之前先问我")[0]).toMatchObject({ kind: "revoke", action: "issue_comment" });
  // This once, a question, or the hand-over's note ("留言说一下…" is what to do now, not a standing permission).
  expect(readStanding("这次直接在 issue 里留言吧")).toEqual([]);
  expect(readStanding("能直接在 issue 里留言吗？")).toEqual([]);
  expect(readStanding("确保这些任务都没开始，然后再 issue 里留言说一下 我的 ducter agent 要开始做了")).toEqual([]);
  // A review is still a review.
  expect(readStanding("review 做好了直接发别和我确认")[0]).toMatchObject({ action: "pr_review" });
});
