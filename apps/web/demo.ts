// A demo core for the phone client's screenshots and manual checks: real core (Log, decisions,
// living message, auth, web), stub partner and runner, seeded with work like the author's.
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo.ts
import { startCore, stubRunner, realClock } from "@ducter/core";
import { noOo } from "./demo-oo.ts";
import { demoMem, fakeNmem, notedSeed, seedConnection } from "./demo-mem.ts";
import type { Bodies, Place } from "@ducter/protocol";
import { conductEvents, loopEvents } from "@ducter/protocol/fixtures/transcript-cases.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
// The seed can log events in the past (a run that took minutes, D268), then time is real again.
let skew = 0;
const clock = { ...realClock, now: () => Date.now() + skew };
// D299: the demo reads its own scratch "this computer", never the real home's agent sessions.
const localAgents = (await import("./demo-outside.ts")).outsideAgents(zh, process.env.DEMO_PAST === "1");
// D295: a pretend Nowledge Mem (DEMO_MEM: cloud, local, ready, signin, install, none); never the machine's own.
const mem = demoMem();
const memOn = mem === "cloud" || mem === "local" || mem === "ready";
const core = startCore({
  localAgents,
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "", ...(memOn ? { mem: { agentId: "ducter", owned: true } } : {}) },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  clock,
  bridgeLink: { run: fakeNmem(mem, zh), exec: async () => ({ code: 1, out: "", err: "" }), env: { PATH: "/usr/bin:/bin", NMEM_CLI_PATH: "/nonexistent/nmem" } },
  // D332: Mem's plugin check is a pretend one too (never this machine's nmem): with DEMO_PAST the
  // person's own Claude Code has it and Codex doesn't; without, nothing is known.
  memPlugins: { inspectLocal: async () => (process.env.DEMO_PAST === "1" ? { "claude-code": { state: "installed" as const }, codex: { state: "absent" as const } } : undefined) },
  // D309: DEMO_PARTNERS=1 offers more than one partner (the preview), with a second one seeded below.
  ...(process.env.DEMO_PARTNERS === "1" ? { partners: true } : {}),
});
core.setRunner(stubRunner(core));
seedConnection(core.dataDir, mem);
if (memOn) core.settings.setMemState("connected");
// D321: forgetting and fixing on the Memory page reach the pretend Mem.
if (memOn) {
  const { demoForget, demoFix } = await import("./demo-mem.ts");
  core.settings.setForgetter(demoForget);
  core.settings.setCorrector(demoFix);
}
// A quiet partner: the seed below writes its words, so a live reply would only be noise.
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);

// What it noted over the past weeks (D295: this week / earlier on the Memory page).
if (mem !== "none") {
  for (const [i, n] of [...notedSeed(zh).entries()].reverse()) {
    skew = -n.daysAgo * 86_400_000;
    log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: n.title, memoryId: `m_week${i + 1}` } });
  }
  skew = 0;
}

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

// 4. D268: a long run through GitHub, a plan, a subagent, a 404, its next turn under way, logged
// at the pace it ran (the last step a few seconds ago).
{
  const evs = conductEvents({ zh, id: "t_conduct" });
  const t0 = Date.parse(evs[0]!.ts);
  const span = Date.parse(evs.at(-1)!.ts) - t0;
  for (const e of evs) {
    skew = Date.parse(e.ts) - t0 - span - 20_000;
    log.append({ stream: e.stream, origin: e.origin, kind: e.kind, body: e.body } as never);
    if (e.kind === "task_open") core.tasks.setState("t_conduct", "working", "hot");
  }
  skew = 0;
  await tick();
}

// 5. D271: a review loop on Codex that wakes itself every 45 minutes: 24 rounds since this
// morning (about 1,500 events), each wake → look → (now and then a review) → its next wait, its
// last turn ended a minute ago and a check with a judge armed now.
{
  const evs = loopEvents({ zh, id: "t_loop", rounds: 24, reads: 210 });
  const t0 = Date.parse(evs[0]!.ts);
  const span = Date.parse(evs.at(-1)!.ts) - t0;
  for (const e of evs) {
    skew = Date.parse(e.ts) - t0 - span - 60_000;
    log.append({ stream: e.stream, origin: e.origin, kind: e.kind, body: e.body } as never);
    if (e.kind === "task_open") core.tasks.setState("t_loop", "working", "hot");
  }
  skew = 0;
  const reason = zh ? "约45分钟后继续检查 nowledge-co 的 review 请求与提及" : "Check nowledge-co's review requests and mentions again in about 45 minutes";
  log.append({
    stream: "channel",
    origin: "task",
    kind: "waiter",
    body: {
      waiterId: "w_loop",
      taskId: "t_loop",
      reason,
      state: "armed",
      kind: "check",
      check: { argv: ["curl", "-fsSL", "https://api.github.com/search/issues?q=org:nowledge-co+review-requested:weyl+is:open"], succeedWhen: { matches: '"total_count":\\s*[1-9]' } },
      judge: zh ? "有新的 review 请求或提到我的地方吗？" : "Is there a new review request or a mention of me?",
      everyMs: 2_700_000,
    },
  } as never);
  await tick();
  // What the author saw before D279: its progress report after arming put the card back on
  // working. Now the report leaves it resting on its wait.
  log.append({ stream: "task:t_loop", origin: "task", kind: "report", body: { taskId: "t_loop", state: "progress", summary: zh ? "45 分钟后再看。" : "Looking again in 45 minutes.", questions: [], evidence: [] } } as never);
  await tick();
}

