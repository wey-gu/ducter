// The iPad's Tasks screen: full-screen Tasks, then a task, a Keep or one of a Keep's held tasks
// opened from it. Every one of those screens must keep a bar with 对话 / 任务 / {title} (wide) or a
// back control (the one-column layout), and the rail beside an opened task must keep its own head
// even when there is no project lens to name: without it the sidebar had no rule and no way back
// (the author's iPad). This draws the real components, as main.tsx branches them at each width.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
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
const had = { document: g.document, matchMedia: g.matchMedia, requestAnimationFrame: g.requestAnimationFrame, addEventListener: g.addEventListener, removeEventListener: g.removeEventListener, location: g.location, history: g.history, localStorage: g.localStorage, innerWidth: g.innerWidth, innerHeight: g.innerHeight, ducterFold: g.ducterFold, viewport: g.viewport };
let viewportWidth = 1180;
// D635: the app is a phone/iPad client here; the places are one button on a touch screen.
let coarse = true;
const media = (q: string) => {
  if (q.includes("any-pointer: coarse")) return coarse;
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
// Every test starts from a plain iPad-like wide screen; a fold test sets its own before it draws.
beforeEach(() => {
  viewportWidth = 1180;
  coarse = true;
  g.innerWidth = 1180;
  g.innerHeight = 900;
  delete g.ducterFold;
});

const mem = new Map<string, string>();
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };

afterAll(async () => {
  // Leave the shared app exactly as another test file expects to find it: no socket stub, no
  // repaint hook, no partners or Keep left open by these drawings.
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { K } = await import("../src/keep.tsx");
  A.S = new Store();
  A.partners = undefined;
  A.conn = undefined;
  A.onRepaint = undefined;
  A.partnersOpen = false;
  A.sheet = null;
  A.route = { name: "conv" };
  A.glanceDevice = "";
  K.open = "";
  mem.clear();
  Object.assign(g, had);
});

const now = new Date().toISOString();
const card = (id: string, title: string, project: string) => ({
  taskId: id,
  persona: "default",
  title,
  project,
  place: { kind: "none" },
  harness: "claude-code",
  attention: "working",
  residency: "hot",
  openedAt: now,
  updatedAt: now,
});
const keepPage = (id: string, title: string) => ({
  id,
  title,
  persona: "default",
  life: "on",
  run: "same",
  since: now,
  asks: 0,
  decisions: [],
  items: [],
  rounds: [],
  wakes: [],
});

async function rig(kind: "onhand" | "task" | "item" | "keep", width: number) {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { K } = await import("../src/keep.tsx");
  const { strings } = await import("../src/i18n.ts");
  viewportWidth = width;
  A.S = new Store();
  A.L = strings("en");
  A.send = (() => true) as never;
  A.S.welcomed = true;
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [card("t1", "Fix the iPad header", "mem"), card("t2", "A held task", "mem")],
      counts: { needs_you: 0, working: 2, waiting: 0, done_today: 0 },
      waiters: [],
      keeps: [{ id: "kp1", title: "Mem PRs", run: "same", life: "on", taskIds: [], items: [], wakes: [], since: now }],
    },
  } as unknown as ServerFrame);
  K.open = kind === "keep" ? "kp1" : "";
  if (kind === "keep") K.pages.set("kp1", keepPage("kp1", "Mem PRs") as never);
  if (kind === "keep") A.route = { name: "onhand", full: true };
  else if (kind === "onhand") A.route = { name: "onhand", full: true };
  else A.route = { name: "task", id: kind === "item" ? "t2" : "t1", full: true };
  return A;
}

