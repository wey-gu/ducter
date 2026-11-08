// Focus guard for browser places on macOS.
//
// Observed (2026-11-09, cua-driver 0.44.0): `browser_prepare` with an isolated profile spawns
// Chrome directly, and the new Chrome makes itself the frontmost app. The user's keystrokes
// then land in Ducter's browser for the whole task, although the driver reports
// foregrounded_window:false. The typed browser tools work in the background, so Ducter puts
// back whatever app the user was in.
//
// Rule: only a Ducter Chrome that STARTED in the last `graceMs` is pushed back. After that,
// the user clicking that window (to watch, or to sign in) is respected.
import type { Exec } from "./browser.ts";

export interface FocusProbe {
  /** pid of the frontmost app, if known. */
  front(): Promise<number | undefined>;
  /** pids of Chrome processes running on Ducter's profile root. */
  ducterBrowsers(): Promise<number[]>;
  /** Make `pid` the frontmost app again. */
  activate(pid: number): Promise<void>;
}

export interface FocusGuardOptions {
  probe: FocusProbe;
  now?: () => number;
  graceMs?: number; // how long after launch an activation counts as a steal (default 5 s)
  idleStopMs?: number; // stop after no Ducter browser and no arm() for this long (default 60 s)
  onRevert?: (fromPid: number, toPid: number) => void;
}

export interface FocusGuard {
  /** A browser task is starting: keep watching (starts the loop if stopped). */
  arm(): void;
  /** One observation step (exported for tests; the loop calls it). */
  tick(): Promise<void>;
  stop(): void;
  readonly running: boolean;
}

export function createFocusGuard(o: FocusGuardOptions, intervalMs = 250): FocusGuard {
  const now = o.now ?? Date.now;
  const grace = o.graceMs ?? 5_000;
  const idleStop = o.idleStopMs ?? 60_000;
  const firstSeen = new Map<number, number>();
  let lastOther: number | undefined;
  let lastActivity = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const t = now();
      const pids = await o.probe.ducterBrowsers();
      const live = new Set(pids);
      for (const p of pids) if (!firstSeen.has(p)) firstSeen.set(p, t);
      for (const p of [...firstSeen.keys()]) if (!live.has(p)) firstSeen.delete(p);
      if (pids.length) lastActivity = t;
      const front = await o.probe.front();
      if (front === undefined) return;
      if (!live.has(front)) {
        lastOther = front;
        return;
      }
      const born = firstSeen.get(front)!;
      if (t - born <= grace && lastOther !== undefined && lastOther !== front) {
        await o.probe.activate(lastOther).catch(() => {});
        o.onRevert?.(front, lastOther);
      }
    } finally {
      busy = false;
    }
  }

  function loop() {
    if (!running) return;
    timer = setTimeout(async () => {
      await tick().catch(() => {});
      if (now() - lastActivity > idleStop && firstSeen.size === 0) return stop();
      loop();
    }, intervalMs);
    (timer as any).unref?.();
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  return {
    arm() {
      lastActivity = now();
      if (running) return;
      running = true;
      loop();
    },
    tick,
    stop,
    get running() {
      return running;
    },
  };
}

/** macOS probe: lsappinfo (no permission needed), pgrep, and cua-driver's bring_to_front. */
export function macFocusProbe(exec: Exec, bin: string, socket: string, profileRoot: string): FocusProbe {
  return {
    async front() {
      const asn = (await exec(["/usr/bin/lsappinfo", "front"], { timeoutMs: 2_000 })).out.replace(/:$/, "");
      if (!asn) return undefined;
      const r = await exec(["/usr/bin/lsappinfo", "info", "-only", "pid", asn], { timeoutMs: 2_000 });
      const m = /"pid"=(\d+)/.exec(r.out);
      return m ? Number(m[1]) : undefined;
    },
    async ducterBrowsers() {
      // Only the browser's main process carries the profile root as --user-data-dir= and
      // becomes an app; helpers that match too are harmless (they are never frontmost).
      const pattern = `--user-data-dir=${profileRoot}/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const r = await exec(["/usr/bin/pgrep", "-f", "--", pattern], { timeoutMs: 2_000 });
      return r.out.split("\n").map((s) => Number(s.trim())).filter((n) => n > 0);
    },
    async activate(pid) {
      await exec([bin, "call", "bring_to_front", JSON.stringify({ pid }), "--socket", socket], { timeoutMs: 5_000 });
    },
  };
}
