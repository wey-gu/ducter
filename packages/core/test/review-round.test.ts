// D394: a review that runs every so often (research/158). Its rounds report every request waiting
// on the person; the drafts for those reviewed again become those PRs' pre-reads (the sheet the
// clients already open), one card per round asks to post them all, and nothing reaches GitHub
// before Go. Fake gh, fake clock: never the real GitHub, never a real model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { parseRound } from "../src/task-sources/pile.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const NOW = Date.parse("2026-11-19T05:37:00Z");
const pr = (number: number, title: string): FakeIssue => ({ repo: "nowledge-co/mem", number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number * 1000).toISOString(), diff: "diff --git a/x b/x\n+x\n" });

function boot(zh = true) {
  const t = tempDir();
  const gh = fakeGh([pr(10287, "Distill memories in batches"), pr(10473, "Keep the window when a thread is long"), pr(10419, "Recall across spaces"), pr(8528, "Old search tweak"), pr(6497, "Docs: the CLI")], { login: "lin-dev" });
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-19", now: () => NOW } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: zh ? "zh" : "en" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  const runner = {
    // No model here: the pre-reads a look starts in the background fail at once, inside this test
    // (an empty fake session left them throwing later, in whichever file ran next).
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
  const open = (taskId: string, title: string, brief: string, needs?: { reviews?: boolean }) => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief, ...(needs ? { needs } : {}) } });
    core.tasks.setState(taskId, "working", "hot");
  };
  return { core, gh, told, open, ts: core.taskSources };
}

const cards = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]).filter((b) => b.src?.kind === "reviews");
const resolved = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["decision_resolved"], limit: 100 }).map((e) => e.body as Bodies["decision_resolved"]);
const call = (core: ReturnType<typeof startCore>, taskId: string, args: unknown) => core.mcp.call({ role: "task", taskId } as never, "review_report", args) as Promise<string>;
const note = (text: string, line = 12) => ({ kind: "problem", path: "src/distill.rs", line, text });

test("a round is read strictly: refs, heads, notes clipped as a pre-read's", () => {
  expect(parseRound({})).toMatchObject({ ok: false });
  expect(parseRound({ prs: [{ ref: "10287" }] })).toMatchObject({ ok: false });
  const r = parseRound({ prs: [{ ref: "nowledge-co/mem#1", head: "F098ABC", changed: true, notes: [{ kind: "nit", text: "x" }, { kind: "problem", path: "../etc", text: "y" }] }, { ref: "nowledge-co/mem#1", changed: false }] });
  expect(r).toEqual({ ok: true, prs: [{ ref: "nowledge-co/mem#1", head: "f098abc", changed: true, notes: [{ kind: "problem", text: "y" }] }] });
});

