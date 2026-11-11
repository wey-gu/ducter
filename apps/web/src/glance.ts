// The last screen, kept on this device (D209): what the conversation and On hand last showed, so
// opening the app paints them at once from local state instead of an empty page while the socket
// connects. The page then says hello with the cursor it holds and the home sends only what is
// newer (the same replay a reconnect uses), so nothing is fetched twice and nothing is lost.
//
// Kept in localStorage, not IndexedDB: it reads synchronously, so the first frame the page paints
// already holds the conversation. It holds the channel's events (the newest GLANCE_EVENTS, the
// same window a fresh hello replays and more), On hand, the empty conversation's words and who
// this device is. A revoked device, or a home whose Log started over, forgets it.
import type { FirstScreen, LogEvent, OnHand } from "@ducter/protocol";
import type { Me } from "./conn.ts";

export const GLANCE_KEY = "ducter.glance.v1";
/** Newest channel events kept (a fresh hello replays 200). */
export const GLANCE_EVENTS = 400;
/** Past this the oldest half goes (localStorage holds about 5 MB per origin). */
const MAX_BYTES = 1_500_000;

export interface Glance {
  v: 1;
  /** The device it was kept for ("local" for this machine's own page): another pairing starts clean. */
  device: string;
  persona: string;
  personaName: string;
  headSeq: number;
  events: LogEvent[];
  onHand?: OnHand;
  first?: FirstScreen;
  me?: Me;
  savedAt: number;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const store = (): Storage | undefined => {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
};

export function loadGlance(device: string, s: Storage | undefined = store()): Glance | undefined {
  try {
    const raw = s?.getItem(GLANCE_KEY);
    if (!raw) return;
    const g = JSON.parse(raw) as Glance;
    if (g?.v !== 1 || g.device !== device || !Array.isArray(g.events)) return;
    return g;
  } catch {
    return;
  }
}

export function forgetGlance(s: Storage | undefined = store()) {
  try {
    s?.removeItem(GLANCE_KEY);
  } catch {}
}

/** The channel events worth keeping: in order, revisions a later one supersedes dropped, the newest
 *  GLANCE_EVENTS. */
export function keepEvents(events: Iterable<LogEvent>, limit = GLANCE_EVENTS): LogEvent[] {
  const bySeq = new Map<number, LogEvent>();
  for (const e of events) if (e.stream === "channel") bySeq.set(e.seq, e);
  const all = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  const replaced = new Set(all.map((e) => e.supersedes).filter((s) => s != null));
  const kept = all.filter((e) => !replaced.has(e.seq));
  return kept.slice(-limit);
}

export function saveGlance(g: Glance, s: Storage | undefined = store()): boolean {
  if (!s) return false;
  let events = g.events;
  for (let i = 0; i < 4; i++) {
    try {
      const raw = JSON.stringify({ ...g, events });
      if (raw.length > MAX_BYTES && events.length > 20) {
        events = events.slice(Math.floor(events.length / 2));
        continue;
      }
      s.setItem(GLANCE_KEY, raw);
      return true;
    } catch {
      // Over the quota: keep the newer half.
      if (events.length <= 20) break;
      events = events.slice(Math.floor(events.length / 2));
    }
  }
  forgetGlance(s);
  return false;
}
