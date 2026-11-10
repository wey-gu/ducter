// The live view of Ducter's browser (D151, D154, D190): what a sign-in card, 试一下 / Try it and
// 看它上网 / Watch it browse open on the Mac app or the phone. The page is streamed as JPEG frames
// (CDP Page.startScreencast) over the client's own authenticated WebSocket, and in the user's
// turn their pointer and keys go back in (Input.*).
//
// Turns (D190). A view shows one tab. Whose turn it is belongs to the browser (the profile):
//   - the task's ("agent"): it drives, the user watches; nothing the user does goes in, and the
//     page keeps the task's own size (the screencast only scales it to the viewer);
//   - the user's ("you"): a sign-in and Try it start there; a watch gets there with 换我来 / My
//     turn. Then the page takes the viewer's size, and every task on that browser is blind (its
//     tools refuse before touching a page, tools.ts) until 还给它 / Hand it back, 好了 / Done or
//     the view closes. Handing back tells the task what changed, when it waited or the page moved.
//
// Rules held here:
//   - blind first: the profile is marked live (host.setLive) before the user's first input or
//     frame, and only unmarked once the user's turn ends;
//   - frames are presence, never history: nothing is logged or written, nothing reaches a model;
//   - one frame in flight per view: the next goes only after the client acks (and at most
//     `maxFps` a second), so a slow phone link gets fewer frames, not a queue; the JPEG's quality
//     and size step down when acks come back slowly and up again when they're quick;
//   - only the socket that opened a view can drive it, and only in the user's turn, from the
//     window that took it; a paused view (out of sight) gets no frames at all.
import { TRY_LIVE, WATCH_LIVE, type LiveDoing, type LiveInput, type LiveTask, type LiveTurn, type ServerFrame } from "@ducter/protocol";
import { redact } from "@ducter/protocol/src/redact.ts";
import { CHECK_URL } from "./check.ts";
import { hostOf, pageUrl } from "./tools.ts";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";
import type { CdpEvent } from "./cdp.ts";
import type { BrowserHost, RunningBrowser } from "./host.ts";
import { isKey, pressKey } from "./keys.ts";
import { rememberSite, siteOf } from "./sites.ts";
import type { BrowserNotes } from "./notes.ts";
import { workerProfile } from "./remote.ts";

export interface LiveSink {
  send(f: ServerFrame): void;
}

type TaskInfo = { persona?: string; place?: { kind: string; profile?: string }; title?: string; harness?: string; attention?: string };

export interface LiveDeps {
  host: BrowserHost;
  decisions: {
    get(id: string): { taskId?: string; signIn?: { site: string; url?: string } } | undefined;
    isPending(id: string): boolean;
    decide(id: string, option: "go"): unknown;
  };
  tasks: { get(id: string): TaskInfo | undefined };
  persona: string;
  /** D190: what the browser tools just did (the watcher's line). */
  notes?: BrowserNotes;
  /** D190: tell a task something (the hand-back), as a message into it. */
  tell?: (taskId: string, text: string) => unknown;
  maxFps?: number;
  /** Re-send after this long without an ack (a lost ack must not freeze the view). */
  ackTimeoutMs?: number;
}

type Size = { width?: number; height?: number; scale?: number };

/** JPEG quality and size, best first; a view steps down when acks are slow (D190). */
export const TIERS = [
  { quality: 70, scale: 1 },
  { quality: 55, scale: 1 },
  { quality: 45, scale: 0.75 },
  { quality: 35, scale: 0.5 },
] as const;
const START_TIER = 1;
/** Acks slower than this on average step the quality down; quicker than FAST step it back up. */
const SLOW_MS = 700;
const FAST_MS = 220;

