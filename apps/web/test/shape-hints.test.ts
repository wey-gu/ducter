// D317: the page asks the screen itself whether it folds before it reads a model name.
import { describe, expect, test } from "bun:test";
import { myShape, screenHints } from "../src/conn.ts";

const reduced = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/130 Mobile";
const none = { matchMedia: () => ({ matches: false }) };

describe("screenHints", () => {
  test("viewport segments, the CSS query, and the posture", () => {
    expect(screenHints({ viewport: { segments: [{}, {}] } })).toEqual({ segments: 2 });
    expect(screenHints({ visualViewport: { segments: [{}] } })).toEqual({ segments: 1 });
    expect(screenHints({ matchMedia: (q: string) => ({ matches: q.startsWith("(horizontal") }) })).toEqual({ segments: 2 });
    expect(screenHints({ ...none, navigator: { devicePosture: { type: "folded" } } })).toEqual({ posture: "folded" });
    expect(screenHints(none)).toEqual({});
    expect(screenHints({ get viewport() { throw new Error("no"); } })).toEqual({});
  });
});

describe("myShape", () => {
  test("a reduced user agent on a dual screen or a bent fold is a foldable", () => {
    expect(myShape(reduced, 5, { width: 412, height: 915 }, { segments: 2 })).toBe("foldable");
    expect(myShape(reduced, 5, { width: 412, height: 915 }, { posture: "folded" })).toBe("foldable");
    expect(myShape(reduced, 5, { width: 412, height: 915 }, { posture: "continuous" })).toBe("phone");
  });
  test("a computer says no shape", () => {
    expect(myShape("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130", 0, { width: 1440, height: 900 }, { segments: 2 })).toBeUndefined();
  });
});
