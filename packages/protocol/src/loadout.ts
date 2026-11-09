// What the partner thinks with, and who does the tasks (D89, design/ai-loadout.md): the rules a
// person said, why a task is on the AI agent it is on, and who else could do it. Pure data:
// core computes it (packages/core/src/candidates.ts, rules.ts), clients word it.

/** The share of the partner's own account kept for its answers; tasks can't use it (D89: fixed in v1). */
export const PARTNER_RESERVE = 0.1;

/** A rule the person said in the conversation: work of a kind goes to one AI agent. */
export interface RuleView {
  id: string;
  /** The rule in one line, in the words it was said in ("后端的事 → Codex"). */
  text: string;
  harness: string; // a HarnessId
  model?: string;
  /** Words that mark the kind of work, in any language; a task whose title or brief has one matches. */
  match: string[];
  createdAt: string; // ISO
}

/**
 * Why a task is on the AI agent it is on. Clients word it:
 *  - default: Ducter picked the best fit with the most limit left (no reason line);
 *  - rule:    the person's rule (ruleId, text);
 *  - limit:   the first choice was short of limit (from: who it would have been);
 *  - unavailable: the first choice (the partner's pick or a rule's) can't take it for another
 *             reason (from, blocked: signed out, off, not installed, …);
 *  - you:     the person switched it, or picked it on New task;
 *  - partner: the partner picked it in the moment (text: its words, e.g. "you asked for Codex").
 */
export interface BodyWhy {
  kind: "default" | "rule" | "limit" | "unavailable" | "you" | "partner";
  ruleId?: string;
  text?: string;
  from?: string;
  blocked?: CandidateBlock;
}

export interface TaskBody {
  harness: string;
  model?: string;
  why: BodyWhy;
}

/**
 * Why an AI agent can't take a task: not_installed, signed_out, off (用它做事 / Use it for tasks
 * is off), reserve (only the part kept for the partner is left), no_model (pi before a model is
 * picked), offline (its device can't be reached).
 */
export type CandidateBlock = "not_installed" | "signed_out" | "off" | "reserve" | "no_model" | "offline";

/** One AI agent (and model) that could do a task, best first, with why in words the client builds. */
export interface Candidate {
  harness: string;
  model?: string;
  /** Doing the task now. */
  current?: boolean;
  /** fit: the shipped tier table says it suits this kind of work; fast: quick and light on the limit. */
  reason: { kind: "rule" | "fit" | "fast" | "left" | "current"; ruleId?: string; text?: string };
  /** 0..1, as the harness reported it; absent = it doesn't report one. */
  left?: number;
  resetsAt?: string;
  /** Paid per use: say so before it costs anything. */
  billing?: "plan" | "usage";
  /** Set when it can't take the task; the list still shows it, greyed, with this reason. */
  blocked?: CandidateBlock;
}
