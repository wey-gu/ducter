// D415: what made the author's hand-over fail on 0.0.99 (hel, 2026-11-20), fixed where it starts:
// a worktree add that met another git's index.lock is tried again (a reader's lock is gone in a
// moment; one a dead git left is cleared only when no git runs), a branch a failed start left is used
// again, a name someone's work holds is never reused, every failure gets a card with a word for why,
// and words to a task that never started start it (its place asked again) instead of resuming nothing.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { clearStaleLock, freeBranch, git, placeProblem, planPlace, provisionPlace, startProblem, STALE_LOCK_MS } from "../src/places.ts";
import { createFakeCore, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
let path0: string | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-d415-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  path0 = process.env.PATH;
});
afterEach(() => {
  process.env.PATH = path0;
  rmSync(dir, { recursive: true, force: true });
});

function makeRepo(name = "nowledge-mem"): string {
  const repo = join(dir, name);
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "hi\n");
  Bun.spawnSync(["git", "-C", repo, "add", "."]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  return repo;
}

/**
 * A git that fails its first `worktree add` the way hel's did (another git held the new worktree's
 * index.lock while it was being made), then behaves as git: the race, made repeatable.
 */
function lockOnce(times = 1): void {
  const real = Bun.spawnSync(["sh", "-c", "command -v git"]).stdout.toString().trim();
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const count = join(dir, "count");
  writeFileSync(count, "0");
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh
echo "$GIT_OPTIONAL_LOCKS" > "${join(dir, "optional-locks")}"
case "$*" in *"worktree add"*)
  n=$(cat "${count}"); if [ "$n" -lt ${times} ]; then echo $((n+1)) > "${count}"
    repo="$2"; name=$(basename "$5")
    echo "Preparing worktree (new branch 'x')" >&2
    echo "fatal: Unable to create '$repo/.git/worktrees/$name/index.lock': File exists." >&2
    echo "" >&2
    echo "Another git process seems to be running in this repository, or the lock file may be stale" >&2
    exit 128
  fi;;
esac
exec "${real}" "$@"
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  process.env.PATH = `${bin}:${path0}`;
}

test("hel's failure, read: a lock git found is the repository being busy; anything else still gets a word", () => {
  const hel = "git worktree add failed: Preparing worktree (new branch 'ducter/通用设置')\nfatal: Unable to create '/Users/weyl/dev/nowledge-mem/.git/worktrees/通用设置/index.lock': File exists.\n\nAnother git process seems to be running in this repository, or the lock file may be stale";
  expect(placeProblem(hel)).toEqual({ why: "busy", path: "/Users/weyl/dev/nowledge-mem/.git/worktrees/通用设置/index.lock" });
  expect(startProblem("Error: Codex session directory does not exist: /root/ducter/worktrees/mem/x")).toMatchObject({ why: "agent" });
  expect(startProblem("Macbook Pro M3 can't be reached right now")).toMatchObject({ why: "away" });
  expect(startProblem("something odd")).toEqual({ why: "other", path: "" });
  expect(startProblem("not a git repository: /root/dev/mem")).toEqual({ why: "no_repo", path: "/root/dev/mem" });
});

test("a worktree add that meets another git's lock is tried again and the task starts; Ducter's own reads take no optional lock", async () => {
  const repo = makeRepo();
  lockOnce(2);
  const r = await planPlace({ kind: "repo", device: "local", repoPath: repo }, "t1", "通用设置", join(dir, "data"));
  await provisionPlace(r);
  expect(existsSync(join(r.cwd, "README.md"))).toBe(true);
  expect((await git(r.cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).out).toBe("ducter/通用设置");
  // Every git Ducter runs says GIT_OPTIONAL_LOCKS=0: a status or a diff never refreshes the index.
  await git(r.cwd, ["status", "--porcelain"]);
  expect(readFileSync(join(dir, "optional-locks"), "utf8").trim()).toBe("0");
});

test("a lock that stays is the card's busy, never a bare path; a branch the failed start left is used again", async () => {
  const repo = makeRepo();
  lockOnce(99);
  const r = await planPlace({ kind: "repo", device: "local", repoPath: repo }, "t1", "通用设置", join(dir, "data"));
  const err = await provisionPlace(r).then(() => undefined, (e: Error) => e);
  expect(err?.message).toBe(`the repository is busy: ${repo}/.git/worktrees/通用设置/index.lock`);
  expect(placeProblem(err!.message)).toMatchObject({ why: "busy" });
  // What hel's left: the branch made, no worktree, nothing on it. The same task (or the next) takes it again.
  process.env.PATH = path0;
  Bun.spawnSync(["git", "-C", repo, "branch", "ducter/通用设置"]);
  expect(await freeBranch(repo, "ducter/通用设置", "main")).toBe("ducter/通用设置");
});

test("a branch with someone's work on it, or checked out, is never reused: the next free number", async () => {
  const repo = makeRepo();
  Bun.spawnSync(["git", "-C", repo, "checkout", "-q", "-b", "ducter/settings"]);
  writeFileSync(join(repo, "a.txt"), "work\n");
  Bun.spawnSync(["git", "-C", repo, "add", "."]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "work"]);
  Bun.spawnSync(["git", "-C", repo, "checkout", "-q", "main"]);
  expect(await freeBranch(repo, "ducter/settings", "main")).toBe("ducter/settings-2");
  const wt = join(dir, "wt");
  Bun.spawnSync(["git", "-C", repo, "worktree", "add", "-q", wt, "-b", "ducter/other"]);
  expect(await freeBranch(repo, "ducter/other", "main")).toBe("ducter/other-2");
});

