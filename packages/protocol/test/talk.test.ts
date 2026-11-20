// D442: 放手说 / Talk hands-free, the shared helpers and the reducer; the Mac's Go port passes the
// same fixture (apps/desktop/internal/voice/talk_test.go).
import { describe, expect, test } from "bun:test";
import fx from "../fixtures/talk.json" with { type: "json" };
import { afterEcho, heardAnswer, heardEnd, heardStop, isBargeIn, quietFor, spokenReply, talkFloor, talkShown, talkStart, talkStep, type TalkCard, type TalkEffect, type TalkEvent, type TalkWords } from "../src/talk.ts";

describe("talk fixture", () => {
  test("a turn ends after a quiet gap, longer after a filler", () => {
    for (const c of fx.quiet) expect(quietFor(c.heard)).toBe(c.want);
  });
  test("the voice's own echo comes off the front", () => {
    for (const c of fx.echo) expect(afterEcho(c.heard, c.saying)).toBe(c.want);
  });
  test("cutting in", () => {
    for (const c of fx.barge) expect(isBargeIn(c.heard, c.saying, c.asking)).toBe(c.want);
  });
  test("好 and 先等等 on a card", () => {
    for (const c of fx.answer) expect(heardAnswer(c.heard) ?? "").toBe(c.want);
  });
  test("saying it's over, and 停", () => {
    for (const c of fx.end) expect(heardEnd(c.heard)).toBe(c.want);
    for (const c of fx.stop) expect(heardStop(c.heard)).toBe(c.want);
  });
  test("the spoken form of a reply", () => {
    for (const c of fx.spoken) expect(spokenReply(c.text, c.more)).toBe(c.want);
  });
  test("the floor", () => {
    for (const c of fx.floor) expect(talkFloor(c.card as TalkCard) ?? "").toBe(c.want);
  });
  test("the big line never repeats the card (D446)", () => {
    expect(fx.shown.length).toBeGreaterThan(0);
    for (const c of fx.shown) expect(talkShown(c.saying, (c as { card?: { question: string; floor: boolean } }).card, c.floor)).toBe(c.want);
  });
  test("scripted talks: turns, barge-in, cards, the floor, silence", () => {
    for (const ss of fx.sessions) {
      let st = talkStart(0);
      ss.events.forEach((e, i) => {
        const [n, f] = talkStep(st, e as TalkEvent, fx.words as TalkWords);
        st = n;
        expect({ name: ss.name, i, fx: f }).toEqual({ name: ss.name, i, fx: ss.fx[i] as TalkEffect[] });
      });
      expect(st.phase).toBe(ss.phase as never);
      expect(st.endedBy ?? "").toBe(ss.endedBy);
    }
  });
});

test("a pay card never becomes a Go, however it is answered", () => {
  const w = fx.words as TalkWords;
  let [st] = talkStep(talkStart(0), { k: "ask", id: "p", question: "付款？", floor: "pay", at: 0 }, w);
  [st] = talkStep(st, { k: "spoken", at: 1000 }, w);
  for (const say of ["好", "可以", "yes", "go ahead"]) {
    let f: TalkEffect[];
    [st] = talkStep(st, { k: "heard", text: say, at: 2000 }, w);
    [st, f] = talkStep(st, { k: "tick", at: 9000 }, w);
    expect(f.some((x) => x.do === "decide")).toBe(false);
    [st] = talkStep(st, { k: "spoken", at: 9500 }, w);
  }
});

test("a reply is said short; the whole stays on the screen", () => {
  const long = Array.from({ length: 12 }, (_, i) => `第${i + 1}步做完了，结果都对得上。`).join("");
  const s = spokenReply(long, "其余的写在屏幕上了。");
  expect(s.endsWith("其余的写在屏幕上了。")).toBe(true);
  expect(s.length).toBeLessThan(long.length);
});

test("nothing happens after it ended", () => {
  const w = fx.words as TalkWords;
  let [st] = talkStep(talkStart(0), { k: "end", at: 0 }, w);
  const [, f] = talkStep(st, { k: "reply", text: "好的。", at: 10 }, w);
  expect(f).toEqual([]);
  [st] = talkStep(st, { k: "tick", at: 999_999 }, w);
  expect(st.phase).toBe("ended");
});
