// Updating Ducter in place (D148, design/system.md "Updating in place"). One code path for the
// home, a worker and `ducter update`:
//
//   stage:   download ducter-<v>-linux-<arch>.tar.gz + SHA256SUMS.txt from the official release
//            (HTTPS, GitHub's hosts only) → the SHA-256 must match → unpack → self-check the new
//            binary (--version names <v>; doctor --json prints its checks)
//   swap:    keep the running binary as ducter.prev beside it, move the new one in by rename
//   finish:  (a helper outside the service, so a restart doesn't kill it) restart the service,
//            wait ≤ 3 min for the new one to be healthy, else put ducter.prev back and restart
//            again; write updates/result.json. The restarted Ducter is already up by then, so
//            it reads the file again when it changes (updates.ts) and judges it against the
//            version it runs (judgeResult): never "didn't update" while it runs the target.
//
// Every side effect goes through UpdateSys, so tests drive it with fakes (no network, no
// systemctl). A Linux end-to-end needs a real systemd box.
import { accessSync, chmodSync, constants, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { UpdateHow, UpdatePhase, UpdateReason } from "@ducter/protocol";
import { compareVersions, isVersion } from "@ducter/protocol/src/version.ts";
import { REPO, type Fetch } from "./release.ts";

export const UNIT = "ducter.service";
/** How long the helper waits for the restarted Ducter: a first start on a big Log or a cold disk can take a minute. */
export const HEALTH_WAIT_MS = 180_000;
/** Free space wanted in the staging folder: three times the download, and never under 300 MB. */
export const MIN_FREE_BYTES = 300 * 1024 * 1024;

export interface RunResult {
  code: number;
  out: string;
}

export interface UpdateSys {
  fetch: Fetch;
  run(argv: string[], o?: { timeoutMs?: number; env?: Record<string, string> }): Promise<RunResult>;
  /** Free bytes on the volume holding dir; undefined when it can't tell. */
  freeBytes(dir: string): number | undefined;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export const realSys: UpdateSys = {
  fetch: (u, i) => fetch(u, i),
  async run(argv, o = {}) {
    try {
      const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: o.env ? { ...process.env, ...o.env } : process.env });
      const timer = setTimeout(() => p.kill(), o.timeoutMs ?? 30_000);
      const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      clearTimeout(timer);
      return { code, out: [out.trim(), err.trim()].filter(Boolean).join("\n") };
    } catch (err) {
      return { code: -1, out: (err as Error).message };
    }
  },
  freeBytes(dir) {
    try {
      const s = statfsSync(dir);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      return undefined;
    }
  },
  sleep: (ms) => Bun.sleep(ms),
  now: () => Date.now(),
};

/** How this ducter is updated (D148 (2)). */
export function updateHow(o: { compiled: boolean; platform: string; execPath: string }): UpdateHow {
  if (!o.compiled) return "source";
  if (o.platform === "darwin") return /\.app\/Contents\//.test(o.execPath) ? "app" : "source";
  return o.platform === "linux" ? "self" : "source";
}

export const linuxArch = (arch: string) => (arch === "arm64" || arch === "aarch64" ? "arm64" : "x64");
/** The release's file for this machine. Must match .github/workflows/release.yml (install-sh.test.ts). */
export const assetName = (version: string, arch: string) => `ducter-${version}-linux-${linuxArch(arch)}.tar.gz`;
export const downloadBase = (version: string) => `https://github.com/${REPO}/releases/download/v${version}`;

/** Only GitHub's own hosts, over HTTPS (a download is redirected to its storage host). */
export function officialUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return h === "github.com" || h === "objects.githubusercontent.com" || h === "release-assets.githubusercontent.com" || h.endsWith(".githubusercontent.com");
}

/** The sum SHA256SUMS.txt lists for name (sha256sum's "<hex>  <name>" lines). */
export function sumFor(listing: string, name: string): string | undefined {
  for (const line of listing.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (m && m[2] === name) return m[1]!.toLowerCase();
  }
}

export type Fail = { ok: false; reason: UpdateReason; detail?: string };
export type Phase = (phase: UpdatePhase, progress?: number) => void;

export interface StageInput {
  dataDir: string;
  current: string;
  to: string;
  arch: string;
  /** An explicit version (--to): going back is allowed. */
  explicit?: boolean;
  /** Tests and a local mirror: where the release's files are (http://127.0.0.1 only). */
  base?: string;
  onPhase?: Phase;
}

