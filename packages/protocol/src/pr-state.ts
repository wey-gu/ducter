// D508: a task whose result is an open pull request is not done: its work goes on in the PR (CI,
// reviews, the merge), and On hand stands it under where that PR stands. Read from the facts Ducter
// already reads every look (D496's OwnedStanding), never from words. Pure and language-neutral:
// clients word a phase themselves. Reusable by anything that shows a PR's state (a helper that
// babysits PRs, the opened task). The Go port (apps/desktop/internal/store/prstate.go) reads the
// same cases from fixtures/pr-state.json.
import type { OwnedStanding } from "./index.ts";

/** D508: one pull request a task made or took over, as its card carries it (core's owned looks). */
export interface TaskPR {
  /** Its identity: "owner/repo#123". */
  pr: string;
  url: string;
  state: "open" | "merged" | "closed";
  /** When this was last read. */
  at: string;
  standing?: OwnedStanding;
}

/**
 * Where a PR stands, in one word for each moment of its life:
 * checks: CI is still running; failing: a check failed; review: waiting for a reviewer;
 * changes: a reviewer asked for changes; conflict: it conflicts with its base; draft: still a
 * draft; ready: approved and nothing left but the merge; merged; closed (without merging);
 * open: open, nothing read yet.
 */
export type PrPhase = "checks" | "failing" | "review" | "changes" | "conflict" | "draft" | "ready" | "merged" | "closed" | "open";

/** A phase with the facts a row says beside it, each its own element. */
export interface PrSaid {
  phase: PrPhase;
  /** Who: the reviewers asking for changes (changes), awaited (review) or who approved (ready). */
  by?: string[];
  /** The checks that failed (failing). */
  failed?: string[];
  /** The checks on the head: how many passed of how many, how many still run. */
  checks?: { passed: number; total: number; pending: number };
}

const names = (xs: readonly string[] | undefined) => (xs ?? []).filter(Boolean).slice(0, 3);

/** Where this PR stands, from its state and its last look. */
export function prSaid(p: Pick<TaskPR, "state" | "standing">): PrSaid {
  if (p.state === "merged") return { phase: "merged" };
  if (p.state === "closed") return { phase: "closed" };
  const st = p.standing;
  if (!st) return { phase: "open" };
  const c = st.checks;
  const checks = c && c.total > 0 ? { checks: { passed: c.passed, total: c.total, pending: c.pending.length } } : {};
  if (st.changes?.length) return { phase: "changes", by: names(st.changes.map((x) => x.by)), ...checks };
  if (c?.failed.length) return { phase: "failing", failed: names(c.failed), ...checks };
  if (st.merge === "dirty") return { phase: "conflict", ...checks };
  if (st.draft) return { phase: "draft", ...checks };
  const pending = c?.pending.length ?? 0;
  if (!st.approvedBy?.length) {
    // Checks still running and nobody asked to review yet: CI is what it waits on; else a reviewer.
    if (pending && !st.awaiting?.length) return { phase: "checks", ...checks };
    return { phase: "review", ...(st.awaiting?.length ? { by: names(st.awaiting) } : {}), ...checks };
  }
  if (pending) return { phase: "checks", ...checks };
  return { phase: "ready", by: names(st.approvedBy), ...checks };
}

/**
 * Where On hand stands a finished task under its PR: ready waits for the person (the merge is
 * theirs); merged and closed are done; every other phase waits on CI, a reviewer or the task's next
 * turn, which Ducter's looks bring (D483).
 */
export function prStands(phase: PrPhase): "needs" | "waiting" | "done" {
  if (phase === "ready") return "needs";
  if (phase === "merged" || phase === "closed") return "done";
  return "waiting";
}

/** The PR a task's row speaks of: an open one (the newest read), else the newest. */
export function prOf(prs: readonly TaskPR[] | undefined): TaskPR | undefined {
  if (!prs?.length) return undefined;
  const newest = [...prs].sort((a, b) => b.at.localeCompare(a.at));
  return newest.find((p) => p.state === "open") ?? newest[0];
}

/** D508: the PR a finished task's work goes on in, with where it stands, or undefined when none is
 *  open (no PR, or it was merged or closed): then the task is done as it is. */
export function prGoesOn(prs: readonly TaskPR[] | undefined): { pr: TaskPR; said: PrSaid; stands: "needs" | "waiting" } | undefined {
  const pr = prOf(prs);
  if (!pr) return undefined;
  const said = prSaid(pr);
  const stands = prStands(said.phase);
  return stands === "done" ? undefined : { pr, said, stands };
}

/** A PR's address from its identity ("owner/repo#123"). */
export function prUrl(pr: string): string {
  const [repo, n] = pr.split("#");
  return `https://github.com/${repo}/pull/${n}`;
}
