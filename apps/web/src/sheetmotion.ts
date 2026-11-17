// D290: a sheet's way out (research/96; design/ui.md, Motion). It comes up on the spring (app.css
// .sheet, --t-sheet); it goes back down the way it came, and on a phone it follows the finger
// down from its grab or its top and lets go past a quarter of its height (or flicked) to close,
// short of it springing home. Centred on a wide screen it sinks a little and fades. Transform and
// opacity only; at once under reduced motion.
import { useEffect, useRef } from "preact/hooks";
import { still } from "./nav.ts";

const centred = () => typeof matchMedia === "function" && matchMedia("(min-width: 700px) and (min-height: 640px)").matches;
const cssVar = (k: string, d: string) => (typeof document === "object" && getComputedStyle(document.documentElement).getPropertyValue(k).trim()) || d;
const ms = (k: string, d: number) => parseFloat(cssVar(k, `${d}ms`)) || d;

/** Plays the sheet out from where it is (dy: dragged down by), then calls done. */
export function sheetOut(sheet: HTMLElement | null, scrim: HTMLElement | null, done: () => void, dy = 0) {
  if (!sheet || !sheet.animate || still()) return done();
  const t = ms("--t-leave", 260);
  const ease = cssVar("--ease", "ease-out");
  const kf: Keyframe[] = centred() ? [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.96)", opacity: 0 }] : [{ transform: `translateY(${dy}px)` }, { transform: "translateY(100%)" }];
  const a = sheet.animate(kf, { duration: centred() ? t * 0.7 : t, easing: ease, fill: "forwards" });
  scrim?.animate([{ opacity: scrim.style.opacity || 1 }, { opacity: 0 }], { duration: t, easing: ease, fill: "forwards" });
  sheet.style.pointerEvents = "none";
  let ended = false;
  const end = () => !ended && ((ended = true), done());
  a.onfinish = end;
  setTimeout(end, t + 120); // a tab hidden mid-way never finishes its animation
}

/**
 * A sheet's motion: returns close(), which plays the sheet out before onClose; on a phone the
 * sheet can be dragged down to close. `sheet` is the frame that moves, `body` the part that
 * scrolls inside it (sheet-frame.tsx, research/123).
 */
export function useSheetMotion(onClose: () => void) {
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    sheetOut(sheet.current, scrim.current, onClose);
  };
  useEffect(() => {
    const el = sheet.current;
    if (!el || centred()) return;
    const top = () => (body.current ?? el).scrollTop;
    let y0 = 0, t0 = 0, dy = 0, on = false, pulling = false;
    const start = (e: TouchEvent) => {
      const tch = e.touches[0];
      if (e.touches.length !== 1 || !tch) return;
      // From the grab, or anywhere while the sheet is scrolled to its top.
      const fromGrab = (e.target as HTMLElement).closest?.(".grab");
      if (!fromGrab && top() > 0) return;
      if ((e.target as HTMLElement).closest?.("textarea, input, select, [contenteditable]")) return;
      y0 = tch.clientY;
      t0 = performance.now();
      dy = 0;
      on = true;
      pulling = false;
    };
    const move = (e: TouchEvent) => {
      if (!on) return;
      const d = e.touches[0]!.clientY - y0;
      if (!pulling) {
        if (d < 6) return d < -4 ? void (on = false) : undefined;
        if (top() > 0) return void (on = false);
        pulling = true;
      }
      e.preventDefault();
      dy = Math.max(0, d);
      el.style.transform = `translateY(${dy}px)`;
      el.style.animation = "none";
      if (scrim.current) scrim.current.style.opacity = String(Math.max(0.2, 1 - dy / (el.offsetHeight || 600)));
    };
    const end = () => {
      if (!on) return;
      on = false;
      if (!pulling) return;
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > (el.offsetHeight || 600) / 4 || (v > 0.6 && dy > 30)) {
        closing.current = true;
        el.style.transform = "";
        return sheetOut(el, scrim.current, onClose, dy);
      }
      // Home, on the spring.
      el.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: ms("--t-back", 320), easing: cssVar("--spring", "ease-out") });
      el.style.transform = "";
      if (scrim.current) scrim.current.style.opacity = "";
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);
  return { sheet, body, scrim, close };
}
