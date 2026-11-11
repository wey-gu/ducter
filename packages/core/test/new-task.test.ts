// 开一件事 / New task (D128): the opening path the card and `ducter task` share, its frames,
// open_task, and the cached diff stat for On hand by project.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, BranchChanges, LogEvent, ServerFrame, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { createChanges } from "../src/changes.ts";
import { chooseBody } from "../src/candidates.ts";
import { titleFromWords } from "../src/newtask.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const sh = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};

function repo(dir: string, name = "tinycart"): string {
  const r = join(dir, name);
  Bun.spawnSync(["git", "init", "-q", "-b", "main", r]);
  sh(r, "config", "user.name", "t");
  sh(r, "config", "user.email", "t@t");
  writeFileSync(join(r, "a.txt"), "a\n");
  sh(r, "add", ".");
  sh(r, "commit", "-qm", "init");
  sh(r, "branch", "feature/x");
  return realpathSync(r); // what the repo's top resolves to (/private/var on macOS)
}

type Opened = Parameters<Runner["openTask"]>[0];

/** A runner that opens tasks the way the real one logs them, and remembers what it was asked. */
function fakeRunner(core: Core, opts: { changes?: BranchChanges } = {}) {
  const opened: Opened[] = [];
  let n = 0;
  const r = {
    harness: { start: async () => ({}) as any, available: async () => [] },
    async openTask(input: Opened): Promise<TaskCard> {
      opened.push(input);
      const taskId = `t${++n}`;
      core.log.append({
        stream: `task:${taskId}`,
        origin: "system",
        kind: "task_open",
        body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "claude-code", brief: input.brief, ...(input.language ? { language: input.language } : {}), ...(input.origin ? { origin: input.origin } : {}) },
      });
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: input.harness ?? "claude-code", why: { kind: input.harness ? "you" : "default" } } });
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
    branchChanges: async () => opts.changes,
  };
  core.setRunner(r as unknown as Runner);
  return { opened };
}

function boot(extra: Partial<Parameters<typeof startCore>[0]> = {}): { core: Core; dir: string; woke: LogEvent[] } {
  const t = tempDir();
  // Two AI agents signed in here: the candidates come from them, never from probing this Mac.
  const harnesses = async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: true },
  ];
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "laptop" }, ...extra });
  stops.push(t.cleanup, () => core.stop());
  const woke: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void woke.push(e) });
  return { core, dir: t.dir, woke };
}

