// D385: handing over several to-dos (design/handover.md). One sheet from every door: what (the
// ticked set, found by words and by meaning), 给{name}的话 / A note for {name} (and one per item),
// and how (a shape, 在哪儿做 / Where, 谁来做 / Who does it). Go makes a D360 group for 2+; plan
// first is its first part, a read-only task that reports a typed plan; 一起过目 / Review together
// sends every comment of a finished group behind one Go.
import type { Place } from "./index.ts";
import type { PileItem, SourceItemRef } from "./task-sources.ts";

/**
 * The four shapes (the words are the glossary's; never "一起做 / Together", read as side by side):
 *   plan          先出个方案 / Plan first: a read-only first part proposes the rest; nothing else starts until Go
 *   one           合成一件做 / As one task: one task, one PR that "Fixes" each (one repository, or errands)
 *   one_by_one    一件做完接下一件 / One after another (D360): each from the one before's branch
 *   side_by_side  同时做 / Side by side (D360): HAND_CAP at a time, a PR each
 */
export const HAND_SHAPES = ["plan", "one", "one_by_one", "side_by_side"] as const;
export type HandShape = (typeof HAND_SHAPES)[number];

/** How many of a side-by-side hand-over run at once (the pile's queue: PILE_CAP). */
export const HAND_CAP = 3;
/** The note's and each item note's length. */
export const HAND_NOTE_MAX = 2000;
export const HAND_ITEM_NOTE_MAX = 600;
/** How many to-dos one hand-over takes (a group holds GROUP_MEMBERS_MAX tasks; as one task / plan first read them all). */
export const HAND_MAX = 40;
/** The pile shows 讲的是 / Subjects past this many open, for a subject with at least SUBJECT_MIN. */
export const SUBJECTS_PAST = 20;
export const SUBJECT_MIN = 3;
export const SUBJECTS_SHOWN = 8;

/** What code knows of a set to choose its default shape (never a model's choice). */
export interface ShapeFacts {
  /** The to-dos: their app and repository. */
  items: { kind: string; where?: string }[];
  /** The set was found by subject (a 讲的是 chip, the find field's meaning, the conversation's find). */
  bySubject?: boolean;
}

/**
 * D385's table, by code: one to-do: no shape; errands (every one an Obsidian line): as one task; a
 * subject set, or 4+ in one repository: plan first; 2–3 in one repository: one after another; the
 * rest (small ones across repositories, the do row, the morning picks): side by side.
 */
export function defaultShape(f: ShapeFacts): HandShape | undefined {
  const n = f.items.length;
  if (n < 2) return undefined;
  if (f.items.every((i) => i.kind === "obsidian")) return "one";
  const repos = new Set(f.items.map((i) => (i.kind === "github" ? (i.where ?? "").toLowerCase() : "\u0000")));
  const oneRepo = repos.size === 1 && !repos.has("\u0000") && !repos.has("");
  if (f.bySubject || (oneRepo && n >= 4)) return "plan";
  if (oneRepo) return "one_by_one";
  return "side_by_side";
}

/** As one task is offered only inside one repository, or for errands (D385). */
export function canBeOne(items: ShapeFacts["items"]): boolean {
  if (items.length < 2) return false;
  if (items.every((i) => i.kind === "obsidian")) return true;
  const repos = new Set(items.map((i) => (i.kind === "github" ? (i.where ?? "").toLowerCase() : "\u0000")));
  return repos.size === 1 && !repos.has("\u0000") && !repos.has("");
}

/** 在哪儿做 / Where: a computer, and why it was chosen (said on the row). */
export interface HandWhere {
  /** "local" for the home, else the worker's id. */
  device: string;
  /** The computer's name as the person knows it. */
  name: string;
  /**
   * note    你写了 {name} / Your note says {name}
   * rule    按你的规则 / Your rule
   * repo    {repo} 在这台上 / {repo} is on this one
   * home    the home (no folder for it anywhere)
   * picked  the person tapped it
   */
  why: "note" | "rule" | "repo" | "home" | "picked";
  /** repo: the repository it holds; rule: the rule's words. */
  said?: string;
  /** Whether the set's repository is on this computer (a task there gets its folder). */
  hasRepo?: boolean;
}

/** 谁来做 / Who does it: an agent, or the partner choosing per task as usual. */
export interface HandWho {
  /** A HarnessId; absent: {name} picks per task (the usual rules). */
  harness?: string;
  why: "rule" | "usual" | "picked";
  said?: string;
}

/** The sheet's how, made by core from the set and the note (pile_how). */
export interface HandHow {
  /** Suggested shape (absent for one to-do: it is one task). */
  shape?: HandShape;
  /** The shapes offered, in order (as one task only when it can be). */
  shapes: HandShape[];
  /** The set's one repository, when it has one ("owner/repo"). */
  repo?: string;
  /** A live group on the same subject: offered first as 加进「{name}」 / Add to "{name}". */
  addTo?: { groupId: string; name: string; n: number; planning: boolean };
  where: HandWhere;
  wheres: HandWhere[];
  who: HandWho;
  /** Agents that could do it (HarnessIds). */
  whos: string[];
  cap: number;
  /** The note states a lasting where ("验证都去 haswell"): asked once as a rule after Go. */
  lasting?: boolean;
}

