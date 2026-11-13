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
import { copyAndSay } from "./conv-copy.ts";
import { when } from "./format.ts";
import { copyText, COPY_GLYPH, forReading } from "./markdown.ts";
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
  /** D254: when it was said (the menu's quiet first line), and a link pressed on. */
  ts?: string;
  link?: string;
}

/** D254: a message's words as they go to the clipboard: its source, not what the screen drew. */
export function sourceOf(e: Entry | undefined): string | undefined {
  if (!e) return undefined;
  if (e.user) return e.user.text;
  if (e.ai) return copyText(e.ai.text);
  if (e.job?.ack) return e.job.ack.text;
  if (e.decision) {
    const d = A.S.decisions.get(e.decision.decisionId);
    return d?.said || e.decision.question;
  }
  return undefined;
}

/** The row a pressed element belongs to, by its data-seq. */
const entryAt = (el: HTMLElement): Entry | undefined => {
  const seq = Number(el.closest<HTMLElement>("[data-seq]")?.dataset.seq);
  return Number.isFinite(seq) ? A.S.channel.find((e) => e.firstSeq === seq) : undefined;
};

/** D254: on a touch screen a long press opens Ducter's menu, not the system's selection. */
export const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/**
 * Swipe right, long press and right click on any [data-reply] in the conversation, through one
 * listener on the scroller (rows keep their own layout; nothing is wrapped).
 */
export function useReplyGestures(scroller: { current: HTMLElement | null }): Menu | undefined {
  const [menu, setMenu] = useState<Menu | undefined>();
  closeMenu = () => setMenu(undefined);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let s: { el: HTMLElement; key: string; x0: number; y0: number; id: number; on: boolean; armed: boolean; glyph?: HTMLElement; hold?: ReturnType<typeof setTimeout>; link?: string } | undefined;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    // D254: the click that ends a long press never opens the link or the card under it.
    let heldAt = 0;
    const swallow = (ev: MouseEvent) => Date.now() - heldAt < 800 && (ev.preventDefault(), ev.stopPropagation());
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
    // The source when the row has one; else the words as drawn, paragraphs kept (innerText).
    const textOf = (el: HTMLElement) => {
      const e = el.dataset.reply?.includes("/") ? undefined : entryAt(el);
      const drawn = el.querySelector<HTMLElement>(".bubble, .words") ?? el;
      return (sourceOf(e) ?? drawn.innerText ?? drawn.textContent ?? "").trim();
    };
    const menuAt = (el: HTMLElement, x: number, y: number, key: string, link?: string): Menu => ({ x, y, key, text: textOf(el), ts: entryAt(el)?.ev.ts, ...(link ? { link } : {}) });
    const down = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-reply]");
      if (!el || (ev.target as HTMLElement).closest("button, textarea, input, .tray, .imprint")) return;
      // D254: a link held opens the menu with Copy link; it never swipes.
      const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      const key = el.dataset.reply!;
      // The whole row moves (a find moves its note); what is replied to is the one under the finger.
      const row = (el.closest(".scroll > *") as HTMLElement | null) ?? el;
      s = { el: row, key, x0: ev.clientX, y0: ev.clientY, id: ev.pointerId, on: false, armed: false, ...(a ? { link: a.href } : {}) };
      if (ev.pointerType !== "mouse") {
        const link = a?.href;
        s.hold = setTimeout(() => {
          if (!s || s.on) return;
          haptic("light");
          heldAt = Date.now();
          setMenu(menuAt(el, ev.clientX, ev.clientY, key, link));
          s = undefined;
        }, HOLD_MS);
      }
    };
    const move = (ev: PointerEvent) => {
      if (!s || ev.pointerId !== s.id || ev.pointerType === "mouse") return;
      const dx = ev.clientX - s.x0;
      const dy = ev.clientY - s.y0;
      if (!s.on) {
        if (Math.abs(dy) > GIVE_UP || dx < -GIVE_UP || s.x0 < EDGE || (s.link && dx > GIVE_UP)) return void (clearTimeout(s.hold), (s = undefined));
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
      if (s.link && !s.on) return void (clearTimeout(s.hold), (s = undefined)); // a tap on a link opens it
      const go = s.armed ? targets.get(s.key) : undefined;
      reset();
      if (go) A.startReply(go);
    };
    const context = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-reply]");
      if (!el || (ev.target as HTMLElement).closest("textarea, input")) return;
      // With a mouse, a link and a selection keep the browser's own menu (Copy Link, Copy, Look Up).
      if (!coarse() && ((ev.target as HTMLElement).closest("a") || window.getSelection()?.toString().trim())) return;
      ev.preventDefault();
      if (coarse()) return; // a touch screen's long press (above) opens it, once
      setMenu(menuAt(el, ev.clientX, ev.clientY, el.dataset.reply!));
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move, { passive: false });
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", reset);
    root.addEventListener("contextmenu", context);
    root.addEventListener("click", swallow, true);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", reset);
      root.removeEventListener("contextmenu", context);
      root.removeEventListener("click", swallow, true);
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

