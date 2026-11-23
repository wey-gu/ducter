// Which first-wave harnesses (D85) are installed and signed in on this machine, without starting
// a session or reaching a provider. Used by Your devices (devices.ts) and a worker's hello.
//   Claude Code:      `claude auth status` (JSON loggedIn), or a CLAUDE_CODE_OAUTH_TOKEN in
//                     Ducter's key file (checked on first use: research/29)
//   Codex:            `codex login status`
//   pi:               ships inside Ducter (OAR's bundled pi); signed in = a provider credential in
//                     ~/.pi/agent (auth.json, a models.json key) or a provider key pi is
//                     given (HARNESS_KEYS.pi) in the env or Ducter's key file
//   DeepSeek Harness: `dsh --version` at or above OAR's floor; signed in = a DeepSeek key in the
//                     env, Ducter's key file (<dataDir>/keys.env, D102), or DSH's own credential file,
//                     or (D371) the DeepSeek account its desktop app signed in with
//   Antigravity:      (D416) `agy --version` at or above OAR's floor (OAR_ANTIGRAVITY_BIN, else `agy`
//                     on PATH, else ~/.local/bin/agy, as OAR looks); signed in = `agy models`
//                     answers (agy's own check, a remote call); a copy too old, one that doesn't
//                     answer, or only the desktop app is said as `trouble`
// Every probe reads presence only, never a secret's value into any output. D503: Claude Code and
// Codex also say whose account it is, kept only as a fingerprint (accountPrint).
// D156: each installed agent also gets its version (its own --version) and how it was installed
// (`how`, from where its binary really lives; research/42).
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLAUDE_TOKEN_ENV, DSH_KEY_ENV, HARNESS_KEYS, deviceHarness, type AgentHow, type DeviceHarness } from "@ducter/protocol";
import { ANTIGRAVITY, HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { readKeys } from "@ducter/protocol/src/keys.ts";
import { dshCredentialsFile, dshSignIns } from "@ducter/protocol/src/dsh.ts";

type RawHarness = Omit<DeviceHarness, "canBePartner">;

export type ProbeExec = (argv: string[], timeoutMs?: number) => Promise<{ code: number; out: string }>;

export interface HarnessProbeEnv {
  exec: ProbeExec;
  which: (cmd: string) => string | null;
  env?: Record<string, string | undefined>;
  home?: string;
  dataDir?: string;
  read?: (path: string) => string | undefined;
  /** Probe only these (the rest are left out of the answer). */
  only?: readonly string[];
  /** D156: a binary's real path (default: the file system's), and whether a file exists. */
  realpath?: (p: string) => string;
  exists?: (p: string) => boolean;
  /** D156: the pi that ships inside Ducter, when this Ducter runs one (its version); see bundledPiVersion. */
  piBundled?: () => string | undefined;
  /** D416: a link that is there but points at nothing (default: the file system's). */
  dangling?: (p: string) => boolean;
  /** D416: where a Mac's apps are (default /Applications and ~/Applications). */
  apps?: string[];
}

// ---------- versions and how each copy was installed (D156) ----------

/** One AI agent's copy on this machine: its version, how it was installed, and where. */
export interface AgentInstall {
  version?: string;
  how: AgentHow;
  /** The command as found on PATH (what an update and a re-probe run). */
  path?: string;
  /** npm: the prefix the package lives under (`npm --prefix`), so the same copy is updated. */
  prefix?: string;
  /** app: whose app carries it ("Codex", "Claude"). */
  app?: string;
}

const VERSION_RE = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;

/** A version out of an agent's --version output ("codex-cli 0.167.0", "2.1.321 (Claude Code)"). */
export function versionIn(out: string): string | undefined {
  return VERSION_RE.exec(out)?.[1];
}

/**
 * How a copy was installed, from where its binary really lives (research/42 §5). A desktop app's
 * copy first (never touched), then Homebrew, the agent's own installer, a global npm package; a
 * pnpm, yarn or bun global, or anything else, is unknown and never updated.
 */
export function agentHow(h: HarnessId, realPath: string, exists: (p: string) => boolean = existsSync): { how: AgentHow; prefix?: string; app?: string } {
  const ch = HARNESS_FACTS[h].channels.value;
  const p = realPath.replace(/\\/g, "/");
  if (ch.app && ch.app.marks.some((m) => p.includes(m))) return { how: "app", app: ch.app.name };
  if (/\/(Caskroom|Cellar)\//.test(p)) return ch.cask ? { how: "brew" } : { how: "unknown" };
  const mark = ch.installer?.mark;
  if (mark?.startsWith("file:")) {
    const name = mark.slice(5);
    let dir = dirname(p);
    for (let i = 0; i < 8 && dir !== dirname(dir); i++, dir = dirname(dir)) if (exists(join(dir, name))) return { how: "installer" };
  } else if (mark && p.includes(mark)) return { how: "installer" };
  if (ch.npm && p.includes(`/node_modules/${ch.npm}/`)) {
    if (/\/\.?pnpm\/|\/\.bun\/install\/global\/|\/\.?yarn\//.test(p)) return { how: "unknown" };
    const m = /^(.*)\/lib\/node_modules\//.exec(p);
    return { how: "npm", ...(m ? { prefix: m[1] } : {}) };
  }
  return { how: "unknown" };
}

const realpathSafe = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * The pi inside Ducter (OAR's bundled pi), when Ducter runs from a checkout: its version. The
 * single binary has no node_modules on disk and runs the user's own pi (runner/src/oar.ts).
 */
export function bundledPiVersion(): string | undefined {
  if (import.meta.url.includes("$bunfs") || import.meta.path.includes("$bunfs")) return undefined;
  try {
    const oar = Bun.resolveSync("@botiverse/oar/runtimes/pi", join(import.meta.dir, "../../runner"));
    const pkg = Bun.resolveSync("@earendil-works/pi-coding-agent/package.json", dirname(oar));
    const v = JSON.parse(readFileSync(pkg, "utf8"))?.version;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** One agent's copy on this machine, or undefined when it isn't on PATH. */
export async function detectAgent(h: HarnessId, o: Pick<HarnessProbeEnv, "exec" | "which" | "env" | "realpath" | "exists" | "piBundled">): Promise<AgentInstall | undefined> {
  if (h === "pi") {
    const v = o.piBundled?.();
    if (v) return { version: v, how: "ducter" };
  }
  const cmd = HARNESS_FACTS[h].version.command[0]!;
  const path = h === "antigravity" ? agyPaths(o)[0] : (h === "deepseek-harness" ? o.env?.OAR_DSH_BIN : undefined) || o.which(cmd);
  if (!path) return undefined;
  const r = await o.exec([path, ...HARNESS_FACTS[h].version.command.slice(1)], 15_000);
  const version = r.code === 0 ? versionIn(r.out) : undefined;
  const real = (o.realpath ?? realpathSafe)(path);
  return { ...(version ? { version } : {}), ...agentHow(h, real, o.exists), path };
}

/** OAR's floor for DeepSeek Harness (runtimes/dsh/version.ts). */
export const DSH_MIN = "0.2.1-rc.5";

/**
 * D416: where agy may be, in OAR's order (runtimes/antigravity/installation.js): the override
 * alone when set; else `agy` on PATH, then the official installer's ~/.local/bin/agy (OAR falls
 * back to it when the PATH copy is too old, so both are looked at).
 */
export function agyPaths(o: { which: (cmd: string) => string | null; env?: Record<string, string | undefined>; home?: string; exists?: (p: string) => boolean }): string[] {
  const pinned = o.env?.OAR_ANTIGRAVITY_BIN;
  if (pinned) return [pinned];
  const official = join(o.home ?? o.env?.HOME ?? homedir(), ...ANTIGRAVITY.bin);
  const onPath = o.which("agy");
  return [...new Set([onPath, (o.exists ?? existsSync)(official) ? official : null].filter((p): p is string => !!p))];
}

/** D416: agy's own version line: a bare stable release, as OAR accepts it (prereleases are refused). */
export function agyVersion(out: string): string | undefined {
  return /^(\d+\.\d+\.\d+)$/.exec(out.trim())?.[1];
}

const danglingLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink() && !existsSync(p);
  } catch {
    return false;
  }
};

const readSafe = (p: string) => {
  try {
    return existsSync(p) ? readFileSync(p, "utf8") : undefined;
  } catch {
    return undefined;
  }
};
const parseJson = (s: string | undefined): any => {
  try {
    return s ? JSON.parse(s) : undefined;
  } catch {
    return undefined;
  }
};

/** semver compare with prereleases (0.2.1-rc.5 < 0.2.1); null when either is not a version. */
export function compareVersions(a: string, b: string): number | null {
  const re = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;
  const x = re.exec(a.trim());
  const y = re.exec(b.trim());
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  if (!x[4] || !y[4]) return x[4] ? -1 : y[4] ? 1 : 0;
  const px = x[4].split("."), py = y[4].split(".");
  for (let i = 0; i < Math.max(px.length, py.length); i++) {
    if (px[i] === undefined) return -1;
    if (py[i] === undefined) return 1;
    const nx = /^\d+$/.test(px[i]!) ? Number(px[i]) : NaN, ny = /^\d+$/.test(py[i]!) ? Number(py[i]) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (px[i] !== py[i]) return px[i]! < py[i]! ? -1 : 1;
  }
  return 0;
}

/**
 * D503 (research/219): a short fingerprint of the account an agent is signed in to, from what the
 * agent itself says (Claude Code's email and org, Codex's account id). Two computers with the same
 * fingerprint share one usage limit; the parts themselves are never kept or sent.
 */
export function accountPrint(harness: string, parts: unknown[]): string | undefined {
  const said = parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").map((p) => p.trim().toLowerCase());
  if (!said.length) return undefined;
  return createHash("sha256").update([harness, ...said].join("\u0000")).digest("hex").slice(0, 12);
}

export async function probeHarnesses(o: HarnessProbeEnv): Promise<DeviceHarness[]> {
  const env = o.env ?? process.env;
  const home = o.home ?? homedir();
  const read = o.read ?? readSafe;
  const dataDir = o.dataDir ?? env.DUCTER_DATA_DIR ?? join(home, ".ducter");
  const keys = readKeys(dataDir, read);
  const has = (k: string) => !!env[k] || !!keys[k];

  const claude = async (): Promise<RawHarness> => {
    if (!o.which("claude")) return { harness: "claude-code", installed: false, loggedIn: false };
    const r = await o.exec(["claude", "auth", "status"], 15_000);
    const json = r.code === 0 ? parseJson(r.out.slice(r.out.indexOf("{"), r.out.lastIndexOf("}") + 1)) : undefined;
    const status = json?.loggedIn === true;
    // D503 (research/219): who is signed in, as a fingerprint only (the email never leaves here).
    const account = status ? accountPrint("claude-code", [json.email, json.orgId]) : undefined;
    return { harness: "claude-code", installed: true, loggedIn: status || has(CLAUDE_TOKEN_ENV), ...(account ? { account } : {}) };
  };
  const codex = async (): Promise<RawHarness> => {
    if (!o.which("codex")) return { harness: "codex", installed: false, loggedIn: false };
    const r = await o.exec(["codex", "login", "status"], 15_000);
    const loggedIn = r.code === 0 && /logged in/i.test(r.out) && !/not logged in/i.test(r.out);
    // D503: `codex login status` names no account; its auth file's account id does (no token is read out).
    const account = loggedIn ? accountPrint("codex", [parseJson(read(join(env[HARNESS_FACTS.codex.account?.value.homeEnv ?? "CODEX_HOME"] || join(home, ".codex"), "auth.json")))?.tokens?.account_id]) : undefined;
    return { harness: "codex", installed: true, loggedIn, ...(account ? { account } : {}) };
  };
  const pi = async (): Promise<RawHarness> => {
    const agentDir = env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
    const auth = parseJson(read(join(agentDir, "auth.json")));
    const models = parseJson(read(join(agentDir, "models.json")));
    const keyed = Object.values(models?.providers ?? {}).some((p: any) => typeof p?.apiKey === "string" && p.apiKey.length > 0);
    const loggedIn = (auth && Object.keys(auth).length > 0) || keyed || HARNESS_KEYS.pi.some(has);
    // Installed: the user's own `pi`, or OAR's bundled pi under node, which only a Ducter run from
    // a checkout has (piBundled); the single binary runs the user's pi (runner oar.ts). D363: node
    // alone on a server is not pi (it showed a pi that couldn't run).
    return { harness: "pi", installed: !!(o.which("pi") || (o.which("node") && o.piBundled?.() !== undefined)), loggedIn: !!loggedIn };
  };
  const dsh = async (): Promise<RawHarness> => {
    const bin = env.OAR_DSH_BIN || o.which("dsh");
    if (!bin) return { harness: "deepseek-harness", installed: false, loggedIn: false };
    const v = await o.exec([bin, "--version"], 15_000);
    const version = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(v.out)?.[0];
    const ok = v.code === 0 && !!version && (compareVersions(version, DSH_MIN) ?? -1) >= 0;
    // D371: its own credential file (the CLI and the desktop app share it): a key, or the app's
    // DeepSeek account sign-in, which runs on the account route (dsh.ts).
    const own = dshSignIns(read(dshCredentialsFile(env, home)));
    const loggedIn = has(DSH_KEY_ENV) || own.key || own.account;
    return { harness: "deepseek-harness", installed: ok, loggedIn: ok && loggedIn };
  };
  // D416: agy, as OAR would pick it: the first copy that answers at or above OAR's floor.
  const agy = async (): Promise<RawHarness> => {
    const exists = o.exists ?? existsSync;
    let trouble: RawHarness["trouble"];
    let old: string | undefined;
    for (const bin of agyPaths({ which: o.which, env, home, exists })) {
      const v = await o.exec([bin, "--version"], 30_000);
      const version = v.code === 0 ? agyVersion(v.out) : undefined;
      if (!version) {
        trouble ??= { kind: "broken" };
        continue;
      }
      if ((compareVersions(version, ANTIGRAVITY.minVersion) ?? -1) < 0) {
        (trouble = { kind: "too_old", need: ANTIGRAVITY.minVersion }), (old ??= version);
        continue;
      }
      // Signed in: agy's own `agy models` (a remote call; OAR's authStatus reads the same). It says
      // "Please sign in" when it isn't; anything else (no network) falls back to its token file.
      const m = await o.exec([bin, "models"], 20_000);
      const loggedIn = m.code === 0 || (!ANTIGRAVITY.signedOut.test(m.out) && exists(join(env.GEMINI_HOME || join(home, ".gemini"), ...ANTIGRAVITY.token.slice(1))));
      return { harness: "antigravity", installed: true, loggedIn };
    }
    if (!trouble) {
      // Only the desktop app, or the link an older app left behind (pointing at nothing now).
      const apps = o.apps ?? ["/Applications", join(home, "Applications")];
      const app = apps.map((d) => join(d, ANTIGRAVITY.app)).find((p) => exists(p));
      const link = (o.dangling ?? danglingLink)(join(home, ...ANTIGRAVITY.appLinks));
      if (app || link) trouble = { kind: "app_only", app: "Antigravity" };
    }
    return { harness: "antigravity", installed: false, loggedIn: false, ...(trouble ? { trouble } : {}), ...(old ? { version: old } : {}) };
  };
  const probes: [string, () => Promise<RawHarness>][] = [
    ["claude-code", claude],
    ["codex", codex],
    ["pi", pi],
    ["deepseek-harness", dsh],
    ["antigravity", agy],
  ];
  // D156: an installed copy that answers --version says which version it is and how it updates.
  const withVersion = async (h: RawHarness): Promise<RawHarness> => {
    if (!h.installed) return h;
    const a = await detectAgent(h.harness as HarnessId, { ...o, env }).catch(() => undefined);
    return a?.version ? { ...h, version: a.version, how: a.how } : h;
  };
  return Promise.all(
    probes
      .filter(([id]) => !o.only || o.only.includes(id))
      .map(([harness, run]) =>
        run()
          .catch((): RawHarness => ({ harness, installed: false, loggedIn: false }))
          .then(withVersion)
          .then((h) => deviceHarness(h)),
      ),
  );
}
