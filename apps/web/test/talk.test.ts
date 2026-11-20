// D442: 放手说 / Talk hands-free on the page, with a fake recognizer and a fake voice and a fake
// clock (never the real microphone or speakers): scripted turns, the spoken reply, cutting in,
// a card answered by voice, the floor kept a tap, a quiet minute, End, the first-use card.
import { beforeEach, describe, expect, test } from "bun:test";
import { voiceWords } from "../src/i18n-voice.ts";
import { TalkCtl } from "../src/talk.tsx";
import type { DecisionState } from "../src/store.ts";
import { FakeRecognizer, FakeSpeaker } from "../src/voice-engine.ts";
import { VoiceCtl } from "../src/voice.tsx";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { asked?: boolean; lang?: "zh" | "en" } = {}) {
  mem.clear();
  if (opts.asked !== false) mem.set("ducter.talk.asked", "1");
  const lang = opts.lang ?? "zh";
  const rec = new FakeRecognizer();
  const spk = new FakeSpeaker();
  let now = 10_000;
  const h = { sent: [] as string[], decided: [] as [string, string][] };
  const ctl = new TalkCtl(rec, spk, {
    changed: () => {},
    send: (text) => (h.sent.push(text), true),
    decide: (id, option) => void h.decided.push([id, option]),
    lang: () => lang,
    ui: () => lang,
    now: () => now,
    t: (k) => voiceWords[lang][k] ?? k,
    lastSeq: () => 5,
    openIds: () => ["old"],
  });
  /** Time passes, with the page's ticks five times a second. */
  const wait = (ms: number) => {
    for (let n = 0; n < ms; n += 200) (now += 200), ctl.tick();
  };
  /** The person says words (the recognizer's partials), then pauses. */
  const say = (words: string) => {
    rec.hear(words.slice(0, Math.ceil(words.length / 2)));
    wait(200);
    rec.hear(words);
  };
  return { ctl, rec, spk, h, wait, say };
}

const card = (id: string, question: string, more: Partial<DecisionState> = {}) => ({ decisionId: id, question, goLabel: "好", defaultOption: "hold", reversible: true, seq: 9, ...more }) as DecisionState;

