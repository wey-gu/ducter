// D413: 不用问我的 / Without asking. Something the person said Ducter may do for them from now on
// without asking each time ("review 做好了直接发别和我确认"), kept at once in their words, listed in
// Settings › Partner under 要不要先问, and taken back with one tap or one sentence. Only actions Ducter
// can honour through its audited write path are kept; the floor (paying, passwords and sign-ins,
// anything an untrusted source asked for, deleting) is never a standing permission.

/**
 * The outward actions a standing permission can cover (each with a write path that honours it).
 * pr_review: post a PR review (the review routine, D413). issue_comment (D415): leave a comment on
 * an issue the person handed over ("在 nowledge-co 的 issue 里留言不用问我"), e.g. the hand-over note's
 * "tell them my agent is starting"; never a close, never someone else's PR.
 */
export type StandingAction = "pr_review" | "issue_comment";
export const STANDING_ACTIONS: readonly StandingAction[] = ["pr_review", "issue_comment"];

export interface StandingView {
  id: string;
  action: StandingAction;
  /**
   * Where it holds: these GitHub owners (orgs or users). Absent: wherever the review routine looks.
   * A PR only mentioning the person (not asking for their review) is never in it.
   */
  orgs?: string[];
  /** The person's own words, the clause that said it. */
  text: string;
  /** ISO time it was said. */
  createdAt: string;
  /** The conversation message it came from (its Log seq), when it came from one. */
  seq?: number;
  /** ISO time it was first used (the one line in the conversation that lists what went). */
  usedAt?: string;
}
