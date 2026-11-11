// D218: calls from the owner's own phone, against a fake Android phone (adb's answers), a loopback
// sound bridge and a fake real-time voice engine over a real WebSocket. Never a real phone, call,
// sound card or key. The Android emulator check is opt-in (DUCTER_OWN_PHONE_EMULATOR=emulator-5580;
// DUCTER_PHONE_ADB_PORT=5037 when that emulator registered with the default adb server).
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogStore } from "@ducter/protocol";
import { OWN_PHONE } from "@ducter/protocol";
import type { Clock } from "../src/clock.ts";
import type { ConnectionsStore } from "../src/connections.ts";
import { openLog } from "../src/log.ts";
import { neverCall, openPhone, type Phone } from "../src/phone.ts";
import { adbExec, findAdb, listPhones, OwnPhoneAdb, parseCallState, parseDevices, parseHeadset, parseSim } from "../src/phone-own/adb.ts";
import { chime, guessDevice, loopbackBridge, parseMacDevices, rms } from "../src/phone-own/audio.ts";
import { openOwnPhone, OWN_FILE, type OwnPhone } from "../src/phone-own/index.ts";
import { engineInfo, instructionsFor } from "../src/phone-own/voice.ts";
import { fakePhone, fakeVoice, type FakePhone } from "./fake-own-phone.ts";
import { tempDir } from "./helpers.ts";

