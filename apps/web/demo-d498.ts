// D498: the author's On hand of 2026-11-24 (Mac, 1400 wide), as a demo core both clients read: a
// review that runs in rounds since a week ago (its round now at work on Codex, its last command a
// python3 heredoc that failed and that it went past), a Claude Code task on mem#8826 resting on its
// PR (its words and its wait in English, the task's language, on a Chinese screen), the group
// 通用设置 with its first part at work and the second in line, a result this afternoon and one from
// yesterday, and GitHub with its open to-dos sorted and three PRs whose review is asked of the
// person. Never this machine's gh, oo or accounts.
//   DUCTER_PORT=7498 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d498.ts
// Then the Mac with DUCTER_SHELL_URL (d498_shots_test.go).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-d498-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const persona = { id: "default", name: "Ducter", identity: "" };
// 577 open: the pile's 557 and twenty more, and three PRs whose review is asked of the person.
const more: FakeIssue[] = Array.from({ length: 20 }, (_, k) => ({ repo: "nowledge-co/mem", number: 9100 + k, title: `Graph export drops edge labels past ${100 + k * 5} nodes`, labels: ["bug"] }));
const reviews: FakeIssue[] = [
  { repo: "nowledge-co/mem", number: 10852, title: "Thread search: keep the cursor when a filter changes", pr: true, review: true, assigned: false, author: "100gle" },
  { repo: "nowledge-co/mem", number: 10849, title: "Desktop: scope the tray menu to the open space", pr: true, review: true, assigned: false, author: "hawkingrei" },
  { repo: "nowledge-co/ducter-site", number: 212, title: "Docs: the install page says which Bun it needs", pr: true, review: true, assigned: false, author: "100gle" },
];
const gh = fakeGh([...pileIssues(), ...more, ...reviews], { login: "weyl" });
const taskSources = { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000, ask: demoAsk(zh, 5) };

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock, taskSources });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const tick = () => Bun.sleep(15);
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = async (ms: number) => {
  await Bun.sleep(60);
  shift = ms;
};
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) =>
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const repo = (name: string, branch: string, device = "local"): Place => ({ kind: "repo", device, repoPath: `/root/code/${name}`, branch: `ducter/${branch}`, baseBranch: "main" });
async function open(id: string, title: string, project: string, place: Place, harness: string, model: string, brief = title) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief } });
  seed.tasks.setState(id, "working", "hot");
  await tick();
}
const zsh = (c: string) => `/bin/zsh -lc '${c}'`;

// GitHub first: added, looked at and sorted.
const ts = seed.taskSources;
await ts.add("github");
await ts.look();
for (let i = 0; i < 300 && (!ts.view().pile?.sortedAt || ts.view().pile?.sorting); i++) await Bun.sleep(100);
const items = (await ts.items()).items;

