// The 1/4-em gap between Chinese and Latin letters or digits (D78), for browsers without
// `text-autospace` (iOS WebKit today). At display time only: a U+2005 (four-per-em space) goes
// into the text nodes on screen, never into what the user typed, what is sent, or what is copied.

const HAN = "⺀-⿿぀-ヿ㐀-䶿一-鿿豈-﫿";
const LATIN = "A-Za-z0-9";
const GAP = " ";
const HAN_LATIN = new RegExp(`([${HAN}])([${LATIN}])`, "g");
const LATIN_HAN = new RegExp(`([${LATIN}])([${HAN}])`, "g");

/** "在MacBook上跑了50遍" → "在 MacBook 上跑了 50 遍" (with U+2005). Text that already has a space,
 *  or punctuation, between the two is left alone. */
export function autospace(s: string): string {
  if (!s) return s;
  return s.replace(HAN_LATIN, `$1${GAP}$2`).replace(LATIN_HAN, `$1${GAP}$2`);
}

/** What the user gets when copying: the text as written, without the display gaps. */
export const unspace = (s: string) => s.replaceAll(GAP, "");

const SKIP = new Set(["CODE", "PRE", "TEXTAREA", "INPUT", "SCRIPT", "STYLE", "KBD", "SAMP"]);

function skipped(n: Node): boolean {
  for (let p = n.parentElement; p; p = p.parentElement) {
    if (SKIP.has(p.tagName) || p.isContentEditable) return true;
  }
  return false;
}

function fix(n: Node) {
  if (n.nodeType === 3) {
    const t = n as Text;
    const next = autospace(t.data);
    if (next !== t.data && !skipped(t)) t.data = next;
    return;
  }
  if (n.nodeType !== 1 || SKIP.has((n as Element).tagName)) return;
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
  for (let x = w.nextNode(); x; x = w.nextNode()) fix(x);
}

/** Keeps `root`'s text spaced as it changes, unless the browser does it itself. */
export function startAutospace(root: Node, force = false) {
  if (!force && typeof CSS !== "undefined" && CSS.supports?.("text-autospace", "normal")) return;
  fix(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") fix(r.target);
      else r.addedNodes.forEach(fix);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
  document.addEventListener("copy", (e) => {
    const sel = document.getSelection()?.toString() ?? "";
    if (!sel.includes(GAP) || !e.clipboardData) return;
    e.clipboardData.setData("text/plain", unspace(sel));
    e.preventDefault();
  });
}
