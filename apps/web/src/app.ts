// The phone app's state and actions (the views read it and call these). One store, one socket.
import { onWbFrame } from "./workbench-ask.ts";
import { onFileOpenFrame } from "./filelink-ask.ts";
import { onPastFrame, openPast } from "./past.tsx";
import { onDidFrame, openDid } from "./did.tsx";
import type { AgentModels, AgentReason, MemPluginReason, BrainNow, BridgeView, Candidate, ModelChoice, ClientFrame, Place, PlaceChoice, ConnectionReason, ConnectionView, DeviceHarness, DeviceView, DucterFolderView, GhInstallPlan, GitLoginState, MemItem, MemView, OoDetect, Reach, KindDefault, RuleView, ServerFrame, Settings, SettingsPatch, UpdateAllView, UpdateReason } from "@ducter/protocol";
import { MEDIA_LIMITS, TUWA_MCP, WATCH_LIVE, type MediaRef, type FileOpenError } from "@ducter/protocol";
import { keepLocal, noteFlights, prepare, tooBigWords, upload, type Pic, type ViewerState } from "./media-up.ts";
import { picturesIn } from "./media-keys.ts";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import type { View } from "@ducter/protocol/src/session.ts";
import { Api, Connection, deviceName, myShape, type ConnStatus, type Me, wsUrl } from "./conn.ts";
import { detectLang, langOfText, strings, TABLE_LANGS, type Handheld, type Lang, type Strings, type TableLang } from "./i18n.ts";
import { languageOfTexts, normalizeTag } from "@ducter/protocol/src/lang.ts";
import { pushState, type PushState } from "./push-client.ts";
import { haptic, inApp, nativeCall, nativeInfo, tellReach, tellWays } from "./native.ts";
import { copy } from "./conv-copy.ts";
import { applyLend, LEND_WAIT_MS, lendError, type LendKind, type LendState } from "./lend-view.ts";
import { attention, doneTodayOf, finished, LANE, laneOf, looksSecret, olderPage, placeOf, Store, title, windowAsk, type DecisionState, type Entry } from "./store.ts";
import { harnessName, learnModelLabels, modelName, shownDeviceName, spoken, withoutStaleAgentUpdate, withoutStaleFailure } from "./format.ts";
import { canFillNow, wideNow } from "./fold.ts";
import { kindOf, navMove } from "./nav.ts";
import { forgetGlance, keepEvents, saveGlance, type Glance } from "./glance.ts";
import { gotKeys } from "./media-fresh.ts";
import { keepDraft, readDraft } from "./follow.ts";
import type { AccountUsage, LogEvent, PartnerAsk, ReplyWant } from "@ducter/protocol";
import { DEFAULT_PARTNER, needsAcross, type PartnerInfo, type PartnerLook } from "@ducter/protocol/src/partners.ts";

/** D309: the partner whose conversation this device shows, kept on this device (another may show another). */
const PARTNER_KEY = "ducter.partner";
let lastPartner = DEFAULT_PARTNER;
export function savedPartner(): string {
  try {
    return localStorage.getItem(PARTNER_KEY) || lastPartner;
  } catch {
    return lastPartner;
  }
}
function savePartner(id: string) {
  lastPartner = id;
  try {
    if (id === DEFAULT_PARTNER) localStorage.removeItem(PARTNER_KEY);
    else localStorage.setItem(PARTNER_KEY, id);
  } catch {}
}

/** D236: what the composer replies to: the message (a find or a part of it) and how its imprint reads. */
export interface Replying {
  seq: number;
  findId?: string;
  part?: string;
  from: "you" | "partner";
  quote: string;
  pics?: number;
}
export const wantOf = (r: Replying): ReplyWant => ({ seq: r.seq, ...(r.findId ? { findId: r.findId } : {}), ...(r.part ? { part: r.part } : {}) });

/** The most a cursor replay sends at once (core's ws.ts REPLAY_MAX). */
const REPLAY_MAX = 5000;
/** D284: an opened task's newest window, each older page after it, and how far the background pages. */
export const HISTORY_FIRST = 200;
export const HISTORY_PAGE = 300;
export const HISTORY_LIMIT = 2000;

/** An iPad says "this iPad" where a phone says "this phone" (D176). */
/** D176, D330: what this browser is in the copy's own words: an iPad, a phone, or a computer. */
export const HANDHELD: Handheld = typeof navigator === "undefined" ? "phone" : deviceName().name.startsWith("iPad") ? "ipad" : /^(ios|android)/.test(deviceName().platform) ? "phone" : "computer";

/** full (D184): wide, the level takes the whole screen as the Mac shows it, instead of standing
 *  beside the conversation. A phone ignores it. */
export type Route = { name: "conv" } | { name: "onhand"; full?: boolean } | { name: "task"; id: string; full?: boolean };

/** #onhand, #onhand/full, #task=<id>, #task=<id>/full (an id is encoded, so it holds no "/"). */
export function routeHash(r: Route): string {
  const full = r.name !== "conv" && r.full ? "/full" : "";
  return r.name === "onhand" ? `#onhand${full}` : r.name === "task" ? `#task=${encodeURIComponent(r.id)}${full}` : "";
}

const isFull = (r: Route) => r.name !== "conv" && !!r.full;
/** A move that changes the layout (beside ↔ whole screen) on a wide screen. */
export const morphs = (a: Route, b: Route) => isFull(a) !== isFull(b) && wideNow();

/** Runs a layout change inside a view transition where there is one: the panes slide to their new
 *  places (static/app.css, ::view-transition-*). Without one, or under reduced motion, at once. */
export function morph(apply: () => void) {
  const d = typeof document === "object" ? (document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown }) : undefined;
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!d?.startViewTransition || still) return apply();
  d.startViewTransition(() => {
    apply();
    // Preact renders the new layout in a microtask (A.changed → the app's state); a timer runs
    // after it. Never wait for a frame here: WebKit holds frames while this callback runs, so a
    // requestAnimationFrame never came and every change waited out WebKit's 4 s timeout (D209).
    return new Promise<void>((r) => setTimeout(r, 0));
  });
}
/** Settings (D150) is a list of sections; page is the one pushed ("" is the list). */
export type SettingsPage = "" | "partner" | "memory" | "peers" | "notify" | "accounts" | "todos" | "chats" | "autofill" | "devices" | "phone";
export type Sheet = { kind: "decision"; id: string } | { kind: "settings"; page?: SettingsPage } | { kind: "newtask" } | { kind: "switch" } | { kind: "past" } | { kind: "did" } | { kind: "recall"; seq: number } | { kind: "learned" } | { kind: "pile" } | null;

/** 开一件事 / New task's sheet (D128): what the user chose and typed, and how starting went. */
export interface NewTaskDraft {
  words: string;
  /** D285: 带着它开新任务 / New task from this: the earlier task its brief carries findings from. */
  from?: { taskId: string; title: string };
  /** D341: picked from 待办来源 / To-do sources: the task is bound to this to-do. */
  item?: import("@ducter/protocol").SourceItemRef;
  placeKey: string; // "" = the first offered; "none" = no particular place
  prefill?: Place;
  branch: string; // "" = the repo's default
  branchOpen: boolean;
  pick: string; // a candidate key; "" = the top one
  sending: string; // the clientId in flight
  err: string;
  computer?: string; // D157: the computer chosen (a device id); "" = the suggested one
  computerOpen?: boolean;
  // D185: the one list open under the pills ("place", "who", "when"; the branch and computer
  // keep their own flags), when it starts ("" now, "at", "every", "when", "until") with its
  // day (0 today, 1 tomorrow, 2 the day after), time, schedule (0 every day, 1 weekdays,
  // 2 weekly on weekday, 3 every few hours, hours an index of EVERY_HOURS) and condition;
  // again keeps the sheet after a start (⇧⌘⏎), started says what just started.
  list?: string;
  when?: "" | "at" | "every" | "when" | "until";
  atDay?: number;
  atTime?: string;
  every?: number;
  weekday?: number;
  hours?: number;
  condition?: string;
  again?: boolean;
  started?: string;
  startedTask?: string;
  // D202: the model and effort picked for the chosen agent ("" = the remembered one, else the
  // suggestion and the model's own default); pending: an agent on another computer waiting for a
  // folder there (the place list then shows only that computer's, placeOnly its device id).
  model?: string;
  effort?: string;
  pending?: string;
  placeOnly?: string;
  // D203: 找一个文件夹… / Find a folder… (list "browse"): the computer looked through (a device
  // id), the folder asked for, the answer once it lands; adding: the clientId of its project_add;
  // wantBranch: the branch to keep once the copy picked on another computer says its branches.
  browse?: { device: string; cid: string; path?: string; res?: Extract<ServerFrame, { t: "folder_browse_result" }> };
  adding?: string;
  // D204: 从 Git 地址加… / Add from a Git address… (list "clone"): the computer it clones on (a
  // device id), the address typed, the clientId of the clone in flight (busy), and why it failed.
  // D272: failedAccess: the last clone failed for access (a sign-in then retries it); signedIn: the
  // one-time line after a sign-in there.
  clone?: { device: string; address: string; cid?: string; err?: string; failedAccess?: boolean; signedIn?: string };
  wantBranch?: string;
  // D272: 加一个文件夹… on that computer (list "add"): the three ways; 新建一个文件夹 (list "newfolder").
  add?: { device: string };
  newFolder?: { device: string; name: string; cid?: string; err?: string };
  // D272: where each computer stands with GitHub (key: the frame's device, "" for the home), and the
  // sign-in panel (list "gh"): its clientId, the code and link once gh gives them, the token mode.
  gh?: Record<string, GitLoginState>;
  ghPanel?: GhPanel;
}

/** D272/D345: which sign-in panel: New task's, or Settings › 待办来源's 连上 GitHub. */
export type GhWhich = "nt" | "todos";

/**
 * D272: a GitHub sign-in panel in flight: its clientId, the code and link once gh gives them, the
 * token mode. D345: for "todos" (连上 from 待办来源: signed in, the home adds GitHub); install: no gh
 * on the home and how Ducter would put it there; installing: it is being put there; reason: why the
 * last try failed (each with its own next step); sending: a pasted token is with gh.
 */
export interface GhPanel {
  device: string;
  cid: string;
  for?: "todos";
  code?: string;
  url?: string;
  err?: string;
  nogh?: boolean;
  install?: GhInstallPlan;
  installing?: { how: GhInstallPlan["how"]; where: string; progress?: number };
  reason?: GitLoginState["reason"];
  /** What this panel last asked of the home (再试一次 asks it again). */
  via?: "install" | "start";
  token?: boolean;
  tokenText?: string;
  sending?: boolean;
  copied?: boolean;
}

/** D185: the "every few hours" the sheet offers. */
export const EVERY_HOURS = [1, 2, 4, 8];
const WHO = "ducter.newtask.who";
const TUNE = "ducter.newtask.tune";

