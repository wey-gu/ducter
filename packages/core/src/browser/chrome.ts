// Ducter's own browser on a server (D150, research/39): Chrome for Testing, installed by Ducter
// into <dataDir>/browser, started headless (new headless: the real browser, no window) with a
// persistent profile per persona, reached over CDP on 127.0.0.1 only.
//
// Install, in one tap from Devices or `ducter ability add browser`:
//   1. the Stable `chrome` build for this platform from Chrome for Testing's JSON index;
//   2. unpacked with `unzip`, else Python's zipfile (Ubuntu ships python3, not always unzip);
//   3. Linux: the system libraries in the zip's own deb.deps. As root Ducter installs the missing
//      ones with apt-get (t64 names on Ubuntu 24.04) plus CJK fonts; as a normal user it says the
//      one `sudo apt-get install` line to run;
//   4. one headless start that answers CDP, then installed.json records it.
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Env = Record<string, string | undefined>;
export type Exec = (argv: string[], opts?: { timeoutMs?: number; env?: Record<string, string> }) => Promise<{ code: number; out: string }>;

export const CFT_INDEX = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

export interface Installed {
  version: string;
  path: string; // the chrome executable
  at: string;
}

export function browserDir(dataDir: string): string {
  return join(dataDir, "browser");
}

/** Chrome for Testing's name for this platform, or undefined where it has no build. */
export function cftPlatform(platform: string = process.platform, arch: string = process.arch): string | undefined {
  if (platform === "linux") return arch === "arm64" ? "linux-arm64" : arch === "x64" ? "linux64" : undefined;
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : "mac-x64";
  return undefined;
}

/** Where the executable sits inside the unpacked zip. */
export function chromeInZip(plat: string): string {
  if (plat.startsWith("mac")) return join(`chrome-${plat}`, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  return join(`chrome-${plat}`, "chrome");
}

export function readInstalled(dataDir: string): Installed | undefined {
  try {
    const j = JSON.parse(readFileSync(join(browserDir(dataDir), "installed.json"), "utf8"));
    if (typeof j?.path === "string" && typeof j?.version === "string" && existsSync(j.path)) return j;
  } catch {
    /* none */
  }
  return undefined;
}

export interface FindOptions {
  env?: Env;
  which?: (cmd: string) => string | null;
  platform?: string;
}

/**
 * The Chrome Ducter's browser runs on: DUCTER_CHROME (a path), else the one Ducter installed,
 * else on Linux a system Chrome or Chromium on PATH (not a snap: its confinement keeps the
 * profile out of Ducter's data folder).
 */
export function findChrome(dataDir: string, o: FindOptions = {}): { path: string; version?: string; source: "env" | "ducter" | "system" } | undefined {
  const env = o.env ?? process.env;
  const pinned = env.DUCTER_CHROME?.trim();
  if (pinned) return existsSync(pinned) ? { path: pinned, source: "env" } : undefined;
  const mine = readInstalled(dataDir);
  if (mine) return { path: mine.path, version: mine.version, source: "ducter" };
  if ((o.platform ?? process.platform) !== "linux") return undefined;
  const which = o.which ?? ((c: string) => Bun.which(c));
  for (const name of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
    const p = which(name);
    if (p && !p.startsWith("/snap/")) return { path: p, source: "system" };
  }
  return undefined;
}

const defaultExec: Exec = async (argv, opts = {}) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, ...opts.env } });
    const timer = setTimeout(() => p.kill(), opts.timeoutMs ?? 120_000);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { code, out: [out.trim(), err.trim()].filter(Boolean).join("\n") };
  } catch (e) {
    return { code: -1, out: (e as Error).message };
  }
};

/** deb.deps lines → package names: versions dropped, the first of alternatives, no wget/xdg-utils. */
export function debPackages(debDeps: string): string[] {
  const skip = new Set(["wget", "xdg-utils", "libc6", "ca-certificates"]);
  return debDeps
    .split("\n")
    .map((l) => l.split("|")[0]!.replace(/\(.*?\)/g, "").trim())
    .filter((n) => n && !skip.has(n));
}

