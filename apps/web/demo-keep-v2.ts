// D519 (D511): the Keep page re-made, from the author's 0.1.35 shot: the review loop as hel wrote it (its
// timer on the channel, rounds that report to Ducter in its own words, today's rounds silent), the PR
// it keeps open, and each round's line read once by a fake cheap model. Otherwise D511's demo:
// 照看 / Looking after, built: On hand's 在照看的 with the author's real setup on hel, each a Keep
// carried over from what was there before (the migration on start): the PR babysitter (a helper, D507's
// busy shape: #11030 fixing lint, #10932 asking for /test, #10847 can merge), the review loop every 45
// minutes (a task in rounds, D498: its rounds, most of them silent, one asking for the 2 drafted
// reviews) and a consumer's fare watch every morning (a routine, made from one sentence: its receipt
// card stands in the conversation). Among his ordinary work. Never this machine's gh, oo or Mem.
//   DUCTER_PORT=7511 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
// then open /app#onhand/full, /app#keep=<id>/full (the ids are printed), or /app for the receipt.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, OwnedSeen, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const shape: string = "busy";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-d507-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const SPACE = "personal-4e742092";
// The helper as hel keeps it (helpers.json), its about in the author's words.
const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "Nowledge Mem PR Babysitter",
  about: w("做一个 Codex 的 loop agent，叫 Nowledge Mem PR babysitter，放在 Nowledge Bridge 里：我的 agent 把 PR 交给它，它修 CI 和评审意见，一直跟到能合并，再通过 Bridge 回话。", "Make a Codex loop agent called Nowledge Mem PR babysitter, in Nowledge Bridge: my agents hand it PRs, it fixes CI and review comments until each can merge, then answers over Bridge."),
  brief: "Never merge.",
  persona: "default",
  agentId: "ducter-helper-nowledge-mem-pr-babysitter",
  state: "on",
  createdAt: iso(-(shape === "idle" ? 12 * MIN : 26 * HOUR)),
  link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server", connectionId: "c-demo", spaceId: SPACE },
  mem: "ready",
  said: "ready",
};
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helper] }, null, 2));

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
// The home's checks (owned PRs, waits) never reach this machine's gh: a fake that answers nothing.
const work = { exec: async () => ({ exitCode: 1, stdout: "" }), ownedEveryMs: 3_600_000 };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock, work });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const tick = () => Bun.sleep(15);
const at = async (ms: number) => {
  await Bun.sleep(40);
  shift = ms;
};
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) =>
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: `/root/code/${name}`, branch, baseBranch: "main" });
async function open(id: string, title: string, project: string, place: Place, harness: string, model: string) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief: title } });
  seed.tasks.setState(id, "working", "hot");
  await tick();
}
const zsh = (c: string) => `/bin/zsh -lc '${c}'`;
// A PR the task owns (D483), as the home last saw it.
const owns = (id: string, pr: string, seen: Omit<OwnedSeen, "since">) => {
  log.append({ stream: `task:${id}`, origin: "task", kind: "checkpoint", body: { taskId: id, text: `${pr} open`, owns: [pr] } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "owned_news", body: { taskId: id, pr, news: [], seen: { since: iso(-30 * HOUR), ...seen } } });
};
// Handed over by his Codex through Bridge, to the helper; its claim names the task.
let n = 0;
const handed = (id: string, pr: string, ago: number) => {
  n++;
  const from = { from: "another agent", mine: true, agent: "Codex", selfNamed: true, space: SPACE, helper: helper.id };
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: `m-h${n}`, ...from, sentAt: iso(-ago), text: `https://github.com/${pr.replace("#", "/pull/")}`, linked: true } as never });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: `m-hc${n}`, to: "another agent", ...from, text: w("接下了。", "On it."), inReplyTo: `m-h${n}`, taskId: id, opId: `hc${n}`, state: "sent" } as never });
};

