// D236: 回复 / Reply to one message (design/conversation.md "Replies", research/72).
// The look is the imprint: the message replied to, as a small copy of its own bubble (its voice's
// colour, its tail) pressed into the reply like a pebble into clay. It sits in the composer while
// the reply is written, inside the sent bubble after, and a tap brings the original back and finds
// it (its own tint deepens once). Gestures: swipe right on the phone (a drawn reply mark eases in
// and settles at the arming point, with a light tap), hover Reply on a wide screen, long press or
// right click for Reply / Copy, and on a wide screen a selected part of the partner's words.
import { clipQuote, plainWords, type ReplyRef } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A, type Replying } from "./app.ts";
import { haptic } from "./native.ts";
import type { Entry } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Shown in the imprint: at most two lines' worth (core keeps up to 200 characters). */
const SHOWN = 120;

/** The drawn reply mark: an arrow that turns back. Never a text arrow (iOS turns those into emoji). */
export function ReplyGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg class="reply-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9.5 5.5 4 11l5.5 5.5" />
      <path d="M4.6 11H13a6.5 6.5 0 0 1 6.5 6.5V19" />
    </svg>
  );
}

/** A drawn ×, for putting a reply away. */
function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

/** Who said the quoted words, in the literal words of the label. */
export const whoOf = (from: "you" | "partner") => (from === "you" ? t("reply.you") : A.S.personaName || "Ducter");

/** The imprint: who, then the quote, in a small copy of that voice's bubble pressed into this one. */
export function Imprint({ from, quote, pics, part, seq, onTap, still }: { from: "you" | "partner"; quote: string; pics?: number; part?: boolean; seq?: number; onTap?: () => void; still?: boolean }) {
  const words = clipQuote(quote, SHOWN).text;
  const body = (
    <>
      <span class="who">{whoOf(from)}</span>
      <span class="q">
        {part ? `“${words}”` : words}
        {!words && pics ? t("reply.pics", pics) : ""}
      </span>
    </>
  );
  if (still || seq === undefined) return <span class={`imprint from-${from}`}>{body}</span>;
  return (
    <button
      type="button"
      class={`imprint from-${from}`}
      aria-label={t("reply.jump", whoOf(from))}
      onClick={(ev) => {
        ev.stopPropagation();
        onTap ? onTap() : A.jumpTo(seq);
      }}
    >
      {body}
    </button>
  );
}

/** A sent reply's imprint, from what core logged with it. */
export function SentImprint({ r }: { r: ReplyRef }) {
  return <Imprint from={r.from} quote={r.quote} pics={r.media?.length} part={r.part} seq={r.seq} />;
}

// ---------- what can be replied to ----------

const targets = new Map<string, Replying>();

/** Registers a message as one the user can reply to; the key goes on its element as data-reply. */
export function replyKey(r: Replying | undefined): string | undefined {
  if (!r) return undefined;
  const k = `${r.seq}${r.findId ? `/${r.findId}` : ""}`;
  targets.set(k, r);
  return k;
}

/** What replying to this row of the conversation names. */
export function replyOf(e: Entry): Replying | undefined {
  if (e.user) return { seq: e.firstSeq, from: "you", quote: plainWords(e.user.text), ...(e.user.media?.length ? { pics: e.user.media.length } : {}) };
  if (e.ai && (e.ai.text.trim() || e.ai.media?.length)) return { seq: e.firstSeq, from: "partner", quote: plainWords(e.ai.text), ...(e.ai.media?.length ? { pics: e.ai.media.length } : {}) };
  if (e.job?.ack) return { seq: e.firstSeq, from: "partner", quote: e.job.ack.text };
  if (e.decision) {
    const d = A.S.decisions.get(e.decision.decisionId);
    return { seq: e.firstSeq, from: "partner", quote: plainWords(d?.said || e.decision.question) };
  }
  return undefined;
}

/** One find of a note (D165): the note's latest revision holds every find. */
export function replyOfFind(seq: number, findId: string, text: string): Replying {
  return { seq, findId, from: "partner", quote: text };
}

// ---------- the composer's imprint ----------

export function ComposerReply() {
  const r = A.replying;
  if (!r) return null;
  return (
    <div class="replying" key={`${r.seq}/${r.findId ?? ""}/${r.part ?? ""}`} role="group" aria-label={t("reply.to", whoOf(r.from))}>
      <ReplyGlyph size={18} />
      <Imprint from={r.from} quote={r.part ?? r.quote} pics={r.pics} part={!!r.part} seq={r.seq} />
      <button type="button" class="btn text icon x" aria-label={t("reply.cancel")} onClick={() => A.cancelReply()}>
        <Cross />
      </button>
    </div>
  );
}

