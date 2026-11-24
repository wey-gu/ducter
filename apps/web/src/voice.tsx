// D305: hold to talk and read aloud in the conversation (design/voice.md).
//   - MicButton: the drawn microphone before Send. Hold and speak; let go to put the words in the
//     composer, slide up to send them at once, slide left to drop them.
//   - VoiceStrip: over the composer while it listens (the partner leans in, a calm meter, the
//     words heard so far), and the one-line first use, denied and unavailable cards.
//   - ReadingLine, readItem: 朗读 / Read aloud on a partner's message, and its stop.
//   - VoiceSettings: 用语音说的时候，把回复念出来 / Read replies aloud when I talk by voice.
// The engines are in voice-engine.ts; the Mac's own: apps/desktop/internal/views/voice*.go.
import { useEffect, useRef } from "preact/hooks";
import { autonym } from "@ducter/protocol/src/lang.ts";
import { HOLD_TAP_MS, holdIntent, joinHeard, meterBars, readLang, smoothLevel, speakable, speechLocale, type HoldIntent, type VoiceWhere, type VoiceWhy } from "@ducter/protocol/src/voice.ts";
import { A } from "./app.ts";
import { Toggle } from "./controls.tsx";
import { haptic, inApp } from "./native.ts";
import { talk, talkIfAny } from "./talk.tsx";
import { AppRecognizer, appHasVoice, AppSpeaker, FakeRecognizer, FakeSpeaker, WebRecognizer, WebSpeaker, type Avail, type Recognizer, type Speaker } from "./voice-engine.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
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
const ASKED = "ducter.voice.asked";
const READBACK = "ducter.voice.readback";
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export type Phase = "idle" | "ask" | "listening" | "finishing" | "denied" | "off" | "empty" | "tap";
const FLASH_MS = 2400;

/** Which engines: the app's, a browser's, or (`?voice-fake` and tests) the fakes. */
function engines(): { rec: Recognizer; spk: Speaker } {
  const fake = typeof location !== "undefined" && new URLSearchParams(location.search).has("voice-fake");
  if (fake) return { rec: new FakeRecognizer(), spk: new FakeSpeaker() };
  if (inApp()) return appHasVoice() ? { rec: new AppRecognizer(), spk: new AppSpeaker() } : { rec: new OldApp(), spk: new WebSpeaker() };
  return { rec: new WebRecognizer(), spk: new WebSpeaker() };
}

/** An app from before voice: it says to update (the page can't listen inside it). */
class OldApp implements Recognizer {
  async can(): Promise<Avail> {
    return { ok: false, where: "device", why: "app", mic: "ask", speech: "ask" };
  }
  async allow() {
    return { ok: false as const, why: "app" as VoiceWhy };
  }
  async start() {
    return { ok: false as const, why: "app" as VoiceWhy };
  }
  stop() {}
  cancel() {}
}

/** The one voice of this page: what it hears and what it reads. */
export class VoiceCtl {
  phase: Phase = "idle";
  heard = "";
  level = 0;
  intent: HoldIntent = "keep";
  why?: VoiceWhy;
  where?: VoiceWhere;
  denied: "mic" | "speech" = "mic";
  /** The last answer for this locale, to dim the mark where voice can't work. */
  avail?: Avail;
  /** The partner message being read aloud, by its seq. */
  speaking?: number;
  /** A message went by voice at this time: its reply is read aloud (with the setting on). */
  readbackAfter?: number;
  /** The draft holds words that came by voice. */
  voiceDraft = false;
  private pressing = false;
  /** D442: pressed while a talk is on: letting go ends the talk, nothing listens for a hold. */
  private tapOnly = false;
  private t0 = 0;
  private x0 = 0;
  private y0 = 0;
  private releaseWanted = false;
  private finalText?: string;
  private ended?: () => void;
  private flash?: ReturnType<typeof setTimeout>;
  private levelSubs = new Set<(l: number) => void>();
  constructor(
    public rec: Recognizer,
    public spk: Speaker,
    private host: {
      changed(): void;
      draft(): string;
      setDraft(v: string): void;
      send(text: string): boolean;
      lang(): string;
      focus(): void;
      now(): number;
      /** D442: a tap on the mark (not a hold): 放手说 / Talk hands-free starts, or ends. */
      tap?(): void;
      talking?(): boolean;
    },
  ) {}

