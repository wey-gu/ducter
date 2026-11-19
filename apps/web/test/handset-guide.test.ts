// 用这台手机 / Use this phone's guide (D238, order fixed in D246): step 1 allows restricted settings
// (its two parts: meet Android's block once, then App info › ⋮ › Allow), step 2 turns Ducter on, and
// step 2 opens only once step 1 is done. A phone Android doesn't restrict has step 2 alone.
import { describe, expect, test } from "bun:test";
import type { HandsetState } from "@ducter/protocol";

const st = (o: Partial<HandsetState>): HandsetState => ({ bridge: 1, sdk: 36, model: "Pixel Fold", service: false, pictures: true, ...o });

describe("the Use this phone guide (D246)", () => {
  test("restricted: allow first, then turn on; each part ticks from the app's own state", async () => {
    const { steps, current } = await import("../src/handset.tsx");
    const g = { visited: new Set<string>() };
    expect(steps(st({ restricted: true, seen: false }), g)).toEqual(["allow", "on"]);
    expect(current(st({ restricted: true, seen: false }), g)).toBe("try");
    expect(current(st({ restricted: true, seen: true }), g)).toBe("allow");
    // Allowed: step 1 stays in the list (ticked) and step 2 opens.
    expect(steps(st({ restricted: false }), g)).toEqual(["allow", "on"]);
    expect(current(st({ restricted: false }), g)).toBe("on");
    expect(current(st({ restricted: false, service: true }), g)).toBe("done");
  });

  test("step 2 never opens while restricted settings are still on", async () => {
    const { current } = await import("../src/handset.tsx");
    const g = { visited: new Set<string>(["try", "on"]) };
    expect(current(st({ restricted: true, seen: false }), g)).toBe("try");
    expect(current(st({ restricted: true, seen: true }), g)).toBe("allow");
  });

  test("not restricted (a store install, Android 12 or older): one step", async () => {
    const { steps, current } = await import("../src/handset.tsx");
    expect(steps(st({ restricted: false }), { visited: new Set() })).toEqual(["on"]);
    expect(steps(st({ sdk: 32 }), { visited: new Set() })).toEqual(["on"]);
    expect(current(st({ restricted: false }), { visited: new Set() })).toBe("on");
  });

  test("an app that can't tell (or is older): the visits move the guide on", async () => {
    const { steps, current } = await import("../src/handset.tsx");
    const g = { visited: new Set<string>() };
    expect(steps(st({}), g)).toEqual(["allow", "on"]);
    expect(current(st({}), g)).toBe("try");
    g.visited.add("try");
    expect(current(st({ restricted: true }), g)).toBe("allow");
    g.visited.add("allow");
    expect(current(st({ restricted: true }), g)).toBe("on");
  });
});
