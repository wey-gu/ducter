// D278: calls from your own number, when the home is a server. A server home is never offered as
// the place for the phone; 再找一次 / Look again always answers (looking, then when and what it saw);
// and 你来打 / You call: asked for their own number with no computer beside the phone, the person
// gets a call sheet, and the Ducter app on their Android phone dials it in one tap (handset_dial,
// over the D238 link). Fakes only: a fake adb, a fake app page over a real socket. Never a real
// phone, number or call.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, LogStore, ServerFrame } from "@ducter/protocol";
import type { Clock } from "../src/clock.ts";
import type { ConnectionsStore } from "../src/connections.ts";
import { startCore, type Core } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { stubRunner } from "../src/main.ts";
import { neverCall, openPhone } from "../src/phone.ts";
import { openOwnPhone } from "../src/phone-own/index.ts";
import { fakePhone } from "./fake-own-phone.ts";
import { tempDir } from "./helpers.ts";

const base = (dir: string) => ({ dataDir: dir, where: () => "hel", partnerName: () => "Ducter", zone: () => "Asia/Shanghai", neverCall, lookMs: 0 });
const noConnections = () => ({ view: () => [], toolsOf: async () => [], invoke: async () => ({ ok: false }), reserve: () => undefined, onChange: () => () => undefined }) as unknown as ConnectionsStore;
const noon: Clock = { now: () => Date.parse("2026-11-16T04:00:00Z"), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) } as Clock;

describe("the station rule: a server home is never the place for the phone", () => {
  test("a Linux home (a server) with no phone: no steps offered; a Mac home is a station", async () => {
    const td = tempDir();
    try {
      const vps = openOwnPhone({ ...base(td.dir), platform: "linux", findAdb: () => undefined });
      expect(vps.view()).toMatchObject({ station: false, os: "linux", adb: false });
      const mac = openOwnPhone({ ...base(td.dir), platform: "darwin", findAdb: () => undefined });
      expect(mac.view()).toMatchObject({ station: true, os: "mac" });
      // A home that says it is a server (a Mac mini in a cupboard set that way) is not offered either.
      expect(openOwnPhone({ ...base(td.dir), platform: "darwin", kind: () => "server", findAdb: () => undefined }).view().station).toBe(false);
      vps.stop();
      mac.stop();
    } finally {
      td.cleanup();
    }
  });

  test("a phone already plugged into a Linux box keeps that box as its station (it is beside the phone)", async () => {
    const td = tempDir();
    try {
      const p = fakePhone();
      const own = openOwnPhone({ ...base(td.dir), platform: "linux", exec: p.exec, listAudio: async () => ({ inputs: [], outputs: [], tool: true }) });
      expect(own.view().station).toBe(false);
      await own.scan();
      expect(own.view().station).toBe(true);
      own.stop();
    } finally {
      td.cleanup();
    }
  });
});

describe("再找一次 / Look again answers visibly", () => {
  test("no adb: looking while it looks, then when it looked, on which computer, what it saw", async () => {
    const td = tempDir();
    try {
      const seen: boolean[] = [];
      const own = openOwnPhone({ ...base(td.dir), platform: "darwin", findAdb: () => undefined, lookMs: 30, onChange: () => seen.push(!!own?.view().looking) });
      expect(own.view().lookedAt).toBeUndefined();
      const before = own.view();
      await own.act({ action: "scan" });
      const after = own.view();
      // Before, the view was identical before and after the tap (research/89 §1): now it isn't.
      expect(after).not.toEqual(before);
      expect(seen[0]).toBe(true); // the card showed it looking
      expect(after.looking).toBeUndefined(); // and it is done
      expect(Math.abs(Date.parse(after.lookedAt!) - Date.now())).toBeLessThan(5_000);
      expect(after).toMatchObject({ adb: false, where: "hel" });
      own.stop();
    } finally {
      td.cleanup();
    }
  });

  test("with a phone: the look finds it", async () => {
    const td = tempDir();
    try {
      const p = fakePhone();
      const own = openOwnPhone({ ...base(td.dir), platform: "darwin", exec: p.exec, listAudio: async () => ({ inputs: [], outputs: [], tool: true }) });
      await own.act({ action: "scan" });
      expect(own.view()).toMatchObject({ phone: { model: "Pixel 7", state: "ready" } });
      expect(typeof own.view().lookedAt).toBe("string");
      own.stop();
    } finally {
      td.cleanup();
    }
  });
});

