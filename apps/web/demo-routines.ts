// D426: 一直在跑的 / Ongoing with tasks in rounds that Ducter keeps (research/177). Five things that
// keep going, each in one state the card must say: the author's review loop brought back after a
// round's "done" stopped it (back), a morning fare check whose computer is asleep (late, Run now),
// a CI watch whose last three rounds failed (failing, Run now), an issue sweep out of its agent's
// allowance (late until it resets, nothing to press), and a weekly report on time (silence). The
// Log is written first as it would have been before D426 (rounds the old way), then the core
// starts on it; the person asks 「我的循环任务都怎么样了」 and the partner answers from routine_list.
// Stub runner (no model), no network.
//   DUCTER_PORT=7997 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-routines.ts
// then open http://127.0.0.1:7997/app#ongoing (or /app for the conversation).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { FakeClock } from "../../packages/core/src/clock.ts";
import { openLog } from "../../packages/core/src/log.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-routines-"));
const dataDir = process.env.DUCTER_DATA_DIR ?? join(scratch, "data");
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = Date.now();
const L = (a: string, b: string) => (zh ? a : b);
const at = (ms: number) => new Date(ms).toISOString();

// ---------- the Log before this start, in time order ----------
type Ev = Pick<LogEvent, "stream" | "origin" | "kind" | "body">;
const q: { t: number; n: number; e: Ev }[] = [];
const put = (t: number, e: Ev) => q.push({ t, n: q.length, e });
const open = (t: number, taskId: string, title: string, brief: string, harness: string, device = "local") =>
  put(t, { stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none", device }, harness, brief } });
const state = (t: number, taskId: string, attention: string, residency = "warm", reason?: string) =>
  put(t, { stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency, ...(reason ? { reason } : {}) } as never });
const report = (t: number, taskId: string, st: string, summary: string) => put(t, { stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: st, summary, questions: [], evidence: [] } as never });
const waiter = (t: number, taskId: string, id: string, reason: string, st: string, due: number, extra: object = {}) =>
  put(t, { stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: id, reason, state: st, taskId, wakes: "task", at: at(due), ...extra } as never });
/** Rounds the old way: woken by its own timer, it reports, arms the next one. Returns the last wait's id and due time. */
function rounds(taskId: string, reason: string, everyMin: number, from: number, n: number, lines: [string, string][]) {
  let prev = "";
  let due = 0;
  for (let i = 0; i < n; i++) {
    const t = from + i * everyMin * MIN;
    if (prev) waiter(t, taskId, prev, reason, "fired", t);
    state(t, taskId, "working", "hot");
    const l = lines[i % lines.length]!;
    report(t + 3 * MIN, taskId, "progress", L(l[0], l[1]));
    prev = `w_${taskId}_${i}`;
    due = t + 3 * MIN + everyMin * MIN;
    waiter(t + 3 * MIN + 1000, taskId, prev, reason, "armed", due);
    state(t + 3 * MIN + 1000, taskId, "blocked", "warm", reason);
  }
  return { id: prev, due };
}

// 1. The review loop: rounds every 45 min, then a round reports "done" and its new timer is cancelled with it (hel, 14:01).
const REVIEW = "swj3zc4w";
const reviewWhy = L("约 45 分钟后继续检查 nowledge-co 的审查请求与提及", "look at nowledge-co's review requests again in about 45 minutes");
const r0 = now - 9 * 60 * MIN;
open(r0 - MIN, REVIEW, L("看 nowledge-co 的评审请求", "Review requests on nowledge-co"), L("帮我 review nowledge-co 下请我 review 和提到我的 PR，按 nowledge-co/mem 里的 review skill 来。你大概每 45 分钟查看一轮就好，结束之前再看一次有没有新的请求。", "Review the PRs on nowledge-co that ask for my review or mention me, the way nowledge-co/mem's review skill says. Look about every 45 minutes; before you finish a round, look again for new requests."), "codex");
const rv = rounds(REVIEW, reviewWhy, 48, r0, 6, [
  ["已复审 3 个更新的 PR，待审队列仍有 10 个 PR。", "Reviewed 3 updated PRs again; 10 PRs wait in the queue."],
  ["#10622 已解除冲突，9 项检查通过，等待 Tide 重测。", "#10622 has no conflicts now; 9 checks pass, waiting on Tide."],
  ["#10473 修了 Shadow 告警和测试注册，生产 MCP 入口的资格绑定还没做。", "#10473 fixed the Shadow warning and the test registration; the production MCP entry still isn't bound."],
]);
waiter(rv.due, REVIEW, rv.id, reviewWhy, "fired", rv.due);
state(rv.due, REVIEW, "working", "hot");
report(rv.due + 3 * MIN, REVIEW, "done", L("Mem #10622 已合并并退出审查队列，#10473 重新开放审查。队列现有 9 个 PR。", "Mem #10622 merged and left the queue; #10473 is open for review again. 9 PRs in the queue."));
state(rv.due + 3 * MIN + 400, REVIEW, "done", "hot");
waiter(rv.due + 3 * MIN + 4000, REVIEW, "w_review_last", reviewWhy, "armed", rv.due + 48 * MIN);
waiter(rv.due + 3 * MIN + 8000, REVIEW, "w_review_last", reviewWhy, "cancelled", rv.due + 48 * MIN);
state(rv.due + 3 * MIN + 8000, REVIEW, "done", "warm");

