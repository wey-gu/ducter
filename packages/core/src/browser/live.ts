// The live view of Ducter's browser (D144): what a sign-in card opens on the Mac app or the
// phone. The page is streamed as JPEG frames (CDP Page.startScreencast) over the client's own
// authenticated WebSocket, and the user's pointer and keys go back in (Input.*). The user signs
// in themselves: what they type goes from their keyboard to the page and nowhere else.
//
// Rules held here:
//   - blind first: the profile is marked live (host.setLive) before the first frame, and every
//     task tool on it refuses until the view closes (tools.ts);
//   - frames are presence, never history: nothing is logged, nothing reaches a model;
//   - one frame in flight per view: the next goes only after the client acks (and at most
//     `maxFps` a second), so a slow phone link gets fewer frames, not a queue;
//   - only the socket that opened a view can drive it.
import type { LiveInput, ServerFrame } from "@ducter/protocol";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";
import type { CdpEvent } from "./cdp.ts";
import type { BrowserHost, RunningBrowser } from "./host.ts";
import { isKey, pressKey } from "./keys.ts";
import { rememberSite } from "./sites.ts";

export interface LiveSink {
  send(f: ServerFrame): void;
}

export interface LiveDeps {
  host: BrowserHost;
  decisions: {
    get(id: string): { taskId?: string; signIn?: { site: string; url?: string } } | undefined;
    isPending(id: string): boolean;
    decide(id: string, option: "go"): unknown;
  };
  tasks: { get(id: string): { persona?: string; place?: { kind: string; profile?: string } } | undefined };
  persona: string;
  maxFps?: number;
  /** Re-send after this long without an ack (a lost ack must not freeze the view). */
  ackTimeoutMs?: number;
}

interface View {
  id: string;
  sink: LiveSink;
  decisionId: string;
  taskId: string;
  profile: string;
  site: string;
  b: RunningBrowser;
  targetId: string;
  sessionId: string;
  ownTarget: boolean;
  seq: number;
  inflight: boolean;
  inflightAt: number;
  pending?: { data: string; width: number; height: number };
  lastSent: number;
  width: number;
  height: number;
  url?: string;
  title?: string;
  timer?: ReturnType<typeof setTimeout>;
  off: (() => void)[];
  closed: boolean;
  buttons: number;
}

export interface Live {
  open(sink: LiveSink, decisionId: string, size?: { width?: number; height?: number; scale?: number }): Promise<string | undefined>;
  input(sink: LiveSink, id: string, input: LiveInput): Promise<void>;
  ack(sink: LiveSink, id: string, seq: number): void;
  close(sink: LiveSink, id: string, done?: boolean): Promise<void>;
  /** The socket went away: close its views (not done). */
  drop(sink: LiveSink): Promise<void>;
  /** Open views (tests). */
  views(): { id: string; profile: string; decisionId: string }[];
}

