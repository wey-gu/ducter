// D478 (D477 phase 2b): a task opened with `replaces` (the partner's own record that it opens that
// task's work again) retires the old one quietly: one that didn't work out is set aside
// (superseded), and a finished one leaves On hand the way 移走 / Remove takes it (D454: Past tasks
// keeps it, and it comes back if it goes back to work). One still at work is left as it is, and the
// partner hears so. Never by title similarity: only the id the partner gave.
import type { Attention } from "@ducter/protocol";
import type { OnHandAway } from "./onhand-away.ts";
import type { CoreRegistry } from "./registry.ts";

const AT_WORK: Attention[] = ["queued", "working", "needs_you", "blocked"];

export type Replaced = { retired: true } | { retired: false; why: "unknown" | "same" | "at_work" };

export function replaceTask(o: { tasks: Pick<CoreRegistry, "get" | "setState">; away?: Pick<OnHandAway, "put"> }, newId: string, oldId: string): Replaced {
  if (oldId === newId) return { retired: false, why: "same" };
  const old = o.tasks.get(oldId);
  if (!old) return { retired: false, why: "unknown" };
  if (AT_WORK.includes(old.attention)) return { retired: false, why: "at_work" };
  if (old.attention === "failed") o.tasks.setState(oldId, "superseded", "archived", `opened again as ${newId}`);
  o.away?.put({ taskIds: [oldId] });
  return { retired: true };
}