// D320: DEMO_LONG=50000 adds a review loop of that many events (the long-session fixture), to scroll and jump through.
if (process.env.DEMO_LONG) {
  const { longTask } = await import("@ducter/protocol/fixtures/longtask.ts");
  const evs = longTask(Number(process.env.DEMO_LONG), { taskId: "t_long" });
  let round = 0;
  for (const e of evs) {
    log.append({ stream: e.stream, origin: e.origin, kind: e.kind, body: e.body } as never);
    if (e.kind === "task_open") core.tasks.setState("t_long", "working", "hot");
    // D325: every fifth round reports what it found, as a real review loop does (the locator lists it).
    const b = e.body as { role?: string; text?: string };
    if (b.role === "assistant" && b.text?.startsWith("Round ") && ++round % 5 === 0) {
      const summary = zh ? `第 ${round} 轮：#${200 + round} 可以合了，#${201 + round} 要先 rebase` : `Round ${round}: #${200 + round} is ready to merge, #${201 + round} needs a rebase first`;
      log.append({ stream: e.stream, origin: "task", kind: "report", body: { taskId: "t_long", state: "progress", summary, questions: [], evidence: [] } } as never);
    }
  }
  await tick();
}

// D325: DEMO_STEER=1 adds a task at work with steers (one read, one not yet) and two held messages.
if (process.env.DEMO_STEER === "1") await (await import("./demo-steer.ts")).seedSteer(core as never, zh, tick);

// D297: DEMO_LIMIT=1 adds tasks resting on their agent's usage limit (three share one reset).
if (process.env.DEMO_LIMIT === "1") await (await import("./demo-limits.ts")).seedLimits(core, zh);

// D285: DEMO_PAST=1 adds ~40 earlier tasks for 做过的事 / Past tasks.
if (process.env.DEMO_PAST === "1") {
  await (await import("./demo-past.ts")).seedPast(core, zh, (ms) => (skew = ms));
  await (await import("./demo-ongoing.ts")).seedOngoing(core, zh);
  await (await import("./demo-outside.ts")).seedAdopted(core, zh);
}

// D300: DEMO_DID=1 adds a day of things Ducter did for the person (and the day before);
// DEMO_DID=empty moves them all a day back, so today is the reassuring empty day.
if (process.env.DEMO_DID) {
  const { seedDidDay } = await import("../../packages/core/test/did-day.ts");
  seedDidDay(core, { zh, setSkew: (ms) => (skew = ms), yesterday: true, ...(process.env.DEMO_DID === "empty" ? { shift: -86_400_000 } : {}) });
}

// D303: DEMO_RICH=1 ends the conversation with rich answers (a table, a chart, a checklist, then
// choices, still open), written as the partner writes them and read the way the home reads them.
if (process.env.DEMO_RICH === "1") {
  const { RICH_REPLIES } = await import("@ducter/protocol/fixtures/rich-cases.ts");
  const { parseRich } = await import("@ducter/protocol/src/rich.ts");
  const lang = zh ? "zh" : "en";
  const order = zh ? ["compare-zh", "ci-zh", "release-zh", "which-repo-zh"] : ["compare-en", "week-en", "release-en", "which-meeting-en"];
  for (const name of order) {
    const r = RICH_REPLIES.find((x) => x.name === name && x.lang === lang)!;
    const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: r.user } });
    const { text, ui } = parseRich(r.src, lang);
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ui, replyTo: u.seq } });
    await tick();
  }
}
// D304: DEMO_RECALL=1 adds the week's what-it-learned note and two replies with their 想起了 line.
if (process.env.DEMO_RECALL === "1" && memOn) (await import("./demo-mem.ts")).seedRecall(core as never, zh, (ms) => (skew = ms));

// D321: DEMO_PEER=first: the first hand-off from the terminal's Claude Code arrived a minute ago (the
// conversation explains itself once; Settings › 连上的 AI agent says it worked). Unset: nothing came yet.
if (process.env.DEMO_PEER === "first" && memOn) {
  skew = -60_000;
  const text = zh ? "把 Linux 上 CI 那个红修了：runner 的测试在 Linux 上偶发超时，只动 runner 的测试，修好回我。" : "Fix the red Linux CI: the runner tests time out now and then on Linux. Only touch the runner tests; tell me when it's fixed.";
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm_first", from: "Claude Code", agent: "Claude Code", text } });
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_peer_first", question: zh ? "开个任务修 Linux 上的 runner 测试（只动 runner 的测试）？" : "Open a task to fix the runner tests on Linux (only the runner tests)?", goLabel: zh ? "开始" : "Start", defaultOption: "hold", reversible: true } });
  skew = 0;
}

