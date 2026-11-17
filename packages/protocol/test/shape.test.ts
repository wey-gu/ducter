// D263: a handheld's shape, from its model, its browser, or its name.
import { describe, expect, test } from "bun:test";
import { clientShape, shapeFromBrowser, shapeOfModel } from "../src/index.ts";

describe("shapeOfModel", () => {
  test("book-style folds are foldables; flips stay phones", () => {
    for (const m of ["Pixel Fold", "Pixel 9 Pro Fold", "SM-F946B", "Galaxy Z Fold5", "OnePlus Open", "vivo X Fold3", "HUAWEI Mate X5"]) expect(shapeOfModel(m)).toBe("foldable");
    for (const m of ["SM-F731B", "Galaxy Z Flip6", "motorola razr 50"]) expect(shapeOfModel(m)).toBe("phone");
  });
  test("D317: more folds and dual screens; more flips stay phones", () => {
    for (const m of ["Surface Duo", "Surface Duo 2", "Xiaomi MIX Fold 4", "MIX Fold3", "vivo X Fold5", "V2303A X Fold2", "TECNO PHANTOM V Fold2 5G", "HONOR Magic V3", "OPPO Find N5", "iPhone Fold", "iPhone Duo"]) expect(shapeOfModel(m)).toBe("foldable");
    for (const m of ["HONOR Magic V Flip", "OPPO Find N3 Flip", "vivo X Flip", "Xiaomi MIX Flip", "motorola razr 2024", "TECNO PHANTOM V Flip2", "SM-F741B"]) expect(shapeOfModel(m)).toBe("phone");
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
  test("D317: the screen's own segments or posture before the model and the size", () => {
    const reduced = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/130";
    expect(shapeFromBrowser(reduced, 5, { width: 884, height: 1104 }, { segments: 2 })).toBe("foldable");
    expect(shapeFromBrowser(reduced, 5, phone, { posture: "folded" })).toBe("foldable");
    expect(shapeFromBrowser(reduced, 5, phone, { segments: 1, posture: "continuous" })).toBe("phone");
  });
  test("D317: an iPhone Duo's inner screen in Safari; its outer one is a phone (research/111)", () => {
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 Version/27.1 Mobile/15E148 Safari/604.1";
    expect(shapeFromBrowser(safari, 5, { width: 951, height: 700 })).toBe("foldable");
    expect(shapeFromBrowser(safari, 5, { width: 382, height: 618 })).toBe("phone");
  });
  test("D317: Ducter's own app says its shape in its user agent, first", () => {
    expect(shapeFromBrowser("Mozilla/5.0 (Linux; Android 14; K; wv) Chrome/130 DucterApp/0.0.66 DucterShape/foldable", 5, phone)).toBe("foldable");
    expect(shapeFromBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Mobile/15E148 DucterApp/0.0.66 DucterShape/foldable", 5, { width: 800, height: 1000 })).toBe("foldable");
    expect(shapeFromBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Mobile/15E148 DucterApp/0.0.66 DucterShape/phone", 5, { width: 393, height: 852 })).toBe("phone");
  });
});

describe("clientShape", () => {
  test("the Android model, then what it said, then an iPad name, else a phone", () => {
    expect(clientShape({ name: "Android phone · Ducter", shape: "phone", handset: { state: { model: "Pixel Fold" } } })).toBe("foldable");
    expect(clientShape({ name: "Android phone", shape: "tablet", handset: { state: { model: "K9", foldable: true } } })).toBe("foldable"); // D317: its hinge
    expect(clientShape({ name: "iPad · Ducter", shape: "tablet" })).toBe("tablet");
    expect(clientShape({ name: "iPad · Safari" })).toBe("tablet"); // a home before D263
    expect(clientShape({ name: "iPhone" })).toBe("phone");
    expect(clientShape({ name: "Pixel Fold · Ducter", shape: "bogus" as any })).toBe("phone");
  });
});
