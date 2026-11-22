// D473: a task that couldn't start, or stopped without a report, is mended by Ducter first:
// retried or its place repaired within budgets, then handed to the partner, then (by the
// partner) asked of the person once. Fakes only: a fake clock, fake places and a fake runner.
// Shapes from a real home's Log (synthetic names): a task given a folder that isn't on that
// computer (no_folder, nothing to fix by itself), one whose computer had no copy while another
// did (no_repo with elsewhere), one that failed as it started (other).
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, CantStart, LogEvent, MendBody, Place } from "@ducter/protocol";
import { noteOf } from "@ducter/protocol/src/transcript.ts";
import { FakeClock } from "../src/clock.ts";
import { triggersPartner } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { createMender, MEND_PER_HOUR, nextStartRung, similar, startLadder } from "../src/mend.ts";
import { createRegistry } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c();
});

type Outcome = "starts" | CantStart;

function setup(o: { outcomes?: Outcome[]; replan?: (taskId: string, how: { action: string; device?: string }) => { ok: true; place: Place } | { ok: false; message: string }; taken?: (e: LogEvent) => boolean } = {}) {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-22T02:58:00Z"));
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const outcomes = [...(o.outcomes ?? [])];
  const replans: { taskId: string; action: string; device?: string }[] = [];
  const restarts: { taskId: string; place: Place; clearLock?: boolean }[] = [];
  const places = {
    preflight: async () => ({ ok: true as const, place: { kind: "none" as const } }),
    quick: () => false,
    cantStart: async () => ({ why: "other" as const, computer: "", what: "", line: "" }),
    async replan(taskId: string, how: { action: "reopen" | "start_at" | "clone_here" | "clear_lock"; device?: string }) {
      replans.push({ taskId, ...how });
      return o.replan ? o.replan(taskId, how) : { ok: true as const, place: { kind: "repo" as const, device: how.device ?? "local", repoPath: "~/ducter/projects/mem" } };
    },
  };
  const runner = {
    async restartAt(taskId: string, place: Place, x?: { clearLock?: boolean }) {
      restarts.push({ taskId, place, ...(x?.clearLock ? { clearLock: true } : {}) });
      tasks.setState(taskId, "queued", "provisioning");
      const next = outcomes.shift() ?? "starts";
      setTimeout(() => (next === "starts" ? tasks.setState(taskId, "working", "hot") : tasks.setState(taskId, "failed", "archived", "没能开始", next)), 0);
      return { ok: true };
    },
  };
  const mender = createMender({ log, tasks, places: () => places, runner: () => runner, clock, ...(o.taken ? { taken: o.taken } : {}) });
  log.subscribe((e) => mender.onEvent(e));
  cleanups.push(() => {
    mender.stop();
    log.close?.();
    t.cleanup();
  });
  const open = (taskId: string, title: string, origin: "partner" | "system" = "system") =>
    log.append({ stream: `task:${taskId}`, origin, kind: "task_open", body: { taskId, title, project: "", place: { kind: "repo", device: "w1", repoPath: "/root/dev/mem" }, harness: "antigravity", brief: "Review the long copy." } });
  const fail = (taskId: string, cant: CantStart) => tasks.setState(taskId, "failed", "archived", "没能开始", cant);
  const mends = (taskId?: string) => log.read({ kinds: ["mend"], limit: 500, ...(taskId ? { stream: `task:${taskId}` } : {}) }).map((e) => e.body as MendBody);
  const lines = (taskId: string) =>
    log
      .read({ stream: `task:${taskId}`, kinds: ["task_event"], limit: 100 })
      .map((e) => e.body as Bodies["task_event"])
      .map((b) => noteOf(b.text ?? "", b.raw)?.say)
      .filter(Boolean);
  const woke = () => log.read({ kinds: ["mend"], limit: 500 }).filter(triggersPartner);
  const settle = async (ms = 0) => {
    clock.advance(ms);
    for (let i = 0; i < 5; i++) await Bun.sleep(1);
  };
  return { log, tasks, clock, mender, open, fail, mends, lines, woke, settle, replans, restarts };
}

const noFolder: CantStart = { why: "no_folder", computer: "Hetzner Server", what: "mem", path: "/root/dev/mem" };
const other: CantStart = { why: "other", computer: "Macbook Pro M3", what: "nowledge-mem" };

