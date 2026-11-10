// Ducter's own browser (D151): installed on one tap, held by the main process, driven by Ducter's
// browser tools, signed into by the user through a live view, with a Sites list.
import type { DucterBrowserPort, LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub } from "../mcp.ts";
import { installChrome, type InstallResult, type InstallStep } from "./chrome.ts";
import { createBrowserHost, type BrowserHost, type HostOptions } from "./host.ts";
import { createLive, type Live, type LiveDeps } from "./live.ts";
import { createSites, type Sites } from "./sites.ts";
import { registerBrowserTools } from "./tools.ts";
import { checkBrowser, checkLine } from "./check.ts";
import type { BrowserAbout, BrowserCheck } from "@ducter/protocol";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";
import type { WorkerLinks } from "@ducter/protocol/src/internal.ts";
import { remoteBrowserHost, routedHost } from "./remote.ts";

export type BrowserSetup =
  | { state: "ready"; version: string }
  | { state: "missing" }
  | { state: "installing"; step?: InstallStep }
  | { state: "deps"; command: string; why?: "sandbox" }
  | { state: "failed"; message: string };

export interface DucterBrowser {
  host: BrowserHost;
  live: Live;
  sites: Sites;
  port: DucterBrowserPort;
  setup(): BrowserSetup;
  /** D154: start it on the persona's profile, load a page (example.com), quit; which browser and how long. */
  check(url?: string): Promise<BrowserCheck>;
  /** D154: which browser the persona's profile runs on. */
  about(): BrowserAbout;
  /** Start installing (once at a time); resolves with the result. */
  install(): Promise<InstallResult>;
  onChange(fn: () => void): () => void;
  stop(): Promise<void>;
}

export interface DucterBrowserOptions extends HostOptions {
  mcp: CoreMcpHub;
  log: LogStore;
  tasks: TaskRegistry;
  decisions: LiveDeps["decisions"];
  persona: string;
  /** Test seam: the installer. */
  installer?: () => Promise<InstallResult>;
  /** D157: the paired workers, whose own Ducter browser the main drives over their socket. */
  workers?: () => WorkerLinks | undefined;
  /** D157: the version of Ducter's browser a worker reported (its 上网 detail). */
  workerBrowserVersion?: (deviceId: string) => string | undefined;
}

export function createDucterBrowser(o: DucterBrowserOptions): DucterBrowser {
  const home = createBrowserHost(o);
  // D157: each worker's own browser, driven over its socket; made the first time it's needed.
  const remotes = new Map<string, BrowserHost>();
  const host = routedHost(home, (deviceId) => {
    const have = remotes.get(deviceId);
    if (have) return have;
    const link = o.workers?.()?.link(deviceId);
    if (!link) return undefined;
    const h = remoteBrowserHost(link, { dataDir: o.dataDir, ...(o.lang ? { lang: o.lang } : {}), ...(o.idleMs ? { idleMs: o.idleMs } : {}), version: () => o.workerBrowserVersion?.(deviceId) });
    remotes.set(deviceId, h);
    return h;
  });
  const live = createLive({ host, decisions: o.decisions, tasks: o.tasks as LiveDeps["tasks"], persona: o.persona });
  const sites = createSites(host);
  registerBrowserTools({ mcp: o.mcp, host, log: o.log, tasks: o.tasks as any });
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((f) => f());
  let installing: Promise<InstallResult> | undefined;
  let step: InstallStep | undefined;
  let last: InstallResult | undefined;
  const root = o.root ?? process.getuid?.() === 0;

  const setup = (): BrowserSetup => {
    if (installing) return { state: "installing", ...(step ? { step } : {}) };
    const found = host.find();
    if (found) return { state: "ready", version: found.version ?? "system" };
    if (last && !last.ok) return last.reason === "deps" ? { state: "deps", command: last.command } : last.reason === "sandbox" ? { state: "deps", command: last.command, why: "sandbox" } : { state: "failed", message: last.message };
    return { state: "missing" };
  };

  const install = () => {
    installing ??= (async () => {
      changed();
      try {
        return await (o.installer ?? (() => installChrome({ dataDir: o.dataDir, root, onStep: (s) => ((step = s), changed()) })))();
      } catch (e) {
        return { ok: false, reason: "failed", message: (e as Error).message } as InstallResult;
      }
    })().then((r) => {
      last = r;
      installing = undefined;
      step = undefined;
      changed();
      if (r.ok) console.log(`[ducter] browser: Chrome ${r.version} installed at ${r.path}`);
      else console.warn(`[ducter] browser: install ${r.reason === "deps" || r.reason === "sandbox" ? `needs: ${r.command}` : `failed: ${r.message}`}`);
      return r;
    });
    return installing;
  };

  const port: DucterBrowserPort = {
    async status() {
      const s = setup();
      if (s.state === "ready") return { ok: true, version: s.version };
      const why =
        s.state === "installing"
          ? "Ducter is installing its browser on this device right now; try again in a minute"
          : s.state === "deps"
            ? s.why === "sandbox"
              ? `This system doesn't let Ducter's browser start its sandbox; run once: ${s.command}`
              : `Ducter's browser needs system libraries here; run: ${s.command}`
            : s.state === "failed"
              ? `Ducter's browser couldn't be set up here: ${s.message}`
              : "Ducter's browser isn't installed on this device: add Browse the web (上网) in Devices, or run `ducter ability add browser`";
      return { ok: false, why };
    },
    attach: (taskId, a) => host.attach(taskId, a),
    release: (taskId) => host.release(taskId),
  };

  const profile = () => profileName(o.persona);
  const check = (url?: string) => checkBrowser(host, setup(), profile(), url);

  // D154: asked whether browsing works, the partner looks itself (no task): on a server, or
  // wherever Ducter's own browser is the one tasks use.
  const env = o.env ?? process.env;
  const ducterMode = () => (o.platform ?? process.platform) === "linux" || /^ducter$/i.test((env.DUCTER_BROWSER_DRIVER ?? "").trim());
  if (ducterMode())
    o.mcp.register(
      "partner",
      "browser_check",
      "Check that Ducter's own browser on this machine works, with no task: it starts the browser, opens a harmless page and closes it again (a few seconds). Use it when the user asks you to verify browsing or the browser they just added, instead of opening a task. Returns which browser it is and how long it took; say that to the user in one plain sentence in their language.",
      { type: "object", properties: {} },
      async () => checkLine(await check()),
    );

  return {
    host,
    live,
    sites,
    port,
    setup,
    check,
    about: () => host.about(profile()),
    install,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop: async () => {
      await host.stop();
      await Promise.all([...remotes.values()].map((h) => h.stop()));
    },
  };
}
