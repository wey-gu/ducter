// D254: the conversation keeps your place (design/conversation.md "Keeping your place"). At the end
// it follows what comes (a new message glides up; a picture, a card or a living message growing,
// the keyboard opening, never leave the end behind). Scrolled up, it stays where you are and a
// pebble over the composer says 3 条新消息 / 3 new messages; a tap lands on the first of them (the
// end when they fit). Opening, or coming back to the app, lands on 新消息 / New messages when what
// came is taller than the screen. Sending always goes to the end. The place is kept while you are
// in On hand or a task. The rules are pure, in follow.ts.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { AT_END, countWords, dividerAt, gapOf, landing, newSince, type Row, showWayBack, stillFollowing } from "./follow.ts";
import { haptic } from "./native.ts";
import type { Entry } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Kept across the conversation leaving the screen (a task opened on a phone) and coming back. */
const place = {
  kept: false,
  top: 0,
  following: true,
  mark: 0,
  /** The row the New messages divider stands before, frozen when the conversation opens. */
  divider: undefined as number | undefined,
  opened: false,
  hiddenMark: undefined as number | undefined,
};

const rowsOf = (rows: readonly Entry[]): Row[] => rows.map((e) => ({ seq: e.firstSeq, mine: !!e.user }));

/** Where the divider stands, if it is not already said by a living message's "While you were away". */
export function dividerSeq(): number | undefined {
  const d = place.divider;
  return d !== undefined && A.livingAway.get(d) ? undefined : d;
}

export interface Follow {
  /** Something new came while the reader was up: how many. */
  fresh: number;
  /** The way back shows (new things, or more than a screen away). */
  show: boolean;
  toNew(): void;
  onScroll(el: HTMLElement): void;
}

