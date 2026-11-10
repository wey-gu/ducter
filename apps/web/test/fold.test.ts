// D178, D182: the client in the Android app and on a foldable.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deviceName } from "../src/conn.ts";
import { BOOK_MIN, markSplit, readFold, splitFor, type Fold } from "../src/fold.ts";
import { strings } from "../src/i18n.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const book = (start: number, end = start, state: Fold["state"] = "half"): Fold => ({ axis: "vertical", state, start, end });

describe("the fold splits the panes", () => {
  test("held open like a book: the conversation left of the fold, On hand right of it", () => {
    // A Pixel Fold's inner screen: 841 × 701 CSS px, a seamless fold at 421.
    expect(splitFor(book(421), 841, 701)).toEqual({ kind: "book", a: 421, gap: 0 });
    // Flat, the fold is still there: a column laid across it would put the crease under the words.
    expect(splitFor(book(421, 421, "flat"), 841, 701)).toEqual({ kind: "book", a: 421, gap: 0 });
  });
  test("a hinge with width: the panes leave it empty", () => {
    expect(splitFor(book(540, 574, "flat"), 1114, 720)).toEqual({ kind: "book", a: 540, gap: 34 });
  });
  test("too narrow on a side for a pane: no split", () => {
    expect(splitFor(book(BOOK_MIN - 1), 700, 800)).toBeUndefined();
    expect(splitFor(book(500), 700, 800)).toBeUndefined();
  });
  test("tabletop splits top and bottom; a flat fold across a tall screen doesn't", () => {
    const across: Fold = { axis: "horizontal", state: "half", start: 350, end: 350 };
    expect(splitFor(across, 841, 701)).toEqual({ kind: "table", a: 350, gap: 0 });
    expect(splitFor({ ...across, state: "flat" }, 701, 841)).toBeUndefined();
  });
  test("no fold, no split: the width decides (D176)", () => {
    expect(splitFor(undefined, 841, 701)).toBeUndefined();
  });
});

describe("where the fold is", () => {
  const g = globalThis as { ducterFold?: Fold | null; viewport?: unknown };
  test("the Android app says it; else the browser's viewport segments", () => {
    g.ducterFold = book(421);
    expect(readFold()).toEqual(book(421));
    g.ducterFold = null;
    g.viewport = { segments: [{ x: 0, y: 0, width: 400, height: 700 }, { x: 420, y: 0, width: 400, height: 700 }] };
    expect(readFold()).toEqual({ axis: "vertical", state: "flat", start: 400, end: 420 });
    g.viewport = { segments: [{ x: 0, y: 0, width: 800, height: 700 }] };
    expect(readFold()).toBeUndefined();
    delete g.viewport;
    delete g.ducterFold;
  });
  test("the page is marked for CSS, and unmarked when the fold goes", () => {
    const style = new Map<string, string>();
    const el = { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => style.set(k, v), removeProperty: (k: string) => style.delete(k) } };
    markSplit({ kind: "book", a: 421, gap: 0 }, el as unknown as HTMLElement);
    expect(el.dataset.split).toBe("book");
    expect(style.get("--fold-a")).toBe("421px");
    markSplit(undefined, el as unknown as HTMLElement);
    expect(el.dataset.split).toBeUndefined();
    expect(style.size).toBe(0);
  });
  test("CSS places both splits from the variables the page sets", () => {
    for (const s of [":root[data-split] #app", ".panes.book .pane.conv", ".panes.book .pane.side", ".panes.table .pane.conv", ".panes.table .pane.side"]) expect(css).toContain(`${s} {`);
    expect(css).toContain("flex: 0 0 var(--fold-a)");
    expect(css).toContain("margin-left: var(--fold-gap)");
  });
});

describe("the Android app", () => {
  test("pairs as an Android phone through Ducter (apps/android sets DucterApp/ in its user agent)", () => {
    const ua = "Mozilla/5.0 (Linux; Android 16; Pixel Fold Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36 DucterApp/0.0.10";
    expect(deviceName(ua, 5)).toEqual({ name: "Android phone · Ducter", platform: "android" });
  });
  test("says plainly it can't notify in this version, in both languages", () => {
    expect(strings("zh").t("notify.android.later")).toContain("安卓 App");
    expect(strings("en").t("notify.android.later")).toContain("Android app");
    expect(strings("en").t("device.kind.android.app")).toBe("Your Android phone · through the Ducter app");
  });
});
