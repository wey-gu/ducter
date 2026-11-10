// Wide layouts (D176). The client is one page at every size: a phone, an iPad in any multitasking
// size, a foldable opening and closing, a browser window being dragged. The layout follows the
// width the page has now (never the device or the orientation), and changes in place: what is
// typed, the route and the open sheet stay.
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { currentSplit, markSplit, onFoldChange, type Split } from "./fold.ts";

/** Two panes from this width: an iPad held across (1133–1366), a 13" iPad upright (1024–1032), a
 *  wide window. Under it, one column: a phone, Split View's thirds and halves, an 11" iPad
 *  upright, a foldable's inner display without a fold in view. A fold in view splits the panes at
 *  the fold instead, at any width (D180, fold.ts). Keep in step with `.panes` in static/app.css. */
export const WIDE = "(min-width: 1000px)";

const query = () => (typeof matchMedia === "function" ? matchMedia(WIDE) : undefined);

/** Two panes: wide enough, or a foldable's fold in view (D180, fold.ts). */
export function useWide(): boolean {
  const [wide, setWide] = useState(() => !!query()?.matches);
  const split = useSplit();
  useEffect(() => {
    const q = query();
    if (!q) return;
    const on = () => setWide(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide || !!split;
}

/** How the panes split at a fold right now, kept on the page for CSS (data-split, --fold-*). */
export function useSplit(): Split | undefined {
  const [split, setSplit] = useState(currentSplit);
  useEffect(() => {
    const on = () => {
      const s = currentSplit();
      markSplit(s);
      setSplit((p) => (p?.kind === s?.kind && p?.a === s?.a && p?.gap === s?.gap ? p : s));
    };
    on();
    return onFoldChange(on);
  }, []);
  return split;
}

/** Esc goes up one level (an opened task → On hand → the conversation), as on the Mac. Sheets and
 *  the live view take their own Esc; a field being typed in keeps it. */
export function escUp(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || A.sheet || A.live) return;
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return;
  if (A.route.name === "task") A.go({ name: "onhand" });
  else if (A.route.name === "onhand") A.go({ name: "conv" });
}
