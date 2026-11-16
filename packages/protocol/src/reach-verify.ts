// D293: proving a way leads to the home. The device sends a fresh nonce to <way>/.well-known/ducter-home;
// the home answers its public key and its Ed25519 signature of the nonce. The answer counts only
// when the key's fingerprint is the one the device pinned at pairing. node:crypto (Bun): the CLI,
// workers and core; the native apps have their own (Go crypto/ed25519, CryptoKit, Android JCA).
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { CHALLENGE_PATH, challengeText, normalizeBase, type HomeProof } from "./reach.ts";

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");

/** The fingerprint of a raw 32-byte Ed25519 public key: SHA-256, first 16 bytes, base64url (22 chars). */
export const fingerprint = (rawKey: Uint8Array | Buffer) => b64u(createHash("sha256").update(rawKey).digest().subarray(0, 16));

/** True when proof is the pinned home's signature of this nonce. */
export function checkProof(proof: unknown, nonce: string, pinnedFp: string): boolean {
  const p = proof as Partial<HomeProof> | undefined;
  if (!p || typeof p.key !== "string" || typeof p.sig !== "string") return false;
  try {
    const raw = Buffer.from(p.key, "base64url");
    if (raw.length !== 32 || fingerprint(raw) !== pinnedFp) return false;
    const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: p.key }, format: "jwk" });
    return verify(null, Buffer.from(challengeText(nonce)), pub, Buffer.from(p.sig, "base64url"));
  } catch {
    return false;
  }
}

/** A probe for race/createKeeper: asks base to prove it is the home with this fingerprint. */
export function proveHome(pinnedFp: string, o: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const f = o.fetch ?? fetch;
  return async (base: string): Promise<boolean> => {
    const nonce = b64u(randomBytes(18));
    try {
      const r = await f(`${normalizeBase(base)}${CHALLENGE_PATH}?n=${nonce}`, { signal: AbortSignal.timeout(o.timeoutMs ?? 4000) });
      if (!r.ok) return false;
      return checkProof(await r.json(), nonce, pinnedFp);
    } catch {
      return false;
    }
  };
}
