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
  /** pids of Chrome main processes running on Ducter's profile root. */
  ducterBrowsers(): Promise<number[]>;
  /** The profile dir a Ducter browser pid runs on, if known. */
  profileOf?(pid: number): string | undefined;
  /** Make `pid` the frontmost app again. */
  activate(pid: number): Promise<void>;
}

export interface FocusGuardOptions {
  probe: FocusProbe;
  now?: () => number;
  graceMs?: number; // how long after launch an activation counts as a steal (default 5 s)
  idleStopMs?: number; // stop after no Ducter browser and no arm() for this long (default 60 s)
  onRevert?: (fromPid: number, toPid: number) => void;
  /** A Ducter browser process appeared (once per pid). */
  onLaunch?: (pid: number) => void;
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
      for (const p of pids) {
        if (firstSeen.has(p)) continue;
        firstSeen.set(p, t);
        o.onLaunch?.(p);
      }
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
  const profiles = new Map<number, string>();
  return {
    async front() {
      const asn = (await exec(["/usr/bin/lsappinfo", "front"], { timeoutMs: 2_000 })).out.replace(/:$/, "");
      if (!asn) return undefined;
      const r = await exec(["/usr/bin/lsappinfo", "info", "-only", "pid", asn], { timeoutMs: 2_000 });
      const m = /"pid"=(\d+)/.exec(r.out);
      return m ? Number(m[1]) : undefined;
    },
    async ducterBrowsers() {
      // Main browser processes only: helpers carry --type=.
      const r = await exec(["/bin/ps", "-axo", "pid=,command="], { timeoutMs: 2_000 });
      return parseDucterBrowsers(r.out, profileRoot, profiles);
    },
    profileOf: (pid) => profiles.get(pid),
    async activate(pid) {
      await exec([bin, "call", "bring_to_front", JSON.stringify({ pid }), "--socket", socket], { timeoutMs: 5_000 });
    },
  };
}

/** Parse `ps -axo pid=,command=` for Chrome main processes on a profile under `root`. */
export function parseDucterBrowsers(ps: string, root: string, profiles?: Map<number, string>): number[] {
  const flag = `--user-data-dir=${root}/`;
  const out: number[] = [];
  for (const line of ps.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const cmd = m[2]!;
    const at = cmd.indexOf(flag);
    if (at < 0 || / --type=/.test(cmd)) continue;
    const pid = Number(m[1]);
    out.push(pid);
    profiles?.set(pid, cmd.slice(at + "--user-data-dir=".length).split(" --")[0]!.trim());
  }
  return out;
}
