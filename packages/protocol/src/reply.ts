// D236: the words of a reply's quote, the same on core (what the Log keeps) and on every client
// (what the composer's imprint shows before core has it).

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** The words of a message as a person reads them: Markdown marks dropped, one line. */
export function plainWords(md: string): string {
  return flat(
    md
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/(^|\n)\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+/g, "$1")
      .replace(/(\*\*|__|`|~~)/g, "")
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_]/g, "$1$2"),
  );
}

/** At most n characters, cut at a word (anywhere in CJK), with an ellipsis when cut. */
export function clipQuote(s: string, n = 200): { text: string; clipped: boolean } {
  const t = flat(s);
  if (t.length <= n) return { text: t, clipped: false };
  let cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  if (sp > n * 0.6 && !/[一-鿿]/.test(cut.slice(sp - 1, sp + 1))) cut = cut.slice(0, sp);
  return { text: cut.replace(/[\s,.;:，。；：、]+$/, "") + "…", clipped: true };
}