  locale(): string {
    const pref = typeof navigator !== "undefined" ? navigator.languages ?? [] : [];
    return speechLocale(this.host.lang(), pref);
  }
  asked() {
    return store.get(ASKED) === "1";
  }
  readback() {
    return store.get(READBACK) === "1";
  }
  setReadback(on: boolean) {
    store.set(READBACK, on ? "1" : "0");
    this.host.changed();
  }
  onLevel(fn: (l: number) => void) {
    this.levelSubs.add(fn);
    return () => void this.levelSubs.delete(fn);
  }
  private set(p: Phase) {
    clearTimeout(this.flash);
    this.phase = p;
    if (p === "tap" || p === "empty") this.flash = setTimeout(() => this.phase === p && ((this.phase = "idle"), this.host.changed()), FLASH_MS);
    this.host.changed();
  }
  /** Checks once, quietly, so the mark can say it can't (dimmed) before anyone holds it. */
  async look() {
    try {
      this.avail = await this.rec.can(this.locale());
      this.host.changed();
    } catch {}
  }

  async press(x: number, y: number) {
    if (this.pressing || this.phase === "listening" || this.phase === "finishing") return;
    if (this.host.talking?.()) return void (this.tapOnly = true);
    this.pressing = true;
    this.releaseWanted = false;
    this.t0 = this.host.now();
    this.x0 = x;
    this.y0 = y;
    this.intent = "keep";
    this.heard = "";
    this.finalText = undefined;
    this.stopReading();
    if (!this.asked()) return (this.pressing = false), this.set("ask");
    const loc = this.locale();
    const a = (this.avail = await this.rec.can(loc));
    if (!a.ok) return this.unavailable(a.why ?? "error");
    if (a.mic === "denied") return this.deny("mic");
    if (a.speech === "denied") return this.deny("speech");
    if (!this.pressing && this.host.now() - this.t0 < HOLD_TAP_MS) return this.tapped();
    this.level = 0;
    this.set("listening");
    const r = await this.rec.start(loc, {
      level: (l) => {
        this.level = smoothLevel(this.level, l);
        for (const f of this.levelSubs) f(this.level);
      },
      partial: (s) => {
        if (this.phase !== "listening") return;
        this.heard = s;
        this.host.changed();
      },
      final: (s) => void (this.finalText = s),
      error: (why) => {
        if (why === "mic" || why === "speech") this.deny(why);
        else this.unavailable(why);
      },
      end: () => {
        const e = this.ended;
        this.ended = undefined;
        e?.();
      },
    });
    if (!r.ok) {
      this.pressing = false;
      return r.why === "mic" || r.why === "speech" ? this.deny(r.why) : this.unavailable(r.why);
    }
    this.where = r.where;
    haptic("light");
    if (this.releaseWanted) void this.release();
  }

  move(x: number, y: number) {
    if (!this.pressing || this.phase !== "listening") return;
    const next = holdIntent({ dx: x - this.x0, dy: y - this.y0 });
    if (next !== this.intent) {
      this.intent = next;
      if (next !== "keep") haptic("light");
      this.host.changed();
    }
  }

  async release() {
    if (this.tapOnly) return (this.tapOnly = false), this.host.tap?.();
    if (!this.pressing && !this.releaseWanted) return;
    this.pressing = false;
    if (this.phase !== "listening") {
      // Still starting: decide once it has.
      this.releaseWanted = this.phase === "idle";
      return;
    }
    this.releaseWanted = false;
    const held = this.host.now() - this.t0;
    if (held < HOLD_TAP_MS) {
      this.rec.cancel();
      return this.tapped();
    }
    if (this.intent === "drop") {
      this.rec.cancel();
      this.heard = "";
      return this.set("idle");
    }
    const intent = this.intent;
    this.set("finishing");
    const ended = new Promise<void>((res) => {
      this.ended = res;
      setTimeout(res, 2000); // a recognizer that never ends gives what it heard so far
    });
    this.rec.stop();
    await ended;
    const words = (this.finalText || this.heard).trim();
    this.heard = "";
    if (!words) return this.set("empty");
    const draft = joinHeard(this.host.draft(), words);
    if (intent === "send") {
      if (this.host.send(draft)) {
        this.host.setDraft("");
        this.voiceDraft = false;
        this.sentByVoice();
      } else this.host.setDraft(draft);
    } else {
      this.host.setDraft(draft);
      this.voiceDraft = true;
      this.host.focus();
    }
    this.set("idle");
  }

