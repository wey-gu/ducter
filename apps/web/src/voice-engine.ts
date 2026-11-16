// D305: the engines behind hold to talk and read aloud, without the UI (design/voice.md).
//   - in the iPhone and Android apps: the app's own recognizer and voice over the bridge
//     (native.ts; events come back through window.ducterVoice);
//   - in a browser: the Web Speech API (SpeechRecognition, speechSynthesis), with the microphone
//     opened once for the level meter;
//   - in tests and the demo: fakes that say what they are told to.
// Nothing here keeps or sends the sound: a recognizer gives words, and only the words the person
// chooses to send leave this device.

import { normalizeTag } from "@ducter/protocol/src/lang.ts";
import type { VoiceWhere, VoiceWhy } from "@ducter/protocol/src/voice.ts";
import { nativeCall, nativeInfo } from "./native.ts";

export type Grant = "granted" | "denied" | "ask";
/** What a recognizer can do here, for a locale, without asking anything. */
export type Avail = { ok: boolean; where: VoiceWhere; why?: VoiceWhy; mic: Grant; speech: Grant };
export type Started = { ok: true; where: VoiceWhere } | { ok: false; why: VoiceWhy };

/** What a recognizer tells while it listens. */
export interface Hearing {
  level(l: number): void;
  partial(text: string): void;
  final(text: string): void;
  error(why: VoiceWhy): void;
  end(): void;
}

export interface Recognizer {
  can(locale: string): Promise<Avail>;
  /** Asks the OS for the microphone (and speech recognition) now, after the page's own line. */
  allow(locale: string): Promise<Started>;
  start(locale: string, h: Hearing): Promise<Started>;
  stop(): void;
  cancel(): void;
  /** Opens the place where a denied permission is turned back on, when there is one. */
  settings?(which: "mic" | "speech"): void;
}

export interface Speaker {
  /** Says the words; false when there is no voice for the locale. `done` comes once, when it ends or is stopped. */
  speak(text: string, locale: string, done: () => void): Promise<boolean>;
  stop(): void;
}

// ---------- the apps (native bridge) ----------

type VoiceEvent = { id: string; kind: "level" | "partial" | "final" | "error" | "end" | "spoken"; text?: string; level?: number; why?: VoiceWhy };
const listeners = new Map<string, (e: VoiceEvent) => void>();
let nextId = 0;
const g = globalThis as unknown as { ducterVoice?: (e: VoiceEvent) => void };
/** The apps call this with each event (design/voice.md "The app bridge"). */
g.ducterVoice = (e: VoiceEvent) => listeners.get(e?.id)?.(e);

/** Whether this app shell has the voice bridge (`ducterNative.voice`). */
export const appHasVoice = () => !!(nativeInfo() as { voice?: number } | undefined)?.voice;

export class AppRecognizer implements Recognizer {
  private id = "";
  async can(locale: string): Promise<Avail> {
    const r = await nativeCall<Avail>({ t: "voice.can", lang: locale });
    return r ?? { ok: false, where: "device", why: "app", mic: "ask", speech: "ask" };
  }
  async allow(locale: string): Promise<Started> {
    const id = `v${++nextId}`;
    const r = await nativeCall<Started>({ t: "voice.start", id, lang: locale });
    void nativeCall({ t: "voice.cancel", id });
    return r ?? { ok: false, why: "app" };
  }
  async start(locale: string, h: Hearing): Promise<Started> {
    const id = (this.id = `v${++nextId}`);
    listeners.set(id, (e) => {
      if (e.kind === "level") h.level(e.level ?? 0);
      else if (e.kind === "partial") h.partial(e.text ?? "");
      else if (e.kind === "final") h.final(e.text ?? "");
      else if (e.kind === "error") h.error(e.why ?? "error");
      else if (e.kind === "end") listeners.delete(id), h.end();
    });
    const r = await nativeCall<Started>({ t: "voice.start", id, lang: locale });
    if (!r?.ok) listeners.delete(id);
    return r ?? { ok: false, why: "app" };
  }
  stop() {
    if (this.id) void nativeCall({ t: "voice.stop", id: this.id });
  }
  cancel() {
    if (this.id) void nativeCall({ t: "voice.cancel", id: this.id });
  }
  settings(which: "mic" | "speech") {
    void nativeCall({ t: "voice.settings", which });
  }
}

export class AppSpeaker implements Speaker {
  private id = "";
  async speak(text: string, locale: string, done: () => void): Promise<boolean> {
    const id = (this.id = `s${++nextId}`);
    listeners.set(id, (e) => e.kind === "spoken" && (listeners.delete(id), done()));
    const r = await nativeCall<{ ok: boolean }>({ t: "speak", id, text, lang: locale });
    if (!r?.ok) listeners.delete(id);
    return !!r?.ok;
  }
  stop() {
    void nativeCall({ t: "speak.stop" });
    const l = listeners.get(this.id);
    if (l) l({ id: this.id, kind: "spoken" });
  }
}

