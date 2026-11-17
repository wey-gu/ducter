// What every page other than the home page needs: the nav's line once you scroll, and Copy buttons.

export function navLine() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const f = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", f, { passive: true });
  f();
}

/** A Copy button copies its `data-copy`, or the text of the `pre` beside it. */
export function copyButtons(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>("button[data-copy]").forEach((b) => {
    if (b.dataset.wired) return;
    b.dataset.wired = "1";
    b.addEventListener("click", async () => {
      const text = b.dataset.copy || b.parentElement?.querySelector("pre")?.textContent?.replace(/\n$/, "") || "";
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Select and copy";
      }
      setTimeout(() => (b.textContent = "Copy"), 1600);
    });
  });
}
