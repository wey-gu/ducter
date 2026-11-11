// D216: On hand's cards carry each task's latest step (cut small) and what the user did with its
// branch (a merge, a draft PR), so every client can say both before it holds the task's events.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { openLog } from "../src/log.ts";
import { createRegistry, slimStep } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";

const open = (taskId: string) => ({
  stream: `task:${taskId}`,
  origin: "partner" as const,
  kind: "task_open" as const,
  body: { taskId, title: "Fix it", project: "hawdb", place: { kind: "repo" as const, device: "local", repoPath: "/r", branch: "ducter/fix", baseBranch: "main" }, harness: "claude-code", brief: "Fix it." },
});

test("a card carries its latest step, found after a restart too", () => {
  const t = tempDir();
  const path = join(t.dir, "ducter.db");
  const log = openLog({ path, persona: "ann" });
  const tasks = createRegistry(log);
  log.append(open("t1"));
  tasks.setState("t1", "working", "hot");
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "Running the tests." } });
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "Bash", input: { command: "bun test", big: { a: 1 } }, output: "x".repeat(5000), ok: true } } });
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "system", from: "runner", text: "session started" } });
  const c = tasks.onHand().tasks[0]!;
  expect(c.latest?.body.tool?.name).toBe("Bash");
  expect(c.latest?.body.tool?.input).toEqual({ command: "bun test" });
  expect(c.latest?.body.tool?.output?.length).toBe(300);
  // A fresh registry over the same Log reads the stream's tail once.
  const again = createRegistry(log);
  expect(again.onHand().tasks[0]!.latest?.body.tool?.name).toBe("Bash");
  t.cleanup();
});

test("a merge or a draft PR from Ducter shows on the card", () => {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "ann" });
  const tasks = createRegistry(log);
  log.append(open("t2"));
  tasks.setState("t2", "done", "parked");
  log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t2_open_pr", taskId: "t2", state: "done", text: "the user opened a draft PR", act: "open_pr", ref: "https://github.com/o/r/pull/7" } });
  expect(tasks.onHand().tasks[0]!.integrated).toMatchObject({ act: "open_pr", ref: "https://github.com/o/r/pull/7" });
  t.cleanup();
});

test("slimStep keeps only short scalar input fields", () => {
  const e = { seq: 1, ts: "2026-11-12T00:00:00Z", persona: "p", stream: "task:a", origin: "task" as const, kind: "task_event" as const, body: { taskId: "a", role: "tool" as const, tool: { name: "Write", input: { file_path: "/a.ts", content: "y".repeat(2000) } } } };
  const s = slimStep(e);
  expect((s.body.tool!.input as { content: string }).content.length).toBe(400);
});
