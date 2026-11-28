// research/245 §3.5 (D662): 列表 / List for a builder's board. Forty tasks over five repositories
// (one with a long name), three computers (hel, haswell, the Mac) and seven agents; zh and en
// titles side by side as a real board has them; PRs with CI counts; a few running for hours; one
// report the cheap model hasn't read yet (its row says 它说：… muted). Real core, the stub runner.
//   DUCTER_PORT=7662 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-listmode.ts
//   DEMO_FEW=1 ... (six tasks: the consumer's calm board, no toggle, no keys, no columns)
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const skew = { ms: 0 };
const clock = {
  now: () => Date.now() + skew.ms,
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
const lines = new Map<string, string>();
const core = startCore({
  clock,
  ...(process.env.DUCTER_PORT ? { port: Number(process.env.DUCTER_PORT) } : {}),
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ version: "0.44.0" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0 } as never,
  work: { holdingsEveryMs: 0, ownedEveryMs: 0 },
  // The row's one line: the demo's cheap model answers at once with the line seeded for the task;
  // a task with no seeded line keeps its raw report (the muted 它说：… fallback).
  gists: {
    ask: async ({ report }) => {
      for (const [k, v] of lines) if (report.includes(k)) return { line: v };
      throw new Error("no line yet");
    },
  },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "haswell", platform: "linux-x64" });
core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook Pro M3", platform: "darwin-arm64" });
await Bun.sleep(80);
const log = core.log;

type Att = "working" | "blocked" | "needs_you" | "done" | "failed";
type T = { id: string; title: string; key?: string; name?: string; place: Place; harness: string; model?: string; att: Att; ago: number; report?: string; gist?: string; pr?: { n: number; total: number; passed: number; failed?: string[]; merged?: boolean }; waitsFor?: string; source?: boolean };
const repo = (device: string, path: string, branch: string): Place => ({ kind: "repo", device, repoPath: path, branch: `ducter/${branch}`, baseBranch: "main" });
const none = (device = "local"): Place => (device === "local" ? { kind: "none" } : { kind: "none", device });
const MEM = { key: "github.com/nowledge-co/mem", name: "mem" };
const SITE = { key: "github.com/nowledge-co/nowledge-labs-website", name: "nowledge-labs-website" };
const BB = { key: "github.com/nowledge-co/mem-backbone", name: "mem-backbone" };
const DUCTER = { key: "github.com/wey-gu/ducter", name: "ducter" };
const OC = { key: "github.com/nowledge-co/openclaw-memory-integration-experiments", name: "openclaw-memory-integration-experiments" };
const hel = "/home/w/ducter/projects";
const mac = "/Users/weyl/dev";

