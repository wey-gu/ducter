// D522: a new task's branch and folder are ASCII: the cheap model's words (a fake here), checked by
// code for charset and length only, with a fallback, a `-2` on a clash, and the repository's own
// branch convention passed to the writer. Branches named before keep their names.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Place } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, WorkerLink } from "@ducter/protocol/src/internal.ts";
import { branchFromAnswer, branchPrompt, branchRules, fallbackBranch, nameBranch, validBranch, validSlug } from "../src/branch-name.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { git, planPlace } from "../src/places.ts";
import { remoteOps } from "../src/remote.ts";
import { createWorkerHost } from "../src/worker-host.ts";
import { createFakeCore } from "./fake-core.ts";

let dir: string;
beforeEach(() => void (dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-branch-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const validRef = (name: string) => Bun.spawnSync(["git", "check-ref-format", `refs/heads/${name}`]).exitCode === 0;
const ascii = (s: string) => /^[\x21-\x7e]+$/.test(s);

function makeRepo(files: Record<string, string> = {}): string {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "hi\n");
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(repo, f, ".."), { recursive: true });
    writeFileSync(join(repo, f), text);
  }
  Bun.spawnSync(["git", "-C", repo, "add", "."]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
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

// The author's title from nowledge-mem, the one that drew GitHub's "hidden characters" warning.
const TITLE = "添加自定义服务商弹窗切到 embedding 标签页时，同时显示模型下拉框";

test("D522: the slug code accepts: lowercase ASCII words, at most 40 characters, cut only at a word's end", () => {
  expect(validSlug("embedding-one-model")).toBe("embedding-one-model");
  expect(validSlug(" fix-login-crash ")).toBe("fix-login-crash");
  for (const bad of ["修复登录", "Fix-Login", "fix_login", "fix--login", "-fix", "fix-", "fix login", "feat/fix-login", "", "123-456", 42, undefined]) expect(validSlug(bad)).toBeUndefined();
  // Too long: whole words that fit, never a cut inside one.
  const long = "show-the-model-picker-when-switching-to-the-embedding-tab";
  const cut = validSlug(long)!;
  expect(cut.length).toBeLessThanOrEqual(40);
  expect(long.startsWith(`${cut}-`)).toBe(true);
  expect(validSlug("a".repeat(41))).toBeUndefined(); // one word past the limit: nothing whole to keep
  // The number is the branch's to put in front: a slug that repeats it loses it.
  expect(validSlug("11028-embedding-one-model", "11028")).toBe("embedding-one-model");
  expect(validSlug("398-412-distillation-errors", "398-412")).toBe("distillation-errors");
});

test("D522: the answer read: JSON with a slug, composed with the number; anything else falls back", () => {
  expect(branchFromAnswer('{"slug":"embedding-one-model"}', {})).toBe("ducter/embedding-one-model");
  expect(branchFromAnswer('Sure! {"slug":"embedding-one-model"}', { number: "11028" })).toBe("ducter/11028-embedding-one-model");
  expect(branchFromAnswer("```json\n{\"slug\": \"fix-login-crash\"}\n```", { number: "#7" })).toBe("ducter/7-fix-login-crash");
  for (const bad of ["", "embedding-one-model", '{"slug":"添加自定义服务商"}', '{"slug":"Embedding One"}', "{not json}", '{"name":"x"}']) expect(branchFromAnswer(bad, {})).toBeUndefined();
  // A whole branch counts only when the repository stated a convention to follow.
  expect(branchFromAnswer('{"branch":"feat/11028-embedding-one-model"}', {})).toBeUndefined();
  expect(branchFromAnswer('{"branch":"feat/11028-embedding-one-model"}', { rules: "Branches: feat/<issue>-<words>" })).toBe("feat/11028-embedding-one-model");
  for (const bad of ["feat/../x", "feat//x", "feat/x.lock", "feat/修复", "-x", "a/b/c/d/e", "feat/" + "x".repeat(80)]) expect(validBranch(bad)).toBeUndefined();
  expect(validBranch("JIRA-123/fix.login_v2")).toBe("JIRA-123/fix.login_v2");
});

test("D522: the fallback is the to-do's number, else the task's id; every name is a valid ASCII ref", () => {
  expect(fallbackBranch("k3m9p2qa", "11028")).toBe("ducter/11028");
  expect(fallbackBranch("k3m9p2qa")).toBe("ducter/task-k3m9p2qa");
  expect(fallbackBranch("T_8F3A!")).toBe("ducter/task-t8f3a");
  expect(fallbackBranch("k3m9p2qa", "not a number")).toBe("ducter/task-k3m9p2qa");
  for (const b of ["ducter/11028", "ducter/task-k3m9p2qa", branchFromAnswer('{"slug":"embedding-one-model"}', { number: "11028" })!]) {
    expect(validRef(b)).toBe(true);
    expect(ascii(b)).toBe(true);
  }
});

test("D522: the writer: a fake model's slug; a bad answer, a failure, a hang or no model at all: the fallback", async () => {
  const asked: string[] = [];
  const good = await nameBranch({ title: TITLE, taskId: "k3m9p2qa", number: "11028", ask: async (p) => (asked.push(p), '{"slug":"embedding-one-model"}') });
  expect(good).toEqual({ branch: "ducter/11028-embedding-one-model", how: "model" });
  expect(asked[0]).toContain(TITLE);
  expect(asked[0]).toContain("11028");
  expect(asked[0]).not.toContain("<repo-text>");
  expect(await nameBranch({ title: TITLE, taskId: "k3m9p2qa", ask: async () => "好的，分支叫 添加自定义服务商" })).toMatchObject({ branch: "ducter/task-k3m9p2qa", how: "fallback" });
  expect(await nameBranch({ title: TITLE, taskId: "k3m9p2qa", number: "11028", ask: async () => '{"slug":"添加-embedding"}' })).toMatchObject({ branch: "ducter/11028", how: "fallback" });
  expect(await nameBranch({ title: TITLE, taskId: "k3m9p2qa", ask: async () => Promise.reject(new Error("no AI agent to ask yet")) })).toMatchObject({ branch: "ducter/task-k3m9p2qa", how: "fallback", why: "no AI agent to ask yet" });
  const t0 = Date.now();
  expect(await nameBranch({ title: TITLE, taskId: "k3m9p2qa", waitMs: 50, ask: () => new Promise(() => {}) })).toMatchObject({ branch: "ducter/task-k3m9p2qa", how: "fallback", why: "the model took too long" });
  expect(Date.now() - t0).toBeLessThan(2000);
  expect(await nameBranch({ title: TITLE, taskId: "k3m9p2qa" })).toMatchObject({ branch: "ducter/task-k3m9p2qa", how: "fallback" });
});

test("D522: a repository's branch convention is read from its guides and passed to the writer, which follows it", async () => {
  const repo = makeRepo({
    "CONTRIBUTING.md": "# Contributing\n\nBe kind.\n\n## Branches\nName branches feat/<issue>-<words> or fix/<issue>-<words>.\nKeep them short.\n\n## Tests\nRun them.\n",
    "AGENTS.md": "Write tests.\n",
  });
  const rules = branchRules(repo)!;
  expect(rules).toContain("CONTRIBUTING.md");
  expect(rules).toContain("feat/<issue>-<words>");
  expect(rules).not.toContain("Be kind");
  expect(rules).not.toContain("AGENTS.md"); // says nothing of branches
  expect(branchRules(makeRepoAt("plain"))).toBeUndefined();
  const prompt = branchPrompt({ title: TITLE, number: "11028", rules });
  expect(prompt).toContain(`<repo-text>\n${rules}\n</repo-text>`);
  const n = await nameBranch({ title: TITLE, taskId: "k3m9p2qa", number: "11028", rules, ask: async (p) => (p.includes("feat/<issue>") ? '{"branch":"feat/11028-embedding-one-model"}' : '{"slug":"wrong"}') });
  expect(n).toEqual({ branch: "feat/11028-embedding-one-model", how: "model" });
  // A convention-shaped name that isn't a valid ASCII ref: the writer's slug if it gave one, else the fallback.
  expect(await nameBranch({ title: TITLE, taskId: "k3m9p2qa", rules, ask: async () => '{"branch":"feat/添加"}' })).toMatchObject({ branch: "ducter/task-k3m9p2qa", how: "fallback" });
});

function makeRepoAt(name: string): string {
  const repo = join(dir, name);
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "AGENTS.md"), "Use bun.\n");
  return repo;
}