describe("talk hands-free", () => {
  beforeEach(() => mem.clear());

  test("the first tap shows its card and listens to nothing; Start begins", async () => {
    const s = setup({ asked: false });
    await s.ctl.start();
    expect(s.ctl.ui).toBe("ask");
    expect(s.rec.started).toEqual([]);
    await s.ctl.allow();
    expect(s.ctl.ui).toBe("on");
    expect(s.rec.started).toEqual(["zh-CN"]);
    expect(s.ctl.firstTime()).toBe(false);
  });

  test("a turn ends on a quiet gap and goes as a message; the reply is said short", async () => {
    const s = setup();
    await s.ctl.start();
    s.say("明天北京天气怎么样");
    s.wait(600);
    expect(s.h.sent).toEqual([]); // still within the gap
    s.wait(800);
    expect(s.h.sent).toEqual(["明天北京天气怎么样"]);
    expect(s.ctl.st.phase).toBe("think");
    expect(s.rec.started.length).toBe(2); // listening again for the next turn
    s.ctl.reply(6, "明天北京晴，最高 12 度。\n\n- 早上 2 度\n- 下午 12 度");
    expect(s.spk.said.at(-1)!.text).toBe("明天北京晴，最高 12 度。早上 2 度。下午 12 度");
    expect(s.ctl.st.phase).toBe("speak");
    s.spk.finish();
    expect(s.ctl.st.phase).toBe("listen");
  });

  test("an old message is never said; a card's own message is said as the card", async () => {
    const s = setup();
    await s.ctl.start();
    s.ctl.reply(5, "旧的");
    s.ctl.reply(7, "要合进去吗？", "d1");
    expect(s.spk.said).toEqual([]);
  });

  test("talking over the voice cuts it off; its own echo does not", async () => {
    const s = setup();
    await s.ctl.start();
    s.ctl.reply(6, "三个选择：周五晚上直飞，周六早上经停。要订哪个？");
    s.rec.hear("三个选择周五晚上");
    expect(s.ctl.st.phase).toBe("speak"); // only the echo
    s.rec.hear("三个选择周五晚上直飞等等改成周六");
    expect(s.ctl.st.phase).toBe("listen");
    expect(s.ctl.st.saying).toBeUndefined();
    s.wait(1400);
    expect(s.h.sent).toEqual(["等等改成周六"]);
  });

  test("a new card is asked aloud and 好 answers it; one open before the talk is not", async () => {
    const s = setup();
    await s.ctl.start();
    s.ctl.cards([card("old", "以前的"), card("d1", "要把这个分支合进 main 吗？")]);
    expect(s.spk.said.map((x) => x.text)).toEqual(["要把这个分支合进 main 吗？说「好」，或者「先等等」。"]);
    expect(s.ctl.card?.id).toBe("d1");
    s.spk.finish();
    s.say("好");
    s.wait(1400);
    expect(s.h.decided).toEqual([["d1", "go"]]);
    expect(s.spk.said.at(-1)!.text).toBe("好，这就去做。");
    expect(s.h.sent).toEqual([]);
  });

  test("the floor: a pay card is said with its line and 好 never pays", async () => {
    const s = setup();
    await s.ctl.start();
    s.ctl.cards([card("p1", "付 ¥1280 买周五的机票？", { pay: { merchant: "x" } as never })]);
    expect(s.spk.said.at(-1)!.text).toBe("付 ¥1280 买周五的机票？这个要你在屏幕上点一下。");
    s.spk.finish();
    s.say("好");
    s.wait(1400);
    expect(s.h.decided).toEqual([]);
    expect(s.h.sent).toEqual([]);
    expect(s.spk.said.at(-1)!.text).toBe("这个要你在屏幕上点一下。");
    s.ctl.answer("go"); // no Go button on a floor card either
    expect(s.h.decided).toEqual([]);
  });

  test("a card tapped on the talk's buttons stops its question", async () => {
    const s = setup();
    await s.ctl.start();
    s.ctl.cards([card("d1", "要把这个分支合进 main 吗？")]);
    s.ctl.answer("hold");
    expect(s.h.decided).toEqual([["d1", "hold"]]);
    expect(s.ctl.st.saying).toBeUndefined();
  });

  test("a quiet minute: it says so and stops", async () => {
    const s = setup();
    await s.ctl.start();
    s.wait(60_200);
    expect(s.spk.said.at(-1)!.text).toBe("我先不听了。");
    s.spk.finish();
    expect(s.ctl.ui).toBe("idle");
    expect(s.ctl.note).toBe("talk.ended.quiet");
    expect(s.rec.started.length).toBeGreaterThan(0);
  });

  test("就这样 ends it; End ends it while it speaks", async () => {
    const s = setup();
    await s.ctl.start();
    s.say("就这样");
    s.wait(1400);
    expect(s.ctl.ui).toBe("idle");
    expect(s.h.sent).toEqual([]);
    const t = setup({ lang: "en" });
    await t.ctl.start();
    t.ctl.reply(6, "Tomorrow is sunny.");
    t.ctl.end();
    expect(t.ctl.ui).toBe("idle");
    expect(t.spk.said.map((x) => x.text)).toEqual(["Tomorrow is sunny."]);
  });

  test("a recognizer that can't start says why and does not talk", async () => {
    const s = setup();
    s.rec.avail = { ok: false, where: "browser", why: "browser", mic: "ask", speech: "granted" };
    await s.ctl.start();
    expect(s.ctl.ui).toBe("off");
    expect(s.ctl.why).toBe("browser");
    s.rec.avail = { ok: true, where: "device", mic: "denied", speech: "granted" };
    await s.ctl.start();
    expect(s.ctl.ui).toBe("denied");
  });
});

describe("the mic: a tap talks, a hold still holds", () => {
  test("a tap on the mark starts the talk; a hold puts words in the box", async () => {
    mem.clear();
    mem.set("ducter.voice.asked", "1");
    const rec = new FakeRecognizer();
    let now = 0;
    let taps = 0;
    let talking = false;
    const h = { draft: "" };
    const v = new VoiceCtl(rec, new FakeSpeaker(), {
      changed: () => {},
      draft: () => h.draft,
      setDraft: (x) => void (h.draft = x),
      send: () => true,
      lang: () => "zh",
      focus: () => {},
      now: () => now,
      tap: () => void taps++,
      talking: () => talking,
    });
    await v.press(0, 0);
    now += 100;
    await v.release();
    expect(taps).toBe(1);
    expect(v.phase).toBe("idle");
    rec.words = "提醒我交房租";
    await v.press(0, 0);
    now += 1200;
    await v.release();
    expect(h.draft).toBe("提醒我交房租");
    expect(taps).toBe(1);
    talking = true;
    const starts = rec.started.length;
    await v.press(0, 0);
    now += 900;
    await v.release();
    expect(taps).toBe(2); // while talking, the mark ends the talk and never holds
    expect(rec.started.length).toBe(starts);
    await settle();
  });
});