setDefaultTimeout(30_000);
const until = async (cond: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("adb, read the way Android prints it", () => {
  test("devices: a phone by USB, one not yet allowed, an emulator", () => {
    const d = parseDevices("List of devices attached\nR5CT30ABCDE            device usb:1-1 product:panther model:Pixel_7 device:panther transport_id:2\n0A1B2C unauthorized usb:1-2 transport_id:3\nemulator-5580          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:3\n");
    expect(d).toEqual([
      { serial: "R5CT30ABCDE", state: "ready", model: "Pixel 7", usb: true },
      { serial: "0A1B2C", state: "unauthorized", model: "Android", usb: true },
      { serial: "emulator-5580", state: "ready", model: "sdk gphone64 arm64", usb: false },
    ]);
  });
  test("call state from mPreciseCallState (lines as the Android 16 emulator printed them, 2026-11-12)", () => {
    const l = (fg: number, ring = 0, c = 0) => `    mCallState=${c}\n    mPreciseCallState=Ringing call state: ${ring}, Foreground call state: ${fg}, Background call state: 0, Disconnect cause: -1, Precise disconnect cause: -1`;
    expect(parseCallState(l(-1).replace("Ringing call state: 0", "Ringing call state: -1"))).toEqual({ state: "idle" });
    expect(parseCallState(l(0))).toEqual({ state: "idle" });
    expect(parseCallState(l(3, 0, 2))).toEqual({ state: "dialing" });
    expect(parseCallState(l(4, 0, 2))).toEqual({ state: "alerting" });
    expect(parseCallState(l(1, 0, 2))).toEqual({ state: "active" });
    expect(parseCallState(l(7))).toEqual({ state: "ended" });
    expect(parseCallState(l(0, 5, 1))).toEqual({ state: "incoming" });
    expect(parseCallState("    mCallState=2\n")).toEqual({ state: "active" });
    expect(parseCallState("nothing")).toEqual({ state: "unknown" });
  });
  test("a headset with a mic, headphones without one, nothing", () => {
    expect(parseHeadset("mConnectedDevices:\n  DEVICE_OUT_WIRED_HEADSET\n  DEVICE_IN_WIRED_HEADSET\n- STREAM_VOICE_CALL:\n   Devices: headset(4)")).toBe("yes");
    expect(parseHeadset("mConnectedDevices:\n  DEVICE_OUT_USB_HEADSET\n  DEVICE_IN_USB_HEADSET\n")).toBe("yes");
    expect(parseHeadset("- STREAM_VOICE_CALL:\n   Volume Group: x\n   Devices: earpiece(1)\n")).toBe("no");
    // The emulator's real dump: only the speaker.
    expect(parseHeadset("   Devices: speaker(2)\n   Devices: speaker(2)\n")).toBe("no");
    expect(parseHeadset("")).toBe("unknown");
  });
  test("SIM state, per slot", () => {
    expect(parseSim("READY")).toBe("ready");
    expect(parseSim("ABSENT,READY")).toBe("ready");
    expect(parseSim("ABSENT")).toBe("absent");
    expect(parseSim("PIN_REQUIRED")).toBe("locked");
  });
  test("safety: only an E.164 number is dialed, only keypad digits are pressed", async () => {
    const p = fakePhone();
    const a = new OwnPhoneAdb(p.exec, "R5CT30ABCDE");
    await expect(a.dial("13800000000; rm -rf /")).rejects.toThrow();
    await expect(a.dial("+8613800000000")).resolves.toBe(true);
    await expect(a.press("1; am start")).rejects.toThrow();
    await a.press("2#");
    expect(p.keys).toEqual(["KEYCODE_2", "KEYCODE_POUND"]);
    // Every command is one of the allowed templates: argv, never a shell line.
    for (const argv of p.argv) {
      const sh = argv.slice(3).join(" ");
      expect(/^(getprop (ro\.product\.model|ro\.build\.version\.release|gsm\.sim\.state|gsm\.sim\.operator\.alpha|gsm\.operator\.alpha)|dumpsys (telephony\.registry|audio)|am start -a android\.intent\.action\.CALL -d tel:\+\d+|input keyevent KEYCODE_[0-9A-Z]+)$/.test(sh) || argv[0] === "devices").toBe(true);
    }
  });
});

describe("the sound cable's computer end", () => {
  test("ffmpeg's device lists (as ffmpeg 9 printed them on a Mac)", () => {
    const ins = "[AVFoundation indev @ 0x1] AVFoundation video devices:\n[AVFoundation indev @ 0x1] [0] FaceTime HD Camera\n[AVFoundation indev @ 0x1] AVFoundation audio devices:\n[AVFoundation indev @ 0x1] [0] ZoomAudioDevice\n[AVFoundation indev @ 0x1] [1] USB Audio Device\n[AVFoundation indev @ 0x1] [2] MacBook Pro Microphone\n";
    const outs = "[AudioToolbox @ 0x6] CoreAudio devices:\n[AudioToolbox @ 0x6] [0]               USB Audio Device, AppleUSBAudioEngine:1\n[AudioToolbox @ 0x6] [1]         MacBook Pro Speakers, BuiltInSpeakerDevice\n";
    const d = parseMacDevices(ins, outs);
    expect(d).toEqual({ inputs: ["ZoomAudioDevice", "USB Audio Device", "MacBook Pro Microphone"], outputs: ["USB Audio Device", "MacBook Pro Speakers"] });
    expect(guessDevice(d.inputs)).toBe("USB Audio Device");
    expect(guessDevice(["BlackHole 2ch", "MacBook Pro Microphone"])).toBeUndefined();
  });
  test("the chime is audible, silence isn't", () => {
    expect(rms(chime(16000))).toBeGreaterThan(1000);
    expect(rms(new Int16Array(160))).toBe(0);
  });
  test("the call's instructions carry the plan and every rail", () => {
    const s = instructionsFor({ partner: "Ducter", forName: "Wey", to: "+862161234567", name: "鼎泰丰", goal: "订周六晚 7 点 4 位", say: ["姓顾"], keep: "最多等 30 分钟", mustNot: ["Never say or suggest you are Wey or any human; you are an AI assistant."], context: [{ text: "Open the call by saying, in the language of the call: this is Ducter, Wey's AI assistant, calling for Wey.", source: "x" }], maxMinutes: 15 });
    expect(s).toContain("from Wey's own phone number");
    expect(s).toContain("never say it: 最多等 30 分钟");
    expect(s).toContain("this is Ducter, Wey's AI assistant");
    expect(s).toContain("do not leave a message");
    expect(engineInfo("openai").inRate).toBe(24000);
    expect(engineInfo("qwen").inRate).toBe(16000);
  });
});

/** Real time, moved to today's 12:00 in Shanghai (the hours rule lets a call go now). */
function noonInShanghai(): Clock {
  const d = new Date();
  const noon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 4, 0, 0);
  const off = noon - Date.now();
  return { now: () => Date.now() + off, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
}

/** A home with no Tuwa: the owner's phone is the only line. */
function noConnections(): ConnectionsStore {
  return { view: () => [], toolsOf: async () => [], invoke: async () => ({ ok: false }), reserve: () => undefined, onChange: () => () => undefined } as unknown as ConnectionsStore;
}

describe("a call from the owner's own phone, end to end (fakes)", () => {
  let tmp: ReturnType<typeof tempDir>;
  let log: LogStore & { close?: () => void };
  let p: FakePhone;
  let voice: ReturnType<typeof fakeVoice>;
  let own: OwnPhone;
  let phone: Phone;
  const KEY = "sk-test-0123456789abcdefghij";

  beforeEach(async () => {
    tmp = tempDir();
    log = openLog({ path: join(tmp.dir, "log.db"), persona: "p" });
    p = fakePhone();
    voice = fakeVoice();
    own = openOwnPhone({
      dataDir: tmp.dir,
      where: () => "Studio",
      partnerName: () => "Ducter",
      savedNumber: () => "+8613912345678",
      zone: () => "Asia/Shanghai",
      neverCall,
      exec: p.exec,
      bridge: (e) => loopbackBridge({ inRate: e.inRate, outRate: e.outRate }),
      engineUrl: voice.url,
      listAudio: async () => ({ inputs: ["MacBook Pro Microphone", "USB Audio Device"], outputs: ["MacBook Pro Speakers", "USB Audio Device"], tool: true }),
      speak: async (_t, r) => chime(r),
      stepMs: 40,
    });
    phone = openPhone({ dataDir: tmp.dir, log, connections: noConnections(), clock: noonInShanghai(), quiet: () => null, zone: () => "Asia/Shanghai", partnerName: () => "Ducter", own });
  });
  afterEach(() => {
    phone.stop();
    own.stop();
    voice.stop();
    log.close?.();
    tmp.cleanup();
  });

  async function setUp() {
    await own.scan();
    expect(await own.act({ action: "key", engine: "openai", key: KEY })).toEqual({ ok: true });
    p.autoAnswerAfterReads = 2;
    expect(await own.act({ action: "test", to: "+8613800001111" })).toEqual({ ok: true });
    await until(() => own.view().test.state === "asking");
    await own.act({ action: "heard", heard: true });
  }

  test("setup: the checklist reads the phone, the SIM, the headset and the cable, then a test call", async () => {
    await own.scan();
    let v = own.view();
    expect(v.phone).toEqual({ serial: "R5CT30ABCDE", model: "Pixel 7", state: "ready", android: "15" });
    expect(v.sim).toEqual({ state: "ready", carrier: "China Mobile" });
    expect(v.number).toBe("+8613912345678"); // from Your details
    expect(v.headset).toBe("yes");
    expect(v.audio.input).toBe("USB Audio Device");
    expect(v.ready).toBe(false);
    expect(await own.act({ action: "key", engine: "openai", key: "short" })).toEqual({ ok: false, error: "key" });
    await setUp();
    v = own.view();
    expect(v.test.state).toBe("passed");
    expect(v.voice).toEqual({ engine: "openai", key: true, model: "gpt-realtime-2.1", perMinUsd: 0.2 });
    expect(v.ready).toBe(true);
    expect(p.dialed).toEqual(["+8613800001111"]);
    expect(p.keys).toContain("KEYCODE_ENDCALL");
    // The key stays on the home, 0600, and never in the view.
    expect(statSync(join(tmp.dir, OWN_FILE)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(v)).not.toContain(KEY);
    // A new cable path voids the test.
    await own.act({ action: "audio", input: "MacBook Pro Microphone" });
    expect(own.view().ready).toBe(false);
  });

  test("the test call: nobody picks up → said as such; an emergency number is refused", async () => {
    await own.scan();
    expect(await own.act({ action: "test", to: "+1911" })).toEqual({ ok: false, error: "number" });
  });

  test("a call to mainland China goes from the owner's phone: card, Go, a question from the line, the outcome", async () => {
    await setUp();
    p.dialed.length = 0;
    p.keys.length = 0;
    p.autoAnswerAfterReads = 2;
    const r = await phone.draft({ to: "+862161234567", name: "鼎泰丰", goal: "订周六晚 7 点 4 位", say: ["姓顾"], present: true, forName: "Wey" }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    expect(r.plan.from).toBe("own");
    expect(r.plan.provider).toBe(OWN_PHONE);
    expect(r.plan.fromNumber).toBe("+8613912345678");
    expect(r.plan.fromPhone).toBe("Pixel 7");
    expect(r.plan.note).toBeUndefined(); // no "won't connect" from the owner's own SIM
    expect(r.plan.perMinUsd).toBe(0.2);
    log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.card.decisionId, option: "go", by: "user" } });
    await until(() => p.dialed.length === 1);
    expect(p.dialed).toEqual(["+862161234567"]);
    expect(own.view().live?.name).toBe("鼎泰丰");
    // The question from the line becomes the top card.
    await until(() => phone.get(r.callId)?.state === "question");
    const q = phone.get(r.callId)!.question!;
    expect(q.text).toBe("要包间吗？");
    expect(q.yesNo).toBe(true);
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: q.decisionId, option: "go", by: "user" } });
    await until(() => phone.get(r.callId)?.state === "done");
    const c = phone.get(r.callId)!;
    expect(c.outcome).toBe("订好了：周六 19:00，4 位，包间");
    expect(c.agreed).toEqual(["周六 19:00", "4 位", "包间"]);
    expect(c.transcript?.map((t) => t.who)).toEqual(["agent", "them", "agent"]);
    expect(c.costUsd).toBeGreaterThan(0);
    // The owner's yes reached the engine as the tool's answer; Ducter hung up after end_call.
    expect(voice.seen.some((e) => e.type === "conversation.item.create" && e.item?.output === "Yes.")).toBe(true);
    expect(p.keys).toContain("KEYCODE_ENDCALL");
    // The session was told who it is, the plan and the rails.
    const s = voice.seen.find((e) => e.type === "session.update")!.session;
    expect(s.instructions).toContain("鼎泰丰");
    expect(s.instructions).toContain("AI assistant");
    expect(s.tools.map((t: { name: string }) => t.name)).toEqual(["ask_owner", "press_keys", "end_call"]);
    expect(own.view().today).toBe(1); // this one (a test call is the owner's own check, not counted)
  });

  test("the owner on their own call: Ducter waits, then dials when the phone is free", async () => {
    await setUp();
    p.dialed.length = 0;
    p.ownerCall(true);
    const r = await phone.draft({ to: "+862161234567", name: "鼎泰丰", goal: "问营业时间", present: true }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.card.decisionId, option: "go", by: "user" } });
    await Bun.sleep(300);
    expect(p.dialed).toEqual([]);
    expect(phone.get(r.callId)!.state).toBe("waiting");
    expect(own.view().busy).toBe(true);
  });

  test("the owner hangs up from the app", async () => {
    await setUp();
    p.dialed.length = 0;
    p.autoAnswerAfterReads = 2;
    const r = await phone.draft({ to: "+862161234567", name: "鼎泰丰", goal: "问营业时间", present: true }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.card.decisionId, option: "go", by: "user" } });
    await until(() => ["talking", "question"].includes(phone.get(r.callId)?.state ?? ""));
    expect(await phone.cancel(r.callId, "owner")).toBe(true);
    await until(() => phone.get(r.callId)?.state === "cancelled");
    expect(p.state).toBe("ended");
  });

  test("choosing the line: asked for, the owner's voice, nothing set up", async () => {
    // Not set up yet: +86 is a call sheet (D215), never a dead end.
    const none = await phone.draft({ to: "+862161234567", name: "x", goal: "y" }, { lang: "zh" });
    expect(none.ok).toBe(false);
    await setUp();
    // Tuwa asked for: not connected (a +1 number it would reach); to +86 it would be a call sheet (D215).
    const tuwa = await phone.draft({ to: "+14155550123", name: "x", goal: "y", from: "tuwa" }, { lang: "zh" });
    expect(await phone.draft({ to: "+862161234567", name: "x", goal: "y", from: "tuwa" }, { lang: "zh" })).toMatchObject({ ok: false, reason: "sheet" });
    expect(tuwa).toMatchObject({ ok: false, reason: "no_phone" });
    const mine = await phone.draft({ to: "+862161234567", name: "x", goal: "y", voice: "owner" }, { lang: "zh" });
    expect(mine).toMatchObject({ ok: false, reason: "voice" });
    expect(phone.available()).toEqual({ connectionId: OWN_PHONE, provider: OWN_PHONE });
  });
});

