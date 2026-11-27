// #254: a task's question draws what it showed with it on the card itself, before the person
// answers: the conversation's own picture tiles and file cards (D206), drawn by the real view.
import { afterAll, expect, test } from "bun:test";

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
  A.S = new Store();
  A.conn = undefined;
  A.onRepaint = undefined;
  A.route = { name: "conv" };
  mem.clear();
  Object.assign(g, had);
});

const ref = (name: string, type: string, id: string) => ({ id: id.padEnd(64, "0").slice(0, 64), type, bytes: 2048, w: 1024, h: 768, name, k: "k", from: { taskId: "t1" } });

test("a question with one picture and four files draws them on its card", async () => {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { strings } = await import("../src/i18n.ts");
  const { Ask, DecisionCard } = await import("../src/views.tsx");
  const { render, h } = await import("preact");
  A.S = new Store();
  A.L = strings("zh");
  A.base = "http://127.0.0.1/";
  A.send = (() => true) as never;
  A.route = { name: "conv" };
  // The asking task's short title is the card's quiet line.
  A.S.tasks.set("t1", { id: "t1", card: { taskId: "t1", title: "看这份报告", persona: "p1" } } as never);
  const d = {
    decisionId: "d1",
    taskId: "t1",
    question: "看一下截图和报告，结论站得住吗？",
    goLabel: "发出去",
    defaultOption: "hold",
    reversible: false,
    seq: 1,
    media: [
      ref("report.png", "image/png", "img"),
      ref("季度报告.pdf", "application/pdf", "pdf"),
      ref("README.md", "text/markdown", "readme"),
      ref("数据.csv", "text/csv", "csv"),
      ref("交付.zip", "application/zip", "zip"),
    ],
  } as never;
  const root = new El("div");
  render(h(DecisionCard, { d, taskId: "t1" }), root as never);
  await new Promise((r) => setTimeout(r, 10));
  const all = root.all();
  // The picture is the conversation's tile, not a stand-in.
  expect(all.some((e) => e.localName === "img" && (e.attrs.src ?? "").includes("media/img"))).toBe(true);
  // The four files are the conversation's file cards, by name.
  expect(all.filter((e) => (e.attrs.class ?? "").includes("filecard"))).toHaveLength(4);
  const text = root.textContent;
  for (const n of ["季度报告.pdf", "README.md", "数据.csv", "交付.zip"]) expect(text).toContain(n);
  // Drawn before the answer: the files sit above the Go/Hold row in the card.
  const q = all.findIndex((e) => e.localName === "div" && (e.attrs.class ?? "").includes("q"));
  const firstFile = all.findIndex((e) => (e.attrs.class ?? "").includes("filecard"));
  const act = all.findIndex((e) => (e.attrs.class ?? "").includes("dk-acts"));
  expect(q).toBeGreaterThanOrEqual(0);
  expect(firstFile).toBeGreaterThan(q);
  expect(act).toBeGreaterThan(firstFile);
  render(null, root as never);

  // The conversation's own ask (the compact card under the partner's words) draws them too.
  const conv = new El("div");
  render(h(Ask, { d, taskId: "t1" }), conv as never);
  await new Promise((r) => setTimeout(r, 10));
  expect(conv.all().filter((e) => (e.attrs.class ?? "").includes("filecard"))).toHaveLength(4);
  expect(conv.all().some((e) => e.localName === "img")).toBe(true);
  for (const n of ["季度报告.pdf", "README.md", "数据.csv", "交付.zip"]) expect(conv.textContent).toContain(n);
  render(null, conv as never);
});
