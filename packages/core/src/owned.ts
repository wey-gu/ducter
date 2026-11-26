// D483: what a task owns outside wakes it. On hel (2026-11-22) task b7gw6r2e opened PR
// nowledge-co/mem#10932, rested on a broken look, and slept 6 h through a review comment (19:07),
// its CI's end (18:55) and another task's line about the PR's failure (20:09): nothing about its
// own PR reached it until the person wrote. A task now declares what it owns (checkpoint `owns`, a
// structured fact it fills: "owner/repo#123"), and Ducter watches each one for it:
//
//   - new comments (the conversation, on the code, a review), with who wrote them;
//   - CI ending on the PR's head (check runs and commit statuses), with what failed;
//   - the head moving (a push that isn't one of the task's own checkpointed commits);
//   - the PR merged or closed (then the watch ends);
//   - another task's report whose evidence names the same PR (its identity, parsed; never words).
//
// Each look is a few read-only `gh api … --jq` calls through the check runner, where the task works
// (its gh). What is new is sent to the task as one message, with the facts; the task judges what it
// means. News waits while the task is in a turn and goes with its next look. What was delivered is
// logged (`owned_news` on the task's stream), so a restart neither repeats nor loses it.
import type { Bodies, CheckSpec, LogEvent, OwnedSeen, OwnedStanding } from "@ducter/protocol";
export type { OwnedSeen, OwnedStanding };
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import type { CheckResult } from "@ducter/protocol/src/checks-run.ts";
import { realClock, type Clock } from "./clock.ts";
import type { CoreRegistry } from "./registry.ts";
import { langOfText } from "./lang.ts";
import { words } from "@ducter/protocol";
import { prIdentity } from "@ducter/protocol/src/owned.ts";
import { prSaid } from "@ducter/protocol/src/pr-state.ts";

/** How often a task's owned PRs are looked at. */
export const OWNED_EVERY_MS = 5 * 60_000;
/** D496: the first look at a PR just declared. */
const FIRST_LOOK_MS = 30_000;
/** D496: the next look when news waited for a turn to end. */
const HELD_LOOK_MS = 60_000;
const OUTPUT_MAX = 512 * 1024;
const SEEN_IDS = 300;
const GONE = new Set(["dropped", "superseded"]);

export { prIdentity };

export interface Owned {
  /** Each task's owned PRs, for the partner's [live] line. */
  of(taskId: string): string[];
  all(): { taskId: string; refs: string[]; said?: Record<string, string> }[];
  /** D496: where each of a task's open PRs stands at the last look, in its words ("" when nothing is known). */
  standing(taskId: string): string;
  /** One look at every owned PR now (tests; the timer otherwise). */
  sweep(): Promise<void>;
  stop(): void;
}

type Check = (spec: CheckSpec, w: { taskId?: string }, outputMax?: number) => Promise<CheckResult>;