const fail = (reason: UpdateReason, detail?: string): Fail => ({ ok: false, reason, ...(detail ? { detail } : {}) });

/** Refuses what must never happen before anything is downloaded. */
export function precheck(i: { current: string; to: string; explicit?: boolean }): Fail | undefined {
  if (!isVersion(i.to)) return fail("no_release", `${i.to} isn't a version`);
  const c = compareVersions(i.to, i.current);
  if (c === 0 && !i.explicit) return fail("no_release", `already on ${i.current}`);
  if (c < 0 && !i.explicit) return fail("downgrade", `${i.to} is older than ${i.current}; say --to ${i.to} to go back`);
}

async function getChecked(sys: UpdateSys, url: string, base: string | undefined): Promise<Response> {
  const local = base && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
  if (!local && !officialUrl(url)) throw new Error(`refused ${url}: not an official GitHub release file`);
  const r = await sys.fetch(url, { headers: { "user-agent": "ducter-updater" }, signal: AbortSignal.timeout(10 * 60_000) });
  if (!local && r.url && !officialUrl(r.url)) throw new Error(`refused a redirect to ${r.url}`);
  return r;
}

/**
 * Downloads, checks and unpacks a release, and self-checks the new binary. Nothing outside
 * <dataDir>/updates/<v>/ is touched; on any failure that folder is removed.
 */
export async function stage(sys: UpdateSys, i: StageInput): Promise<{ ok: true; binary: string; dir: string } | Fail> {
  const pre = precheck(i);
  if (pre) return pre;
  const dir = join(i.dataDir, "updates", i.to);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const bail = (f: Fail) => (rmSync(dir, { recursive: true, force: true }), f);
  const free = sys.freeBytes(dir);
  if (free !== undefined && free < MIN_FREE_BYTES) return bail(fail("disk", `${Math.round(free / 1e6)} MB free`));

  i.onPhase?.("downloading", 0);
  const name = assetName(i.to, i.arch);
  const base = (i.base ?? downloadBase(i.to)).replace(/\/+$/, "");
  let want: string | undefined;
  try {
    const r = await getChecked(sys, `${base}/SHA256SUMS.txt`, i.base);
    if (r.status === 404) return bail(fail("no_asset", "the release has no SHA256SUMS.txt"));
    if (!r.ok) return bail(fail("network", `SHA256SUMS.txt: ${r.status}`));
    want = sumFor(await r.text(), name);
  } catch (err) {
    return bail(fail(/refused/.test(String(err)) ? "failed" : "network", (err as Error).message));
  }
  if (!want) return bail(fail("no_asset", `SHA256SUMS.txt doesn't list ${name}`));

  const tarball = join(dir, name);
  const hash = createHash("sha256");
  try {
    const r = await getChecked(sys, `${base}/${name}`, i.base);
    if (r.status === 404) return bail(fail("no_asset", `${name} isn't in the release`));
    if (!r.ok || !r.body) return bail(fail("network", `${name}: ${r.status}`));
    const size = Number(r.headers.get("content-length") ?? 0);
    if (size && free !== undefined && free < size * 3) return bail(fail("disk", `${Math.round(free / 1e6)} MB free, ${Math.round((size * 3) / 1e6)} MB wanted`));
    const out = Bun.file(tarball).writer();
    let got = 0;
    let shown = 0;
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      out.write(chunk);
      got += chunk.byteLength;
      if (size && got / size - shown >= 0.05) i.onPhase?.("downloading", (shown = got / size));
    }
    await out.end();
  } catch (err) {
    return bail(fail("network", (err as Error).message));
  }

  i.onPhase?.("verifying");
  const sum = hash.digest("hex");
  if (sum !== want) return bail(fail("checksum", `${name}: ${sum.slice(0, 12)}…, the release lists ${want.slice(0, 12)}…`));

  const unpacked = join(dir, "unpacked");
  mkdirSync(unpacked, { recursive: true });
  const tar = await sys.run(["tar", "-xzf", tarball, "-C", unpacked], { timeoutMs: 120_000 });
  if (tar.code !== 0) return bail(fail("selfcheck", `tar: ${tar.out.split("\n")[0]}`));
  const binary = findBinary(unpacked);
  if (!binary) return bail(fail("selfcheck", "the download has no ducter in it"));
  try {
    chmodSync(binary, 0o755);
  } catch {}
  const v = await sys.run([binary, "--version"], { timeoutMs: 20_000 });
  if (v.code !== 0 || !v.out.includes(`ducter ${i.to}`)) return bail(fail("selfcheck", `--version: ${v.out.split("\n")[0] || `exit ${v.code}`}`));
  // doctor in a scratch folder: proves the new binary loads its core paths without touching ours.
  const scratch = join(dir, "doctor-data");
  mkdirSync(scratch, { recursive: true });
  const d = await sys.run([binary, "doctor", "--json"], { timeoutMs: 60_000, env: { DUCTER_DATA_DIR: scratch, DUCTER_PORT: "1", NO_COLOR: "1" } });
  try {
    const j = JSON.parse(d.out.slice(d.out.indexOf("{")));
    if (!Array.isArray(j?.checks)) throw new Error("no checks");
  } catch {
    return bail(fail("selfcheck", `doctor --json: ${d.out.split("\n")[0] || `exit ${d.code}`}`));
  }
  rmSync(tarball, { force: true });
  return { ok: true, binary, dir };
}

