// D390: a task's steps (brief first, each later message, what came of it, the commit before it),
// Past tasks' computer and ending filters, and 从这一步重来 / Redo from here opening a new task
// from a step with what led up to it and its code from the last commit before that step.
import { expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Place } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { createMarks, createPast } from "../src/past.ts";
import { createRedo } from "../src/redo.ts";
import type { NewTaskInput } from "../src/newtask.ts";
import type { Clock } from "../src/clock.ts";
import { tempDir } from "./helpers.ts";

const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
const MIN = 60_000;

function world() {
  const t = tempDir();
  let now = T0;
  const clock: Clock = { now: () => now, setTimeout: () => 0, clearTimeout: () => {} };
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "ann", clock });
  const tasks = createRegistry(log, clock);
  const marks = createMarks({ dataDir: t.dir, now: () => now });
  const past = createPast({ log, tasks, marks, computerName: (d) => (d === "w_haswell" ? "haswell" : undefined), now: () => now });
  const at = (m: number) => (now = T0 + m * MIN);
  const place: Place = { kind: "repo", device: "local", repoPath: "/src/hawdb", branch: "ducter/compaction", baseBranch: "main" };
  log.append({ stream: "task:c1", origin: "partner", kind: "task_open", body: { taskId: "c1", title: "Compaction picker", project: "hawdb", place, harness: "claude-code", brief: "Split the compaction picker out of the scheduler" } });
  at(10);
  log.append({ stream: "task:c1", origin: "task", kind: "task_event", body: { taskId: "c1", role: "assistant", text: "Split it into picker.rs.\nTests pass." } });
  at(20);
  log.append({ stream: "task:c1", origin: "user", kind: "task_event", body: { taskId: "c1", role: "user", from: "user", text: "Now make the picker async" } });
  at(30);
  log.append({ stream: "task:c1", origin: "task", kind: "task_event", body: { taskId: "c1", role: "assistant", text: "The picker is async; one test is flaky." } });
  at(40);
  log.append({ stream: "task:c1", origin: "partner", kind: "task_event", body: { taskId: "c1", role: "user", from: "partner", text: "Use io_uring for the reads" } });
  at(50);
  log.append({ stream: "task:c1", origin: "task", kind: "task_event", body: { taskId: "c1", role: "assistant", text: "## io_uring reads are in" } });
  log.append({ stream: "task:c1", origin: "task", kind: "report", body: { taskId: "c1", state: "failed", summary: "io_uring reads are in, but CI fails on Linux 5.4.", questions: [], evidence: [] } as Bodies["report"] });
  log.append({ stream: "task:c1", origin: "task", kind: "task_state", body: { taskId: "c1", attention: "failed", residency: "parked" } });
  at(60);
  const wp: Place = { kind: "repo", device: "w_haswell", repoPath: "/home/fake/build", branch: "ducter/rust-build" };
  log.append({ stream: "task:r1", origin: "partner", kind: "task_open", body: { taskId: "r1", title: "Rust build cache", project: "build", place: wp, harness: "codex", brief: "Make the Rust build use sccache" } });
  log.append({ stream: "task:r1", origin: "task", kind: "task_state", body: { taskId: "r1", attention: "done", residency: "parked" } });
  // The task's own commits: one after step 1 (10:15), one after step 2 (10:35); the base before it opened.
  const iso = (m: number) => new Date(T0 + m * MIN).toISOString();
  const git = async (_cwd: string, args: string[]) => (args[0] === "log" ? { ok: true, out: [`${"b".repeat(40)}\t${iso(35)}`, `${"a".repeat(40)}\t${iso(15)}`, `${"0".repeat(40)}\t${iso(-600)}`].join("\n") } : { ok: false, out: "" });
  const opened: NewTaskInput[] = [];
  const redo = createRedo({
    past,
    tasks,
    git,
    lang: () => "en",
    open: async (i) => {
      opened.push(i);
      return { ok: true, card: { ...tasks.get("c1")!, taskId: "c2", harness: i.harness ?? "claude-code" } };
    },
  });
  return { past, redo, opened, cleanup: t.cleanup };
}

test("steps: the brief, then each message to it, with what came of it and the commit before it", async () => {
  const w = world();
  const r = await w.redo.steps("c1");
  expect(r.repo).toBe(true);
  expect(r.report).toContain("CI fails");
  expect(r.steps.map((s) => [s.n, s.who, s.text, s.came, s.commit])).toEqual([
    [1, "partner", "Split the compaction picker out of the scheduler", "Split it into picker.rs.", undefined],
    [2, "you", "Now make the picker async", "The picker is async; one test is flaky.", "aaaaaaa"],
    [3, "partner", "Use io_uring for the reads", "io_uring reads are in", "bbbbbbb"],
  ]);
  const it = w.past.item("c1")!;
  expect(it.steps).toBe(3);
  expect(it.lastWords).toBe("io_uring reads are in");
  w.cleanup();
});

test("filters: the computer a task ran on, and how it ended", () => {
  const w = world();
  const q = (x: object) => w.past.query("ann", x).items.map((i) => i.taskId);
  expect(q({ computer: "haswell" })).toEqual(["r1"]);
  expect(q({ computer: "" })).toEqual(["c1"]);
  expect(q({ ended: "failed" })).toEqual(["c1"]);
  expect(q({ ended: "done" })).toEqual(["r1"]);
  const f = w.past.query("ann", {}).facets.computers!;
  expect(f.map((c) => c.name).sort()).toEqual(["", "haswell"]);
  w.cleanup();
});

test("redo from step 3 with Codex: a new branch off the commit before it, what led up to it in the brief", async () => {
  const w = world();
  const r = await w.redo.fork({ taskId: "c1", step: 3, harness: "codex" });
  expect(r.ok).toBe(true);
  const i = w.opened[0]!;
  expect(i.from).toBe("c1");
  expect(i.fromStep).toBe(3);
  expect(i.harness).toBe("codex");
  expect(i.words).toBe("Use io_uring for the reads");
  expect(i.place).toEqual({ kind: "repo", device: "local", repoPath: "/src/hawdb", baseBranch: "b".repeat(40) });
  expect(i.brief).toContain("Step 2, the person said: Now make the picker async");
  expect(i.brief).toContain("commit bbbbbbb");
  expect(i.brief).not.toContain("io_uring reads are in"); // what came after that step stays in the original
  w.cleanup();
});

test("redo from the start: the code is where it began; the last step when none is named", async () => {
  const w = world();
  await w.redo.fork({ taskId: "c1", step: 1, words: "Split the picker, keep the API" });
  expect(w.opened[0]!.place).toEqual({ kind: "repo", device: "local", repoPath: "/src/hawdb", baseBranch: "main" });
  expect(w.opened[0]!.brief).toContain("it made no commit before this step");
  expect(w.opened[0]!.words).toBe("Split the picker, keep the API");
  const last = await w.redo.fork({ taskId: "c1" });
  expect(last.step).toBe(3);
  w.cleanup();
});