/** Libraries `ldd` can't find for the executable (empty: it can start). */
export async function missingLibs(chrome: string, exec: Exec = defaultExec): Promise<string[]> {
  const r = await exec(["ldd", chrome], { timeoutMs: 20_000 });
  if (r.code !== 0 && !r.out) return [];
  return r.out
    .split("\n")
    .filter((l) => /not found/.test(l))
    .map((l) => l.trim().split(/\s/)[0]!)
    .filter(Boolean);
}

/** Ubuntu 24.04 renamed some libraries for 64-bit time (libasound2 → libasound2t64): pick what apt has. */
export async function aptNames(pkgs: string[], exec: Exec = defaultExec): Promise<string[]> {
  const out: string[] = [];
  for (const p of pkgs) {
    const t64 = `${p}t64`;
    const has = await exec(["apt-cache", "show", "--no-all-versions", t64], { timeoutMs: 20_000 });
    out.push(has.code === 0 && has.out.includes(`Package: ${t64}`) ? t64 : p);
  }
  return out;
}

export type InstallStep = "download" | "unpack" | "libraries" | "check";

export type InstallResult =
  | { ok: true; version: string; path: string; installedLibs?: string[] }
  | { ok: false; reason: "deps"; command: string; missing: string[]; version: string; path: string }
  | { ok: false; reason: "failed"; message: string };

export interface InstallOptions {
  dataDir: string;
  platform?: string;
  arch?: string;
  fetch?: typeof fetch;
  exec?: Exec;
  /** Running as root (installs system libraries itself). */
  root?: boolean;
  /** The start check (default: launch headless once and ask CDP for its version). */
  check?: (chrome: string) => Promise<string | undefined>;
  onStep?: (s: InstallStep) => void;
}

/** Unpack a zip into dir: unzip, else python3's zipfile (then mark the files executable, which zipfile drops). */
async function unpack(zip: string, dir: string, exec: Exec): Promise<boolean> {
  if ((await exec(["unzip", "-q", "-o", zip, "-d", dir], { timeoutMs: 300_000 })).code === 0) return true;
  if ((await exec(["python3", "-I", "-m", "zipfile", "-e", zip, dir], { timeoutMs: 300_000 })).code !== 0) return false;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else chmodSync(p, 0o755);
    }
  };
  walk(dir);
  return true;
}

