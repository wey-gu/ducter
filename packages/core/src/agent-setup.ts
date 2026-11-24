// D363: putting the AI agents on a computer, and signing them in there, from wherever the person
// is (the lend sheet's 装上哪些 AI？, a device card's 安装 and 登录). One module for a worker (the
// `agent_setup` op over its socket) and for the home itself.
//
// Install, the least invasive way that works on a bare server (no sudo, nothing but curl there):
//   1. Node.js's own build, pinned and its SHA-256 checked, into <data>/tools/node (once);
//   2. each agent's npm package at the version Ducter verified (harness-facts `verified.to`),
//      `npm install -g` with that node as the prefix, so its bin lands in <data>/tools/node/bin.
// Nothing outside <data>/tools is written; deleting that folder undoes it. The copies read as
// npm-installed under that prefix (harness-probe agentHow), so D156's updates reach them.
// D416: Antigravity's agy is no npm package. It goes where its own installer puts it
// (~/.local/bin/agy, where OAR looks even off PATH), the way that installer does it: Google's
// release manifest for this platform, the build it names, its sha512 checked, the flat binary
// copied in; never the installer's shell-profile step. A copy below OAR's floor is updated with
// its own `agy update`; one that doesn't answer is replaced; one that works is left alone.
// One agent at a time, in the order asked, so they arrive on the card one by one.
//
// Sign in, with each agent's own sign-in, run on that computer and carried to the person:
//   - Codex: `codex login --device-auth`: a link and a one-time code to open on any device;
//   - Claude Code: `claude auth login`: a link; its page gives a code, pasted back here;
//   - pi: no sign-in that runs without its own screen: the row says what to run there;
//   - DeepSeek Harness (D371): its Mac app opened there when it has one (its 登录: the DeepSeek
//     account, or a key), and a DeepSeek API key pasted in the row, checked and kept in that
//     computer's keys.env (0600) like any key (D102); the row turns signed in either way;
//   - Antigravity (D416): `agy acp --login`: a Google link to open on any device; the code that
//     page gives (or the address it lands on) is pasted back and written to the sign-in's input.
//     On Linux its own browser launch is a no-op (a server has none), as OAR does it.
// The pasted DeepSeek key is the one secret that passes: home to that computer over its own
// socket, once, into its key file; never logged, never shown again, never in a frame back.
// Otherwise secrets never pass through: the link and Codex's code are not secrets (they only work for the
// person who signs in with them); Claude's pasted code is written to the sign-in's stdin, never kept.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentLoginState, AgentSetupReason, AgentSetupState } from "@ducter/protocol";
import { cleanKey } from "@ducter/protocol/src/api-keys.ts";
import { DSH_APP, DSH_KEY_PAGE, dshAppPaths, dshCredentialsFile, dshSignIns } from "@ducter/protocol/src/dsh.ts";
import { ANTIGRAVITY, HARNESS_FACTS, agyPlatform } from "@ducter/protocol/src/harness-facts.ts";
import { DSH_KEY_ENV, HARNESSES, isHarnessId, type HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { readKeys, writeKey } from "@ducter/protocol/src/keys.ts";
import { toolEnv } from "@ducter/protocol/src/tool-env.ts";
import { toolsNodeBin } from "./agent-path.ts";
import { checkDeepSeekKey } from "./api-key.ts";
import { agyPaths, agyVersion, compareVersions } from "./harness-probe.ts";

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

/** The agents Ducter can put on a computer, in the order a sheet lists them (D371: DeepSeek Harness's command line too; D416: Antigravity's agy). */
export const INSTALLABLE: readonly HarnessId[] = ["codex", "claude-code", "pi", "deepseek-harness", "antigravity"];
/** Pre-checked on the lend sheet's 装上哪些 AI？ (pi's sign-in needs that computer's terminal). */
export const SUGGESTED: readonly HarnessId[] = ["codex", "claude-code"];

/** The npm package and version Ducter installs for an agent: the newest it verified. */
export function agentPin(h: HarnessId): { pkg: string; version: string } | undefined {
  const pkg = HARNESS_FACTS[h]?.channels.value.npm;
  return pkg && (INSTALLABLE as readonly string[]).includes(h) ? { pkg, version: HARNESS_FACTS[h].verified.to } : undefined;
}

type Login = { view: AgentLoginState; proc?: LoginProc; timer?: unknown; check?: unknown; out: string; mark?: number };
/** D518: how long a pasted code may go unanswered before the sign-in says so and offers again. */
export const LOGIN_CHECK_MS = 90_000;
/** D371: how often a DeepSeek Harness sign-in made elsewhere (its app, a key saved by hand) is looked for. */
export const DSH_LOOK_MS = 3000;

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
  read?: (p: string) => string | undefined;
  /** D371: is a pasted DeepSeek key good (DeepSeek's own balance read, spending nothing)? Default: api-key.ts. */
  checkKey?: (key: string) => Promise<{ ok: true } | { ok: false; reason: "wrong_key" | "no_balance" | "offline" | "failed" }>;
  /** D371: where DeepSeek Harness.app may be (default: /Applications, ~/Applications). */
  dshApps?: () => string[];
  /** D416: the person's home folder there (agy goes in its ~/.local/bin). Default: os.homedir(). */
  home?: string;
  /** D416: this Linux is musl (Alpine): agy's musl build. Default: its loader is there. */
  musl?: boolean;
  /** D416: tests: make a file executable, clear macOS's quarantine. */
  chmod?: (p: string) => void;
  /** D416: the agent's own sign-out (the runner's HarnessPort.logout); absent: none here. */
  logout?: (h: string) => Promise<{ ok: boolean; detail?: string }>;
}

