// The last screen, kept on this device (D209): what the conversation and On hand last showed, so
// opening the app paints them at once from local state instead of an empty page while the socket
// connects. The page then says hello with the cursor it holds and the home sends only what is
// newer (the same replay a reconnect uses), so nothing is fetched twice and nothing is lost.
//
// Kept in localStorage, not IndexedDB: it reads synchronously, so the first frame the page paints
// already holds the conversation. It holds the channel's events (the newest GLANCE_EVENTS, the
// same window a fresh hello replays and more), On hand, the empty conversation's words and who
// this device is. A revoked device, or a home whose Log started over, forgets it. D543: one per
// partner, so a switch with the link down shows that partner's own last screen.
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

/** D543: each partner's last screen is its own (the default partner's keeps the key it always had),
 *  so switching to one while the link is down, or opening on it cold, shows its conversation. */
export const glanceKey = (persona?: string) => (!persona || persona === "default" ? GLANCE_KEY : `${GLANCE_KEY}:${persona}`);
/** A partner other than the default keeps a smaller screen (localStorage is shared). */
const MAX_BYTES_OTHER = 600_000;

export function loadGlance(device: string, s: Storage | undefined = store(), persona?: string): Glance | undefined {
  try {
    const raw = s?.getItem(glanceKey(persona));
    if (!raw) return;
    const g = JSON.parse(raw) as Glance;
    if (g?.v !== 1 || g.device !== device || !Array.isArray(g.events)) return;
    return g;
  } catch {
    return;
  }
}

/** Forgets the last screens (every partner's, or one). */
export function forgetGlance(s: (Storage & { length?: number; key?(i: number): string | null }) | undefined = store(), persona?: string) {
  try {
    if (persona !== undefined) return void s?.removeItem(glanceKey(persona));
    s?.removeItem(GLANCE_KEY);
    const others: string[] = [];
    for (let i = 0; s?.key && i < (s.length ?? 0); i++) {
      const k = s.key(i);
      if (k?.startsWith(`${GLANCE_KEY}:`)) others.push(k);
    }
    for (const k of others) s?.removeItem(k);
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
  const key = glanceKey(g.persona);
  const max = key === GLANCE_KEY ? MAX_BYTES : MAX_BYTES_OTHER;
  for (let i = 0; i < 4; i++) {
    try {
      const raw = JSON.stringify({ ...g, events });
      if (raw.length > max && events.length > 20) {
        events = events.slice(Math.floor(events.length / 2));
        continue;
      }
      s.setItem(key, raw);
      return true;
    } catch {
      // Over the quota: keep the newer half.
      if (events.length <= 20) break;
      events = events.slice(Math.floor(events.length / 2));
    }
  }
  forgetGlance(s, g.persona);
  return false;
}