async function client(core: Core, kind?: "cli" | "desktop") {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello", ...(kind ? { client: kind } : {}) }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 3000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

test("a title is the first sentence of the words, short", () => {
  expect(titleFromWords("修一下 tinycart 里失败的测试。顺便看看 CI。")).toBe("修一下 tinycart 里失败的测试");
  expect(titleFromWords("Fix the flaky login test. Then look at CI.")).toBe("Fix the flaky login test");
  expect(titleFromWords("  把结账页的按钮颜色统一成主题色，然后把所有用到旧颜色的地方都替换掉，再跑一遍截图对比")).toBe("把结账页的按钮颜色统一成主题色，然后把所有用到旧…");
  expect(titleFromWords("Rename every use of the old checkout color token across the web and desktop apps")).toBe("Rename every use of the old checkout color…");
  expect(titleFromWords("first line\nsecond line")).toBe("first line");
  expect(titleFromWords("v1.2 release notes")).toBe("v1.2 release notes"); // a dot inside a word isn't a full stop
});

test("task_new opens a task with the user's words as they are, says nothing in the conversation, and tells the partner quietly", async () => {
  const { core, dir, woke } = boot();
  const { opened } = fakeRunner(core);
  const r = repo(dir);
  const c = await client(core);
  const words = "修一下 tinycart 里失败的测试。别改 API。";
  c.send({ t: "task_new", words, place: { kind: "repo", device: "local", repoPath: join(r, ".") }, harness: "codex", clientId: "c1" });
  const res = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result");
  expect(res).toMatchObject({ ok: true, clientId: "c1", taskId: "t1" });
  expect(res.card).toMatchObject({ title: "修一下 tinycart 里失败的测试", openedBy: "you", project: "tinycart", place: { kind: "repo", repoPath: r, baseBranch: "main" } });
  // Verbatim: no rewrite, the brief is exactly what they typed.
  expect(opened).toEqual([{ persona: "default", title: "修一下 tinycart 里失败的测试", brief: words, place: { kind: "repo", device: "local", repoPath: r, baseBranch: "main" }, project: "tinycart", harness: "codex", language: "zh", origin: "you" }]);
  const open = core.log.read({ stream: "task:t1", kinds: ["task_open"] })[0]!.body as Bodies["task_open"];
  expect(open.origin).toBe("you");
  // The conversation shows nothing: no ack, no message, no visible job line.
  await Bun.sleep(20);
  const channel = core.log.read({ stream: "channel" });
  expect(channel.map((e) => e.kind)).toEqual(["job_status"]);
  expect(channel[0]).toMatchObject({ origin: "user", body: { jobId: "body_t1_opened", taskId: "t1" } });
  expect((channel[0]!.body as Bodies["job_status"]).text).toContain("opened this task themselves");
  expect(woke).toEqual([]); // it doesn't wake the partner; the task's report will
  // Counters change.
  const oh = await c.until<Extract<ServerFrame, { t: "on_hand" }>>((f) => f.t === "on_hand" && f.onHand.tasks.length === 1);
  expect(oh.onHand.counts.working).toBe(1);
});

test("a resend opens nothing twice; empty words, a folder that isn't a repo and a missing branch say why", async () => {
  const { core, dir } = boot();
  const { opened } = fakeRunner(core);
  const r = repo(dir);
  const c = await client(core);
  c.send({ t: "task_new", words: "Fix it.", clientId: "same" });
  c.send({ t: "task_new", words: "Fix it.", clientId: "same" });
  await c.until((f) => f.t === "task_new_result" && c.frames.filter((x) => x.t === "task_new_result").length === 2);
  expect(opened.length).toBe(1);
  expect(opened[0]).toMatchObject({ place: { kind: "none" }, brief: "Fix it.", language: "en", origin: "you" });
  expect(opened[0]!.harness).toBeUndefined(); // the top candidate: nobody pinned

  const ask = async (f: object) => {
    const before = c.frames.length;
    c.send(f);
    return c.until<Extract<ServerFrame, { t: "task_new_result" }>>((x) => x.t === "task_new_result" && c.frames.indexOf(x) >= before);
  };
  expect(await ask({ t: "task_new", words: "   " })).toMatchObject({ ok: false, reason: "empty" });
  expect(await ask({ t: "task_new", words: "x", place: { kind: "repo", device: "local", repoPath: dir } })).toMatchObject({ ok: false, reason: "not_repo" });
  expect(await ask({ t: "task_new", words: "x", place: { kind: "repo", device: "local", repoPath: r, baseBranch: "nope" } })).toMatchObject({ ok: false, reason: "failed", message: "tinycart has no branch called nope." });
  const picked = await ask({ t: "task_new", words: "x", place: { kind: "repo", device: "local", repoPath: r, baseBranch: "feature/x" } });
  expect(picked.card?.place).toMatchObject({ baseBranch: "feature/x" });
});

test("D207: a folder in Ducter's own data folder is refused with its own reason", async () => {
  const { core, dir } = boot();
  const { DucterDataError } = await import("../../runner/src/places.ts");
  core.setRunner({ openTask: async () => Promise.reject(new DucterDataError(join(dir, "partner"))) } as unknown as Runner);
  const c = await client(core);
  c.send({ t: "task_new", words: "看看这里", place: { kind: "folder", device: "local", path: join(dir, "partner") } });
  const res = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result");
  expect(res).toMatchObject({ ok: false, reason: "ducter_data" });
});

test("task_new_options: the repos tasks used, recent first, with their default branch and branches; no particular place last", async () => {
  const { core, dir } = boot();
  fakeRunner(core);
  const a = repo(dir, "hawdb");
  const b = repo(dir, "tinycart");
  // D204: a project in the home's Ducter folder (here, with a data folder of its own: <data>/ducter), never used for a task yet.
  repo(join(dir, "ducter", "projects"), "notes");
  const c = await client(core);
  for (const [p, i] of [[a, 1], [b, 2]] as const) {
    c.send({ t: "task_new", words: `task ${i}`, place: { kind: "repo", device: "local", repoPath: p }, clientId: `o${i}` });
    await c.until((f) => f.t === "task_new_result" && f.clientId === `o${i}`);
    await Bun.sleep(5);
  }
  c.send({ t: "task_new_options" });
  const o = await c.until<Extract<ServerFrame, { t: "task_new_options" }>>((f) => f.t === "task_new_options");
  expect(o.places.map((p) => p.name)).toEqual(["tinycart", "hawdb", "notes", ""]);
  expect(o.places[0]).toMatchObject({ place: { kind: "repo", device: "local", repoPath: b }, defaultBranch: "main" });
  expect(o.places[0]!.branches).toContain("feature/x");
  expect(o.places.at(-1)!.place).toEqual({ kind: "none" });
  expect(o.candidates.map((x) => x.harness + (x.model ? "/" + x.model : ""))).toEqual(["claude-code/opus", "codex", "claude-code/sonnet"]);
  expect(o.candidates[0]!.reason.kind).toBe("fit");
});

test("the user's pick is pinned for this task and says so", () => {
  const hs = [
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true },
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true },
  ];
  const base = { work: { title: "x" }, harnesses: hs, settings: { brain: { harness: "claude-code" as const } }, rules: [] };
  expect(chooseBody({ ...base, pinned: { harness: "codex" }, pinnedBy: "you" })).toEqual({ harness: "codex", why: { kind: "you" } });
  expect(chooseBody({ ...base, pinned: { harness: "codex" } })).toEqual({ harness: "codex", why: { kind: "partner" } });
});

