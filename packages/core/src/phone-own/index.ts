// D218: 用你自己的号码打 / Call from your own number. The owner's own Android phone and SIM,
// plugged into a computer of theirs (USB for adb, a headset cable for the sound), places the call;
// a real-time voice model on that computer speaks for them. It is the second CallProvider behind
// the same Go card (phone.ts holds the rails, the card and the outcome); this file holds the phone,
// the setup checklist, the test call and the call itself.
//
// What it may do with the owner's phone is adb.ts's six things, nothing more. One call at a time;
// never while the owner is on their own call; never answers a call; nothing recorded.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { e164, OWN_PHONE, type OwnPhoneAction, type OwnPhoneView } from "@ducter/protocol";
import { realClock, type Clock } from "../clock.ts";
import type { CallProvider, DraftInput, ResultOut, StatusOut } from "../phone-provider.ts";
import { adbExec, findAdb, listPhones, OwnPhoneAdb, type AdbDevice, type Exec, type PhoneCallState } from "./adb.ts";
import { chime, ffmpegBridge, findFfmpeg, guessDevice, listAudio, rms, spoken, type AudioBridge } from "./audio.ts";
import { engineInfo, instructionsFor, VoiceLoop, type Engine, type EngineInfo } from "./voice.ts";

export const OWN_FILE = "own-phone.json";
export const OWN_PER_DAY = 10; // calls a day from the owner's SIM: a person's errands, never a call centre's pattern
const RING_LIMIT_MS = 55_000; // ringing this long: nobody's answering
const DIAL_LIMIT_MS = 30_000; // the phone never started the call
const STEP_MS = 700;
const HEARD = 250; // RMS above the cable's hiss: the line was heard

interface OwnFile {
  serial?: string;
  input?: string;
  output?: string;
  engine?: Engine;
  model?: string;
  key?: string;
  number?: string;
  prefer?: boolean;
  test?: OwnPhoneView["test"];
  day?: { date: string; count: number };
}

export interface OwnPhoneDeps {
  dataDir: string;
  clock?: Clock;
  where: () => string;
  partnerName: () => string;
  /** The owner's saved phone (Your details), the default for the number they call from. */
  savedNumber?: () => string | undefined;
  zone: () => string;
  /** Numbers never rung (emergency, short service), phone.ts's rule. */
  neverCall: (n: string) => boolean;
  onChange?: () => void;
  // Seams for tests and the fake phone:
  exec?: Exec;
  bridge?: (info: EngineInfo, o: { input: string; output: string }) => AudioBridge;
  ws?: ConstructorParameters<typeof VoiceLoop>[5];
  engineUrl?: string;
  listAudio?: () => Promise<{ inputs: string[]; outputs: string[]; tool: boolean }>;
  speak?: (text: string, rate: number, zh: boolean) => Promise<Int16Array | undefined>;
  /** How often the phone is read during a call (ms); tests go faster. */
  stepMs?: number;
}

interface OwnCall {
  id: string;
  d: DraftInput;
  phase: StatusOut["phase"];
  question?: NonNullable<StatusOut["question"]>;
  result?: ResultOut;
  loop?: VoiceLoop;
  activeAt?: number;
  endedAt?: number;
  stop?: "owner" | "ducter";
  end?: { state: "done" | "uncertain" | "automated" | "no_answer"; outcome: string; agreed: string[] };
  failed?: string;
}

export interface OwnPhone {
  provider: CallProvider & { pollMs: number };
  /** Every step done: a call can go from the owner's phone. */
  ready(): boolean;
  prefer(): boolean;
  /** The owner's phone is on a call (theirs, or Ducter's): a new one waits. */
  busy(): Promise<boolean>;
  /** Calls placed from the owner's phone today, and whether another one fits. */
  roomToday(): boolean;
  number(): string | undefined;
  model(): string | undefined;
  perMinUsd(): number;
  view(): OwnPhoneView;
  /** Reads the phone, the SIM, the headset and the sound devices again. */
  scan(): Promise<void>;
  act(a: OwnPhoneAction): Promise<{ ok: boolean; error?: string }>;
  stop(): void;
  onChange(fn: () => void): () => void;
}

