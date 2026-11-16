// D278 on the phone and the web: the own-number card never tells anyone to plug a phone into a
// server, never prints a Mac command on Linux, and 再找一次 says when it looked and what it saw;
// the call sheet's 你来打 / You call: why it's a sheet, 在 Pixel Fold 上拨打 from another window, and
// what the phone said back. Words in both languages.
import { describe, expect, test } from "bun:test";
import type { OwnPhoneView } from "@ducter/protocol";
import { strings, TABLES } from "../src/i18n.ts";

const view = (o: Partial<OwnPhoneView> = {}): OwnPhoneView => ({
  where: "hel",
  station: false,
  os: "linux",
  adb: false,
  headset: "unknown",
  audio: { inputs: [], outputs: [], tool: false },
  voice: { engine: "openai", key: false, model: "gpt-realtime-2.1", perMinUsd: 0.2 },
  test: { state: "never" },
  ready: false,
  prefer: false,
  today: 0,
  perDay: 10,
  ...o,
});

describe("the own-number card (D278)", () => {
  test("install lines are the home's own system's: brew only on a Mac, apt on Linux, none elsewhere", async () => {
    const { installLine } = await import("../src/own-phone.tsx");
    expect(installLine("mac", "adb")).toBe("brew install android-platform-tools");
    expect(installLine("mac", "ffmpeg")).toBe("brew install ffmpeg");
    expect(installLine("linux", "adb")).toBe("sudo apt install adb");
    expect(installLine("linux", "ffmpeg")).toBe("sudo apt install ffmpeg");
    expect(installLine("other", "adb")).toBeUndefined();
    for (const tool of ["adb", "ffmpeg"] as const) expect(installLine("linux", tool)).not.toContain("brew");
  });

  test("再找一次 answers: when it looked, on which computer, what it saw", async () => {
    const { A } = await import("../src/app.ts");
    const { lookedLine } = await import("../src/own-phone.tsx");
    A.L = strings("zh");
    const at = new Date(2026, 10, 16, 20, 14).toISOString();
    expect(lookedLine(view())).toBeUndefined(); // never looked: nothing to say yet
    expect(lookedLine(view({ station: true, os: "mac", where: "MacBook", lookedAt: at }))).toEqual({ saw: "MacBook 上还没有 adb", at: "20:14" });
    expect(lookedLine(view({ station: true, os: "mac", where: "MacBook", adb: true, lookedAt: at }))).toEqual({ saw: "MacBook 上还没看到手机", at: "20:14" });
    expect(lookedLine(view({ station: true, os: "mac", where: "MacBook", adb: true, lookedAt: at, phone: { serial: "x", model: "Pixel Fold", state: "ready" } }))).toEqual({ saw: "看到 Pixel Fold", at: "20:14" });
    A.L = strings("en");
    expect(lookedLine(view({ station: true, os: "mac", where: "MacBook", adb: true, lookedAt: at }))).toEqual({ saw: "No phone on MacBook yet", at: "20:14" });
  });

  test("a server home's words never ask to plug a phone into it; they say what works today and why", () => {
    for (const lang of ["zh", "en"] as const) {
      const s = TABLES[lang];
      for (const k of ["own.away.lede", "own.away.why", "own.away.soon", "own.away.dial", "own.away.nodial", "own.looking", "own.saw.none", "own.saw.noadb", "own.saw.phone", "own.saw.allow", "own.cmd.distro"]) expect(s[k], `${lang} ${k}`).toBeTruthy();
      for (const k of ["own.away.lede", "own.away.why", "own.away.dial", "own.away.nodial"]) expect(s[k]).not.toMatch(/USB|brew|插到|Plug/);
    }
    expect(strings("zh").t("own.away.why", "hel")).toContain("hel 是服务器");
    expect(strings("en").t("own.away.soon")).toBe("Coming soon");
  });
});

describe("你来打 / You call on the call sheet (D278)", () => {
  test("the phone's answer, in words: dialling, rang, the dialer, a notification, or why not", async () => {
    const { A } = await import("../src/app.ts");
    const { dialWords } = await import("../src/phone.tsx");
    A.L = strings("zh");
    expect(dialWords(undefined)).toBeUndefined();
    expect(dialWords({ phase: "asking", phone: "Pixel Fold" })?.text).toBe("正在让 Pixel Fold 打出去…");
    expect(dialWords({ phase: "done", phone: "Pixel Fold", how: "rang" })?.text).toContain("Pixel Fold 在打了");
    expect(dialWords({ phase: "done", phone: "Pixel Fold", how: "dialer" })?.text).toContain("号码已填好");
    expect(dialWords({ phase: "done", phone: "Pixel Fold", how: "note" })?.text).toContain("通知");
    expect(dialWords({ phase: "failed", phone: "Pixel Fold", reason: "timeout" })).toEqual({ text: "Pixel Fold 没有回应。打开它上面的 Ducter 再试一次。", warn: true });
    A.L = strings("en");
    expect(dialWords({ phase: "failed", phone: "Pixel Fold", reason: "no_phone" })?.warn).toBe(true);
    for (const lang of ["zh", "en"] as const) for (const k of ["call.sheet.why.own", "call.sheet.dial.on", "call.sheet.dialing", "call.sheet.rang", "call.sheet.dialer", "call.sheet.noted", "call.sheet.dialfail", "call.sheet.dialtimeout", "call.sheet.nophone"]) expect(TABLES[lang][k], `${lang} ${k}`).toBeTruthy();
  });

  test("a phone that can dial is found from the devices; the home's answer lands on the sheet", async () => {
    const { A } = await import("../src/app.ts");
    const { dialers } = await import("../src/own-phone.tsx");
    const { DIAL, handsetFrame, dialOn } = await import("../src/handset.tsx");
    A.L = strings("zh");
    const sent: unknown[] = [];
    const was = A.send;
    A.send = ((f: unknown) => void sent.push(f)) as typeof A.send;
    try {
      A.reach = { clients: [{ id: "c_pixel", name: "Pixel Fold · Ducter", platform: "android-app", connected: true, handset: { added: false, able: true, linked: true, dial: true } }, { id: "c_old", name: "Pixel 7 · Ducter", platform: "android-app", connected: true, handset: { added: false, able: true, linked: true } }] } as any;
      expect(dialers().map((c) => c.id)).toEqual(["c_pixel"]);
      dialOn("call_1", "c_pixel", "Pixel Fold");
      expect(sent).toEqual([{ t: "handset_dial", callId: "call_1", device: "c_pixel" }]);
      expect(DIAL.get("call_1")).toEqual({ phase: "asking", phone: "Pixel Fold" });
      handsetFrame({ t: "handset_dial_result", callId: "call_1", ok: true, phone: "Pixel Fold · Ducter", how: "rang" });
      expect(DIAL.get("call_1")).toEqual({ phase: "done", phone: "Pixel Fold · Ducter", how: "rang" });
      handsetFrame({ t: "handset_dial_result", callId: "call_2", ok: false, reason: "timeout" });
      expect(DIAL.get("call_2")).toMatchObject({ phase: "failed", reason: "timeout" });
    } finally {
      A.send = was;
      A.reach = undefined;
    }
  });
});