test("rounds: drafts land on those PRs, one card a round carries every unsent one, Go posts each once, the task hears", async () => {
  const { core, gh, told, open, ts } = boot();
  await ts.add("github");
  await ts.look();
  open("swj3zc4w", "看 nowledge-co 的评审请求", "每 45 分钟 review 一次 nowledge-co 里请我 review 和提到我的 PR，按 mem 的 review skill 来。", { reviews: true });
  expect(core.mcp.listed({ role: "task", taskId: "swj3zc4w" } as never)).toContain("review_report");

  // Round 1: five wait; two moved and were reviewed again.
  const r1 = await call(core, "swj3zc4w", {
    prs: [
      { ref: "nowledge-co/mem#10287", head: "a1b2c3d", changed: true, gist: "分批提炼记忆", notes: [note("The batch size is read before it is checked."), { kind: "suggestion", text: "A test for an empty batch would keep this honest." }] },
      { ref: "nowledge-co/mem#10473", head: "f098abc", changed: true, notes: [note("The window drops the pinned message when it trims.", 88)] },
      { ref: "nowledge-co/mem#10419", head: "0c0ffee", changed: false },
      { ref: "nowledge-co/mem#8528", changed: false },
      { ref: "nowledge-co/mem#6497", changed: false },
    ],
  });
  expect(r1).toContain("2 unsent drafts wait on one card");
  expect(gh.reviews).toEqual([]);
  const c1 = cards(core);
  expect(c1.length).toBe(1);
  expect(c1[0]).toMatchObject({ question: "2 个 PR 的评审写好了，发到 GitHub？", goLabel: "发到 GitHub", holdLabel: "先不发", defaultOption: "hold", reversible: false });
  expect(c1[0]!.defaultAt).toBeUndefined(); // GQ10: no countdown
  expect(c1[0]!.src!.items!.map((x) => x.item.ref)).toEqual(["nowledge-co/mem#10287", "nowledge-co/mem#10473"]);
  // Each draft is that PR's pre-read: what the sheet opens on the phone and the Mac.
  expect(ts.pile.read("nowledge-co/mem#10287")).toMatchObject({ state: "drafted", problems: 1, suggestions: 1, byTask: "swj3zc4w", head: "a1b2c3d", gist: "分批提炼记忆", title: "Distill memories in batches" });
  expect(ts.pile.standing("swj3zc4w")).toMatchObject({ waiting: 5, again: 2, same: 3, drafted: 2 });

  // Round 2, nothing moved: no new card, the open one stays.
  expect(await call(core, "swj3zc4w", { prs: [{ ref: "nowledge-co/mem#10287", changed: false }, { ref: "nowledge-co/mem#10473", changed: false }, { ref: "nowledge-co/mem#10419", changed: false }, { ref: "nowledge-co/mem#8528", changed: false }, { ref: "nowledge-co/mem#6497", changed: false }] })).toContain("nothing new");
  expect(cards(core).length).toBe(1);
  expect(ts.pile.standing("swj3zc4w")).toMatchObject({ waiting: 5, again: 0, same: 5, drafted: 2 });

  // Round 3: 10419 moved. The earlier card is settled; the new one carries all three.
  await call(core, "swj3zc4w", { prs: [{ ref: "nowledge-co/mem#10419", head: "beefcafe", changed: true, notes: [note("Recall reads every space the token can't see.", 40)] }, { ref: "nowledge-co/mem#10287", changed: false }, { ref: "nowledge-co/mem#10473", changed: false }, { ref: "nowledge-co/mem#8528", changed: false }, { ref: "nowledge-co/mem#6497", changed: false }] });
  const c3 = cards(core);
  expect(c3.length).toBe(2);
  expect(resolved(core).find((r) => r.decisionId === c3[0]!.decisionId)).toMatchObject({ option: "hold", settled: true });
  expect(c3[1]!.question).toBe("3 个 PR 的评审写好了，发到 GitHub？");
  expect(c3[1]!.src!.items!.length).toBe(3);
  expect(told).toEqual([]); // a settled card tells nobody
  expect(gh.reviews).toEqual([]);

  // Go: each posted once, as a comment-only review, each a write in Done for you; the task hears.
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: c3[1]!.decisionId, option: "go", by: "user" } });
  await until(() => gh.reviews.length === 3 && told.length === 1);
  expect(gh.reviews.every((r) => r.event === "COMMENT")).toBe(true);
  expect(gh.reviews.map((r) => r.number).sort()).toEqual([10287, 10419, 10473]);
  expect(told[0]).toMatchObject({ taskId: "swj3zc4w" });
  expect(told[0]!.text).toContain("3 reviews went to GitHub");
  const writes = core.log.read({ stream: "channel", kinds: ["source_write"], limit: 20 }).map((e) => e.body as Bodies["source_write"]);
  expect(writes.filter((w) => w.op === "review" && w.by === "go" && w.decisionId === c3[1]!.decisionId).length).toBe(3);
  expect(ts.pile.read("nowledge-co/mem#10419")!.state).toBe("sent");
  expect(ts.pile.standing("swj3zc4w")!.drafted).toBe(0);

  // The same head again after it was posted: nothing new to ask.
  await call(core, "swj3zc4w", { prs: [{ ref: "nowledge-co/mem#10419", head: "beefcafe", changed: true, notes: [note("Recall reads every space the token can't see.", 40)] }] });
  expect(cards(core).length).toBe(2);
});

test("Hold posts nothing; the drafts stay; a task not about reviewing never sees the tool", async () => {
  const { core, gh, told, open, ts } = boot(false);
  await ts.add("github");
  await ts.look();
  open("t2", "Review requests", "Every 45 minutes, review the PRs that request my review in nowledge-co.", { reviews: true });
  await call(core, "t2", { prs: [{ ref: "nowledge-co/mem#10287", changed: true, notes: [note("The batch size is read before it is checked.")] }] });
  const c = cards(core)[0]!;
  expect(c.question).toBe("1 PR review is written. Post it to GitHub?");
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: c.decisionId, option: "hold", by: "user" } });
  await until(() => told.length === 1);
  expect(told[0]!.text).toContain("nothing was posted");
  expect(gh.reviews).toEqual([]);
  expect(ts.pile.read("nowledge-co/mem#10287")!.state).toBe("drafted");
  // Its own sheet can still send it (the Go given there).
  expect((await ts.pile.sendRead("nowledge-co/mem#10287", [0])).ok).toBe(true);
  expect(gh.reviews.length).toBe(1);

  expect(core.mcp.listed({ role: "task", taskId: "t2" } as never)).toContain("review_report");
  open("t3", "Fix the flaky test", "Fix the flaky test in ~/dev/foo.");
  expect(core.mcp.listed({ role: "task", taskId: "t3" } as never)).not.toContain("review_report");
});