interface View {
  id: string;
  sink: LiveSink;
  kind: "signin" | "try" | "watch";
  decisionId: string;
  taskId: string;
  profile: string;
  site: string;
  b?: RunningBrowser;
  targetId?: string;
  sessionId?: string;
  ownTarget: boolean;
  seq: number;
  inflight: boolean;
  inflightAt: number;
  pending?: { data: string; width: number; height: number; capturedAt?: number };
  lastSent: number;
  /** The page's size in CSS pixels, as the last frame said (what input fractions map to). */
  width: number;
  height: number;
  /** The viewer's size and pixel ratio. */
  want: { width: number; height: number; scale: number };
  /** The page is at the viewer's size (Emulation override) in the user's turn. */
  emulated: boolean;
  url?: string;
  title?: string;
  timer?: ReturnType<typeof setTimeout>;
  off: (() => void)[]; // this tab's listeners (detach)
  life: (() => void)[]; // the view's own (finish)
  closed: boolean;
  /** Its open frame went out (turn frames only after it, which carries the turn itself). */
  announced?: boolean;
  buttons: number;
  paused: boolean;
  tier: number;
  sinceTier: number;
  rtt?: number;
  lag?: number;
  frames: number;
  bytes: number;
  openedAt: number;
  resumedAt: number;
  following?: Promise<void>;
}

/** The user's turn on one browser (profile): who holds it, and what to tell when it ends. */
interface Turn {
  by: string; // view id
  taskId: string; // the task whose tab it is ("" for Try it)
  before?: { url?: string; title?: string };
  waited: Set<string>; // tasks that tried a tool during it
  visited: Set<string>; // hosts the user's tab went to
  cookies?: Map<string, number>; // per site, at the start (a sign-in shows as more of them)
}

export interface LiveStats {
  frames: number;
  bytes: number;
  rttMs?: number;
  lagMs?: number;
  tier: number;
  quality: number;
}

export interface Live {
  open(sink: LiveSink, decisionId: string, size?: Size): Promise<string | undefined>;
  /** D154, 试一下 / Try it: a harmless page in a tab of its own on the persona's profile (no card). device: whose browser. */
  tryIt(sink: LiveSink, size?: Size, device?: string): Promise<string | undefined>;
  /** D190, 看它上网 / Watch it browse: the tab a task is working in, in its turn. */
  watch(sink: LiveSink, taskId: string, size?: Size): Promise<string | undefined>;
  input(sink: LiveSink, id: string, input: LiveInput): Promise<void>;
  ack(sink: LiveSink, id: string, seq: number): void;
  /** D190: 换我来 / My turn (mine) or 还给它 / Hand it back. */
  turn(sink: LiveSink, id: string, mine: boolean): Promise<void>;
  pause(sink: LiveSink, id: string, paused: boolean): Promise<void>;
  close(sink: LiveSink, id: string, done?: boolean): Promise<void>;
  /** The socket went away: close its views (not done). */
  drop(sink: LiveSink): Promise<void>;
  /** Open views (tests). */
  views(): { id: string; profile: string; decisionId: string; kind: string; turn: LiveTurn }[];
  /** D190: how a view's stream is doing (tests and the measurements). */
  stats(id: string): LiveStats | undefined;
}

const newId = () => "lv_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
/** The viewer's pixel ratio, at most 2 (sharper text; frames stay small enough for a phone link). */
const dpr = (s: unknown) => (typeof s === "number" && s > 0 ? Math.min(2, Math.max(1, s)) : 1);
const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const fitW = (w: unknown) => Math.round(Math.max(320, Math.min(1600, Number(w) || 0)));
const fitH = (h: unknown) => Math.round(Math.max(320, Math.min(2000, Number(h) || 0)));
const ACTIVE = new Set(["queued", "working", "needs_you", "blocked"]);
/** Keys never render (D152): a URL can carry a token. */
const shown = (url: string | undefined) => (url ? redact(url) : url);

