// D601: 以后这类直接做 / Always do this. A Go card whose step a standing permission can cover carries
// a second choice; its tap does this one now and keeps the permission where the card acted (by
// "tap", never words the person didn't say), so the next card of that kind in that owner goes on
// their word. Never on the floor. GQ4: two plain Go's in 14 days and the next card leads with the
// offer, once. Take back: the card asks again. Fakes only (a stub runner, a fake gh, no model).
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, LogEvent, Runner, ServerFrame, TaskCard } from "@ducter/protocol";
import { beyondStanding } from "@ducter/protocol";
import { createTelegram } from "../src/channels/index.ts";
import { startCore } from "../src/core.ts";
import { PERSON, waitFor } from "./channels-rig.ts";
import { fakeTelegram } from "./fake-telegram.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

function boot() {
  const t = tempDir();
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model")), available: async () => [] },
    openTask: async (): Promise<TaskCard> => Promise.reject(new Error("no")),
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return { core, told };
}

/** A repo task cloned from owner/repo, working on its PR (hel's babysitter in shape). */
function task(core: ReturnType<typeof startCore>, taskId: string, clone = "nowledge-co/mem") {
  core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: "把 PR #10932 推到能合并", project: "", place: { kind: "repo", device: "local", repoPath: "/r/mem", clone, branch: "ducter/copy" }, harness: "codex", brief: "推进到能合并" } });
  core.tasks.setState(taskId, "working", "hot");
}

function ask(core: ReturnType<typeof startCore>, taskId: string, q: Partial<Bodies["report"]["questions"][number]>) {
  core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "needs_input", summary: "E2E 偶发失败一次。", evidence: [], questions: [{ id: "q", text: "在 PR #10932 评论 `/test pull-mem-playwright-e2e` 重跑这项 E2E？", blocking: true, default: "重跑 E2E", reversible: true, ...q }] } });
  return core.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).map((e) => e.body as Bodies["decision"]).at(-1)!;
}

test("Always do this: Go now, a standing permission by tap in that owner, the next card of that kind goes on its own", async () => {
  const { core, told } = boot();
  task(core, "t1");
  const d = ask(core, "t1", { step: "ci_rerun" });
  expect(d.always).toEqual({ action: "ci_rerun", where: ["nowledge-co"] });

  const r = core.always!.tap(d.decisionId);
  expect(r.ok).toBe(true);
  const res = core.decisions.resolution(d.decisionId)!;
  expect(res).toMatchObject({ option: "go", by: "user", always: true });
  const kept = core.standing.list();
  expect(kept).toHaveLength(1);
  // The label, said as a tap: never words put in the person's mouth.
  expect(kept[0]).toMatchObject({ action: "ci_rerun", orgs: ["nowledge-co"], by: "tap", text: "以后这类直接做" });
  expect(res.standing).toBe(kept[0]!.id);
  await until(() => told.length === 1);
  expect(told[0]!.text).toContain("Go: 重跑 E2E");
  expect(told[0]!.text).toContain("Always do this");
  expect(core.always!.tap(d.decisionId).ok).toBe(false); // answered once

  // The next card of that kind in that owner (another task) doesn't ask: Go on the tap.
  task(core, "t2");
  const d2 = ask(core, "t2", { step: "ci_rerun" });
  expect(d2.always).toBeUndefined();
  await until(() => !core.decisions.isPending(d2.decisionId));
  expect(core.decisions.resolution(d2.decisionId)).toMatchObject({ option: "go", by: "said", action: "ci_rerun", standing: kept[0]!.id });

  // Another owner still asks, and offers it there.
  task(core, "t3", "wey-gu/ducter");
  const d3 = ask(core, "t3", { step: "ci_rerun" });
  expect(core.decisions.isPending(d3.decisionId)).toBe(true);
  expect(d3.always).toEqual({ action: "ci_rerun", where: ["wey-gu"] });
  // Another kind in the same owner still asks too.
  task(core, "t4");
  const d4 = ask(core, "t4", { step: "pr_comment", text: "在 PR 下回复评审？", default: "回复" });
  expect(core.decisions.isPending(d4.decisionId)).toBe(true);
  expect(d4.always?.action).toBe("pr_comment");
});

