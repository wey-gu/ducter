// D345: put GitHub's command-line tool (gh) on the home when it isn't there, because the person
// tapped 装上 gh / Install gh in GitHub's sign-in (待办来源's 连上, New task's clone). One tap, no
// terminal, said before it happens and logged after (principle 18: the effect is the person's
// own Go; Done for you lists it).
//
// How, the least invasive way that works:
//   - a Mac with Homebrew: `brew install gh` (the person's own package manager; no administrator;
//     their terminal and every task see it; brew keeps it current);
//   - everywhere else (a Mac without Homebrew, Linux as root or not): GitHub's own gh build, pinned
//     and its SHA-256 checked, into Ducter's own folder (<data>/tools/bin/gh). No administrator, no
//     package source added, nothing outside that folder changed; deleting the folder undoes it.
//     Ducter puts that folder first on its own PATH, so its gh calls and every task's find it.
// Not taken: apt or dnf (needs root; Debian and Ubuntu ship an old gh, and the current one needs
// GitHub's apt source and key added to the system).
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GhInstallPlan } from "@ducter/protocol";
import { toolEnv } from "@ducter/protocol/src/tool-env.ts";

/** The gh Ducter downloads: GitHub CLI's own release, pinned, each archive's SHA-256 checked. */
export const GH_RELEASE = {
  version: "2.103.2",
  base: "https://github.com/cli/cli/releases/download",
  assets: {
    "darwin-arm64": { file: "gh_2.103.2_macOS_arm64.zip", sha256: "5416000f5d17580a187339e0c4068a01ca5c87f7d4fe6ca64933696f967bc418" },
    "darwin-x64": { file: "gh_2.103.2_macOS_amd64.zip", sha256: "2dc7f1fc4761f96732995f6e4f4c6b4d705f2635da4126620c8b30eaa67b9c98" },
    "linux-x64": { file: "gh_2.103.2_linux_amd64.tar.gz", sha256: "62ccf747115ddc61237efffdde66a3c8f70ba249433dc64f70801089b59c59c8" },
    "linux-arm64": { file: "gh_2.103.2_linux_arm64.tar.gz", sha256: "4c3e99a50bd8b181a3fe9d69b25dd978bac768148d88f01507c6b4d1ef61a443" },
  } as Record<string, { file: string; sha256: string }>,
};

/** Ducter's own tools folder: what it puts on the home lives here, first on its PATH. */
export const toolsBin = (dataDir: string) => join(dataDir, "tools", "bin");

/** Puts Ducter's own tools folder first on PATH (once; only when it holds something). */
export function useOwnTools(dataDir: string, env: Record<string, string | undefined> = process.env): void {
  const dir = toolsBin(dataDir);
  if (!existsSync(join(dir, "gh"))) return;
  const parts = (env.PATH ?? "").split(":").filter(Boolean);
  if (parts[0] === dir) return;
  env.PATH = [dir, ...parts.filter((p) => p !== dir)].join(":");
}

export type GhInstallResult = { ok: true; how: GhInstallPlan["how"]; where: string; version?: string } | { ok: false; how: GhInstallPlan["how"]; where: string; reason: "network" | "install" | "unsupported"; message: string };

/** The system seams (fakes in tests: never the network, never brew). */
export interface GhInstallSys {
  platform: string;
  arch: string;
  /** A command on PATH, or undefined. */
  which(cmd: string): string | undefined;
  /** Runs a command; its exit code and everything it printed. */
  exec(argv: string[], env?: Record<string, string>): Promise<{ code: number; out: string }>;
  /** Fetches a URL's bytes, telling how far it is (0–100) when the size is known. */
  download(url: string, onProgress: (pct: number) => void): Promise<Uint8Array>;
}

export interface GhInstaller {
  /** How it would be put there; undefined when this system has no build Ducter can put there. */
  plan(): GhInstallPlan | undefined;
  /** Puts it there (one at a time: a second call joins the first). */
  install(onProgress: (s: { how: GhInstallPlan["how"]; where: string; progress?: number }) => void): Promise<GhInstallResult>;
}

const NET = /could not resolve|resolve host|timed out|timeout|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|unable to connect|Failed to connect|fetch failed|socket/i;

export function realGhInstallSys(env: Record<string, string | undefined> = process.env): GhInstallSys {
  return {
    platform: process.platform,
    arch: process.arch,
    which: (cmd) => Bun.which(cmd, { PATH: env.PATH ?? "" }) ?? undefined,
    async exec(argv, extra) {
      const p = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...toolEnv({ own: /^HOMEBREW_/, inherited: env }), ...(extra ?? {}) } });
      const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
      return { code: await p.exited, out: (out + err).slice(-4000) };
    },
    async download(url, onProgress) {
      const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const total = Number(r.headers.get("content-length") ?? 0);
      const parts: Uint8Array[] = [];
      let got = 0;
      let said = -1;
      for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
        parts.push(chunk);
        got += chunk.length;
        const pct = total ? Math.min(99, Math.floor((got / total) * 100)) : -1;
        if (pct >= 0 && pct !== said) (said = pct), onProgress(pct);
      }
      const all = new Uint8Array(got);
      let at = 0;
      for (const p of parts) all.set(p, at), (at += p.length);
      return all;
    },
  };
}

