// The phone/web client, served by core (roadmap: "Mobile: web, served by the main process").
//
// Public (no device token needed: there is nothing in them but the app itself):
//   GET /app, GET /pair (the `ducter pair` link's landing; the code stays in the #fragment),
//   GET /app/<asset>, GET /sw.js, GET / → /app.
// Behind the gate (local, or a paired device's bearer token):
//   GET  /api/me                     who this client is, and the push key
//   POST /api/push/subscribe         {subscription, locale, platform, quiet?}
//                                    or, from the iPhone app, {apns: {token, env, topic, relay?, key?}, …}
//   POST /api/push/unsubscribe       {endpoint}
//   GET|POST /api/push/settings      {done?, quiet?}
//   POST /api/push/test              one test push to this device's subscriptions
//   POST /api/decide                 {decisionId, option, text?}: Go / Hold / Reply from a notification
//   POST /api/media                  D206: a picture (multipart: file, thumb?, preview?, name?) → {media}
// The assets are imported as files, so `bun build --compile` embeds them in the binary.
import { MEDIA_LIMITS } from "@ducter/protocol";
import type { Decisions } from "./decisions.ts";
import type { Gate, GateResult } from "./auth.ts";
import type { Pusher, PushStore, PushSub, Quiet } from "./push.ts";
import { isPushEndpoint, testMessage } from "./push.ts";
import { APNS_PREFIX, isApnsToken, isTopic, type ApnsSender } from "./apns.ts";
import { isDeviceKey, isRelayHandle } from "./push-relay.ts";

import indexHtml from "../../../apps/web/static/index.html" with { type: "file" };
import appJs from "../../../apps/web/static/app.js" with { type: "file" };
import appCss from "../../../apps/web/static/app.css" with { type: "file" };
import swJs from "../../../apps/web/static/sw.js" with { type: "file" };
// D242: pdf.js, loaded only when a PDF opens in the file viewer.
import pdfJs from "../../../apps/web/static/pdf.js" with { type: "file" };
import pdfWorkerJs from "../../../apps/web/static/pdf.worker.js" with { type: "file" };
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
// Each AI agent's own coin (tools/art/coins.py, D183): its mark in clay, and in grey clay when unavailable.
import coinClaudeCode from "../../../apps/web/static/art/coin_claude_code.webp" with { type: "file" };
import coinClaudeCodeOff from "../../../apps/web/static/art/coin_claude_code_off.webp" with { type: "file" };
import coinCodex from "../../../apps/web/static/art/coin_codex.webp" with { type: "file" };
import coinCodexOff from "../../../apps/web/static/art/coin_codex_off.webp" with { type: "file" };
import coinCodexDark from "../../../apps/web/static/art/coin_codex_dark.webp" with { type: "file" };
import coinPi from "../../../apps/web/static/art/coin_pi.webp" with { type: "file" };
import coinPiOff from "../../../apps/web/static/art/coin_pi_off.webp" with { type: "file" };
import coinDeepseekHarness from "../../../apps/web/static/art/coin_deepseek_harness.webp" with { type: "file" };
import coinDeepseekHarnessOff from "../../../apps/web/static/art/coin_deepseek_harness_off.webp" with { type: "file" };
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
// D150: Settings › This phone.
import artPhone from "../../../apps/web/static/art/phone.webp" with { type: "file" };
import artMini from "../../../apps/web/static/art/mini_awake.webp" with { type: "file" };
// D161: the device card's clay (the device big on its ground) and the ability chips.
import artDevServerAwake from "../../../apps/web/static/art/dev_server_awake.webp" with { type: "file" };
import artDevServerAsleep from "../../../apps/web/static/art/dev_server_asleep.webp" with { type: "file" };
import artDevLaptopAwake from "../../../apps/web/static/art/dev_laptop_awake.webp" with { type: "file" };
import artDevLaptopAsleep from "../../../apps/web/static/art/dev_laptop_asleep.webp" with { type: "file" };
import artDevMiniAwake from "../../../apps/web/static/art/dev_mini_awake.webp" with { type: "file" };
import artDevMiniAsleep from "../../../apps/web/static/art/dev_mini_asleep.webp" with { type: "file" };
import artDevDeviceUnreachable from "../../../apps/web/static/art/dev_device_unreachable.webp" with { type: "file" };
import artDevPhone from "../../../apps/web/static/art/dev_phone.webp" with { type: "file" };
import artAbWeb from "../../../apps/web/static/art/ab_web.webp" with { type: "file" };
// D193: the 打电话 / Make calls coin (the clay phone; grey while not connected).
import artAbCall from "../../../apps/web/static/art/ab_call.webp" with { type: "file" };
import artAbCallLocked from "../../../apps/web/static/art/ab_call_locked.webp" with { type: "file" };
import artAbComputer from "../../../apps/web/static/art/ab_computer.webp" with { type: "file" };
import artAbRemote from "../../../apps/web/static/art/ab_remote.webp" with { type: "file" };
import artAbComputerLater from "../../../apps/web/static/art/ab_computer_later.webp" with { type: "file" };
import artAbPhoneLater from "../../../apps/web/static/art/ab_phone_later.webp" with { type: "file" };
import artAbPhone from "../../../apps/web/static/art/ab_phone.webp" with { type: "file" }; // D217
import artSetAutofill from "../../../apps/web/static/art/set_autofill.webp" with { type: "file" };

