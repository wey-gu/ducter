// D442: 放手说 / Talk hands-free (design/voice.md "Talk hands-free"). A tap on the microphone
// (a hold is still hold to talk) starts a talk with the partner: the platform's own recognizer
// listens, a quiet gap ends each turn and sends it as a message, the partner's reply is said in a
// short spoken form with the platform's own voice (the whole message is in the conversation as
// always), speaking over it cuts it off, and a card that waits for a Go is asked aloud and
// answered by "好" / "先等等", never a card on the floor (paying, passwords, deleting, what a
// stranger asked, what has to be seen). It ends when the person says so, taps End, or after a
// quiet minute.
//
// The turn-taking is the shared reducer (packages/protocol/src/talk.ts, the Mac passes the same
// fixture); this file runs its effects on the page's engines (voice-engine.ts: the app's, the
// browser's, or the fakes under `?voice-fake` and in tests). The home never receives sound.
import { useEffect } from "preact/hooks";
import { readLang, speechLocale, type VoiceWhere, type VoiceWhy } from "@ducter/protocol/src/voice.ts";
import { talkFloor, talkShown, talkStart, talkStep, type TalkEffect, type TalkEvent, type TalkState, type TalkWords } from "@ducter/protocol/src/talk.ts";
import { A } from "./app.ts";
import { haptic } from "./native.ts";
import type { DecisionState } from "./store.ts";
import type { Recognizer, Speaker } from "./voice-engine.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const ASKED = "ducter.talk.asked";
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

/** What the talk shows: nothing, its first-use card, the talk itself, or why it can't. */
export type TalkUi = "idle" | "ask" | "on" | "off" | "denied";

export interface TalkHost {
  changed(): void;
  send(text: string): boolean;
  decide(id: string, option: "go" | "hold"): void;
  /** The conversation's language (the recognizer's), and the interface's. */
  lang(): string;
  ui(): string;
  now(): number;
  t(key: string): string;
  /** The last message's seq now: only what comes after it is said. */
  lastSeq(): number;
  /** The cards open now: only cards asked after the talk starts are said. */
  openIds(): string[];
}

/** The words a talk says of its own, in the conversation's language. */
export function talkWords(tt: (k: string) => string): TalkWords {
  return { hint: tt("talk.say.hint"), floor: tt("talk.say.floor"), more: tt("talk.say.more"), went: tt("talk.say.went"), held: tt("talk.say.held"), bye: tt("talk.say.bye") };
}

export class TalkCtl {
  ui: TalkUi = "idle";
  st: TalkState = { ...talkStart(0), phase: "ended" };
  why?: VoiceWhy;
  /** Where the recognizer turns sound into words, for the first-use card's privacy line. */
  where?: VoiceWhere;
  /** The last card asked aloud, shown with its two buttons while it waits. */
  card?: { id: string; question: string; floor: boolean };
  /** A passing line after it ended by itself (a quiet minute). */
  note?: string;
  level = 0;
  private gen = 0; // recognizer sessions
  private sgen = 0; // things said
  private seen = 0;
  private asked = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private lock?: { release(): Promise<void> };
  constructor(
    public rec: Recognizer,
    public spk: Speaker,
    private host: TalkHost,
  ) {}

  get on() {
    return this.ui === "on";
  }
  firstTime() {
    return store.get(ASKED) !== "1";
  }
  private locale() {
    const pref = typeof navigator !== "undefined" ? navigator.languages ?? [] : [];
    return speechLocale(this.host.lang(), pref);
  }

  /** The microphone tapped: the first time its card, then the talk. */
  async start() {
    if (this.ui === "on") return;
    this.note = undefined;
    if (this.firstTime()) {
      try {
        this.where = (await this.rec.can(this.locale())).where;
      } catch {}
      this.ui = "ask";
      return this.host.changed();
    }
    await this.begin();
  }
  /** 开始 / Start on the first-use card. */
  async allow() {
    store.set(ASKED, "1");
    const a = await this.rec.can(this.locale());
    if (a.ok && (a.mic === "ask" || a.speech === "ask")) {
      const r = await this.rec.allow(this.locale());
      if (!r.ok) return this.cant(r.why);
    }
    await this.begin();
  }
  later() {
    store.set(ASKED, "1");
    this.ui = "idle";
    this.host.changed();
  }
  dismiss() {
    this.ui = "idle";
    this.host.changed();
  }
  private cant(why: VoiceWhy) {
    this.why = why;
    this.ui = why === "mic" || why === "speech" ? "denied" : "off";
    this.host.changed();
  }