export function createGhInstaller(o: { dataDir: string; sys?: GhInstallSys; env?: Record<string, string | undefined>; release?: typeof GH_RELEASE }): GhInstaller {
  const rel = o.release ?? GH_RELEASE;
  const env = o.env ?? process.env;
  const sys = o.sys ?? realGhInstallSys(env);
  const dir = toolsBin(o.dataDir);
  const asset = () => rel.assets[`${sys.platform}-${sys.arch}`];
  const brew = () => (sys.platform === "darwin" ? sys.which("brew") : undefined);
  let flight: Promise<GhInstallResult> | undefined;

  function plan(): GhInstallPlan | undefined {
    const b = brew();
    if (b) return { how: "brew", where: b.replace(/\/bin\/brew$/, "") || "Homebrew" };
    return asset() ? { how: "release", where: dir } : undefined;
  }

  async function release(onProgress: Parameters<GhInstaller["install"]>[0]): Promise<GhInstallResult> {
    const a = asset();
    const base = { how: "release" as const, where: dir };
    if (!a) return { ok: false, ...base, reason: "unsupported", message: `no gh build for ${sys.platform}-${sys.arch}` };
    onProgress({ ...base, progress: 0 });
    let bytes: Uint8Array;
    try {
      bytes = await sys.download(`${rel.base}/v${rel.version}/${a.file}`, (pct) => onProgress({ ...base, progress: pct }));
    } catch (e) {
      const m = (e as Error).message;
      return { ok: false, ...base, reason: NET.test(m) || /HTTP 5\d\d/.test(m) ? "network" : "install", message: m.slice(0, 200) };
    }
    if (createHash("sha256").update(bytes).digest("hex") !== a.sha256) return { ok: false, ...base, reason: "install", message: "the download didn't match its checksum" };
    try {
      mkdirSync(dir, { recursive: true });
      const x = join(dir, `.gh-${process.pid}-${Date.now()}`);
      mkdirSync(x, { recursive: true });
      const archive = join(x, a.file);
      writeFileSync(archive, bytes);
      const inner = `${a.file.replace(/\.(zip|tar\.gz)$/, "")}/bin/gh`;
      const t = a.file.endsWith(".zip") ? await sys.exec(["unzip", "-o", "-q", archive, inner, "-d", x]) : await sys.exec(["tar", "-xzf", archive, "-C", x, inner]);
      if (t.code !== 0 || !existsSync(join(x, inner))) {
        rmSync(x, { recursive: true, force: true });
        return { ok: false, ...base, reason: "install", message: t.out.trim().slice(0, 200) || "couldn't unpack gh" };
      }
      const tmp = join(dir, `.gh-${process.pid}.part`);
      writeFileSync(tmp, readFileSync(join(x, inner)));
      rmSync(x, { recursive: true, force: true });
      chmodSync(tmp, 0o755);
      renameSync(tmp, join(dir, "gh"));
    } catch (e) {
      return { ok: false, ...base, reason: "install", message: (e as Error).message.slice(0, 200) };
    }
    useOwnTools(o.dataDir, env);
    onProgress({ ...base, progress: 100 });
    return { ok: true, ...base, version: rel.version };
  }

  async function run(onProgress: Parameters<GhInstaller["install"]>[0]): Promise<GhInstallResult> {
    const p = plan();
    if (!p) return { ok: false, how: "release", where: dir, reason: "unsupported", message: `no gh build for ${sys.platform}-${sys.arch}` };
    if (p.how === "release") return release(onProgress);
    onProgress({ how: "brew", where: p.where });
    const r = await sys.exec([brew()!, "install", "gh"], { HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_INSTALL_CLEANUP: "1", HOMEBREW_NO_ENV_HINTS: "1", NONINTERACTIVE: "1" });
    if (r.code === 0) return { ok: true, how: "brew", where: p.where };
    // Homebrew couldn't (offline, a broken tap, a locked Cellar): GitHub's own build, into Ducter's folder.
    const viaRelease = await release(onProgress);
    if (viaRelease.ok || viaRelease.reason !== "install") return viaRelease;
    return { ...viaRelease, message: `${r.out.trim().split("\n").pop()?.slice(0, 160) ?? "brew failed"}; ${viaRelease.message}` };
  }

  return {
    plan,
    install(onProgress) {
      flight ??= run(onProgress).finally(() => (flight = undefined));
      return flight;
    },
  };
}
