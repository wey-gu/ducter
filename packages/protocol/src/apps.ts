// D405: 小应用 / Apps (design/apps.md). A small app the partner makes for the person from one
// sentence ("给我做个记北京出差花销的小应用"), kept on the home, reopened on the Mac, the web and the
// phone, changed by talking. One HTML file, run in a sandbox with no network: everything it keeps
// goes through ducter.get/set (on the home, so every device sees the same numbers), and the one
// way out is ducter.ask, which puts the app's words in the conversation for the partner, where
// anything outward still waits for the person's Go.
import { APP_GLYPHS, APP_ICON_WORDS } from "./app-glyphs.ts";
import { appRowsInMarkup } from "./app-lift.ts";

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
/** D407: a task's writes into an app it fills (app_data calls), at most this many an hour per app. */
export const APP_TASK_WRITES_PER_HOUR = 60;
/** D407: keys one app_data call may set or remove. */
export const APP_TASK_KEYS_PER_CALL = 40;
/** D410: the one line an app says of itself on its shelf tile (ducter.summary), in characters. */
export const APP_SUMMARY_MAX = 80;
/** D410: a deleted app can be brought back for this long (its card's 撤销 / Undo, the shelf's toast). */
export const APP_REMOVED_DAYS = 30;
/**
 * D410, D422: the marks an app's tile can carry (drawn, never an emoji; app-glyphs.ts), the partner's
 * pick by what the app is about; else the one its own words point to (appIcon).
 */
