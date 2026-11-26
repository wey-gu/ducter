// D585: a turn the person opened with their own words typed in the task (the conductor's direct
// exchange). The runner marks the task while such a turn runs; report_to_main reads the mark so a
// report made in it carries `direct` (kept out of the living message). Keyed by the core both share.
import type { CoreApi } from "@ducter/protocol/src/internal.ts";

const open = new WeakMap<object, Set<string>>();

const of = (core: CoreApi) => {
  let s = open.get(core);
  if (!s) open.set(core, (s = new Set()));
  return s;
};

export const directTurn = {
  start: (core: CoreApi, taskId: string) => void of(core).add(taskId),
  end: (core: CoreApi, taskId: string) => void of(core).delete(taskId),
  is: (core: CoreApi, taskId: string) => of(core).has(taskId),
};

/**
 * D585: Model-visible: the line under the person's own words as their agent reads them (never in the
 * Log, never shown): who wrote them, and that they read the reply right under them. Their words stay
 * exactly as typed, first. A slash command goes as typed, with nothing after it.
 */
export const DIRECT_NOTE = "(The user wrote this to you in this task's own box; they read your reply right under it.)";

export function withDirectNote(text: string): string {
  if (!text.trim() || text.trimStart().startsWith("/")) return text;
  return `${text}\n\n${DIRECT_NOTE}`;
}