/** The find's line, as separate facts: 找到 9 件讲{subject}的 · 标题里写着的 6 件 · 说的是同一件事的 3 件. */
export interface FindSummary {
  n: number;
  /** What they're about, in the person's language (the model's name for it, a chip's, or the words asked). */
  subject?: string;
  /** Found by code: the words or number in the title, or the source's own label. */
  inTitle: number;
  byLabel: number;
  /** Found only by meaning (the cheapest model, across languages). */
  byMeaning: number;
  /** Meaning wasn't read: no model, or it failed (code's match only). */
  noMeaning?: "no_model" | "error";
}

/** One to-do in a find: the pile's item, how it was found. */
export type FoundItem = PileItem & { by: "title" | "label" | "meaning" | "subject" | "ref" };

/** D385: a set of to-dos found in the conversation (todos do=find), shown as a tickable card. */
export interface TodoSet {
  setId: string;
  query?: string;
  subject?: string;
  found: FindSummary;
  refs: string[];
  /** Ticked by default (the do ones). */
  ticked: string[];
  /** The rows the card shows (the first few), the rest said as 还有 n 件 / n more. */
  rows: FoundItem[];
  /** Handed over: the group it became. */
  groupId?: string;
}

// ---------- plan first ----------

/** A part of the plan: one task (one to-do or several as one), in the order it runs. */
export interface PlanPart {
  /** Stable within a plan: "p1", "p2", … */
  id: string;
  /** The to-dos it covers (refs from the set). */
  refs: string[];
  /** Its title, in the person's language. */
  title: string;
  /** Why in one line (why together, why in this place). */
  why: string;
  /** one_by_one: its place in line (1-based); side_by_side: absent. */
  step?: number;
}

/** The typed plan a plan-first task reports (its plan_report tool), then shown as the plan card. */
export interface HandPlan {
  /** Already fixed: only to close, each with where it was fixed and the line it would leave. */
  fixed: { ref: string; where: string; comment?: string }[];
  /** Several to-dos as one task each. */
  one: PlanPart[];
  /** In order (each from the one before's branch). */
  line: PlanPart[];
  /** Independent ones, side by side. */
  side: PlanPart[];
  /** Leave for now, with why. */
  later: { ref: string; why: string }[];
  /** The note's limits, as separate facts (都在 haswell 上验证, 不动数据库迁移). */
  limits: string[];
  /** What it read: n to-dos and the repository's code. */
  read: { n: number; repo?: string };
}

/** The plan's state on the group. */
export interface GroupPlanView {
  taskId: string;
  state: "planning" | "ready" | "held" | "going" | "failed";
  plan?: HandPlan;
  /** The plan card (a decision) while it waits. */
  decisionId?: string;
  /** Per-part notes the person added on the card (给这件的话…), by part id. */
  notes?: Record<string, string>;
  /** The plan's own words when it came without a typed plan (Go then runs them one after another). */
  summary?: string;
}

/** D385: what a hand-over group carries on On hand (TaskGroupView.hand). */
export interface GroupHandView {
  shape: HandShape;
  /** The to-dos handed over (refs), and their titles for the card. */
  items: SourceItemRef[];
  note?: string;
  subject?: string;
  where?: { device: string; name: string };
  harness?: string;
  plan?: GroupPlanView;
  /** Already fixed (from the plan): closed in review together. */
  fixed?: { ref: string; where: string; comment?: string }[];
  /** 一起过目 / Review together: offered when every part is done; sent when its Go was given. */
  review?: "ready" | "sent";
  /** Side by side: at most this many at once. */
  cap?: number;
  /** Each part's to-dos (taskId → refs), as it opened. */
  parts?: Record<string, string[]>;
}

// ---------- review together ----------

export interface ReviewRow {
  /** The part's task (absent for an already-fixed one). */
  taskId?: string;
  items: SourceItemRef[];
  /** Its PR (address and #n), or where it was already fixed. */
  pr?: { url?: string; label: string };
  fixedIn?: string;
  /** passed, failed (n), none known. */
  checks?: { state: "passed" | "failed" | "running"; failed?: number };
  /** Lines added and removed. */
  size?: { added: number; removed: number };
  /** Its result line, in the person's language. */
  result?: string;
  /** The line each of its to-dos gets (in the to-do's own language), and whether it also closes. */
  comment: string;
  close: boolean;
}

export interface GroupReview {
  groupId: string;
  name: string;
  rows: ReviewRow[];
  /** PRs waiting to be merged, and already-fixed ones. */
  prs: number;
  fixed: number;
}