async function draw(kind: "onhand" | "task" | "item" | "keep", width: number) {
  const A = await rig(kind, width);
  const { render, h } = await import("preact");
  const { Board, Rail } = await import("../src/board.tsx");
  const { OnHand, TaskView } = await import("../src/views.tsx");
  const fill = width >= 1000;
  const rail = width >= 1120;
  const Screen = () => {
    if (kind === "onhand" || kind === "keep") return fill ? h(Board, {}) : h(OnHand, {});
    if (!fill) return h(TaskView, { id: A.route.name === "task" ? A.route.id : "t1", full: false });
    if (rail)
      return h("div", { class: "with-rail" }, h(Rail, {}), h("div", { class: "beside-rail" }, h(TaskView, { id: A.route.name === "task" ? A.route.id : "t1", full: true })));
    return h(TaskView, { id: A.route.name === "task" ? A.route.id : "t1", full: true });
  };
  const root = new El("div");
  render(h(Screen, {}), root as never);
  await new Promise((r) => setTimeout(r, 10));
  return { root, done: () => render(null, root as never) };
}

const cls = (e: El) => (e.attrs.class ?? "").split(" ").filter(Boolean);
const has = (e: El, name: string) => cls(e).includes(name);
/** Nothing on the path hides it with an inline display or the hidden attribute. */
function shown(e: El) {
  if (!e.textContent.trim()) return false;
  for (let x: Node_ | null = e; x; x = x.parentNode) {
    if (!(x instanceof El)) continue;
    if (x.attrs.hidden !== undefined) return false;
    if (x.style.display === "none") return false;
  }
  return true;
}

const WIDTHS = [768, 1024, 1180, 1366];

/** The device's own size and (for a foldable) the fold the app reports (fold.ts reads both). */
function setViewport(w: number, h: number, fold?: { axis: "vertical" | "horizontal"; state: "flat" | "half"; start: number; end: number }) {
  viewportWidth = w;
  g.innerWidth = w;
  g.innerHeight = h;
  if (fold) g.ducterFold = fold;
  else delete g.ducterFold;
}

/** The side pane as main.tsx draws it: On hand beside the conversation, its own header. */
async function drawSide(width: number) {
  const A = await rig("onhand", width);
  A.route = { name: "onhand" };
  const { render, h } = await import("preact");
  const { OnHand } = await import("../src/views.tsx");
  const root = new El("div");
  render(h(OnHand, {}), root as never);
  await new Promise((r) => setTimeout(r, 10));
  return { A, root, done: () => render(null, root as never) };
}
const fillButton = (root: El) => root.all().find((e) => e.localName === "button" && has(e, "fill"));

/** A task with a working copy, as the demo's opened task is: its card from one task_open event. */
function seedTask(A: Awaited<ReturnType<typeof rig>>) {
  A.receive({
    t: "events",
    events: [
      {
        seq: 1,
        ts: now,
        persona: "default",
        stream: "task:t1",
        origin: "partner",
        kind: "task_open",
        body: { taskId: "t1", title: "Fix the flaky test", project: "mem", place: { kind: "repo", device: "MacBook", repoPath: "~/dev/hawdb", branch: "ducter/compaction-fix", baseBranch: "main" }, harness: "claude-code", model: "opus", brief: "Fix it." },
      },
    ],
  } as unknown as ServerFrame);
}

/** The opened task in the side pane (not full) or at the whole screen (full). */
async function drawTask(width: number, full: boolean, fold?: { axis: "vertical" | "horizontal"; state: "flat" | "half"; start: number; end: number }) {
  const A = await rig("task", width);
  seedTask(A);
  setViewport(width, 900, fold);
  A.route = { name: "task", id: "t1", full };
  const { render, h } = await import("preact");
  const { TaskView } = await import("../src/views.tsx");
  const root = new El("div");
  render(h(TaskView, { id: "t1", full }), root as never);
  await new Promise((r) => setTimeout(r, 10));
  return { A, root, done: () => render(null, root as never) };
}
const clsOf = (e: El) => (e.attrs.class ?? "").split(" ").filter(Boolean);
const hasAny = (root: El, names: string[]) => root.all().filter((e) => names.some((n) => clsOf(e).includes(n)));