test("never on the floor: a payment, a key, a sign-in, a delete, a merge, no owner, no step", () => {
  const { core } = boot();
  task(core, "t1");
  expect(ask(core, "t1", {}).always).toBeUndefined(); // the task named no step
  expect(ask(core, "t1", { step: "branch_push", text: "合并 PR #10932 到 main？", default: "合并" }).always).toBeUndefined();
  expect(ask(core, "t1", { step: "branch_push", text: "Merge PR #10932 into main?", default: "Merge" }).always).toBeUndefined();
  expect(ask(core, "t1", { step: "branch_push", text: "Force-push the branch?", default: "Push" }).always).toBeUndefined();
  expect(ask(core, "t1", { step: "branch_push", text: "删掉远端的旧分支？", default: "删掉" }).always).toBeUndefined();
  expect(ask(core, "t1", { step: "ci_rerun", pay: { site: "x.com", amount: "9", currency: "USD", card: "Visa", handle: "card:1" } as never }).always).toBeUndefined();
  expect(ask(core, "t1", { step: "ci_rerun", key: { env: "GH_TOKEN", why: "x" } as never }).always).toBeUndefined();
  expect(ask(core, "t1", { step: "ci_rerun", signIn: { site: "github.com", url: "https://github.com/login" } as never }).always).toBeUndefined();
  // A task with no GitHub owner: nowhere to bound a tap, so none.
  core.log.append({ stream: "task:t9", origin: "system", kind: "task_open", body: { taskId: "t9", title: "整理", project: "", place: { kind: "none" }, harness: "codex", brief: "b" } });
  core.tasks.setState("t9", "working", "hot");
  expect(ask(core, "t9", { step: "ci_rerun" }).always).toBeUndefined();
  // A step Ducter doesn't know is dropped by the report's reader; here the card just has none.
  expect(ask(core, "t1", { step: "pr_merge" as never }).always).toBeUndefined();
  // The tap refuses a card that never offered it.
  const plain = ask(core, "t1", {});
  expect(core.always!.tap(plain.decisionId).ok).toBe(false);
  expect(core.decisions.isPending(plain.decisionId)).toBe(true);
  expect(core.standing.list()).toEqual([]);
  expect(beyondStanding("Push the branch", "Push")).toBe(false);
});

test("GQ4: two plain Go's on one kind in one owner, and the next card leads with the offer, once; declined, not again", async () => {
  const { core } = boot();
  task(core, "t1");
  const go = (id: string) => core.decisions.decide(id, "go");
  const a = ask(core, "t1", { step: "ci_rerun" });
  expect(a.always?.often).toBeUndefined();
  go(a.decisionId);
  const b = ask(core, "t1", { step: "ci_rerun" });
  expect(b.always?.often).toBeUndefined();
  go(b.decisionId);
  // Twice: the third leads with 这类你已经点过两次了，以后直接做？
  const c = ask(core, "t1", { step: "ci_rerun" });
  expect(c.always).toEqual({ action: "ci_rerun", where: ["nowledge-co"], often: true });
  // Another kind, another owner: not yet.
  expect(ask(core, "t1", { step: "pr_comment", text: "回复评审？", default: "回复" }).always?.often).toBeUndefined();
  // Declined (a plain Go on the offered card): never again within 30 days, however many Go's.
  go(c.decisionId);
  for (let i = 0; i < 3; i++) {
    const n = ask(core, "t1", { step: "ci_rerun" });
    expect(n.always?.often).toBeUndefined();
    expect(n.always?.action).toBe("ci_rerun"); // the plain second choice stays
    go(n.decisionId);
  }
  expect(core.standing.list()).toEqual([]);
});

test("Take back: the next card of that kind asks again, with the second choice", async () => {
  const { core } = boot();
  task(core, "t1");
  const d = ask(core, "t1", { step: "branch_push", text: "推送 ducter/copy 分支更新 PR？", default: "推送" });
  expect(core.always!.tap(d.decisionId).ok).toBe(true);
  const s = core.standing.list()[0]!;
  expect(core.standing.revoke(s.id)).toBe(true);
  const again = ask(core, "t1", { step: "branch_push", text: "推送 ducter/copy 分支更新 PR？", default: "推送" });
  expect(core.decisions.isPending(again.decisionId)).toBe(true);
  expect(again.always).toEqual({ action: "branch_push", where: ["nowledge-co"] });
});

// ---------- D394: the review round's card ----------

const NOW = Date.parse("2026-11-26T05:37:00Z");
const pr = (number: number, title: string): FakeIssue => ({ repo: "nowledge-co/mem", number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number * 1000).toISOString(), diff: "diff --git a/x b/x\n+x\n" });
const note = (text: string, line = 12) => ({ kind: "problem", path: "src/distill.rs", line, text });