export function openOwnPhone(deps: OwnPhoneDeps): OwnPhone {
  const clock = deps.clock ?? realClock;
  const step = deps.stepMs ?? STEP_MS;
  const path = join(deps.dataDir, OWN_FILE);
  let file: OwnFile = {};
  try {
    if (existsSync(path)) file = JSON.parse(readFileSync(path, "utf8")) as OwnFile;
  } catch {
    file = {};
  }
  const save = () => {
    try {
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, path);
    } catch (err) {
      console.warn(`[own-phone] could not save: ${(err as Error).message}`);
    }
  };
  const listeners = new Set<() => void>();
  const changed = () => {
    deps.onChange?.();
    for (const fn of listeners) fn();
  };
  const adbBin = deps.exec ? "adb" : findAdb(process.env, deps.dataDir);
  const exec = deps.exec ?? (adbBin ? adbExec(adbBin) : undefined);
  const ffmpeg = findFfmpeg();

  // What the last scan saw.
  let phones: AdbDevice[] = [];
  let info: Awaited<ReturnType<OwnPhoneAdb["info"]>> | undefined;
  let headset: "yes" | "no" | "unknown" = "unknown";
  let sound: { inputs: string[]; outputs: string[]; tool: boolean } = { inputs: [], outputs: [], tool: !!ffmpeg };
  let theirCall = false;
  let stopped = false;

  const phone = (): AdbDevice | undefined => phones.find((p) => p.serial === file.serial) ?? phones.find((p) => p.usb) ?? phones[0];
  const adb = (): OwnPhoneAdb | undefined => {
    const p = phone();
    return exec && p && p.state === "ready" ? new OwnPhoneAdb(exec, p.serial) : undefined;
  };
  const engine = (): EngineInfo => engineInfo(file.engine ?? "openai", file.model, deps.engineUrl);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: deps.zone() }).format(new Date(clock.now()));
  const countToday = () => (file.day?.date === today() ? file.day.count : 0);

  const calls = new Map<string, OwnCall>();
  const liveCall = () => [...calls.values()].find((c) => c.phase === "calling" || c.phase === "talking");
  let testing = false;

  async function scan() {
    if (!exec) {
      phones = [];
      return changed();
    }
    phones = (await listPhones(exec)).filter((p) => !p.serial.startsWith("emulator-") || deps.exec || process.env.DUCTER_OWN_PHONE_EMULATOR);
    const p = phone();
    if (p && p.state === "ready") {
      if (file.serial !== p.serial) (file.serial = p.serial), save();
      const a = new OwnPhoneAdb(exec, p.serial);
      info = await a.info().catch(() => undefined);
      headset = await a.headset().catch(() => "unknown" as const);
      const s = await a.callState().catch(() => ({ state: "unknown" as PhoneCallState }));
      theirCall = !liveCall() && !testing && !["idle", "ended", "unknown"].includes(s.state);
    } else info = undefined;
    sound = await (deps.listAudio ?? (() => listAudio(ffmpeg)))().catch(() => sound);
    // The cable's sound device, found by its name the first time.
    if (!file.input || !sound.inputs.includes(file.input)) {
      const g = guessDevice(sound.inputs);
      if (g && g !== file.input) (file.input = g), save();
    }
    if (!file.output || !sound.outputs.includes(file.output)) {
      const g = guessDevice(sound.outputs);
      if (g && g !== file.output) (file.output = g), save();
    }
    changed();
  }

  const number = () => file.number ?? (() => {
    const n = deps.savedNumber?.();
    return n ? e164(n) : undefined;
  })();
  const ready = () => {
    const p = phone();
    return !!p && p.state === "ready" && info?.sim !== "absent" && !!file.input && !!file.output && !!file.key && file.test?.state === "passed";
  };

  function view(): OwnPhoneView {
    const p = phone();
    const live = liveCall();
    const e = engine();
    return {
      where: deps.where(),
      adb: !!exec,
      ...(p ? { phone: { serial: p.serial, model: info?.model ?? p.model, state: p.state, ...(info?.android ? { android: info.android } : {}) } } : {}),
      ...(info ? { sim: { state: info.sim, ...(info.carrier ? { carrier: info.carrier } : {}) } } : {}),
      ...(number() ? { number: number()! } : {}),
      headset,
      audio: { inputs: sound.inputs, outputs: sound.outputs, ...(file.input ? { input: file.input } : {}), ...(file.output ? { output: file.output } : {}), tool: sound.tool },
      voice: { engine: e.engine, key: !!file.key, model: e.model, perMinUsd: e.perMinUsd },
      test: file.test ?? { state: "never" },
      ready: ready(),
      prefer: !!file.prefer,
      ...(live ? { live: { callId: live.id, name: live.d.name } } : {}),
      ...(theirCall ? { busy: true } : {}),
      today: countToday(),
      perDay: OWN_PER_DAY,
    };
  }

  const bridgeFor = (e: EngineInfo): AudioBridge | undefined => {
    if (!file.input || !file.output) return undefined;
    if (deps.bridge) return deps.bridge(e, { input: file.input, output: file.output });
    return ffmpeg ? ffmpegBridge({ ffmpeg, input: file.input, output: file.output, inRate: e.inRate, outRate: e.outRate }) : undefined;
  };

  async function waitFor(a: OwnPhoneAdb, want: (s: PhoneCallState) => boolean, ms: number): Promise<PhoneCallState> {
    const until = Date.now() + ms;
    let s: PhoneCallState = "unknown";
    while (Date.now() < until && !stopped) {
      s = (await a.callState()).state;
      if (want(s)) return s;
      await Bun.sleep(step);
    }
    return s;
  }

  // ---------- the test call: no AI, a chime and one sentence ----------

  async function test(to: string) {
    const a = adb();
    const put = (t: OwnPhoneView["test"]) => ((file.test = { ...t, to, at: new Date(clock.now()).toISOString() }), save(), changed());
    if (!a) return put({ state: "failed", detail: "phone" });
    if (await api.busy()) return put({ state: "failed", detail: "busy" });
    const e = { ...engine(), inRate: 16000, outRate: 16000 };
    const audio = bridgeFor(e);
    if (!audio) return put({ state: "failed", detail: "audio" });
    testing = true;
    try {
      put({ state: "calling" });
      if (!(await a.dial(to))) return put({ state: "failed", detail: "phone" });
      const s = await waitFor(a, (x) => x === "active", 45_000);
      if (s !== "active") {
        await a.hangUp();
        return put({ state: "failed", detail: "no_pickup" });
      }
      put({ state: "playing" });
      let loudest = 0;
      await audio.start((pcm) => (loudest = Math.max(loudest, rms(pcm))));
      await Bun.sleep(step * 2);
      const zh = /^\+86|^\+886|^\+852|^\+853/.test(to) || /[一-鿿]/.test(deps.partnerName());
      const line = zh ? `你好，这是 ${deps.partnerName()} 的测试电话。如果你听到了这句话，线就接好了。现在挂断。` : `Hello, this is a test call from ${deps.partnerName()}. If you can hear this, the cable works. Hanging up now.`;
      audio.play(chime(e.outRate));
      const voice = await (deps.speak ?? ((t, r, z) => spoken(t, r, { ffmpeg, zh: z, dir: deps.dataDir })))(line, e.outRate, zh).catch(() => undefined);
      if (voice) audio.play(voice);
      await audio.drained();
      await Bun.sleep(step * 3.5); // their answer, if they say something back
      await audio.stop();
      await a.hangUp();
      put({ state: "asking", heardLine: loudest > HEARD });
    } finally {
      testing = false;
      await audio.stop().catch(() => undefined);
      changed();
    }
  }

  // ---------- one call ----------

  async function run(c: OwnCall) {
    const a = adb();
    const e = engine();
    const fail = (why: string) => ((c.failed = why), finish(c));
    if (!a) return fail("the phone isn't plugged in or isn't allowed (Settings › Accounts › your own number)");
    if (!file.key) return fail("the voice engine has no key");
    const audio = bridgeFor(e);
    if (!audio) return fail("the sound cable's device isn't set");
    const partner = deps.partnerName() || "Ducter";
    const forName = c.d.forName?.trim() || "the person I assist";
    const loop = new VoiceLoop(
      e,
      file.key,
      audio,
      instructionsFor({ partner, forName, to: c.d.to, name: c.d.name, goal: c.d.goal, say: c.d.say, ...(c.d.keep ? { keep: c.d.keep } : {}), ...(c.d.alternatives ? { alternatives: c.d.alternatives } : {}), mustNot: c.d.mustNot, context: c.d.context, ...(c.d.language ? { language: c.d.language } : {}), maxMinutes: 15 }),
      {
        ask: (q) => (c.question = { text: q.text, token: q.id, choices: q.choices, yesNo: q.yesNo }),
        press: (d) => a.press(d),
        end: (r) => (c.end = r),
        fail: (why) => (c.failed ??= why),
      },
      ...(deps.ws ? [deps.ws] : []),
    );
    c.loop = loop;
    c.phase = "calling";
    changed();
    try {
      await loop.connect();
    } catch (err) {
      return fail(`the voice engine: ${(err as Error).message}`);
    }
    if (!(await a.dial(c.d.to))) return fail("the phone didn't start the call");
    file.day = { date: today(), count: countToday() + 1 };
    save();
    const dialAt = Date.now();
    let seen = false;
    let rang = false;
    let hungUp = false;
    while (!stopped) {
      const s = (await a.callState()).state;
      if (s === "dialing" || s === "alerting") (seen = true), (rang = rang || s === "alerting" || Date.now() - dialAt > 5000);
      if (s === "active") {
        seen = true;
        if (!c.activeAt) {
          c.activeAt = Date.now();
          c.phase = "talking";
          changed();
          await loop.begin(step * 1.7);
        }
      }
      if ((s === "idle" || s === "ended") && seen) break;
      if (!seen && Date.now() - dialAt > DIAL_LIMIT_MS) {
        await a.hangUp();
        return fail("the phone didn't place the call");
      }
      if (!hungUp && !c.activeAt && seen && Date.now() - dialAt > RING_LIMIT_MS) (hungUp = true), await a.hangUp();
      // end_call, the owner's or Ducter's hang-up, or the engine gone: let the last words play, then hang up.
      if (!hungUp && (c.end || c.stop || c.failed)) {
        hungUp = true;
        if (c.end) await Promise.race([audio.drained(), Bun.sleep(8000)]), await Bun.sleep(400);
        await a.hangUp();
      }
      await Bun.sleep(step);
    }
    c.endedAt = Date.now();
    if (c.activeAt && !c.end && !c.stop) c.end = await loop.summarize().catch(() => undefined);
    await finish(c, rang);
  }

  async function finish(c: OwnCall, rang = false) {
    const talked = c.activeAt ? Math.round(((c.endedAt ?? Date.now()) - c.activeAt) / 1000) : 0;
    const cost = c.loop?.costUsd() ?? (talked ? (talked / 60) * engine().perMinUsd : 0);
    const state: ResultOut["state"] = c.end?.state ?? (c.activeAt ? "uncertain" : c.failed ? "failed" : rang ? "no_answer" : "failed");
    c.result = {
      state: c.failed && !c.activeAt ? "failed" : state,
      ...(c.end?.outcome ? { outcome: c.end.outcome } : {}),
      ...(c.end?.agreed?.length ? { agreed: c.end.agreed } : {}),
      ...(c.failed ? { detail: c.failed } : !c.activeAt && !rang ? { detail: "the line failed before it rang" } : {}),
      ...(c.loop?.transcript.length ? { transcript: [...c.loop.transcript] } : {}),
      durationSec: talked,
      costUsd: Math.round(cost * 100) / 100,
    };
    c.question = undefined;
    c.phase = "finished";
    await c.loop?.close().catch(() => undefined);
    changed();
  }

  const provider: CallProvider & { pollMs: number } = {
    name: OWN_PHONE,
    pollMs: 1500,
    reserved: new Set(),
    matches: () => false,
    async draft(_io, d) {
      const id = `own_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
      calls.set(id, { id, d, phase: "unconfirmed" });
      return { ok: true, id, ready: true };
    },
    async answer(_io, id) {
      return { ok: true, id, ready: true };
    },
    async requestApproval(_io, id) {
      return calls.has(id) ? { ok: true, confirmationId: id, summary: "" } : { ok: false, reason: "provider", error: "the draft is gone (Ducter restarted); draft the call again" };
    },
    async confirm(_io, id, approve) {
      const c = calls.get(id);
      if (!c) return { ok: false, reason: "provider", error: "the draft is gone (Ducter restarted); draft the call again" };
      if (!approve) return calls.delete(id), { ok: true };
      if (liveCall() || testing) return { ok: false, reason: "provider", error: "your phone is already on a call" };
      void run(c).catch((err) => ((c.failed = String((err as Error).message ?? err)), finish(c)));
      return { ok: true, id };
    },
    async status(_io, id) {
      const c = calls.get(id);
      if (!c) return { phase: "finished" };
      return { phase: c.phase, ...(c.question ? { question: c.question } : {}), ...(c.activeAt ? { durationSec: Math.round((Date.now() - c.activeAt) / 1000) } : {}) };
    },
    async reply(_io, id, token, text, yesNo) {
      const c = calls.get(id);
      if (!c?.loop || c.question?.token !== token) return false;
      c.question = undefined;
      const words = yesNo && /^(yes|是|可以|好)$/i.test(text.trim()) ? "Yes." : yesNo && /^(no|不|不行|不可以)$/i.test(text.trim()) ? "No." : text;
      return c.loop.answer(token, words);
    },
    async result(_io, id) {
      return calls.get(id)?.result ?? { state: "uncertain", detail: "Ducter restarted during the call; the phone's call log has what happened" };
    },
    async cancel(_io, id) {
      const c = calls.get(id);
      if (!c) return false;
      if (c.phase === "unconfirmed") return calls.delete(id), true;
      if (c.phase === "finished") return false;
      c.stop = "owner";
      // The run loop hangs up on its next step; hang up now too, so the tap is felt at once.
      await adb()?.hangUp().catch(() => false);
      return true;
    },
    async setup() {
      return { cap: true, name: true, sampling: false, shared: false };
    },
    async setCap() {
      return { ok: true };
    },
    async voice() {
      return { enrolled: false, on: false };
    },
    async voiceChange() {
      return { ok: false, reason: "no_voice" };
    },
  };

  const api: OwnPhone = {
    provider,
    ready,
    prefer: () => !!file.prefer && ready(),
    async busy() {
      if (liveCall() || testing) return true;
      const a = adb();
      if (!a) return false;
      const s = (await a.callState()).state;
      theirCall = !["idle", "ended", "unknown"].includes(s);
      return theirCall;
    },
    roomToday: () => countToday() < OWN_PER_DAY,
    number,
    model: () => info?.model ?? phone()?.model,
    perMinUsd: () => engine().perMinUsd,
    view,
    scan,
    async act(a) {
      switch (a.action) {
        case "scan":
          await scan();
          return { ok: true };
        case "audio":
          if (a.input !== undefined) file.input = a.input || undefined;
          if (a.output !== undefined) file.output = a.output || undefined;
          if (file.test?.state === "passed") file.test = { state: "never" }; // a new cable path needs a new test
          save();
          changed();
          return { ok: true };
        case "number": {
          const n = a.number.trim() ? e164(a.number) : undefined;
          if (a.number.trim() && !n) return { ok: false, error: "number" };
          file.number = n;
          save();
          changed();
          return { ok: true };
        }
        case "key": {
          const k = a.key.trim();
          if (k.length < 20 || /\s/.test(k)) return { ok: false, error: "key" };
          file.engine = a.engine === "qwen" ? "qwen" : "openai";
          file.key = k;
          file.model = undefined;
          save();
          changed();
          return { ok: true };
        }
        case "key_remove":
          file.key = undefined;
          save();
          changed();
          return { ok: true };
        case "test": {
          const to = e164(a.to);
          if (!to || deps.neverCall(to) || to.replace(/\D/g, "").length < 7) return { ok: false, error: "number" };
          if (testing || liveCall()) return { ok: false, error: "busy" };
          void test(to).catch((err) => console.warn(`[own-phone] test: ${(err as Error).message}`));
          return { ok: true };
        }
        case "heard":
          if (file.test?.state !== "asking") return { ok: false, error: "no_test" };
          file.test = { ...file.test, state: a.heard ? "passed" : "failed", ...(a.heard ? {} : { detail: "not_heard" as const }) };
          save();
          changed();
          return { ok: true };
        case "prefer":
          file.prefer = a.on;
          save();
          changed();
          return { ok: true };
        case "forget":
          file = {};
          save();
          await scan();
          return { ok: true };
      }
    },
    onChange(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    stop() {
      stopped = true;
      if (keepUp) clearInterval(keepUp);
      for (const c of calls.values()) void c.loop?.close();
    },
  };
  // Once set up, the phone is looked at every minute (unplugged, replugged), and at start.
  let keepUp: ReturnType<typeof setInterval> | undefined;
  if (file.serial && !deps.exec) {
    void scan().catch(() => undefined);
    keepUp = setInterval(() => void scan().catch(() => undefined), 60_000);
  }
  return api;
}
