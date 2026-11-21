/** D452: the person's text size, as the root's size over the 16px the type scale is written against
 * (the browser's own font size, times the phone app's `--text-scale`). A list whose rows are one
 * height in code (drawn only near its view) multiplies its row by this, so its words never clip. */
export function rootScale(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 1;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return px > 0 ? px / 16 : 1;
}

/** A row height written at 16px, at the person's text size (whole pixels, never smaller). */
export const scaledRow = (px: number): number => Math.max(px, Math.round(px * rootScale()));

/** D452: at 1.6x the person's size and above (iOS's accessibility sizes, a browser set very large),
 * `html[data-text-size="large"]` lets a row that puts words beside a button stack the button under
 * the words instead of squeezing them into a narrow column. Never set at the default size. */
export function markTextSize(): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (rootScale() >= 1.6) el.dataset.textSize = "large";
  else delete el.dataset.textSize;
}

/** Marks it now, again on a resize, and when the iPhone app changes the size (`window.ducterTextSize`). */
export function watchTextSize(): void {
  if (typeof window === "undefined") return;
  markTextSize();
  (window as unknown as { ducterTextSize?: () => void }).ducterTextSize = markTextSize;
  window.addEventListener("resize", markTextSize);
}
