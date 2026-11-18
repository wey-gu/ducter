// D303: rich answers in the conversation. A block the partner put in its words, drawn from the
// shared model (packages/protocol/src/rich.ts richModel), the same as the Mac's
// (apps/desktop/internal/views/rich.go): a table is a real table; a chart is a picture with its
// summary in words and its values in a table for a screen reader; a checklist's ticks stay on
// this device; a choice's tap sends its words as the person's reply.
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { PINNABLE, richModel, type RichModel, type RichUi } from "@ducter/protocol/src/rich.ts";
import { pinAt, pinTitle, pinWas, type PinView } from "@ducter/protocol/src/pins.ts";
import { A } from "./app.ts";
import { LendCard } from "./lend.tsx";
import { openPins, PIN_GLYPH, tickPin } from "./pins.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Where a block stands: live (its choices can still be tapped), and what was picked after it. */
export interface RichAt {
  seq: number;
  index: number;
  /** Nothing from the person has come after the message: its choices can still be tapped. */
  live: boolean;
  /** The person's reply right after it, when it is one of its choices. */
  picked?: string;
  /** D381: drawn in the pinned sheet: this pin, no corner (Unpin is under it). */
  sheet?: PinView;
}

export function RichBlock({ b, at }: { b: RichUi; at: RichAt }) {
  const m = richModel(b);
  // D381: the pin this block is now (only its newest message), and the corner that pins it.
  const pin = at.sheet ?? (at.seq > 0 ? pinAt(A.pins, at.seq, at.index) : undefined);
  const corner = at.sheet || !PINNABLE.includes(b.type) || !A.showsDefault() || (!pin && pinWas(A.pins, at.seq, at.index)) ? undefined : <PinCorner b={b} at={at} pin={pin} />;
  switch (m.type) {
    case "table":
      return <RichTable m={m} corner={corner} />;
    case "chart":
      return <RichChart m={m} corner={corner} />;
    case "checklist":
      return <RichChecklist m={m} at={at} pin={pin} corner={corner} />;
    case "choices":
      return <RichChoices m={m} at={at} />;
    case "lend":
      return <LendCard />;
  }
}

type M<K extends RichModel["type"]> = Extract<RichModel, { type: K }>;

/**
 * D381: the card's corner: 置顶 / Pin, or 已置顶 / Pinned (a tap opens the pinned sheet) when this
 * block is a pin now. Quiet until wanted: muted ink, the accent only once it is pinned.
 */
function PinCorner({ b, at, pin }: { b: RichUi; at: RichAt; pin: PinView | undefined }) {
  const name = pinTitle(b);
  if (pin)
    return (
      <button type="button" class="rich-pin on" aria-label={t("pin.open", pin.title)} onClick={() => openPins(pin.id)}>
        {PIN_GLYPH}
        <span>{t("pin.pinned")}</span>
      </button>
    );
  return (
    <button type="button" class="rich-pin" aria-label={name ? t("pin.pin.about", name) : t("pin.pin")} onClick={() => A.send({ t: "pin", seq: at.seq, index: at.index })}>
      {PIN_GLYPH}
      <span>{t("pin.pin")}</span>
    </button>
  );
}

