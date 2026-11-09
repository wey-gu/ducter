// Which first-wave harnesses (D85) are installed and signed in on this machine, without starting
// a session or reaching a provider. Used by Your devices (devices.ts) and a worker's hello.
//   Claude Code:      `claude auth status` (JSON loggedIn), or a CLAUDE_CODE_OAUTH_TOKEN in
//                     Ducter's key file (checked on first use: research/29)
//   Codex:            `codex login status`
//   pi:               ships inside Ducter (OAR's bundled pi); signed in = a provider credential in
//                     ~/.pi/agent (auth.json, a models.json key) or a provider key pi is
//                     given (HARNESS_KEYS.pi) in the env or Ducter's key file
//   DeepSeek Harness: `dsh --version` at or above OAR's floor; signed in = a DeepSeek key in the
//                     env, Ducter's key file (<dataDir>/keys.env, D102), or DSH's own credential file
// Every probe reads presence only, never a secret's value into any output.
// D153: each installed agent also gets its version (its own --version) and how it was installed
// (`how`, from where its binary really lives; research/42).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLAUDE_TOKEN_ENV, DSH_KEY_ENV, HARNESS_KEYS, deviceHarness, type AgentHow, type DeviceHarness } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { readKeys } from "@ducter/protocol/src/keys.ts";

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
  /** D153: a binary's real path (default: the file system's), and whether a file exists. */
  realpath?: (p: string) => string;
  exists?: (p: string) => boolean;
  /** D153: the pi that ships inside Ducter, when this Ducter runs one (its version); see bundledPiVersion. */
  piBundled?: () => string | undefined;
}

// ---------- versions and how each copy was installed (D153) ----------

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
  const path = (h === "deepseek-harness" ? o.env?.OAR_DSH_BIN : undefined) || o.which(cmd);
  if (!path) return undefined;
  const r = await o.exec([path, ...HARNESS_FACTS[h].version.command.slice(1)], 15_000);
  const version = r.code === 0 ? versionIn(r.out) : undefined;
  const real = (o.realpath ?? realpathSafe)(path);
  return { ...(version ? { version } : {}), ...agentHow(h, real, o.exists), path };
}

/** OAR's floor for DeepSeek Harness (runtimes/dsh/version.ts). */
export const DSH_MIN = "0.2.1-rc.5";

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
    const status = r.code === 0 && parseJson(r.out.slice(r.out.indexOf("{"), r.out.lastIndexOf("}") + 1))?.loggedIn === true;
    return { harness: "claude-code", installed: true, loggedIn: status || has(CLAUDE_TOKEN_ENV) };
  };
  const codex = async (): Promise<RawHarness> => {
    if (!o.which("codex")) return { harness: "codex", installed: false, loggedIn: false };
    const r = await o.exec(["codex", "login", "status"], 15_000);
    return { harness: "codex", installed: true, loggedIn: r.code === 0 && /logged in/i.test(r.out) && !/not logged in/i.test(r.out) };
  };
  const pi = async (): Promise<RawHarness> => {
    const agentDir = env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
    const auth = parseJson(read(join(agentDir, "auth.json")));
    const models = parseJson(read(join(agentDir, "models.json")));
    const keyed = Object.values(models?.providers ?? {}).some((p: any) => typeof p?.apiKey === "string" && p.apiKey.length > 0);
    const loggedIn = (auth && Object.keys(auth).length > 0) || keyed || HARNESS_KEYS.pi.some(has);
    // Installed: OAR's pi runs under node, or the user's own `pi`.
    return { harness: "pi", installed: !!(o.which("node") || o.which("pi")), loggedIn: !!loggedIn };
  };
  const dsh = async (): Promise<RawHarness> => {
    const bin = env.OAR_DSH_BIN || o.which("dsh");
    if (!bin) return { harness: "deepseek-harness", installed: false, loggedIn: false };
    const v = await o.exec([bin, "--version"], 15_000);
    const version = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(v.out)?.[0];
    const ok = v.code === 0 && !!version && (compareVersions(version, DSH_MIN) ?? -1) >= 0;
    const creds = read(join(env.DSH_HOME || join(home, ".dsh"), ".credentials.yaml")) ?? "";
    const loggedIn = has(DSH_KEY_ENV) || new RegExp(`^\\s+${DSH_KEY_ENV}:\\s*\\S`, "m").test(creds);
    return { harness: "deepseek-harness", installed: ok, loggedIn: ok && loggedIn };
  };
  const probes: [string, () => Promise<RawHarness>][] = [
    ["claude-code", claude],
    ["codex", codex],
    ["pi", pi],
    ["deepseek-harness", dsh],
  ];
  // D153: an installed copy that answers --version says which version it is and how it updates.
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