function findBinary(root: string): string | undefined {
  const direct = join(root, "ducter");
  if (existsSync(direct)) return direct;
  for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && existsSync(join(root, e.name, "ducter"))) return join(root, e.name, "ducter");
}

/** The running binary's real path, and the previous one kept beside it. */
export function targetOf(execPath: string): { target: string; prev: string } {
  let target = execPath;
  try {
    target = realpathSync(execPath);
  } catch {}
  return { target, prev: join(dirname(target), "ducter.prev") };
}

/**
 * Puts the staged binary in place: the running one is kept as ducter.prev (a hard link, so the
 * running process keeps its file), then the new one is renamed over it. Same folder, so the
 * rename is atomic: at every moment `ducter` is one whole binary.
 */
export function swapIn(staged: string, execPath: string): { ok: true; target: string; prev: string } | Fail {
  const { target, prev } = targetOf(execPath);
  const dir = dirname(target);
  try {
    accessSync(dir, constants.W_OK);
  } catch {
    return fail("not_writable", `${dir} isn't writable by this user`);
  }
  const next = join(dir, ".ducter.new");
  const prevTmp = join(dir, ".ducter.prev.tmp");
  try {
    rmSync(next, { force: true });
    copyFileSync(staged, next);
    chmodSync(next, 0o755);
    rmSync(prevTmp, { force: true });
    try {
      linkSync(target, prevTmp);
    } catch {
      copyFileSync(target, prevTmp);
    }
    chmodSync(prevTmp, 0o755);
    renameSync(prevTmp, prev);
    renameSync(next, target);
  } catch (err) {
    rmSync(next, { force: true });
    rmSync(prevTmp, { force: true });
    return fail("failed", (err as Error).message);
  }
  return { ok: true, target, prev };
}

/** Puts ducter.prev back as ducter; the one that failed is kept as ducter.failed for a report. */
export function rollBack(target: string): boolean {
  return rollBackWhy(target) === undefined;
}

/** rollBack, saying why it couldn't (undefined: the previous binary is back). */
export function rollBackWhy(target: string): string | undefined {
  const prev = join(dirname(target), "ducter.prev");
  if (!existsSync(prev)) return `no ${prev} to go back to`;
  try {
    rmSync(join(dirname(target), "ducter.failed"), { force: true });
    try {
      linkSync(target, join(dirname(target), "ducter.failed"));
    } catch {}
    renameSync(prev, target);
    return undefined;
  } catch (err) {
    return `couldn't put ${prev} back: ${(err as Error).message}`;
  }
}

// ---------- the restart, from a helper outside the service ----------

/** What the helper needs; written to <dataDir>/updates/plan.json. */
export interface FinishPlan {
  dataDir: string;
  target: string;
  from: string;
  to: string;
  role: "home" | "worker";
  port: number;
  unit: string;
  /** systemd: restart the unit; none: no service (the person restarts it). */
  restart: "systemd" | "none";
  startedAt: string;
}

export interface UpdateResult {
  from: string;
  to: string;
  ok: boolean;
  rolledBack?: boolean;
  reason?: UpdateReason;
  detail?: string;
  at: string;
  /** The restarted Ducter logged it (home) or said it in its hello (worker). */
  reported?: boolean;
}

