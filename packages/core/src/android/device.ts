// Ducter's phone, running (D217): the emulator started headless when a task or a live view needs
// it, stopped (its state saved to a snapshot) after a while with nobody on it, and driven over
// adb on Ducter's own adb server. Every command goes through `adb()`, with the Android env inside
// <dataDir>/phone (sdk.ts androidEnv), never the user's adb or ~/.android.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { adbBin, androidEnv, AVD_NAME, CONSOLE_PORT, emulatorBin, phoneDirs, type PhoneDirs } from "./sdk.ts";
import { parseDump, type Screen } from "./screen.ts";
import { findGrpc, setClipboard } from "./clipboard.ts";

export type RunState = "stopped" | "starting" | "running" | "stopping";

export interface Raw {
  code: number;
  out: Uint8Array;
  err: string;
}

/** Runs one Android tool; tests replace it. */
export type Run = (argv: string[], o?: { timeoutMs?: number; env?: Record<string, string> }) => Promise<Raw>;

export const defaultRun: Run = async (argv, o = {}) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, ...(o.env ?? {}) } });
    const timer = setTimeout(() => p.kill(), o.timeoutMs ?? 30_000);
    const [out, err, code] = await Promise.all([new Response(p.stdout).arrayBuffer(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { code, out: new Uint8Array(out), err };
  } catch (e) {
    return { code: -1, out: new Uint8Array(), err: (e as Error).message };
  }
};

export type Launch = (argv: string[], env: Record<string, string>, log: string) => { pid: number; exited: Promise<number> };

const defaultLaunch: Launch = (argv, env, log) => {
  const p = Bun.spawn(argv, { stdout: Bun.file(log), stderr: Bun.file(log), stdin: "ignore", env: { ...process.env, ...env } });
  return { pid: p.pid, exited: p.exited };
};

export interface PhoneDeviceOptions {
  dataDir: string;
  env?: Record<string, string | undefined>;
  run?: Run;
  launch?: Launch;
  /** Puts text on the phone's clipboard (tests); default: the emulator's gRPC (clipboard.ts). */
  clip?: (text: string) => Promise<void>;
  /** Stop after this long with nobody on it (default 5 min). */
  idleMs?: number;
  bootTimeoutMs?: number;
  onState?: (s: RunState) => void;
}

export interface PhoneDevice {
  state(): RunState;
  /** Started (or already running) and booted; resolves when it answers. */
  ensure(): Promise<void>;
  /** Someone is on it (a task's tool, a view): keeps it from stopping for idleMs. */
  touch(): void;
  /** Holds it running while held (a task attached, a view open); returns the release. */
  hold(why: string): () => void;
  stop(): Promise<void>;
  /** adb with this phone's serial: `adb -s emulator-5560 <args>`. */
  adb(args: string[], timeoutMs?: number): Promise<Raw>;
  shell(cmd: string[], timeoutMs?: number): Promise<string>;
  /** The screen as a JPEG (the device encodes it; about 80 ms on Apple Silicon). */
  jpeg(): Promise<Uint8Array>;
  /** The screen as uiautomator sees it, or undefined while it won't settle (an animation). */
  screen(): Promise<Screen | undefined>;
  tap(x: number, y: number): Promise<void>;
  swipe(x1: number, y1: number, x2: number, y2: number, ms?: number): Promise<void>;
  key(code: string): Promise<void>;
  text(s: string): Promise<void>;
  /** The package in front. */
  front(): Promise<string>;
  /** Launchable apps: package and its label when known. */
  apps(): Promise<{ pkg: string; label?: string }[]>;
  launch(pkg: string): Promise<void>;
  /** Screen size in pixels. */
  size(): Promise<{ width: number; height: number }>;
}

const serialOf = () => `emulator-${CONSOLE_PORT}`;

/** Text for `input text`: spaces as %s, shell metacharacters escaped. ASCII only (adb's limit). */
export function inputText(s: string): string {
  return s.replace(/([\\"'`$&|;<>()\[\]{}*?!~#])/g, "\\$1").replace(/ /g, "%s");
}

export const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

export function createPhoneDevice(o: PhoneDeviceOptions): PhoneDevice {
  const d: PhoneDirs = phoneDirs(o.dataDir);
  const env = androidEnv(d, o.env ?? process.env);
  const run = o.run ?? defaultRun;
  const launch = o.launch ?? defaultLaunch;
  const idleMs = o.idleMs ?? 5 * 60_000;
  const clip =
    o.clip ??
    (async (text: string) => {
      const g = findGrpc(join(d.avd, `${AVD_NAME}.avd`));
      if (!g) throw new Error("couldn't reach the phone's clipboard to type that text");
      await setClipboard(g, text);
    });
  let state: RunState = "stopped";
  let starting: Promise<void> | undefined;
  let lastTouch = Date.now();
  let idleTimer: ReturnType<typeof setInterval> | undefined;
  const holds = new Map<number, string>();
  let holdSeq = 0;
  let size: { width: number; height: number } | undefined;
  let proc: { pid: number; exited: Promise<number> } | undefined;

  const set = (s: RunState) => {
    if (state === s) return;
    state = s;
    o.onState?.(s);
  };
  const adb = (args: string[], timeoutMs = 30_000) => run([adbBin(d), "-s", serialOf(), ...args], { timeoutMs, env });
  const shell = async (cmd: string[], timeoutMs = 30_000) => {
    const r = await adb(["shell", ...cmd], timeoutMs);
    return new TextDecoder().decode(r.out).replace(/\r/g, "").trim();
  };
  const booted = async () => (await shell(["getprop", "sys.boot_completed"], 5_000).catch(() => "")) === "1";

  const sweep = () => {
    if (state !== "running" || holds.size) return;
    if (Date.now() - lastTouch >= idleMs) void api.stop();
  };

  async function start(): Promise<void> {
    if (!existsSync(emulatorBin(d))) throw new Error("Ducter's phone isn't installed on this computer");
    set("starting");
    await run([adbBin(d), "start-server"], { timeoutMs: 15_000, env });
    if (!(await booted())) {
      proc = launch(
        [emulatorBin(d), "-avd", AVD_NAME, "-port", String(CONSOLE_PORT), "-no-window", "-no-audio", "-no-boot-anim", "-no-metrics", "-gpu", "swiftshader_indirect"],
        env,
        join(d.root, "emulator.log"),
      );
      let quit = false;
      void proc.exited.then(() => {
        quit = true;
        proc = undefined;
        if (state !== "stopping") set("stopped");
      });
      const until = Date.now() + (o.bootTimeoutMs ?? 180_000);
      for (;;) {
        if (quit) throw new Error("Ducter's phone quit while starting (its log: phone/emulator.log)");
        if (await booted()) break;
        if (Date.now() > until) throw new Error("Ducter's phone didn't finish starting in 3 minutes");
        await Bun.sleep(700);
      }
      // A phone for an agent: no animations (quicker, and uiautomator can read a still screen).
      for (const k of ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]) await shell(["settings", "put", "global", k, "0"], 5_000);
    }
    set("running");
    lastTouch = Date.now();
    idleTimer ??= setInterval(sweep, Math.min(30_000, Math.max(1_000, idleMs / 4)));
  }

  const api: PhoneDevice = {
    state: () => state,
    async ensure() {
      if (state === "running") return void (lastTouch = Date.now());
      if (state === "stopping") await new Promise((r) => setTimeout(r, 500)).then(() => undefined);
      starting ??= start().finally(() => (starting = undefined));
      try {
        await starting;
      } catch (e) {
        set("stopped");
        throw e;
      }
    },
    touch: () => void (lastTouch = Date.now()),
    hold(why) {
      const id = ++holdSeq;
      holds.set(id, why);
      lastTouch = Date.now();
      return () => {
        holds.delete(id);
        lastTouch = Date.now();
      };
    },
    async stop() {
      if (state === "stopped") return;
      set("stopping");
      // `emu kill` saves the quick-boot snapshot first (research/62 §5: about 3 s).
      await adb(["emu", "kill"], 30_000);
      const until = Date.now() + 30_000;
      while (proc && Date.now() < until) await Bun.sleep(300);
      if (idleTimer) clearInterval(idleTimer), (idleTimer = undefined);
      set("stopped");
    },
    adb,
    shell,
    async jpeg() {
      const r = await adb(["exec-out", "screencap", "-j"], 10_000);
      if (r.code !== 0 || r.out[0] !== 0xff || r.out[1] !== 0xd8) throw new Error("couldn't take a picture of the phone's screen");
      return r.out;
    },
    async screen() {
      for (let i = 0; i < 2; i++) {
        const r = await adb(["exec-out", "uiautomator", "dump", "/dev/tty"], 15_000);
        const xml = new TextDecoder().decode(r.out);
        const at = xml.indexOf("<?xml");
        if (at >= 0) return parseDump(xml.slice(at, xml.lastIndexOf("</hierarchy>") + 12));
        await Bun.sleep(400);
      }
      return undefined;
    },
    async tap(x, y) {
      await shell(["input", "tap", String(Math.round(x)), String(Math.round(y))]);
    },
    async swipe(x1, y1, x2, y2, ms = 300) {
      await shell(["input", "swipe", ...[x1, y1, x2, y2].map((v) => String(Math.round(v))), String(ms)]);
    },
    async key(code) {
      await shell(["input", "keyevent", code]);
    },
    async text(s) {
      if (isAscii(s)) {
        for (let i = 0; i < s.length; i += 80) await shell(["input", "text", inputText(s.slice(i, i + 80))]);
        return;
      }
      // adb's `input text` takes ASCII only: other text (中文…) goes on the phone's clipboard and
      // is pasted into the field in focus, then the clipboard is emptied again.
      await clip(s);
      await shell(["input", "keyevent", "KEYCODE_PASTE"]);
      await Bun.sleep(150);
      await clip("").catch(() => {});
    },
    async front() {
      const out = await shell(["dumpsys", "window"], 10_000);
      const m = out.match(/mCurrentFocus=Window\{[^ ]+ [^ ]+ ([^/ }]+)/);
      return m?.[1] ?? "";
    },
    async apps() {
      const out = await shell(["cmd", "package", "query-activities", "--brief", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER"], 15_000);
      const pkgs = [...new Set(out.split("\n").map((l) => l.trim().split("/")[0]!).filter((p) => /^[a-z][\w.]+$/i.test(p) && p.includes(".")))];
      return pkgs.map((pkg) => ({ pkg }));
    },
    async launch(pkg) {
      if (!/^[a-z][\w.]+$/i.test(pkg)) throw new Error(`not an app id: ${pkg}`);
      const out = await shell(["monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"], 15_000);
      if (/No activities found|monkey aborted/i.test(out)) throw new Error(`${pkg} isn't installed on Ducter's phone`);
    },
    async size() {
      if (size) return size;
      const m = (await shell(["wm", "size"], 5_000)).match(/(\d+)x(\d+)\s*$/m);
      size = m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 720, height: 1600 };
      return size;
    },
  };
  return api;
}
