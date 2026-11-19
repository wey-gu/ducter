// D405: 小应用 / Apps (design/apps.md). A small app the partner makes for the person from one
// sentence ("给我做个记北京出差花销的小应用"), kept on the home, reopened on the Mac, the web and the
// phone, changed by talking. One HTML file, run in a sandbox with no network: everything it keeps
// goes through ducter.get/set (on the home, so every device sees the same numbers), and the one
// way out is ducter.ask, which puts the app's words in the conversation for the partner, where
// anything outward still waits for the person's Go.

/** A whole app, in characters: a small app is a few thousand; this stops a runaway file. */
export const APP_HTML_MAX = 200_000;
/** All of an app's data, as JSON characters. */
export const APP_DATA_MAX = 500_000;
/** A key's length. */
export const APP_KEY_MAX = 64;
/** An app's name, in characters. */
export const APP_NAME_MAX = 40;
/** At most this many apps per partner: a shelf, not a store. */
export const APPS_MAX = 40;
/** How many earlier versions the home keeps (改回去 / Undo the change goes back one at a time). */
export const APP_VERSIONS_KEPT = 10;
/** ducter.ask: one at a time, at most this many an hour per app (a loop in an app can't spend the person's model). */
export const APP_ASKS_PER_HOUR = 20;
/** An ask's words, in characters. */
export const APP_ASK_MAX = 2000;

export interface AppMeta {
  id: string;
  name: string;
  /** The partner it belongs to (its persona id). */
  persona: string;
  /** When it was made and last changed (ISO). */
  made: string;
  updated: string;
  /** 1 when made; +1 at each change (an undo is a change too). */
  version: number;
  /** The HTML's size, in characters. */
  size: number;
  /** When it was last opened on any device (ISO). */
  opened?: string;
  /** The person's words it was made from. */
  ask?: string;
  /** What the last change was, in the partner's own short words ("加了合计"). */
  note?: string;
  /** An earlier version exists to go back to. */
  back?: true;
}

/** An app as a client opens it: the document to run (the home composes it, bridge included) and its data. */
export interface AppOpen extends AppMeta {
  doc: string;
  /** The web's frame: this home's path for the app under its own policy (by a one-app token, 30 minutes). */
  src?: string;
  data: Record<string, unknown>;
}

/** What a partner message carries when it made or changed an app (ai_msg.app): the card under its words. */
export interface AppCard {
  id: string;
  name: string;
  version: number;
  change: "made" | "changed" | "data";
}

/** user_msg.app: the person's words about one app (typed in its sheet), or the app's own ask (ask = its ref). */
export interface AppRef {
  id: string;
  name: string;
  /** Set when the app asked through ducter.ask: the ref its answer is matched by. */
  ask?: string;
}

/** ai_msg.appAnswer: this message answers an app's ask; the app gets its words. */
export interface AppAnswer {
  id: string;
  ask: string;
}

export type AppsClientFrame =
  // The apps list (answered by apps; it also comes after the welcome and on every change).
  | { t: "apps" }
  // Open one: answered by app_open (doc composed for this client: "message" = an iframe's
  // postMessage, "fetch" = the Mac's own scheme); dark and lang set the look it starts with.
  | { t: "app_open"; id: string; transport?: "message" | "fetch"; dark?: boolean; lang?: string }
  // The app wrote a key (value null deletes it): every device with it open hears app_data.
  | { t: "app_put"; id: string; key: string; value: unknown }
  // The app asked the partner (ducter.ask): logged as the person's message from the app.
  | { t: "app_ask"; id: string; text: string; ref: string }
  // 改回去 / Undo the change: the version before the last one comes back (a new version).
  | { t: "app_back"; id: string }
  // 删掉 / Delete: the app and its data go (its messages stay in the conversation as a record).
  | { t: "app_remove"; id: string };

