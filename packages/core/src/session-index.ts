// D320: each task's session index, made on the home. The first ask reads the task's stream once
// (in pages, by its (stream, seq) index); from then on every event the Log appends to the stream
// is added as it lands, so no ask reads the stream again. The indexes of the tasks asked about
// most recently are kept (an index is a small row per turn: about 7 KB per 1,000 events).
import type { LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { indexAdd, newIndex, type SessionIndex } from "@ducter/protocol/src/session.ts";

/** How many tasks' indexes the home keeps, and how many events it reads at a time to make one. */
export const INDEXES_KEPT = 64;
const READ_PAGE = 5000;

export interface SessionIndexes {
  /** The task's index, made on its first ask. */
  get(taskId: string): SessionIndex;
  close(): void;
}

export function sessionIndexes(log: Pick<LogStore, "read" | "subscribe">, kept = INDEXES_KEPT): SessionIndexes {
  const held = new Map<string, SessionIndex>();
  const off = log.subscribe((e: LogEvent) => {
    if (!e.stream.startsWith("task:")) return;
    const ix = held.get(e.stream.slice(5));
    if (ix) indexAdd(ix, e);
  });
  return {
    get(taskId) {
      let ix = held.get(taskId);
      if (ix) {
        // The most recently asked last, so the oldest goes first.
        held.delete(taskId);
        held.set(taskId, ix);
        return ix;
      }
      ix = newIndex();
      const stream = `task:${taskId}`;
      for (let from = 0; ; ) {
        const page = log.read({ stream, fromSeq: from, limit: READ_PAGE });
        for (const e of page) indexAdd(ix, e);
        if (page.length < READ_PAGE) break;
        from = page.at(-1)!.seq + 1;
      }
      held.set(taskId, ix);
      if (held.size > kept) held.delete(held.keys().next().value!);
      return ix;
    },
    close: off,
  };
}