test("open_task goes to the apps, never to a command line; the sender hears how many were told", async () => {
  const { core } = boot();
  fakeRunner(core);
  const app = await client(core, "desktop");
  const cli = await client(core, "cli");
  cli.send({ t: "task_new", words: "Look at the logs.", clientId: "x" });
  const r = await cli.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result");
  cli.send({ t: "open_task", taskId: r.taskId });
  expect(await cli.until((f) => f.t === "open_result")).toEqual({ t: "open_result", taskId: r.taskId!, ok: true, apps: 1 });
  expect(await app.until((f) => f.t === "open_task")).toEqual({ t: "open_task", taskId: r.taskId! });
  expect(cli.frames.some((f) => f.t === "open_task")).toBe(false);
  cli.send({ t: "open_task", taskId: "nope" });
  expect(await cli.until((f) => f.t === "open_result" && f.taskId === "nope")).toMatchObject({ ok: false, apps: 0 });
});

test("On hand carries each repo task's diff stat, counted after a turn and cached", async () => {
  const { core } = boot();
  let calls = 0;
  let stat: BranchChanges = { commits: 1, uncommitted: false, files: 3, adds: 42, dels: 7 };
  const runner = { branchChanges: async () => (calls++, stat) } as unknown as Runner;
  let changed = 0;
  const ch = createChanges({ log: core.log, tasks: core.tasks, runner: () => runner, onChange: () => void changed++, debounceMs: 5 });
  stops.push(() => ch.stop());
  core.log.append({ stream: "task:r1", origin: "system", kind: "task_open", body: { taskId: "r1", title: "Fix", project: "p", place: { kind: "repo", device: "local", repoPath: "/r", worktree: "/w", branch: "ducter/fix", baseBranch: "main" }, harness: "claude-code", brief: "b" } });
  core.log.append({ stream: "task:n1", origin: "system", kind: "task_open", body: { taskId: "n1", title: "Look", project: "", place: { kind: "none" }, harness: "claude-code", brief: "b" } });
  // First look: never counted, so it counts soon; On hand doesn't wait.
  expect(ch.decorate(core.tasks.onHand()).tasks.find((t) => t.taskId === "r1")!.changes).toBeUndefined();
  await Bun.sleep(30);
  const first = ch.decorate(core.tasks.onHand());
  expect(first.tasks.find((t) => t.taskId === "r1")!.changes).toMatchObject({ files: 3, adds: 42, dels: 7 });
  expect(first.tasks.find((t) => t.taskId === "n1")!.changes).toBeUndefined();
  expect(calls).toBe(1);
  expect(changed).toBe(1);
  // Reading again counts nothing; a turn ending counts again.
  ch.decorate(core.tasks.onHand());
  await Bun.sleep(20);
  expect(calls).toBe(1);
  stat = { ...stat, files: 4, adds: 50 };
  core.log.append({ stream: "task:r1", origin: "task", kind: "task_event", body: { taskId: "r1", role: "system", text: "turn completed", usage: { outputTokens: 10 } } });
  await Bun.sleep(30);
  expect(ch.get("r1")).toMatchObject({ files: 4, adds: 50, dels: 7 });
  expect(changed).toBe(2);
  // A report brings its own count at once.
  core.log.append({ stream: "task:r1", origin: "task", kind: "report", body: { taskId: "r1", state: "done", summary: "ok", questions: [], evidence: [], branch: { commits: 2, uncommitted: false, files: 5, adds: 60, dels: 9 } } });
  expect(ch.get("r1")).toMatchObject({ files: 5, adds: 60, dels: 9 });
});

