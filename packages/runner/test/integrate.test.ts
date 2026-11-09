// merge / open_pr / undrop over real git (no model calls), and the "no done with an open
// question" rule against the real core.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Place } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../../core/src/core.ts";
import { createRunner, mergeTaskBranch, openDraftPr, registerTaskTools } from "../src/index.ts";
import { archiveWorktree, branchChanges, mergeRefusal } from "../src/integrate.ts";
import { hasBranchChanges, type Bodies } from "@ducter/protocol";
import { git, planPlace } from "../src/places.ts";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "ducter-integrate-"))));
let stops: (() => unknown)[] = [];
afterEach(async () => {
  for (const s of stops.splice(0)) await s();
  rmSync(dir, { recursive: true, force: true });
});

const sh = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);

function repoWithTaskBranch(): Extract<Place, { kind: "repo" }> {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  // The merge runs through the product's own git, which reads the repo's identity: a CI machine
  // has no global user.name and no account name to guess one from ("empty ident name").
  sh(repo, "config", "user.name", "t");
  sh(repo, "config", "user.email", "t@t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  const wt = join(dir, "wt");
  sh(repo, "worktree", "add", "-q", wt, "-b", "ducter/fix", "main");
  writeFileSync(join(wt, "b.txt"), "b\n");
  sh(wt, "add", ".");
  sh(wt, "commit", "-qm", "fix");
  return { kind: "repo", device: "local", repoPath: repo, worktree: wt, branch: "ducter/fix", baseBranch: "main" };
}

test("merge: refuses a dirty checkout or the wrong branch, never forces; then merges with a merge commit", async () => {
  const p = repoWithTaskBranch();
  writeFileSync(join(p.repoPath, "a.txt"), "changed\n");
  expect(await mergeTaskBranch(p)).toMatchObject({ ok: false, message: expect.stringContaining("uncommitted changes") });
  sh(p.repoPath, "checkout", "-q", "--", "a.txt");
  sh(p.repoPath, "switch", "-q", "-c", "other");
  expect(await mergeTaskBranch(p)).toMatchObject({ ok: false, message: expect.stringContaining("Switch to main") });
  sh(p.repoPath, "switch", "-q", "main");
  const r = await mergeTaskBranch(p);
  expect(r).toMatchObject({ ok: true, message: "Merged ducter/fix into main." });
  expect(r.ref).toBe((await git(p.repoPath, ["rev-parse", "HEAD"])).out);
  expect((await git(p.repoPath, ["log", "-1", "--format=%P"])).out.split(" ")).toHaveLength(2);
  expect(await mergeTaskBranch(p)).toMatchObject({ ok: false, message: expect.stringContaining("nothing") });
});

test("a branch name that reads as a git option is never passed to git (push --receive-pack runs a command)", async () => {
  const p = repoWithTaskBranch();
  const marker = join(dir, "pwned");
  Bun.spawnSync(["git", "init", "-q", "--bare", join(dir, "origin.git")]);
  sh(p.repoPath, "remote", "add", "origin", join(dir, "origin.git")); // a local remote: receive-pack runs here
  sh(p.repoPath, "config", "push.default", "current"); // a common setting; with it, git needs no refspec
  const evil = { ...p, branch: `--receive-pack=touch ${marker}; echo` };
  const gh = join(dir, "gh");
  writeFileSync(gh, "#!/bin/sh\nexit 0\n", { mode: 0o755 }); // "signed in"
  expect(await openDraftPr(evil, { gh })).toMatchObject({ ok: false });
  expect(await mergeTaskBranch({ ...p, baseBranch: "--abort" })).toMatchObject({ ok: false });
  expect(await Bun.file(marker).exists()).toBe(false);
});

test("merge: conflicts are aborted and leave the checkout as it was", async () => {
  const p = repoWithTaskBranch();
  writeFileSync(join(p.worktree!, "a.txt"), "theirs\n");
  sh(p.worktree!, "commit", "-qam", "theirs");
  writeFileSync(join(p.repoPath, "a.txt"), "ours\n");
  sh(p.repoPath, "commit", "-qam", "ours");
  const before = (await git(p.repoPath, ["rev-parse", "HEAD"])).out;
  expect(await mergeTaskBranch(p)).toMatchObject({ ok: false, message: "ducter/fix doesn't merge cleanly into main: both changed the same lines. Nothing changed; ask the task to rebase onto main." });
  expect((await git(p.repoPath, ["rev-parse", "HEAD"])).out).toBe(before);
  expect((await git(p.repoPath, ["status", "--porcelain"])).out).toBe("");
});

test("merge: untracked files in the way are named, not called conflicts, and stay where they are", async () => {
  const p = repoWithTaskBranch(); // the task adds b.txt
  writeFileSync(join(p.repoPath, "b.txt"), "the user's own notes\n"); // untracked in the checkout
  const before = (await git(p.repoPath, ["rev-parse", "HEAD"])).out;
  expect(await mergeTaskBranch(p)).toEqual({
    ok: false,
    message: "Your checkout of main has files git doesn't track that ducter/fix would overwrite (b.txt). Move or delete them, then try again. Nothing changed.",
  });
  expect((await git(p.repoPath, ["rev-parse", "HEAD"])).out).toBe(before);
  expect(await Bun.file(join(p.repoPath, "b.txt")).text()).toBe("the user's own notes\n");
});

test("merge refusal copy: local changes in the way, many files, and anything else git says", () => {
  expect(mergeRefusal("error: Your local changes to the following files would be overwritten by merge:\n\ta.txt\nPlease commit your changes or stash them before you merge.\nAborting", "ducter/x", "main", false)).toBe(
    "Your checkout of main has uncommitted changes in a.txt that the merge would overwrite. Commit or stash them, then try again. Nothing changed.",
  );
  expect(mergeRefusal("error: The following untracked working tree files would be overwritten by merge:\n\t1\n\t2\n\t3\n\t4\n\t5\nPlease move", "b", "main", false)).toContain("(1, 2, 3 and 2 more)");
  expect(mergeRefusal("\n*** Please tell me who you are.\nfatal: unable to auto-detect email address", "b", "main", false)).toBe(
    "git couldn't merge b into main: unable to auto-detect email address. Nothing changed.",
  );
});

// Fresh-user QA: Open draft PR was offered on a repo with no origin, and its failure faded.
test("a repo place says whether it has a remote; a failed PR stays on the task", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  sh(repo, "commit", "-q", "--allow-empty", "-m", "init");
  const gh = join(dir, "gh");
  writeFileSync(gh, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const { core, runner, taskId } = await bootWithTask({ kind: "repo", device: "local", repoPath: repo }, { gh });
  expect(core.tasks.get(taskId)!.place).toMatchObject({ kind: "repo", hasRemote: false });
  const r = await runner.openPr(taskId);
  expect(r).toMatchObject({ ok: false, message: "This repo has no origin remote to push to." });
  const last = core.log.read({ stream: `task:${taskId}`, kinds: ["task_event"] }).at(-1)!.body as Bodies["task_event"];
  expect(last).toMatchObject({ role: "system", text: "This repo has no origin remote to push to.", raw: { failed: "draft_pr" } });
  await runner.dispose();
  const other = join(dir, "other");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", other]);
  sh(other, "remote", "add", "origin", join(dir, "remote.git"));
  expect((await planPlace({ kind: "repo", device: "local", repoPath: other }, "t2", "x", join(dir, "data"))).place).toMatchObject({ hasRemote: true });
});

test("open_pr without the GitHub CLI says exactly how to fix it, and pushes nothing", async () => {
  const p = repoWithTaskBranch();
  const r = await openDraftPr(p, { gh: join(dir, "no-such-gh") });
  expect(r).toEqual({ ok: false, message: "GitHub CLI isn't installed. Install it (brew install gh), run gh auth login, then try again." });
});

test("open_pr with a signed-in gh pushes the branch and logs an outside effect", async () => {
  const p = repoWithTaskBranch();
  const remote = join(dir, "remote.git");
  Bun.spawnSync(["git", "init", "-q", "--bare", remote]);
  sh(p.repoPath, "remote", "add", "origin", remote);
  const gh = join(dir, "gh");
  writeFileSync(gh, '#!/bin/sh\nif [ "$1" = auth ]; then exit 0; fi\necho https://github.com/me/repo/pull/7\n', { mode: 0o755 });
  const { core, runner, taskId } = await bootWithTask(p, { gh });
  const r = await runner.openPr(taskId);
  expect(r).toEqual({ ok: true, message: "Opened a draft PR for ducter/fix.", ref: "https://github.com/me/repo/pull/7" });
  expect((await git(remote, ["rev-parse", "ducter/fix"])).ok).toBe(true);
  const ev = core.log.read({ stream: `task:${taskId}`, kinds: ["task_event"] }).at(-1)!;
  expect(ev.body).toMatchObject({ role: "system", raw: { effect: "outside", what: "draft_pr", ref: "https://github.com/me/repo/pull/7" } });
  await runner.dispose();
});

test("branchChanges: commits ahead of the base and uncommitted work; nothing on a fresh branch", async () => {
  const p = repoWithTaskBranch();
  expect(await branchChanges(p)).toEqual({ commits: 1, uncommitted: false, files: 1, adds: 1, dels: 0 });
  writeFileSync(join(p.worktree!, "c.txt"), "c\n"); // untracked counts: the task made it
  expect(await branchChanges(p)).toEqual({ commits: 1, uncommitted: true, files: 1, adds: 1, dels: 0 });
  // D128: the diff stat counts uncommitted work in tracked files too (a new file once added).
  writeFileSync(join(p.worktree!, "a.txt"), "A\nmore\n");
  expect(await branchChanges(p)).toEqual({ commits: 1, uncommitted: true, files: 2, adds: 3, dels: 1 });
  const fresh = join(dir, "fresh");
  sh(p.repoPath, "worktree", "add", "-q", fresh, "-b", "ducter/nothing", "main");
  const none = { ...p, worktree: fresh, branch: "ducter/nothing" };
  expect(await branchChanges(none)).toEqual({ commits: 0, uncommitted: false, files: 0, adds: 0, dels: 0 });
  expect(hasBranchChanges({ branch: { commits: 0, uncommitted: false } })).toBe(false);
  expect(hasBranchChanges({ branch: { commits: 0, uncommitted: true } })).toBe(true);
  expect(hasBranchChanges({})).toBe(true); // unknown: the actions stay, and refuse in words if empty
  expect(await branchChanges({ ...p, baseBranch: undefined })).toBeUndefined();
  expect(await branchChanges({ kind: "folder", device: "local", path: dir })).toBeUndefined();
});

test("a done report carries the branch check: a task that changed nothing says so to clients", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  const { core, runner, taskId } = await bootWithTask({ kind: "repo", device: "local", repoPath: repo }, { branchChecks: true });
  await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Nothing to change: it already works." });
  const r = core.log.read({ stream: `task:${taskId}`, kinds: ["report"] }).at(-1)!.body as Bodies["report"];
  expect(r.branch).toEqual({ commits: 0, uncommitted: false, files: 0, adds: 0, dels: 0 });
  expect(core.tasks.get(taskId)!.lastReport?.branch).toEqual({ commits: 0, uncommitted: false, files: 0, adds: 0, dels: 0 });
  // The task commits something and reports again: now there is something to merge.
  const wt = (core.tasks.get(taskId)!.place as Extract<Place, { kind: "repo" }>).worktree!;
  writeFileSync(join(wt, "b.txt"), "b\n");
  sh(wt, "add", ".");
  sh(wt, "commit", "-qm", "b");
  await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Added b." });
  expect(core.tasks.get(taskId)!.lastReport?.branch).toEqual({ commits: 1, uncommitted: false, files: 1, adds: 1, dels: 0 });
  // A progress report isn't checked (nothing is offered on one).
  await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "progress", summary: "More." });
  expect(core.tasks.get(taskId)!.lastReport?.branch).toBeUndefined();
  await runner.dispose();
});

