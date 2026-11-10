// MCP OAuth 2.1 sign-in for remote MCP servers, by device code (D193; RFC 8628, RFC 9728,
// RFC 8414, RFC 7591, RFC 8707). Generic: any server that answers 401 and publishes protected-
// resource metadata naming an authorization server with a device_authorization_endpoint. The
// owner opens the link on their phone, checks the short code and signs in there; Ducter never
// sees a password. Tokens go to connection-tokens.json (0600, D102) through the caller; nothing
// here writes a file or logs a token.
//
// Tuwa (research/53) is the first such server. Its own bridge starts device authorization with a
// `client_name` and no registered client (the endpoint returns the client_id); the standard path
// registers a public client first (RFC 7591). Ducter tries the standard path and falls back to the
// vendor's, so a server that supports either works.

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface OAuthServer {
  resource: string; // the MCP URL the token is for (RFC 8707 `resource`)
  issuer: string;
  tokenEndpoint: string;
  deviceEndpoint: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  scope?: string; // the scopes the resource lists, space separated
  name?: string; // the resource's own name ("Tuwa phone calls")
}

/** What connection-tokens.json holds for a connection signed in this way (never sent to a client). */
export interface OAuthToken {
  kind: "oauth";
  access: string;
  refresh?: string;
  expiresAt?: number; // ms since epoch
  clientId: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  resource: string;
  scope?: string;
  /** The token requests carry `resource` (the standard path); false: the vendor form, without it. */
  withResource?: boolean;
}

export interface DeviceStart {
  clientId: string;
  deviceCode: string;
  userCode: string;
  verifyUrl: string;
  verifyUrlComplete?: string;
  interval: number; // seconds
  expiresAt: number; // ms
  /** Whether the token requests carry `resource` (the standard path) or not (the vendor fallback). */
  withResource: boolean;
}

export type PollResult = { state: "pending"; interval: number } | { state: "done"; token: OAuthToken } | { state: "denied" | "expired" | "failed"; error?: string };

import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";

// D193: Tuwa sits behind Cloudflare, which refuses some default user agents (error 1010).
const UA = { "user-agent": `Ducter/${DUCTER_VERSION}` };
const FORM = { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...UA };
const TIMEOUT = 15_000;