const all: T[] = [
  // needs you
  { id: "l01", ...MEM, title: "核对数据迁移设计并补齐统一备份与恢复", place: repo("local", `${hel}/mem`, "migration-backup"), harness: "codex", model: "gpt-6-luna", att: "needs_you", ago: -38 * MIN, waitsFor: w("备份保留几份？", "How many backups to keep?"), report: "备份和恢复两条路都写好了 r01", gist: w("备份和恢复都写好了，要你定保留几份。", "Backup and restore are written; you pick how many copies to keep.") },
  { id: "l02", ...SITE, title: "The homepage hero image is cut in half on a phone", place: repo("mac", `${mac}/nowledge-mem/nowledge-labs-website`, "phone-hero"), harness: "claude-code", model: "opus", att: "needs_you", ago: -22 * MIN, waitsFor: w("新的构图行不行？", "Does the new framing work?"), report: "Recropped the hero r02", gist: w("裁好了，要你看一下新的构图。", "Recropped; take a look at the new framing.") },
  { id: "l03", ...MEM, title: "跟进 #11230：远程访问设置重构，等 hawkingrei 复审", place: repo("haswell", `${hel}/mem`, "access-anywhere"), harness: "codex", att: "needs_you", ago: -2 * HOUR, waitsFor: w("要不要现在请 Weizhen 复审？", "Ask Weizhen to review now?"), pr: { n: 11230, total: 11, passed: 6 }, report: "复审通过 r03", gist: w("复审通过，要你决定是否现在请人看。", "Review passed; you decide whether to ask for a reviewer now.") },
  { id: "l04", ...DUCTER, title: "D662 List mode: decide the ⌘1 / ⌘2 conflict with the app's own keys", place: repo("mac", `${mac}/ducter`, "listmode"), harness: "pi", att: "needs_you", ago: -9 * MIN, waitsFor: w("⌘1 走哪一步？", "Which step does ⌘1 take?"), report: "Two ways to read the keys r04", gist: w("两种键位都能做，要你挑一个。", "Both key readings work; pick one.") },
  // working
  { id: "l05", ...MEM, title: "修 Mem 首次连接遇到 403 的体验（#11406）", place: repo("local", `${hel}/mem`, "403-first-connect"), harness: "codex", model: "gpt-6-luna", att: "working", ago: -7 * HOUR, report: "在连接器设置里换掉旧的 CLI 调用 r05", gist: w("在连接器设置里换掉旧的 CLI 调用。", "Replacing the old CLI call in the connector settings."), source: true },
  { id: "l06", ...MEM, title: "Read PR state at the home when haswell has no gh installed", place: repo("haswell", `${hel}/mem`, "gh-at-home"), harness: "claude-code", model: "sonnet", att: "working", ago: -12 * MIN, report: "Moving github.com reads r06", gist: w("把 github.com 的读取挪到 hel 上。", "Moving github.com reads to hel.") },
  { id: "l07", ...BB, title: "Backbone 的 schema 和后端对齐", place: repo("haswell", `${hel}/mem-backbone`, "schema-align"), harness: "antigravity", att: "working", ago: -9 * MIN, report: "两个表的外键对上了 r07", gist: w("两个表的外键对上了。", "Two tables' foreign keys agree now.") },
  { id: "l08", ...DUCTER, title: "Make every Keep say when it ends, how long it has gone, and end", place: repo("mac", `${mac}/ducter`, "keep-ends"), harness: "opencode", att: "working", ago: -8 * HOUR, report: "Wiring the stall ask r08", gist: w("在接第 6 轮后的停滞提问。", "Wiring the ask after six stalled rounds.") },
  { id: "l09", ...OC, title: "OpenClaw 记忆插件：把会话摘要接到 Mem 的 thread API", place: repo("local", `${hel}/openclaw-memory-integration-experiments`, "thread-api"), harness: "kimi", att: "working", ago: -26 * MIN, report: "thread API 的分页 r09", gist: w("在处理 thread API 的分页。", "Handling the thread API's paging.") },
  { id: "l10", ...MEM, title: "看一眼 #11406 合并之后的主线", place: repo("mac", `${mac}/nowledge-mem`, "main-after-11406"), harness: "cursor", att: "working", ago: -1 * MIN, report: "在跑 lcov 和 e2e r10", gist: w("在跑 lcov 和 e2e。", "Running lcov and e2e.") },
  { id: "l11", title: "读 research/244 的会话审计，挑出三条要改的", place: none(), harness: "claude-code", model: "opus", att: "working", ago: -6 * MIN, report: "在看第三部分 r11", gist: w("在看第三部分。", "Reading part three.") },
  { id: "l12", ...SITE, title: "Docs: rewrite the Bridge quick start for people who never used an agent", place: repo("mac", `${mac}/nowledge-mem/nowledge-labs-website`, "bridge-qs"), harness: "codex", att: "working", ago: -44 * MIN, report: "Second draft r12" },
  { id: "l13", ...MEM, title: "把 Mem 的长文案改成新的语气（设置页、空状态、错误提示）", place: repo("local", `${hel}/mem`, "voice-copy"), harness: "pi", att: "working", ago: -3 * MIN, report: "改到错误提示 r13", gist: w("改到错误提示这一页了。", "On the error messages now.") },
  // waiting
  { id: "l14", ...MEM, title: "独立复审远程访问设置并跟进 #11230", place: repo("local", `${hel}/mem`, "access-review"), harness: "codex", att: "blocked", ago: -18 * MIN, pr: { n: 11230, total: 11, passed: 6 }, report: "PR #11230 的 CI 在跑 r14", gist: w("在等 #11230 的 CI。", "Waiting on #11230's CI.") },
  { id: "l15", ...MEM, title: "写 Mem 迁移的发布说明", place: repo("mac", `${mac}/nowledge-mem`, "release-notes"), harness: "claude-code", att: "blocked", ago: -40 * MIN, report: "等 #11230 合了再发 r15", gist: w("等 #11230 合了再发。", "Waiting for #11230 to merge.") },
  { id: "l16", ...MEM, title: "Fix the flaky e2e on the Mem desktop app's first launch", place: repo("haswell", `${hel}/mem`, "e2e-first-launch"), harness: "antigravity", att: "blocked", ago: -3 * HOUR, pr: { n: 11421, total: 14, passed: 11, failed: ["lint"] }, report: "Lint failed on an unused import r16", gist: w("lint 没过，在等下一轮 CI。", "Lint failed; waiting on the next CI run.") },
  { id: "l17", ...BB, title: "mem-backbone：迁移脚本在空库上跑一遍", place: repo("haswell", `${hel}/mem-backbone`, "empty-db"), harness: "opencode", att: "blocked", ago: -55 * MIN, pr: { n: 214, total: 6, passed: 6 }, report: "空库上跑通 r17", gist: w("空库上跑通了，等合并。", "Ran clean on an empty database; waiting to merge.") },
  { id: "l18", ...DUCTER, title: "Phone: the Tasks head wraps one character per line at 320", place: repo("mac", `${mac}/ducter`, "phone-head"), harness: "codex", att: "blocked", ago: -2 * HOUR, pr: { n: 892, total: 9, passed: 9 }, report: "All green r18", gist: w("全绿，等你合。", "All green; waiting for your merge.") },
  { id: "l19", title: "给下周的发布写一页提纲", place: none("haswell"), harness: "kimi", att: "blocked", ago: -2 * HOUR, report: "等 #11230 的结果 r19", gist: w("等 #11230 的结果。", "Waiting on #11230.") },
  { id: "l20", ...OC, title: "OpenClaw: benchmark recall on the 2k-thread corpus", place: repo("local", `${hel}/openclaw-memory-integration-experiments`, "bench-2k"), harness: "cursor", att: "blocked", ago: -9 * HOUR, report: "The run is at 1400 of 2000 r20", gist: w("跑到 1400 / 2000。", "At 1,400 of 2,000.") },
  { id: "l21", ...SITE, title: "官网的定价页在暗色下对比度不够", place: repo("mac", `${mac}/nowledge-mem/nowledge-labs-website`, "pricing-dark"), harness: "claude-code", att: "blocked", ago: -70 * MIN, pr: { n: 419, total: 5, passed: 4 }, report: "等 Vercel 预览 r21", gist: w("在等 Vercel 的预览。", "Waiting on the Vercel preview.") },
  // done today
  { id: "l22", ...MEM, title: "给 Mem 的搜索补上中文样例", place: repo("mac", `${mac}/nowledge-mem`, "search-zh"), harness: "codex", att: "done", ago: -3 * HOUR, pr: { n: 11402, total: 12, passed: 12, merged: true }, report: "加了 12 条 r22", gist: w("加了 12 条，测试都过。", "Added 12; the tests pass.") },
  { id: "l23", ...MEM, title: "Undo the duplicate migration in mem-identity", place: repo("haswell", "/home/w/dev/mem-identity", "identity-duplicate"), harness: "claude-code", att: "done", ago: -5 * HOUR, report: "Undone r23", gist: w("撤回了，索引重新对上。", "Undone; the index lines up again.") },
  { id: "l24", ...SITE, title: "文档页的搜索在 390 宽不好用", place: repo("mac", `${mac}/nowledge-mem/nowledge-labs-website`, "docs-search"), harness: "pi", att: "done", ago: -4 * HOUR, report: "改成一行 r24", gist: w("改成一行，手机上能用了。", "One row now; it works on a phone.") },
  { id: "l25", title: "整理这周的 Mem 邮箱", place: none(), harness: "kimi", att: "done", ago: -6 * HOUR, report: "清到 0 封 r25", gist: w("清到 0 封。", "Down to zero.") },
  { id: "l26", title: "Install Prow MCP on haswell and connect it", place: none("haswell"), harness: "codex", att: "done", ago: -1 * DAY, report: "Installed r26", gist: w("装好了，已接上。", "Installed and connected.") },
  { id: "l27", ...DUCTER, title: "D661 turn 2: a needs-you row stands alone", place: repo("mac", `${mac}/ducter`, "d661-turn2"), harness: "opencode", att: "done", ago: -2 * HOUR, pr: { n: 889, total: 9, passed: 9, merged: true }, report: "Merged r27", gist: w("合并了。", "Merged.") },
  { id: "l28", ...BB, title: "mem-backbone 的 README 补上本地起服务的步骤", place: repo("haswell", `${hel}/mem-backbone`, "readme"), harness: "antigravity", att: "done", ago: -90 * MIN, report: "补好了 r28", gist: w("补好了三步。", "Three steps added.") },
  { id: "l29", ...OC, title: "OpenClaw：把旧的 embedding 缓存清掉再跑一遍", place: repo("local", `${hel}/openclaw-memory-integration-experiments`, "cache-clear"), harness: "cursor", att: "done", ago: -100 * MIN, report: "清掉了 r29" },
  { id: "l30", title: "回 Lina 关于 HawDB 发布的邮件", place: none(), harness: "claude-code", att: "failed", ago: -1 * HOUR, report: "这台电脑上没有你的邮件 r30", gist: w("没能开始：这台电脑上没有你的邮件。", "Couldn't start: your mail isn't on this computer.") },
  { id: "l31", ...MEM, title: "把 Prow 的日志接进 nowledge-ci 的 MCP", place: repo("local", `${hel}/mem`, "prow-logs"), harness: "codex", att: "done", ago: -150 * MIN, report: "接上了 r31", gist: w("接上了，能读最近 20 次的日志。", "Connected; it reads the last 20 runs.") },
  { id: "l32", ...DUCTER, title: "Release 0.1.101: tool budget for the merged branches", place: repo("mac", `${mac}/ducter`, "rc-0.1.101"), harness: "pi", att: "done", ago: -5 * HOUR, report: "Released r32", gist: w("发布了。", "Released.") },
  { id: "l33", ...MEM, title: "Look at why the Windows installer is 40 MB bigger since 0.10.118", place: repo("haswell", `${hel}/mem`, "win-size"), harness: "kimi", att: "done", ago: -7 * HOUR, report: "Two copies of the ONNX runtime r33", gist: w("ONNX 运行时打包了两份。", "The ONNX runtime is bundled twice.") },
  { id: "l34", ...SITE, title: "官网 changelog 加上 0.10.119", place: repo("mac", `${mac}/nowledge-mem/nowledge-labs-website`, "changelog"), harness: "codex", att: "done", ago: -8 * HOUR, report: "加上了 r34", gist: w("加上了。", "Added.") },
  { id: "l35", title: "在 hel 上装 Prow MCP 并接上", place: none(), harness: "opencode", att: "failed", ago: -32 * MIN, report: "缺一个系统依赖 r35", gist: w("装到一半，缺一个系统依赖。", "Half installed; a system dependency is missing.") },
  { id: "l36", ...MEM, title: "给 #11389 补一个回归测试", place: repo("local", `${hel}/mem`, "11389-test"), harness: "claude-code", att: "done", ago: -9 * HOUR, report: "补了 r36", gist: w("补了一个，CI 过了。", "Added one; CI passed.") },
  { id: "l37", ...DUCTER, title: "Web: the toast's Undo is cut at 320 in English", place: repo("mac", `${mac}/ducter`, "toast-320"), harness: "cursor", att: "done", ago: -10 * HOUR, report: "Fixed r37", gist: w("修好了。", "Fixed.") },
  { id: "l38", ...OC, title: "OpenClaw: write up what recall@10 means for a person", place: repo("local", `${hel}/openclaw-memory-integration-experiments`, "recall-words"), harness: "antigravity", att: "done", ago: -11 * HOUR, report: "Wrote it r38", gist: w("写了一页。", "Wrote a page.") },
  { id: "l39", ...BB, title: "mem-backbone：把 CI 的 Go 版本升到 1.26", place: repo("haswell", `${hel}/mem-backbone`, "go126"), harness: "pi", att: "done", ago: -12 * HOUR, report: "升好了 r39", gist: w("升好了。", "Upgraded.") },
  { id: "l40", title: "Book the dentist for next Tuesday afternoon", place: none(), harness: "claude-code", att: "done", ago: -13 * HOUR, report: "Booked r40", gist: w("约好了周二下午三点。", "Booked: Tuesday at 3pm.") },
];
const tasks = process.env.DEMO_FEW ? all.filter((x) => ["l01", "l05", "l11", "l14", "l22", "l25"].includes(x.id)) : all;

