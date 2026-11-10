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

test("D201: a branch in Chinese is pushed and handed to gh as one argument, never through a shell", async () => {
  const p = repoWithTaskBranch();
  const branch = "ducter/修复登录页-闪退";
  sh(p.worktree!, "branch", "-m", branch);
  const remote = join(dir, "remote.git");
  Bun.spawnSync(["git", "init", "-q", "--bare", remote]);
  sh(p.repoPath, "remote", "add", "origin", remote);
  const argsFile = join(dir, "gh-args");
  const gh = join(dir, "gh");
  // Each argument on its own line, so a split or a re-quoted one shows.
  writeFileSync(gh, `#!/bin/sh\nif [ "$1" = auth ]; then exit 0; fi\nfor a in "$@"; do printf '%s\\n' "$a"; done > '${argsFile}'\necho https://github.com/me/repo/pull/8\n`, { mode: 0o755 });
  const r = await openDraftPr({ ...p, branch }, { gh });
  expect(r).toEqual({ ok: true, message: `Opened a draft PR for ${branch}.`, ref: "https://github.com/me/repo/pull/8" });
  expect((await git(remote, ["rev-parse", "--verify", `refs/heads/${branch}`])).ok).toBe(true);
  expect((await Bun.file(argsFile).text()).trimEnd().split("\n")).toEqual(["pr", "create", "--draft", "--fill", "--head", branch, "--base", "main"]);
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

// focus-window-states done? -> done: C checks the refs mechanically; the task's word alone stays "Done · checking".
test("a done report's evidence is checked: a commit on the task branch or a file in the place makes it done", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  const onMain = (await git(repo, ["rev-parse", "HEAD"])).out;
  sh(repo, "switch", "-q", "-c", "elsewhere");
  writeFileSync(join(repo, "x.txt"), "x\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "x");
  const offBranch = (await git(repo, ["rev-parse", "HEAD"])).out;
  sh(repo, "switch", "-q", "main");
  const { core, runner, taskId } = await bootWithTask({ kind: "repo", device: "local", repoPath: repo }, { branchChecks: true });
  const wt = (core.tasks.get(taskId)!.place as Extract<Place, { kind: "repo" }>).worktree!;
  writeFileSync(join(wt, "b.txt"), "b\n");
  sh(wt, "add", ".");
  sh(wt, "commit", "-qm", "b");
  const sha = (await git(wt, ["rev-parse", "HEAD"])).out;
  const done = async (evidence: unknown[]) => {
    await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Added b.", evidence });
    await Bun.sleep(5);
    return { attention: core.tasks.get(taskId)!.attention, evidence: core.tasks.get(taskId)!.lastReport!.evidence };
  };
  // The task's word only (a test count; a check it set itself is dropped).
  expect(await done([{ kind: "test", label: "bun test", ref: "12 passed", check: "verified" }])).toEqual({ attention: "done_claimed", evidence: [{ kind: "test", label: "bun test", ref: "12 passed" }] });
  // A commit that isn't on the task branch, and one that doesn't exist.
  expect((await done([{ kind: "diff", label: "commit", ref: offBranch.slice(0, 10) }])).evidence[0]!.check).toBe("missing");
  expect(await done([{ kind: "diff", label: "commit", ref: "deadbeef00" }])).toMatchObject({ attention: "done_claimed", evidence: [{ check: "missing" }] });
  // The commit on its branch (an ancestor counts too), and a file in its worktree.
  expect(await done([{ kind: "diff", label: "commit", ref: sha.slice(0, 8) }, { kind: "test", label: "t", ref: "ok" }])).toMatchObject({ attention: "done", evidence: [{ check: "verified" }, {}] });
  expect((await done([{ kind: "diff", label: "commit", ref: onMain }])).attention).toBe("done");
  expect(await done([{ kind: "file", label: "b", ref: "b.txt" }])).toMatchObject({ attention: "done", evidence: [{ check: "verified" }] });
  expect(await done([{ kind: "file", label: "b", ref: join(wt, "nope.txt") }])).toMatchObject({ attention: "done_claimed", evidence: [{ check: "missing" }] });
  // A path outside its place isn't Ducter's to vouch for.
  expect((await done([{ kind: "file", label: "a", ref: join(repo, "a.txt") }])).evidence[0]!.check).toBeUndefined();
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

test("D198: archiveWorktree removes a nested <repo>/<slug> worktree, its empty repo folder, and refuses look-alikes", async () => {
  const p = repoWithTaskBranch();
  const data = join(dir, "data");
  const wt = join(data, "worktrees", "repo", "other");
  sh(p.repoPath, "worktree", "add", "-q", wt, "-b", "ducter/other", "main");
  const keep = join(data, "worktrees", "repo", "still-here");
  sh(p.repoPath, "worktree", "add", "-q", keep, "-b", "ducter/still", "main");
  expect(await archiveWorktree({ ...p, worktree: wt, branch: "ducter/other" }, data)).toMatchObject({ ok: true, removed: true });
  expect(existsSync(wt)).toBe(false);
  expect(existsSync(join(data, "worktrees", "repo"))).toBe(true); // another task's is still in it
  expect(await archiveWorktree({ ...p, worktree: keep, branch: "ducter/still" }, data)).toMatchObject({ ok: true, removed: true });
  expect(existsSync(join(data, "worktrees", "repo"))).toBe(false);
  expect(existsSync(join(data, "worktrees"))).toBe(true);
  // A folder that only starts with the same letters, or climbs out with .., isn't Ducter's.
  const twin = join(dir, "data", "worktrees-x", "repo", "z");
  sh(p.repoPath, "worktree", "add", "-q", twin, "-b", "ducter/z", "main");
  expect(await archiveWorktree({ ...p, worktree: twin, branch: "ducter/z" }, data)).toMatchObject({ removed: false, message: expect.stringContaining("didn't make") });
  expect(await archiveWorktree({ ...p, worktree: join(data, "worktrees", "repo", "..", "..", "..", "wt"), branch: "ducter/fix" }, data)).toMatchObject({ removed: false, message: expect.stringContaining("didn't make") });
  expect(existsSync(twin) && existsSync(p.worktree!)).toBe(true);
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
  expect(place.worktree).toBe(join(dir, "data", "worktrees", "repo", place.branch!.replace("ducter/", "")));
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

// focus-window-states parked -> archived: the archive horizon (default 14 days).
test("archive horizon: a finished task idle 14 days is archived (clean worktree removed, branch kept); leftovers keep it parked", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  sh(repo, "config", "user.name", "t");
  sh(repo, "config", "user.email", "t@t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-qm", "init");
  let clock = Date.now();
  const { core, runner, taskId } = await bootWithTask({ kind: "repo", device: "local", repoPath: repo }, { now: () => new Date(clock) });
  const place = core.tasks.get(taskId)!.place as Extract<Place, { kind: "repo" }>;
  writeFileSync(join(place.worktree!, "notes.txt"), "scratch\n");
  await core.mcp.call({ role: "task", taskId }, "report_to_main", { state: "done", summary: "Added b." });
  await Bun.sleep(5);
  core.tasks.setState(taskId, core.tasks.get(taskId)!.attention, "warm"); // its turn ended (idlePort emits no turn end)
  expect(await runner.sweepArchive()).toEqual([]); // not idle long enough
  clock += 15 * 24 * 3600_000;
  expect(await runner.sweepArchive()).toEqual([]); // leftovers: kept, stays parked
  expect(existsSync(join(place.worktree!, "notes.txt"))).toBe(true);
  expect(core.tasks.get(taskId)!.residency).toBe("parked");
  rmSync(join(place.worktree!, "notes.txt"));
  expect(await runner.sweepArchive()).toEqual([]); // untouched since it was kept: not retried
  await Bun.sleep(2); // updatedAt has ms resolution: a touch in the same ms as the keep would read as untouched
  core.tasks.setState(taskId, core.tasks.get(taskId)!.attention, "parked", "touched");
  clock += 15 * 24 * 3600_000;
  expect(await runner.sweepArchive()).toEqual([taskId]);
  expect(existsSync(place.worktree!)).toBe(false);
  expect((await git(repo, ["rev-parse", "--verify", place.branch!])).ok).toBe(true);
  expect(core.tasks.get(taskId)!.residency).toBe("archived");
  // A follow-up adds the worktree back from the branch.
  await runner.send(taskId, "One more thing.");
  expect(existsSync(place.worktree!)).toBe(true);
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

async function bootWithTask(place: Place, opts: { gh?: string; branchChecks?: boolean; now?: () => Date } = {}) {
  // A fake device with Claude Code signed in: who does the task never depends on which agents
  // are installed on the machine running the tests (a CI runner has none).
  const core: Core = startCore({
    dataDir: join(dir, "data"),
    port: 0,
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger: () => {} });
  let late: ReturnType<typeof createRunner> | undefined;
  registerTaskTools(core, opts.branchChecks ? { branchChanges: (id) => late!.branchChanges(id), checkEvidence: (id, ev) => late!.checkEvidence(id, ev) } : {});
  const runner = createRunner(core, { harness: idlePort(), gh: opts.gh, newId: () => "t1", archiveSweepMs: 0, ...(opts.now ? { now: opts.now } : {}) });
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

// D89 / focus-window.md "Choosing a body": a pin that can't run says the real reason; the
// person's own pick never moves silently; the pick's model is what runs.
test("who does it: a blocked pin moves with the real reason, the person's own pick is refused in one line, the model carries", async () => {
  const core: Core = startCore({
    dataDir: join(dir, "data"),
    port: 0,
    deviceProbes: {
      cua: async () => ({ missing: "test" }),
      harnesses: async () => [
        { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true },
        { harness: "codex", installed: true, loggedIn: false, canBePartner: true },
      ],
      kind: async () => "laptop",
    },
  });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  registerTaskTools(core);
  const ids = ["t1", "t2", "t3"];
  const runner = createRunner(core, { harness: idlePort(), newId: () => ids.shift()!, taskModel: "", archiveSweepMs: 0 });
  core.setRunner(runner);
  await expect(runner.openTask({ persona: "default", title: "x", brief: "b", harness: "codex", origin: "you" })).rejects.toThrow("Codex can't take this task: it isn't signed in.");
  const moved = await runner.openTask({ persona: "default", title: "x", brief: "b", harness: "codex", model: "gpt-5" });
  const sel = (id: string) => core.log.read({ stream: `task:${id}`, kinds: ["body_selected"] }).at(-1)!.body as Bodies["body_selected"];
  expect(sel(moved.taskId)).toEqual({ taskId: moved.taskId, harness: "claude-code", model: "opus", why: { kind: "unavailable", from: "codex", blocked: "signed_out" } });
  expect(core.tasks.get(moved.taskId)).toMatchObject({ harness: "claude-code", model: "opus" });
  await runner.drop(moved.taskId); // so the next runner doesn't recover it mid-work
  await runner.dispose();
  // DUCTER_TASK_MODEL (a cheap model for runs and evals) still wins over the ranking's model.
  const cheap = createRunner(core, { harness: idlePort(), newId: () => ids.shift()!, taskModel: "haiku", archiveSweepMs: 0 });
  const c = await cheap.openTask({ persona: "default", title: "y", brief: "b" });
  await cheap.whenStarted(c.taskId);
  expect(sel(c.taskId)).toMatchObject({ harness: "claude-code", model: "haiku", why: { kind: "default" } });
  await cheap.drop(c.taskId);
  await cheap.dispose();
});

test("D157 (E3): moving a repo task pushes its branch first; uncommitted work stops the move; another clone fetches it", async () => {
  const p = repoWithTaskBranch();
  const { pushForMove } = await import("../src/integrate.ts");
  const { provisionPlace } = await import("../src/places.ts");
  expect((await pushForMove(p)).message).toMatch(/no origin remote/);
  const bare = join(dir, "origin.git");
  Bun.spawnSync(["git", "init", "-q", "--bare", bare]);
  sh(p.repoPath, "remote", "add", "origin", bare);
  writeFileSync(join(p.worktree!, "c.txt"), "c\n");
  sh(p.worktree!, "add", "c.txt");
  expect((await pushForMove(p)).message).toMatch(/uncommitted changes/);
  sh(p.worktree!, "commit", "-qm", "more");
  expect(await pushForMove(p)).toMatchObject({ ok: true, ref: "ducter/fix" });
  // The other computer: its own clone of the same origin, a worktree of the pushed branch.
  const other = join(dir, "other");
  Bun.spawnSync(["git", "clone", "-q", bare, other]);
  const wt = join(dir, "other-wt");
  await provisionPlace({ place: { kind: "repo", device: "MacBook", repoPath: other, worktree: wt, branch: "ducter/fix", baseBranch: "main" }, cwd: wt, fetch: true });
  expect(existsSync(join(wt, "c.txt"))).toBe(true);
});
