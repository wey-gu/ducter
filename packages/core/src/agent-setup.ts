// D359: putting the AI agents on a computer, and signing them in there, from wherever the person
// is (the lend sheet's 装上哪些 AI？, a device card's 安装 and 登录). One module for a worker (the
// `agent_setup` op over its socket) and for the home itself.
//
// Install, the least invasive way that works on a bare server (no sudo, nothing but curl there):
//   1. Node.js's own build, pinned and its SHA-256 checked, into <data>/tools/node (once);
//   2. each agent's npm package at the version Ducter verified (harness-facts `verified.to`),
//      `npm install -g` with that node as the prefix, so its bin lands in <data>/tools/node/bin.
// Nothing outside <data>/tools is written; deleting that folder undoes it. The copies read as
// npm-installed under that prefix (harness-probe agentHow), so D156's updates reach them.
// One agent at a time, in the order asked, so they arrive on the card one by one.
//
// Sign in, with each agent's own sign-in, run on that computer and carried to the person:
//   - Codex: `codex login --device-auth`: a link and a one-time code to open on any device;
//   - Claude Code: `claude auth login`: a link; its page gives a code, pasted back here;
//   - pi: no sign-in that runs without its own screen: the row says what to run there.
// Secrets never pass through: the link and Codex's code are not secrets (they only work for the
// person who signs in with them); Claude's pasted code is written to the sign-in's stdin, never kept.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentLoginState, AgentSetupReason, AgentSetupState } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { toolEnv } from "@ducter/protocol/src/tool-env.ts";
import { toolsNodeBin } from "./agent-path.ts";

/** Node.js Ducter puts in its tools folder for the agents' npm packages (an LTS line every agent supports). */
export const NODE_RELEASE = {
  version: "24.22.3",
  base: "https://nodejs.org/dist",
  assets: {
    "darwin-arm64": { file: "node-v24.22.3-darwin-arm64.tar.gz", sha256: "ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd" },
    "darwin-x64": { file: "node-v24.22.3-darwin-x64.tar.gz", sha256: "977614af0504c81045e7fd85596dbca0e5f951b96681516dadafedcca8c447f7" },
    "linux-arm64": { file: "node-v24.22.3-linux-arm64.tar.gz", sha256: "261af2af250dfd7e9f25cf151d1b2713a0adf8f10a9ad116c4947f68627affe8" },
    "linux-x64": { file: "node-v24.22.3-linux-x64.tar.gz", sha256: "061ec3e3062115705b56b51fa9cc330ab50d34b6969387d4e4b1a50c6809acc2" },
  } as Record<string, { file: string; sha256: string }>,
};

/** The agents Ducter can put on a computer, in the order a sheet lists them. */
export const INSTALLABLE: readonly HarnessId[] = ["codex", "claude-code", "pi"];
/** Pre-checked on the lend sheet's 装上哪些 AI？ (pi's sign-in needs that computer's terminal). */
export const SUGGESTED: readonly HarnessId[] = ["codex", "claude-code"];

/** The npm package and version Ducter installs for an agent: the newest it verified. */
export function agentPin(h: HarnessId): { pkg: string; version: string } | undefined {
  const pkg = HARNESS_FACTS[h].channels.value.npm;
  return pkg && (INSTALLABLE as readonly string[]).includes(h) ? { pkg, version: HARNESS_FACTS[h].verified.to } : undefined;
}

/** How long a sign-in waits for the person before it stops (Codex's device code lasts 15 min). */
export const LOGIN_WAIT_MS = 15 * 60_000;
/** How long a finished sign-in still says so. */
export const LOGIN_DONE_SHOWN_MS = 60_000;

export interface LoginProc {
  /** Everything it prints, as it comes (stdout and stderr). */
  onOutput(fn: (text: string) => void): void;
  write(text: string): void;
  kill(): void;
  exited: Promise<number>;
}

/** The system seams (fakes in tests: never the network, never npm). */
export interface AgentSetupSys {
  platform: string;
  arch: string;
  download(url: string, onProgress?: (pct: number) => void): Promise<Uint8Array>;
  run(argv: string[], o: { env: Record<string, string>; timeoutMs: number }): Promise<{ code: number; out: string }>;
  spawn(argv: string[], env: Record<string, string>): LoginProc;
  which(cmd: string): string | null;
  /** The environment an agent's command runs with (the doctor's probeEnv: allowlisted, never Ducter's keys). */
  env(cmd: string): Record<string, string>;
  /** Tests: the file system. */
  writeFile?: (p: string, b: Uint8Array) => void;
  exists?: (p: string) => boolean;
}

