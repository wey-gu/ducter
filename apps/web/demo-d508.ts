// D508: the author's 今天做完 of 2026-11-24 (Mac, 1400 wide), as a demo core both clients read:
// GitHub-issue tasks that each opened a PR (a draft PR #11070 with CI still running, one waiting
// for hawkingrei's review with only the merge bot left, one a reviewer asked changes on, one
// signed off and green), one whose PR merged this morning, a result with a branch and no PR, and
// one at work. Titles at their real lengths, Chinese and English mixed. Where each PR stands is
// what Ducter's own looks log (owned_news, D483, D496); never this machine's gh.
//   DUCTER_PORT=7508 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d508.ts
// Then the Mac with DUCTER_SHELL_URL (d508_shots_test.go). On main (before D508) the same Log
// shows every one of them as done, with 合进 main and 开草稿 PR on hover.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-d508-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const persona = { id: "default", name: "Ducter", identity: "" };
const HOUR_MS = 3_600_000;

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
// No gh here: Ducter's looks at the PRs answer nothing (where each stands is seeded below).
const work = { exec: async () => ({ exitCode: 1, stdout: "not in the demo" }), ownedEveryMs: 24 * HOUR_MS };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock, work });
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
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: `/root/code/${name}`, branch: `ducter/${branch}`, baseBranch: "main" });
async function open(id: string, title: string, project: string, place: Place, harness: string, model: string) {
  log.append({ stream: `task:${id}`, origin: "you", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief: title, origin: "you" } });
  seed.tasks.setState(id, "working", "hot");
  await tick();
}
const issue = (id: string, repoName: string, n: number, title: string) =>
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_bound", body: { taskId: id, by: "you", item: { source: "src_github", kind: "github", ref: `${repoName}#${n}`, label: `#${n}`, where: repoName, title, url: `https://github.com/${repoName}/issues/${n}` } } });
const done = (id: string, summary: string, pr: string | undefined, adds: number, dels: number, files: number) => {
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary, questions: [], evidence: pr ? [{ kind: "url", label: `PR #${pr.split("#")[1]}`, ref: `https://github.com/${pr.split("#")[0]}/pull/${pr.split("#")[1]}` }] : [], branch: { commits: 3, uncommitted: false, files, adds, dels } } });
  seed.tasks.setState(id, "done", "parked");
};
type Standing = NonNullable<Bodies["owned_news"]["seen"]["standing"]>;
const looked = (id: string, pr: string, state: "open" | "merged", standing: Omit<Standing, "at">, since: number) =>
  log.append({ stream: `task:${id}`, origin: "system", kind: "owned_news", body: { taskId: id, pr, news: [], seen: { since: iso(since), from: "report", state, head: "e2b8b625ff6a9de8a3fa5de2bbfb9b3bd72f294d", standing: { at: new Date(clock.now()).toISOString(), head: "e2b8b625ff6a9de8a3fa5de2bbfb9b3bd72f294d", ...standing } } } });
const zsh = (c: string) => `/bin/zsh -lc '${c}'`;

// ---- this morning: a PR that merged ----
await at(-(6 * HOUR));
await open("t_bun", "Docs: the install page says which Bun it needs", "ducter-site", repo("ducter-site", "install-bun"), "claude-code", "sonnet");
issue("t_bun", "nowledge-co/ducter-site", 207, "Docs: the install page says which Bun it needs");
done("t_bun", w("安装页现在写明要 Bun 1.4.4 及以上；开了 PR #212。", "The install page now says Bun 1.4.4 or later. Opened PR #212."), "nowledge-co/ducter-site#212", 18, 4, 1);
await at(-(5 * HOUR));
looked("t_bun", "nowledge-co/ducter-site#212", "open", { checks: { total: 3, passed: 3, failed: [], pending: [] }, approvedBy: ["100gle"], merge: "clean" }, -(6 * HOUR));
await at(-(4 * HOUR));
looked("t_bun", "nowledge-co/ducter-site#212", "merged", { checks: { total: 3, passed: 3, failed: [], pending: [] }, approvedBy: ["100gle"], merge: "clean" }, -(6 * HOUR));

// ---- 8:51: three issue tasks, each with its PR ----
await at(-(3 * HOUR + 20 * MIN));
await open("t_11027", "Thread search loses the cursor when a filter changes and the page reloads before the next batch", "mem", repo("mem", "thread-search-cursor"), "codex", "gpt-6-luna");
issue("t_11027", "nowledge-co/mem", 11027, "Thread search loses the cursor when a filter changes and the page reloads before the next batch");
tool("t_11027", "commandExecution", zsh("cargo test -p mem-search thread_cursor"), "test result: ok. 31 passed");
await at(-(3 * HOUR + 9 * MIN));
done("t_11027", w("筛选变化时保留游标，翻页前重载也不会丢；加了 3 个回归测试。开了草稿 PR #11070。", "The cursor is kept when a filter changes, also across a reload before the next page; 3 regression tests. Opened draft PR #11070."), "nowledge-co/mem#11070", 321, 46, 9);
looked("t_11027", "nowledge-co/mem#11070", "open", { draft: true, checks: { total: 10, passed: 6, failed: [], pending: ["mem-bazel", "mem-playwright-e2e", "mem-lint", "tide"] }, merge: "draft" }, -(3 * HOUR + 9 * MIN));

