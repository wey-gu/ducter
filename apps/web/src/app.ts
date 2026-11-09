// The phone app's state and actions (the views read it and call these). One store, one socket.
import type { ClientFrame, MemView, ServerFrame, Settings, SettingsPatch } from "@ducter/protocol";
import { Api, Connection, type ConnStatus, type Me, wsUrl } from "./conn.ts";
import { detectLang, langOfText, strings, type Lang, type Strings } from "./i18n.ts";
import { pushState, type PushState } from "./push-client.ts";
import { haptic } from "./native.ts";
import { attention, finished, LANE, laneOf, looksSecret, Store, title, type DecisionState, type Entry } from "./store.ts";

export type Route = { name: "conv" } | { name: "onhand" } | { name: "task"; id: string };
export type Sheet = { kind: "decision"; id: string } | { kind: "settings" } | null;

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
  L: Strings = strings(this.uiLang === "auto" ? detectLang() : this.uiLang);
  localeSet = this.uiLang !== "auto";
  /** The partner's settings (D71), once the server sent them; mem is what it remembers. */
  settings?: Settings;
  mem?: MemView;
  route: Route = { name: "conv" };
  sheet: Sheet = null;
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
      () => ({ t: "hello", ...(this.S.cursor > 0 ? { cursor: this.S.cursor } : {}), locale: this.L.lang }),
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
    if (f.t === "settings") return this.applySettings(f);
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
      if (this.settings || this.sheet?.kind === "settings") this.send({ t: "settings" });
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
    if (f.settings.name) this.S.personaName = f.settings.name;
    if (f.forgot) {
      const title = this.forgetting.get(f.forgot.seq) ?? "";
      this.forgetting.delete(f.forgot.seq);
      this.toast(this.L.t(f.forgot.how === "mem" ? "partner.memory.forgot" : "partner.memory.hidden", title));
    }
    this.changed();
  }

  /** Opens this phone's Settings sheet, asking for the partner's settings. */
  openSettings() {
    this.sheet = { kind: "settings" };
    if (this.S.welcomed) this.send({ t: "settings" });
    this.changed();
  }

  /** Changes partner settings: shown at once, then confirmed by the server's frame. */
  setSettings(patch: SettingsPatch) {
    if (this.settings) this.settings = { ...this.settings, ...patch };
    if (patch.name) this.S.personaName = patch.name;
    this.send({ t: "settings_set", patch });
    this.changed();
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
    this.L = strings(v === "auto" ? detectLang() : v);
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
      if (l !== this.L.lang) this.L = strings(l);
    }
  }

  private drainActionResults() {
    for (const f of this.S.actionResults.splice(0)) {
      const t = this.S.tasks.get(f.taskId);
      const name = t ? title(t) : "";
      if (f.ok && f.action === "merge") this.toast(this.L.t("result.merged.toast", name, short(f.ref ?? "")));
      else if (f.ok && f.action === "open_pr") this.toast(this.L.t("result.pr.toast", f.ref ?? ""));
      else if (!f.ok) this.toast(this.L.t("result.action.failed", f.message ?? ""));
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
    const hash = r.name === "onhand" ? "#onhand" : r.name === "task" ? `#task=${encodeURIComponent(r.id)}` : "";
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname);
    this.applyRoute(r);
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
    if (task) return this.applyRoute({ name: "task", id: decodeURIComponent(task[1]!) });
    if (hash === "#onhand") return this.applyRoute({ name: "onhand" });
    this.route = { name: "conv" };
    if (hash === "#settings") {
      history.replaceState(null, "", location.pathname);
      return this.openSettings();
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

  presence(): "idle" | "working" | "needsyou" | "done" | "napping" {
    if (this.status === "offline") return "napping";
    if (this.S.openDecisions().length) return "needsyou";
    const b = this.S.board();
    if (b.lanes[LANE.working]!.length || this.thinking()) return "working";
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
    const done = this.doneToday();
    // A phone header has room for two things: what needs you and what's moving come first.
    if (done && parts.length < 2) parts.push(L.t("header.done", done));
    if (parts.length) return parts.join(" · ");
    // A reminder or a waiting task is still something on hand.
    const waiting = b.lanes[LANE.waiting]!.length + this.S.armedWaiters().filter((w) => !w.taskId).length;
    return waiting ? L.t("header.waiting", waiting) : L.t("header.summary.none");
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
    for (const e of rows) {
      if (e.job?.status?.taskId) chipOwner.set(e.job.status.taskId, e.firstSeq);
      else if (e.ai?.replyTo) for (const id of S.tasksOfReply(e.ai.replyTo)) chipOwner.set(id, e.firstSeq);
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
