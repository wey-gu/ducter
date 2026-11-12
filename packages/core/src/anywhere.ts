// 在哪儿都能用 / From anywhere (D228): one tap gives a home with no public address one, through a
// Cloudflare tunnel that Ducter installs and runs itself.
//
// - Default: a free quick tunnel (trycloudflare.com): no account, no domain. Its address changes
//   whenever the tunnel process starts again, so the process lives beside Ducter, not inside it: a
//   detached process (or, under systemd, its own transient user unit) that a restarted or updated
//   Ducter adopts by its metrics port. The address then changes only when the computer restarts
//   or the tunnel is lost, and paired devices follow it through the address relay (follow.ts).
// - named: the person's own Cloudflare tunnel (a token from their dashboard and the hostname it
//   serves): a stable address, the same process manager.
// - An address the person set up themselves (DUCTER_PUBLIC_URL, `ducter domain`'s public-url)
//   always wins; then there is nothing to run.
//
// The tunnel only carries what pairing already guards (D54/D57): cloudflared connects from
// loopback but sends the outside Host and Cf-Connecting-IP / X-Forwarded-For, so every request
// through it counts as remote and needs a device token (auth.ts isLocalRequest; research/67).
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newFollowSecrets, sealAddress, type Anywhere, type AnywhereReason, type Follow } from "@ducter/protocol";

/** The cloudflared Ducter downloads when the computer has none: pinned, each file's SHA-256 checked. */
export const CLOUDFLARED = {
  version: "2026.10.5",
  base: "https://github.com/cloudflare/cloudflared/releases/download",
  assets: {
    "darwin-arm64": { file: "cloudflared-darwin-arm64.tgz", sha256: "184c7d4f5f977348243a6d7ca8f6cf6073b9b2746cfe8c1fe15aa59e9a522bf0", bin: "2b23964528ddcd641c1449275df8b5b51e3c7193b5257919846331bc5bc13b0f" },
    "darwin-x64": { file: "cloudflared-darwin-amd64.tgz", sha256: "6699392fed92367808c248c2d90bed66e49bbf66e1b4ee3e4141230f3f7391b3", bin: "cb09afb9b4d0a4730de477ac710aebb6107568930a8345775629bf264f70c284" },
    "linux-x64": { file: "cloudflared-linux-amd64", sha256: "e1bc0cf084fd9e590554fe769a86b1db46701c3f847a43d902f7b974a4e16298", bin: "e1bc0cf084fd9e590554fe769a86b1db46701c3f847a43d902f7b974a4e16298" },
    "linux-arm64": { file: "cloudflared-linux-arm64", sha256: "72e0d05a67e09da87cf495e409a28c3cc5994dd23fc66a982eebea6a55923b7d", bin: "72e0d05a67e09da87cf495e409a28c3cc5994dd23fc66a982eebea6a55923b7d" },
  } as Record<string, { file: string; sha256: string; bin: string }>,
};

export const DEFAULT_ADDR_RELAY = "https://ducter.ai/api/addr";

/** The address relay: DUCTER_ADDR_RELAY, else Nowledge's; "off" keeps the address to the home. */
export function addrRelay(env: Record<string, string | undefined> = process.env): string | undefined {
  const v = (env.DUCTER_ADDR_RELAY ?? "").trim();
  if (v === "off" || v === "0" || v === "false") return;
  if (!v) return DEFAULT_ADDR_RELAY;
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.hostname === "127.0.0.1" || u.hostname === "localhost") return v.replace(/\/+$/, "");
  } catch {}
  return DEFAULT_ADDR_RELAY;
}

/** What runs the tunnel: a process handle that outlives Ducter. */
export interface TunnelHandle {
  pid?: number;
  unit?: string; // systemd --user transient unit
}

export interface TunnelStart {
  bin: string;
  port: number;
  metricsPort: number;
  token?: string;
  logFile: string;
  configFile: string;
}

