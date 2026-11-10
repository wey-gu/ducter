// D190 without a Chrome: watching a task's tab (no blindness, no resize, no input), the task's
// steps on the watcher's line, whose turn it is across two windows, what a hand-back tells, the
// quality stepping down on a slow link, and the vault seam's field kinds.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { createLive, TIERS } from "../src/browser/live.ts";
import { createBrowserNotes } from "../src/browser/notes.ts";
import { fillFromVault, fillKind } from "../src/browser/fill.ts";
import type { BrowserHost, RunningBrowser } from "../src/browser/host.ts";
import type { CdpConn, CdpEvent } from "../src/browser/cdp.ts";
import { tempDir } from "./helpers.ts";

function rig(o: { attention?: string } = {}) {
  const td = tempDir();
  const calls: { method: string; params: any; sessionId?: string }[] = [];
  const fns = new Set<(e: CdpEvent) => void>();
  let url = "https://shop.example.com/cart";
  let n = 0;
  const cdp: CdpConn = {
    async send(method, params = {}, sessionId) {
      calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
      if (method === "Target.attachToTarget") return { sessionId: `S${++n}` };
      if (method === "Target.createTarget") return { targetId: "T-new" };
      if (method === "Target.getTargetInfo") return { targetInfo: { url, title: url.endsWith("/pay") ? "Pay" : "Cart" } };
      if (method === "Storage.getCookies") return { cookies: [] };
      return {};
    },
    on: (fn) => (fns.add(fn), () => fns.delete(fn)),
    onClose: () => () => {},
    closed: () => false,
    close() {},
  };
  const b: RunningBrowser = { name: "default", dir: join(td.dir, "p"), cdp, sessions: new Map(), gen: 1 };
  const blind = new Map<string, string>();
  const tabs = { taskId: "t1", profile: "default", evidenceDir: "", downloads: "", tabs: ["T-a"], current: "T-a" };
  const host = {
    dataDir: td.dir,
    setLive: (p: string, id?: string) => (id ? blind.set(p, id) : blind.delete(p)),
    blind: (p: string) => blind.has(p),
    ensure: async () => b,
    running: () => b,
    task: (id: string) => (id === "t1" ? tabs : undefined),
    newTab: async () => ({ b, targetId: "T-new", sessionId: "S-host" }),
    touch() {},
    about: (profile: string) => ({ device: "hel", name: "Chrome for Testing", version: "157.0.8103.38", profile }),
  } as unknown as BrowserHost;
  const notes = createBrowserNotes();
  const told: [string, string][] = [];
  const live = createLive({
    host,
    notes,
    tell: (id, text) => told.push([id, text]),
    decisions: { get: () => undefined, isPending: () => false, decide: () => {} },
    tasks: { get: (id) => (id === "t1" ? { title: "Buy filter paper", harness: "codex", attention: o.attention ?? "working", place: { kind: "browser" } } : undefined) },
    persona: "default",
    maxFps: 1000,
  });
  const frames: ServerFrame[] = [];
  const sink = { send: (f: ServerFrame) => frames.push(f) };
  const emit = (e: CdpEvent) => fns.forEach((f) => f(e));
  const frame = (sessionId: string, data = "AAAA", w = 1280, h = 800): CdpEvent => ({ method: "Page.screencastFrame", sessionId, params: { data, sessionId: 1, metadata: { deviceWidth: w, deviceHeight: h } } });
  return { td, calls, host, live, notes, told, frames, sink, emit, frame, tabs, setUrl: (u: string) => (url = u), blind };
}

