// The phone/web client, served by core (roadmap: "Mobile: web, served by the main process").
//
// Public (no device token needed: there is nothing in them but the app itself):
//   GET /app, GET /pair (the `ducter pair` link's landing; the code stays in the #fragment),
//   GET /app/<asset>, GET /sw.js, GET / → /app.
// Behind the gate (local, or a paired device's bearer token):
//   GET  /api/me                     who this client is, and the push key
//   POST /api/push/subscribe         {subscription, locale, platform, quiet?}
//                                    or, from the iPhone app, {apns: {token, env, topic}, …}
//   POST /api/push/unsubscribe       {endpoint}
//   GET|POST /api/push/settings      {done?, quiet?}
//   POST /api/push/test              one test push to this device's subscriptions
//   POST /api/decide                 {decisionId, option, text?}: Go / Hold / Reply from a notification
// The assets are imported as files, so `bun build --compile` embeds them in the binary.
import type { Decisions } from "./decisions.ts";
import type { Gate, GateResult } from "./auth.ts";
import type { Pusher, PushStore, PushSub, Quiet } from "./push.ts";
import { isPushEndpoint, testMessage } from "./push.ts";
import { APNS_PREFIX, isApnsToken, isTopic, type ApnsSender } from "./apns.ts";

import indexHtml from "../../../apps/web/static/index.html" with { type: "file" };
import appJs from "../../../apps/web/static/app.js" with { type: "file" };
import appCss from "../../../apps/web/static/app.css" with { type: "file" };
import swJs from "../../../apps/web/static/sw.js" with { type: "file" };
import manifest from "../../../apps/web/static/manifest.webmanifest" with { type: "file" };
import font from "../../../apps/web/static/bricolage.woff" with { type: "file" };
import icon192 from "../../../apps/web/static/icon-192.png" with { type: "file" };
import icon512 from "../../../apps/web/static/icon-512.png" with { type: "file" };
import touchIcon from "../../../apps/web/static/apple-touch-icon.png" with { type: "file" };
import monoFont from "../../../apps/web/static/fonts/jetbrains-mono.woff2" with { type: "file" };
import roundedFont from "../../../apps/web/static/fonts/rounded-sc-bold.woff2" with { type: "file" };
import artIdle from "../../../apps/web/static/art/idle.webp" with { type: "file" };
import artIdleClosed from "../../../apps/web/static/art/idle_closed.webp" with { type: "file" };
import artWorking from "../../../apps/web/static/art/working.webp" with { type: "file" };
import artNeeds from "../../../apps/web/static/art/needsyou.webp" with { type: "file" };
import artDone from "../../../apps/web/static/art/done.webp" with { type: "file" };
import artNapping from "../../../apps/web/static/art/napping.webp" with { type: "file" };
import tokenOrange from "../../../apps/web/static/art/token_orange.webp" with { type: "file" };
import tokenInk from "../../../apps/web/static/art/token_ink.webp" with { type: "file" };
// Work over time (D112): Ducter waiting, and the clay things it waits for.
import artWaiting from "../../../apps/web/static/art/waiting.webp" with { type: "file" };
import waitPr from "../../../apps/web/static/art/wait_pr.webp" with { type: "file" };
import waitCi from "../../../apps/web/static/art/wait_ci.webp" with { type: "file" };
import waitMail from "../../../apps/web/static/art/wait_mail.webp" with { type: "file" };
import waitClock from "../../../apps/web/static/art/wait_clock.webp" with { type: "file" };
import waitFile from "../../../apps/web/static/art/wait_file.webp" with { type: "file" };
// D115 (legible): the goal's lights for a keep-going loop; the routine's calendar.
import goalLightOn from "../../../apps/web/static/art/goal_light_on.webp" with { type: "file" };
import goalLightOff from "../../../apps/web/static/art/goal_light_off.webp" with { type: "file" };
import routineCalendar from "../../../apps/web/static/art/routine_calendar.webp" with { type: "file" };

const INDEX = indexHtml as unknown as string; // Bun types an .html import as an HTMLBundle; with type "file" it is a path

