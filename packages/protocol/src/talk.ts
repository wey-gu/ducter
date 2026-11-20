// D442: 放手说 / Talk hands-free, the parts every client shares (design/voice.md "Talk
// hands-free"). The person talks to the partner turn by turn without holding anything: the
// platform's own recognizer listens, a quiet gap ends a turn, the partner's reply is said in a
// short spoken form with the platform's own voice, speaking over it cuts it off, and a card that
// waits for a Go is asked aloud and answered by voice, except the floor (D61), which stays a tap.
//
// What is here is pure: when a turn has ended, what is an echo of the voice and what is the person
// cutting in, what "好" / "先等等" mean on a card, which cards a voice may answer, what of a reply
// is said, and one reducer (`talkStep`) that every client drives with its own recognizer, voice
// and clock. The Mac's Go port (apps/desktop/internal/voice/talk.go) passes fixtures/talk.json.

import { destructiveChoice } from "./destructive.ts";
import { speakable } from "./voice.ts";

/** A quiet gap this long after the last change in what is heard ends the person's turn. */
export const TURN_QUIET_MS = 1200;
/** …this long when the words so far end on a filler or a joining word (嗯, 然后, "and", "so"). */
export const TURN_TRAIL_MS = 2400;
/** A minute with nothing heard while it waits for the person ends the talk. */
export const TALK_IDLE_MS = 60_000;
/** Two minutes with no reply and nothing heard end it too (a reply that never comes). */
export const TALK_THINK_MS = 120_000;
/** About fifteen seconds of speech: a Han character weighs 1, another word 1.5 (`weight`). */
export const SPOKEN_UNITS = 60;

const HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Lower case, no punctuation, no spaces between Han characters: how heard words are compared. */
export function plain(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]) | (?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu, "");
}

/** Units of speech: each Han (Kana, Hangul) character and each other word counts one. */
export function units(s: string): string[] {
  const p = plain(s);
  const out: string[] = [];
  for (const w of p.split(" ")) {
    if (!w) continue;
    let latin = "";
    for (const ch of w) {
      if (HAN.test(ch)) {
        if (latin) out.push(latin), (latin = "");
        out.push(ch);
      } else latin += ch;
    }
    if (latin) out.push(latin);
  }
  return out;
}

/** How long words take to say, in units: a Han (Kana, Hangul) character 1, any other word 1.5. */
export function weight(s: string): number {
  return units(s).reduce((n, u) => n + (HAN.test(u) ? 1 : 1.5), 0);
}

const TRAIL_ZH = /(嗯|呃|啊|那个|这个|然后|就是|还有|因为|所以|但是|而且|或者|和|跟|的|把|给|要|想)$/;
const TRAIL_EN = /\b(um|uh|er|and|but|so|or|because|the|a|an|to|with|of|for|then|like)$/;

/** Whether the words so far end where a person would carry on (a filler, a joining word). */
export function trails(heard: string): boolean {
  const p = plain(heard);
  return TRAIL_ZH.test(p) || TRAIL_EN.test(p);
}

/** How long a quiet gap must last before this turn is over. */
export function quietFor(heard: string): number {
  return trails(heard) ? TURN_TRAIL_MS : TURN_QUIET_MS;
}

/**
 * What is left of what was heard once the voice's own words are taken off its front: while the
 * partner speaks, the microphone also hears the speaker, so the heard words start with an echo.
 * The longest front of the heard units that appears, in order, in what is being said is dropped.
 */
export function afterEcho(heard: string, saying: string): string {
  const h = units(heard);
  if (!saying) return h.join(joiner(h));
  const said = units(saying);
  const s = said.join("\u0001");
  let cut = 0;
  for (let n = h.length; n > 0; n--) {
    if (`\u0001${s}\u0001`.includes(`\u0001${h.slice(0, n).join("\u0001")}\u0001`)) {
      cut = n;
      break;
    }
  }
  const rest = h.slice(cut);
  return rest.join(joiner(rest));
}
const joiner = (u: string[]) => (u.some((w) => HAN.test(w)) ? "" : " ");

const STOP = new Set(["停", "停一下", "停下", "别说了", "不用说了", "好了好了", "stop", "quiet", "be quiet", "enough", "ok stop", "okay stop"]);
/** "停" / "stop" on its own: the voice stops, nothing is sent. */
export function heardStop(heard: string): boolean {
  return STOP.has(plain(heard));
}

