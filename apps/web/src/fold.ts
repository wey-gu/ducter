// The fold (D180). On a foldable, the fold (or a dual-screen phone's hinge) splits the screen in
// two physical halves. The panes split there too: held open like a book, the conversation on one
// side and On hand, or the opened task, on the other; stood up like a laptop (tabletop), the
// conversation above and On hand below. Nothing is laid across the fold. Where there is no fold
// in view, the width decides, as everywhere else (wide.ts, D176).
//
// Where the fold is comes from the Android app (apps/android: window.ducterFold and a `ducterfold`
// event, in CSS px from the page's top-left), else from the browser's Viewport Segments API
// (`window.viewport.segments`), which Chrome offers on some foldables.

export interface Fold {
  /** vertical: the fold runs top to bottom (a book); horizontal: across (a laptop, tabletop). */
  axis: "vertical" | "horizontal";
  /** flat, or half-opened (held like a book, or stood up). */
  state: "flat" | "half";
  /** Where it starts and ends along the page's width (vertical) or height (horizontal), CSS px. */
  start: number;
  end: number;
}

export type Split = { kind: "book" | "table"; a: number; gap: number };

/** Each side of a book holds a phone-width pane; the top of a tabletop a short reading pane. */
export const BOOK_MIN = 320;
export const TABLE_MIN = 220;

type Seg = { x: number; y: number; width: number; height: number };
const g = globalThis as unknown as { ducterFold?: Fold | null; viewport?: { segments?: Seg[] | null } };

export function readFold(): Fold | undefined {
  if (g.ducterFold) return g.ducterFold;
  const s = g.viewport?.segments;
  if (!s || s.length !== 2) return;
  const [p, q] = s as [Seg, Seg];
  if (q.x > p.x) return { axis: "vertical", state: "flat", start: Math.round(p.x + p.width), end: Math.round(q.x) };
  if (q.y > p.y) return { axis: "horizontal", state: "half", start: Math.round(p.y + p.height), end: Math.round(q.y) };
  return;
}

/**
 * How the panes split at a fold, or not at all. A book splits whenever both sides are wide enough,
 * flat or half-open: the fold is there either way, and a 640 column laid across it would put the
 * crease under the words. A fold across the screen splits only when it is half-open (tabletop):
 * flat, a tall open foldable is one tall screen, read as one column.
 */
export function splitFor(f: Fold | undefined, width: number, height: number): Split | undefined {
  if (!f) return;
  const gap = Math.max(0, f.end - f.start);
  if (f.axis === "vertical") return Math.min(f.start, width - f.end) >= BOOK_MIN ? { kind: "book", a: f.start, gap } : undefined;
  if (f.state !== "half") return;
  return Math.min(f.start, height - f.end) >= TABLE_MIN ? { kind: "table", a: f.start, gap } : undefined;
}

export const currentSplit = (): Split | undefined =>
  typeof innerWidth === "number" ? splitFor(readFold(), innerWidth, innerHeight) : undefined;

/** Calls `on` whenever the fold or the window changes (opening, closing, turning, resizing). */
export function onFoldChange(on: () => void): () => void {
  if (typeof addEventListener !== "function") return () => {};
  addEventListener("ducterfold", on);
  addEventListener("resize", on);
  return () => {
    removeEventListener("ducterfold", on);
    removeEventListener("resize", on);
  };
}

/** Marks the page for CSS: data-split="book|table", --fold-a and --fold-gap (static/app.css). */
export function markSplit(s: Split | undefined, el: HTMLElement | undefined = typeof document === "object" ? document.documentElement : undefined) {
  if (!el) return;
  if (!s) {
    delete el.dataset.split;
    el.style.removeProperty("--fold-a");
    el.style.removeProperty("--fold-gap");
    return;
  }
  el.dataset.split = s.kind;
  el.style.setProperty("--fold-a", `${s.a}px`);
  el.style.setProperty("--fold-gap", `${s.gap}px`);
}
