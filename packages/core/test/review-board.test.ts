// D407: a routine fills a small app. The review routine's rounds (review_report) keep 审查看板 /
// Review board current, from the same state the Ongoing card's line reads; any other repeating
// task given an app writes its data with app_data (data only, capped, rate-limited); Ducter offers
// once, after a few rounds of the same shape. Fake gh, no model: never the real GitHub.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { APP_TASK_WRITES_PER_HOUR, appDocument, appLint, appShowRef, type Bodies, type OngoingItem, type ReviewBoard, type ServerFrame, type Runner, type TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { REVIEW_BOARD_HTML } from "../src/review-board.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const NOW = Date.parse("2026-11-20T05:37:00Z");
const pr = (repo: string, number: number, title: string): FakeIssue => ({ repo, number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number * 1000).toISOString(), diff: "diff --git a/x b/x\n+x\n" });

function boot(zh = true) {
  const t = tempDir();
  const gh = fakeGh([pr("nowledge-co/mem", 10287, "Distill memories in batches"), pr("nowledge-co/mem", 10473, "Keep the pinned message"), pr("nowledge-co/hawdb", 412, "Compaction: skip empty runs")], { login: "lin-dev" });
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-20", now: () => NOW } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: zh ? "zh" : "en" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  const runner = {
    harness: { start: async () => Promise.reject(new Error("no model in this test")), available: async () => [] },
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
  // D615: a board is only for work that comes back in rounds; a loop's own fact says so.
  const loop = (taskId: string) => core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_loop", body: { taskId, state: "on", reason: "every round", since: new Date(NOW).toISOString() } });
  return { core, gh, told, open, loop, ts: core.taskSources };
}

const decisions = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).map((e) => e.body as Bodies["decision"]);
const offers = (core: ReturnType<typeof startCore>) => decisions(core).filter((d) => d.board);
const call = (core: ReturnType<typeof startCore>, taskId: string, tool: string, args: unknown) => core.mcp.call({ role: "task", taskId } as never, tool, args) as Promise<string>;
const note = (text: string, kind = "problem", line = 12) => ({ kind, path: "src/distill.rs", line, text });
const round = (heads: { a?: string; b?: string } = {}) => ({
  prs: [
    { ref: "nowledge-co/mem#10287", title: "Distill memories in batches", head: heads.a ?? "a1b2c3d", ci: "failing", changed: !!heads.a || !heads.b, notes: [note("The batch size is read before it is checked."), note("A test for an empty batch would help.", "suggestion")] },
    { ref: "nowledge-co/mem#10473", title: "Keep the pinned message", head: heads.b ?? "f098abc", ci: "passing", changed: !!heads.b, notes: heads.b ? [note("Trimming counts the pinned message twice.", "problem", 88)] : [] },
    { ref: "nowledge-co/hawdb#412", title: "Compaction: skip empty runs", head: "0c0ffee", ci: "pending", changed: false },
  ],
});
async function ongoing(core: ReturnType<typeof startCore>): Promise<OngoingItem[]> {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "ongoing", id: "q1" }));
  for (let i = 0; i < 300; i++) {
    const hit = frames.find((f) => f.t === "ongoing_result") as Extract<ServerFrame, { t: "ongoing_result" }> | undefined;
    if (hit) return hit.items;
    await Bun.sleep(10);
  }
  throw new Error("no ongoing_result");
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test("three rounds of review_report offer a board once; Go makes the review board from the template, filled and given to the task", async () => {
  const { core, told, open, loop, ts } = boot();
  await ts.add("github");
  await ts.look();
  open("trev", "看 nowledge-co 的评审请求", "每 45 分钟 review 一次 nowledge-co 里请我 review 的 PR。", { reviews: true });
  loop("trev");
  await call(core, "trev", "review_report", round());
  await call(core, "trev", "review_report", { prs: round().prs.map((p) => ({ ...p, changed: false, notes: [] })) });
  expect(offers(core)).toHaveLength(0);
  await call(core, "trev", "review_report", { prs: round().prs.map((p) => ({ ...p, changed: false, notes: [] })) });
  const o = offers(core);
  expect(o).toHaveLength(1);
  expect(o[0]).toMatchObject({ question: "要不要把这些做成一个看板？", goLabel: "做成看板", holdLabel: "不用了", defaultOption: "hold", board: { taskId: "trev", kind: "reviews" } });
  // Never asked twice.
  await call(core, "trev", "review_report", { prs: round().prs.map((p) => ({ ...p, changed: false, notes: [] })) });
  expect(offers(core)).toHaveLength(1);

  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: o[0]!.decisionId, option: "go", by: "user" } });
  await settle();
  const apps = core.apps.list(core.persona.id);
  expect(apps).toHaveLength(1);
  expect(apps[0]).toMatchObject({ name: "审查看板", kind: "reviews", task: { id: "trev" } });
  const card = core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 20 }).map((e) => e.body as Bodies["ai_msg"]).find((b) => b.app);
  expect(card?.app).toMatchObject({ id: apps[0]!.id, change: "made" });
  expect(told.some((t) => t.taskId === "trev" && /review_report/.test(t.text) && /审查看板/.test(t.text))).toBe(true);
  const board = core.apps.data(apps[0]!.id).board as ReviewBoard;
  expect(board.waiting).toBe(3);
  expect(board.drafted).toBe(1);
  expect(board.prs.find((p) => p.ref === "nowledge-co/mem#10287")).toMatchObject({ title: "Distill memories in batches", head: "a1b2c3d", ci: "failing", draft: "drafted", problems: 1, suggestions: 1 });
  expect(board.prs.find((p) => p.ref === "nowledge-co/hawdb#412")).toMatchObject({ ci: "pending", draft: "none", problems: 0, changed: false });

  // The Ongoing card opens the same app; its line and the board read the same state.
  core.log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId: "w_next", taskId: "trev", wakes: "task", reason: "再看一轮评审请求", state: "armed", at: new Date(Date.now() + 45 * 60_000).toISOString() } as Bodies["waiter"] });
  const og = (await ongoing(core)).find((x) => x.taskId === "trev");
  expect(og?.app).toEqual({ id: apps[0]!.id, name: "审查看板" });
  expect(og?.reviews?.drafted).toBe(board.drafted);
});

