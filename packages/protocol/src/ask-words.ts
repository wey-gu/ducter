// research/244 rule 5: a question stands alone. A task's question said in the partner's words
// keeps every point, or the card keeps its own question and the words only introduce it. Code
// reads only structure here, never meaning: how many points the task's question makes, and which
// #refs it names. A sentence that drops one of them is an introduction, not the question.
const POINT = /(^|\n)\s*(?:\d+[.)、]|[-*\u2022]|第[一二三四五六七八九十]+)/g;
const REF = /(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#\d+/g;

/** How many numbered or bulleted points a text makes. */
export function pointCount(text: string): number {
  return [...String(text ?? "").matchAll(POINT)].length;
}

/** Every #ref a text names, lowercased (owner/repo#n when it has one, else #n). */
export function refsNamed(text: string): string[] {
  return [...new Set((String(text ?? "").match(REF) ?? []).map((r) => r.toLowerCase()))];
}

/** Whitespace-collapsed, case-folded: how an object's name is compared. */
const norm = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Whether the partner's words keep the task's question: all its points (when it makes more than
 * one), every #ref it names, and every object the card's question is about in words (D667,
 * research/247 Brief A: the task's title, the to-do's title). A one-point question is covered by
 * the same check. A question with none of them is the partner's to say.
 */
export function keepsPoints(question: string, said: string, objects: (string | undefined)[] = []): boolean {
  const q = String(question ?? "");
  const s = String(said ?? "");
  if (!s.trim()) return false;
  const points = pointCount(q);
  if (points >= 2 && pointCount(s) < points) return false;
  for (const ref of refsNamed(q)) {
    // A bare "#11230" counts when the said words name that number at all (the repo may be dropped).
    const short = ref.includes("#") ? ref.slice(ref.indexOf("#")) : ref;
    if (!s.toLowerCase().includes(ref) && !s.toLowerCase().includes(short)) return false;
  }
  // The question's object must survive in words, not only in the number or the card around it.
  const sn = norm(s);
  for (const obj of objects) {
    const o = norm(obj ?? "");
    if (o && !sn.includes(o)) return false;
  }
  return true;
}