const ASSETS: Record<string, [string, string]> = {
  "app.js": [appJs, "text/javascript; charset=utf-8"],
  "app.css": [appCss, "text/css; charset=utf-8"],
  "manifest.webmanifest": [manifest, "application/manifest+json"],
  "bricolage.woff": [font, "font/woff"],
  "icon-192.png": [icon192, "image/png"],
  "icon-512.png": [icon512, "image/png"],
  "apple-touch-icon.png": [touchIcon, "image/png"],
  "fonts/jetbrains-mono.woff2": [monoFont, "font/woff2"],
  "fonts/rounded-sc-bold.woff2": [roundedFont, "font/woff2"],
  "art/idle.webp": [artIdle, "image/webp"],
  "art/idle_closed.webp": [artIdleClosed, "image/webp"],
  "art/working.webp": [artWorking, "image/webp"],
  "art/needsyou.webp": [artNeeds, "image/webp"],
  "art/done.webp": [artDone, "image/webp"],
  "art/token_orange.webp": [tokenOrange, "image/webp"],
  "art/token_ink.webp": [tokenInk, "image/webp"],
  "art/napping.webp": [artNapping, "image/webp"],
  "art/waiting.webp": [artWaiting, "image/webp"],
  "art/wait_pr.webp": [waitPr, "image/webp"],
  "art/wait_ci.webp": [waitCi, "image/webp"],
  "art/wait_mail.webp": [waitMail, "image/webp"],
  "art/wait_clock.webp": [waitClock, "image/webp"],
  "art/wait_file.webp": [waitFile, "image/webp"],
  "art/goal_light_on.webp": [goalLightOn, "image/webp"],
  "art/goal_light_off.webp": [goalLightOff, "image/webp"],
  "art/routine_calendar.webp": [routineCalendar, "image/webp"],
};

// The page loads only its own scripts and styles; it talks only to this origin.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

const etags = new Map<string, string>();
async function serveFile(req: Request, path: string, type: string, cache: string): Promise<Response> {
  const f = Bun.file(path);
  // Keyed by size and mtime, so a rebuilt bundle gets a new tag without a restart.
  const key = `${path}:${f.size}:${f.lastModified}`;
  let tag = etags.get(key);
  if (!tag) {
    tag = `"${Bun.hash(await f.arrayBuffer()).toString(36)}"`;
    etags.set(key, tag);
  }
  const headers: Record<string, string> = { "content-type": type, "cache-control": cache, etag: tag, "x-content-type-options": "nosniff" };
  if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers });
  return new Response(f, { headers });
}

/** The public half: the app's files. Returns undefined for anything else. */
export async function webStatic(req: Request): Promise<Response | undefined> {
  if (req.method !== "GET" && req.method !== "HEAD") return;
  const path = new URL(req.url).pathname;
  if (path === "/") return new Response(null, { status: 302, headers: { location: "app" } });
  if (path === "/app" || path === "/app/" || path === "/pair") {
    const res = await serveFile(req, INDEX, "text/html; charset=utf-8", "no-cache");
    res.headers.set("content-security-policy", CSP);
    res.headers.set("referrer-policy", "no-referrer");
    return res;
  }
  if (path === "/sw.js") {
    const res = await serveFile(req, swJs, "text/javascript; charset=utf-8", "no-cache");
    res.headers.set("service-worker-allowed", "/");
    return res;
  }
  if (path.startsWith("/app/")) {
    const a = ASSETS[path.slice(5)];
    if (!a) return new Response("not found", { status: 404 });
    // Code and styles revalidate (an update shows on the next open); art and fonts are stable.
    const cache = /\.(js|css|webmanifest)$/.test(path) ? "no-cache" : "public, max-age=86400";
    return serveFile(req, a[0], a[1], cache);
  }
}

