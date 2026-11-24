// D539: a key sealed for one computer on its way there (design/system.md "Keys copied between
// computers"). The computer that will keep it makes a fresh X25519 key pair for this one copy and
// keeps the private half in memory only (two minutes at most); the computer that has the key seals
// it to that public half (an ephemeral X25519 of its own, HKDF-SHA256, AES-256-GCM, the variable's
// name and the copy's id bound in as associated data). Whatever carries the sealed box between
// them (the home, over the worker links) sees only ciphertext. Node only (node:crypto); never
// imported by the web client.
import { createCipheriv, createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, type KeyObject } from "node:crypto";

/** A sealed key as it travels: every field base64url. */
export interface SealedKey {
  v: 1;
  /** The sealer's ephemeral X25519 public key. */
  epk: string;
  iv: string;
  ct: string;
  tag: string;
}

const INFO = Buffer.from("ducter key copy v1");

const rawPub = (k: KeyObject) => Buffer.from((k.export({ format: "jwk" }) as { x?: string }).x ?? "", "base64url");
const pubFrom = (b64: string) => createPublicKey({ key: { kty: "OKP", crv: "X25519", x: b64 }, format: "jwk" });

function keyFor(shared: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", shared, salt, INFO, 32));
}

/** A one-copy key pair: the public half (base64url) goes to the sealer; the private half stays here. */
export function offerPair(): { pub: string; priv: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return { pub: rawPub(publicKey).toString("base64url"), priv: privateKey };
}

/** Seals value for the holder of `pub`; aad binds what it is for (the variable and the copy's id). */
export function sealKey(pub: string, value: string, aad: string): SealedKey {
  const them = pubFrom(pub);
  const mine = generateKeyPairSync("x25519");
  const epk = rawPub(mine.publicKey);
  const shared = diffieHellman({ privateKey: mine.privateKey, publicKey: them });
  const key = keyFor(shared, Buffer.concat([epk, Buffer.from(pub, "base64url")]));
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return { v: 1, epk: epk.toString("base64url"), iv: iv.toString("base64url"), ct: ct.toString("base64url"), tag: c.getAuthTag().toString("base64url") };
}

/** Opens a sealed key with the private half of the offer; throws when it was sealed for another or altered. */
export function openKey(priv: KeyObject, s: SealedKey, aad: string): string {
  if (s?.v !== 1) throw new Error("not a sealed key");
  const epk = Buffer.from(s.epk, "base64url");
  const pub = rawPub(createPublicKey(priv));
  const shared = diffieHellman({ privateKey: priv, publicKey: pubFrom(s.epk) });
  const key = keyFor(shared, Buffer.concat([epk, pub]));
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(s.tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(s.ct, "base64url")), d.final()]).toString("utf8");
}

