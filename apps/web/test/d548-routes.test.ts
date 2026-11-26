// D548 (the author on 0.1.50, a phone with several partners): from Tasks, 对话 and ‹ 对话 landed on
// the list of partners instead of the conversation he came from. Every way into the conversation
// is the last shown partner's conversation; the list opens only from its own control (the others'
// faces, the edge swipe: showPartners) or #partners. With one partner there is no list at all.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

// The page's globals the routes touch, for a test without a DOM: set for this file, put back after.
const g = globalThis as any;
const had = { location: g.location, history: g.history, scrollTo: g.scrollTo };
beforeAll(() => {
  g.location = { hash: "", pathname: "/" };
  g.history = {
    length: 2,
    pushState: (_: unknown, __: string, h: string) => void (g.location.hash = h.startsWith("#") ? h : ""),
    replaceState: (_: unknown, __: string, h: string) => void (g.location.hash = h.startsWith("#") ? h : ""),
  };
  g.scrollTo = () => {};
});
afterAll(async () => {
  for (const [k, v] of Object.entries(had)) v === undefined ? delete g[k] : (g[k] = v);
  const { A } = await import("../src/app.ts");
  A.partners = undefined;
  A.partnersOpen = false;
  A.route = { name: "conv" };
  A.sheet = null;
  // A switch left waiting for its welcome would swallow the next file's welcome (seen with clone-folder).
  (A as unknown as { switchTo?: string }).switchTo = undefined;
});

const four = [
  { id: "default", name: "Ducter", look: "sand" },
  { id: "p2", name: "小家", look: "sage" },
  { id: "p3", name: "多比", look: "sky" },
  { id: "p4", name: "小新", look: "plum" },
];

async function page(n: 1 | 4) {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  A.L = strings("zh");
  A.S = new Store();
  A.S.welcomed = true;
  A.S.persona = "default";
  A.partnerShown = "default";
  A.partners = n === 4 ? (four as never) : undefined;
  A.partnersOpen = false;
  A.sheet = null;
  A.route = { name: "conv" };
  (A as unknown as { send: (f: unknown) => void }).send = () => {};
  g.location.hash = "";
  return A;
}

/** Where the phone stands: the list, or a place by its route. */
const at = (A: Awaited<ReturnType<typeof page>>) => (A.route.name === "conv" && A.partnersOpen ? "list" : A.route.name);

describe("D548: every way into the conversation is the conversation", () => {
  for (const n of [1, 4] as const) {
    test(`${n} partner(s): from Tasks, 对话 (the places, ⌘1) and ‹ 对话 (back) land on the conversation`, async () => {
      const A = await page(n);
      if (n === 4) A.showPartners(); // the list was open before On hand (the case the author hit)
      expect(at(A)).toBe(n === 4 ? "list" : "conv");
      A.go({ name: "onhand" });
      expect(at(A)).toBe("onhand");
      A.command("conv"); // ⌘1 and the places' 对话
      expect(at(A)).toBe("conv");
      if (n === 4) A.showPartners();
      A.go({ name: "onhand" });
      A.fromHash(""); // ‹ 对话 is history.back(): the browser's own back lands here as a hashchange
      expect(at(A)).toBe("conv");
      expect(A.S.persona).toBe("default"); // the partner shown last, never another
    });

    test(`${n} partner(s): back from an opened task, a push and #conv land on the conversation`, async () => {
      const A = await page(n);
      if (n === 4) A.showPartners();
      A.go({ name: "task", id: "t_x" });
      expect(at(A)).toBe("task");
      A.go({ name: "conv" });
      expect(at(A)).toBe("conv");
      if (n === 4) A.showPartners();
      A.fromHash("#d=d_1"); // a push about a decision
      expect(at(A)).toBe("conv");
      if (n === 4) A.showPartners();
      A.fromHash("#conv");
      expect(at(A)).toBe("conv");
    });

    test(`${n} partner(s): Settings opened from the conversation closes onto the conversation`, async () => {
      const A = await page(n);
      A.openSettings();
      expect(A.sheet?.kind).toBe("settings");
      A.sheet = null;
      expect(at(A)).toBe("conv");
    });

    test(`${n} partner(s): the list opens only from its own control or #partners`, async () => {
      const A = await page(n);
      A.showPartners(); // the others' faces, the edge swipe
      expect(at(A)).toBe(n === 4 ? "list" : "conv"); // one partner: no list
      A.openPartner("default"); // a row: back into that conversation
      expect(at(A)).toBe("conv");
      A.fromHash("#partners");
      expect(at(A)).toBe(n === 4 ? "list" : "conv");
      A.fromHash(""); // the browser's back from the list: the conversation, never the list again
      expect(at(A)).toBe("conv");
    });
  }

  test("4 partners: a push about another partner's question shows that partner's conversation, not the list", async () => {
    const A = await page(4);
    A.showPartners();
    A.fromHash("#p=p3/d=d_2");
    expect(at(A)).toBe("conv");
    expect(A.partnerShown).toBe("p3");
  });
});
