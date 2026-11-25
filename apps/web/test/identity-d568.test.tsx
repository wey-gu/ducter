// D568: one identity per figure. The author, focused on 小玛 (coral) among four partners, found
// Settings wearing 小玛's clay everywhere: the Partner page's head said "Ducter" beside 小玛's
// figure, Memory said Ducter's name beside 小玛's figure, Overview's speaking figure was 小玛's
// while it said what Ducter thinks with. Every figure, clay and name now comes from A.speakerFor:
// the product (the brand pebble), the partner you are talking with, or a given partner.
//
// The pages are drawn for real (Preact into a small DOM made here) with the window on 小玛, a
// sprout in coral thinking with Claude Code, and every figure drawn is read back: its figure and
// clay must be the ones of the partner whose name it carries.
import { afterAll, describe, expect, test } from "bun:test";
import type { ServerFrame } from "@ducter/protocol";

// ---- a small DOM, just enough for Preact to draw into ----
class Node_ {
  childNodes: Node_[] = [];
  parentNode: Node_ | null = null;
  constructor(public nodeType: number) {}
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling(): Node_ | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null;
  }
  get previousSibling(): Node_ | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) - 1] ?? null;
  }
  appendChild(n: Node_) {
    return this.insertBefore(n, null);
  }
  append(...ns: Node_[]) {
    for (const n of ns) this.appendChild(n);
  }
  insertBefore(n: Node_, ref: Node_ | null) {
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n);
    else this.childNodes.splice(i, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n: Node_) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  contains(n: Node_ | null): boolean {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  addEventListener() {}
  removeEventListener() {}
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.childNodes = [];
    if (v) this.appendChild(new Text_(v));
  }
}
class Text_ extends Node_ {
  constructor(public data: string) {
    super(3);
  }
  override get textContent() {
    return this.data;
  }
  get nodeValue() {
    return this.data;
  }
  set nodeValue(v: string) {
    this.data = v;
  }
}
class El extends Node_ {
  attrs: Record<string, string> = {};
  style: Record<string, unknown> & { setProperty: (k: string, v: string) => void; removeProperty: (k: string) => void };
  dataset: Record<string, string> = {};
  constructor(public localName: string) {
    super(1);
    const st: Record<string, unknown> = {};
    st.setProperty = (k: string, v: string) => void (st[k] = v);
    st.removeProperty = (k: string) => void delete st[k];
    this.style = st as never;
  }
  get nodeName() {
    return this.localName.toUpperCase();
  }
  get children(): El[] {
    return this.childNodes.filter((c): c is El => c instanceof El);
  }
  scrollWidth = 0;
  clientWidth = 0;
  scrollHeight = 0;
  clientHeight = 0;
  offsetWidth = 0;
  offsetHeight = 0;
  scrollTop = 0;
  scrollLeft = 0;
  get tagName() {
    return this.nodeName;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = String(v);
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
  removeAttribute(k: string) {
    delete this.attrs[k];
  }
  hasAttribute(k: string) {
    return k in this.attrs;
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  focus() {}
  blur() {}
  scrollTo() {}
  scrollIntoView() {}
  animate() {
    return { finished: Promise.resolve(), cancel() {}, onfinish: null };
  }
  closest() {
    return null;
  }
  matches() {
    return false;
  }
  get classList() {
    return { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  /** Every element under this one, depth first. */
  all(): El[] {
    const out: El[] = [];
    const go = (n: Node_) => {
      for (const c of n.childNodes)
        if (c instanceof El) {
          out.push(c);
          go(c);
        }
    };
    go(this);
    return out;
  }
}
const doc = {
  createElement: (n: string) => new El(n),
  createElementNS: (_: string, n: string) => new El(n),
  createTextNode: (s: string) => new Text_(s),
  documentElement: new El("html"),
  body: new El("body"),
  head: new El("head"),
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
  querySelector: () => null,
  querySelectorAll: () => [],
  visibilityState: "visible",
  hasFocus: () => true,
};
const g = globalThis as Record<string, unknown>;
const had = { document: g.document, matchMedia: g.matchMedia, requestAnimationFrame: g.requestAnimationFrame };
g.document ??= doc;
g.matchMedia ??= (q: string) => ({ matches: /max-width: 599px/.test(q) ? !!g.__phone : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
g.requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame ??= (h: number) => clearTimeout(h);
g.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IntersectionObserver ??= g.ResizeObserver;
g.addEventListener ??= () => {};
g.removeEventListener ??= () => {};

afterAll(() => {
  Object.assign(g, had);
});

const four = (lang: "zh" | "en") => [
  { id: "default", name: "Ducter", look: "sand", asks: 0 },
  { id: "p2", name: lang === "zh" ? "多比" : "Dobby", look: "sky", asks: 0 },
  { id: "p3", name: lang === "zh" ? "小新" : "Sunny", look: "plum", asks: 0 },
  { id: "p4", name: lang === "zh" ? "小玛" : "Mara", look: "apricot", figure: "sprout", asks: 0, brain: { harness: "claude-code", model: "opus" } },
];

async function rig(lang: "zh" | "en", partners: ReturnType<typeof four>, shown: string) {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { strings } = await import("../src/i18n.ts");
  A.S = new Store();
  A.L = strings(lang);
  A.send = (() => true) as never;
  (A as unknown as { api: unknown }).api = { call: async () => ({}), base: "http://127.0.0.1/" };
  A.partners = undefined;
  A.partnerShown = shown;
  A.receive({ t: "welcome", persona: shown, personaName: partners.find((p) => p.id === shown)!.name, headSeq: 1 } as ServerFrame);
  A.receive({ t: "partners", partners, shown } as unknown as ServerFrame);
  A.settings = { name: "Ducter", language: "auto", memory: true, notify: true, defaultAfterMin: 30, brain: { harness: "codex", model: "gpt-6.2-astra" } } as never;
  A.homeName = "Hetzner Server";
  return A;
}

/** Draws Settings on a page and returns the root it drew into. */
async function draw(page: string) {
  const { A } = await import("../src/app.ts");
  const { render, h } = await import("preact");
  const { SettingsSheet } = await import("../src/views.tsx");
  A.sheet = { kind: "settings", page } as never;
  const root = new El("div");
  render(h(SettingsSheet, {}), root as never);
  await new Promise((r) => setTimeout(r, 5));
  return { root, done: () => render(null, root as never) };
}

const PAGES = ["", "partner", "memory", "peers", "notify", "accounts", "todos", "chats", "autofill", "devices", "phone"];

describe("D568: every figure is the one its name says", () => {
  for (const lang of ["zh", "en"] as const)
    test(`${lang}: with the window on 小玛, every Settings page`, async () => {
      const ps = four(lang);
      const A = await rig(lang, ps, "p4");
      const mara = ps[3]!;
      expect(A.speakerFor().name).toBe(mara.name);
      expect(A.speakerFor().wear).toEqual({ figure: "sprout", look: "apricot" });
      expect(A.speakerFor("brand")).toEqual({ name: "Ducter", wear: { look: "sand" }, brand: true });
      const byName = new Map(ps.map((p) => [p.name, p]));
      const counts: string[] = [];
      for (const page of PAGES) {
        const { root, done } = await draw(page);
        const figs = root.all().filter((e) => e.attrs["data-who"] !== undefined || e.attrs["class"]?.split(" ").includes("avatar"));
        counts.push(`${page || "list"}=${figs.length}`);
        for (const f of figs) {
          const who = f.attrs["data-who"]!;
          const p = byName.get(who);
          expect(p, `${page || "list"}: a figure stands for ${who}, no partner of that name`).toBeDefined();
          expect(`${page}:${who}:${f.attrs["data-figure"]}/${f.attrs["data-look"]}`).toBe(`${page}:${who}:${p!.figure ?? "pebble"}/${p!.look}`);
        }
        if (page === "partner") {
          // The head speaks as 小玛, with what it thinks with, never as "Ducter" in 小玛's clay.
          const head = root.all().find((e) => e.attrs.class === "partner-head");
          expect(head?.textContent).toContain(mara.name);
          expect(head?.textContent.replace(/[\u00a0\u2060\u202f]/g, " ")).toContain("Claude Code");
          expect(head?.textContent).not.toContain("Codex");
          // Each partner's row has the six figures, the default's too.
          const picks = root.all().filter((e) => e.attrs.class?.split(" ").includes("fig-pick"));
          expect(picks.length).toBe(ps.length);
        }
        if (page === "") {
          // The list's 伙伴 row and the brief wear 小玛, and the brief says what 小玛 thinks with.
          expect(figs.some((f) => f.attrs["data-who"] === mara.name)).toBe(true);
          expect(root.textContent.replace(/[\u00a0\u2060\u202f]/g, " ")).toContain("Claude Code");
        }
        if (page === "memory") {
          const said = root.textContent;
          if (said.includes(lang === "zh" ? "记得你" : "remember")) expect(said).not.toMatch(/Ducter (记得你|remembers you)/);
        }
        done();
      }
      // The pages that speak drew figures to check (the test reads something, never nothing).
      for (const page of ["list", "partner", "memory"]) expect(Number(counts.find((c) => c.startsWith(`${page}=`))?.split("=")[1])).toBeGreaterThan(0);
    });

  test("one partner gets its row and the picker, and wears its figure", async () => {
    const A = await rig("zh", [{ id: "default", name: "Ducter", look: "sand", figure: "bun", asks: 0 }] as never, "default");
    expect(A.speakerFor().wear).toEqual({ figure: "bun", look: "sand" });
    expect(A.shownWear()).toEqual({ figure: "bun", look: "sand" });
    const { root, done } = await draw("partner");
    expect(root.all().filter((e) => e.attrs.class?.split(" ").includes("fig-pick")).length).toBe(1);
    const head = root.all().find((e) => e.attrs.class === "partner-head");
    const fig = head?.all().find((e) => e.attrs.class?.split(" ").includes("avatar"));
    expect(fig?.attrs["data-figure"]).toBe("bun");
    done();
  });
});