test("the ladder: the code fetched where the work was put, then the same start again; never a move by itself (D477); nothing to try for an agent or a missing folder", () => {
  expect(startLadder({ why: "no_repo", elsewhere: { device: "local", name: "MacBook" }, cloneHere: true }).map((s) => s.how)).toEqual(["clone_here"]);
  expect(startLadder({ why: "no_repo", elsewhere: { device: "local", name: "MacBook" } })).toEqual([]);
  expect(startLadder({ why: "other", cloneHere: true }).map((s) => s.how)).toEqual(["clone_here", "reopen"]);
  expect(startLadder({ why: "busy", clearLock: true }).map((s) => s.how)).toEqual(["clear_lock"]);
  expect(startLadder({ why: "busy" }).map((s) => [s.how, s.delayMs])).toEqual([["reopen", 30_000]]);
  expect(startLadder({ why: "away" }).map((s) => [s.how, s.delayMs])).toEqual([["reopen", 60_000]]);
  expect(startLadder({ why: "agent" })).toEqual([]);
  expect(startLadder({ why: "clone_failed", cloneHere: true })).toEqual([]);
  expect(startLadder({ why: "no_folder" })).toEqual([]);
  // Never the same try twice; two a task; the home's hourly guard sends it straight to the partner.
  const at = "";
  expect(nextStartRung({ why: "other", cloneHere: true }, [{ how: "clone_here", ok: true, at }], 0)).toEqual({ step: { how: "reopen", delayMs: 5_000 } });
  expect(nextStartRung({ why: "other", cloneHere: true }, [{ how: "clone_here", ok: true, at }, { how: "reopen", ok: true, at }], 0)).toEqual({ rethink: true });
  expect(nextStartRung({ why: "other" }, [], MEND_PER_HOUR)).toEqual({ rethink: true, budget: true });
});

test("hel's case: a folder that isn't on that computer, nothing Ducter can fix alone: the partner hears it at once, then asks once, then nothing more", async () => {
  const s = setup();
  s.open("smx2jjb3", "在 hel 用 Gemini 审阅 Mem 长文案");
  s.fail("smx2jjb3", noFolder);
  await s.settle();
  expect(s.restarts).toEqual([]);
  expect(s.mends("smx2jjb3")).toMatchObject([{ cls: "start", rung: "rethink", why: "no_folder", tried: [], state: "ok" }]);
  expect(s.woke()).toHaveLength(1);
  expect(s.lines("smx2jjb3")).toEqual(["mend_rethink"]);
  // It failed the same way again (the partner tried the same place): the second time it asks.
  s.fail("smx2jjb3", noFolder);
  await s.settle();
  expect(s.mends("smx2jjb3").at(-1)).toMatchObject({ rung: "rethink", again: true });
  // A third time: the card and the partner's one question stand; no more wakes.
  s.fail("smx2jjb3", noFolder);
  await s.settle();
  expect(s.woke()).toHaveLength(2);
});

test("another computer has the code (D477): Ducter fetches it where the work was put, one quiet line, never a move; with no clone possible the partner judges", async () => {
  const s = setup({ outcomes: ["starts"] });
  s.open("hs35hte8", "Guard the tail reconciliation");
  s.fail("hs35hte8", { why: "no_repo", computer: "Macbook Pro M3", what: "nowledge-mem", elsewhere: { device: "w1", name: "Hetzner Server" }, cloneHere: true });
  await s.settle();
  expect(s.replans).toEqual([{ taskId: "hs35hte8", action: "clone_here" }]);
  expect(s.restarts).toHaveLength(1);
  expect(s.tasks.get("hs35hte8")?.attention).toBe("working");
  expect(s.mends("hs35hte8")).toMatchObject([{ rung: "repair", how: "clone_here", attempt: 1, state: "going" }]);
  expect(s.lines("hs35hte8")).toEqual(["mend_clone_here"]);
  expect(s.woke()).toHaveLength(0);
  // Only a copy elsewhere: the partner hears it (with the copy as a fact), Ducter moves nothing.
  const t = setup();
  t.open("x1", "Guard the tail reconciliation");
  t.fail("x1", { why: "no_repo", computer: "Macbook Pro M3", what: "nowledge-mem", elsewhere: { device: "w1", name: "Hetzner Server" } });
  await t.settle();
  expect(t.restarts).toEqual([]);
  expect(t.mends("x1")).toMatchObject([{ rung: "rethink" }]);
});

