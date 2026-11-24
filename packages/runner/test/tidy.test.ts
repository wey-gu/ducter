// D514: the working-copy tidy end to end on real git in a scratch folder, a fake agent, and a fake
// worker link: a finished task's clean, pushed copy goes after its window (logged, said in Past
// tasks, added back on Continue); every copy that matters stays, each for its reason.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, Place } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, WorkerLink } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../../core/src/core.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { archiveWorktree, copyFacts, unpushedCommits } from "../src/integrate.ts";
import { git } from "../src/places.ts";
import { remoteOps } from "../src/remote.ts";
import { createWorkerHost } from "../src/worker-host.ts";

const DAY = 24 * 3600_000;
let dir: string;
let stops: (() => unknown)[] = [];
beforeEach(() => void (dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-tidy-")))));
afterEach(async () => {
  for (const s of stops.splice(0)) await s();
  rmSync(dir, { recursive: true, force: true });
});

const sh = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);

/** A repository with an origin (a bare one in the scratch folder), its main pushed. */
function repoWithOrigin(): string {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  sh(repo, "config", "user.name", "t");
  sh(repo, "config", "user.email", "t@t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  Bun.spawnSync(["git", "init", "-q", "--bare", join(dir, "origin.git")]);
  sh(repo, "remote", "add", "origin", join(dir, "origin.git"));
  sh(repo, "push", "-q", "-u", "origin", "main");
  return repo;
}

function idlePort(): HarnessPort {
  return {
    async start(): Promise<HarnessSession> {
      let wake: (() => void) | undefined;
      let done = false;
      return {
        id: "s1",
        canSteer: true,
        busy: () => false,
        send: async () => {},
        interrupt: async () => {},
        close: async () => void ((done = true), wake?.()),
        events: () => ({
          async *[Symbol.asyncIterator](): AsyncGenerator<HarnessEvent> {
            while (!done) await new Promise<void>((r) => (wake = r));
          },
        }),
      };
    },
    available: async () => [],
  };
}

async function boot(o: { now: () => Date; ids?: string[] }) {
  const core: Core = startCore({
    dataDir: join(dir, "data"),
    port: 0,
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger: () => {} });
  registerTaskTools(core, {});
  const ids = o.ids ?? ["t1", "t2", "t3"];
  const runner = createRunner(core, { harness: idlePort(), newId: () => ids.shift()!, archiveSweepMs: 0, parkIdleMs: 0, now: o.now });
  core.setRunner(runner);
  stops.push(() => runner.dispose(), () => core.stop());
  const open = async (title: string, repo: string, at?: { worktree: string; branch: string }) => {
    const card = await runner.openTask({ persona: "default", title, brief: "b", place: { kind: "repo", device: "local", repoPath: repo, ...(at ?? {}) } });
    await runner.whenStarted(card.taskId);
    return { taskId: card.taskId, place: core.tasks.get(card.taskId)!.place as Extract<Place, { kind: "repo" }> };
  };
  /** The task commits b.txt, pushes its branch (or not), and reports done; its turn ended. */
  const finish = async (taskId: string, place: Extract<Place, { kind: "repo" }>, o2: { push?: boolean } = {}) => {
    writeFileSync(join(place.worktree!, "b.txt"), `${taskId}\n`); // each task's own commit (same content and second: the same sha)
    sh(place.worktree!, "add", ".");
    sh(place.worktree!, "commit", "-qm", `b ${taskId}`);
    if (o2.push !== false) sh(place.worktree!, "push", "-q", "-u", "origin", place.branch!);
    await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Added b." });
    await Bun.sleep(3);
    core.tasks.setState(taskId, core.tasks.get(taskId)!.attention, "parked");
  };
  return { core, runner, open, finish };
}

test("a finished task's clean, pushed copy goes after 3 idle days: logged with its size, said in Past tasks, added back on Continue", async () => {
  const repo = repoWithOrigin();
  let clock = Date.now();
  const { core, runner, open, finish } = await boot({ now: () => new Date(clock) });
  const { taskId, place } = await open("fix", repo);
  await finish(taskId, place);
  expect(await runner.sweepArchive()).toEqual([]); // just finished
  const plan0 = await runner.tidyPlan();
  expect(plan0.rows).toEqual([expect.objectContaining({ taskId, device: "local", path: place.worktree, verdict: expect.objectContaining({ tidy: false, keep: "recent" }) })]);
  clock += 3 * DAY + 60_000;
  expect((await runner.tidyPlan()).rows[0]!.verdict).toEqual({ tidy: true, why: "finished" });
  expect(await runner.sweepArchive()).toEqual([taskId]);
  expect(existsSync(place.worktree!)).toBe(false);
  expect((await git(repo, ["rev-parse", "--verify", place.branch!])).ok).toBe(true); // the branch stays
  expect(core.tasks.get(taskId)!.residency).toBe("archived");
  const tidied = core.log.read({ stream: `task:${taskId}`, kinds: ["copy_tidied"] }).map((e) => e.body as Bodies["copy_tidied"]);
  expect(tidied).toEqual([expect.objectContaining({ taskId, device: "local", path: place.worktree, branch: place.branch, why: "finished" })]);
  expect(tidied[0]!.bytes).toBeGreaterThan(0);
  expect(core.past.item(taskId)).toMatchObject({ tidied: true });
  // The plan lists it no more, and counts it.
  const plan = await runner.tidyPlan();
  expect(plan.rows).toEqual([]);
  expect(plan.tidied.local).toEqual({ count: 1, bytes: tidied[0]!.bytes });
  // The computer's card says it.
  const view = await core.devicesView.frame();
  expect(view.devices.find((d) => d.id === "local")?.tidied).toEqual({ count: 1, bytes: tidied[0]!.bytes });
  // Continue: the copy comes back from the branch, without asking.
  await runner.send(taskId, "One more thing.");
  expect(existsSync(join(place.worktree!, "b.txt"))).toBe(true);
  expect(core.past.item(taskId)?.tidied).toBeUndefined();
});

test("Continue after the local branch was deleted too: the copy comes back from origin's branch, never a fresh one off main", async () => {
  const repo = repoWithOrigin();
  let clock = Date.now();
  const { core, runner, open, finish } = await boot({ now: () => new Date(clock) });
  const { taskId, place } = await open("fix", repo);
  await finish(taskId, place);
  clock += 4 * DAY;
  expect(await runner.sweepArchive()).toEqual([taskId]);
  sh(repo, "branch", "-D", place.branch!);
  await runner.send(taskId, "Carry on.");
  expect(existsSync(join(place.worktree!, "b.txt"))).toBe(true);
  expect(core.tasks.get(taskId)!.attention).toBe("working");
});

test("commits nowhere else keep the copy (no push, not merged); uncommitted files keep it; each said in the plan", async () => {
  const repo = repoWithOrigin();
  let clock = Date.now();
  const { runner, open, finish } = await boot({ now: () => new Date(clock) });
  const a = await open("local only", repo);
  await finish(a.taskId, a.place, { push: false });
  const b = await open("with notes", repo);
  await finish(b.taskId, b.place);
  writeFileSync(join(b.place.worktree!, "notes.txt"), "the person's notes\n");
  clock += 30 * DAY;
  const plan = await runner.tidyPlan();
  const why = Object.fromEntries(plan.rows.map((r) => [r.taskId, r.verdict]));
  expect(why[a.taskId]).toEqual({ tidy: false, keep: "unpushed" });
  expect(why[b.taskId]).toEqual({ tidy: false, keep: "uncommitted" });
  expect(await runner.sweepArchive()).toEqual([]);
  expect(existsSync(a.place.worktree!) && existsSync(join(b.place.worktree!, "notes.txt"))).toBe(true);
  // Pushed later: it goes on the next sweep once the task is touched.
  sh(a.place.worktree!, "push", "-q", "-u", "origin", a.place.branch!);
  await Bun.sleep(2);
  clock += 1;
  expect(await runner.sweepArchive()).toEqual([]); // untouched since it was kept: not retried
});

test("a dropped task keeps its copy for Undo's 7 days, then it goes; Undo after that brings it back on the next words", async () => {
  const repo = repoWithOrigin();
  let clock = Date.now();
  const { core, runner, open } = await boot({ now: () => new Date(clock) });
  const { taskId, place } = await open("try", repo);
  await runner.drop(taskId);
  clock += 4 * DAY;
  expect(await runner.sweepArchive()).toEqual([]);
  expect((await runner.tidyPlan()).rows[0]!.verdict).toMatchObject({ tidy: false, keep: "recent" });
  clock += 3 * DAY + 60_000;
  expect(await runner.sweepArchive()).toEqual([taskId]);
  expect(existsSync(place.worktree!)).toBe(false);
  expect(core.log.read({ stream: `task:${taskId}`, kinds: ["copy_tidied"] }).map((e) => (e.body as Bodies["copy_tidied"]).why)).toEqual(["dropped"]);
  expect(core.tasks.get(taskId)).toMatchObject({ attention: "dropped", residency: "archived" });
  // It was working when dropped: Undo carries on at once, and its copy comes back from the branch.
  expect(await runner.undrop(taskId)).toMatchObject({ ok: true });
  expect(existsSync(place.worktree!)).toBe(true);
});

test("held by the home: a wait of its own, an open PR, a star, Keep the working copy (a Keep: core's tidied.test.ts)", async () => {
  const repo = repoWithOrigin();
  let clock = Date.now();
  const { core, runner, open, finish } = await boot({ now: () => new Date(clock), ids: ["w1", "k1", "p1", "s1", "c1"] });
  const t = {} as Record<string, { taskId: string; place: Extract<Place, { kind: "repo" }> }>;
  for (const n of ["w1", "k1", "p1", "s1", "c1"]) {
    t[n] = await open(n, repo);
    await finish(t[n]!.taskId, t[n]!.place);
  }
  // A wait of its own, armed (the partner's wait for this task: the PR's CI).
  core.work.waiters.arm({ reason: "PR #1 的 CI 通过", taskId: "w1", check: { argv: ["test", "-f", join(dir, "never")], succeedWhen: { exitCode: 0 } }, everyMs: 3600_000 });
  // A Keep (D511) holds k1: the runner takes the home's word for it.
  const home = core.tidyHold!;
  (core as { tidyHold?: typeof home }).tidyHold = (id) => (id === "k1" ? "looking_after" : home(id));
  // A PR it owns, still open (D483).
  core.log.append({ stream: "task:p1", origin: "task", kind: "checkpoint", body: { taskId: "p1", text: "opened the PR", owns: ["o/r#1"] } as Bodies["checkpoint"] });
  core.marks.set("default", "s1", { starred: true });
  core.marks.set("default", "c1", { keepCopy: true });
  await Bun.sleep(5);
  expect(core.tidyHold?.("w1")).toBe("waiting");
  expect(core.tidyHold?.("k1")).toBe("looking_after");
  expect(core.tidyHold?.("p1")).toBe("pr_open");
  expect(core.tidyHold?.("s1")).toBe("pinned");
  expect(core.tidyHold?.("c1")).toBe("pinned");
  clock += 60 * DAY;
  expect(await runner.sweepArchive()).not.toContain("k1");
  for (const n of ["k1", "p1", "s1", "c1"]) expect(existsSync(t[n]!.place.worktree!)).toBe(true);
  const plan = Object.fromEntries((await runner.tidyPlan()).rows.map((r) => [r.taskId, r.verdict]));
  expect(plan.k1).toEqual({ tidy: false, keep: "looking_after" });
  expect(plan.p1).toEqual({ tidy: false, keep: "pr_open" });
  expect(plan.s1).toEqual({ tidy: false, keep: "pinned" });
  expect(plan.c1).toEqual({ tidy: false, keep: "pinned" });
  // Released: the usual rules decide again.
  core.marks.set("default", "c1", { keepCopy: false });
  core.tasks.setState("c1", "done", "parked", "touched");
  expect(await runner.sweepArchive()).toContain("c1");
});

test("a live task keeps its copy whatever its age; another task in the same folder keeps it too", async () => {
  const repo = repoWithOrigin();
  let clock = Date.now();
  const { core, runner, open, finish } = await boot({ now: () => new Date(clock) });
  const live = await open("live", repo);
  // A second task opened in the same folder (a redo on the same copy): finished, pushed, old.
  const done = await open("done", repo, { worktree: live.place.worktree!, branch: live.place.branch! });
  expect(done.place.worktree).toBe(live.place.worktree);
  await finish(done.taskId, done.place);
  core.tasks.setState(live.taskId, "working", "hot");
  clock += 60 * DAY;
  const plan = Object.fromEntries((await runner.tidyPlan()).rows.map((r) => [r.taskId, r.verdict]));
  expect(plan[live.taskId]).toEqual({ tidy: false, keep: "live" });
  expect(plan[done.taskId]).toEqual({ tidy: false, keep: "shared" });
  expect(await runner.sweepArchive()).toEqual([]);
  expect(existsSync(live.place.worktree!)).toBe(true);
});

test("only copies Ducter recorded making: the person's own checkout or a look-alike is never touched", async () => {
  const repo = repoWithOrigin();
  const theirs = join(dir, "my-own-copy");
  sh(repo, "worktree", "add", "-q", theirs, "-b", "mine", "main");
  const p: Place = { kind: "repo", device: "local", repoPath: repo, worktree: theirs, branch: "mine", baseBranch: "main" };
  expect(await copyFacts(p, join(dir, "data"))).toMatchObject({ ours: false });
  expect(await archiveWorktree(p, join(dir, "data"))).toMatchObject({ removed: false, message: expect.stringContaining("didn't make") });
  expect(existsSync(theirs)).toBe(true);
});

test("unpushedCommits: counts what no remote and no base holds; a folder gone leaves only its own record to clear", async () => {
  const repo = repoWithOrigin();
  const data = join(dir, "data");
  const wt = join(data, "worktrees", "repo", "x");
  sh(repo, "worktree", "add", "-q", wt, "-b", "ducter/x", "main");
  expect(await unpushedCommits(wt, "ducter/x", "main")).toBe(0);
  writeFileSync(join(wt, "c.txt"), "c\n");
  sh(wt, "add", ".");
  sh(wt, "commit", "-qm", "c");
  expect(await unpushedCommits(wt, "ducter/x", "main")).toBe(1);
  expect(await copyFacts({ kind: "repo", device: "local", repoPath: repo, worktree: wt, branch: "ducter/x", baseBranch: "main" }, data)).toMatchObject({ ours: true, exists: true, dirty: 0, unpushed: 1 });
  sh(wt, "push", "-q", "origin", "ducter/x");
  expect(await unpushedCommits(wt, "ducter/x", "main")).toBe(0);
  // Another worktree record of the person's whose folder is gone stays theirs: no repository-wide prune.
  const stale = join(dir, "theirs-gone");
  sh(repo, "worktree", "add", "-q", stale, "-b", "theirs", "main");
  rmSync(stale, { recursive: true, force: true });
  rmSync(wt, { recursive: true, force: true });
  expect(await archiveWorktree({ kind: "repo", device: "local", repoPath: repo, worktree: wt, branch: "ducter/x", baseBranch: "main" }, data)).toMatchObject({ ok: true, removed: false, gone: true });
  const list = (await git(repo, ["worktree", "list", "--porcelain"])).out;
  expect(list).not.toContain(wt);
  expect(list).toContain(stale);
});

test("on a worker: the facts and the removal run there over the worker protocol; an older worker that can't say keeps its copies", async () => {
  const repo = repoWithOrigin();
  const workerData = join(dir, "worker", ".ducter");
  const host = createWorkerHost({ dataDir: workerData, harness: {} as never, mainBase: "http://main", deviceToken: "dvc", send: (f) => sent.push(f), home: join(dir, "worker") });
  const sent: { id?: number; ok?: boolean; result?: unknown; error?: string }[] = [];
  let n = 0;
  const call = async <T>(op: string, args: object): Promise<T> => {
    const id = ++n;
    await host.handle({ t: "req", id, op, args } as never);
    const r = sent.find((f) => f.id === id)!;
    if (!r.ok) throw new Error(r.error ?? "failed");
    return r.result as T;
  };
  const link = (calls: typeof call): WorkerLink => ({ id: "w", name: "Mac mini", online: () => true, onOnline: () => () => {}, call: calls } as unknown as WorkerLink);
  const ops = remoteOps(link(call));
  const wt = join(workerData, "worktrees", "repo", "y");
  sh(repo, "worktree", "add", "-q", wt, "-b", "ducter/y", "main");
  const p: Place = { kind: "repo", device: "w", repoPath: repo, worktree: wt, branch: "ducter/y", baseBranch: "main" };
  writeFileSync(join(wt, "left.txt"), "x\n");
  expect(await ops.copyFacts(p)).toMatchObject({ ours: true, exists: true, dirty: 1 });
  expect(await ops.archive(p)).toMatchObject({ removed: false }); // checked again there
  rmSync(join(wt, "left.txt"));
  const gone = await ops.archive(p);
  expect(gone).toMatchObject({ ok: true, removed: true });
  expect(existsSync(wt)).toBe(false);
  // A worker from before D514 doesn't know copyFacts: can't tell, so nothing there is tidied.
  const old = remoteOps(link(async (op) => Promise.reject(new Error(`unknown op ${op}`))));
  expect(await old.copyFacts(p)).toBeUndefined();
});
