// D235: cua-driver on one Mac, as 用电脑 / Use the computer uses it: where its binary is, whether macOS
// gave it its two switches (Accessibility, Screen Recording), and one tool call through its
// daemon (`cua-driver call <tool> <json>`). Read-only probes never ask macOS for anything.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComputerPerms } from "@ducter/protocol";

export const CUA_APP_BIN = "/Applications/CuaDriver.app/Contents/MacOS/cua-driver";

export type Exec = (argv: string[], timeoutMs?: number) => Promise<{ code: number; out: string }>;

export const execOut: Exec = async (argv, timeoutMs = 15_000) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { code, out: code === 0 ? out : [out.trim(), err.trim()].filter(Boolean).join("\n") };
  } catch (e) {
    return { code: -1, out: (e as Error).message };
  }
};

export function cuaBin(env: Record<string, string | undefined> = process.env, which: (c: string) => string | null = (c) => Bun.which(c)): string | undefined {
  return env.DUCTER_CUA_DRIVER || which("cua-driver") || (existsSync(CUA_APP_BIN) ? CUA_APP_BIN : undefined);
}

/** macOS's two switches for cua-driver, as cua-driver's own daemon says them; undefined when it can't tell. */
export type PermsProbe = () => Promise<ComputerPerms | undefined>;

export function defaultPermsProbe(env: Record<string, string | undefined> = process.env, exec: Exec = execOut): PermsProbe {
  return async () => {
    const bin = cuaBin(env);
    if (!bin) return undefined;
    const r = await exec([bin, "permissions", "status", "--json"], 15_000);
    if (r.code !== 0) return undefined;
    try {
      const j = JSON.parse(r.out);
      if (typeof j?.accessibility !== "boolean" || typeof j?.screen_recording !== "boolean") return undefined;
      return { accessibility: j.accessibility, screen: j.screen_recording };
    } catch {
      return undefined;
    }
  };
}

/** One cua-driver tool's answer: its JSON (structured content) and its first picture, if any. */
export interface CuaAnswer {
  json: any;
  /** base64 PNG */
  image?: string;
}

/** Calls one cua-driver tool on this Mac (tests replace it). */
export type CuaCall = (tool: string, args: object) => Promise<CuaAnswer>;

export function localCuaCall(env: Record<string, string | undefined> = process.env, spawnIt: typeof Bun.spawn = Bun.spawn): CuaCall {
  return async (tool, args) => {
    const bin = cuaBin(env);
    if (!bin) throw new Error("cua-driver isn't installed on this Mac");
    const dir = mkdtempSync(join(tmpdir(), "ducter-cua-"));
    const shot = join(dir, "shot.png");
    try {
      const p = spawnIt([bin, "call", tool, JSON.stringify(args), "--screenshot-out-file", shot], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
      const timer = setTimeout(() => p.kill(), 60_000);
      const [out, err, code] = await Promise.all([new Response(p.stdout as ReadableStream).text(), new Response(p.stderr as ReadableStream).text(), p.exited]);
      clearTimeout(timer);
      if (code !== 0) throw new Error((err.trim() || out.trim() || `cua-driver ${tool} failed`).slice(0, 800));
      let json: any;
      try {
        json = JSON.parse(out);
      } catch {
        json = { text: out.trim() };
      }
      const image = existsSync(shot) ? readFileSync(shot).toString("base64") : undefined;
      return { json, ...(image ? { image } : {}) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** Opens cua-driver's own guide to the two switches on this Mac's screen (the person grants them). */
export async function openGrantGuide(env: Record<string, string | undefined> = process.env, exec: Exec = execOut): Promise<{ ok: boolean; reason?: "cua_missing" | "failed"; message?: string }> {
  const bin = cuaBin(env);
  if (!bin) return { ok: false, reason: "cua_missing" };
  // The guide stays open on the screen while the person flips the switches: don't wait for it.
  const r = await Promise.race([exec([bin, "permissions", "grant"], 600_000), Bun.sleep(1500).then(() => ({ code: 0, out: "" }))]);
  return r.code === 0 ? { ok: true } : { ok: false, reason: "failed", message: r.out.slice(0, 300) };
}
