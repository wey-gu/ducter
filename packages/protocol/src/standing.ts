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
 * Never here: merging, paying, passwords and sign-ins, deleting, anything an untrusted source asked.
 */
export type StandingAction = "pr_review" | "issue_comment" | "ci_rerun" | "pr_comment" | "branch_push";
export const STANDING_ACTIONS: readonly StandingAction[] = ["pr_review", "issue_comment", "ci_rerun", "pr_comment", "branch_push"];
/** D499: the steps a task's own ask can be answered under (pr_review goes through review_report). */
export const TASK_STEP_ACTIONS: readonly StandingAction[] = ["ci_rerun", "pr_comment", "branch_push", "issue_comment"];

/** D499: each step in a task's words (model-visible: the go forwarded to a task, its brief). */
export const STEP_WORDS: Record<StandingAction, string> = {
  pr_review: "posting PR reviews",
  issue_comment: "commenting on the issues it works on",
  ci_rerun: "rerunning its PR's checks (a /test-style comment, gh run rerun)",
  pr_comment: "commenting on the PR it opened or works on",
  branch_push: "pushing its own branch (never the base or a protected branch, never a delete or a merge)",
};

export interface StandingView {
  id: string;
  action: StandingAction;
  /**
   * Where it holds: these GitHub owners (orgs or users). Absent: wherever the review routine looks.
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
}
