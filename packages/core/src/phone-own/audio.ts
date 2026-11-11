// D218: the computer end of the audio cable. The phone thinks a headset is plugged in: what the
// callee says comes out of the phone's headset socket into the computer's sound input, and what
// Ducter says goes from the computer's sound output into the phone's headset microphone.
//
// The computer's sound devices are reached through ffmpeg (avfoundation in, audiotoolbox out on a
// Mac; PulseAudio on Linux), one process each way, raw 16-bit mono PCM on a pipe. Nothing is
// written to disk: no recording is ever kept (D189 (9)). Tests use `loopbackBridge`.
import { existsSync } from "node:fs";

export interface AudioBridge {
  /** Starts listening: `onPcm` gets the line's audio as 16-bit mono at `inRate`. */
  start(onPcm: (pcm: Int16Array) => void): Promise<void>;
  /** Queues Ducter's voice (16-bit mono at `outRate`); played in real time. */
  play(pcm: Int16Array): void;
  /** Barge-in: drops whatever is still queued. */
  clear(): void;
  /** Milliseconds of queued audio actually played since the last clear() (for the truncate). */
  playedMs(): number;
  /** Resolves once everything queued has played. */
  drained(): Promise<void>;
  stop(): Promise<void>;
  readonly inRate: number;
  readonly outRate: number;
}

/** The loudness of a stretch of audio, 0–32767 (RMS). */
export function rms(pcm: Int16Array): number {
  if (!pcm.length) return 0;
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i]! * pcm[i]!;
  return Math.sqrt(s / pcm.length);
}

/** A soft two-note chime (the test call's first sound), 16-bit mono. */
export function chime(rate: number): Int16Array {
  const notes = [
    [660, 0.22],
    [880, 0.34],
  ] as const;
  const total = Math.round(rate * (notes.reduce((n, [, d]) => n + d, 0) + 0.1));
  const out = new Int16Array(total);
  let at = 0;
  for (const [f, d] of notes) {
    const n = Math.round(rate * d);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (rate * 0.01)) * Math.exp((-3 * i) / n);
      out[at + i] = Math.round(Math.sin((2 * Math.PI * f * i) / rate) * 9000 * env);
    }
    at += n;
  }
  return out;
}

export const b64ToPcm = (b64: string): Int16Array => {
  const buf = Buffer.from(b64, "base64");
  return new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.byteLength & ~1)));
};
export const pcmToB64 = (pcm: Int16Array): string => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString("base64");

/** ffmpeg on this computer. */
export function findFfmpeg(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.DUCTER_FFMPEG && existsSync(env.DUCTER_FFMPEG)) return env.DUCTER_FFMPEG;
  for (const d of [...(env.PATH ?? "").split(":").filter(Boolean), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) if (existsSync(`${d}/ffmpeg`)) return `${d}/ffmpeg`;
  return undefined;
}

/** ffmpeg's device lists (stderr): avfoundation's audio inputs, audiotoolbox's outputs. */
export function parseMacDevices(inputs: string, outputs: string): { inputs: string[]; outputs: string[] } {
  const ins: string[] = [];
  let audio = false;
  for (const l of inputs.split("\n")) {
    if (/AVFoundation audio devices/.test(l)) audio = true;
    else if (/AVFoundation video devices/.test(l)) audio = false;
    else if (audio) {
      const m = /\]\s*\[(\d+)\]\s+(.+)$/.exec(l);
      if (m) ins.push(m[2]!.trim());
    }
  }
  const outs: string[] = [];
  for (const l of outputs.split("\n")) {
    const m = /\[AudioToolbox[^\]]*\]\s*\[(\d+)\]\s+(.+?),\s*\S+\s*$/.exec(l);
    if (m) outs.push(m[2]!.trim());
  }
  return { inputs: ins, outputs: outs };
}

async function run(argv: string[], ms = 8000): Promise<{ out: string; err: string; code: number }> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const t = setTimeout(() => p.kill(), ms);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(t);
  return { out, err, code };
}