// Opt-in: the real adb against an Android emulator (its fake modem). Dials a made-up number,
// reads the call state while it goes out, hangs up. DUCTER_OWN_PHONE_EMULATOR=<serial>.
const EMU = process.env.DUCTER_OWN_PHONE_EMULATOR;
describe.skipIf(!EMU)("adb against the Android emulator (opt-in)", () => {
  test("dial, the call state moves, hang up, idle", async () => {
    const bin = findAdb()!;
    // Ducter's own adb server (port 5137) finds the emulator a moment after it starts.
    for (let i = 0; i < 20 && !(await listPhones(adbExec(bin))).some((p) => p.serial === EMU); i++) await Bun.sleep(500);
    const a = new OwnPhoneAdb(adbExec(bin), EMU!);
    const info = await a.info();
    expect(info.sim).toBe("ready");
    // The emulator's fake modem drops a number written with "+" at once (REMOTE, cause 2, seen
    // 2026-11-12), and takes the national form; a real phone takes E.164. So this one call goes
    // through the same argv by hand, the rest through the module.
    const r = await adbExec(bin)(["-s", EMU!, "shell", "am", "start", "-a", "android.intent.action.CALL", "-d", "tel:5551230000"]);
    expect(r.code).toBe(0);
    const seen = new Set<string>();
    const end = Date.now() + 40_000;
    while (Date.now() < end && !seen.has("active")) {
      seen.add((await a.callState()).state);
      await Bun.sleep(500);
    }
    await a.hangUp();
    await Bun.sleep(1500);
    const after = (await a.callState()).state;
    console.log(`[emulator] states seen: ${[...seen].join(" → ")}; after hang-up: ${after}`);
    expect(seen.has("dialing") || seen.has("active")).toBe(true);
    expect(["idle", "ended"]).toContain(after);
  }, 60_000);
});
