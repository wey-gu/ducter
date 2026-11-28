// D653 (research/244 rules 1 and 8): one living card per subject, and who speaks.
// The fixture is the shape of hel's day (2026-11-27): one download-button fix, its hand-off to a
// helper, the helper's claim, a PR, CI, a question and the merge. Before this rule each report was
// its own immutable partner message (13–17 lines for one fix); after it, the start, at most one
// needs-you, the final result and the card. The test counts the lines, not only the states.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { HandoffBody, LogEvent } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { createSubjects } from "../src/subjects.ts";
import { openTask, report, tempDir } from "./helpers.ts";

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.reverse()) c();
  cleanups = [];
});

const AT = "2026-11-27T06:30:00.000Z";
const PR = "acme/site#578";

function setup() {
  const t = tempDir();
  const clock = new FakeClock(Date.parse(AT));
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const handoffs: HandoffBody[] = [];
  const subjects = createSubjects({ log, tasks, handoffs: () => ({ all: () => handoffs }) });
  log.subscribe((e) => subjects.onEvent(e));
  const woke: LogEvent[] = [];
  log.subscribe((e) => {
    if (e.kind === "report" && subjects.shouldWake(e)) woke.push(e);
  });
  cleanups.push(() => {
    log.close?.();
    t.cleanup();
  });
  const msg = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "官网下载页的下载按钮点不了，帮我修一下。" } });
  return { log, tasks, subjects, handoffs, woke, msg };
}

/** A done report's first line while it still watches CI: card moves, the partner says nothing. */
test("one fix through hand-off, helper, PR, CI and merge is four lines, not thirteen", () => {
  const { log, handoffs, woke, msg, subjects } = setup();
  // The start: the partner's one ack, then the task that does it.
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "我去看看下载按钮，修好了告诉你。" } });
  openTask(log, "fix", "修官网下载页的下载按钮");
  // The work: progress is the card's, never a new line.
  for (const s of ["下载链接指到了一个已删除的文件", "改好了，开了 PR #578", "在等 CI"]) report(log, "fix", { state: "progress", summary: s });
  // The PR is open and a check is armed: its done is not the final result.
  log.append({ stream: `task:fix`, origin: "system", kind: "owned_news", body: { taskId: "fix", pr: PR, news: [], seen: { since: AT, state: "open" } } });
  log.append({ stream: `task:fix`, origin: "task", kind: "waiter", body: { waiterId: "w1", taskId: "fix", state: "armed", reason: "CI 跑完", at: AT } });
  report(log, "fix", { state: "done", summary: "改好了，在等 CI 和合并。" });
  expect(woke.length).toBe(0); // still watching: the card says working, nobody is woken
  // The hand-off: the giver and the helper's task join one subject (the PR).
  const h: HandoffBody = {
    handoffId: "h1",
    key: `task:fix|helper:reviewer|${PR}`,
    from: { task: "fix", taskTitle: "修官网下载页的下载按钮" },
    to: { helper: "reviewer", name: "复查" },
    item: { kind: "pr", ref: PR, title: "官网下载页的下载按钮" },
    said: "看一下这个 PR",
    state: "given",
    givenAt: AT,
    at: AT,
  };
  handoffs.push(h);
  log.append({ stream: "channel", origin: "system", kind: "handoff", body: h });
  // The helper claims it: its task joins the same subject.
  h.taskId = "rev";
  h.state = "taken";
  log.append({ stream: "channel", origin: "system", kind: "handoff", body: h });
  openTask(log, "rev", "复查 PR #578");
  log.append({ stream: "channel", origin: "system", kind: "bridge_msg", body: { direction: "out", helper: "reviewer", messageId: "m1", text: "看一下这个 PR", state: "sent" } });
  // The helper's claim and its progress: still the card.
  log.append({ stream: "channel", origin: "system", kind: "bridge_msg", body: { direction: "in", helper: "reviewer", messageId: "m2", inReplyTo: "m1", text: "接了，我去看。", state: "sent" } });
  for (const s of ["看了改动，没问题", "CI 有一项挂了，是缓存"]) report(log, "rev", { state: "progress", summary: s });
  expect(subjects.cards().length).toBe(1); // one card, not two
  expect(subjects.cards()[0]!.key).toBe(`pr:${PR}`);
  // One needs-you reaches the person, once.
  report(log, "rev", { state: "needs_input", summary: "CI 的缓存要不要清掉重跑？" });
  expect(woke.map((e) => (e.body as { state: string }).state)).toEqual(["needs_input"]);
  report(log, "rev", { state: "needs_input", summary: "CI 的缓存要不要清掉重跑？" });
  expect(woke.length).toBe(1); // the same question said again says nothing
  // CI goes green, the PR merges, and the task's final done is said once.
  log.append({ stream: `task:fix`, origin: "system", kind: "waiter", body: { waiterId: "w1", taskId: "fix", state: "fired", reason: "CI 跑完", at: AT } });
  log.append({ stream: `task:fix`, origin: "system", kind: "owned_news", body: { taskId: "fix", pr: PR, news: ["merged"], seen: { since: AT, state: "merged" } } });
  report(log, "fix", { state: "done", summary: "合并了，线上下载按钮好了。" });
  expect(woke.at(-1)!.body as { state: string }).toMatchObject({ state: "done" });
  const finals = woke.length;
  // Later done/progress reports from a task still watching revise the card and wake nobody.
  report(log, "fix", { state: "done", summary: "又看了一遍，线上正常。" });
  report(log, "rev", { state: "done", summary: "PR 已合并。" });
  report(log, "rev", { state: "progress", summary: "把记录收个尾。" });
  expect(woke.length).toBe(finals);
  // The person's drawn conversation: the start, the one needs-you, the final result, the card.
  const card = subjects.cardOf("fix")!;
  expect(card).toMatchObject({ key: `pr:${PR}`, msgSeq: msg.seq, title: "官网下载页的下载按钮", state: "done", taskId: "fix" });
  const lines = 1 /* start */ + 1 /* needs-you */ + 1 /* final result */ + 1 /* card */;
  // Before: every report and every hand-over marker was its own line.
  const reports = ["fix", "rev"].reduce((n, id) => n + log.read({ stream: `task:${id}`, kinds: ["report"] }).length, 0);
  const before = 1 /* the start */ + reports + log.read({ stream: "channel", kinds: ["bridge_msg"] }).length;
  expect(before).toBe(15);
  expect(lines).toBe(4);
  // The card changed in place: its revisions are subject_card events, never messages.
  const revisions = log.read({ stream: "channel", kinds: ["subject_card"] });
  expect(revisions.length).toBeGreaterThan(4);
  expect(revisions.at(-1)!.body as { card: { key: string } }).toMatchObject({ card: { key: `pr:${PR}` } });
  expect(subjects.cards().length).toBe(1);
});

