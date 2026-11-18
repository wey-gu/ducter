// D381: 置顶 / Pin. A table, chart or list from a reply, kept at the top of the conversation and
// kept current: the person pins it with one tap (or asks the partner to), its ticks live on the
// home so every device shows the same ones, and the partner changes it in place when asked
// ("清单里加上充电宝"), by writing the whole new block with "pin":"<id>". The first step of "your
// own small apps" (motivation.md): something the partner made that stays theirs.
import type { RichBlock, RichUi } from "./rich.ts";

/** At most this many pinned at once: a strip at the top, never a second inbox. */
export const PINS_MAX = 6;
/** A pin's title as the strip shows it, in characters. */
export const PIN_TITLE_MAX = 40;

export interface PinView {
  id: string;
  /** The block as it is now (its plain form included), without its own `pin` mark. */
  ui: RichUi;
  /** The words the strip and the sheet name it by: its title, else its first words. */
  title: string;
  /** The message the block is in now (it moves to the newest message that changed it). */
  seq: number;
  index: number;
  /** Where it was before the partner changed it (newest last, at most PIN_WAS_MAX): those older
   *  blocks offer no 置顶 of their own, so an old version is never pinned beside the current one. */
  was?: { seq: number; index: number }[];
  /** A checklist's ticked items, by their words (they survive a change that adds or moves items). */
  ticks?: string[];
  /** When it was pinned, and last changed (ISO). */
  at: string;
  updated?: string;
  /** 1 when pinned; +1 each time the partner changes it. */
  version: number;
}

const clip = (s: string, n: number) => {
  const cs = [...s.replace(/\s+/g, " ").trim()];
  return cs.length > n ? cs.slice(0, n - 1).join("") + "…" : cs.join("");
};

/** The name a pin goes by: the block's title, else its first words. */
export function pinTitle(b: RichBlock): string {
  if ("title" in b && b.title) return clip(b.title, PIN_TITLE_MAX);
  switch (b.type) {
    case "table":
      return clip(b.columns.filter(Boolean).join(" / ") || b.rows[0]?.[0] || "", PIN_TITLE_MAX);
    case "chart":
      return clip(b.summary, PIN_TITLE_MAX);
    case "checklist":
      return clip(b.items[0] ?? "", PIN_TITLE_MAX);
    default:
      return "";
  }
}

/** A checklist's ticks carried into its new items: an item keeps its tick while its words stay. */
export function carryTicks(ticks: readonly string[] | undefined, b: RichBlock): string[] | undefined {
  if (b.type !== "checklist") return undefined;
  const items = new Set(b.items);
  const kept = (ticks ?? []).filter((x) => items.has(x));
  return kept;
}

/** A checklist's progress for the strip: ticked of all. */
export function pinProgress(p: Pick<PinView, "ui" | "ticks">): { done: number; total: number } | undefined {
  if (p.ui.type !== "checklist") return undefined;
  const on = new Set(p.ticks ?? []);
  return { done: p.ui.items.filter((x) => on.has(x)).length, total: p.ui.items.length };
}

/** How many earlier places a pin remembers. */
export const PIN_WAS_MAX = 20;

/** The current pin a block in a message stands for: only its newest message shows it as pinned. */
export function pinAt(pins: readonly PinView[] | undefined, seq: number, index: number): PinView | undefined {
  return pins?.find((p) => p.seq === seq && p.index === index);
}

/** An older version of a pin (the partner changed it since): no corner of its own. */
export function pinWas(pins: readonly PinView[] | undefined, seq: number, index: number): boolean {
  return !!pins?.some((p) => p.was?.some((w) => w.seq === seq && w.index === index));
}
