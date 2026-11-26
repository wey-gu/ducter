// D621: a Keep's doorbell row and a ring's round line, drawn by the real web components.
// The caller's label is shown as text, never as markup (the only untrusted text on the page), and
// the URL appears only while the row is open, with Copy and a curl example.
import { afterAll, describe, expect, test } from "bun:test";
import type { KeepPage } from "@ducter/protocol";

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
  getContext() {
    return { measureText: () => ({ width: 0 }), font: "" } as never;
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
  getElementById: () => null,
  visibilityState: "visible",
  hasFocus: () => true,
};
const g = globalThis as Record<string, unknown>;
const had = { document: g.document, matchMedia: g.matchMedia, requestAnimationFrame: g.requestAnimationFrame, addEventListener: g.addEventListener, removeEventListener: g.removeEventListener, location: g.location, history: g.history, localStorage: g.localStorage };
let viewportWidth = 1180;
const media = (q: string) => {
  const min = /min-width:\s*(\d+)px/.exec(q);
  const max = /max-width:\s*(\d+)px/.exec(q);
  return min ? viewportWidth >= Number(min[1]) : max ? viewportWidth <= Number(max[1]) : false;
};
g.document ??= doc;
g.matchMedia = (q: string) => ({ matches: media(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
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
g.getComputedStyle ??= () => ({ getPropertyValue: () => "", fontSize: "16px", lineHeight: "24px", paddingTop: "0px", paddingBottom: "0px", display: "flex", visibility: "visible" });
g.scrollTo ??= () => {};
g.location = { hash: "", pathname: "/app", href: "http://127.0.0.1/app", search: "" };
g.history = { length: 2, state: null, replaceState() {}, pushState() {}, back() {} };
const mem = new Map<string, string>();
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { K } = await import("../src/keep.tsx");
  A.S = new Store();
  A.conn = undefined;
  A.onRepaint = undefined;
  A.route = { name: "conv" };
  K.open = "";
  K.pages.clear();
  K.bell = undefined;
  K.bellOpen = false;
  mem.clear();
  Object.assign(g, had);
});

const NOW = new Date().toISOString();
const page = (): KeepPage => ({
  id: "kp1",
  title: "看 CI",
  persona: "default",
  life: "on",
  run: "same",
  wakes: [{ kind: "every", everyMs: 30 * 60_000 }],
  items: [],
  taskIds: [],
  asks: 0,
  week: 0,
  decisions: [],
  editable: ["said", "title", "until", "speaks", "every"],
  said: "每 30 分钟看一次 CI，直到 #10473 合并为止",
  since: NOW,
  rounds: [{ at: NOW, woke: "ring", wokeWhat: '<img src=x onerror=alert(1)>', spoke: "silent", state: "done" }],
});

async function draw(k: KeepPage) {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { K, KeepPageView } = await import("../src/keep.tsx");
  const { strings } = await import("../src/i18n.ts");
  const { render, h } = await import("preact");
  A.S = new Store();
  A.L = strings("zh");
  A.send = (() => true) as never;
  A.route = { name: "onhand", full: true };
  A.S.onHand = { tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], keeps: [k] } as never;
  K.open = k.id;
  K.pages.set(k.id, k);
  K.bell = undefined;
  K.bellOpen = false;
  K.bellError = "";
  K.bellSending = "";
  const root = new El("div");
  render(h(KeepPageView, { room: "full" }), root as never);
  await new Promise((r) => setTimeout(r, 10));
  return { root, A, K, redraw: () => render(h(KeepPageView, { room: "full" }), root as never), done: () => render(null, root as never) };
}

describe("D621: the doorbell on a Keep's page", () => {
  test("a ring's round shows the caller's label as text, never as markup", async () => {
    const { root, done } = await draw(page());
    expect(root.textContent).toContain("门铃：「<img src=x onerror=alert(1)>」");
    // The label never became an element or an attribute: no img, no onerror anywhere.
    expect(root.all().some((e) => e.localName === "img")).toBe(false);
    expect(root.all().some((e) => Object.keys(e.attrs).some((a) => a.startsWith("on")))).toBe(false);
    done();
  });

  test("the row: off at first; on shows the URL and a curl example only while open", async () => {
    const k = page();
    const { root, K, redraw, done } = await draw(k);
    expect(root.textContent).toContain("门铃");
    expect(root.textContent).toContain("没开");
    expect(root.textContent).not.toContain("/doorbell/");

    // On, closed: the row says on and the URL is not on the page.
    k.bell = { at: NOW };
    K.bell = { id: k.id, url: "https://home.example/doorbell/db1_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG" };
    K.bellOpen = false;
    redraw();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.textContent).toContain("开着");
    expect(root.textContent).not.toContain("/doorbell/");

    // Open: the URL with Copy, and the curl line (the same one a script runs).
    K.bellOpen = true;
    redraw();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.textContent).toContain("https://home.example/doorbell/db1_");
    expect(root.textContent).toContain("curl -X POST");
    expect(root.textContent).toContain("X-Ducter-About: CI #42");
    expect(root.textContent).toContain("换一个地址");
    expect(root.textContent).toContain("关掉门铃");
    expect(root.textContent).toContain("好了");
    expect(root.textContent).not.toContain("取消");
    done();
  });
});