// 2. The morning fare check, on the person's MacBook, asleep now: its round was due 75 min ago.
const FARE = "fare_pek";
const fareWhy = L("明早再看一次北京往返的价格", "look at the Beijing return fares again tomorrow morning");
const f0 = now - 3 * DAY - 75 * MIN;
open(f0 - MIN, FARE, L("盯北京往返机票", "Watch the Beijing return fares"), L("每天早上看一下上海到北京往返（12 月 5 日去，8 日回）的机票价格，降到 ¥2000 以下马上告诉我。", "Every morning, check the Shanghai to Beijing return fares (out Dec 5, back Dec 8) and tell me at once if they drop below ¥2,000."), "claude-code");
const fr = rounds(FARE, fareWhy, 24 * 60 - 3, f0, 3, [
  ["最低 ¥2,380（东航 MU5155 / MU5154），比昨天低 ¥120。", "Lowest ¥2,380 (China Eastern MU5155 / MU5154), ¥120 less than yesterday."],
  ["最低 ¥2,460，没变多少。", "Lowest ¥2,460, about the same."],
  ["最低 ¥2,290，还没到 ¥2,000。", "Lowest ¥2,290, not under ¥2,000 yet."],
]);
waiter(now - 75 * MIN, FARE, fr.id, fareWhy, "fired", now - 75 * MIN);
state(now - 75 * MIN, FARE, "working", "warm");

// 3. The hawdb CI watch: every 30 min; its last three rounds failed (gh can't read the repo any more).
const CI = "ci_hawdb";
const ciWhy = L("30 分钟后再看 hawdb 的 nightly", "look at hawdb's nightly again in 30 minutes");
const c0 = now - 6 * 60 * MIN;
open(c0 - MIN, CI, L("hawdb 的 nightly 挂了就告诉我", "Tell me when hawdb's nightly breaks"), L("每 30 分钟看一次 nowledge-co/hawdb 的 nightly，挂了告诉我是哪一项、为什么。", "Every 30 minutes, look at nowledge-co/hawdb's nightly; when it breaks, tell me which job and why."), "codex");
let ci = rounds(CI, ciWhy, 27, c0, 8, [["全绿。", "All green."]]);
for (let i = 0; i < 3; i++) {
  const t = ci.due;
  waiter(t, CI, ci.id, ciWhy, "fired", t);
  state(t, CI, "working", "hot");
  report(t + 2 * MIN, CI, "failed", L("读不到 nowledge-co/hawdb 的 Actions：gh 说这个仓库不存在或没有权限。", "Couldn't read nowledge-co/hawdb's Actions: gh says the repo doesn't exist or isn't readable."));
  ci = { id: `w_ci_f${i}`, due: t + 2 * MIN + 28 * MIN };
  waiter(t + 2 * MIN + 1000, CI, ci.id, ciWhy, "armed", ci.due);
  state(t + 2 * MIN + 1000, CI, "blocked", "warm", ciWhy);
}

// 4. The mem issue sweep: every 2 hours; Codex is out of its allowance for another hour and a half.
const ISSUES = "issues_mem";
const issuesWhy = L("2 小时后再看 mem 的新 issue", "look at new mem issues again in 2 hours");
const i0 = now - 8 * 60 * MIN - 10 * MIN;
open(i0 - MIN, ISSUES, L("每 2 小时看一次 mem 的新 issue", "New mem issues, every 2 hours"), L("每 2 小时看一次 nowledge-co/mem 的新 issue，分好类，要我处理的才告诉我。", "Every 2 hours, look at new issues on nowledge-co/mem, sort them, and tell me only about the ones I need to handle."), "codex");
const is = rounds(ISSUES, issuesWhy, 117, i0, 4, [
  ["2 个新 issue，都是导入 Notion 的问题，已归到 importer。", "2 new issues, both about the Notion import, filed under importer."],
  ["没有要你处理的。", "Nothing for you."],
]);
waiter(is.due, ISSUES, is.id, issuesWhy, "fired", is.due);
const limitWhy = L("等 Codex 的额度恢复", "Codex's usage limit to reset");
waiter(is.due + MIN, ISSUES, "w_issues_limit", limitWhy, "armed", now + 95 * MIN, { limit: { harness: "codex", resetsAt: at(now + 95 * MIN) } });
state(is.due + MIN, ISSUES, "blocked", "warm", limitWhy);

q.sort((a, b) => a.t - b.t || a.n - b.n);
const clock = new FakeClock(q[0]!.t);
const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default", clock });
for (const { t, e } of q) {
  clock.advance(Math.max(0, t - clock.now()));
  log.append(e as never);
}
log.close();

// ---------- the core on that Log ----------
const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
// 5. A routine on time: the weekly report, set up on the New task card (yours).
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
core.work.routines.yours({ name: L("整理上周的周报", "Last week's report"), trigger: { kind: "time", every: "week", days: [1], time: "10:00", zone: "personal", tz }, brief: L("每周一整理上周的周报", "Write last week's report every Monday"), language: zh ? "zh" : "en" });
// The keeper's start (20 s): the review loop comes back, said once; then the fare's round can't reach its computer.
await Bun.sleep(22_000);
core.work.loops.wakeFailed(FARE, "MacBook is asleep");
core.work.loops.sweep();
// The person asks; the partner answers from routine_list (as the eval's scenario expects: the one not on time first).
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: L("我的循环任务都怎么样了", "How are my loops doing?") } });
core.log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: {
    text: L(
      "hawdb 的 nightly 最近 3 轮都没做成：gh 读不到这个仓库了，可能是改了名或权限变了。盯机票的那个晚了 1 小时多，你的 MacBook 睡着了，醒了会补一轮。review 循环刚才被误停过，已经接着跑。其余都按时。",
      "hawdb's nightly watch hasn't worked for its last 3 rounds: gh can't read the repo any more, maybe it was renamed or access changed. The fare check is over an hour late because your MacBook is asleep; it catches up when it wakes. The review loop was stopped by mistake earlier and is running again. The rest are on time.",
    ),
  },
});
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#ongoing (data: ${core.dataDir})`);