// ---------- a browser (Web Speech API) ----------

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SRClass = (new () => SR) & { available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string> };
const srClass = (): SRClass | undefined => (globalThis as unknown as { SpeechRecognition?: SRClass; webkitSpeechRecognition?: SRClass }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: SRClass }).webkitSpeechRecognition;

/** Safari's recognizer is Apple's (Siri's); every other browser's is its maker's service (Chrome's is Google's). */
const browserWhere = (): VoiceWhere => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|Android/.test(ua) ? "apple" : "browser";
};

/** A Web Speech error, said in Ducter's words. */
export function whyOfWebError(e: string): VoiceWhy | "nothing" {
  if (e === "not-allowed" || e === "service-not-allowed") return "mic";
  if (e === "audio-capture") return "nomic";
  if (e === "network") return "network";
  if (e === "language-not-supported") return "lang";
  if (e === "no-speech" || e === "aborted") return "nothing";
  return "error";
}

export class WebRecognizer implements Recognizer {
  private rec?: SR;
  private stream?: MediaStream;
  private audio?: AudioContext;
  private raf = 0;
  private local = new Map<string, boolean>();

  private async micState(): Promise<Grant> {
    try {
      const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return p.state === "granted" ? "granted" : p.state === "denied" ? "denied" : "ask";
    } catch {
      return "ask";
    }
  }
  /** Chrome's on-device recognition (`processLocally`), when this language is installed. */
  private async onDevice(locale: string): Promise<boolean> {
    const C = srClass();
    if (!C?.available) return false;
    if (this.local.has(locale)) return this.local.get(locale)!;
    let ok = false;
    try {
      ok = (await C.available({ langs: [locale], processLocally: true })) === "available";
    } catch {}
    this.local.set(locale, ok);
    return ok;
  }
  async can(locale: string): Promise<Avail> {
    const mic = await this.micState();
    const base = { mic, speech: "granted" as Grant };
    if (!srClass()) return { ok: false, where: "browser", why: "browser", ...base };
    if (typeof isSecureContext !== "undefined" && !isSecureContext) return { ok: false, where: "browser", why: "secure", ...base };
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, where: "browser", why: "nomic", ...base };
    return { ok: true, where: (await this.onDevice(locale)) ? "device" : browserWhere(), ...base };
  }
  async allow(): Promise<Started> {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const tr of s.getTracks()) tr.stop();
      return { ok: true, where: browserWhere() };
    } catch (err) {
      return { ok: false, why: (err as Error).name === "NotFoundError" ? "nomic" : "mic" };
    }
  }
  async start(locale: string, h: Hearing): Promise<Started> {
    const C = srClass();
    if (!C) return { ok: false, why: "browser" };
    // The microphone once, for the meter (and the permission prompt, after the page's own line).
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      return { ok: false, why: (err as Error).name === "NotFoundError" ? "nomic" : (err as Error).name === "NotReadableError" ? "busy" : "mic" };
    }
    this.meter(h);
    const rec = (this.rec = new C());
    rec.lang = locale;
    rec.continuous = true;
    rec.interimResults = true;
    const local = await this.onDevice(locale);
    if (local) rec.processLocally = true;
    let done = "";
    let ended = false;
    rec.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) fin += r[0]!.transcript;
        else mid += r[0]!.transcript;
      }
      done = fin;
      h.partial((fin + mid).trim());
    };
    rec.onerror = (e) => {
      const why = whyOfWebError(e.error);
      if (why !== "nothing") h.error(why);
    };
    rec.onend = () => {
      if (ended) return;
      ended = true;
      this.release();
      h.final(done.trim());
      h.end();
    };
    try {
      rec.start();
    } catch {
      this.release();
      return { ok: false, why: "error" };
    }
    return { ok: true, where: local ? "device" : browserWhere() };
  }
  private meter(h: Hearing) {
    try {
      const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx || !this.stream) return;
      const ctx = (this.audio = new Ctx());
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(this.stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let last = 0;
      const tick = (now: number) => {
        this.raf = requestAnimationFrame(tick);
        if (now - last < 50) return; // about 20 a second
        last = now;
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        h.level(levelOfRms(Math.sqrt(sum / buf.length)));
      };
      this.raf = requestAnimationFrame(tick);
    } catch {}
  }
  private release() {
    cancelAnimationFrame(this.raf);
    for (const tr of this.stream?.getTracks() ?? []) tr.stop();
    this.stream = undefined;
    void this.audio?.close().catch(() => {});
    this.audio = undefined;
  }
  stop() {
    try {
      this.rec?.stop();
    } catch {}
  }
  cancel() {
    const r = this.rec;
    if (!r) return;
    r.onresult = null;
    r.onend = null;
    r.onerror = null;
    try {
      r.abort();
    } catch {}
    this.release();
  }
}

