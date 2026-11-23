// D484: the opened task on a phone, as a demo core both clients read. Four tasks in the shapes the
// author met on hel (2026-11-22), each opened at /app#task=<id>:
//   t_agy   an Antigravity task in nowledge-mem that first failed on Gemini's INVALID_ARGUMENT twice
//           (its words verbatim, two stopped-without-reporting lines), was set going again by the
//           partner, made the edits, saved its progress, opened a draft PR and now waits on its CI;
//   t_live  a Claude Code task at work (a step every DEMO_TICK_MS);
//   t_cant  a start that failed (D472's no-folder shape);
//   t_done  a Codex task done with its draft PR opened from Ducter.
//   DUCTER_PORT=7484 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d484.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, CantStart, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-d484-")), "data");
const persona = { id: "default", name: "Ducter", identity: "" };

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = async (ms: number) => {
  await Bun.sleep(40);
  shift = ms;
};
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "ok", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const sys = (id: string, text: string, raw?: unknown) => ev(id, { role: "system", from: "runner", text, ...(raw ? { raw } : {}) });
const partnerSays = (id: string, text: string) => log.append({ stream: `task:${id}`, origin: "partner", kind: "task_event", body: { taskId: id, role: "user", from: "partner", text } });
const checkpoint = (id: string, text: string) => log.append({ stream: `task:${id}`, origin: "task", kind: "checkpoint", body: { taskId: id, text } });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) =>
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: `/Users/weyl/dev/${name}`, worktree: `/Users/weyl/.ducter/worktrees/${name}-${branch}`, branch: `ducter/${branch}`, baseBranch: "main" }) as Place;
function open(id: string, title: string, project: string, place: Place, harness: string, model: string, brief: string) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief } });
  seed.tasks.setState(id, "working", "hot");
}

// The conversation the tasks came from (a page with no conversation waits on the greeting, D474).
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("用 Gemini 把 Mem 的长文案审一遍，开个 PR", "Have Gemini go over Mem's long copy and open a PR") } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w("交给 Antigravity 了，CI 绿了我告诉你。", "Antigravity has it; I'll tell you when CI is green.") } });

// ---- done this morning, on Codex, its draft PR opened from Ducter ----
await at(-(5 * HOUR + 12 * MIN));
open("t_done", w("修 Mem 搜索结果里中文高亮错位", "Fix the misplaced highlight in Mem's Chinese search results"), "nowledge-mem", repo("nowledge-mem", "cjk-highlight"), "codex", "gpt-6-luna", w("Mem 搜索结果里中文关键词的高亮偏了一两个字，找到原因修掉，带测试，开草稿 PR。", "The highlight on Chinese keywords in Mem's search results is off by a character or two. Find why, fix it with a test, open a draft PR."));
tool("t_done", "commandExecution", "/bin/zsh -lc 'rg -n \"highlight\" src/search'", "src/search/highlight.ts:41: const start = text.indexOf(term)");
tool("t_done", "fileChange", { changes: [{ path: "/Users/weyl/dev/nowledge-mem/src/search/highlight.ts", kind: "update", diff: "-const start = byteOffset(text, term)\n+const start = [...text.slice(0, text.indexOf(term))].length" }] });
tool("t_done", "commandExecution", "/bin/zsh -lc 'bun test test/highlight.test.ts'", "12 pass\n0 fail");
await at(-(4 * HOUR + 40 * MIN));
say("t_done", w("原因是高亮按字节算位置，中文一个字三个字节。改成按字符算，加了 4 个中日韩混排的用例。", "The highlight counted bytes, and a Chinese character is three. It counts characters now; four mixed CJK cases added."));
report("t_done", { state: "done", summary: w("高亮改成按字符算位置，中文、日文和 emoji 混排都对上了；12 个测试都过。", "The highlight now counts characters, so Chinese, Japanese and emoji line up; all 12 tests pass."), evidence: [], branch: { commits: 2, uncommitted: false, files: 3, adds: 58, dels: 9 } });
seed.tasks.setState("t_done", "done", "parked");
log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t_done_open_pr", text: "the user opened a draft PR", state: "done", taskId: "t_done", act: "open_pr", ref: "https://github.com/nowledge-co/mem/pull/208" } });