describe("every screen opened from full-screen Tasks keeps its bar", () => {
  for (const width of WIDTHS) {
    test(`${width}: Tasks, a task, a Keep, and a held task each draw a bar with a way back`, async () => {
      for (const kind of ["onhand", "task", "keep", "item"] as const) {
        const { root, done } = await draw(kind, width);
        const headers = root.all().filter((e) => e.localName === "header" && has(e, "top"));
        expect(headers.length, `${width} ${kind}: no top bar`).toBeGreaterThan(0);
        // A crumb (对话, 任务, the title) or a drawn back control; the one-column layout uses .back.
        const ways = root.all().filter((e) => ["back", "crumb", "crumb-up", "here"].some((c) => has(e, c)));
        expect(ways.some(shown), `${width} ${kind}: no crumb or back`).toBe(true);
        if (kind === "keep") expect(root.textContent).toContain("Mem PRs");
        // The rail beside an opened task always has its own head (with or without a project lens).
        if ((kind === "task" || kind === "item") && width >= 1120) {
          const railHead = root.all().find((e) => has(e, "rail-head"));
          expect(railHead, `${width} ${kind}: the rail has no head`).toBeDefined();
          const railWay = railHead!.all().find((e) => has(e, "crumb"));
          expect(railWay && shown(railWay), `${width} ${kind}: the rail has no way back`).toBe(true);
          // And the task's own bar, so the two rules meet on one line.
          expect(root.all().filter((e) => e.localName === "header" && has(e, "top") && has(e, "crumbs")).length).toBe(1);
        }
        done();
      }
    });
  }
});

// D635 (amends D252 (2)): the author's foldable, unfolded flat, was a plain wide screen in
// every way except the rule that hid this button. Same width, same panes: no fold showed the
// button, a flat fold did not. The iPad never had the fault; it is here as the comparison.
describe("Tasks beside the conversation can take the whole screen where canFill allows", () => {
  const sizes = [
    { name: "iPad 1180×820", w: 1180, h: 820, fill: true },
    { name: "iPad mini 1133×744", w: 1133, h: 744, fill: true },
    { name: "iPad 820×1180 (one column)", w: 820, h: 1180, fill: false },
    { name: "Pixel Fold 701×841 unfolded flat", w: 701, h: 841, fold: { axis: "vertical", state: "flat", start: 350, end: 350 }, fill: true },
    { name: "Pixel Fold 701×841 half-open", w: 701, h: 841, fold: { axis: "vertical", state: "half", start: 350, end: 350 }, fill: false },
    { name: "Galaxy Z Fold 1007×1209 unfolded flat", w: 1007, h: 1209, fold: { axis: "vertical", state: "flat", start: 503, end: 503 }, fill: true },
    { name: "Galaxy Z Fold 1007×1209 half-open", w: 1007, h: 1209, fold: { axis: "vertical", state: "half", start: 503, end: 503 }, fill: false },
    { name: "a hinge with width, flat", w: 1114, h: 720, fold: { axis: "vertical", state: "flat", start: 540, end: 574 }, fill: false },
  ] as const;

  for (const size of sizes) {
    test(`${size.name}: ${size.fill ? "the fill button is in Tasks' header" : "no fill button"}`, async () => {
      setViewport(size.w, size.h, size.fold);
      const { root, done } = await drawSide(size.w);
      expect(!!fillButton(root), `${size.name}: fill button ${size.fill ? "missing" : "should not be there"}`).toBe(size.fill);
      done();
    });
  }

  test("⌘2 fills Tasks where the button shows, and opens it beside where it cannot", async () => {
    const A = await rig("onhand", 1180);
    // The iPad: to the whole screen, and again back to the two panes.
    setViewport(1180, 820);
    A.route = { name: "onhand" };
    A.command("onhand");
    expect(A.route).toEqual({ name: "onhand", full: true });
    A.command("onhand");
    expect(A.route).toEqual({ name: "conv" });
    // The same on the Fold unfolded flat: plain wide, even though its width alone is under 1000.
    setViewport(1007, 1209, { axis: "vertical", state: "flat", start: 503, end: 503 });
    A.route = { name: "onhand" };
    A.command("onhand");
    expect(A.route).toEqual({ name: "onhand", full: true });
    A.command("onhand");
    expect(A.route).toEqual({ name: "conv" });
    setViewport(701, 841, { axis: "vertical", state: "flat", start: 350, end: 350 });
    A.route = { name: "onhand" };
    A.command("onhand");
    expect(A.route).toEqual({ name: "onhand", full: true });
    // Half-open like a book: D252 holds; ⌘2 opens Tasks beside the conversation.
    setViewport(1007, 1209, { axis: "vertical", state: "half", start: 503, end: 503 });
    A.route = { name: "onhand" };
    A.command("onhand");
    expect(A.route).toEqual({ name: "onhand" });
  });
});

