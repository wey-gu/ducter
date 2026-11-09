// Lexical recall over the Log (design/memory.md "Recall", research/14 §6.5).
//
// SQLite's own tokenizers can't search Chinese: `unicode61` keeps a whole run of Han characters
// as one token, and `trigram` can't match a 2-character word. So Ducter tokenizes in code: a CJK
// run becomes its overlapping character bigrams ("不稳定" → "不稳 稳定"), Latin words and
// numbers stay words (lowercased). That text goes into an FTS5 table over `unicode61`, which then
// only splits on the spaces we put in. A query term is tokenized the same way and searched as a
// phrase, so a Chinese term matches exactly where its characters are adjacent.
//
// Ranking fuses (reciprocal rank) three lists: BM25 over the bigram index (any term), the exact
// substring list (every term, newest first, which is how a quote is found), and recency. The
// user's own words get a small boost: "what exactly did I say" is the question search must not
// miss (research/15: verbatim quotes were search's weakest category).

const CJK_RUN = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]+/;
const SPLIT = new RegExp(`(${CJK_RUN.source})`, "u");
const WORD = /[\p{L}\p{N}_]+/gu;

/** Tokens of a text: CJK bigrams (a lone character stays itself) and lowercased words. */
export function bigramTokens(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(SPLIT)) {
    if (!part) continue;
    if (CJK_RUN.test(part) && part.match(CJK_RUN)![0] === part) {
      const cs = [...part];
      if (cs.length === 1) out.push(cs[0]!);
      else for (let i = 0; i + 1 < cs.length; i++) out.push(cs[i]! + cs[i + 1]!);
    } else {
      for (const w of part.toLowerCase().match(WORD) ?? []) out.push(w);
    }
  }
  return out;
}

/** The text stored in the bigram index for one event. */
export function indexText(text: string): string {
  return bigramTokens(text).join(" ");
}

/** An FTS5 MATCH expression: each query term as a phrase of its tokens, any term matching. */
export function bigramQuery(query: string): string | null {
  const phrases: string[] = [];
  for (const term of query.trim().split(/\s+/)) {
    const toks = bigramTokens(term).filter((t) => t.length > 0);
    if (!toks.length) continue;
    // A lone CJK character is not in the index (only bigrams are): the substring list covers it.
    if (toks.length === 1 && [...toks[0]!].length === 1 && CJK_RUN.test(toks[0]!)) continue;
    // Tokens are letters, digits and "_" only, so they need no escaping inside the quotes.
    const phrase = `"${toks.join(" ")}"`;
    // A single Latin word also matches as a prefix (plurals, "digest" → "digests").
    phrases.push(toks.length === 1 && /^[a-z0-9_]{4,}$/.test(toks[0]!) ? `${phrase}*` : phrase);
  }
  return phrases.length ? [...new Set(phrases)].join(" OR ") : null;
}

/** Reciprocal-rank fusion of ranked seq lists, each with a weight. Highest first. */
export function fuseRanks(lists: { seqs: number[]; weight: number }[], boost: (seq: number) => number = () => 1, k = 60): number[] {
  const score = new Map<number, number>();
  for (const { seqs, weight } of lists) seqs.forEach((s, i) => score.set(s, (score.get(s) ?? 0) + weight / (k + i + 1)));
  return [...score.entries()]
    .map(([s, v]) => [s, v * boost(s)] as const)
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([s]) => s);
}