const W = {
  zh: {
    head: "你的 PR {pr} 有消息（Ducter 替你盯着的）：",
    comment: "- {by} 在 {at} 留言{where}：{text}",
    review: "- {by} 在 {at} 提交了评审（{state}）：{text}",
    ci: "- CI 在 {head} 上跑完了：{counts}{failed}",
    push: "- PR 的 head 变成了 {head}（不是你 checkpoint 过的提交）",
    merged: "- PR 已合并。之后不再替你盯它。",
    closed: "- PR 被关掉了（没合并）。之后不再替你盯它。",
    other: "- 另一个任务「{title}」({id}) 的汇报提到了它：{text}",
    tail: "这些是事实，由你判断要不要处理、怎么处理；处理完照常 report_to_main 或继续等。",
    // D496: where it stands, with every piece of news and every wake: a request from before counts.
    stands: "它现在的状态（{at} 看的）：",
    change: "- {by} 在 {at} 请求修改{on}，还没撤回：{text}",
    changeOn: "（针对 {sha}{later}）",
    changeLater: "，之后 head 又变过",
    changeNew: "- {by} 在 {at} 请求修改{on}：{text}",
    changeAbove: "- {by} 上面那条修改请求还没撤回",
    approved: "- 已批准：{names}",
    awaiting: "- 在等 {names} 评审",
    checks: "- {head} 上的检查：{counts}{failed}{pending}",
    pending: "，还在等：{names}",
    dirty: "- 和目标分支有冲突，现在合并不了",
    behind: "- 落后于目标分支",
    draft: "- 还是草稿",
    changeRule: "有人请求修改、还没撤回时，GitHub 不算它通过评审，等它合并就等不来。回应这些请求是这个 PR 的一部分，在你的任务范围内由你判断怎么做；做完照常 report_to_main。",
    failNew: "- {head} 上有检查没过：{names}",
    counts: "{total} 项里 {ok} 项通过",
    failed: "，没过：{names}",
    sep: "、",
  },
  en: {
    head: "News on your PR {pr} (Ducter watches it for you):",
    comment: "- {by} commented at {at}{where}: {text}",
    review: "- {by} submitted a review ({state}) at {at}: {text}",
    ci: "- CI finished on {head}: {counts}{failed}",
    push: "- the PR's head moved to {head} (not a commit you checkpointed)",
    merged: "- the PR was merged. Ducter stops watching it.",
    closed: "- the PR was closed without merging. Ducter stops watching it.",
    other: '- another task, "{title}" ({id}), reported about it: {text}',
    tail: "These are facts; you judge whether and how to act on them, then report_to_main as usual or wait again.",
    stands: "Where it stands (looked at {at}):",
    change: "- {by} requested changes at {at}{on}, still standing: {text}",
    changeOn: " (on {sha}{later})",
    changeLater: "; the head has moved since",
    changeNew: "- {by} requested changes at {at}{on}: {text}",
    changeAbove: "- {by}'s request for changes above still stands",
    approved: "- approved by {names}",
    awaiting: "- waiting for a review from {names}",
    checks: "- checks on {head}: {counts}{failed}{pending}",
    pending: "; still pending: {names}",
    dirty: "- it conflicts with its base branch and can't merge now",
    behind: "- it is behind its base branch",
    draft: "- it is still a draft",
    changeRule: "While a request for changes stands, GitHub doesn't count the PR as approved, so a wait for its merge can't come true. Answering these requests is part of this PR, within your brief: you judge how; then report_to_main as usual.",
    failNew: "- a check failed on {head}: {names}",
    counts: "{ok} of {total} passed",
    failed: "; failed: {names}",
    sep: ", ",
  },
};
/** D496: where a PR stands, as short English facts for the partner's [live] line. */
export function saidOf(st: OwnedStanding, told: readonly string[] = []): string {
  const out: string[] = [];
  for (const x of st.changes ?? []) out.push(`changes requested by ${x.by} ${x.at.slice(0, 16).replace("T", " ")}${st.head && x.on && x.on !== st.head ? " (before its latest push)" : ""}, ${told.includes(`r:${x.id}`) ? "told to the task" : "the task hears it when its turn ends"}`);
  if (st.approvedBy?.length) out.push(`approved by ${st.approvedBy.join(", ")}`);
  else if (!st.changes?.length) out.push("no approval yet");
  if (st.checks) out.push(`checks ${st.checks.passed}/${st.checks.total} passed${st.checks.failed.length ? `, failed: ${st.checks.failed.slice(0, 4).join(", ")}` : ""}${st.checks.pending.length ? `, pending: ${st.checks.pending.slice(0, 4).join(", ")}` : ""}`);
  if (st.merge === "dirty") out.push("conflicts with its base");
  if (st.draft) out.push("draft");
  return out.join("; ");
}
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const one = (s: unknown, n = 400) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};

interface Item { id?: number | string; by?: string; at?: string; text?: string; path?: string; line?: number; state?: string; on?: string }