test("Ongoing: an unanswered round card puts the review task under 等你; Post or Not now puts it back to 等下一次", async () => {
  const { core, open, ts } = boot();
  await ts.add("github");
  await ts.look();
  open("swj3zc4w", "看 nowledge-co 的评审请求", "每 45 分钟 review 一次 nowledge-co 里请我 review 的 PR。", { reviews: true });
  core.log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId: "w_next", taskId: "swj3zc4w", wakes: "task", reason: "再看一轮评审请求", state: "armed", at: new Date(Date.now() + 45 * 60_000).toISOString() } as Bodies["waiter"] });
  const frames: { t: string; id?: string; items?: { id: string; state: string; reviews?: { drafted: number } }[] }[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((r) => (ws.onopen = () => r()));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  await until(() => frames.some((f) => f.t === "on_hand"));
  let k = 0;
  const ask = async () => {
    const id = `q${++k}`;
    ws.send(JSON.stringify({ t: "ongoing", id }));
    await until(() => frames.some((f) => f.t === "ongoing_result" && f.id === id));
    return frames.find((f) => f.t === "ongoing_result" && f.id === id)!.items!.find((i) => i.id === "swj3zc4w")!;
  };
  const pushed = (state: string) => frames.some((f) => f.t === "ongoing_result" && !f.id && f.items?.find((i) => i.id === "swj3zc4w")?.state === state);
  expect((await ask()).state).toBe("resting");
  await call(core, "swj3zc4w", { prs: [{ ref: "nowledge-co/mem#10287", head: "a1b2c3d", changed: true, notes: [note("The batch size is read before it is checked.")] }, { ref: "nowledge-co/mem#8528", changed: false }] });
  expect(await ask()).toMatchObject({ state: "needs_you", reviews: { drafted: 1 } });
  // Pushed to every window as it changes, without asking.
  await until(() => pushed("needs_you"));
  // One needs-you for the person: the card itself; the task's own state stays as it was.
  expect(core.tasks.get("swj3zc4w")!.attention).not.toBe("needs_you");
  const card = cards(core)[0]!;
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card.decisionId, option: "hold", by: "user" } });
  await until(() => pushed("resting"));
  expect((await ask()).state).toBe("resting");
});

async function until(ok: () => unknown, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

// D528: hel's round 298 reported once at 06:26:01, a request arrived at 06:26:40, the end-of-round
// look found it at 06:27:17, and the board showed it only a round later. Now the final look's
// report replaces the first in the same round, and the new request is said once.
test("a request that arrives between the first look and the final look is in that round's report and board, said once", async () => {
  const { core, open, ts } = boot();
  await ts.add("github");
  await ts.look();
  open("swj3zc4w", "持续评审 nowledge-co 的 PR", "每 45 分钟 review 一次 nowledge-co 里请我 review 的 PR，结束之前再看一次有没有新的请求。", { reviews: true });
  const wake = (waiterId: string) => core.log.append({ stream: "channel", origin: "system", kind: "waiter", body: { waiterId, taskId: "swj3zc4w", wakes: "task", state: "fired", reason: "再看一轮评审", at: new Date(NOW).toISOString() } });
  const lines = () => core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 100 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  const two = [
    { ref: "nowledge-co/mem#11092", head: "753a729", changed: false },
    { ref: "nowledge-co/mem#11093", head: "27428e4", changed: false },
  ];
  const site = { ref: "nowledge-co/nowledge-labs-website#551", title: "Shared H2 at 20 px", head: "b4bb875", changed: false };

  // Round 297: the first round ever says nothing of its requests (its report is the whole list).
  wake("w_297");
  await call(core, "swj3zc4w", { prs: two });
  expect(lines()).toEqual([]);

  // Round 298: the first look reports two; the end-of-round look finds the website's request.
  wake("w_298");
  await call(core, "swj3zc4w", { prs: two });
  expect(ts.pile.rounds("swj3zc4w")).toBe(2);
  const a = await call(core, "swj3zc4w", { prs: [...two, site] });
  expect(a).toContain("replaces this round's earlier review_report");
  expect(ts.pile.rounds("swj3zc4w")).toBe(2);
  const board = ts.pile.board("swj3zc4w")!;
  expect(board.waiting).toBe(3);
  expect(board.prs.map((p) => p.ref)).toContain("nowledge-co/nowledge-labs-website#551");
  expect(ts.pile.standing("swj3zc4w")).toMatchObject({ waiting: 3 });
  expect(lines()).toEqual(["新来了一个评审请求：[nowledge-labs-website#551](https://github.com/nowledge-co/nowledge-labs-website/pull/551)「Shared H2 at 20 px」。"]);

  // The same report again, and the next round with the same PR at the same head: never said again.
  await call(core, "swj3zc4w", { prs: [...two, site] });
  wake("w_299");
  await call(core, "swj3zc4w", { prs: [...two, site] });
  expect(ts.pile.rounds("swj3zc4w")).toBe(3);
  expect(lines()).toHaveLength(1);
  // Nothing about a line said is internal: the standing has no round bookkeeping in it.
  expect(Object.keys(ts.pile.standing("swj3zc4w")!)).not.toContain("told");
});
