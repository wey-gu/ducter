// One thing a detector proposes and the bar judges (D165 §3–§4).
import type { FindHow, FindKind, TaskNeeds } from "@ducter/protocol";

export type StepKind = "lookup" | "read" | "draft";

export interface Candidate {
  /** Stable for the same evidence: a find is never said twice unless something changed. */
  key: string;
  kind: FindKind;
  /** 0..100: what missing it costs, and how soon. */
  cost: number;
  /** Costs something if it waits until tomorrow, and needs the person (the "now" rung). */
  urgent: boolean;
  dueAt?: string;
  sender?: string;
  /** Addresses of the people it involves (for meeting prep). */
  people: string[];
  how: FindHow[];
  words: { zh: string; en: string };
  /**
   * The one next step. brief: Ducter's own instructions, with no words from anyone's mail in them;
   * data: the fields it is about (names, subjects, asks), which came from other people's mail and
   * reach the task fenced as data, never as instructions (D62, research/48 P3).
   */
  step?: { kind: StepKind; goLabel: { zh: string; en: string }; brief: string; data?: Record<string, string>; needs?: TaskNeeds };
  facts: string[];
}