const INDEX = indexHtml as unknown as string; // Bun types an .html import as an HTMLBundle; with type "file" it is a path

const ASSETS: Record<string, [string, string]> = {
  "app.js": [appJs, "text/javascript; charset=utf-8"],
  "app.css": [appCss, "text/css; charset=utf-8"],
  "pdf.js": [pdfJs, "text/javascript; charset=utf-8"],
  "pdf.worker.js": [pdfWorkerJs, "text/javascript; charset=utf-8"],
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
  "art/coin_claude_code.webp": [coinClaudeCode, "image/webp"],
  "art/coin_claude_code_off.webp": [coinClaudeCodeOff, "image/webp"],
  "art/coin_codex.webp": [coinCodex, "image/webp"],
  "art/coin_codex_off.webp": [coinCodexOff, "image/webp"],
  "art/coin_codex_dark.webp": [coinCodexDark, "image/webp"],
  "art/coin_pi.webp": [coinPi, "image/webp"],
  "art/coin_pi_off.webp": [coinPiOff, "image/webp"],
  "art/coin_deepseek_harness.webp": [coinDeepseekHarness, "image/webp"],
  "art/coin_deepseek_harness_off.webp": [coinDeepseekHarnessOff, "image/webp"],
  "art/waiting.webp": [artWaiting, "image/webp"],
  "art/wait_pr.webp": [waitPr, "image/webp"],
  "art/wait_ci.webp": [waitCi, "image/webp"],
  "art/wait_mail.webp": [waitMail, "image/webp"],
  "art/wait_clock.webp": [waitClock, "image/webp"],
  "art/wait_file.webp": [waitFile, "image/webp"],
  "art/goal_light_on.webp": [goalLightOn, "image/webp"],
  "art/goal_light_off.webp": [goalLightOff, "image/webp"],
  "art/routine_calendar.webp": [routineCalendar, "image/webp"],
  "art/phone.webp": [artPhone, "image/webp"],
  "art/mini_awake.webp": [artMini, "image/webp"],
  "art/dev_server_awake.webp": [artDevServerAwake, "image/webp"],
  "art/dev_server_asleep.webp": [artDevServerAsleep, "image/webp"],
  "art/dev_laptop_awake.webp": [artDevLaptopAwake, "image/webp"],
  "art/dev_laptop_asleep.webp": [artDevLaptopAsleep, "image/webp"],
  "art/dev_mini_awake.webp": [artDevMiniAwake, "image/webp"],
  "art/dev_mini_asleep.webp": [artDevMiniAsleep, "image/webp"],
  "art/dev_device_unreachable.webp": [artDevDeviceUnreachable, "image/webp"],
  "art/dev_phone.webp": [artDevPhone, "image/webp"],
  "art/ab_web.webp": [artAbWeb, "image/webp"],
  "art/ab_call.webp": [artAbCall, "image/webp"],
  "art/ab_call_locked.webp": [artAbCallLocked, "image/webp"],
  "art/ab_computer.webp": [artAbComputer, "image/webp"],
  "art/ab_remote.webp": [artAbRemote, "image/webp"],
  "art/ab_computer_later.webp": [artAbComputerLater, "image/webp"],
  "art/ab_phone_later.webp": [artAbPhoneLater, "image/webp"],
  "art/ab_phone.webp": [artAbPhone, "image/webp"],
  "art/set_autofill.webp": [artSetAutofill, "image/webp"],
};