/** The computer's sound inputs and outputs, by name. */
export async function listAudio(ffmpeg = findFfmpeg(), platform = process.platform): Promise<{ inputs: string[]; outputs: string[]; tool: boolean }> {
  if (platform === "linux") {
    const src = await run(["pactl", "list", "short", "sources"]).catch(() => undefined);
    const snk = await run(["pactl", "list", "short", "sinks"]).catch(() => undefined);
    const names = (s?: string) => (s ?? "").split("\n").map((l) => l.split("\t")[1]).filter((x): x is string => !!x && !x.endsWith(".monitor"));
    return { inputs: names(src?.out), outputs: names(snk?.out), tool: !!ffmpeg && !!src };
  }
  if (!ffmpeg || platform !== "darwin") return { inputs: [], outputs: [], tool: !!ffmpeg };
  const i = await run([ffmpeg, "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]).catch(() => undefined);
  const o = await run([ffmpeg, "-hide_banner", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.05", "-f", "audiotoolbox", "-list_devices", "true", "-"]).catch(() => undefined);
  return { ...parseMacDevices(i?.err ?? "", o?.err ?? ""), tool: true };
}

/**
 * The likely cable: a USB sound device (not the built-in mic, a meeting app's virtual device, or a
 * loopback driver). A guess only: the card shows it and the owner can pick another.
 */
export function guessDevice(names: string[]): string | undefined {
  const virtual = /macbook|built-?in|imac|studio display|zoom|teams|wemeet|lark|trtc|obs|blackhole|soundflower|loopback|multi-output|aggregate|iphone|airpods|display|webcam|camera/i;
  return names.find((n) => /usb|audio adapter|sound card|codec|c-media|cm108|ugreen|sabrent|plugable|headset adapter/i.test(n) && !virtual.test(n)) ?? names.find((n) => !virtual.test(n));
}

/** The real bridge: two ffmpeg processes, paced so a barge-in drops at most ~120 ms of queued voice. */
export function ffmpegBridge(o: { ffmpeg: string; input: string; output: string; inRate: number; outRate: number; platform?: NodeJS.Platform }): AudioBridge {
  const platform = o.platform ?? process.platform;
  let cap: ReturnType<typeof Bun.spawn> | undefined;
  let out: ReturnType<typeof Bun.spawn> | undefined;
  let queue: Int16Array[] = [];
  let played = 0; // samples since the last clear
  let timer: ReturnType<typeof setInterval> | undefined;
  let waiters: (() => void)[] = [];
  const CHUNK = Math.round(o.outRate * 0.02); // 20 ms
  const inArgs = platform === "linux" ? ["-f", "pulse", "-i", o.input] : ["-f", "avfoundation", "-i", `:${o.input}`];
  const outArgs = platform === "linux" ? ["-f", "pulse", o.output] : ["-f", "audiotoolbox", "-audio_device_index", "__INDEX__", "-"];

  async function outIndex(): Promise<string> {
    const l = await listAudio(o.ffmpeg, platform);
    const i = l.outputs.indexOf(o.output);
    return String(i < 0 ? 0 : i);
  }
  let t0 = 0;
  let written = 0;
  const LEAD = Math.round(o.outRate * 0.1);
  function feed() {
    // Keep ~100 ms ahead of the device in whole 20 ms chunks, so a clear() drops nearly everything.
    const w = out?.stdin as import("bun").FileSink | undefined;
    if (!w || typeof w === "number") return;
    if (!queue.length) {
      t0 = 0;
      written = 0;
      for (const r of waiters.splice(0)) setTimeout(r, 150);
      return;
    }
    const now = performance.now();
    if (!t0) t0 = now;
    const target = ((now - t0) / 1000) * o.outRate + LEAD;
    while (queue.length && written < target) {
      const head = queue[0]!;
      const take = head.subarray(0, CHUNK);
      queue[0] = head.subarray(take.length);
      if (!queue[0].length) queue.shift();
      w.write(new Uint8Array(take.buffer, take.byteOffset, take.byteLength));
      written += take.length;
      played += take.length;
    }
    w.flush();
  }
  return {
    inRate: o.inRate,
    outRate: o.outRate,
    async start(onPcm) {
      cap = Bun.spawn([o.ffmpeg, "-hide_banner", "-loglevel", "error", ...inArgs, "-ac", "1", "-ar", String(o.inRate), "-f", "s16le", "-"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
      const idx = platform === "linux" ? "" : await outIndex();
      out = Bun.spawn([o.ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(o.outRate), "-ac", "1", "-i", "-", ...outArgs.map((a) => (a === "__INDEX__" ? idx : a))], { stdout: "ignore", stderr: "ignore", stdin: "pipe" });
      timer = setInterval(feed, 20);
      void (async () => {
        let rest = new Uint8Array(0);
        for await (const chunk of cap!.stdout as ReadableStream<Uint8Array>) {
          const all = new Uint8Array(rest.length + chunk.length);
          all.set(rest);
          all.set(chunk, rest.length);
          const even = all.length & ~1;
          rest = all.slice(even);
          if (even) onPcm(new Int16Array(all.buffer.slice(0, even)));
        }
      })().catch(() => undefined);
    },
    play(pcm) {
      if (pcm.length) queue.push(pcm);
    },
    clear() {
      queue = [];
      played = 0;
    },
    playedMs: () => Math.round((Math.max(0, played - LEAD) / o.outRate) * 1000),
    drained: () => (queue.length ? new Promise<void>((r) => waiters.push(r)) : Promise.resolve()),
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      queue = [];
      for (const r of waiters.splice(0)) r();
      cap?.kill();
      try {
        (out?.stdin as import("bun").FileSink | undefined)?.end();
      } catch {}
      out?.kill();
    },
  };
}

/**
 * A bridge with no sound card, for tests and the fake phone: what Ducter plays is collected in
 * `heard` (as the callee would hear it), and `say()` puts the callee's voice on the line.
 */
export function loopbackBridge(o: { inRate: number; outRate: number }): AudioBridge & { heard: Int16Array[]; say(pcm: Int16Array): void; started: boolean } {
  let on: ((pcm: Int16Array) => void) | undefined;
  let played = 0;
  const b = {
    inRate: o.inRate,
    outRate: o.outRate,
    heard: [] as Int16Array[],
    started: false,
    async start(onPcm: (pcm: Int16Array) => void) {
      on = onPcm;
      b.started = true;
    },
    play(pcm: Int16Array) {
      b.heard.push(pcm);
      played += pcm.length;
    },
    clear() {
      played = 0;
    },
    playedMs: () => Math.round((played / o.outRate) * 1000),
    drained: () => Promise.resolve(),
    async stop() {
      on = undefined;
      b.started = false;
    },
    say(pcm: Int16Array) {
      on?.(pcm);
    },
  };
  return b;
}

/** A line of speech for the test call, from the computer's own voice (macOS `say`), as PCM; else undefined. */
export async function spoken(text: string, rate: number, o: { ffmpeg?: string; zh?: boolean; dir: string }): Promise<Int16Array | undefined> {
  if (process.platform !== "darwin" || !o.ffmpeg) return undefined;
  const aiff = `${o.dir}/own-phone-test.aiff`;
  const r = await run(["say", ...(o.zh ? ["-v", "Tingting"] : []), "-o", aiff, text], 15_000).catch(() => undefined);
  if (!r || r.code !== 0) return undefined;
  const p = Bun.spawn([o.ffmpeg, "-hide_banner", "-loglevel", "error", "-i", aiff, "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"], { stdout: "pipe", stderr: "ignore" });
  const buf = new Uint8Array(await new Response(p.stdout).arrayBuffer());
  await p.exited;
  try {
    (await import("node:fs")).rmSync(aiff, { force: true });
  } catch {}
  return buf.length ? new Int16Array(buf.buffer.slice(0, buf.length & ~1)) : undefined;
}