// ---------- gestures ----------

/** The swipe's numbers (research/71: Lorca's, which match iMessage and WhatsApp by feel). */
const START = 14; // px right before it is a swipe
const GIVE_UP = 10; // px up, down or left before it is a scroll instead
const ARM = 56; // px: past this, letting go replies
const EDGE = 28; // px from the left edge: the system's back gesture
const HOLD_MS = 480; // long press

interface Menu {
  x: number;
  y: number;
  key: string;
  text: string;
}

/**
 * Swipe right, long press and right click on any [data-reply] in the conversation, through one
 * listener on the scroller (rows keep their own layout; nothing is wrapped).
 */
export function useReplyGestures(scroller: { current: HTMLElement | null }): Menu | undefined {
  const [menu, setMenu] = useState<Menu | undefined>();
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let s: { el: HTMLElement; key: string; x0: number; y0: number; id: number; on: boolean; armed: boolean; glyph?: HTMLElement; hold?: ReturnType<typeof setTimeout> } | undefined;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reset = () => {
      if (!s) return;
      clearTimeout(s.hold);
      const { el, glyph } = s;
      el.style.transition = still() ? "none" : "transform var(--t-back) var(--spring)";
      el.style.transform = "";
      el.classList.remove("swiping");
      if (glyph) {
        glyph.style.transition = still() ? "none" : "opacity var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)";
        glyph.style.opacity = "0";
        setTimeout(() => glyph.remove(), 200);
      }
      s = undefined;
    };
    const textOf = (el: HTMLElement) => (el.querySelector(".bubble, .words")?.textContent ?? el.textContent ?? "").trim();
    const down = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-reply]");
      if (!el || (ev.target as HTMLElement).closest("button, a, textarea, input, .tray, .imprint")) return;
      const key = el.dataset.reply!;
      // The whole row moves (a find moves its note); what is replied to is the one under the finger.
      const row = (el.closest(".scroll > *") as HTMLElement | null) ?? el;
      s = { el: row, key, x0: ev.clientX, y0: ev.clientY, id: ev.pointerId, on: false, armed: false };
      if (ev.pointerType !== "mouse") {
        s.hold = setTimeout(() => {
          if (!s || s.on) return;
          haptic("light");
          setMenu({ x: ev.clientX, y: ev.clientY, key, text: textOf(el) });
          s = undefined;
        }, HOLD_MS);
      }
    };
    const move = (ev: PointerEvent) => {
      if (!s || ev.pointerId !== s.id || ev.pointerType === "mouse") return;
      const dx = ev.clientX - s.x0;
      const dy = ev.clientY - s.y0;
      if (!s.on) {
        if (Math.abs(dy) > GIVE_UP || dx < -GIVE_UP || s.x0 < EDGE) return void (clearTimeout(s.hold), (s = undefined));
        if (dx < START) return;
        clearTimeout(s.hold);
        s.on = true;
        s.el.classList.add("swiping");
        s.el.style.transition = "none";
        const g = document.createElement("span");
        g.className = `swipe-mark${s.el.matches(".user, .user-m") ? " for-user" : ""}`;
        g.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 4 11l5.5 5.5"/><path d="M4.6 11H13a6.5 6.5 0 0 1 6.5 6.5V19"/></svg>';
        s.el.parentElement?.insertBefore(g, s.el);
        const r = s.el.getBoundingClientRect();
        const pr = s.el.parentElement!.getBoundingClientRect();
        g.style.top = `${r.top - pr.top + s.el.parentElement!.scrollTop + r.height / 2 - 16}px`;
        // The mark shows where the bubble leaves room: the partner's at the screen's edge, the user's just before its own bubble.
        g.style.left = s.el.matches(".user, .user-m") ? `${r.left - pr.left - 40}px` : `${r.left - pr.left + 6}px`;
        s.glyph = g;
      }
      ev.preventDefault();
      const d = dx - START;
      const off = d < ARM ? d : ARM + (d - ARM) * 0.28; // past the arming point it gives, like clay
      s.el.style.transform = `translateX(${Math.min(off, 96)}px)`;
      const p = Math.max(0, Math.min(1, d / ARM));
      if (s.glyph) {
        s.glyph.style.opacity = String(p);
        s.glyph.style.transform = `scale(${0.6 + 0.4 * p})`;
      }
      if (!s.armed && d >= ARM) {
        s.armed = true;
        s.glyph?.classList.add("armed");
        haptic("light");
      } else if (s.armed && d < ARM - 8) {
        s.armed = false;
        s.glyph?.classList.remove("armed");
      }
    };
    const up = (ev: PointerEvent) => {
      if (!s || ev.pointerId !== s.id) return;
      const go = s.armed ? targets.get(s.key) : undefined;
      reset();
      if (go) A.startReply(go);
    };
    const context = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-reply]");
      if (!el || (ev.target as HTMLElement).closest("a, textarea, input")) return;
      if (window.getSelection()?.toString().trim()) return; // the browser's own menu for a selection
      ev.preventDefault();
      setMenu({ x: ev.clientX, y: ev.clientY, key: el.dataset.reply!, text: textOf(el) });
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move, { passive: false });
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", reset);
    root.addEventListener("contextmenu", context);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", reset);
      root.removeEventListener("contextmenu", context);
    };
  }, [scroller.current]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    const h = setTimeout(() => window.addEventListener("pointerdown", close, { once: true }), 0);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(h);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);
  return menu;
}