const newId = () => "lv_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
/** The viewer's pixel ratio, at most 2 (sharper text; frames stay small enough for a phone link). */
const dpr = (s: unknown) => (typeof s === "number" && s > 0 ? Math.min(2, Math.max(1, s)) : 1);
const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function createLive(d: LiveDeps): Live {
  const views = new Map<string, View>();
  const minGap = 1000 / (d.maxFps ?? 8);
  const ackTimeout = d.ackTimeoutMs ?? 3_000;

  const pump = (v: View) => {
    if (v.closed || !v.pending) return;
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
    v.sink.send({ t: "live_frame", id: v.id, seq: v.seq, data: f.data, width: f.width, height: f.height, ...(v.url ? { url: v.url } : {}), ...(v.title ? { title: v.title } : {}) });
  };

  async function finish(v: View, reason: "done" | "closed" | "replaced" | "gone" | "failed", message?: string) {
    if (v.closed) return;
    v.closed = true;
    views.delete(v.id);
    if (v.timer) clearTimeout(v.timer);
    for (const off of v.off) off();
    const send = (m: string, p: object = {}) => v.b.cdp.send(m, p, v.sessionId).catch(() => {});
    await send("Page.stopScreencast");
    await send("Emulation.clearDeviceMetricsOverride");
    await v.b.cdp.send("Target.detachFromTarget", { sessionId: v.sessionId }).catch(() => {});
    if (v.ownTarget && reason !== "done") await v.b.cdp.send("Target.closeTarget", { targetId: v.targetId }).catch(() => {});
    // Only now does the task see the browser again.
    if ([...views.values()].every((x) => x.profile !== v.profile)) d.host.setLive(v.profile, undefined);
    v.sink.send({ t: "live", id: v.id, decisionId: v.decisionId, state: "closed", site: v.site, reason, ...(message ? { message } : {}) });
  }

  const fail = (sink: LiveSink, decisionId: string, message: string) => {
    sink.send({ t: "live", id: newId(), decisionId, state: "closed", reason: "failed", message });
    return undefined;
  };

  return {
    async open(sink, decisionId, size) {
      const dec = d.decisions.get(decisionId);
      if (!dec?.signIn || !dec.taskId) return fail(sink, decisionId, "this card doesn't open a browser");
      if (!d.decisions.isPending(decisionId)) return fail(sink, decisionId, "this card is already answered");
      const card = d.tasks.get(dec.taskId);
      if (card?.place?.kind !== "browser") return fail(sink, decisionId, "this task has no browser");
      const profile = profileName(card.persona ?? d.persona, card.place.profile);
      // One live view per browser: a second window takes it over.
      for (const other of [...views.values()]) if (other.profile === profile) await finish(other, "replaced");
      d.host.setLive(profile, decisionId); // blind before anything is shown
      let b: RunningBrowser;
      try {
        b = await d.host.ensure(profile);
      } catch (e) {
        d.host.setLive(profile, undefined);
        return fail(sink, decisionId, (e as Error).message);
      }
      const tb = d.host.task(dec.taskId);
      let targetId = tb?.current && tb.tabs.includes(tb.current) ? tb.current : undefined;
      let ownTarget = false;
      if (!targetId) {
        const r = await b.cdp.send("Target.createTarget", { url: dec.signIn.url ?? `https://${dec.signIn.site}` }).catch(() => undefined);
        targetId = r?.targetId;
        ownTarget = true;
        if (tb && targetId) tb.tabs.push(targetId), (tb.current = targetId), (ownTarget = false);
      }
      if (!targetId) {
        d.host.setLive(profile, undefined);
        return fail(sink, decisionId, "couldn't open the sign-in page");
      }
      const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
      const id = newId();
      const v: View = {
        id, sink, decisionId, taskId: dec.taskId, profile, site: dec.signIn.site, b, targetId, sessionId, ownTarget,
        seq: 0, inflight: false, inflightAt: 0, lastSent: 0, width: size?.width ?? 1280, height: size?.height ?? 800, off: [], closed: false, buttons: 0,
      };
      views.set(id, v);
      d.host.setLive(profile, id);
      const send = (m: string, p: object = {}) => b.cdp.send(m, p, sessionId);
      v.off.push(
        b.cdp.on((e: CdpEvent) => {
          if (e.sessionId !== sessionId) return;
          if (e.method === "Page.screencastFrame") {
            void send("Page.screencastFrameAck", { sessionId: e.params.sessionId }).catch(() => {});
            const m = e.params.metadata ?? {};
            v.pending = { data: String(e.params.data ?? ""), width: Math.round(m.deviceWidth ?? v.width), height: Math.round(m.deviceHeight ?? v.height) };
            pump(v);
          } else if (e.method === "Page.frameNavigated" && !e.params?.frame?.parentId) {
            v.url = e.params.frame?.url;
          }
        }),
        b.cdp.onClose(() => void finish(v, "gone")),
      );
      try {
        await send("Page.enable");
        if (size?.width && size?.height) {
          const w = Math.round(Math.max(320, Math.min(1600, size.width)));
          const h = Math.round(Math.max(320, Math.min(2000, size.height)));
          await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr(size.scale), mobile: w < 700 });
          v.width = w;
          v.height = h;
        }
        const info = await b.cdp.send("Target.getTargetInfo", { targetId }).catch(() => undefined);
        v.url = info?.targetInfo?.url;
        v.title = info?.targetInfo?.title;
        await send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1600, maxHeight: 2000, everyNthFrame: 1 });
      } catch (e) {
        await finish(v, "failed", (e as Error).message);
        return undefined;
      }
      sink.send({ t: "live", id, decisionId, state: "open", site: v.site, ...(v.url ? { url: v.url } : {}), ...(v.title ? { title: v.title } : {}), width: v.width, height: v.height });
      return id;
    },

    async input(sink, id, input) {
      const v = views.get(id);
      if (!v || v.sink !== sink || !input) return;
      d.host.touch(v.profile);
      const send = (m: string, p: object = {}) => v.b.cdp.send(m, p, v.sessionId);
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
        case "nav":
          if (input.action === "reload") await send("Page.reload").catch(() => {});
          else {
            const h = await send("Page.getNavigationHistory").catch(() => undefined);
            const to = h?.entries?.[h.currentIndex + (input.action === "back" ? -1 : 1)];
            if (to) await send("Page.navigateToHistoryEntry", { entryId: to.id }).catch(() => {});
          }
          return;
        case "resize": {
          const w = Math.round(Math.max(320, Math.min(1600, Number(input.width) || 0)));
          const h = Math.round(Math.max(320, Math.min(2000, Number(input.height) || 0)));
          await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr(input.scale), mobile: w < 700 }).catch(() => {});
          v.width = w;
          v.height = h;
          return;
        }
      }
    },

    ack(sink, id, seq) {
      const v = views.get(id);
      if (!v || v.sink !== sink || seq !== v.seq) return;
      v.inflight = false;
      if (v.timer) clearTimeout(v.timer), (v.timer = undefined);
      pump(v);
    },

    async close(sink, id, done) {
      const v = views.get(id);
      if (!v || v.sink !== sink) return;
      await finish(v, done ? "done" : "closed");
      if (!done) return;
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

    views: () => [...views.values()].map((v) => ({ id: v.id, profile: v.profile, decisionId: v.decisionId })),
  };
}