export const updatesDir = (dataDir: string) => join(dataDir, "updates");
export const resultFile = (dataDir: string) => join(updatesDir(dataDir), "result.json");
export const planFile = (dataDir: string) => join(updatesDir(dataDir), "plan.json");
export const aliveFile = (dataDir: string) => join(updatesDir(dataDir), "alive.json");

function writeJson(path: string, v: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + ".tmp", JSON.stringify(v, null, 2));
  renameSync(path + ".tmp", path);
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export const writeResult = (dataDir: string, r: UpdateResult) => writeJson(resultFile(dataDir), r);
export const readResult = (dataDir: string) => readJson<UpdateResult>(resultFile(dataDir));
export const writePlan = (p: FinishPlan) => writeJson(planFile(p.dataDir), p);
export const readPlan = (path: string) => readJson<FinishPlan>(path);
/** A worker that reached its main (worker.ts), or a home once it listens (core.ts), writes this; the helper waits on it. */
export const writeAlive = (dataDir: string, version: string, at = new Date().toISOString()) => writeJson(aliveFile(dataDir), { version, at, pid: process.pid });
export const readAlive = (dataDir: string) => readJson<{ version: string; at: string }>(aliveFile(dataDir));

/**
 * What a recorded outcome means for a Ducter that runs `version` now (D167):
 * - done: it runs the version the update went to, whatever the helper wrote (a slow start the
 *   helper gave up on still ended on the target once it came up);
 * - failed: the update didn't take and it still runs the version it started from;
 * - superseded: it has moved on since (a later update, the installer run again): say nothing;
 * - pending: "swapped, restart to run it", and this is still the old one.
 */
export type Judged = "done" | "failed" | "superseded" | "pending";
export function judgeResult(r: Pick<UpdateResult, "ok" | "from" | "to">, version: string): Judged {
  if (isVersion(r.to) && isVersion(version) && compareVersions(version, r.to) === 0) return "done";
  const onFrom = !isVersion(r.from) ? isVersion(r.to) && compareVersions(version, r.to) < 0 : compareVersions(version, r.from) === 0;
  if (!onFrom) return "superseded";
  return r.ok ? "pending" : "failed";
}

/** Why waitHealthy gave up: nothing answered as `version`; `answered` is another version that did. */
export type HealthWait = { ok: true } | { ok: false; answered?: string };

/**
 * Healthy = the restarted Ducter runs `version` (since `since`): the home's /health names it, or
 * it wrote alive.json once it was up (a worker, which has no port; a home whose /health doesn't
 * tell this caller its version, DUCTER_LOCAL_TRUST=off). Being up and being the new version are
 * told apart: an answer from another version is kept for the reason. onWait hears every 15 s.
 */
