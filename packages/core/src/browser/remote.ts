// Ducter's own browser on a worker (D157, after D151). The Chrome runs on the worker, with the
// worker's profile and sign-ins (they never copy between computers); the main drives it over the
// worker's own socket: CDP commands go down as `cdpSend` requests, CDP events come up as `cdp`
// frames. Everything above the connection (the task's browser tools, the live view a sign-in
// card opens, the blind rule, Signed-in sites) is the same code as on the home: a worker's
// profiles are named "@<device id>:<profile>" and a routed host sends each to its computer.
//
// The live view's frames ride the same path: Page.screencastFrame is a CDP event from the
// worker's Chrome, so it reaches the user's window through the worker socket and the main.
import { randomBytes } from "node:crypto";
import { basename, join } from "node:path";
import type { WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import { profileRoot } from "@ducter/protocol/src/browser-profile.ts";
import type { CdpConn, CdpEvent } from "./cdp.ts";
import { connectCdp } from "./cdp.ts";
import { findChrome, launchChrome, type Launched } from "./chrome.ts";
import { createBrowserHost, type BrowserHost, type HostOptions } from "./host.ts";

/** A worker's profile as the main names it. Profile names are [A-Za-z0-9_-], so "@" and ":" never collide. */
export const workerProfile = (deviceId: string, profile: string) => `@${deviceId}:${profile}`;

/** The device and the worker's own profile name, for a worker profile; undefined for the home's. */
export function splitProfile(p: string): { device: string; profile: string } | undefined {
  const m = /^@([^:]+):(.+)$/.exec(p);
  return m ? { device: m[1]!, profile: m[2]! } : undefined;
}

// ---------- the worker's side ----------

export interface WorkerBrowserOptions {
  dataDir: string;
  send(frame: object): void;
  env?: Record<string, string | undefined>;
  platform?: string;
  /** Test seams. */
  find?: () => { path: string; version?: string } | undefined;
  launch?: (o: Parameters<typeof launchChrome>[0]) => Promise<Launched>;
  connect?: (url: string) => Promise<CdpConn | undefined>;
}

/** The ops a worker adds to its host so the main can drive Ducter's browser there. */
export function workerBrowserOps(o: WorkerBrowserOptions): { ops: Record<string, (a: any) => Promise<unknown>>; stopAll(): Promise<void> } {
  const running = new Map<string, { conn: CdpConn; launched: Launched; profile: string }>();
  const find = o.find ?? (() => findChrome(o.dataDir, { env: o.env, platform: o.platform }));
  const launch = o.launch ?? ((x: Parameters<typeof launchChrome>[0]) => launchChrome(x));
  const connect = o.connect ?? ((u: string) => connectCdp(u));
  const quit = async (key: string) => {
    const r = running.get(key);
    if (!r) return;
    running.delete(key);
    // Browser.close lets Chrome write its cookies (the sign-ins) before it exits.
    await r.conn.send("Browser.close", {}, undefined, 5_000).catch(() => {});
    r.conn.close();
    const exited = await Promise.race([r.launched.proc.exited.then(() => true), Bun.sleep(5_000).then(() => false)]);
    if (!exited) r.launched.proc.kill();
  };
  return {
    ops: {
      async chromeLaunch(a: { profile?: unknown; lang?: unknown; extra?: unknown }) {
        const profile = String(a.profile ?? "");
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(profile)) throw new Error("not a browser profile name");
        const chrome = find();
        if (!chrome) throw new Error("Ducter's browser isn't installed on this computer: add Browse the web (上网) on its card in Devices");
        const launched = await launch({
          chrome: chrome.path,
          profileDir: join(profileRoot(o.dataDir), profile),
          ...(chrome.version ? { version: chrome.version } : {}),
          lang: typeof a.lang === "string" ? a.lang : "en-US",
          root: process.getuid?.() === 0,
          ...(o.platform ? { platform: o.platform } : {}),
          extra: Array.isArray(a.extra) ? a.extra.map(String).filter((f) => f.startsWith("--")) : [],
        });
        const conn = await connect(launched.wsUrl);
        if (!conn) {
          launched.proc.kill();
          throw new Error("Ducter's browser started but its DevTools port didn't answer");
        }
        const key = "cdp_" + randomBytes(6).toString("hex");
        running.set(key, { conn, launched, profile });
        conn.on((e: CdpEvent) => o.send({ t: "cdp", key, msg: e }));
        const gone = () => {
          if (!running.has(key)) return o.send({ t: "cdp", key, closed: true });
          running.delete(key);
          o.send({ t: "cdp", key, closed: true });
        };
        conn.onClose(gone);
        void launched.proc.exited?.then(gone);
        return { key, ...(chrome.version ? { version: chrome.version } : {}) };
      },
      async cdpSend(a: { key?: unknown; method?: unknown; params?: unknown; sessionId?: unknown; timeoutMs?: unknown }) {
        const r = running.get(String(a.key ?? ""));
        if (!r) throw new Error("closed");
        return r.conn.send(String(a.method ?? ""), (a.params as object) ?? {}, typeof a.sessionId === "string" ? a.sessionId : undefined, typeof a.timeoutMs === "number" ? a.timeoutMs : 15_000);
      },
      async chromeQuit(a: { key?: unknown }) {
        await quit(String(a.key ?? ""));
        return {};
      },
    },
    async stopAll() {
      await Promise.all([...running.keys()].map(quit));
    },
  };
}

