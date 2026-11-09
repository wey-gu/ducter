// Whether a harness's own browser and computer-use tools are ready on this machine (D130,
// research/38). Shared by the runner (which driver a browser place gets) and core (Your devices
// and abilities: Browse the web is ready without cua-driver when one of these is).
//
//   - Codex: the ChatGPT/Codex desktop app's bundled plugins carry Computer Use (`cua_repl`) and
//     its browser surfaces. The DOM-level surfaces (the in-app browser, Chrome through the ChatGPT
//     extension) answer only through the desktop app's browser access host, which reaches a Codex
//     process only through three env vars the app sets on the processes it starts. Ducter never
//     looks them up elsewhere: they are there when Ducter itself was started under the app.
//   - Claude Code: Claude in Chrome. Installed = its native-messaging host file; connected = a live
//     local bridge socket, or a connected browser in `claude --claude-in-chrome-mcp`'s own
//     read-only `list_connected_browsers` (no model call, nothing opened in Chrome).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/** The bundled Codex plugins a task keeps under Ducter's clean setup (verified against `mcpServerStatus/list`). */
export const CODEX_NATIVE_PLUGINS = ["browser@openai-bundled", "chrome@openai-bundled", "unified-computer-use@openai-bundled", "computer-use@openai-bundled"];
/** The user's own MCP server the desktop app writes for its browser plugin (it runs the browser service). */
export const CODEX_NATIVE_MCP = ["node_repl"];
/** How the desktop app hands its browser access host to a Codex process (the browser plugin reads these). */
export const CODEX_ACCESS_ENV = ["BROWSER_USE_ACCESS_PIPE_PATH", "BROWSER_USE_ACCESS_EXECUTOR_ID", "BROWSER_USE_ACCESS_VERIFYING_IDENTITY"];

/** "browser": Codex's DOM-level browser tools answer; "computer": only Computer Use (it drives Chrome as an app). */
export type CodexNative = "browser" | "computer";

/** Codex's own browser / computer use on this machine, from files and Ducter's env only. */
export function codexNative(env: Env = process.env, platform: NodeJS.Platform = process.platform): CodexNative | undefined {
  if (platform !== "darwin") return undefined;
  const home = env.HOME || homedir();
  const codexHome = env.CODEX_HOME || join(home, ".codex");
  let config: { features?: { plugins?: unknown }; plugins?: Record<string, { enabled?: unknown }> };
  try {
    config = Bun.TOML.parse(readFileSync(join(codexHome, "config.toml"), "utf8")) as typeof config;
  } catch {
    return undefined;
  }
  // The user turned plugins or Computer Use off in Codex itself: respect it.
  if (config.features?.plugins === false || config.plugins?.["unified-computer-use@openai-bundled"]?.enabled !== true) return undefined;
  const cache = join(codexHome, "plugins", "cache", "openai-bundled");
  if (!existsSync(join(cache, "unified-computer-use")) || !existsSync(join(codexHome, "computer-use", "Codex Computer Use.app"))) return undefined;
  const pipe = env.BROWSER_USE_ACCESS_PIPE_PATH;
  const host = !!pipe && !!env.BROWSER_USE_ACCESS_VERIFYING_IDENTITY && existsSync(pipe);
  const browserPlugin = config.plugins?.["browser@openai-bundled"]?.enabled === true || config.plugins?.["chrome@openai-bundled"]?.enabled === true;
  return host && browserPlugin ? "browser" : "computer";
}

/** Claude Code's `--chrome` native-messaging host, per Chromium browser (code.claude.com/docs/en/chrome). */
const CLAUDE_CHROME_HOST = "com.anthropic.claude_code_browser_extension.json";
const CHROMIUM_DIRS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ["Google/Chrome", "Microsoft Edge", "BraveSoftware/Brave-Browser"].map((d) => join("Library", "Application Support", d)),
  linux: ["google-chrome", "microsoft-edge", "BraveSoftware/Brave-Browser"].map((d) => join(".config", d)),
};

