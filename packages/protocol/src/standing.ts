// D413: 不用问我的 / Without asking. Something the person said Ducter may do for them from now on
// without asking each time ("review 做好了直接发别和我确认"), kept in their words (D495: recorded by the
// partner with its without_asking tool, the words checked as theirs; no code reads meaning), listed in
// Settings › Partner under 要不要先问, and taken back with one tap or one sentence. Only actions Ducter
// can honour through its audited write path are kept; the floor (paying, passwords and sign-ins,
// anything an untrusted source asked for, deleting) is never a standing permission.

/**
 * The outward actions a standing permission can cover (each with a write path that honours it).
 * pr_review: post a PR review (the review routine, D413). issue_comment (D415): leave a comment on
 * an issue the person handed over ("在 nowledge-co 的 issue 里留言不用问我"), e.g. the hand-over note's
 * "tell them my agent is starting"; never a close, never someone else's PR.
 *
 * D499: three steps a task takes on its own work. A task asks about them (report_to_main
 * needs_input) and Ducter answers for the person when their word covers the step; that answer is
 * the audited write (recorded with the words it rested on, in Done for you):
 *   ci_rerun: rerun its PR's checks (a `/test`-style command comment, `gh run rerun`): it repeats
 *     what already ran and changes no code;
 *   pr_comment: a comment on the PR the task opened or works on (a reply to a reviewer, a status
 *     line): it can be edited or deleted, and only the PR's people see it;
 *   branch_push: push the task's own branch (its PR updates): never the base or a protected
 *     branch, never a delete, never a merge.
 *
 * D596: the dev flow the person described once (「做好了 PR，研究实现设计验证好之后，交给 PR baby sitter」):
 *   pr_open: on work they asked for, once it is verified, Ducter pushes the task's own branch, opens
 *     its PR (the same write as the opened task's Open PR, `open_pr`) and the task hands the PR to
 *     the helper or person they named: never a merge, never the default or base branch,
 *     never a force-push, never someone else's branch. It covers branch_push for that task too.
 * Never here: merging, paying, passwords and sign-ins, deleting, anything an untrusted source asked.
 */
export type StandingAction = "pr_review" | "issue_comment" | "ci_rerun" | "pr_comment" | "branch_push" | "pr_open";
export const STANDING_ACTIONS: readonly StandingAction[] = ["pr_review", "issue_comment", "ci_rerun", "pr_comment", "branch_push", "pr_open"];
/** D499: the steps a task's own ask can be answered under (pr_review goes through review_report). */
export const TASK_STEP_ACTIONS: readonly StandingAction[] = ["ci_rerun", "pr_comment", "branch_push", "issue_comment", "pr_open"];
/** D596: a kept go for one action that also covers another (opening the PR needs its branch pushed). */
export const STANDING_COVERS: Partial<Record<StandingAction, readonly StandingAction[]>> = { pr_open: ["branch_push"] };

/** D499: each step in a task's words (model-visible: the go forwarded to a task, its brief). */
export const STEP_WORDS: Record<StandingAction, string> = {
  pr_review: "posting PR reviews",
  issue_comment: "commenting on the issues it works on",
  ci_rerun: "rerunning its PR's checks (a /test-style comment, gh run rerun)",
  pr_comment: "commenting on the PR it opened or works on",
  branch_push: "pushing its own branch (never the base or a protected branch, never a delete or a merge)",
  pr_open: "once its work is verified, pushing its branch, opening its PR and handing the PR to the helper or person named (never a merge, never the base branch, never a force-push)",
};

export interface StandingView {
  id: string;
  action: StandingAction;
  /**
   * Where it holds: these GitHub owners (orgs or users), or D596 repos as owner/repo. Absent: wherever the review routine looks.
   * D495: every PR the routine reviews there, a mention too (the routine reviews what the person
   * asked it to; code never narrows what they said).
   */
  orgs?: string[];
  /**
   * D499: only inside this task (said about one task: 「这个 PR 你自己推进到能合并就好，这些都别问我」);
   * it ends with the task. Absent: wherever `orgs` says.
   */
  taskId?: string;
  /** D499: that task's title, for the Partner page's line. */
  taskTitle?: string;
  /** The person's own words, the clause that said it. */
  text: string;
  /** ISO time it was said. */
  createdAt: string;
  /** The conversation message it came from (its Log seq), when it came from one. */
  seq?: number;
  /** ISO time it was first used (the one line in the conversation that lists what went). */
  usedAt?: string;
  /**
   * D601: kept by a tap on a card's 以后这类直接做 / Always do this (or 以后直接发 / Always post on a
   * review round's card), not by words: `text` is then that button's label, never words put in the
   * person's mouth, and Settings reads it as 你点了「以后这类直接做」 / You tapped "Always do this".
   */
  by?: "tap";
}

/**
 * D601: a card whose Go does one of the standing actions, where a tap may keep it: the action, and
 * where it holds (the GitHub owners of what it acts on, lower case). Set by code when the card is
 * asked (never by a task), only on a plain ask (D499 plainAsk: never the floor, D61 GQ5) and only
 * when the owner is known. `often` (GQ4): the person said Go to this kind in this owner twice in 14
 * days, so the card leads with the offer; shown once per kind and owner, and not again for 30 days.
 */
export interface AlwaysAsk {
  action: StandingAction;
  where: string[];
  often?: true;
}

/** D601 (D61 GQ4): Go's on one kind in one owner within GQ4_DAYS before the card offers to stop asking. */
export const GQ4_GOES = 2;
export const GQ4_DAYS = 14;
/** D601: an offer shown (taken or not) is not shown again for this kind and owner for this long. */
export const GQ4_QUIET_DAYS = 30;

/**
 * D601: words that put a Go out of a tap's reach whatever kind the task said it was: merging, a
 * force push (the floor and what D499 keeps asking). Read from the card's own words, as
 * destructiveChoice reads deleting (D340); a card it misses still keeps only the step its action
 * names, whose audited write never merges or force-pushes.
 */
const NOT_STANDING = [/\bmerg(e|es|ed|ing)\b|\bforce[- ]?push|--force\b/i, /合并|合入|合进|强推|强制推送/];
export function beyondStanding(...texts: (string | undefined)[]): boolean {
  const all = texts.filter(Boolean).join("\n");
  return NOT_STANDING.some((re) => re.test(all));
}