for (const x of tasks) {
  skew.ms = x.ago;
  if (x.gist && x.report) lines.set(x.report.replace(/ r\d+$/, ""), x.gist);
  const body: Bodies["task_open"] = { taskId: x.id, title: x.title, project: "", place: x.place, harness: x.harness, ...(x.model ? { model: x.model } : {}), brief: x.title, ...(x.key ? { projectKey: x.key, projectName: x.name } : {}) };
  log.append({ stream: `task:${x.id}`, origin: "partner", kind: "task_open", body });
  const res = x.att === "done" || x.att === "failed" ? "parked" : "hot";
  core.tasks.setState(x.id, x.att, res);
  log.append({ stream: `task:${x.id}`, origin: "system", kind: "task_state", body: { taskId: x.id, attention: x.att, residency: res, ...(x.waitsFor ? { waitsFor: x.waitsFor } : {}) } });
  if (x.pr) {
    const where = x.key?.replace("github.com/", "") ?? "nowledge-co/mem";
    log.append({ stream: `task:${x.id}`, origin: "system", kind: "owned_news", body: { taskId: x.id, pr: `${where}#${x.pr.n}`, news: [], seen: { since: new Date(clock.now()).toISOString(), state: x.pr.merged ? "merged" : "open", standing: { at: new Date(clock.now()).toISOString(), title: x.title, head: "352a5bf1", checks: { total: x.pr.total, passed: x.pr.passed, failed: x.pr.failed ?? [], pending: x.pr.passed + (x.pr.failed?.length ?? 0) < x.pr.total ? ["build"] : [] } } } } as never });
  }
  if (x.att === "blocked") log.append({ stream: `waiter:w_${x.id}`, origin: "waiter", kind: "waiter", body: { waiterId: `w_${x.id}`, taskId: x.id, reason: x.pr ? w(`#${x.pr.n} 的检查`, `#${x.pr.n}'s checks`) : w("下一次结果", "the next result"), state: "armed", armedAt: new Date(clock.now()).toISOString(), lastLookAt: new Date(Date.now() - 2 * MIN).toISOString(), nextLookAt: new Date(Date.now() + 6 * MIN).toISOString(), everyMs: 10 * MIN } } as never);
  if (x.report) log.append({ stream: `task:${x.id}`, origin: "task", kind: "report", body: { taskId: x.id, state: x.att === "done" ? "done" : x.att === "failed" ? "failed" : x.att === "blocked" ? "blocked" : "progress", summary: x.report.replace(/ r\d+$/, ""), questions: [], evidence: [] } });
  if (x.source) log.append({ stream: `task:${x.id}`, origin: "system", kind: "task_bound", body: { taskId: x.id, by: "you", item: { source: "src_github", kind: "github", ref: "nowledge-co/mem#11406", label: "#11406", where: "nowledge-co/mem", title: x.title, url: "https://github.com/nowledge-co/mem/issues/11406" } } });
}
// The stub runner takes a fresh task to work; the seeded state is each task's last word.
await Bun.sleep(300);
for (const x of tasks) {
  if (x.att === "working") continue;
  skew.ms = x.ago;
  const res = x.att === "done" || x.att === "failed" ? "parked" : "warm";
  log.append({ stream: `task:${x.id}`, origin: "system", kind: "task_state", body: { taskId: x.id, attention: x.att, residency: res, ...(x.waitsFor ? { waitsFor: x.waitsFor } : {}) } });
}
skew.ms = 0;

console.log(`[demo] list mode ${zh ? "zh" : "en"} with ${tasks.length} tasks at http://127.0.0.1:${core.port}/app#onhand/full`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
