// D404: a sheet stays above the on-screen keyboard. Android Chrome resizes the page for it
// (interactive-widget=resizes-content); iOS Safari lays the keyboard over the page instead, so a
// bottom sheet's field (a Telegram key, a card's number, the partner's new name) would sit under it.
// The keyboard's height goes to `--kb`; the phone's sheet stands on it, and the focused field is
// brought into view inside the sheet (the hand-over sheet too).

/** How much of the window the keyboard covers: zero where the page was resized for it. */
export function keyboardInset(innerHeight: number, viewportHeight: number, viewportTop: number): number {
  const kb = Math.round(innerHeight - viewportHeight - viewportTop);
  return kb > 80 ? kb : 0; // a toolbar showing or hiding is not a keyboard
}

export function keepAboveKeyboard(): void {
  const vv = typeof visualViewport !== "undefined" ? visualViewport : null;
  if (!vv) return;
  let last = -1;
  const fit = () => {
    const kb = keyboardInset(innerHeight, vv.height, vv.offsetTop);
    if (kb === last) return;
    last = kb;
    document.documentElement.style.setProperty("--kb", `${kb}px`);
    const a = document.activeElement as HTMLElement | null;
    if (kb > 0 && a && a.closest(".sheet, .ho-sheet") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) requestAnimationFrame(() => a.scrollIntoView({ block: "nearest" }));
  };
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
}