// The page loads only its own scripts and styles; it talks only to this origin.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

/**
 * D214: a task's page previews in a frame of the opened task's workbench, from a port of this
 * same host (preview.ts): only this host's own ports may be framed and pinged, nothing else.
 */
export function cspFor(req: Request): string {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!/^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]{1,253})$/.test(host)) return CSP;
  const here = `http://${host}:* https://${host}:*`;
  return CSP.replace("connect-src 'self' ws: wss:", `connect-src 'self' ws: wss: ${here}`).replace("default-src 'self';", `default-src 'self'; frame-src ${here};`);
}

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

/** A short content hash of a file, kept per size and mtime (a rebuilt bundle gets a new one). */
const hashes = new Map<string, string>();
async function contentHash(path: string): Promise<string> {
  const f = Bun.file(path);
  const key = `${path}:${f.size}:${f.lastModified}`;
  let h = hashes.get(key);
  if (!h) {
    h = Bun.hash(await f.arrayBuffer()).toString(36).slice(0, 10);
    hashes.set(key, h);
  }
  return h;
}

/**
 * D209: the page names its code and styles by content (app/app.js?v=<hash>), so they are cached
 * for good and a launch never waits on revalidating them; only the page itself is asked for again.
 * The apps open that page from their cache first and the page checks it in the background
 * (apps/web/src/app.ts checkBuild).
 */
export async function indexPage(): Promise<string> {
  const [js, css] = await Promise.all([contentHash(appJs), contentHash(appCss)]);
  const html = await Bun.file(INDEX).text();
  return html.replace('src="app/app.js"', `src="app/app.js?v=${js}"`).replace('href="app/app.css"', `href="app/app.css?v=${css}"`);
}

async function serveIndex(req: Request): Promise<Response> {
  const html = await indexPage();
  const tag = `"${Bun.hash(html).toString(36)}"`;
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", etag: tag, "x-content-type-options": "nosniff" };
  if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers });
  return new Response(req.method === "HEAD" ? null : html, { headers });
}

/** The public half: the app's files. Returns undefined for anything else. */
export async function webStatic(req: Request): Promise<Response | undefined> {
  if (req.method !== "GET" && req.method !== "HEAD") return;
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/") return new Response(null, { status: 302, headers: { location: "app" } });
  if (path === "/app" || path === "/app/" || path === "/pair") {
    const res = await serveIndex(req);
    res.headers.set("content-security-policy", cspFor(req));
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
    // Code and styles named by their content (?v=, D209) are kept for good; asked for by name
    // alone (an older page) they revalidate, so an update shows on the next open. Art and fonts
    // are stable.
    // (A name from before an update gets today's file, never kept under the old name.)
    const named = /\.(js|css)$/.test(path) && url.searchParams.get("v") === (await contentHash(a[0]));
    const cache = named ? "public, max-age=31536000, immutable" : /\.(js|css|webmanifest)$/.test(path) ? "no-cache" : "public, max-age=86400";
    return serveFile(req, a[0], a[1], cache);
  }
}

