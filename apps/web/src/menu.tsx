// D421: the one menu of the web and phone client, and the one select built on it. Every ⋯, every
// right-click or long-press menu and every short choice goes through Menu / MenuItem / Select:
// Pebble's clay panel (the card's surface, the floating shadow, rows of the small type that warm on
// hover, focus and press, a danger row in the failed ink, an optional drawn glyph), the keys
// (Up/Down, Home/End, typing a first letter, Enter/Space, Escape back to the opener), the ARIA roles,
// and placement that stays inside the window. test/menus.test.ts fails on a raw role="menu" or a
// native <select> anywhere else. Each caller keeps its own class for where the panel sits.
import type { ComponentChildren, JSX } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

/** The rows the keys walk: every enabled button in the panel (a menuitem, or a Btn in an inline menu). */
const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];

/** The keys of a menu or a listbox: move, first letter, Escape. Handled keys stop here, so a sheet's own
 *  arrow keys under it don't walk too. */
export function menuKeys(e: KeyboardEvent, el: HTMLElement | null, close?: () => void) {
  if (!el) return;
  const list = rows(el);
  if (!list.length) return;
  const i = list.indexOf(document.activeElement as HTMLButtonElement);
  const go = (n: number) => (e.preventDefault(), e.stopPropagation(), list[(n + list.length) % list.length]?.focus({ preventScroll: true }));
  if (e.key === "ArrowDown") return go(i < 0 ? 0 : i + 1);
  if (e.key === "ArrowUp") return go(i < 0 ? list.length - 1 : i - 1);
  if (e.key === "Home") return go(0);
  if (e.key === "End") return go(list.length - 1);
  if (e.key === "Escape" && close) return e.preventDefault(), e.stopPropagation(), close();
  if (e.key === "Tab" && close) return close();
  if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const k = e.key.toLocaleLowerCase();
    for (let n = 1; n <= list.length; n++) {
      const b = list[(Math.max(i, 0) + n) % list.length];
      if ((b.textContent ?? "").trim().toLocaleLowerCase().startsWith(k)) return go(list.indexOf(b));
    }
  }
}

/** A list that opens from a control (the select) floats over everything, fixed to its control: below
 *  it, or above where the window has no room, never cut by a card that clips what overflows it. */
