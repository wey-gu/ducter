// D579: a rubric as a numbered checklist (`--judge-form points`). Split into points, the judge
// answers yes or no per point and code takes the verdict: a "must" point answered no fails the
// scenario. A point that only permits something ("… is fine", "may …") is kept as context and never
// fails it, so the rubric means what it said. Measured against the holistic pass/fail on the same
// transcripts it flipped more, not less (35 vs 26 of 308, one answer each; 21 vs 12 with three), so
// it is an option to measure with, not the default.

export interface Point {
  text: string;
  /** False for a point that only allows something: the judge reads it, its answer never fails. */
  must: boolean;
}

// Abbreviations whose period never ends a sentence.
const ABBR = /\b(?:e\.g|i\.e|vs|etc|cf|approx|no|Mr|Dr|St)\.$/i;

/** The rubric's sentences, in order: a sentence ends at . ! ? followed by a space and a new start, or at 。！？. */
export function rubricSentences(rubric: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0; // inside (…) or "…" or 「…」 a period never ends a point
  let quote = false;
  let single = false; // 'quoted words' (an apostrophe inside a word is no quote)
  const chars = [...rubric];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    cur += c;
    const before = chars[i - 1] ?? " ";
    const after = chars[i + 1] ?? " ";
    if (c === "(" || c === "（" || c === "「" || c === "“") depth++;
    else if ((c === ")" || c === "）" || c === "」" || c === "”") && depth > 0) depth--;
    else if (c === '"') quote = !quote;
    else if (c === "'" && !single && /[\s(:]/.test(before) && !/\s/.test(after)) single = true;
    else if (c === "'" && single && !/[\p{L}\p{N}]/u.test(after)) single = false;
    if (depth > 0 || quote || single) continue;
    const next = chars[i + 1];
    const endsZh = c === "。" || c === "！" || c === "？";
    const endsEn = (c === "." || c === "!" || c === "?") && (next === undefined || /\s/.test(next)) && !ABBR.test(cur.trimEnd());
    if (endsZh || endsEn) {
      if (/[\p{L}\p{N}]/u.test(cur)) out.push(cur.trim());
      cur = "";
    }
  }
  if (/[\p{L}\p{N}]/u.test(cur)) out.push(cur.trim());
  // A short label ("D511:", "Pass if:") or a fragment under four words joins the next sentence.
  const merged: string[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && (prev.split(/\s+/).length < 4 || /:$/.test(prev))) merged[merged.length - 1] = `${prev} ${s}`;
    else merged.push(s);
  }
  return merged;
}

// A point that only permits: its words say something is allowed, not required.
// Its main clause permits: it opens with "Acceptable"/"Optionally", its subject "may", or it ends on
// "is fine" (before any colon). A "may" or "is fine" in a parenthesis or a side clause of a sentence
// that requires something ("says so in one line, optionally with …") leaves that sentence a must.
const PERMITS = [
  /^(?:acceptable|optionally)\b/i,
  /^(?:it|they|the [\w-]+|a [\w-]+ [\w-]+) may\b/i,
  /\b(?:is|are) (?:also |too )?(?:fine|ok|okay|allowed|acceptable|welcome|right)(?: too| here)?$/i,
];
const REQUIRES = /\b(?:must|never|but|fails?|required)\b/i;

/** A rubric's checklist, mechanically: one point per sentence, each a must unless it only permits. */
export function checklist(rubric: string): Point[] {
  return rubricSentences(rubric).map((text) => {
    const main = text.replace(/\s*\([^()]*\)/g, "").split(/:\s/)[0]!.replace(/[.!?。]+$/, "").trim();
    const clauses = main.split(/;\s*/).map((c) => c.replace(/[.!?。]+$/, "").trim()).filter(Boolean);
    const allows = clauses.length > 0 && clauses.every((c) => PERMITS.some((re) => re.test(c))) && !REQUIRES.test(main.replace(/not required/i, ""));
    return { text, must: !allows };
  });
}

export type Answer = "yes" | "no" | "n/a";

/**
 * The verdict, by code: fails when any must point (1-based numbers, as the judge saw them) is "no",
 * or the house rules' point (number 0) is "no". A missing answer to a must point is a fail too.
 */
export function verdictOf(points: Point[], answers: Map<number, Answer>): { pass: boolean; failed: number[] } {
  const failed: number[] = [];
  if (answers.get(0) === "no" || !answers.has(0)) failed.push(0);
  points.forEach((p, k) => {
    const a = answers.get(k + 1);
    if (p.must && (a === "no" || a === undefined)) failed.push(k + 1);
  });
  return { pass: failed.length === 0, failed };
}
