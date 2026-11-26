// D617: one rule for "a question still waits on the person" on every surface. The home's
// count, the conversation's cards, On hand's 等你, a partner's number and the talk screen all read
// this predicate; the Mac mirrors it in apps/desktop/internal/store (OpenAsk) and both read
// fixtures/open-asks.json, so the count and every list can never disagree again.
//
// An offer (D453) is never one, a question put off with 晚点再问我 (D382) is not one now, and a
// question whose default has already come due is not one either: the home settles it at that time
// (a hold default; a Go default only when the card is reversible), so it must leave every surface
// at once, not wait for a resolution that may never have been delivered.

/** What `askOpen` reads of a decision (a structural subset of Bodies["decision"]). */
export interface OpenAskDecision {
  question?: string;
  offer?: boolean;
  reversible?: boolean;
  defaultOption?: "go" | "hold";
  defaultAt?: string;
  /** The to-do sources' picks (D359): a morning offer, never a card of its own. */
  src?: { kind?: string };
}

/** What a client knows about the decision besides its body. */
export interface OpenAskState {
  /** An answer exists (the person's, the default's, or ended). */
  resolved?: boolean;
  /** The person acted and the home has not resolved it yet. */
  pending?: string;
  /** Put off until this time (晚点再问我), while it is away. */
  later?: string;
  /** The time to judge its default by; now when absent. */
  now?: number;
}

/**
 * Whether a decision applies itself at its defaultAt. A Go default applies only when the card is
 * reversible (nothing irreversible ever goes on its own, D340); a Hold default always may, even
 * when the card is not reversible: that is the whole of a hold offer (the morning's picks).
 */
export function settlesByDefault(d: OpenAskDecision): boolean {
  return !!d.defaultAt && (d.reversible === true || d.defaultOption === "hold");
}

/** The one predicate behind the count and every list (see the file header). */
export function askOpen(d: OpenAskDecision, state: OpenAskState = {}): boolean {
  if (state.resolved || state.pending || state.later) return false;
  if (d.offer || d.src?.kind === "picks") return false;
  if (!d.question?.trim()) return false;
  if (settlesByDefault(d) && Date.parse(d.defaultAt!) <= (state.now ?? Date.now())) return false;
  return true;
}
