// D254: copying from the conversation. The home is often reached over plain http on the home
// network (or a tunnel without a secure context in an old web view), where `navigator.clipboard`
// does not exist: before D254 Copy then did nothing and said nothing. Copy here tries the
// Clipboard API, then the old way (a hidden field selected and copied inside the tap), and says
// whether it worked.
import { haptic } from "./native.ts";

type Doc = Pick<Document, "createElement" | "execCommand" | "activeElement"> & { body: HTMLElement };

/** The old way: a hidden field, selected and copied within the same tap. */
export function copyByField(text: string, d: Doc = document): boolean {
  const field = d.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  // Off screen but focusable; 16px keeps iOS from zooming in on it.
  field.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px";
  const was = d.activeElement as HTMLElement | null;
  d.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = d.execCommand("copy");
  } catch {
    ok = false;
  }
  field.remove();
  was?.focus?.({ preventScroll: true });
  return ok;
}

/** Copies text; true when it is on the clipboard. */
export async function copy(text: string, nav: { clipboard?: { writeText(s: string): Promise<void> } } = navigator, d?: Doc): Promise<boolean> {
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // A web view that has the API but refuses it (no focus, no permission): the old way.
    }
  }
  return copyByField(text, d);
}

/** A copy the person asked for: the light tap and 已拷贝 / Copied, or that it didn't work. */
export async function copyAndSay(text: string, say: (ok: boolean) => void): Promise<void> {
  const ok = await copy(text);
  if (ok) haptic("light");
  say(ok);
}

/**
 * A code block's own Copy (markdown.ts draws it): one listener for the page, so every block
 * anywhere (the conversation, a task's transcript) copies its code and says 已拷贝 on the button
 * for a moment.
 */
export function listenForCodeCopy(words: () => { copy: string; copied: string; failed: string }, toast: (s: string) => void) {
  document.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest?.<HTMLButtonElement>("[data-copy-code]");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const code = btn.parentElement?.querySelector("pre code")?.textContent ?? "";
    void copyAndSay(code, (ok) => {
      const w = words();
      if (!ok) return toast(w.failed);
      const label = btn.querySelector("span");
      btn.classList.add("done");
      if (label) label.textContent = w.copied;
      setTimeout(() => {
        btn.classList.remove("done");
        if (label) label.textContent = w.copy;
      }, 1600);
    });
  });
}
