// Ducter's own browser, held by the main process (D144). One headless Chrome per persona profile
// (<dataDir>/browser-profiles/<name>), started when a task or the user needs it and quit cleanly
// (Browser.close, so cookies are saved) when nobody does. Tasks get tabs of their own; the live
// view (live.ts) and the Sites list (sites.ts) reach the same browser.
//
// The blind rule lives here: while a live view is open on a profile, `blind(profile)` is true and
// every task tool on it refuses before touching the page (tools.ts).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { profileRoot } from "@ducter/protocol/src/browser-profile.ts";
import { connectCdp, type CdpConn } from "./cdp.ts";
import { findChrome, launchChrome, type LaunchOptions, type Launched } from "./chrome.ts";

export interface TaskBrowser {
  taskId: string;
  profile: string;
  evidenceDir: string;
  downloads: string;
  tabs: string[]; // target ids this task opened (or its pages opened), oldest first
  current?: string;
}

export interface RunningBrowser {
  name: string;
  dir: string;
  cdp: CdpConn;
  launched?: Launched;
  /** Flat session per target (attached on first use). */
  sessions: Map<string, string>;
  /** Each launch gets a new generation: tab ids from an older one are gone. */
  gen: number;
}

export interface HostOptions {
  dataDir: string;
  env?: Record<string, string | undefined>;
  platform?: string;
  /** Running as root: Chrome needs --no-sandbox. */
  root?: boolean;
  /** Test seams. */
  find?: () => { path: string; version?: string } | undefined;
  launch?: (o: LaunchOptions) => Promise<Launched>;
  connect?: (url: string) => Promise<CdpConn | undefined>;
  /** Quit a browser nobody uses after this long (default 5 min). */
  idleMs?: number;
  /** The page language Chrome asks for (zh-CN or en-US). */
  lang?: () => string;
}

export interface BrowserHost {
  dataDir: string;
  find(): { path: string; version?: string } | undefined;
  /** The running browser for a profile, started if it isn't. */
  ensure(profile: string): Promise<RunningBrowser>;
  running(profile: string): RunningBrowser | undefined;
  attach(taskId: string, a: { profile: string; evidenceDir: string; downloads: string }): void;
  task(taskId: string): TaskBrowser | undefined;
  /** The task's current tab, opened (about:blank) if it has none; with its CDP session. */
  tab(taskId: string, opts?: { create?: boolean }): Promise<{ b: RunningBrowser; targetId: string; sessionId: string }>;
  /** A new tab for the task, made current. */
  newTab(taskId: string, url?: string): Promise<{ b: RunningBrowser; targetId: string; sessionId: string }>;
  session(b: RunningBrowser, targetId: string): Promise<string>;
  release(taskId: string): Promise<boolean>;
  setLive(profile: string, id: string | undefined): void;
  blind(profile: string): boolean;
  /** Something used this profile now (resets its idle timer). */
  touch(profile: string): void;
  close(profile: string): Promise<boolean>;
  stop(): Promise<void>;
}

