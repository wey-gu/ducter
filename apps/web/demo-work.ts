// A demo core for work over time (D112–D115): a PR wait on a real check runner (with scripted
// command output), a keep-going loop two tries in, an email wait, a weekly-report routine that is
// on, a nightly watch Ducter paused, and a fresh routine proposal in the conversation.
//   DUCTER_PORT=7980 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-work.ts
// DEMO_FIRE_MS: after this long the PR's checks turn green and the wait comes true (default off).
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
let green = false;
let ciLooks = 0;
const checks = (s: string[]) => JSON.stringify(s.map((state, i) => ({ name: `job${i}`, state })));
const verdicts = [
  // The typo loop: the report counts the work, so the judge does too (the lights).
  { met: false, reason: zh ? "还剩 4 处" : "4 left", progress: "better" as const, done: 12, left: 4 },
  // The copy loop: nothing to count (Ducter at work and the latest try in words).
  { met: false, reason: zh ? "开头顺了，结尾还有点硬" : "The opening reads well; the ending is still stiff", progress: "better" as const },
];
const core = startCore({ ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  work: {
    // Scripted command output: the PR's 6 checks, 4 passed, until DEMO_FIRE_MS.
    exec: async (argv) => {
      // main's CI (gh run view): 2 of 6 checks pass after the first try, 4 after the second.
      if (argv[1] === "run") {
        const ok = [2, 4][Math.min(ciLooks++, 1)]!;
        return { exitCode: 1, stdout: checks(Array.from({ length: 6 }, (_, i) => (i < ok ? "SUCCESS" : "FAILURE"))) };
      }
      return { exitCode: green ? 0 : 8, stdout: green ? checks(Array(6).fill("SUCCESS")) : checks(["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "IN_PROGRESS", "IN_PROGRESS"]) };
    },
    minEveryMs: 1000,
    judge: async () => verdicts.shift() ?? { met: false, reason: "" },
  },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath, branch, baseBranch: "main" });
async function task(id: string, title: string, place: Place, brief: string) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "HawDB", place, harness: "claude-code", model: "opus", brief } });
  core.tasks.setState(id, "working", "hot");
  await tick();
}
const report = (id: string, r: Omit<Bodies["report"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, ...r } });
const say = (text: string, replyTo?: number) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ...(replyTo ? { replyTo } : {}) } });
const user = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });

// 1. "#1592's CI passes, tell me": a task waits on a check.
const u1 = user(zh ? "#1592 的 CI 过了告诉我，过了就合" : "Tell me when #1592's CI passes, then merge it");
await task("t_pr", zh ? "HawDB PR #1592：修 compaction 测试" : "HawDB PR #1592: fix the compaction test", repo("~/dev/hawdb", "ducter/compaction-fix"), zh ? "#1592 的 CI 全绿了就合进 main。" : "Merge #1592 once CI is green.");
const prCheck = { argv: ["gh", "pr", "checks", "1592", "--repo", "nowledge-co/hawdb", "--json", "state"], succeedWhen: { path: "[].state", equals: "SUCCESS" } };
core.work.waiters.arm({ reason: zh ? "PR #1592 通过" : "PR #1592 passes", taskId: "t_pr", check: prCheck, everyMs: 5 * 60_000, until: new Date(Date.now() + Number(process.env.DEMO_UNTIL_MIN ?? 360) * 60_000).toISOString() });
say(zh ? "好，现在 6 项里还有 2 项在跑，全绿了我就合，再告诉你。" : "Will do. Two of the six checks are still running; I'll merge when it's all green and tell you.", u1.seq);
void core.work.waiters.look(core.work.waiters.views()[0]!.waiterId);
await tick();

// 2. "Keep fixing until CI is green": two tries in, the third under way.
const u2 = user(zh ? "main 的 CI 挂了，一直修到绿" : "main's CI is red; keep fixing until it's green");
await task("t_ci", zh ? "一直修到 CI 绿：hawdb main" : "Keep fixing until CI is green: hawdb main", repo("~/dev/hawdb", "ducter/ci-green"), zh ? "把 main 的 CI 修绿。" : "Fix main's CI.");
core.work.untils.start({
  taskId: "t_ci",
  condition: zh ? "main 的 CI 全绿" : "main's CI is all green",
  check: { argv: ["gh", "run", "view", "--repo", "nowledge-co/hawdb", "--json", "jobs"], succeedWhen: { path: "[].state", equals: "SUCCESS" } },
});
say(zh ? "好，我一直修，绿了告诉你。" : "On it. I'll keep at it until it's green.", u2.seq);
report("t_ci", { state: "done", summary: zh ? "修了 3 个测试里的超时" : "Fixed the timeouts in 3 tests", questions: [], evidence: [] });
await Bun.sleep(80);
report("t_ci", { state: "done", summary: zh ? "又修了 2 个" : "Fixed 2 more", questions: [], evidence: [] });
await Bun.sleep(80);

