// D284: a long task's stream for the opened-task perf tests (both clients): a day of a review
// loop, ~25 events a turn, with what a real Claude Code run logs (reads with their 2 KB previews,
// shell runs, edits, thinking, its words, a turn end). Deterministic; the Go port is in
// apps/desktop/internal/views/longtask_test.go and makes the same sizes.
import type { LogEvent } from "../src/index.ts";

const LINE = "  const rows = await store.page({ taskId, beforeSeq, limit: 200 }); // the newest window first\n";
/** A tool's output as the runner logs it: its preview, at most 2,048 chars (normalize.ts). */
const out = (i: number, n: number) => (`${i}: ` + LINE).repeat(Math.ceil(n / LINE.length)).slice(0, n);

export function longTask(n: number, opts: { taskId?: string; startSeq?: number; start?: number } = {}): LogEvent[] {
  const id = opts.taskId ?? "long1";
  const stream = `task:${id}`;
  let seq = opts.startSeq ?? 1000;
  let at = opts.start ?? Date.parse("2026-11-16T00:00:00.000Z");
  const evs: LogEvent[] = [];
  const add = (origin: LogEvent["origin"], kind: LogEvent["kind"], body: unknown) => {
    at += 7_000;
    evs.push({ seq: seq++, ts: new Date(at).toISOString(), persona: "default", stream, origin, kind, body } as LogEvent);
  };
  add("partner", "task_open", { taskId: id, title: "Review the open PRs every 45 minutes", project: "ducter", place: { kind: "repo", repoPath: "/Users/weyl/dev/ducter" }, harness: "claude-code", model: "claude-opus-5-5", brief: "Every 45 minutes, review the open PRs on wey-gu/ducter: read each new diff, run its tests, and leave a review. Tell me only when one needs me.", origin: "partner" });
  add("system", "task_state", { taskId: id, attention: "working", residency: "hot" });
  let turn = 0;
  while (evs.length < n) {
    const k = turn++;
    if (k > 0) {
      const text = k % 7 === 0 ? `PR #${200 + k} looks risky, look at the migration twice` : `等到了：「下一轮审查时间到」。接着做。`;
      add(k % 7 === 0 ? "user" : "partner", "task_event", { taskId: id, role: "user", from: k % 7 === 0 ? "user" : "partner", text });
    }
    add("task", "task_event", { taskId: id, role: "assistant", thinking: ["Which PRs changed since the last round", "What the tests cover"] });
    for (let s = 0; s < 20 && evs.length < n; s++) {
      const i = k * 100 + s;
      if (s % 5 === 4)
        add("task", "task_event", { taskId: id, role: "tool", tool: { name: "Edit", input: { file_path: `/Users/weyl/dev/ducter/packages/core/src/f${i}.ts`, old_string: out(i, 700), new_string: out(i + 1, 760) }, ok: true } });
      else if (s % 5 === 3)
        add("task", "task_event", { taskId: id, role: "tool", tool: { name: "Bash", input: { command: `bun test packages/core/test/f${i}.test.ts`, description: "Run the tests" }, output: out(i, 2048), ok: s % 15 !== 3 } });
      else add("task", "task_event", { taskId: id, role: "tool", tool: { name: "Read", input: { file_path: `/Users/weyl/dev/ducter/packages/core/src/f${i}.ts` }, output: out(i, 2048), ok: true } });
    }
    add("task", "task_event", { taskId: id, role: "assistant", text: `Round ${k + 1}: reviewed ${(k % 4) + 1} PRs. #${200 + k} is fine to merge; #${201 + k} needs a rebase after the protocol change, I left a review saying so.` });
    add("task", "task_event", { taskId: id, role: "system", raw: { turnEnd: true } });
  }
  return evs.slice(0, n);
}
