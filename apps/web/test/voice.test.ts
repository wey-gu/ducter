// D305: hold to talk and read aloud, with a fake recognizer and a fake voice (never the real
// microphone or speakers): the first-use card, keep / send / drop / tap / nothing heard, denied
// and unavailable, the reply read aloud after a message sent by voice, and the words (their Mac parity is words.test.ts').
import { describe, expect, test } from "bun:test";
import { chunks, FakeRecognizer, FakeSpeaker, levelOfRms, pickVoice, whyOfWebError } from "../src/voice-engine.ts";
import { VoiceCtl } from "../src/voice.tsx";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

function setup(opts: { asked?: boolean; lang?: string } = {}) {
  mem.clear();
  if (opts.asked !== false) mem.set("ducter.voice.asked", "1");
  const rec = new FakeRecognizer();
  const spk = new FakeSpeaker();
  let now = 1000;
  const h = { draft: "", sent: [] as string[], focused: 0, changes: 0 };
  const ctl = new VoiceCtl(rec, spk, {
    changed: () => void h.changes++,
    draft: () => h.draft,
    setDraft: (v) => void (h.draft = v),
    send: (text) => (h.sent.push(text), true),
    lang: () => opts.lang ?? "zh",
    focus: () => void h.focused++,
    now: () => now,
  });
  return { ctl, rec, spk, h, later: (ms: number) => void (now += ms) };
}

/** Holds the mark at (100, 500), hears words, slides by (dx, dy), and lets go after `ms`. */
async function hold(s: ReturnType<typeof setup>, words: string, slide = { dx: 0, dy: 0 }, ms = 1200) {
  s.rec.words = words;
  await s.ctl.press(100, 500);
  s.rec.hear(words.slice(0, 3));
  s.ctl.move(100 + slide.dx, 500 + slide.dy);
  s.later(ms);
  await s.ctl.release();
}

describe("hold to talk", () => {
  test("first hold shows the one-line card, not the microphone; Use the microphone asks the OS", async () => {
    const s = setup({ asked: false });
    await s.ctl.press(0, 0);
    expect(s.ctl.phase).toBe("ask");
    expect(s.rec.started).toEqual([]);
    await s.ctl.release();
    expect(s.ctl.phase).toBe("ask");
    await s.ctl.allowNow();
    expect(s.ctl.asked()).toBe(true);
    expect(s.ctl.phase).toBe("tap"); // "Hold it while you talk, then let go."
  });

  test("let go: the words go into the composer after what is typed, not sent", async () => {
    const s = setup();
    s.h.draft = "明天";
    await hold(s, "提醒我交房租");
    expect(s.h.draft).toBe("明天提醒我交房租");
    expect(s.h.sent).toEqual([]);
    expect(s.h.focused).toBe(1);
    expect(s.rec.started).toEqual(["zh-CN"]);
    expect(s.ctl.phase).toBe("idle");
  });

  test("slide up: sent at once", async () => {
    const s = setup({ lang: "en" });
    await hold(s, "Book the dentist for Friday", { dx: 0, dy: -80 });
    expect(s.h.sent).toEqual(["Book the dentist for Friday"]);
    expect(s.h.draft).toBe("");
    expect(s.rec.started).toEqual(["en-US"]);
  });

  test("slide left: dropped; the draft is untouched", async () => {
    const s = setup();
    s.h.draft = "keep me";
    await hold(s, "不要这句", { dx: -100, dy: 0 });
    expect(s.h.draft).toBe("keep me");
    expect(s.h.sent).toEqual([]);
  });

  test("a tap shows how to hold; nothing heard says so", async () => {
    const s = setup();
    await hold(s, "something", undefined, 100);
    expect(s.ctl.phase).toBe("tap");
    const t = setup();
    await hold(t, "");
    expect(t.ctl.phase).toBe("empty");
    expect(t.h.draft).toBe("");
  });

  test("Esc while holding drops it", async () => {
    const s = setup();
    s.rec.words = "x";
    await s.ctl.press(0, 0);
    s.ctl.drop();
    expect(s.ctl.phase).toBe("idle");
    await s.ctl.release();
    expect(s.h.draft).toBe("");
  });

  test("denied leads to Settings; unavailable says why", async () => {
    const s = setup();
    s.rec.avail = { ok: true, where: "device", mic: "denied", speech: "granted" };
    await s.ctl.press(0, 0);
    expect(s.ctl.phase).toBe("denied");
    expect(s.ctl.denied).toBe("mic");
    s.ctl.openSettings();
    expect(s.rec.opened).toEqual(["mic"]);
    const u = setup();
    u.rec.avail = { ok: false, where: "browser", why: "browser", mic: "ask", speech: "granted" };
    await u.ctl.press(0, 0);
    expect(u.ctl.phase).toBe("off");
    expect(u.ctl.why).toBe("browser");
  });
});

describe("read aloud", () => {
  test("in the message's own language, as plain words", async () => {
    const s = setup();
    await s.ctl.read(7, "**Done.** See [the report](https://x.y).", "zh", "zh");
    expect(s.spk.said).toEqual([{ text: "Done. See the report.", locale: "en-US" }]);
    expect(s.ctl.speaking).toBe(7);
    s.spk.finish();
    expect(s.ctl.speaking).toBeUndefined();
  });

  test("typing stops a reading", async () => {
    const s = setup();
    await s.ctl.read(3, "好的，我来看看。", "zh", "zh");
    s.ctl.typed();
    expect(s.ctl.speaking).toBeUndefined();
  });

  test("the reply to a message sent by voice is read only with the setting on", async () => {
    const s = setup();
    await hold(s, "hi", { dx: 0, dy: -80 });
    expect(s.ctl.readbackAfter).toBeUndefined();
    s.ctl.setReadback(true);
    await hold(s, "hi again", { dx: 0, dy: -80 });
    expect(s.ctl.readbackAfter).toBeDefined();
    // a voice-filled draft sent with Send counts too
    const t = setup();
    t.ctl.setReadback(true);
    await hold(t, "你好");
    t.ctl.sentDraft();
    expect(t.ctl.readbackAfter).toBeDefined();
  });
});

describe("engines", () => {
  test("level from RMS: (dB + 50) / 40", () => {
    expect(levelOfRms(0)).toBe(0);
    expect(levelOfRms(1)).toBe(1);
    expect(levelOfRms(0.01)).toBeCloseTo(0.25, 2);
  });
  test("long words go in sentences; a voice on the device first; Web Speech errors named", () => {
    expect(chunks("One. Two. Three.", 8)).toEqual(["One.", "Two.", "Three."]);
    const vs = [
      { lang: "zh-TW", localService: true },
      { lang: "zh-CN", localService: false },
      { lang: "zh-CN", localService: true },
      { lang: "en-US", localService: true },
    ];
    expect(pickVoice(vs, "zh-CN")).toBe(vs[2]!);
    expect(pickVoice(vs, "zh-HK")).toBe(vs[0]!);
    expect(pickVoice(vs, "ko-KR")).toBeUndefined();
    expect(whyOfWebError("not-allowed")).toBe("mic");
    expect(whyOfWebError("no-speech")).toBe("nothing");
  });
});

// The words equal the Mac's, key for key: words.test.ts checks every mirrored table (D488).
