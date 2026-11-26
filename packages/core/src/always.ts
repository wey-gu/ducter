// D601: 以后这类直接做 / Always do this. A Go card whose action is one a standing permission can
// cover (D413, D495, D499: STANDING_ACTIONS) carries a second choice beside Go. Tapping it does this
// one now and keeps a standing permission where the card acted (the GitHub owner), recorded as a tap
// (`by: "tap"`), never as words the person didn't say. D61 GQ4: after two plain Go's on one kind in
// one owner within 14 days, the next card of that kind leads with the offer, once; not again for 30
// days for that kind and owner.
//
// The model judges, code guards: the task says which step its Go is (report_to_main's `step`); a
// review round's card is pr_review by what it is. Code keeps the invariants: only a plain ask
// (plainAsk: never the floor, D61 GQ5), never a merge or a force push (beyondStanding), only where
// an owner is known. A card whose step is covered already goes on the person's word (D499).
import { GQ4_DAYS, GQ4_GOES, GQ4_QUIET_DAYS, STEP_WORDS, TASK_STEP_ACTIONS, beyondStanding, words, type AlwaysAsk, type Bodies, type LangTag, type StandingAction, type StandingView } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { plainAsk, type Decisions } from "./decisions.ts";
import type { StandingStore } from "./standing.ts";

const DAY_MS = 86_400_000;

/** The button's label, kept as a tapped permission's text (Settings reads it as a tap, never as their words). */
export const ALWAYS_LABEL = {
  zh: { any: "以后这类直接做", pr_review: "以后直接发" },
  en: { any: "Always do this", pr_review: "Always post" },
};

export function alwaysLabel(action: StandingAction, lang: LangTag | undefined): string {
  const w = words(ALWAYS_LABEL, lang);
  return action === "pr_review" ? w.pr_review : w.any;
}

/** The owner part of a ref or a repo (owner/repo#n, owner/repo, owner), lower case. */
const ownerOf = (ref: string) => ref.split("/")[0]!.trim().toLowerCase();

export interface Always {
  /**
   * What a card about to be asked carries: `always` (the second choice, with `often` for GQ4's
   * offer), or `covered`: the standing permission that already lets its step go (D499's go on their
   * word, said or tapped). Nothing for a card a tap can't keep.
   */
  dress(d: Bodies["decision"], step?: StandingAction): { always?: AlwaysAsk; covered?: StandingView };
  /** The tap: keep the permission and say Go to this card, once. */
  tap(decisionId: string): { ok: true; standing: StandingView } | { ok: false; error: string };
  stop(): void;
}

export function createAlways(o: {
  log: LogStore;
  standing: StandingStore;
  decisions: () => Decisions | undefined;
  /** The GitHub owner a task works in (its repo's owner), lower case. */
  ownerOfTask: (taskId: string) => string | undefined;
  lang: () => LangTag | undefined;
  now: () => number;
}): Always {
  /** Plain Go's on cards that offered a tap (kind, owners, when), and the offers shown (GQ4). */
  const goes: { action: StandingAction; where: string[]; at: number }[] = [];
  const offers: { action: StandingAction; where: string[]; at: number }[] = [];
  const asked = new Map<string, { a: AlwaysAsk; at: number }>();
  const see = (kind: string, body: unknown, ts: string) => {
    const at = Date.parse(ts);
    if (kind === "decision") {
      const d = body as Bodies["decision"];
      if (!d.always) return;
      asked.set(d.decisionId, { a: d.always, at });
      if (d.always.often) offers.push({ action: d.always.action, where: d.always.where, at });
      return;
    }
    const r = body as Bodies["decision_resolved"];
    const q = asked.get(r.decisionId);
    if (!q) return;
    asked.delete(r.decisionId);
    if (r.option === "go" && r.by === "user" && !r.always) goes.push({ action: q.a.action, where: q.a.where, at });
  };
  for (const e of o.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["decision", "decision_resolved"] })) see(e.kind, e.body, e.ts);
  const unsub = o.log.subscribe((e) => {
    if (e.kind === "decision" || e.kind === "decision_resolved") see(e.kind, e.body, e.ts);
  });

  const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x));
  /** GQ4: two plain Go's on this kind in these owners within 14 days, and no offer for them within 30. */
  const often = (action: StandingAction, where: string[]): boolean => {
    const now = o.now();
    const n = goes.filter((g) => g.action === action && overlaps(g.where, where) && now - g.at <= GQ4_DAYS * DAY_MS).length;
    if (n < GQ4_GOES) return false;
    return !offers.some((f) => f.action === action && overlaps(f.where, where) && now - f.at <= GQ4_QUIET_DAYS * DAY_MS);
  };

  /** Where a card acts and what it is, or nothing when a tap can't keep it. */
  const kindOf = (d: Bodies["decision"], step?: StandingAction): { action: StandingAction; where: string[] } | undefined => {
    // D394: a review round's card posts reviews on the PRs it lists, in their owners.
    if (d.src?.kind === "reviews") {
      const where = [...new Set((d.src.items ?? []).map((x) => ownerOf(x.item.ref)).filter(Boolean))];
      return where.length ? { action: "pr_review", where } : undefined;
    }
    if (!step || !d.taskId || !TASK_STEP_ACTIONS.includes(step)) return undefined;
    // The floor (payments, passwords and sign-ins, keys, deleting, what another AI flagged…) and
    // every card of its own kind: never.
    if (!plainAsk(d)) return undefined;
    if (beyondStanding(d.question, d.goLabel)) return undefined;
    const owner = o.ownerOfTask(d.taskId);
    return owner ? { action: step, where: [owner] } : undefined;
  };

  return {
    dress(d, step) {
      const k = kindOf(d, step);
      if (!k) return {};
      if (d.taskId && d.src?.kind !== "reviews") {
        const covered = o.standing.covers(k.action, { taskId: d.taskId, owner: k.where[0] });
        if (covered) return { covered };
      }
      return { always: { action: k.action, where: k.where, ...(often(k.action, k.where) ? { often: true as const } : {}) } };
    },
    tap(decisionId) {
      const decisions = o.decisions();
      const d = decisions?.get(decisionId);
      if (!decisions || !d) return { ok: false, error: "That card isn't here any more." };
      if (!decisions.isPending(decisionId)) return { ok: false, error: "That was answered already." };
      if (!d.always) return { ok: false, error: "This one is asked each time." };
      // The card's kind again, from the card as it stands (it was guarded when asked; still so).
      if (d.src?.kind !== "reviews" && (!plainAsk(d) || beyondStanding(d.question, d.goLabel))) return { ok: false, error: "This one is asked each time." };
      const at = new Date(o.now()).toISOString();
      // A review round's card posts its own drafts on this Go: the permission is kept quietly, so
      // nothing else posts them at the same moment.
      const s = o.standing.tap(d.always.action, d.always.where, at, alwaysLabel(d.always.action, o.lang()), { quiet: d.src?.kind === "reviews" });
      if (!s) return { ok: false, error: "This one is asked each time." };
      decisions.decide(decisionId, "go", undefined, { always: true, standing: s.id });
      return { ok: true, standing: s };
    },
    stop: () => unsub(),
  };
}

/** D601: what a task hears after a Go given with Always do this (model-visible). */
export function alwaysForward(goLabel: string, a: AlwaysAsk): string {
  return `User says Go: ${goLabel}. They also tapped "Always do this": from now on ${STEP_WORDS[a.action]} goes without asking (in ${a.where.join(", ")}). Do it when the work needs it, without a needs_input question, and say in your report what you did; anything else that reaches other people still asks.`;
}