// ---- his own work around it ----
await at(-(2 * HOUR + 10 * MIN));
await open("t_notes", w("整理本周 mem 的发布说明", "Write this week's mem release notes"), "mem", repo("mem", "ducter/release-notes"), "claude-code", "sonnet");
tool("t_notes", "Bash", { command: "git log --oneline v0.10.121..HEAD", description: "List the commits since the last release" }, "");
await at(-(1 * HOUR + 40 * MIN));
report("t_notes", { state: "done", summary: w("发布说明写好了，按新功能、修复和文档分了三段；草稿 PR #10855。", "The release notes are written in three parts: features, fixes and docs. Draft PR #10855."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10855" }] });
seed.tasks.setState("t_notes", "done", "parked");

if (shape !== "idle") {
  // ---- #10847: finished, mergeable, waiting for his merge (or merged: shape done) ----
  await at(-(26 * HOUR));
  await open("t_10847", "graph_error_response_tests intermittently #8826", "mem", repo("mem", "ducter/graph-error-response-tests"), "codex", "gpt-6-luna");
  handed("t_10847", "nowledge-co/mem#10847", 26 * HOUR);
  tool("t_10847", "commandExecution", zsh("cargo test -p mem-graph graph_error_response -- --test-threads 1"), "test result: ok. 12 passed");
  await at(-(3 * HOUR));
  owns("t_10847", "nowledge-co/mem#10847", { head: "4b52ac6", state: shape === "done" ? "merged" : "open", standing: { at: iso(-3 * HOUR), head: "4b52ac6", approvedBy: ["hawkingrei"], checks: { total: 14, passed: 14, failed: [], pending: [] }, merge: "clean" } });
  report("t_10847", { state: "done", summary: w("#10847 能合并了：14 项检查都过了，hawkingrei 批准了。没有替你合并。", "#10847 can merge: all 14 checks pass and hawkingrei approved. I didn't merge it."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10847" }] });
  seed.tasks.setState("t_10847", "done", "parked");

  // ---- #10932: it asks him (research/217's /test) ----
  await at(-(5 * HOUR));
  await open("t_10932", w("跟进 #10932：Settings 里 Space 切换后列表不刷新", "Follow #10932: the list doesn't refresh after switching Space in Settings"), "mem", repo("mem", "fix/space-switch-refresh"), "codex", "gpt-6-luna");
  handed("t_10932", "nowledge-co/mem#10932", 5 * HOUR);
  owns("t_10932", "nowledge-co/mem#10932", { head: "91d0e2a", state: "open", standing: { at: iso(-40 * MIN), head: "91d0e2a", checks: { total: 14, passed: 12, failed: ["e2e-linux"], pending: [] }, merge: "unstable" } });
  tool("t_10932", "commandExecution", zsh("gh run view 18822 --repo nowledge-co/mem --log-failed"), "e2e-linux: runner lost connection");
  await at(-(38 * MIN));
  log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_10932", taskId: "t_10932", question: w("e2e-linux 是 runner 断线挂的，和改动无关。要我在 #10932 上评论 /test 重跑一遍吗？", "e2e-linux failed on a lost runner, not the change. Shall I comment /test on #10932 to run it again?"), goLabel: w("评论 /test", "Comment /test"), defaultOption: "hold", reversible: false } });
  seed.tasks.setState("t_10932", "needs_you", "parked");

  // ---- #11030: at work on CI ----
  await at(-(48 * MIN));
  await open("t_11030", w("跟进 #11030：自定义 provider 切到 Embedding 时只留一个模型", "Follow #11030: one clean model when a custom provider switches to Embedding"), "mem", repo("mem", "fix/embedding-one-model"), "codex", "gpt-6-luna");
  handed("t_11030", "nowledge-co/mem#11030", 48 * MIN);
  owns("t_11030", "nowledge-co/mem#11030", { head: "c7f1b09", state: "open", standing: { at: iso(-6 * MIN), head: "c7f1b09", checks: { total: 14, passed: 11, failed: ["lint"], pending: ["e2e-linux", "e2e-mac"] }, merge: "unstable" } });
  for (const [m, cmd] of [[-30, "pnpm -C nowledge-graph lint"], [-22, "sed -n 1,80p src/components/settings/embedding-model-selection.ts"], [-12, "pnpm -C nowledge-graph test embedding-model-selection"]] as const) {
    await at(m * MIN);
    tool("t_11030", "commandExecution", zsh(cmd), "");
  }
  await at(-(2 * MIN));
  say("t_11030", w("lint 挂在一个没用的 import 上，删掉了，测试过了，正在 push。", "Lint failed on an unused import; removed it, the tests pass, pushing now."));
}

// ---- the review loop: every 45 minutes since yesterday morning (D498), kept by Ducter ----
const REVIEW = w("持续评审 nowledge-co，并处理 100gle 分给你的待办", "Keep reviewing nowledge-co and handle 100gle's to-dos for you");
await at(-(26 * HOUR));
log.append({ stream: "task:t_review", origin: "partner", kind: "task_open", body: { taskId: "t_review", title: REVIEW, project: "nowledge-co", place: { kind: "none" }, harness: "codex", model: "gpt-6-luna", brief: w("每 45 分钟 review 一轮 nowledge-co 分给我的 PR，并处理 100gle 分给我的待办；评审先写成草稿，发之前问我。", "Every 45 minutes, review the nowledge-co PRs that ask for me and handle 100gle's to-dos; draft the reviews and ask me before posting.") } });
log.append({ stream: "task:t_review", origin: "system", kind: "task_loop", body: { taskId: "t_review", state: "on", reason: REVIEW, everyMs: 45 * MIN, rhythmBy: "task", since: iso(-26 * HOUR), by: "brief" } });
seed.tasks.setState("t_review", "blocked", "parked");
report("t_review", { state: "done", summary: w("第一轮：9 个请求在等你，都看过了，写了 3 份评审草稿。", "First round: 9 requests waiting for you, all read; 3 review drafts written."), evidence: [] });
// D519: as hel wrote it. The timer fires on the channel (waiters.ts); a round reports to Ducter in its
// own words, often with instructions to Ducter; since the day before yesterday its rounds have
// mostly said nothing at all, while the timer kept firing every 45 minutes.
const round = async (ago: number, text?: string, asks?: boolean) => {
  await at(-ago);
  log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_rv_${ago}`, taskId: "t_review", wakes: "task", reason: REVIEW, state: "fired", at: iso(-ago) } });
  if (asks) log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: `d_rv_${ago}`, taskId: "t_review", question: w("2 份评审写好了，发到 GitHub?", "2 reviews are drafted. Post them to GitHub?"), goLabel: w("发出去", "Post them"), defaultOption: "hold", reversible: false } });
  if (text) report("t_review", { state: "done", summary: text, evidence: [] });
};
const NOTHING = w("没有新的请求，9 个都没变。", "No new requests; all 9 unchanged.");
const GRANT = w(
  "请 Ducter 在发布端应用用户对 nowledge-co/mem#11024 的授权：100gle 已在评论里确认可以合并，按 D507 记为常设许可，无需再发确认卡。周期检查继续。",
  "Ducter: apply the user's grant on nowledge-co/mem#11024 at the release side; 100gle confirmed in a comment that it may merge, record it as a standing go per D507, no confirmation card needed. Periodic check continues.",
);
for (let i = 0; i < 12; i++) await round(25 * HOUR - i * 45 * MIN, NOTHING);
await round(16 * HOUR, GRANT);
await round(15 * HOUR, w("#10849 有新提交，复审了；其余 8 个没变。等 #11024 的 CI。", "#10849 has new commits; reviewed again. The other 8 unchanged. Waiting on #11024's CI."));
// Today: the timer every 45 minutes; most rounds said nothing to Ducter (no report at all).
for (let ago = 9 * HOUR + 12 * MIN; ago > 50 * MIN; ago -= 45 * MIN) await round(ago);
await round(37 * MIN, w("2 个有新提交已复审，7 个没变；2 份评审草稿等你看。", "2 with new commits reviewed again, 7 unchanged; 2 review drafts for you to see."), true);
// The PR its rounds keep open (100gle's to-do it took on), as the home last read it.
log.append({ stream: "task:t_review", origin: "system", kind: "owned_news", body: { taskId: "t_review", pr: "nowledge-co/mem#11024", news: [], seen: { since: iso(-20 * HOUR), head: "e41b7c2", state: "open", standing: { at: iso(-20 * MIN), title: w("发布流程：macOS 构建在 CI 里签名", "release: sign the macOS build in CI"), head: "e41b7c2", awaiting: ["100gle"], checks: { total: 14, passed: 14, failed: [], pending: [] }, merge: "blocked" } } } });
seed.tasks.setState("t_review", "needs_you", "parked");

// ---- a consumer's fare watch, every morning at 8 (a routine), made from one sentence ----
const FARE = w("12 月 20 日上海飞东京的机票", "Shanghai to Tokyo on Dec 20");
const SAID = w("帮我盯一下 12 月 20 日上海飞东京的机票，降到 2000 以下告诉我，我订了就不用看了", "Keep an eye on Shanghai to Tokyo fares for Dec 20; tell me under ¥2,000; stop once I book");
await at(-(3 * 24 * HOUR));
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: SAID } });
log.append({ stream: "routine:rt_fare", origin: "system", kind: "routine", body: { routineId: "rt_fare", name: FARE, trigger: { kind: "time", every: "day", time: "08:00", zone: "personal", tz: "Asia/Shanghai" }, triggerWords: w("每天早上 8:00", "Every day at 8:00"), brief: "Look up the cheapest Shanghai to Tokyo fare on Dec 20.", reports: "on_change", effect: "read_only", budget: { monthTokens: 2_000_000 }, state: "active", createdAt: iso(-3 * 24 * HOUR), reviewAt: iso(27 * 24 * HOUR) } });
const fares = [[3 * 24 * HOUR - 2 * MIN, 2580], [2 * 24 * HOUR + 2 * HOUR, 2460], [24 * HOUR + 2 * HOUR, 2460], [2 * HOUR, 2340]] as const;
for (const [i, [ago, fare]] of fares.entries()) {
  await at(-ago);
  const t = `t_fare${i}`;
  await open(t, w(`${FARE}的票价`, `${FARE}: the fare`), "", { kind: "none" }, "codex", "gpt-6-luna");
  log.append({ stream: "routine:rt_fare", origin: "system", kind: "routine_run", body: { routineId: "rt_fare", runId: `rf${i}`, scheduledFor: iso(-ago), state: "started", taskId: t } });
  report(t, { state: "done", summary: i === fares.length - 1 ? w(`今早 ¥${fare.toLocaleString()}，比昨天低 ¥120`, `¥${fare.toLocaleString()} this morning, ¥120 lower than yesterday`) : w(`现在 ¥${fare.toLocaleString()}，还没到 ¥2,000`, `¥${fare.toLocaleString()} now, not under ¥2,000 yet`), evidence: [] });
  seed.tasks.setState(t, "done", "parked");
  log.append({ stream: "routine:rt_fare", origin: "system", kind: "routine_run", body: { routineId: "rt_fare", runId: `rf${i}`, scheduledFor: iso(-ago), state: "done", taskId: t } });
}

// ---- his settings export, at work ----
await at(-(14 * MIN));
await open("t_prefs", w("把 Macbook Pro M3 的通用设置导出来", "Export the general settings from the Macbook Pro M3"), "dotfiles", repo("dotfiles", "ducter/general-settings"), "codex", "gpt-6-luna");
tool("t_prefs", "commandExecution", zsh("defaults read -g KeyRepeat"), "");
await at(-(1 * MIN));
say("t_prefs", w("读完了 41 项全局设置，在挑出键盘和触控板的那几项写进 defaults.sh。", "Read 41 global settings; picking out the keyboard and trackpad ones for defaults.sh."));
await at(0);

await Bun.sleep(300);
// The fare watch as the person said it (its words, its goal, when it speaks), and its receipt card
// under the partner's words in the conversation, as keep_make writes them.
await seed.stop();

// A start in between, as after an upgrade: the migration makes each a Keep; then the fare watch gets
// the person's words, its goal and when it speaks, and its receipt card, as keep_make writes them.
// A Keep's end is read once by the cheap model from the person's words (D511): here a fake answers as it would.
// D519: each round's line, read once from its report by the cheap model: here a fake answers as it would.
const LINES: [string[], string, string][] = [
  [["请 Ducter", "Ducter: apply"], "100gle 确认了 #11024 可以合，记成了常设许可，不用再问你", "100gle confirmed #11024 can merge; kept as a standing go, no need to ask you"],
  [["#10849"], "#10849 有新提交，复审过了；#11024 在等 CI", "#10849 had new commits and was reviewed again; #11024 waits on CI"],
  [["2 份评审草稿", "review drafts for you"], "复审了 2 个新提交，2 份评审写好了等你看", "Reviewed 2 new commits; 2 reviews drafted for you to see"],
  [["第一轮", "First round"], "看完了 9 个在等你的请求，写了 3 份评审草稿", "Read all 9 requests waiting for you; 3 reviews drafted"],
  [[""], "没有新的请求", "No new requests"],
];
const roundAsk = async (r: { report: string }) => {
  const hit = LINES.find(([ks]) => ks.some((k) => r.report.includes(k)))!;
  return { line: w(hit[1], hit[2]) };
};
const endAsk = async (k: { title: string }) => (/babysitter/i.test(k.title) ? { until: w("每个 PR 跟到能合并为止", "Each PR until it can merge") } : {});
const mid = startCore({ dataDir, persona, push: false, ooSource: noOo, work, keeps: { endAsk, roundAsk } });
mid.setRunner(stubRunner(mid));
mid.setPartner({ onTrigger() {} });
mid.keeps!.sync();
const fareKeep = mid.keeps!.all().find((k) => k.from.kind === "routine" && k.from.routineId === "rt_fare")!;
await mid.keeps!.change(fareKeep.keepId, { until: w("你订了这一天的票", "You book a ticket for that day"), speaks: w("降到 ¥2,000 以下", "Under ¥2,000") });
mid.log.append({ stream: `keep:${fareKeep.keepId}`, origin: "system", kind: "keep", body: { ...mid.keeps!.get(fareKeep.keepId)!, said: SAID } });
mid.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w("好，我来照看：每天早上 8 点看一次，降到 ¥2,000 以下就告诉你，你订了票就停。", "Done, I'll look after it: a look every morning at 8, a word when it's under ¥2,000, and it stops once you book."), keep: { id: fareKeep.keepId, title: FARE, when: w("每天早上 8:00", "Every day at 8:00"), speaks: w("降到 ¥2,000 以下", "Under ¥2,000"), until: w("你订了这一天的票", "You book a ticket for that day"), first: w("现在 ¥2,580，还没到 ¥2,000", "¥2,580 now, not under ¥2,000 yet"), firstEver: true } } });
await Bun.sleep(100);
const ids = mid.keeps!.all().map((k) => `${k.title}=${k.keepId}`);
await mid.stop();

// Serve from a core over the same Log, as after a restart.
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", work, keeps: { endAsk, roundAsk } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] D511 Looking after (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
for (const x of ids) console.log(`[demo] keep ${x}`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