/** D416: Google's release manifest for agy on one platform. */
interface AgyRelease {
  version: string;
  url: string;
  sha512: string;
}

export interface AgentSetup {
  install(hs: readonly string[]): void;
  login(h: string): void;
  /** D416: its own sign-out, where the agent has one Ducter can run (HarnessInfo.signOut). */
  logout(h: string): void;
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
  const url = h === "claude-code" ? urls.find((u) => /oauth|authorize|claude\.(ai|com)/.test(u)) : h === "antigravity" ? urls.find((u) => /^https:\/\/accounts\.google\.com\//.test(u)) : urls.find((u) => /auth\.openai\.com|chatgpt\.com|openai\.com/.test(u)) ?? urls[0];
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
  /**
   * D518: is this agent signed in here now, by its own check run fresh (`claude auth status`, never
   * a cached reading)? A sign-in that ended well says 登录好了 only once this says yes. Absent
   * (older callers, tests of the rest): the sign-in's own exit is taken at its word.
   */
  signedIn?: (h: string) => Promise<boolean>;
  /** Tests: how long a sign-in waits (LOGIN_WAIT_MS), how long a pasted code may go unanswered (LOGIN_CHECK_MS). */
  waitMs?: number;
  checkMs?: number;
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
  const read =
    sys.read ??
    ((p: string) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return undefined;
      }
    });
  const checkKey = sys.checkKey ?? ((key: string) => checkDeepSeekKey(key));
  /** D371: DeepSeek Harness is signed in here (a key in Ducter's key file or its own, or the app's DeepSeek account): files only. */
  const dshSignedIn = () => !!readKeys(o.dataDir, read)[DSH_KEY_ENV] || Object.values(dshSignIns(read(dshCredentialsFile(process.env)))).some(Boolean);
  const writeFile = sys.writeFile ?? ((p: string, b: Uint8Array) => writeFileSync(p, b));
  const tools = join(o.dataDir, "tools");
  const nodeDir = join(tools, "node");
  const nodeBin = toolsNodeBin(o.dataDir);
  const setups = new Map<string, AgentSetupState>();
  const logins = new Map<string, Login>();
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

  /** D416: agy where its own installer puts it, or the copy there made to run (see the header). */
  const installAgy = async (): Promise<void> => {
    const h = "antigravity";
    const home = sys.home ?? homedir();
    const target = join(home, ...ANTIGRAVITY.bin);
    const env = { ...sys.env("agy"), AGY_CLI_DISABLE_AUTO_UPDATE: "true" };
    const versionOf = async (bin: string) => {
      const r = await sys.run([bin, "--version"], { env, timeoutMs: 30_000 });
      return r.code === 0 ? agyVersion(r.out) : undefined;
    };
    const atFloor = (v: string | undefined) => !!v && (compareVersions(v, ANTIGRAVITY.minVersion) ?? -1) >= 0;
    // A copy that answers: fine as it is, or too old and updated by itself (its own updater).
    for (const bin of agyPaths({ which: sys.which, env: { ...process.env, ...env }, home, exists })) {
      const v = await versionOf(bin);
      if (atFloor(v)) return void setups.delete(h);
      if (!v) continue; // doesn't answer: a fresh copy goes in its place below (when it is ours to replace)
      setups.set(h, { phase: "installing" });
      o.changed();
      const r = await sys.run([bin, "update"], { env: sys.env("agy"), timeoutMs: 10 * 60_000 });
      const after = await versionOf(bin);
      if (atFloor(after)) return void setups.delete(h);
      return fail(h, r.code === 0 ? "failed" : reasonOf(r.out), lastLine(r.out) ?? `agy ${after ?? v} is below ${ANTIGRAVITY.minVersion}`);
    }
    const platform = agyPlatform(sys.platform, sys.arch, sys.musl ?? (exists("/lib/libc.musl-x86_64.so.1") || exists("/lib/libc.musl-aarch64.so.1")));
    if (!platform) return fail(h, "unsupported");
    setups.set(h, { phase: "installing", pct: 0 });
    o.changed();
    let rel: AgyRelease;
    try {
      const j = JSON.parse(new TextDecoder().decode(await sys.download(ANTIGRAVITY.manifest.replace("{platform}", platform))));
      if (typeof j?.version !== "string" || typeof j?.url !== "string" || !/^https:\/\//.test(j.url) || typeof j?.sha512 !== "string") return fail(h, "failed", "agy's release list didn't say what to download");
      rel = j;
    } catch (e) {
      return fail(h, "network", lastLine(String((e as Error)?.message ?? e)));
    }
    if (!atFloor(rel.version)) return fail(h, "failed", `agy ${rel.version} is below ${ANTIGRAVITY.minVersion}`);
    let last = -1;
    let bytes: Uint8Array;
    try {
      bytes = await sys.download(rel.url, (p) => {
        const pct = Math.round(p * 0.95);
        if (pct === last || setups.get(h)?.phase !== "installing") return;
        last = pct;
        setups.set(h, { phase: "installing", pct });
        o.changed();
      });
    } catch (e) {
      return fail(h, "network", lastLine(String((e as Error)?.message ?? e)));
    }
    if (createHash("sha512").update(bytes).digest("hex") !== rel.sha512.toLowerCase()) return fail(h, "failed", "the download didn't match its checksum");
    // Staged beside the target, then renamed over it: never a half-written agy.
    const dir = dirname(target);
    const stage = join(dir, `.agy-new-${process.pid}`);
    const tarball = /\.tar\.gz(\?|$)/.test(rel.url);
    try {
      rmSync(stage, { recursive: true, force: true });
      mkdirSync(stage, { recursive: true });
      writeFile(join(stage, tarball ? "agy.tar.gz" : "antigravity"), bytes);
    } catch (e) {
      return fail(h, reasonOf(String(e)), lastLine(String((e as Error)?.message ?? e)));
    }
    try {
      if (tarball) {
        const r = await sys.run(["tar", "-xzf", join(stage, "agy.tar.gz"), "-C", stage, "antigravity"], { env: sys.env("tar"), timeoutMs: 5 * 60_000 });
        if (r.code !== 0) return fail(h, reasonOf(r.out), lastLine(r.out));
      }
      const bin = join(stage, "antigravity");
      (sys.chmod ?? ((p: string) => chmodSync(p, 0o755)))(bin);
      if (sys.platform === "darwin") await sys.run(["xattr", "-d", "com.apple.quarantine", bin], { env: sys.env("xattr"), timeoutMs: 15_000 }).catch(() => undefined);
      renameSync(bin, target);
    } catch (e) {
      return fail(h, reasonOf(String(e)), lastLine(String((e as Error)?.message ?? e)));
    } finally {
      try {
        rmSync(stage, { recursive: true, force: true });
      } catch {}
    }
    setups.delete(h);
  };

  const installOne = async (h: HarnessId) => {
    if (h === "antigravity") return installAgy();
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

  const waitMs = o.waitMs ?? LOGIN_WAIT_MS;
  const checkMs = o.checkMs ?? LOGIN_CHECK_MS;
  const endLogin = (h: string, view: AgentLoginState) => {
    const l = logins.get(h);
    if (l?.timer) clearTimer(l.timer);
    if (l?.check) clearTimer(l.check);
    if (view.state === "done") {
      logins.set(h, { view, out: "", timer: setTimer(() => (logins.get(h)?.view === view ? (logins.delete(h), o.changed()) : undefined), LOGIN_DONE_SHOWN_MS) });
    } else logins.set(h, { view, out: "" });
  };

  /**
   * D371: DeepSeek Harness has no sign-in that runs without its own screen. On a Mac with its app,
   * the app opens there (its 登录 is the DeepSeek account, or a key); anywhere, a DeepSeek API key
   * pasted in the row is checked and kept in Ducter's key file there. Either way the row turns
   * signed in by itself: its sign-in files are looked at every few seconds, for 15 minutes.
   */
  const dshLogin = () => {
    const h = "deepseek-harness";
    const prev = logins.get(h);
    if (prev?.timer) clearTimer(prev.timer);
    const app = sys.platform === "darwin" ? (sys.dshApps?.() ?? dshAppPaths()).find((p) => exists(p)) : undefined;
    if (app) void sys.run(["open", app], { env: sys.env("open"), timeoutMs: 15_000 }).catch(() => {});
    const entry: Login = { view: { state: "waiting", key: true, url: DSH_KEY_PAGE, ...(app ? { app: DSH_APP } : {}) }, out: "" };
    logins.set(h, entry);
    const until = now() + LOGIN_WAIT_MS;
    const tick = () => {
      if (logins.get(h) !== entry) return;
      if (entry.view.state !== "checking" && dshSignedIn()) {
        endLogin(h, { state: "done" });
        void o.probe().catch(() => {});
        return o.changed();
      }
      if (now() >= until) {
        endLogin(h, { state: "expired" });
        return o.changed();
      }
      entry.timer = setTimer(tick, DSH_LOOK_MS);
    };
    entry.timer = setTimer(tick, DSH_LOOK_MS);
    o.changed();
  };
  /** D371: a pasted DeepSeek key: checked (nothing spent), kept in this computer's key file, never shown again. */
  const dshKey = async (h: string, l: Login, raw: string) => {
    const key = cleanKey(raw);
    const { reason: _, ...rest } = l.view;
    l.view = { ...rest, state: "checking" };
    o.changed();
    const r = await checkKey(key).catch(() => ({ ok: false as const, reason: "failed" as const }));
    if (logins.get(h) !== l) return;
    if (!r.ok) {
      l.view = { ...rest, state: "waiting", reason: r.reason };
      return o.changed();
    }
    try {
      writeKey(o.dataDir, DSH_KEY_ENV, key);
    } catch {
      l.view = { ...rest, state: "waiting", reason: "failed" };
      return o.changed();
    }
    endLogin(h, { state: "done" });
    await o.probe().catch(() => {});
    o.changed();
  };

  /**
   * D416: agy's sign-in environment. agy ignores BROWSER and starts the platform's launcher
   * itself; on Linux it finds `xdg-open` on PATH, so a folder holding one that does nothing goes
   * first (OAR's login-browser.ts does the same): the link is opened wherever the person is.
   */
  const agyLoginEnv = (): Record<string, string> => {
    const env = sys.env("agy");
    if (sys.platform !== "linux") return env;
    const dir = join(tools, "no-browser");
    try {
      mkdirSync(dir, { recursive: true });
      writeFile(join(dir, "xdg-open"), new TextEncoder().encode("#!/bin/sh\nexit 0\n"));
      (sys.chmod ?? ((p: string) => chmodSync(p, 0o755)))(join(dir, "xdg-open"));
    } catch {
      return env;
    }
    return { ...env, PATH: [dir, env.PATH ?? ""].filter(Boolean).join(":") };
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
      if (h === "deepseek-harness") return dshLogin();
      const argv = h === "codex" ? ["codex", "login", "--device-auth"] : h === "claude-code" ? ["claude", "auth", "login"] : h === "antigravity" ? ["agy", "acp", "--login"] : undefined;
      const bin = h === "antigravity" ? (agyPaths({ which: sys.which, env: process.env, home: sys.home ?? homedir(), exists })[0] ?? null) : argv ? sys.which(argv[0]!) : null;
      if (!argv || !bin) {
        logins.set(h, { view: { state: "failed", reason: "failed" }, out: "" });
        return o.changed();
      }
      let proc: LoginProc;
      try {
        proc = sys.spawn([bin, ...argv.slice(1)], h === "antigravity" ? agyLoginEnv() : sys.env(argv[0]!));
      } catch {
        logins.set(h, { view: { state: "failed", reason: "failed" }, out: "" });
        return o.changed();
      }
      // D518: the person sees when it stops by itself.
      const until = now() + waitMs;
      const entry: Login = { view: { state: "starting", until }, proc, out: "", timer: undefined as unknown, mark: 0 };
      logins.set(h, entry);
      entry.timer = setTimer(() => {
        if (logins.get(h) !== entry) return;
        proc.kill();
        endLogin(h, { state: "expired" });
        o.changed();
      }, waitMs);
      proc.onOutput((text) => {
        if (logins.get(h) !== entry) return;
        entry.out = (entry.out + text).slice(-20_000);
        const got = parseLogin(h, entry.out);
        // Claude answers a wrong paste and keeps waiting for another (2.1.322: "Invalid code.").
        if (entry.view.state === "checking" && entry.mark !== undefined && entry.mark >= 0 && /invalid|expired|error/i.test(entry.out.slice(entry.mark).replace(ANSI, ""))) {
          if (entry.check) clearTimer(entry.check);
          entry.check = undefined;
          entry.view = { ...entry.view, state: "waiting", reason: "wrong_code" };
          return o.changed();
        }
        if (got.url && entry.view.state === "starting" && (h !== "codex" || got.code)) {
          entry.view = { state: "waiting", url: got.url, ...(got.code ? { code: got.code } : {}), ...(h === "claude-code" || h === "antigravity" ? { paste: true } : {}), until };
          o.changed();
        }
      });
      void proc.exited.then(async (code) => {
        if (logins.get(h) !== entry) return;
        const out = entry.out;
        if (code === 0) {
          // D518: its sign-in says it ended well; the agent's own check, run fresh, decides.
          // (hel, 2026-11-24: claude wrote its sign-in, the card read a stale "signed out" and
          // said 登录好了 beside 未登录.)
          if (o.signedIn) {
            if (entry.check) clearTimer(entry.check);
            entry.check = undefined;
            entry.mark = -1;
            entry.view = { state: "checking", until };
            o.changed();
            const ok = await o.signedIn(h).catch(() => false);
            if (logins.get(h) !== entry) return;
            if (!ok) {
              endLogin(h, { state: "failed", reason: "not_seen" });
              return o.changed();
            }
          }
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
    logout(h) {
      const prev = logins.get(h);
      if (prev?.view.state === "signing_out") return;
      prev?.proc?.kill();
      if (prev?.timer) clearTimer(prev.timer);
      if (!sys.logout || !(isHarnessId(h) && HARNESSES[h].signOut)) {
        logins.set(h, { view: { state: "failed", reason: "signout_failed" }, out: "" });
        return o.changed();
      }
      const entry: Login = { view: { state: "signing_out" }, out: "" };
      logins.set(h, entry);
      o.changed();
      void sys
        .logout(h)
        .catch(() => ({ ok: false }))
        .then(async (r) => {
          if (logins.get(h) !== entry) return;
          if (r.ok) logins.delete(h);
          else entry.view = { state: "failed", reason: "signout_failed" };
          await o.probe().catch(() => {});
          o.changed();
        });
    },
    code(h, code) {
      const l = logins.get(h);
      const c = code.trim();
      if (l?.view.key && l.view.state === "waiting" && c) return void dshKey(h, l, c);
      if (!l?.proc || l.view.state !== "waiting" || !c) return;
      l.mark = l.out.length;
      l.proc.write(c + "\n");
      const { reason: _, ...rest } = l.view;
      l.view = { ...rest, state: "checking" };
      // D518: a code that gets no answer says so, never a box that waits on forever.
      if (l.check) clearTimer(l.check);
      l.check = setTimer(() => {
        if (logins.get(h) !== l || l.view.state !== "checking" || l.mark === -1) return;
        l.proc?.kill();
        endLogin(h, { state: "failed", reason: "no_answer" });
        o.changed();
      }, checkMs);
      o.changed();
    },
    cancel(h) {
      const l = logins.get(h);
      l?.proc?.kill();
      if (l?.timer) clearTimer(l.timer);
      if (l?.check) clearTimer(l.check);
      logins.delete(h);
      o.changed();
    },
    state(h) {
      const s = setups.get(h);
      const l = logins.get(h)?.view;
      const installable = h === "antigravity" ? !!agyPlatform(sys.platform, sys.arch) : !!agentPin(h as HarnessId) && !!NODE_RELEASE.assets[`${sys.platform}-${sys.arch}`];
      return { ...(s ? { setup: s } : {}), ...(l ? { login: l } : {}), installable };
    },
    decorate(rows) {
      return rows.map((r) => {
        const h = r.harness ?? r.id ?? "";
        const s = api.state(h);
        // A sign-in that finished shows no more once the probe says signed in; a setup once it's there.
        const setup = s.setup && !(r.installed && s.setup.phase !== "failed") ? s.setup : undefined;
        // D416: a sign-out under way, or one that didn't take, shows on a row that still reads signed in.
        const signOut = s.login?.state === "signing_out" || s.login?.reason === "signout_failed";
        const login = s.login && (signOut || !(r.loggedIn && s.login.state !== "done")) ? s.login : undefined;
        // D518: done is the agent's own fresh check saying signed in: the row, its coin and every
        // island read signed in at once, whatever an older probe of the card still holds.
        const signedNow = login?.state === "done" && r.installed;
        return { ...r, ...(signedNow ? { loggedIn: true } : {}), ...(setup ? { setup } : {}), ...(login ? { login } : {}), ...(!r.installed && s.installable ? { installable: true } : {}) };
      });
    },
    busy: () => running || queue.length > 0 || [...logins.values()].some((l) => l.view.state === "starting" || l.view.state === "waiting" || l.view.state === "checking" || l.view.state === "signing_out"),
    stop() {
      for (const l of logins.values()) {
        l.proc?.kill();
        if (l.timer) clearTimer(l.timer);
        if (l.check) clearTimer(l.check);
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
    env: o.env ?? (() => toolEnv({ extra: ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "PI_CODING_AGENT_DIR", "NVM_DIR", "NPM_CONFIG_PREFIX", "GEMINI_HOME", "OAR_ANTIGRAVITY_BIN"] })),
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

/**
 * D440: install one agent and wait for it (a pasted key that needs pi): true once it is there,
 * false when the install failed or took longer than `timeoutMs`. Polls the setup's own state.
 */
export async function installAndWait(setup: Pick<AgentSetup, "install" | "state">, h: HarnessId, o: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<boolean> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const until = Date.now() + (o.timeoutMs ?? 8 * 60_000);
  setup.install([h]);
  for (;;) {
    const st = setup.state(h).setup;
    if (st?.phase === "failed") return false;
    if (!st) return true;
    if (Date.now() > until) return false;
    await sleep(o.pollMs ?? 400);
  }
}