export interface WebApiDeps {
  decisions: Decisions;
  push: PushStore;
  pusher: Pusher;
  apns?: ApnsSender;
  personaName: () => string;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** A browser page on this machine must be this origin (no cross-site POSTs to the local API). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function parseQuiet(q: unknown): Quiet | null | undefined {
  if (q === null) return null;
  if (!q || typeof q !== "object") return undefined;
  const { start, end, tz } = q as Record<string, unknown>;
  if (typeof start !== "string" || typeof end !== "string" || !HHMM.test(start) || !HHMM.test(end)) return undefined;
  let zone = typeof tz === "string" && tz ? tz : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  return { start, end, tz: zone };
}

/** The authenticated half (/api/*), after the gate passed. Returns undefined for other paths. */
export async function webApi(req: Request, g: Extract<GateResult, { pass: true }>, deps: WebApiDeps): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/")) return;
  if (req.method !== "GET" && !sameOrigin(req)) return json(403, { error: "forbidden" });
  const deviceId = g.via === "device" ? g.device.id : "local";
  const body = async () => (await req.json().catch(() => ({}))) as Record<string, unknown>;
  switch (`${req.method} ${path}`) {
    case "GET /api/me": {
      const v = await deps.push.vapid();
      return json(200, {
        via: g.via,
        personaName: deps.personaName(),
        ...(g.via === "device" ? { deviceId, deviceName: g.device.name } : {}),
        // apns: this main can send to the iPhone app (it has an APNs key).
        push: { supported: true, publicKey: v.publicKey, apns: deps.apns?.configured ?? false },
      });
    }
    case "POST /api/push/subscribe": {
      const b = await body();
      const locale = b.locale === "zh" ? "zh" : "en";
      if (b.apns !== undefined) {
        const a = b.apns as { token?: unknown; env?: unknown; topic?: unknown };
        if (!isApnsToken(a?.token) || !isTopic(a.topic) || (a.env !== "sandbox" && a.env !== "production")) return json(400, { error: "invalid subscription" });
        deps.push.subscribe({ endpoint: APNS_PREFIX + a.token.toLowerCase(), keys: { p256dh: "", auth: "" }, deviceId, locale, platform: "ios", createdAt: new Date().toISOString(), apns: { env: a.env, topic: a.topic } });
        const quiet = parseQuiet(b.quiet);
        if (quiet && !deps.push.settings().quiet) deps.push.setSettings({ quiet });
        return json(200, { ok: true, settings: deps.push.settings(), apns: deps.apns?.configured ?? false });
      }
      const s = b.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
      if (typeof s?.endpoint !== "string" || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string")
        return json(400, { error: "invalid subscription" });
      if (!isPushEndpoint(s.endpoint)) return json(400, { error: "not a known push service" });
      const sub: PushSub = {
        endpoint: s.endpoint,
        keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
        deviceId,
        locale,
        platform: typeof b.platform === "string" ? b.platform.slice(0, 16) : "web",
        createdAt: new Date().toISOString(),
      };
      deps.push.subscribe(sub);
      // The first phone to turn notifications on brings the quiet hours with it (23:00–08:00 in
      // its own zone, D-decisions-attention D3); they change only when the user changes them.
      const quiet = parseQuiet(b.quiet);
      if (quiet && !deps.push.settings().quiet) deps.push.setSettings({ quiet });
      return json(200, { ok: true, settings: deps.push.settings() });
    }
    case "POST /api/push/unsubscribe": {
      const b = await body();
      const ok = typeof b.endpoint === "string" && deps.push.unsubscribe(b.endpoint);
      return json(200, { ok });
    }
    case "GET /api/push/settings":
      return json(200, deps.push.settings());
    case "POST /api/push/settings": {
      const b = await body();
      const patch: Parameters<PushStore["setSettings"]>[0] = {};
      if (typeof b.done === "boolean") patch.done = b.done;
      const quiet = parseQuiet(b.quiet);
      if (quiet !== undefined) patch.quiet = quiet;
      return json(200, deps.push.setSettings(patch));
    }
    case "POST /api/push/test": {
      const results = await deps.pusher.sendNow((s) => testMessage({ persona: deps.personaName(), locale: s.locale }), (s) => s.deviceId === deviceId);
      if (!results.length) return json(404, { error: "no subscription for this device" });
      const ok = results.some((r) => r.status >= 200 && r.status < 300);
      return json(ok ? 200 : 502, { results: results.map((r) => ({ status: r.status })) });
    }
    case "POST /api/decide": {
      const b = await body();
      const option = b.option;
      // reply: typed on the notification itself (the iPhone app's Reply action).
      const text = typeof b.text === "string" ? b.text.trim().slice(0, 4000) : "";
      if (typeof b.decisionId !== "string" || (option !== "go" && option !== "hold" && option !== "reply") || (option === "reply" && !text)) return json(400, { error: "invalid" });
      if (!deps.decisions.isPending(b.decisionId)) return json(409, { error: "already answered" });
      deps.decisions.decide(b.decisionId, option, option === "reply" ? text : undefined);
      return json(200, { ok: true });
    }
  }
  return json(404, { error: "not found" });
}

export type { Gate };