test("the running core pushes On hand with the diff stat once counted", async () => {
  const { core } = boot();
  fakeRunner(core, { changes: { commits: 1, uncommitted: true, files: 2, adds: 9, dels: 1 } });
  const c = await client(core);
  core.log.append({ stream: "task:r1", origin: "system", kind: "task_open", body: { taskId: "r1", title: "Fix", project: "p", place: { kind: "repo", device: "local", repoPath: "/r", worktree: "/w", branch: "ducter/fix", baseBranch: "main" }, harness: "claude-code", brief: "b" } });
  const oh = await c.until<Extract<ServerFrame, { t: "on_hand" }>>((f) => f.t === "on_hand" && !!f.onHand.tasks[0]?.changes, 5000);
  expect(oh.onHand.tasks[0]!.changes).toMatchObject({ files: 2, adds: 9, dels: 1 });
});

// ---------- D185: when it starts; D186: projects by hand ----------

test("D185: at a time, or every …: a routine of the user's own, nothing opened now, On hand shows it", async () => {
  const { core, dir } = boot();
  const { opened } = fakeRunner(core);
  const r = repo(dir, "ducter");
  const c = await client(core);
  const place = { kind: "repo", device: "local", repoPath: r };
  c.send({ t: "task_new", words: "跑一遍发布清单。", place, harness: "codex", clientId: "at1", when: { kind: "at", date: "2030-01-02", time: "09:00", tz: "Asia/Shanghai" } });
  const res = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result");
  expect(res).toMatchObject({ ok: true, clientId: "at1", routine: { by: "you", state: "active", triggerWords: "1月2日 9:00", project: "ducter", harness: "codex", trigger: { every: "once" } } });
  expect(res.taskId).toBeUndefined();
  expect(opened).toEqual([]);
  const oh = await c.until<Extract<ServerFrame, { t: "on_hand" }>>((f) => f.t === "on_hand" && (f.onHand.routines?.length ?? 0) === 1);
  expect(oh.onHand.routines![0]!.nextAt).toBe("2030-01-02T01:00:00.000Z");
  // Every weekday at 9.
  c.send({ t: "task_new", words: "Check the nightly build.", clientId: "ev1", when: { kind: "every", every: "weekday", time: "09:00", tz: "UTC" } });
  const ev = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result" && f.clientId === "ev1");
  expect(ev.routine).toMatchObject({ triggerWords: "Weekdays 9:00 · follows your time zone", trigger: { every: "weekday", zone: "personal" } });
  // A time already gone says so.
  c.send({ t: "task_new", words: "x", clientId: "past", when: { kind: "at", date: "2020-01-01", time: "09:00", tz: "UTC" } });
  expect(await c.until((f) => f.t === "task_new_result" && f.clientId === "past")).toMatchObject({ ok: false, reason: "past" });
});

test("D185: when something happens, the task opens now and waits first; until, it keeps going; an empty condition says why", async () => {
  const { core, dir } = boot();
  const { opened } = fakeRunner(core);
  const r = repo(dir, "hawdb");
  const c = await client(core);
  c.send({ t: "task_new", words: "合进 main，然后发 0.4.1。", place: { kind: "repo", device: "local", repoPath: r }, clientId: "w1", when: { kind: "when", condition: "PR #1592 的 CI 通过" } });
  const w = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result" && f.clientId === "w1");
  expect(w).toMatchObject({ ok: true, taskId: "t1" });
  expect(opened[0]!.title).toBe("合进 main，然后发 0.4.1");
  expect(opened[0]!.brief).toStartWith("先等到：PR #1592 的 CI 通过\n然后：合进 main，然后发 0.4.1。");
  expect(opened[0]!.brief).toContain("wait_for");
  c.send({ t: "task_new", words: "Fix the flaky tests.", place: { kind: "repo", device: "local", repoPath: r }, clientId: "u1", when: { kind: "until", condition: "the test suite passes three times in a row" } });
  const u = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result" && f.clientId === "u1");
  expect(opened[1]!.brief).toBe("Fix the flaky tests."); // verbatim; the loop is Ducter's, not the words'
  const until = core.log.read({ stream: `task:${u.taskId}`, kinds: ["until"] })[0]!.body as Bodies["until"];
  expect(until).toMatchObject({ condition: "the test suite passes three times in a row", state: "on" });
  c.send({ t: "task_new", words: "x", clientId: "e1", when: { kind: "when", condition: "  " } });
  expect(await c.until((f) => f.t === "task_new_result" && f.clientId === "e1")).toMatchObject({ ok: false, reason: "no_condition" });
});