test("a lock git left is cleared only when it is old or asked, and never while a git runs", async () => {
  const lock = join(dir, "r", ".git", "index.lock");
  mkdirSync(join(dir, "r", ".git"), { recursive: true });
  writeFileSync(lock, "");
  const none = async () => false;
  const one = async () => true;
  // Fresh: kept (a git may be about to finish).
  expect(await clearStaleLock(lock, { running: none })).toBe(false);
  expect(existsSync(lock)).toBe(true);
  // Asked (清掉旧的再试) while a git runs: kept.
  expect(await clearStaleLock(lock, { force: true, running: one })).toBe(false);
  expect(existsSync(lock)).toBe(true);
  // Old, no git running: cleared.
  const old = (Date.now() - STALE_LOCK_MS - 60_000) / 1000;
  utimesSync(lock, old, old);
  expect(await clearStaleLock(lock, { running: none })).toBe(true);
  expect(existsSync(lock)).toBe(false);
  // Never anything but a lock inside a git folder.
  const other = join(dir, "notes.lock");
  writeFileSync(other, "");
  expect(await clearStaleLock(other, { force: true, running: none })).toBe(false);
  expect(existsSync(other)).toBe(true);
});

test("every start failure gets a card: no core resolver, a strange error: its why and 再试一次, never the raw text as the card", async () => {
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async () => {} }) });
  const runner = createRunner(core, { harness: port, newId: () => "tsk00001" });
  const repo = makeRepo();
  lockOnce(99);
  const card = await runner.openTask({ persona: "p1", title: "通用设置", brief: "the brief", place: { kind: "repo", device: "local", repoPath: repo } });
  await runner.whenStarted(card.taskId).catch(() => {});
  const failed = core.events.filter((e) => e.kind === "task_state").map((e) => e.body as Bodies["task_state"]).at(-1)!;
  expect(failed).toMatchObject({ attention: "failed", cant: { why: "busy" } });
  const step = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]).find((b) => b.text?.startsWith("failed to start"))!;
  expect(step.raw).toMatchObject({ cant: { why: "busy" } });
});

test("words to a task that never started start it: its place asked again, its brief first, the words after; never a resume of nothing", async () => {
  const turns: string[] = [];
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async (t) => void turns.push(String((t as { input?: unknown }).input ?? "")) }) });
  const runner = createRunner(core, { harness: port, newId: () => "tsk00001" });
  const repo = makeRepo("mem");
  const asked: unknown[] = [];
  core.places = {
    preflight: async (a) => ({ ok: true, place: a.place }),
    quick: () => false,
    cantStart: async (_id, p) => ({ why: p.why, computer: "Hetzner Server", what: "mem", line: "没能开始：Hetzner Server 上没有 mem 的代码" }),
    replan: async (taskId, how) => (asked.push([taskId, how.action]), { ok: true, place: { kind: "repo", device: "local", repoPath: repo } }),
  };
  // hel's 改进 Mem 常规设置页: a path the partner chose that was no repository.
  const card = await runner.openTask({ persona: "p1", title: "改进 Mem 常规设置页（#10559）", brief: "the brief", place: { kind: "repo", device: "local", repoPath: join(dir, "root-dev-mem") } });
  await runner.whenStarted(card.taskId).catch(() => {});
  expect(core.tasks.get(card.taskId)!.attention).toBe("failed");
  const r = await runner.send(card.taskId, "啊，我们已经有 https://github.com/nowledge-co/mem/pull/10646 在做了", undefined, "user", "c1");
  expect(r).toEqual({ delivered: "prompted" });
  await runner.whenStarted(card.taskId);
  await Bun.sleep(50);
  expect(asked).toEqual([[card.taskId, "reopen"]]);
  const opens = core.events.filter((e) => e.kind === "task_open").map((e) => e.body as Bodies["task_open"]);
  expect(opens.at(-1)!.place).toMatchObject({ kind: "repo", repoPath: repo });
  // Its first turn: start from the brief (the session's own), then the words the person said.
  expect(turns[0]).toContain('Start the task "改进 Mem 常规设置页（#10559）" now, following your task brief.');
  expect(turns[0]).toContain("The latest message for you:\n啊，我们已经有 https://github.com/nowledge-co/mem/pull/10646 在做了");
  const said = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]);
  expect(said.some((b) => b.role === "user" && b.from === "user" && b.text?.startsWith("啊，我们已经有"))).toBe(true);
  expect(said.some((b) => b.text?.includes("could not start the session"))).toBe(false);
});
