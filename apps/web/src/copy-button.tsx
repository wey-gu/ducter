// D492: 拷贝 / Copy, a whole message, from a button of its own: the hover pebble beside a message
// in the conversation, the quiet line under a task's words. The button itself says 已拷贝 / Copied
// for a moment (the drawn check in the done ink) with the light tap; a copy that failed says so in
// the toast, with the way to pick the words by hand.
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { copyMessage } from "./conv-copy.ts";
import { COPY_GLYPH } from "./markdown.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The drawn check, the copy mark's "done" (never a text glyph: iOS draws those as emoji). */
export const CHECK_GLYPH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';

/** How long the button says 已拷贝. */
export const COPIED_MS = 1600;

/** A button that copies `text(itself)` (read when pressed, so a long message is never held twice). */
export function CopyButton({ text, cls }: { text: (button: HTMLElement) => string | undefined; cls: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const word = t(done ? "conv.copied" : "reply.copy");
  return (
    <button
      type="button"
      class={`${cls}${done ? " done" : ""}`}
      aria-label={word}
      onClick={(ev) => {
        ev.stopPropagation();
        const md = text(ev.currentTarget as HTMLElement);
        if (!md?.trim()) return;
        void copyMessage(md, (ok) => {
          if (!ok) return A.toast(t("conv.copy.failed"));
          setDone(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), COPIED_MS);
        });
      }}
    >
      <span class="g" aria-hidden="true" dangerouslySetInnerHTML={{ __html: done ? CHECK_GLYPH : COPY_GLYPH }} />
      <span class="w" aria-hidden="true">
        {word}
      </span>
    </button>
  );
}
