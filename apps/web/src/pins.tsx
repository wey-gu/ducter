// D381: 置顶 / Pinned. A table, chart or list from a reply, kept at the top of the conversation and
// kept current: the strip under the bar names the newest one (a list's progress beside it); a tap
// opens the sheet with each pin drawn whole, its ticks the home's, 取消置顶 under it. The partner
// changes a pin in place when asked; the strip settles when one changes. Facts are separate
// elements (D291), never joined.
import { useEffect, useRef } from "preact/hooks";
import { pinProgress, type PinView } from "@ducter/protocol/src/pins.ts";
import { A } from "./app.ts";
import { stamp } from "./format.ts";
import { RichBlock } from "./rich.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The pushpin, drawn (never an emoji: D-no-emoji): a head, its collar and the needle. */
export const PIN_GLYPH = (
  <svg class="pin-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5.2 2h5.6M6.3 2v3.8L4.2 8.9h7.6L9.7 5.8V2M8 8.9V14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** Which pin the sheet opens on (scrolled to), if any. */
let focusId: string | undefined;

export function openPins(id?: string) {
  focusId = id;
  A.sheet = { kind: "pins" };
  A.changed();
}

function close() {
  A.sheet = null;
  A.changed();
}

/** A tick on a pinned list: shown at once, the home's answer follows to every device. */
export function tickPin(p: PinView, item: string, on: boolean) {
  const set = new Set(p.ticks ?? []);
  if (on) set.add(item);
  else set.delete(item);
  if (p.ui.type === "checklist") p.ticks = p.ui.items.filter((x) => set.has(x));
  A.send({ t: "pin_tick", id: p.id, item, on });
  A.changed();
}

function unpin(p: PinView) {
  A.pins = A.pins.filter((x) => x.id !== p.id);
  A.send({ t: "unpin", id: p.id });
  // 撤销 pins the same block again, from the message it is in now.
  A.toast(t("pin.unpinned", p.title), { label: t("pin.undo"), run: () => A.send({ t: "pin", seq: p.seq, index: p.index }) });
  if (!A.pins.length) close();
  else A.changed();
}

/** The strip under the bar: the newest pin's name, a list's progress, how many more. */
export function PinStrip() {
  const pins = A.showsDefault() ? A.pins : [];
  const top = pins[0];
  // The strip settles once when its newest pin changes (pinned, or the partner changed it).
  const mark = top ? `${top.id}:${top.version}` : "";
  const seen = useRef(mark);
  const settle = mark !== seen.current;
  useEffect(() => void (seen.current = mark), [mark]);
  if (!top) return null;
  const prog = pinProgress(top);
  const more = pins.length - 1;
  return (
    <div class="pin-strip-row">
      <button type="button" key={mark} class={`pin-strip${settle ? " settle" : ""}`} aria-label={t("pin.open", top.title)} onClick={() => openPins(top.id)}>
        <span class="pin-dot">{PIN_GLYPH}</span>
        <span class="pin-name">{top.title}</span>
        {prog && (
          <span class={`pin-prog${prog.done === prog.total ? " all" : ""}`}>{t("pin.progress", prog.done, prog.total)}</span>
        )}
        {more > 0 && <span class="pin-more">{t("pin.more", more)}</span>}
      </button>
    </div>
  );
}

/** 置顶 / Pinned: every pin whole, newest first; ticks the home's; 取消置顶 under each. */
export function PinsSheet() {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = focusId ? list.current?.querySelector(`[data-pin="${focusId}"]`) : undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, []);
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault(), e.stopPropagation();
    close();
  };
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="past-sheet pins-sheet" role="dialog" aria-modal="true" aria-label={t("pin.title")} onKeyDown={keys}>
        <div class="past-head">
          <h2>
            <span class="pin-dot">{PIN_GLYPH}</span>
            {t("pin.title")}
          </h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        <div class="past-list pins-list" ref={list}>
          {A.pins.map((p) => (
            <section class="pin-item" data-pin={p.id} key={p.id} aria-label={p.title}>
              <RichBlock b={p.ui} at={{ seq: p.seq, index: p.index, live: false, sheet: p }} />
              <div class="pin-foot">
                <span class="pin-when">{p.updated ? t("pin.updated", stamp(A.L, p.updated)) : t("pin.at", stamp(A.L, p.at))}</span>
                <button type="button" class="btn text sm" onClick={() => unpin(p)}>
                  <span class="lbl">{t("pin.unpin")}</span>
                </button>
              </div>
            </section>
          ))}
          <p class="pin-hint">{t("pin.hint", A.S.personaName || "Ducter")}</p>
        </div>
      </div>
    </>
  );
}
