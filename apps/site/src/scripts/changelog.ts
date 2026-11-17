// /changelog (D344): a link to an older release (#0.0.40) opens its fold. Without JavaScript the
// folds still open on a tap, and the browser's find opens a closed one by itself.
import { navLine } from "./common";

function openHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id ? document.getElementById(id) : null;
  // Chrome may already have opened it for the link (and scrolled before the fonts came): land anyway.
  if (el instanceof HTMLDetailsElement) {
    el.open = true;
    el.scrollIntoView();
    // The fonts arriving move what's above it: land on it again once they have.
    const again = () => el.scrollIntoView();
    void document.fonts?.ready.then(again);
    if (document.readyState !== "complete") addEventListener("load", again, { once: true });
  }
}

navLine();
openHash();
addEventListener("hashchange", openHash);