/**
 * Whether the person is cutting in while the partner speaks: what is left after the echo is two
 * units or more, or a stop word, or (while a card is asked) an answer to it.
 */
export function isBargeIn(heard: string, saying: string, asking = false): boolean {
  const rest = afterEcho(heard, saying);
  if (!rest) return false;
  if (heardStop(rest)) return true;
  if (asking && heardAnswer(rest)) return true;
  return units(rest).length >= 2;
}

const GO = new Set([
  "好", "好的", "好啊", "好呀", "好吧", "行", "行啊", "行吧", "可以", "可以的", "可以啊", "对", "对的", "嗯好", "没问题", "去吧", "去做吧", "做吧", "发吧", "弄吧", "确定", "同意", "就这么办", "照做",
  "ok", "okay", "yes", "yeah", "yep", "yup", "sure", "go", "go ahead", "do it", "sounds good", "alright", "all right", "fine", "ok go", "yes please", "please do",
]);
const HOLD = new Set([
  "先等等", "等等", "等一下", "等一等", "等会", "等会儿", "先别", "别", "不要", "不用", "不行", "先不要", "先不用", "先不", "算了", "不", "不了", "再说", "先放着", "先不动",
  "wait", "hold on", "hold", "not now", "no", "nope", "dont", "not yet", "later", "hang on", "no thanks", "wait a moment", "wait a second",
]);
const LEAD = /^(嗯|呃|那|那就|um|uh|well|oh)\s*/;
const TAIL = /\s*(吧|啊|呀|哈|呢|please|then|thanks)$/;

/** What a few words answer to a card asked aloud: Go, Hold, or nothing (they said something else). */
export function heardAnswer(heard: string): "go" | "hold" | undefined {
  let p = plain(heard);
  for (let i = 0; i < 3; i++) {
    if (GO.has(p)) return "go";
    if (HOLD.has(p)) return "hold";
    const q = p.replace(LEAD, "").replace(TAIL, "").trim();
    if (q === p) break;
    p = q;
  }
  return undefined;
}

const END = new Set([
  "就这样", "就这样吧", "先这样", "先这样吧", "好了就这样", "就这些", "不说了", "先不说了", "结束", "挂了", "拜拜", "再见", "没事了", "别听了", "不聊了",
  "thats all", "thats it", "bye", "goodbye", "bye bye", "stop listening", "end", "were done", "im done", "thats all for now", "talk later", "end talk",
]);
/** The person saying they're done talking ("就这样", "that's all"), as the whole turn. */
export function heardEnd(heard: string): boolean {
  const p = plain(heard);
  return END.has(p) || END.has(p.replace(LEAD, "").replace(TAIL, "").trim());
}

/**
 * What of a partner's message is said in a talk: its words as a person reads them (`speakable`),
 * whole sentences up to about fifteen seconds (`SPOKEN_UNITS` of `weight`); the first sentence always whole. Cut short, `more`
 * follows ("其余的写在屏幕上了。"), since the whole message is in the conversation.
 */
export function spokenReply(text: string, more: string, max = SPOKEN_UNITS): string {
  const s = speakable(text);
  if (!s) return "";
  const parts = s.match(/(?:[^。！？!?.]|\.(?!\s|$))+(?:[。！？!?]+|\.(?=\s|$)|$)\s*/g) ?? [s];
  const out: string[] = [];
  let n = 0;
  for (const p of parts) {
    const u = weight(p);
    if (out.length && n + u > max) return sayAfter(out.join("").trim(), more);
    out.push(p);
    n += u;
  }
  return out.join("").trim();
}

/** Why a card can't be answered by voice: the floor (D61) and what needs the screen to read. */
export type TalkFloor = "pay" | "secret" | "delete" | "untrusted" | "look";

/** The fields of a decision this reads (protocol Bodies["decision"]). */
export interface TalkCard {
  question: string;
  goLabel?: string;
  pay?: unknown;
  checkout?: unknown;
  key?: unknown;
  signIn?: unknown;
  fill?: unknown;
  asker?: unknown;
  sender?: unknown;
  trust?: unknown;
  draft?: unknown;
  handset?: unknown;
  phone?: unknown;
  computer?: unknown;
  call?: { kind: string };
}

/**
 * Whether a card may be answered by voice, and if not why. Never by voice: paying (Pay, checkout),
 * passwords, keys and sign-ins, anything whose Go deletes (D340's words), what one of the person's
 * agents or a stranger asked (D170, D334), and what must be seen to be decided: a written draft, a
 * tap on a phone or in the person's apps, a phone call's Go, the person's own phone lent.
 */
