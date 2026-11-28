// research/244 rule 6: offers wait for a quiet moment. A subject is live while the person wrote in
// the last few minutes, or while a card is open: a new to-do or an update note said then lands in
// the middle of their work. Quiet hours are night: nothing lands until morning. Both callers (the
// to-do sources and the update note) ask this one question, so they wait for the same moment.
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { inQuiet, type Quiet } from "./push.ts";

/** How recently the person wrote for their subject to count as live. */
export const SUBJECT_LIVE_MS = 3 * 60_000;

/** One card is open (not an offer: an offer never needs them). */
export function cardOpen(open: { openIds(): string[]; get?(id: string): { offer?: boolean } | undefined }): boolean {
  return open.openIds().some((id) => !open.get?.(id)?.offer);
}

/** The person wrote in the last few minutes. */
export function wroteJustNow(log: LogStore, now: number): boolean {
  const last = log.read({ stream: "channel", kinds: ["user_msg"], beforeSeq: log.head() + 1, limit: 1 }).at(-1);
  if (!last) return false;
  const at = Date.parse(last.ts);
  return Number.isFinite(at) && now - at < SUBJECT_LIVE_MS;
}

/** A subject is live: the person is here and something is in front of them. */
export function subjectLive(o: { log: LogStore; decisions: { openIds(): string[]; get?(id: string): { offer?: boolean } | undefined }; now: number }): boolean {
  return cardOpen(o.decisions) || wroteJustNow(o.log, o.now);
}

/** Quiet: nothing live and not quiet hours. The moment an offer may be said. */
export function quietGap(o: { log: LogStore; decisions: { openIds(): string[]; get?(id: string): { offer?: boolean } | undefined }; now: number; quiet: Quiet | null }): boolean {
  return !subjectLive(o) && !inQuiet(o.now, o.quiet);
}
