// D467: the author's On hand of 2026-11-22 (Mac, about 1400 wide), as a demo core both clients
// read: a Codex task at work inside a group of two (通用设置, the second part in line), a Codex
// wait that comes back in 37 minutes, a phone task on DeepSeek Harness stopped 8 days ago with
// nothing to bring it back, a Codex task done this afternoon, one on DeepSeek Harness done
// yesterday morning, and GitHub with 555 open issues sorted by the demo's fake cheapest model,
// two of them already bound to tasks. Never this machine's gh, oo or accounts.
//   DUCTER_PORT=7467 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d467.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-d467-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const persona = { id: "default", name: "Ducter", identity: "" };
const gh = fakeGh(pileIssues().slice(0, 555), { login: "weyl" });
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
const DAY = 24 * HOUR;
// Each moment settles (the task's own follow-up states) before the clock moves on.
const at = async (ms: number) => {
  await Bun.sleep(150);
  shift = ms;
};
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "ok", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) =>
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: `/Users/weyl/dev/${name}`, branch: `ducter/${branch}`, baseBranch: "main" });
async function open(id: string, title: string, project: string, place: Place, harness: string, model: string) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief: title } });
  seed.tasks.setState(id, "working", "hot");
  await tick();
}

// D467 round 3: DEMO_STATE=quiet (today's results, yesterday's one and GitHub; nothing working,
// waiting or stopped) and DEMO_STATE=empty (nothing at all); else the author's screen.
const mode = process.env.DEMO_STATE ?? "";
const empty = mode === "empty";
const busy = mode !== "quiet" && !empty;

// GitHub first: added, looked at and sorted (the sort reads the 555 by their words).
const ts = seed.taskSources;
let items: Awaited<ReturnType<typeof ts.items>>["items"] = [];
if (!empty) {
  await ts.add("github");
  await ts.look();
  for (let i = 0; i < 300 && (!ts.view().pile?.sortedAt || ts.view().pile?.sorting); i++) await Bun.sleep(100);
  items = (await ts.items()).items;
}