// D635: the task's header is one leading way up, one ⋯ menu and one fill. The old row of
// icons (walk arrows, working copy, workbench, share, ⋯) is gone; a phone's one-column task keeps
// Share and its D484 sheet. Every compact case would have failed on the old header.
describe("an opened task's header is one back, one ⋯ and one fill", () => {
  const cases = [
    { name: "iPad 1180 beside", w: 1180, full: false, compact: true },
    { name: "iPad 1024 beside", w: 1024, full: false, compact: true },
    { name: "iPad 981 one column", w: 981, full: false, compact: true },
    { name: "Fold 678 beside", w: 678, full: false, fold: { axis: "vertical" as const, state: "flat" as const, start: 339, end: 339 }, compact: true },
    { name: "phone 678 one column", w: 678, full: false, compact: false },
    { name: "iPad 1180 full", w: 1180, full: true, compact: true },
    { name: "iPad 981 full", w: 981, full: true, compact: true },
  ];
  for (const c of cases) {
    test(`${c.name}: ${c.compact ? "one ⋯ and one fill" : "Share + 这个任务"}`, async () => {
      const { root, done } = await drawTask(c.w, c.full, c.fold);
      const header = root.all().find((e) => e.localName === "header" && has(e, "top"));
      expect(header, `${c.name}: no header`).toBeDefined();
      // The old row of icons never comes back.
      expect(hasAny(root, ["tv-nav", "tv-step", "info-btn", "bench-toggle"]).length, `${c.name}: an old icon`).toBe(0);
      const fill = root.all().filter((e) => e.localName === "button" && has(e, "plus") && has(e, "fill"));
      const wide = c.w >= 1000 || !!c.fold;
      if (c.compact) {
        expect(root.all().filter((e) => has(e, "task-more")).length, `${c.name}: task menus`).toBe(1);
        expect(hasAny(root, ["share-btn", "tv-act"]).length, `${c.name}: a phone action in the compact bar`).toBe(0);
        expect(fill.length, `${c.name}: fill`).toBe(wide ? 1 : 0);
      } else {
        expect(root.all().filter((e) => has(e, "task-more")).length, `${c.name}: no compact menu`).toBe(0);
        expect(hasAny(root, ["share-btn"]).length, `${c.name}: Share`).toBe(1);
        expect(root.all().filter((e) => e.localName === "button" && has(e, "more-btn")).length, `${c.name}: the one more`).toBe(1);
        expect(fill.length, `${c.name}: no fill on a phone column`).toBe(0);
      }
      // Places: on a side pane only a one-column, non-phone task has them; the whole screen always
      // does. They are one button on this touch client, never a row of marks.
      const places = root.all().filter((e) => has(e, "places-btn")).length;
      expect(places, `${c.name}: the places button`).toBe(c.full ? 1 : !wide && c.compact ? 1 : 0);
      expect(hasAny(root, ["places"]).filter((e) => e.localName === "nav").length, `${c.name}: the place marks`).toBe(0);
      done();
    });
  }

  test("the one ⋯ menu carries the task's secondary actions, labelled", async () => {
    const { root, done } = await drawTask(1180, false);
    const menu = root.all().find((e) => has(e, "task-menu"));
    // Closed, so the rows are not drawn; the trigger is the one control with its own label.
    const trigger = root.all().find((e) => e.localName === "button" && has(e, "more-btn"));
    expect(trigger?.attrs["aria-label"]).toBe("More");
    expect(menu).toBeUndefined();
    done();
  });
});

