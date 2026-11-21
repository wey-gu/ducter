// One thing a detector proposes and the bar judges (D165 §3–§4).
import type { FindHow, FindKind, Place, TaskNeeds } from "@ducter/protocol";

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
  step?: { kind: StepKind; goLabel: { zh: string; en: string }; brief: string; data?: Record<string, string>; needs?: TaskNeeds; place?: Place; project?: string };
  /** D458: where it came from, said under its words ("从你和 Codex 11 月 12 日的对话想到的"): code's words. */
  origin?: { zh: string; en: string };
  /** D458: the spotter (wider.ts) already chose it and wrote its words: the bar keeps it on code's tests alone. */
  spotted?: boolean;
  facts: string[];
  /** D243: what it is about, in a few words ("NH 108", "Conductor"): a later notice on the same thing is an update to it. */
  topic?: string;
  /** D243: typed details for the bar only (an effect, a count), never said as they are. */
  notes?: string[];
  /** D388: what each `how` line's source says about it, in both languages (the same order as how). */
  says?: { zh: string; en: string }[];
  /** D388: what it doesn't know yet ("几点开始"), and what it did not change ("日历我没改。"). */
  unknown?: { zh: string; en: string };
  untouched?: { zh: string; en: string };
  /**
   * D388: the question it leaves open once said (plans.ts): the plan's sheet, name, the day the
   * plan is on and the days in dispute, and what is still open (the day, the time). The engine
   * keeps it and says the answer once when a later source gives it.
   */
  open?: { sheet: string; name: string; day: string; place?: string; fields: ("day" | "time")[]; days: string[] };
  /** D403: not urgent, but what 只说急的 still says (a person who asked again, or waited three working days). */
  pressing?: boolean;
  /** D403: where a reply to it goes (a mail thread): the engine drafts one before it is said. */
  reply?: ReplyTarget;
  /** D403: the draft written for it, attached by the engine (never by a detector). */
  draft?: { text: string; lang: string; check?: string };
}

/** D403: one thread a reply can be sent to: the source, the message it answers, who it goes to. */
export interface ReplyTarget {
  connectionId: string;
  service: string;
  account?: string;
  thread?: string;
  messageId: string;
  /** Their address (lower case) and their name, as their mail gave it. */
  to: string;
  name?: string;
  /** The subject it answers (the reply's subject is "Re: " and this). */
  subject: string;
}
