// D633: one settle path for everything Ducter holds about an outside thing. The holders are a
// task, a hand-off, a Keep's held item (a helper's, a loop's, a routine's watch) and a wait. The
// fixtures are hel's whole shape (data, not code: one helper Keep among the holders) and a second,
// different shape (a loop Keep watching an issue, a task waiting on someone else's PR). Nothing here
// is named after one helper: the helper is just one holder in the data.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import type { Exec } from "@ducter/protocol/src/checks-run.ts";
import { startCore } from "../src/core.ts";
import { FakeClock } from "../src/clock.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const HELPER = "PR helper";

function boot(dir: string, o: { clock?: FakeClock; exec?: Exec; holdingsEveryMs?: number } = {}) {
  const clock = o.clock ?? new FakeClock(Date.parse("2026-11-27T06:44:00Z"));
  const core = startCore({
    dataDir: dir,
    port: 0,
    batchMs: 5,
    clock,
    keeps: { endAsk: async () => ({}) },
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" },
    ...(o.exec || o.holdingsEveryMs !== undefined ? { work: { ...(o.exec ? { exec: o.exec } : {}), ...(o.holdingsEveryMs !== undefined ? { holdingsEveryMs: o.holdingsEveryMs } : {}) } } : {}),
  });
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("not here");
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  stops.push(() => core.stop());
  return { core, clock };
}

const seed = (core: ReturnType<typeof boot>["core"], taskId: string, title: string, brief = "x") =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief } });

const report = (core: ReturnType<typeof boot>["core"], taskId: string, state: Bodies["report"]["state"], text: string, evidence: Bodies["report"]["evidence"] = []) =>
  core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary: text, questions: [], evidence } });

const armed = (core: ReturnType<typeof boot>["core"], taskId: string, waiterId: string, reason: string, check?: Bodies["waiter"]["check"]) =>
  core.log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId, reason, taskId, state: "armed", wakes: "task", ...(check ? { check, kind: "check" } : {}), at: "2026-11-27T06:30:00.000Z" } });

const owned = (core: ReturnType<typeof boot>["core"], taskId: string, ref: string, state: "open" | "merged" | "closed") =>
  core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr: ref, news: [], seen: { since: "2026-11-27T06:00:00.000Z", state } } });

function helper(core: ReturnType<typeof boot>["core"]) {
  const made = core.helpers.make({ name: HELPER, about: "PRs", brief: "Own each PR to the end." });
  if (!made.ok) throw new Error(made.error);
  core.keeps.sync();
  return made.helper;
}

const sleep = async (n = 30) => {
  for (let i = 0; i < n; i++) await Bun.sleep(2);
};

/** A tiny GitHub over a mutable map: owner/repo#n → its true state. */
function fakeGh(state: Map<string, "open" | "merged" | "closed">): Exec {
  return async (argv) => {
    const path = argv[2] ?? "";
    const m = /^repos\/([^/]+\/[^/]+)\/(pulls|issues)\/(\d+)$/.exec(path);
    if (!m) return { exitCode: 1, stdout: "not found" };
    const s = state.get(`${m[1]}#${m[3]}`) ?? "open";
    return { exitCode: 0, stdout: JSON.stringify(m[2] === "pulls" ? { state: s === "merged" ? "closed" : s, merged: s === "merged" } : { state: s === "merged" ? "closed" : s }) };
  };
}

const summaries = (core: ReturnType<typeof boot>["core"]) => core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 200 }).map((e) => e.body as Bodies["ai_msg"]).filter((b) => b.settled);
const lines = (core: ReturnType<typeof boot>["core"], taskId: string) => core.log.read({ stream: `task:${taskId}`, kinds: ["task_event"], limit: 200 }).map((e) => e.body as Bodies["task_event"]).filter((b) => b.from === "ducter");

const HANDOFFS = ["nowledge-co/mem#11441", "nowledge-co/mem-backbone#378", "nowledge-co/mem#11389", "nowledge-co/mem#11408"];
const IDS = ["plus-a", "plus-b", "loop11406", "verify", "takeover", ...HANDOFFS.map((_, i) => `sender${i}`)];