// ---- a start that failed: Hetzner Server has no /root/dev/mem (D472) ----
await at(-(3 * HOUR));
const cant: CantStart = { why: "no_folder", computer: "Hetzner Server", what: "mem", path: "/root/dev/mem", device: "local", harness: "antigravity", cloneHere: true, pickHere: true };
log.append({ stream: "task:t_cant", origin: "partner", kind: "task_open", body: { taskId: "t_cant", title: w("在 hel 上跑 Mem 的端到端测试", "Run Mem's end-to-end tests on hel"), project: "mem", place: { kind: "folder", device: "local", path: "/root/dev/mem" }, harness: "antigravity", brief: w("在 hel 上跑一遍 Mem 的端到端测试，挂了的列出来。", "Run Mem's end-to-end tests on hel once and list what fails.") } });
log.append({ stream: "task:t_cant", origin: "task", kind: "task_event", body: { taskId: "t_cant", role: "system", from: "runner", text: "failed to start: folder does not exist: /root/dev/mem", raw: { cant } } });
seed.tasks.setState("t_cant", "failed", "archived", w("没能开始：Hetzner Server 上没有 mem 这个文件夹", "Couldn't start: Hetzner Server has no folder mem"), cant);

// ---- the Antigravity task: two failed first calls, set going again, a draft PR, CI ----
const A_ID = "t_agy";
const agyErr = "⚠ INVALID_ARGUMENT (code 400): * GenerateContentRequest.tools[0].function_declarations[18].parameters.properties[check].properties[succeedWhen].properties[oneOf].items: missing field.";
await at(-(2 * HOUR + 10 * MIN));
open(A_ID, w("用 Gemini 审改 Mem 长文案并开 PR", "Review Mem's long copy with Gemini and open a PR"), "nowledge-mem", repo("nowledge-mem", "mem-long-copy"), "antigravity", "gemini-3-pro",
  w("把 nowledge-mem 里 docs/ 和 apps/web 的长段落文案过一遍：每段先说结论，删掉重复的定语，中英文一起改，术语以 glossary.md 为准。改完开草稿 PR，CI 绿了告诉我。不要动代码里的 i18n key。",
    "Go through the long copy in nowledge-mem's docs/ and apps/web: each paragraph leads with its point, repeated qualifiers go, zh and en together, terms as glossary.md has them. Then open a draft PR and tell me when CI is green. Don't touch the i18n keys in code."));