export function talkFloor(d: TalkCard): TalkFloor | undefined {
  if (d.pay || d.checkout) return "pay";
  if (d.key || d.signIn || d.fill) return "secret";
  if (d.asker || d.sender || d.trust) return "untrusted";
  if (destructiveChoice(d.question, d.goLabel)) return "delete";
  if (d.draft || d.handset || d.phone || d.computer || d.call) return "look";
  return undefined;
}

// ---------- the reducer ----------

/** The words a talk says of its own, in the conversation's language (talk.say.*). */
export interface TalkWords {
  hint: string; // 说「好」，或者「先等等」。
  floor: string; // 这个要你在屏幕上点一下。
  more: string; // 其余的写在屏幕上了。
  went: string; // 好，这就去做。
  held: string; // 好，先不动。
  bye: string; // 我先不听了。
}

export type TalkPhase = "listen" | "think" | "speak" | "ended";
export type TalkEnd = "said" | "quiet" | "tap";

export interface TalkState {
  phase: TalkPhase;
  /** What is heard of the person's turn so far (this recognizer session's words). */
  heard: string;
  /** When `heard` last changed. */
  changedAt: number;
  /** Since when nothing was heard and nothing was said (the minute's start). */
  quietSince: number;
  /** A message went and its reply hasn't come. */
  waiting: boolean;
  /** What the voice is saying now, and the card it asks, if it asks one. */
  saying?: { text: string; ask?: string };
  /** Said after what is being said. */
  queue: { text: string; ask?: string }[];
  /** The card asked aloud, waiting for "好" / "先等等". */
  asking?: string;
  /** A floor card was just asked: "好" to it is met with the floor's line again, never sent. */
  floored?: string;
  /** The hint (说「好」，或者「先等等」) is said with the first card of a talk only. */
  hinted: boolean;
  /** The voice was cut off by the person: this recognizer session's words start with its echo. */
  echo?: string;
  /** The minute ran out: the voice says bye, then it ends. */
  closing: boolean;
  endedBy?: TalkEnd;
}

export type TalkEvent =
  | { k: "heard"; text: string; at: number } // the recognizer's words so far, this session
  | { k: "tick"; at: number }
  | { k: "spoken"; at: number } // the voice reached its end
  | { k: "reply"; text: string; at: number } // a partner message, its full written text
  | { k: "ask"; id: string; question: string; floor?: TalkFloor; at: number } // a card that waits for a Go
  | { k: "answered"; id: string; at: number } // the card was answered some other way (a tap)
  | { k: "end"; at: number }; // 结束 / End tapped

export type TalkEffect =
  | { do: "send"; text: string }
  | { do: "decide"; id: string; option: "go" | "hold" }
  | { do: "speak"; text: string }
  | { do: "hush" }
  | { do: "relisten" }
  | { do: "end"; by: TalkEnd };

/** Two things said one after the other: no space after a Han sentence. */
export function sayAfter(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return HAN.test(a.slice(-1)) || /[。！？，：；）」』]$/.test(a) ? `${a}${b}` : `${a} ${b}`;
}

/**
 * The big line over a talk's card: what is being said, unless the card already shows it (D446). A
 * card's question (and the hint or floor line said after it) is on the card; on a floor card, its
 * floor line ("这个要你在屏幕上点一下。") is on the card too, so said again after a "好" it isn't
 * shown twice. Empty means the line shows only who speaks.
 */
export function talkShown(saying: string, card: { question: string; floor: boolean } | undefined, floor: string): string {
  if (!card) return saying;
  if (card.question && saying.startsWith(card.question)) return "";
  if (card.floor && floor && plain(saying) === plain(floor)) return "";
  return saying;
}

export function talkStart(at: number): TalkState {
  return { phase: "listen", heard: "", changedAt: at, quietSince: at, waiting: false, queue: [], hinted: false, closing: false };
}

/**
 * One step of a talk: the state after `e`, and what the client does (in order). The client owns
 * the recognizer (restarted on `relisten`, which clears what it heard), the voice (`speak`,
 * `hush`), the conversation (`send`, `decide`) and the clock (`tick` about five times a second).
 */
