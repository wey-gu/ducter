// D385: handing several over, as data (design/handover.md). Pure, so the web's tests read it without
// a DOM; handover.tsx draws it. The sheet's sections by sort group, the find's line as separate facts
// (D291: never joined with a dot), the shapes in the order offered, the plan's sections in the shapes'
// own words, a hand-over group's state, and review together's counts.
import type { FindFacet, FindSaid, FindSummary, FoundItem, GroupHandView, HandHow, HandPlan, HandShape, PileGroup, PlanPart, ReviewRow, TaskGroupView } from "@ducter/protocol";

export const SECTION_ORDER: PileGroup[] = ["do", "decide", "later", "close"];

/** The sheet's list by sort group, in the order shown (do, decide, later, close), empty groups left out. */
export function sections(items: FoundItem[]): { group: PileGroup; items: FoundItem[] }[] {
  return SECTION_ORDER.map((group) => ({ group, items: items.filter((p) => p.group === group) })).filter((s) => s.items.length);
}

/**
 * The find's line (D428): the head (找到 5 个讲「UI 走查」的, the person's own words), then what was
 * ticked when not all (先勾了最像的 10 个) and the unsure ones (2 个不太确定，没勾), each its own fact.
 */
export function foundLine(f: FindSummary, t: (k: string, ...a: unknown[]) => string, ticked?: number, chips: FindFacet[] = []): { head: string; facts: string[] } {
  // D454: read by one fact alone, the line says it back in that fact's words (100gle 分给你的，有 4 个).
  const one = chips.length === 1 && chips[0]!.kind !== "about" ? chips[0]! : undefined;
  const head = f.subject ? t("ho.found", f.n, f.subject) : !f.n ? t("ho.found.none") : one ? t("ho.found.fact", f.n, one.text) : t("ho.found.plain", f.n);
  const facts: string[] = [];
  if (f.n && f.cut && ticked !== undefined) facts.push(t("ho.found.ticked", ticked));
  if (f.n && f.maybe) facts.push(t("ho.found.maybe", f.maybe));
  if (f.handed) facts.push(t("ho.found.handed", f.handed));
  return { head, facts };
}

/** D454: a row's reason that only repeats a chip the line already shows (每行都写 100gle 分给你的): left off. */
export function quietBecause(because: string, said: FindSaid | undefined): boolean {
  return (said?.facets ?? []).some((c) => c.kind !== "about" && c.text === because);
}

/** D428: the reading's chips as drawn: every fact, the about last; none when nothing was read beyond the words themselves. */
export function readingChips(said: FindSaid | undefined): FindFacet[] {
  const fs = said?.facets ?? [];
  // The about alone is the words as typed: the field already shows them.
  return fs.length === 1 && fs[0]!.kind === "about" && !said?.dropped?.length ? [] : fs;
}

/** What the sheet's shape list holds: 加进「{group}」 first when a live group shares the subject, then the offered shapes. */
export type ShapeChoice = HandShape | "add";
export function shapeChoices(how: HandHow | undefined): ShapeChoice[] {
  if (!how || !how.shapes.length) return how?.addTo ? ["add"] : [];
  return [...(how.addTo ? (["add"] as const) : []), ...how.shapes];
}
/** The suggested one: adding to a live group when there is one, else the code's default. */
export const suggestedShape = (how: HandHow | undefined): ShapeChoice | undefined => (how?.addTo ? "add" : how?.shape);

/** Each shape's line beneath it (the raters needed it: 先出个方案 is always with 你点头再做). */
export function shapeLine(s: ShapeChoice, how: HandHow, t: (k: string, ...a: unknown[]) => string, errands: boolean): string {
  switch (s) {
    case "plan":
      return t("ho.shape.plan.line");
    case "one":
      return errands ? t("ho.shape.one.errand") : t("ho.shape.one.line");
    case "one_by_one":
      return how.repo ? t("ho.shape.one_by_one.line", how.repo) : t("ho.shape.one_by_one.plain");
    case "side_by_side":
      return t("ho.shape.side_by_side.line", how.cap);
    case "add":
      return how.addTo?.planning ? t("ho.shape.add.planning") : t("ho.shape.add.line", how.addTo?.n ?? 0);
  }
}

/** A to-do's number as the plan says it: "#405" inside one repository, "mem#405" across several. */
export function refLabel(ref: string, oneRepo: boolean): string {
  const m = /^[\w.-]+\/([\w.-]+)(#\d+)$/.exec(ref);
  if (!m) return ref.replace(/^.*\//, "");
  return oneRepo ? m[2]! : `${m[1]}${m[2]}`;
}
export const refsLabel = (refs: string[], oneRepo: boolean) => refs.map((r) => refLabel(r, oneRepo)).join(" + ");
export const oneRepoOf = (refs: string[]) => new Set(refs.map((r) => r.replace(/#\d+$/, ""))).size <= 1;

/** The plan's sections in the shapes' own words, empty ones left out, each with its parts in order. */
export type PlanSection =
  | { kind: "fixed"; rows: HandPlan["fixed"] }
  | { kind: "one" | "line" | "side"; parts: PlanPart[] }
  | { kind: "later"; rows: HandPlan["later"] };
export function planSections(p: HandPlan): PlanSection[] {
  const out: PlanSection[] = [];
  if (p.fixed.length) out.push({ kind: "fixed", rows: p.fixed });
  if (p.one.length) out.push({ kind: "one", parts: p.one });
  if (p.line.length) out.push({ kind: "line", parts: p.line });
  if (p.side.length) out.push({ kind: "side", parts: p.side });
  if (p.later.length) out.push({ kind: "later", rows: p.later });
  return out;
}
/** How many tasks Go would open. */
export const planTasks = (p: HandPlan) => p.one.length + p.line.length + p.side.length;

/** A hand-over group's state as its card says it. */
export type HandState = "planning" | "ready" | "held" | "failed" | "going" | "review" | "sent";
export function handState(h: GroupHandView | undefined): HandState | undefined {
  if (!h) return undefined;
  // D638: opening failed after Go was answered: the card says why, where the person looks.
  if (h.error) return "failed";
  if (h.review === "sent") return "sent";
  if (h.review === "ready") return "review";
  const p = h.plan;
  if (p && p.state !== "going") return p.state;
  return "going";
}
/** Whether the card wants the person now (the plan waits, the review waits). */
export const handNeeds = (g: TaskGroupView) => {
  const s = handState(g.hand);
  return s === "ready" || s === "held" || s === "review" || s === "failed";
};

/** Review together: the refs a Go sends (every to-do of a row not left out), and its counts. */
export function reviewKeep(rows: ReviewRow[], dropped: Set<number>): string[] {
  // research/244 rule 9: only a row whose PR really merged has a line to send.
  return rows.flatMap((r, i) => (dropped.has(i) || r.merged === false ? [] : r.items.map((x) => x.ref)));
}

/** The set card: the ticks it carries into the sheet (the card's own, else the set's default). */
export function setTicks(setId: string, def: string[], own: Map<string, Set<string>>): Set<string> {
  return own.get(setId) ?? new Set(def);
}
