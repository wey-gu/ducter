// D341: a task the partner opened for a to-do is bound to it, by its take or, when the take was
// skipped, by the one open issue its brief names (owner/repo#n, the address, or repo#n).
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { startCore } from "../src/core.ts";
import { fakeGh } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot() {
  const t = tempDir();
  const gh = fakeGh([
    { repo: "nowledge-co/hawdb", number: 1592, title: "Compaction test is flaky on CI" },
    { repo: "wey-gu/ducter", number: 9, title: "Typo in docs/install.md" },
  ]);
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000 } });
  stops.push(t.cleanup, () => core.stop());
  const open = (taskId: string) => core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: "x", project: "", place: { kind: "none" }, harness: "codex", brief: "x" } });
  return { core, open };
}

test("a take binds the next task opened; a skipped take binds by the one issue the brief names", async () => {
  const { core, open } = boot();
  const ts = core.taskSources;
  await ts.add("github");
  await ts.look();
  const it = (await ts.item("wey-gu/ducter#9"))!;
  ts.stage(it);
  open("t1");
  ts.bindStaged("t1", ["anything"]);
  expect(core.tasks.get("t1")!.source?.ref).toBe("wey-gu/ducter#9");
  open("t2");
  ts.bindStaged("t2", ["Fix the flaky compaction test (hawdb#1592).", "Fix it"]);
  await Bun.sleep(30);
  expect(core.tasks.get("t2")!.source?.ref).toBe("nowledge-co/hawdb#1592");
  // Two named, or none: not guessed.
  open("t3");
  ts.bindStaged("t3", ["hawdb#1592 and ducter#9"]);
  open("t4");
  ts.bindStaged("t4", ["the flaky test"]);
  await Bun.sleep(30);
  expect(core.tasks.get("t3")!.source).toBeUndefined();
  expect(core.tasks.get("t4")!.source).toBeUndefined();
});