  private async begin() {
    const a = await this.rec.can(this.locale());
    if (!a.ok) return this.cant(a.why ?? "error");
    if (a.mic === "denied") return this.cant("mic");
    if (a.speech === "denied") return this.cant("speech");
    this.st = talkStart(this.host.now());
    this.seen = this.host.lastSeq();
    this.asked = new Set(this.host.openIds());
    this.card = undefined;
    this.ui = "on";
    this.host.changed();
    haptic("light");
    await this.listen();
    if (!this.on) return;
    this.timer = setInterval(() => this.tick(), 200);
    void this.awake(true);
  }

  /** One recognizer session; its words so far are what the reducer hears. */
  private async listen() {
    const g = ++this.gen;
    const r = await this.rec.start(this.locale(), {
      level: (l) => g === this.gen && ((this.level = l), this.host.changed()),
      partial: (s) => g === this.gen && this.dispatch({ k: "heard", text: s, at: this.host.now() }),
      final: () => {},
      error: (why) => {
        if (g !== this.gen) return;
        if (why === "mic" || why === "speech" || why === "nomic" || why === "busy") this.stop(), this.cant(why);
      },
      // A session can end on its own (a recognizer's own time limit): listen again.
      end: () => g === this.gen && this.on && void this.listen(),
    });
    if (!r.ok && g === this.gen) {
      this.stop();
      this.cant(r.why);
    }
  }
  private relisten() {
    this.gen++;
    this.rec.cancel();
    if (this.on) void this.listen();
  }

  tick() {
    if (this.on) this.dispatch({ k: "tick", at: this.host.now() });
  }

  dispatch(e: TalkEvent) {
    if (!this.on) return;
    const [st, fx] = talkStep(this.st, e, talkWords(this.host.t));
    this.st = st;
    for (const f of fx) this.run(f);
    this.host.changed();
  }

  private run(f: TalkEffect) {
    switch (f.do) {
      case "send":
        this.card = undefined;
        this.host.send(f.text);
        return;
      case "decide":
        this.card = undefined;
        this.asked.add(f.id);
        this.host.decide(f.id, f.option);
        haptic("light");
        return;
      case "speak": {
        const g = ++this.sgen;
        const lang = readLang(f.text, this.host.lang(), this.host.ui());
        const loc = speechLocale(lang, typeof navigator !== "undefined" ? navigator.languages ?? [] : []);
        void this.spk.speak(f.text, loc, () => g === this.sgen && this.dispatch({ k: "spoken", at: this.host.now() })).then((ok) => {
          // No voice for it: as if said (the words are on the screen).
          if (!ok && g === this.sgen) this.dispatch({ k: "spoken", at: this.host.now() });
        });
        return;
      }
      case "hush":
        this.sgen++;
        this.spk.stop();
        return;
      case "relisten":
        this.relisten();
        return;
      case "end":
        this.stop();
        this.note = f.by === "quiet" ? "talk.ended.quiet" : undefined;
        this.ui = "idle";
        if (this.note) setTimeout(() => ((this.note = undefined), this.host.changed()), 2400);
        return;
    }
  }