await at(-(2 * HOUR + 9 * MIN));
say(A_ID, agyErr);
sys(A_ID, `turn failed (error): ${agyErr.slice(2)}`, { kind: "turn_ended", outcome: "failed" });
await at(-(2 * HOUR + 8 * MIN));
say(A_ID, agyErr);
sys(A_ID, "no report after one nudge; leaving the task idle (stall rule)", { stall: true, facts: { ranMs: 92_000, toolCalls: 0 } });
seed.tasks.setState(A_ID, "needs_you", "parked");
await at(-(1 * HOUR + 31 * MIN));
sys(A_ID, "mend: reopened after the tool schema fix", { mend: { how: "reopen" } });
partnerSays(A_ID, w("工具的格式问题修好了，Gemini 现在收得下。从头来：先读 glossary.md，再按段改 docs/ 和 apps/web 的文案。", "The tool format problem is fixed and Gemini accepts it now. Start again: read glossary.md first, then edit the copy in docs/ and apps/web paragraph by paragraph."));
seed.tasks.setState(A_ID, "working", "hot");
await at(-(1 * HOUR + 29 * MIN));
tool(A_ID, "read_file", { path: "/Users/weyl/dev/nowledge-mem/docs/glossary.md" }, "");
tool(A_ID, "grep_search", { query: "能够|进行|相关的", path: "docs" }, "docs/intro.md:12\ndocs/bridge.md:40\ndocs/spaces.md:7");
for (const [m, f, a, d] of [[-80, "docs/intro.md", 14, 19], [-72, "docs/bridge.md", 22, 31], [-64, "docs/spaces.md", 9, 12], [-55, "apps/web/src/i18n/zh.json", 31, 33], [-48, "apps/web/src/i18n/en.json", 29, 30]] as const) {
  await at(m * MIN);
  tool(A_ID, "replace_file_content", { path: `/Users/weyl/dev/nowledge-mem/${f}`, diff: `${"+ line\n".repeat(a)}${"- line\n".repeat(d)}` }, "ok");
  if (m === -64) checkpoint(A_ID, "docs/intro, bridge, spaces done; next the web strings");
}
await at(-(44 * MIN));
say(A_ID, w("docs/ 下三篇和网页的中英文字符串改完了，一共 41 段：每段先说结论，删了 63 处「进行」「相关的」。术语都对过 glossary.md。", "The three pages under docs/ and the web strings are done in zh and en, 41 paragraphs: each leads with its point, 63 \"进行\" and \"相关的\" gone. Terms checked against glossary.md."));
checkpoint(A_ID, w("docs/ 下三篇和网页的中英文字符串改完了，一共 41 段：每段先说结论，删了 63 处「进行」「相关的」。术语都对过 glossary.md。", "The three pages under docs/ and the web strings are done in zh and en, 41 paragraphs: each leads with its point, 63 \"进行\" and \"相关的\" gone. Terms checked against glossary.md."));
await at(-(40 * MIN));
tool(A_ID, "run_command", { command: "git commit -am 'docs: lead with the point, drop filler (zh, en)'" }, "[ducter/mem-long-copy 4e1c9a2] docs: lead with the point\n 5 files changed, 105 insertions(+), 125 deletions(-)");
tool(A_ID, "run_command", { command: "gh pr create --draft --title 'Docs: lead with the point, drop filler' --base main" }, "https://github.com/nowledge-co/mem/pull/212");
await at(-(38 * MIN));
report(A_ID, { state: "progress", summary: w("41 段改完，开了草稿 PR #212。CI 在跑，大约 20 分钟，绿了我告诉你。", "41 paragraphs edited, draft PR #212 open. CI is running, about 20 minutes; I'll tell you when it's green."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/212" }], branch: { commits: 1, uncommitted: false, files: 5, adds: 105, dels: 125 } });
seed.work.waiters.arm({ reason: w("PR #212 的 CI 跑完", "PR #212's CI finishes"), taskId: A_ID, at: iso(9 * MIN), wakes: "task" });
seed.tasks.setState(A_ID, "blocked", "parked");

// ---- at work: Claude Code ----
await at(-(14 * MIN));
open("t_live", w("给 Bridge 的收信箱加上按 Space 过滤", "Add a Space filter to Bridge's mailbox"), "nowledge-mem", repo("nowledge-mem", "bridge-space-filter"), "claude-code", "opus", w("Bridge 的收信箱按 Space 过滤：默认全部，选了就只看那个 Space 的信。带测试。", "Bridge's mailbox filtered by Space: all by default, only that Space's messages once one is picked. With tests."));
tool("t_live", "Read", { file_path: "/Users/weyl/dev/nowledge-mem/src/bridge/mailbox.ts" }, "");
tool("t_live", "Grep", { pattern: "spaceId", path: "src/bridge" }, "src/bridge/mailbox.ts:88");
await at(-(6 * MIN));
say("t_live", w("收信箱的查询已经带 spaceId 了，只差界面上的选择和空的时候的说法。", "The mailbox query already takes a spaceId; only the picker and the empty state are missing."));
tool("t_live", "Edit", { file_path: "/Users/weyl/dev/nowledge-mem/src/bridge/MailboxView.tsx", old_string: "a", new_string: "b" }, "ok");
await at(0);

await Bun.sleep(300);
await seed.stop();

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const script: [string, unknown, string][] = [
  ["Bash", { command: "bun test test/bridge/mailbox.test.ts" }, "9 pass\n0 fail"],
  ["Edit", { file_path: "/Users/weyl/dev/nowledge-mem/src/bridge/MailboxView.tsx", old_string: "a", new_string: "b" }, "ok"],
  ["Read", { file_path: "/Users/weyl/dev/nowledge-mem/src/bridge/SpacePicker.tsx" }, ""],
];
let k = 0;
const tickMs = Number(process.env.DEMO_TICK_MS ?? 5000);
if (tickMs > 0)
  setInterval(() => {
    if (k >= 40) return;
    const [name, input, output] = script[k % script.length]!;
    core.log.append({ stream: "task:t_live", origin: "task", kind: "task_event", body: { taskId: "t_live", role: "tool", tool: { name, input, output, ok: true } } });
    k++;
  }, tickMs);
console.log(`[demo] D484 (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app#task=t_agy (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
