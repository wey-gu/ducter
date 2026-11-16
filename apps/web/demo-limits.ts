// D297: DEMO_LIMIT=1 seeds tasks whose agent ran out of its usage limit: three on Claude Code
// that share one reset (On hand groups them; the opened one shows the limit card with Hand it to
// Codex now), and one on pi that said no reset time.
import type { Core } from "@ducter/core";
import type { Bodies, Place } from "@ducter/protocol";

export async function seedLimits(core: Core, zh: boolean) {
  const log = core.log;
  const tick = () => Bun.sleep(30);
  const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "MacBook", repoPath, branch, baseBranch: "main" });
  const reset = new Date(Date.now() + 92 * 60_000);
  reset.setSeconds(0, 0);
  const open = async (id: string, title: string, place: Place, brief: string, harness = "claude-code") => {
    log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "HawDB", place, harness, ...(harness === "claude-code" ? { model: "opus" } : {}), brief } });
    core.tasks.setState(id, "working", "hot");
    await tick();
  };
  const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
  const wait = (id: string, harness: string, at: number, known: boolean, handTo?: string) =>
    log.append({
      stream: "channel",
      origin: "waiter",
      kind: "waiter",
      body: { waiterId: `w_${id}`, taskId: id, wakes: "task", reason: zh ? `${harness === "pi" ? "pi" : "Claude Code"} 的额度恢复` : `${harness === "pi" ? "pi" : "Claude Code"}'s limit resets`, state: "armed", at: new Date(at).toISOString(), limit: { harness, resetKnown: known, ...(handTo ? { handTo: { harness: handTo } } : {}) } } as Bodies["waiter"],
    } as never);
  const hit = (id: string, harness: string, resetsAt?: string) => {
    ev(id, { role: "system", text: "turn failed (quota): You've hit your limit", raw: { turnEnd: true, kind: "turn_ended", outcome: "failed", failure: "quota", ...(resetsAt ? { resetsAt } : {}) } });
    log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "system", text: `usage limit: ${harness}`, raw: { limit: { harness, failure: "quota", ...(resetsAt ? { resetsAt } : {}), source: resetsAt ? "event" : "none" } } } } as never);
  };

  const t1 = zh ? "跑完 WAL 基准测试，给出 p99" : "Run the WAL bench and report the p99";
  await open("t_lim1", t1, repo("~/dev/hawdb", "ducter/wal-bench"), zh ? "把 WAL 基准测试跑完一小时，告诉我 p99。" : "Run the WAL bench for an hour and tell me the p99.");
  ev("t_lim1", { role: "assistant", text: zh ? "先跑第一轮，看看基线。" : "First round to see the baseline." });
  ev("t_lim1", { role: "tool", tool: { name: "Bash", input: { command: "cargo bench -p hawdb-wal -- --warm-up-time 30" }, ok: true, output: "wal_append/4k   time: [3.8 ms 4.1 ms 4.4 ms]" } });
  ev("t_lim1", { role: "assistant", text: zh ? "第一轮 p99 4.1ms。接着跑 fsync 开着的那组。" : "Round one: p99 4.1 ms. Now the set with fsync on." });
  await (async () => {
    const t2 = zh ? "整理 PR #1592 的评审意见" : "Sort out the review comments on PR #1592";
    const t3 = zh ? "更新 0.9 的 changelog" : "Update the 0.9 changelog";
    await open("t_lim2", t2, repo("~/dev/hawdb", "ducter/review-1592"), zh ? "把 #1592 上的评审意见一条条处理掉。" : "Work through the review comments on #1592.");
    await open("t_lim3", t3, repo("~/dev/hawdb", "ducter/changelog-09"), zh ? "把 0.9 的 changelog 补全。" : "Fill in the 0.9 changelog.");
    for (const id of ["t_lim1", "t_lim2", "t_lim3"]) hit(id, "claude-code", reset.toISOString());
    await tick();
    for (const id of ["t_lim1", "t_lim2", "t_lim3"]) wait(id, "claude-code", reset.getTime() + 60_000, true, "codex");
    await tick();
  })();
  const t4 = zh ? "把周报的数据拉一遍" : "Pull the numbers for the weekly report";
  await open("t_lim4", t4, { kind: "none", device: "MacBook" }, zh ? "从 Grafana 拉这周的指标，做成表。" : "Pull this week's metrics from Grafana into a table.", "pi");
  hit("t_lim4", "pi");
  await tick();
  wait("t_lim4", "pi", Date.now() + 47 * 60_000, false);
  await tick();
}
