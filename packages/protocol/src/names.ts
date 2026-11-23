// D471, D482: how a name is said, one implementation for the home and the web client (the Mac's is
// views/onhandnames.go, kept in step by apps/desktop/internal/views/onhand_d471_test.go). A title a
// source already cut is said to its last real word; a name inside a sentence is cut at a word's end,
// never inside a word ("A partially faile…" never again, D471 round 1 and the morning note, D482).

/** Words a title can't end on once a source cut it ("…with the…"): English function words. */
const DANGLING = new Set(["a", "an", "the", "and", "or", "of", "to", "for", "with", "on", "in", "at", "by", "from", "into", "when", "that", "which", "is", "are", "was", "were", "be", "as", "but", "if", "its", "it", "this", "their", "your", "our", "under", "over", "about", "after", "before", "against", "between", "during", "without", "within", "via", "while", "than", "so", "because", "not", "has", "have"]);

/**
 * A title that arrived already cut (a GitHub issue's, a source's: "Reconcile the orbit plugin's tail
 * offsets with the…") said whole up to its last real word, never cut again: the ellipsis and the
 * dangling function words before it go. Han text keeps its words as they are.
 */
export function untrail(title: string): string {
  let s = title.trim();
  if (!/(…|\.\.\.)$/.test(s)) return s;
  s = s.replace(/\s*(…|\.\.\.)$/, "").replace(/[ ,，:：;；\-—]+$/, "");
  const words = s.split(" ");
  while (words.length > 2 && DANGLING.has(words.at(-1)!.toLowerCase())) words.pop();
  return words.join(" ").replace(/[ ,，:：;；\-—]+$/, "");
}

/** A task's title as a card says it: what it is, without the parenthetical details, untrailed. */
export function shortTitle(title: string): string {
  let s = title.trim();
  for (const [o, c] of [["（", "）"], ["(", ")"], ["【", "】"], ["[", "]"]] as const) {
    for (;;) {
      const i = s.indexOf(o);
      if (i < 0) break;
      const j = s.indexOf(c, i);
      if (j < 0) break;
      const cut = `${s.slice(0, i)} ${s.slice(j + c.length)}`.trim();
      if (!cut) break;
      s = cut;
    }
  }
  s = s.split(/\s+/).join(" ").replace(/[ ,，:：\-—]+$/, "");
  s = untrail(s);
  return s || title.trim();
}

/** Columns for the eye: a Han or full-width character counts two. */
export function nameWidth(s: string): number {
  return [...s].reduce((n, ch) => n + (/[㐀-鿿＀-￯]/.test(ch) ? 2 : 1), 0);
}

/**
 * A name said inside a sentence, at most `max` columns (Han count 2): cut at a word's end (a space,
 * or Han punctuation), never inside a word; "…" only when it was cut.
 */
export function sayName(title: string, max = 28): string {
  return cutAtWord(shortTitle(title) || title.trim(), max);
}

/**
 * Any words shown short (a source's title under 怎么知道的, a lead's name): untrailed, then cut at a
 * word's end within `max` columns, parentheses kept (sayName drops them, for a task's name).
 */
export function cutAtWord(text: string, max: number): string {
  const s = untrail(text.replace(/\s+/g, " ").trim());
  if (nameWidth(s) <= max) return s;
  let out = "";
  let lastBreak = 0;
  for (const ch of s) {
    if (nameWidth(out + ch) > max - 1) break;
    out += ch;
    if (/[\s，、：；。,;:]/.test(ch) || /[㐀-鿿]/.test(ch)) lastBreak = out.length;
  }
  // Latin text ends at the last space; Han text may end at any character (each is a word).
  const lastSpace = out.lastIndexOf(" ");
  const cut = /[㐀-鿿]/.test(out.slice(-1)) ? out.length : lastSpace > out.length / 2 ? lastSpace : lastBreak > out.length / 2 ? lastBreak : out.length;
  return `${out.slice(0, cut).replace(/[\s，、：；。,;:\-—]+$/, "")}…`;
}

/**
 * D496: a name cut for length ends where a word ends, never inside one ("…-tests-intermittentl"
 * became "…-tests"): when the cut falls between two letters of a spaced script, it goes back to
 * the last `-` (or `.`, `_`), if that keeps more than half. Han, kana and Hangul are a word each.
 */
export function cutAtWordEnd(kept: string, next: string): string {
  const word = /[\p{L}\p{N}]/u;
  const each = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const last = [...kept].at(-1) ?? "";
  if (!next || !word.test(next) || !word.test(last) || each.test(next) || each.test(last)) return kept;
  const at = Math.max(kept.lastIndexOf("-"), kept.lastIndexOf("_"), kept.lastIndexOf("."));
  return at > kept.length / 2 ? kept.slice(0, at) : kept;
}
