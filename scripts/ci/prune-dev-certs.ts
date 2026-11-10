// Revokes the Apple Development certificates earlier CI runs left behind.
//
// Automatic signing on a fresh CI runner has no development identity in its keychain, so each
// archive makes a new "Created via API" Development certificate; the runner is thrown away and the
// certificate stays. The account holds only a few, and once full every archive fails with "Choose
// a certificate to revoke" (v0.0.11). Before archiving, this revokes the API-made Development
// certificates: they belong to past runs and sign nothing that ships (TestFlight builds are
// re-signed with the Distribution certificate at export). Distribution and Developer ID
// certificates, and any a person made, are never touched. Never fails the release.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=…/AuthKey_….p8 bun scripts/ci/prune-dev-certs.ts
import { readFileSync } from "node:fs";

const API = "https://api.appstoreconnect.apple.com";
const b64url = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

async function token(): Promise<string> {
  const pem = readFileSync(process.env.ASC_KEY_PATH!, "utf8");
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: process.env.ASC_KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

type Cert = { id: string; attributes: { certificateType?: string; displayName?: string; name?: string } };

/** The certificates to revoke: Development ones made through the API (CI), nothing else. */
export function staleCiCerts(rows: Cert[]): string[] {
  return rows
    .filter((c) => c.attributes.certificateType === "DEVELOPMENT" && (c.attributes.displayName ?? c.attributes.name) === "Created via API")
    .map((c) => c.id);
}

if (import.meta.main) {
  try {
    const auth = { authorization: `Bearer ${await token()}` };
    const r = await fetch(`${API}/v1/certificates?limit=200&filter[certificateType]=DEVELOPMENT`, { headers: auth });
    const rows: Cert[] = r.ok ? (((await r.json()) as { data?: Cert[] }).data ?? []) : [];
    const ids = staleCiCerts(rows);
    let gone = 0;
    for (const id of ids) {
      const d = await fetch(`${API}/v1/certificates/${id}`, { method: "DELETE", headers: auth });
      if (d.status === 204) gone++;
      else console.warn(`::warning::couldn't revoke development certificate ${id} (HTTP ${d.status})`);
    }
    console.log(`revoked ${gone} development certificate(s) earlier CI runs left`);
  } catch (e) {
    console.warn(`::warning::development certificate cleanup skipped: ${(e as Error).message}`);
  }
}
