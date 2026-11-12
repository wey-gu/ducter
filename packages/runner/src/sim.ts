// D220: the iOS Simulators on this computer, for the opened task's workbench (research/64). Only
// what Xcode's own `simctl` does: list the booted ones, a frame of the screen, Home, dark or
// light, text size, open a link, a full screenshot. No taps (simctl has none). Every udid is
// checked against the booted list first; a link is checked by simLinkOk; nothing runs through a shell.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { appProject, isUdid, SIM_TEXT, simLinkOk, simTextOf, WB_HEAVY, type SimAct, type SimText, type WbAnswer, type WbSim } from "@ducter/protocol/src/workbench.ts";
import { WbFail } from "./workbench.ts";

export interface Ran {
  code: number;
  out: Uint8Array;
  err: string;
}
/** Runs a program (argv, never a shell); tests pass their own. */
export type Exec = (argv: string[], o?: { timeoutMs?: number }) => Promise<Ran>;

export const realExec: Exec = async (argv, o = {}) => {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => p.kill(), o.timeoutMs ?? 8000);
  try {
    const [out, err, code] = await Promise.all([new Response(p.stdout).arrayBuffer(), new Response(p.stderr).text(), p.exited]);
    return { code, out: new Uint8Array(out), err };
  } finally {
    clearTimeout(timer);
  }
};

const text = (r: Ran) => new TextDecoder().decode(r.out).trim();

/** "com.apple.CoreSimulator.SimRuntime.iOS-26-3" → "iOS 26.3". */
export function osName(runtime: string): string {
  const m = /SimRuntime\.([A-Za-z]+)-(\d+(?:-\d+)*)$/.exec(runtime);
  if (!m) return "";
  const os = m[1] === "iOS" ? "iOS" : m[1]!.replace(/OS$/, "OS");
  return `${os} ${m[2]!.replace(/-/g, ".")}`;
}

/** The booted iPhones and iPads in `simctl list devices booted -j` (watches and TVs left out). */
export function parseBooted(json: string): { udid: string; name: string; os: string }[] {
  let v: { devices?: Record<string, { udid?: string; name?: string; state?: string; isAvailable?: boolean }[]> };
  try {
    v = JSON.parse(json);
  } catch {
    return [];
  }
  const out: { udid: string; name: string; os: string }[] = [];
  for (const [rt, list] of Object.entries(v.devices ?? {})) {
    if (!/SimRuntime\.iOS-/.test(rt)) continue;
    for (const d of list ?? []) if (d.state === "Booted" && isUdid(d.udid) && d.name) out.push({ udid: d.udid!, name: d.name, os: osName(rt) });
  }
  return out;
}

/** Whether the working copy holds an iOS app: an Xcode project or an ios/ folder at its top or one
 *  folder down (`mobile/ios`), or an Xcode project under apps/* or packages/* (`apps/ios/App.xcodeproj`). */