await at(-(3 * HOUR + 15 * MIN));
await open("t_11031", w("桌面端：托盘菜单只显示当前空间的记忆，切换空间后要刷新", "Desktop: the tray menu shows only the open space's memories and refreshes after a switch"), "mem", repo("mem", "tray-space-scope"), "claude-code", "opus");
issue("t_11031", "nowledge-co/mem", 11031, w("桌面端：托盘菜单只显示当前空间的记忆，切换空间后要刷新", "Desktop: the tray menu shows only the open space's memories and refreshes after a switch"));
await at(-(3 * HOUR + 2 * MIN));
done("t_11031", w("托盘菜单按当前空间过滤，切换空间时重新读取；开了 PR #11068，在等评审。", "The tray menu filters by the open space and reloads on a switch. Opened PR #11068, waiting for review."), "nowledge-co/mem#11068", 142, 37, 4);
looked("t_11031", "nowledge-co/mem#11068", "open", { awaiting: ["hawkingrei"], checks: { total: 10, passed: 9, failed: [], pending: ["tide"] }, merge: "blocked" }, -(3 * HOUR + 2 * MIN));

await at(-(3 * HOUR + 30 * MIN));
await open("t_11019", "Graph export drops edge labels past 120 nodes when the layout is radial", "mem", repo("mem", "graph-export-labels"), "codex", "gpt-6-luna");
issue("t_11019", "nowledge-co/mem", 11019, "Graph export drops edge labels past 120 nodes when the layout is radial");
await at(-(3 * HOUR + 5 * MIN));
done("t_11019", w("径向布局超过 120 个节点时也导出边标签；开了 PR #11064。", "Edge labels are exported past 120 nodes in the radial layout too. Opened PR #11064."), "nowledge-co/mem#11064", 64, 12, 3);
looked("t_11019", "nowledge-co/mem#11064", "open", { approvedBy: ["hawkingrei"], checks: { total: 10, passed: 10, failed: [], pending: [] }, merge: "clean" }, -(3 * HOUR + 5 * MIN));

await at(-(2 * HOUR + 40 * MIN));
await open("t_8826", w("graph_error_response 的测试偶发失败 #8826", "graph_error_response tests fail now and then #8826"), "mem", repo("mem", "graph-error-response-tests"), "claude-code", "opus");
issue("t_8826", "nowledge-co/mem", 8826, "graph_error_response_tests intermittently misses the typed cause");
await at(-(2 * HOUR + 10 * MIN));
done("t_8826", w("共享的错误响应每个进程只初始化一次；开了 PR #10847。", "The shared error response is initialised once per process. Opened PR #10847."), "nowledge-co/mem#10847", 88, 21, 2);
looked("t_8826", "nowledge-co/mem#10847", "open", { changes: [{ id: "41", by: "hawkingrei", at: iso(-(20 * HOUR)), text: "rest_sources/source_graph_scan_tests.rs still reaches the shared graph error response without the new initialization." }], checks: { total: 10, passed: 9, failed: [], pending: ["tide"] }, merge: "blocked" }, -(2 * HOUR + 10 * MIN));

// ---- this afternoon: a result with a branch and no PR ----
await at(-(1 * HOUR + 50 * MIN));
await open("t_notes", w("整理本周 mem 的发布说明", "Write this week's mem release notes"), "mem", repo("mem", "release-notes"), "claude-code", "sonnet");
await at(-(1 * HOUR + 30 * MIN));
done("t_notes", w("发布说明写好了，按新功能、修复和文档分了三段。", "The release notes are written in three parts: features, fixes and docs."), undefined, 96, 0, 1);

// ---- at work ----
await at(-(12 * MIN));
await open("t_prefs", w("把 Macbook Pro M3 的通用设置导出来", "Export the general settings from the Macbook Pro M3"), "dotfiles", repo("dotfiles", "general-settings"), "codex", "gpt-6-luna");
for (const [m, cmd] of [[-10, "defaults read com.apple.finder"], [-6, "defaults read -g KeyRepeat"]] as const) {
  await at(m * MIN);
  tool("t_prefs", "commandExecution", zsh(cmd), "");
}
await at(-(1 * MIN));
say("t_prefs", w("读完了 41 项全局设置，在挑出键盘和触控板的那几项写进 defaults.sh。", "Read 41 global settings; picking out the keyboard and trackpad ones for defaults.sh."));
await at(0);

await Bun.sleep(300);
await seed.stop();

// Serve from a second core over the same Log, as after a restart; its looks stay off (no gh here).
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", port: Number(process.env.DUCTER_PORT ?? 7508), work });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] D508 On hand (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