export type AppsServerFrame =
  | { t: "apps"; apps: AppMeta[] }
  | { t: "app_open"; id: string; app?: AppOpen; gone?: true }
  // A key changed (by the app on another device, or by the partner): by says who.
  | { t: "app_data"; id: string; key: string; value: unknown; by: "app" | "partner" }
  // An ask refused before it reached the partner (busy: one is waiting; limit: too many this hour).
  | { t: "app_ask_refused"; id: string; ref: string; why: "busy" | "limit" | "gone" | "empty" };

/** A key the bridge accepts: short, printable. */
export function appKeyOk(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= APP_KEY_MAX && !/[\p{Cc}]/u.test(key);
}

/** An app's name, cleaned: one line, clipped. */
export function appName(s: string): string {
  const cs = [...String(s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim()];
  return cs.length > APP_NAME_MAX ? cs.slice(0, APP_NAME_MAX - 1).join("") + "…" : cs.join("");
}

/** What a file may not do, said back to the partner (the sandbox blocks it anyway; these break the app silently). */
export function appLint(html: string): string[] {
  const out: string[] = [];
  if (/<(script|link|img|iframe|source|audio|video)\b[^>]*\b(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html)) out.push("loads something from the internet (a CDN script, a font, a picture by URL): nothing outside the file loads; inline it or draw it");
  if (/@import\s+url\(\s*["']?https?:/i.test(html)) out.push("imports a stylesheet from the internet: inline the CSS");
  if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource\(/.test(html)) out.push("calls the network (fetch, XHR, WebSocket): the app has none; ask the partner with ducter.ask, or have the partner put data in with the app tool");
  if (/\blocalStorage\b|\bsessionStorage\b|indexedDB/.test(html)) out.push("uses browser storage: it throws in the sandbox; keep data with ducter.get/ducter.set");
  if (/(^|[^.\w])(alert|confirm|prompt)\s*\(/.test(html)) out.push("uses alert/confirm/prompt: blocked in the sandbox; draw the question in the page");
  if (/\bwindow\.open\s*\(|target\s*=\s*["']_blank/.test(html)) out.push("opens windows or links: blocked; show the address as text");
  return out;
}

/** Pebble's tokens an app draws with (light, then dark), so it looks like Ducter and follows the theme. */
export const APP_TOKENS = {
  light: { bg: "#fff6ea", card: "#ffffff", sunken: "#f7ebda", ink: "#2b2118", soft: "#4a3d30", muted: "#75654f", line: "#e8d9c4", accent: "#ff8a3d", "on-accent": "#2b2118", good: "#1f5e2f", "good-bg": "#d6f5dc", bad: "#8a1f3b", "bad-bg": "#fbdde4", highlight: "#ffe9a8" },
  dark: { bg: "#17120e", card: "#231c16", sunken: "#1d1712", ink: "#f6ebdd", soft: "#dccbb6", muted: "#a8957e", line: "#3a3027", accent: "#ff8a3d", "on-accent": "#2b2118", good: "#a6ecbb", "good-bg": "#163222", bad: "#f8a9bc", "bad-bg": "#3a1621", highlight: "#5a4512" },
} as const;

/** The policy every app runs under: nothing loads from outside the file; no network but the Mac's own scheme. */
export function appCsp(transport: "message" | "fetch"): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    `connect-src ${transport === "fetch" ? "'self'" : "'none'"}`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** The iframe's sandbox on the web: scripts and forms (their submit events), never the parent's origin, popups, top navigation or modals. */
export const APP_SANDBOX = "allow-scripts allow-forms";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
/** JSON safe inside a script element. */
const esc = (s: string) => s.replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");

/**
 * The document a client runs: the policy first, the tokens and the bridge, then the app's own
 * file. The bridge is `window.ducter`:
 *   ducter.get(key) → the value (sync; the data comes with the app) · ducter.set(key, value) ·
 *   ducter.all() · ducter.onChange(fn(key, value, by)) · ducter.ask(text) → Promise<string> ·
 *   ducter.lang · ducter.dark.
 * "message": the iframe posts to its parent (the web and the phone). "fetch": the Mac's web view
 * posts to its own scheme (/bridge) and long-polls /events.
 */
export function appDocument(a: { id: string; name: string; html: string; data: Record<string, unknown> }, o: { transport: "message" | "fetch"; dark?: boolean; lang?: string }): string {
  const vars = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `--d-${k}:${v}`).join(";");
  const style =
    `:root{${vars(APP_TOKENS.light)};--d-radius:14px;--d-font:"Bricolage Grotesque","Ducter Rounded SC",-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;--d-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;color-scheme:light}` +
    `:root[data-theme=dark]{${vars(APP_TOKENS.dark)};color-scheme:dark}` +
    `html,body{margin:0;background:var(--d-bg);color:var(--d-ink);font-family:var(--d-font);-webkit-text-size-adjust:100%}`;
  const boot = JSON.stringify({ id: a.id, name: a.name, data: a.data, dark: !!o.dark, lang: o.lang ?? "en", transport: o.transport });
  const bridge = `(function(){var B=${esc(boot)};var data=B.data||{};var subs=[];var asks={};var n=0;
document.documentElement.setAttribute("data-theme",B.dark?"dark":"light");document.documentElement.lang=B.lang;
function post(m){m.ducterApp=B.id;if(B.transport==="fetch"){fetch("/bridge",{method:"POST",body:JSON.stringify(m)}).catch(function(){});}else{parent.postMessage(m,"*");}}
function onMsg(m){if(!m||m.ducterApp!==B.id)return;if(m.t==="data"){if(m.value===null||m.value===undefined)delete data[m.key];else data[m.key]=m.value;subs.forEach(function(f){try{f(m.key,m.value,m.by)}catch(e){}});}
else if(m.t==="answer"||m.t==="refused"){var p=asks[m.ref];if(p){delete asks[m.ref];m.t==="answer"?p[0](m.text):p[1](new Error(m.why||"refused"));}}
else if(m.t==="theme"){B.dark=!!m.dark;document.documentElement.setAttribute("data-theme",B.dark?"dark":"light");ducter.dark=B.dark;}}
if(B.transport==="fetch"){(function poll(after){fetch("/events?after="+after).then(function(r){return r.json()}).then(function(j){(j.events||[]).forEach(onMsg);poll(j.after);}).catch(function(){setTimeout(function(){poll(after)},2000)});})(0);}
else{window.addEventListener("message",function(e){if(e.source===parent)onMsg(e.data);});}
var ducter={id:B.id,name:B.name,lang:B.lang,dark:B.dark,
get:function(k){var v=data[k];return v===undefined?null:JSON.parse(JSON.stringify(v));},
all:function(){return JSON.parse(JSON.stringify(data));},
set:function(k,v){if(typeof k!=="string"||!k)throw new Error("ducter.set needs a key");if(v===undefined)v=null;var s=JSON.stringify(v);if(v===null)delete data[k];else data[k]=JSON.parse(s);post({t:"put",key:k,value:v});return v;},
onChange:function(f){subs.push(f);return function(){subs=subs.filter(function(x){return x!==f})};},
ask:function(text){var ref="a"+(++n)+"-"+Date.now().toString(36);return new Promise(function(res,rej){asks[ref]=[res,rej];post({t:"ask",text:String(text||""),ref:ref});});}};
Object.freeze(ducter);window.ducter=ducter;
window.addEventListener("error",function(e){post({t:"error",text:String(e.message||"error").slice(0,300)});});
post({t:"ready"});})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${appCsp(o.transport)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style><script>${bridge}</script></head><body>${a.html}</body></html>`;
}

/** The plain line an app card reads as everywhere a card can't be drawn (chat apps, Copy, pushes). */
export function appPlain(c: Pick<AppCard, "name" | "change">, lang: string): string {
  const zh = lang.startsWith("zh");
  if (c.change === "made") return zh ? `［小应用］${c.name}` : `[App] ${c.name}`;
  return zh ? `［小应用，改好了］${c.name}` : `[App, changed] ${c.name}`;
}
