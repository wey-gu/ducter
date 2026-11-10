// The phone app's state and actions (the views read it and call these). One store, one socket.
import type { AgentReason, MemPluginReason, BrainNow, Candidate, ClientFrame, Place, PlaceChoice, ConnectionReason, ConnectionView, DeviceHarness, DeviceView, MemView, OoDetect, Reach, RuleView, ServerFrame, Settings, SettingsPatch, UpdateReason } from "@ducter/protocol";
import { WATCH_LIVE } from "@ducter/protocol";
import { Api, Connection, deviceName, type ConnStatus, type Me, wsUrl } from "./conn.ts";
import { detectLang, langOfText, strings, type Handheld, type Lang, type Strings } from "./i18n.ts";
import { pushState, type PushState } from "./push-client.ts";
import { haptic } from "./native.ts";
import { attention, finished, LANE, laneOf, looksSecret, placeOf, Store, title, type DecisionState, type Entry } from "./store.ts";
import { withoutStaleAgentUpdate, withoutStaleFailure } from "./format.ts";
import { canFillNow, wideNow } from "./fold.ts";

/** An iPad says "this iPad" where a phone says "this phone" (D176). */
const HANDHELD: Handheld = typeof navigator !== "undefined" && deviceName().name.startsWith("iPad") ? "ipad" : "phone";

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
function morph(apply: () => void) {
  const d = typeof document === "object" ? (document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown }) : undefined;
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!d?.startViewTransition || still) return apply();
  d.startViewTransition(() => {
    apply();
    // The page renders on the next frame (A.changed → the app's state): wait for it.
    return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
}
/** Settings (D150) is a list of sections; page is the one pushed ("" is the list). */
export type SettingsPage = "" | "partner" | "notify" | "accounts" | "devices" | "phone";
export type Sheet = { kind: "decision"; id: string } | { kind: "settings"; page?: SettingsPage } | { kind: "newtask" } | null;

/** 开一件事 / New task's sheet (D128): what the user chose and typed, and how starting went. */
export interface NewTaskDraft {
  words: string;
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
  // again keeps the sheet after a start (⇧⌘↩), started says what just started.
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
}

/** D185: the "every few hours" the sheet offers. */
export const EVERY_HOURS = [1, 2, 4, 8];
const WHO = "ducter.newtask.who";

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
export const candKey = (c: Candidate) => `${c.device ? c.device + "|" : ""}${c.harness}/${c.model ?? ""}`;
// Kept here too: storage can be missing or refuse (a private window).
let lastWho = "";
const rememberedWho = () => {
  try {
    return localStorage.getItem(WHO) ?? lastWho;
  } catch {
    return lastWho;
  }
};
const freshDraft = (words = ""): NewTaskDraft => ({ words, placeKey: "", branch: "", branchOpen: false, pick: rememberedWho(), sending: "", err: "", when: "", atDay: 1, atTime: "9:00", every: 0, weekday: 1, hours: 1, condition: "" });

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export const READ_AFTER_MS = 1200;

/** This phone's own interface language (Settings sheet): "auto" follows the system, then the user's words. */
export type UiLang = "auto" | Lang;
const UI_LANG = "ducter.lang";
export function savedUiLang(): UiLang {
  try {
    const v = localStorage.getItem(UI_LANG);
    return v === "zh" || v === "en" ? v : "auto";
  } catch {
    return "auto";
  }
}
export const UNDO_MS = 10_000;

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
  L: Strings = strings(this.uiLang === "auto" ? detectLang() : this.uiLang, HANDHELD);
  localeSet = this.uiLang !== "auto";
  /** The partner's settings (D71), once the server sent them; mem is what it remembers. */
  settings?: Settings;
  mem?: MemView;
  /** What the partner thinks with right now (D150), and the computer Ducter lives on. */
  brainNow?: BrainNow;
  homeName?: string;
  /** Who does the tasks (D89): Your rules, this Mac's AI agents (from devices), and who could
   *  do the task whose Switch who does it is open. */
  rules?: RuleView[];
  agents?: DeviceHarness[];
  /** D148: every device and every phone or window that reaches Ducter (Settings › Your devices), and
   *  why the last update or rename from here was refused. */
  devices?: DeviceView[];
  /** D151: the signed-in sites of Ducter's browser on the home, once asked for. */
  sites?: Extract<ServerFrame, { t: "browser_sites" }>;
  reach?: Reach;
  deviceAnswer?: { device: string; reason: UpdateReason | "name_taken" | "failed" };
  /** D156: the last agent update that was refused, on its row. */
  agentAnswer?: { device: string; harness: string; reason: AgentReason };
  /** D169: the last 装上 / Install of Nowledge Mem that didn't start, and why. */
  memAnswer?: { device: string; harness: string; reason: MemPluginReason };
  candidates = new Map<string, Candidate[]>();
  /** New task (D128): what the sheet offers (places, who could), as last sent; the draft. */
  newTaskOptions?: { places: PlaceChoice[]; candidates: Candidate[] };
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
  /** D166: 看了哪些 / What it read today, by connection, once asked for. */
  connReads = new Map<string, import("@ducter/protocol").ReadLine[]>();
  route: Route = { name: "conv" };
  sheet: Sheet = null;
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
  pending: { clientId: string; text: string }[] = [];
  draft = "";
  taskDrafts = new Map<string, string>();
  replyOpen = new Set<string>();
  replyDraft = new Map<string, string>();
  held?: { taskId?: string; text: string };
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
  changed() {
    for (const fn of this.listeners) fn();
    this.scheduleRead();
  }

  start(base: URL, api: Api, me: Me, token: () => string | undefined) {
    this.base = base;
    this.api = api;
    this.me = me;
    if (me.personaName) this.S.personaName = me.personaName;
    this.conn = new Connection(
      wsUrl(base),
      token,
      () => ({ t: "hello", ...(this.S.cursor > 0 ? { cursor: this.S.cursor } : {}), locale: this.L.lang, ...(zone() ? { tz: zone() } : {}), client: "web" }),
      (f) => this.receive(f),
      (s) => ((this.status = s), this.changed()),
    );
    this.conn.onWritten = (f) => {
      if (f.t === "task_action" && (f.action === "merge" || f.action === "open_pr")) this.actSent.set(f.taskId, f.action);
    };
    this.conn.start();
    void this.refreshPush();
  }

  async refreshPush() {
    this.push = await pushState().catch(() => "unsupported" as PushState);
    this.changed();
  }

  /** Work over time (D112-D114): Look now / Stop waiting, Pause / Resume / End, Stop the loop. */
  waiterAction(waiterId: string, action: "look" | "cancel" | "rearm") {
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

  receive(f: ServerFrame) {
    if (this.S.stale(f)) {
      // The Log started over (its data was reset): forget everything and say hello from scratch.
      this.S = new Store();
      this.pending = [];
      this.actSent.clear();
      this.inDoubt = undefined;
      this.historyAsked.clear();
      this.livingAway.clear();
      this.route = { name: "conv" };
      this.conn?.rehello();
    }
    if (f.t === "live" || f.t === "live_frame" || f.t === "live_turn" || f.t === "live_doing") return this.liveFrame(f);
    if (f.t === "browser_sites") {
      if (f.ok === false && f.message) this.toast(f.message);
      return void ((this.sites = f), this.changed());
    }
    if (f.t === "settings") return this.applySettings(f);
    if (f.t === "rules") return void ((this.rules = f.rules), this.changed());
    if (f.t === "devices") {
      const home = f.devices.find((d) => d.home);
      // A failure the device (or the agent's copy) has moved past is dropped (D167, D156).
      const devices = f.devices.map((d) => ({ ...d, ...(d.update ? { update: withoutStaleFailure(d.update) } : {}), harnesses: d.harnesses.map(withoutStaleAgentUpdate) }));
      return void ((this.agents = devices.find((d) => d.home)?.harnesses ?? home?.harnesses ?? []), (this.homeName = home?.name), (this.devices = devices), (this.reach = f.reach), this.changed());
    }
    if (f.t === "mem_plugin_result") return void ((this.memAnswer = f.ok ? undefined : { device: f.device, harness: f.harness, reason: f.reason ?? "failed" }), this.changed());
    // "Nothing newer" answers a stale view, never a failure: the devices frame that follows has the version there now.
    if (f.t === "agent_update_result") return void ((this.agentAnswer = f.ok || f.reason === "no_update" ? undefined : { device: f.device, harness: f.harness, reason: f.reason ?? "failed" }), this.changed());
    if (f.t === "update_result") return void ((this.checkingUpdates = false), (this.deviceAnswer = f.ok || f.update || f.reason === "no_release" ? undefined : { device: f.device, reason: f.reason ?? "failed" }), this.changed());
    if (f.t === "disconnect_result" || f.t === "rename_result") return void ((this.deviceAnswer = f.ok ? undefined : { device: f.device, reason: f.reason === "name_taken" ? "name_taken" : "failed" }), this.changed());
    if (f.t === "candidates") return void (this.candidates.set(f.taskId, f.candidates), this.changed());
    if (f.t === "task_new_options") return void ((this.newTaskOptions = { places: f.places, candidates: f.candidates }), this.changed());
    if (f.t === "task_new_result") return this.newTaskResult(f);
    // `ducter open <task>` (D128): show it as if tapped; back returns.
    if (f.t === "open_task") return void ((this.sheet = null), this.go({ name: "task", id: f.taskId }));
    if (f.t === "open_result") return;
    if (f.t === "connections") return (this.connections = f.connections), (this.oo = f.oo), this.changed();
    if (f.t === "connection_reads") return void (this.connReads.set(f.id, f.reads), this.changed());
    if (f.t === "connection_result") {
      this.connecting = false;
      // D158: a refusal stays on the Accounts card in the failed look; an add says what it reads now.
      this.connRefusal = !f.ok ? f.reason : undefined;
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
    for (const [id, t] of this.S.tasks) if (finished(t) && before.has(id) && !["done", "done_claimed", "failed"].includes(before.get(id)!)) this.doneAt = Date.now();
    if (f.t === "action_result") this.actSent.delete(f.taskId);
    if (f.t === "welcome") {
      this.readSent = 0;
      // What the old socket left unanswered: actions are settled from the Log after the replay;
      // messages go again, in order (core dedupes them, so none shows or lands twice).
      if (this.actSent.size) this.inDoubt = new Map([...(this.inDoubt ?? []), ...this.actSent]);
      this.actSent.clear();
      for (const r of this.S.resends(this.pending)) this.send(r);
      if (this.route.name === "task") this.history(this.route.id, true);
      // Settings are pushed only to sockets that asked: ask again on a new one.
      if (this.settings || this.sheet?.kind === "settings") this.askLoadout();
      // D157: every task says which computer it runs on once there are two: know them.
      else this.send({ t: "devices" });
      if (this.connections || this.sheet?.kind === "settings") this.send({ t: "connections" });
    }
    // on_hand closes the replay that follows a welcome.
    if (f.t === "on_hand" && this.inDoubt) this.S.settleInDoubt(this.inDoubt), (this.inDoubt = undefined);
    if (f.t === "events") for (const ev of f.events) if (!this.livingAway.has(ev.seq) && ev.kind === "living_msg") this.livingAway.set(ev.seq, (ev.seq <= this.S.headSeq && ev.seq > this.S.readUpTo) || document.hidden);
    this.followUserLanguage();
    this.drainActionResults();
    this.changed();
  }

  applySettings(f: Extract<ServerFrame, { t: "settings" }>) {
    this.settings = f.settings;
    this.mem = f.mem;
    this.brainNow = f.brainNow;
    if (f.settings.name) this.S.personaName = f.settings.name;
    if (f.forgot) {
      const title = this.forgetting.get(f.forgot.seq) ?? "";
      this.forgetting.delete(f.forgot.seq);
      this.toast(this.L.t(f.forgot.how === "mem" ? "partner.memory.forgot" : "partner.memory.hidden", title));
    }
    this.changed();
  }

  /** Opens this phone's Settings sheet, asking for the partner's settings. */
  openSettings(page: SettingsPage = "") {
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
  openSwitch(taskId: string) {
    if (this.switchFor === taskId) this.switchFor = "";
    else (this.switchFor = taskId), this.send({ t: "candidates", taskId });
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
  command(c: string) {
    const r = this.route;
    if (c === "new") {
      if (this.sheet?.kind === "newtask") return;
      const task = r.name === "task" ? this.S.tasks.get(r.id) : undefined;
      return this.openNewTask(task ? placeOf(task) : undefined);
    }
    if (c === "conv") return (this.sheet = null), this.go({ name: c });
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

  /** D157: the computer New task starts the task on: the user's pick, else where the best agent that can start now is. */
  ntComputer(): string {
    const list = this.newTaskOptions?.candidates ?? [];
    const pick = this.nt.computer;
    if (pick && (this.devices ?? []).some((d) => d.id === pick)) return pick;
    return list.find((c) => !c.blocked && !c.waits && c.device)?.device ?? (this.devices ?? []).find((d) => d.home)?.id ?? "";
  }

  /** D157: who New task offers: on the chosen computer, then agents that live only on another (elsewhere). */
  ntCands(): { list: Candidate[]; elsewhere: Set<string> } {
    const all = this.newTaskOptions?.candidates ?? [];
    const elsewhere = new Set<string>();
    if (!all.some((c) => c.device)) return { list: all, elsewhere };
    const comp = this.ntComputer();
    const list = all.filter((c) => c.device === comp);
    const here = new Set(list.map((c) => c.harness));
    for (const c of all) {
      if (c.device === comp || here.has(c.harness) || c.blocked) continue;
      here.add(c.harness);
      list.push(c);
      elsewhere.add(candKey(c));
    }
    return { list, elsewhere };
  }

  /** Who does it: the user's pick, else the top candidate that can. */
  chosenCandidate(): { c?: Candidate; picked: boolean } {
    const list = this.ntCands().list;
    const top = list.find((c) => !c.blocked);
    const pick = this.nt.pick ? list.find((c) => !c.blocked && candKey(c) === this.nt.pick) : undefined;
    if (pick) return { c: pick, picked: !top || candKey(top) !== this.nt.pick };
    return { c: top, picked: false };
  }

  pickPlace(p: PlaceChoice) {
    this.nt.list = "";
    if (placeKey(p.place) === placeKey(this.chosenPlace().place)) return this.changed();
    this.nt.placeKey = placeKey(p.place);
    this.nt.branch = "";
    this.nt.branchOpen = false;
    this.nt.err = "";
    this.send({ t: "task_new_options", ...(p.place.kind === "repo" || p.place.kind === "folder" ? { place: p.place } : {}) });
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
    nt.sending = `n${Date.now()}-${++this.nextClient}`;
    nt.err = "";
    this.send({ t: "task_new", words, ...(place ? { place } : {}), ...(c && (picked || (nt.pick && nt.computer)) ? { harness: c.harness, ...(c.model ? { model: c.model } : {}) } : {}), clientId: nt.sending, ...(when ? { when } : {}) });
    this.changed();
    return true;
  }

  private newTaskResult(f: Extract<ServerFrame, { t: "task_new_result" }>) {
    if (!this.nt.sending || f.clientId !== this.nt.sending) return;
    this.nt.sending = "";
    if (f.ok && (f.taskId || f.routineId)) {
      const nt = this.nt;
      if (nt.again) {
        // ⇧⌘↩ (D185): the sheet stays, empty, with the same place, who and when, saying what started.
        nt.words = nt.condition = nt.err = "";
        if (f.routine) nt.started = this.L.t("newtask.scheduled", f.routine.triggerWords, f.routine.name);
        else (nt.started = this.L.t("newtask.opened", f.card?.title ?? "")), (nt.startedTask = f.taskId ?? "");
        return this.changed();
      }
      this.nt = freshDraft();
      this.sheet = null;
      // A start later or on a schedule lives on On hand (its routine card).
      return f.taskId ? this.go({ name: "task", id: f.taskId }) : this.go({ name: "onhand" });
    }
    const r = f.reason;
    this.nt.err =
      r === "empty" || r === "no_agent" || r === "not_repo" || r === "offline" || r === "past" || r === "no_condition"
        ? this.L.t(`newtask.err.${r}`)
        : f.message
          ? this.L.t("newtask.err.failed", f.message.replace(/[.\s]+$/, ""))
          : this.L.t("newtask.err.unknown");
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

  /** Changes partner settings: shown at once, then confirmed by the server's frame. */
  setSettings(patch: SettingsPatch) {
    if (this.settings) this.settings = { ...this.settings, ...patch };
    if (patch.name) this.S.personaName = patch.name;
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
  updateDevice(device: string) {
    this.deviceAnswer = undefined;
    this.send({ t: "device_update", device });
    this.changed();
  }
  /** 现在检查 / Check now: the home reads the latest release again; fresh devices frames follow. */
  checkingUpdates = false;
  checkUpdates(device: string) {
    this.checkingUpdates = true;
    this.send({ t: "device_update", device, check: true });
    this.changed();
  }
  /** D169: one task on that device puts Nowledge Mem into that agent, following Mem's own guide. */
  installMem(device: string, harness: string) {
    this.memAnswer = undefined;
    this.send({ t: "mem_plugin_install", device, harness });
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
  askReads(id: string) {
    this.send({ t: "connection_reads", id });
  }
  /** D165: 有用 / 这类不用告诉我 under a find, and a note's ask. */
  reactFind(findId: string, reaction: "useful" | "mute") {
    this.S.findStates.set(findId, { findId, kind: this.S.findStates.get(findId)?.kind ?? "deadline", state: reaction === "mute" ? "muted" : "useful" });
    this.send({ t: "find_react", findId, reaction });
    this.changed();
  }
  answerNote(noteId: string, ask: "first_look" | "keep_note", yes: boolean) {
    this.send({ t: "proactive_answer", noteId, ask, yes });
  }
  removeConnection(id: string) {
    if (this.connections) this.connections = this.connections.filter((c) => c.id !== id);
    this.send({ t: "connection_remove", id });
    this.changed();
  }
  /**
   * For the devices stage (Isles, being rebuilt on the isles branch): the mailboxes that stand on
   * the island of the computer Ducter lives on. Connections always live there (D96).
   */
  homeMailboxes(): { id: string; name: string; source: ConnectionView["source"]; trouble: boolean }[] {
    return (this.connections ?? []).map((c) => ({ id: c.id, name: c.name, source: c.source, trouble: c.state === "unreachable" || c.state === "unauthorized" }));
  }

  /** Titles of the noted lines being forgotten, for the toast that answers. */
  private forgetting = new Map<number, string>();
  forget(seq: number) {
    const n = this.mem?.noted.find((x) => x.seq === seq);
    const title = n?.title ?? this.S.noted.find((x) => x.seq === seq)?.title;
    if (title) this.forgetting.set(seq, title);
    this.S.noted = this.S.noted.filter((x) => x.seq !== seq);
    if (this.mem) this.mem = { ...this.mem, noted: this.mem.noted.filter((n) => n.seq !== seq) };
    this.send({ t: "memory_forget", seq });
    this.changed();
  }

  /** The 记下了 / Noted lines a message's Details carry: those answering the same user message,
   *  under the last partner message that answers it (D104). */
  notedFor(e: Entry): { seq: number; title: string }[] {
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
    this.L = strings(v === "auto" ? detectLang() : v, HANDHELD);
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
      if (l !== this.L.lang) this.L = strings(l, HANDHELD);
    }
  }

  private drainActionResults() {
    for (const f of this.S.actionResults.splice(0)) {
      const t = this.S.tasks.get(f.taskId);
      const name = t ? title(t) : "";
      if (f.ok && f.action === "merge") this.toast(this.L.t("result.merged.toast", name, short(f.ref ?? "")));
      else if (f.ok && f.action === "open_pr") this.toast(this.L.t("result.pr.toast", f.ref ?? ""));
      else if (f.action === "switch") {
        if (f.ok) (this.switchFor = ""), this.toast(this.L.t("who.done", this.switching));
        else this.toast(this.L.t("who.failed", f.message ?? ""));
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
  private scheduleRead() {
    if (this.readTimer) return;
    const want = () => this.status === "connected" && this.route.name === "conv" && !this.sheet && document.visibilityState === "visible" && this.S.channelSeq > Math.max(this.S.readUpTo, this.readSent);
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
    const set = /^#settings(?:=(partner|notify|accounts|devices|phone))?$/.exec(hash);
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

  history(id: string, force = false) {
    const t = this.S.tasks.get(id);
    if (!force && (this.historyAsked.has(id) || t?.historyLoaded)) return;
    if (!this.S.welcomed) return;
    this.historyAsked.add(id);
    this.send({ t: "task_history", taskId: id, limit: 500 });
  }

  // ---------- actions ----------

  sendMessage(text: string, force = false): boolean {
    text = text.trim();
    if (!text) return false;
    if (!force && looksSecret(text)) {
      this.held = { text };
      this.changed();
      return false;
    }
    this.held = undefined;
    const clientId = `p${Date.now()}-${++this.nextClient}`;
    this.pending.push({ clientId, text });
    this.thinkingSince = Date.now();
    this.markRead();
    this.send({ t: "send", text, clientId });
    this.changed();
    return true;
  }

  sendToTask(id: string, text: string, force = false): boolean {
    text = text.trim();
    if (!text) return false;
    if (!force && looksSecret(text)) {
      this.held = { taskId: id, text };
      this.changed();
      return false;
    }
    this.held = undefined;
    const clientId = `t${Date.now()}-${++this.nextClient}`;
    this.S.addSend(id, text, Date.now(), clientId);
    this.send({ t: "task_send", taskId: id, text, clientId });
    this.changed();
    return true;
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
    if (this.pending.length) return true;
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

  doneToday(): number {
    const today = new Date().toDateString();
    return this.S.board().lanes[LANE.done]!.filter((t) => attention(t) !== "failed").filter((t) => {
      const at = t.card?.updatedAt ?? t.events.at(-1)?.ts;
      return !at || new Date(at).toDateString() === today;
    }).length;
  }

  summary(): string {
    const L = this.L;
    if (this.status === "offline") return L.t("conn.offline");
    if (!this.S.welcomed) return L.t("conn.connecting");
    const b = this.S.board();
    const parts: string[] = [];
    const needs = b.lanes[LANE.needs]!.length + this.S.partnerDecisions().length;
    if (needs) parts.push(L.t("header.needs", needs));
    // Thinking is said where the reply will appear (Presence, D104), not here.
    if (b.lanes[LANE.working]!.length) parts.push(L.t("header.working", b.lanes[LANE.working]!.length));
    // What it waits for is felt here, not in the conversation (D104, D115).
    const waiting = b.lanes[LANE.waiting]!.length + this.S.armedWaiters().filter((w) => !w.taskId).length;
    if (waiting && parts.length < 2) parts.push(L.t("header.waiting", waiting));
    const done = this.doneToday();
    // A phone header has room for two things: what needs you and what's moving come first.
    if (done && parts.length < 2) parts.push(L.t("header.done", done));
    return parts.length ? parts.join(" · ") : L.t("header.summary.none");
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
