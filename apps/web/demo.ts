// A demo core for the phone client's screenshots and manual checks: real core (Log, decisions,
// living message, auth, web), stub partner and runner, seeded with work like the author's.
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo.ts
import { startCore, stubRunner } from "@ducter/core";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
// A quiet partner: the seed below writes its words, so a live reply would only be noise.
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);

const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "MacBook", repoPath, branch, baseBranch: "main" });

async function task(id: string, title: string, place: Place, brief: string, model = "opus") {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: zh ? "HawDB" : "HawDB", place, harness: "claude-code", model, brief } });
  core.tasks.setState(id, "working", "hot");
  await tick();
}
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const report = (id: string, r: Omit<Bodies["report"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, ...r } });

// 1. A result that came back: the flaky compaction test.
const ask = zh ? "HawDB compaction 那个偶发失败的测试，帮我修一下，修好告诉我" : "Fix the flaky compaction test in HawDB and tell me when it's done";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: zh ? "好，我开一件事去修，在 MacBook 上的 hawdb 里。" : "On it. I'm opening a task in hawdb on the MacBook.", replyTo: u.seq } });
const flakyTitle = zh ? "修 compaction 偶发失败的测试" : "Fix the flaky compaction test";
// DEMO_WORKTREE: a real checkout of the fix, so the clients can show its changes.
await task("t_flaky", flakyTitle, { ...repo("~/dev/hawdb", "ducter/compaction-fix"), ...(process.env.DEMO_WORKTREE ? { worktree: process.env.DEMO_WORKTREE } : {}) }, ask);
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "在做" : "Working", state: "running", taskId: "t_flaky" } });
ev("t_flaky", { role: "assistant", text: zh ? "先跑 50 遍看失败率。" : "Running it 50 times first to see how often it fails." });
ev("t_flaky", { role: "tool", tool: { name: "Bash", input: { command: "cargo test -p hawdb-storage compaction -- --test-threads=1" }, ok: true, output: "test result: FAILED. 47 passed; 3 failed" } });
ev("t_flaky", { role: "assistant", text: zh ? "失败的 3 次都是 flush 还没写完，测试就去读了。测试里写死了等 200ms。" : "All 3 failures read before the flush finished; the test sleeps a fixed 200 ms." });
ev("t_flaky", { role: "tool", tool: { name: "Edit", input: { file_path: "crates/storage/tests/compaction.rs" }, ok: true } });
ev("t_flaky", { role: "tool", tool: { name: "Bash", input: { command: "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done" }, ok: true, output: "50/50 ok" } });
log.append({ stream: `task:t_flaky`, origin: "task", kind: "checkpoint", body: { taskId: "t_flaky", text: zh ? "测试改成等 flush 完成" : "Test waits for the flush signal", gitRef: "a1c9e07" } });
report("t_flaky", {
  state: "done",
  summary: zh ? "改成等 flush 完成的信号，不再写死 200ms。连跑 50 遍全过。" : "The test now waits for the flush signal instead of a fixed 200 ms. 50 runs in a row pass.",
  questions: [],
  evidence: [
    { kind: "test", label: zh ? "cargo test · 连跑 50 遍全过" : "cargo test · 50/50 pass", ref: "cargo test -p hawdb-storage compaction" },
    { kind: "diff", label: zh ? "改了 2 个文件" : "2 files changed", ref: "ducter/compaction-fix" },
  ],
});
await tick();
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "做完了" : "Done", state: "done", taskId: "t_flaky" } });
log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: {
    replyTo: u.seq,
    text: zh
      ? "修好了。原因是 **flush 和 compaction 抢同一把锁**，测试里写死等 200ms，机器一忙就不够。\n\n- 测试改成等 flush 完成的信号\n- 连跑 50 遍全过，之前是 3 次失败\n\n改动只在 `ducter/compaction-fix` 分支上，没推送。"
      : "Fixed. **Flush and compaction contend for the same lock**, and the test slept a fixed 200 ms, which isn't enough on a busy machine.\n\n- The test now waits for the flush signal\n- 50 runs in a row pass (3 failures before)\n\nThe change stays on `ducter/compaction-fix`; nothing pushed.",
  },
});
await tick();
// Two things it noted along the way (记下了), for the Settings sheet.
log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: zh ? "测试统一用假时钟，不写死等待" : "Tests use a fake clock, never fixed sleeps", replyTo: u.seq } });
log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: zh ? "HawDB 的改动先留在分支上，不推送" : "HawDB changes stay on a branch, unpushed", replyTo: u.seq } });
// The user saw that result (so what follows is "while you were away").
log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: log.head() } });
await tick();