test("D186: a folder the user adds becomes a project: offered first, on On hand before any task, its tasks carry its name", async () => {
  const { core, dir } = boot();
  const { opened } = fakeRunner(core);
  const r = repo(dir, "tinycart");
  const notes = join(dir, "notes");
  mkdirSync(notes);
  const c = await client(core);
  c.send({ t: "project_add", path: join(r, "a.txt").replace(/a\.txt$/, ""), clientId: "p1" });
  const a = await c.until<Extract<ServerFrame, { t: "project_add_result" }>>((f) => f.t === "project_add_result" && f.clientId === "p1");
  expect(a).toMatchObject({ ok: true, place: { name: "tinycart", added: true, place: { kind: "repo", repoPath: r }, defaultBranch: "main" } });
  c.send({ t: "project_add", path: notes, clientId: "p2" });
  const b = await c.until<Extract<ServerFrame, { t: "project_add_result" }>>((f) => f.t === "project_add_result" && f.clientId === "p2");
  expect(b.place).toMatchObject({ name: "notes", place: { kind: "folder", path: notes } });
  const oh = await c.until<Extract<ServerFrame, { t: "on_hand" }>>((f) => f.t === "on_hand" && (f.onHand.projects?.length ?? 0) === 2);
  expect(oh.onHand.projects!.map((p) => p.name)).toEqual(["notes", "tinycart"]);
  c.send({ t: "task_new_options" });
  const o = await c.until<Extract<ServerFrame, { t: "task_new_options" }>>((f) => f.t === "task_new_options");
  expect(o.places.map((p) => p.name)).toEqual(["notes", "tinycart", ""]);
  c.send({ t: "task_new", words: "Tidy the notes folder.", place: { kind: "folder", device: "local", path: notes }, clientId: "n1" });
  await c.until((f) => f.t === "task_new_result" && f.clientId === "n1");
  expect(opened[0]).toMatchObject({ project: "notes", place: { kind: "folder", path: notes } });
  // Not a folder: said plainly.
  c.send({ t: "project_add", path: join(dir, "nope"), clientId: "p3" });
  expect(await c.until((f) => f.t === "project_add_result" && f.clientId === "p3")).toMatchObject({ ok: false, reason: "not_found" });
});

/** D197: the user's Mac as a worker of a home on a server: its folders read there, through the link. */
function fakeMac(state: { online: boolean; slow?: boolean; asked: string[] }) {
  const folders: Record<string, import("@ducter/protocol/src/folder-info.ts").FolderInfo> = {
    "/Users/weyl/dev/ducter/apps": { exists: true, kind: "repo", root: "/Users/weyl/dev/ducter", name: "ducter", defaultBranch: "main", branches: ["main", "worktree-x"] },
    "/Users/weyl/dev/ducter": { exists: true, kind: "repo", root: "/Users/weyl/dev/ducter", name: "ducter", defaultBranch: "main", branches: ["main", "worktree-x"] },
    "/Users/weyl/Notes": { exists: true, kind: "folder", root: "/Users/weyl/Notes", name: "Notes" },
  };
  return {
    nameOf: (dev: string) => (dev === "wmac" ? "Macbook Pro M3" : undefined),
    homeName: () => "Hetzner Server",
    async folderInfo(dev: string, path: string) {
      state.asked.push(path);
      if (dev !== "wmac" || !state.online) return "offline" as const;
      if (state.slow) await Bun.sleep(5_000);
      return folders[path] ?? { exists: false };
    },
  };
}

