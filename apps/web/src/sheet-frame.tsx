// research/123: every sheet is a frame that holds its rounded shape and does not scroll, with the
// grab on it, and a body inside that scrolls. On iOS a scroller that is itself the fixed, rounded
// sheet drew its content past its top edge at the end of a scroll; a plain child scroller inside an
// `overflow: hidden` frame is clipped by the frame. The frame moves (rise, drag, way out: D290); the
// body scrolls. The page's own classes (newtask, handset-guide, phone-install) stay on the body.
import type { ComponentChildren, Ref } from "preact";

export function SheetFrame(p: {
  label: string;
  class?: string;
  /** D644: a frame of its own (Settings' full-height phone sheet), never the body's page classes. */
  frameClass?: string;
  frame?: Ref<HTMLDivElement>;
  body?: Ref<HTMLDivElement>;
  scrim?: Ref<HTMLDivElement>;
  onScrim: () => void;
  children: ComponentChildren;
}) {
  return (
    <>
      <div class="scrim" ref={p.scrim} onClick={p.onScrim} />
      <div class={`sheet-frame${p.frameClass ? ` ${p.frameClass}` : ""}`} ref={p.frame} role="dialog" aria-modal="true" aria-label={p.label}>
        <div class="grab" />
        <div class={p.class ? `sheet ${p.class}` : "sheet"} ref={p.body}>
          {p.children}
        </div>
      </div>
    </>
  );
}
