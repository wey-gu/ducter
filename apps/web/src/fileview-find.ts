// D242: find in a long file. The viewer's text as the page draws it (lines of code, a laid-out
// report, a table) is searched as one string, case set aside; every match is marked and the
// current one is centred. Matches never span lines of code (each line is its own element), and
// at most FIND_MAX are marked.

export const FIND_MAX = 5000;

/** Where `q` occurs in `text`, case set aside: [start, end) pairs, at most `max`. */
export function findAll(text: string, q: string, max = FIND_MAX): [number, number][] {
  const out: [number, number][] = [];
  if (!q) return out;
  // Lowering keeps offsets only when it keeps lengths (it does for nearly every script).
  const lt = text.toLowerCase();
  const lq = q.toLowerCase();
  const [hay, needle] = lt.length === text.length && lq.length === q.length ? [lt, lq] : [text, q];
  for (let i = hay.indexOf(needle); i >= 0 && out.length < max; i = hay.indexOf(needle, i + needle.length)) out.push([i, i + needle.length]);
  return out;
}

/** The text nodes under `root` (in order), with where each starts in their joined text. */
export function textMap(root: Node): { text: string; nodes: Text[]; starts: number[] } {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walk = root.ownerDocument!.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: (n) => ((n.parentElement?.closest(".ln, [aria-hidden='true']") ? 2 : 1) as number),
  });
  let block: Element | null | undefined;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    // A line, a paragraph or a cell ends a run: nothing found spans two of them.
    const b = n.parentElement?.closest(".cl, p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote");
    if (block !== undefined && b !== block) text += "\n";
    block = b;
    starts.push(text.length);
    nodes.push(n as Text);
    text += (n as Text).data;
  }
  return { text, nodes, starts };
}

/** A DOM range for [a, b) of a textMap's joined text. */
export function rangeOf(map: ReturnType<typeof textMap>, a: number, b: number): Range | undefined {
  const at = (off: number, end: boolean): [Text, number] | undefined => {
    let lo = 0;
    let hi = map.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (map.starts[mid]! < off || (!end && map.starts[mid] === off)) lo = mid;
      else hi = mid - 1;
    }
    const n = map.nodes[lo];
    return n ? [n, Math.min(n.data.length, off - map.starts[lo]!)] : undefined;
  };
  const s = at(a, false);
  const e = at(b, true);
  if (!s || !e) return undefined;
  const r = document.createRange();
  r.setStart(s[0], s[1]);
  r.setEnd(e[0], e[1]);
  return r;
}