async function getJson(f: Fetcher, url: string): Promise<Record<string, unknown> | undefined> {
  try {
    const r = await f(url, { headers: { accept: "application/json", ...UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return;
    const j = (await r.json()) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : undefined;
  } catch {
    return;
  }
}

async function postForm(f: Fetcher, url: string, values: Record<string, string | undefined>): Promise<{ status: number; data: Record<string, unknown> }> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined) body.set(k, v);
  try {
    const r = await f(url, { method: "POST", headers: FORM, body: body.toString(), signal: AbortSignal.timeout(TIMEOUT) });
    const data = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: { error: "network", error_description: (e as Error).message } };
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
/** An endpoint must be https (or http on this machine, for tests and a local server). */
const safe = (u: string | undefined) => {
  if (!u) return;
  try {
    const x = new URL(u);
    if (x.protocol === "https:" || (x.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname))) return x.toString();
  } catch {
    /* not a URL */
  }
};

/**
 * Discovery (RFC 9728, then RFC 8414): the resource's metadata at the path-specific well-known URL,
 * then at the origin's; its first authorization server's metadata. Undefined when the server
 * doesn't publish a device endpoint (it signs in some other way, or not at all).
 */
export async function discover(mcpUrl: string, f: Fetcher = fetch, resourceMetadata?: string): Promise<OAuthServer | undefined> {
  const u = new URL(mcpUrl);
  const path = u.pathname.replace(/\/+$/, "");
  const prmUrls = [resourceMetadata, `${u.origin}/.well-known/oauth-protected-resource${path}`, `${u.origin}/.well-known/oauth-protected-resource`].filter((x): x is string => !!safe(x));
  let prm: Record<string, unknown> | undefined;
  for (const x of [...new Set(prmUrls)]) if ((prm = await getJson(f, x))) break;
  const issuer = str((prm?.authorization_servers as unknown[] | undefined)?.[0]) ?? (prm ? undefined : u.origin);
  if (!issuer || !safe(issuer)) return;
  const iu = new URL(issuer);
  const ipath = iu.pathname.replace(/\/+$/, "");
  const asUrls = ipath
    ? [`${iu.origin}/.well-known/oauth-authorization-server${ipath}`, `${iu.origin}/.well-known/openid-configuration${ipath}`, `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`]
    : [`${iu.origin}/.well-known/oauth-authorization-server`, `${iu.origin}/.well-known/openid-configuration`];
  let as: Record<string, unknown> | undefined;
  for (const x of asUrls) if ((as = await getJson(f, x))) break;
  const deviceEndpoint = safe(str(as?.device_authorization_endpoint));
  const tokenEndpoint = safe(str(as?.token_endpoint));
  if (!as || !deviceEndpoint || !tokenEndpoint) return;
  const scopes = (prm?.scopes_supported ?? as.scopes_supported) as unknown;
  return {
    resource: str(prm?.resource) ?? mcpUrl,
    issuer,
    tokenEndpoint,
    deviceEndpoint,
    ...(safe(str(as.registration_endpoint)) ? { registrationEndpoint: safe(str(as.registration_endpoint)) } : {}),
    ...(safe(str(as.revocation_endpoint)) ? { revocationEndpoint: safe(str(as.revocation_endpoint)) } : {}),
    ...(Array.isArray(scopes) && scopes.length ? { scope: scopes.filter((s) => typeof s === "string").join(" ") } : {}),
    ...(str(prm?.resource_name) ? { name: str(prm?.resource_name) } : {}),
  };
}

/** RFC 7591: a public client for the device grant. Undefined when the server has no registration or refuses it. */
async function register(f: Fetcher, s: OAuthServer, clientName: string): Promise<string | undefined> {
  if (!s.registrationEndpoint) return;
  try {
    const r = await f(s.registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...UA },
      // A public client; some servers (Tuwa, checked 2026-11-11) refuse a registration without
      // redirect_uris even for the device grant, so a loopback one rides along (never used).
      body: JSON.stringify({ client_name: clientName, redirect_uris: ["http://127.0.0.1/callback"], grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token", "authorization_code"], token_endpoint_auth_method: "none", ...(s.scope ? { scope: s.scope } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return;
    return str(((await r.json()) as Record<string, unknown>).client_id);
  } catch {
    return;
  }
}

/** RFC 8628 §3.1–3.2: a user code and a link. Tries the registered client, then the vendor's client_name form. */
export async function startDevice(s: OAuthServer, clientName: string, f: Fetcher = fetch, now = Date.now()): Promise<DeviceStart | { error: string }> {
  const attempts: { clientId?: string; withResource: boolean }[] = [];
  const registered = await register(f, s, clientName);
  if (registered) attempts.push({ clientId: registered, withResource: true });
  // No registered client: the vendor form (Tuwa's own bridge sends client_name and reads back a client_id;
  // its endpoint also takes an empty client_id with scope and resource, checked 2026-11-11).
  attempts.push({ withResource: true });
  let last = "the server refused the sign-in";
  for (const a of attempts) {
    const { status, data } = await postForm(f, s.deviceEndpoint, {
      ...(a.clientId ? { client_id: a.clientId } : { client_name: clientName }),
      ...(s.scope ? { scope: s.scope } : {}),
      ...(a.withResource ? { resource: s.resource } : {}),
    });
    const clientId = a.clientId ?? str(data.client_id) ?? "";
    const deviceCode = str(data.device_code);
    const userCode = str(data.user_code);
    const verifyUrl = safe(str(data.verification_uri) ?? str(data.verification_url)) ?? safe(str(data.verification_uri_complete));
    if (status === 200 && deviceCode && userCode && verifyUrl)
      return {
        clientId,
        deviceCode,
        userCode,
        verifyUrl,
        ...(safe(str(data.verification_uri_complete)) ? { verifyUrlComplete: safe(str(data.verification_uri_complete)) } : {}),
        interval: Math.max(1, Number(data.interval) || 5),
        expiresAt: now + (Number(data.expires_in) || 900) * 1000,
        withResource: a.withResource,
      };
    last = str(data.error_description) ?? str(data.error) ?? `status ${status}`;
  }
  return { error: last };
}

const toToken = (s: OAuthServer | Pick<OAuthToken, "tokenEndpoint" | "revocationEndpoint" | "resource" | "scope">, clientId: string, data: Record<string, unknown>, now: number, prev?: OAuthToken): OAuthToken | undefined => {
  const access = str(data.access_token);
  if (!access) return;
  const tokenEndpoint = "tokenEndpoint" in s ? s.tokenEndpoint : prev!.tokenEndpoint;
  return {
    kind: "oauth",
    access,
    ...(str(data.refresh_token) ?? prev?.refresh ? { refresh: str(data.refresh_token) ?? prev?.refresh } : {}),
    ...(Number(data.expires_in) > 0 ? { expiresAt: now + Number(data.expires_in) * 1000 } : {}),
    clientId,
    tokenEndpoint,
    ...(s.revocationEndpoint ? { revocationEndpoint: s.revocationEndpoint } : {}),
    resource: s.resource,
    ...(s.scope ? { scope: s.scope } : {}),
  };
};

/** RFC 8628 §3.4–3.5: one poll of the token endpoint. The caller waits `interval` between polls. */
export async function pollDevice(s: OAuthServer, d: DeviceStart, f: Fetcher = fetch, now = Date.now()): Promise<PollResult> {
  if (now >= d.expiresAt) return { state: "expired" };
  const { status, data } = await postForm(f, s.tokenEndpoint, {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: d.deviceCode,
    client_id: d.clientId,
    ...(d.withResource ? { resource: s.resource } : {}),
  });
  if (status === 200) {
    const token = toToken(s, d.clientId, data, now);
    if (token && d.withResource) token.withResource = true;
    return token ? { state: "done", token } : { state: "failed", error: "no access token in the answer" };
  }
  const err = str(data.error);
  if (err === "authorization_pending" || err === "network" || status === 0 || status >= 500) return { state: "pending", interval: d.interval };
  if (err === "slow_down") return { state: "pending", interval: d.interval + 5 };
  if (err === "access_denied") return { state: "denied" };
  if (err === "expired_token") return { state: "expired" };
  return { state: "failed", error: str(data.error_description) ?? err ?? `status ${status}` };
}

/** Whether the access token should be refreshed before use (a minute of slack). */
export const stale = (t: OAuthToken, now = Date.now()) => t.expiresAt !== undefined && t.expiresAt - 60_000 <= now;

/** RFC 6749 §6: a new access token from the refresh token. "gone": the grant was revoked; sign in again. */
export async function refresh(t: OAuthToken, f: Fetcher = fetch, now = Date.now()): Promise<{ ok: true; token: OAuthToken } | { ok: false; gone: boolean }> {
  if (!t.refresh) return { ok: false, gone: true };
  const { status, data } = await postForm(f, t.tokenEndpoint, { grant_type: "refresh_token", refresh_token: t.refresh, client_id: t.clientId, ...(t.withResource ? { resource: t.resource } : {}) });
  if (status === 200) {
    const token = toToken(t, t.clientId, data, now, t);
    if (token && t.withResource) token.withResource = true;
    if (token) return { ok: true, token };
  }
  // 400 invalid_grant: the grant is gone. Anything else (network, 5xx) may pass: keep the token.
  return { ok: false, gone: status === 400 || status === 401 || str(data.error) === "invalid_grant" };
}

/** RFC 7009: best effort, when the owner removes the connection. */
export async function revoke(t: OAuthToken, f: Fetcher = fetch): Promise<void> {
  if (!t.revocationEndpoint) return;
  await postForm(f, t.revocationEndpoint, { token: t.refresh ?? t.access, client_id: t.clientId }).catch(() => {});
}

/**
 * D193: a token the owner already holds (signed in elsewhere: Tuwa's own bridge file, or a device
 * login made by hand), pasted or imported instead of a new sign-in. Accepts the OAuth answer's own
 * names (access_token, refresh_token, expires_in, client_id) and the camelCase a bridge keeps
 * (accessToken, refreshToken, accessExpiresAt, clientId). Undefined when it isn't such a token.
 */
export function importedToken(text: string, s: OAuthServer, now = Date.now()): OAuthToken | undefined {
  let j: Record<string, unknown>;
  try {
    const v = JSON.parse(text.trim()) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    j = v as Record<string, unknown>;
  } catch {
    return;
  }
  const access = str(j.access_token) ?? str(j.accessToken) ?? str(j.access);
  const refresh = str(j.refresh_token) ?? str(j.refreshToken) ?? str(j.refresh);
  if (!access && !refresh) return;
  const exp = Number(j.accessExpiresAt ?? j.expiresAt ?? j.expires_at);
  const inSec = Number(j.expires_in);
  // No access token: expired at once, so the first use refreshes it.
  const expiresAt = Number.isFinite(exp) && exp > 0 ? (exp < 1e12 ? exp * 1000 : exp) : inSec > 0 ? now + inSec * 1000 : access ? undefined : now - 1;
  return {
    kind: "oauth",
    access: access ?? "",
    ...(refresh ? { refresh } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    clientId: str(j.client_id) ?? str(j.clientId) ?? "",
    tokenEndpoint: s.tokenEndpoint,
    ...(s.revocationEndpoint ? { revocationEndpoint: s.revocationEndpoint } : {}),
    resource: s.resource,
    ...(s.scope ? { scope: s.scope } : {}),
    withResource: true,
  };
}