export async function waitHealthy(sys: UpdateSys, p: FinishPlan, version: string, since: number, ms = HEALTH_WAIT_MS, onWait?: (seconds: number) => void): Promise<HealthWait> {
  const end = sys.now() + ms;
  let answered: string | undefined;
  let said = sys.now();
  while (sys.now() < end) {
    const a = readAlive(p.dataDir);
    if (a?.version === version && Date.parse(a.at) >= since - 1000) return { ok: true };
    if (p.role === "home") {
      try {
        const r = await sys.fetch(`http://127.0.0.1:${p.port}/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) {
          const j: any = await r.json().catch(() => ({}));
          if (j?.version === version) return { ok: true };
          if (typeof j?.version === "string") answered = j.version;
        }
      } catch {}
    }
    if (onWait && sys.now() - said >= 15_000) {
      said = sys.now();
      onWait(Math.round((said - since) / 1000));
    }
    await sys.sleep(1000);
  }
  return answered ? { ok: false, answered } : { ok: false };
}

/**
 * The helper's whole job (`ducter update --finish <plan>`): restart, wait for health, roll back
 * if it never comes, and leave the outcome for the restarted Ducter to log. say: its progress
 * (the helper's journal).
 */
export async function finish(sys: UpdateSys, p: FinishPlan, healthMs = HEALTH_WAIT_MS, say: (line: string) => void = () => {}): Promise<UpdateResult> {
  const restart = async () => {
    const r = await sys.run(["systemctl", "--user", "restart", p.unit], { timeoutMs: 60_000 });
    return r.code === 0 ? undefined : r.out.split("\n")[0] || `exit ${r.code}`;
  };
  const at = () => new Date(sys.now()).toISOString();
  const t0 = sys.now();
  const err = await restart();
  const first: HealthWait = err ? { ok: false } : await waitHealthy(sys, p, p.to, t0, healthMs, (s) => say(`waiting for ${p.to} to answer (${s} s)`));
  if (first.ok) {
    const r: UpdateResult = { from: p.from, to: p.to, ok: true, at: at() };
    writeResult(p.dataDir, r);
    return r;
  }
  const notBack = rollBackWhy(p.target);
  const back = notBack === undefined;
  const t1 = sys.now();
  if (back) await restart();
  const up = back && (await waitHealthy(sys, p, p.from, t1, healthMs)).ok;
  const secs = Math.round(healthMs / 1000);
  const why = err ? `restart failed: ${err}` : first.answered ? `${first.answered} answered instead of ${p.to} for ${secs} s` : `${p.to} didn't answer within ${secs} s`;
  const r: UpdateResult = {
    from: p.from,
    to: p.to,
    ok: false,
    rolledBack: back,
    reason: "health",
    detail: why + (back ? (up ? "" : `; ${p.from} didn't answer either`) : `; ${notBack}`),
    at: at(),
  };
  writeResult(p.dataDir, r);
  return r;
}

/** Whether this process runs as the systemd user service (systemd sets INVOCATION_ID). */
export const underSystemd = (env: Record<string, string | undefined> = process.env) => Boolean(env.INVOCATION_ID);

/**
 * Starts the helper in its own transient unit, so `systemctl restart ducter` (which kills the
 * whole cgroup of the service) doesn't take it along. It runs the previous binary: known to work.
 */
export async function launchFinish(sys: UpdateSys, p: FinishPlan, prev: string): Promise<Fail | undefined> {
  writePlan(p);
  const unit = `ducter-update-${p.to.replace(/[^0-9A-Za-z]/g, "-")}-${Math.floor(sys.now() / 1000)}`;
  const r = await sys.run(["systemd-run", "--user", "--collect", "--quiet", `--unit=${unit}`, `--setenv=DUCTER_DATA_DIR=${p.dataDir}`, prev, "update", "--finish", planFile(p.dataDir)], { timeoutMs: 20_000 });
  if (r.code !== 0) return fail("failed", `systemd-run: ${r.out.split("\n")[0] || `exit ${r.code}`}`);
}

/** The whole update on this machine, after its safe point: stage, swap, then restart from the helper. */
export interface RunInput extends StageInput {
  execPath: string;
  role: "home" | "worker";
  port: number;
  env?: Record<string, string | undefined>;
  /** Called after staging and before the swap: the safe point (wait for merges, turns). */
  settle?: () => Promise<Fail | undefined>;
}

export type RunOutcome =
  | { ok: true; restarting: true } // the helper restarts it; the outcome comes after
  | { ok: true; restarting: false; target: string } // swapped; nothing to restart (no service)
  | Fail;

export async function runUpdate(sys: UpdateSys, i: RunInput): Promise<RunOutcome> {
  const staged = await stage(sys, i);
  if (!staged.ok) return staged;
  if (i.settle) {
    i.onPhase?.("waiting");
    const f = await i.settle();
    if (f) return rmSync(staged.dir, { recursive: true, force: true }), f;
  }
  const swapped = swapIn(staged.binary, i.execPath);
  rmSync(staged.dir, { recursive: true, force: true });
  if (!swapped.ok) return swapped;
  const systemd = underSystemd(i.env);
  if (!systemd) {
    writeResult(i.dataDir, { from: i.current, to: i.to, ok: true, at: new Date(sys.now()).toISOString(), detail: "swapped; restart Ducter to run it" });
    return { ok: true, restarting: false, target: swapped.target };
  }
  i.onPhase?.("restarting");
  const plan: FinishPlan = { dataDir: i.dataDir, target: swapped.target, from: i.current, to: i.to, role: i.role, port: i.port, unit: UNIT, restart: "systemd", startedAt: new Date(sys.now()).toISOString() };
  const f = await launchFinish(sys, plan, swapped.prev);
  if (f) {
    // No helper: nothing restarts the new binary. Put the old one back rather than leave a surprise.
    rollBack(swapped.target);
    return f;
  }
  return { ok: true, restarting: true };
}

