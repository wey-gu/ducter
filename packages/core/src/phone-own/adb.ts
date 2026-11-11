// D218: the owner's own Android phone over adb, for calls only. This module is the only place
// Ducter talks to that phone for calling, and it can say exactly six things to it: list the phones,
// read a few named properties (model, Android version, SIM state, carrier), read the call state,
// read whether a headset is plugged in, dial one E.164 number, hang up, and press keypad digits.
// Nothing else is built here: no shell string is ever passed through, no message, contact, file,
// screen or other app is read or opened. Every command is an argv from a fixed template, with the
// number and digits checked before they get near one.
//
// Facts (research/63): `am start -a android.intent.action.CALL -d tel:…` dials from adb's shell
// user without root; `input keyevent KEYCODE_ENDCALL` hangs up; `dumpsys telephony.registry`
// carries mCallState and mPreciseCallState (seen on the Android 16 emulator, 2026-11-12).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ADB_PORT, phoneDirs } from "../android/sdk.ts";

export type Exec = (args: string[], o?: { timeoutMs?: number }) => Promise<{ code: number; out: string; err: string }>;

/**
 * adb on this computer: PATH, ANDROID_HOME / ANDROID_SDK_ROOT, the usual install places, and the
 * SDK Ducter's own phone installed (D217: `<dataDir>/phone/sdk`), so adding that is enough.
 */
export function findAdb(env: Record<string, string | undefined> = process.env, dataDir?: string): string | undefined {
  const named = env.DUCTER_ADB;
  if (named && existsSync(named)) return named;
  const dirs = [
    ...(env.PATH ?? "").split(":").filter(Boolean),
    ...(dataDir ? [join(phoneDirs(dataDir).sdk, "platform-tools")] : []),
    ...[env.ANDROID_HOME, env.ANDROID_SDK_ROOT].filter(Boolean).map((d) => join(d!, "platform-tools")),
    join(homedir(), "Library/Android/sdk/platform-tools"),
    join(homedir(), "Android/Sdk/platform-tools"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
  for (const d of dirs) if (existsSync(join(d, "adb"))) return join(d, "adb");
  return undefined;
}

/**
 * Runs adb with an argv (never a shell line), on the adb server Ducter's own phone uses (D217:
 * its port, never the user's 5037), so Ducter runs one adb server, not two fighting over USB.
 */
export function adbExec(bin: string, env: Record<string, string | undefined> = process.env): Exec {
  const port = String(Number(env.DUCTER_PHONE_ADB_PORT) || ADB_PORT);
  return async (args, o = {}) => {
    const p = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, ANDROID_ADB_SERVER_PORT: port } });
    const timer = setTimeout(() => p.kill(), o.timeoutMs ?? 10_000);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { code, out, err };
  };
}

export interface AdbDevice {
  serial: string;
  state: "ready" | "unauthorized" | "offline";
  model: string;
  usb: boolean; // plugged in by cable (not a network pairing or an emulator)
}

/** `adb devices -l`. */
export function parseDevices(out: string): AdbDevice[] {
  const list: AdbDevice[] = [];
  for (const line of out.split("\n").slice(1)) {
    const m = /^(\S+)\s+(device|unauthorized|offline|no permissions|authorizing)\b(.*)$/.exec(line.trim());
    if (!m) continue;
    const rest = m[3] ?? "";
    const model = /model:(\S+)/.exec(rest)?.[1]?.replaceAll("_", " ") ?? "Android";
    const state = m[2] === "device" ? "ready" : m[2] === "offline" ? "offline" : "unauthorized";
    list.push({ serial: m[1]!, state, model, usb: /usb:/.test(rest) || (!m[1]!.startsWith("emulator-") && !m[1]!.includes(":")) });
  }
  return list;
}

/**
 * The phone's call state. idle: no call; dialing / alerting: ours, ringing out; active: someone is
 * on the line; incoming: a call is ringing in (never answered by Ducter); holding; ended: the last
 * call just ended (Android keeps DISCONNECTED until the next call).
 */
export type PhoneCallState = "idle" | "dialing" | "alerting" | "active" | "holding" | "incoming" | "ended" | "unknown";

/** `dumpsys telephony.registry`: mPreciseCallState's foreground and ringing states, else mCallState. */
export function parseCallState(out: string): { state: PhoneCallState; cause?: number } {
  const precise = /Ringing call state: (-?\d+), Foreground call state: (-?\d+), Background call state: (-?\d+)(?:, Disconnect cause: (-?\d+))?/.exec(out);
  const legacy = /mCallState=(\d)/.exec(out);
  if (precise) {
    const ring = Number(precise[1]);
    const fg = Number(precise[2]);
    const bg = Number(precise[3]);
    const cause = precise[4] !== undefined ? Number(precise[4]) : undefined;
    // PreciseCallState: 0 idle, 1 active, 2 holding, 3 dialing, 4 alerting, 5 incoming, 6 waiting, 7 disconnected, 8 disconnecting.
    if (ring === 5 || ring === 6) return { state: "incoming" };
    if (fg === 1) return { state: "active" };
    if (fg === 3) return { state: "dialing" };
    if (fg === 4) return { state: "alerting" };
    if (fg === 2 || bg === 2) return { state: "holding" };
    if (fg === 7 || fg === 8) return { state: legacy?.[1] === "2" ? "active" : "ended", ...(cause !== undefined && cause >= 0 ? { cause } : {}) };
    if (fg === 0 || fg === -1) return { state: legacy?.[1] === "1" ? "incoming" : legacy?.[1] === "2" ? "active" : "idle" };
  }
  if (legacy) return { state: legacy[1] === "0" ? "idle" : legacy[1] === "1" ? "incoming" : "active" };
  return { state: "unknown" };
}