function RichTable({ m, corner }: { m: M<"table">; corner?: ComponentChildren }) {
  return (
    <figure class={`rich-card rich-table${corner ? " has-pin" : ""}`}>
      {corner}
      {m.title && <figcaption class="rich-title">{m.title}</figcaption>}
      {/* A wide table scrolls inside its card on a phone; the row labels stay put. */}
      <div class="rich-scroll" tabIndex={0} role="region" aria-label={m.title || t("rich.table")}>
        <table>
          <thead>
            <tr>
              {m.columns.map((c, j) => (
                <th scope="col" class={m.numeric[j] ? "rc-num" : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr>
                {r.map((c, j) =>
                  j === 0 ? (
                    <th scope="row">{c}</th>
                  ) : (
                    <td class={m.numeric[j] ? "rc-num" : undefined}>{c}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function RichChart({ m, corner }: { m: M<"chart">; corner?: ComponentChildren }) {
  const n = m.points.length;
  const zero = (0 - m.lo) / (m.hi - m.lo);
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (f: number) => (1 - f) * 100;
  return (
    <figure class={`rich-card rich-chart rc-${m.kind}-chart${corner ? " has-pin" : ""}`}>
      {corner}
      <figcaption>
        {m.title && <span class="rich-title">{m.title}</span>}
        <span class="rich-sum">{m.summary}</span>
      </figcaption>
      <div class="rc-chart" aria-hidden="true" style={{ "--n": n, "--zero": zero }}>
        <div class="rc-plot">
          {m.ticks.map((k) => (
            <span class={`rc-tick${k.value === 0 ? " rc-zero" : ""}`} style={{ "--f": (k.value - m.lo) / (m.hi - m.lo) }}>
              <i>{k.label}</i>
            </span>
          ))}
          {m.kind === "bar" ? (
            <div class="rc-bars">
              {m.points.map((p) => (
                <span class={`rc-col${p.value < 0 ? " rc-neg" : ""}`}>
                  <span class="rc-bar" style={{ "--a": Math.min(p.frac, zero), "--b": Math.max(p.frac, zero) }}>
                    {m.values && <b>{p.text}</b>}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <>
              <svg class="rc-line" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline points={m.points.map((p, i) => `${x(i)},${y(p.frac)}`).join(" ")} vector-effect="non-scaling-stroke" />
              </svg>
              {m.points.map((p, i) => (
                <span class="rc-dot" style={{ "--x": x(i) / 100, "--f": p.frac }}>
                  {m.values && <b>{p.text}</b>}
                </span>
              ))}
            </>
          )}
        </div>
        <div class="rc-xl">
          {m.points.map((p) => (
            <span>{p.label}</span>
          ))}
        </div>
      </div>
      {/* The numbers themselves, for a screen reader. */}
      <table class="sr">
        <caption>{m.title || m.summary}</caption>
        <tbody>
          {m.points.map((p) => (
            <tr>
              <th scope="row">{p.label}</th>
              <td>{p.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const TICKS = "ducter.ticks.";
function readTicks(key: string): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(TICKS + key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}
function keepTicks(key: string, on: number[]) {
  try {
    if (on.length) localStorage.setItem(TICKS + key, JSON.stringify(on));
    else localStorage.removeItem(TICKS + key);
  } catch {
    /* ticks are a convenience: a private window just forgets them */
  }
}

/** The words a checklist's Done sends: what's ticked, and what isn't yet. */
export function toldWords(items: string[], on: Set<number>): string {
  const done = items.filter((_, i) => on.has(i));
  const left = items.filter((_, i) => !on.has(i));
  const list = (xs: string[]) => xs.join(t("rich.join"));
  if (!left.length) return t("rich.told.all");
  if (!done.length) return t("rich.told.none");
  return t("rich.told.both", list(done), list(left));
}

const TICK_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.4 5.9 10.2 11 4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

function RichChecklist({ m, at, pin, corner }: { m: M<"checklist">; at: RichAt; pin?: PinView; corner?: ComponentChildren }) {
  const key = `${at.seq}.${at.index}`;
  const [mine, setMine] = useState(() => new Set(readTicks(key)));
  // D381: a pinned list's ticks are the home's, the same on every device; the others stay here.
  const on = pin ? new Set(m.items.map((x, i) => ((pin.ticks ?? []).includes(x) ? i : -1)).filter((i) => i >= 0)) : mine;
  const flip = (i: number) => {
    if (pin) return tickPin(pin, m.items[i]!, !on.has(i));
    const next = new Set(mine);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setMine(next);
    keepTicks(key, [...next].sort((a, b) => a - b));
  };
  return (
    <figure class={`rich-card rich-check${corner ? " has-pin" : ""}`}>
      {corner}
      {m.title && <figcaption class="rich-title">{m.title}</figcaption>}
      <ul>
        {m.items.map((x, i) => (
          <li class={on.has(i) ? "on" : undefined}>
            <label>
              <input type="checkbox" checked={on.has(i)} onChange={() => flip(i)} />
              <span class="rc-box">{TICK_GLYPH}</span>
              <span class="rc-item">{x}</span>
            </label>
          </li>
        ))}
      </ul>
      {/* Ticks stay on this device (a pinned list's on the home); only when the partner asked to hear
          back is there a way to tell it, at any time: a list is ticked over days. */}
      {m.tell && (
        <div class="rich-tell">
          <button type="button" class="btn secondary sm" onClick={() => A.sendWords(toldWords(m.items, on))}>
            <span class="lbl">{t("rich.tell")}</span>
          </button>
        </div>
      )}
    </figure>
  );
}

function RichChoices({ m, at }: { m: M<"choices">; at: RichAt }) {
  return (
    <div class={`rich-choices${at.live ? "" : " past"}`} role="group" aria-label={t("rich.choices")}>
      {m.options.map((o) => {
        const picked = at.picked === o;
        return (
          <button type="button" class={`btn ${picked ? "accent" : "secondary"} sm rich-chip${picked ? " picked" : ""}`} disabled={!at.live} aria-pressed={at.live ? undefined : picked} onClick={() => A.sendWords(o)}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