export function talkStep(st: TalkState, e: TalkEvent, w: TalkWords): [TalkState, TalkEffect[]] {
  const s: TalkState = { ...st, queue: [...st.queue] };
  const fx: TalkEffect[] = [];
  if (s.phase === "ended") return [s, fx];
  const rest = () => (s.waiting ? "think" : "listen");
  const next = (at: number) => {
    const n = s.queue.shift();
    if (n) {
      s.saying = n;
      s.phase = "speak";
      if (n.ask) s.asking = n.ask;
      fx.push({ do: "speak", text: n.text });
    } else {
      s.saying = undefined;
      s.phase = rest();
      s.quietSince = at;
    }
  };
  const say = (text: string, at: number, ask?: string) => {
    if (!text) return;
    s.queue.push(ask ? { text, ask } : { text });
    if (!s.saying && !s.heard) next(at);
  };
  const end = (by: TalkEnd) => {
    if (s.saying) fx.push({ do: "hush" });
    s.phase = "ended";
    s.endedBy = by;
    s.saying = undefined;
    s.queue = [];
    fx.push({ do: "end", by });
  };

  switch (e.k) {
    case "heard": {
      if (s.saying) {
        if (!isBargeIn(e.text, s.saying.text, !!s.saying.ask)) return [st, fx];
        const cut = afterEcho(e.text, s.saying.text);
        fx.push({ do: "hush" });
        s.queue = s.queue.filter((q) => q.ask); // a card cut off is still on the screen; replies go
        const echo = s.saying.text;
        s.saying = undefined;
        s.closing = false;
        s.phase = rest();
        if (heardStop(cut)) {
          s.heard = "";
          s.quietSince = e.at;
          fx.push({ do: "relisten" });
        } else {
          s.heard = cut;
          s.echo = echo;
          s.changedAt = e.at;
        }
        return [s, fx];
      }
      const t = s.echo ? afterEcho(e.text, s.echo) : e.text.trim();
      if (t !== s.heard) {
        s.heard = t;
        s.changedAt = e.at;
        s.quietSince = e.at;
      }
      return [s, fx];
    }
    case "tick": {
      if (s.saying) return [st, fx];
      if (s.heard) {
        if (e.at - s.changedAt < quietFor(s.heard)) return [st, fx];
        const text = s.heard;
        s.heard = "";
        s.echo = undefined;
        s.quietSince = e.at;
        fx.push({ do: "relisten" });
        if (heardEnd(text)) return end("said"), [s, fx];
        if (heardStop(text)) return next(e.at), [s, fx];
        if (s.floored && heardAnswer(text)) {
          s.floored = undefined;
          say(w.floor, e.at);
          return [s, fx];
        }
        s.floored = undefined;
        if (s.asking) {
          const id = s.asking;
          const a = heardAnswer(text);
          s.asking = undefined;
          if (a) {
            fx.push({ do: "decide", id, option: a });
            say(a === "go" ? w.went : w.held, e.at);
            if (!s.saying) next(e.at);
            return [s, fx];
          }
        }
        fx.push({ do: "send", text });
        s.waiting = true;
        next(e.at);
        return [s, fx];
      }
      if (s.queue.length) return next(e.at), [s, fx];
      if (!s.closing && e.at - s.quietSince >= (s.phase === "think" ? TALK_THINK_MS : TALK_IDLE_MS)) {
        s.closing = true;
        say(w.bye, e.at);
        return [s, fx];
      }
      return [st, fx];
    }
    case "spoken": {
      if (!s.saying) return [st, fx];
      if (s.closing && !s.queue.length) return (s.saying = undefined), end("quiet"), [s, fx];
      fx.push({ do: "relisten" }); // what it heard of its own voice goes
      s.saying = undefined;
      next(e.at);
      return [s, fx];
    }
    case "reply": {
      s.waiting = false;
      s.closing = false;
      if (s.phase === "think") s.phase = "listen";
      say(spokenReply(e.text, w.more), e.at);
      return [s, fx];
    }
    case "ask": {
      s.closing = false;
      if (e.floor) {
        s.floored = e.id;
        say(sayAfter(e.question, w.floor), e.at);
      }
      else {
        say(s.hinted ? e.question : sayAfter(e.question, w.hint), e.at, e.id);
        s.hinted = true;
      }
      return [s, fx];
    }
    case "answered": {
      if (s.asking === e.id) s.asking = undefined;
      if (s.floored === e.id) s.floored = undefined;
      s.queue = s.queue.filter((q) => q.ask !== e.id);
      if (s.saying?.ask === e.id) {
        fx.push({ do: "hush" });
        s.saying = undefined;
        next(e.at);
      }
      return [s, fx];
    }
    case "end":
      end("tap");
      return [s, fx];
  }
}
