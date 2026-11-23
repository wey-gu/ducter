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
import type { Bodies, CheckSpec, LogEvent, OwnedSeen } from "@ducter/protocol";
export type { OwnedSeen };
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import type { CheckResult } from "@ducter/protocol/src/checks-run.ts";
import { realClock, type Clock } from "./clock.ts";
import type { CoreRegistry } from "./registry.ts";
import { langOfText } from "./lang.ts";
import { words } from "@ducter/protocol";
import { prIdentity } from "@ducter/protocol/src/owned.ts";

/** How often a task's owned PRs are looked at. */
export const OWNED_EVERY_MS = 5 * 60_000;
const OUTPUT_MAX = 512 * 1024;
const SEEN_IDS = 300;
const GONE = new Set(["dropped", "superseded"]);

export { prIdentity };

export interface Owned {
  /** Each task's owned PRs, for the partner's [live] line. */
  of(taskId: string): string[];
  all(): { taskId: string; refs: string[] }[];
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
    counts: "{ok} of {total} passed",
    failed: "; failed: {names}",
    sep: ", ",
  },
};
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const one = (s: unknown, n = 400) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};

interface Item { id?: number | string; by?: string; at?: string; text?: string; path?: string; line?: number; state?: string }

export function createOwned(o: { log: LogStore; tasks: CoreRegistry; runner: () => Runner | undefined; check: Check; clock?: Clock; everyMs?: number }): Owned {
  const { log, tasks } = o;
  const clock = o.clock ?? realClock;
  const owns = new Map<string, Map<string, OwnedSeen>>(); // taskId -> pr -> what was told
  const gitRefs = new Map<string, Set<string>>(); // taskId -> its own checkpointed commits
  const pending = new Map<string, Map<string, string[]>>(); // taskId -> pr -> other tasks' lines not yet told
  let stopped = false;
  let busy = false;
  const wordsOf = (taskId: string) => words(W, langOfText(tasks.get(taskId)?.title));

  const declare = (taskId: string, refs: string[] | undefined, at: string) => {
    for (const r of refs ?? []) {
      const pr = prIdentity(r);
      if (!pr) continue;
      const m = owns.get(taskId) ?? new Map<string, OwnedSeen>();
      if (!m.has(pr)) m.set(pr, { since: at });
      owns.set(taskId, m);
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

  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["checkpoint", "owned_news"] })) {
    if (e.kind === "checkpoint") {
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

  /** One look at one PR: the news since what was told, and what is told after it. */
  async function lookAt(taskId: string, pr: string, seen: OwnedSeen): Promise<{ lines: string[]; next: OwnedSeen }> {
    const [repo, n] = pr.split("#") as [string, string];
    const w = wordsOf(taskId);
    const lines: string[] = [];
    const next: OwnedSeen = { ...seen, ids: [...(seen.ids ?? [])] };
    const head = (await call(taskId, ["gh", "api", `repos/${repo}/pulls/${n}`, "--jq", "{head: .head.sha, state: .state, merged: .merged}"])) as { head?: string; state?: string; merged?: boolean };
    const since = new Date(Date.parse(seen.since)).toISOString().slice(0, 19) + "Z";
    const told = new Set(next.ids);
    const fresh = (x: Item, kind: string) => {
      const id = `${kind}:${x.id}`;
      if (told.has(id) || !x.at || x.at < since) return false;
      told.add(id);
      next.ids!.push(id);
      return true;
    };
    const comments = (await call(taskId, ["gh", "api", `repos/${repo}/issues/${n}/comments?since=${since}&per_page=100`, "--jq", "[.[] | {id, by: .user.login, at: .created_at, text: .body[0:600]}]"])) as Item[];
    const notes = (await call(taskId, ["gh", "api", `repos/${repo}/pulls/${n}/comments?since=${since}&per_page=100`, "--jq", "[.[] | {id, by: .user.login, at: .created_at, path, line, text: .body[0:600]}]"])) as Item[];
    const reviews = (await call(taskId, ["gh", "api", `repos/${repo}/pulls/${n}/reviews?per_page=100`, "--jq", "[.[] | {id, by: .user.login, at: .submitted_at, state, text: .body[0:600]}]"])) as Item[];
    for (const x of comments ?? []) if (fresh(x, "c")) lines.push(fill(w.comment, { by: one(x.by, 40), at: one(x.at, 25), where: "", text: one(x.text) }));
    for (const x of notes ?? []) if (fresh(x, "n")) lines.push(fill(w.comment, { by: one(x.by, 40), at: one(x.at, 25), where: x.path ? ` (${one(x.path, 120)}${x.line ? `:${x.line}` : ""})` : "", text: one(x.text) }));
    for (const x of reviews ?? []) if (fresh(x, "r")) lines.push(fill(w.review, { by: one(x.by, 40), at: one(x.at, 25), state: one(x.state, 30), text: one(x.text) || "-" }));
    if (next.ids!.length > SEEN_IDS) next.ids = next.ids!.slice(-SEEN_IDS);
    const sha = String(head?.head ?? "");
    if (sha && seen.head && sha !== seen.head && !ownCommit(taskId, sha)) lines.push(fill(w.push, { head: sha.slice(0, 10) }));
    if (sha) next.head = sha;
    if (sha && next.ciFor !== sha) {
      const runs = ((await call(taskId, ["gh", "api", `repos/${repo}/commits/${sha}/check-runs?per_page=100`, "--jq", "[.check_runs[] | {name, status, conclusion}]"])) as { name?: string; status?: string; conclusion?: string }[]) ?? [];
      const st = (await call(taskId, ["gh", "api", `repos/${repo}/commits/${sha}/status`, "--jq", '{state, n: (.statuses | length), failed: [.statuses[] | select(.state == "failure" or .state == "error") | .context]}'])) as { state?: string; n?: number; failed?: string[] };
      const statuses = Number(st?.n ?? 0);
      const any = runs.length > 0 || statuses > 0;
      const runsDone = runs.every((r) => r.status === "completed");
      const statusDone = !statuses || st?.state !== "pending";
      if (any && runsDone && statusDone) {
        const bad = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);
        const failed = [...runs.filter((r) => bad.has(String(r.conclusion))).map((r) => String(r.name)), ...(st?.failed ?? [])];
        const total = runs.length + statuses;
        const counts = fill(w.counts, { total: String(total), ok: String(total - failed.length) });
        lines.push(fill(w.ci, { head: sha.slice(0, 10), counts, failed: failed.length ? fill(w.failed, { names: failed.slice(0, 8).join(w.sep) }) : "" }));
        next.ciFor = sha;
      }
    }
    const state = head?.merged ? "merged" : head?.state === "closed" ? "closed" : "open";
    if (state !== "open" && seen.state !== state) lines.push(state === "merged" ? w.merged : w.closed);
    next.state = state;
    return { lines, next };
  }

  const tell = async (taskId: string, pr: string, lines: string[], seen: OwnedSeen) => {
    const w = wordsOf(taskId);
    const r = o.runner();
    if (!r) return false;
    try {
      await r.send(taskId, [fill(w.head, { pr }), ...lines, w.tail].join("\n"), undefined, "partner");
    } catch (err) {
      console.warn(`[owned] could not tell ${taskId} about ${pr}: ${(err as Error).message}`);
      return false;
    }
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr, news: lines.map((l) => one(l, 300)).slice(0, 20), seen } });
    return true;
  };

  const inTurn = (taskId: string) => {
    const c = tasks.get(taskId);
    return !!c && c.residency === "hot" && (c.attention === "working" || c.attention === "queued");
  };

  async function sweep() {
    if (busy || stopped) return;
    busy = true;
    try {
      for (const [taskId, m] of owns) {
        const c = tasks.get(taskId);
        if (!c || GONE.has(c.attention)) continue;
        for (const [pr, seen] of m) {
          if (seen.state && seen.state !== "open") continue;
          let got: { lines: string[]; next: OwnedSeen };
          try {
            got = await lookAt(taskId, pr, seen);
          } catch (err) {
            // A look that can't read (gh signed out, the network) tells nothing and is tried next time.
            console.warn(`[owned] ${taskId} ${pr}: ${(err as Error).message}`);
            continue;
          }
          if (stopped) return;
          const others = pending.get(taskId)?.get(pr) ?? [];
          const lines = [...got.lines, ...others];
          if (!seen.head && !lines.length) {
            // The first look only learns where it stands.
            m.set(pr, got.next);
            log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr, news: [], seen: got.next } });
            continue;
          }
          if (!lines.length) {
            m.set(pr, got.next);
            continue;
          }
          if (inTurn(taskId)) continue; // it goes with the next look, after this turn
          if (await tell(taskId, pr, lines, got.next)) {
            m.set(pr, got.next);
            pending.get(taskId)?.delete(pr);
          }
        }
      }
    } finally {
      busy = false;
    }
  }

  const onEvent = (e: LogEvent) => {
    if (e.kind === "checkpoint") {
      const b = e.body as Bodies["checkpoint"];
      declare(b.taskId, b.owns, e.ts);
      noteRef(b.taskId, b.gitRef);
      return;
    }
    if (e.kind !== "report") return;
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
    of: (taskId) => [...(owns.get(taskId)?.entries() ?? [])].filter(([, s]) => !s.state || s.state === "open").map(([pr]) => pr),
    all: () => [...owns].map(([taskId, m]) => ({ taskId, refs: [...m.entries()].filter(([, s]) => !s.state || s.state === "open").map(([pr]) => pr) })).filter((x) => x.refs.length),
    sweep,
    stop() {
      stopped = true;
      unsubscribe();
      if (timer !== undefined) clock.clearTimeout(timer);
    },
  };
}
