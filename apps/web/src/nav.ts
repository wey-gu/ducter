// D290: the page's way between levels (research/96; design/ui.md, Motion). One move at a time,
// through the View Transitions API where the browser has it (static/app.css, :root[data-nav]):
//   deeper: a level down (the conversation → On hand → a task). On a phone the new page pushes in
//           from the trailing edge over the one left, which recedes a third and dims (a native
//           push); beside the conversation the pane's page comes in from 28px, as on the Mac.
//   back:   its reverse; the page left slides off the trailing edge on top.
//   task:   one task to the next: the task alone rises a little into place.
// The bar holds still (named "bar" while exactly one is on screen) and its words cross-fade; the
// card you opened grows into the task's head and goes back into its place ("hero", data-row on
// the card, data-hero on the head). Without the API, or under reduced motion, at once: never a
// fallback that moves layout (transform and opacity only, in the snapshots).
import type { Route } from "./app.ts";
import { wideNow } from "./fold.ts";

export type NavKind = "deeper" | "back" | "task";

type VT = { finished: Promise<void> };
type VTDoc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => VT };

export const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A route's level: the conversation, On hand, a task. */
export const depth = (r: Route) => (r.name === "conv" ? 0 : r.name === "onhand" ? 1 : 2);

/** The move from one route to another, or none (the same page). */
export function kindOf(a: Route, b: Route): NavKind | undefined {
  if (a.name === "task" && b.name === "task") return a.id === b.id ? undefined : "task";
  const d0 = depth(a), d1 = depth(b);
  return d1 > d0 ? "deeper" : d1 < d0 ? "back" : undefined;
}

/** The level a location's hash names (app.ts fromHash's routes). */
export const hashDepth = (h: string) => (/^#task=/.test(h) ? 2 : /^#onhand/.test(h) ? 1 : 0);

/** The last move, for what reacts after it (the partner's look-around). */
export const last = { kind: undefined as NavKind | undefined, at: 0 };
let busy = false;
/** A move is between its old picture and its new one: a second change now would land in the old. */
export const navBusy = () => busy;

/** Names the one element matching sel; none when there are none or several (names are unique). */
function name(sel: string, as: string, tagged: HTMLElement[]) {
  const els = document.querySelectorAll<HTMLElement>(sel);
  if (els.length !== 1) return;
  els[0]!.style.setProperty("view-transition-name", as);
  tagged.push(els[0]!);
}

const esc = (s: string) => (typeof CSS === "object" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));

/**
 * Runs a route change as the move kind says. hero: the task whose card (its row, data-row) and
 * head (data-hero) share the "hero" name, the card in the old picture and the head in the new or
 * the other way round. At once without the API, under reduced motion, or in a hidden tab.
 */
export function navMove(kind: NavKind, apply: () => void, hero?: string) {
  last.kind = kind;
  last.at = Date.now();
  const d = typeof document === "object" ? (document as VTDoc) : undefined;
  if (!d?.startViewTransition || still() || d.visibilityState !== "visible" || busy) return apply();
  const root = d.documentElement;
  let tagged: HTMLElement[] = [];
  const tag = () => {
    if (hero) name(`[data-hero="${esc(hero)}"], [data-row="${esc(hero)}"] > .tmain`, "hero", tagged);
    name(".top", "bar", tagged);
  };
  const untag = () => {
    for (const e of tagged) e.style.removeProperty("view-transition-name");
    tagged = [];
  };
  root.dataset.nav = kind;
  // A phone pushes the whole page; beside the conversation only the pane's page moves.
  root.dataset.navw = wideNow() ? "pane" : "page";
  tag();
  busy = true;
  try {
    const vt = d.startViewTransition(() => {
      untag();
      apply();
      // Preact renders in a microtask; a timer runs after it (app.ts morph: never a frame here,
      // WebKit holds frames inside this callback, D209).
      return new Promise<void>((r) =>
        setTimeout(() => {
          tag();
          r();
        }, 0),
      );
    });
    vt.finished.finally(() => {
      untag();
      busy = false;
      if (root.dataset.nav === kind) delete root.dataset.nav;
    });
  } catch {
    untag();
    busy = false;
    delete root.dataset.nav;
    apply();
  }
}

