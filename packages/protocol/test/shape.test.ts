// D263: a handheld's shape, from its model, its browser, or its name.
import { describe, expect, test } from "bun:test";
import { clientShape, shapeFromBrowser, shapeOfModel } from "../src/index.ts";

describe("shapeOfModel", () => {
  test("book-style folds are foldables; flips stay phones", () => {
    for (const m of ["Pixel Fold", "Pixel 9 Pro Fold", "SM-F946B", "Galaxy Z Fold5", "OnePlus Open", "vivo X Fold3", "HUAWEI Mate X5"]) expect(shapeOfModel(m)).toBe("foldable");
    for (const m of ["SM-F731B", "Galaxy Z Flip6", "motorola razr 50"]) expect(shapeOfModel(m)).toBe("phone");
  });
  test("tablets", () => {
    for (const m of ["Pixel Tablet", "iPad", "SM-X710", "Galaxy Tab S9", "Xiaomi Pad 6", "MatePad Pro"]) expect(shapeOfModel(m)).toBe("tablet");
  });
  test("a phone's model says nothing", () => {
    for (const m of ["Pixel 8", "SM-S918B", "", undefined]) expect(shapeOfModel(m)).toBeUndefined();
  });
});

describe("shapeFromBrowser", () => {
  const phone = { width: 412, height: 915 };
  test("an iPad, also as Safari's Macintosh with touch", () => {
    expect(shapeFromBrowser("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5, { width: 820, height: 1180 })).toBe("tablet");
    expect(shapeFromBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5, { width: 820, height: 1180 })).toBe("tablet");
    expect(shapeFromBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5, { width: 393, height: 852 })).toBe("phone");
  });
  test("Android: the model first, else the screen", () => {
    expect(shapeFromBrowser("Mozilla/5.0 (Linux; Android 14; Pixel Fold Build/AP1A; wv) AppleWebKit/537.36", 5, phone)).toBe("foldable");
    expect(shapeFromBrowser("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/130 Mobile", 5, phone)).toBe("phone");
    expect(shapeFromBrowser("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/130", 5, { width: 1280, height: 800 })).toBe("tablet");
  });
});

describe("clientShape", () => {
  test("the Android model, then what it said, then an iPad name, else a phone", () => {
    expect(clientShape({ name: "Android phone · Ducter", shape: "phone", handset: { state: { model: "Pixel Fold" } } })).toBe("foldable");
    expect(clientShape({ name: "iPad · Ducter", shape: "tablet" })).toBe("tablet");
    expect(clientShape({ name: "iPad · Safari" })).toBe("tablet"); // a home before D263
    expect(clientShape({ name: "iPhone" })).toBe("phone");
    expect(clientShape({ name: "Pixel Fold · Ducter", shape: "bogus" as any })).toBe("phone");
  });
});
