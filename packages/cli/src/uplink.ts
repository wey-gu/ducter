// D293: what keeps a worker's one socket to its home honest. Two small pieces, each driven by an
// injected clock so tests run them with a fake one:
// - the pinger: a ping every 15 s; no answer of any kind for 45 s closes the socket (a laptop that
//   changed Wi-Fi leaves it half-open), and a tick that comes much later than it should means the
//   computer slept, so the socket is redialled at once instead of waiting out the 45 s;
// - the hold: after a drop the worker keeps its sessions for 2 minutes and keeps what they say;
//   back in time, the home reattaches them and gets what it missed; past the grace they close and
//   the home resumes them by id later (as before D293).

export const PING_MS = 15_000;
export const DEAD_MS = 45_000;
export const HOLD_MS = 120_000;
/** A tick this much later than due: the computer was asleep. */
const SLEPT_MS = 10_000;
/** What a hold keeps while the socket is down; past it, the grace ends early (the home resumes by id). */
const HOLD_MAX_FRAMES = 5000;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    (t as any).unref?.();
    return t;
  },
  clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/**
 * Pings while the socket is open. kill(why) when the home stopped answering ("silent") or the
 * computer just woke ("woke"); heard() on every frame from the home.
 */
export function createPinger(o: { clock: Clock; ping(): void; kill(why: "silent" | "woke"): void; pingMs?: number; deadMs?: number }) {
  const every = o.pingMs ?? PING_MS;
  const dead = o.deadMs ?? DEAD_MS;
  let heardAt = 0;
  let dueAt = 0;
  let timer: unknown;
  let on = false;
  const tick = () => {
    if (!on) return;
    const now = o.clock.now();
    if (now - dueAt > SLEPT_MS) return stop(), o.kill("woke");
    if (now - heardAt > dead) return stop(), o.kill("silent");
    try {
      o.ping();
    } catch {}
    dueAt = now + every;
    timer = o.clock.setTimeout(tick, every);
  };
  const stop = () => {
    on = false;
    o.clock.clearTimeout(timer);
  };
  return {
    start() {
      on = true;
      heardAt = o.clock.now();
      dueAt = heardAt + every;
      timer = o.clock.setTimeout(tick, every);
    },
    heard: () => void (heardAt = o.clock.now()),
    stop,
  };
}

/**
 * Sessions through a drop. send() goes to the socket when it is up, else is kept (only what
 * sessions say: an answer to a request went with the socket). down() starts the grace; up(send)
 * flushes what was kept, in order. Past the grace (or too much kept), expire() closes the sessions.
 */
export function createHold(o: { clock: Clock; expire(): void | Promise<void>; graceMs?: number; maxFrames?: number }) {
  let sink: ((f: object) => void) | undefined;
  const kept: { key?: string; f: object }[] = [];
  let timer: unknown;
  let holding = false;
  const end = () => {
    o.clock.clearTimeout(timer);
    holding = false;
    kept.length = 0;
    void o.expire();
  };
  return {
    send(f: object) {
      if (sink) return sink(f);
      const t = (f as { t?: string }).t;
      if (!holding || (t !== "ev" && t !== "end" && t !== "cdp")) return;
      kept.push({ key: (f as { key?: string }).key, f });
      if (kept.length > (o.maxFrames ?? HOLD_MAX_FRAMES)) end();
    },
    /** The socket is gone: hold the sessions (if there are any) for the grace. */
    down(sessions: number) {
      sink = undefined;
      if (holding || !sessions) return;
      holding = true;
      timer = o.clock.setTimeout(end, o.graceMs ?? HOLD_MS);
    },
    /** Keys the home should keep: the sessions alive here plus any whose last words are still kept. */
    held(alive: string[]): string[] {
      return [...new Set([...alive, ...kept.map((k) => k.key).filter((k): k is string => !!k)])];
    },
    holding: () => holding,
    /** The home said welcome: flush, in order, and send straight on from now. */
    up(send: (f: object) => void) {
      o.clock.clearTimeout(timer);
      holding = false;
      sink = send;
      for (const k of kept.splice(0)) send(k.f);
    },
  };
}
