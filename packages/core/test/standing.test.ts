// D413: 不用问我的 / Without asking. A standing go the partner recorded (D495: its without_asking tool;
// here the store's hear, as the tool calls it) makes the review routine post its drafts inside it (no
// card) and ask for the rest; taken back, it asks again. Fake gh, fake clock: never the real GitHub,
// never a real model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { openStanding, type StandingSaying } from "../src/standing.ts";
import { createDid } from "../src/did.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const grant = (quote: string, orgs?: string[]): StandingSaying => ({ kind: "grant", action: "pr_review", ...(orgs ? { orgs } : {}), quote });
let keyN = 0;
/** As the partner's without_asking tool records it. */
const keep = (s: { hear: (k: string, x: StandingSaying, at: string) => unknown }, x: StandingSaying) => s.hear(`tool:${++keyN}`, x, new Date().toISOString());

test("store: bounded by where the routine looks, a mention inside it too (D495), taken back by tap or words", () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const s = openStanding({ dataDir: t.dir, reviewOrgs: () => ["nowledge-co"] });
  expect(s.list()).toEqual([]);
  keep(s, grant("review 做好了直接发别和我确认"));
  const kept = s.list();
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ action: "pr_review", orgs: ["nowledge-co"], text: "review 做好了直接发别和我确认" });
  expect(s.allows("pr_review", "nowledge-co/mem#10288")?.id).toBe(kept[0]!.id);
  expect(s.allows("pr_review", "acme/site#3")).toBeUndefined(); // another org asks
  expect(s.allows("issue_comment", "nowledge-co/mem#3")).toBeUndefined(); // another action asks
  expect(s.firstUse(kept[0]!.id)).toBe(true);
  expect(s.firstUse(kept[0]!.id)).toBe(false);
  // Said again with an owner: one permission, widened, its words the newest.
  keep(s, grant("acme 的也直接发", ["acme"]));
  expect(s.list()).toHaveLength(1);
  expect(s.allows("pr_review", "acme/site#3")?.text).toBe("acme 的也直接发");
  // 收回 on the Partner page: gone; kept again; taken back in words.
  expect(s.revoke(kept[0]!.id)).toBe(true);
  expect(s.list()).toEqual([]);
  keep(s, grant("评审直接发，别问我"));
  expect(s.list()).toHaveLength(1);
  keep(s, { kind: "revoke", action: "pr_review", quote: "以后评审发之前先问我" });
  expect(s.list()).toEqual([]);
  // Kept across a restart; hel's D413 file (said:<seq> keys) reads as it is.
  keep(s, grant("评审直接发，别问我"));
  expect(openStanding({ dataDir: t.dir }).list().map((x) => x.text)).toEqual(["评审直接发，别问我"]);
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
/** The person said it; the partner recorded it (without_asking). */
const said = (core: ReturnType<typeof startCore>, text: string) => {
  const e = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
  core.standing.hear(`tool:${e.seq}`, grant(text), e.ts, e.seq);
  return e;
};
const lines = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 100 }).map((e) => (e.body as Bodies["ai_msg"]).text);

test("kept → the open card's drafts go now → next round posts without a card, a mention too; another org still asks; the first post said once", async () => {
  const { core, gh, told, ts } = boot();
  await ts.add("github");
  await ts.look();
  // Round 1: two drafts on nowledge-co, before anything was said: one card (D394).
  await call(core, { prs: [{ ref: "nowledge-co/mem#10288", head: "a1b2c3d", changed: true, notes: [note("Re-push stalls on a page over the byte budget.")] }, { ref: "nowledge-co/mem#10591", head: "b2c3d4e", changed: true, notes: [note("Keep the verifier at 0.7.1.", 3)] }] });
  expect(cards(core)).toHaveLength(1);
  expect(gh.reviews).toEqual([]);

  // The author's words: kept at once, and what waited on the card goes now.
  said(core, "review 做好了直接发别和我确认");
  expect(core.standing.list()).toHaveLength(1);
  expect(core.standing.list()[0]).toMatchObject({ orgs: ["nowledge-co"], text: "review 做好了直接发别和我确认" });
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

  // Round 2: one new draft inside, one in another org, one that only mentions them (D495: hel's
  // #11024, self-assigned, review asked of someone else: inside what they said, so it posts too).
  const r2 = await call(core, {
    prs: [
      { ref: "nowledge-co/mem#10288", head: "c3d4e5f", changed: true, notes: [note("The retry still drops the cursor.")] },
      { ref: "acme/site#7", head: "d4e5f60", changed: true, notes: [note("The price rounds down.")] },
      { ref: "nowledge-co/mem#10641", head: "e5f6071", changed: true, mention: true, notes: [note("Typo in the doc.")] },
    ],
  });
  expect(r2).toContain("2 reviews went to GitHub without asking");
  expect(gh.reviews).toHaveLength(4);
  const c2 = cards(core).at(-1)!;
  expect(c2.src!.items!.map((x) => x.item.ref)).toEqual(["acme/site#7"]);
  expect(c2.question).toBe("1 个 PR 的评审写好了，发到 GitHub？");
  expect(ts.pile.standing("swj3zc4w")).toMatchObject({ posted: 2, drafted: 1 });
  // After the first time: silence.
  expect(lines(core).filter((l) => l.startsWith("刚才等着的") || l.startsWith("按你说的"))).toHaveLength(1);
  // The board shows it sent.
  expect(ts.pile.board("swj3zc4w")!.prs.find((p) => p.ref === "nowledge-co/mem#10288")!.draft).toBe("sent");

  // Taken back: the next round asks again.
  core.standing.revoke(core.standing.list()[0]!.id);
  await call(core, { prs: [{ ref: "nowledge-co/mem#10591", head: "f60718a", changed: true, notes: [note("Still pinned at 0.6.2.")] }] });
  expect(gh.reviews).toHaveLength(4);
  expect(cards(core).at(-1)!.src!.items!.map((x) => x.item.ref)).toContain("nowledge-co/mem#10591");
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