test("each round writes the board as the task saw it, and a Go on the round card shows as posted", async () => {
  const { core, open, loop, ts } = boot();
  await ts.add("github");
  await ts.look();
  open("trev", "Review my requests in nowledge-co", "Every 45 minutes, review the PRs in nowledge-co that request my review.", { reviews: true });
  loop("trev");
  await call(core, "trev", "review_report", round());
  const r = core.apps.list(core.persona.id);
  expect(r).toHaveLength(0);
  // The partner's tool path: a review task's board without a file.
  const b = core.boards!.makeReviewBoard("trev");
  expect(b.ok).toBe(true);
  const id = (b as { app: { id: string } }).app.id;
  const seen: unknown[] = [];
  core.apps.onChange((c) => c.kind === "data" && c.id === id && seen.push(c));
  await call(core, "trev", "review_report", round({ b: "beefcafe" }));
  expect(seen.at(-1)).toMatchObject({ kind: "data", key: "board", by: "task" });
  let board = core.apps.data(id).board as ReviewBoard;
  expect(board.prs.find((p) => p.ref === "nowledge-co/mem#10473")).toMatchObject({ head: "beefcaf", changed: true, draft: "drafted", problems: 1 });
  expect(board.drafted).toBe(2);
  const roundCard = decisions(core).filter((d) => d.src?.kind === "reviews").at(-1)!;
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: roundCard.decisionId, option: "go", by: "user" } });
  for (let i = 0; i < 40 && (core.apps.data(id).board as ReviewBoard).drafted; i++) await settle();
  board = core.apps.data(id).board as ReviewBoard;
  expect(board.drafted).toBe(0);
  expect(board.prs.filter((p) => p.draft === "sent").map((p) => p.ref).sort()).toEqual(["nowledge-co/mem#10287", "nowledge-co/mem#10473"]);
  // The task can't write the review board itself: its data is Ducter's, from review_report.
  expect(core.mcp.listed({ role: "task", taskId: "trev" } as never)).not.toContain("app_data");
});

