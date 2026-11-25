// D578: every sheet and dialog keeps Tab inside it while it is up, and gives the focus back to what
// opened it when it closes, as a native sheet does. One watcher for the whole page, so no sheet
// needs its own: a modal is whatever is drawn with `aria-modal="true"` (or `role="alertdialog"`),
// the top one is the last that came. Menus (role=menu) keep their own keys; a popover that is not
// modal (the context meter, a task's info) closes on a click outside and is not trapped.

export const MODAL = '[aria-modal="true"], [role="alertdialog"]';
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Where Tab goes from `at` among a trap's focusables: the first (or, with Shift, the last) when
 *  the focus is not on one of them; round to the other end at either end; undefined in between,
 *  where the browser's own order moves it. */
export function tabTarget<T>(list: readonly T[], at: T | null | undefined, back: boolean): T | undefined {
  if (!list.length) return undefined;
  const i = at == null ? -1 : list.indexOf(at);
  if (i < 0) return back ? list[list.length - 1] : list[0];
  if (back && i === 0) return list[list.length - 1];
  if (!back && i === list.length - 1) return list[0];
  return undefined;
}

/** What a closed sheet gives the focus back to: the element that had it (or was pressed) last before
 *  the sheet came, if it is still on the page and not inside the sheet. A text field on a touch screen
 *  is skipped, so closing a sheet never brings the keyboard up. */
export function openerFor<T extends { isConnected: boolean }>(recent: readonly (T | null)[], inside: (el: T) => boolean, typing: (el: T) => boolean, touch: boolean): T | null {
  for (const el of recent) {
    if (!el || !el.isConnected || inside(el)) continue;
    if (touch && typing(el)) return null;
    return el;
  }
  return null;
}

interface Trap {
  el: HTMLElement;
  opener: HTMLElement | null;
}

const shown = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && !el.closest('[inert], [aria-hidden="true"]');
const typingField = (el: HTMLElement) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "range"].includes(el.type)) || el.isContentEditable;
const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

let installed = false;

/** Starts the one watcher (main.tsx, once). */
export function installFocusTrap(doc: Document = document) {
  if (installed || typeof MutationObserver !== "function") return;
  installed = true;
  const stack: Trap[] = [];
  // The last two elements focused or pressed, newest first: a sheet's opener is the newest one
  // outside it (a sheet that focuses its own field at once leaves the button that opened it second).
  const recent: (HTMLElement | null)[] = [null, null];
  const note = (el: HTMLElement | null) => {
    if (!el || el === recent[0] || el === doc.body) return;
    recent[1] = recent[0];
    recent[0] = el;
  };
  doc.addEventListener("focusin", (e) => note(e.target as HTMLElement), true);
  // Safari never focuses a button on a click: the press says what opened the sheet.
  doc.addEventListener("pointerdown", (e) => note((e.target as Element | null)?.closest?.<HTMLElement>(FOCUSABLE) ?? null), true);

  const top = () => stack[stack.length - 1];
  // The page under a sheet may stay inert for its way out (a few frames): try until it takes the
  // focus, for about half a second, unless the person has put the focus somewhere meanwhile.
  const giveBack = (el: HTMLElement | undefined, n = 0) => {
    if (!el || !el.isConnected) return;
    const at = doc.activeElement;
    if (n > 0 && at && at !== doc.body) return;
    if (el.getClientRects().length > 0 && !el.closest("[inert]")) el.focus({ preventScroll: true });
    if (doc.activeElement !== el && n < 16) setTimeout(() => giveBack(el, n + 1), 32);
  };
  const sync = () => {
    const open = [...doc.querySelectorAll<HTMLElement>(MODAL)].filter(shown);
    for (let i = stack.length - 1; i >= 0; i--) {
      const t = stack[i]!;
      if (open.includes(t.el)) continue;
      stack.splice(i, 1);
      const at = doc.activeElement as HTMLElement | null;
      const lost = !at || at === doc.body || !at.isConnected || t.el.contains(at);
      if (!lost) continue;
      giveBack(t.opener && t.opener.isConnected ? t.opener : top()?.el);
    }
    for (const el of open) {
      if (stack.some((t) => t.el === el)) continue;
      stack.push({ el, opener: openerFor(recent, (x) => el.contains(x), typingField, coarse()) });
      // The focus goes into the sheet (its own field, if it focuses one, wins after this).
      if (!el.contains(doc.activeElement)) {
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      }
    }
  };
  new MutationObserver(sync).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "role", "hidden"] });

  doc.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = top();
      if (!t || !t.el.isConnected) return;
      const at = doc.activeElement as HTMLElement | null;
      // A menu opened from the sheet (drawn outside it) keeps its own keys.
      if (at && !t.el.contains(at) && at.closest('[role="menu"], [role="listbox"]')) return;
      const list = [...t.el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
      const go = list.length ? tabTarget(list, at && t.el.contains(at) ? at : null, e.shiftKey) : t.el;
      if (!go) return;
      e.preventDefault();
      go.focus();
    },
    true,
  );
}
