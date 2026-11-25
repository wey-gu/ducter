// D578: a sheet, the live view or a viewer opened over a place is a step in the browser's history,
// so the browser's Back (or a phone's) closes it and stays in Ducter, even when the conversation was
// the first page of the tab. The entry has the same address as the place under it; closing the layer
// any other way (Esc, ×, a choice) takes the entry back off, so Back never lands on a dead step.
// No imports: app.ts reads `isLayerEntry` when it pushes a route.

export const LAYER = "ducterLayer";

/** The history entry a layer pushed (its state carries the mark). */
export const isLayerEntry = (state: unknown): boolean => !!state && typeof state === "object" && !!(state as Record<string, unknown>)[LAYER];

type H = { readonly state: unknown; pushState(data: unknown, unused: string, url?: string | null): void; back(): void };

/** What a popstate was: `ours` (the entry this took off itself: nothing to do), `close` (Back with a
 *  layer up: its entry is already gone, close the layer on top), `stale` (landed on a layer's entry
 *  with nothing up, by Forward: stepped back over it), or undefined (a place's own entry). */
export type Pop = "ours" | "close" | "stale" | undefined;

export function layerHistory(h: H, href: () => string, up: () => boolean) {
  // Whether the top entry is the one this pushed for the layer up now.
  let pushed = false;
  // Pops this caused with back(), still to come.
  let skip = 0;
  return {
    /** After every change: a layer came (push its entry) or went (take it off again). */
    sync() {
      const on = up();
      // A place pushed (or replaced) over the entry: it is no longer ours to take off.
      if (pushed && !isLayerEntry(h.state)) pushed = false;
      if (on && !pushed) {
        h.pushState({ [LAYER]: 1 }, "", href());
        pushed = true;
      } else if (!on && pushed) {
        pushed = false;
        skip++;
        h.back();
      }
    },
    pop(state: unknown): Pop {
      if (skip > 0) {
        skip--;
        return "ours";
      }
      if (pushed && up()) {
        pushed = false;
        return "close";
      }
      if (isLayerEntry(state) && !up()) {
        skip++;
        h.back();
        return "stale";
      }
      return undefined;
    },
  };
}