describe("你来打 / You call: their own number, no computer beside the phone", () => {
  let td: ReturnType<typeof tempDir>;
  let log: LogStore & { close?: () => void };
  beforeAll(() => {
    td = tempDir();
    log = openLog({ path: join(td.dir, "log.db"), persona: "p" });
  });
  afterAll(() => {
    log.close?.();
    td.cleanup();
  });

  const phoneOn = () => {
    const own = openOwnPhone({ ...base(td.dir), platform: "linux", findAdb: () => undefined });
    return { own, phone: openPhone({ dataDir: td.dir, log, connections: noConnections(), clock: noon, quiet: () => null, zone: () => "Asia/Shanghai", partnerName: () => "Ducter", own }) };
  };

  test("from=own on a server home: a call sheet (why own), never a dead end and never Tuwa", async () => {
    const { own, phone } = phoneOn();
    // Without the sheet's words: the partner is told why and what to add.
    const first = await phone.draft({ to: "+862161234567", name: "4S 店", goal: "问保养要多久", from: "own" }, { lang: "zh" });
    expect(first).toMatchObject({ ok: false, reason: "sheet" });
    expect((first as { error: string }).error).toContain("own number");
    const r = await phone.draft({ to: "+862161234567", name: "4S 店", goal: "问保养要多久", from: "own", open: "你好，我想问一下小保养要多久。", ask: ["要预约吗？"], note: ["时间", "价格"], mustNot: ["车架号"] }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    expect(r.plan.from).toBe("self");
    expect(r.plan.sheet).toMatchObject({ why: "own", open: "你好，我想问一下小保养要多久。", ask: ["要预约吗？"], dont: ["车架号"], note: ["时间", "价格"] });
    expect(r.plan.costUsd).toBe(0);
    expect(r.card).toMatchObject({ goLabel: "通话结束", defaultOption: "hold", call: { kind: "sheet" } });
    // The rails still hold: an emergency number never gets a sheet; a do-not-call number doesn't either.
    expect((await phone.draft({ to: "110", name: "x", goal: "y", from: "own", open: "z" }, { lang: "zh" })).ok).toBe(false);
    phone.block("+862161230000");
    expect(phone.blocked("+86 21 6123 0000")).toBe(true);
    expect(await phone.draft({ to: "+862161230000", name: "x", goal: "y", from: "own", open: "z" }, { lang: "zh" })).toMatchObject({ ok: false, reason: "dnc" });
    // After the call: 通话结束 asks how it went (the existing sheet path); recorded in their words.
    log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.card.decisionId, option: "go", by: "user" } });
    await Bun.sleep(20);
    expect(phone.get(r.callId)?.state).toBe("done");
    expect(phone.result(r.callId, "要 1 小时，不用预约")).toEqual({ ok: true });
    expect(phone.get(r.callId)?.outcome).toBe("要 1 小时，不用预约");
    phone.stop();
    own.stop();
  });
});