/** The system seams (fakes in tests): cloudflared, its process, its metrics, the network. */
export interface TunnelSys {
  /** cloudflared ready to run: DUCTER_CLOUDFLARED, Ducter's own copy, one on PATH, else downloaded. */
  ensure(onGetting: () => void): Promise<{ bin: string } | { error: AnywhereReason; detail?: string }>;
  start(s: TunnelStart): Promise<TunnelHandle>;
  alive(h: TunnelHandle): Promise<boolean>;
  stop(h: TunnelHandle): Promise<void>;
  /** The quick tunnel's hostname from cloudflared's metrics server (/quicktunnel). */
  hostname(metricsPort: number): Promise<string | undefined>;
  /** cloudflared holds a connection to Cloudflare (/ready). */
  ready(metricsPort: number): Promise<boolean>;
  /** The new hostname resolves in public DNS (asked over HTTPS, so no negative answer is cached
   *  here). undefined: DNS over HTTPS can't be reached from this network. */
  resolves(host: string): Promise<boolean | undefined>;
  freePort(): Promise<number>;
  fetch: typeof fetch;
}

interface Saved {
  on: boolean;
  how: "tunnel" | "named";
  port: number;
  url?: string;
  since?: string;
  handle?: TunnelHandle;
  metricsPort?: number;
  check: string;
  follow?: { id: string; key: string; write: string };
  published?: { url: string; at: number; relay?: string };
}

export const anywhereFile = (dataDir: string) => join(dataDir, "anywhere.json");
const tokenFile = (dataDir: string) => join(dataDir, "anywhere-token");

function readSaved(dataDir: string): Saved | undefined {
  try {
    const s = JSON.parse(readFileSync(anywhereFile(dataDir), "utf8")) as Saved;
    return typeof s.on === "boolean" && typeof s.check === "string" ? s : undefined;
  } catch {
    return undefined;
  }
}

function writeSaved(dataDir: string, s: Saved) {
  mkdirSync(dataDir, { recursive: true });
  const tmp = anywhereFile(dataDir) + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, anywhereFile(dataDir));
}

/** The tunnel's address as saved, for readers outside the running home (the CLI's `ducter pair`). */
export function tunnelAddress(dataDir: string): string | undefined {
  const s = readSaved(dataDir);
  return s?.on && s.url ? s.url : undefined;
}

export interface AnywhereOptions {
  dataDir: string;
  /** Ducter's own port (a function: the server may not be listening yet when this is made). */
  port: number | (() => number);
  env?: Record<string, string | undefined>;
  sys?: TunnelSys;
  now?: () => number;
  /** How often the tunnel is looked at while on. */
  pollMs?: number;
  /** How long a start may take before it counts as failed. */
  startMs?: number;
  /** The address the person set up themselves (D143), which wins. */
  own?: () => string | undefined;
  log?: (m: string) => void;
}

export interface AnywhereCtl {
  view(): Anywhere | undefined;
  /** The address from outside while the tunnel is up. */
  address(): string | undefined;
  /** Turn it on (a quick tunnel, or the person's own named one). Resolves once it is starting. */
  turnOn(named?: { token: string; address: string }): Promise<{ ok: boolean; reason?: "own_address" | AnywhereReason; detail?: string }>;
  turnOff(): Promise<void>;
  /** At boot: adopt the tunnel still running from before, or start it again. */
  resume(): Promise<void>;
  /** The self-check's answer (served at /.well-known/ducter-anywhere): proves an address leads here. */
  checkToken(): string;
  onChange(fn: () => void): () => void;
  close(): void;
  /** Test seam: one look at the tunnel now. */
  tick(): Promise<void>;
}

const START_MS = 90_000;
const REPUBLISH_MS = 12 * 3600_000;
export const CHECK_PATH = "/.well-known/ducter-anywhere";