test("D197: a folder on this Mac, for a home elsewhere: read on the Mac, kept with its computer, offered with its branches and the computer's name", async () => {
  const mac = { online: true, asked: [] as string[] };
  const { core, dir } = boot({ newTaskComputers: fakeMac(mac) });
  const { opened } = fakeRunner(core);
  repo(join(dir, "ducter", "projects"), "hawdb"); // a project in the home's own Ducter folder
  const c = await client(core);
  // A folder inside a repo on the Mac adds the repo, on the Mac.
  c.send({ t: "project_add", path: "/Users/weyl/dev/ducter/apps", device: "wmac", clientId: "m1" });
  const a = await c.until<Extract<ServerFrame, { t: "project_add_result" }>>((f) => f.t === "project_add_result" && f.clientId === "m1");
  expect(a).toMatchObject({ ok: true, place: { name: "ducter", added: true, place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/dev/ducter" }, defaultBranch: "main", branches: ["main", "worktree-x"], computer: "Macbook Pro M3" } });
  expect(mac.asked[0]).toBe("/Users/weyl/dev/ducter/apps");
  c.send({ t: "project_add", path: "/Users/weyl/Notes", device: "wmac", clientId: "m2" });
  expect(await c.until((f) => f.t === "project_add_result" && f.clientId === "m2")).toMatchObject({ ok: true, place: { place: { kind: "folder", device: "wmac", path: "/Users/weyl/Notes" } } });
  // The card: each place says its computer, since they span two.
  c.send({ t: "task_new_options" });
  const o = await c.until<Extract<ServerFrame, { t: "task_new_options" }>>((f) => f.t === "task_new_options");
  expect(o.places.map((p) => [p.name, p.computer])).toEqual([["Notes", "Macbook Pro M3"], ["ducter", "Macbook Pro M3"], ["hawdb", "Hetzner Server"], ["", undefined]]);
  expect(o.places[1]).toMatchObject({ defaultBranch: "main", branches: ["main", "worktree-x"] });
  // A task there carries the project's name and the Mac's place.
  c.send({ t: "task_new", words: "Fix the card.", place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/dev/ducter", baseBranch: "worktree-x" }, clientId: "t1" });
  await c.until((f) => f.t === "task_new_result" && f.clientId === "t1");
  expect(opened[0]).toMatchObject({ project: "ducter", place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/dev/ducter", baseBranch: "worktree-x" } });
  // The Mac away: adding says so; the card still lists its places, without branches.
  mac.online = false;
  c.send({ t: "project_add", path: "/Users/weyl/Other", device: "wmac", clientId: "m3" });
  expect(await c.until((f) => f.t === "project_add_result" && f.clientId === "m3")).toMatchObject({ ok: false, reason: "offline" });
  const before = c.frames.length;
  c.send({ t: "task_new_options" });
  const o2 = await c.until<Extract<ServerFrame, { t: "task_new_options" }>>((f) => f.t === "task_new_options" && c.frames.indexOf(f) >= before);
  const d2 = o2.places.find((p) => p.name === "ducter")!;
  expect(d2.place).toMatchObject({ device: "wmac" });
  expect(d2.branches).toBeUndefined();
  // Not there on the Mac: said plainly.
  mac.online = true;
  c.send({ t: "project_add", path: "/Users/weyl/gone", device: "wmac", clientId: "m4" });
  expect(await c.until((f) => f.t === "project_add_result" && f.clientId === "m4")).toMatchObject({ ok: false, reason: "not_found" });
});

test("D197: a worker slow to answer never holds the card past the short wait", async () => {
  const mac = { online: true, slow: false, asked: [] as string[] };
  const { core } = boot({ newTaskComputers: fakeMac(mac) });
  fakeRunner(core);
  const c = await client(core);
  c.send({ t: "project_add", path: "/Users/weyl/dev/ducter", device: "wmac", clientId: "m1" });
  await c.until((f) => f.t === "project_add_result" && f.clientId === "m1");
  mac.slow = true;
  const t0 = Date.now();
  const before = c.frames.length;
  c.send({ t: "task_new_options" });
  const o = await c.until<Extract<ServerFrame, { t: "task_new_options" }>>((f) => f.t === "task_new_options" && c.frames.indexOf(f) >= before, 5000);
  expect(Date.now() - t0).toBeLessThan(4000);
  expect(o.places[0]).toMatchObject({ name: "ducter", place: { device: "wmac" } });
  expect(o.places[0]!.branches).toBeUndefined();
  // Only one computer among the places: no computer named.
  expect(o.places[0]!.computer).toBeUndefined();
});
