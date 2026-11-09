// A demo core for work over time (D112–D115): a PR wait on a real check runner (with scripted
// command output), a keep-going loop two tries in, an email wait, a weekly-report routine that is
// on, a nightly watch Ducter paused, and a fresh routine proposal in the conversation.
//   DUCTER_PORT=7980 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-work.ts
// DEMO_FIRE_MS: after this long the PR's checks turn green and the wait comes true (default off).
import { startCore, stubRunner } from "@ducter/core";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
let green = false;
const checks = (s: string[]) => JSON.stringify(s.map((state, i) => ({ name: `job${i}`, state })));
const verdicts = [
  { met: false, reason: zh ? "3 项没过" : "3 checks failing", progress: "same" as const },
  { met: false, reason: zh ? "还有 1 项没过，好些了" : "1 still failing, better", progress: "better" as const },
  { met: true, reason: zh ? "全绿" : "all green" },
];
const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  work: {
    // Scripted command output: the PR's 6 checks, 4 passed, until DEMO_FIRE_MS.
    exec: async () => ({ exitCode: green ? 0 : 8, stdout: green ? checks(Array(6).fill("SUCCESS")) : checks(["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "IN_PROGRESS", "IN_PROGRESS"]) }),
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
await task("t_pr", zh ? "HawDB PR #1592：修 compaction 测试" : "HawDB PR #1592: fix the compaction test", repo("~/dev/hawdb", "ducter/compaction-fix"), "Merge #1592 once CI is green.");
const prCheck = { argv: ["gh", "pr", "checks", "1592", "--repo", "nowledge-co/hawdb", "--json", "state"], succeedWhen: { path: "[].state", equals: "SUCCESS" } };
core.work.waiters.arm({ reason: zh ? "在等 PR #1592 通过" : "Waiting for PR #1592 to pass", taskId: "t_pr", check: prCheck, everyMs: 5 * 60_000, until: new Date(Date.now() + 6 * 3600_000).toISOString() });
say(zh ? "好，现在 6 项里还有 2 项在跑，全绿了我就合，再告诉你。" : "Will do. Two of the six checks are still running; I'll merge when it's all green and tell you.", u1.seq);
void core.work.waiters.look(core.work.waiters.views()[0]!.waiterId);
await tick();

// 2. "Keep fixing until CI is green": two tries in, the third under way.
const u2 = user(zh ? "main 的 CI 挂了，一直修到绿" : "main's CI is red; keep fixing until it's green");
await task("t_ci", zh ? "一直修到 CI 绿：hawdb main" : "Keep fixing until CI is green: hawdb main", repo("~/dev/hawdb", "ducter/ci-green"), "Fix main's CI.");
core.work.untils.start({ taskId: "t_ci", condition: zh ? "main 的 CI 全绿" : "main's CI is all green" });
say(zh ? "好，我一直修，绿了告诉你。" : "On it. I'll keep at it until it's green.", u2.seq);
report("t_ci", { state: "done", summary: zh ? "修了 3 个测试里的超时" : "Fixed the timeouts in 3 tests", questions: [], evidence: [] });
await Bun.sleep(80);
report("t_ci", { state: "done", summary: zh ? "又修了 2 个" : "Fixed 2 more", questions: [], evidence: [] });
await Bun.sleep(80);

// 3. "When the domain renewal email arrives, tell me": an event wait (OpenConnector's Gmail trigger).
const u3 = user(zh ? "域名续费的邮件到了告诉我" : "Tell me when the domain renewal email arrives");
log.append({
  stream: "channel",
  origin: "waiter",
  kind: "waiter",
  body: {
    waiterId: "w_mail",
    reason: zh ? "域名续费的邮件到了告诉你" : "Tell you when the domain renewal email arrives",
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
core.work.routines.pause(nightly.routineId, "partner", "asked");
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