/**
 * `dumpsys audio`: whether a wired or USB headset with a microphone is connected. Android lists
 * the connected devices (AudioDeviceInventory) and each stream's route; a headset with a mic shows
 * as wired_headset / headset(4) or usb_headset, headphones without a mic as headphone / (8).
 */
export function parseHeadset(out: string): "yes" | "no" | "unknown" {
  if (!/Devices:|AudioDeviceInventory|mConnectedDevices|Connected devices/i.test(out)) return "unknown";
  const connected = out.match(/(?:mConnectedDevices|Connected devices|AudioDeviceInventory)[\s\S]{0,4000}/i)?.[0] ?? "";
  if (/(?:wired_headset|usb_headset|DEVICE_IN_WIRED_HEADSET|DEVICE_IN_USB_HEADSET|0x80000010|0x84000000)/i.test(connected)) return "yes";
  // The voice-call stream's route: headset(4) or usb_headset when a headset with a mic is in.
  const voice = /STREAM_VOICE_CALL:[\s\S]{0,600}?Devices: ([^\n]+)/.exec(out)?.[1] ?? "";
  if (/\bheadset\b|usb_headset/.test(voice)) return "yes";
  return "no";
}

/** The SIM state property (gsm.sim.state; one entry per slot, "READY,ABSENT"). */
export function parseSim(v: string): "ready" | "absent" | "locked" | "unknown" {
  const slots = v.trim().toUpperCase().split(",");
  if (slots.includes("READY") || slots.includes("LOADED")) return "ready";
  if (slots.some((s) => /PIN|PUK|LOCKED/.test(s))) return "locked";
  if (slots.length && slots.every((s) => s === "ABSENT" || s === "NOT_READY" || s === "")) return "absent";
  return "unknown";
}

const E164 = /^\+[1-9]\d{6,14}$/;
const DIGITS = /^[0-9*#]{1,32}$/;
const KEY: Record<string, string> = { "*": "KEYCODE_STAR", "#": "KEYCODE_POUND" };
/** The only properties ever read. */
const PROPS = ["ro.product.model", "ro.build.version.release", "gsm.sim.state", "gsm.sim.operator.alpha", "gsm.operator.alpha"] as const;

/** One phone, by serial: the six things this module can do with it. */
export class OwnPhoneAdb {
  constructor(
    private exec: Exec,
    readonly serial: string,
  ) {}

  private sh(args: string[], timeoutMs = 10_000) {
    return this.exec(["-s", this.serial, "shell", ...args], { timeoutMs });
  }

  async info(): Promise<{ model?: string; android?: string; sim: ReturnType<typeof parseSim>; carrier?: string }> {
    const v: Record<string, string> = {};
    for (const p of PROPS) v[p] = (await this.sh(["getprop", p]).catch(() => ({ out: "" }))).out.trim();
    const carrier = (v["gsm.sim.operator.alpha"] || v["gsm.operator.alpha"] || "").split(",").find(Boolean);
    return { ...(v["ro.product.model"] ? { model: v["ro.product.model"] } : {}), ...(v["ro.build.version.release"] ? { android: v["ro.build.version.release"] } : {}), sim: parseSim(v["gsm.sim.state"] ?? ""), ...(carrier ? { carrier } : {}) };
  }

  async callState(): Promise<{ state: PhoneCallState; cause?: number }> {
    const r = await this.sh(["dumpsys", "telephony.registry"]).catch(() => undefined);
    // Only the call-state lines are read; the rest of the dump is dropped here, never kept.
    if (!r || r.code !== 0) return { state: "unknown" };
    const lines = r.out.split("\n").filter((l) => /mCallState=|mPreciseCallState=/.test(l)).slice(0, 4).join("\n");
    return parseCallState(lines);
  }

  async headset(): Promise<"yes" | "no" | "unknown"> {
    const r = await this.sh(["dumpsys", "audio"], 15_000).catch(() => undefined);
    return r && r.code === 0 ? parseHeadset(r.out) : "unknown";
  }

  async dial(to: string): Promise<boolean> {
    if (!E164.test(to)) throw new Error("not an E.164 number");
    const r = await this.sh(["am", "start", "-a", "android.intent.action.CALL", "-d", `tel:${to}`]);
    return r.code === 0 && !/Error|Exception/.test(r.out + r.err);
  }

  async hangUp(): Promise<boolean> {
    const r = await this.sh(["input", "keyevent", "KEYCODE_ENDCALL"]);
    return r.code === 0;
  }

  /** Keypad digits on a live call (a phone menu): one key at a time, as the in-call screen takes them. */
  async press(digits: string): Promise<boolean> {
    if (!DIGITS.test(digits)) throw new Error("only 0-9, * and #");
    for (const d of digits) {
      const r = await this.sh(["input", "keyevent", KEY[d] ?? `KEYCODE_${d}`]);
      if (r.code !== 0) return false;
      await Bun.sleep(180);
    }
    return true;
  }
}

/** The phones plugged in, and adb's own answer when it has none. */
export async function listPhones(exec: Exec): Promise<AdbDevice[]> {
  const r = await exec(["devices", "-l"], { timeoutMs: 8_000 }).catch(() => undefined);
  return r && r.code === 0 ? parseDevices(r.out) : [];
}
