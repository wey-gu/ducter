// D242: media keys expire (about a day). The home signs every ref afresh as it sends it, so a
// page that reconnects has good keys; one left open past them (a phone's tab, the iPhone app in
// the background for a day, a first screen painted from the glance cache) asks the home for new
// ones over its own connection, and every picture and file is fetched with the newest key it has.
// Nothing here ever puts a key anywhere but a fetch or an <img> of this page.
import { keyStale, MEDIA_KEY, mediaPath } from "@ducter/protocol";
import { A } from "./app.ts";

const fresh = new Map<string, string>();
const asked = new Map<string, number>();
const waiters: (() => void)[] = [];
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** The newest key this page has for a ref (or a rendition). */
export const keyOf = (r: { id: string; k: string }) => fresh.get(r.id) ?? r.k;

/** The URL to fetch a ref (or a rendition) by, with its newest key; asks for a new one when it is out of time. */
export function mediaUrl(r: { id: string; k: string }): string {
  const k = keyOf(r);
  if (keyStale(k, Date.now())) void refreshKeys([r.id]);
  return new URL(mediaPath({ id: r.id, k }), A.base).href;
}

/** Asks the home for fresh keys (batched, at most once a minute per id); resolves when they came, or after 6 s. */
export function refreshKeys(ids: string[]): Promise<void> {
  const now = Date.now();
  const want = ids.filter((id) => now - (asked.get(id) ?? 0) > 60_000);
  if (!want.length) return Promise.resolve();
  for (const id of want) asked.set(id, now), pending.add(id);
  timer ??= setTimeout(() => {
    timer = undefined;
    const all = [...pending];
    pending = new Set();
    for (let i = 0; i < all.length; i += MEDIA_KEY.perAsk) A.send({ t: "media_keys", ids: all.slice(i, i + MEDIA_KEY.perAsk) });
  }, 30);
  return new Promise((res) => {
    waiters.push(res);
    setTimeout(res, 6000);
  });
}

/** The home's answer: the new keys, and every picture drawn again with them. */
export function gotKeys(keys: Record<string, string>) {
  for (const [id, k] of Object.entries(keys)) fresh.set(id, k);
  for (const w of waiters.splice(0)) w();
  A.changed();
}

/** fetch() for a ref: when the home says no (a key out of time), once more with a fresh key. */
export async function mediaFetch(r: { id: string; k: string }, init?: RequestInit): Promise<Response> {
  const res = await fetch(mediaUrl(r), init);
  if (res.status !== 404 && res.status !== 403) return res;
  await refreshKeys([r.id]);
  return fetch(mediaUrl(r), init);
}