export function createAnywhere(o: AnywhereOptions): AnywhereCtl {
  const env = o.env ?? process.env;
  const sys = o.sys ?? realTunnelSys({ dataDir: o.dataDir, env });
  const now = o.now ?? Date.now;
  const log = o.log ?? ((m: string) => console.log(`[anywhere] ${m}`));
  const relay = addrRelay(env);
  const port = () => (typeof o.port === "function" ? o.port() : o.port);
  let saved = readSaved(o.dataDir);
  let phase: "off" | "starting" | "on" | "failed" = saved?.on && saved.url ? "on" : "off";
  let getting = false;
  let failure: { reason: AnywhereReason; detail?: string } | undefined;
  let strikes = 0;
  let restarts = 0;
  let ticks = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy: Promise<unknown> | undefined;
  const fns = new Set<() => void>();
  const changed = () => {
    for (const fn of fns) fn();
  };
  const persist = () => saved && writeSaved(o.dataDir, saved);

  const follow = (): Follow | undefined => (relay && saved?.follow ? { relay, id: saved.follow.id, key: saved.follow.key } : undefined);

  async function publish(force = false) {
    if (!relay || !saved?.follow || !saved.url || saved.how !== "tunnel") return;
    if (!force && saved.published?.url === saved.url && saved.published.relay === relay && now() - saved.published.at < REPUBLISH_MS) return;
    const at = saved.since ? Date.parse(saved.since) : now();
    try {
      const d = await sealAddress(saved.follow.key, saved.follow.id, { url: saved.url, at });
      const r = await sys.fetch(`${relay}/put`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: saved.follow.id, w: saved.follow.write, d }), signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        saved.published = { url: saved.url, at: now(), relay };
        persist();
      } else log(`the address relay answered ${r.status}`);
    } catch (e) {
      log(`the address relay can't be reached: ${(e as Error).message}`);
    }
  }

  function fail(reason: AnywhereReason, detail?: string) {
    phase = "failed";
    getting = false;
    failure = { reason, ...(detail ? { detail } : {}) };
    log(`couldn't turn on: ${reason}${detail ? ` (${detail})` : ""}`);
    changed();
  }

  /** Starts cloudflared and waits for an address that resolves. */
  async function start(): Promise<void> {
    if (!saved) return;
    phase = "starting";
    failure = undefined;
    changed();
    const bin = await sys.ensure(() => {
      getting = true;
      changed();
    });
    getting = false;
    if ("error" in bin) return fail(bin.error, bin.detail);
    if (saved.handle) await sys.stop(saved.handle).catch(() => {});
    const metricsPort = await sys.freePort();
    const configFile = join(o.dataDir, "anywhere-cloudflared.yml");
    // Its own (near empty) config: a config.yml the person keeps for their own tunnels never applies.
    writeFileSync(configFile, "# Written by Ducter for 在哪儿都能用 / From anywhere.\nno-autoupdate: true\n");
    const token = saved.how === "named" ? readToken(o.dataDir) : undefined;
    let handle: TunnelHandle;
    try {
      handle = await sys.start({ bin: bin.bin, port: port(), metricsPort, ...(token ? { token } : {}), logFile: join(o.dataDir, "anywhere.log"), configFile });
    } catch (e) {
      return fail("failed", (e as Error).message);
    }
    saved.handle = handle;
    saved.metricsPort = metricsPort;
    saved.port = port();
    persist();
    const until = now() + (o.startMs ?? START_MS);
    let host: string | undefined;
    let hostAt = 0;
    for (;;) {
      if (!saved?.on) return; // turned off meanwhile
      if (!(await sys.alive(handle))) return fail("cloudflare", lastLogLine(o.dataDir));
      if (saved.how === "named") {
        if (await sys.ready(metricsPort)) break;
      } else {
        if (!host && (host = await sys.hostname(metricsPort))) hostAt = now();
        // Never ask this computer's own DNS before the name exists: it would remember "no such
        // name" for a minute or more (research/67). Without DNS over HTTPS, give it 25 s.
        if (host && (await sys.ready(metricsPort))) {
          const r = await sys.resolves(host);
          if (r === true || (r === undefined && now() - hostAt > 25_000)) break;
        }
      }
      if (now() > until) {
        await sys.stop(handle).catch(() => {});
        return fail("cloudflare", lastLogLine(o.dataDir));
      }
      await sleep(1000);
    }
    const url = saved.how === "named" ? saved.url! : `https://${host}`;
    if (saved.url !== url || !saved.since) saved.since = new Date(now()).toISOString();
    saved.url = url;
    persist();
    phase = "on";
    strikes = 0;
    log(`on at ${url}`);
    changed();
    await publish(true);
  }

  async function restart(why: string) {
    restarts++;
    log(`starting the tunnel again (${why})`);
    if (saved && saved.how === "tunnel") saved.url = undefined;
    await start();
  }

  async function tick() {
    if (!saved?.on || busy || phase === "starting") return;
    ticks++;
    const h = saved.handle;
    if (!h || !(await sys.alive(h))) {
      // Lost: start again (a quick tunnel gets a new address, and the devices follow it).
      if (phase === "failed" && restarts > 20) return;
      await run(() => restart("it stopped"));
      return;
    }
    if (phase === "failed") return;
    if (saved.how === "tunnel" && saved.metricsPort) {
      const host = await sys.hostname(saved.metricsPort);
      if (host && `https://${host}` !== saved.url) {
        saved.url = `https://${host}`;
        saved.since = new Date(now()).toISOString();
        persist();
        changed();
        await publish(true);
      }
    }
    // Every few looks: does the address still lead here? Only counted while Cloudflare is
    // connected (no network is not a broken tunnel; cloudflared reconnects by itself).
    if (ticks % 5 === 0 && saved.url && saved.metricsPort && (await sys.ready(saved.metricsPort))) {
      const ok = await sys
        .fetch(saved.url + CHECK_PATH, { signal: AbortSignal.timeout(10_000) })
        .then(async (r) => r.ok && (await r.text()).trim() === saved?.check)
        .catch(() => false);
      strikes = ok ? 0 : strikes + 1;
      if (strikes >= 3) {
        strikes = 0;
        await sys.stop(h).catch(() => {});
        await run(() => restart("its address stopped answering"));
        return;
      }
    }
    await publish();
  }

  function run<T>(fn: () => Promise<T>): Promise<T> {
    const p = fn().finally(() => {
      if (busy === p) busy = undefined;
    });
    busy = p;
    return p;
  }

  const watch = () => {
    if (timer || !saved?.on) return;
    timer = setInterval(() => void tick().catch((e) => log(String(e))), o.pollMs ?? 30_000);
    (timer as { unref?: () => void }).unref?.();
  };
  const unwatch = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  return {
    view() {
      const own = o.own?.();
      if (own) return { how: "own", state: "on" };
      if (!saved?.on) return undefined;
      const f = follow();
      return {
        how: saved.how,
        state: phase === "off" ? "starting" : phase,
        ...(getting ? { getting: true } : {}),
        ...(saved.how === "tunnel" ? { moves: true } : {}),
        ...(failure && phase === "failed" ? { reason: failure.reason, ...(failure.detail ? { detail: failure.detail } : {}) } : {}),
        ...(phase === "on" && saved.since ? { since: saved.since } : {}),
        ...(f && saved.how === "tunnel" ? { follow: f } : {}),
      };
    },
    address() {
      return phase === "on" && saved?.on ? saved.url : undefined;
    },
    async turnOn(named) {
      if (o.own?.()) return { ok: false, reason: "own_address" };
      if (named) {
        let u: URL;
        try {
          u = new URL(/^https?:\/\//.test(named.address) ? named.address : `https://${named.address}`);
        } catch {
          return { ok: false, reason: "failed", detail: "address" };
        }
        if (!/^[A-Za-z0-9=_.-]{20,}$/.test(named.token.trim())) return { ok: false, reason: "failed", detail: "token" };
        writeFileSync(tokenFile(o.dataDir), named.token.trim() + "\n", { mode: 0o600 });
        saved = { ...(saved ?? { check: randomBytes(16).toString("hex"), port: port() }), on: true, how: "named", url: `https://${u.host}`, port: port() };
        delete saved.published;
      } else {
        if (saved?.on && saved.how === "tunnel" && (phase === "on" || phase === "starting")) return { ok: true };
        saved = { ...(saved ?? { check: randomBytes(16).toString("hex"), port: port() }), on: true, how: "tunnel", port: port() };
        saved.follow ??= newFollowSecrets();
        rmSync(tokenFile(o.dataDir), { force: true });
      }
      persist();
      restarts = 0;
      // Answer now: the card shows 正在打开 while it starts (the first time it also downloads).
      void run(() => start()).then(watch);
      phase = "starting";
      changed();
      return { ok: true };
    },
    async turnOff() {
      unwatch();
      const h = saved?.handle;
      if (saved) {
        saved.on = false;
        delete saved.handle;
        delete saved.url;
        delete saved.since;
        delete saved.published;
        persist();
      }
      phase = "off";
      failure = undefined;
      if (h) await sys.stop(h).catch(() => {});
      rmSync(tokenFile(o.dataDir), { force: true });
      changed();
    },
    async resume() {
      if (!saved?.on || o.own?.()) return;
      const h = saved.handle;
      // The tunnel from before this Ducter started (a restart, an update) keeps its address.
      if (h && saved.port === port() && saved.metricsPort && (await sys.alive(h))) {
        const host = saved.how === "tunnel" ? await sys.hostname(saved.metricsPort) : undefined;
        if (saved.how === "named" || (host && `https://${host}` === saved.url)) {
          phase = "on";
          log(`kept the tunnel from before at ${saved.url}`);
          changed();
          watch();
          await publish();
          return;
        }
        await sys.stop(h).catch(() => {});
      }
      if (saved.how === "tunnel") saved.url = undefined;
      await run(() => start());
      watch();
    },
    checkToken: () => saved?.check ?? "",
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    close: unwatch,
    tick,
  };
}