export type AppIcon = keyof typeof APP_GLYPHS;
export const APP_ICONS = Object.keys(APP_GLYPHS) as AppIcon[];
/** D410: the tiles' clay tints: the person's muted clays (D285), never a state's colour. */
export const APP_TINTS = ["clay", "sand", "sage", "mist", "lilac", "stone"] as const;
export type AppTint = (typeof APP_TINTS)[number];
/** D410: an app's tint: its own, else one picked from its id (the same on every device). */
export function appTint(m: { id: string; tint?: string }): AppTint {
  if (m.tint && (APP_TINTS as readonly string[]).includes(m.tint)) return m.tint as AppTint;
  let h = 0;
  for (const ch of m.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return APP_TINTS[h % APP_TINTS.length]!;
}
/**
 * D410, D422: an app's mark: its own, else the review board's board, else the one its name or the
 * sentence it was made from points to (出差花销: a suitcase), else the window.
 */
export function appIcon(m: { icon?: string; kind?: string; name?: string; ask?: string }): AppIcon {
  if (m.icon && m.icon in APP_GLYPHS && m.icon !== "window") return m.icon as AppIcon;
  if (m.kind === "reviews") return "board";
  return appIconFor(m.name ?? "") ?? appIconFor(m.ask ?? "") ?? "window";
}
/** D422: the mark some words point to (APP_ICON_WORDS, in order), or none. */
export function appIconFor(words: string): AppIcon | undefined {
  if (!words.trim()) return undefined;
  return APP_ICON_WORDS.find(([, re]) => re.test(words))?.[0];
}
/** D410: an app's own line, cleaned: one line, clipped. */
export function appSummary(s: unknown): string {
  const cs = [...String(s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim()];
  return cs.length > APP_SUMMARY_MAX ? cs.slice(0, APP_SUMMARY_MAX - 1).join("") + "…" : cs.join("");
}

/** D407: the task that fills an app each round (it writes the app's data, never its code). */
export interface AppTask {
  id: string;
  title: string;
}

export interface AppMeta {
  id: string;
  name: string;
  /** The partner it belongs to (its persona id). */
  persona: string;
  /** When it was made and last changed, including a fill of its data (ISO). */
  made: string;
  updated: string;
  /** 1 when made; +1 at each change (an undo is a change too). */
  version: number;
  /** The HTML's size, in characters. */
  size: number;
  /** When it was last opened on any device (ISO). */
  opened?: string;
  /** D636: the first time its data was filled (a screen, a task or the partner): its card
   *  stands once, at the make or at this first fill, never after every later fill. */
  filled?: string;
  /** The person's words it was made from. */
  ask?: string;
  /** What the last change was, in the partner's own short words ("加了合计"). */
  note?: string;
  /** An earlier version exists to go back to. */
  back?: true;
  /** D407: the routine task that keeps it current (its rounds write the data). */
  task?: AppTask;
  /** D612, legacy: every task whose work an old reviews board showed (`task` is the first); never written now. */
  tasks?: AppTask[];
  /** D612: the Keep whose rounds fill it (a task per round writes app_data; a board or any app may follow a Keep). */
  keep?: AppTask;
  /** D407, legacy: an app made from the old review-board template (D624: no longer offered; kept as the person's app, its data untouched). */
  kind?: "reviews";
  /**
   * D612: it shows a task's or a Keep's work but is not given to it: a snapshot, never kept
   * current. The app says 截至 {time} and the partner says it is a snapshot.
   */
  snapshot?: true;
  /** D410: the one line the app says of itself (ducter.summary, or the partner's when it made or filled it): "3 笔，合计 ¥1,698". */
  summary?: string;
  /** D410: its mark and its clay tint on the shelf (the partner's pick; else the window and a tint from its id). */
  icon?: AppIcon;
  tint?: AppTint;
  /** D410: pinned: first on the shelf, and in the strip at the top of the conversation. */
  pinned?: true;
  /** D422: its page threw when it ran (that version; a new version clears it): the first words of the error. */
  broke?: { text: string; at: string; version: number };
  /** D422: what it is doing now, worked out by the home on every list (never kept): AppLive. */
  live?: AppLive;
  /**
   * D562: where this home serves the app's own icon and Home Screen manifest, worked out on every
   * list (never kept): `/app-icon/<id>/<key>/` + `icon-<size>.png` (a Home Screen's and the Dock's), `manifest.webmanifest`.
   */
  home?: string;
}

/**
 * D422: an app's state, one truth for its tile, its window and the partner. The home works it out
 * from Ongoing (the task that keeps it current), the conversation (a change asked for and not yet
 * answered) and the app itself (its page threw; it was made before the kit). Absent: nothing to say.
 */
export interface AppLive {
  /** A repeating task keeps it current: which, how it stands, when it last updated it and when it will next. `ended`: the task or Keep it follows has ended (the app says 已停止更新, 截至 {last}). */
  kept?: { task?: string; keep?: string; title: string; state: "running" | "resting" | "paused" | "failed" | "ended"; last?: string; next?: string; why?: string; of: { kind: "routine" | "task" | "keep"; id: string } };
  /** D612: it shows work it does not follow (a snapshot); the time its numbers are from. */
  snapshot?: { at: string };
  /** The person asked the partner to change it and the answer hasn't come yet (since when). */
  changing?: { since: string };
  /** Its page threw when it ran: the first words of the error (fixes: ask the partner, or go back a version). */
  broke?: { text: string };
  /** It was made before the kit (the system's grey controls, no kit): 换成新样子 / Give it the new look. */
  old?: true;
  /** D431: rows of the person's items written into its markup, not its data (the partner moves them when it next changes it; no line of its own). */
  inFile?: number;
}

/**
 * D422: the one thing an app's tile and window say about its state, the most urgent first: being
 * changed now; its page broke; its task failed or is paused or running; it still has the old look;
 * a task will update it next; else nothing (plain: when it last changed). The Mac's StateOf is the same.
 */
export type AppState = "changing" | "broke" | "kept_failed" | "kept_paused" | "kept_running" | "kept_ended" | "old" | "kept_next" | "plain";
export function appState(m: Pick<AppMeta, "live">): AppState {
  const l = m.live;
  if (l?.changing) return "changing";
  if (l?.broke) return "broke";
  if (l?.kept?.state === "failed") return "kept_failed";
  if (l?.kept?.state === "paused") return "kept_paused";
  if (l?.kept?.state === "running") return "kept_running";
  if (l?.kept?.state === "ended") return "kept_ended";
  if (l?.old) return "old";
  if (l?.kept) return "kept_next";
  return "plain";
}

/** D612: every task an app follows (a board may show more than one review task's work). */
export const appTasks = (m: Pick<AppMeta, "task" | "tasks">): AppTask[] => {
  const all = [...(m.task ? [m.task] : []), ...(m.tasks ?? [])];
  const seen = new Set<string>();
  return all.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
};

/** D422: a file's look problems only (the lint's kit rules): an app made before the kit has some. */
export function appKitIssues(html: string): string[] {
  return appLint(html).filter((x) => /native <select>|number stepper|date or time picker|doesn't use the kit/.test(x));
}

/**
 * D410: a first app to make, while the shelf is empty: what the person could say, in both
 * languages, drawn from what the home knows (a trip coming up, a routine that repeats), else a
 * plain everyday one. A tap sends `say` as the person's own words.
 */
export interface AppIdea {
  say: { zh: string; en: string };
  /** Why this one: "你 11/20 去北京" (absent for an everyday one). */
  why?: { zh: string; en: string };
  icon: AppIcon;
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
  /** D410: removed: deleted on the person's word (the card offers 撤销 / Undo for APP_REMOVED_DAYS). */
  change: "made" | "changed" | "data" | "removed";
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
  // D410: kept APP_REMOVED_DAYS to bring back (app_restore), then gone.
  | { t: "app_remove"; id: string }
  // D410: 撤销 / Undo a delete: the app and its data come back as they were.
  | { t: "app_restore"; id: string }
  // D410: the shelf's 「⋯」: 改名 / Rename, 置顶 / Pin, 不再自动更新 / Stop updating it (untask).
  | { t: "app_set"; id: string; name?: string; pinned?: boolean; untask?: true }
  // D410: the app's own line for its tile (ducter.summary).
  | { t: "app_summary"; id: string; text: string }
  // D422: the app's page threw (the bridge's error): kept on that version, shown with a fix.
  | { t: "app_error"; id: string; version: number; text: string };

export type AppsServerFrame =
  // ideas (D410): while there are none, up to three things to say for a first one, from what the home knows.
  | { t: "apps"; apps: AppMeta[]; ideas?: AppIdea[] }
  | { t: "app_open"; id: string; app?: AppOpen; gone?: true }
  // A key changed (by the app on another device, by the partner, or by the task that fills it, D407): by says who.
  | { t: "app_data"; id: string; key: string; value: unknown; by: "app" | "partner" | "task" }
  // An ask refused before it reached the partner (busy: one is waiting; limit: too many this hour).
  | { t: "app_ask_refused"; id: string; ref: string; why: "busy" | "limit" | "gone" | "empty" };

/** D407: what ducter.open may show: one pull request's draft (owner/repo#n). */
export function appShowRef(x: unknown): string | undefined {
  const d = x && typeof x === "object" ? (x as { draft?: unknown }).draft : undefined;
  return typeof d === "string" && /^[\w.-]+\/[\w.-]+#\d+$/.test(d) ? d : undefined;
}

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
  // D410: the kit's controls, never the system's grey ones (they break the clay look).
  // D421: a select is the kit's clay one (<select class="k-select">), never the system's grey one.
  if (/<select\b(?![^>]*\bclass\s*=\s*["'][^"']*\bk-select\b)/i.test(html)) out.push(`uses a native <select>: use the kit's chips, <div class="k-chips"><button class="k-chip" aria-pressed="true">…</button></div>, or for a longer list the kit's <select class="k-select">`);
  if (/<input\b[^>]*\btype\s*=\s*["']?number\b/i.test(html)) out.push(`uses a number stepper (type=number): use <input class="k-num" inputmode="decimal">`);
  if (/<input\b[^>]*\btype\s*=\s*["']?(date|time|datetime-local|month|week)\b/i.test(html)) out.push(`uses a date or time picker (the system's grey one): use chips (今天, 昨天, the times they said) or a k-input`);
  // D431: the person's things live in its data (every device; the partner reads and fills them), never written in as markup.
  const rows = appRowsInMarkup(html);
  if (rows >= 2) out.push(`writes ${rows} rows into the markup: keep the items in data (the app tool's data) and draw the rows from ducter.get in the script`);
  if (!/class\s*=\s*["'][^"']*\bk-app\b/.test(html)) out.push(`doesn't use the kit: put it all in <main class="k-app">, the total or the state first in a .k-sum`);
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
  light: { bg: "#fff6ea", card: "#ffffff", sunken: "#f7ebda", ink: "#2b2118", soft: "#4a3d30", muted: "#75654f", line: "#e8d9c4", accent: "#ff8a3d", "on-accent": "#2b2118", good: "#1f5e2f", "good-bg": "#d6f5dc", bad: "#8a1f3b", "bad-bg": "#fbdde4", highlight: "#ffe9a8", "accent-ledge": "#c9642a", hi: "rgba(255,255,255,.65)" },
  dark: { bg: "#17120e", card: "#231c16", sunken: "#1d1712", ink: "#f6ebdd", soft: "#dccbb6", muted: "#a8957e", line: "#3a3027", accent: "#ff8a3d", "on-accent": "#2b2118", good: "#a6ecbb", "good-bg": "#163222", bad: "#f8a9bc", "bad-bg": "#3a1621", highlight: "#5a4512", "accent-ledge": "#c9642a", hi: "rgba(255,255,255,.05)" },
} as const;

/**
 * D410: Ducter's app kit, in every app's document before its own file: Pebble's clay for the few
 * shapes a small app needs, so a generated app looks finished without the model inventing a design
 * (and never the system's grey select or number stepper; the home's lint rejects those). Summary
 * first: the total or the state at the top, big. The partner's tool lists the class names.
 *   k-app (the page) · k-sum > k-sum-label, k-sum-value, k-sum-sub · k-card · k-h · k-list > k-row >
 *   k-row-main, k-row-sub, k-row-value · k-chips > button.k-chip[aria-pressed] · input.k-num ·
 *   k-field > label + input.k-input · select.k-select (D421) · k-btn, k-btn.primary, k-btn.quiet · k-from · k-empty · k-bar > i
 */
export const APP_KIT_CSS = [
  `*,*::before,*::after{box-sizing:border-box}`,
  `button,input,textarea{font:inherit;color:inherit}`,
  `.k-app{max-width:560px;margin:0 auto;padding:18px 16px 32px;display:flex;flex-direction:column;gap:14px;font-size:15px;line-height:1.5}`,
  `.k-sum{position:relative;padding:16px 18px 18px;border-radius:20px;background:var(--d-card);box-shadow:inset 0 1.5px 0 var(--d-hi),0 4px 0 var(--d-line)}`,
  `.k-sum-label{font-size:13px;font-weight:700;color:var(--d-muted)}`,
  `.k-sum-value{display:block;margin-top:2px;font-size:40px;font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--d-ink)}`,
  `.k-sum-sub{display:block;margin-top:6px;font-size:13px;color:var(--d-soft)}`,
  `.k-card{padding:14px 16px;border-radius:var(--d-radius);background:var(--d-card);box-shadow:0 3px 0 var(--d-line);display:flex;flex-direction:column;gap:12px}`,
  `.k-h{margin:6px 2px 0;font-size:13px;font-weight:800;letter-spacing:.02em;color:var(--d-muted)}`,
  `.k-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}`,
  `.k-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--d-radius);background:var(--d-card);box-shadow:0 2px 0 var(--d-line)}`,
  `.k-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-weight:700;overflow-wrap:anywhere}`,
  `.k-row-sub{font-size:13px;font-weight:400;color:var(--d-muted)}`,
  `.k-row-value{flex:none;font-weight:800;font-variant-numeric:tabular-nums}`,
  `.k-chips{display:flex;flex-wrap:wrap;gap:8px}`,
  `.k-chip{min-height:38px;padding:0 14px;border:0;border-radius:999px;background:var(--d-sunken);color:var(--d-soft);font-size:14px;font-weight:700;cursor:pointer;box-shadow:inset 0 0 0 1px var(--d-line)}`,
  `.k-chip[aria-pressed=true]{background:var(--d-ink);color:var(--d-bg);box-shadow:0 2px 0 var(--d-line)}`,
  `.k-field{display:flex;flex-direction:column;gap:6px}`,
  `.k-field>label,.k-label{font-size:13px;font-weight:700;color:var(--d-muted)}`,
  `.k-input,.k-num{width:100%;min-height:44px;padding:0 14px;border:0;border-radius:12px;background:var(--d-sunken);color:var(--d-ink);box-shadow:inset 0 0 0 1px var(--d-line);outline:none}`,
  `.k-num{min-height:60px;font-size:30px;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums}`,
  `.k-input:focus,.k-num:focus{box-shadow:inset 0 0 0 2px var(--d-accent)}`,
  `.k-input::placeholder,.k-num::placeholder{color:var(--d-muted);opacity:.7}`,
  `.k-btn{min-height:44px;padding:0 18px;border:0;border-radius:14px;background:var(--d-card);color:var(--d-ink);font-weight:800;cursor:pointer;box-shadow:inset 0 0 0 1px var(--d-line),0 3px 0 var(--d-line);transition:transform .08s,box-shadow .08s}`,
  `.k-btn.primary{background:var(--d-accent);color:var(--d-on-accent);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.38),0 3px 0 var(--d-accent-ledge)}`,
  `.k-btn.quiet{background:transparent;box-shadow:none;color:var(--d-soft);min-height:36px;padding:0 10px}`,
  `.k-btn:active{transform:translateY(3px);box-shadow:0 0 0 var(--d-line)}`,
  `.k-btn:disabled{opacity:.45;cursor:default;transform:none}`,
  // D422: where a prefilled item came from: a quiet word, never a dotted pill.
  `.k-from{font-size:12px;font-weight:700;color:var(--d-muted);white-space:nowrap}`,
  // D422: rows inside a card are one list (no ledge on a ledge).
  `.k-card .k-list{gap:0}.k-card .k-row{padding:11px 2px;border-radius:0;background:transparent;box-shadow:none;border-top:1px solid var(--d-line)}.k-card .k-row:first-child{border-top:0}`,
  // D422: adding comes last and folded: <details class="k-add"><summary>记一笔</summary>…</details>.
  `.k-add{border-radius:var(--d-radius)}.k-add>summary{list-style:none;display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:14px;background:var(--d-accent);color:var(--d-on-accent);font-weight:800;cursor:pointer;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.38),0 3px 0 var(--d-accent-ledge)}`,
  `.k-add>summary::-webkit-details-marker{display:none}.k-add[open]>summary{background:var(--d-card);color:var(--d-soft);box-shadow:inset 0 0 0 1px var(--d-line),0 3px 0 var(--d-line)}`,
  `.k-add>:not(summary){margin-top:12px}.k-add[open]{padding-bottom:4px}`,
  `.k-sum-next{display:block;margin-top:10px;padding-top:10px;border-top:1px solid var(--d-line);font-size:14px;font-weight:700;color:var(--d-ink)}`,
  `.k-empty{padding:22px 18px;border-radius:var(--d-radius);background:var(--d-sunken);color:var(--d-soft);text-align:center;font-size:14px}`,
  // D431: the first state. While the app keeps nothing yet (html[data-empty], set by the bridge), its
  // answer is a promise, not a bleak zero: the value muted (or a word, .k-none); k-empty shows two
  // ghost rows of what will list there over its line; the add opens by itself right under it as a
  // card (data-first). Empty shells an app left (a card round an empty list, an empty next line) fold away.
  `.k-none{font-size:28px;color:var(--d-muted)}[data-empty] .k-sum-value{color:var(--d-muted)}`,
  `[data-empty] .k-empty{position:relative;padding-top:88px;border:1.5px dashed var(--d-line);background:transparent}`,
  `[data-empty] .k-empty::before,[data-empty] .k-empty::after{content:"";position:absolute;top:26px;height:9px;border-radius:999px;background:var(--d-line);box-shadow:0 28px 0 var(--d-line);opacity:.8}`,
  `[data-empty] .k-empty::before{left:20px;width:46%}[data-empty] .k-empty::after{right:20px;width:16%}`,
  `.k-add[data-first]{padding:16px 16px 18px;border-radius:20px;background:var(--d-card);box-shadow:inset 0 1.5px 0 var(--d-hi),0 4px 0 var(--d-line)}`,
  `.k-add[data-first]>summary{min-height:0;justify-content:flex-start;padding:0 2px;background:none;box-shadow:none;color:var(--d-ink);font-size:16px;pointer-events:none}`,
  `.k-row>.k-row-sub{flex:0 1 42%;min-width:0;text-align:right}[hidden]{display:none!important}.k-list:empty,.k-sum-sub:empty,.k-sum-next:empty{display:none}.k-card:has(>.k-list:only-child:empty){display:none}`,
  `.k-bar{height:8px;border-radius:999px;background:var(--d-sunken);overflow:hidden}`,
  `.k-bar>i{display:block;height:100%;border-radius:999px;background:var(--d-accent)}`,
  `.k-good{color:var(--d-good)}.k-bad{color:var(--d-bad)}.k-muted{color:var(--d-muted)}`,
  // D422: a floor under every control the app didn't style (an app made before the kit, or a model
  // that forgot it): clay, never the system's grey. :where() keeps it below anything the app says.
  `:where(input:not([type=checkbox],[type=radio],[type=range],[type=color]),select,textarea){min-height:44px;padding:0 12px;border:0;border-radius:12px;background-color:var(--d-sunken);color:var(--d-ink);box-shadow:inset 0 0 0 1px var(--d-line);font:inherit;-webkit-appearance:none;appearance:none}`,
  `:where(textarea){padding:10px 12px}:where(select){padding-right:34px;background-image:linear-gradient(45deg,transparent 50%,var(--d-muted) 50%),linear-gradient(135deg,var(--d-muted) 50%,transparent 50%);background-position:calc(100% - 19px) 52%,calc(100% - 14px) 52%;background-size:5px 5px;background-repeat:no-repeat}`,
  `input::-webkit-inner-spin-button,input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}`,
  `:where(button:not([class])){min-height:44px;padding:0 18px;border:0;border-radius:14px;background:var(--d-card);color:var(--d-ink);font:inherit;font-weight:800;cursor:pointer;box-shadow:inset 0 0 0 1px var(--d-line),0 3px 0 var(--d-line)}`,
  // D421: the clay select. Closed, a field with a drawn caret; open, the kit's clay list (APP_KIT_JS) where
  // there is a mouse, the phone's own picker under a finger.
  `.k-select{appearance:none;-webkit-appearance:none;width:100%;min-height:44px;padding:0 38px 0 14px;border:0;border-radius:12px;background:var(--d-sunken) no-repeat right 14px center/10px 10px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5 5 6.7 8 3.5' fill='none' stroke='%2375654f' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");color:var(--d-ink);font-weight:700;box-shadow:inset 0 0 0 1px var(--d-line);outline:none;cursor:pointer}`,
  `.k-select:focus-visible{box-shadow:inset 0 0 0 2px var(--d-accent)}`,
  `.k-menu{position:fixed;z-index:50;display:flex;flex-direction:column;max-height:min(320px,60vh);overflow-y:auto;padding:6px;border-radius:16px;background:var(--d-card);box-shadow:0 10px 32px rgba(43,33,24,.18),0 0 0 1px var(--d-line)}`,
  `.k-menu button{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:38px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--d-ink);font-size:14px;text-align:left;white-space:nowrap;cursor:pointer}`,
  `.k-menu button:hover,.k-menu button:focus-visible{background:var(--d-sunken);outline:none}`,
  `.k-menu button[aria-selected=true]{font-weight:800}.k-menu button[aria-selected=true]::after{content:"";width:10px;height:6px;margin-top:-3px;border:solid currentColor;border-width:0 0 2px 2px;transform:rotate(-45deg)}`,
].join("");

/**
 * D421: the kit's clay select at work. With a mouse, a press on a select.k-select opens the kit's own
 * list (.k-menu: role listbox, Up/Down/Home/End, Enter, Escape, a first letter) in place of the
 * system's grey pop-up; the choice sets the select's value and fires its input and change events, so
 * the app reads it as from any select. Under a finger the phone's own picker stays.
 */
export const APP_KIT_JS = `(function(){if(!window.matchMedia||!matchMedia("(pointer:fine)").matches)return;var open=null;
function shut(back){if(!open)return;var o=open;open=null;o.m.remove();document.removeEventListener("mousedown",away,true);if(back)o.s.focus();}
function away(e){if(open&&!open.m.contains(e.target)&&e.target!==open.s)shut(false);}
function show(s){shut(false);var m=document.createElement("div");m.className="k-menu";m.setAttribute("role","listbox");if(s.getAttribute("aria-label"))m.setAttribute("aria-label",s.getAttribute("aria-label"));
[].forEach.call(s.options,function(o,i){if(o.hidden)return;var b=document.createElement("button");b.type="button";b.setAttribute("role","option");b.textContent=o.textContent;b.disabled=o.disabled;b.setAttribute("aria-selected",i===s.selectedIndex?"true":"false");
b.onclick=function(){var ch=s.selectedIndex!==i;s.selectedIndex=i;shut(true);if(ch){s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));}};m.appendChild(b);});
document.body.appendChild(m);var r=s.getBoundingClientRect();m.style.minWidth=r.width+"px";var h=m.offsetHeight,w=m.offsetWidth,top=r.bottom+6;if(top+h>innerHeight-8&&r.top-6-h>8)top=r.top-6-h;
m.style.top=Math.max(8,Math.min(top,innerHeight-8-h))+"px";m.style.left=Math.max(8,Math.min(r.left,innerWidth-8-w))+"px";open={s:s,m:m};document.addEventListener("mousedown",away,true);
var all=[].slice.call(m.querySelectorAll("button:not([disabled])"));(m.querySelector("[aria-selected=true]")||all[0]||m).focus();
m.onkeydown=function(e){var i=all.indexOf(document.activeElement),k=e.key,go=function(n){e.preventDefault();all[(n+all.length)%all.length].focus();};
if(k==="ArrowDown")return go(i+1);if(k==="ArrowUp")return go(i-1);if(k==="Home")return go(0);if(k==="End")return go(all.length-1);if(k==="Escape"||k==="Tab"){e.preventDefault();return shut(true);}
if(k.length===1){for(var n=1;n<=all.length;n++){var b=all[(i+n)%all.length];if(b.textContent.trim().toLowerCase().indexOf(k.toLowerCase())===0)return go(all.indexOf(b));}}};}
document.addEventListener("mousedown",function(e){var s=e.target&&e.target.closest&&e.target.closest("select.k-select");if(!s||s.disabled)return;e.preventDefault();open&&open.s===s?shut(true):show(s);},true);
document.addEventListener("keydown",function(e){var s=document.activeElement;if(!s||!s.matches||!s.matches("select.k-select")||open)return;if(e.key==="ArrowDown"||e.key==="ArrowUp"||e.key===" "||e.key==="Enter"){e.preventDefault();show(s);}},true);
addEventListener("resize",function(){shut(false)});})();`;

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
 *   ducter.lang · ducter.dark · ducter.open({ draft: "owner/repo#n" }) (D407: the person's own draft
 *   sheet for that pull request opens over the app; nothing is sent) · ducter.summary(text) (D410:
 *   the one line its shelf tile shows, "3 笔，合计 ¥1,698"; said again on every change, sent once it settles).
 * D603: the bridge also tells the window around it of the person's first touch in the app (`touch`:
 * the first-open line has been seen) and of / or ⌘L pressed outside the app's own fields (`compose`:
 * the composer to change it comes up), since the page has the keys while it is focused.
 * The kit (APP_KIT_CSS) comes before the app's own styles, so the app can still restyle anything.
 * "message": the iframe posts to its parent (the web and the phone). "fetch": the Mac's web view
 * posts to its own scheme (/bridge) and long-polls /events.
 */
export function appDocument(a: { id: string; name: string; html: string; data: Record<string, unknown> }, o: { transport: "message" | "fetch"; dark?: boolean; lang?: string }): string {
  const vars = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `--d-${k}:${v}`).join(";");
  const style =
    `:root{${vars(APP_TOKENS.light)};--d-radius:14px;--d-font:"Bricolage Grotesque","Ducter Rounded SC",-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;--d-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;color-scheme:light}` +
    `:root[data-theme=dark]{${vars(APP_TOKENS.dark)};color-scheme:dark}` +
    `html,body{margin:0;background:var(--d-bg);color:var(--d-ink);font-family:var(--d-font);-webkit-text-size-adjust:100%}` +
    APP_KIT_CSS;
  const boot = JSON.stringify({ id: a.id, name: a.name, data: a.data, dark: !!o.dark, lang: o.lang ?? "en", transport: o.transport });
  const bridge = `(function(){var B=${esc(boot)};var data=B.data||{};var subs=[];var asks={};var n=0;var said=null,st=0;
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
set:function(k,v){if(typeof k!=="string"||!k)throw new Error("ducter.set needs a key");if(v===undefined)v=null;var s=JSON.stringify(v);if(v===null)delete data[k];else data[k]=JSON.parse(s);post({t:"put",key:k,value:v});mark();return v;},
onChange:function(f){subs.push(f);return function(){subs=subs.filter(function(x){return x!==f})};},
ask:function(text){var ref="a"+(++n)+"-"+Date.now().toString(36);return new Promise(function(res,rej){asks[ref]=[res,rej];post({t:"ask",text:String(text||""),ref:ref});});},
open:function(w){var d=w&&typeof w.draft==="string"?w.draft:"";if(/^[\\w.-]+\\/[\\w.-]+#\\d+$/.test(d))post({t:"show",draft:d});},
summary:function(t){var s=String(t==null?"":t).slice(0,200);if(s===said)return;said=s;clearTimeout(st);st=setTimeout(function(){post({t:"summary",text:s});},400);}};
Object.freeze(ducter);window.ducter=ducter;
function kept(v,d){if(typeof v==="number")return v!==0;if(!v||typeof v!=="object"||d>4)return false;if(Array.isArray(v)){if(v.some(function(x){return x&&typeof x==="object"}))return true;return v.some(function(x){return typeof x==="number"||(typeof x==="string"&&x.trim()&&!/^\\d{4}-\\d\\d-\\d\\d/.test(x))});}for(var k in v)if(kept(v[k],d+1))return true;return false;}
function none(){for(var k in data)if(kept(data[k],0))return false;return true;}
var first=none(),booting=true;
function mark(){var e=booting?first:none();if(e)return document.documentElement.setAttribute("data-empty","");document.documentElement.removeAttribute("data-empty");
var a=document.querySelector("details.k-add[data-first]");if(a){a.removeAttribute("data-first");a.open=false;}}
mark();subs.push(mark);
document.addEventListener("DOMContentLoaded",function(){booting=false;if(!first)return;var a=document.querySelector("details.k-add");if(a&&!a.open){a.open=true;a.setAttribute("data-first","");}});
window.addEventListener("error",function(e){post({t:"error",text:String(e.message||"error").slice(0,300)});});
var touched=false;function touch(){if(touched)return;touched=true;post({t:"touch"});}
addEventListener("pointerdown",touch,true);
addEventListener("keydown",function(e){var a=document.activeElement,f=a&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
if(!f&&!e.altKey&&((e.key==="/"&&!e.metaKey&&!e.ctrlKey)||((e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==="l"||e.key==="L")))){e.preventDefault();post({t:"compose"});return;}touch();},true);
post({t:"ready"});})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${appCsp(o.transport)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style><script>${bridge}</script><script>${APP_KIT_JS}</script></head><body>${a.html}</body></html>`;
}