  /** A tap, not a hold: D442's talk when the page has one, else how to hold. */
  private tapped() {
    if (!this.host.tap) return this.set("tap");
    this.set("idle");
    this.host.tap();
  }

  /** The press left (Esc, the pointer taken away): nothing is put anywhere. */
  drop() {
    if (this.phase === "listening" || this.phase === "finishing") this.rec.cancel();
    this.pressing = false;
    this.releaseWanted = false;
    this.heard = "";
    if (this.phase !== "idle") this.set("idle");
  }
  dismiss() {
    this.pressing = false;
    this.set("idle");
  }
  private unavailable(why: VoiceWhy) {
    this.pressing = false;
    this.why = why;
    this.set("off");
  }
  private deny(which: "mic" | "speech") {
    this.pressing = false;
    this.denied = which;
    this.set("denied");
  }

  /** 用麦克风 / Use the microphone, on the first-use card: now the OS asks. */
  async allowNow() {
    store.set(ASKED, "1");
    const r = await this.rec.allow(this.locale());
    if (r.ok) return this.set("tap"); // "Hold it while you talk": the next hold listens
    if (r.why === "mic" || r.why === "speech") return this.deny(r.why);
    this.unavailable(r.why);
  }
  later() {
    store.set(ASKED, "1");
    this.set("idle");
  }
  openSettings() {
    this.rec.settings?.(this.denied);
  }
  canOpenSettings() {
    return !!this.rec.settings;
  }

  /** A message just went by voice: the reply to it is read aloud, if the person wants that. */
  sentByVoice() {
    if (this.readback()) this.readbackAfter = this.host.now();
  }
  /** The person sent the draft: by voice when its words came from listening. */
  sentDraft() {
    if (this.voiceDraft) this.sentByVoice();
    this.voiceDraft = false;
  }
  /** The person typed: a reading stops (their hands are back on the keys). */
  typed() {
    if (this.speaking !== undefined) this.stopReading();
  }

  async read(seq: number, text: string, conv: string | undefined, ui: string) {
    this.stopReading();
    const words = speakable(text);
    if (!words) return;
    const lang = readLang(words, conv, ui);
    const loc = speechLocale(lang, typeof navigator !== "undefined" ? navigator.languages ?? [] : []);
    this.speaking = seq;
    this.host.changed();
    const ok = await this.spk.speak(words, loc, () => {
      if (this.speaking === seq) (this.speaking = undefined), this.host.changed();
    });
    if (!ok) {
      if (this.speaking === seq) this.speaking = undefined;
      A.toast(t("voice.read.none", autonym(lang)));
      this.host.changed();
    }
  }
  stopReading() {
    if (this.speaking === undefined) return;
    this.speaking = undefined;
    this.spk.stop();
    this.host.changed();
  }
}

let ctl: VoiceCtl | undefined;
/** The page's one voice (made on first use, so tests and the Mac-less pages pay nothing). */
export function voice(): VoiceCtl {
  if (ctl) return ctl;
  const { rec, spk } = engines();
  ctl = new VoiceCtl(rec, spk, {
    changed: () => A.changed(),
    draft: () => A.draft,
    setDraft: (v) => ((A.draft = v), A.changed()),
    send: (text) => A.sendMessage(text),
    lang: () => A.convLang ?? A.L.locale,
    focus: () => requestAnimationFrame(() => document.getElementById("composer")?.focus()),
    now: () => Date.now(),
    // D442: a tap starts 放手说 / Talk hands-free on the same engines (a second tap ends it).
    tap: () => {
      const c = talk(() => ({ rec, spk }));
      if (c.on) c.end();
      else void c.start();
    },
    talking: () => !!talk(() => ({ rec, spk })).on,
  });
  // `?voice-fake`: the demo's shots drive the fakes from the page (never the real microphone).
  if (rec instanceof FakeRecognizer) (globalThis as unknown as { ducterVoiceFake?: unknown }).ducterVoiceFake = { ctl, rec, spk, talk: talk(() => ({ rec, spk })) };
  return ctl;
}

// ---------- the mark ----------