export function createBrowserHost(o: HostOptions): BrowserHost {
  const root = profileRoot(o.dataDir);
  const idleMs = o.idleMs ?? 5 * 60_000;
  const find = o.find ?? (() => findChrome(o.dataDir, { env: o.env, platform: o.platform }));
  const launch = o.launch ?? ((x: LaunchOptions) => launchChrome(x));
  const connect = o.connect ?? ((u: string) => connectCdp(u));
  const browsers = new Map<string, RunningBrowser>();
  const starting = new Map<string, Promise<RunningBrowser>>();
  const tasks = new Map<string, TaskBrowser>();
  const live = new Map<string, string>(); // profile -> live view id
  const idle = new Map<string, ReturnType<typeof setTimeout>>();
  let gen = 0;

  const inUse = (profile: string) => live.has(profile) || [...tasks.values()].some((t) => t.profile === profile);

  const armIdle = (profile: string) => {
    const t = idle.get(profile);
    if (t) clearTimeout(t);
    if (!browsers.has(profile)) return;
    const timer = setTimeout(() => {
      idle.delete(profile);
      if (!inUse(profile)) void api.close(profile);
      else armIdle(profile);
    }, idleMs);
    (timer as { unref?: () => void }).unref?.();
    idle.set(profile, timer);
  };

  const forget = (profile: string, b: RunningBrowser) => {
    if (browsers.get(profile) !== b) return;
    browsers.delete(profile);
    for (const t of tasks.values()) if (t.profile === profile) (t.tabs = []), (t.current = undefined);
  };

  async function start(profile: string): Promise<RunningBrowser> {
    const chrome = find();
    if (!chrome) throw new Error("Ducter's browser isn't installed on this device: add Browse the web (上网) in Devices");
    const dir = join(root, profile);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const launched = await launch({
      chrome: chrome.path,
      profileDir: dir,
      ...(chrome.version ? { version: chrome.version } : {}),
      lang: o.lang?.() ?? "en-US",
      root: o.root ?? process.getuid?.() === 0,
      ...(o.platform ? { platform: o.platform } : {}),
    });
    const cdp = await connect(launched.wsUrl);
    if (!cdp) {
      launched.proc.kill();
      throw new Error("Ducter's browser started but its DevTools port didn't answer");
    }
    const b: RunningBrowser = { name: profile, dir, cdp, launched, sessions: new Map(), gen: ++gen };
    cdp.onClose(() => forget(profile, b));
    void launched.proc.exited?.then(() => forget(profile, b));
    // Pages a task's tab opens (target=_blank, window.open) become that task's tabs.
    cdp.on((e) => {
      if (e.method === "Target.targetCreated" && e.params?.targetInfo?.type === "page") {
        const info = e.params.targetInfo;
        const owner = [...tasks.values()].find((t) => t.profile === profile && info.openerId && t.tabs.includes(info.openerId));
        if (owner && !owner.tabs.includes(info.targetId)) owner.tabs.push(info.targetId), (owner.current = info.targetId);
      }
      if (e.method === "Target.targetDestroyed") {
        b.sessions.delete(e.params?.targetId);
        for (const t of tasks.values()) {
          if (t.profile !== profile) continue;
          t.tabs = t.tabs.filter((x) => x !== e.params?.targetId);
          if (t.current === e.params?.targetId) t.current = t.tabs[t.tabs.length - 1];
        }
      }
      if (e.method === "Target.detachedFromTarget") for (const [k, v] of b.sessions) if (v === e.params?.sessionId) b.sessions.delete(k);
    });
    await cdp.send("Target.setDiscoverTargets", { discover: true }).catch(() => {});
    return b;
  }

  const api: BrowserHost = {
    dataDir: o.dataDir,
    find,
    async ensure(profile) {
      const b = browsers.get(profile);
      if (b && !b.cdp.closed()) {
        armIdle(profile);
        return b;
      }
      let p = starting.get(profile);
      if (!p) {
        p = start(profile).finally(() => starting.delete(profile));
        starting.set(profile, p);
      }
      const nb = await p;
      browsers.set(profile, nb);
      armIdle(profile);
      return nb;
    },
    running: (profile) => browsers.get(profile),
    attach(taskId, a) {
      const had = tasks.get(taskId);
      tasks.set(taskId, { taskId, profile: a.profile, evidenceDir: a.evidenceDir, downloads: a.downloads, tabs: had?.profile === a.profile ? had.tabs : [], ...(had?.current && had.profile === a.profile ? { current: had.current } : {}) });
    },
    task: (taskId) => tasks.get(taskId),
    async session(b, targetId) {
      const have = b.sessions.get(targetId);
      if (have) return have;
      const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
      b.sessions.set(targetId, sessionId);
      await b.cdp.send("Page.enable", {}, sessionId).catch(() => {});
      return sessionId;
    },
    async newTab(taskId, url = "about:blank") {
      const t = tasks.get(taskId);
      if (!t) throw new Error("this task has no browser");
      const b = await api.ensure(t.profile);
      const { targetId } = await b.cdp.send("Target.createTarget", { url });
      t.tabs.push(targetId);
      t.current = targetId;
      const sessionId = await api.session(b, targetId);
      // Downloads land in the task's own folder (D144).
      mkdirSync(t.downloads, { recursive: true });
      await b.cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: t.downloads, eventsEnabled: true }).catch(() => {});
      return { b, targetId, sessionId };
    },
    async tab(taskId, opts = {}) {
      const t = tasks.get(taskId);
      if (!t) throw new Error("this task has no browser");
      const b = await api.ensure(t.profile);
      if (t.current && t.tabs.includes(t.current)) {
        try {
          return { b, targetId: t.current, sessionId: await api.session(b, t.current) };
        } catch {
          t.tabs = t.tabs.filter((x) => x !== t.current);
          t.current = undefined;
        }
      }
      if (opts.create === false) throw new Error("no page is open yet: use browser_open first");
      return api.newTab(taskId);
    },
    async release(taskId) {
      const t = tasks.get(taskId);
      if (!t) return false;
      tasks.delete(taskId);
      const b = browsers.get(t.profile);
      if (b) for (const id of t.tabs) await b.cdp.send("Target.closeTarget", { targetId: id }).catch(() => {});
      if (!inUse(t.profile)) return api.close(t.profile);
      return false;
    },
    setLive(profile, id) {
      if (id) live.set(profile, id);
      else live.delete(profile);
      armIdle(profile);
    },
    blind: (profile) => live.has(profile),
    touch: (profile) => armIdle(profile),
    async close(profile) {
      const b = browsers.get(profile);
      const t = idle.get(profile);
      if (t) clearTimeout(t), idle.delete(profile);
      if (!b) return false;
      browsers.delete(profile);
      for (const tb of tasks.values()) if (tb.profile === profile) (tb.tabs = []), (tb.current = undefined);
      let ok = false;
      try {
        await b.cdp.send("Browser.close", {}, undefined, 5_000);
        ok = true;
      } catch (e) {
        ok = (e as Error).message === "closed";
      }
      b.cdp.close();
      if (b.launched) {
        const exited = await Promise.race([b.launched.proc.exited.then(() => true), Bun.sleep(5_000).then(() => false)]);
        if (!exited) b.launched.proc.kill();
      }
      return ok;
    },
    async stop() {
      await Promise.all([...browsers.keys()].map((p) => api.close(p)));
    },
  };
  return api;
}
