// D425: the waiting line's shared model, on the fixture the Mac checks too.
import { expect, test } from "bun:test";
import fixture from "../fixtures/alive.json";
import { aliveCadence, aliveFace, aliveMotion, aliveSub, aliveWords } from "../src/alive.ts";

test("words: the step's key and its object, clipped", () => {
  for (const c of fixture.words) {
    const got = aliveWords(c.in as never);
    expect({ name: JSON.stringify(c.in), ...got }).toEqual({ name: JSON.stringify(c.in), key: c.key, ...(c.arg !== undefined ? { arg: c.arg } : {}) });
  }
});

test("motion and face per step; settle after a long step; still wins", () => {
  for (const c of fixture.motion) expect(`${c.step}@${c.stepMs}:${aliveMotion(c.step as never, c.stepMs, !!c.still)}`).toBe(`${c.step}@${c.stepMs}:${c.want}`);
  for (const c of fixture.face) expect(`${c.step}:${aliveFace(c.step as never)}`).toBe(`${c.step}:${c.want}`);
});

test("the reassurance by the step's time", () => {
  for (const c of fixture.sub) expect(aliveSub(c.stepMs)).toBe(c.want as never);
});

test("cadence: a line dwells before the next replaces it", () => {
  for (const c of fixture.cadence) {
    const got = aliveCadence((c as { shown?: string }).shown, c.shownAt, c.wanted, c.now);
    expect({ name: c.name, ...got }).toEqual({ name: c.name, line: c.line, changed: c.changed, waitMs: c.waitMs });
  }
});