/** The browser's back and forward: a move too, unless the browser drew its own (Safari's edge
 *  swipe, Chrome's predictive back: hasUAVisualTransition) or ours just did (the edge swipe). */
export function popMove(e: PopStateEvent, from: Route, apply: () => void) {
  const ua = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition;
  if (ua || swiped) {
    swiped = false;
    last.kind = "back";
    last.at = Date.now();
    return apply();
  }
  const d0 = depth(from), d1 = hashDepth(location.hash);
  const k: NavKind | undefined = d1 > d0 ? "deeper" : d1 < d0 ? "back" : from.name === "task" && d1 === 2 ? "task" : undefined;
  const id = from.name === "task" ? from.id : (/^#task=([^/]+)/.exec(location.hash)?.[1] ?? "");
  return k ? navMove(k, apply, id ? decodeURIComponent(id) : undefined) : apply();
}

// ---------- the edge swipe back (a phone; where the browser has none of its own) ----------

let swiped = false;

/** iOS Safari in a tab swipes back itself; an installed page and the app's web view don't. */
const browserSwipes = () => {
  if (typeof navigator !== "object") return false;
  const ua = navigator.userAgent;
  // An iPad says it is a Mac; a Mac's Chrome with touch is not one.
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && !/Chrome\//.test(ua));
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
  return ios && !standalone;
};

/**
 * From the leading edge, the page follows the finger; let go past a third of the screen (or
 * flicked), it slides off and the level above comes back; short of it, it springs home. canBack
 * says whether there is a level above here (a phone, not the conversation, no sheet open); back
 * goes there. Transform only, on #app.
 */
export function edgeSwipe(app: HTMLElement, canBack: () => boolean, back: () => void, opts: { inApp: boolean }) {
  if (browserSwipes() && !opts.inApp) return () => {};
  const EDGE = 24;
  let x0 = 0, y0 = 0, t0 = 0, dx = 0, on = false, decided = false;
  const set = (x: number) => {
    app.style.transform = x ? `translateX(${x}px)` : "";
    app.style.boxShadow = x ? "var(--floating)" : "";
  };
  const start = (e: TouchEvent) => {
    const tch = e.touches[0];
    if (e.touches.length !== 1 || !tch || tch.clientX > EDGE || !canBack()) return;
    x0 = tch.clientX;
    y0 = tch.clientY;
    t0 = performance.now();
    dx = 0;
    on = true;
    decided = false;
  };
  const move = (e: TouchEvent) => {
    if (!on) return;
    const tch = e.touches[0]!;
    const mx = tch.clientX - x0, my = tch.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      decided = true;
      if (Math.abs(my) > Math.abs(mx) || mx < 0) return void (on = false);
      app.style.willChange = "transform";
    }
    e.preventDefault();
    dx = Math.max(0, mx);
    set(dx);
  };
  const end = () => {
    if (!on) return;
    on = false;
    if (!decided) return;
    const w = app.getBoundingClientRect().width || innerWidth;
    const v = dx / Math.max(1, performance.now() - t0);
    const go = dx > w / 3 || (v > 0.5 && dx > 40);
    const ease = getComputedStyle(document.documentElement).getPropertyValue(go ? "--ease" : "--spring").trim() || "ease-out";
    const a = app.animate([{ transform: `translateX(${dx}px)` }, { transform: go ? `translateX(${w}px)` : "translateX(0)" }], { duration: go ? 200 : 320, easing: ease });
    set(0);
    if (go) app.style.transform = `translateX(${w}px)`;
    a.onfinish = () => {
      app.style.willChange = "";
      if (!go) return;
      swiped = true;
      last.kind = "back";
      last.at = Date.now();
      back();
      set(0);
      // The level above comes back from where a push left it.
      app.animate([{ transform: "translateX(-24%)", opacity: 0.7 }, { transform: "none", opacity: 1 }], { duration: 260, easing: ease });
      // Not a pop (a route set directly): nothing reads the flag.
      setTimeout(() => (swiped = false), 400);
    };
  };
  addEventListener("touchstart", start, { passive: true });
  addEventListener("touchmove", move, { passive: false });
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", end, { passive: true });
  return () => {
    removeEventListener("touchstart", start);
    removeEventListener("touchmove", move);
    removeEventListener("touchend", end);
    removeEventListener("touchcancel", end);
  };
}
