// D456: finding forgives the hand. Two loose ways a typed word still finds its task, shared by the
// home's Past index (core/src/past.ts), the clients' own match over what they hold
// (web onhand.tsx, the Mac's onhandlist.go mirrors it) and so ⌘K everywhere:
//   - a slip of one letter in a Latin word of five or more ("compactoin" → compaction): one
//     letter wrong, missing, extra, or two swapped (Damerau, distance 1);
//   - the first letters of the title's words ("wgc" → "WAL 的 group commit", "lruk" → "LRU-K").
// Both are weaker than the word itself, so an exact match always ranks first. Deterministic and
// instant, the same on every device (design/sessions.md: never a model).

const WORD = /[a-z0-9]+/g;
const LATIN = /^[a-z][a-z0-9]*$/;

/** True when a and b are at most one edit apart (one letter changed, added, dropped, or two swapped). */
export function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (i === la) return true;
    // A swap of two neighbours, or one letter changed.
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true;
    return a.slice(i + 1) === b.slice(i + 1);
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/** A word in text one slip away from term (term: lowercase Latin, five letters or more). */
export function nearIn(term: string, text: string): { s: number; at: number } {
  if (term.length < 5 || !LATIN.test(term) || !text) return { s: 0, at: -1 };
  for (const m of text.matchAll(WORD)) {
    const w = m[0];
    if (Math.abs(w.length - term.length) > 1 || w[0] !== term[0] && w[1] !== term[1]) continue;
    if (oneEdit(term, w)) return { s: 0.55, at: m.index ?? 0 };
  }
  return { s: 0, at: -1 };
}

const latinWords = (title: string) => title.split(/[^A-Za-z0-9]+/).filter((w) => /^[A-Za-z]/.test(w));

/** The first letters of a title's Latin words ("WAL 的 group commit" → "wgc"), and the same with a
 *  word in capitals spelled out ("LRU-K" → "lk" and "lruk"). */
export function initialsOf(title: string): [string, string] {
  const ws = latinWords(title);
  return [ws.map((w) => w[0]!.toLowerCase()).join(""), ws.map((w) => (/^[A-Z]{2,}[0-9]*$/.test(w) ? w.toLowerCase() : w[0]!.toLowerCase())).join("")];
}

/** True when term (3–6 Latin letters) is a run of the title's initials, at least two words' worth. */
export function initialsIn(term: string, title: string): boolean {
  if (term.length < 3 || term.length > 6 || !/^[a-z]+$/.test(term)) return false;
  const [firsts, spelled] = initialsOf(title);
  return (firsts.length > 1 && firsts.includes(term)) || (spelled !== firsts && spelled.includes(term) && !latinWords(title).some((w) => w.toLowerCase() === term));
}

/** The client's own loose match of one typed word against what it holds for a task. */
export function looseMatch(word: string, hay: string, title: string): boolean {
  return hay.includes(word) || nearIn(word, hay).s > 0 || initialsIn(word, title);
}
