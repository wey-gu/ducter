// D228: the page follows its home when the home's address changes (在哪儿都能用's free tunnel gets
// a new address when the home's computer restarts). The page keeps the home's follow (relay, id,
// key) from /api/me; when the home can't be reached it asks the relay, checks that a Ducter
// answers at the new address, and goes there carrying this device's pairing in the fragment
// (`#move=…`, never sent to a server), where the page takes it and drops it from the address bar.
// The service worker does the same when the old address can't even serve the page (sw.ts).
import { decodeMove, encodeMove, isFollow, lookupAddress, moveTarget, type Follow, type MovePayload } from "@ducter/protocol/src/follow.ts";
import type { DeviceRecord } from "./conn.ts";
import { kvSet } from "./idb.ts";

const KEY = "ducter.follow.v1";

export interface Kept {
  follow: Follow;
  /** When the address this page is at began (ms), from the note it followed; 0 when unknown. */
  at: number;
}

export function loadFollow(): Kept | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Kept | null;
    return v && isFollow(v.follow) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps the home's follow (or forgets it: the home's address no longer moves). */
export function saveFollow(follow: Follow | undefined, rec: DeviceRecord | undefined, at?: number) {
  try {
    if (!follow) {
      localStorage.removeItem(KEY);
      void kvSet("move", undefined);
      return;
    }
    const was = loadFollow();
    const kept: Kept = { follow, at: at ?? (was?.follow.id === follow.id ? was.at : 0) };
    localStorage.setItem(KEY, JSON.stringify(kept));
    // The service worker can't read localStorage: what it needs to move this device, in IndexedDB.
    if (rec) void kvSet("move", { ...rec, follow, at: kept.at } satisfies MovePayload);
  } catch {}
}

/**
 * At the new address: the fragment's pairing becomes this page's. Returns the record to use, and
 * the fragment is gone from the address bar and from history at once.
 */
export function takeMove(store: { set(d: DeviceRecord): void }, loc: Location = location, hist: History = history): DeviceRecord | undefined {
  const m = decodeMove(loc.hash);
  if (!m) return;
  const rec: DeviceRecord = { token: m.token, deviceId: m.deviceId, name: m.name, ...(m.personaName ? { personaName: m.personaName } : {}), pairedAt: m.pairedAt ?? new Date().toISOString() };
  store.set(rec);
  void kvSet("token", rec.token);
  if (m.follow) saveFollow(m.follow, rec, m.at ?? 0);
  hist.replaceState(null, "", loc.pathname);
  return rec;
}

/** A Ducter answers at this address (its tunnel self-check is open to any page). */
export async function answers(base: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await fetcher(`${base.replace(/\/+$/, "")}/.well-known/ducter-anywhere`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    return r.ok && (await r.text()).trim().length > 0;
  } catch {
    return false;
  }
}

/** Where the home is now, if it moved and answers there; else undefined. */
export async function findHome(current: URL, kept: Kept | undefined, fetcher: typeof fetch = fetch): Promise<{ url: string; at: number } | undefined> {
  if (!kept) return;
  const note = await lookupAddress(kept.follow, fetcher);
  const to = moveTarget(current.origin, note, kept.at);
  if (!to || !note || !(await answers(to, fetcher))) return;
  return { url: to, at: note.at };
}

/** The link that carries this device to its home's new address. */
export function moveLink(to: string, rec: DeviceRecord, follow: Follow, at: number): string {
  return `${to.replace(/\/+$/, "")}/app#move=${encodeMove({ ...rec, follow, at })}`;
}
