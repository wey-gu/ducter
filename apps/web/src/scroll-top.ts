// D578: the iPhone's tap on the status bar goes to the top, as in every iPhone app. The page never
// scrolls the document (the conversation, a task, a sheet each scroll a view of their own), so the
// system's own gesture had nothing to move; the app relays the tap here (WebShell.swift's
// `ducterTop`), and the view the person is reading goes to its top.

/** The scroller to move: the nearest of `el` and its ancestors that is scrolled down, or none. */
export function scrolledFrom<T extends { parentElement: T | null }>(el: T | null, scrolled: (e: T) => boolean): T | null {
  for (let e = el; e; e = e.parentElement) if (scrolled(e)) return e;
  return null;
}

/** The view under the middle of the screen (the sheet on top, else the place) goes to its top. */
export function scrollToTop(doc: Document = document): boolean {
  const at = doc.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const s =
    scrolledFrom<Element>(at, (e) => {
      if (e.scrollTop <= 0 || e.scrollHeight <= e.clientHeight + 1) return false;
      const y = getComputedStyle(e).overflowY;
      return y === "auto" || y === "scroll" || e === doc.scrollingElement;
    }) ?? (doc.scrollingElement && doc.scrollingElement.scrollTop > 0 ? doc.scrollingElement : null);
  if (!s) return false;
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  s.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  return true;
}