test("archiveWorktree: removes only a clean worktree Ducter made, never forced; the branch stays", async () => {
  const p = repoWithTaskBranch(); // its worktree is outside any data folder
  const data = join(dir, "data");
  expect(await archiveWorktree(p, data)).toMatchObject({ ok: true, removed: false, message: expect.stringContaining("didn't make") });
  const wt = join(data, "worktrees", "t9");
  sh(p.repoPath, "worktree", "add", "-q", wt, "-b", "ducter/other", "main");
  const ours = { ...p, worktree: wt, branch: "ducter/other" };
  writeFileSync(join(wt, "left.txt"), "leftover\n");
  expect(await archiveWorktree(ours, data)).toMatchObject({ ok: false, removed: false, message: expect.stringContaining("1 uncommitted or untracked file") });
  expect(existsSync(join(wt, "left.txt"))).toBe(true);
  rmSync(join(wt, "left.txt"));
  expect(await archiveWorktree(ours, data)).toMatchObject({ ok: true, removed: true });
  expect(existsSync(wt)).toBe(false);
  expect((await git(p.repoPath, ["rev-parse", "--verify", "ducter/other"])).ok).toBe(true);
  expect(await archiveWorktree(ours, data)).toMatchObject({ ok: true, removed: false });
});

// Fresh-user QA: worktrees were never removed after a merge (product-model "Archive and disk").
test("merge archives a done task: session closed, worktree removed, branch kept; a follow-up adds it back", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  sh(repo, "config", "user.name", "t");
  sh(repo, "config", "user.email", "t@t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  const { core, runner, taskId } = await bootWithTask({ kind: "repo", device: "local", repoPath: repo });
  const place = core.tasks.get(taskId)!.place as Extract<Place, { kind: "repo" }>;
  expect(place.worktree).toBe(join(dir, "data", "worktrees", "t1"));
  writeFileSync(join(place.worktree!, "b.txt"), "b\n");
  sh(place.worktree!, "add", ".");
  sh(place.worktree!, "commit", "-qm", "b");
  await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Added b." });
  expect(await runner.merge(taskId)).toMatchObject({ ok: true });
  expect(existsSync(place.worktree!)).toBe(false);
  expect((await git(repo, ["rev-parse", "--verify", place.branch!])).ok).toBe(true);
  expect(core.tasks.get(taskId)).toMatchObject({ attention: "done", residency: "archived" });
  const said = core.log.read({ stream: `task:${taskId}`, kinds: ["task_event"] }).map((e) => (e.body as Bodies["task_event"]).text);
  expect(said).toContain(`Removed the worktree; ${place.branch} stays.`);
  // A follow-up on the merged task: the worktree comes back from its branch, the session resumes.
  await runner.send(taskId, "One more thing.");
  expect(existsSync(join(place.worktree!, "b.txt"))).toBe(true);
  expect(core.tasks.get(taskId)!.attention).toBe("working");
  await runner.dispose();
});