describe("看它上网 / Watch it browse (D190)", () => {
  test("watching shows the task's tab as it is: not blind, not resized, scaled for the viewer", async () => {
    const r = rig();
    const id = (await r.live.watch(r.sink, "t1", { width: 390, height: 700, scale: 3 }))!;
    expect(r.blind.size).toBe(0);
    expect(r.calls.some((c) => c.method === "Emulation.setDeviceMetricsOverride")).toBe(false);
    // At most 2× the viewer's width, at the starting tier's scale and quality.
    expect(r.calls.find((c) => c.method === "Page.startScreencast")?.params).toMatchObject({ format: "jpeg", quality: TIERS[1].quality, maxWidth: 780 });
    expect(r.frames[0]).toMatchObject({ t: "live", decisionId: "watch", state: "open", turn: "agent", here: false, taskId: "t1", task: { title: "Buy filter paper", harness: "codex" }, url: "https://shop.example.com/cart" });
    // Nothing the user does goes in during the task's turn.
    const before = r.calls.length;
    await r.live.input(r.sink, id, { kind: "text", text: "hello" });
    await r.live.input(r.sink, id, { kind: "mouse", type: "down", x: 0.5, y: 0.5 });
    expect(r.calls.length).toBe(before);
    r.td.cleanup();
  });

  test("a task with no browser can't be watched", async () => {
    const r = rig();
    expect(await r.live.watch(r.sink, "t9")).toBeUndefined();
    expect(r.frames[0]).toMatchObject({ t: "live", decisionId: "watch", state: "closed", reason: "failed" });
    r.td.cleanup();
  });

  test("the task's steps reach the watcher's line, and a watch follows it to a new tab", async () => {
    const r = rig();
    const id = (await r.live.watch(r.sink, "t1"))!;
    expect(r.notes.watched("t1")).toBe(true);
    r.notes.note("t1", { kind: "click", label: "Pay with token=ghp_abcdefghijklmnop1234", x: 0.5, y: 0.25 });
    const doing = r.frames.find((f) => f.t === "live_doing") as Extract<ServerFrame, { t: "live_doing" }>;
    expect(doing).toMatchObject({ id, doing: { kind: "click", x: 0.5, y: 0.25 } });
    expect(doing.doing!.label).not.toContain("abcdefghijklmnop"); // keys never render (D152)
    r.tabs.tabs.push("T-b");
    r.tabs.current = "T-b";
    r.notes.note("t1", { kind: "open", host: "pay.example.com" });
    await Bun.sleep(10);
    expect(r.calls.filter((c) => c.method === "Target.attachToTarget").map((c) => c.params.targetId)).toEqual(["T-a", "T-b"]);
    await r.live.close(r.sink, id);
    expect(r.notes.watched("t1")).toBe(false);
    r.td.cleanup();
  });

  test("换我来 / My turn: blind, the page at the viewer's size, input goes in; the other window sees it's the user's", async () => {
    const r = rig();
    const phone: ServerFrame[] = [];
    const ps = { send: (f: ServerFrame) => phone.push(f) };
    const mac = (await r.live.watch(r.sink, "t1", { width: 1200, height: 800 }))!;
    const ph = (await r.live.watch(ps, "t1", { width: 390, height: 700, scale: 2 }))!;
    await r.live.turn(ps, ph, true);
    expect(r.blind.size).toBe(1);
    expect(r.calls.find((c) => c.method === "Emulation.setDeviceMetricsOverride")?.params).toMatchObject({ width: 390, height: 700, mobile: true });
    expect(phone.at(-1)).toMatchObject({ t: "live_turn", turn: "you", here: true });
    expect(r.frames.at(-1)).toMatchObject({ t: "live_turn", turn: "you", here: false });
    r.emit(r.frame("S2", "BBBB", 390, 700));
    await r.live.input(ps, ph, { kind: "mouse", type: "down", x: 0.5, y: 0.5 });
    expect(r.calls.find((c) => c.method === "Input.dispatchMouseEvent")).toMatchObject({ sessionId: "S2", params: { x: 195, y: 350 } });
    // The Mac window watches; it can't drive until it takes the turn itself.
    const n = r.calls.length;
    await r.live.input(r.sink, mac, { kind: "text", text: "x" });
    expect(r.calls.length).toBe(n);
    await r.live.turn(r.sink, mac, true);
    expect(phone.at(-1)).toMatchObject({ t: "live_turn", turn: "you", here: false });
    expect(r.blind.size).toBe(1);
    r.td.cleanup();
  });

  test("还给它 / Hand it back tells the task only what it needs: it waited, or the page moved", async () => {
    const r = rig();
    const id = (await r.live.watch(r.sink, "t1"))!;
    await r.live.turn(r.sink, id, true);
    await r.live.turn(r.sink, id, false);
    expect(r.told).toEqual([]); // nothing changed and it never tried: silence
    expect(r.blind.size).toBe(0);
    await r.live.turn(r.sink, id, true);
    r.notes.note("t1", { kind: "waiting" });
    r.setUrl("https://shop.example.com/pay");
    await r.live.turn(r.sink, id, false);
    expect(r.told).toHaveLength(1);
    expect(r.told[0]![1]).toContain(`from "Cart" (https://shop.example.com/cart) to "Pay" (https://shop.example.com/pay)`);
    expect(r.calls.filter((c) => c.method === "Emulation.clearDeviceMetricsOverride").length).toBeGreaterThan(0);
    r.td.cleanup();
  });

  test("a finished task isn't woken by a hand-back", async () => {
    const r = rig({ attention: "done" });
    const id = (await r.live.watch(r.sink, "t1"))!;
    await r.live.turn(r.sink, id, true);
    r.setUrl("https://shop.example.com/pay");
    await r.live.turn(r.sink, id, false);
    expect(r.told).toEqual([]);
    r.td.cleanup();
  });

  test("slow acks step the quality down; a paused view sends nothing", async () => {
    const r = rig();
    const id = (await r.live.watch(r.sink, "t1", { width: 390, height: 700, scale: 2 }))!;
    const sent = () => r.frames.filter((f) => f.t === "live_frame") as Extract<ServerFrame, { t: "live_frame" }>[];
    for (let i = 0; i < 7; i++) {
      r.emit(r.frame("S1"));
      await Bun.sleep(i === 0 ? 0 : 760); // a frame takes ~0.76 s to reach the screen
      r.live.ack(r.sink, id, sent().at(-1)!.seq);
    }
    const casts = r.calls.filter((c) => c.method === "Page.startScreencast");
    expect(casts.length).toBeGreaterThan(1);
    expect(casts.at(-1)!.params.quality).toBeLessThan(TIERS[1].quality);
    expect(r.live.stats(id)!.tier).toBeGreaterThan(1);
    await r.live.pause(r.sink, id, true);
    const k = sent().length;
    r.emit(r.frame("S1"));
    await Bun.sleep(5);
    expect(sent().length).toBe(k);
    r.td.cleanup();
  }, 10_000);
});

describe("the vault seam (D190)", () => {
  test("field kinds come from what the page says, never a value", () => {
    expect(fillKind({ secret: true, type: "password" })).toBe("password");
    expect(fillKind({ secret: true, label: "One-time code" })).toBe("otp");
    expect(fillKind({ secret: false, type: "email", label: "Email" })).toBe("username");
    expect(fillKind({ secret: false, label: "Card number" })).toBe("card");
  });

  test("with no vault, it says to ask the user", async () => {
    const r = rig();
    expect(await fillFromVault(r.host, undefined, "t1", 3)).toContain("browser_ask_sign_in");
    r.td.cleanup();
  });
});