/** Long press / right click: Reply and Copy, where the finger or the pointer is. */
export function ReplyMenu({ menu }: { menu?: Menu }) {
  if (!menu) return null;
  const r = targets.get(menu.key);
  const x = Math.min(menu.x, window.innerWidth - 168);
  const y = Math.min(menu.y + 8, window.innerHeight - 120);
  return (
    <div class="reply-menu" role="menu" style={{ left: `${Math.max(12, x)}px`, top: `${y}px` }} onPointerDown={(e) => e.stopPropagation()}>
      {r && (
        <button type="button" role="menuitem" onClick={() => (A.startReply(r), A.changed())}>
          <ReplyGlyph size={18} />
          <span>{t("reply.action")}</span>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void navigator.clipboard?.writeText(menu.text).then(() => A.toast(t("reply.copied")), () => {});
          A.changed();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="11" height="12" rx="3" />
          <path d="M5 15V7a3 3 0 0 1 3-3h7" />
        </svg>
        <span>{t("reply.copy")}</span>
      </button>
    </div>
  );
}

/** The hover Reply beside a bubble on a wide screen (with a mouse; touch swipes). */
export function HoverReply({ k }: { k?: string }) {
  if (!k) return null;
  return (
    <button
      type="button"
      class="hover-reply"
      aria-label={t("reply.action")}
      title={t("reply.action")}
      onClick={(ev) => {
        ev.stopPropagation();
        const r = targets.get(k);
        if (r) A.startReply(r);
      }}
    >
      <ReplyGlyph size={18} />
    </button>
  );
}

/** A part of the partner's words selected on a wide screen: 回复这段 / Reply to this part. */
export function PartReply({ scroller }: { scroller: { current: HTMLElement | null } }) {
  const [at, setAt] = useState<{ x: number; y: number; key: string; part: string } | undefined>();
  const last = useRef<string>("");
  useEffect(() => {
    const check = () => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!sel || !text || sel.rangeCount === 0 || text === last.current) return void (!text && setAt(undefined));
      const range = sel.getRangeAt(0);
      const host = (range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLElement>("[data-reply]");
      if (!host || !scroller.current?.contains(host)) return void setAt(undefined);
      const r = range.getBoundingClientRect();
      last.current = text;
      setAt({ x: r.left + r.width / 2, y: r.top, key: host.dataset.reply!, part: text.slice(0, 400) });
    };
    const clear = () => ((last.current = ""), setAt(undefined));
    document.addEventListener("mouseup", check);
    document.addEventListener("keyup", check);
    document.addEventListener("selectionchange", () => !window.getSelection()?.toString().trim() && clear());
    return () => {
      document.removeEventListener("mouseup", check);
      document.removeEventListener("keyup", check);
    };
  }, []);
  if (!at) return null;
  return (
    <button
      type="button"
      class="part-reply"
      style={{ left: `${at.x}px`, top: `${Math.max(8, at.y - 44)}px` }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const r = targets.get(at.key);
        if (r) A.startReply({ ...r, part: at.part });
        window.getSelection()?.removeAllRanges();
        setAt(undefined);
      }}
    >
      <ReplyGlyph size={16} />
      <span>{t("reply.part")}</span>
    </button>
  );
}
