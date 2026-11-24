// D525: the opened task's steps, redrawn, as a demo core: the author's Antigravity task walking Mem's
// screens, still running (agy's own tool names), and a finished Claude Code fix with a failed step,
// a subagent, three reads in a row and two edits. The same runs as the Mac's shots
// (apps/desktop/internal/views/transcriptv2_shots_test.go).
//   DUCTER_PORT=7524 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d525.ts
// then open http://127.0.0.1:7524/app#task=t_agy (t_cc for the finished one).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-d525-")), "data");
let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ dataDir, push: false, persona: { id: "default", name: "Ducter", identity: "" }, ooSource: noOo, clock });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const at = (sAgo: number) => (shift = -sAgo * 1000);
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } as never });
const tool = (id: string, sAgo: number, name: string, input: unknown, ok = true, output = "") => (at(sAgo), ev(id, { role: "tool", tool: { name, input, ok, output } } as never));
const say = (id: string, sAgo: number, text: string) => (at(sAgo), ev(id, { role: "assistant", text }));
const think = (id: string, sAgo: number, ...thinking: string[]) => (at(sAgo), ev(id, { role: "assistant", thinking } as never));

// ---- the agy run, under way ----
{
  const id = "t_agy";
  const wt = "/root/ducter/worktrees/mem/用-agy-走查-mem-的界面和交互-11105";
  const place: Place = { kind: "repo", device: "local", repoPath: "/root/ducter/repos/mem", worktree: wt, branch: "ducter/agy-mem-ui-walk", baseBranch: "main" };
  const title = w("用 agy 走查 Mem 的界面和交互", "Walk Mem's screens and interactions with agy");
  const brief = w("用 agy 把 Mem 桌面版的界面和交互走一遍：设置、搜索、记忆详情。看最近合进去的 PR 有没有把哪里弄坏，列出问题，先别改代码。", "Walk Mem's desktop screens and interactions with agy: Settings, Search, a memory's details. Check whether the recently merged PRs broke anything, list the problems, and don't change code yet.");
  const cmd = (s: number, line: string, summary: string, out: string, ok = true) => tool(id, s, "run_command", { CommandLine: line, Cwd: wt, toolSummary: summary }, ok, out);
  const read = (s: number, p: string) => tool(id, s, "read_file", { Path: `${wt}/${p}` });
  at(420);
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "Mem", place, harness: "antigravity", model: "gemini-3.8-pro", brief } as never });
  core.tasks.setState(id, "working", "hot");
  think(id, 410, w("先弄清最近合进去了什么", "Find out what was merged lately"));
  tool(id, 405, "mcp_ducter_log_read", { fromSeq: 0 }, true, "{}");
  read(400, "README.md");
  cmd(395, "gh auth status", "Check the GitHub CLI is signed in", "Logged in to github.com");
  read(385, "apps/desktop/src/settings/SettingsPage.tsx");
  read(383, "apps/desktop/src/search/SearchView.tsx");
  cmd(370, "git fetch origin", "", "");
  cmd(360, "gh pr list --state merged --limit 10", "List the last merged PRs", "#1412 Search: keep the query on back\n#1409 Settings: one switch per row");
  cmd(352, "git show --stat 4f2a9c1", "", "apps/desktop/src/search/SearchView.tsx | 48 ++--");
  say(id, 345, w("最近合进去 10 个 PR，跟界面有关的是 #1412（搜索返回时保留关键词）和 #1409（设置页每行一个开关）。我分三路去走：设置、搜索、记忆详情。", "Ten PRs went in lately; the two that touch the screens are #1412 (Search keeps the query on back) and #1409 (Settings: one switch per row). I'll walk three paths at once: Settings, Search and a memory's details."));
  tool(id, 340, "invoke_subagent", { Description: w("走查设置页：每个开关点一遍", "Walk Settings: try every switch"), Prompt: "..." }, true, "done");
  tool(id, 300, "invoke_subagent", { Description: w("走查搜索：输入、返回、再进", "Walk Search: type, go back, come in again"), Prompt: "..." }, true, "done");
  tool(id, 262, "invoke_subagent", { Description: w("走查记忆详情：打开、编辑、关掉", "Walk a memory's details: open, edit, close"), Prompt: "..." }, true, "done");
  say(id, 250, w("三路都走完了。设置页没问题；搜索返回后关键词在，但结果列表回到了顶上；记忆详情里编辑后按 Esc 会丢改动，没有提示。", "All three walked. Settings is fine; Search keeps the query on back but the results jump to the top; in a memory's details, Esc after an edit drops the change without asking."));
  at(249);
  ev(id, { role: "system", text: "turn completed", raw: { kind: "turn_ended", outcome: "completed" } } as never);
  at(200);
  ev(id, { role: "user", from: "user", text: w("Esc 丢改动那个，看看是哪个 PR 弄的", "The Esc one: find which PR did it") } as never);
  think(id, 195, w("找出 Esc 处理是谁改的", "Find who changed the Esc handling"));
  cmd(190, "git log --oneline -S onEscape -- apps/desktop/src/memory", "Find commits that touched onEscape", "9b1d2e0 Memory: close on Esc");
  read(184, "apps/desktop/src/memory/MemoryDetail.tsx");
  read(182, "apps/desktop/src/memory/useEditBuffer.ts");
  read(181, "apps/desktop/src/hooks/useKeys.ts");
  tool(id, 170, "grep_search", { Query: "onEscape", SearchPath: `${wt}/apps/desktop/src` }, true, "MemoryDetail.tsx:88");
  cmd(160, "gh pr view 1398 --json title,mergedAt", "", '{"title":"Memory: close on Esc"}');
  cmd(150, "bun test apps/desktop/src/memory", "Run the memory view's tests", "error: Cannot find module '@mem/ui-kit' from MemoryDetail.test.tsx", false);
  tool(id, 140, "invoke_subagent", { Description: w("在桌面版里重现 Esc 丢改动", "Reproduce the Esc data loss in the desktop app"), Prompt: "..." }, true, "");
}

