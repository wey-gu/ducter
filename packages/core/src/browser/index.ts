// Ducter's own browser (D144): installed on one tap, held by the main process, driven by Ducter's
// browser tools, signed into by the user through a live view, with a Sites list.
import type { DucterBrowserPort, LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub } from "../mcp.ts";
import { installChrome, type InstallResult, type InstallStep } from "./chrome.ts";
import { createBrowserHost, type BrowserHost, type HostOptions } from "./host.ts";
import { createLive, type Live, type LiveDeps } from "./live.ts";
import { createSites, type Sites } from "./sites.ts";
import { registerBrowserTools } from "./tools.ts";

export type BrowserSetup =
  | { state: "ready"; version: string }
  | { state: "missing" }
  | { state: "installing"; step?: InstallStep }
  | { state: "deps"; command: string }
  | { state: "failed"; message: string };

export interface DucterBrowser {
  host: BrowserHost;
  live: Live;
  sites: Sites;
  port: DucterBrowserPort;
  setup(): BrowserSetup;
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
}

export function createDucterBrowser(o: DucterBrowserOptions): DucterBrowser {
  const host = createBrowserHost(o);
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
    if (last && !last.ok) return last.reason === "deps" ? { state: "deps", command: last.command } : { state: "failed", message: last.message };
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
      else console.warn(`[ducter] browser: install ${r.reason === "deps" ? `needs: ${r.command}` : `failed: ${r.message}`}`);
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
            ? `Ducter's browser needs system libraries here; run: ${s.command}`
            : s.state === "failed"
              ? `Ducter's browser couldn't be set up here: ${s.message}`
              : "Ducter's browser isn't installed on this device: add Browse the web (上网) in Devices, or run `ducter ability add browser`";
      return { ok: false, why };
    },
    attach: (taskId, a) => host.attach(taskId, a),
    release: (taskId) => host.release(taskId),
  };

  return {
    host,
    live,
    sites,
    port,
    setup,
    install,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop: () => host.stop(),
  };
}
