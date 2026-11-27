// D391: a heavy developer's earlier tasks for the task_find and task_fork scenarios: a HawDB
// compaction PR from last week, a Rust build sped up on haswell last month, a WAL group commit
// with four steps that failed on CI three days ago, two bloom-filter tasks from last week in two
// repos (the vague one), and distractors (a mem digest compaction, a clippy pass, an errand).
// Logged at their own times through the eval core's clock (`back`), as seed-made.ts does, so time
// words mean what they say. Fake repos and fake PR numbers only.
import type { Bodies, Place } from "../../protocol/src/index.ts";

type EvalCore = { log: { append(e: { stream: string; origin: string; kind: string; body: unknown }): { seq: number } }; tasks: { setState(taskId: string, a: string, r: string): unknown } };

const DAY = 86_400_000;

interface H {
  key: string;
  days: number;
  title: [string, string];
  repo?: string;
  device?: string;
  branch?: string;
  harness?: string;
  steps?: [string, string][];
  came?: [string, string][];
  report: [string, string];
  state?: "done" | "failed";
  pr?: string;
  /** D651 (research/246): read from another app, read only (no report). */
  imported?: { app: string; threadId: string };
}

const HISTORY: H[] = [
  { key: "compaction_pr", days: 7, title: ["HawDB compaction 调度器拆分", "Split HawDB's compaction scheduler"], repo: "/home/fake/dev/hawdb", branch: "ducter/compaction-scheduler", harness: "claude-code", steps: [["把 level picker 从调度器里拆出来，别动公开 API", "Split the level picker out of the scheduler; keep the public API"], ["开个草稿 PR", "Open a draft PR"]], came: [["拆好了，测试全过。", "Split; tests pass."], ["草稿 PR #4127 开好了。", "Draft PR #4127 is open."]], report: ["拆好了，草稿 PR #4127 已开，等 review。", "Split done; draft PR #4127 is open for review."], pr: "https://github.com/fake-org/hawdb/pull/4127" },
  { key: "mem_digest", days: 20, title: ["mem 摘要的 compaction 规则", "Compaction rules for mem's digests"], repo: "/home/fake/dev/nowledge-mem", branch: "ducter/digest-compaction", harness: "codex", report: ["摘要按周合并，超过 30 条才压缩。", "Digests merge weekly and compact past 30 items."] },
  { key: "rust_haswell", days: 31, title: ["haswell 上 Rust 构建太慢", "Rust builds are slow on haswell"], repo: "/home/fake/dev/hawdb-rs", device: "haswell", branch: "ducter/sccache", harness: "codex", steps: [["haswell 上 cargo build 冷构建要 14 分钟，弄快点", "A cold cargo build takes 14 minutes on haswell; make it faster"]], came: [["加了 sccache 和 mold，冷构建 6 分钟。", "sccache and mold: 6 minutes cold."]], report: ["冷构建从 14 分钟到 6 分钟：sccache 加 mold 链接。增量构建还没动。", "Cold builds from 14 to 6 minutes with sccache and mold. Incremental builds not touched yet."] },
  { key: "clippy", days: 4, title: ["清一遍 Rust 的 clippy 警告", "Clear Rust clippy warnings"], repo: "/home/fake/dev/hawdb-rs", branch: "ducter/clippy", harness: "claude-code", report: ["清掉了 212 条 clippy 警告。", "Cleared 212 clippy warnings."] },
  { key: "wal", days: 3, title: ["WAL 的 group commit", "Group commit for the WAL"], repo: "/home/fake/dev/hawdb", branch: "ducter/wal-group-commit", harness: "claude-code", steps: [["给 hawdb 的 WAL 加 group commit", "Add group commit to hawdb's WAL"], ["批大小做成可配置的", "Make the batch size configurable"], ["改用 io_uring 写盘", "Write to disk with io_uring"], ["CI 上 Linux 5.4 挂了，修一下", "CI fails on Linux 5.4; fix it"]], came: [["group commit 做完了，p99 降到 1.1ms。", "Group commit is in; p99 down to 1.1 ms."], ["批大小现在读配置，默认 64。", "Batch size is configurable, 64 by default."], ["io_uring 写盘做完了，本机测试过。", "io_uring writes are in; local tests pass."], ["5.4 内核没有这个 io_uring 操作，修不了，只能退回。", "Kernel 5.4 lacks that io_uring op; can't fix it without going back."]], report: ["没做成：Linux 5.4 上没有需要的 io_uring 操作，CI 还是红的。", "Didn't work: Linux 5.4 lacks the io_uring op it needs; CI is still red."], state: "failed" },
  { key: "bloom_hawdb", days: 6, title: ["hawdb 的 bloom filter 误判率太高", "hawdb's bloom filter has too many false positives"], repo: "/home/fake/dev/hawdb", branch: "ducter/bloom-bits", harness: "pi", report: ["每键 10 位，误判率从 2.1% 到 0.8%；还想试分块 bloom。", "10 bits per key: false positives from 2.1% to 0.8%; blocked bloom still to try."] },
  { key: "bloom_mem", days: 5, title: ["mem 搜索的 bloom filter 太占内存", "mem search's bloom filter uses too much memory"], repo: "/home/fake/dev/nowledge-mem", branch: "ducter/bloom-memory", harness: "claude-code", report: ["内存从 1.2GB 到 380MB，查询慢了 4%。", "Memory from 1.2 GB to 380 MB; queries 4% slower."] },
  // The last two days' small things: the targets above fall out of the partner's recent list, as on a real home.
  ...[
    ["改 README 里的安装命令", "Fix the install command in the README"],
    ["查 bun 1.4.4 的发布说明", "Read the Bun 1.4.4 release notes"],
    ["给 test-infra 的 flaky 列表去重", "Dedupe test-infra's flaky list"],
    ["整理本周的 PR review", "Sort this week's PR reviews"],
    ["把站会纪要发到群里", "Post the standup notes"],
    ["看一下 nightly 为什么慢了", "See why the nightly got slower"],
    ["更新 hawdb 的 CHANGELOG", "Update hawdb's CHANGELOG"],
    ["约周六的保养", "Book Saturday's car service"],
    ["换掉过期的 TLS 证书", "Replace the expired TLS certificate"],
    ["跑一遍伙伴的评测", "Run the partner eval"],
  ].map(([zh, en], i): H => ({ key: `recent${i}`, days: 0.3 + i * 0.15, title: [zh!, en!], report: ["做完了。", "Done."] })),
  { key: "hotel", days: 9, title: ["订 12 月 6 号京都的酒店", "Book a Kyoto hotel for Dec 6"], report: ["订好了京都站旁的酒店，两晚。", "Booked a hotel by Kyoto Station, two nights."] },
  { key: "lody_kyoto", days: 34, title: ["京都酒店和机票一起看", "Kyoto hotel and flights together"], report: ["", ""], imported: { app: "Lody", threadId: "S-8f2a" } },
];

