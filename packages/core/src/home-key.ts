// D293: the home's own long-lived key pair (Ed25519). Made at first start, kept 0600 in the data
// folder beside devices.db (the same trust), never printed. Its fingerprint rides in pairing links
// and welcomes; devices pin it and accept a new way to the home only when that way signs a nonce
// with it (CHALLENGE_PATH). The key moves with the data folder, so a home that moves stays itself.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { join } from "node:path";
import { challengeText, standingText, type DeviceStanding, type HomeKey, type HomeProof, type StandingProof } from "@ducter/protocol/src/reach.ts";
import { fingerprint } from "@ducter/protocol/src/reach-verify.ts";

export const HOME_KEY_FILE = "home-key.pem";

export interface HomeIdentity extends HomeKey {
  /** The answer to a challenge: the key and its signature of the nonce. */
  prove(nonce: string): HomeProof;
  /** D520: the home's signed word on a device's credential, over the device's nonce. */
  attest(standing: DeviceStanding, device: string, nonce: string): StandingProof;
}

function rawPublic(pub: KeyObject): Buffer {
  const jwk = pub.export({ format: "jwk" }) as { x?: string };
  return Buffer.from(jwk.x ?? "", "base64url");
}

/** The home's key from <dataDir>/home-key.pem, made there the first time. */
export function homeIdentity(dataDir: string): HomeIdentity {
  const file = join(dataDir, HOME_KEY_FILE);
  let priv: KeyObject | undefined;
  if (existsSync(file)) {
    try {
      priv = createPrivateKey(readFileSync(file, "utf8"));
      if (priv.asymmetricKeyType !== "ed25519") priv = undefined;
    } catch {
      priv = undefined;
    }
  }
  if (!priv) {
    const pair = generateKeyPairSync("ed25519");
    priv = pair.privateKey;
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, priv.export({ format: "pem", type: "pkcs8" }) as string, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
  }
  const raw = rawPublic(createPublicKey(priv));
  const key = raw.toString("base64url");
  const fp = fingerprint(raw);
  const k = priv;
  return {
    key,
    fp,
    prove: (nonce) => ({ v: 1, key, fp, sig: sign(null, Buffer.from(challengeText(nonce)), k).toString("base64url") }),
    attest: (standing, device, nonce) => ({ v: 1, standing, device, key, fp, sig: sign(null, Buffer.from(standingText(standing, device, nonce)), k).toString("base64url") }),
  };
}

/** A nonce a device may send: base64url-ish, 16–128 characters. */
export const okNonce = (n: string | null): n is string => !!n && /^[A-Za-z0-9_-]{16,128}$/.test(n);