/** Claude in Chrome's host is installed (Claude Code ran with `--chrome` once). Says nothing about a connection. */
export function claudeInChromeInstalled(env: Env = process.env, platform: NodeJS.Platform = process.platform): boolean {
  const home = env.HOME || homedir();
  return (CHROMIUM_DIRS[platform] ?? []).some((d) => existsSync(join(home, d, "NativeMessagingHosts", CLAUDE_CHROME_HOST)));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Live local bridge sockets: Chrome started Claude Code's host for a connected extension (`/tmp/claude-mcp-browser-bridge-<user>/<pid>.sock`). */
export function claudeBridgeSockets(user?: string): string[] {
  let name = user;
  try {
    name ||= userInfo().username;
  } catch {}
  const dir = `/tmp/claude-mcp-browser-bridge-${name || "default"}`;
  try {
    return readdirSync(dir)
      .filter((f) => /^\d+\.sock$/.test(f) && alive(Number(f.slice(0, -5))))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/** Runs `claude --claude-in-chrome-mcp` and calls its read-only `list_connected_browsers`; the browsers it lists. */
export type ChromeMcpProbe = (bin: string, env: Record<string, string>, timeoutMs: number) => Promise<unknown[] | undefined>;

export const chromeMcpProbe: ChromeMcpProbe = async (bin, env, timeoutMs) => {
  let p: ReturnType<typeof Bun.spawn> | undefined;
  try {
    p = Bun.spawn([bin, "--claude-in-chrome-mcp"], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env });
  } catch {
    return undefined;
  }
  const proc = p;
  const stdin = proc.stdin as import("bun").FileSink;
  const send = (m: object) => {
    stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
    stdin.flush();
  };
  const work = (async () => {
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ducter", version: "0" } } });
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      buf += dec.decode(chunk);
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m: { id?: number; result?: { content?: { type?: string; text?: string }[] } };
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.id === 1) {
          send({ method: "notifications/initialized" });
          send({ id: 2, method: "tools/call", params: { name: "list_connected_browsers", arguments: {} } });
        } else if (m.id === 2) {
          const text = m.result?.content?.find((c) => c.type === "text")?.text ?? "";
          try {
            const list = JSON.parse(text);
            return Array.isArray(list) ? list : undefined;
          } catch {
            return undefined;
          }
        }
      }
    }
    return undefined;
  })();
  const timeout = new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs));
  try {
    return await Promise.race([work, timeout]);
  } finally {
    proc.kill();
  }
};

export interface ClaudeChromeOptions {
  env?: Env;
  platform?: NodeJS.Platform;
  which?: (cmd: string) => string | null;
  probe?: ChromeMcpProbe;
  sockets?: () => string[];
  timeoutMs?: number;
  now?: () => number;
}

let cachedConnected: { at: number; ok: boolean } | undefined;
const CONNECTED_TTL_MS = 30_000;

/** Test helper: forget the last connection check. */
export function resetClaudeInChromeCache(): void {
  cachedConnected = undefined;
}

/**
 * Claude in Chrome is connected right now: installed, and a live local bridge socket or a browser
 * the MCP server lists. About 1-2 s when it has to ask; reused for 30 s.
 */
export async function claudeInChromeConnected(o: ClaudeChromeOptions = {}): Promise<boolean> {
  const env = o.env ?? process.env;
  const now = o.now ?? Date.now;
  if (!claudeInChromeInstalled(env, o.platform)) return false;
  if (cachedConnected && now() - cachedConnected.at < CONNECTED_TTL_MS) return cachedConnected.ok;
  let ok = (o.sockets ?? claudeBridgeSockets)().length > 0;
  if (!ok) {
    const bin = (o.which ?? ((c: string) => Bun.which(c)))("claude");
    if (bin) {
      // Only what a login needs: the user's home (their claude.ai sign-in), PATH and temp.
      const keep = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "CLAUDE_CONFIG_DIR"];
      const childEnv = Object.fromEntries(keep.filter((k) => env[k]).map((k) => [k, env[k]!]));
      const list = await (o.probe ?? chromeMcpProbe)(bin, childEnv, o.timeoutMs ?? 8_000).catch(() => undefined);
      ok = !!list && list.length > 0;
    }
  }
  cachedConnected = { at: now(), ok };
  return ok;
}

/** What Claude in Chrome answers when the extension isn't reachable (every variant starts so). */
export const CLAUDE_CHROME_NOT_CONNECTED = /Browser extension is not connected/i;