test("something went wrong as it started: once more after a short wait; the same again goes to the partner with what was tried", async () => {
  const s = setup({ outcomes: [other] });
  s.open("vzvderrk", "细审 Nowledge Mem 长文案");
  s.fail("vzvderrk", other);
  await s.settle();
  expect(s.restarts).toHaveLength(0); // waits first
  await s.settle(5_000);
  expect(s.replans).toEqual([{ taskId: "vzvderrk", action: "reopen" }]);
  await s.settle();
  const m = s.mends("vzvderrk");
  expect(m.map((x) => x.rung)).toEqual(["retry", "rethink"]);
  expect(m[1]!.tried).toMatchObject([{ how: "reopen" }]);
  expect(s.woke()).toHaveLength(1);
});

test("a repair that can't even be tried is logged failed and the next rung follows at once", async () => {
  const s = setup({ replan: () => ({ ok: false, message: "That computer isn't one of this home's any more." }) });
  s.open("t1", "Fix the README");
  s.fail("t1", { why: "no_repo", computer: "haswell", what: "foo", cloneHere: true });
  await s.settle();
  expect(s.mends("t1").map((x) => `${x.rung}:${x.state}`)).toEqual(["repair:going", "repair:failed", "rethink:ok"]);
  expect(s.mends("t1")[1]!.error).toContain("isn't one of this home's");
});

test("the loop guard: six tries an hour on the whole home, then straight to the partner", async () => {
  const s = setup({ outcomes: Array.from({ length: 10 }, () => "starts" as const) });
  for (let i = 0; i < MEND_PER_HOUR + 1; i++) {
    s.open(`t${i}`, `Task ${i}`);
    s.fail(`t${i}`, { why: "no_repo", computer: "haswell", what: "foo", cloneHere: true });
    await s.settle();
  }
  const last = s.mends(`t${MEND_PER_HOUR}`);
  expect(last).toMatchObject([{ rung: "rethink", budget: true }]);
  expect(s.restarts).toHaveLength(MEND_PER_HOUR);
  // An hour on, the guard has room again.
  await s.settle(3_601_000);
  s.open("later", "Later");
  s.fail("later", { why: "no_repo", computer: "haswell", what: "foo", cloneHere: true });
  await s.settle();
  expect(s.mends("later")[0]).toMatchObject({ rung: "repair", how: "clone_here" });
});

test("the person is on the task: Ducter stays out of their way", async () => {
  const s = setup();
  s.open("t1", "Fix the README");
  s.log.append({ stream: "task:t1", origin: "user", kind: "task_event", body: { taskId: "t1", role: "user", from: "user", text: "try again on the Mac" } });
  s.fail("t1", other);
  await s.settle(10_000);
  expect(s.mends("t1")).toEqual([]);
});

test("a stall goes to the partner (never retried here: the task ran); one D372 answers is left alone", async () => {
  const s = setup({ taken: (e) => e.kind === "task_event" && (e.body as Bodies["task_event"]).taskId === "errand" });
  for (const id of ["code", "errand"]) {
    s.open(id, `Task ${id}`);
    s.log.append({ stream: `task:${id}`, origin: "system", kind: "task_event", body: { taskId: id, role: "system", text: "no report after one nudge; leaving the task idle (stall rule)", raw: { stall: true } } });
  }
  await s.settle();
  expect(s.mends("code")).toMatchObject([{ cls: "stall", rung: "rethink" }]);
  expect(s.lines("code")).toEqual(["stalled", "mend_stall"]);
  expect(s.mends("errand")).toEqual([]);
});

test("after a rethink, the partner opening the same work again sets the one that couldn't start aside", async () => {
  const s = setup();
  s.open("smx2jjb3", "在 hel 用 Gemini 审阅 Mem 长文案");
  s.fail("smx2jjb3", noFolder);
  await s.settle();
  s.open("other1", "整理下周的日历", "partner");
  await s.settle();
  expect(s.tasks.get("smx2jjb3")?.attention).toBe("failed");
  s.open("new1", "在 hel 上用 Gemini 审阅 Mem 的长文案", "partner");
  await s.settle();
  expect(s.tasks.get("smx2jjb3")?.attention).toBe("superseded");
  expect(similar("Review Mem's long copy", "Review the long copy in Mem")).toBeGreaterThan(0.5);
  expect(similar("Review Mem's long copy", "Book a hotel in Kyoto")).toBeLessThan(0.5);
});

test("a task opened more than a day ago that fails again (a restart) is left to its card", async () => {
  const s = setup();
  s.open("old", "An old task");
  await s.settle(25 * 3_600_000);
  s.fail("old", other);
  await s.settle(10_000);
  expect(s.mends("old")).toEqual([]);
});
