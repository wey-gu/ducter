// Injectable clock so timers (decision defaults, batching) are testable with a fake clock.
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Manual clock for tests: time moves only on advance(). */
export class FakeClock implements Clock {
  private t: number;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private nextId = 1;
  constructor(start = Date.parse("2026-11-08T12:00:00Z")) {
    this.t = start;
  }
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers.delete(h as number);
  }
  advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      let due: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
      if (!due) break;
      this.timers.delete(due[0]);
      this.t = Math.max(this.t, due[1].at);
      due[1].fn();
    }
    this.t = target;
  }
}

/**
 * D627: a wrap of the work's clock that holds every timer while a home is frozen for a move.
 * The timer stays queued (not lost); release runs the due ones and re-schedules the rest. Only the
 * work's own clock is wrapped, so a running turn's own session timers are untouched.
 */
export class HeldClock implements Clock {
  private held = false;
  private next = 1;
  private timers = new Map<number, { fn: () => void; at: number; base?: unknown }>();
  constructor(private readonly base: Clock) {}
  now(): number {
    return this.base.now();
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.next++;
    const t: { fn: () => void; at: number; base?: unknown } = { fn, at: this.now() + Math.max(0, ms) };
    this.timers.set(id, t);
    if (!this.held) this.schedule(id, t);
    return id;
  }
  clearTimeout(handle: unknown): void {
    const t = this.timers.get(handle as number);
    if (t?.base !== undefined) this.base.clearTimeout(t.base);
    this.timers.delete(handle as number);
  }
  hold(): void {
    this.held = true;
  }
  release(): void {
    this.held = false;
    for (const [id, t] of [...this.timers]) {
      if (t.base !== undefined) continue; // a live timer will fire at its own time
      if (t.at <= this.now()) {
        this.timers.delete(id);
        t.fn();
      } else this.schedule(id, t);
    }
  }
  private schedule(id: number, t: { fn: () => void; at: number; base?: unknown }): void {
    t.base = this.base.setTimeout(() => {
      t.base = undefined;
      if (this.held) {
        // Fired while held: queue it with its due time; release runs it if it is due by then.
        this.timers.set(id, t);
        return;
      }
      this.timers.delete(id);
      t.fn();
    }, Math.max(0, t.at - this.now()));
  }
}
