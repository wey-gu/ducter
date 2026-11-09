// Which first-wave harnesses (D85) are installed and signed in on this machine, without starting
// a session or reaching a provider. Used by Your devices (devices.ts) and a worker's hello.
//   Claude Code:      `claude auth status` (JSON loggedIn)
//   Codex:            `codex login status`
//   pi:               ships inside Ducter (OAR's bundled pi); signed in = a provider credential in
//                     ~/.pi/agent (auth.json, a models.json key) or a provider key in the env
//   DeepSeek Harness: `dsh --version` at or above OAR's floor; signed in = a DeepSeek key in the
//                     env, Ducter's env file (<dataDir>/env), or DSH's own credential file
// Every probe reads presence only, never a secret's value into any output.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DSH_KEY_ENV, PI_PROVIDER_ENV, deviceHarness, type DeviceHarness } from "@ducter/protocol";

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
}

/** Which keys a KEY=value env file sets (names only matter here). */
const envFile = (s: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of (s ?? "").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\s]*)/.exec(line);
    if (m && m[2]) out[m[1]!] = m[2];
  }
  return out;
};

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

  const claude = async (): Promise<RawHarness> => {
    if (!o.which("claude")) return { harness: "claude-code", installed: false, loggedIn: false };
    const r = await o.exec(["claude", "auth", "status"], 15_000);
    return { harness: "claude-code", installed: true, loggedIn: r.code === 0 && parseJson(r.out.slice(r.out.indexOf("{"), r.out.lastIndexOf("}") + 1))?.loggedIn === true };
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
    const loggedIn = (auth && Object.keys(auth).length > 0) || keyed || PI_PROVIDER_ENV.some((k) => !!env[k]);
    // Installed: OAR's pi runs under node, or the user's own `pi`.
    return { harness: "pi", installed: !!(o.which("node") || o.which("pi")), loggedIn: !!loggedIn };
  };
  const dsh = async (): Promise<RawHarness> => {
    const bin = env.OAR_DSH_BIN || o.which("dsh");
    if (!bin) return { harness: "deepseek-harness", installed: false, loggedIn: false };
    const v = await o.exec([bin, "--version"], 15_000);
    const version = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(v.out)?.[0];
    const ok = v.code === 0 && !!version && (compareVersions(version, DSH_MIN) ?? -1) >= 0;
    const keys = envFile(read(join(dataDir, "env")));
    const creds = read(join(env.DSH_HOME || join(home, ".dsh"), ".credentials.yaml")) ?? "";
    const loggedIn = !!env[DSH_KEY_ENV] || (typeof keys?.[DSH_KEY_ENV] === "string" && keys[DSH_KEY_ENV].length > 0) || new RegExp(`^\\s+${DSH_KEY_ENV}:\\s*\\S`, "m").test(creds);
    return { harness: "deepseek-harness", installed: ok, loggedIn: ok && loggedIn };
  };
  const probes: [string, () => Promise<RawHarness>][] = [
    ["claude-code", claude],
    ["codex", codex],
    ["pi", pi],
    ["deepseek-harness", dsh],
  ];
  return Promise.all(
    probes
      .filter(([id]) => !o.only || o.only.includes(id))
      .map(([harness, run]) => run().catch((): RawHarness => ({ harness, installed: false, loggedIn: false })).then((h) => deviceHarness(h))),
  );
}
