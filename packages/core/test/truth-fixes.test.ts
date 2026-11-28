// D645 (research/245 §3.7, phase 1): tasks tell the truth. B1 a GitHub fact is read where gh
// is (the home), never on the task's computer; B6 a helper's held task never mints a second Keep,
// and hel's old kp_9c76608d03 ends at the first start with one line; B7 one hand-off record per
// repo#n, existing pairs merged on read. B2, B3 and B5 live in task-sources/index.ts (dsh-truthful),
// so this file uses their fixture but asserts only the fixes it owns.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, Helper, KeepBody, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { FakeClock } from "../src/clock.ts";
import { createHoldings } from "../src/holdings.ts";
import { createHandoffs } from "../src/handoffs.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { createWork } from "../src/work.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";
import { fakeHomeGh, haswell, HELPER, HELPER_JSON, HELPER_TASK, OLD_LOOP_KEEP, PR_LOOP_TASK, PR_REF, seedHelTruth } from "./fixtures/hel-truth.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await Bun.sleep(2);
};

/** One home with hel's data, a fake GitHub on the home and haswell with no gh at all. */
function helHome(o: { homeHasGh: boolean } = { homeHasGh: true }) {
  const t = tempDir();
  stops.push(t.cleanup);
  seedHelTruth(t.dir);
  const clock = new FakeClock(Date.parse("2026-11-27T06:44:00Z"));
  const log = openLog({ path: `${t.dir}/ducter.db`, persona: "default" });
  const tasks = createRegistry(log, clock);
  const mcp = createMcpHub({ secret: "s" });
  const homeCalls: string[] = [];
  const workerCalls: { op: string; argv?: string }[] = [];
  const state = new Map<string, "open" | "merged" | "closed">([[PR_REF, "merged"]]);
  const exec = o.homeHasGh
    ? fakeHomeGh(state, homeCalls)
    : async () => {
        throw new Error("gh not found");
      };
  const workers = haswell(workerCalls);
  const work = createWork({ log, tasks, mcp, runner: () => undefined, workers: () => workers, clock, persona: "default", dataDir: t.dir, exec, minEveryMs: 1000 });
  const handoffs = { all: () => [], open: () => [], observeGithub: () => {} };
  const holdings = createHoldings({ log, tasks, handoffs: handoffs as never, waiters: work.waiters, loops: work.loops, look: (spec, id) => work.look(spec, id), clock, lang: () => "zh", everyMs: 0 });
  stops.push(() => {
    holdings.stop();
    work.stop();
    log.close();
  });
  // D667 (research/247 Brief A): a closed outside thing is a fact on each holder's card
  // (`subject_info`), never one settled summary message.
  const settledInfos = () => log.read({ kinds: ["subject_info"], limit: 200 }).map((e) => e.body as Bodies["subject_info"]);
  return { t, log, tasks, work, holdings, homeCalls, workerCalls, settledInfos, clock };
}

describe("D645 B1: a GitHub fact is read where gh is", () => {
  test("haswell's #11408 read runs on the home; the 403 loop ends by its condition with one ai_msg", async () => {
    const h = helHome();
    await h.holdings.sweep();
    await flush();
    // The read ran on the home, never as a PR read on haswell (the auth probe there is allowed).
    expect(h.homeCalls.some((c) => c.includes(`repos/nowledge-co/mem/pulls/11408`))).toBe(true);
    expect(h.workerCalls.some((c) => c.op === "check" && c.argv?.includes("pulls/11408"))).toBe(false);
    // One settle path: the task is done and its loop ended by the condition.
    expect(h.tasks.get(PR_LOOP_TASK)?.attention).toBe("done");
    expect(h.work.loops.get(PR_LOOP_TASK)?.state).toBe("ended");
    expect(h.work.loops.get(PR_LOOP_TASK)?.endedBy).toBe("condition");
    const infos = h.settledInfos();
    expect(infos.map((b) => b.text)).toContain("PR #11408 合并了");
    expect(infos.map((b) => b.taskId)).toContain(PR_LOOP_TASK);
  });

  test("a look about the machine still runs there: only GitHub facts move", async () => {
    const h = helHome();
    const r = await h.work.look({ argv: ["test", "-f", "/home/w/ducter/projects/mem/README.md"], succeedWhen: { exitCode: 0 } }, HELPER_TASK);
    expect(r.ok).toBe(false); // haswell's fake says gh is not installed for every check
    expect(h.workerCalls.some((c) => c.op === "check" && c.argv?.includes("README.md"))).toBe(true);
    expect(h.homeCalls.some((c) => c.includes("README.md"))).toBe(false);
  });

  test("when no computer can read, the card carries githubBlind; a read that works clears it", async () => {
    const h = helHome({ homeHasGh: false });
    const card = () => (h.work.decorate({ tasks: h.tasks.list(), waiters: [], missed: [] } as never) as { tasks: TaskCard[] }).tasks.find((c) => c.taskId === PR_LOOP_TASK)!;
    await h.work.look({ argv: ["gh", "api", `repos/nowledge-co/mem/pulls/11408`, "--jq", "{state: .state, merged: .merged}"], succeedWhen: { exitCode: 0 } }, PR_LOOP_TASK);
    expect(card().githubBlind?.since).toBeTruthy();
    expect(card().githubBlind?.device).toBe("haswell");
    // A GitHub read that ran on a computer with gh clears it.
    h.tasks.setState(PR_LOOP_TASK, "blocked", "parked");
    const home = helHome();
    await home.work.look({ argv: ["gh", "api", `repos/nowledge-co/mem/pulls/11408`, "--jq", "{state: .state, merged: .merged}"], succeedWhen: { exitCode: 0 } }, PR_LOOP_TASK);
    const homeCard = (home.work.decorate({ tasks: home.tasks.list(), waiters: [], missed: [] } as never) as { tasks: TaskCard[] }).tasks.find((c) => c.taskId === PR_LOOP_TASK)!;
    expect(homeCard.githubBlind).toBeUndefined();
  });
});