test("the review round's card: 以后直接发 posts these now, once, and the next round posts without a card", async () => {
  const t = tempDir();
  const gh = fakeGh([pr(10287, "Distill memories in batches"), pr(10473, "Keep the window when a thread is long")], { login: "lin-dev" });
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-26", now: () => NOW } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model")), available: async () => [] },
    openTask: async (): Promise<TaskCard> => Promise.reject(new Error("no")),
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  await core.taskSources.add("github");
  await core.taskSources.look();
  core.log.append({ stream: "task:rv", origin: "system", kind: "task_open", body: { taskId: "rv", title: "看 nowledge-co 的评审请求", project: "", place: { kind: "none" }, harness: "codex", brief: "每 45 分钟 review 一次 nowledge-co 里请我 review 的 PR。" } });
  core.tasks.setState("rv", "working", "hot");
  const call = (args: unknown) => core.mcp.call({ role: "task", taskId: "rv" } as never, "review_report", args) as Promise<string>;
  await call({ prs: [{ ref: "nowledge-co/mem#10287", head: "a1b2c3d", changed: true, notes: [note("The batch size is read before it is checked.")] }] });
  const card = core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).map((e) => e.body as Bodies["decision"]).find((b) => b.src?.kind === "reviews")!;
  expect(card.goLabel).toBe("发到 GitHub");
  expect(card.always).toEqual({ action: "pr_review", where: ["nowledge-co"] });

  expect(core.always!.tap(card.decisionId).ok).toBe(true);
  await until(() => gh.reviews.length === 1 && told.length === 1);
  await new Promise((r) => setTimeout(r, 50));
  expect(gh.reviews.length).toBe(1); // posted once, by the card's own Go
  expect(core.standing.list()[0]).toMatchObject({ action: "pr_review", orgs: ["nowledge-co"], by: "tap", text: "以后直接发" });
  expect(told[0]!.text).toContain("Always post");

  // The next round: posted at once, no card.
  const before = core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).length;
  await call({ prs: [{ ref: "nowledge-co/mem#10473", head: "f098abc", changed: true, notes: [note("The window drops the pinned message.", 88)] }, { ref: "nowledge-co/mem#10287", changed: false }] });
  await until(() => gh.reviews.length === 2);
  expect(gh.reviews.map((r) => r.number).sort()).toEqual([10287, 10473]);
  expect(core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).length).toBe(before);
});

// ---------- the chat apps: a third button where buttons exist ----------

test("Telegram: the card has 以后这类直接做 beside its Go; the tap keeps it, the card says so", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const tg = fakeTelegram();
  stops.push(() => tg.stop());
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    pushHoldMs: 30,
    channels: {
      gapMs: 0,
      sleep: async () => {},
      make: (_kind, rec, store) => createTelegram({ token: rec.token, api: tg.api, pollSeconds: 1, backoffMs: 20, offset: () => store.get("telegram")?.offset, setOffset: (n) => store.patch("telegram", { offset: n }) }),
    },
  });
  stops.push(() => core.stop());
  core.settings.set({ language: "zh" });
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model")), available: async () => [] },
    openTask: async (): Promise<TaskCard> => Promise.reject(new Error("no")),
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  task(core, "t1");
  // The partner, faked: the person's word in Telegram starts a turn in which the task asks.
  core.setPartner({
    onTrigger: (e: LogEvent) => {
      if (e.kind !== "user_msg") return;
      setTimeout(() => {
        const d = ask(core, "t1", { step: "ci_rerun" });
        core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "E2E 偶发失败一次，要在 PR 下评论 /test 重跑这项 E2E 吗？", decisionId: d.decisionId } });
      }, 0);
    },
  });
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  const send = (f: object) => ws.send(JSON.stringify(f));
  send({ t: "hello", client: "web" });
  send({ t: "channels" });
  send({ t: "channel_connect", kind: "telegram", token: tg.token });
  await waitFor(() => frames.find((f) => f.t === "channel_result" && f.op === "connect" && f.ok));
  send({ t: "channel_code", kind: "telegram" });
  const code = (await waitFor(() => frames.find((f) => f.t === "channel_result" && f.op === "code"))) as Extract<ServerFrame, { t: "channel_result" }>;
  tg.says(PERSON, `/start ${code.link!.split("start=")[1]}`);
  await waitFor(() => frames.some((f) => f.t === "channels" && f.channels[0]!.state === "linked"));
  tg.says(PERSON, "E2E 怎么样了？");
  const card = await waitFor(() => tg.calls.find((c) => c.method === "sendMessage" && String(c.body.text).includes("重跑这项 E2E")));
  const labels = JSON.stringify(card.body.reply_markup);
  expect(labels).toContain("好，重跑 E2E");
  expect(labels).toContain("以后这类直接做");
  const d = core.log.read({ stream: "channel", kinds: ["decision"], limit: 20 }).map((e) => e.body as Bodies["decision"]).at(-1)!;
  tg.taps(PERSON, card.id!, `a:${d.decisionId}`);
  await waitFor(() => core.decisions.resolution(d.decisionId));
  expect(core.decisions.resolution(d.decisionId)).toMatchObject({ option: "go", always: true });
  expect(core.standing.list()[0]).toMatchObject({ action: "ci_rerun", by: "tap", orgs: ["nowledge-co"] });
  await waitFor(() => tg.sent("editMessageText").some((m) => String(m.text).includes("你点了「以后这类直接做」")));
});