describe("D633: anything Ducter holds about an outside thing settles when it ends", () => {
  test("hel's whole shape: helper Keep, four hand-offs, two stale Plus tasks, a #11406 loop Keep, the verification task — all settle; one summary; once", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const gh = new Map<string, "open" | "merged" | "closed">(HANDOFFS.map((r) => [r, "open" as const]));
    gh.set("nowledge-co/mem#11406", "open");
    {
      const { core } = boot(t.dir, { exec: fakeGh(gh) });
      const h = helper(core);
      for (const [i, ref] of HANDOFFS.entries()) {
        seed(core, `sender${i}`, `跟进 ${ref}`);
        armed(core, `sender${i}`, `w${i}`, "等回执");
        core.tasks.setState(`sender${i}`, "blocked", "parked");
        core.handoffs.giveLocal({ helper: h, text: `请接手 https://github.com/${ref.replace("#", "/pull/")}`, fromTask: `sender${i}`, fromName: "Ducter" });
      }
      // The two Plus tasks: merged, their loop ended by the person, left working/parked (the old bug).
      for (const id of ["plus-a", "plus-b"]) {
        seed(core, id, `Plus 年付修复 ${id}`);
        report(core, id, "done", "已合并。");
        await sleep();
        core.log.append({ stream: `task:${id}`, origin: "system", kind: "task_loop", body: { taskId: id, state: "ended", endedBy: "user", before: "done_claimed", reason: "等回执", since: "2026-11-27T06:00:00.000Z", by: "rounds" } });
        core.log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: "working", residency: "parked" } });
      }
      // A loop Keep whose PR is open: its own c.prs holds the item.
      seed(core, "loop11406", "盯 mem#11406 的收尾", "每 45 分钟看一下 mem#11406");
      const w = (await core.mcp.call({ role: "task", taskId: "loop11406" } as never, "wait_for", { reason: "等 nowledge-co/mem#11406 合并", afterMinutes: 45 })) as { ok: boolean };
      expect(w.ok).toBe(true);
      await sleep();
      owned(core, "loop11406", "nowledge-co/mem#11406", "open");
      // A verification task whose own report says the release shipped, still on a timer.
      seed(core, "verify", "验证 v0.10.125 的修复");
      report(core, "verify", "done", "修复已在 v0.10.125 发版。");
      await sleep();
      armed(core, "verify", "wv", "等发版确认");
      core.tasks.setState("verify", "blocked", "parked");
      // The takeover: a task waiting on someone else's hand-off item by its number.
      seed(core, "takeover", "#11389 接手任务");
      armed(core, "takeover", "wt", "等 #11389 合并");
      core.tasks.setState("takeover", "blocked", "parked");
      await sleep();
    }
    // The first start of the new version: the true states are read, every holder settles, the repair runs.
    let second: ReturnType<typeof boot>;
    for (const r of [...HANDOFFS, "nowledge-co/mem#11406"]) gh.set(r, "merged");
    {
      second = boot(t.dir, { exec: fakeGh(gh), holdingsEveryMs: 60 * 60_000 });
      await sleep(60);
      for (const id of IDS) expect(["working", "blocked", "queued"]).not.toContain(second.core.tasks.get(id)?.attention);
      for (const id of IDS) expect(["done", "done_claimed", "failed"]).toContain(second.core.tasks.get(id)?.attention);
      for (const hand of second.core.handoffs.all()) expect(["settled", "done", "returned", "declined", "withdrawn"]).toContain(hand.state);
      const helperKeep = second.core.keeps.all().find((k) => k.from.kind === "helper")!;
      expect(second.core.keeps.page(helperKeep.keepId)?.handoffs?.every((x) => x.state === "settled" || x.state === "done")).toBe(true);
      const loopKeep = second.core.keeps.all().find((k) => k.from.kind === "loop" && k.from.taskId === "loop11406")!;
      expect(loopKeep.life).toBe("done");
      expect(lines(second.core, "loop11406").some((b) => b.text?.includes("#11406 已合并，这件结束。"))).toBe(true);
      // The Keep's own round records the same line (not only the task transcript).
      expect(second.core.keeps.page(loopKeep.keepId)?.rounds.some((r) => r.report?.includes("#11406 已合并，这件结束。"))).toBe(true);
      const sums = summaries(second.core);
      expect(sums).toHaveLength(1);
      expect(sums[0]!.settled).toMatchObject({ prs: 5, issues: 0 });
      // research/244 rule 4: each one by its title, not a count; the verb once (rule: the fix).
      expect(sums[0]!.text).toContain("「跟进 nowledge-co/mem#11441」");
      expect(sums[0]!.text).toContain("「盯 mem#11406 的收尾」");
      expect(sums[0]!.text).toContain("都合并了");
      expect(sums[0]!.text.match(/都合并了/g)).toHaveLength(1);
      expect(sums[0]!.text).not.toMatch(/^\d+ 个 PR/);
      expect(sums[0]!.text).toContain("收了尾");
      expect(sums[0]!.settled).toMatchObject({ prs: 5, issues: 0 });
      expect((sums[0]!.settled as { names?: unknown[] }).names).toHaveLength(5);
    }
    // The repair ran once: a second start changes nothing and says nothing.
    {
      const third = boot(t.dir, { exec: fakeGh(gh), holdingsEveryMs: 60 * 60_000 });
      await sleep(50);
      expect(summaries(third.core)).toHaveLength(1);
      expect(third.core.log.read({ stream: `task:loop11406`, kinds: ["task_event"], limit: 200 }).filter((e) => (e.body as Bodies["task_event"]).from === "ducter")).toHaveLength(1);
    }
  });

  test("a second shape: a loop Keep watching an issue, and a task waiting on someone else's PR — both settle by the same path", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const gh = new Map<string, "open" | "merged" | "closed">([
      ["acme/site#42", "open"],
      ["acme/app#77", "open"],
    ]);
    {
      const { core } = boot(t.dir, { exec: fakeGh(gh) });
      seed(core, "issuewatch", "盯 acme/site#42", "每 30 分钟看一下 acme/site#42 是否关闭");
      const w = (await core.mcp.call(
        { role: "task", taskId: "issuewatch" } as never,
        "wait_for",
        { reason: "等 acme/site#42 关闭", everyMinutes: 5, check: { argv: ["gh", "api", "repos/acme/site/issues/42", "--jq", "{state: .state}"], succeedWhen: { path: "state", equals: "closed" } } },
      )) as { ok: boolean };
      expect(w.ok).toBe(true);
      seed(core, "wait77", "等别人的 PR #77");
      report(core, "wait77", "progress", "等 acme/app#77 合并后收尾。", [{ kind: "url", label: "PR", ref: "https://github.com/acme/app/pull/77" }]);
      await sleep();
      armed(core, "wait77", "w77", "等 acme/app#77 合并");
      core.tasks.setState("wait77", "blocked", "parked");
      await sleep();
    }
    gh.set("acme/site#42", "closed");
    gh.set("acme/app#77", "merged");
    {
      const { core } = boot(t.dir, { exec: fakeGh(gh), holdingsEveryMs: 60 * 60_000 });
      await sleep(60);
      expect(core.tasks.get("issuewatch")!.attention).toBe("done");
      expect(core.tasks.get("wait77")!.attention).toBe("done");
      const loopKeep = core.keeps.all().find((k) => k.from.kind === "loop" && k.from.taskId === "issuewatch")!;
      expect(loopKeep.life).toBe("done");
      const sums = summaries(core);
      expect(sums).toHaveLength(1);
      expect(sums[0]!.settled).toMatchObject({ prs: 1, issues: 1 });
      // research/244 rule 4: the issue and the PR by their titles; one verb per kind.
      expect(sums[0]!.text).toContain("「盯 acme/site#42」");
      expect(sums[0]!.text).toContain("「等别人的 PR #77」");
      // one of each kind: each its verb once, and 都 only over two or more.
      expect(sums[0]!.text).toContain("」关闭了");
      expect(sums[0]!.text).toContain("」合并了");
      expect(sums[0]!.text).not.toContain("都关闭了");
      expect(sums[0]!.text).not.toContain("都合并了");
    }
  });

  test("one settle path: a merged hand-off settles and its task is done; an open PR stays given and waiting; no news, no line", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const gh = new Map<string, "open" | "merged" | "closed">([
      ["nowledge-co/mem#1", "merged"],
      ["nowledge-co/mem#2", "open"],
    ]);
    const { core } = boot(t.dir, { exec: fakeGh(gh), holdingsEveryMs: 0 });
    const h = helper(core);
    for (const n of [1, 2]) {
      seed(core, `t${n}`, `跟进 mem#${n}`);
      armed(core, `t${n}`, `w${n}`, "等回执");
      core.tasks.setState(`t${n}`, "blocked", "parked");
      core.handoffs.giveLocal({ helper: h, text: `请接手 https://github.com/nowledge-co/mem/pull/${n}`, fromTask: `t${n}`, fromName: "Ducter" });
    }
    await sleep();
    await core.holdings.sweep();
    await sleep();
    expect(core.handoffs.all().find((x) => x.item.ref === "nowledge-co/mem#1")?.state).toBe("settled");
    expect(core.tasks.get("t1")!.attention).toBe("done");
    expect(core.handoffs.all().find((x) => x.item.ref === "nowledge-co/mem#2")?.state).toBe("given");
    expect(core.tasks.get("t2")!.attention).toBe("blocked");
    expect(summaries(core)).toHaveLength(1);
    await core.holdings.sweep();
    expect(summaries(core)).toHaveLength(1); // nothing closed, nothing said
  });
});