// ---------- the main's side ----------

/** One CDP connection to a Chrome on a worker, over the worker's socket. */
export function tunnelCdp(link: WorkerLink, key: string): CdpConn {
  const listeners = new Set<(e: CdpEvent) => void>();
  const closers = new Set<() => void>();
  let isClosed = false;
  const off = link.onSession(key, (f: WorkerSessionFrame) => {
    if (f.t === "cdp" && f.msg && !f.closed) {
      const e: CdpEvent = { method: f.msg.method, params: f.msg.params ?? {}, ...(f.msg.sessionId ? { sessionId: f.msg.sessionId } : {}) };
      for (const fn of listeners) fn(e);
      return;
    }
    // The browser there closed, or the worker's socket went (an `end` with offline).
    if ((f.t === "cdp" && f.closed) || f.t === "end") close();
  });
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    off();
    for (const fn of closers) fn();
  };
  return {
    async send(method, params = {}, sessionId, timeoutMs = 15_000) {
      if (isClosed) throw new Error("closed");
      try {
        return await link.call("cdpSend", { key, method, params, ...(sessionId ? { sessionId } : {}), timeoutMs }, timeoutMs + 5_000);
      } catch (e) {
        if ((e as { offline?: boolean }).offline) close();
        throw e;
      }
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onClose(fn) {
      closers.add(fn);
      return () => closers.delete(fn);
    },
    closed: () => isClosed,
    close() {
      if (isClosed) return;
      void link.call("chromeQuit", { key }, 15_000).catch(() => {});
      close();
    },
  };
}

/**
 * The browser host for one worker: the home's own host code, with Chrome started there and its
 * DevTools reached through the worker's socket. Profiles here carry the worker prefix.
 */
export function remoteBrowserHost(link: WorkerLink, o: Pick<HostOptions, "dataDir" | "lang" | "idleMs" | "env"> & { version?: () => string | undefined }): BrowserHost {
  const conns = new Map<string, { key: string; exited: Promise<number>; done: (n: number) => void }>();
  return createBrowserHost({
    dataDir: o.dataDir,
    ...(o.lang ? { lang: o.lang } : {}),
    ...(o.idleMs ? { idleMs: o.idleMs } : {}),
    remote: true,
    device: () => link.name,
    // The worker says whether its Chrome is there (its 上网); starting it answers for sure.
    find: () => ({ path: "worker", ...(o.version?.() ? { version: o.version()! } : {}), source: "ducter" }),
    async launch(lo) {
      const p = splitProfile(basename(lo.profileDir));
      const r = await link.call<{ key: string }>("chromeLaunch", { profile: p?.profile ?? basename(lo.profileDir), lang: lo.lang, extra: lo.extra ?? [] }, 90_000);
      let done!: (n: number) => void;
      const exited = new Promise<number>((res) => (done = res));
      conns.set(r.key, { key: r.key, exited, done });
      const proc = { exited, kill: () => void link.call("chromeQuit", { key: r.key }, 15_000).catch(() => {}).finally(() => done(0)) };
      return { proc: proc as unknown as Launched["proc"], wsUrl: `worker:${r.key}` };
    },
    async connect(url) {
      const key = url.replace(/^worker:/, "");
      const c = tunnelCdp(link, key);
      c.onClose(() => conns.get(key)?.done(0));
      return c;
    },
  });
}

/**
 * One BrowserHost over the home's browser and every worker's: a profile "@<device>:<name>" goes
 * to that worker's host, anything else to the home's; a task goes to the host it was attached on.
 */
export function routedHost(local: BrowserHost, remote: (deviceId: string) => BrowserHost | undefined): BrowserHost {
  const owner = new Map<string, BrowserHost>(); // taskId -> host
  const byProfile = (p: string): BrowserHost => {
    const s = splitProfile(p);
    if (!s) return local;
    const h = remote(s.device);
    if (!h) throw new Error("that computer isn't paired with this Ducter any more");
    return h;
  };
  const byTask = (taskId: string): BrowserHost => owner.get(taskId) ?? local;
  const safe = (p: string): BrowserHost | undefined => {
    try {
      return byProfile(p);
    } catch {
      return undefined;
    }
  };
  return {
    dataDir: local.dataDir,
    find: () => local.find(),
    about: (p) => byProfile(p).about(p),
    inUse: (p) => safe(p)?.inUse(p) ?? false,
    ensure: (p) => byProfile(p).ensure(p),
    running: (p) => safe(p)?.running(p),
    attach(taskId, a) {
      const h = byProfile(a.profile);
      owner.set(taskId, h);
      h.attach(taskId, a);
    },
    task: (taskId) => byTask(taskId).task(taskId),
    tab: (taskId, opts) => byTask(taskId).tab(taskId, opts),
    newTab: (taskId, url) => byTask(taskId).newTab(taskId, url),
    session: (b, targetId) => local.session(b, targetId),
    async release(taskId) {
      const h = byTask(taskId);
      owner.delete(taskId);
      return h.release(taskId);
    },
    setLive: (p, id) => safe(p)?.setLive(p, id),
    blind: (p) => safe(p)?.blind(p) ?? false,
    touch: (p) => safe(p)?.touch(p),
    close: (p) => safe(p)?.close(p) ?? Promise.resolve(false),
    async stop() {
      await local.stop();
    },
  };
}