describe("在 Pixel Fold 上拨打 / Call on Pixel Fold, through the real core", () => {
  let td: ReturnType<typeof tempDir>;
  let core: Core;
  let token = "";
  let phoneId = "";
  beforeAll(async () => {
    td = tempDir();
    core = startCore({ dataDir: join(td.dir, "home"), port: 0, batchMs: 5, sweepMs: 50, push: false, platform: "linux", ownNumber: { findAdb: () => undefined, lookMs: 0 }, deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" } });
    core.setRunner(stubRunner(core));
    core.setPartner({ onTrigger: () => {} });
    const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold · Ducter", platform: "android-app" }) as { token: string; device: { id: string } };
    phoneId = paired.device.id;
    token = paired.token;
  });
  afterAll(async () => {
    await core?.stop();
    td?.cleanup();
  });

  const sock = async (auth?: string, onFrame?: (f: ServerFrame, send: (o: object) => void) => void) => {
    const frames: ServerFrame[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, (auth ? { headers: { authorization: `Bearer ${auth}` } } : {}) as any);
    const send = (o: object) => ws.send(JSON.stringify(o));
    ws.onmessage = (m) => {
      const f = JSON.parse(String(m.data)) as ServerFrame;
      frames.push(f);
      onFrame?.(f, send);
    };
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    send({ t: "hello" });
    const until = async (pred: (f: ServerFrame) => boolean) => {
      for (let i = 0; i < 400; i++) {
        const hit = frames.find(pred);
        if (hit) return hit;
        await Bun.sleep(10);
      }
      throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
    };
    return { ws, frames, send, until };
  };

  test("a server home's card offers no steps; the sheet's number rings on the phone, the sheet goes with it", async () => {
    expect(core.ownNumber?.view()).toMatchObject({ station: false, os: "linux" });
    const asked: any[] = [];
    // The Pixel's page, as handset.tsx relays to the app (it answers the way MainActivity does).
    const pixel = await sock(token, (f, send) => {
      if (f.t === "handset_dial_req") asked.push(f), send({ t: "handset_dial_res", id: (f as any).id, ok: true, how: "rang" });
    });
    pixel.send({ t: "handset_hello", state: { bridge: 3, sdk: 36, model: "Pixel Fold", service: false, pictures: true, dial: "granted" } });
    for (let i = 0; i < 200 && !(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.dial; i++) await Bun.sleep(10);
    expect((await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset).toMatchObject({ dial: true, linked: true });

    const r = await core.phone.draft({ to: "+862161234567", name: "4S 店", goal: "问保养要多久", from: "own", open: "你好，我想问一下小保养要多久。", ask: ["要预约吗？"], mustNot: ["车架号"] }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });

    // From the Mac (another window): 在 Pixel Fold 上拨打.
    const mac = await sock();
    mac.send({ t: "handset_dial", callId: r.callId });
    const res = await mac.until((f) => f.t === "handset_dial_result");
    expect(res).toMatchObject({ ok: true, callId: r.callId, phone: "Pixel Fold · Ducter", how: "rang" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ callId: r.callId, to: "+862161234567", name: "4S 店", sheet: { goal: "问保养要多久", open: "你好，我想问一下小保养要多久。", ask: ["要预约吗？"], dont: ["车架号"] } });

    // Only an open sheet dials: a made-up id, or a sheet set aside, is refused without reaching the phone.
    mac.frames.length = 0;
    mac.send({ t: "handset_dial", callId: "call_nope" });
    expect(await mac.until((f) => f.t === "handset_dial_result")).toMatchObject({ ok: false, reason: "no_sheet" });
    core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.card.decisionId, option: "hold", by: "user" } });
    await Bun.sleep(30);
    mac.frames.length = 0;
    mac.send({ t: "handset_dial", callId: r.callId });
    expect(await mac.until((f) => f.t === "handset_dial_result")).toMatchObject({ ok: false, reason: "no_sheet" });
    expect(asked).toHaveLength(1);

    // An app from before D278 (no dial in its hello): no phone to ask.
    pixel.send({ t: "handset_hello", state: { bridge: 3, sdk: 36, model: "Pixel Fold", service: false, pictures: true } });
    await Bun.sleep(30);
    const r2 = await core.phone.draft({ to: "+862161234568", name: "店", goal: "问", from: "own", open: "你好" }, { lang: "zh" });
    if (!r2.ok || r2.needsInput) throw new Error(JSON.stringify(r2));
    mac.frames.length = 0;
    mac.send({ t: "handset_dial", callId: r2.callId });
    expect(await mac.until((f) => f.t === "handset_dial_result")).toMatchObject({ ok: false, reason: "no_phone" });
    pixel.ws.close();
    mac.ws.close();
  });
});
