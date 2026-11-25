// D574: the counts a rubric states (lines, sentences), counted by code, never by the judge. An LLM
// judge counting "one or two short sentences" was the largest single source of verdicts that flipped
// between runs of the same code; the code counts the same way every time, the judge judges meaning.

/** A message's lines: its non-empty lines (paragraphs, list items). */
export function lineCount(text: string): number {
  return text.split(/\n+/).filter((l) => /[\p{L}\p{N}]/u.test(l)).length;
}

/**
 * A message's sentences: each line ends one at least; inside a line a sentence ends at 。！？ (any
 * closing quote or bracket stays with it) or at . ! ? followed by a space. Commas, colons and
 * semicolons never end one. A piece with no letter or digit (a lone quote, an emoji) is no sentence.
 */
export function sentenceCount(text: string): number {
  let n = 0;
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)、])\s+/, "").replace(/\*\*/g, "").trim();
    if (!/[\p{L}\p{N}]/u.test(line)) continue;
    const parts = line.split(/(?<=[。！？][」』”"’）)]*)|(?<=[.!?][」』”"’）)]*)\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
    n += Math.max(1, parts.length);
  }
  return n;
}