export function useFollow(scroller: { current: HTMLDivElement | null }, rows: readonly Entry[], pending: number): Follow {
  const [, redraw] = useState(0);
  const lite = rowsOf(rows);
  const last = lite.at(-1)?.seq ?? 0;
  const mine = lite.filter((r) => r.mine).length + pending;
  const st = useRef({ following: place.kept ? place.following : true, mark: place.kept ? place.mark : last, lastTop: 0, landed: false, last, mine, far: false, glideUntil: 0 });
  const s = st.current;

  // The divider is set once the replay is in, from what this person had read.
  if (!place.opened && A.S.welcomed && rows.length) {
    place.opened = true;
    place.divider = dividerAt(lite, A.S.readUpTo);
  }
  // Sending (here or on another device) goes to the end, and the divider has done its work.
  if (s.landed && mine > s.mine) {
    s.following = true;
    place.divider = undefined;
  }
  s.mine = mine;

  const landOn = (el: HTMLElement, seq: number | undefined, smooth: boolean, atDivider = false) => {
    const target = seq === undefined ? undefined : (atDivider && el.querySelector<HTMLElement>("[data-divider]")) || el.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
    const top = landing(el, target ? target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : undefined);
    if (smooth && !still()) el.scrollTo({ top, behavior: "smooth" });
    else el.scrollTop = top;
    s.lastTop = top;
    s.following = el.scrollHeight - top - el.clientHeight <= AT_END;
    s.mark = last;
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !rows.length) return;
    if (!s.landed) {
      s.landed = true;
      const d = dividerSeq();
      if (place.kept && !place.following) el.scrollTop = place.top;
      else if (d !== undefined) landOn(el, d, false, true);
      else el.scrollTop = el.scrollHeight;
      s.lastTop = el.scrollTop;
    } else if (s.following) {
      // A new row glides up from below; growth (a picture, a card, a living message) holds the end.
      if (last !== s.last && !still()) glide(el);
      else if (Date.now() > s.glideUntil) el.scrollTop = el.scrollHeight;
    }
    if (s.following) s.mark = last;
    s.last = last;
    if (A.convAway !== !s.following) A.convAway = !s.following;
  });

  // Whatever changes size under a reader at the end (pictures, cards, the keyboard) keeps the end;
  // during a glide the glide goes on to the new end instead of jumping.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => {
      if (!st.current.following) return;
      if (Date.now() < st.current.glideUntil) glide(el);
      else el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    const watch = () => {
      for (const c of Array.from(el.children)) ro.observe(c);
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    return () => (ro.disconnect(), mo.disconnect());
  }, [scroller.current]);

  // Coming back to the app: what came while it was away gets the divider, and is landed on.
  useEffect(() => {
    const vis = () => {
      const el = scroller.current;
      if (document.visibilityState === "hidden") {
        place.hiddenMark = rowsOf(A.S.channel).at(-1)?.seq ?? 0;
        return;
      }
      if (place.hiddenMark === undefined || !el) return;
      const { first } = newSince(rowsOf(A.rows().rows), place.hiddenMark);
      place.hiddenMark = undefined;
      if (first === undefined || !st.current.following) return;
      place.divider = first;
      redraw((n) => n + 1);
      requestAnimationFrame(() => landOn(el, first, false, true));
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  // ⌘↓ / Ctrl+↓ (End outside a field): to the newest.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const field = (e.target as HTMLElement | null)?.closest?.("textarea, input, [contenteditable]") as HTMLTextAreaElement | null;
      const cmdDown = e.key === "ArrowDown" && (e.metaKey || e.ctrlKey) && (!field || !field.value);
      if (!cmdDown && !(e.key === "End" && !field)) return;
      const el = scroller.current;
      if (!el || A.route.name !== "conv" || A.sheet) return;
      e.preventDefault();
      toEnd(el);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  function glide(el: HTMLElement) {
    st.current.glideUntil = Date.now() + 480;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  const toEnd = (el: HTMLElement) => {
    s.following = true;
    s.mark = last;
    if (still()) el.scrollTop = el.scrollHeight;
    else glide(el);
    A.convAway = false;
    A.changed();
  };

  // Kept for the next time the conversation is on the screen.
  useEffect(
    () => () => {
      const el = scroller.current;
      A.convAway = false;
      place.kept = true;
      place.following = st.current.following;
      place.mark = st.current.mark;
      place.top = el?.scrollTop ?? 0;
    },
    [],
  );

  const fresh = s.following ? 0 : newSince(lite, s.mark).count;
  const el = scroller.current;
  const show = !!el && !s.following && showWayBack(gapOf(el), el.clientHeight, fresh);
  return {
    fresh,
    show,
    toNew() {
      const el = scroller.current;
      if (!el) return;
      haptic("light");
      const { first } = newSince(lite, s.mark);
      if (first === undefined) return toEnd(el);
      landOn(el, first, true);
      redraw((n) => n + 1);
    },
    onScroll(el) {
      const was = s.following;
      s.following = stillFollowing(was, s.lastTop, el);
      s.lastTop = el.scrollTop;
      if (s.following) s.mark = last;
      // Redraw only when what shows changes: following, or being more than a screen away.
      const far = gapOf(el) > el.clientHeight * 0.75;
      if (was !== s.following) {
        // Back at the end, what came is read (app.ts scheduleRead); up, it waits to be seen.
        s.far = far;
        A.convAway = !s.following;
        A.changed();
      } else if (far !== s.far) {
        s.far = far;
        redraw((n) => n + 1);
      }
    },
  };
}

/** The way back: a round pebble with the drawn arrow; with news, it grows to say how many. */
export function WayBack({ f }: { f: Follow }) {
  if (!f.show) return null;
  const n = f.fresh;
  const words = n === 1 ? t("conv.new.one") : t("conv.new.n", countWords(n));
  const label = n > 0 ? t("conv.new.label", countWords(n)) : t("jump.latest");
  return (
    <div class="jump-dock conv-dock">
      <button type="button" class={`way-back${n > 0 ? " fresh" : ""}`} key={n > 0 ? "fresh" : "plain"} aria-label={label} title={label} onClick={() => f.toNew()}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
        </svg>
        {n > 0 && (
          <span class="n" key={n} aria-hidden="true">
            {words}
          </span>
        )}
      </button>
    </div>
  );
}

/** The New messages divider: a quiet centred line, the same voice as the time lines. */
export function NewDivider() {
  return (
    <div class="new-divider" data-divider role="separator" aria-label={t("conv.divider")}>
      <span>{t("conv.divider")}</span>
    </div>
  );
}