export function MicGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11.5" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function SpeakerGlyph({ size = 16, on }: { size?: number; on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke-width="1.6" />
      <path class={on ? "wave on" : "wave"} d="M15.5 9a4 4 0 0 1 0 6" />
      <path class={on ? "wave w2 on" : "wave w2"} d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

/** The microphone before Send: hold to talk (a pointer, or Space held on the focused mark). */
export function MicButton() {
  const v = voice();
  useEffect(() => void (v.avail === undefined && v.look()), []);
  const off = v.avail?.ok === false;
  const live = v.phase === "listening" || v.phase === "finishing";
  const talking = !!talkIfAny()?.on;
  return (
    <button
      type="button"
      class={`btn text icon mic${live || talking ? " hearing" : ""}${off ? " off" : ""}`}
      aria-label={talking ? t("talk.end") : t("voice.hold.both")}
      title={talking ? t("talk.end") : t("voice.hold.both")}
      aria-pressed={live || talking}
      onPointerDown={(ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
        void v.press(ev.clientX, ev.clientY);
      }}
      onPointerMove={(ev) => v.move(ev.clientX, ev.clientY)}
      onPointerUp={() => void v.release()}
      onPointerCancel={() => v.drop()}
      onLostPointerCapture={() => v.phase === "listening" && void v.release()}
      onContextMenu={(ev) => ev.preventDefault()}
      onKeyDown={(ev) => {
        if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) {
          ev.preventDefault();
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          void v.press(r.x, r.y);
        } else if (ev.key === "Escape" && live) ev.preventDefault(), v.drop();
      }}
      onKeyUp={(ev) => (ev.key === " " || ev.key === "Enter") && (ev.preventDefault(), void v.release())}
    >
      <MicGlyph />
    </button>
  );
}

// ---------- over the composer ----------

/** Five bars (or one dot, under Reduce Motion) that follow the voice, without redrawing the page. */
function Meter() {
  const v = voice();
  const ref = useRef<HTMLSpanElement>(null);
  const calm = still();
  useEffect(
    () =>
      v.onLevel((l) => {
        const el = ref.current;
        if (!el) return;
        if (calm) return void (el.style.opacity = String(0.35 + 0.65 * l));
        meterBars(l).forEach((h, i) => (el.children[i] as HTMLElement | undefined)?.style.setProperty("--h", String(h)));
        el.parentElement?.closest<HTMLElement>(".voice-strip")?.style.setProperty("--lv", String(l));
      }),
    [],
  );
  if (calm) return <span ref={ref} class="voice-meter dot" aria-hidden="true" />;
  return (
    <span ref={ref} class="voice-meter" aria-hidden="true">
      {meterBars(0).map((h, i) => (
        <i key={i} style={{ "--h": String(h) }} />
      ))}
    </span>
  );
}

/** The partner's clay face, leaning in to listen. */
function ListeningFace() {
  return (
    <span class="voice-face" aria-hidden="true">
      <img src="app/art/idle.webp" alt="" draggable={false} />
    </span>
  );
}

const privacyKey = (w?: VoiceWhere) => `voice.privacy.${w ?? "device"}`;