/** D254: the words a message gets in 选择文字 / Select text, while that sheet is open. */
let selecting: string | undefined;
/** Puts the open menu away (set by useReplyGestures, which holds it). */
let closeMenu = () => {};

/** Long press / right click: when it was said, then Reply, Copy (the whole message, as written),
 *  Copy link on a link, and on a touch screen Select text (the words in a sheet, to pick a part). */
export function ReplyMenu({ menu }: { menu?: Menu }) {
  if (!menu) return null;
  const r = targets.get(menu.key);
  const items = 1 + (r ? 1 : 0) + (menu.link ? 1 : 0) + (coarse() ? 1 : 0);
  const x = Math.min(menu.x, window.innerWidth - 196);
  const y = Math.min(menu.y + 8, window.innerHeight - 24 - items * 44 - (menu.ts ? 28 : 0));
  const said = (ok: boolean) => A.toast(t(ok ? "conv.copied" : "conv.copy.failed"));
  return (
    <div class="reply-menu" role="menu" style={{ left: `${Math.max(12, x)}px`, top: `${Math.max(12, y)}px` }} onPointerDown={(e) => e.stopPropagation()}>
      {menu.ts && (
        <div class="menu-when" role="presentation">
          {when(A.L, menu.ts)}
        </div>
      )}
      {r && (
        <button type="button" role="menuitem" onClick={() => (closeMenu(), A.startReply(r), A.changed())}>
          <ReplyGlyph size={18} />
          <span>{t("reply.action")}</span>
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => (closeMenu(), void copyAndSay(menu.text, said))}>
        <span class="menu-glyph" dangerouslySetInnerHTML={{ __html: COPY_GLYPH }} />
        <span>{t("reply.copy")}</span>
      </button>
      {menu.link && (
        <button type="button" role="menuitem" onClick={() => (closeMenu(), void copyAndSay(menu.link!, said))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
            <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
          </svg>
          <span>{t("conv.copy.link")}</span>
        </button>
      )}
      {coarse() && (
        <button type="button" role="menuitem" onClick={() => (closeMenu(), (selecting = forReading(menu.text)), A.changed())}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 6h14M5 12h9M5 18h11" />
            <path d="M18 14v7" />
          </svg>
          <span>{t("conv.select")}</span>
        </button>
      )}
    </div>
  );
}

/** 选择文字 / Select text (D254): the message's words on a sheet where the system's own selection
 *  works, to copy a part; Copy all and Done under them. */
export function SelectText() {
  const open = selecting !== undefined;
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && ((selecting = undefined), A.changed());
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  if (selecting === undefined) return null;
  const text = selecting;
  const close = () => ((selecting = undefined), A.changed());
  return (
    <div class="select-text" role="dialog" aria-modal="true" aria-label={t("conv.select")}>
      <div class="scrim" onClick={close} />
      <div class="select-card">
        <div class="select-words">{text}</div>
        <div class="btns">
          <button type="button" class="btn secondary" onClick={() => void copyAndSay(text, (ok) => (A.toast(t(ok ? "conv.copied" : "conv.copy.failed")), ok && close()))}>
            {t("conv.select.all")}
          </button>
          <button type="button" class="btn primary" onClick={close}>
            {t("conv.select.done")}
          </button>
        </div>
      </div>
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