test("merge keeps a worktree with leftovers and says so on the task", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  sh(repo, "config", "user.name", "t");
  sh(repo, "config", "user.email", "t@t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  const { core, runner, taskId } = await bootWithTask({ kind: "repo", device: "local", repoPath: repo });
  const wt = (core.tasks.get(taskId)!.place as Extract<Place, { kind: "repo" }>).worktree!;
  writeFileSync(join(wt, "b.txt"), "b\n");
  sh(wt, "add", ".");
  sh(wt, "commit", "-qm", "b");
  writeFileSync(join(wt, "notes.txt"), "scratch\n"); // untracked: merge allows it, removal must not lose it
  await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Added b." });
  expect(await runner.merge(taskId)).toMatchObject({ ok: true });
  expect(existsSync(join(wt, "notes.txt"))).toBe(true);
  expect(core.tasks.get(taskId)).toMatchObject({ attention: "done", residency: "archived" });
  const last = core.log.read({ stream: `task:${taskId}`, kinds: ["task_event"] }).at(-1)!.body as Bodies["task_event"];
  expect(last).toMatchObject({ role: "system", raw: { archive: "kept" }, text: expect.stringContaining("uncommitted or untracked") });
  await runner.dispose();
});

test("a task with an open question cannot report done; undrop restores the card", async () => {
  const p = repoWithTaskBranch();
  const { core, runner, taskId } = await bootWithTask(p);
  await core.mcp.call({ role: "task", taskId }, "report_to_main", {
    state: "needs_input",
    summary: "?",
    questions: [{ id: "q", text: "Commit the lockfile too?", blocking: true, default: "yes", reversible: true }],
  });
  await Bun.sleep(5);
  await expect(core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "done", evidence: [{ kind: "diff", label: "commit", ref: "abc" }] })).rejects.toThrow(
    /still open/,
  );
  expect(core.tasks.get(taskId)!.attention).toBe("needs_you");

  await runner.drop(taskId);
  expect(core.tasks.get(taskId)!.attention).toBe("dropped");
  expect(await runner.undrop(taskId)).toMatchObject({ ok: true });
  expect(core.tasks.get(taskId)).toMatchObject({ attention: "needs_you", residency: "parked" });
  await runner.dispose();
});

async function bootWithTask(place: Place, opts: { gh?: string; branchChecks?: boolean } = {}) {
  // A fake device with Claude Code signed in: who does the task never depends on which agents
  // are installed on the machine running the tests (a CI runner has none).
  const core: Core = startCore({
    dataDir: join(dir, "data"),
    port: 0,
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger: () => {} });
  let late: ReturnType<typeof createRunner> | undefined;
  registerTaskTools(core, opts.branchChecks ? { branchChanges: (id) => late!.branchChanges(id) } : {});
  const runner = createRunner(core, { harness: idlePort(), gh: opts.gh, newId: () => "t1" });
  late = runner;
  core.setRunner(runner);
  const card = await runner.openTask({ persona: "default", title: "fix", brief: "b", place });
  await runner.whenStarted(card.taskId);
  stops.push(() => core.stop());
  return { core, runner, taskId: card.taskId };
}

function idlePort(): HarnessPort {
  return {
    async start(spec: SessionSpec): Promise<HarnessSession> {
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