describe("the keyboard and the iPad's edge both go up from a full-screen level", () => {
  test("Esc's one step from a task, a Keep and Tasks", async () => {
    const { backOne } = await import("../src/wide.ts");
    const { K } = await import("../src/keep.tsx");
    const A = await rig("task", 1180);
    expect(backOne()).toBe(true);
    expect(A.route).toEqual({ name: "onhand", full: true });
    await rig("keep", 1180);
    expect(K.open).toBe("kp1");
    expect(backOne()).toBe(true);
    expect(K.open).toBe("");
    expect(A.route).toEqual({ name: "onhand", full: true });
    await rig("onhand", 1180);
    expect(backOne()).toBe(true);
    expect(A.route.name).toBe("conv");
  });
});

// ---------- resume: hide, bfcache, and the socket coming back ----------

const people = [
  { id: "default", name: "Ducter", look: "sand", asks: 0 },
  { id: "p2", name: "Dobby", look: "sky", asks: 1 },
];

async function mainRig() {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { strings } = await import("../src/i18n.ts");
  viewportWidth = 1180;
  A.S = new Store();
  A.L = strings("en");
  A.send = (() => true) as never;
  A.S.welcomed = true;
  A.receive({
    t: "welcome",
    persona: "default",
    personaName: "Ducter",
    headSeq: 9,
  } as unknown as ServerFrame);
  A.receive({
    t: "partners",
    partners: people,
    shown: "default",
  } as unknown as ServerFrame);
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [card("t1", "Fix the iPad header", "mem")],
      counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 },
      waiters: [],
      keeps: [],
    },
  } as unknown as ServerFrame);
  A.route = { name: "conv" };
  return A;
}

async function drawMain(_A: Awaited<ReturnType<typeof mainRig>>) {
  const { render, h } = await import("preact");
  const { PartnerList } = await import("../src/partners.tsx");
  const { Top } = await import("../src/views.tsx");
  const Screen = () => h("div", { class: "panes" }, h(PartnerList, { at: "side" }), h("section", { class: "pane conv" }, h(Top, {})));
  const root = new El("div");
  const redraw = () => render(h(Screen, {}), root as never);
  redraw();
  await new Promise((r) => setTimeout(r, 10));
  return { root, redraw, done: () => render(null, root as never) };
}

// D635: the sidebar's toggle belongs only to a bar that has a sidebar beside it. A phone or
// a fold gets the partners' back instead; one partner gets neither; and with the rail hidden at a
// wide width the toggle is the one way back (the partners' back no longer duplicates it).
describe("the conversation's bar names the sidebar only where there is one", () => {
  test("1180, two partners: one rail toggle and one places button, no partners' back, no marks", async () => {
    const A = await mainRig();
    setViewport(1180, 820);
    const { root, done } = await drawMain(A);
    expect(hasAny(root, ["rail-toggle"]).length).toBe(1);
    expect(hasAny(root, ["partners-back"]).length).toBe(0);
    expect(root.all().filter((e) => has(e, "places-btn")).length).toBe(1);
    expect(hasAny(root, ["places"]).filter((e) => e.localName === "nav").length).toBe(0);
    done();
  });
  test("678: the partners' back, no rail toggle, one places button", async () => {
    const A = await mainRig();
    setViewport(678, 900);
    const { root, done } = await drawMain(A);
    expect(hasAny(root, ["rail-toggle"]).length).toBe(0);
    expect(hasAny(root, ["partners-back"]).length).toBe(1);
    expect(root.all().filter((e) => has(e, "places-btn")).length).toBe(1);
    done();
  });
  test("678 at a fold: the partners' back, no rail toggle", async () => {
    const A = await mainRig();
    setViewport(678, 900, { axis: "vertical", state: "flat", start: 339, end: 339 });
    const { root, done } = await drawMain(A);
    expect(hasAny(root, ["rail-toggle"]).length).toBe(0);
    expect(hasAny(root, ["partners-back"]).length).toBe(1);
    done();
  });
  test("one partner: neither a rail toggle nor a partners' back", async () => {
    const A = await mainRig();
    A.partners = [people[0]!];
    setViewport(1180, 820);
    const { root, done } = await drawMain(A);
    expect(hasAny(root, ["rail-toggle"]).length).toBe(0);
    expect(hasAny(root, ["partners-back"]).length).toBe(0);
    done();
  });
  test("the rail hidden at 1180: the toggle is the one way back, not a second partners' back", async () => {
    const A = await mainRig();
    A.setRail("hidden");
    setViewport(1180, 820);
    const { root, done } = await drawMain(A);
    expect(hasAny(root, ["rail-toggle"]).length).toBe(1);
    expect(hasAny(root, ["partners-back"]).length).toBe(0);
    A.setRail("");
    done();
  });
});

