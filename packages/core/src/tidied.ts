// D514: what Ducter tidied away on each computer so far, counted from the Log's copy_tidied
// events (the runner writes one per removal): the computer's card says it in one quiet line,
// 整理过 12 个用完的工作副本，腾出 3.4 GB. A copy whose folder was already gone counts, with 0 bytes.
import type { Bodies, KeepLife, LogEvent, TidyHold } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

/** D514: what the home knows holds a task's copy, in the order it is said: a wait of its own, a
 *  Keep on or paused (D511), an open PR it owns (D483), the person's star or keep (D285). */
export function holdOf(
  taskId: string,
  d: { waiting(taskId: string): boolean; keepLife(taskId: string): KeepLife | undefined; openPrs(taskId: string): string[]; mark(taskId: string): { starred?: boolean; keepCopy?: boolean } | undefined },
): TidyHold | undefined {
  if (d.waiting(taskId)) return "waiting";
  const life = d.keepLife(taskId);
  if (life === "on" || life === "paused") return "looking_after";
  if (d.openPrs(taskId).length) return "pr_open";
  const m = d.mark(taskId);
  if (m?.starred || m?.keepCopy) return "pinned";
  return undefined;
}

export interface Tidied {
  of(device: string): { count: number; bytes: number } | undefined;
  stop(): void;
}

export function createTidied(log: LogStore, onChange?: () => void): Tidied {
  const by = new Map<string, { count: number; bytes: number }>();
  const add = (e: LogEvent) => {
    const b = e.body as Bodies["copy_tidied"];
    const s = by.get(b.device) ?? { count: 0, bytes: 0 };
    by.set(b.device, { count: s.count + 1, bytes: s.bytes + (Number(b.bytes) || 0) });
  };
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["copy_tidied"] })) add(e);
  const stop = log.subscribe((e) => {
    if (e.kind !== "copy_tidied") return;
    add(e);
    onChange?.();
  });
  return { of: (device) => by.get(device), stop };
}