export interface AgentSetup {
  install(hs: readonly string[]): void;
  login(h: string): void;
  code(h: string, code: string): void;
  cancel(h: string): void;
  /** This agent's setup and sign-in now, for its row. */
  state(h: string): { setup?: AgentSetupState; login?: AgentLoginState; installable: boolean };
  /** Its rows with that state on them (installable only where it isn't there). */
  decorate<T extends { id?: string; harness?: string; installed: boolean; loggedIn: boolean }>(rows: T[]): (T & { setup?: AgentSetupState; login?: AgentLoginState; installable?: boolean })[];
  /** Something is installing or signing in (the worker's updater waits; the probe timer runs faster). */
  busy(): boolean;
  stop(): void;
}

const NET = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|getaddrinfo|network|socket hang up|fetch failed|Unable to connect|timed? ?out/i;
const SPACE = /ENOSPC|no space left/i;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

const reasonOf = (text: string): AgentSetupReason => (SPACE.test(text) ? "space" : NET.test(text) ? "network" : "failed");
/** The last meaningful line of an installer's output (never more than 160 characters). */
const lastLine = (text: string) =>
  text
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^npm (warn|notice)/i.test(l))
    .pop()
    ?.slice(0, 160);

/** The link and code an agent's sign-in prints (Codex: link + XXXX-XXXXX; Claude: a long link). */
export function parseLogin(h: string, text: string): { url?: string; code?: string } {
  const plain = text.replace(ANSI, "");
  const urls = [...plain.matchAll(/https:\/\/[^\s"'<>]+/g)].map((m) => m[0].replace(/[).,]+$/, ""));
  const url = h === "claude-code" ? urls.find((u) => /oauth|authorize|claude\.(ai|com)/.test(u)) : urls.find((u) => /auth\.openai\.com|chatgpt\.com|openai\.com/.test(u)) ?? urls[0];
  const code = h === "codex" ? /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/.exec(plain.split(url ?? "\u0000").slice(1).join(" ") || plain)?.[1] : undefined;
  return { ...(url ? { url } : {}), ...(code ? { code } : {}) };
}

export function createAgentSetup(o: {
  dataDir: string;
  sys: AgentSetupSys;
  /** Look at this computer's agents again and tell the home (after each install and sign-in). */
  probe: () => Promise<void>;
  /** The state changed: send the rows up now. */
  changed: () => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}): AgentSetup {
  const { sys } = o;
  const now = o.now ?? Date.now;
  const setTimer = o.setTimer ?? ((fn, ms) => {
    const t = setTimeout(fn, ms);
    (t as any).unref?.();
    return t;
  });
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as any));
  const exists = sys.exists ?? existsSync;
  const writeFile = sys.writeFile ?? ((p: string, b: Uint8Array) => writeFileSync(p, b));
  const tools = join(o.dataDir, "tools");
  const nodeDir = join(tools, "node");
  const nodeBin = toolsNodeBin(o.dataDir);
  const setups = new Map<string, AgentSetupState>();
  const logins = new Map<string, { view: AgentLoginState; proc?: LoginProc; timer?: unknown; out: string; mark?: number }>();
  const queue: HarnessId[] = [];
  let running = false;

  const fail = (h: string, reason: AgentSetupReason, detail?: string) => {
    setups.set(h, { phase: "failed", reason, ...(detail ? { detail } : {}) });
  };

  /** Ducter's own node, put there once. */
  const ensureNode = async (onPct: (pct: number) => void): Promise<{ ok: true } | { ok: false; reason: AgentSetupReason; detail?: string }> => {
    if (exists(join(nodeBin, "node")) && exists(join(nodeBin, "npm"))) return { ok: true };
    const asset = NODE_RELEASE.assets[`${sys.platform}-${sys.arch}`];
    if (!asset) return { ok: false, reason: "unsupported" };
    let bytes: Uint8Array;
    try {
      bytes = await sys.download(`${NODE_RELEASE.base}/v${NODE_RELEASE.version}/${asset.file}`, onPct);
    } catch (e) {
      return { ok: false, reason: "network", detail: lastLine(String((e as Error)?.message ?? e)) };
    }
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return { ok: false, reason: "failed", detail: "the download didn't match its checksum" };
    const tmp = join(tools, ".node-new");
    try {
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      writeFile(join(tmp, asset.file), bytes);
    } catch (e) {
      return { ok: false, reason: reasonOf(String(e)), detail: lastLine(String((e as Error)?.message ?? e)) };
    }
    const r = await sys.run(["tar", "-xzf", join(tmp, asset.file), "-C", tmp], { env: sys.env("tar"), timeoutMs: 5 * 60_000 });
    if (r.code !== 0) return { ok: false, reason: reasonOf(r.out), detail: lastLine(r.out) };
    try {
      rmSync(nodeDir, { recursive: true, force: true });
      renameSync(join(tmp, asset.file.replace(/\.tar\.gz$/, "")), nodeDir);
      rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      return { ok: false, reason: reasonOf(String(e)), detail: lastLine(String((e as Error)?.message ?? e)) };
    }
    return { ok: true };
  };

  const installOne = async (h: HarnessId) => {
    const pin = agentPin(h);
    if (!pin) return fail(h, "unsupported");
    setups.set(h, { phase: "installing" });
    o.changed();
    // Node is most of the wait: its download's progress, as 0–70 of this agent's bar.
    let last = -1;
    const node = await ensureNode((p) => {
      const pct = Math.round(p * 0.7);
      if (pct === last || setups.get(h)?.phase !== "installing") return;
      last = pct;
      setups.set(h, { phase: "installing", pct });
      o.changed();
    });
    if (!node.ok) return fail(h, node.reason, node.detail);
    const base = sys.env("npm");
    const env: Record<string, string> = {
      ...base,
      PATH: [nodeBin, base.PATH ?? ""].filter(Boolean).join(":"),
      npm_config_prefix: nodeDir,
      npm_config_update_notifier: "false",
      npm_config_fund: "false",
      npm_config_audit: "false",
      npm_config_loglevel: "error",
    };
    const r = await sys.run([join(nodeBin, "node"), join(nodeBin, "npm"), "install", "-g", "--prefix", nodeDir, `${pin.pkg}@${pin.version}`], { env, timeoutMs: 10 * 60_000 });
    if (r.code !== 0) return fail(h, reasonOf(r.out), lastLine(r.out));
    setups.delete(h);
  };

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      for (let h = queue.shift(); h; h = queue.shift()) {
        await installOne(h).catch((e) => fail(h!, "failed", lastLine(String(e))));
        await o.probe().catch(() => {});
        o.changed();
      }
    } finally {
      running = false;
    }
  };

  const endLogin = (h: string, view: AgentLoginState) => {
    const l = logins.get(h);
    if (l?.timer) clearTimer(l.timer);
    if (view.state === "done") {
      logins.set(h, { view, out: "", timer: setTimer(() => (logins.get(h)?.view === view ? (logins.delete(h), o.changed()) : undefined), LOGIN_DONE_SHOWN_MS) });
    } else logins.set(h, { view, out: "" });
  };

  const api: AgentSetup = {
    install(hs) {
      for (const h of hs) {
        if (!(INSTALLABLE as readonly string[]).includes(h) || queue.includes(h as HarnessId) || setups.get(h)?.phase === "installing") continue;
        queue.push(h as HarnessId);
        setups.set(h, { phase: "queued" });
      }
      o.changed();
      void drain();
    },
    login(h) {
      const prev = logins.get(h);
      if (prev?.proc && (prev.view.state === "starting" || prev.view.state === "waiting" || prev.view.state === "checking")) return;
      if (h === "pi") {
        logins.set(h, { view: { state: "terminal", command: "pi" }, out: "" });
        return o.changed();
      }
      const argv = h === "codex" ? ["codex", "login", "--device-auth"] : h === "claude-code" ? ["claude", "auth", "login"] : undefined;
      const bin = argv ? sys.which(argv[0]!) : null;
      if (!argv || !bin) {
        logins.set(h, { view: { state: "failed", reason: "failed" }, out: "" });
        return o.changed();
      }
      let proc: LoginProc;
      try {
        proc = sys.spawn([bin, ...argv.slice(1)], sys.env(argv[0]!));
      } catch {
        logins.set(h, { view: { state: "failed", reason: "failed" }, out: "" });
        return o.changed();
      }
      const entry = { view: { state: "starting" } as AgentLoginState, proc, out: "", timer: undefined as unknown, mark: 0 };
      logins.set(h, entry);
      entry.timer = setTimer(() => {
        if (logins.get(h) !== entry) return;
        proc.kill();
        endLogin(h, { state: "expired" });
        o.changed();
      }, LOGIN_WAIT_MS);
      proc.onOutput((text) => {
        if (logins.get(h) !== entry) return;
        entry.out = (entry.out + text).slice(-20_000);
        const got = parseLogin(h, entry.out);
        // Claude answers a wrong paste and keeps waiting for another (2.1.322: "Invalid code.").
        if (entry.view.state === "checking" && /invalid|expired|error/i.test(entry.out.slice(entry.mark).replace(ANSI, ""))) {
          entry.view = { ...entry.view, state: "waiting", reason: "wrong_code" };
          return o.changed();
        }
        if (got.url && entry.view.state === "starting" && (h !== "codex" || got.code)) {
          entry.view = { state: "waiting", url: got.url, ...(got.code ? { code: got.code } : {}), ...(h === "claude-code" ? { paste: true } : {}) };
          o.changed();
        }
      });
      void proc.exited.then(async (code) => {
        if (logins.get(h) !== entry) return;
        const out = entry.out;
        if (code === 0) {
          endLogin(h, { state: "done" });
          await o.probe().catch(() => {});
        } else
          endLogin(h, {
            state: "failed",
            reason: /device[ -]?code.*(not enabled|disabled)|enable device code/i.test(out) ? "device_off" : entry.view.state === "checking" && /invalid|wrong|expired|error/i.test(out) ? "wrong_code" : "failed",
          });
        o.changed();
      });
      o.changed();
    },
    code(h, code) {
      const l = logins.get(h);
      const c = code.trim();
      if (!l?.proc || l.view.state !== "waiting" || !c) return;
      l.mark = l.out.length;
      l.proc.write(c + "\n");
      const { reason: _, ...rest } = l.view;
      l.view = { ...rest, state: "checking" };
      o.changed();
    },
    cancel(h) {
      const l = logins.get(h);
      l?.proc?.kill();
      if (l?.timer) clearTimer(l.timer);
      logins.delete(h);
      o.changed();
    },
    state(h) {
      const s = setups.get(h);
      const l = logins.get(h)?.view;
      return { ...(s ? { setup: s } : {}), ...(l ? { login: l } : {}), installable: !!agentPin(h as HarnessId) && !!NODE_RELEASE.assets[`${sys.platform}-${sys.arch}`] };
    },
    decorate(rows) {
      return rows.map((r) => {
        const h = r.harness ?? r.id ?? "";
        const s = api.state(h);
        // A sign-in that finished shows no more once the probe says signed in; a setup once it's there.
        const setup = s.setup && !(r.installed && s.setup.phase !== "failed") ? s.setup : undefined;
        const login = s.login && !(r.loggedIn && s.login.state !== "done") ? s.login : undefined;
        return { ...r, ...(setup ? { setup } : {}), ...(login ? { login } : {}), ...(!r.installed && s.installable ? { installable: true } : {}) };
      });
    },
    busy: () => running || queue.length > 0 || [...logins.values()].some((l) => l.view.state === "starting" || l.view.state === "waiting" || l.view.state === "checking"),
    stop() {
      for (const l of logins.values()) {
        l.proc?.kill();
        if (l.timer) clearTimer(l.timer);
      }
      logins.clear();
      queue.length = 0;
    },
  };
  return api;
}