function pin(el: HTMLElement, at: Element) {
  const r = at.getBoundingClientRect();
  el.style.position = "fixed";
  el.style.minWidth = `${Math.max(r.width, 180)}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  const h = el.offsetHeight;
  const w = el.offsetWidth;
  const below = r.bottom + 6;
  el.style.top = `${below + h > window.innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : below}px`;
  el.style.left = `${Math.min(Math.max(8, r.right - w), window.innerWidth - 8 - w)}px`;
}

/** Nudges a floating panel back inside the window: it goes above its opener when it would run off the
 *  bottom, and slides in from the sides. Inline panels (no position: absolute/fixed) are left alone. */
function keepInside(el: HTMLElement) {
  el.style.transform = "";
  el.classList.remove("dmenu-up");
  const pos = getComputedStyle(el).position;
  if (pos !== "absolute" && pos !== "fixed") return;
  const pad = 8;
  let r = el.getBoundingClientRect();
  if (r.bottom > window.innerHeight - pad && pos === "absolute") {
    el.classList.add("dmenu-up");
    r = el.getBoundingClientRect();
    if (r.top < pad) el.classList.remove("dmenu-up");
    r = el.getBoundingClientRect();
  }
  let dx = 0;
  let dy = 0;
  if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
  if (r.left + dx < pad) dx = pad - r.left;
  if (pos === "fixed" && r.bottom > window.innerHeight - pad) dy = window.innerHeight - pad - r.bottom;
  if (r.top + dy < pad) dy = pad - r.top;
  if (dx || dy) el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
}

export type MenuProps = {
  /** Where the panel sits (the caller's own class: pmenu, reply-menu, …). */
  class?: string;
  label?: string;
  /** Escape, Tab and a press outside close it; focus goes back to what opened it. */
  onClose?: () => void;
  /** The first row takes the focus as it opens (opened from the keyboard). */
  focusFirst?: boolean;
  /** The caller walks the rows itself (a picker with its own roving focus). */
  ownKeys?: boolean;
  role?: "menu" | "listbox";
  /** What opened it (the ⋯, the select's button): a press on it is not "outside". */
  anchor?: { current: Element | null };
  style?: JSX.CSSProperties;
  onPointerDown?: (e: PointerEvent) => void;
  children: ComponentChildren;
};

/** The clay menu panel. */
export function Menu(p: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  // What had the focus as it opened, which takes it back as it closes.
  const opener = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);
  const close = p.onClose;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (p.anchor?.current) pin(el, p.anchor.current);
    keepInside(el);
    if (p.focusFirst) rows(el)[0]?.focus({ preventScroll: true });
    else if (!p.ownKeys && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);
  useEffect(
    () => () => {
      // Back to what opened it, when the menu had the focus.
      const o = opener.current;
      if (o instanceof HTMLElement && o.isConnected && (document.activeElement === document.body || !document.activeElement)) o.focus({ preventScroll: true });
    },
    [],
  );
  useEffect(() => {
    if (!close) return;
    const out = (e: PointerEvent) => {
      const el = ref.current;
      const t = e.target as Node;
      if (!el || el.contains(t)) return;
      // A press on the opener toggles it itself: the anchor given, or the button beside the panel
      // that says it opens it (Safari doesn't focus a pressed button, so the focus can't tell).
      const from = p.anchor?.current ?? (t instanceof Element ? t.closest("[aria-expanded],[aria-haspopup]") : null);
      if (from && (from.contains(t) && (p.anchor ? true : !!el.parentElement?.contains(from)))) return;
      close();
    };
    // A list pinned to its control goes as the page under it scrolls or the window changes size.
    const moved = (e: Event) => p.anchor && !(e.target instanceof Node && ref.current?.contains(e.target)) && close();
    document.addEventListener("pointerdown", out, true);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", out, true);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [close]);
  return (
    <div
      ref={ref}
      class={`dmenu${p.class ? ` ${p.class}` : ""}`}
      role={p.role ?? "menu"}
      aria-label={p.label}
      tabIndex={-1}
      style={p.style}
      onPointerDown={p.onPointerDown}
      onKeyDown={p.ownKeys ? undefined : (e) => menuKeys(e, ref.current, close)}
    >
      {p.children}
    </div>
  );
}

/** One row of a Menu: the words, an optional drawn glyph before them (never an emoji), danger in the
 *  failed ink for what deletes or ends. */
export function MenuItem(
  p: {
    onClick: (e: MouseEvent) => void;
    danger?: boolean;
    glyph?: ComponentChildren;
    class?: string;
    disabled?: boolean;
    checked?: boolean;
    role?: "menuitem" | "menuitemradio" | "menuitemcheckbox" | "option";
    expanded?: boolean;
    label?: string;
    title?: string;
    tabIndex?: number;
    children: ComponentChildren;
  },
) {
  const role = p.role ?? (p.checked === undefined ? "menuitem" : "menuitemradio");
  const cls = [p.danger ? "danger" : "", p.class ?? ""].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      role={role}
      class={cls || undefined}
      disabled={p.disabled}
      aria-checked={role === "option" ? undefined : p.checked}
      aria-selected={role === "option" ? !!p.checked : undefined}
      aria-expanded={p.expanded}
      aria-label={p.label}
      title={p.title}
      tabIndex={p.tabIndex ?? -1}
      onClick={p.onClick}
    >
      {p.glyph && (
        <span class="dmenu-glyph" aria-hidden="true">
          {p.glyph}
        </span>
      )}
      {p.children}
    </button>
  );
}

/** A line between groups of rows. */
export function MenuSep() {
  return <hr class="dmenu-sep" role="separator" />;
}

/** A heading inside a menu (the agents under "Another agent"). */
export function MenuHead({ children }: { children: ComponentChildren }) {
  return (
    <div class="dmenu-head" role="presentation">
      {children}
    </div>
  );
}

/**
 * The clay select: a button showing the choice and a drawn caret; it opens the clay menu as a
 * listbox of the options, the chosen one checked. Never the system's grey pop-up or wheel.
 */
export function Select<V extends string>(p: { label: string; value: V; options: { v: V; label: string }[]; onPick: (v: V) => void; class?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [byKey, setByKey] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cur = p.options.find((o) => o.v === p.value);
  const shut = () => (setOpen(false), btn.current?.focus({ preventScroll: true }));
  return (
    <span class={`dselect${open ? " open" : ""}${p.class ? ` ${p.class}` : ""}`}>
      <button
        ref={btn}
        type="button"
        class="dselect-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${p.label}: ${cur?.label ?? p.placeholder ?? ""}`}
        onClick={() => (setByKey(false), setOpen(!open))}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) e.preventDefault(), setByKey(true), setOpen(true);
        }}
      >
        <span class={`dselect-v${cur ? "" : " ph"}`}>{cur?.label ?? p.placeholder ?? ""}</span>
        <svg class="dselect-caret" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.7 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {/* On the page's top layer: no card that clips or moves what's inside it holds the list. */}
      {open &&
        createPortal(
        <Menu class="dselect-list" role="listbox" label={p.label} onClose={shut} focusFirst={byKey} anchor={btn}>
          {p.options.map((o) => (
            <MenuItem key={o.v} role="option" checked={o.v === p.value} onClick={() => (shut(), o.v !== p.value && p.onPick(o.v))}>
              <span class="dmenu-w">{o.label}</span>
              {o.v === p.value && (
                <svg class="dmenu-check" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2.5 7.4 5.6 10.4 11.5 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              )}
            </MenuItem>
          ))}
        </Menu>,
          document.body,
        )}
    </span>
  );
}