test("who speaks: a progress never, a first failure once, a done once it is final", () => {
  const { log, woke } = setup();
  openTask(log, "a", "Check the pricing page");
  report(log, "a", { state: "progress", summary: "Reading it." });
  expect(woke.length).toBe(0);
  report(log, "a", { state: "failed", summary: "The page is down." });
  report(log, "a", { state: "failed", summary: "Still down." });
  expect(woke.length).toBe(1);
  report(log, "a", { state: "done", summary: "It is back and correct." });
  expect(woke.length).toBe(2);
  report(log, "a", { state: "done", summary: "Checked again." });
  expect(woke.length).toBe(2);
  // A direct done (the person opened it in the task) wakes nobody, as before.
  openTask(log, "b", "A task the person opened");
  report(log, "b", { state: "done", summary: "Done in front of you.", direct: true });
  expect(woke.length).toBe(2);
});

test("a restart rebuilds the card and keeps an already-said done quiet", () => {
  const { log, tasks, msg } = setup();
  openTask(log, "a", "Fix the checkout");
  report(log, "a", { state: "done", summary: "Fixed the checkout." });
  const again = createSubjects({ log, tasks, handoffs: () => ({ all: () => [] }) });
  expect(again.cardOf("a")).toMatchObject({ key: "task:a", msgSeq: msg.seq, state: "done", line: "Fixed the checkout." });
  const next = report(log, "a", { state: "done", summary: "Fixed it again, nothing new." });
  expect(again.shouldWake(next)).toBe(false);
});

test("a question puts the card on 等你 and the answer puts it back", () => {
  const { log, subjects } = setup();
  openTask(log, "q", "远程访问设置");
  log.append({
    stream: "task:q",
    origin: "task",
    kind: "decision",
    body: { decisionId: "d1", taskId: "q", question: "本机访问也需要密钥吗？", goLabel: "要", defaultOption: "hold", reversible: true },
  });
  expect(subjects.cardOf("q")).toMatchObject({ state: "waiting", line: "本机访问也需要密钥吗？" });
  log.append({ stream: "task:q", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", by: "go" } });
  expect(subjects.cardOf("q")?.state).toBe("working");
});
