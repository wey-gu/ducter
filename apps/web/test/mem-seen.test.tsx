// D617 (D590's leftover): the opened task shows what memory brought into its first turn,
// under 「你交给它的事」: one muted line that unfolds into the memories' titles, each opens
// Settings › 记忆 on it, and 这条不对 asks the partner to correct it by naming the memory's id.
// Nothing shows when nothing was brought in. The Mac draws the same (mem_seen_test.go).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ClientFrame, LogEvent, ServerFrame } from "@ducter/protocol";

// ---- a small DOM, just enough for Preact to draw into and for a tap to land ----
class Node_ {
  childNodes: Node_[] = [];
  parentNode: Node_ | null = null;
  listeners = new Map<string, ((e: unknown) => void)[]>();
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
  addEventListener(type: string, fn: (e: unknown) => void) {
    const key = type.toLowerCase();
    const list = this.listeners.get(key) ?? [];
    list.push(fn);
    this.listeners.set(key, list);
  }
  removeEventListener(type: string, fn: (e: unknown) => void) {
    const key = type.toLowerCase();
    this.listeners.set(key, (this.listeners.get(key) ?? []).filter((f) => f !== fn));
  }
  dispatchEvent(e: { type: string }) {
    const key = e.type.toLowerCase();
    const ev = { ...e, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
    for (const fn of this.listeners.get(key) ?? []) fn.call(this, ev);
    return true;
  }
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
  scrollWidth = 0;
  clientWidth = 0;
  scrollHeight = 0;
  clientHeight = 0;
  offsetWidth = 0;
  offsetHeight = 0;
  scrollTop = 0;
  scrollLeft = 0;
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
g.document = doc;
g.matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
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

let A: Awaited<typeof import("../src/app.ts")>["A"];
let Store: Awaited<typeof import("../src/store.ts")>["Store"];
let strings: Awaited<typeof import("../src/i18n.ts")>["strings"];
let TaskView: Awaited<typeof import("../src/views.tsx")>["TaskView"];
let render: typeof import("preact").render;
let h: typeof import("preact").h;

beforeAll(async () => {
  ({ A } = await import("../src/app.ts"));
  ({ Store } = await import("../src/store.ts"));
  ({ strings } = await import("../src/i18n.ts"));
  ({ TaskView } = await import("../src/views.tsx"));
  ({ render, h } = await import("preact"));
});

afterAll(() => {
  // Leave the shared app as another test file expects it (modelsAskedFor is global).
  A.S = new Store();
  A.send = (() => true) as never;
  A.route = { name: "conv" };
  A.sheet = null;
  A.modelsAskedFor = "";
  A.draft = "";
  g.document = had.document;
  g.matchMedia = had.matchMedia;
  g.requestAnimationFrame = had.requestAnimationFrame;
  g.addEventListener = had.addEventListener;
  g.removeEventListener = had.removeEventListener;
  g.location = had.location;
  g.history = had.history;
  g.localStorage = had.localStorage;
});

const ev = (seq: number, kind: string, body: unknown, origin = "partner"): LogEvent => ({ seq, ts: new Date(Date.parse("2026-11-27T09:00:00Z") + seq * 1000).toISOString(), persona: "default", stream: "task:t", origin, kind, body }) as LogEvent;

const RECALLED = [
  { id: "mem_a1", title: "测试统一用假时钟", space: "personal-1", via: "preferences" },
  { id: "mem_b2", title: "Weekly report goes to the product group", space: "team-7", via: "search" },
];

function events(withRecalled = true): LogEvent[] {
  const out: LogEvent[] = [
    ev(1, "task_open", { taskId: "t", title: "Fix the flaky test", project: "", place: { kind: "none" }, harness: "claude-code", brief: "Make the scheduler test stable." }),
  ];
  if (withRecalled) out.push(ev(2, "task_event", { taskId: "t", role: "system", from: "runner", text: "recalled 2 from memory for the brief", raw: { memory: "recall", recalled: RECALLED } }, "task"));
  out.push(ev(3, "task_state", { taskId: "t", attention: "done", residency: "warm" }));
  return out;
}

async function draw(withRecalled = true) {
  const sent: ClientFrame[] = [];
  A.S = new Store();
  A.L = strings("zh");
  A.send = ((f: ClientFrame) => (sent.push(f), true)) as never;
  A.S.welcomed = true;
  A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as ServerFrame);
  const evs = events(withRecalled);
  A.receive({ t: "on_hand", onHand: { tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 1 }, waiters: [], keeps: [] } } as unknown as ServerFrame);
  A.receive({ t: "task_history", taskId: "t", events: evs } as ServerFrame);
  A.route = { name: "task", id: "t" };
  const root = new El("div");
  render(h(TaskView, { id: "t", full: false }), root as never);
  await new Promise((r) => setTimeout(r, 10));
  return { root, sent, done: () => render(null, root as never) };
}

const text = (root: El) => root.textContent;
const button = (root: El, label: string) => root.all().find((e) => e.localName === "button" && e.textContent.includes(label));

describe("what memory brought into the task", () => {
  test("the store reads the recalled fact, never an older event's ids only", () => {
    const S = new Store();
    S.apply({ t: "task_history", taskId: "t", events: events() } as ServerFrame);
    expect(S.tasks.get("t")!.recalled).toEqual(RECALLED);
    const old = new Store();
    old.apply({ t: "task_history", taskId: "t", events: [events()[0]!, ev(2, "task_event", { taskId: "t", role: "system", from: "runner", text: "recalled 1", raw: { memory: "recall", ids: ["m1"], titles: ["Old"] } }, "task")] } as ServerFrame);
    expect(old.tasks.get("t")!.recalled).toBeUndefined();
  });

  test("the opened task shows one muted line, and unfolding it shows the titles", async () => {
    const { root, done } = await draw();
    const line = button(root, "带进来 2 条记忆");
    expect(line).toBeDefined();
    expect(text(root)).not.toContain("测试统一用假时钟");
    line!.dispatchEvent({ type: "Click" });
    await new Promise((r) => setTimeout(r, 0));
    expect(text(root)).toContain("测试统一用假时钟");
    expect(text(root)).toContain("Weekly report goes to the product group");
    expect(button(root, "这条不对")).toBeDefined();
    done();
  });

  test("nothing brought in: no line, and no This is wrong", async () => {
    const { root, done } = await draw(false);
    expect(button(root, "带进来")).toBeUndefined();
    expect(text(root)).not.toContain("这条不对");
    done();
  });

  test("这条不对 sends the partner a message naming the memory's id", async () => {
    const { root, sent, done } = await draw();
    button(root, "带进来 2 条记忆")!.dispatchEvent({ type: "Click" });
    await new Promise((r) => setTimeout(r, 0));
    button(root, "这条不对")!.dispatchEvent({ type: "Click" });
    await new Promise((r) => setTimeout(r, 0));
    const send = sent.find((f) => f.t === "send") as Extract<ClientFrame, { t: "send" }> | undefined;
    expect(send).toBeDefined();
    expect(send!.text).toContain("测试统一用假时钟");
    expect(send!.text).toContain("mem_a1");
    expect(A.route).toEqual({ name: "conv" });
    done();
  });
});