test("D522: end to end in the runner: an ASCII branch and folder from a CJK title, a clash gets -2, the convention reaches the writer", async () => {
  const repo = makeRepo({ ".github/CONTRIBUTING.md": "PR branches must start with fix/ or feat/.\n" });
  const core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  const prompts: string[] = [];
  core.branchAsk = async (p) => (prompts.push(p), '{"slug":"embedding-tab-model-picker"}');
  const ids = ["k3m9p2qa", "x7y8z9ab", "q2w3e4r5"];
  const runner = createRunner(core, { harness: idlePort(), newId: () => ids.shift()! });
  try {
    const a = await runner.openTask({ persona: "p1", title: TITLE, brief: "b", place: { kind: "repo", device: "local", repoPath: repo } });
    await runner.whenStarted(a.taskId);
    const pa = core.tasks.get(a.taskId)!.place as { branch: string; worktree: string };
    expect(pa.branch).toBe("ducter/embedding-tab-model-picker");
    expect(pa.worktree).toBe(join(core.dataDir, "ducter", "worktrees", "repo", "embedding-tab-model-picker"));
    expect(ascii(pa.branch) && ascii(pa.worktree)).toBe(true);
    expect((await git(pa.worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).out).toBe(pa.branch);
    // The repository's own words on branches went to the writer.
    expect(prompts[0]).toContain("PR branches must start with fix/ or feat/.");
    // Recorded on the task: the name and who wrote it.
    const named = core.events.filter((e) => e.kind === "task_event" && (e.body as { taskId: string }).taskId === a.taskId).map((e) => (e.body as { raw?: { branchNamed?: unknown } }).raw?.branchNamed).filter(Boolean);
    expect(named).toEqual([{ branch: pa.branch, how: "model" }]);
    // The same words for another task: the next free number, for the branch and its folder.
    const b = await runner.openTask({ persona: "p1", title: TITLE, brief: "b", place: { kind: "repo", device: "local", repoPath: repo } });
    await runner.whenStarted(b.taskId);
    expect(core.tasks.get(b.taskId)!.place).toMatchObject({ branch: "ducter/embedding-tab-model-picker-2", worktree: join(core.dataDir, "ducter", "worktrees", "repo", "embedding-tab-model-picker-2") });
    // A hand-over's to-do number starts the branch; a model that fails leaves the number alone.
    core.branchAsk = async () => Promise.reject(new Error("signed out"));
    const c = await runner.openTask({ persona: "p1", title: TITLE, brief: "b", todo: "11028", place: { kind: "repo", device: "local", repoPath: repo } });
    await runner.whenStarted(c.taskId);
    expect(core.tasks.get(c.taskId)!.place).toMatchObject({ branch: "ducter/11028", worktree: join(core.dataDir, "ducter", "worktrees", "repo", "11028") });
    expect(existsSync(join(core.dataDir, "ducter", "worktrees", "repo", "11028", "README.md"))).toBe(true);
  } finally {
    await runner.dispose();
  }
});

test("D522: a place that already has a branch keeps it (a task from before, a CJK one too): never asked, never renamed", async () => {
  const repo = makeRepo();
  const core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
  let asked = 0;
  core.branchAsk = async () => (asked++, '{"slug":"never-used"}');
  const runner = createRunner(core, { harness: idlePort(), newId: () => "k3m9p2qa" });
  try {
    const old = "ducter/添加自定义服务商弹窗切到-embedding-标签页时-同";
    const card = await runner.openTask({ persona: "p1", title: TITLE, brief: "b", place: { kind: "repo", device: "local", repoPath: repo, branch: old } });
    await runner.whenStarted(card.taskId);
    const p = core.tasks.get(card.taskId)!.place as { branch: string; worktree: string };
    expect(p.branch).toBe(old);
    expect(p.worktree).toBe(join(core.dataDir, "ducter", "worktrees", "repo", "添加自定义服务商弹窗切到-embedding-标签页时-同"));
    expect(asked).toBe(0);
    // planPlace with no name at all (a path that skipped the writer): the ASCII fallback, never the title's script.
    const r = await planPlace({ kind: "repo", device: "local", repoPath: repo }, "q2w3e4r5", TITLE, join(dir, "data2"));
    expect(r.place).toMatchObject({ branch: "ducter/task-q2w3e4r5", worktree: join(dir, "data2", "ducter", "worktrees", "repo", "task-q2w3e4r5") });
  } finally {
    await runner.dispose();
  }
});

test("D522: on a worker the convention is read there over the worker protocol; an older worker names it without one", async () => {
  const repo = makeRepo({ "CONTRIBUTING.md": "Branch names: fix/<words>.\n" });
  const sent: { id?: number; ok?: boolean; result?: unknown; error?: string }[] = [];
  const host = createWorkerHost({ dataDir: join(dir, "worker", ".ducter"), harness: {} as never, mainBase: "http://main", deviceToken: "dvc", send: (f) => sent.push(f), home: join(dir, "worker") });
  let n = 0;
  const call = async <T,>(op: string, args: object): Promise<T> => {
    const id = ++n;
    await host.handle({ t: "req", id, op, args } as never);
    const r = sent.find((f) => f.id === id)!;
    if (!r.ok) throw new Error(r.error ?? "failed");
    return r.result as T;
  };
  const link = (calls: typeof call): WorkerLink => ({ id: "w", name: "Mac mini", online: () => true, onOnline: () => () => {}, call: calls }) as unknown as WorkerLink;
  const place: Place = { kind: "repo", device: "w", repoPath: repo };
  expect(await remoteOps(link(call)).branchRules!(place)).toContain("Branch names: fix/<words>.");
  expect(await remoteOps(link(call)).branchRules!({ kind: "repo", device: "w", repoPath: join(dir, "nowhere") })).toBeUndefined();
  const old = remoteOps(link(async (op) => Promise.reject(new Error(`unknown op ${op}`))));
  expect(await old.branchRules!(place)).toBeUndefined();
});