function readToken(dataDir: string): string | undefined {
  try {
    return readFileSync(tokenFile(dataDir), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/** The last thing cloudflared said that looks like trouble (for the failed line's detail). */
function lastLogLine(dataDir: string): string | undefined {
  try {
    const lines = readFileSync(join(dataDir, "anywhere.log"), "utf8").split("\n").filter((l) => / (ERR|FTL) /.test(l));
    const l = lines.at(-1);
    return l ? l.replace(/^\S+\s+(ERR|FTL)\s+/, "").slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- the real system ----------

export function cloudflaredArgs(s: Omit<TunnelStart, "bin" | "logFile">): string[] {
  const common = ["tunnel", "--no-autoupdate", "--config", s.configFile, "--metrics", `127.0.0.1:${s.metricsPort}`];
  // The token rides in the environment (TUNNEL_TOKEN), never on the command line others can list.
  return s.token ? [...common, "run"] : [...common, "--url", `http://127.0.0.1:${s.port}`];
}

export function realTunnelSys(o: { dataDir: string; env?: Record<string, string | undefined>; platform?: string; arch?: string }): TunnelSys {
  const env = o.env ?? process.env;
  const platform = o.platform ?? process.platform;
  const arch = o.arch ?? process.arch;
  const ownBin = join(o.dataDir, "bin", `cloudflared-${CLOUDFLARED.version}`);
  const underSystemd = () => platform === "linux" && !!env.INVOCATION_ID && !!Bun.which("systemd-run") && !!Bun.which("systemctl");
  const exec = async (argv: string[]) => {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: env as Record<string, string> });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, out: out + err };
  };
  const metrics = async (port: number, path: string) => {
    try {
      return await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
    } catch {
      return undefined;
    }
  };
  return {
    async ensure(onGetting) {
      if (env.DUCTER_CLOUDFLARED) return existsSync(env.DUCTER_CLOUDFLARED) ? { bin: env.DUCTER_CLOUDFLARED } : { error: "failed", detail: `${env.DUCTER_CLOUDFLARED} is missing` };
      if (existsSync(ownBin)) return { bin: ownBin };
      const onPath = Bun.which("cloudflared");
      if (onPath) return { bin: onPath };
      const asset = CLOUDFLARED.assets[`${platform}-${arch}`];
      if (!asset) return { error: "unsupported", detail: `${platform}-${arch}` };
      onGetting();
      let bytes: Uint8Array;
      try {
        const r = await fetch(`${CLOUDFLARED.base}/${CLOUDFLARED.version}/${asset.file}`, { signal: AbortSignal.timeout(5 * 60_000) });
        if (!r.ok) return { error: "download", detail: `HTTP ${r.status}` };
        bytes = new Uint8Array(await r.arrayBuffer());
      } catch (e) {
        return { error: "download", detail: (e as Error).message };
      }
      if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return { error: "download", detail: "checksum" };
      const dir = join(o.dataDir, "bin");
      mkdirSync(dir, { recursive: true });
      const tmp = `${ownBin}.part`;
      if (asset.file.endsWith(".tgz")) {
        writeFileSync(`${tmp}.tgz`, bytes);
        const x = join(dir, `.cloudflared-${process.pid}`);
        mkdirSync(x, { recursive: true });
        const t = await exec(["tar", "-xzf", `${tmp}.tgz`, "-C", x, "cloudflared"]);
        rmSync(`${tmp}.tgz`, { force: true });
        if (t.code !== 0) return rmSync(x, { recursive: true, force: true }), { error: "download", detail: t.out.trim().slice(0, 200) };
        const inner = readFileSync(join(x, "cloudflared"));
        if (createHash("sha256").update(inner).digest("hex") !== asset.bin) return rmSync(x, { recursive: true, force: true }), { error: "download", detail: "checksum" };
        renameSync(join(x, "cloudflared"), tmp);
        rmSync(x, { recursive: true, force: true });
      } else writeFileSync(tmp, bytes);
      chmodSync(tmp, 0o755);
      renameSync(tmp, ownBin);
      return { bin: ownBin };
    },
    async start(s) {
      const args = cloudflaredArgs(s);
      writeFileSync(s.logFile, "");
      if (underSystemd()) {
        // Its own transient unit: a restart of Ducter's service (an update) doesn't take it along.
        const unit = `ducter-anywhere-${s.port}`;
        await exec(["systemctl", "--user", "stop", unit]);
        await exec(["systemctl", "--user", "reset-failed", unit]);
        const r = await exec(["systemd-run", "--user", "--quiet", "--collect", `--unit=${unit}`, `--property=StandardOutput=append:${s.logFile}`, `--property=StandardError=append:${s.logFile}`, ...(s.token ? [`--setenv=TUNNEL_TOKEN=${s.token}`] : []), "--", s.bin, ...args]);
        if (r.code !== 0) throw new Error(r.out.trim().slice(0, 200) || "systemd-run failed");
        return { unit };
      }
      const fd = openSync(s.logFile, "a");
      try {
        const p = spawn(s.bin, args, { detached: true, stdio: ["ignore", fd, fd], env: { ...(env as Record<string, string>), ...(s.token ? { TUNNEL_TOKEN: s.token } : {}) } });
        p.unref();
        if (!p.pid) throw new Error("cloudflared did not start");
        return { pid: p.pid };
      } finally {
        closeSync(fd);
      }
    },
    async alive(h) {
      if (h.unit) return (await exec(["systemctl", "--user", "is-active", h.unit])).out.trim() === "active";
      if (!h.pid) return false;
      try {
        process.kill(h.pid, 0);
      } catch {
        return false;
      }
      // After a reboot the number may belong to something else: only a cloudflared counts.
      const r = await exec(["ps", "-p", String(h.pid), "-o", "comm="]);
      return /cloudflared/.test(r.out);
    },
    async stop(h) {
      if (h.unit) return void (await exec(["systemctl", "--user", "stop", h.unit]));
      if (h.pid && (await this.alive(h))) {
        try {
          process.kill(h.pid, "SIGTERM");
        } catch {}
      }
    },
    async hostname(port) {
      const r = await metrics(port, "/quicktunnel");
      if (!r?.ok) return;
      const b = (await r.json().catch(() => ({}))) as { hostname?: string };
      return b.hostname && /^[a-z0-9-]+\.trycloudflare\.com$/.test(b.hostname) ? b.hostname : undefined;
    },
    async ready(port) {
      return (await metrics(port, "/ready"))?.ok ?? false;
    },
    async resolves(host) {
      try {
        const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
        const b = (await r.json()) as { Status?: number; Answer?: unknown[] };
        return b.Status === 0 && (b.Answer?.length ?? 0) > 0;
      } catch {
        return undefined; // no DNS over HTTPS from here (a filtered network)
      }
    },
    async freePort() {
      const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
      const p = s.port;
      s.stop(true);
      return p;
    },
    fetch: ((...a: Parameters<typeof fetch>) => fetch(...a)) as typeof fetch,
  };
}
