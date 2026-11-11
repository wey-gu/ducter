// Wide layouts (D176, D184). The client is one page at every size: a phone, an iPad in any
// multitasking size, a foldable opening and closing, a browser window being dragged. The layout
// follows the width the page has now (never the device or the orientation), and changes in
// place: what is typed, the route and the open sheet stay.
//
// Wide, the two panes are the default: the conversation, and On hand (or the task opened from it)
// beside it. On hand, and an opened task, can each take the whole screen as the Mac app shows
// them, and come back beside the conversation in one move (D184).
import { useEffect, useState } from "preact/hooks";
import { A, type Route } from "./app.ts";
import { canFill, currentSplit, markSplit, onFoldChange, WIDE, type Split } from "./fold.ts";
import { escPause } from "./esc.ts";

/** Two panes from WIDE (fold.ts): an iPad held across (1133–1366), a 13" iPad upright (1024–1032),
 *  a wide window. Under it, one column: a phone, Split View's thirds and halves, an 11" iPad
 *  upright, a foldable's inner display without a fold in view. A fold in view splits the panes at
 *  the fold instead, at any width (D182, fold.ts). Keep in step with `.panes` in static/app.css. */
export { WIDE };

const query = () => (typeof matchMedia === "function" ? matchMedia(WIDE) : undefined);

/** Two panes: wide enough, or a foldable's fold in view (D182, fold.ts). */
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

/** D184: the level shown takes the whole screen (On hand, or an opened task, as the Mac shows
 *  them) instead of standing beside the conversation. Only wide, and only where canFill allows;
 *  elsewhere a whole-screen route is drawn as it would be without it. */
export function useFill(): boolean {
  const wide = useWide();
  const split = useSplit();
  const r = A.route;
  return r.name !== "conv" && !!r.full && canFill(r.name, wide, split);
}

/** Whether a level could take the whole screen here (the side pane's expand button). */
export function useCanFill(level: "onhand" | "task"): boolean {
  return canFill(level, useWide(), useSplit());
}

/** Where Esc goes from a route: up one level (an opened task → On hand → the conversation), as on
 *  the Mac. A whole-screen task goes up to the whole-screen On hand; from there, the two panes. */
export function upFrom(r: Route): Route | undefined {
  if (r.name === "task") return r.full ? { name: "onhand", full: true } : { name: "onhand" };
  if (r.name === "onhand") return { name: "conv" };
  return;
}

/** Esc goes up one level. Sheets and the live view take their own Esc; a field being typed in
 *  keeps it. */
export function escUp(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || A.sheet || A.live) return;
  // D210: on a task at work, Esc (in its composer too) asks to pause it; a second Esc pauses.
  if (A.route.name === "task" && escPause(A.route.id)) return void e.preventDefault();
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return;
  const up = upFrom(A.route);
  if (up) A.go(up);
}

/** D216: room for On hand's rail beside a task at the whole screen (the rail, then the task's
 *  720 column with its own room). Keep in step with `.with-rail` in static/app.css. */
export const ROOMY = "(min-width: 1360px)";
/** With the task's workbench open beside it too (D214), the rail needs more. */
export const ROOMY_BENCH = "(min-width: 1720px)";
export function useRoomy(query: string): boolean {
  const q = () => (typeof matchMedia === "function" ? matchMedia(query) : undefined);
  const [on, setOn] = useState(() => !!q()?.matches);
  useEffect(() => {
    const m = q();
    if (!m) return;
    const f = () => setOn(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [query]);
  return on;
}

/** D216: ⌘O (Ctrl+O elsewhere) opens the switcher, 打开一件事 / Open a task, as the app's menu does. */
export function openKey(e: KeyboardEvent) {
  if (e.key.toLowerCase() !== "o" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
  e.preventDefault();
  A.command("switch");
}