  private stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.gen++;
    this.sgen++;
    this.rec.cancel();
    this.spk.stop();
    this.card = undefined;
    this.level = 0;
    void this.awake(false);
    if (this.st.phase !== "ended") this.st = { ...this.st, phase: "ended", endedBy: "tap" };
  }

  /** 结束 / End. */
  end() {
    if (!this.on) return;
    this.dispatch({ k: "end", at: this.host.now() });
  }

  /** The big line while it speaks: what is said, unless the card under it shows it (D446). */
  shown(): string | undefined {
    const said = this.st.saying?.text;
    return said ? talkShown(said, this.card, talkWords(this.host.t).floor) || undefined : undefined;
  }

  seenSeq() {
    return this.seen;
  }

  /** A partner's message arrived (its seq and full text): said if it came after the talk began. */
  reply(seq: number, text: string, decisionId?: string) {
    if (!this.on || seq <= this.seen) return;
    this.seen = seq;
    if (decisionId || !text.trim()) return; // a card's question is said as the card
    this.dispatch({ k: "reply", text, at: this.host.now() });
  }

  /** The open cards now: one asked after the talk began is said, once. */
  cards(open: DecisionState[]) {
    if (!this.on) return;
    for (const d of open) {
      if (this.asked.has(d.decisionId)) continue;
      this.asked.add(d.decisionId);
      const floor = talkFloor(d);
      const question = (d.said ?? d.question).trim();
      this.card = { id: d.decisionId, question, floor: !!floor };
      this.dispatch({ k: "ask", id: d.decisionId, question, floor, at: this.host.now() });
    }
    if (this.card && !open.some((d) => d.decisionId === this.card!.id)) {
      const id = this.card.id;
      this.card = undefined;
      this.dispatch({ k: "answered", id, at: this.host.now() });
    }
  }

  /** 好 / 先等等 tapped on the talk's card. */
  answer(option: "go" | "hold") {
    const c = this.card;
    if (!c || c.floor) return;
    this.card = undefined;
    this.host.decide(c.id, option);
    this.dispatch({ k: "answered", id: c.id, at: this.host.now() });
  }

  /** The screen stays on while talking (a phone on the counter or in a mount). */
  private async awake(on: boolean) {
    try {
      if (!on) {
        const l = this.lock;
        this.lock = undefined;
        await l?.release();
        return;
      }
      const wl = (navigator as unknown as { wakeLock?: { request(k: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl && !this.lock) this.lock = await wl.request("screen");
    } catch {}
  }
}

let ctl: TalkCtl | undefined;
/** The page's one talk, on the same engines as hold to talk. */
export function talk(engines?: () => { rec: Recognizer; spk: Speaker }): TalkCtl {
  if (ctl) return ctl;
  const { rec, spk } = engines!();
  ctl = new TalkCtl(rec, spk, {
    changed: () => A.changed(),
    send: (text) => A.sendMessage(text),
    decide: (id, option) => A.decide(id, option),
    lang: () => A.convLang ?? A.L.locale,
    ui: () => A.L.locale,
    now: () => Date.now(),
    t: (k) => A.L.t(k),
    lastSeq: () => A.S.channel.at(-1)?.firstSeq ?? 0,
    openIds: () => A.S.openDecisions().map((d) => d.decisionId),
  });
  return ctl;
}
/** The talk if one was ever made (the conversation's feed asks without making one). */
export const talkIfAny = () => ctl;

// ---------- what it shows ----------

function Face({ phase, size }: { phase: TalkState["phase"] | "ask"; size: number }) {
  const art = phase === "think" ? "working" : phase === "ask" ? "needsyou" : "idle";
  return (
    <span class={`talk-face ${phase}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={`app/art/${art}.webp`} alt="" draggable={false} />
    </span>
  );
}

function Rings() {
  return (
    <span class="talk-rings" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

/** Over the composer while talking (a sheet on a phone): the partner, the words, a card, End. */
export function TalkPanel() {
  const c = talkIfAny();
  useEffect(() => {
    if (!c?.on) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), c.end());
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [c?.ui]);
  if (!c) return null;
  if (c.note && c.ui === "idle")
    return (
      <div class="voice-note" role="status">
        {t(c.note)}
      </div>
    );
  if (c.ui === "ask")
    return (
      <div class="voice-card talk-ask" role="dialog" aria-label={t("talk.ask.title")}>
        <div class="voice-card-head">
          <Face phase="listen" size={36} />
          <b>{t("talk.ask.title")}</b>
        </div>
        <p>{t("talk.ask.why")}</p>
        <p class="voice-privacy">{t(`voice.privacy.${c.where ?? "device"}`)}</p>
        <div class="btns">
          <button type="button" class="btn secondary" onClick={() => c.later()}>
            {t("voice.ask.later")}
          </button>
          <button type="button" class="btn primary" onClick={() => void c.allow()}>
            {t("talk.ask.go")}
          </button>
        </div>
      </div>
    );
  if (c.ui === "denied" || c.ui === "off")
    return (
      <div class="voice-card" role="alert">
        <div class="voice-card-head">
          <b>{c.ui === "denied" ? t(c.why === "speech" ? "voice.denied.speech" : "voice.denied.mic") : t("voice.off")}</b>
          <button type="button" class="voice-x" aria-label={t("sheet.close")} onClick={() => c.dismiss()}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <p>{c.ui === "denied" ? t("voice.denied.browser") : t(`voice.why.${c.why ?? "error"}`)}</p>
      </div>
    );
  if (c.ui !== "on") return null;
  const st = c.st;
  const phase = st.phase === "ended" ? "listen" : st.phase;
  const card = c.card;
  // What the card shows (its question, its floor line) isn't shown again above it: while it is
  // said, the line above shows only who speaks (D446).
  const saying = c.shown();
  const state = phase === "speak" ? "talk.speaking" : phase === "think" && !st.heard ? "talk.thinking" : "talk.listening";
  return (
    <div class={`talk talk-${phase}`} role="region" aria-label={t("talk.name")} style={{ "--lv": String(c.level) }}>
      <div class="talk-top">
        <span class="talk-fig">
          <Face phase={phase} size={64} />
          {phase === "speak" && <Rings />}
        </span>
        <div class="talk-words">
          <span class="talk-state" aria-live="polite">
            {t(state)}
          </span>
          {phase === "speak" && card && !saying ? null : phase === "speak" && saying ? (
            <p class="talk-said" dir="auto">
              {saying}
            </p>
          ) : st.heard ? (
            <p class="talk-heard" dir="auto">
              {st.heard}
            </p>
          ) : (
            <p class="talk-hint">{t(phase === "think" ? "talk.thinking.hint" : "talk.hint")}</p>
          )}
        </div>
      </div>
      {card && (
        <div class="talk-card">
          <p class="talk-q" dir="auto">
            {card.question}
          </p>
          {card.floor ? (
            <div class="talk-floor-row">
              <p class="talk-floor">{t("talk.floor")}</p>
              {/* The floor is a tap on the card itself: the talk ends and the card is in sight. */}
              <button type="button" class="btn primary" onClick={() => c.end()}>
                {t("talk.floor.show")}
              </button>
            </div>
          ) : (
            <div class="btns">
              <button type="button" class="btn secondary" onClick={() => c.answer("hold")}>
                {t("talk.no")}
              </button>
              <button type="button" class="btn primary" onClick={() => c.answer("go")}>
                {t("talk.yes")}
              </button>
            </div>
          )}
        </div>
      )}
      <div class="talk-foot">
        <span class="talk-tip">{t(phase === "speak" ? "talk.cutin" : "talk.stop.tip")}</span>
        <button type="button" class="btn secondary talk-end" onClick={() => c.end()}>
          {t("talk.end")}
        </button>
      </div>
    </div>
  );
}

/** D442: the conversation's new partner messages and cards, said while a talk is on. */
export function useTalkFeed(rows: readonly { firstSeq: number; ai?: { text: string; decisionId?: string } }[]) {
  const c = talkIfAny();
  const last = rows.at(-1)?.firstSeq;
  useEffect(() => {
    if (!c?.on) return;
    // Every partner message since the last one said, in order (a card's row can follow a reply in
    // the same render, so the last row alone would miss the reply).
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 8; i--) {
      if (rows[i]!.firstSeq <= c.seenSeq()) {
        for (const r of rows.slice(i + 1)) if (r.ai) c.reply(r.firstSeq, r.ai.text, r.ai.decisionId);
        return;
      }
    }
    for (const r of rows.slice(-8)) if (r.ai) c.reply(r.firstSeq, r.ai.text, r.ai.decisionId);
  }, [last, c?.ui]);
  const open = c?.on ? A.S.openDecisions() : [];
  const ids = open.map((d) => d.decisionId).join(",");
  useEffect(() => {
    if (c?.on) c.cards(A.S.openDecisions());
  }, [ids, c?.ui]);
}
