// D228: how a paired device finds its home again when the home's address changes (a free
// Cloudflare tunnel gets a new address each time the computer restarts).
//
// The home seals its current address with a key only it and its paired devices hold, and leaves
// the sealed note at the address relay (apps/site/api/addr) under a random id. A device that can't
// reach the old address asks the relay for the note, opens it, checks it is newer than what it
// knows, and moves. The relay sees a random id, a ciphertext and when it changes: never the
// address, never who the home is. Nothing it could hand back opens under the key, so the worst it
// can do is say nothing (the device then pairs again, as before D228).
//
// Pure WebCrypto: the same code runs in the home (Bun), the phone's page and its service worker.

/** What a paired device keeps to follow its home: the relay, the note's id, the key that opens it. */
export interface Follow {
  relay: string; // https://ducter.ai/api/addr (DUCTER_ADDR_RELAY)
  id: string; // 16 random bytes, base64url
  key: string; // 32 random bytes, base64url (AES-256-GCM)
}

/** The sealed note's content: where the home is now, and since when (ms). */
export interface AddressNote {
  url: string;
  at: number;
}

const VERSION = "ducter-addr-v1";

const b64u = (b: Uint8Array): string => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string): Uint8Array => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
};

export const isFollowId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s);
export const isFollow = (f: unknown): f is Follow => {
  const x = f as Follow;
  return !!x && typeof x.relay === "string" && /^https?:\/\//.test(x.relay) && isFollowId(x.id) && typeof x.key === "string" && /^[A-Za-z0-9_-]{43}$/.test(x.key);
};

/** A fresh id, key and write secret (the write secret stays on the home). */
export function newFollowSecrets(): { id: string; key: string; write: string } {
  const r = (n: number) => b64u(crypto.getRandomValues(new Uint8Array(n)));
  return { id: r(16), key: r(32), write: r(32) };
}

async function aes(key: string, use: "encrypt" | "decrypt") {
  return crypto.subtle.importKey("raw", unb64u(key) as Uint8Array<ArrayBuffer>, "AES-GCM", false, [use]);
}

const aad = (id: string) => new TextEncoder().encode(`${VERSION}:${id}`);

/** nonce ‖ ciphertext ‖ tag, base64url. The id is bound in (a note can't be moved to another id). */
export async function sealAddress(key: string, id: string, note: AddressNote): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(id) }, await aes(key, "encrypt"), new TextEncoder().encode(JSON.stringify(note))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64u(out);
}

/** The note, or undefined if it doesn't open under this key and id or isn't a home address. */
export async function openAddress(key: string, id: string, sealed: string): Promise<AddressNote | undefined> {
  try {
    const raw = unb64u(sealed);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: aad(id) }, await aes(key, "decrypt"), raw.slice(12));
    const n = JSON.parse(new TextDecoder().decode(pt)) as AddressNote;
    if (typeof n.url !== "string" || typeof n.at !== "number") return;
    const u = new URL(n.url);
    if (u.protocol !== "https:" && u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return;
    return { url: n.url.replace(/\/+$/, ""), at: n.at };
  } catch {
    return;
  }
}

/** Asks the relay where the home is now. undefined: no note, the relay can't be reached, or it doesn't open. */
export async function lookupAddress(f: Follow, fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<AddressNote | undefined> {
  try {
    const r = await fetcher(`${f.relay.replace(/\/+$/, "")}/get?id=${encodeURIComponent(f.id)}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return;
    const b = (await r.json()) as { d?: unknown };
    return typeof b.d === "string" ? await openAddress(f.key, f.id, b.d) : undefined;
  } catch {
    return;
  }
}

/** Where a device should go: the note's address, when it is newer and somewhere else. */
export function moveTarget(current: string, note: AddressNote | undefined, knownAt = 0): string | undefined {
  if (!note || note.at <= knownAt) return;
  const norm = (s: string) => s.replace(/\/+$/, "").toLowerCase();
  return norm(note.url) === norm(current) ? undefined : note.url;
}

/**
 * What the page at the new address needs to carry on as the same device, in the URL fragment
 * (never sent to any server): `#move=<base64url JSON>`. The page stores it and drops the fragment.
 */
export interface MovePayload {
  token: string;
  deviceId: string;
  name: string;
  personaName?: string;
  pairedAt?: string;
  follow?: Follow;
  at?: number;
}

export const encodeMove = (m: MovePayload): string => b64u(new TextEncoder().encode(JSON.stringify(m)));
export function decodeMove(hash: string): MovePayload | undefined {
  const m = /(?:^#|&)move=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(m[1]!))) as MovePayload;
    if (typeof p.token !== "string" || typeof p.deviceId !== "string" || typeof p.name !== "string") return;
    if (p.follow && !isFollow(p.follow)) delete p.follow;
    return p;
  } catch {
    return;
  }
}
