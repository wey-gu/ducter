// D523: reach-verify.ts for a page (the web client, and the iPhone, iPad and Android apps that show
// it): the same checks over WebCrypto instead of node:crypto, so a page can tell the home's signed
// word on its device from anything a proxy, a portal or a stale cache says. The texts signed and
// the fingerprint are reach.ts's; the answers match reach-verify.ts's for every input.
import { STANDING_PATH, standingText, type DeviceStanding, type StandingProof } from "./reach.ts";

const b64uToBytes = (s: string): Uint8Array | undefined => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return;
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  try {
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return;
  }
};
/** WebCrypto takes an ArrayBuffer in every lib (a typed array's buffer may be shared). */
const buf = (u: Uint8Array): ArrayBuffer => u.slice().buffer as ArrayBuffer;
export const bytesToB64u =(b: Uint8Array): string => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** The fingerprint of a raw 32-byte Ed25519 public key (reach-verify.ts `fingerprint`). */
export async function fingerprintWeb(raw: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf(raw)));
  return bytesToB64u(d.subarray(0, 16));
}

/** A fresh nonce the home accepts (okNonce: 16 to 128 base64url characters). */
export const freshNonce = (): string => bytesToB64u(crypto.getRandomValues(new Uint8Array(18)));

/** D520's checkStanding over WebCrypto: the standing when the pinned home signed it over this nonce, else undefined. */
export async function checkStandingWeb(proof: unknown, nonce: string, pinnedFp: string): Promise<DeviceStanding | undefined> {
  const p = proof as Partial<StandingProof> | undefined;
  if (!p || typeof p.key !== "string" || typeof p.sig !== "string" || typeof p.device !== "string") return;
  if (p.standing !== "live" && p.standing !== "revoked" && p.standing !== "unknown") return;
  if (!pinnedFp) return;
  const raw = b64uToBytes(p.key);
  const sig = b64uToBytes(p.sig);
  if (!raw || raw.length !== 32 || !sig || sig.length !== 64) return;
  try {
    if ((await fingerprintWeb(raw)) !== pinnedFp) return;
    const pub = await crypto.subtle.importKey("raw", buf(raw), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, buf(sig), new TextEncoder().encode(standingText(p.standing, p.device, nonce)));
    return ok ? p.standing : undefined;
  } catch {
    return; // a browser without Ed25519 in WebCrypto can't tell: never a revoke
  }
}

/**
 * What asking a home for a device's standing came to:
 * - live, revoked, unknown: the pinned home's signed word;
 * - forged: an answer shaped as a proof that doesn't verify (another key, another nonce, a bad
 *   signature, or nothing pinned to check it against): never acted on;
 * - absent: the home answered but has no such endpoint (a home from before D520);
 * - unreachable: nothing came back from the home (a network error, a timeout, a proxy's 5xx).
 */
export type StandingAnswer = DeviceStanding | "forged" | "absent" | "unreachable";

/** Asks base (the page's own origin) for this credential's standing and checks the answer against pinnedFp. */
export async function askStandingWeb(base: string | URL, token: string, pinnedFp: string | undefined, o: { fetch?: typeof fetch; timeoutMs?: number; nonce?: string } = {}): Promise<StandingAnswer> {
  const f = o.fetch ?? fetch;
  const nonce = o.nonce ?? freshNonce();
  let r: Response;
  try {
    const u = new URL(STANDING_PATH.slice(1), base);
    u.searchParams.set("n", nonce);
    r = await f(u, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(o.timeoutMs ?? 6000) });
  } catch {
    return "unreachable";
  }
  if (r.status >= 500 || r.status === 408 || r.status === 429) return "unreachable";
  const body = await r.json().catch(() => undefined);
  const shaped = !!body && typeof body === "object" && "sig" in body && "standing" in body;
  // An old home: its gate's 401, its 404 or its page. An unsigned {error:"revoked"} is this too.
  if (!shaped) return "absent";
  const s = await checkStandingWeb(body, nonce, pinnedFp ?? "");
  return s ?? "forged";
}