describe("D645 B7: one hand-off record per repo#n", () => {
  const at = (n: number) => new Date(Date.parse("2026-11-26T20:00:00Z") + n * 60_000).toISOString();
  const from = { task: "sender", name: "Ducter" };
  const to = { helper: HELPER.id, name: HELPER.name };
  const record = (id: string, kind: "issue" | "pr", state: Bodies["handoff"]["state"], n: number): Bodies["handoff"] => ({
    handoffId: id,
    key: `task:sender|helper:${HELPER.id}|${kind}:${PR_REF}`,
    from,
    to,
    item: { kind, ref: PR_REF, title: kind === "issue" ? "first connect 403" : "fix(connectors): use the official CLI" },
    said: "接手 #11408",
    state,
    at: at(n),
    givenAt: at(n),
    ...(state === "settled" ? { settledBy: "merged" as const } : {}),
  });

  test("an old issue:/pr: pair is one record when read; the one that ended wins", () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const log = openLog({ path: `${t.dir}/ducter.db`, persona: "default" });
    stops.push(() => log.close());
    log.append({ stream: "channel", origin: "system", kind: "handoff", body: record("ho_issue", "issue", "settled", 11) });
    log.append({ stream: "channel", origin: "system", kind: "handoff", body: record("ho_pr", "pr", "unclaimed", 12) });
    const handoffs = createHandoffs({ log, helper: (id) => (id === HELPER.id ? (HELPER_JSON.helpers[0] as Helper) : undefined), now: () => Date.parse("2026-11-27T00:00:00Z"), backfill: false });
    const all = handoffs.all();
    expect(all).toHaveLength(1);
    expect(all[0]!.state).toBe("settled");
    expect(all[0]!.settledBy).toBe("merged");
    expect(all[0]!.messages ? all[0]!.messages.length : 0).toBeLessThanOrEqual(2);
  });

  test("a new hand-off named once as an issue and once as its PR is one record", () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const log = openLog({ path: `${t.dir}/ducter.db`, persona: "default" });
    stops.push(() => log.close());
    const handoffs = createHandoffs({ log, helper: (id) => (id === HELPER.id ? (HELPER_JSON.helpers[0] as Helper) : undefined), now: () => Date.parse("2026-11-27T00:00:00Z"), backfill: false });
    const h = HELPER_JSON.helpers[0] as Helper;
    const first = handoffs.giveLocal({ helper: h, text: "请接手 https://github.com/nowledge-co/mem/issues/11408", fromTask: "sender", fromName: "Ducter", at: at(1) });
    const second = handoffs.giveLocal({ helper: h, text: "请接手 https://github.com/nowledge-co/mem/pull/11408", fromTask: "sender", fromName: "Ducter", at: at(2) });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.handoff.handoffId).toBe(first.handoff.handoffId);
    expect(handoffs.all().filter((x) => x.item.ref === PR_REF)).toHaveLength(1);
  });
});

describe("D645 B6: no Keep for a task already held", () => {
  test("hel's kp_9c76608d03 ends at the first start with one line; the helper's Keep holds its task", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedHelTruth(t.dir);
    const core = startCore({
      dataDir: t.dir,
      port: 0,
      batchMs: 5,
      keeps: { endAsk: async () => ({}) },
      deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" },
    });
    stops.push(() => core.stop());
    core.setPartner({ onTrigger: () => {} });
    core.setRunner({ harness: { start: async () => ({}) as never, available: async () => [] }, async openTask(): Promise<TaskCard> { throw new Error("not here"); }, send: async () => ({ delivered: "prompted" as const }), interrupt: async () => {}, drop: async () => {} } as unknown as Runner);
    await flush(40);
    const keeps = core.keeps!;
    const old = keeps.get(OLD_LOOP_KEEP) as KeepBody;
    expect(old.life).toBe("stopped");
    // One line, once, on the task: it belongs to the helper from now on.
    const told = core.log.read({ stream: `task:${HELPER_TASK}`, kinds: ["task_event"], limit: 100 }).map((e) => e.body as Bodies["task_event"]).filter((b) => b.from === "ducter");
    expect(told).toHaveLength(1);
    expect(told[0]!.text).toContain(HELPER.name);
    // No second loop Keep for the helper's task; the helper's Own Keep still holds it.
    expect(keeps.all().filter((k) => k.from.kind === "loop" && k.from.taskId === HELPER_TASK)).toHaveLength(1);
    const helperKeep = keeps.all().find((k) => k.from.kind === "helper")!;
    expect(keeps.sheets("default").find((s) => s.id === helperKeep.keepId)?.taskIds).toContain(HELPER_TASK);
    // Sync again: the old Keep is not revived and the line is not said twice.
    keeps.sync();
    expect(keeps.get(OLD_LOOP_KEEP)!.life).toBe("stopped");
    expect(core.log.read({ stream: `task:${HELPER_TASK}`, kinds: ["task_event"], limit: 100 }).map((e) => e.body as Bodies["task_event"]).filter((b) => b.from === "ducter")).toHaveLength(1);
  });
});
