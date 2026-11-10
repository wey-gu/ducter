// What a task just did in Ducter's browser (D190), for whoever is watching its tab: the browser
// tools note each step here and the live view (live.ts) passes it on as a calm line ("正在点
// 「登录」"), with where it clicked. Presence only: nothing is kept, nothing is logged, and a
// step's words are the page's own button text (keys hidden, D152), never what was typed.
import type { LiveDoing } from "@ducter/protocol";
import { redact } from "@ducter/protocol/src/redact.ts";

export interface BrowserNotes {
  /** A task did something in its tab (tools.ts). */
  note(taskId: string, doing: LiveDoing): void;
  /** Is anyone watching this task's tab now (so a tool needn't measure where it clicked)? */
  watched(taskId: string): boolean;
  /** The live view listens (one listener per Live). */
  listen(fn: (taskId: string, doing: LiveDoing) => void, watched: (taskId: string) => boolean): () => void;
}

export function createBrowserNotes(): BrowserNotes {
  let fn: ((taskId: string, doing: LiveDoing) => void) | undefined;
  let isWatched: ((taskId: string) => boolean) | undefined;
  return {
    note(taskId, doing) {
      if (!fn) return;
      const d: LiveDoing = { ...doing };
      if (d.label) d.label = redact(d.label).slice(0, 40);
      try {
        fn(taskId, d);
      } catch (e) {
        console.warn("[browser] a live view's note failed:", (e as Error).message);
      }
    },
    watched: (taskId) => !!isWatched?.(taskId),
    listen(f, w) {
      fn = f;
      isWatched = w;
      return () => {
        if (fn === f) (fn = undefined), (isWatched = undefined);
      };
    },
  };
}