function Close({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" class="voice-x" aria-label={t("sheet.close")} onClick={onClick}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );
}

/** What is over the composer: listening, or a one-line card (first use, denied, unavailable). */
export function VoiceStrip() {
  const v = voice();
  useEffect(() => {
    if (v.phase !== "listening") return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), v.drop());
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [v.phase]);
  const p = v.phase;
  if (p === "idle") return null;
  if (p === "tap" || p === "empty")
    return (
      <div class="voice-note" role="status">
        {t(p === "tap" ? "voice.tap" : "voice.empty")}
      </div>
    );
  if (p === "ask")
    return (
      <div class="voice-card" role="dialog" aria-label={t("voice.ask.title")}>
        <div class="voice-card-head">
          <span class="voice-card-mark">
            <MicGlyph size={20} />
          </span>
          <b>{t("voice.ask.title")}</b>
        </div>
        <p>{t("voice.ask.why")}</p>
        <p class="voice-privacy">{t(privacyKey(v.avail?.where))}</p>
        <div class="btns">
          <button type="button" class="btn primary" onClick={() => void v.allowNow()}>
            {t("voice.ask.go")}
          </button>
          <button type="button" class="btn secondary" onClick={() => v.later()}>
            {t("voice.ask.later")}
          </button>
        </div>
      </div>
    );
  if (p === "denied")
    return (
      <div class="voice-card" role="alert">
        <div class="voice-card-head">
          <b>{t(v.denied === "speech" ? "voice.denied.speech" : "voice.denied.mic")}</b>
          <Close onClick={() => v.dismiss()} />
        </div>
        {v.canOpenSettings() ? (
          <div class="btns">
            <button type="button" class="btn secondary" onClick={() => (v.openSettings(), v.dismiss())}>
              {t("voice.denied.open")}
            </button>
          </div>
        ) : (
          <p>{t("voice.denied.browser")}</p>
        )}
      </div>
    );
  if (p === "off")
    return (
      <div class="voice-card" role="alert">
        <div class="voice-card-head">
          <b>{t("voice.off")}</b>
          <Close onClick={() => v.dismiss()} />
        </div>
        <p>{v.why === "lang" ? t("voice.why.lang", autonym(A.convLang ?? A.L.locale)) : t(`voice.why.${v.why ?? "error"}`)}</p>
      </div>
    );
  // listening or finishing
  const line = v.intent === "send" ? "voice.release.send" : v.intent === "drop" ? "voice.release.drop" : "voice.release";
  return (
    <div class={`voice-strip${v.intent !== "keep" ? ` armed-${v.intent}` : ""}${p === "finishing" ? " finishing" : ""}`} role="status" aria-label={t("voice.listening")}>
      <div class="voice-top">
        <ListeningFace />
        <div class={`voice-heard${v.heard ? "" : " none"}`} dir="auto">
          {v.heard || t("voice.listening")}
        </div>
      </div>
      <div class="voice-foot">
        <span class={`voice-cue drop${v.intent === "drop" ? " on" : ""}`}>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </svg>
          {t("voice.cue.drop")}
        </span>
        <span class="voice-mid">
          <Meter />
          <span class="voice-line">{t(line)}</span>
        </span>
        <span class={`voice-cue send${v.intent === "send" ? " on" : ""}`}>
          {t("voice.cue.send")}
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 10L8 5.5l4.5 4.5" />
          </svg>
        </span>
      </div>
    </div>
  );
}

// ---------- read aloud ----------

/** Under a partner message while it is read aloud: a small moving speaker and Stop reading. */
export function ReadingLine({ seq }: { seq: number }) {
  const v = voice();
  if (v.speaking !== seq) return null;
  return (
    <button type="button" class="reading-line" onClick={() => v.stopReading()}>
      <SpeakerGlyph size={15} on />
      <span>{t("voice.read.stop")}</span>
    </button>
  );
}

/** Reads a message (or stops it, when it is the one being read). */
export function toggleRead(seq: number, text: string) {
  const v = voice();
  if (v.speaking === seq) v.stopReading();
  else void v.read(seq, text, A.convLang, A.L.locale);
}

/** D305: the reply to a message sent by voice is read aloud, once, with the setting on. */
export function useReadback(last?: { seq: number; ts: string; text: string; partner: boolean }) {
  const v = voice();
  useEffect(() => {
    const after = v.readbackAfter;
    if (after === undefined || !last?.partner || !last.text) return;
    if (Date.parse(last.ts) < after - 1000) return;
    v.readbackAfter = undefined;
    void v.read(last.seq, last.text, A.convLang, A.L.locale);
  }, [last?.seq]);
}

/** Settings › This phone › Voice. */
export function VoiceSettings() {
  const v = voice();
  return (
    <div class="set-item voice-set">
      {/* D432: the switch's words name it (no 语音 heading over them); where the voice goes is behind 怎么做到的 while it works, said plainly only when it can't. */}
      <Toggle label={t("voice.settings.readback")} help={t("voice.settings.readback.help")} checked={v.readback()} onChange={(on) => v.setReadback(on)} how={v.avail?.ok ? t(privacyKey(v.avail.where)) : undefined} />
      {v.avail && !v.avail.ok && <small class="voice-privacy">{v.avail.why === "lang" ? t("voice.why.lang", autonym(A.convLang ?? A.L.locale)) : t(`voice.why.${v.avail.why ?? "error"}`)}</small>}
    </div>
  );
}

/** For the hover pebble and the menu: whether a reading is under way here. */
export const readingNow = (seq: number) => ctl?.speaking === seq;