/** A typed time as "HH:MM" (9, 9:00, 21:30, 9.30, 9：30), or "" when it isn't one. */
export function parseClock(s: string | undefined): string {
  const m = /^\s*(\d{1,2})(?:\s*[:.：]\s*(\d{2}))?\s*$/.exec(s ?? "");
  if (!m) return "";
  const h = Number(m[1]), mm = Number(m[2] ?? 0);
  return h > 23 || mm > 59 ? "" : `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const tzNow = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const placeKey = (p: Place): string =>
  p.kind === "repo" ? `${p.device || "local"} ${p.repoPath.replace(/\/+$/, "")}` : p.kind === "folder" ? `${p.device || "local"} ${p.path.replace(/\/+$/, "")}` : "none";
/** A home path as ~/…: shorter, and no user name on screen. ~ is the home folder of the computer
 *  the path is on, read from the path itself (D197); the Mac app uses the same rule. */
export const tilde = (p: string) => p.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, "~");
/** D272: an address GitHub answers (or the field still empty): the GitHub sign-in line shows for it. */
export const ntGitHubish = (a: string) => !a.trim() || /github\.com/i.test(a) || /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]+$/.test(a.trim());
/** A place's second line in the New task list: its path, and its computer when the places span more than one (D197): two facts, drawn apart (D291). */
export const placeLine = (p: PlaceChoice): { path: string; computer: string } => {
  const path = p.place.kind === "repo" ? p.place.repoPath : p.place.kind === "folder" ? p.place.path : "";
  return path ? { path: tilde(path), computer: p.computer ?? "" } : { path: "", computer: "" };
};
export const candKey = (c: Candidate) => `${c.device ? c.device + "|" : ""}${c.harness}/${c.model ?? ""}`;
/** D202: one agent on one computer (the Who list has one row each; its model is picked under it). */
export const agentKey = (c: Candidate) => `${c.device ? c.device + "|" : ""}${c.harness}`;
/** An agent key from what was remembered (before D202 it held the model too). */
const asAgentKey = (k: string) => k.replace(/\/.*$/, "");
/** D202: an effort level in the user's words (低 / Low …); a level Ducter has no word for, as the agent says it. */
export const effortWord = (L: Strings, e: string) => {
  const w = L.t(`effort.${e}`);
  return w === `effort.${e}` ? e : w;
};
/** D202: the last model and effort picked for each AI agent on this client. */
type Tune = Record<string, { model?: string; effort?: string }>;
let lastTune: Tune = {};
const rememberedTune = (): Tune => {
  try {
    const v = JSON.parse(localStorage.getItem(TUNE) ?? "null");
    return v && typeof v === "object" ? v : lastTune;
  } catch {
    return lastTune;
  }
};
/** D202: same repo on another computer: by its origin when both know one, else (neither does) by the folder's exact name. */
export const sameRepo = (a: PlaceChoice, b: PlaceChoice) => {
  if (a.place.kind !== "repo" || b.place.kind !== "repo") return false;
  if (a.remote || b.remote) return !!a.remote && a.remote === b.remote;
  const base = (p: PlaceChoice) => (p.place.kind === "repo" ? p.place.repoPath.replace(/\/+$/, "").split("/").pop() : "");
  return !!base(a) && base(a) === base(b);
};
// Kept here too: storage can be missing or refuse (a private window).
let lastWho = "";
const rememberedWho = () => {
  try {
    return localStorage.getItem(WHO) ?? lastWho;
  } catch {
    return lastWho;
  }
};
const freshDraft = (words = ""): NewTaskDraft => ({ words, placeKey: "", branch: "", branchOpen: false, pick: asAgentKey(rememberedWho()), sending: "", err: "", when: "", atDay: 1, atTime: "9:00", every: 0, weekday: 1, hours: 1, condition: "" });

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export const READ_AFTER_MS = 1200;

/** This phone's own interface language (Settings sheet): "auto" follows the system, then the user's words. */
export type UiLang = "auto" | TableLang;
const UI_LANG = "ducter.lang";
export function savedUiLang(): UiLang {
  try {
    const v = localStorage.getItem(UI_LANG);
    return (TABLE_LANGS as readonly (string | null)[]).includes(v) ? (v as TableLang) : "auto";
  } catch {
    return "auto";
  }
}
export const UNDO_MS = 10_000;
/** D262: the longest a first open waits on the home before showing its words. */
export const SETTLE_MS = 1500;

/** D262: the language this page last followed from the person's words, so the next open starts in
 *  it instead of switching once the conversation arrives. */
const SPOKE = "ducter.spoke";
export function savedSpoke(): Lang | undefined {
  try {
    return normalizeTag(localStorage.getItem(SPOKE)); // D292: any language
  } catch {
    return undefined;
  }
}
function saveSpoke(l: Lang) {
  try {
    if (localStorage.getItem(SPOKE) !== l) localStorage.setItem(SPOKE, l);
  } catch {}
}
/** The language a page opens in: the one chosen on this device, else the one it followed last, else the system's. */
export function startLang(ui: UiLang = savedUiLang()): Lang {
  return ui === "auto" ? (savedSpoke() ?? detectLang()) : ui;
}

/** 对话里的细节 / Details in the conversation (D104): folded (the default) or shown, per client. */
const DETAILS = "ducter.details";
export type DetailsPref = "folded" | "shown";
export function savedDetails(): DetailsPref {
  try {
    return localStorage.getItem(DETAILS) === "shown" ? "shown" : "folded";
  } catch {
    return "folded";
  }
}
export const DONE_GLOW_MS = 6_000;

/** How long the live view waits for its first page before it says the browser didn't answer. */
export const LIVE_STUCK_MS = 40_000;

class AppState {
  S = new Store();
  uiLang: UiLang = savedUiLang();
  details: DetailsPref = savedDetails();
  /** Living messages whose gathered asks the person opened (D104). */
  moreAsks = new Set<number>();
  /** When this client sent the message it is waiting on (the Presence clock before a step). */
  thinkingSince?: number;
  /** Messages whose Details the person flipped from the default (D104). */
  flipped = new Set<string>();
  L: Strings = strings(startLang(this.uiLang), HANDHELD);
  localeSet = this.uiLang !== "auto";
  /** The partner's settings (D71), once the server sent them; mem is what it remembers. */
  settings?: Settings;
  mem?: MemView;
  /** D321: Settings › 记忆's search: what was asked, and what Mem found for it. */
  memQuery = "";
  memFound?: { q: string; ok: boolean; items: MemItem[] };
  /** D205: the persona's own Bridge connection, when the home's nmem can make one (or needs updating). */
  bridge?: BridgeView;
  /** D205: 断开 asks once more before it runs (a disconnected connection may need Mem to make again). */
  bridgeConfirm = false;
  /** D332: the AI agents the person runs themselves on the home (their records' file times), from the settings frame. */
  ownAgents: ("claude-code" | "codex" | "pi")[] = [];
  /** D332: 和你的其他 agent 通信 was opened from the Partner page's one line, so Settings lists it for now. */
  peersAsked = false;
  /** What the partner thinks with right now (D150), and the computer Ducter runs on. */
  brainNow?: BrainNow;
  homeName?: string;
  /** Who does the tasks (D89): Your rules, this Mac's AI agents (from devices), and who could
   *  do the task whose Switch who does it is open. */
  rules?: RuleView[];
  /** D370: the built-in default per kind of work, from the rules frame. */
  ruleDefaults: KindDefault[] = [];
  agents?: DeviceHarness[];
  /** D148: every device and every phone or window that reaches Ducter (Settings › Your devices), and
   *  why the last update or rename from here was refused. */
  devices?: DeviceView[];
  /** D151: the signed-in sites of Ducter's browser on the home, once asked for. */
  sites?: Extract<ServerFrame, { t: "browser_sites" }>;
  /** D191: 密码和银行卡 / Passwords & cards (D336; Autofill in code) (names, last four, where used; never a secret). */
  saved?: Extract<ServerFrame, { t: "saved" }>;
  /** The last save or remove from this window failed (its form shows why). */
  savedFailed = false;
  private savedDone?: () => void;
  reach?: Reach;
  /** D293: the ways to reach the home and its key, as it last said them (right after every welcome). */
  ways?: Extract<ServerFrame, { t: "ways" }>;
  /** D224: 全部更新 / Update all: what it would do, and the plan the home runs (devices frame). */
  updateAll?: UpdateAllView;
  /** The last 全部更新 that didn't start, and why. */
  updateAllAnswer?: "nothing" | "running" | "failed";
  deviceAnswer?: { device: string; reason: UpdateReason | "name_taken" | "failed" };
  /** D156: the last agent update that was refused, on its row. */
  agentAnswer?: { device: string; harness: string; reason: AgentReason };
  /** D363: an agent_setup the device couldn't take (it's away, or its Ducter is too old). */
  setupAnswer?: { device: string; reason: "away" | "unknown" | "failed" };
  /** D366: a mem_setup the computer couldn't take. */
  memSetupAnswer?: { device: string; reason: "away" | "unknown" | "failed" };
  /** D169: the last 装上 / Install of Nowledge Mem that didn't start, and why. */
  memAnswer?: { device: string; harness: string; reason: MemPluginReason };
  /** D228: why 让 Ducter 帮我设好 didn't start (no agent signed in here, …). */
  anywhereAnswer?: string;
  /** D347: 加一台做事的电脑 / Add a computer for tasks, open in 你的设备 while defined. */
  lend?: LendState;
  candidates = new Map<string, Candidate[]>();
  /** D288: each agent's account usage limits, as the home last answered (asked: when we asked). */
  accountUsage = new Map<string, { usage?: AccountUsage; why?: string; asked: number }>();
  /** New task (D128): what the sheet offers (places, who could), as last sent; the draft. */
  newTaskOptions?: { places: PlaceChoice[]; candidates: Candidate[]; models?: AgentModels[]; ducterFolders?: DucterFolderView[] };
  nt: NewTaskDraft = freshDraft();
  switchFor = "";
  switching = "";
  /** The user's connections (D96) and what oo is set up with, once asked for. */
  connections?: ConnectionView[];
  oo?: OoDetect;
  /** A connection being checked (the add button waits). */
  connecting = false;
  /** D158: the last check's refusal, shown on the Accounts card in the failed look (never a toast). */
  connRefusal?: ConnectionReason;
  /** D193: the device sign-in in progress (or how it just ended), and the phone card's last refusal. */
  signIn?: import("@ducter/protocol").SignInView;
  voiceAnswer?: string;
  /** D218: the own-number card, and its last refusal (a word: number, key, busy). */
  ownPhone?: import("@ducter/protocol").OwnPhoneView;
  ownAnswer?: string;
  /** D166: 看了哪些 / What it read today, by connection, once asked for. */
  connReads = new Map<string, import("@ducter/protocol").ReadLine[]>();
  /** D226: 今天看了什么 / What it looked at today (asked when the switch's detail opens). */
  proactiveDay: import("@ducter/protocol").ProactiveDay | undefined;
  route: Route = { name: "conv" };
  sheet: Sheet = null;
  /** D309: every partner on the home (absent: a home without them, or one only). */
  partners?: PartnerInfo[];
  /** D309: the partner this page shows; the hello asks for it. */
  partnerShown = savedPartner();
  /** D309: a partner_add or partner_set on its way, and what came back for it. */
  partnerAsk?: { cid: string; kind: "add" | "set"; name?: string; error?: string };
  /** D309: when a partner was last added from this page (Settings' form closes). */
  partnerAddedAt = 0;
  /** D151: the live view of Ducter's browser, while the user signs in (never stored). */
  live?: {
    decisionId: string;
    site: string;
    state: "opening" | "open";
    id?: string;
    src?: string;
    seq?: number;
    w?: number;
    h?: number;
    url?: string;
    title?: string;
    try?: boolean;
    browser?: import("@ducter/protocol").BrowserAbout;
    /** No page LIVE_STUCK_MS after it was asked for: the view says so, with 再试一次. */
    stuck?: boolean;
    size: { width: number; height: number; scale?: number };
    /** D190: 看它上网 / Watch it browse: the task whose tab this is. */
    watch?: boolean;
    taskId?: string;
    task?: import("@ducter/protocol").LiveTask;
    /** Try it on this computer (a device id); absent = the home's. */
    device?: string;
    /** Whose turn it is, and whether this window holds the user's. */
    turn?: import("@ducter/protocol").LiveTurn;
    here?: boolean;
    /** What the task just did (the watcher's line), and when it came. */
    doing?: import("@ducter/protocol").LiveDoing;
    doingAt?: number;
  };
  status: ConnStatus = "connecting";
  me?: Me;
  api!: Api;
  conn?: Connection;
  base!: URL;
  /** Messages sent and not yet echoed. pics (D206): pictures still going up; failed: one didn't, Retry sends. */
  pending: { clientId: string; text: string; pics?: Pic[]; failed?: boolean; reply?: Replying }[] = [];
  /** D236: the one message the composer replies to (its imprint sits above the field). */
  replying?: Replying;
  /** D206: pictures picked for a message not sent yet: "" the conversation, a task id, "new" the New task card. */
  picks = new Map<string, Pic[]>();
  /** D206: the picture viewer, when open. */
  viewer?: ViewerState;
  /** D239: the file viewer, when open: a file a task showed, read inside Ducter. */
  fileView?: { ref: MediaRef; from?: DOMRect };
  /** D356: a file a link names, while the home fetches it (then fileView), or why it couldn't. */
  fileLink?: { path: string; taskId?: string; n: number; error?: FileOpenError; message?: string };
  /** D254: what is typed to the partner survives the app being closed (a phone's web view is
   *  often let go in the background): kept in this browser until it is sent or cleared. */
  private draftNow = readDraft();
  get draft() {
    return this.draftNow;
  }
  set draft(v: string) {
    this.draftNow = v;
    keepDraft(v);
  }
  taskDrafts = new Map<string, string>();
  replyOpen = new Set<string>();
  replyDraft = new Map<string, string>();
  held?: { taskId?: string; text: string };
  /** Esc asked to pause this opened task (D210); a second Esc within 3 s pauses it. */
  escAt?: { id: string; at: number };
  toasts: Toast[] = [];
  historyAsked = new Set<string>();
  livingAway = new Map<number, boolean>();
  readSent = 0;
  doneAt = 0;
  dropped?: { id: string; until: number };
  push: PushState = "unsupported";
  flash?: string; // a decision to highlight once (opened from a notification)
  private nextClient = 0;
  /** merge / open_pr written to this socket and not yet answered (task -> action). */
  private actSent = new Map<string, string>();
  /** Those of the socket that went away, settled from the Log once the replay is in. */
  private inDoubt?: Map<string, string>;
  private nextToast = 0;
  private listeners = new Set<() => void>();
  private readTimer?: ReturnType<typeof setTimeout>;

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** D217: set by phone-use.tsx; takes every phone_* frame. */
  onPhoneFrame?: (f: import("@ducter/protocol").PhoneServerFrame) => void;
  /** D276: set by channels.tsx; takes the channels and channel_result frames. */
  onChannelFrame?: (f: import("@ducter/protocol").ChannelServerFrame) => void;
  /** D341: 待办来源 / To-do sources (todos.tsx keeps its own state). */
  onSourcesFrame?: (f: import("@ducter/protocol").SourcesServerFrame) => void;
  /** D357: a to-do handed over from On hand (todos.tsx): true when the answer was its. */
  onHanded?: (f: Extract<ServerFrame, { t: "task_new_result" }>) => boolean;
  /** D345: Settings › 待办来源's 连上 GitHub in flight, and the account it just connected as (said once on GitHub's card). */
  ghTodo?: GhPanel;
  ghConnected?: string;
  /** D238: this page as its phone's link (handset.tsx). */
  onHandsetFrame?: (f: import("@ducter/protocol").HandsetServerFrame) => void;
  onHandsetWelcome?: () => void;
  /** D306: after each frame, the glances the app shows are kept true (ambient.tsx). */
  onAmbient?: () => void;
  changed() {
    for (const fn of this.listeners) fn();
    this.scheduleRead();
    this.reloadIfStale();
  }

  /** The home's version, when it isn't the one this page was built with (welcome.version). */
  staleFor = "";

  /**
   * The home updated while this page stayed open (a phone app in the background, 2026-11-11: the
   * 0.0.17 card on a 0.0.18 home had no 找一个文件夹… or 从 Git 地址加…): load the home's page
   * again, once nothing would be lost (no sheet, no live view, no unsent words), and only once per
   * version, so a page the home still serves old can't reload in a loop.
   */
  reloadIfStale() {
    if (!this.staleFor || this.sheet || this.live?.id || this.draft.trim()) return;
    if (typeof location === "undefined" || typeof sessionStorage === "undefined") return;
    try {
      if (sessionStorage.getItem("ducter.reloadedFor") === this.staleFor) return;
      sessionStorage.setItem("ducter.reloadedFor", this.staleFor);
    } catch {
      return;
    }
    location.reload();
  }

  /** D262: when this page started; a first open with nothing kept settles for at most SETTLE_MS. */
  startedAt = Date.now();

  /** D262: a first open on this device knows neither the conversation nor its language: until the
   *  home's first answer lands (at most SETTLE_MS) it shows only the calm ground, never the system's
   *  language switching to the person's. Any later open paints its kept screen at once (D209). */
  settling(now = Date.now()): boolean {
    if (this.fromGlance || this.uiLang !== "auto" || savedSpoke()) return false;
    if (now - this.startedAt >= SETTLE_MS) return false;
    if (!this.S.welcomed) return true;
    return this.S.headSeq > 0 && this.S.channel.length === 0;
  }

  start(base: URL, api: Api, me: Me, token: () => string | undefined) {
    this.base = base;
    if (this.settling()) setTimeout(() => this.changed(), SETTLE_MS);
    this.api = api;
    this.me = me;
    if (me.personaName) this.S.personaName = me.personaName;
    // D224: reloaded at the end of 全部更新: back where the list was.
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("ducter.reopen") === "devices") {
        sessionStorage.removeItem("ducter.reopen");
        this.sheet = { kind: "settings", page: "devices" };
      }
    } catch {}
    this.conn = new Connection(
      wsUrl(base),
      token,
      () => ({ t: "hello", ...(this.partnerShown !== DEFAULT_PARTNER ? { persona: this.partnerShown } : {}), ...(this.S.cursor > 0 ? { cursor: this.S.cursor } : {}), locale: this.L.locale, ...(zone() ? { tz: zone() } : {}), client: "web", ...((s) => (s ? { shape: s } : {}))(myShape()), ...((n) => (n?.version ? { version: n.version } : {}))(nativeInfo()) }),
      (f) => this.receive(f),
      (s) => {
        this.status = s;
        // D209: the app, which opened this page from its cache, learns whether the home answers.
        if (s !== "connecting" && inApp()) tellReach(s === "connected");
        this.changed();
      },
    );
    this.conn.onWritten = (f) => {
      if (f.t === "task_action" && (f.action === "merge" || f.action === "open_pr")) this.actSent.set(f.taskId, f.action);
    };
    this.conn.start();
    // D209: going to the background keeps the last screen at once (the app may not come back).
    if (typeof document === "object") document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && this.keepGlance(true));
    if (typeof addEventListener === "function") addEventListener("pagehide", () => this.keepGlance(true));
    void this.refreshPush();
  }

  async refreshPush() {
    this.push = await pushState().catch(() => "unsupported" as PushState);
    this.changed();
  }

  /** Work over time (D112-D114, D279): Check now / Stop checking, Pause / Resume / End, Stop the loop. */
  waiterAction(waiterId: string, action: "look" | "cancel" | "rearm" | "handoff") {
    this.send({ t: "waiter_action", waiterId, action });
  }
  routineAction(routineId: string, action: "pause" | "resume" | "end") {
    this.send({ t: "routine_action", routineId, action });
  }
  untilAction(taskId: string) {
    this.send({ t: "until_action", taskId, action: "stop" });
  }

  send(f: ClientFrame) {
    this.conn?.send(f);
  }

  // ---------- the last screen, kept on this device (D209, glance.ts) ----------

  /** The channel events this page holds, by seq: what the glance keeps. */
  private kept = new Map<number, LogEvent>();
  /** The device the glance belongs to ("local" for this machine's own page). */
  glanceDevice = "";
  /** Painted from the glance and not yet caught up with the home (the replay closes it). */
  fromGlance = false;
  private glanceTimer?: ReturnType<typeof setTimeout>;

  /** Paints the last screen from the glance before the socket opens: the Store as the last replay
   *  left it, its cursor where the glance ends, so hello asks only for what is newer. */
  restore(g: Glance) {
    // D309: the last screen was another partner's conversation: start from this one's replay.
    if (g.persona && g.persona !== this.partnerShown) return;
    this.S.apply({ t: "welcome", persona: g.persona, personaName: g.personaName, headSeq: g.headSeq } as ServerFrame);
    this.S.welcomed = false; // nothing is sent before the home says welcome
    this.S.apply({ t: "events", events: g.events });
    if (g.onHand) this.S.apply({ t: "on_hand", onHand: g.onHand });
    if (g.first) this.S.apply({ t: "first_screen", first: g.first });
    for (const ev of g.events) {
      this.kept.set(ev.seq, ev);
      // Seen before the app closed: never "arrived while away".
      if (ev.kind === "living_msg") this.livingAway.set(ev.seq, false);
    }
    this.fromGlance = g.events.length > 0 || !!g.onHand;
    // D262: the kept conversation already says which language to speak: the first frame is in it.
    this.followUserLanguage();
  }

  /** Keeps the screen as it is now, a moment after it settles (and at once when the page hides). */
  keepGlance(now = false) {
    if (!this.glanceDevice || !this.S.persona) return;
    clearTimeout(this.glanceTimer);
    const save = () => {
      this.glanceTimer = undefined;
      const events = keepEvents(this.kept.values());
      // The map stays bounded: what the glance dropped is gone from it too.
      if (this.kept.size > events.length + 200) this.kept = new Map(events.map((e) => [e.seq, e]));
      saveGlance({
        v: 1,
        device: this.glanceDevice,
        persona: this.S.persona,
        personaName: this.S.personaName,
        headSeq: this.S.headSeq,
        events,
        ...(this.S.onHand ? { onHand: this.S.onHand } : {}),
        ...(this.S.first ? { first: this.S.first } : {}),
        ...(this.me ? { me: this.me } : {}),
        savedAt: Date.now(),
      });
    };
    if (now) save();
    else this.glanceTimer = setTimeout(save, 1200);
  }

  private buildChecked = false;
  /**
   * D209: the apps open this page from their cache first (no round trip before the first frame),
   * so once caught up the page asks its home for the page again: a page naming other code
   * (a home updated, or rebuilt under the same version) loads the home's, once nothing would be
   * lost (reloadIfStale). The answer also refreshes the cached page for the next open.
   */
  async checkBuild(fetcher: typeof fetch = fetch) {
    if (this.buildChecked || !inApp() || typeof document !== "object") return;
    this.buildChecked = true;
    const mine = /[?&]v=(\w+)/.exec(document.querySelector<HTMLScriptElement>('script[src*="app.js"]')?.src ?? "")?.[1];
    if (!mine) return;
    try {
      const html = await (await fetcher(new URL("app", this.base), { cache: "no-cache" })).text();
      const now = /app\.js\?v=(\w+)/.exec(html)?.[1];
      if (now && now !== mine) {
        this.staleFor ||= `build ${now}`;
        this.reloadIfStale();
      }
    } catch {}
  }

  /** Forgets everything this page holds (a Log that started over, a device revoked). */
  private startOver() {
    this.S = new Store();
    this.kept.clear();
    this.fromGlance = false;
    forgetGlance();
  }

  receive(f: ServerFrame) {
    // A cursor replay as long as the home sends at once: the glance is too old to catch up from.
    // Start from the home's own fresh replay instead (it ends with on_hand, like any replay).
    if (f.t === "events" && this.fromGlance && f.events.length >= REPLAY_MAX) {
      this.startOver();
      this.conn?.rehello();
      return;
    }
    // D309: the home shows another partner than the one this page holds (a switch elsewhere, one
    // gone): forget this one's conversation and hear that one's from the start.
    if (f.t === "welcome" && this.S.persona && f.persona !== this.S.persona) {
      this.startOver();
      this.pending = [];
      this.conn?.rehello();
      return;
    }
    if (this.S.stale(f)) {
      // The Log started over (its data was reset): forget everything and say hello from scratch.
      this.startOver();
      this.pending = [];
      this.actSent.clear();
      this.inDoubt = undefined;
      this.historyAsked.clear();
      this.livingAway.clear();
      this.route = { name: "conv" };
      this.conn?.rehello();
    }
    if (f.t === "live" || f.t === "live_frame" || f.t === "live_turn" || f.t === "live_doing") return this.liveFrame(f);
    // D217: Ducter's phone (phone-use.tsx keeps its own state).
    if (f.t.startsWith("phone_")) return void this.onPhoneFrame?.(f as import("@ducter/protocol").PhoneServerFrame);
    // D276: 聊天软件 / Chat apps (channels.tsx keeps its own state).
    if (f.t === "channels" || f.t === "channel_result") return void this.onChannelFrame?.(f);
    if (f.t === "sources" || f.t === "source_items_result" || f.t === "source_result" || f.t === "pile_items_result" || f.t === "pile_result") return void this.onSourcesFrame?.(f);
    // D238: the person's own phone (handset.tsx relays the home's calls to this phone's app).
    if (f.t.startsWith("handset_")) return void this.onHandsetFrame?.(f as import("@ducter/protocol").HandsetServerFrame);
    if (f.t === "browser_sites") {
      if (f.ok === false && f.message) this.toast(f.message);
      return void ((this.sites = f), this.changed());
    }
    if (f.t === "saved") {
      this.saved = f;
      if (f.ok === true) (this.savedFailed = false), this.savedDone?.(), (this.savedDone = undefined);
      else if (f.ok === false) this.savedFailed = true;
      return void this.changed();
    }
    if (f.t === "settings") return this.applySettings(f);
    // D321: only the answer to what is asked now (a later word replaced an earlier one).
    if (f.t === "mem_found") return void (f.q === this.memQuery && ((this.memFound = { q: f.q, ok: f.ok, items: f.items }), this.changed()));
    if (f.t === "partners") return this.applyPartners(f);
    if (f.t === "rules") return void ((this.rules = f.rules), (this.ruleDefaults = f.defaults ?? []), this.changed());
    if (f.t === "ways") {
      this.ways = f;
      if (inApp()) tellWays({ ways: f.ways, ...(f.key ? { key: f.key } : {}), ...(f.fp ? { fp: f.fp } : {}) });
      return void this.changed();
    }
    if (f.t === "devices") {
      const home = f.devices.find((d) => d.home);
      // A failure the device (or the agent's copy) has moved past is dropped (D167, D156).
      // D291: a name from before shows as the model alone ("iPad · Ducter" → "iPad").
      const devices = f.devices.map((d) => ({ ...d, name: shownDeviceName(d.name), ...(d.update ? { update: withoutStaleFailure(d.update) } : {}), harnesses: d.harnesses.map(withoutStaleAgentUpdate) }));
      learnModelLabels(devices.flatMap((d) => d.harnesses)); // D355: a model in its agent's own words
      this.updateAll = f.updateAll;
      this.afterUpdateAll(f.updateAll);
      return void ((this.agents = devices.find((d) => d.home)?.harnesses ?? home?.harnesses ?? []), (this.homeName = home?.name), (this.devices = devices), (this.reach = f.reach && { ...f.reach, clients: f.reach.clients.map((c) => ({ ...c, name: shownDeviceName(c.name) })) }), this.changed());
    }
    if (f.t === "lend") return void ((this.lend = applyLend(this.lend, f)), this.changed());
    // D358: the code for a phone, a tablet or a window, asked from 加一台设备.
    if (f.t === "pair_code") return void (this.lend?.pair && ((this.lend = { ...this.lend, pair: f }), this.changed()));
    if (f.t === "update_all_result") return void ((this.updateAllAnswer = f.ok || f.reason === "nothing" ? undefined : (f.reason ?? "failed")), this.changed());
    // D228: on with no tunnel made yet starts the guided setup; a setup that couldn't start says why.
    if (f.t === "ability_result" && f.ability === "remote" && f.on && !f.ok && f.reason === "no_address") return void this.beginAnywhere();
    if (f.t === "anywhere_setup_result" && !f.step) return void ((this.anywhereAnswer = f.ok || f.reason === "running" ? undefined : (f.reason ?? "failed")), this.changed());
    if (f.t === "mem_plugin_result") return void ((this.memAnswer = f.ok ? undefined : { device: f.device, harness: f.harness, reason: f.reason ?? "failed" }), this.changed());
    // "Nothing newer" answers a stale view, never a failure: the devices frame that follows has the version there now.
    if (f.t === "mem_setup_result") return void ((this.memSetupAnswer = f.ok ? undefined : { device: f.device, reason: f.reason ?? "failed" }), this.changed());
    if (f.t === "agent_setup_result") return void (f.action !== "look" && ((this.setupAnswer = f.ok ? undefined : { device: f.device, reason: f.reason ?? "failed" }), this.changed()));
    if (f.t === "agent_update_result") return void ((this.agentAnswer = f.ok || f.reason === "no_update" ? undefined : { device: f.device, harness: f.harness, reason: f.reason ?? "failed" }), this.changed());
    if (f.t === "update_result") return void ((this.checkingUpdates = false), (this.deviceAnswer = f.ok || f.update || f.reason === "no_release" ? undefined : { device: f.device, reason: f.reason ?? "failed" }), this.changed());
    if (f.t === "disconnect_result" || f.t === "rename_result") return void ((this.deviceAnswer = f.ok ? undefined : { device: f.device, reason: f.reason === "name_taken" ? "name_taken" : "failed" }), this.changed());
    if (f.t === "candidates") return void (this.candidates.set(f.taskId, f.candidates), this.changed());
    if (f.t === "account_usage") return void (this.accountUsage.set(f.harness, { ...(f.usage ? { usage: f.usage } : {}), ...(f.why ? { why: f.why } : {}), asked: this.accountUsage.get(f.harness)?.asked ?? Date.now() }), this.changed());
    if (f.t === "task_new_options") {
      this.newTaskOptions = { places: f.places, candidates: f.candidates, ...(f.models ? { models: f.models } : {}), ...(f.ducterFolders ? { ducterFolders: f.ducterFolders } : {}) };
      learnModelLabels(f.models);
      // D203: the copy picked on another computer says its branches now: keep the branch it has.
      const want = this.nt.wantBranch;
      const ch = want ? this.chosenPlace() : undefined;
      if (want && ch?.branches) {
        if (ch.branches.includes(want) && want !== ch.defaultBranch) this.nt.branch = want;
        this.nt.wantBranch = "";
      }
      return this.changed();
    }
    if (f.t === "folder_browse_result") {
      const b = this.nt.browse;
      if (b && f.clientId === b.cid) (b.res = f), f.ok && f.path && (b.path = f.path), this.changed();
      return;
    }
    if (f.t === "project_add_result") return this.folderAdded(f);
    if (f.t === "project_clone_result") return this.cloneDone(f);
    if (f.t === "project_new_result") return this.newFolderDone(f);
    if (f.t === "git_login_state") return this.ghState(f);
    if (f.t === "task_new_result") return void (this.onHanded?.(f) || this.newTaskResult(f));
    // D285: 做过的事 / Past tasks (past.tsx).
    // D300: 替你做过的 / Done for you (did.tsx).
    if (f.t === "did_result") return onDidFrame(f);
    if (f.t === "past_result" || f.t === "past_marked" || f.t === "ongoing_result" || f.t === "outside_adopted" || f.t === "outside_hidden") return onPastFrame(f);
    // `ducter open <task>` (D128): show it as if tapped; back returns.
    if (f.t === "open_task") return void ((this.sheet = null), this.go({ name: "task", id: f.taskId }));
    if (f.t === "open_result") return;
    // D214: a workbench answer (workbench.tsx asked for it).
    if (f.t === "wb") return onWbFrame(f as Parameters<typeof onWbFrame>[0]);
    // D356: a linked file the viewer asked for (fileview.tsx).
    if (f.t === "file_open") return onFileOpenFrame(f as Parameters<typeof onFileOpenFrame>[0]);
    if (f.t === "connections") return (this.connections = f.connections), (this.oo = f.oo), (this.ownPhone = f.ownPhone), this.changed();
    if (f.t === "own_phone_result") return (this.ownAnswer = f.reason ?? "phone"), this.changed();
    if (f.t === "connection_reads") return void (this.connReads.set(f.id, f.reads), this.changed());
    if (f.t === "media_keys") return gotKeys(f.mediaKeys);
    if (f.t === "proactive_day") return void ((this.proactiveDay = f.day), this.changed());
    // D193: the device sign-in: the code and link, then done (a toast) or why not.
    if (f.t === "connection_signin") {
      this.signIn = f.signIn;
      if (f.signIn.state !== "waiting") this.connecting = false;
      if (f.signIn.state === "done") (this.signIn = undefined), this.toast(this.L.t("call.signin.done", f.signIn.name));
      return this.changed();
    }
    if (f.t === "phone_voice_result") {
      this.voiceAnswer = f.ok ? undefined : this.L.t(`call.voice.err.${f.reason ?? "provider"}`);
      // The recording page is the provider's own: the owner agrees and records there (D189 (6)).
      if (f.ok && f.url) window.open(f.url, "_blank", "noopener");
      return this.changed();
    }
    if (f.t === "connection_result") {
      this.connecting = false;
      // D158: a refusal stays on the Accounts card in the failed look; an add says what it reads now.
      // D193: signing_in is no refusal: the sign-in panel takes over.
      this.connRefusal = !f.ok && f.reason !== "signing_in" ? f.reason : undefined;
      const added = f.ok && this.connections?.find((c) => c.id === f.id);
      if (added) {
        const r = f.readable;
        const name = added.source === "oo" ? this.L.t("acct.oo.name") : added.name; // never the record name "oo"
        this.toast(
          r && !r.length
            ? this.L.t("acct.added.empty", name)
            : r?.length
              ? this.L.t("acct.added.apps", name, r.map((a) => a.title).join(this.L.t("acct.sep")))
              : this.L.t("acct.added", name),
        );
      }
      return this.changed();
    }
    const before = new Map([...this.S.tasks].map(([id, t]) => [id, attention(t)]));
    this.S.apply(f);
    this.onAmbient?.();
    if (f.t === "task_history" || f.t === "task_index") this.pageHistory(f.taskId);
    for (const [id, t] of this.S.tasks) if (finished(t) && before.has(id) && !["done", "done_claimed", "failed"].includes(before.get(id)!)) this.doneAt = Date.now();
    if (f.t === "action_result") this.actSent.delete(f.taskId);
    // D325: a held message that already went (another window said it, or the turn ended first).
    if (f.t === "error" && f.message.startsWith("task_held:")) this.toast(this.L.t("held.gone"));
    if (f.t === "error" && f.message.startsWith("lend_code:")) (this.lend = lendError(this.lend, f.message)), this.changed();
    if (f.t === "welcome") {
      if (typeof f.version === "string" && f.version !== DUCTER_VERSION) this.staleFor = f.version;
      // D190: a new socket (the phone came back from the background, the link dropped): the old
      // socket's live view closed with it on the home, so the view that's still on screen opens
      // again, the same way (a watch stays a watch; the user's turn ended with the old socket).
      if (this.live?.id) queueMicrotask(() => this.retryLive());
      // D238: a new socket: the phone's app says again what it can do (and whether it holds a loan).
      queueMicrotask(() => this.onHandsetWelcome?.());
      this.readSent = 0;
      // What the old socket left unanswered: actions are settled from the Log after the replay;
      // messages go again, in order (core dedupes them, so none shows or lands twice).
      if (this.actSent.size) this.inDoubt = new Map([...(this.inDoubt ?? []), ...this.actSent]);
      this.actSent.clear();
      // A message whose pictures are still going up goes when they are (afterUpload).
      for (const r of this.S.resends(this.pending.filter((p) => !p.pics || p.pics.every((x) => x.ref)).map((p) => ({ ...p, media: p.pics?.map((x) => x.ref!.id), ...(p.reply ? { reply: wantOf(p.reply) } : {}) })))) this.send(r);
      // D204: a clone in flight goes again with its id: the home answers the same clone, not a second.
      const k = this.nt.clone;
      if (k?.cid) {
        const dev = this.ntDeviceArg(k.device);
        this.send({ t: "project_clone", address: k.address, clientId: k.cid, ...(dev ? { device: dev } : {}) });
      }
      // D272: an open sign-in asks again on the new socket: the code in flight comes back (the
      // computer answers the same sign-in) and its end reaches this socket; else where it stands.
      const g = this.nt.ghPanel;
      if (g && this.nt.list === "gh") {
        const dev = this.ntDeviceArg(g.device);
        this.send({ t: "git_login", action: g.code ? "start" : "status", clientId: g.cid, ...(dev ? { device: dev } : {}) });
      } else if (k && this.nt.list === "clone") this.ntGhStatus(k.device);
      // D345: 连上 GitHub in flight: the install or the code in flight comes back on the new socket.
      const gt = this.ghTodo;
      if (gt && (gt.installing || gt.code)) this.ghSend(gt, gt.installing ? "install" : "start");
      if (this.route.name === "task") this.history(this.route.id, true);
      // Settings are pushed only to sockets that asked: ask again on a new one.
      if (this.settings || this.sheet?.kind === "settings") this.askLoadout();
      // D157: every task says which computer it runs on once there are two: know them.
      else this.send({ t: "devices" });
      if (this.connections || this.sheet?.kind === "settings") this.send({ t: "connections" });
      // D226: the day, and the reading problem that shows without opening, once asked: a
      // restarted home may read again (or no longer).
      if (this.proactiveDay) this.askDay();
    }
    // on_hand closes the replay that follows a welcome.
    if (f.t === "on_hand" && this.inDoubt) this.S.settleInDoubt(this.inDoubt), (this.inDoubt = undefined);
    // D209: the last screen follows what the home sent (on_hand closes a replay: caught up).
    if (f.t === "events") for (const ev of f.events) if (ev.stream === "channel") this.kept.set(ev.seq, ev);
    if (f.t === "on_hand") (this.fromGlance = false), void this.checkBuild();
    if (f.t === "events" || f.t === "on_hand" || f.t === "first_screen" || f.t === "welcome") this.keepGlance();
    if (f.t === "events") for (const ev of f.events) if (!this.livingAway.has(ev.seq) && ev.kind === "living_msg") this.livingAway.set(ev.seq, (ev.seq <= this.S.headSeq && ev.seq > this.S.readUpTo) || (typeof document === "object" && document.hidden));
    this.followUserLanguage();
    this.drainActionResults();
    this.changed();
  }

  applySettings(f: Extract<ServerFrame, { t: "settings" }>) {
    this.settings = f.settings;
    this.mem = f.mem;
    this.bridge = f.bridge;
    this.ownAgents = f.ownAgents ?? [];
    if (f.bridge?.state !== "connected") this.bridgeConfirm = false;
    if (f.bridge?.state !== "elsewhere" && !(f.bridge?.state === "connected" && f.bridge.others?.length)) this.bridgeHere = false;
    this.brainNow = f.brainNow;
    if (f.settings.name && this.showsDefault()) this.S.personaName = f.settings.name; // D309: the default's name
    // D329: an Undo Mem didn't take: said quietly on that line until the next settings frame.
    this.undoFailed = f.undid && !f.undid.ok ? f.undid.seq : undefined;
    if (f.forgot) {
      const title = this.forgetting.get(f.forgot.seq) ?? "";
      this.forgetting.delete(f.forgot.seq);
      this.toast(this.L.t(f.forgot.how === "mem" ? "partner.memory.forgot" : "partner.memory.hidden", title));
    }
    // D304: a correction says whether Nowledge Mem took it too.
    if (f.corrected) this.toast(this.L.t(f.corrected.how === "mem" ? "learned.fixed.mem" : "learned.fixed.here"));
    this.changed();
  }

  /** Opens this phone's Settings sheet, asking for the partner's settings. */
  openSettings(page: SettingsPage = "") {
    this.lend = undefined;
    this.sheet = { kind: "settings", page };
    if (this.S.welcomed) this.askLoadout();
    this.changed();
  }

  /** The settings, Your rules and this Mac's AI agents (each socket asks for itself). */
  askLoadout() {
    this.send({ t: "settings" });
    this.send({ t: "rules" });
    this.send({ t: "devices" });
  }

  /** 换谁来做 / Switch who does it: opens (or closes) the list for a task, asking who could. */
  /** D288: the agent's account limits for the context card (the home reads them at most every few minutes). */
  askAccountUsage(harness: string, fresh = false) {
    const had = this.accountUsage.get(harness);
    if (!fresh && had && Date.now() - had.asked < 60_000) return;
    this.accountUsage.set(harness, { ...(had ?? {}), asked: Date.now() });
    this.send({ t: "account_usage", harness, ...(fresh ? { fresh: true } : {}) });
  }

  /** D354: the agents' own model lists, for the chips under an opened task's composer (once per task opened). */
  private modelsAskedFor = "";
  askTaskModels(taskId: string) {
    // Painted from the glance before the socket opens, a frame would go nowhere: ask after welcome.
    if (this.modelsAskedFor === taskId || !this.S.welcomed) return;
    this.modelsAskedFor = taskId;
    this.send({ t: "task_new_options" });
  }

  openSwitch(taskId: string) {
    if (this.switchFor === taskId) this.switchFor = "";
    // D282: and the agents' own model lists, for the in-place model and effort picker.
    else (this.switchFor = taskId), this.send({ t: "candidates", taskId }), this.send({ t: "task_new_options" });
    this.changed();
  }

  /** 开一件事 / New task (D128): opens the sheet, at a place when given, asking what it offers. */
  openNewTask(at?: Place) {
    this.nt = freshDraft(this.nt.words);
    let ask: Place | undefined;
    if (at?.kind === "none") this.nt.placeKey = "none";
    if (at?.kind === "repo") {
      ask = { kind: "repo", device: at.device, repoPath: at.repoPath };
      this.nt.prefill = ask;
      this.nt.placeKey = placeKey(ask);
      if (at.baseBranch) this.nt.branch = at.baseBranch;
    }
    if (at?.kind === "folder") {
      ask = { kind: "folder", device: at.device, path: at.path };
      this.nt.prefill = ask;
      this.nt.placeKey = placeKey(ask);
    }
    this.sheet = { kind: "newtask" };
    this.send({ t: "task_new_options", ...(ask ? { place: ask } : {}) });
    this.changed();
  }

  /** The app's menu commands and their keys (D176), the Mac's set (D71): ⌘N New task (inside an
   *  opened task, at its place), ⌘1 the conversation, ⌘2 On hand (wide: the whole screen, and
   *  again back to the two panes; D184), ⌘3 your devices, ⌘4 the
   *  partner, ⌘, Settings, ⌘K the composer of the level shown. Unknown names do nothing. */
  /** D244: opens the next (1) or the previous (-1) task in On hand's order (onhand.tsx sets it). */
  walk?: (by: number) => void;

  command(c: string) {
    const r = this.route;
    if (c === "new") {
      if (this.sheet?.kind === "newtask") return;
      const task = r.name === "task" ? this.S.tasks.get(r.id) : undefined;
      return this.openNewTask(task ? placeOf(task) : undefined);
    }
    if (c === "conv") return (this.sheet = null), this.go({ name: c });
    // D244: ⌘⇧] / ⌘⇧[, 下一件事 / 上一件事: the next or the previous task in On hand's order.
    if (c === "next" || c === "prev") return void this.walk?.(c === "next" ? 1 : -1);
    // D300: 替你做过的 / Done for you (the Mac menu).
    if (c === "did") return void (this.sheet?.kind === "did" ? ((this.sheet = null), this.changed()) : openDid());
    // D285: 做过的事 / Past tasks (the Mac's ⌘Y).
    if (c === "past") return void (this.sheet?.kind === "past" ? ((this.sheet = null), this.changed()) : openPast());
    // D216: ⌘O, 打开一件事 / Open a task: the switcher (pressed again, closed).
    if (c === "switch") {
      if (this.sheet?.kind === "newtask") return;
      this.sheet = this.sheet?.kind === "switch" ? null : { kind: "switch" };
      return this.changed();
    }
    if (c === "onhand") {
      this.sheet = null;
      // D184: wide, ⌘2 is the Mac's On hand: the whole screen, and pressed again, back to the two
      // panes. Where it can't take the whole screen (a phone, a tabletop fold), On hand as there.
      if (!canFillNow("onhand")) return this.go({ name: "onhand" });
      return this.go(r.name === "onhand" && r.full ? { name: "conv" } : { name: "onhand", full: true });
    }    if (c === "devices" || c === "partner") return this.openSettings(c);
    if (c === "settings") return this.openSettings();
    if (c === "composer") {
      this.sheet = null;
      if (r.name === "onhand") this.go({ name: "conv" });
      else this.changed();
      requestAnimationFrame(() => document.getElementById(r.name === "task" ? "composer-task" : "composer")?.focus());
    }
  }

  /** The places the sheet offers: the server's, a prefilled one first when it isn't listed. */
  newTaskPlaces(): PlaceChoice[] {
    const places = [...(this.newTaskOptions?.places ?? [])];
    const pre = this.nt.prefill;
    if (pre && (pre.kind === "repo" || pre.kind === "folder") && !places.some((p) => placeKey(p.place) === placeKey(pre)))
      places.unshift({ place: pre, name: (pre.kind === "repo" ? pre.repoPath : pre.path).replace(/\/+$/, "").split("/").pop() ?? "" });
    if (!places.length || places[places.length - 1]!.place.kind !== "none") places.push({ place: { kind: "none" }, name: "" });
    return places;
  }

  chosenPlace(places = this.newTaskPlaces()): PlaceChoice {
    return places.find((p) => this.nt.placeKey && placeKey(p.place) === this.nt.placeKey) ?? places[0]!;
  }

  /** D202: the computer a place is on (a device id): "local" is the home; else the worker by id or name. */
  placeComputer(p: Place): string {
    const dev = p.kind === "repo" || p.kind === "folder" ? p.device || "local" : "";
    if (!dev) return "";
    const ds = this.devices ?? [];
    if (dev === "local") return ds.find((d) => d.home)?.id ?? "local";
    return ds.find((d) => d.id === dev || d.name === dev)?.id ?? dev;
  }

  /** D157: the computer New task starts the task on: a folder's own; else the user's pick, else where the best agent that can start now is. */
  ntComputer(): string {
    const list = this.newTaskOptions?.candidates ?? [];
    const cp = this.chosenPlace().place;
    if ((cp.kind === "repo" || cp.kind === "folder") && list.some((c) => c.device)) return this.placeComputer(cp);
    const pick = this.nt.computer;
    if (pick && (this.devices ?? []).some((d) => d.id === pick)) return pick;
    return list.find((c) => !c.blocked && !c.waits && c.device)?.device ?? (this.devices ?? []).find((d) => d.home)?.id ?? "";
  }

  /**
   * D157, D202: who New task offers, one row per agent: those on the chosen computer that can,
   * then every agent that can't there but can on another computer (elsewhere: picking it moves the
   * folder or the computer with it), then the ones that can't anywhere, greyed with why.
   */
  ntCands(): { list: Candidate[]; elsewhere: Set<string> } {
    const all = this.newTaskOptions?.candidates ?? [];
    const elsewhere = new Set<string>();
    const seen = new Set<string>();
    const firsts = all.filter((c) => !seen.has(agentKey(c)) && !!seen.add(agentKey(c)));
    if (!all.some((c) => c.device)) return { list: firsts, elsewhere };
    const comp = this.ntComputer();
    const here = firsts.filter((c) => c.device === comp);
    const can = new Set(here.filter((c) => !c.blocked).map((c) => c.harness));
    const away: Candidate[] = [];
    for (const c of firsts) {
      if (c.device === comp || can.has(c.harness) || (c.blocked && c.blocked !== "elsewhere") || away.some((x) => x.harness === c.harness)) continue;
      away.push(c);
      elsewhere.add(agentKey(c));
    }
    const moved = new Set(away.map((c) => c.harness));
    return { list: [...here.filter((c) => !c.blocked), ...away, ...here.filter((c) => c.blocked && !moved.has(c.harness))], elsewhere };
  }

  /** Who does it: the user's pick, else the top candidate that can (never one on another computer by itself). */
  chosenCandidate(): { c?: Candidate; picked: boolean } {
    const { list } = this.ntCands();
    const top = list.find((c) => !c.blocked);
    const pick = this.nt.pick ? list.find((c) => !c.blocked && agentKey(c) === this.nt.pick) : undefined;
    if (pick) return { c: pick, picked: !top || agentKey(top) !== this.nt.pick };
    return { c: top, picked: false };
  }

  /** D202: the copy of the chosen repo on that computer, among the places offered. */
  ntCopyOn(device: string, chosen = this.chosenPlace()): PlaceChoice | undefined {
    return this.newTaskPlaces().find((p) => this.placeComputer(p.place) === device && sameRepo(p, chosen));
  }

  /** D203: the computers of the home (and each worker that is reachable); D204: only those that can look and clone (not old). */
  ntBrowsable(old = false): DeviceView[] {
    const cs = (this.devices ?? []).filter((d) => d.kind !== "phone" && (d.home || d.state !== "unreachable"));
    const all = cs.length ? cs : [{ id: "local", name: this.homeName ?? "", kind: "server" as const, home: true, state: "awake" as const, harnesses: [], abilities: [] }];
    return all.filter((d) => this.ntFolder(d.id)?.old === (old || undefined));
  }

  /** D204: what that computer (a device id) said of its Ducter folder on the last options: its path, or that it is old. */
  ntFolder(device: string): DucterFolderView | undefined {
    const dev = this.ntDeviceArg(device) ?? "local";
    return (this.newTaskOptions?.ducterFolders ?? []).find((f) => f.device === dev);
  }

  /** D204: 从 Git 地址加… / Add from a Git address… on that computer: the field in place of the list. */
  ntCloneOpen(device: string) {
    const nt = this.nt;
    nt.clone = { device, address: nt.clone?.device === device ? nt.clone.address : "" };
    nt.list = "clone";
    nt.branchOpen = nt.computerOpen = false;
    nt.err = "";
    // D272: where that computer stands with GitHub, for the line under the address.
    this.ntGhStatus(device);
    this.changed();
  }

  ntCloneInput(v: string) {
    if (!this.nt.clone || this.nt.clone.cid) return;
    this.nt.clone.address = v;
    this.nt.clone.err = "";
    this.changed();
  }

  /** D204: the computer clones the address into its Ducter folder (minutes for a big repo); the field says so meanwhile. */
  ntCloneGo() {
    const k = this.nt.clone;
    if (!k || k.cid || !k.address.trim()) return;
    if (this.status !== "connected" || !this.S.welcomed) return (k.err = this.L.t("newtask.err.conn")), this.changed();
    this.nextClient++;
    k.cid = `k${Date.now()}-${this.nextClient}`;
    k.signedIn = undefined;
    k.err = "";
    const dev = this.ntDeviceArg(k.device);
    this.send({ t: "project_clone", address: k.address.trim(), clientId: k.cid, ...(dev ? { device: dev } : {}) });
    this.changed();
  }

  /** D204: why a clone or a look on that computer didn't happen, in the user's words. */
  cloneWhy(reason: string | undefined, message: string | undefined, name: string): string {
    switch (reason) {
      case "invalid":
      case "timeout":
        return this.L.t(`newtask.clone.err.${reason}`);
      case "not_found":
      case "no_access":
      case "network":
        return this.L.t(`newtask.clone.err.${reason}`, name);
      case "offline":
        return this.L.t("newtask.find.offline", name);
      case "old":
        return this.L.t("newtask.old", name);
    }
    return this.L.t("newtask.clone.err.failed", (message || "").replace(/[.。]\s*$/, ""));
  }

  /** D204: the clone landed: it is the card's place (and picks the agent that waited for a folder there). */
  cloneDone(f: Extract<ServerFrame, { t: "project_clone_result" }>) {
    const nt = this.nt;
    const k = nt.clone;
    if (!k?.cid || f.clientId !== k.cid) return;
    k.cid = undefined;
    if (!f.ok || !f.place) {
      const name = this.ntComputerName(k.device);
      k.failedAccess = (f.reason === "no_access" || f.reason === "not_found") && ntGitHubish(k.address);
      // D272: a GitHub repository this computer can't reach for want of a sign-in: say the way in.
      k.err = k.failedAccess && this.ntGh(k.device)?.state !== "signed_in" ? this.L.t("newtask.clone.err.no_access.gh", name) : this.cloneWhy(f.reason, f.message, name);
      if (k.failedAccess) this.ntGhStatus(k.device);
      return this.changed();
    }
    const p = f.place;
    nt.clone = undefined;
    this.pickPlace(p);
    if (p.place.kind === "repo" || p.place.kind === "folder") nt.prefill = p.place;
  }

  /** D204: a computer's name by its device id ("local" or the home's id: the home's). */
  ntComputerName(device: string): string {
    const d = (this.devices ?? []).find((x) => x.id === device || x.name === device);
    return d?.name ?? (device === "local" || !device ? (this.homeName ?? "") : device);
  }

  /** D203: 找一个文件夹… / Find a folder… on that computer (a device id): its folders, from `path` (absent: ~). */
  ntBrowse(device: string, path?: string) {
    const nt = this.nt;
    this.nextClient++;
    const cid = `b${Date.now()}-${this.nextClient}`;
    const keep = nt.browse?.device === device ? nt.browse.path : undefined;
    nt.browse = { device, cid, ...(path ?? keep ? { path: path ?? keep } : {}) };
    nt.list = "browse";
    nt.branchOpen = nt.computerOpen = false;
    nt.err = "";
    const dev = this.ntDeviceArg(device);
    this.send({ t: "folder_browse", clientId: cid, ...(dev ? { device: dev } : {}), ...(path ? { path } : {}) });
    this.changed();
  }

  /** D203: the folder being looked at becomes a project on that computer (D186, D197) and the card's place. */
  ntBrowseUse() {
    const nt = this.nt;
    const b = nt.browse;
    if (!b?.res?.ok || !b.res.path || nt.adding) return;
    this.nextClient++;
    nt.adding = `p${Date.now()}-${this.nextClient}`;
    nt.err = "";
    const dev = this.ntDeviceArg(b.device);
    this.send({ t: "project_add", path: b.res.path, clientId: nt.adding, ...(dev ? { device: dev } : {}) });
    this.changed();
  }

  /** D203: the folder list again, from the browser (an agent waiting for a folder keeps waiting). */
  ntBrowseBack() {
    // D272: the browser and the clone field are reached through 加一个文件夹…: back goes there.
    this.nt.list = this.nt.add ? "add" : "place";
    this.changed();
  }

  /** The device a frame names for that computer: none for the home, else its id. */
  ntDeviceArg(device: string): string | undefined {
    const d = (this.devices ?? []).find((x) => x.id === device || x.name === device);
    return !device || device === "local" || d?.home ? undefined : (d?.id ?? device);
  }

  /** D203: a folder found there was added: it is the card's place (and picks the agent that waited for it). */
  folderAdded(f: Extract<ServerFrame, { t: "project_add_result" }>) {
    const nt = this.nt;
    if (!nt.adding || f.clientId !== nt.adding) return;
    nt.adding = "";
    if (!f.ok || !f.place) {
      nt.err = f.reason === "offline" ? this.L.t("newtask.find.offline", this.ntBrowseName()) : f.reason === "old" ? this.L.t("newtask.old", this.ntBrowseName()) : this.L.t("newtask.err.failed", f.message || "");
      return this.changed();
    }
    const p = f.place;
    nt.browse = undefined;
    this.pickPlace(p);
    // Shown at once, before the next options list it.
    if (p.place.kind === "repo" || p.place.kind === "folder") nt.prefill = p.place;
  }

  /** D203: the name of the computer being looked through. */
  ntBrowseName(): string {
    return this.ntComputerName(this.nt.browse?.device ?? "");
  }

  /** D272: 加一个文件夹… on that computer: its three ways (new folder, choose one there, clone) in place of the list. */
  ntAddOpen(device: string) {
    const nt = this.nt;
    nt.add = { device };
    nt.list = "add";
    nt.branchOpen = nt.computerOpen = false;
    nt.err = "";
    this.changed();
  }

  /** D272: back to that computer's three ways (from the new folder, the browser or the clone field). */
  ntAddBack() {
    this.nt.list = this.nt.add ? "add" : "place";
    this.changed();
  }

  /** D272: that computer's <Ducter folder>/projects, as ~/… (where a new folder or a clone goes). */
  ntProjectsPath(device: string): string {
    const folder = this.ntFolder(device)?.path;
    return folder ? tilde(folder.replace(/\/+$/, "") + "/projects") : "~/ducter/projects";
  }

  /** D272: 在 {computer} 上新建一个文件夹: the name field in place of the list. */
  ntNewOpen(device: string) {
    const nt = this.nt;
    nt.newFolder = { device, name: nt.newFolder?.device === device && !nt.newFolder.cid ? nt.newFolder.name : "" };
    nt.list = "newfolder";
    nt.err = "";
    this.changed();
  }

  ntNewInput(v: string) {
    const n = this.nt.newFolder;
    if (!n || n.cid) return;
    n.name = v;
    n.err = "";
    this.changed();
  }

  /** D272: that computer makes the folder in its Ducter folder; the home adds it; it is the card's place. */
  ntNewGo() {
    const n = this.nt.newFolder;
    if (!n || n.cid || !n.name.trim()) return;
    if (this.status !== "connected" || !this.S.welcomed) return (n.err = this.L.t("newtask.err.conn")), this.changed();
    this.nextClient++;
    n.cid = `n${Date.now()}-${this.nextClient}`;
    n.err = "";
    const dev = this.ntDeviceArg(n.device);
    this.send({ t: "project_new", name: n.name.trim(), clientId: n.cid, ...(dev ? { device: dev } : {}) });
    this.changed();
  }

  newFolderDone(f: Extract<ServerFrame, { t: "project_new_result" }>) {
    const nt = this.nt;
    const n = nt.newFolder;
    if (!n?.cid || f.clientId !== n.cid) return;
    n.cid = undefined;
    if (!f.ok || !f.place) {
      const name = this.ntComputerName(n.device);
      n.err =
        f.reason === "invalid"
          ? this.L.t("newtask.new.err.invalid")
          : f.reason === "offline"
            ? this.L.t("newtask.find.offline", name)
            : f.reason === "old"
              ? this.L.t("newtask.old", name)
              : this.L.t("newtask.new.err.failed", (f.message || "").replace(/[.。]\s*$/, ""));
      return this.changed();
    }
    const p = f.place;
    nt.newFolder = nt.add = undefined;
    this.pickPlace(p);
    if (p.place.kind === "repo" || p.place.kind === "folder") nt.prefill = p.place;
  }

  /** D272: what that computer last said of its GitHub sign-in (undefined: not heard yet). */
  ntGh(device: string): GitLoginState | undefined {
    return this.nt.gh?.[this.ntDeviceArg(device) ?? ""];
  }

  /** D272: ask where that computer stands with GitHub. */
  ntGhStatus(device: string) {
    this.nextClient++;
    const dev = this.ntDeviceArg(device);
    this.send({ t: "git_login", action: "status", clientId: `g${Date.now()}-${this.nextClient}`, ...(dev ? { device: dev } : {}) });
  }

  /**
   * D272: the sign-in panel in flight: New task's (which "nt", on any computer) or, D345, Settings ›
   * 待办来源's 连上 GitHub (which "todos", the home's own): one panel, one set of words, two places.
   */
  ghp(which: GhWhich = "nt"): GhPanel | undefined {
    return which === "todos" ? this.ghTodo : this.nt.ghPanel;
  }

  private ghSend(g: GhPanel, action: "start" | "token" | "cancel" | "install" | "status", token?: string) {
    const dev = g.for === "todos" ? undefined : this.ntDeviceArg(g.device);
    this.send({ t: "git_login", action, clientId: g.cid, ...(dev ? { device: dev } : {}), ...(token ? { token } : {}), ...(g.for ? { for: g.for } : {}) });
  }

  /** D272: 在 {computer} 上登录 GitHub: the sign-in panel, and that computer's gh starts GitHub's device flow. D345: which "todos" is 连上 GitHub on the home. */
  ntGhStart(device: string, which: GhWhich = "nt") {
    const nt = this.nt;
    if (this.status !== "connected" || !this.S.welcomed) {
      if (which === "nt" && nt.clone) nt.clone.err = this.L.t("newtask.err.conn");
      return this.changed();
    }
    this.nextClient++;
    const g: GhPanel = { device, cid: `g${Date.now()}-${this.nextClient}`, ...(which === "todos" ? { for: "todos" as const } : {}) };
    if (which === "todos") this.ghTodo = g;
    else (nt.ghPanel = g), (nt.list = "gh");
    this.ghSend(g, "start");
    this.changed();
  }

  /** D345: 装上 gh / Install gh on the home: it is put there, then the sign-in goes on by itself. */
  ntGhInstall(which: GhWhich = "nt") {
    const g = this.ghp(which);
    if (!g || g.installing) return;
    this.nextClient++;
    g.cid = `g${Date.now()}-${this.nextClient}`;
    g.err = "";
    g.nogh = false;
    g.installing = { how: g.install?.how ?? "release", where: g.install?.where ?? "" };
    g.via = "install";
    this.ghSend(g, "install");
    this.changed();
  }

  /** D272: the token fallback, shown or hidden; the token typed is never kept past sending it. */
  ntGhTokenMode(on: boolean, which: GhWhich = "nt") {
    const g = this.ghp(which);
    if (!g) return;
    g.token = on;
    g.tokenText = "";
    g.err = "";
    this.changed();
  }

  ntGhTokenInput(v: string, which: GhWhich = "nt") {
    const g = this.ghp(which);
    if (!g) return;
    g.tokenText = v;
    g.err = "";
    this.changed();
  }

  /** D272: the pasted token goes to gh on that computer, once; the field is cleared at once. */
  ntGhTokenGo(which: GhWhich = "nt") {
    const g = this.ghp(which);
    const tok = (g?.tokenText ?? "").trim();
    if (!g || !tok) return;
    this.nextClient++;
    g.cid = `g${Date.now()}-${this.nextClient}`;
    g.tokenText = "";
    g.err = "";
    g.code = undefined;
    g.sending = true;
    this.ghSend(g, "token", tok);
    this.changed();
  }

  /** D272: stop the sign-in (its gh is stopped there) and go back to the clone field (or close 连上). */
  ntGhCancel(which: GhWhich = "nt") {
    const nt = this.nt;
    const g = this.ghp(which);
    if (g?.code) this.ghSend(g, "cancel");
    if (which === "todos") this.ghTodo = undefined;
    else {
      nt.ghPanel = undefined;
      nt.list = nt.clone ? "clone" : "place";
    }
    this.changed();
  }

  /** D272: GitHub's device page, in a new tab on this device (the code can be entered on any device). */
  ntGhOpen(which: GhWhich = "nt") {
    const g = this.ghp(which);
    window.open(g?.url || "https://github.com/login/device", "_blank", "noopener");
  }

  /** D272: copy the one-time code (with the old way where the Clipboard API isn't there, research/83). */
  async ntGhCopy(which: GhWhich = "nt") {
    const g = this.ghp(which);
    if (!g?.code) return;
    if (await copy(g.code)) {
      g.copied = true;
      this.changed();
      setTimeout(() => ((g.copied = false), this.changed()), 1600);
    }
  }

  /** D272: an answer about a computer's GitHub sign-in: kept for its line; the sign-in panel moves on. */
  ghState(f: Extract<ServerFrame, { t: "git_login_state" }>) {
    const nt = this.nt;
    const key = f.device ?? "";
    if (f.state === "signed_in" || f.state === "signed_out" || f.state === "no_gh") nt.gh = { ...(nt.gh ?? {}), [key]: { state: f.state, ...(f.account ? { account: f.account } : {}), ...(f.install ? { install: f.install } : {}) } };
    const which: GhWhich | undefined = this.ghTodo && f.clientId === this.ghTodo.cid ? "todos" : nt.ghPanel && f.clientId === nt.ghPanel.cid ? "nt" : undefined;
    const g = which && this.ghp(which);
    if (!g || !which) return this.changed();
    const name = which === "todos" ? (this.homeName ?? "") : this.ntComputerName(g.device);
    g.sending = false;
    if (f.state !== "installing") g.installing = undefined;
    switch (f.state) {
      case "installing":
        g.installing = { how: f.install?.how ?? g.installing?.how ?? "release", where: f.install?.where ?? g.installing?.where ?? "", ...(f.progress !== undefined ? { progress: f.progress } : {}) };
        g.err = "";
        break;
      case "code":
        g.code = f.code;
        g.url = f.url || "https://github.com/login/device";
        g.err = "";
        g.nogh = false;
        break;
      case "signed_in": {
        if (which === "todos") {
          // D345: GitHub is a source now (the home added it); its card says so with the count.
          this.ghTodo = undefined;
          this.ghConnected = f.account ?? "";
          setTimeout(() => ((this.ghConnected = undefined), this.changed()), 15_000);
          break;
        }
        nt.ghPanel = undefined;
        const k = nt.clone;
        nt.list = k ? "clone" : "place";
        if (k) {
          k.signedIn = this.L.t("newtask.gh.done", name, f.account ?? "");
          k.err = "";
          // The clone that failed for want of this sign-in goes again by itself.
          if (k.failedAccess) (k.failedAccess = false), this.ntCloneGo();
        }
        break;
      }
      case "cancelled":
        if (which === "todos") this.ghTodo = undefined;
        else (nt.ghPanel = undefined), (nt.list = nt.clone ? "clone" : "place");
        break;
      case "signed_out":
        break; // a socket that came back before the code: the panel waits
      default:
        g.code = undefined;
        g.nogh = f.state === "no_gh" || f.reason === "unsupported";
        // D345: no gh on the home, and Ducter can put it there: the offer, not an error.
        g.install = f.state === "no_gh" ? f.install : f.reason === "install" || f.reason === "network" ? (f.install ?? g.install) : g.install;
        g.reason = f.state === "failed" ? f.reason : undefined;
        g.err =
          f.state === "no_gh"
            ? f.install
              ? ""
              : this.L.t("newtask.gh.nogh", name)
            : f.state === "offline"
              ? this.L.t("newtask.find.offline", name)
              : f.state === "old"
                ? this.L.t("newtask.old", name)
                : f.reason === "expired" || f.reason === "denied"
                  ? this.L.t(`newtask.gh.err.${f.reason}`)
                  : f.reason === "network" || f.reason === "unsupported"
                    ? this.L.t(`newtask.gh.err.${f.reason}`, name)
                    : f.reason === "install"
                      ? this.L.t("newtask.gh.err.install", (f.message || "").replace(/[.。]\s*$/, ""))
                      : f.reason === "bad_token"
                        ? this.L.t("newtask.gh.err.bad_key", (f.message || "").replace(/[.。]\s*$/, ""))
                        : this.L.t("newtask.gh.err.failed", (f.message || "").replace(/[.。]\s*$/, ""));
    }
    this.changed();
  }

  /** D202: the Model and Effort rows of an agent: its models, which is chosen, and the effort. */
  ntTune(c: Candidate | undefined): { models: ModelChoice[]; model?: ModelChoice; suggested?: ModelChoice; efforts: string[]; effort: string; live: boolean } {
    const none = { models: [] as ModelChoice[], efforts: [] as string[], effort: "", live: false };
    if (!c) return none;
    const row: AgentModels | undefined = (this.newTaskOptions?.models ?? []).find((m) => m.harness === c.harness && (m.device ?? "") === (c.device ?? ""));
    if (!row?.models.length) return none;
    const kept = rememberedTune()[c.harness] ?? {};
    const by = (id?: string) => (id ? row.models.find((m) => m.id === id) : undefined);
    const suggested = row.models.find((m) => m.suggested);
    const model = by(this.nt.model) ?? by(kept.model) ?? suggested ?? row.models.find((m) => m.default);
    const efforts = model?.efforts ?? [];
    // "default": the user picked the model's own default (over a remembered level).
    const dflt = model?.defaultEffort && efforts.includes(model.defaultEffort) ? model.defaultEffort : "";
    const effort = this.nt.effort === "default" ? dflt : ([this.nt.effort, kept.effort].find((e) => !!e && efforts.includes(e)) ?? dflt);
    return { models: row.models, ...(model ? { model } : {}), ...(suggested ? { suggested } : {}), efforts, effort, live: row.from === "live" };
  }

  /** D202: the model and effort the frame carries: only what differs from the suggestion and the model's own default. */
  ntSendTune(c: Candidate | undefined): { model?: string; effort?: string; listed: boolean } {
    const tune = this.ntTune(c);
    const model = tune.model && tune.model.id !== tune.suggested?.id ? tune.model.id : undefined;
    const effort = tune.effort && tune.effort !== tune.model?.defaultEffort ? tune.effort : undefined;
    return { ...(model ? { model } : {}), ...(effort ? { effort } : {}), listed: tune.models.length > 0 };
  }

  /** D202: who does it as the pill shows it: the agent, its model and its effort, each its own word (D291); without a model list, the agent and the model it would use. */
  ntWhoParts(c: Candidate): string[] {
    const tu = this.ntTune(c);
    if (!tu.models.length) return [harnessName(c.harness), c.model && modelName(c.model)].filter((x): x is string => !!x);
    return [harnessName(c.harness), tu.model?.label ?? (c.model && modelName(c.model)), tu.effort && effortWord(this.L, tu.effort)].filter((x): x is string => !!x);
  }

  /** The pill's facts read aloud (Claude Code，Opus 5.5，高): its accessible name. */
  ntWhoLabel(c: Candidate): string {
    return spoken(this.L, ...this.ntWhoParts(c));
  }

  /** D202: the model or effort picked under the chosen agent, remembered for this agent on this client. */
  pickTune(c: Candidate, part: "model" | "effort", v: string) {
    if (part === "model") (this.nt.model = v), (this.nt.effort = "");
    else this.nt.effort = v;
    const t = this.ntTune(c);
    const all = rememberedTune();
    all[c.harness] = { ...(t.model ? { model: t.model.id } : {}), ...(t.effort && t.effort !== t.model?.defaultEffort ? { effort: t.effort } : {}) };
    lastTune = all;
    try {
      localStorage.setItem(TUNE, JSON.stringify(all));
    } catch {}
    this.changed();
  }

  pickPlace(p: PlaceChoice) {
    const nt = this.nt;
    nt.list = "";
    // D202: the agent that waited for a folder on its computer is picked with it.
    if (nt.pending) {
      const on = nt.placeOnly ?? "";
      if (p.place.kind === "none" && on) nt.computer = on;
      if (p.place.kind === "none" || this.placeComputer(p.place) === on) this.pickWho(nt.pending);
    }
    nt.pending = nt.placeOnly = undefined;
    nt.wantBranch = "";
    if (placeKey(p.place) === placeKey(this.chosenPlace().place)) return this.changed();
    nt.placeKey = placeKey(p.place);
    nt.branch = "";
    nt.branchOpen = false;
    nt.err = "";
    this.send({ t: "task_new_options", ...(p.place.kind === "repo" || p.place.kind === "folder" ? { place: p.place } : {}) });
    this.changed();
  }

  /** D202: the folder list closes (or opens): an agent waiting for a folder stops waiting. */
  togglePlaces() {
    const nt = this.nt;
    nt.list = ["place", "browse", "clone", "add", "newfolder", "gh"].includes(nt.list ?? "") ? "" : "place";
    nt.pending = nt.placeOnly = undefined;
    nt.branchOpen = nt.computerOpen = false;
    this.changed();
  }

  /**
   * D202: an agent picked in Who. One on another computer brings its computer along: No folder
   * moves there; a repo switches to its copy there (and the same branch when that copy has it);
   * else the folder list opens on that computer's places, the agent waiting for one.
   */
  pickAgent(c: Candidate) {
    const nt = this.nt;
    const { list, elsewhere } = this.ntCands();
    const key = agentKey(c);
    nt.model = nt.effort = "";
    if (!elsewhere.has(key) || !c.device) {
      const top = list.find((x) => !x.blocked);
      return this.pickWho(top && agentKey(top) === key ? "" : key);
    }
    const chosen = this.chosenPlace();
    if (chosen.place.kind === "none") {
      nt.computer = c.device;
      return this.pickWho(key);
    }
    const copy = this.ntCopyOn(c.device, chosen);
    if (copy) {
      const branch = nt.branch || chosen.defaultBranch || "";
      this.pickWho(key);
      this.pickPlace(copy);
      if (branch && branch !== copy.defaultBranch && copy.branches?.includes(branch)) nt.branch = branch;
      // D203: a repo that computer reported says its branches once asked: keep the branch then.
      else if (branch && !copy.branches) nt.wantBranch = branch;
      return this.changed();
    }
    nt.pending = key;
    nt.placeOnly = c.device;
    nt.list = "place";
    this.changed();
  }

  /** D185: who the user picked, remembered for the next sheet ("" = the suggested one). */
  pickWho(key: string) {
    this.nt.pick = key;
    this.nt.list = "";
    lastWho = key;
    try {
      localStorage.setItem(WHO, key);
    } catch {}
    this.changed();
  }

  /** D185: the sheet's when as the frame says it (undefined: now), or a line saying what is missing. */
  ntWhen(): { when?: Extract<ClientFrame, { t: "task_new" }>["when"]; bad?: string } {
    const nt = this.nt;
    if (nt.when === "at" || nt.when === "every") {
      const time = parseClock(nt.atTime);
      if (nt.when === "every" && nt.every === 3) return { when: { kind: "every", every: "hours", hours: EVERY_HOURS[nt.hours ?? 1], time: "00:00", tz: tzNow() } };
      if (!time) return { bad: this.L.t("newtask.err.time") };
      if (nt.when === "at") {
        const d = new Date();
        d.setDate(d.getDate() + (nt.atDay ?? 1));
        return { when: { kind: "at", date: ymd(d), time, tz: tzNow() } };
      }
      const every = (["day", "weekday", "week"] as const)[nt.every ?? 0]!;
      return { when: { kind: "every", every, time, tz: tzNow(), ...(every === "week" ? { days: [nt.weekday ?? 1] } : {}) } };
    }
    if (nt.when === "when" || nt.when === "until") {
      const condition = (nt.condition ?? "").trim();
      if (!condition) return { bad: this.L.t("newtask.err.no_condition") };
      return { when: { kind: nt.when, condition } };
    }
    return {};
  }

  /** The line under Start: why it didn't open. "Say what it should do first" holds only while
   *  there are no words. */
  newTaskError(): string {
    const nt = this.nt;
    if (nt.err && nt.err === this.L.t("newtask.err.empty") && nt.words.trim()) nt.err = "";
    return nt.err;
  }

  /** Start: sends task_new; the result opens the task or says why not, on the sheet. */
  startNewTask(again = false): boolean {
    const nt = this.nt;
    if (nt.sending) return false;
    const words = nt.words.trim();
    if (!words) return (nt.err = this.L.t("newtask.err.empty")), this.changed(), false;
    if (this.status !== "connected" || !this.S.welcomed) return (nt.err = this.L.t("newtask.err.conn")), this.changed(), false;
    const { when, bad } = this.ntWhen();
    if (bad) return (nt.err = bad), this.changed(), false;
    nt.again = again;
    nt.started = nt.startedTask = "";
    nt.list = "";
    nt.branchOpen = nt.computerOpen = false;
    const chosen = this.chosenPlace();
    const cp = chosen.place;
    // D157: No folder with two or more computers: the chosen (or suggested) computer goes with it.
    const comp = cp.kind !== "repo" && (this.newTaskOptions?.candidates ?? []).some((c) => c.device) ? (this.devices ?? []).find((d) => d.id === this.ntComputer()) : undefined;
    const place: Place | undefined =
      cp.kind === "repo"
        ? { kind: "repo", device: cp.device, repoPath: cp.repoPath, ...(nt.branch && nt.branch !== chosen.defaultBranch ? { baseBranch: nt.branch } : {}) }
        : cp.kind === "folder"
          ? { kind: "folder", device: cp.device || "local", path: cp.path }
          : comp
            ? { kind: "none", device: comp.home ? "local" : comp.name }
            : undefined;
    const { c, picked } = this.chosenCandidate();
    // D202: the model and effort go only when they differ from the suggestion and the model's own default.
    const { model, effort, listed } = this.ntSendTune(c);
    const sendModel = model ?? (listed ? undefined : c?.model);
    const who = c && (picked || (nt.pick && nt.computer) || model || effort) ? { harness: c.harness, ...(sendModel ? { model: sendModel } : {}), ...(effort ? { effort } : {}) } : {};
    const sending = (nt.sending = `n${Date.now()}-${++this.nextClient}`);
    nt.err = "";
    // D206: the pictures on the What row go with the words, once they are up.
    this.afterUpload(
      this.picks.get("new") ?? [],
      (media) => nt.sending === sending && this.send({ t: "task_new", words, ...(place ? { place } : {}), ...who, clientId: sending, ...(when ? { when } : {}), ...(media.length ? { media } : {}), ...(nt.from ? { from: nt.from.taskId } : {}), ...(nt.item ? { item: nt.item } : {}) }),
      () => nt.sending === sending && ((nt.sending = ""), (nt.err = this.L.t("media.failed")), this.changed()),
    );
    this.changed();
    return true;
  }

  private newTaskResult(f: Extract<ServerFrame, { t: "task_new_result" }>) {
    if (!this.nt.sending || f.clientId !== this.nt.sending) return;
    this.nt.sending = "";
    if (f.ok && (f.taskId || f.routineId)) {
      const nt = this.nt;
      if (nt.again) {
        // ⇧⌘⏎ (D185): the sheet stays, empty, with the same place, who and when, saying what started.
        nt.words = nt.condition = nt.err = "";
        this.picks.delete("new");
        if (f.routine) nt.started = this.L.t("newtask.scheduled", f.routine.triggerWords, f.routine.name);
        else (nt.started = this.L.t("newtask.opened", f.card?.title ?? "")), (nt.startedTask = f.taskId ?? "");
        return this.changed();
      }
      this.nt = freshDraft();
      this.picks.delete("new");
      this.sheet = null;
      // A start later or on a schedule lives on On hand (its routine card).
      return f.taskId ? this.go({ name: "task", id: f.taskId }) : this.go({ name: "onhand" });
    }
    const r = f.reason;
    this.nt.err =
      r === "empty" || r === "no_agent" || r === "not_repo" || r === "offline" || r === "past" || r === "no_condition" || r === "ducter_data"
        ? this.L.t(`newtask.err.${r}`)
        : f.message
          ? this.L.t("newtask.err.failed", f.message.replace(/[.\s]+$/, ""))
          : this.L.t("newtask.err.unknown");
    this.changed();
  }

  /** D282: the same agent with another model or effort, in place (its own session carries on). */
  retuneTask(taskId: string, harness: string, model: string, effort?: string) {
    this.send({ t: "task_switch", taskId, harness, model, ...(effort ? { effort } : {}) });
    this.changed();
  }

  /** 换到 X 接着做 / Continue on X. */
  switchTask(taskId: string, harness: string, model: string | undefined, name: string, device?: string) {
    this.switching = name;
    this.send({ t: "task_switch", taskId, harness, ...(model ? { model } : {}), ...(device ? { device } : {}) });
    this.changed();
  }

  /** 跟 Ducter 说一条规则… / Tell Ducter a rule…: the conversation, with the words started. */
  tellRule() {
    this.sheet = null;
    this.draft = this.L.t("loadout.rule.prefill");
    this.go({ name: "conv" });
    setTimeout(() => document.getElementById("composer")?.focus(), 50);
  }

  /** D309: whether this page shows the default partner (the one Settings › 伙伴's name and rules are). */
  showsDefault(): boolean {
    return (this.S.persona || this.partnerShown) === DEFAULT_PARTNER;
  }

  /** D309: the default partner's name (the one Settings › 伙伴 renames), whoever is shown. */
  defaultName(): string {
    return this.partners?.find((p) => p.id === DEFAULT_PARTNER)?.name ?? this.settings?.name ?? this.S.personaName;
  }

  /** D309: more than one partner, so the bar shows whose conversation this is and the others. */
  manyPartners(): boolean {
    return (this.partners?.length ?? 0) > 1;
  }

  /** D312: every other partner's own open questions, which On hand lists (the shown one's are in its conversation). */
  otherAsks(): PartnerAsk[] {
    if (!this.manyPartners()) return [];
    const shown = this.S.persona || this.partnerShown;
    return (this.S.onHand?.asks ?? []).filter((a) => a.persona !== shown && this.partners!.some((p) => p.id === a.persona));
  }

  /** D309: the partner shown, as the partners frame says it (undefined with one partner). */
  shownPartner(): PartnerInfo | undefined {
    if (!this.manyPartners()) return undefined;
    return this.partners!.find((p) => p.id === (this.S.persona || this.partnerShown));
  }

  private applyPartners(f: Extract<ServerFrame, { t: "partners" }>) {
    this.partners = f.partners;
    const ask = this.partnerAsk;
    if (ask && f.clientId === ask.cid) {
      if (f.error) ask.error = f.error;
      else {
        this.partnerAsk = undefined;
        if (ask.kind === "add" && ask.name) (this.partnerAddedAt = Date.now()), this.toast(this.L.t("partners.added", ask.name));
      }
    }
    // The partner this page asked for is gone (or never was): the home showed the default's.
    if (this.partnerShown !== f.shown && !f.partners.some((p) => p.id === this.partnerShown)) savePartner((this.partnerShown = f.shown));
    const shown = f.partners.find((p) => p.id === f.shown);
    if (shown && shown.name !== this.S.personaName) this.S.personaName = shown.name;
    this.changed();
  }

  /** D309: shows another partner's conversation: this page starts over on it (a new hello). */
  switchPartner(id: string) {
    if (id === (this.S.persona || this.partnerShown) || !this.partners?.some((p) => p.id === id)) return;
    savePartner((this.partnerShown = id));
    this.startOver();
    this.pending = [];
    this.actSent.clear();
    this.inDoubt = undefined;
    this.historyAsked.clear();
    this.livingAway.clear();
    this.draft = "";
    this.replying = undefined;
    this.route = { name: "conv" };
    this.sheet = null;
    this.S.personaName = this.partners.find((p) => p.id === id)!.name;
    this.conn?.rehello();
    this.changed();
  }

  /** D309: 再加一个伙伴 / Add a partner. */
  addPartner(name: string, look: PartnerLook) {
    const cid = `pa-${Date.now().toString(36)}`;
    this.partnerAsk = { cid, kind: "add", name: name.trim() };
    this.send({ t: "partner_add", name, look, clientId: cid });
    this.changed();
  }

  /** D309: a partner's new name or look (the default's name is setSettings'). */
  setPartner(id: string, patch: { name?: string; look?: PartnerLook }) {
    if (id === DEFAULT_PARTNER && patch.name) return this.setSettings({ name: patch.name });
    const cid = `ps-${Date.now().toString(36)}`;
    this.partnerAsk = { cid, kind: "set" };
    if (this.partners) this.partners = this.partners.map((p) => (p.id === id ? { ...p, ...patch } : p));
    this.send({ t: "partner_set", id, ...patch, clientId: cid });
    this.changed();
  }

  /** Changes partner settings: shown at once, then confirmed by the server's frame. */
  setSettings(patch: SettingsPatch) {
    if (this.settings) this.settings = { ...this.settings, ...patch };
    if (patch.name && this.showsDefault()) this.S.personaName = patch.name;
    this.send({ t: "settings_set", patch });
    this.changed();
  }

  /** Connections (D96): ask once; the server keeps this socket up to date. */
  askConnections() {
    if (this.S.welcomed) this.send({ t: "connections" });
  }
  addConnection(url: string, token: string) {
    this.connecting = true;
    this.connRefusal = undefined;
    this.send({ t: "connection_add", url, ...(token ? { token } : {}) });
    this.changed();
  }
  /**
   * D199: 打电话 on the home's sheet goes where calls are kept: Settings › Accounts, at the phone
   * card. Adding starts the same Tuwa sign-in as the offer there (never a second flow).
   */
  openCalls(add: boolean) {
    this.openSettings("accounts");
    this.askConnections();
    if (add && !this.connecting && this.signIn?.state !== "waiting") this.addConnection(TUWA_MCP, "");
    setTimeout(() => globalThis.document?.getElementById("acct-phone")?.scrollIntoView({ block: "start", behavior: "smooth" }), 160);
  }
  /** D193: the device sign-in and the phone card. */
  cancelSignIn() {
    this.signIn = undefined;
    this.connecting = false;
    this.send({ t: "connection_signin_cancel" });
    this.changed();
  }
  reauth(id: string) {
    this.send({ t: "connection_reauth", id });
  }
  phoneVoice(action: "record" | "on" | "off" | "delete" | "refresh") {
    this.voiceAnswer = undefined;
    this.send({ t: "phone_voice", action });
    this.changed();
  }
  phoneCap(usd: number) {
    this.send({ t: "phone_cap", usd });
  }
  /** D218: a step on the own-number card (the key goes to the home only). */
  ownPhoneAct(a: import("@ducter/protocol").OwnPhoneAction) {
    this.ownAnswer = undefined;
    this.send({ t: "own_phone", ...a } as ClientFrame);
    this.changed();
  }
  callCancel(callId: string) {
    this.send({ t: "call_cancel", callId });
  }
  /** D208: 现在就打 / Call now on a Go card that waits for the callee's hours: the Go, now. */
  callNow(decisionId: string, callId: string) {
    const d = this.S.decisions.get(decisionId);
    if (d) d.pending = "go";
    if (navigator.vibrate) navigator.vibrate(8);
    haptic("success");
    this.markRead();
    this.send({ t: "call_now", callId });
    this.changed();
  }
  useOoConnection() {
    this.connecting = true;
    this.connRefusal = undefined;
    this.send({ t: "connection_oo" });
    this.changed();
  }
  /** D148: the device card's actions. */
  renameDevice(device: string, name: string) {
    this.send({ t: "rename_device", device, name });
  }
  disconnectDevice(device: string) {
    this.send({ t: "disconnect_device", device });
  }
  /** D344: 看看都改了什么 / See what changed was opened for v: the partner's line for it stays unsaid today. */
  notesSeen(version: string) {
    this.send({ t: "notes_seen", version, ...(zone() ? { tz: zone() } : {}) });
  }
  updateDevice(device: string) {
    this.deviceAnswer = undefined;
    this.send({ t: "device_update", device });
    this.changed();
  }
  /** D224: 全部更新 / Update all: the home makes the plan and runs it; its list comes back in devices frames. */
  startUpdateAll() {
    this.updateAllAnswer = undefined;
    this.send({ t: "update_all" });
    haptic("light");
    this.changed();
  }
  /** 停止剩下的 / Stop the rest: what hasn't started stays as it is. */
  stopUpdateAll() {
    this.send({ t: "update_all", stop: true });
  }
  /** 完成 / Done: put a finished plan away. */
  dismissUpdateAll() {
    if (this.updateAll) this.updateAll = { ...this.updateAll, plan: undefined };
    this.send({ t: "update_all", dismiss: true });
    this.changed();
  }
  /**
   * The apps' own last step (D224): once a plan this page saw running is over, the Android app
   * checks for its own update, and a page the home now serves newer reloads itself, back on
   * Settings › 你的设备 where the list was. Once per plan; the plan's id survives the reload.
   */
  afterUpdateAll(v: UpdateAllView | undefined) {
    const p = v?.plan;
    if (!p || typeof sessionStorage === "undefined") return;
    const key = "ducter.updateAll";
    let seen = "";
    try {
      seen = sessionStorage.getItem(key) ?? "";
      if (!p.finishedAt) {
        if (seen !== `${p.id}:running`) sessionStorage.setItem(key, `${p.id}:running`);
        return;
      }
      if (seen !== `${p.id}:running`) return; // finished before this page saw it run, or handled
      sessionStorage.setItem(key, `${p.id}:over`);
    } catch {
      return;
    }
    if (p.items.some((i) => i.state === "done")) haptic("success");
    if (nativeInfo()?.platform === "android") void nativeCall({ t: "update.check" });
    if (this.staleFor && typeof location !== "undefined") {
      try {
        if (sessionStorage.getItem("ducter.reloadedFor") === this.staleFor) return;
        sessionStorage.setItem("ducter.reloadedFor", this.staleFor);
        sessionStorage.setItem("ducter.reopen", "devices");
      } catch {
        return;
      }
      setTimeout(() => location.reload(), 1200); // the last tick is seen first
    }
  }
  /** 现在检查 / Check now: the home reads the latest release again; fresh devices frames follow. */
  checkingUpdates = false;
  checkUpdates(device: string) {
    this.checkingUpdates = true;
    this.send({ t: "device_update", device, check: true });
    this.changed();
  }
  /** D205: 接上 / Connect: the home's nmem connects the persona (the frame shows each step). */
  connectBridge() {
    if (this.bridge) this.bridge = { ...this.bridge, state: "connecting" };
    this.send({ t: "bridge_connect" });
    this.changed();
  }
  /** D324: 改由这台收 / 只留这台 asks in place first (bridgeHere), then this home alone receives. */
  bridgeHere = false;
  onlyHereBridge() {
    if (!this.bridgeHere) {
      this.bridgeHere = true;
      return this.changed();
    }
    this.bridgeHere = false;
    if (this.bridge) this.bridge = { ...this.bridge, state: "connecting" };
    this.send({ t: "bridge_only_here" });
    this.changed();
  }
  /** D225: 装上 / 更新: the home puts in (or updates) its own Nowledge Mem command line. */
  installBridgeMem() {
    // D229: a quiet upkeep under a working row is an update too (a move keeps its own words).
    const b = this.bridge;
    if (b) this.bridge = { ...b, state: b.state === "install_mem" ? "installing" : "updating", detail: undefined, kept: undefined, done: undefined, ...(b.upkeep ? { upkeep: { kind: b.upkeep.kind } } : {}) };
    this.send({ t: "bridge_mem_install" });
    this.changed();
  }
  /** D225: 登录: a one-time connect link, handed to the home's nmem (never kept here). */
  signInBridgeMem(link: string) {
    if (this.bridge) this.bridge = { ...this.bridge, state: "signing_in" };
    this.send({ t: "bridge_mem_sign_in", link });
    this.changed();
  }
  /** D205: 断开 / Disconnect: the first tap asks, the second runs it. */
  disconnectBridge() {
    if (!this.bridgeConfirm) {
      this.bridgeConfirm = true;
      return this.changed();
    }
    this.bridgeConfirm = false;
    if (this.bridge) this.bridge = { ...this.bridge, state: "disconnecting" };
    this.send({ t: "bridge_disconnect" });
    this.changed();
  }
  /** D347: 加一台做事的电脑 / Add a computer for tasks: the sheet in 你的设备 (its entry, or the partner's card). */
  openLend() {
    this.openSettings("devices");
    this.lend = {};
    this.changed();
  }
  /** D347: the kind chosen (or 换一个新码 / New code): a fresh code and its line. */
  /** D358: 加一台设备 / Add a device: the sheet in 你的设备 at its first step, what it is for. */
  openAdd() {
    this.openSettings("devices");
    this.lend = { add: true };
    this.changed();
  }
  /** D358: to talk with the partner from a phone, a tablet or another window: a one-time code. */
  addPair() {
    this.lend = { pair: "asking", fromAdd: true, pairFrom: this.reach?.clients.length ?? 0 };
    this.send({ t: "pair_code" });
    this.changed();
  }
  /** D358: back one step in the sheet: from the line to the question, from the question or the code to 加一台设备. */
  lendBack() {
    const l = this.lend;
    if (!l) return;
    this.lend = l.kind ? { fromAdd: l.fromAdd } : l.fromAdd ? { add: true } : undefined;
    this.changed();
  }
  lendAsk(kind: LendKind) {
    this.lend = { kind, awaiting: true, askedAt: Date.now(), ...(this.lend?.fromAdd ? { fromAdd: true } : {}) };
    this.send({ t: "lend_code" });
    this.changed();
    // No answer is said once the wait is over (the sheet reads the clock), never an endless wait.
    setTimeout(() => this.lend?.awaiting && this.changed(), LEND_WAIT_MS + 50);
  }
  closeLend() {
    this.lend = undefined;
    this.changed();
  }
  /** D228: 让 Ducter 帮我设好 / Set it up for me: one task on the home sets up the person's own Cloudflare tunnel. */
  beginAnywhere() {
    this.anywhereAnswer = undefined;
    this.send({ t: "anywhere_setup", op: "begin" });
    this.changed();
  }
  /** D228: 从外面连 on again (the tunnel made before), or the setup when there is none yet. */
  anywhereOn(on: boolean) {
    this.anywhereAnswer = undefined;
    this.send({ t: "ability", device: "local", ability: "remote", on });
    this.changed();
  }
  anywhereCancel() {
    this.send({ t: "anywhere_setup", op: "cancel" });
  }
  /** Opens a task (the setup task from the device card). */
  openTaskPage(taskId: string) {
    this.sheet = null;
    this.go({ name: "task", id: taskId });
  }
  /** D169: one task on that device puts Nowledge Mem into that agent, following Mem's own guide. */
  installMem(device: string, harness: string) {
    this.memAnswer = undefined;
    this.send({ t: "mem_plugin_install", device, harness });
    this.changed();
  }
  /** D363: put agents on a device, sign one in there, a pasted code, cancel, or look again. */
  agentSetup(device: string, action: "install" | "login" | "code" | "cancel" | "look", o: { harnesses?: string[]; harness?: string; code?: string } = {}) {
    if (action !== "look") this.setupAnswer = undefined;
    this.send({ t: "agent_setup", device, action, ...o });
    if (action !== "look") this.changed();
  }
  /** D366: Nowledge Mem on a computer for tasks: put its command line there, or sign it in with a one-time link. */
  memSetup(device: string, action: "install" | "connect", link?: string) {
    this.memSetupAnswer = undefined;
    this.send({ t: "mem_setup", device, action, ...(link ? { link } : {}) });
    this.changed();
  }
  /** D156: update one AI agent on a device with its own updater. */
  updateAgent(device: string, harness: string) {
    this.agentAnswer = undefined;
    this.send({ t: "agent_update", device, harness });
    this.changed();
  }

  /** D166: a tile's 自己留意 / 不让 Ducter 看这个. */
  setApp(id: string, service: string, account: string | undefined, patch: { watch?: boolean; excluded?: boolean }) {
    const c = this.connections?.find((x) => x.id === id);
    const a = c?.look?.apps.find((x) => x.service === service && (x.account ?? "") === (account ?? ""));
    if (a) Object.assign(a, patch);
    this.send({ t: "app_watch", id, service, ...(account ? { account } : {}), ...patch });
    this.changed();
  }
  /** D222: 看哪些日历 / Calendars it reads: one calendar in a calendar account, on or off. */
  pickCalendar(id: string, service: string, account: string | undefined, calendarId: string, seen: boolean) {
    const c = this.connections?.find((x) => x.id === id);
    const a = c?.look?.apps.find((x) => x.service === service && (x.account ?? "") === (account ?? ""));
    const row = a?.calendars?.find((r) => r.id === calendarId);
    if (row) row.seen = seen;
    this.send({ t: "cal_pick", id, service, ...(account ? { account } : {}), calendarId, seen });
    this.changed();
  }
  /** Words put in the conversation's composer (a starter, 试试 / Try it): never sent. */
  fillComposer(text: string) {
    this.sheet = null;
    this.draft = text;
    this.go({ name: "conv" });
    setTimeout(() => document.getElementById("composer")?.focus(), 50);
  }
  askReads(id: string) {
    this.send({ t: "connection_reads", id });
  }
  /** D226: 今天看了什么 / What it looked at today. */
  askDay() {
    this.send({ t: "proactive_day" });
  }
  /** D165: 有用 / 这类不用告诉我 under a find, and a note's ask. */
  reactFind(findId: string, reaction: "useful" | "mute") {
    this.S.findStates.set(findId, { findId, kind: this.S.findStates.get(findId)?.kind ?? "deadline", state: reaction === "mute" ? "muted" : "useful" });
    this.send({ t: "find_react", findId, reaction });
    this.changed();
  }
  answerNote(noteId: string, ask: import("@ducter/protocol").ProactiveYesNo, yes: boolean) {
    this.send({ t: "proactive_answer", noteId, ask, yes });
  }
  removeConnection(id: string) {
    if (this.connections) this.connections = this.connections.filter((c) => c.id !== id);
    this.send({ t: "connection_remove", id });
    this.changed();
  }
  /**
   * For the devices stage (Isles, being rebuilt on the isles branch): the mailboxes that stand on
   * the island of the computer Ducter runs on. Connections always live there (D96).
   */
  homeMailboxes(): { id: string; name: string; source: ConnectionView["source"]; trouble: boolean }[] {
    return (this.connections ?? []).map((c) => ({ id: c.id, name: c.name, source: c.source, trouble: c.state === "unreachable" || c.state === "unauthorized" }));
  }

  /** Titles of the noted lines being forgotten, for the toast that answers. */
  private forgetting = new Map<number, string>();
  /** D304: 想起了 lines forgotten from this client, before the home's frame says so. */
  forgottenHere = new Set<number>();
  /** D304: the 想起了 line under this message, unless it was forgotten. */
  recalledUnder(seq: number) {
    const r = this.S.recalled.get(seq);
    if (!r || this.forgottenHere.has(r.seq) || this.mem?.forgotten?.includes(r.seq)) return undefined;
    return r;
  }
  /** D304: opens what it remembered (the line under a reply). */
  openRecall(seq: number) {
    this.sheet = { kind: "recall", seq };
    this.changed();
  }
  /** D304: 这周记下的 / What it learned this week, from the week's morning note. */
  openLearned() {
    this.sheet = { kind: "learned" };
    this.send({ t: "settings" });
    this.changed();
  }
  /** D304: the person says a noted line is right. */
  confirmNoted(seq: number) {
    if (this.mem) this.mem = { ...this.mem, noted: this.mem.noted.map((n) => (n.seq === seq ? { ...n, confirmed: true } : n)) };
    this.send({ t: "memory_confirm", seq });
    this.changed();
  }
  /** D304: the person corrects a noted line's words (written back to Mem by the home). */
  correctNoted(seq: number, title: string) {
    const words = title.replace(/\s+/g, " ").trim();
    if (!words) return;
    if (this.mem) this.mem = { ...this.mem, noted: this.mem.noted.map((n) => (n.seq === seq ? { ...n, title: words, corrected: true, confirmed: true } : n)) };
    this.send({ t: "memory_correct", seq, title: words });
    this.changed();
  }
  /** D321: Settings › 记忆's own rows, by Mem's id: gone or fixed at once; the home's frame settles it. */
  memForget(id: string) {
    const g = this.mem?.glance;
    if (this.mem && g) this.mem = { ...this.mem, glance: { ...g, about: g.about.filter((x) => x.id !== id) } };
    if (this.memFound) this.memFound = { ...this.memFound, items: this.memFound.items.filter((x) => x.id !== id) };
    this.send({ t: "mem_forget", id });
    this.changed();
  }
  memFix(id: string, title: string) {
    const words = title.replace(/\s+/g, " ").trim();
    if (!words) return;
    const fix = (xs: MemItem[]) => xs.map((x) => (x.id === id ? { ...x, title: words } : x));
    const g = this.mem?.glance;
    if (this.mem && g) this.mem = { ...this.mem, glance: { ...g, about: fix(g.about) } };
    if (this.memFound) this.memFound = { ...this.memFound, items: fix(this.memFound.items) };
    this.send({ t: "mem_fix", id, title: words });
    this.changed();
  }
  /** D321: search Mem from Settings › 记忆; "" clears it. The answer comes as mem_found. */
  memFind(q: string) {
    const words = q.replace(/\s+/g, " ").trim();
    this.memQuery = words;
    if (!words) this.memFound = undefined;
    else this.send({ t: "mem_find", q: words });
    this.changed();
  }
  /** D329: the Noted line's state: taken back (undone), waiting for Mem, and whether Undo is still offered. */
  undoFailed: number | undefined;
  private memAsked = false;
  notedState(seq: number): { undone: boolean; waiting: boolean; fresh: boolean; failed: boolean } {
    const m = this.mem;
    // The lines' state is the settings frame's: asked once, the first time a Noted line shows.
    if (!m && !this.memAsked && this.S.welcomed) {
      this.memAsked = true;
      queueMicrotask(() => this.send({ t: "settings" }));
    }
    return { undone: !!m?.undone?.includes(seq), waiting: !!m?.waiting?.includes(seq), fresh: this.S.lastUserSeq < seq, failed: this.undoFailed === seq };
  }
  /** D329: 撤销 / Undo on a fresh Noted line: no question asked (it is the undo). */
  undoNoted(seq: number) {
    this.undoFailed = undefined;
    this.send({ t: "memory_undo", seq });
    this.changed();
  }
  /** D329: the home opens the Nowledge Mem app (mem_closed with canOpen). */
  openBridgeMem() {
    this.send({ t: "bridge_mem_open" });
  }
  forget(seq: number) {
    const n = this.mem?.noted.find((x) => x.seq === seq);
    const rc = [...this.S.recalled.values()].find((x) => x.seq === seq);
    if (rc) this.forgottenHere.add(seq);
    const title = n?.title ?? this.S.noted.find((x) => x.seq === seq)?.title ?? rc?.title;
    if (title) this.forgetting.set(seq, title);
    this.S.noted = this.S.noted.filter((x) => x.seq !== seq);
    if (this.mem) this.mem = { ...this.mem, noted: this.mem.noted.filter((n) => n.seq !== seq) };
    this.send({ t: "memory_forget", seq });
    this.changed();
  }

  /** The 记下了 / Noted lines a message's Details carry: those answering the same user message,
   *  under the last partner message that answers it (D104). */
  notedFor(e: Entry): { seq: number; title: string; replaced?: string; waiting?: true }[] {
    const replyTo = e.ai?.replyTo ?? e.job?.ack?.replyTo;
    if (replyTo == null) return [];
    const last = [...this.S.channel].reverse().find((x) => (x.ai?.replyTo ?? x.job?.ack?.replyTo) === replyTo);
    return last === e ? this.S.noted.filter((n) => n.replyTo === replyTo) : [];
  }

  /** Is this message's Details open? The preference, flipped where the person tapped. */
  detailsOpen(key: string): boolean {
    return (this.details === "shown") !== this.flipped.has(key);
  }
  toggleDetails(key: string) {
    this.flipped.has(key) ? this.flipped.delete(key) : this.flipped.add(key);
    this.changed();
  }
  setDetails(v: DetailsPref) {
    this.details = v;
    this.flipped.clear();
    try {
      localStorage.setItem(DETAILS, v);
    } catch {}
    this.changed();
  }

  /** This phone's interface language; "auto" follows the system (then the user's first words). */
  setUiLang(v: UiLang) {
    this.uiLang = v;
    try {
      if (v === "auto") localStorage.removeItem(UI_LANG);
      else localStorage.setItem(UI_LANG, v);
    } catch {}
    this.localeSet = v !== "auto";
    this.L = strings(v === "auto" ? startLang(v) : v, HANDHELD);
    if (v === "auto") this.followUserLanguage();
    this.changed();
  }

  private followUserLanguage() {
    if (this.localeSet) return;
    const first = this.S.channel.find((e) => e.user);
    if (!first) return;
    const l = langOfText(first.user!.text);
    if (l) {
      this.localeSet = true;
      saveSpoke(l); // D262: the next open starts in it
      if (l !== this.L.locale) this.L = strings(l, HANDHELD); // D292: any tag; its table by the fallback chain
    }
  }

  private convKey = "";
  private convVal?: Lang;
  /** D292: the conversation's language, from the person's own messages (oldest first). */
  get convLang(): Lang | undefined {
    const ch = this.S.channel;
    const key = `${ch.length}:${ch[0]?.firstSeq ?? 0}:${ch[ch.length - 1]?.firstSeq ?? 0}:${ch[ch.length - 1]?.revision ?? 0}`;
    if (key !== this.convKey) {
      this.convKey = key;
      this.convVal = languageOfTexts(ch.flatMap((e) => (e.user?.text ? [e.user.text] : [])));
    }
    return this.convVal;
  }

  /** D292: the language a task's report is read in: the task's, else the conversation's, else the interface's. */
  readerLang(task?: { open?: { language?: Lang } }): Lang {
    return task?.open?.language ?? this.convLang ?? this.L.locale;
  }

  private drainActionResults() {
    for (const f of this.S.actionResults.splice(0)) {
      const t = this.S.tasks.get(f.taskId);
      const name = t ? title(t) : "";
      if (f.ok && f.action === "merge") this.toast(this.L.t("result.merged.toast", name, short(f.ref ?? "")));
      else if (f.ok && f.action === "open_pr") this.toast(this.L.t("result.pr.toast", f.ref ?? ""));
      else if (f.action === "switch") {
        // D354: an in-place model or effort (nothing named as switching) is said by its own quiet line, not a toast.
        if (f.ok) {
          if (this.switching) (this.switchFor = ""), this.toast(this.L.t("who.done", this.switching));
        } else this.toast(this.L.t("who.failed", f.message ?? ""));
        this.switching = "";
        // A draft PR that didn't open says why on the task itself (it stays), not in a toast.
      } else if (!f.ok && f.action !== "open_pr") this.toast(this.L.t("result.action.failed", f.message ?? ""));
    }
  }

  toast(text: string, action?: Toast["action"], ms = 4000) {
    const id = ++this.nextToast;
    this.toasts.push({ id, text, action });
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.changed();
    }, ms);
    this.changed();
  }

  // ---------- reading ----------

  /** The user has seen the conversation so far. */
  markRead() {
    const up = this.S.channelSeq;
    if (up > this.S.readUpTo && up > this.readSent) {
      this.readSent = up;
      this.send({ t: "read", upToSeq: up });
    }
  }

  /** The conversation, in front and visible, counts as read after READ_AFTER_MS. */
  /** D254: the reader is scrolled up the conversation (conv-follow.tsx): nothing new is read yet. */
  convAway = false;
  private scheduleRead() {
    if (this.readTimer) return;
    // D254: not while the reader is up the conversation: what came is read when it is seen.
    const want = () => this.status === "connected" && this.route.name === "conv" && !this.sheet && !this.convAway && typeof document === "object" && document.visibilityState === "visible" && this.S.channelSeq > Math.max(this.S.readUpTo, this.readSent);
    if (!want()) return;
    this.readTimer = setTimeout(() => {
      this.readTimer = undefined;
      if (want()) this.markRead();
    }, READ_AFTER_MS);
  }

  // ---------- navigation ----------

  go(r: Route) {
    // D184: a task opened from the whole-screen On hand (or from another whole-screen task) opens
    // at the whole screen too, as on the Mac; one opened from the conversation stands beside it.
    if (r.name === "task" && r.full === undefined && this.route.name !== "conv" && this.route.full) r = { ...r, full: true };
    const hash = routeHash(r);
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname);
    const was = this.route;
    // Taking the whole screen, or going back beside the conversation, morphs rather than jumps
    // (a view transition where the browser has one; none under reduced motion).
    if (morphs(was, r)) return morph(() => this.applyRoute(r));
    // D290: a level deeper, back, or one task to the next moves as its kind says (nav.ts).
    // Wide, the conversation and On hand beside it look the same: nothing moves between them.
    const k = wideNow() && was.name !== "task" && r.name !== "task" ? undefined : kindOf(was, r);
    if (k) return navMove(k, () => this.applyRoute(r), r.name === "task" ? r.id : was.name === "task" ? was.id : undefined);
    this.applyRoute(r);
  }

  /** D184: the level shown takes the whole screen (on) or goes back beside the conversation. */
  fill(on: boolean) {
    const r = this.route;
    if (r.name === "conv") return on ? this.go({ name: "onhand", full: true }) : undefined;
    if (on) return this.go({ ...r, full: true });
    this.go(r.name === "task" ? { name: "task", id: r.id, full: false } : { name: "onhand" });
  }

  applyRoute(r: Route) {
    this.route = r;
    if (r.name !== "conv") this.markRead();
    if (r.name === "task") this.history(r.id);
    scrollTo(0, 0);
    this.changed();
  }

  /** #onhand, #task=<id>, #d=<id> (a decision, opened from a notification), #settings. */
  fromHash(hash = location.hash) {
    const task = /^#task=(.+)$/.exec(hash);
    const d = /^#d=(.+)$/.exec(hash);
    if (task) {
      const [id, full] = task[1]!.split("/");
      return this.applyRoute(full === "full" ? { name: "task", id: decodeURIComponent(id!), full: true } : { name: "task", id: decodeURIComponent(id!) });
    }
    if (hash === "#onhand") return this.applyRoute({ name: "onhand" });
    if (hash === "#onhand/full") return this.applyRoute({ name: "onhand", full: true });
    this.route = { name: "conv" };
    const set = /^#settings(?:=(partner|memory|peers|notify|accounts|todos|chats|autofill|devices|phone))?$/.exec(hash);
    if (set) {
      history.replaceState(null, "", location.pathname);
      return this.openSettings((set[1] ?? "") as SettingsPage);
    }
    if (d) {
      this.sheet = { kind: "decision", id: decodeURIComponent(d[1]!) };
      this.flash = this.sheet.id;
      history.replaceState(null, "", location.pathname);
    }
    this.changed();
  }

  /**
   * D284: a task's history, newest first. What the store holds shows at once; the newest window
   * (HISTORY_FIRST events) is asked when it was never loaded or a new socket may have left a gap,
   * with its session index (D320); after that, pages come for what is on screen (windowStep).
   */
  history(id: string, force = false) {
    const t = this.S.tasks.get(id);
    if (!this.S.welcomed) return;
    // D320: its session index first (all of it, or from its last turn after a new socket).
    if (!t?.indexPending && (!t?.index || t.indexStale)) {
      const from = t?.index && t.indexStale ? t.index.turns.at(-1)?.seq : undefined;
      this.S.task(id).indexPending = true;
      this.send({ t: "task_index", taskId: id, ...(from ? { fromSeq: from } : {}) });
    }
    if (t?.histPending) return;
    if (!force && (this.historyAsked.has(id) || t?.historyLoaded) && !t?.histStale) return this.windowStep(id);
    this.historyAsked.add(id);
    this.askHistory(id, 0);
  }

  private askHistory(id: string, beforeSeq: number) {
    const limit = beforeSeq ? HISTORY_PAGE : HISTORY_FIRST;
    this.S.historyAsked(id, limit);
    this.send({ t: "task_history", taskId: id, limit, ...(beforeSeq ? { beforeSeq } : {}) });
  }

  /** D320: what is on screen of each open task (index turns), from its page. */
  private views = new Map<string, View>();

  /**
   * D320: the page says which turns are on screen and which way the reader moves; the window
   * follows: far events are let go, and the next page ahead of the scroll is asked.
   */
  view(id: string, v: View) {
    const o = this.views.get(id);
    if (o && o.first === v.first && o.last === v.last && o.dir === v.dir) return;
    this.views.set(id, v);
    this.windowStep(id);
  }

  /**
   * D320: one step of an open task's window: let go of what is far from the screen, then ask the
   * next page it needs (one at a time). Without a session index yet (or from a home before D320),
   * nothing: what is held shows, and the head asks for more (moreAtHead).
   */
  private windowStep(id: string) {
    if (!this.S.welcomed) return;
    const a = windowAsk(this.S, id, this.views.get(id));
    if (!a) return;
    this.S.historyAsked(id, a.limit);
    this.send({ t: "task_history", taskId: id, ...a });
  }

  private pageHistory(id: string) {
    if (this.route.name === "task" && this.route.id === id) this.windowStep(id);
  }

  /** D284: the reader reached the head of a task with no session index (a home before D320): an older page. */
  moreAtHead(id: string) {
    const t = this.S.tasks.get(id);
    if (t?.index) return;
    const before = olderPage(t);
    if (before) this.askHistory(id, before);
  }

  // ---------- actions ----------

  /** D236: reply to this message: its imprint slides into the composer and the field takes focus. */
  startReply(r: Replying) {
    this.replying = r;
    haptic("light");
    this.changed();
    requestAnimationFrame(() => (document.getElementById("composer") as HTMLTextAreaElement | null)?.focus());
  }
  cancelReply() {
    if (!this.replying) return;
    this.replying = undefined;
    this.changed();
  }
  /** D236: tap an imprint: the message it quotes comes into view and is found (its own tint
   *  deepens once, and it settles). One no longer on this screen says so in a toast. */
  jumpTo(seq: number): boolean {
    const el = document.querySelector<HTMLElement>(`[data-seq="${seq}"]`) ?? document.querySelector<HTMLElement>(`[data-seqs~="${seq}"]`);
    if (!el) {
      this.toast(this.L.t("reply.gone"));
      return false;
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    el.classList.remove("found");
    void el.offsetWidth; // found twice: the animation starts again
    el.classList.add("found");
    setTimeout(() => el.classList.remove("found"), 1600);
    return true;
  }

  /** D303: words a tap says for the person (a choice, a checklist's progress): sent as their reply,
   *  without the composer's pictures or its reply-to. */
  sendWords(text: string) {
    text = text.trim();
    if (!text) return;
    const clientId = `p${Date.now()}-${++this.nextClient}`;
    this.pending.push({ clientId, text });
    this.thinkingSince = Date.now();
    this.markRead();
    this.send({ t: "send", text, clientId });
    haptic("light");
    this.changed();
  }

  sendMessage(text: string, force = false): boolean {
    text = text.trim();
    const pics = this.picks.get("") ?? [];
    if (!text && !pics.length) return false;
    if (text && !force && looksSecret(text)) {
      this.held = { text };
      this.changed();
      return false;
    }
    this.held = undefined;
    const clientId = `p${Date.now()}-${++this.nextClient}`;
    const reply = this.replying;
    this.replying = undefined;
    const p: AppState["pending"][number] = { clientId, text, ...(pics.length ? { pics } : {}), ...(reply ? { reply } : {}) };
    noteFlights(pics);
    this.picks.delete("");
    this.pending.push(p);
    this.thinkingSince = Date.now();
    this.markRead();
    // D206: the pictures went up when they were picked; one still going holds the message (with its words).
    const want = reply ? { reply: wantOf(reply) } : {};
    this.afterUpload(pics, (media) => this.send({ t: "send", text, clientId, ...(media.length ? { media } : {}), ...want }), () => ((p.failed = true), this.changed()));
    this.changed();
    return true;
  }

  // ---------- pictures (D206) ----------

  /** Pictures and files picked, pasted or dropped: a picture made ready on this phone, a file as it
   *  is (D259), and sent up at once. A file over the home's cap is said, never added. */
  addFiles(where: string, files: File[]) {
    const { pics, files: docs } = picturesIn(files);
    const big = docs.filter((f) => f.size > MEDIA_LIMITS.file);
    const all = [...pics.map((file) => ({ file, kind: "picture" as const })), ...docs.filter((f) => f.size <= MEDIA_LIMITS.file).map((file) => ({ file, kind: "file" as const }))];
    if (big.length) this.toast(tooBigWords());
    const list = this.picks.get(where) ?? [];
    const room = MEDIA_LIMITS.perMessage - list.length;
    if (all.length > room) this.toast(this.L.t("media.tooMany", MEDIA_LIMITS.perMessage));
    if (!all.length) return;
    for (const { file, kind } of all.slice(0, Math.max(0, room))) {
      const pic: Pic = { key: `m${Date.now()}-${++this.nextClient}`, kind, name: file.name || (kind === "file" ? "file" : "image.jpg"), local: kind === "picture" ? URL.createObjectURL(file) : "", w: 4, h: 3, state: kind === "file" ? "uploading" : "preparing", progress: 0, file };
      list.push(pic);
      void this.lift(pic);
    }
    this.picks.set(where, list);
    haptic("light");
    this.changed();
  }

  private async lift(pic: Pic) {
    pic.error = undefined;
    if (pic.kind === "picture" && !pic.prepared) {
      // A picture this browser can't read (a TIFF in Chrome, a broken one) goes as the file it is.
      try {
        pic.state = "preparing";
        this.changed();
        pic.prepared = await prepare(pic.file);
      } catch {
        if (pic.local) URL.revokeObjectURL(pic.local);
        if (pic.file.size > MEDIA_LIMITS.file) {
          pic.state = "failed";
          pic.error = tooBigWords();
          this.toast(pic.error);
          this.changed();
          for (const fn of this.lifted.splice(0)) fn();
          return;
        }
        (pic.kind = "file"), (pic.local = "");
      }
    }
    if (pic.kind === "file") {
      pic.state = "uploading";
      pic.progress = 0;
      this.changed();
      try {
        pic.ref = await upload(pic.file, pic.name, (f) => ((pic.progress = f), this.changed()));
        pic.progress = 1;
        pic.state = "done";
      } catch (err) {
        pic.state = "failed";
        pic.error = (err as Error).message;
        if (pic.error === tooBigWords()) this.toast(pic.error);
      }
      this.changed();
      for (const fn of this.lifted.splice(0)) fn();
      return;
    }
    pic.state = "preparing";
    this.changed();
    try {
      pic.prepared ??= await prepare(pic.file);
      pic.w = pic.prepared.w;
      pic.h = pic.prepared.h;
      pic.state = "uploading";
      this.changed();
      const name = pic.name.replace(/\.(heic|heif)$/i, ".jpg");
      pic.ref = await upload(pic.prepared, name, (f) => ((pic.progress = f), this.changed()));
      pic.progress = 1;
      pic.state = "done";
      keepLocal(pic);
    } catch (err) {
      pic.state = "failed";
      pic.error = (err as Error).message;
    }
    this.changed();
    for (const fn of this.lifted.splice(0)) fn();
  }
  private lifted: (() => void)[] = [];

  /** Runs `then` with the ids once every picture is up; `fail` once one didn't make it (Retry tries again). */
  afterUpload(pics: Pic[], then: (media: string[]) => void, fail: () => void) {
    const check = () => {
      if (pics.every((p) => p.state === "done" && p.ref)) return then(pics.map((p) => p.ref!.id)), true;
      if (pics.some((p) => p.state === "failed")) return fail(), true;
      return false;
    };
    if (check()) return;
    const wait = () => {
      if (!check()) this.lifted.push(wait);
    };
    this.lifted.push(wait);
  }

  removePic(where: string, key: string) {
    const list = (this.picks.get(where) ?? []).filter((p) => {
      if (p.key === key && p.local) URL.revokeObjectURL(p.local);
      return p.key !== key;
    });
    if (list.length) this.picks.set(where, list);
    else this.picks.delete(where);
    this.changed();
  }

  retryPic(where: string, key: string) {
    const p = this.picks.get(where)?.find((x) => x.key === key);
    if (p) void this.lift(p);
  }

  /** A message held for a picture that didn't go up: try that picture again, then send it all. */
  retryPending(clientId: string) {
    const p = this.pending.find((x) => x.clientId === clientId);
    if (!p?.pics) return;
    p.failed = false;
    for (const x of p.pics) if (x.state === "failed") void this.lift(x);
    this.afterUpload(p.pics, (media) => this.send({ t: "send", text: p.text, clientId, ...(media.length ? { media } : {}), ...(p.reply ? { reply: wantOf(p.reply) } : {}) }), () => ((p.failed = true), this.changed()));
    this.changed();
  }

  /** The New task card's pictures, once up (D206: they go to the task with the words). */
  newTaskMedia(): { ready: boolean; ids: string[] } {
    const pics = this.picks.get("new") ?? [];
    return { ready: pics.every((p) => p.state === "done" && p.ref), ids: pics.flatMap((p) => (p.ref ? [p.ref.id] : [])) };
  }

  /** D268: while the task works a message steers it (it reads it at its next step) unless `mode`
   *  `queue` (After this, ⌥↩: it waits until the task is done). */
  sendToTask(id: string, text: string, force = false, queue = false): boolean {
    text = text.trim();
    const pics = this.picks.get(id) ?? [];
    if (!text && !pics.length) return false;
    if (text && !force && looksSecret(text)) {
      this.held = { taskId: id, text };
      this.changed();
      return false;
    }
    this.held = undefined;
    const clientId = `t${Date.now()}-${++this.nextClient}`;
    const sd = this.S.addSend(id, text, Date.now(), clientId);
    if (pics.length) noteFlights(pics), (sd.pics = pics), this.picks.delete(id);
    const task = this.S.tasks.get(id);
    const busy = !!task && ["working", "queued"].includes(attention(task));
    const mode = queue ? "queue" : busy ? "steer" : undefined;
    if (mode) sd.mode = mode;
    const go = () =>
      this.afterUpload(
        pics,
        (media) => {
          sd.failed = undefined;
          if (media.length) sd.media = media;
          this.send({ t: "task_send", taskId: id, text, clientId, ...(media.length ? { media } : {}), ...(mode ? { mode } : {}) });
        },
        () => ((sd.failed = this.L.t("media.failed")), (sd.retry = () => (pics.forEach((p) => p.state === "failed" && void this.lift(p)), (sd.failed = undefined), go(), this.changed())), this.changed()),
      );
    go();
    this.changed();
    return true;
  }

  /**
   * D325: one of the person's held messages (the card's held): changed, taken back, or said now
   * (steered in while it works, else the next turn). Shown at once; the home's next card confirms.
   */
  heldOp(taskId: string, id: string, op: "edit" | "drop" | "now", text?: string) {
    const card = this.S.tasks.get(taskId)?.card;
    const held = card?.held ?? [];
    const i = held.findIndex((h) => h.id === id);
    if (!card || i < 0) return;
    const h = held[i]!;
    if (op === "edit") {
      text = (text ?? "").trim();
      if (!text || text === h.text) return;
      card.held = held.map((x, j) => (j === i ? { ...x, text: text! } : x));
    } else {
      card.held = held.filter((_, j) => j !== i);
      // Said now: a bubble at once, like anything sent (it is acked by its own id).
      if (op === "now") {
        const sd = this.S.addSend(taskId, h.text, Date.now(), id);
        if (h.media?.length) sd.media = h.media.map((m) => m.id);
        sd.mode = "steer";
      }
    }
    if (!card.held.length) delete card.held;
    this.send({ t: "task_held", taskId, id, op, ...(op === "edit" ? { text } : {}) });
    haptic("light");
    this.changed();
  }

  sendHeld() {
    const h = this.held;
    if (!h) return;
    if (h.taskId) this.sendToTask(h.taskId, h.text, true), this.taskDrafts.set(h.taskId, "");
    else this.sendMessage(h.text, true), (this.draft = "");
  }

  /** D151: open the live view of Ducter's browser for a sign-in card, sized to this screen. */
  openLive(decisionId: string, site: string, size: { width: number; height: number; scale?: number }, tryIt = false, device?: string) {
    // D154: Try it is the same view on a harmless page, with no card behind it.
    const lv: NonNullable<AppState["live"]> = { decisionId, site, state: "opening", size, ...(tryIt ? { try: true } : {}), ...(device ? { device } : {}) };
    this.live = lv;
    // The server gives up on its own steps well before (a launch 20 s, each step 15 s).
    setTimeout(() => {
      if (this.live === lv && !lv.src) (lv.stuck = true), this.changed();
    }, LIVE_STUCK_MS);
    this.send({ t: "live_open", decisionId, width: Math.round(size.width), height: Math.round(size.height), ...(size.scale ? { scale: size.scale } : {}), ...(tryIt ? { try: true } : {}), ...(device ? { device } : {}) });
    haptic("light");
    this.changed();
  }

  /** D190, 看它上网 / Watch it browse: the tab this task is working in, live, in its turn. */
  watchLive(taskId: string, size: { width: number; height: number; scale?: number }) {
    const card = this.S.onHand?.tasks.find((c) => c.taskId === taskId);
    const lv: NonNullable<AppState["live"]> = { decisionId: WATCH_LIVE, site: "", state: "opening", size, watch: true, taskId, turn: "agent", ...(card ? { task: { title: card.title, harness: card.harness } } : {}) };
    this.live = lv;
    setTimeout(() => {
      if (this.live === lv && lv.state === "opening") (lv.stuck = true), this.changed();
    }, LIVE_STUCK_MS);
    this.send({ t: "live_open", decisionId: WATCH_LIVE, taskId, width: Math.round(size.width), height: Math.round(size.height), ...(size.scale ? { scale: size.scale } : {}) });
    haptic("light");
    this.changed();
  }

  /** D190: 换我来 / My turn, or 还给它 / Hand it back. */
  liveTurn(mine: boolean) {
    if (!this.live?.id) return;
    this.send({ t: "live_turn", id: this.live.id, mine });
    haptic(mine ? "light" : "success");
  }

  /** D190: out of sight (the app in the background), no frames; back, they come again. */
  livePause(paused: boolean) {
    if (this.live?.id) this.send({ t: "live_pause", id: this.live.id, paused });
  }

  /** 再试一次 after the view got stuck: the same open again. */
  retryLive() {
    const lv = this.live;
    if (lv?.watch && lv.taskId) this.watchLive(lv.taskId, lv.size);
    else if (lv) this.openLive(lv.decisionId, lv.site, lv.size, !!lv.try, lv.device);
  }

  liveFrame(f: Extract<ServerFrame, { t: "live" | "live_frame" | "live_turn" | "live_doing" }>) {
    const lv = this.live;
    if (f.t === "live_turn") {
      if (!lv || lv.id !== f.id) return;
      lv.turn = f.turn;
      lv.here = f.here;
      if (f.turn === "you") lv.doing = undefined;
      return this.changed();
    }
    if (f.t === "live_doing") {
      if (!lv || lv.id !== f.id) return;
      lv.doing = f.doing ?? undefined;
      lv.doingAt = Date.now();
      return this.changed();
    }
    if (f.t === "live") {
      if (!lv || lv.decisionId !== f.decisionId) return;
      if (f.state === "open") Object.assign(lv, { id: f.id, state: "open", url: f.url, title: f.title, w: f.width, h: f.height, ...(f.browser ? { browser: f.browser } : {}), ...(f.turn ? { turn: f.turn, here: !!f.here } : {}), ...(f.task ? { task: f.task } : {}) });
      else {
        // Done answers the card; anything else just closes the view (the card stays).
        if (f.reason === "failed" && f.message) this.toast(this.L.t("live.failed", f.message));
        if (f.reason === "replaced") this.toast(this.L.t("live.replaced"));
        this.live = undefined;
      }
      return this.changed();
    }
    if (!lv || lv.id !== f.id) return;
    lv.src = `data:image/jpeg;base64,${f.data}`;
    lv.seq = f.seq;
    lv.w = f.width;
    lv.h = f.height;
    if (f.url) lv.url = f.url;
    this.changed();
  }

  /** The frame is on screen: ask for the next (one frame in flight). */
  liveShown(seq: number) {
    if (this.live?.id) this.send({ t: "live_ack", id: this.live.id, seq });
  }

  liveInput(input: import("@ducter/protocol").LiveInput) {
    if (this.live?.id) this.send({ t: "live_input", id: this.live.id, input });
  }

  /** 好了 / Done (done) or 先不登了 / Not now. */
  closeLive(done: boolean) {
    const lv = this.live;
    if (!lv) return;
    if (lv.id) this.send({ t: "live_close", id: lv.id, done });
    if (done) haptic("success");
    this.live = undefined;
    this.changed();
  }

  /** D191: save one sign-in, card or the details; `done` runs when the home says it is saved. */
  savedPut(item: import("@ducter/protocol").SavedInput, done?: () => void) {
    this.savedFailed = false;
    this.savedDone = done;
    this.send({ t: "saved_put", item });
  }
  savedRemove(id: string, done?: () => void) {
    this.savedFailed = false;
    this.savedDone = done;
    haptic("warning");
    this.send({ t: "saved_remove", id });
  }
  /** D191: Go on a 付款 / Pay card, with the card's security code (it goes with this Go only). */
  pay(id: string, cvc: string) {
    const d = this.S.decisions.get(id);
    if (d) d.pending = "go";
    if (navigator.vibrate) navigator.vibrate(8);
    haptic("success");
    this.markRead();
    this.send({ t: "decide", decisionId: id, option: "go", ...(cvc ? { cvc } : {}) });
    this.changed();
  }
  /** D233: 保存，继续 / Save and continue on a key card: the key goes with this Go only (kept unless once). */
  giveKey(id: string, key: string, once: boolean) {
    const d = this.S.decisions.get(id);
    if (d) d.pending = "go";
    if (navigator.vibrate) navigator.vibrate(8);
    haptic("success");
    this.markRead();
    this.send({ t: "decide", decisionId: id, option: "go", key, once });
    this.changed();
  }
  /** D233: 让任务向我要密钥 / Let tasks ask me for keys. */
  setAskKeys(on: boolean) {
    if (this.saved) this.saved = { ...this.saved, askKeys: on };
    this.send({ t: "saved_ask_keys", on });
    this.changed();
  }
  decide(id: string, option: "go" | "hold" | "reply", text?: string) {
    const d = this.S.decisions.get(id);
    if (d) d.pending = option;
    this.replyOpen.delete(id);
    if (navigator.vibrate) navigator.vibrate(8);
    haptic(option === "go" ? "success" : "light");
    this.markRead();
    this.send({ t: "decide", decisionId: id, option, ...(text ? { text } : {}) });
    this.changed();
  }

  defaultable(): DecisionState[] {
    return this.S.openDecisions().filter((d) => d.reversible);
  }

  goOnAllDefaults() {
    for (const d of this.defaultable()) this.decide(d.decisionId, d.defaultOption === "go" ? "go" : "hold");
  }

  taskAction(id: string, action: "interrupt" | "drop" | "reopen" | "merge" | "open_pr") {
    const t = this.S.tasks.get(id);
    if (t && (action === "merge" || action === "open_pr")) t.acting = action;
    this.send({ t: "task_action", taskId: id, action });
    this.changed();
  }

  /** D142, a folder task: 改回去 / Undo all changes (path: one entry; force: after confirming),
   *  or 就这样 / Keep the changes. The list comes back fresh after either. */
  folderAction(id: string, action: "undo" | "keep", o: { path?: string; force?: boolean } = {}) {
    const t = this.S.tasks.get(id);
    if (t) (t.confirm = undefined), (t.acting = o.path ? undefined : action);
    this.send({ t: "task_action", taskId: id, action, ...o });
    this.changed();
  }

  /** D142: ask for a folder task's list (a walk of the folder on the machine that holds it). */
  folderChanges(id: string) {
    if (this.S.welcomed) this.send({ t: "folder_changes", taskId: id });
  }

  /** Sends an action again after its result was lost (unsure). */
  retryAction(id: string) {
    const t = this.S.tasks.get(id);
    const action = t?.unsure;
    if (!t || (action !== "merge" && action !== "open_pr")) return;
    t.unsure = undefined;
    this.taskAction(id, action);
  }

  drop(id: string) {
    const t = this.S.tasks.get(id);
    this.dropped = { id, until: Date.now() + UNDO_MS };
    this.taskAction(id, "drop");
    this.toast(this.L.t("undo.dropped", t ? title(t) : ""), { label: this.L.t("undo.action"), run: () => this.undoDrop() }, UNDO_MS);
  }

  undoDrop() {
    if (!this.dropped || Date.now() > this.dropped.until) return;
    this.taskAction(this.dropped.id, "reopen");
    this.dropped = undefined;
  }

  // ---------- derived ----------

  /** The partner owes an answer: the user's last message has no ack or reply after it. */
  thinking(): boolean {
    // A message held for a picture that didn't go up isn't with the partner yet (D206).
    if (this.pending.some((p) => !p.failed)) return true;
    for (let i = this.S.channel.length - 1; i >= 0; i--) {
      const e = this.S.channel[i]!;
      // A turn that ended after the message without a word (an ask, or nothing to say) answered it.
      if (e.user) return e.firstSeq > this.S.activityEndedAt;
      if (e.ai || e.job || (e.decision && !e.decision.taskId)) return false;
    }
    return false;
  }

  presence(): "idle" | "working" | "needsyou" | "done" | "napping" | "waiting" {
    if (this.status === "offline") return "napping";
    if (this.S.openDecisions().length) return "needsyou";
    const b = this.S.board();
    if (b.lanes[LANE.working]!.length || this.thinking()) return "working";
    // Nothing moving, something it waits for (D112): it sits and looks out.
    if (b.lanes[LANE.waiting]!.length || this.S.armedWaiters().some((w) => w.check || w.event)) return "waiting";
    if (this.doneAt && Date.now() - this.doneAt < DONE_GLOW_MS) {
      setTimeout(() => this.changed(), DONE_GLOW_MS);
      return "done";
    }
    return "idle";
  }

  /** 今天做完 / Done today over the whole board, the same count On hand and the menu bar say (D310). */
  doneToday(): number {
    return doneTodayOf(this.S.board().lanes[LANE.done]!);
  }

  summary(): string {
    return this.summaryParts().words;
  }

  /** The counts line, and where it leads (D270): link is false while it says connecting or
   *  offline; filter is the strip's (1–4) when it names one thing only, else 0 (all of On hand). */
  summaryParts(): { words: string; parts?: string[]; link: boolean; filter: number } {
    const L = this.L;
    if (this.status === "offline") return { words: L.t("conn.offline"), link: false, filter: 0 };
    // D209: painted from the last screen, the line it showed then stands until the home answers
    // (a second at most), rather than "connecting" on every open.
    if (!this.S.welcomed && !this.fromGlance) return { words: L.t("conn.connecting"), link: false, filter: 0 };
    const b = this.S.board();
    const parts: string[] = [];
    const kinds: number[] = [];
    const add = (kind: number, words: string) => (parts.push(words), kinds.push(kind));
    // D309: one count across partners: On hand is everyone's already; the others' own questions join it.
    const needs = needsAcross(b.lanes[LANE.needs]!.length + this.S.partnerDecisions().length, this.partners, this.S.persona || this.partnerShown);
    if (needs) add(1, L.t("header.needs", needs));
    // Thinking is said where the reply will appear (Presence, D104), not here.
    if (b.lanes[LANE.working]!.length) add(2, L.t("header.working", b.lanes[LANE.working]!.length));
    // What it waits for is felt here, not in the conversation (D104, D115).
    const waiting = b.lanes[LANE.waiting]!.length + this.S.armedWaiters().filter((w) => !w.taskId).length;
    if (waiting && parts.length < 2) add(3, L.t("header.waiting", waiting));
    const done = this.doneToday();
    // A phone header has room for two things: what needs you and what's moving come first.
    if (done && parts.length < 2) add(4, L.t("header.done", done));
    return { words: parts.length ? spoken(L, ...parts) : L.t("header.summary.none"), parts, link: true, filter: kinds.length === 1 ? kinds[0]! : 0 };
  }

  /** The conversation's rows (desktop rows()): decisions inside a living message show once,
   * a task's chip shows under the newest message about it, a done line the partner already
   * reported is left out, and messages not yet echoed come last. */
  rows() {
    const S = this.S;
    const echoed = new Set<string>();
    let rows: Entry[] = [];
    for (const e of S.channel) {
      if (e.user?.clientId) echoed.add(e.user.clientId);
      if (e.decision && S.decisionShownInLiving(e.decision.decisionId)) continue;
      rows.push(e);
    }
    const resultShown = new Set<string>();
    for (const e of rows) if (e.ai?.replyTo) for (const id of S.tasksOfReply(e.ai.replyTo)) if (S.tasks.get(id) && finished(S.tasks.get(id)!)) resultShown.add(id);
    const livingNewest = new Map<string, number>();
    const key = (it: { taskId: string; kind: string; text: string }) => `${it.taskId}|${it.kind}|${it.text}`;
    for (const e of rows) for (const it of e.living?.items ?? []) livingNewest.set(key(it), Math.max(livingNewest.get(key(it)) ?? 0, e.firstSeq));
    const livingItems = (e: Entry) =>
      (e.living?.items ?? []).filter((it) => !((it.kind === "done" || it.kind === "failed") && resultShown.has(it.taskId)) && (it.kind === "decision" || (livingNewest.get(key(it)) ?? 0) <= e.firstSeq));
    rows = rows.filter((e) => !e.living || livingItems(e).length > 0);
    const chipOwner = new Map<string, number>();
    // The action row shows once, under the newest message about the task: the ack, then the
    // living message's done line, then the partner's own result.
    for (const e of rows) {
      if (e.job?.status?.taskId) chipOwner.set(e.job.status.taskId, e.firstSeq);
      else if (e.ai?.replyTo) for (const id of S.tasksOfReply(e.ai.replyTo)) chipOwner.set(id, e.firstSeq);
      else if (e.living) for (const it of livingItems(e)) if (it.kind === "done" || it.kind === "failed") chipOwner.set(it.taskId, e.firstSeq);
    }
    this.pending = this.pending.filter((p) => !echoed.has(p.clientId));
    return { rows, livingItems, chipOwner };
  }
}

function short(ref: string) {
  return ref.length > 7 && !ref.includes("/") ? ref.slice(0, 7) : ref;
}

export const A = new AppState();
export { laneOf };

/** This device's time zone: personal-time routines follow it (D114). */
function zone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
