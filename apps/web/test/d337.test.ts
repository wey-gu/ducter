// D337 (research/118 #13): the own-number setup rests folded, one row with 设置 / Set up, until the
// person opens it or has started it; what the home finds by itself is not a start. The Mac's rule
// is the same (apps/desktop/internal/views/d337_test.go).
import { describe, expect, test } from "bun:test";
import type { OwnPhoneView } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";

const fresh: OwnPhoneView = {
  where: "Siwei's MacBook Pro",
  station: true,
  os: "mac",
  adb: true,
  number: "+8613912345678",
  headset: "unknown",
  audio: { inputs: ["MacBook Air Microphone"], outputs: ["MacBook Air Speakers"], input: "MacBook Air Microphone", output: "MacBook Air Speakers", tool: true },
  voice: { engine: "openai", key: false, model: "gpt-realtime-2.1", perMinUsd: 0.2 },
  test: { state: "never" },
  ready: false,
  prefer: false,
  today: 0,
  perDay: 10,
};

describe("the own-number setup at rest (D337)", () => {
  test("adb, the saved number and the guessed speakers are not a start; a phone, a key, a test call are", async () => {
    const { ownStarted } = await import("../src/own-phone.tsx");
    expect(ownStarted(fresh)).toBe(false);
    expect(ownStarted({ ...fresh, phone: { serial: "x", model: "Pixel 9", state: "unauthorized" } })).toBe(true);
    expect(ownStarted({ ...fresh, voice: { ...fresh.voice, key: true } })).toBe(true);
    expect(ownStarted({ ...fresh, test: { state: "failed", detail: "no_pickup" } })).toBe(true);
    expect(ownStarted({ ...fresh, ready: true })).toBe(true);
  });

  test("the folded row's words, in both languages", () => {
    const zh = strings("zh"),
      en = strings("en");
    expect(zh.t("own.title")).toBe("用你自己的号码打");
    expect(zh.t("own.fold")).toBe("用你的安卓手机和 SIM 卡打，对方看到的是你的号码。");
    expect(zh.t("own.setup")).toBe("设置");
    expect(en.t("own.fold")).toBe("Calls go from your Android phone and SIM, so they see your number.");
    expect(en.t("own.setup")).toBe("Set up");
  });
});