/** A microphone's RMS (0–1) as the meter's level: (dB + 50) / 40, clamped (design/voice.md). */
export function levelOfRms(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 50) / 40));
}

/** Pieces a browser voice says one after another (Chrome stops a long one after about 15 s). */
export function chunks(text: string, max = 180): string[] {
  const out: string[] = [];
  for (const s of text.match(/[^。！？.!?]+[。！？.!?]*\s*/g) ?? [text]) {
    const last = out.at(-1);
    if (last !== undefined && last.length + s.length <= max) out[out.length - 1] = last + s;
    else out.push(s);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/** The voice for a locale: the same locale on the device first, then the same language, on the device first. */
export function pickVoice<V extends { lang: string; localService: boolean; default?: boolean }>(voices: readonly V[], locale: string): V | undefined {
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const want = norm(locale);
  const base = want.split("-")[0];
  const hant = /^zh-(tw|hk|mo|hant)/.test(want);
  const same = voices.filter((v) => norm(v.lang) === want);
  const lang = voices.filter((v) => {
    const n = norm(v.lang);
    if (n.split("-")[0] !== base) return false;
    if (base === CHINESE) return hant === /^zh-(tw|hk|mo|hant)/.test(n);
    return true;
  });
  const rank = (v: V) => (v.localService ? 0 : 2) + (v.default ? 0 : 1);
  return [...same].sort((a, b) => rank(a) - rank(b))[0] ?? [...lang].sort((a, b) => rank(a) - rank(b))[0];
}

/** Chinese as a whole: Simplified and Traditional share a base tag. */
const CHINESE = normalizeTag("zh-Hans");

export class WebSpeaker implements Speaker {
  private gen = 0;
  private done?: () => void;
  private voices(): Promise<SpeechSynthesisVoice[]> {
    const s = speechSynthesis;
    const now = s.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((res) => {
      const t = setTimeout(() => res(s.getVoices()), 800);
      s.addEventListener("voiceschanged", () => (clearTimeout(t), res(s.getVoices())), { once: true });
    });
  }
  async speak(text: string, locale: string, done: () => void): Promise<boolean> {
    if (typeof speechSynthesis === "undefined") return false;
    this.stop();
    const voice = pickVoice(await this.voices(), locale);
    if (!voice) return false;
    const gen = ++this.gen;
    this.done = done;
    const parts = chunks(text);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1;
      if (i === parts.length - 1) u.onend = u.onerror = () => gen === this.gen && this.finish();
      speechSynthesis.speak(u);
    });
    return true;
  }
  private finish() {
    const d = this.done;
    this.done = undefined;
    d?.();
  }
  stop() {
    this.gen++;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.finish();
  }
}

// ---------- fakes (tests, the demo's shots) ----------

/** Says what it is told, as a recognizer would: partials, then the whole, with a level that breathes. */
export class FakeRecognizer implements Recognizer {
  avail: Avail = { ok: true, where: "device", mic: "granted", speech: "granted" };
  words = "";
  allowed: Started = { ok: true, where: "device" };
  started: string[] = [];
  private h?: Hearing;
  async can() {
    return this.avail;
  }
  async allow() {
    if (this.allowed.ok) this.avail = { ...this.avail, mic: "granted", speech: "granted" };
    return this.allowed;
  }
  async start(locale: string, h: Hearing): Promise<Started> {
    if (!this.avail.ok) return { ok: false, why: this.avail.why ?? "error" };
    if (this.avail.mic === "denied") return { ok: false, why: "mic" };
    this.started.push(locale);
    this.h = h;
    return { ok: true, where: this.avail.where };
  }
  /** Tests and the demo drive it: a level and the words heard so far. */
  hear(text: string, level = 0.6) {
    this.h?.level(level);
    this.h?.partial(text);
  }
  stop() {
    const h = this.h;
    this.h = undefined;
    h?.final(this.words);
    h?.end();
  }
  cancel() {
    const h = this.h;
    this.h = undefined;
    h?.end();
  }
  opened: string[] = [];
  settings(which: "mic" | "speech") {
    this.opened.push(which);
  }
}

export class FakeSpeaker implements Speaker {
  said: { text: string; locale: string }[] = [];
  voices = true;
  private done?: () => void;
  async speak(text: string, locale: string, done: () => void) {
    if (!this.voices) return false;
    this.stop();
    this.said.push({ text, locale });
    this.done = done;
    return true;
  }
  /** The fake's voice reaches the end. */
  finish() {
    const d = this.done;
    this.done = undefined;
    d?.();
  }
  stop() {
    this.finish();
  }
}
