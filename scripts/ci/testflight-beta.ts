// After an upload: waits for App Store Connect to process the build, adds it to the external
// TestFlight group "Public Beta" and submits it for Beta App Review, with the App Store Connect
// API (the same key testflight.sh signs with). Never fails the release: any problem is a warning.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=…/AuthKey_….p8 \
//   bun scripts/ci/testflight-beta.ts <bundle id> <marketing version> <build number>
//
//   TESTFLIGHT_GROUP          the external group (default "Public Beta")
//   TESTFLIGHT_WAIT_MINUTES   how long to wait for processing (default 20)
// No secret is ever printed: only ids, states and Apple's error titles.
import { readFileSync } from "node:fs";

const API = "https://api.appstoreconnect.apple.com/v1";
const [bundleId, version, build] = process.argv.slice(2);
const group = process.env.TESTFLIGHT_GROUP || "Public Beta";
const waitMin = Number(process.env.TESTFLIGHT_WAIT_MINUTES || 20);
const say = (s: string) => console.log(`testflight-beta: ${s}`);
const warn = (s: string) => console.log(`::warning::TestFlight Public Beta: ${s}`);

const b64url = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

async function token(): Promise<string> {
  const pem = readFileSync(process.env.ASC_KEY_PATH!, "utf8");
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: process.env.ASC_KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" }));
  // WebCrypto's ECDSA signature is r||s already, which is what JWT's ES256 wants.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

async function asc(path: string, init: RequestInit = {}): Promise<{ status: number; json: any }> {
  const r = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {}
  return { status: r.status, json };
}
const why = (j: any) => (j?.errors ?? []).map((e: any) => e.title || e.code).join("; ") || "no detail";

async function main(): Promise<void> {
  if (!bundleId || !version || !build) return warn("usage: testflight-beta.ts <bundle id> <version> <build>");
  if (!process.env.ASC_KEY_ID || !process.env.ASC_ISSUER_ID || !process.env.ASC_KEY_PATH) return warn("no App Store Connect key; skipped");

  const app = await asc(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`);
  const appId = app.json?.data?.[0]?.id;
  if (!appId) return warn(`no app for ${bundleId} (${app.status}: ${why(app.json)})`);

  // Processing: the build appears after a few minutes, then turns VALID.
  let buildId = "";
  const end = Date.now() + waitMin * 60_000;
  for (;;) {
    const q = `/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=1`;
    const r = await asc(q);
    const b = r.json?.data?.[0];
    const state = b?.attributes?.processingState;
    if (b && state === "VALID") {
      buildId = b.id;
      break;
    }
    if (state === "FAILED" || state === "INVALID") return warn(`build ${version} (${build}) is ${state}`);
    if (Date.now() > end) return warn(`build ${version} (${build}) not processed after ${waitMin} min (${state ?? "not listed yet"}); add it to "${group}" by hand`);
    say(`waiting for processing (${state ?? "not listed yet"})`);
    await Bun.sleep(30_000);
  }
  say(`build ${buildId} is VALID`);

  // Internal testers (App Store Connect users) get every build at once, without Beta App Review.
  const all = await asc(`/apps/${appId}/betaGroups?limit=20`);
  for (const ig of (all.json?.data ?? []).filter((x: any) => x.attributes?.isInternalGroup)) {
    const r = await asc(`/betaGroups/${ig.id}/relationships/builds`, { method: "POST", body: JSON.stringify({ data: [{ type: "builds", id: buildId }] }) });
    say(r.status < 300 ? `added to internal group "${ig.attributes?.name}"` : `internal group "${ig.attributes?.name}": ${r.status} ${why(r.json)}`);
  }

  const groups = await asc(`/betaGroups?filter[app]=${appId}&filter[name]=${encodeURIComponent(group)}&limit=5`);
  const g = (groups.json?.data ?? []).find((x: any) => x.attributes?.name === group && !x.attributes?.isInternalGroup);
  if (!g) return warn(`no external group named "${group}" (${groups.status}: ${why(groups.json)})`);
  const add = await asc(`/betaGroups/${g.id}/relationships/builds`, { method: "POST", body: JSON.stringify({ data: [{ type: "builds", id: buildId }] }) });
  if (add.status >= 300) return warn(`adding the build to "${group}" failed (${add.status}: ${why(add.json)})`);
  say(`added to "${group}"`);

  const sub = await asc(`/betaAppReviewSubmissions`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: buildId } } } } }),
  });
  if (sub.status === 409) return say(`already submitted for Beta App Review (${why(sub.json)})`);
  if (sub.status >= 300) return warn(`submitting for Beta App Review failed (${sub.status}: ${why(sub.json)})`);
  say(`submitted for Beta App Review (${sub.json?.data?.attributes?.betaReviewState ?? "submitted"})`);
}

try {
  await main();
} catch (e) {
  warn(e instanceof Error ? e.message : String(e));
}
process.exit(0);