// ---- yesterday: a result with its PR ----
await at(-(19 * HOUR));
await open("t_flaky", w("修 session 过期差一秒的偶发测试", "Fix the flaky session-expiry test"), "mem", repo("mem", "session-flaky"), "codex", "gpt-6-luna");
tool("t_flaky", "commandExecution", zsh("cargo test -p mem-session -- --test-threads 1"), "test result: ok. 214 passed");
report("t_flaky", { state: "done", summary: w("过期时间改成按服务器时钟比，跑 200 遍都过了；草稿 PR #10831。", "Expiry now compares on the server clock; 200 runs pass. Draft PR #10831."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10831" }] });
seed.tasks.setState("t_flaky", "done", "parked");

// ---- a week of review rounds: the loop, on Codex ----
const RV = "t_review";
await at(-(182 * HOUR));
await open(RV, w("持续评审 nowledge-co，并处理 100gle 分给你的待办", "Keep reviewing nowledge-co and work through the to-dos 100gle assigns you"), "nowledge-co", { kind: "none" }, "codex", "gpt-6-luna", w("每 45 分钟看一次 nowledge-co 里等我评审的 PR，写好评审；100gle 分给我的待办也一并处理。一直跑下去。", "Every 45 minutes, look at the nowledge-co PRs waiting for my review and write the reviews; handle the to-dos 100gle assigns me too. Keep going."));
log.append({ stream: `task:${RV}`, origin: "system", kind: "task_loop", body: { taskId: RV, state: "on", reason: w("下一轮评审", "The next review round"), everyMs: 45 * MIN, rhythmBy: "task", since: iso(-181 * HOUR), by: "brief" } });
// Its rounds so far: a few steps each, the earlier ones long done.
const roundSteps = (id: string) => {
  tool(id, "commandExecution", zsh("gh search prs --review-requested=@me --state open --owner nowledge-co --json number,title,headRefOid"), "[{\"number\":10847},{\"number\":10849},{\"number\":10852}]");
  tool(id, "commandExecution", zsh("gh pr diff 10849 --repo nowledge-co/mem"), "diff --git a/desktop/src/tray.rs b/desktop/src/tray.rs");
  tool(id, "commandExecution", zsh("rg -n \"scope.*desktop\" desktop"), "desktop/src/tray.rs:41");
  tool(id, "commandExecution", zsh("sed -n 1,120p desktop/src/tray.rs"), "");
};
for (let r = 0; r < 40; r++) {
  await at(-(181 * HOUR) + r * 4 * HOUR + 30 * MIN);
  seed.tasks.setState(RV, "working", "hot");
  roundSteps(RV);
  if (r % 9 === 4) report(RV, { state: "done", summary: w("复审了 #10831 和 #10836，2 份评审已发到 GitHub。", "Reviewed #10831 and #10836 again; 2 reviews posted to GitHub."), evidence: [] });
  seed.tasks.setState(RV, "blocked", "parked", w("下一轮评审", "The next review round"));
}
// The last round, 52 minutes ago, said what came of it.
await at(-(52 * MIN));
seed.tasks.setState(RV, "working", "hot");
roundSteps(RV);
report(RV, { state: "done", summary: w("8 个请求在等你：3 个有新提交已复审，5 个没变；评审都已发到 GitHub。", "8 requests wait on you: 3 had new commits and are reviewed again, 5 unchanged; the reviews are posted to GitHub."), evidence: [] });
seed.tasks.setState(RV, "blocked", "parked", w("下一轮评审", "The next review round"));
// This round, started 7 minutes ago: it reads, searches, runs a heredoc that fails, and goes on.
await at(-(7 * MIN));
seed.tasks.setState(RV, "working", "hot");
tool(RV, "commandExecution", zsh("gh search prs --review-requested=@me --state open --owner nowledge-co --json number,title,headRefOid"), "[{\"number\":10847},{\"number\":10849},{\"number\":10852}]");
await at(-(6 * MIN));
tool(RV, "commandExecution", zsh("sed -n 1,160p desktop/src/tray.rs"), "");
tool(RV, "commandExecution", zsh("sed -n 1,90p desktop/src/space.rs"), "");
tool(RV, "commandExecution", zsh("rg -n \"scope.*desktop\" ."), "desktop/src/tray.rs:41");
await at(-(4 * MIN));
tool(RV, "commandExecution", zsh("cargo check -p mem-desktop"), "Finished dev profile");
await at(-(2 * MIN));
tool(RV, "commandExecution", zsh("python3 - <<'EOF'\nimport json,sys\nprint(json.load(open('review-state.json'))['heads']['10849'])\nEOF"), "KeyError: '10849'", false);

// ---- mem#8826: a Claude Code task resting on its PR (its words in English) ----
await at(-(42 * HOUR));
await open("t_8826", "graph_error_response_tests intermittently #8826", "mem", repo("mem", "graph-error-response-tests"), "claude-code", "opus");
tool("t_8826", "Bash", { command: "cargo test -p mem-graph graph_error_response -- --test-threads 1", description: "Run the graph error response tests alone" }, "test result: ok. 12 passed");
await at(-(40 * HOUR));
report("t_8826", { state: "blocked", summary: "Opened PR #10847: the shared error response is initialised once per process. Waiting for the checks and a review.", evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10847" }] });
seed.work.waiters.arm({ reason: "PR #10847's checks pass and it is merged", taskId: "t_8826", check: { argv: ["date", "+%Y"], succeedWhen: { matches: "MERGED" } }, everyMs: 15 * MIN });
seed.tasks.setState("t_8826", "blocked", "parked");

// ---- this afternoon: a result ----
await at(-(2 * HOUR + 10 * MIN));
await open("t_notes", w("整理本周 mem 的发布说明", "Write this week's mem release notes"), "mem", repo("mem", "release-notes"), "claude-code", "sonnet");
tool("t_notes", "Bash", { command: "git log --oneline v0.10.121..HEAD", description: "List the commits since the last release" }, "");
await at(-(1 * HOUR + 40 * MIN));
report("t_notes", { state: "done", summary: w("发布说明写好了，按新功能、修复和文档分了三段；草稿 PR #10855。", "The release notes are written in three parts: features, fixes and docs. Draft PR #10855."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10855" }] });
seed.tasks.setState("t_notes", "done", "parked");

// ---- at work: 通用设置, a group of two, its first part on Codex ----
await at(-(23 * MIN));
await open("t_prefs", w("把 Macbook Pro M3 的通用设置导出来", "Export the general settings from the Macbook Pro M3"), "dotfiles", repo("dotfiles", "general-settings"), "codex", "gpt-6-luna");
for (const [m, cmd] of [[-20, "defaults read com.apple.finder"], [-14, "defaults read com.apple.screencapture"], [-8, "defaults read -g KeyRepeat"], [-4, "defaults read com.apple.AppleMultitouchTrackpad Clicking"]] as const) {
  await at(m * MIN);
  tool("t_prefs", "commandExecution", zsh(cmd), "");
}
await at(-(1 * MIN));
say("t_prefs", w("读完了 41 项全局设置，在挑出键盘和触控板的那几项写进 defaults.sh。", "Read 41 global settings; picking out the keyboard and trackpad ones for defaults.sh."));
await at(0);
seed.taskGroups.join("default", w("通用设置", "General settings"), ["t_prefs"], "partner");
await seed.taskGroups.open("default", w("通用设置", "General settings"), { persona: "default", title: w("在新 Mac 上照着设好", "Set the new Mac up the same way"), brief: w("在新 Mac 上照着设好", "Set the new Mac up the same way"), place: repo("dotfiles", "general-settings-apply") });
const pick = (re: RegExp) => items.find((i) => re.test(i.title));
const b = pick(/^Flaky test/);
if (b) ts.bind("t_prefs", b, "partner");

await Bun.sleep(300);
await seed.stop();

// Serve from a second core over the same Log, as after a restart.
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
// The parts at work keep working: a step every DEMO_TICK_MS (0: still, for shots).
const tickMs = Number(process.env.DEMO_TICK_MS ?? 0);
let k = 0;
if (tickMs > 0)
  setInterval(() => {
    if (k >= 60) return;
    core.log.append({ stream: "task:t_prefs", origin: "task", kind: "task_event", body: { taskId: "t_prefs", role: "tool", tool: { name: "commandExecution", input: zsh("defaults read com.apple.dock"), output: "", ok: true } } });
    if (k % 2) core.log.append({ stream: `task:${RV}`, origin: "task", kind: "task_event", body: { taskId: RV, role: "tool", tool: { name: "commandExecution", input: zsh("sed -n 1,80p desktop/src/menu.rs"), output: "", ok: true } } });
    k++;
  }, tickMs);
console.log(`[demo] D498 On hand (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