// 2. Two decisions with reversible defaults, one working task, one waiting.
await task("t_rebase", zh ? "把 fix-ci 分支跟上 main" : "Bring fix-ci up to date with main", repo("~/dev/ducter", "ducter/fix-ci"), zh ? "fix-ci 落后 main 了，跟上 main，冲突能解就解" : "fix-ci has fallen behind main; bring it up to date and resolve what you can");
report("t_rebase", {
  state: "needs_input",
  summary: zh ? "落后 main 12 个提交" : "12 commits behind main",
  questions: [
    {
      id: "q1",
      text: zh ? "fix-ci 落后 main 12 个提交，有 2 处冲突，都在 CI 配置里，我能自己解。要 rebase 吗？" : "fix-ci is 12 commits behind main with 2 conflicts, both in the CI config, which I can resolve. Rebase it?",
      blocking: true,
      default: "rebase",
      reversible: true,
    },
  ],
  evidence: [],
});
await tick();
await task("t_oar", zh ? "升级 OAR 到 0.96" : "Upgrade OAR to 0.96", repo("~/dev/ducter", "ducter/oar-096"), zh ? "把 OAR 升到 0.96，跟着改 runner 里的调用" : "Upgrade OAR to 0.96 and follow its API changes in the runner", "sonnet");
report("t_oar", {
  state: "needs_input",
  summary: zh ? "0.96 改了 steer 接口" : "0.96 changed the steer API",
  questions: [
    {
      id: "q1",
      text: zh ? "OAR 0.96 改了 steer 的接口，runner 里有 3 处调用要跟着改。现在就改吗？" : "OAR 0.96 changed the steer API; 3 calls in the runner need to follow. Change them now?",
      blocking: true,
      default: zh ? "改" : "change them",
      reversible: true,
    },
  ],
  evidence: [],
});
await tick();
await task("t_review", zh ? "看这周 3 个待合的 PR" : "Review this week's 3 open PRs", { kind: "folder", device: "MacBook", path: "~/dev/ducter" }, zh ? "看一下这周 3 个待合的 PR，说说能不能合" : "Read this week's 3 open PRs and say which can merge", "sonnet");
ev("t_review", { role: "tool", tool: { name: "Bash", input: { command: "gh pr list --state open --limit 3" }, ok: true, output: "#212 runner: retry on 529\n#214 web: decision sheet\n#215 core: digest window" } });
ev("t_review", { role: "tool", tool: { name: "Bash", input: { command: "gh pr diff 212" }, ok: true } });
ev("t_review", { role: "assistant", text: zh ? "#212 可以合：重试只包了 529，测试覆盖到了。" : "#212 can merge: the retry only wraps 529s, and the tests cover it." });
ev("t_review", { role: "tool", tool: { name: "Bash", input: { command: "gh pr diff 214" }, ok: true } });
ev("t_review", { role: "assistant", text: zh ? "#214 也可以合。#215 的 CI 还在跑，等它。" : "#214 can merge too. #215's CI is still running; waiting for it." });
report("t_review", { state: "progress", summary: zh ? "看完 2 个，第 3 个还在等 CI" : "Read 2; the third is waiting on CI", questions: [], evidence: [] });
await tick();
await task("t_notes", zh ? "写 v0.4 的发版说明" : "Write the v0.4 release notes", repo("~/dev/ducter", "ducter/notes-04"), zh ? "v0.4 的 CI 跑完后写发版说明" : "Write the v0.4 release notes once its CI run is green", "sonnet");
log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: "w1", taskId: "t_notes", at: new Date(Date.now() + 40 * 60_000).toISOString(), reason: zh ? "CI 跑完" : "CI to finish", state: "armed" } });
report("t_notes", { state: "blocked", summary: zh ? "等 v0.4 的 CI 跑完再写" : "Waiting for the v0.4 CI run", questions: [], evidence: [] });
await tick();

// 3. One that didn't work: the dependency bump hit a breaking change it could not fix alone.
await task("t_tokio", zh ? "把 tokio 升到 1.41" : "Bump tokio to 1.41", repo("~/dev/hawdb", "ducter/tokio-141"), zh ? "把 hawdb 的 tokio 升到 1.41" : "Bump tokio to 1.41 in hawdb", "sonnet");
ev("t_tokio", { role: "tool", tool: { name: "Edit", input: { file_path: "Cargo.toml" }, ok: true } });
ev("t_tokio", { role: "tool", tool: { name: "Bash", input: { command: "cargo build --workspace" }, ok: false, output: "error[E0599]: no method named `into_std` found for struct `TcpStream`" } });
ev("t_tokio", { role: "assistant", text: zh ? "1.41 去掉了 into_std，net 模块里 4 处要改写，超出了这次的范围。" : "1.41 removed into_std; 4 places in the net module need rewriting, which is more than this bump." });
report("t_tokio", {
  state: "failed",
  summary: zh ? "1.41 去掉了 TcpStream::into_std，net 模块 4 处编译不过。没改动 main。" : "1.41 removed TcpStream::into_std; 4 places in the net module don't build. main is untouched.",
  questions: [],
  evidence: [{ kind: "test", label: zh ? "cargo build · 4 处报错" : "cargo build · 4 errors", ref: "cargo build --workspace" }],
});
await tick();

// After the seed, a scripted partner answers new messages the way a real one paces itself, so
// the waiting moments can be seen and timed (D104): thinking at once, a look back at the Log at
// 0.4 s, a task being set up at 1.5 s, the ack at 2.3 s, then the turn ends.
core.setPartner({
  onTrigger(e) {
    if (e.kind !== "user_msg") return;
    const at = () => new Date().toISOString();
    const since = at();
    core.activity?.set({ step: "thinking", since, stepSince: since });
    setTimeout(() => core.activity?.set({ step: "recalling", since, stepSince: at() }), 400);
    setTimeout(() => core.activity?.set({ step: "opening_task", since, stepSince: at() }), 1500);
    setTimeout(() => {
      const text = zh ? "好，我开一件事去查，在 MacBook 上。一般十来分钟，查清楚了告诉你。" : "On it. I'm opening a task to look into it on the MacBook. That usually takes about ten minutes; I'll tell you what I find.";
      log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: `j${e.seq}`, text, replyTo: e.seq } });
      core.activity?.set(null);
    }, Number(process.env.DEMO_REPLY_MS ?? 2300));
  },
});

console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
