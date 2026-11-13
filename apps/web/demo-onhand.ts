// A demo core for On hand as a workspace (D216): many tasks at once, as a heavy user has them. Repo
// tasks across three projects (working, waiting on CI, asking, done with a draft PR, merged,
// failed), errands with no folder (a hotel in the browser, comparing quotes), a folder task, two
// phone calls on the fake Tuwa, and a wait for an email. Never this machine's oo or accounts.
//   DUCTER_PORT=7993 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-onhand.ts
// DEMO_MANY=n adds n more repo tasks (for the long-list checks); DEMO_FEW=1 seeds only one errand,
// a fresh user's first day.
import { startCore, stubRunner } from "@ducter/core";
import type { BranchChanges, Bodies, CallBody, Place } from "@ducter/protocol";
import { fakeTuwa } from "../../packages/core/test/fake-tuwa.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR!;
const many = Number(process.env.DEMO_MANY ?? 0);
const few = !!process.env.DEMO_FEW;
const persona = { id: "default", name: "Ducter", identity: "" };
const ooSource = { detect: () => ({ installed: false, account: false }), read: () => undefined };
const tuwa = fakeTuwa();

// What each repo task changed (the runner counts it with git; here, a table).
const diffs = new Map<string, BranchChanges>();
const runnerOf = (core: ReturnType<typeof startCore>) => ({
  ...stubRunner(core),
  async branchChanges(taskId: string) {
    return diffs.get(taskId);
  },
  async merge(taskId: string) {
    await Bun.sleep(400);
    return { ok: true, message: "Merged.", ref: `9f${taskId.length}c2a71e` };
  },
  async openPr(taskId: string) {
    await Bun.sleep(600);
    return { ok: true, message: "Opened a draft PR.", ref: `https://github.com/wey-gu/ducter/pull/${200 + taskId.length}` };
  },
});

const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource });
seed.setRunner(runnerOf(seed));
seed.setPartner({ onTrigger() {} });
const log = seed.log;
const tick = () => Bun.sleep(15);
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();

const repo = (name: string, branch: string, device = "local"): Place => ({ kind: "repo", device, repoPath: `/Users/weyl/dev/${name}`, branch: `ducter/${branch}`, baseBranch: "main" });
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "ok", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) =>
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });

async function open(id: string, title: string, project: string, place: Place, harness = "claude-code", model = "opus", brief = title) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief } });
  seed.tasks.setState(id, "working", "hot");
  await tick();
}