/** Install (or reinstall) Chrome for Testing for this machine. Never touches another Chrome. */
export async function installChrome(o: InstallOptions): Promise<InstallResult> {
  const plat = cftPlatform(o.platform, o.arch);
  if (!plat) return { ok: false, reason: "failed", message: `Chrome for Testing has no build for ${o.platform ?? process.platform}/${o.arch ?? process.arch}` };
  const exec = o.exec ?? defaultExec;
  const get = o.fetch ?? fetch;
  const dir = browserDir(o.dataDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let version: string;
  let url: string;
  o.onStep?.("download");
  try {
    const idx = (await (await get(CFT_INDEX)).json()) as any;
    const stable = idx?.channels?.Stable;
    version = String(stable?.version ?? "");
    url = (stable?.downloads?.chrome as { platform: string; url: string }[] | undefined)?.find((d) => d.platform === plat)?.url ?? "";
    if (!version || !url) throw new Error(`no Stable chrome for ${plat} in the index`);
  } catch (e) {
    return { ok: false, reason: "failed", message: `couldn't read Chrome for Testing's index: ${(e as Error).message}` };
  }
  const target = join(dir, version);
  const chrome = join(target, chromeInZip(plat));
  if (!existsSync(chrome)) {
    const zip = join(dir, `chrome-${plat}-${version}.zip`);
    try {
      const res = await get(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await Bun.write(zip, res);
    } catch (e) {
      return { ok: false, reason: "failed", message: `couldn't download Chrome ${version}: ${(e as Error).message}` };
    }
    o.onStep?.("unpack");
    const tmp = `${target}.part`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    if (!(await unpack(zip, tmp, exec))) {
      rmSync(tmp, { recursive: true, force: true });
      return { ok: false, reason: "failed", message: "couldn't unpack Chrome: install unzip or python3" };
    }
    rmSync(target, { recursive: true, force: true });
    renameSync(tmp, target);
    rmSync(zip, { force: true });
    if (!existsSync(chrome)) return { ok: false, reason: "failed", message: `the Chrome ${version} zip has no ${chromeInZip(plat)}` };
  }
  let installedLibs: string[] | undefined;
  if (plat.startsWith("linux")) {
    o.onStep?.("libraries");
    const missing = await missingLibs(chrome, exec);
    if (missing.length) {
      const depsFile = join(target, `chrome-${plat}`, "deb.deps");
      const pkgs = existsSync(depsFile) ? debPackages(readFileSync(depsFile, "utf8")) : ["libnss3", "libgbm1", "libatk-bridge2.0-0", "libcups2", "libxkbcommon0", "libasound2"];
      const names = await aptNames(pkgs, exec);
      const fonts = ["fonts-liberation", "fonts-noto-cjk"];
      const all = [...new Set([...names, ...fonts])];
      if (!o.root) {
        return { ok: false, reason: "deps", command: `sudo apt-get install -y --no-install-recommends ${all.join(" ")}`, missing, version, path: chrome };
      }
      const env = { DEBIAN_FRONTEND: "noninteractive" };
      await exec(["apt-get", "update", "-q"], { timeoutMs: 300_000, env });
      const r = await exec(["apt-get", "install", "-y", "-q", "--no-install-recommends", ...all], { timeoutMs: 600_000, env });
      if (r.code !== 0) return { ok: false, reason: "failed", message: `apt-get couldn't install Chrome's libraries: ${r.out.split("\n").slice(-3).join(" ")}` };
      installedLibs = all;
      const still = await missingLibs(chrome, exec);
      if (still.length) return { ok: false, reason: "failed", message: `Chrome still lacks ${still.join(", ")}` };
    }
  }
  o.onStep?.("check");
  const answered = await (o.check ?? ((p: string) => checkChrome(p, o.dataDir)))(chrome);
  if (!answered) return { ok: false, reason: "failed", message: `Chrome ${version} didn't start headless here` };
  const rec: Installed = { version, path: chrome, at: new Date().toISOString() };
  writeFileSync(join(dir, "installed.json"), JSON.stringify(rec, null, 2) + "\n", { mode: 0o600 });
  // Older versions Ducter installed before: gone, once this one answers.
  for (const f of readdirSync(dir)) if (f !== version && /^\d+\.\d+\.\d+\.\d+$/.test(f)) rmSync(join(dir, f), { recursive: true, force: true });
  return { ok: true, version, path: chrome, ...(installedLibs ? { installedLibs } : {}) };
}

/** The user agent a normal Chrome of this major version sends here, without new headless's "HeadlessChrome". */
export function plainUserAgent(version: string, platform: string = process.platform, arch: string = process.arch): string {
  const major = version.split(".")[0] || "157";
  const os = platform === "darwin" ? "Macintosh; Intel Mac OS X 10_15_7" : platform === "win32" ? "Windows NT 10.0; Win64; x64" : arch === "arm64" ? "X11; Linux aarch64" : "X11; Linux x86_64";
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export interface LaunchOptions {
  chrome: string;
  profileDir: string;
  version?: string;
  lang?: string;
  width?: number;
  height?: number;
  root?: boolean;
  platform?: string;
  /** Show a window (debugging on a Mac); default headless. */
  headed?: boolean;
  /** More flags (DUCTER_CHROME_FLAGS: demos and tests, e.g. --host-resolver-rules). */
  extra?: string[];
}

/** Chrome's flags for Ducter's browser. Everything on 127.0.0.1; nothing syncs or phones home. */
export function chromeArgs(o: LaunchOptions): string[] {
  const args = [
    o.headed ? "" : "--headless=new",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${o.profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--disable-sync",
    "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
    "--disable-background-networking",
    "--metrics-recording-only",
    `--window-size=${o.width ?? 1280},${o.height ?? 800}`,
    `--lang=${o.lang ?? "en-US"}`,
    ...(o.version ? [`--user-agent=${plainUserAgent(o.version, o.platform)}`] : []),
    ...((o.platform ?? process.platform) === "darwin" ? ["--use-mock-keychain"] : []),
    // Chrome refuses to run as root with its sandbox; Ducter run as a normal user keeps it.
    ...(o.root ? ["--no-sandbox"] : []),
    ...(o.extra ?? []),
    "about:blank",
  ];
  return args.filter(Boolean);
}

export interface Launched {
  proc: ReturnType<typeof Bun.spawn>;
  wsUrl: string;
}

/**
 * A Ducter browser left running on this profile by a Ducter that didn't stop cleanly (a crash, a
 * kill -9) holds the profile, and a new Chrome on it exits at once. Chrome's SingletonLock names
 * its pid ("<host>-<pid>"); when that process is a Chrome on this very profile, quit it.
 */
export async function quitStale(profileDir: string, exec: Exec = defaultExec): Promise<boolean> {
  let target: string;
  try {
    target = readlinkSync(join(profileDir, "SingletonLock"));
  } catch {
    return false;
  }
  const pid = Number(target.split("-").pop());
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false;
  const ps = await exec(["ps", "-o", "command=", "-p", String(pid)], { timeoutMs: 5_000 });
  if (ps.code !== 0 || !ps.out.includes(`--user-data-dir=${profileDir}`)) return false;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }
  for (let i = 0; i < 50; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await Bun.sleep(100);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* gone */
  }
  return true;
}

/** Start Chrome on a profile and wait for its DevTools endpoint (a fresh DevToolsActivePort). */
export async function launchChrome(o: LaunchOptions, timeoutMs = 20_000): Promise<Launched> {
  mkdirSync(o.profileDir, { recursive: true, mode: 0o700 });
  await quitStale(o.profileDir);
  const portFile = join(o.profileDir, "DevToolsActivePort");
  rmSync(portFile, { force: true });
  // Chrome's own messages go beside the profile (a file, so a full pipe never stalls it).
  const proc = Bun.spawn([o.chrome, ...chromeArgs(o)], { stdout: "ignore", stderr: Bun.file(`${o.profileDir}.log`), stdin: "ignore" });
  const until = Date.now() + timeoutMs;
  const { parseActivePort } = await import("./cdp.ts");
  while (Date.now() < until) {
    if (proc.exitCode !== null) {
      throw new Error(`Chrome exited (${proc.exitCode}) before it opened its DevTools port`);
    }
    if (existsSync(portFile)) {
      const url = parseActivePort(readFileSync(portFile, "utf8"));
      if (url) return { proc, wsUrl: url };
    }
    await Bun.sleep(100);
  }
  proc.kill();
  throw new Error("Chrome didn't open its DevTools port in time");
}

/** One headless start on a throwaway profile: the version CDP answers, or undefined. */
export async function checkChrome(chrome: string, dataDir: string, platform: string = process.platform): Promise<string | undefined> {
  const profileDir = join(browserDir(dataDir), "check-profile");
  rmSync(profileDir, { recursive: true, force: true });
  let launched: Launched | undefined;
  try {
    launched = await launchChrome({ chrome, profileDir, platform, root: process.getuid?.() === 0 });
    const { connectCdp } = await import("./cdp.ts");
    const cdp = await connectCdp(launched.wsUrl);
    const v = await cdp?.send("Browser.getVersion").catch(() => undefined);
    await cdp?.send("Browser.close").catch(() => {});
    cdp?.close();
    return v?.product ? String(v.product) : undefined;
  } catch {
    return undefined;
  } finally {
    launched?.proc.kill();
    await launched?.proc.exited;
    rmSync(profileDir, { recursive: true, force: true });
  }
}
