// D454: a finished card on On hand (a task that is done or didn't work out, or a group none of whose
// parts is at work) can always be taken off it: a × on hover (a pointer), a swipe to the left (touch),
// and ⋯ with what fits it: 再试一次 / Try again and 看看为什么 / See why for one that didn't work out,
// 打开 / Open for one that is done, 移走 / Remove for both. Removed, it stays in Past tasks; the toast's
// 撤销 / Undo puts it back. The words are groupWords' (the Mac's groups.go keeps them equal).
import type { RefObject } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { MoreButton } from "./controls.tsx";
import { Menu, MenuItem } from "./menu.tsx";

const t = (k: string, ...a: (string | number)[]) => A.L.t(k, ...a);

/** What a finished card is: the tasks it removes, the ones that didn't work out, the one it opens. */
export interface Finished {
  name: string;
  taskIds: string[];
  failedIds: string[];
  /** The task 打开 / 看看为什么 opens (the first that didn't work out, else the card's own). */
  openId?: string;
  groupId?: string;
  /** D508: a finished repo task with a branch and no PR: ⋯ offers 合进 {base} and 开草稿 PR (never
   *  on the row, where they pushed the time out). */
  integrate?: { base: string };
  /** D602: a finished task an open PR still holds: ⋯ offers 结束任务 / End task, asked in place in the task. */
  ends?: boolean;
}

/** What ⋯ offers on a finished card, in order (pure: the Mac's FinishedMenu says the same). */
export function finishedMenu(f: Pick<Finished, "failedIds" | "openId" | "integrate" | "ends">): ("retry" | "why" | "open" | "remove" | "merge" | "open_pr" | "end")[] {
  if (f.failedIds.length) return ["retry", "why", "remove"];
  if (f.openId && f.integrate) return ["merge", "open_pr", "open", "remove"];
  if (f.openId && f.ends) return ["end", "open", "remove"];
  return f.openId ? ["open", "remove"] : ["remove"];
}

export function putAway(f: Finished) {
  A.putAway({ ...(f.groupId ? { groupId: f.groupId } : { taskIds: f.taskIds }), name: f.name });
}

/** The × that removes a finished card (shown with a pointer that hovers, app.css .fin-x). */
export function AwayX({ f }: { f: Finished }) {
  return (
    <button type="button" class="fin-x" aria-label={t("away.remove.about", f.name)} title={t("away.remove.about", f.name)} onClick={(e) => (e.stopPropagation(), putAway(f))}>
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
    </button>
  );
}

/** What a ⋯ item does. */
export function runFinished(k: ReturnType<typeof finishedMenu>[number], f: Finished, full?: boolean) {
  if (k === "merge" || k === "open_pr") f.openId && A.taskAction(f.openId, k);
  else if (k === "end") f.openId && ((A.ending = f.openId), A.go({ name: "task", id: f.openId, full: !!full }));
  else if (k === "retry") A.retry(f.failedIds);
  else if (k === "why" || k === "open") f.openId && A.go({ name: "task", id: f.openId, full: !!full });
  else putAway(f);
}

/** The × and ⋯ in a finished card's corner (× only with a pointer that hovers; ⋯ always). */
export function FinishedActs({ f, full, menuOnly }: { f: Finished; full?: boolean; menuOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const items = finishedMenu(f);
  const at = useRef<HTMLSpanElement>(null);
  return (
    <span class={`fin-acts${open ? " open" : ""}`} ref={at}>
      {!menuOnly && <AwayX f={f} />}
      <MoreButton label={t("away.more", f.name)} open={open} onClick={() => setOpen(!open)} />
      {/* On the page's top layer: a card lifted on hover would carry a fixed panel with it. */}
      {open &&
        createPortal(
        <Menu class="pmenu fin-menu" label={f.name} anchor={at} onClose={() => setOpen(false)}>
          {items.map((k) => (
            <MenuItem
              key={k}
              onClick={() => {
                setOpen(false);
                runFinished(k, f, full);
              }}
            >
              {k === "merge" ? t("result.merge", f.integrate?.base ?? "main") : k === "open_pr" ? t("result.pr") : k === "end" ? t("task.action.end") : t(`away.${k}`)}
            </MenuItem>
          ))}
        </Menu>,
          document.body,
        )}
    </span>
  );
}

/** How far a touch must travel to the left to remove the card. */
export const SWIPE_AWAY = 96;

/**
 * A swipe to the left takes a finished card away on a touch screen: it follows the finger, and past
 * SWIPE_AWAY it slides out and is removed (the toast says so, with 撤销); short of it, it goes back.
 * A vertical move is the page's scroll and is left alone; a swipe never opens the card.
 */
export function useSwipeAway(ref: RefObject<HTMLElement>, f: Finished | undefined) {
  const fr = useRef(f);
  fr.current = f;
  useEffect(() => {
    const el = ref.current;
    if (!el || !f) return;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let mode: "" | "x" | "y" = "";
    let swiped = false;
    const reset = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0]!.clientX;
      y0 = e.touches[0]!.clientY;
      dx = 0;
      mode = "";
      swiped = false;
    };
    const move = (e: TouchEvent) => {
      const p = e.touches[0];
      if (!p) return;
      const mx = p.clientX - x0;
      const my = p.clientY - y0;
      if (!mode && Math.abs(mx) + Math.abs(my) > 8) mode = Math.abs(mx) > Math.abs(my) * 1.3 && mx < 0 ? "x" : "y";
      if (mode !== "x") return;
      e.preventDefault();
      dx = Math.min(0, mx);
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0.35, 1 + dx / 320));
    };
    const end = () => {
      if (mode !== "x") return;
      swiped = true;
      if (dx <= -SWIPE_AWAY && fr.current) {
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.style.transition = reduced ? "none" : "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms";
        el.style.transform = "translateX(-110%)";
        el.style.opacity = "0";
        const g = fr.current;
        setTimeout(() => (putAway(g), reset()), reduced ? 0 : 180);
      } else {
        el.style.transition = "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms";
        el.style.transform = "";
        el.style.opacity = "";
      }
    };
    // The tap that ends a swipe never opens what is under it.
    const click = (e: MouseEvent) => {
      if (swiped) e.stopPropagation(), e.preventDefault(), (swiped = false);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("click", click, true);
    };
  }, [ref, !!f]);
}