/** The real seams: fetch, Bun.spawn with pipes. */
export function realAgentSetupSys(o: { platform: string; arch: string; which: (c: string) => string | null; env?: (cmd: string) => Record<string, string> }): AgentSetupSys {
  return {
    platform: o.platform,
    arch: o.arch,
    which: o.which,
    // The basics and the agents' own homes, never Ducter's keys (tool-env.ts).
    env: o.env ?? (() => toolEnv({ extra: ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "PI_CODING_AGENT_DIR", "NVM_DIR", "NPM_CONFIG_PREFIX"] })),
    async download(url, onProgress) {
      const r = await fetch(url, { signal: AbortSignal.timeout(30 * 60_000) });
      if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
      const total = Number(r.headers.get("content-length") ?? 0);
      const parts: Uint8Array[] = [];
      let got = 0;
      let said = -1;
      for await (const chunk of r.body as any as AsyncIterable<Uint8Array>) {
        parts.push(chunk);
        got += chunk.length;
        const pct = total ? Math.floor((got / total) * 100) : -1;
        if (pct >= 0 && pct !== said) (said = pct), onProgress?.(pct);
      }
      const out = new Uint8Array(got);
      let at = 0;
      for (const p of parts) out.set(p, at), (at += p.length);
      return out;
    },
    async run(argv, { env, timeoutMs }) {
      try {
        const p = Bun.spawn(argv, { env, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
        const timer = setTimeout(() => p.kill(), timeoutMs);
        const [a, b] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
        const code = await p.exited;
        clearTimeout(timer);
        return { code: p.signalCode ? -1 : code, out: `${a}\n${b}` };
      } catch (e) {
        return { code: -1, out: String((e as Error)?.message ?? e) };
      }
    },
    spawn(argv, env) {
      const p = Bun.spawn(argv, { env, stdout: "pipe", stderr: "pipe", stdin: "pipe" });
      const fns: ((t: string) => void)[] = [];
      const pump = async (s: ReadableStream<Uint8Array>) => {
        const dec = new TextDecoder();
        for await (const chunk of s as any) {
          const t = dec.decode(chunk as Uint8Array, { stream: true });
          for (const fn of fns) fn(t);
        }
      };
      void pump(p.stdout as ReadableStream<Uint8Array>).catch(() => {});
      void pump(p.stderr as ReadableStream<Uint8Array>).catch(() => {});
      return {
        onOutput: (fn) => void fns.push(fn),
        write: (t) => {
          try {
            (p.stdin as any).write(t);
            (p.stdin as any).flush?.();
          } catch {}
        },
        kill: () => p.kill(),
        exited: p.exited,
      };
    },
  };
}