export function holdsApp(root: string): boolean {
  const ls = (p: string) => {
    try {
      return readdirSync(p, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  const xcode = (p: string) => ls(p).some((d) => /\.(xcodeproj|xcworkspace)$/i.test(d.name));
  const top = ls(root);
  if (appProject(top.map((d) => d.name))) return true;
  for (const d of top) {
    if (!d.isDirectory() || d.name.startsWith(".") || WB_HEAVY.has(d.name) || d.name === "node_modules") continue;
    const inner = ls(join(root, d.name));
    if (appProject(inner.map((x) => x.name))) return true;
    if (d.name === "apps" || d.name === "packages") for (const x of inner) if (x.isDirectory() && xcode(join(root, d.name, x.name))) return true;
  }
  return false;
}

export interface Sims {
  /** The booted ones (cached for a moment: a page and its poll may ask together). */
  booted(): Promise<{ udid: string; name: string; os: string }[]>;
  list(): Promise<WbSim[]>;
  frame(udid: string, edge?: number): Promise<Extract<WbAnswer, { op: "sim_frame" }>>;
  act(udid: string, act: SimAct, value?: string): Promise<Extract<WbAnswer, { op: "sim_act" }>>;
}

export function createSims(o: { exec?: Exec; platform?: string; now?: () => number; tmp?: string } = {}): Sims {
  const exec = o.exec ?? realExec;
  const mac = (o.platform ?? process.platform) === "darwin";
  const now = o.now ?? Date.now;
  let cache: { at: number; list: { udid: string; name: string; os: string }[] } | undefined;
  const simctl = (args: string[], timeoutMs = 8000) => exec(["xcrun", "simctl", ...args], { timeoutMs });

  async function booted() {
    if (!mac) return [];
    if (cache && now() - cache.at < 2500) return cache.list;
    const r = await simctl(["list", "devices", "booted", "-j"], 6000).catch(() => undefined);
    const list = r && r.code === 0 ? parseBooted(text(r)) : [];
    cache = { at: now(), list };
    return list;
  }
  async function one(udid: string) {
    if (!isUdid(udid)) throw new WbFail("outside");
    const s = (await booted()).find((x) => x.udid === udid) ?? (cache = undefined, (await booted()).find((x) => x.udid === udid));
    if (!s) throw new WbFail("missing", "That simulator isn't running any more.");
    return s;
  }
  async function settings(udid: string): Promise<Pick<WbSim, "appearance" | "text">> {
    const [a, c] = await Promise.all([simctl(["ui", udid, "appearance"], 4000).catch(() => undefined), simctl(["ui", udid, "content_size"], 4000).catch(() => undefined)]);
    const ap = a?.code === 0 ? text(a) : "";
    const tx = c?.code === 0 ? simTextOf(text(c)) : undefined;
    return { ...(ap === "light" || ap === "dark" ? { appearance: ap } : {}), ...(tx ? { text: tx } : {}) };
  }
  const run = async (args: string[], what: string) => {
    const r = await simctl(args, 15_000);
    if (r.code !== 0) throw new WbFail("failed", (r.err.trim().split("\n").pop() || what).slice(0, 200));
    return r;
  };
  return {
    booted,
    async list() {
      const b = await booted();
      return Promise.all(b.map(async (s) => ({ ...s, ...(await settings(s.udid)) })));
    },
    async frame(udid, edge) {
      await one(udid);
      const r = await run(["io", udid, "screenshot", "--type=jpeg", "-"], "screenshot");
      const big = r.out;
      const e = Math.max(240, Math.min(1600, Math.round(Number(edge) || 1200)));
      // sips makes it small (≈35 KB at 780 px against 350 KB): research/64. Without sips, the full JPEG.
      const dir = o.tmp ?? (await import("node:os")).tmpdir();
      const base = join(dir, `ducter-sim-${udid.slice(0, 8)}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
      try {
        await Bun.write(`${base}.jpg`, big);
        const s = await exec(["sips", "-Z", String(e), "-s", "format", "jpeg", "-s", "formatOptions", "62", `${base}.jpg`, "--out", `${base}-s.jpg`], { timeoutMs: 5000 });
        const f = Bun.file(`${base}-s.jpg`);
        const small = s.code === 0 && (await f.exists()) ? new Uint8Array(await f.arrayBuffer()) : big;
        const { w, h } = jpegSize(small) ?? { w: 0, h: 0 };
        return { op: "sim_frame", udid, image: `data:image/jpeg;base64,${Buffer.from(small).toString("base64")}`, w, h };
      } finally {
        for (const p of [`${base}.jpg`, `${base}-s.jpg`]) await Bun.file(p).delete().catch(() => {});
      }
    },
    async act(udid, act, value) {
      await one(udid);
      switch (act) {
        case "home":
          // research/64: SpringBoard forward is Home; the app in front keeps running.
          await run(["launch", udid, "com.apple.springboard"], "home");
          return { op: "sim_act", udid, act };
        case "appearance":
          if (value !== "light" && value !== "dark") throw new WbFail("failed", "light or dark");
          await run(["ui", udid, "appearance", value], "appearance");
          break;
        case "text": {
          const c = SIM_TEXT[value as SimText];
          if (!c) throw new WbFail("failed", "unknown text size");
          await run(["ui", udid, "content_size", c], "text size");
          break;
        }
        case "url":
          if (!simLinkOk(value)) throw new WbFail("failed", "not a link");
          await run(["openurl", udid, value], "open link");
          return { op: "sim_act", udid, act };
        case "shot": {
          const r = await run(["io", udid, "screenshot", "--type=png", "-"], "screenshot");
          return { op: "sim_act", udid, act, image: `data:image/png;base64,${Buffer.from(r.out).toString("base64")}` };
        }
        default:
          throw new WbFail("unsupported");
      }
      const s = (await booted()).find((x) => x.udid === udid)!;
      return { op: "sim_act", udid, act, sim: { ...s, ...(await settings(udid)) } };
    },
  };
}

/** A JPEG's pixel size, from its SOF marker. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | undefined {
  if (b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return undefined;
    const m = b[i + 1]!;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5]! << 8) | b[i + 6]!, w: (b[i + 7]! << 8) | b[i + 8]! };
    i += 2 + len;
  }
  return undefined;
}
