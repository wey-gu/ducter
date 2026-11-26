// The iPad's Tasks screen: full-screen Tasks, then a task, a Keep or one of a Keep's held tasks
// opened from it. Every one of those screens must keep a bar with 对话 / 任务 / {title} (wide) or a
// back control (the one-column layout), and the rail beside an opened task must keep its own head
// even when there is no project lens to name: without it the sidebar had no rule and no way back
// (the author's iPad). This draws the real components, as main.tsx branches them at each width.
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
    let changes = 0;
    const off = A.onChange(() => void changes++);
    A.resume("visible");
    off();
    expect(changes).toBeGreaterThan(0);
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