export function createLive(d: LiveDeps): Live {
  const views = new Map<string, View>();
  const turns = new Map<string, Turn>(); // profile -> the user's turn
  const minGap = 1000 / (d.maxFps ?? 8);
  const ackTimeout = d.ackTimeoutMs ?? 3_000;

  const turnOf = (v: View): LiveTurn => (turns.has(v.profile) ? "you" : "agent");
  const holds = (v: View) => turns.get(v.profile)?.by === v.id;
  const onProfile = (profile: string) => [...views.values()].filter((x) => x.profile === profile);
  const taskInfo = (taskId: string): LiveTask | undefined => {
    const c = taskId ? d.tasks.get(taskId) : undefined;
    return c?.title ? { title: redact(c.title), harness: c.harness ?? "" } : undefined;
  };

  const pump = (v: View) => {
    if (v.closed || !v.pending || v.paused) return;
    const now = Date.now();
    if (v.inflight && now - v.inflightAt < ackTimeout) {
      if (!v.timer) v.timer = setTimeout(() => ((v.timer = undefined), pump(v)), ackTimeout - (now - v.inflightAt));
      return;
    }
    const wait = minGap - (now - v.lastSent);
    if (wait > 0) {
      if (!v.timer) v.timer = setTimeout(() => ((v.timer = undefined), pump(v)), wait);
      return;
    }
    const f = v.pending;
    v.pending = undefined;
    v.seq += 1;
    v.inflight = true;
    v.inflightAt = now;
    v.lastSent = now;
    v.width = f.width;
    v.height = f.height;
    v.frames += 1;
    v.bytes += Math.round((f.data.length * 3) / 4);
    if (f.capturedAt) v.lag = v.lag == null ? now - f.capturedAt : v.lag * 0.8 + (now - f.capturedAt) * 0.2;
    v.sink.send({ t: "live_frame", id: v.id, seq: v.seq, data: f.data, width: f.width, height: f.height, ...(v.url ? { url: shown(v.url) } : {}), ...(v.title ? { title: v.title } : {}) });
  };

  const cdp = (v: View) => (m: string, p: object = {}) => {
    if (!v.b || !v.sessionId) return Promise.reject(new Error("no page"));
    return v.b.cdp.send(m, p, v.sessionId);
  };

  /** The screencast at this view's tier, scaled to the viewer (CDP downscales; the page keeps its size). */
  const startCast = async (v: View) => {
    if (!v.sessionId || v.paused || v.closed) return;
    const t = TIERS[v.tier]!;
    const px = dpr(v.want.scale) * t.scale;
    await cdp(v)("Page.startScreencast", {
      format: "jpeg",
      quality: t.quality,
      maxWidth: Math.round(Math.min(1600, v.want.width * px)),
      maxHeight: Math.round(Math.min(2000, v.want.height * px)),
      everyNthFrame: 1,
    });
  };
  const restartCast = async (v: View) => {
    await cdp(v)("Page.stopScreencast").catch(() => {});
    await startCast(v).catch(() => {});
  };

  const emulate = async (v: View) => {
    await cdp(v)("Emulation.setDeviceMetricsOverride", { width: fitW(v.want.width), height: fitH(v.want.height), deviceScaleFactor: dpr(v.want.scale), mobile: v.want.width < 700 });
    v.emulated = true;
  };

  /** Show this tab in the view: its own CDP session, then frames. */
  async function attach(v: View, targetId: string): Promise<void> {
    const b = v.b!;
    const attached = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
    if (!attached?.sessionId) throw new Error("couldn't show the page");
    const sessionId = String(attached.sessionId);
    v.targetId = targetId;
    v.sessionId = sessionId;
    v.off.push(
      b.cdp.on((e: CdpEvent) => {
        if (e.sessionId !== sessionId) return;
        if (e.method === "Page.screencastFrame") {
          void b.cdp.send("Page.screencastFrameAck", { sessionId: e.params.sessionId }, sessionId).catch(() => {});
          const m = e.params.metadata ?? {};
          v.pending = {
            data: String(e.params.data ?? ""),
            width: Math.round(m.deviceWidth ?? v.width),
            height: Math.round(m.deviceHeight ?? v.height),
            ...(typeof m.timestamp === "number" ? { capturedAt: m.timestamp * 1000 } : {}),
          };
          pump(v);
        } else if (e.method === "Page.frameNavigated" && !e.params?.frame?.parentId) {
          v.url = e.params.frame?.url;
          const t = turns.get(v.profile);
          const h = hostOf(v.url);
          if (t && t.by === v.id && h) t.visited.add(h);
        } else if (e.method === "Page.navigatedWithinDocument") {
          v.url = e.params?.url ?? v.url;
        }
      }),
    );
    const send = cdp(v);
    await send("Page.enable");
    if (v.kind !== "watch" || holds(v)) {
      if (v.want.width && v.want.height) await emulate(v);
    }
    const info = await b.cdp.send("Target.getTargetInfo", { targetId }).catch(() => undefined);
    v.url = info?.targetInfo?.url;
    v.title = info?.targetInfo?.title;
    await startCast(v);
  }

  /** Stop showing the tab (the page gets its own size back). */
  async function detach(v: View): Promise<void> {
    for (const off of v.off.splice(0)) off();
    if (!v.b || !v.sessionId) return;
    const send = cdp(v);
    await send("Page.stopScreencast").catch(() => {});
    if (v.emulated) await send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    v.emulated = false;
    await v.b.cdp.send("Target.detachFromTarget", { sessionId: v.sessionId }).catch(() => {});
    v.sessionId = undefined;
    v.targetId = undefined;
    v.pending = undefined;
    v.inflight = false;
  }

  /** A watch follows the task to the tab it works in now. */
  const follow = (v: View): Promise<void> => {
    if (v.closed || v.kind !== "watch" || holds(v)) return Promise.resolve();
    const run = async () => {
      const tb = d.host.task(v.taskId);
      const cur = tb?.current && tb.tabs.includes(tb.current) ? tb.current : undefined;
      if (!cur || cur === v.targetId) return;
      if (!v.b) {
        v.b = d.host.running(v.profile);
        if (!v.b) return;
        v.life.push(v.b.cdp.onClose(() => void finish(v, "gone")));
      }
      await detach(v);
      if (v.closed) return;
      await attach(v, cur).catch((e: Error) => console.warn("[browser] watch couldn't follow the task's tab:", e.message));
      if (v.url) v.sink.send({ t: "live_doing", id: v.id, doing: null });
    };
    v.following = (v.following ?? Promise.resolve()).then(run, run);
    return v.following;
  };

  const sendTurn = (profile: string) => {
    const t = turns.get(profile);
    for (const x of onProfile(profile)) if (x.announced) x.sink.send({ t: "live_turn", id: x.id, turn: t ? "you" : "agent", here: t?.by === x.id });
  };

  const cookieCounts = async (b: RunningBrowser): Promise<Map<string, number>> => {
    const r = await b.cdp.send("Storage.getCookies", {}).catch(() => undefined);
    const m = new Map<string, number>();
    for (const c of Array.isArray(r?.cookies) ? r.cookies : []) {
      const s = siteOf(String(c.domain ?? ""));
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  };

  /** The user's turn starts on this view's browser (blind before anything goes in). */
  async function take(v: View): Promise<void> {
    const had = turns.get(v.profile);
    if (had?.by === v.id) return;
    if (had) {
      const other = views.get(had.by);
      // A sign-in or a Try it elsewhere is closed (a second window takes it over, D151); a
      // watch elsewhere keeps showing, and its turn moves here.
      if (other && other.kind !== "watch") {
        turns.set(v.profile, { ...had, by: v.id }); // moved before it closes, so no task is told in between
        await finish(other, "replaced");
      }
    }
    const prev = turns.get(v.profile);
    const t: Turn = prev ? Object.assign(prev, { by: v.id }) : { by: v.id, taskId: v.taskId, waited: new Set(), visited: new Set() };
    turns.set(v.profile, t);
    d.host.setLive(v.profile, v.id);
    if (!prev) {
      t.before = { url: v.url, title: v.title };
      if (v.b) void cookieCounts(v.b).then((c) => (t.cookies = c));
    }
    // A watch with no page yet: the task's tab is made now, for the user to type an address in.
    if (v.kind === "watch" && !v.targetId && v.taskId && !v.closed) {
      try {
        const { b, targetId } = await d.host.newTab(v.taskId);
        v.b = b;
        await attach(v, targetId);
      } catch (e) {
        console.warn("[browser] couldn't open a page for the user's turn:", (e as Error).message);
      }
    } else if (v.sessionId && !v.emulated) {
      await emulate(v).catch(() => {});
    }
    sendTurn(v.profile);
  }

  const words = (u?: { url?: string; title?: string }) => (u?.url ? `${u.title ? `"${u.title}" ` : ""}(${shown(u.url)})` : "a blank page");

  /** The user's turn ends: the browser is the tasks' again, and they're told what changed. */
  async function giveBack(v: View, o: { quietFor?: string } = {}): Promise<void> {
    const t = turns.get(v.profile);
    if (!t || t.by !== v.id) return;
    turns.delete(v.profile);
    if (v.emulated && v.sessionId) await cdp(v)("Emulation.clearDeviceMetricsOverride").catch(() => {});
    v.emulated = false;
    if (v.sessionId) {
      const info = v.b && v.targetId ? await v.b.cdp.send("Target.getTargetInfo", { targetId: v.targetId }).catch(() => undefined) : undefined;
      if (info?.targetInfo) (v.url = info.targetInfo.url), (v.title = info.targetInfo.title);
    }
    // Only now do the tasks see the browser again.
    if (![...turns.keys()].includes(v.profile)) d.host.setLive(v.profile, undefined);
    // The sites the user signed in to while it was theirs (more cookies than before) join Signed-in sites.
    if (v.b && t.cookies && t.visited.size) {
      const now = await cookieCounts(v.b);
      for (const h of t.visited) {
        const s = siteOf(h);
        if ((now.get(s) ?? 0) > (t.cookies.get(s) ?? 0)) {
          try {
            rememberSite(d.host.dataDir, v.profile, h);
          } catch {}
        }
      }
    }
    const after = { url: v.url, title: v.title };
    const moved = (t.before?.url ?? "") !== (after.url ?? "");
    const active = (id: string) => ACTIVE.has(d.tasks.get(id)?.attention ?? "");
    const told = new Set<string>();
    if (t.taskId && t.taskId !== o.quietFor && active(t.taskId) && (t.waited.has(t.taskId) || moved)) {
      told.add(t.taskId);
      const what = moved ? `Your tab went from ${words(t.before)} to ${words(after)} while they had it.` : `Your tab is still on ${words(after)}, though they may have typed or clicked there.`;
      void d.tell?.(t.taskId, `The user handed Ducter's browser back to you (it was their turn: they used your tab themselves; you saw nothing of it). ${what} browser_read before your next step (the numbers changed), then carry on.`);
    }
    for (const id of t.waited)
      if (!told.has(id) && id !== o.quietFor && active(id)) void d.tell?.(id, "Ducter's browser is yours again: the user has finished using it. Carry on where you were.");
    sendTurn(v.profile);
  }

  async function finish(v: View, reason: "done" | "closed" | "replaced" | "gone" | "failed", message?: string) {
    if (v.closed) return;
    v.closed = true;
    views.delete(v.id);
    if (v.timer) clearTimeout(v.timer);
    for (const off of v.life.splice(0)) off();
    // A sign-in done is told through its card (the decision's forward), not here.
    await giveBack(v, v.kind === "signin" && reason === "done" ? { quietFor: v.taskId } : {});
    const targetId = v.targetId;
    await detach(v);
    if (v.b && targetId && v.ownTarget && (reason !== "done" || !v.taskId)) await v.b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    if (turns.get(v.profile)?.by === v.id) turns.delete(v.profile);
    if (!turns.has(v.profile)) d.host.setLive(v.profile, undefined);
    v.sink.send({ t: "live", id: v.id, decisionId: v.decisionId, state: "closed", site: v.site, reason, ...(message ? { message } : {}) });
  }

  const fail = (sink: LiveSink, decisionId: string, message: string) => {
    sink.send({ t: "live", id: newId(), decisionId, state: "closed", reason: "failed", message });
    return undefined;
  };

  const newView = (sink: LiveSink, a: { kind: View["kind"]; decisionId: string; taskId?: string; profile: string; site: string }, size?: Size): View => ({
    id: newId(), sink, kind: a.kind, decisionId: a.decisionId, taskId: a.taskId ?? "", profile: a.profile, site: a.site, ownTarget: false,
    seq: 0, inflight: false, inflightAt: 0, lastSent: 0, width: size?.width ? fitW(size.width) : 1280, height: size?.height ? fitH(size.height) : 800,
    want: { width: size?.width ? fitW(size.width) : 1280, height: size?.height ? fitH(size.height) : 800, scale: dpr(size?.scale) },
    emulated: false, off: [], life: [], closed: false, buttons: 0, paused: false, tier: START_TIER, sinceTier: 0, frames: 0, bytes: 0, openedAt: Date.now(), resumedAt: 0,
  });

  const opened = (v: View) =>
    (v.announced = true) && v.sink.send({
      t: "live", id: v.id, decisionId: v.decisionId, state: "open", site: v.site,
      ...(v.url ? { url: shown(v.url) } : {}), ...(v.title ? { title: v.title } : {}),
      width: v.width, height: v.height, browser: d.host.about(v.profile), turn: turnOf(v), here: holds(v),
      ...(v.taskId ? { taskId: v.taskId } : {}), ...((t) => (t ? { task: t } : {}))(taskInfo(v.taskId)),
    });

  /**
   * A sign-in or Try it: the user's turn from the start. task: the sign-in card's task (its own
   * tab, else a new one it keeps); none: Try it (a tab of the view's own, closed with it).
   */
  async function show(sink: LiveSink, a: { kind: "signin" | "try"; decisionId: string; taskId?: string; profile: string; site: string; url: string }, size?: Size): Promise<string | undefined> {
    const { decisionId, profile } = a;
    const v = newView(sink, a, size);
    views.set(v.id, v);
    // Blind before anything is shown (and before the browser even starts).
    await take(v).catch(() => {});
    const bail = (message: string) => {
      views.delete(v.id);
      if (turns.get(profile)?.by === v.id) turns.delete(profile);
      if (!turns.has(profile)) d.host.setLive(profile, undefined);
      sendTurn(profile);
      return fail(sink, decisionId, message);
    };
    try {
      v.b = await d.host.ensure(profile);
    } catch (e) {
      return bail((e as Error).message);
    }
    const tb = a.taskId ? d.host.task(a.taskId) : undefined;
    let targetId = tb?.current && tb.tabs.includes(tb.current) ? tb.current : undefined;
    if (!targetId) {
      const r = await v.b.cdp.send("Target.createTarget", { url: a.url }).catch(() => undefined);
      targetId = r?.targetId;
      v.ownTarget = true;
      if (tb && targetId) tb.tabs.push(targetId), (tb.current = targetId), (v.ownTarget = false);
    }
    if (!targetId) return bail(a.taskId ? "couldn't open the sign-in page" : "couldn't open a page");
    const t = turns.get(profile);
    try {
      await attach(v, targetId);
    } catch (e) {
      // A tab that can't be attached must not leave the profile blind (tasks refuse while live).
      if (v.ownTarget) await v.b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
      for (const off of v.off.splice(0)) off();
      return bail((e as Error).message);
    }
    if (t && t.by === v.id && !t.before) t.before = { url: v.url, title: v.title };
    v.life.push(v.b.cdp.onClose(() => void finish(v, "gone")));
    opened(v);
    return v.id;
  }

  // D190: each step a task takes reaches whoever watches its tab, and a watch follows it to a new tab.
  d.notes?.listen(
    (taskId, doing: LiveDoing) => {
      for (const v of views.values()) {
        if (v.taskId !== taskId) continue;
        if (doing.kind === "waiting") turns.get(v.profile)?.waited.add(taskId);
        if (v.kind !== "watch") continue;
        if (doing.kind !== "waiting") v.sink.send({ t: "live_doing", id: v.id, doing });
        void follow(v);
        // A new page or tab shows up a moment after the step that made it.
        setTimeout(() => void follow(v), 400);
      }
      // A task that tried while another task's tab is the user's waits too.
      if (doing.kind === "waiting") {
        const p = d.host.task(taskId)?.profile;
        if (p) turns.get(p)?.waited.add(taskId);
      }
    },
    (taskId) => [...views.values()].some((v) => v.kind === "watch" && v.taskId === taskId),
  );

  return {
    async open(sink, decisionId, size) {
      const dec = d.decisions.get(decisionId);
      if (!dec?.signIn || !dec.taskId) return fail(sink, decisionId, "this card doesn't open a browser");
      if (!d.decisions.isPending(decisionId)) return fail(sink, decisionId, "this card is already answered");
      const card = d.tasks.get(dec.taskId);
      if (card?.place?.kind !== "browser") return fail(sink, decisionId, "this task has no browser");
      // The profile the task's browser runs on: a worker's when it runs there (D157).
      const profile = d.host.task(dec.taskId)?.profile ?? profileName(card.persona ?? d.persona, card.place.profile);
      return show(sink, { kind: "signin", decisionId, taskId: dec.taskId, profile, site: dec.signIn.site, url: dec.signIn.url ?? `https://${dec.signIn.site}` }, size);
    },

    tryIt(sink, size, device) {
      const own = profileName(d.persona);
      const profile = device && device !== "local" ? workerProfile(device, own) : own;
      return show(sink, { kind: "try", decisionId: TRY_LIVE, profile, site: hostOf(CHECK_URL)!, url: CHECK_URL }, size);
    },

    async watch(sink, taskId, size) {
      const tb = d.host.task(taskId);
      if (!tb) return fail(sink, WATCH_LIVE, "this task isn't using Ducter's browser");
      // Two windows of one socket never watch the same task twice: the newer one stays.
      for (const o of [...views.values()]) if (o.sink === sink && o.kind === "watch" && o.taskId === taskId) await finish(o, "replaced");
      const v = newView(sink, { kind: "watch", decisionId: WATCH_LIVE, taskId, profile: tb.profile, site: "" }, size);
      views.set(v.id, v);
      // Watching starts nothing: a browser that isn't running, or a task with no page yet, waits
      // for the task's first step (notes) and shows it then.
      v.b = d.host.running(tb.profile);
      const cur = tb.current && tb.tabs.includes(tb.current) ? tb.current : undefined;
      if (v.b && cur) {
        try {
          await attach(v, cur);
        } catch (e) {
          await detach(v);
          views.delete(v.id);
          return fail(sink, WATCH_LIVE, (e as Error).message);
        }
      }
      v.site = hostOf(v.url) ?? "";
      if (v.b) v.life.push(v.b.cdp.onClose(() => void finish(v, "gone")));
      opened(v);
      return v.id;
    },

    async input(sink, id, input) {
      const v = views.get(id);
      if (!v || v.sink !== sink || !input) return;
      // The viewer's size is theirs to change in any turn; everything else only in theirs.
      if (input.kind === "resize") return void (await resize(v, input));
      if (!holds(v) || !v.sessionId) return;
      d.host.touch(v.profile);
      const send = cdp(v);
      switch (input.kind) {
        case "mouse": {
          const x = clamp(input.x) * v.width;
          const y = clamp(input.y) * v.height;
          const button = input.button === "right" ? "right" : "left";
          const type = input.type === "down" ? "mousePressed" : input.type === "up" ? "mouseReleased" : "mouseMoved";
          if (input.type === "down") v.buttons = button === "left" ? 1 : 2;
          const buttons = v.buttons;
          if (input.type === "up") v.buttons = 0;
          await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : button, buttons, clickCount: input.type === "move" ? 0 : Math.max(1, Math.min(3, input.clicks ?? 1)) }).catch(() => {});
          return;
        }
        case "wheel":
          await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: clamp(input.x) * v.width, y: clamp(input.y) * v.height, deltaX: Number(input.dx) || 0, deltaY: Number(input.dy) || 0 }).catch(() => {});
          return;
        case "text":
          if (typeof input.text === "string" && input.text) await send("Input.insertText", { text: input.text.slice(0, 2000) }).catch(() => {});
          return;
        case "key":
          if (isKey(input.key)) await pressKey(send, input.key, !!input.shift).catch(() => {});
          return;
        case "go": {
          let url: string;
          try {
            url = pageUrl(String(input.url ?? ""));
          } catch {
            return; // only http(s) pages open (the client says so before sending)
          }
          await send("Page.navigate", { url }).catch(() => {});
          return;
        }
        case "nav":
          if (input.action === "reload") await send("Page.reload").catch(() => {});
          else {
            const h = await send("Page.getNavigationHistory").catch(() => undefined);
            const to = h?.entries?.[h.currentIndex + (input.action === "back" ? -1 : 1)];
            if (to) await send("Page.navigateToHistoryEntry", { entryId: to.id }).catch(() => {});
          }
          return;
      }
    },

    ack(sink, id, seq) {
      const v = views.get(id);
      if (!v || v.sink !== sink || seq !== v.seq) return;
      v.inflight = false;
      // How long the frame took to reach the screen: the link's speed, and the phone's. A frame
      // that waited out a pause says nothing about the link.
      const rtt = Date.now() - v.inflightAt;
      if (v.inflightAt >= v.resumedAt) v.rtt = v.rtt == null ? rtt : v.rtt * 0.5 + rtt * 0.5;
      v.sinceTier += 1;
      const down = (v.rtt ?? 0) > SLOW_MS && v.tier < TIERS.length - 1 && v.sinceTier >= 3;
      const up = v.rtt != null && v.rtt < FAST_MS && v.tier > 0 && v.sinceTier >= 20;
      if (down || up) {
        v.tier += down ? 1 : -1;
        v.sinceTier = 0;
        void restartCast(v);
      }
      if (v.timer) clearTimeout(v.timer), (v.timer = undefined);
      pump(v);
    },

    async turn(sink, id, mine) {
      const v = views.get(id);
      if (!v || v.sink !== sink) return;
      if (mine) return take(v);
      // Handing back is a watch's: a sign-in ends with Done, Try it has no task to hand to.
      if (v.kind === "watch") await giveBack(v);
    },

    async pause(sink, id, paused) {
      const v = views.get(id);
      if (!v || v.sink !== sink || v.paused === paused) return;
      v.paused = paused;
      if (paused) {
        v.pending = undefined;
        await cdp(v)("Page.stopScreencast").catch(() => {});
      } else {
        v.inflight = false;
        v.resumedAt = Date.now();
        await startCast(v).catch(() => {});
      }
    },

    async close(sink, id, done) {
      const v = views.get(id);
      if (!v || v.sink !== sink) return;
      await finish(v, done ? "done" : "closed");
      if (!done || v.kind !== "signin") return; // Try it (D154) and a watch answer no card
      if (d.decisions.isPending(v.decisionId)) d.decisions.decide(v.decisionId, "go");
      try {
        rememberSite(d.host.dataDir, v.profile, v.site);
      } catch (e) {
        console.warn("[browser] couldn't note the signed-in site:", (e as Error).message);
      }
    },

    async drop(sink) {
      for (const v of [...views.values()]) if (v.sink === sink) await finish(v, "closed");
    },

    views: () => [...views.values()].map((v) => ({ id: v.id, profile: v.profile, decisionId: v.decisionId, kind: v.kind, turn: turnOf(v) })),

    stats(id) {
      const v = views.get(id);
      if (!v) return undefined;
      return { frames: v.frames, bytes: v.bytes, ...(v.rtt != null ? { rttMs: Math.round(v.rtt) } : {}), ...(v.lag != null ? { lagMs: Math.round(v.lag) } : {}), tier: v.tier, quality: TIERS[v.tier]!.quality };
    },
  };

  async function resize(v: View, input: { width: number; height: number; scale?: number }) {
    v.want = { width: fitW(input.width), height: fitH(input.height), scale: dpr(input.scale) };
    if (v.emulated) await emulate(v).catch(() => {});
    await restartCast(v);
  }
}