if (!empty) {
// ---- done yesterday morning, on DeepSeek Harness ----
await at(-(18 * HOUR + 7 * MIN));
await open("t_flaky", w("修 session 过期差一秒的偶发测试", "Fix the flaky session-expiry test"), "acme-api", repo("acme-api", "session-flaky"), "deepseek-harness", "deepseek-v4");
tool("t_flaky", "Bash", { command: "bun test test/session.test.ts --rerun-each 200" }, "200 pass\n0 fail");
report("t_flaky", { state: "done", summary: w("过期时间改成按服务器时钟比，跑 200 遍都过了；草稿 PR #1184。", "Expiry now compares on the server clock; 200 runs pass. Draft PR #1184."), evidence: [{ kind: "url", ref: "https://github.com/acme/api/pull/1184" }] });
seed.tasks.setState("t_flaky", "done", "parked");

}
if (busy) {
// ---- the phone task, stopped 8 days ago with nothing to bring it back ----
await at(-8 * DAY - 3 * HOUR);
await open("t_phone", w("用手机把 Ducter 官网录一段屏发到 X", "Record the Ducter site on the phone and post it to X"), "", { kind: "none" }, "deepseek-harness", "deepseek-v4");
say("t_phone", w("手机已经借到了，开始录屏。", "Got the phone; starting the recording."));
tool("t_phone", "phone_record_start", { app: "Chrome", url: "https://ducter.ai" }, "phone access for this task was stopped", false);
await at(-8 * DAY - 2 * HOUR);
report("t_phone", { state: "blocked", summary: w("手机工具仍提示本任务的手机访问已被停止，无法恢复操作。", "The phone tool still says this task's access to the phone was stopped, so it can't carry on."), evidence: [] });
seed.tasks.setState("t_phone", "blocked", "parked");

}
if (!empty) {
// ---- done this afternoon, on Codex ----
await at(-(1 * HOUR + 52 * MIN));
await open("t_typo", w("改掉定价页上的拼写错误", "Fix the typo on the pricing page"), "acme-web", repo("acme-web", "pricing-typo"), "codex", "gpt-6-luna");
tool("t_typo", "commandExecution", "/bin/zsh -lc 'rg -n recieve src'", "src/pricing.tsx:88");
await at(-(1 * HOUR + 31 * MIN));
report("t_typo", { state: "done", summary: w("「recieve」改成了「receive」，顺手查了全站没有别处；草稿 PR #1190。", "\"recieve\" is now \"receive\"; nowhere else on the site. Draft PR #1190."), evidence: [{ kind: "url", ref: "https://github.com/acme/web/pull/1190" }] });
seed.tasks.setState("t_typo", "done", "parked");

}
if (mode === "quiet") {
  await at(-(55 * MIN));
  await open("t_receipts", w("把 11 月的报销单整理成表", "Put November's receipts in a spreadsheet"), w("报销", "Receipts"), { kind: "folder", device: "local", path: "/Users/weyl/Documents/Receipts" } as Place, "claude-code", "sonnet");
  await at(-(40 * MIN));
  report("t_receipts", { state: "done", summary: w("19 张发票整理进了 2026-11.xlsx，合计 ¥31,860。", "19 receipts are in 2026-11.xlsx, ¥31,860 in all."), evidence: [] });
  seed.tasks.setState("t_receipts", "done", "parked");
}
if (busy) {
// ---- a wait on Codex that comes back in 37 minutes ----
await at(-(48 * MIN));
await open("t_ci", w("等 acme-web 的发布流水线跑完再合并", "Merge acme-web once its release pipeline is through"), "acme-web", repo("acme-web", "release-1-14"), "codex", "gpt-6-luna");
tool("t_ci", "commandExecution", "/bin/zsh -lc 'gh run list --limit 1'", "in_progress  release  #4471");
report("t_ci", { state: "blocked", summary: w("流水线跑到第 3 步，大约半小时，到点我再看。", "The pipeline is on step 3, about half an hour; I'll look again then."), evidence: [] });
seed.work.waiters.arm({ reason: w("acme-web 的发布流水线跑完", "acme-web's release pipeline finishes"), taskId: "t_ci", at: iso(37 * MIN) });
seed.tasks.setState("t_ci", "blocked", "parked");

// ---- at work: a group of two, its first part on Codex ----
await at(-(23 * MIN));
await open("t_prefs", w("把 Macbook Pro M3 的通用设置导出来", "Export the general settings from the Macbook Pro M3"), "dotfiles", repo("dotfiles", "general-settings"), "codex", "gpt-6-luna");
tool("t_prefs", "commandExecution", "/bin/zsh -lc 'defaults read -g > general.plist'", "");
// Its steps so far, spread over its 23 minutes (the trail on its card).
for (const [m, cmd] of [[-20, "defaults read com.apple.finder"], [-17, "defaults read com.apple.menuextra.clock"], [-14, "defaults read com.apple.screencapture"], [-11, "defaults read -g AppleKeyboardUIMode"], [-8, "defaults read -g KeyRepeat"], [-6, "defaults read -g InitialKeyRepeat"], [-4, "defaults read com.apple.AppleMultitouchTrackpad Clicking"]] as const) {
  await at(m * MIN);
  tool("t_prefs", "commandExecution", `/bin/zsh -lc '${cmd}'`, "");
}
await at(-(2 * MIN));
say("t_prefs", w("读完了 41 项全局设置，在挑出键盘和触控板的那几项写进 defaults.sh。", "Read 41 global settings; picking out the keyboard and trackpad ones for defaults.sh."));
await at(0);
seed.taskGroups.join("default", w("通用设置", "General settings"), ["t_prefs"], "partner");
await seed.taskGroups.open("default", w("通用设置", "General settings"), { persona: "default", title: w("在新 Mac 上照着设好", "Set the new Mac up the same way"), brief: w("在新 Mac 上照着设好", "Set the new Mac up the same way"), place: repo("dotfiles", "general-settings-apply") });

// Two of the 555 are already in tasks: the wait and the work.
const pick = (re: RegExp) => items.find((i) => re.test(i.title));
const a = pick(/^Typo on the pricing page/);
const b = pick(/^Flaky test/);
if (a) ts.bind("t_ci", a, "partner");
if (b) ts.bind("t_prefs", b, "partner");
}

await Bun.sleep(300);
await seed.stop();

// Serve from a second core over the same Log, as after a restart.
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
// D467 round 2: the part at work keeps working: a step every 4 s (DEMO_TICK_MS), so the trail and the peek move.
const script: [string, unknown, string][] = [
  ["commandExecution", "/bin/zsh -lc 'defaults read com.apple.AppleMultitouchTrackpad'", ""],
  ["fileChange", { changes: [{ path: "/Users/weyl/dev/dotfiles/defaults.sh", kind: "update", diff: "+defaults write -g KeyRepeat -int 2" }] }, ""],
  ["commandExecution", "/bin/zsh -lc 'defaults read com.apple.dock'", ""],
  ["fileChange", { changes: [{ path: "/Users/weyl/dev/dotfiles/defaults.sh", kind: "update", diff: "+defaults write com.apple.dock autohide -bool true" }] }, ""],
];
const sayings = [
  w("触控板的轻点和三指拖移读出来了，写进 defaults.sh。", "Read tap-to-click and three-finger drag; writing them into defaults.sh."),
  w("在挑程序坞的设置：自动隐藏、大小、放大。", "Picking the Dock settings: autohide, size, magnification."),
];
let k = 0;
const tickMs = Number(process.env.DEMO_TICK_MS ?? 4000);
if (tickMs > 0 && busy)
  setInterval(() => {
    if (k >= 60) return; // about four minutes of work after it starts serving
    const [name, input, output] = script[k % script.length]!;
    core.log.append({ stream: "task:t_prefs", origin: "task", kind: "task_event", body: { taskId: "t_prefs", role: "tool", tool: { name, input, output, ok: true } } });
    if (k % 2 === 1) core.log.append({ stream: "task:t_prefs", origin: "task", kind: "task_event", body: { taskId: "t_prefs", role: "assistant", text: sayings[(k >> 1) % sayings.length]! } });
    k++;
  }, tickMs);
console.log(`[demo] D467 On hand (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
