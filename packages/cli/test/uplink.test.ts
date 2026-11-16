// D293: a worker's socket liveness and its sessions through a drop, on a fake clock.
import { expect, test } from "bun:test";
import { createHold, createPinger, type Clock } from "../src/uplink.ts";

function fakeClock(): Clock & { advance(ms: number): void; at: number } {
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const c = {
    at: 0,
    now: () => c.at,
    setTimeout: (fn: () => void, ms: number) => (timers.set(++id, { at: c.at + ms, fn }), id),
    clearTimeout: (t: unknown) => void timers.delete(t as number),
    advance(ms: number) {
      const end = c.at + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        c.at = Math.max(c.at, next[1].at); // a late timer fires late (a computer that slept)
        next[1].fn();
      }
      c.at = end;
    },
  };
  return c;
}

test("the pinger pings every 15 s and closes a socket the home stopped answering after 45 s", () => {
  const c = fakeClock();
  let pings = 0;
  const killed: string[] = [];
  const p = createPinger({ clock: c, ping: () => pings++, kill: (w) => killed.push(w) });
  p.start();
  c.advance(15_000);
  p.heard(); // the pong
  c.advance(30_000);
  expect(pings).toBe(3);
  expect(killed).toEqual([]);
  c.advance(30_000); // 60 s since the last answer
  expect(killed).toEqual(["silent"]);
});

test("the pinger redials at once after the computer slept (its tick came far too late)", () => {
  const c = fakeClock();
  const killed: string[] = [];
  const p = createPinger({ clock: c, ping: () => {}, kill: (w) => killed.push(w) });
  p.start();
  // Asleep for 10 minutes: the timer fires once, late.
  c.at += 10 * 60_000;
  c.advance(0);
  expect(killed).toEqual(["woke"]);
});

test("the hold keeps what sessions say while the socket is down and flushes it in order on welcome", () => {
  const c = fakeClock();
  let expired = 0;
  const h = createHold({ clock: c, expire: () => void expired++ });
  const sent: any[] = [];
  h.up((f) => sent.push(f));
  h.send({ t: "ev", key: "k1", n: 1 });
  h.down(1);
  h.send({ t: "ev", key: "k1", n: 2 });
  h.send({ t: "res", id: 9 }); // an answer to a request that went with the socket: dropped
  h.send({ t: "end", key: "k2" });
  expect(h.held(["k1"])).toEqual(["k1", "k2"]);
  c.advance(60_000);
  h.up((f) => sent.push(f));
  expect(sent).toEqual([{ t: "ev", key: "k1", n: 1 }, { t: "ev", key: "k1", n: 2 }, { t: "end", key: "k2" }]);
  c.advance(120_000);
  expect(expired).toBe(0);
});

test("past the 2-minute grace the sessions close (the home resumes them by id later)", () => {
  const c = fakeClock();
  let expired = 0;
  const h = createHold({ clock: c, expire: () => void expired++ });
  h.down(2);
  h.send({ t: "ev", key: "k1" });
  c.advance(119_000);
  expect(expired).toBe(0);
  c.advance(2_000);
  expect(expired).toBe(1);
  expect(h.held([])).toEqual([]);
  // Nothing to hold: no grace at all.
  const g = createHold({ clock: c, expire: () => void expired++ });
  g.down(0);
  expect(g.holding()).toBe(false);
});

test("too much said during the grace ends it early rather than growing without bound", () => {
  const c = fakeClock();
  let expired = 0;
  const h = createHold({ clock: c, expire: () => void expired++, maxFrames: 3 });
  h.down(1);
  for (let i = 0; i < 4; i++) h.send({ t: "ev", key: "k1", i });
  expect(expired).toBe(1);
});