// D332: DEMO_PEER=history: a few exchanges with the terminal's agents, both ways (Settings › 和你的其他 agent 通信's 最近).
if (process.env.DEMO_PEER === "history" && memOn) {
  const at = (min: number) => (skew = -min * 60_000);
  at(190);
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm_h1", from: "Claude Code", agent: "Claude Code", text: zh ? "把 fix-ci 分支跟上 main，冲突能解就解，解不了的告诉我。" : "Bring fix-ci up to date with main; resolve what you can and tell me what you can't." } });
  at(185);
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "bm_h2", to: "Claude Code", agent: "Claude Code", inReplyTo: "bm_h1", taskId: "t_rebase", state: "sent", text: zh ? "fix-ci 跟上 main 了：两处冲突都在 CI 配置里，已经解好。" : "fix-ci is up to date with main: both conflicts were in the CI config, and they're resolved." } });
  at(42);
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "bm_h3", to: "Codex", agent: "Codex", decisionId: "d_h3", state: "sent", text: zh ? "那个 compaction 的 PR 今晚能提吗？" : "Can the compaction PR go up tonight?" } });
  at(31);
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm_h4", from: "Codex", agent: "Codex", inReplyTo: "bm_h3", text: zh ? "能。测试都过了，还差 Weizhen 看一眼。" : "Yes. The tests pass; it just needs Weizhen to take a look." } });
  skew = 0;
}

// D309: DEMO_PARTNERS=1: a second partner for home, with its own conversation and one question
// waiting there (the bar's count is one across partners; its stone carries a dot).
if (process.env.DEMO_PARTNERS === "1") {
  const home = core.partners.add({ name: zh ? "小家" : "Home", look: "sage" });
  if (home.ok) {
    const s = `channel:${home.partner.id}`;
    const m = log.append({ stream: s, origin: "user", kind: "user_msg", body: { text: zh ? "周六上午带小米去看牙，帮我约一下社区那家诊所" : "Book Mia a dentist appointment at the clinic down the road, Saturday morning" } });
    log.append({ stream: s, origin: "partner", kind: "ai_msg", body: { text: zh ? "诊所周六上午还有 9:30 和 10:45 两个号。9:30 那个离游泳课近一点。" : "The clinic has 9:30 and 10:45 open on Saturday morning. 9:30 sits closer to her swimming lesson.", replyTo: m.seq } });
    log.append({ stream: s, origin: "partner", kind: "decision", body: { decisionId: "d_home_dentist", question: zh ? "约周六 9:30 吗？" : "Book Saturday at 9:30?", goLabel: zh ? "约 9:30" : "Book 9:30", defaultOption: "hold", reversible: true } });
    // D312: the work partner's own question too: On hand lists it while the home partner is shown.
    log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_work_standup", question: zh ? "明早的站会挪到十点吗？" : "Move tomorrow's stand-up to 10?", goLabel: zh ? "挪到十点" : "Move to 10", defaultOption: "hold", reversible: true } });
    // D312: a task the home partner opened (On hand shows its stone), at work.
    const hv = core.partnerView(home.partner.id);
    hv.log.append({ stream: "task:t_home1", origin: "partner", kind: "task_open", body: { taskId: "t_home1", title: zh ? "查社区游泳馆周日的课" : "Sunday swimming lessons at the pool", project: "", place: { kind: "none" }, harness: "claude-code", brief: "Find the community pool's Sunday lessons for a seven-year-old." } });
    hv.log.append({ stream: "task:t_home1", origin: "task", kind: "report", body: { taskId: "t_home1", state: "progress", summary: zh ? "在看游泳馆的课表" : "Reading the pool's timetable", questions: [], evidence: [] } });
    await tick();
  }
}

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

// D312: DEMO_PARTNERS=1: the second partner answers in its own name, in its own conversation.
if (process.env.DEMO_PARTNERS === "1")
  core.setPartnerFactory((view) => ({
    onTrigger(e) {
      if (e.kind !== "user_msg") return;
      const since = new Date().toISOString();
      view.activity?.set({ step: "thinking", since, stepSince: since });
      setTimeout(() => {
        const text = zh ? `好，交给我。我是${view.persona.name}，家里的事我来记着：周六上午的号我先替你留意，定下来跟你说。` : `Leave it with me. I'm ${view.persona.name}, and I keep track of the home things: I'll watch Saturday morning's slots and tell you once it's set.`;
        view.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, replyTo: e.seq } });
        view.activity?.set(null);
      }, Number(process.env.DEMO_REPLY_MS ?? 1800));
    },
  }));

console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