export interface WebApiDeps {
  decisions: Decisions;
  push: PushStore;
  pusher: Pusher;
  apns?: ApnsSender;
  personaName: () => string;
  /** D200: the Ducter version this home runs, so the apps can tell a home older than themselves. */
  version?: string;
  /** D206: the media store (media.ts); absent in tests that don't need it. */
  media?: import("./media.ts").MediaStore;
  /** D255: the person's own phones (a recording one of them sends back). */
  handsets?: import("./handset/index.ts").Handsets;
  /** A paired device that offers its token over loopback (an SSH tunnel) is still that device. */
  deviceOf?: (req: Request) => { id: string } | undefined;
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
        ...(deps.version ? { version: deps.version } : {}),
        ...(g.via === "device" ? { deviceId, deviceName: g.device.name } : {}),
        // apns: this home can notify the iPhone app (through the relay, or its own Apple key);
        // apnsVia says which; relay: "unreachable" when the relay failed the last time (D159).
        push: {
          supported: true,
          publicKey: v.publicKey,
          apns: deps.apns?.configured ?? false,
          ...(deps.apns?.via ? { apnsVia: deps.apns.via } : {}),
          ...(deps.apns?.relayUnreachable?.() ? { relay: "unreachable" } : {}),
        },
      });
    }
    case "POST /api/push/subscribe": {
      const b = await body();
      const locale = b.locale === "zh" ? "zh" : "en";
      if (b.apns !== undefined) {
        const a = b.apns as { token?: unknown; env?: unknown; topic?: unknown; relay?: unknown; key?: unknown };
        if (!isApnsToken(a?.token) || !isTopic(a.topic) || (a.env !== "sandbox" && a.env !== "production")) return json(400, { error: "invalid subscription" });
        // relay + key (D159): both or neither; a malformed one is refused, not silently dropped.
        if ((a.relay !== undefined && !isRelayHandle(a.relay)) || (a.key !== undefined && !isDeviceKey(a.key))) return json(400, { error: "invalid subscription" });
        const apns: NonNullable<PushSub["apns"]> = { env: a.env, topic: a.topic, ...(isRelayHandle(a.relay) ? { relay: a.relay } : {}), ...(isDeviceKey(a.key) ? { key: a.key } : {}) };
        const sub: PushSub = { endpoint: APNS_PREFIX + a.token.toLowerCase(), keys: { p256dh: "", auth: "" }, deviceId, locale, platform: "ios", createdAt: new Date().toISOString(), apns };
        deps.push.subscribe(sub);
        const quiet = parseQuiet(b.quiet);
        if (quiet && deps.push.settings().quietDefault) deps.push.setSettings({ quiet });
        // apns: this phone will actually get notifications (an app from before the relay, with no
        // handle, on a home without a key of its own, won't).
        const deliverable = deps.apns ? (deps.apns.deliverable?.(sub) ?? deps.apns.configured) : false;
        return json(200, { ok: true, settings: deps.push.settings(), apns: deliverable });
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
      // its own zone, D-decisions-attention D3), in place of the default in this machine's zone
      // (D59); after that they change only when the user changes them, and off stays off.
      const quiet = parseQuiet(b.quiet);
      if (quiet && deps.push.settings().quietDefault) deps.push.setSettings({ quiet });
      return json(200, { ok: true, settings: deps.push.settings() });
    }
    case "POST /api/push/unsubscribe": {
      const b = await body();
      const gone = deps.push.subs().find((s) => s.endpoint === b.endpoint && s.deviceId === deviceId);
      const ok = typeof b.endpoint === "string" && deps.push.unsubscribe(b.endpoint);
      if (ok && gone) void deps.apns?.revoke?.(gone);
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
      return json(ok ? 200 : 502, { results: results.map((r) => ({ status: r.status })), ...(!ok && deps.apns?.relayUnreachable?.() ? { relay: "unreachable" } : {}) });
    }
    case "POST /api/media":
      if (!deps.media) return json(404, { error: "not found" });
      return deps.media.upload(req);
    // D255: a lent phone sends back the recording of its screen it made (the body is the MP4; what
    // the phone says of it rides in the query). Only that phone, for a recording the home asked for.
    case "POST /api/handset/recording": {
      const phone = g.via === "device" ? g.device.id : deps.deviceOf?.(req)?.id;
      if (!deps.handsets || !phone) return json(404, { error: "not found" });
      const q = new URL(req.url).searchParams;
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MEDIA_LIMITS.video) return json(413, { error: "too big" });
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > MEDIA_LIMITS.video) return json(413, { error: "too big" });
      const r = deps.handsets.recording(phone, { id: q.get("id") ?? "", session: q.get("session") ?? "", ...(q.get("name") ? { name: q.get("name")!.slice(0, 120) } : {}), ms: Number(q.get("ms")) || 0, bytes: Number(q.get("bytes")) || 0, partial: q.get("partial") === "1" }, bytes);
      return r.ok ? json(200, { ok: true }) : json(r.status, { error: r.error });
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
