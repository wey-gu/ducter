// D387: where a popover by the composer goes, so it never leaves the screen: over its anchor (or
// under it when there is more room there), its start edge at the anchor's (or its end at the
// anchor's end), moved along to stay inside the visible viewport less the safe-area insets and a
// margin, its width capped to the room across and its height to the room on the side it took (it
// scrolls inside). The ring's card (context-meter.tsx) and the model-and-effort card
// (composer-tune.tsx) use it on every width, phone to iPad to desktop.
import { useLayoutEffect } from "preact/hooks";

export type Box = { left: number; top: number; right: number; bottom: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Placed = { left: number; top: number; width: number; maxH: number; side: "above" | "below" };

export function placePop(a: Box, size: { w: number; h: number }, view: { w: number; h: number }, inset: Insets, o: { gap?: number; margin?: number; align?: "start" | "end"; prefer?: "above" | "below" } = {}): Placed {
  const gap = o.gap ?? 8;
  const m = o.margin ?? 12;
  const lo = inset.left + m;
  const hi = view.w - inset.right - m;
  const width = Math.max(0, Math.min(size.w, hi - lo));
  const want = o.align === "end" ? a.right - width : a.left;
  const left = Math.max(lo, Math.min(want, hi - width));
  const above = Math.max(0, a.top - gap - inset.top - m);
  const below = Math.max(0, view.h - inset.bottom - m - a.bottom - gap);
  const prefer = o.prefer ?? "above";
  const room = (s: "above" | "below") => (s === "above" ? above : below);
  const other = prefer === "above" ? "below" : "above";
  const side = size.h <= room(prefer) || room(prefer) >= room(other) ? prefer : other;
  const maxH = room(side);
  const h = Math.min(size.h, maxH);
  const top = side === "above" ? a.top - gap - h : a.bottom + gap;
  return { left: Math.round(left), top: Math.round(top), width: Math.round(width), maxH: Math.floor(maxH), side };
}

/** The safe-area insets as numbers (env() can't be read from script, so a probe resolves it). */
let probe: HTMLDivElement | undefined;
export function safeInsets(): Insets {
  if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;inset:0 auto auto 0;width:0;height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  return { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
}

/** Places pop (position: fixed) by anchor while open, again on a resize, a scroll or the keyboard. */
export function usePlaced(open: boolean, anchor: { current: Element | null }, pop: { current: HTMLElement | null }, o: { align?: "start" | "end"; width: number; gap?: number }, deps: unknown[] = []) {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = pop.current;
      const at = anchor.current;
      if (!el || !at) return;
      const vv = typeof visualViewport !== "undefined" ? visualViewport : null;
      const ins = safeInsets();
      const vTop = vv?.offsetTop ?? 0;
      const vLeft = vv?.offsetLeft ?? 0;
      const view = { w: vLeft + (vv?.width ?? innerWidth), h: vTop + (vv?.height ?? innerHeight) };
      const inset = { ...ins, top: ins.top + vTop, left: ins.left + vLeft };
      el.style.position = "fixed";
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.maxHeight = "none";
      el.style.width = `${o.width}px`;
      const natural = el.scrollHeight;
      const p = placePop(at.getBoundingClientRect(), { w: o.width, h: natural }, view, inset, { align: o.align, ...(o.gap !== undefined ? { gap: o.gap } : {}) });
      el.style.width = `${p.width}px`;
      el.style.maxHeight = `${p.maxH}px`;
      // An ancestor that makes its own frame for fixed boxes (a transform) is its offsetParent then:
      // place it in that frame's coordinates.
      const frame = el.offsetParent?.getBoundingClientRect();
      el.style.left = `${p.left - (frame?.left ?? 0)}px`;
      el.style.top = `${p.top - (frame?.top ?? 0)}px`;
      el.dataset.side = p.side;
      el.style.visibility = "visible";
    };
    place();
    // Its own list scrolling inside it moves nothing.
    const scrolled = (e: Event) => !(pop.current && e.target instanceof Node && pop.current.contains(e.target)) && place();
    const vv = typeof visualViewport !== "undefined" ? visualViewport : null;
    addEventListener("resize", place);
    addEventListener("scroll", scrolled, true);
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : undefined;
    if (pop.current) ro?.observe(pop.current);
    return () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", scrolled, true);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
      ro?.disconnect();
    };
  }, [open, ...deps]);
}
