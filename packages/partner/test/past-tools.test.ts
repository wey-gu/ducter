// D391: task_find finds an earlier task by the person's words with where it stopped (or a task's
// steps by its id); task_fork redoes a step as a new task under the line said before it; neither
// works unasked.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, PastForkInput, PastItem, PastQuery, TaskCard } from "../../protocol/src/index.ts";
import { createPartner } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const NOW = Date.parse("2026-11-19T10:00:00Z");

function setup(script: Script) {
  const clock = new FakeClock();
  clock.t = NOW;
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-pastt-")));
  const card = (taskId: string, title: string, harness = "claude-code") =>
    fc.cards.set(taskId, { taskId, persona: fc.core.persona.id, title, project: "hawdb", place: { kind: "repo", device: "local", repoPath: "/fake/hawdb", branch: `ducter/${taskId}` }, harness, attention: "failed", residency: "cold", openedAt: new Date(NOW - 3 * 86_400_000).toISOString(), updatedAt: new Date(NOW - 3 * 86_400_000).toISOString() } as TaskCard);
  card("t_wal", "WAL group commit");
  const queries: PastQuery[] = [];
  const forks: PastForkInput[] = [];
  const item: PastItem = { taskId: "t_wal", title: "WAL group commit", project: "hawdb", harness: "claude-code", openedAt: new Date(NOW - 3 * 86_400_000).toISOString(), updatedAt: new Date(NOW - 3 * 86_400_000).toISOString(), attention: "failed", outcome: "CI fails on Linux 5.4.", branch: "ducter/t_wal", kind: "build", steps: 4, hit: { field: "title", text: "WAL group commit" } };
  (fc.core as unknown as { past: unknown; redo: unknown }).past = { query: (_p: string, q: PastQuery) => (queries.push(q), q.computer === "haswell" ? { items: [], total: 0 } : { items: [item], total: 1 }) };
  (fc.core as unknown as { past: unknown; redo: unknown }).redo = {
    steps: async () => ({ steps: [1, 2, 3, 4].map((n) => ({ n, seq: n, at: new Date(NOW).toISOString(), who: n === 1 ? "partner" : "you", text: `step ${n}`, commit: n > 1 ? `c0ffee${n}` : undefined })), repo: true }),
    fork: async (i: PastForkInput) => {
      forks.push(i);
      card("t_redo", "Write to disk with io_uring", i.harness);
      return { ok: true, card: fc.cards.get("t_redo")!, step: i.step ?? 4 };
    },
  };
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, partner, user, queries, forks };
}

type R = { ok: boolean; error?: string; tasks?: { taskId: string; ended: string; result?: string; steps?: number }[]; steps?: { n: number; codeAt?: string }[]; taskId?: string; redoes?: string };

test("task_find: their words and the computer; a computer that isn't a name here is dropped; a task's steps by id", async () => {
  let found: R | undefined;
  let steps: R | undefined;
  const { fc, partner, user, queries } = setup(async (_i, s) => {
    found = (await fc.callTool("task_find", { words: "上周 WAL", computer: "haswell", agent: "claude-code" })) as R;
    steps = (await fc.callTool("task_find", { taskId: "t_wal" })) as R;
    s.say("是三天前那个 WAL group commit。");
    s.end();
  });
  user("WAL 那个还记得吗");
  await partner.idle();
  expect(queries[0]).toEqual({ q: "上周 WAL", harness: "claude-code", computer: "haswell", limit: 5 });
  expect(queries[1]!.computer).toBeUndefined();
  expect(found!.tasks!.map((t) => [t.taskId, t.ended, t.result, t.steps])).toEqual([["t_wal", "didn't work", "CI fails on Linux 5.4.", 4]]);
  expect(steps!.steps!.map((s) => [s.n, s.codeAt])).toEqual([[1, undefined], [2, "c0ffee2"], [3, "c0ffee3"], [4, "c0ffee4"]]);
});

test("task_fork: step 3 with Codex as a new task, its line the one said before the call", async () => {
  let r: R | undefined;
  const { fc, partner, user, forks } = setup(async (_i, s) => {
    s.say("我从第 3 步换 Codex 重做 WAL 那件。");
    r = (await fc.callTool("task_fork", { taskId: "t_wal", step: 3, harness: "codex" })) as R;
    s.end();
  });
  user("WAL 那个从第 3 步换 Codex 再试");
  await partner.idle();
  expect(r!.ok).toBe(true);
  expect(forks).toEqual([{ taskId: "t_wal", step: 3, harness: "codex" }]);
  const acks = fc.core.log.read({ stream: "channel", kinds: ["ack"], limit: 10 }).map((e) => (e.body as Bodies["ack"]).text);
  expect(acks).toEqual(["我从第 3 步换 Codex 重做 WAL 那件。"]);
  const jobs = fc.core.log.read({ stream: "channel", kinds: ["job_status"], limit: 10 }).map((e) => e.body as Bodies["job_status"]);
  expect(jobs.map((j) => [j.taskId, j.state])).toEqual([["t_redo", "running"]]);
});

test("unasked (no user words this turn): neither tool runs", async () => {
  const { fc } = setup(async () => {});
  expect(((await fc.callTool("task_find", { words: "WAL" })) as R).ok).toBe(false);
  expect(((await fc.callTool("task_fork", { taskId: "t_wal" })) as R).ok).toBe(false);
});