// ---- the Claude Code fix, done ----
{
  const id = "t_cc";
  const root = "/Users/someone/dev/hawdb";
  const place: Place = { kind: "repo", device: "local", repoPath: root, branch: "ducter/compaction-fix", baseBranch: "main" };
  const bash = (s: number, c: string, d: string, out: string, ok = true) => tool(id, s, "Bash", { command: c, description: d }, ok, out);
  at(600);
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: w("修 compaction 偶发失败的测试", "Fix the flaky compaction test"), project: "HawDB", place, harness: "claude-code", model: "opus", brief: w("HawDB 里 compaction 那个偶发失败的测试，找到原因修好，跑 50 遍确认。", "Find why the compaction test in HawDB fails now and then, fix it, and run it 50 times to confirm.") } as never });
  core.tasks.setState(id, "working", "hot");
  say(id, 595, w("先跑 50 遍看失败率。", "Running it 50 times first to see how often it fails."));
  bash(590, "cd ~/dev/hawdb && for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done", "Run the compaction test 50 times", "test result: FAILED. 47 passed; 3 failed", false);
  tool(id, 560, "Read", { file_path: `${root}/crates/storage/tests/compaction.rs` });
  tool(id, 558, "Read", { file_path: `${root}/crates/storage/src/flush.rs` });
  tool(id, 556, "Read", { file_path: `${root}/crates/storage/src/memtable.rs` });
  tool(id, 550, "Grep", { pattern: "sleep\\(Duration::from_millis", path: "crates" }, true, "crates/storage/tests/compaction.rs:88");
  think(id, 540, w("测试写死了等 200ms，flush 慢的时候就读早了", "The test sleeps a fixed 200 ms and reads too early when a flush is slow"), w("改成等 flush 的完成信号", "Wait on the flush's done signal instead"));
  tool(id, 470, "Agent", { description: w("查别的测试里有没有同样写死的等待", "Look for the same fixed sleep in other tests"), prompt: "..." }, true, "2 more found");
  tool(id, 465, "mcp__github__get_pull_request", { owner: "nowledge-co", repo: "hawdb", pull_number: 612 }, true, "{}");
  say(id, 460, w("失败的 3 次都是 flush 还没写完测试就去读了。改成等 flush 完成的信号，另外两个测试也有同样的写法，一起改。", "All 3 failures read before the flush finished. Switching to wait for the flush signal; two other tests do the same, so those too."));
  tool(id, 450, "Edit", { file_path: `${root}/crates/storage/tests/compaction.rs`, old_string: "thread::sleep(Duration::from_millis(200));", new_string: "flush.wait_done();" });
  tool(id, 445, "Edit", { file_path: `${root}/crates/storage/src/flush.rs`, old_string: "pub fn start(&self) {", new_string: "pub fn start(&self) {\n        self.done.reset();" });
  tool(id, 430, "WebSearch", { query: "rust condvar wait_timeout spurious wakeup" });
  bash(380, "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done", "Run it 50 times again", "50/50 ok");
  bash(340, "cargo clippy -p hawdb-storage -- -D warnings", "", "ok");
  bash(330, "git commit -am 'compaction test: wait for the flush signal'", "", "[ducter/compaction-fix a1c9e07]");
  say(id, 325, w("修好了：改成等 flush 完成的信号，连跑 50 遍全过，clippy 干净，提交在 ducter/compaction-fix。", "Fixed: it now waits for the flush signal; 50 runs in a row pass, clippy is clean, and it's committed on ducter/compaction-fix."));
  at(324);
  ev(id, { role: "system", text: "turn completed", raw: { kind: "turn_ended", outcome: "completed" } } as never);
  at(320);
  core.tasks.setState(id, "done", "warm");
}
shift = 0;
console.log(`[demo] http://127.0.0.1:${core.port}/app#task=t_agy`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
