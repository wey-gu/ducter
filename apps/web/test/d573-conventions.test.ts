// D573: what every hand already knows. One Esc closes one thing (the layer on top, never the place
// under it too); a phone's Back closes the layer on top first, then goes up a level, and says when
// it is at the top (where Back leaves the app); the tab says what waits for the person.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const g = globalThis as any;
const had = { location: g.location, history: g.history, scrollTo: g.scrollTo, document: g.document, KeyboardEvent: g.KeyboardEvent };
let menuOpen = false;
const escapes: string[] = [];
beforeAll(async () => {
  g.location = { hash: "", pathname: "/" };
  g.history = {
    length: 2,
    pushState: (_: unknown, __: string, h: string) => void (g.location.hash = h.startsWith("#") ? h : ""),
    replaceState: (_: unknown, __: string, h: string) => void (g.location.hash = h.startsWith("#") ? h : ""),
  };
  g.scrollTo = () => {};
  // The modules load as in the other route tests (no DOM); the page is faked after, for these alone.
  await import("../src/app.ts");
  await import("../src/wide.ts");
  g.document = {
    activeElement: { dispatchEvent: (e: { key: string }) => void escapes.push(e.key) },
    querySelector: (s: string) => (s.includes("menu") && menuOpen ? {} : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  g.KeyboardEvent = class {
    key: string;
    constructor(_: string, init: { key: string }) {
      this.key = init.key;
    }
  };
});
afterAll(async () => {
  for (const [k, v] of Object.entries(had)) v === undefined ? delete g[k] : (g[k] = v);
  const { A } = await import("../src/app.ts");
  A.route = { name: "conv" };
  A.sheet = null;
  A.viewer = undefined;
});

describe("D573", () => {
  test("the tab title carries what waits", async () => {
    const { tabTitle } = await import("../src/wide.ts");
    expect(tabTitle(0)).toBe("Ducter");
    expect(tabTitle(3)).toBe("(3) Ducter");
  });

  test("a layer up keeps Esc from moving the place under it", async () => {
    const { A } = await import("../src/app.ts");
    const { escUp, layerUp } = await import("../src/wide.ts");
    A.route = { name: "task", id: "t1" } as typeof A.route;
    let went = 0;
    const go = A.go.bind(A);
    A.go = ((r: typeof A.route) => void (went++, go(r))) as typeof A.go;
    for (const set of [() => (A.viewer = { items: [], index: 0 } as never), () => (menuOpen = true), () => (A.sheet = { kind: "switch" } as never)]) {
      A.viewer = undefined;
      A.sheet = null;
      menuOpen = false;
      set();
      expect(layerUp()).toBe(true);
      escUp({ key: "Escape", defaultPrevented: false, preventDefault() {} } as unknown as KeyboardEvent);
      expect(went).toBe(0);
    }
    A.go = go;
    A.viewer = undefined;
    A.sheet = null;
    menuOpen = false;
  });

  test("Back closes the layer on top, then goes up, then says it is at the top", async () => {
    const { A } = await import("../src/app.ts");
    const { backOne } = await import("../src/wide.ts");
    A.route = { name: "task", id: "t1" } as typeof A.route;
    A.sheet = { kind: "switch" } as never;
    expect(backOne()).toBe(true);
    expect(escapes).toEqual(["Escape"]);
    expect(A.route.name).toBe("task");
    A.sheet = null;
    expect(backOne()).toBe(true);
    expect(A.route.name).toBe("onhand");
    A.upInPlace = undefined;
    expect(backOne()).toBe(true);
    expect(A.route.name).toBe("conv");
    expect(backOne()).toBe(false);
  });
});