describe("resuming paints the last bar and partner list, then re-syncs", () => {
  test("a hidden page's state, painted on return, is never an empty bar or sidebar", async () => {
    const A = await mainRig();
    A.partners = [];
    A.S.welcomed = false;
    const { root, redraw, done } = await drawMain(A);
    expect(root.all().filter((e) => has(e, "pl-row")).length).toBe(0);
    // While hidden, the frames land with no one listening: the state holds them, the DOM does not.
    A.S.welcomed = true;
    A.S.persona = "default";
    A.S.personaName = "Ducter";
    A.partners = people;
    A.S.apply({ t: "on_hand", onHand: { tasks: [card("t1", "Fix the iPad header", "mem")], counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 }, waiters: [], keeps: [] } } as never);
    expect(root.all().filter((e) => has(e, "pl-row")).length).toBe(0);
    // What a person sees is the test: after resume the bar and the partners are drawn. (Counting
    // change listeners broke on CI when another file had replaced the app's listener set.)
    A.resume("visible");
    redraw();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.all().filter((e) => has(e, "pl-row")).length).toBe(2);
    const name = root.all().find((e) => has(e, "name") && e.localName === "button");
    expect(name?.textContent).toBe("Ducter");
    done();
  });

  test("pageshow (bfcache) and a socket drop: hello again, the frames paint the bar and sidebar", async () => {
    const A = await mainRig();
    const { root, redraw, done } = await drawMain(A);
    expect(root.all().filter((e) => has(e, "pl-row")).length).toBe(2);
    const sent = { rehello: 0, probe: 0 };
    A.conn = { rehello: () => void sent.rehello++, probe: () => void sent.probe++ } as never;
    // The page's process was let go: its state is bare, its DOM still shows the old shell.
    A.S = new (await import("../src/store.ts")).Store();
    A.partners = [];
    A.resume("pageshow");
    expect(sent.rehello).toBe(1);
    expect(sent.probe).toBe(1);
    // The hello's own frames, as a fresh open gets them.
    A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 9 } as unknown as ServerFrame);
    A.receive({ t: "partners", partners: people, shown: "default" } as unknown as ServerFrame);
    A.receive({ t: "on_hand", onHand: { tasks: [card("t1", "Fix the iPad header", "mem")], counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 }, waiters: [], keeps: [] } } as unknown as ServerFrame);
    redraw();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.all().filter((e) => has(e, "pl-row")).length).toBe(2);
    expect(root.textContent).toContain("Ducter");
    done();
  });

  test("the kept screen carries the list of partners too", async () => {
    const A = await mainRig();
    A.glanceDevice = "dev-1";
    A.partnerShown = "default";
    A.keepGlance(true);
    const { loadGlance } = await import("../src/glance.ts");
    const g = loadGlance("dev-1");
    expect(g?.partners?.map((p) => p.id)).toEqual(["default", "p2"]);
    const { Store } = await import("../src/store.ts");
    A.S = new Store();
    A.partners = [];
    A.restore(g!);
    expect(A.partners?.map((p) => p.id)).toEqual(["default", "p2"]);
    expect(A.partnerShown).toBe("default");
  });
});

describe("a resume draws the page again, never an empty shell", () => {
  test("a resume with no bar asks for the whole page to be drawn again", async () => {
    const A = await mainRig();
    let painted = 0;
    A.onRepaint = () => void painted++;
    A.resume("visible");
    await new Promise((r) => setTimeout(r, 5));
    expect(painted).toBe(1);
  });

  test("a socket's empty partners answer never blanks the list it already has", async () => {
    const A = await mainRig();
    const before = A.partners;
    A.receive({ t: "partners", partners: [], shown: "default" } as unknown as ServerFrame);
    expect(A.partners).toBe(before);
  });
});