// 2b. A goal that can't be counted: a judge reads each try (the flag and the steps).
const u2b = user(zh ? "把 docs 里的错别字一直改到干净为止" : "Keep fixing the typos in docs until they're clean");
await task("t_typo", zh ? "一直改到没有错别字：ducter docs" : "Keep fixing typos until clean: ducter docs", repo("~/dev/ducter", "ducter/typos"), zh ? "把 docs 里的错别字改干净。" : "Fix the typos in docs.");
core.work.untils.start({ taskId: "t_typo", condition: zh ? "docs 里没有错别字了" : "no typos left in docs" });
say(zh ? "好，我一直改到干净。" : "On it, until they're clean.", u2b.seq);
report("t_typo", { state: "done", summary: zh ? "改了 12 处" : "Fixed 12", questions: [], evidence: [] });
await Bun.sleep(80);

// 2c. A goal nothing can count: Ducter at work, the latest try in one line.
const u2c = user(zh ? "首页那段介绍一直改到读着顺为止" : "Keep reworking the homepage intro until it reads smoothly");
await task("t_copy", zh ? "一直改到读着顺：首页介绍" : "Keep reworking until smooth: homepage intro", repo("~/dev/ducter", "ducter/intro"), zh ? "把首页介绍改顺。" : "Make the homepage intro read smoothly.");
core.work.untils.start({ taskId: "t_copy", condition: zh ? "首页介绍读着顺" : "the homepage intro reads smoothly" });
say(zh ? "好，我一直改到顺。" : "On it, until it reads smoothly.", u2c.seq);
report("t_copy", { state: "done", summary: zh ? "重写了开头" : "Rewrote the opening", questions: [], evidence: [] });
await Bun.sleep(80);

// 3. "When the domain renewal email arrives, tell me": an event wait (OpenConnector's Gmail trigger).
const u3 = user(zh ? "域名续费的邮件到了告诉我" : "Tell me when the domain renewal email arrives");
log.append({
  stream: "channel",
  origin: "waiter",
  kind: "waiter",
  body: {
    waiterId: "w_mail",
    reason: zh ? "域名续费的邮件到了" : "The domain renewal email arrives",
    state: "armed",
    kind: "judge",
    event: { connection: "OOMOL", service: "gmail", trigger: "gmail.on_message_received", contains: "namecheap" },
    judge: "Is this the domain renewal reminder?",
    everyMs: 5 * 60_000,
    until: new Date(Date.parse("2026-12-01T00:00:00Z")).toISOString(),
  },
});
say(zh ? "好。刚看了一眼还没有，到了我告诉你。" : "Okay. Not there yet; I'll tell you when it comes.", u3.seq);

// 4. Routines: the weekly report is on; the nightly watch was paused by Ducter; a new proposal waits.
const weekly = await core.work.routines.propose({
  name: zh ? "周报" : "Weekly report",
  trigger: { kind: "time", every: "week", days: [1], time: "09:00", zone: "personal", tz: "Asia/Shanghai" },
  brief: zh ? "看上周 hawdb 和 ducter 里合了什么、开着什么、卡在哪儿，写成一页周报。" : "What you merged, left open and got stuck on in hawdb and ducter last week, as a one-page report.",
});
log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: weekly.decisionId!, option: "go", by: "user" } });
const nightly = await core.work.routines.propose({
  name: zh ? "hawdb 的 nightly 挂了就告诉我" : "Tell me when hawdb's nightly breaks",
  trigger: { kind: "condition", condition: zh ? "hawdb 的 nightly 挂了" : "hawdb's nightly broke", check: { argv: ["gh", "run", "list", "--workflow", "nightly", "--limit", "1", "--json", "conclusion"], succeedWhen: { path: "[].conclusion", equals: "failure" } }, everyMs: 3600_000 },
  brief: zh ? "看 nightly 为什么挂了，告诉我。" : "Find out why the nightly broke and tell me.",
  reports: "on_change",
});
log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: nightly.decisionId!, option: "go", by: "user" } });
core.work.routines.pause(nightly.routineId, "system", "unread"); // as if its last 3 reports went unread
const u4 = user(zh ? "每个月 1 号早上把上个月的开销整理一下" : "On the 1st of each month, sort out last month's spending");
say(zh ? "可以，这样安排：" : "Sure, like this:", u4.seq);
await core.work.routines.propose({
  name: zh ? "月度开销" : "Monthly spending",
  trigger: { kind: "time", every: "month", dayOfMonth: 1, time: "08:30", zone: "personal", tz: "Asia/Shanghai" },
  brief: zh ? "把上个月的账单和收据整理成一张表，标出比平时多的。" : "Sort last month's bills and receipts into one table and mark what was higher than usual.",
  effect: "drafts",
});

if (process.env.DEMO_FIRE_MS) setTimeout(() => {
  green = true;
  void core.work.waiters.look(core.work.waiters.views().find((w) => w.taskId === "t_pr")!.waiterId);
}, Number(process.env.DEMO_FIRE_MS));

console.log(`[demo] work over time is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
