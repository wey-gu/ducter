// D305: the shared voice helpers; the Mac's Go port passes the same fixture.
import { describe, expect, test } from "bun:test";
import fx from "../fixtures/voice.json" with { type: "json" };
import { holdIntent, joinHeard, meterBars, readLang, smoothLevel, speakable, speechLocale } from "../src/voice.ts";

describe("voice fixture", () => {
  test("locale", () => {
    for (const c of fx.locale) expect(speechLocale(c.tag || undefined, c.preferred)).toBe(c.want);
  });
  test("speakable", () => {
    for (const c of fx.speakable) expect(speakable(c.text)).toBe(c.want);
  });
  test("hold", () => {
    for (const c of fx.hold) expect(holdIntent({ dx: c.dx, dy: c.dy })).toBe(c.want as never);
  });
  test("join", () => {
    for (const c of fx.join) expect(joinHeard(c.draft, c.heard)).toBe(c.want);
  });
  test("meter and smoothing", () => {
    for (const c of fx.meter) expect(meterBars(c.level)).toEqual(c.want);
    for (const c of fx.smooth) expect(smoothLevel(c.prev, c.next)).toBe(c.want);
  });
});

test("Traditional Chinese never asks for zh-CN; a preferred region of the same language wins", () => {
  expect(speechLocale("zh-Hant", ["zh-CN"])).toBe("zh-TW");
  expect(speechLocale("en", ["en-GB"])).toBe("en-GB");
  expect(speechLocale("zh", ["zh-TW"])).toBe("zh-CN");
});

test("a message is read in its own language, else the conversation's", () => {
  expect(readLang("Hello there, the build is green", "zh", "zh")).toBe("en");
  expect(readLang("👍", "ja", "zh")).toBe("ja");
  expect(readLang("👍", undefined, "en")).toBe("en");
});

test("code and addresses are never read out", () => {
  const s = speakable("看这里 https://example.com/x\n```sh\nrm -rf /\n```\n好了");
  expect(s).not.toContain("http");
  expect(s).not.toContain("rm -rf");
  expect(s).toContain("好了");
});

test("a held press: up sends, left drops, coming back disarms", () => {
  expect(holdIntent({ dx: 0, dy: -80 })).toBe("send");
  expect(holdIntent({ dx: -90, dy: 0 })).toBe("drop");
  expect(holdIntent({ dx: 0, dy: -30 })).toBe("keep");
});