test("app_data: a task given an app writes its data, nothing else; capped and rate-limited", async () => {
  const { core, told, open } = boot(false);
  open("tfare", "Train fares to Shanghai", "Every morning, check the G-train fares Beijing to Shanghai for Friday.");
  open("tother", "Something else", "Fix the flaky test.");
  expect(core.mcp.listed({ role: "task", taskId: "tfare" } as never)).not.toContain("app_data");
  const html = `<ul id="l"></ul><script>var f=ducter.get("fares")||[];document.getElementById("l").textContent=f.length</script>`;
  const m = core.apps.make(core.persona.id, { name: "Fares", html, task: { id: "tfare", title: "Train fares to Shanghai" } });
  expect(m.ok).toBe(true);
  const id = (m as { app: { id: string } }).app.id;
  await settle();
  expect(told.find((t) => t.taskId === "tfare")?.text).toMatch(new RegExp(`app_data.*app ${id}.*fares`, "s"));
  expect(core.mcp.listed({ role: "task", taskId: "tfare" } as never)).toContain("app_data");
  expect(core.mcp.listed({ role: "task", taskId: "tother" } as never)).not.toContain("app_data");
  expect(await call(core, "tfare", "app_data", { app: id, set: { fares: [{ train: "G1", price: 553 }], at: "07:00" } })).toMatch(/^Kept: fares, at/);
  expect(core.apps.data(id)).toEqual({ fares: [{ train: "G1", price: 553 }], at: "07:00" });
  expect(core.apps.html(id)).toBe(html);
  expect(await call(core, "tfare", "app_data", { app: id, set: { at: null } })).toMatch(/^Kept/);
  expect(core.apps.data(id)).toEqual({ fares: [{ train: "G1", price: 553 }] });
  // Another task's app, a bad key, too much, too often.
  expect(core.apps.fill(id, "tother", { x: 1 })).toMatchObject({ ok: false });
  expect(await call(core, "tfare", "app_data", { app: id, set: {} })).toMatch(/at least one key/);
  expect(await call(core, "tfare", "app_data", { app: id, set: { ["k".repeat(65)]: 1 } })).toMatch(/printable/);
  expect(await call(core, "tfare", "app_data", { app: id, set: { big: "x".repeat(600_000) } })).toMatch(/over/);
  for (let i = 0; i < APP_TASK_WRITES_PER_HOUR; i++) core.apps.fill(id, "tfare", { n: i });
  expect(await call(core, "tfare", "app_data", { app: id, set: { n: 99 } })).toMatch(/this hour/);
});

test("another repeating task: three done reports while it rests on its own timer offer a board once; Go is the partner's to make", async () => {
  const { core, open, loop } = boot();
  open("tfare", "上海高铁票价", "每天早上看一下周五北京到上海的高铁票价。");
  loop("tfare");
  const report = (n: number) => core.log.append({ stream: "channel", origin: "task", kind: "report", body: { taskId: "tfare", state: "done", summary: `第 ${n} 轮：G1 553 元，G3 553 元，G5 626 元。`, questions: [], evidence: [] } });
  core.waiters.arm({ taskId: "tfare", wakes: "task", reason: "明早再看一次票价", at: new Date(Date.now() + 86_400_000).toISOString() } as never);
  report(1);
  report(2);
  expect(offers(core)).toHaveLength(0);
  report(3);
  expect(offers(core)).toHaveLength(1);
  expect(offers(core)[0]!.board).toMatchObject({ taskId: "tfare", kind: "reports", title: "上海高铁票价" });
  report(4);
  expect(offers(core)).toHaveLength(1);
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: offers(core)[0]!.decisionId, option: "go", by: "user" } });
  await settle();
  // Core makes nothing for reports: the partner wakes on the Go and writes the app.
  expect(core.apps.list(core.persona.id)).toHaveLength(0);
});

test("the review board's file passes the lint, and its 看草稿 asks the client to open one draft", () => {
  expect(appLint(REVIEW_BOARD_HTML)).toEqual([]);
  expect(REVIEW_BOARD_HTML).toContain('ducter.open({ draft: p.ref })');
  const doc = appDocument({ id: "a1", name: "审查看板", html: REVIEW_BOARD_HTML, data: {} }, { transport: "message", lang: "zh" });
  expect(doc).toContain('post({t:"show",draft:d})');
  expect(appShowRef({ draft: "nowledge-co/mem#10287" })).toBe("nowledge-co/mem#10287");
  expect(appShowRef({ draft: "javascript:alert(1)" })).toBeUndefined();
  expect(appShowRef("nowledge-co/mem#1")).toBeUndefined();
});

test("a round's done report from a task that keeps an app current wakes nobody; a question still does", async () => {
  const { core, open } = boot();
  let woke = 0;
  core.setPartner({ onTrigger: () => void woke++ });
  open("tfare", "上海高铁票价", "每天早上看一下周五北京到上海的高铁票价。");
  core.apps.make(core.persona.id, { name: "高铁票价", html: "<p>x</p>", task: { id: "tfare", title: "上海高铁票价" } });
  core.log.append({ stream: "task:tfare", origin: "task", kind: "report", body: { taskId: "tfare", state: "done", summary: "第 4 轮：看板已更新。", questions: [], evidence: [] } });
  await settle();
  expect(woke).toBe(0);
  core.log.append({ stream: "task:tfare", origin: "task", kind: "report", body: { taskId: "tfare", state: "blocked", summary: "12306 要重新登录。", questions: [], evidence: [] } });
  await settle();
  expect(woke).toBeGreaterThan(0);
});