if (few) {
  await open("t_hotel", w("订 12 月 6 号京都的酒店，两晚，岚山附近", "Book a hotel in Kyoto for Dec 6, two nights, near Arashiyama"), "", { kind: "none" }, "claude-code", "sonnet");
  say("t_hotel", w("先在 Booking 上看岚山附近两晚的房，挑三家给你。", "Looking at two-night rooms near Arashiyama on Booking first; I'll pick three for you."));
  tool("t_hotel", "mcp__browser__navigate", { url: "https://www.booking.com/searchresults.html?ss=Arashiyama" }, "navigated");
} else {
  // ---- ducter ----
  await open("t_keys", w("On hand 的键盘导航和任务切换", "Keyboard navigation and the task switcher on On hand"), "ducter", repo("ducter", "onhand-keys"), "claude-code", "opus");
  say("t_keys", w("j/k 在列表里走，Enter 打开。先补测试。", "j/k walk the list, Enter opens. Tests first."));
  tool("t_keys", "Edit", { file_path: "/Users/weyl/dev/ducter/apps/web/src/onhand.tsx", old_string: "a", new_string: "b" });
  tool("t_keys", "Bash", { command: "bun test apps/web/test/onhand.test.ts" }, "12 pass\n0 fail");
  diffs.set("t_keys", { commits: 3, uncommitted: true, files: 6, adds: 184, dels: 41 });

  await open("t_emoji", w("修 iOS 上新建任务里冒出来的 emoji", "Fix the emoji showing in New task on iOS"), "ducter", repo("ducter", "no-emoji"), "codex", "gpt-5.5");
  tool("t_emoji", "commandExecution", "/bin/zsh -lc 'rg -n \"↩\" apps/web/src'", "apps/web/src/newtask.tsx:212");
  tool("t_emoji", "fileChange", { changes: [{ path: "/Users/weyl/dev/ducter/apps/web/src/newtask.tsx", kind: "update", diff: "-⌘↩\n+⌘⏎" }] });
  diffs.set("t_emoji", { commits: 1, uncommitted: false, files: 2, adds: 12, dels: 4 });

  await open("t_asc", w("准备 Ducter iOS 在 App Store Connect 上的上架资料", "Get Ducter iOS ready in App Store Connect"), "ducter", repo("ducter", "app-store-connect"), "codex", "gpt-5.5");
  tool("t_asc", "mcp__browser__navigate", { url: "https://appstoreconnect.apple.com/login" }, "navigated");
  report("t_asc", {
    state: "needs_input",
    evidence: [],
    summary: w("App Store Connect 要登录。描述、关键词和截图都准备好了。", "App Store Connect needs a sign-in. The description, keywords and screenshots are ready."),
    questions: [{ id: "q1", text: w("在 Chrome 里登录一下 App Store Connect？登好了我接着填。", "Could you sign in to App Store Connect in Chrome? I'll carry on once you have."), blocking: true, default: w("等你登录后继续。", "Wait for you to sign in, then continue."), reversible: true }],
  });
  diffs.set("t_asc", { commits: 1, uncommitted: false, files: 4, adds: 96, dels: 0 });

  await open("t_glyph", w("D211：手机上画不出来的符号一律不用", "D211: no symbol the phone can't draw as text"), "ducter", repo("ducter", "glyph-guard"), "claude-code", "opus");
  report("t_glyph", { state: "done", summary: w("加了符号检查，CI 里会跑；改了 14 处文字。", "Added the glyph guard to CI and fixed 14 strings."), evidence: [{ kind: "test", label: w("测试全过", "All tests pass"), ref: "bun test" }] });
  seed.tasks.setState("t_glyph", "done", "parked");
  log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t_glyph_merge", taskId: "t_glyph", state: "done", text: "the user merged this task's branch", act: "merge", ref: "6771ec21" } });
  diffs.set("t_glyph", { commits: 2, uncommitted: false, files: 9, adds: 212, dels: 58 });

  await open("t_android", w("Android 构建在 CI 上挂了", "The Android build fails on CI"), "ducter", repo("ducter", "android-ci"), "codex", "gpt-5.5");
  tool("t_android", "commandExecution", "/bin/zsh -lc './gradlew assembleRelease'", "FAILURE: Build failed with an exception.\n* What went wrong: SDK location not found.", false);
  report("t_android", { state: "failed", summary: w("CI 的机器上没有 Android SDK，构建起不来。要先在 workflow 里装 SDK。", "The CI machine has no Android SDK, so the build can't start. The workflow needs to install it first."), evidence: [] });
  seed.tasks.setState("t_android", "failed", "parked");

  // ---- hawdb ----
  await open("t_tokio", w("把 tokio 升到 1.42", "Upgrade tokio to 1.42"), "hawdb", repo("hawdb", "tokio-1.42", "hel"), "claude-code", "sonnet");
  tool("t_tokio", "Bash", { command: "cargo update -p tokio" }, "Updating tokio v1.38.0 -> v1.42.0");
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_rebase", taskId: "t_tokio", question: w("main 上多了 3 个提交，先 rebase 再接着跑测试？", "main moved 3 commits ahead. Rebase first, then run the tests?"), goLabel: w("rebase", "Rebase"), defaultOption: "go", defaultAt: iso(25 * 60_000), reversible: true } });
  seed.tasks.setState("t_tokio", "needs_you", "hot");
  diffs.set("t_tokio", { commits: 1, uncommitted: true, files: 3, adds: 18, dels: 17 });

  await open("t_wamp", w("compaction 的写放大分析", "Write amplification in compaction"), "hawdb", repo("hawdb", "compaction-wamp", "hel"), "claude-code", "opus");
  say("t_wamp", w("L0 到 L1 的合并每次都把整个 L1 读出来，这是写放大的大头。", "Every L0 to L1 merge reads the whole of L1; that's most of the write amplification."));
  tool("t_wamp", "Read", { file_path: "/Users/weyl/dev/hawdb/crates/storage/src/compaction.rs" }, "");

  await open("t_pr", w("PR #1592：修 compaction 测试", "PR #1592: fix the compaction test"), "hawdb", repo("hawdb", "compaction-fix", "hel"), "claude-code", "opus");
  report("t_pr", { state: "blocked", summary: w("PR 开了，等 CI 跑完。", "The PR is open; waiting for CI."), evidence: [] });
  seed.work.waiters.arm({ reason: w("PR #1592 通过", "PR #1592 passes"), taskId: "t_pr", check: { argv: ["gh", "pr", "checks", "1592", "--json", "state"], succeedWhen: { path: "[].state", equals: "SUCCESS" } }, everyMs: 5 * 60_000, until: iso(6 * 3600_000) });
  seed.tasks.setState("t_pr", "blocked", "parked");
  log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t_pr_open_pr", taskId: "t_pr", state: "done", text: "the user opened a draft PR", act: "open_pr", ref: "https://github.com/nowledge-co/hawdb/pull/1592" } });
  diffs.set("t_pr", { commits: 2, uncommitted: false, files: 2, adds: 23, dels: 8 });

  await open("t_bench", w("给 range scan 加基准测试", "Add a benchmark for range scans"), "hawdb", repo("hawdb", "range-bench"), "claude-code", "sonnet");
  report("t_bench", { state: "done", summary: w("加了 3 个基准：1 万、10 万、100 万行。100 万行的扫描 41ms。", "Added three benchmarks: 10k, 100k and 1M rows. A 1M-row scan takes 41 ms."), evidence: [{ kind: "test", label: w("基准跑通", "Benchmarks run"), ref: "cargo bench" }] });
  seed.tasks.setState("t_bench", "done", "parked");
  diffs.set("t_bench", { commits: 1, uncommitted: false, files: 3, adds: 141, dels: 2 });

  // ---- mem ----
  await open("t_obsidian", w("导入 Obsidian 时保留双链", "Keep wiki links when importing from Obsidian"), "mem", repo("mem", "obsidian-links"), "codex", "gpt-5.5");
  tool("t_obsidian", "commandExecution", "/bin/zsh -lc 'rg -n \"\\[\\[\" importers/obsidian'", "importers/obsidian/parse.ts:40");
  say("t_obsidian", w("别名 [[页|别名]] 也要处理，正在补这一种。", "Aliases like [[page|alias]] need handling too; adding that case now."));
  diffs.set("t_obsidian", { commits: 2, uncommitted: true, files: 4, adds: 66, dels: 9 });

  await open("t_readme", w("README 的中文版", "A Chinese README"), "mem", repo("mem", "readme-zh"), "claude-code", "sonnet");
  report("t_readme", { state: "done", summary: w("README.zh-CN.md 写好了，和英文版一节一节对上。", "README.zh-CN.md is written, section for section with the English one."), evidence: [] });
  seed.tasks.setState("t_readme", "done", "parked");
  diffs.set("t_readme", { commits: 1, uncommitted: false, files: 1, adds: 120, dels: 0 });

  // ---- errands ----
  await open("t_hotel", w("订 12 月 6 号京都的酒店，两晚，岚山附近", "Book a hotel in Kyoto for Dec 6, two nights, near Arashiyama"), "", { kind: "none" }, "claude-code", "sonnet");
  say("t_hotel", w("Booking 上岚山附近两晚有 11 家，在比早餐和退订条件。", "Eleven places near Arashiyama on Booking; comparing breakfast and cancellation."));
  tool("t_hotel", "mcp__browser__navigate", { url: "https://www.booking.com/searchresults.html?ss=Arashiyama" }, "navigated");

  await open("t_movers", w("比较三家搬家公司的报价", "Compare three movers' quotes"), "", { kind: "none" }, "claude-code", "sonnet");
  report("t_movers", { state: "done", summary: w("日通最便宜，¥86,000，含打包；另外两家贵两到三成。", "Nippon Express is cheapest at ¥86,000 with packing; the other two are 20–30% more."), evidence: [] });
  seed.tasks.setState("t_movers", "done", "parked");

  await open("t_receipts", w("把 10 月的发票整理成表", "Put October's receipts in a spreadsheet"), w("发票", "Receipts"), { kind: "folder", device: "local", path: "/Users/weyl/Documents/Receipts" } as Place, "claude-code", "sonnet");
  report("t_receipts", { state: "done", summary: w("23 张发票整理进了 2026-10.xlsx，合计 ¥48,320。", "23 receipts are in 2026-10.xlsx, ¥48,320 in all."), evidence: [] });
  seed.tasks.setState("t_receipts", "done", "parked");

  log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_mail", reason: w("Namecheap 的续费邮件到了", "Namecheap's renewal email arrives"), state: "armed", kind: "judge", event: { connection: "OOMOL", service: "gmail", trigger: "gmail.on_message_received", contains: "namecheap" }, judge: "Is this the renewal reminder?", everyMs: 5 * 60_000, until: iso(20 * 86400_000) } });

  // ---- many ----
  const projects = ["ducter", "hawdb", "mem"];
  for (let i = 0; i < many; i++) {
    const id = `t_m${i}`;
    const p = projects[i % 3]!;
    await open(id, w(`第 ${i + 1} 件：整理 ${p} 的 issue #${300 + i}`, `No. ${i + 1}: triage ${p} issue #${300 + i}`), p, repo(p, `issue-${300 + i}`), i % 2 ? "codex" : "claude-code", i % 2 ? "gpt-5.5" : "sonnet");
    tool(id, "Bash", { command: `gh issue view ${300 + i}` }, "ok");
    if (i % 4 === 1) report(id, { state: "done", summary: w(`#${300 + i} 是重复的，关掉了。`, `#${300 + i} was a duplicate; closed it.`), evidence: [] }), seed.tasks.setState(id, "done", "parked");
    diffs.set(id, { commits: 1, uncommitted: false, files: 1 + (i % 4), adds: 3 + ((i * 7) % 90), dels: (i * 3) % 20 });
  }

  // ---- calls ----
  const r = await seed.connections.add({ url: tuwa.url, token: JSON.stringify({ accessToken: tuwa.access(), refreshToken: tuwa.refresh(), expires_in: 3600 }) });
  if (r.ok) {
    await Bun.sleep(200);
    const conn = seed.connections.view()[0]!.id;
    const plan = (name: string, to: string, goal: string, extra: Partial<CallBody["plan"]> = {}): CallBody["plan"] => ({ to, name, goal, say: ["Weyl"], mustNot: [], voice: "ducter", from: "provider", provider: "Tuwa", minutes: 4, costUsd: 1.6, perMinUsd: 0.4, calleeZone: "Asia/Tokyo", ...extra });
    const call = (b: CallBody & { ref?: unknown }) => log.append({ stream: "channel", origin: "system", kind: "phone_call", body: b as CallBody });
    tuwa.tasks.set("T90", { taskId: "T90", args: {}, status: "executing", questions: [], replies: [], durationSec: 74 });
    call({ callId: "call_live", connectionId: conn, state: "talking", plan: plan(w("青山牙科", "Aoyama Dental"), "+81352345678", w("把下周的洗牙改到周四以后", "Move next week's cleaning to Thursday or later")), placedAt: iso(-90_000), talkingSince: iso(-74_000), ref: { call: "T90" } });
    call({ callId: "call_done", connectionId: conn, state: "done", plan: plan("Le Petit Bistro", "+14155550123", w("问周六能不能带狗坐外面", "Ask if dogs are fine on the patio on Saturday"), { calleeZone: "America/Los_Angeles" }), placedAt: iso(-40 * 60_000), endedAt: iso(-37 * 60_000), outcome: w("可以，周六外面的座位能带狗，不用预约。", "Yes: dogs are welcome on the patio on Saturday, no booking needed."), durationSec: 172, costUsd: 0.9 });
  }
}
await Bun.sleep(200);
await seed.stop();

// Serve from a second core over the same Log, as after a restart: its cards come from the Log.
const core = startCore({ dataDir, persona, push: false, ooSource, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(runnerOf(core));
core.setPartner({ onTrigger() {} });
// A phone or an emulator pairs with this link (the Android debug build: --es pairLink '…', with
// 10.0.2.2 for 127.0.0.1 on an emulator; the iPhone simulator: -pairLink '…').
const pair = await core.devicesView.pairCode();
console.log(`[demo] pair: http://127.0.0.1:${core.port}/pair#c=${pair.code}`);
console.log(`[demo] On hand demo (${few ? "one errand" : `${many} more`}, ${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