export function createOwned(o: { log: LogStore; tasks: CoreRegistry; runner: () => Runner | undefined; check: Check; clock?: Clock; everyMs?: number }): Owned {
  const { log, tasks } = o;
  const clock = o.clock ?? realClock;
  const owns = new Map<string, Map<string, OwnedSeen>>(); // taskId -> pr -> what was told
  const gitRefs = new Map<string, Set<string>>(); // taskId -> its own checkpointed commits
  const pending = new Map<string, Map<string, string[]>>(); // taskId -> pr -> other tasks' lines not yet told
  let stopped = false;
  let running: Promise<void> | undefined;
  const wordsOf = (taskId: string) => words(W, langOfText(tasks.get(taskId)?.title));

  let fresh = false;
  const declare = (taskId: string, refs: string[] | undefined, at: string, from?: OwnedSeen["from"]) => {
    for (const r of refs ?? []) {
      const pr = prIdentity(r);
      if (!pr) continue;
      const m = owns.get(taskId) ?? new Map<string, OwnedSeen>();
      if (!m.has(pr)) {
        m.set(pr, { since: at, ...(from ? { from } : {}) });
        fresh = true;
      }
      owns.set(taskId, m);
    }
  };
  // D508: a PR the task didn't declare is still its own when its done report names it (a task that
  // opened a PR and said so; checked against the task's branch at the first look, since a report
  // may name a PR it only read) or when Ducter opened it as the task's draft PR (D216).
  const adopt = (e: LogEvent) => {
    if (e.kind === "report") {
      const r = e.body as Bodies["report"];
      if (r.state !== "done" || tasks.get(r.taskId)?.place.kind !== "repo") return;
      declare(r.taskId, (r.evidence ?? []).map((x) => x.ref).filter((x) => !!prIdentity(x)), e.ts, "report");
    } else if (e.kind === "job_status") {
      const b = e.body as Bodies["job_status"];
      if (b.taskId && b.act === "open_pr" && b.state === "done" && b.ref) declare(b.taskId, [b.ref], e.ts, "integrate");
    }
  };
  const noteRef = (taskId: string, ref: string | undefined) => {
    const r = String(ref ?? "").trim().toLowerCase();
    if (r.length < 7 || !/^[0-9a-f]+$/.test(r)) return;
    const s = gitRefs.get(taskId) ?? new Set<string>();
    s.add(r);
    gitRefs.set(taskId, s);
  };
  const ownCommit = (taskId: string, sha: string) => [...(gitRefs.get(taskId) ?? [])].some((r) => sha.toLowerCase().startsWith(r) || r.startsWith(sha.toLowerCase()));

  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["checkpoint", "owned_news", "report", "job_status"] })) {
    if (e.kind === "report" || e.kind === "job_status") adopt(e);
    else if (e.kind === "checkpoint") {
      const b = e.body as Bodies["checkpoint"];
      declare(b.taskId, b.owns, e.ts);
      noteRef(b.taskId, b.gitRef);
    } else {
      const b = e.body as Bodies["owned_news"];
      const m = owns.get(b.taskId);
      if (m?.has(b.pr)) m.set(b.pr, b.seen);
    }
  }

  const call = async (taskId: string, argv: string[]): Promise<unknown> => {
    const r = await o.check({ argv, succeedWhen: { exitCode: 0 } }, { taskId }, OUTPUT_MAX);
    if (!r.ok || r.exitCode !== 0) throw new Error(r.error ?? r.summary);
    return JSON.parse(r.output ?? "");
  };

  /** One look at one PR: the news since what was told, where it stands now, and what is told after it. */
  async function lookAt(taskId: string, pr: string, seen: OwnedSeen): Promise<{ lines: string[]; next: OwnedSeen }> {
    const [repo, n] = pr.split("#") as [string, string];
    const w = wordsOf(taskId);
    const lines: string[] = [];
    const next: OwnedSeen = { ...seen, ids: [...(seen.ids ?? [])] };
    const head = (await call(taskId, ["gh", "api", `repos/${repo}/pulls/${n}`, "--jq", "{head: .head.sha, ref: .head.ref, title: .title, state: .state, merged: .merged, draft: .draft, merge: .mergeable_state, awaiting: [.requested_reviewers[]?.login]}"])) as { head?: string; ref?: string; title?: string; state?: string; merged?: boolean; draft?: boolean; merge?: string; awaiting?: string[] };
    // D508: a PR its report named is its own only when it was made from the task's branch.
    const place = tasks.get(taskId)?.place;
    const branch = place?.kind === "repo" ? place.branch : undefined;
    if (seen.from === "report" && !seen.head && head?.ref && branch && head.ref !== branch) return { lines: [], next: { since: seen.since, from: "report", state: "not_ours" } };
    const since = new Date(Date.parse(seen.since)).toISOString().slice(0, 19) + "Z";
    const told = new Set(next.ids);
    const mark = (id: string) => {
      if (told.has(id)) return false;
      told.add(id);
      next.ids!.push(id);
      return true;
    };
    const fresh = (x: Item, kind: string) => !!x.at && x.at >= since && mark(`${kind}:${x.id}`);
    const comments = (await call(taskId, ["gh", "api", `repos/${repo}/issues/${n}/comments?since=${since}&per_page=100`, "--jq", "[.[] | {id, by: .user.login, at: .created_at, text: .body[0:600]}]"])) as Item[];
    const notes = (await call(taskId, ["gh", "api", `repos/${repo}/pulls/${n}/comments?since=${since}&per_page=100`, "--jq", "[.[] | {id, by: .user.login, at: .created_at, path, line, text: .body[0:600]}]"])) as Item[];
    const reviews = (await call(taskId, ["gh", "api", `repos/${repo}/pulls/${n}/reviews?per_page=100`, "--jq", "[.[] | {id, by: .user.login, at: .submitted_at, state, on: .commit_id, text: .body[0:600]}]"])) as Item[];
    const sha = String(head?.head ?? "");
    // D496: each reviewer's latest decisive review, whenever it was written. A request for changes
    // that still stands is told once, even when it came before the task declared the PR (hel,
    // 2026-11-23: a request from 03:17 the day before was never told, and the task waited a day for
    // a merge it alone could unblock).
    const decisive = new Map<string, Item>();
    for (const x of [...(reviews ?? [])].sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")))) {
      if (x.by && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(String(x.state))) decisive.set(x.by, x);
    }
    const changes = [...decisive.values()].filter((x) => x.state === "CHANGES_REQUESTED");
    const onOf = (x: Item) => (x.on ? fill(w.changeOn, { sha: String(x.on).slice(0, 10), later: sha && x.on !== sha ? w.changeLater : "" }) : "");
    for (const x of comments ?? []) if (fresh(x, "c")) lines.push(fill(w.comment, { by: one(x.by, 40), at: one(x.at, 25), where: "", text: one(x.text) }));
    for (const x of notes ?? []) if (fresh(x, "n")) lines.push(fill(w.comment, { by: one(x.by, 40), at: one(x.at, 25), where: x.path ? ` (${one(x.path, 120)}${x.line ? `:${x.line}` : ""})` : "", text: one(x.text) }));
    for (const x of reviews ?? []) {
      if (changes.includes(x)) {
        if (mark(`r:${x.id}`)) lines.push(fill(w.changeNew, { by: one(x.by, 40), at: one(x.at, 25), on: onOf(x), text: one(x.text) || "-" }));
      } else if (fresh(x, "r")) lines.push(fill(w.review, { by: one(x.by, 40), at: one(x.at, 25), state: one(x.state, 30), text: one(x.text) || "-" }));
    }
    if (next.ids!.length > SEEN_IDS) next.ids = next.ids!.slice(-SEEN_IDS);
    if (sha && seen.head && sha !== seen.head && !ownCommit(taskId, sha)) lines.push(fill(w.push, { head: sha.slice(0, 10) }));
    if (sha && sha !== seen.head) next.failedTold = [];
    if (sha) next.head = sha;
    let checks = seen.standing?.head === sha ? seen.standing?.checks : undefined;
    if (sha && next.ciFor !== sha) {
      const runs = ((await call(taskId, ["gh", "api", `repos/${repo}/commits/${sha}/check-runs?per_page=100`, "--jq", "[.check_runs[] | {name, status, conclusion}]"])) as { name?: string; status?: string; conclusion?: string }[]) ?? [];
      const st = (await call(taskId, ["gh", "api", `repos/${repo}/commits/${sha}/status`, "--jq", '{state, n: (.statuses | length), failed: [.statuses[] | select(.state == "failure" or .state == "error") | .context], pending: [.statuses[] | select(.state == "pending") | .context]}'])) as { state?: string; n?: number; failed?: string[]; pending?: string[] };
      const statuses = Number(st?.n ?? 0);
      const bad = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);
      const failed = [...runs.filter((r) => bad.has(String(r.conclusion))).map((r) => String(r.name)), ...(st?.failed ?? [])];
      const waiting = [...runs.filter((r) => r.status !== "completed").map((r) => String(r.name)), ...(st?.pending ?? [])];
      const total = runs.length + statuses;
      if (total) checks = { total, passed: Math.max(0, total - failed.length - waiting.length), failed, pending: waiting };
      const runsDone = runs.every((r) => r.status === "completed");
      const statusDone = !statuses || st?.state !== "pending";
      if (total > 0 && runsDone && statusDone) {
        const counts = fill(w.counts, { total: String(total), ok: String(total - failed.length) });
        lines.push(fill(w.ci, { head: sha.slice(0, 10), counts, failed: failed.length ? fill(w.failed, { names: failed.slice(0, 8).join(w.sep) }) : "" }));
        next.ciFor = sha;
      } else {
        // D496: a check that failed is news before the others end (a merge bot's status can wait
        // on an approval and never end by itself).
        const newly = failed.filter((f) => !(next.failedTold ?? []).includes(f));
        if (newly.length) {
          lines.push(fill(w.failNew, { head: sha.slice(0, 10), names: newly.slice(0, 8).join(w.sep) }));
          next.failedTold = [...(next.failedTold ?? []), ...newly].slice(-40);
        }
      }
    }
    const state = head?.merged ? "merged" : head?.state === "closed" ? "closed" : "open";
    if (state !== "open" && seen.state !== state) lines.push(state === "merged" ? w.merged : w.closed);
    next.state = state;
    const approvedBy = [...decisive.values()].filter((x) => x.state === "APPROVED").map((x) => one(x.by, 40));
    next.standing = {
      at: new Date(clock.now()).toISOString(),
      ...(head?.title ? { title: one(head.title, 200) } : seen.standing?.title ? { title: seen.standing.title } : {}),
      ...(sha ? { head: sha } : {}),
      ...(head?.draft ? { draft: true } : {}),
      ...(changes.length ? { changes: changes.map((x) => ({ id: String(x.id), by: one(x.by, 40), at: one(x.at, 25), ...(x.on ? { on: String(x.on) } : {}), text: one(x.text) })) } : {}),
      ...(approvedBy.length ? { approvedBy } : {}),
      ...(head?.awaiting?.length ? { awaiting: head.awaiting.map((x) => one(x, 40)).slice(0, 8) } : {}),
      ...(checks ? { checks } : {}),
      ...(head?.merge ? { merge: String(head.merge) } : {}),
    };
    return { lines, next };
  }

  /** D496: where a PR stands, in the task's words, told with every piece of news and every wake. */
  const standingText = (taskId: string, st: OwnedStanding | undefined, above = new Set<string>()): string => {
    if (!st) return "";
    const w = wordsOf(taskId);
    const out: string[] = [];
    for (const x of st.changes ?? []) out.push(above.has(`r:${x.id}`) ? fill(w.changeAbove, { by: x.by }) : fill(w.change, { by: x.by, at: x.at, on: x.on ? fill(w.changeOn, { sha: x.on.slice(0, 10), later: st.head && x.on !== st.head ? w.changeLater : "" }) : "", text: x.text || "-" }));
    if (st.approvedBy?.length) out.push(fill(w.approved, { names: st.approvedBy.join(w.sep) }));
    if (st.awaiting?.length) out.push(fill(w.awaiting, { names: st.awaiting.join(w.sep) }));
    if (st.checks) {
      const c = st.checks;
      out.push(fill(w.checks, { head: (st.head ?? "").slice(0, 10), counts: fill(w.counts, { total: String(c.total), ok: String(c.passed) }), failed: c.failed.length ? fill(w.failed, { names: c.failed.slice(0, 8).join(w.sep) }) : "", pending: c.pending.length ? fill(w.pending, { names: c.pending.slice(0, 8).join(w.sep) }) : "" }));
    }
    if (st.merge === "dirty") out.push(w.dirty);
    else if (st.merge === "behind") out.push(w.behind);
    if (st.draft) out.push(w.draft);
    if (!out.length) return "";
    return [fill(w.stands, { at: st.at.slice(0, 16).replace("T", " ") + " UTC" }), ...out, ...(st.changes?.length ? [w.changeRule] : [])].join("\n");
  };

  const tell = async (taskId: string, pr: string, lines: string[], seen: OwnedSeen, before: OwnedSeen) => {
    const w = wordsOf(taskId);
    const r = o.runner();
    if (!r) return false;
    try {
      const was = new Set(before.ids ?? []);
      const stands = seen.state === "open" ? standingText(taskId, seen.standing, new Set((seen.ids ?? []).filter((id) => !was.has(id)))) : "";
      await r.send(taskId, [fill(w.head, { pr }), ...lines, ...(stands ? ["", stands] : []), "", w.tail].join("\n"), undefined, "partner");
    } catch (err) {
      console.warn(`[owned] could not tell ${taskId} about ${pr}: ${(err as Error).message}`);
      return false;
    }
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr, news: lines.map((l) => one(l, 300)).slice(0, 20), seen } });
    return true;
  };

  const moved = (a: OwnedSeen, b: OwnedSeen) => {
    if (a.state !== b.state) return true;
    if (!a.standing || !b.standing) return !!a.standing !== !!b.standing;
    const x = prSaid({ state: "open", standing: a.standing });
    const y = prSaid({ state: "open", standing: b.standing });
    return JSON.stringify(x) !== JSON.stringify(y);
  };

  const inTurn = (taskId: string) => {
    const c = tasks.get(taskId);
    return !!c && c.residency === "hot" && (c.attention === "working" || c.attention === "queued");
  };

  /** One sweep at a time: a sweep asked for during another runs after it (its timer, a first look, a test). */
  async function sweep(): Promise<void> {
    while (running) await running;
    if (stopped) return;
    running = sweepOnce().finally(() => (running = undefined));
    return running;
  }

  async function sweepOnce() {
    let held = false;
    try {
      for (const [taskId, m] of owns) {
        const c = tasks.get(taskId);
        if (!c || GONE.has(c.attention)) continue;
        for (const [pr, seen] of m) {
          if ((seen.state && seen.state !== "open") || seen.letGo) continue; // D602: let go: never looked at again
          let got: { lines: string[]; next: OwnedSeen };
          try {
            got = await lookAt(taskId, pr, seen);
          } catch (err) {
            // A look that can't read (gh signed out, the network) tells nothing and is tried next time.
            console.warn(`[owned] ${taskId} ${pr}: ${(err as Error).message}`);
            continue;
          }
          if (stopped) return;
          if (m.get(pr)?.letGo) continue; // D602: let go while it was being read
          const others = pending.get(taskId)?.get(pr) ?? [];
          const lines = [...got.lines, ...others];
          if (!seen.head && !lines.length) {
            // A first look with nothing for the task only learns where it stands (D496: a request
            // for changes or a failed check that stands is news on a first look too).
            m.set(pr, got.next);
            log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr, news: [], seen: got.next } });
            continue;
          }
          if (!lines.length) {
            m.set(pr, got.next);
            // D508: where it stands changed with nothing to tell (checks went on, a reviewer was
            // asked): logged quietly, so On hand says where the PR is now.
            if (moved(seen, got.next)) log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr, news: [], seen: got.next } });
            continue;
          }
          if (inTurn(taskId)) {
            // It goes with the next look, after this turn; where the PR stands is known now (for
            // the task's own wake and the partner's [live] line).
            held = true;
            if (got.next.standing) m.set(pr, { ...seen, standing: got.next.standing });
            continue;
          }
          if (await tell(taskId, pr, lines, got.next, seen)) {
            m.set(pr, got.next);
            pending.get(taskId)?.delete(pr);
          }
        }
      }
    } finally {
      // D496: news held for a turn goes soon after it, not a whole round later.
      if (held && !stopped) clock.setTimeout(() => void sweep(), HELD_LOOK_MS);
    }
  }

  const onEvent = (e: LogEvent) => {
    if (e.kind === "owned_news") {
      // D602: a PR the task (or the person, ending it) let go is never looked at again.
      const b = e.body as Bodies["owned_news"];
      const m = owns.get(b.taskId);
      if (b.seen.letGo && m?.has(b.pr)) m.set(b.pr, b.seen);
      return;
    }
    if (e.kind === "checkpoint") {
      const b = e.body as Bodies["checkpoint"];
      fresh = false;
      declare(b.taskId, b.owns, e.ts);
      noteRef(b.taskId, b.gitRef);
      // D496: a PR just declared is looked at soon, so where it stands (a request for changes
      // from before) reaches the task with its next wake, not five minutes on.
      if (fresh && !stopped) clock.setTimeout(() => void sweep(), FIRST_LOOK_MS);
      return;
    }
    if (e.kind === "job_status") {
      fresh = false;
      adopt(e);
      if (fresh && !stopped) clock.setTimeout(() => void sweep(), FIRST_LOOK_MS);
      return;
    }
    if (e.kind !== "report") return;
    fresh = false;
    adopt(e);
    if (fresh && !stopped) clock.setTimeout(() => void sweep(), FIRST_LOOK_MS);
    // Another task's report whose evidence names an owned PR (its identity, parsed from the ref).
    const r = e.body as Bodies["report"];
    const named = new Set((r.evidence ?? []).map((x) => prIdentity(x.ref)).filter((x): x is string => !!x));
    if (!named.size) return;
    for (const [taskId, m] of owns) {
      if (taskId === r.taskId) continue;
      for (const pr of named) {
        if (!m.has(pr)) continue;
        const w = wordsOf(taskId);
        const line = fill(w.other, { title: one(tasks.get(r.taskId)?.title ?? r.taskId, 60), id: r.taskId, text: one(r.summary, 400) });
        const p = pending.get(taskId) ?? new Map<string, string[]>();
        p.set(pr, [...(p.get(pr) ?? []), line].slice(-5));
        pending.set(taskId, p);
      }
    }
  };
  const unsubscribe = log.subscribe(onEvent);
  let timer: unknown;
  const tick = () => {
    if (stopped) return;
    void sweep().finally(() => {
      if (!stopped) timer = clock.setTimeout(tick, o.everyMs ?? OWNED_EVERY_MS);
    });
  };
  timer = clock.setTimeout(tick, o.everyMs ?? OWNED_EVERY_MS);

  return {
    standing: (taskId) =>
      [...(owns.get(taskId)?.entries() ?? [])]
        .filter(([, s]) => (!s.state || s.state === "open") && !s.letGo && s.standing)
        .map(([pr, s]) => {
          const t = standingText(taskId, s.standing);
          return t ? `PR ${pr}: ${t}` : "";
        })
        .filter(Boolean)
        .join("\n\n"),
    of: (taskId) => [...(owns.get(taskId)?.entries() ?? [])].filter(([, s]) => (!s.state || s.state === "open") && !s.letGo).map(([pr]) => pr),
    all: () =>
      [...owns]
        .map(([taskId, m]) => {
          const open = [...m.entries()].filter(([, s]) => (!s.state || s.state === "open") && !s.letGo);
          const said = Object.fromEntries(open.filter(([, s]) => s.standing).map(([pr, s]) => [pr, saidOf(s.standing!, s.ids)]).filter(([, t]) => t));
          return { taskId, refs: open.map(([pr]) => pr), ...(Object.keys(said).length ? { said } : {}) };
        })
        .filter((x) => x.refs.length),
    sweep,
    stop() {
      stopped = true;
      unsubscribe();
      if (timer !== undefined) clock.clearTimeout(timer);
    },
  };
}