/** Seeds the history; the scenario's keys map to their task ids (as seeded tasks do). */
export function seedHistory(core: EvalCore, back: { ms: number }, zh: boolean): Map<string, string> {
  const ids = new Map<string, string>();
  const L = (p: [string, string]) => (zh ? p[0] : p[1]);
  const at = (days: number, min = 0) => (back.ms = days * DAY - min * 60_000);
  for (const h of [...HISTORY].sort((a, b) => b.days - a.days)) {
    const taskId = `h_${h.key}`;
    ids.set(h.key, taskId);
    const stream = `task:${taskId}`;
    at(h.days, 0);
    const place: Place = h.repo ? { kind: "repo", device: h.device ?? "local", repoPath: h.repo, worktree: `/home/fake/.ducter/worktrees/${h.key}`, branch: h.branch, baseBranch: "main" } : { kind: "browser", device: "local", profile: "default" };
    const steps = h.steps ?? [[h.title[0], h.title[1]]];
    if (h.imported) {
      // D651 (research/246): a thread brought in from another app, read only: no report, its
      // own day, one task per thread, and a closing state at done.
      const at = new Date(Date.now() - back.ms).toISOString();
      core.log.append({ stream, origin: "import", kind: "task_open", body: { taskId, title: L(h.title), project: "", place: { kind: "none" }, harness: "codex", brief: "", imported: { app: h.imported.app, threadId: h.imported.threadId, runId: "run_eval", createdAt: at, at, agent: "codex" } } satisfies Bodies["task_open"] });
      core.log.append({ stream, origin: "import", kind: "task_event", body: { taskId, role: "user", from: "user", text: L(steps[0]!), at, importedId: "m1" } satisfies Bodies["task_event"] });
      core.log.append({ stream, origin: "import", kind: "task_state", body: { taskId, attention: "done", residency: "archived" } satisfies Bodies["task_state"] });
      continue;
    }
    core.log.append({ stream, origin: "partner", kind: "task_open", body: { taskId, title: L(h.title), project: h.repo ? h.repo.split("/").pop()! : "", place, harness: h.harness ?? "claude-code", brief: L(steps[0]!) } satisfies Bodies["task_open"] });
    for (const [i, s] of steps.entries()) {
      at(h.days, i * 40 + 5);
      if (i > 0) core.log.append({ stream, origin: "user", kind: "task_event", body: { taskId, role: "user", from: "user", text: L(s) } satisfies Bodies["task_event"] });
      at(h.days, i * 40 + 30);
      const came = h.came?.[i];
      if (came) core.log.append({ stream, origin: "task", kind: "task_event", body: { taskId, role: "assistant", text: L(came) } satisfies Bodies["task_event"] });
    }
    at(h.days, steps.length * 40);
    core.log.append({ stream, origin: "task", kind: "report", body: { taskId, state: h.state ?? "done", summary: L(h.report), questions: [], evidence: h.state === "failed" ? [] : [{ kind: "test", label: "tests", ref: "passed", check: "verified" }] } as Bodies["report"] });
    if (h.pr) core.log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${taskId}_pr`, taskId, state: "done", text: "opened a draft PR", act: "open_pr", ref: h.pr } as Bodies["job_status"] });
    core.tasks.setState(taskId, h.state ?? "done", "archived");
  }
  back.ms = 0;
  return ids;
}
