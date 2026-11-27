// D642 (design/calendar.md §6.2): the calendar change card is a calendar entry, not a status
// stripe. The date leaf is the mark; the title appears once; where shows; the other side is a place;
// "nobody is notified" stays silent unless there is someone to tell. The card is drawn for real
// (Preact into a small DOM) and read back.
import { afterAll, describe, expect, test } from "bun:test";

// ---- a small DOM, just enough for Preact ----
class Node_ {
  childNodes: Node_[] = [];
  parentNode: Node_ | null = null;
  constructor(public nodeType: number) {}
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling(): Node_ | null { const p = this.parentNode; return p ? (p.childNodes[p.childNodes.indexOf(this) + 1] ?? null) : null; }
  get previousSibling(): Node_ | null { const p = this.parentNode; return p ? (p.childNodes[p.childNodes.indexOf(this) - 1] ?? null) : null; }
  appendChild(n: Node_) { return this.insertBefore(n, null); }
  append(...ns: Node_[]) { for (const n of ns) this.appendChild(n); }
  insertBefore(n: Node_, ref: Node_ | null) {
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n: Node_) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { this.parentNode?.removeChild(this); }
  contains(n: Node_ | null): boolean { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  addEventListener() {}
  removeEventListener() {}
  get textContent(): string { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v: string) { this.childNodes = []; if (v) this.appendChild(new Text_(v)); }
}
class Text_ extends Node_ {
  constructor(public data: string) { super(3); }
  override get textContent() { return this.data; }
  get nodeValue() { return this.data; }
  set nodeValue(v: string) { this.data = v; }
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
  get nodeName() { return this.localName.toUpperCase(); }
  get children(): El[] { return this.childNodes.filter((c): c is El => c instanceof El); }
  scrollWidth = 0; clientWidth = 0; scrollHeight = 0; clientHeight = 0; offsetWidth = 0; offsetHeight = 0; scrollTop = 0; scrollLeft = 0;
  get tagName() { return this.nodeName; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  hasAttribute(k: string) { return k in this.attrs; }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  blur() {}
  scrollTo() {}
  scrollIntoView() {}
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  closest() { return null; }
  matches() { return false; }
  get classList() { return { add() {}, remove() {}, toggle() {}, contains: () => false }; }
  all(): El[] {
    const out: El[] = [];
    const go = (n: Node_) => { for (const c of n.childNodes) if (c instanceof El) { out.push(c); go(c); } };
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
  addEventListener() {}, removeEventListener() {},
  activeElement: null,
  querySelector: () => null, querySelectorAll: () => [],
  visibilityState: "visible", hasFocus: () => true,
};
const g = globalThis as Record<string, unknown>;
const had = { document: g.document, matchMedia: g.matchMedia, requestAnimationFrame: g.requestAnimationFrame };
g.document ??= doc;
g.matchMedia ??= (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
g.requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame ??= (h: number) => clearTimeout(h);
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
g.IntersectionObserver ??= g.ResizeObserver;
g.addEventListener ??= () => {};
g.removeEventListener ??= () => {};

afterAll(() => Object.assign(g, had));

type Lang = "zh" | "en";
const title = "和 Lina 对一下 HawDB 发布和这周所有市场材料";
const titleEn = "Walk Lina through the HawDB release and every market material due this week";
const start = "2026-12-12T15:00:00+09:00";
const end = "2026-12-12T15:30:00+09:00";

function change(lang: Lang, over: Record<string, unknown> = {}) {
  return {
    kind: "create",
    title: lang === "zh" ? title : titleEn,
    calendar: lang === "zh" ? "主日历" : "Main calendar",
    account: "weyl.gu",
    color: "#3f8f5f",
    start,
    end,
    where: lang === "zh" ? "Kong Office，12 楼东侧会议室" : "Kong Office, 12th floor east room",
    notify: ["Lina Chen"],
    theirZone: "Asia/Singapore",
    theirName: "Lina",
    ...over,
  };
}

function decision(lang: Lang, over: Record<string, unknown> = {}, id = "d1") {
  return {
    decisionId: id,
    question: lang === "zh" ? `添加「${title}」？` : `Add “${titleEn}”?`,
    goLabel: lang === "zh" ? "添加到日历" : "Add to calendar",
    defaultOption: "hold",
    reversible: false,
    cal: change(lang, over),
    seq: 1,
  };
}

async function rig(lang: Lang) {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const { strings } = await import("../src/i18n.ts");
  A.S = new Store();
  A.L = strings(lang);
  A.replyDraft = new Map();
  A.linkUp = (() => true) as never;
  A.status = "online";
  return A;
}

const all = (root: El, cls: string) => root.all().filter((e) => (e.attrs.class ?? "").split(" ").includes(cls));
const text = (root: El) => root.textContent;

describe("the calendar change card (D642)", () => {
  for (const lang of ["zh", "en"] as const) {
    test(`${lang}: the title appears once and the leaf says the date`, async () => {
      const A = await rig(lang);
      const d = decision(lang);
      const { CalFacts } = await import("../src/calendar.tsx");
      const { render, h } = await import("preact");
      const root = new El("div");
      render(h(CalFacts, { d: d as never }), root as never);
      await new Promise((r) => setTimeout(r, 4));
      const t = text(root);
      expect(t.split(lang === "zh" ? title : titleEn).length - 1).toBe(1);
      const leaf = all(root, "cal-leaf")[0];
      expect(leaf).toBeDefined();
      expect(leaf!.textContent).toContain(lang === "zh" ? "12 月" : "DEC");
      expect(leaf!.textContent).toContain("12");
      expect(leaf!.textContent).toContain(lang === "zh" ? "周六" : "Sat");
      expect(all(root, "cal-leaf-dot").length).toBe(1);
      expect(all(root, "cc-title")[0]!.textContent).toBe(lang === "zh" ? title : titleEn);
      expect(all(root, "cc-zone")[0]!.textContent).toBe(lang === "zh" ? "新加坡时间 周六 14:00" : "14:00 Sat, Singapore time");
      expect(t).not.toContain(lang === "zh" ? "那边" : "for them");
      render(null, root as never);
      expect(A.L.lang).toBe(lang);
    });

    test(`${lang}: the place shows when set, and only then`, async () => {
      await rig(lang);
      const { CalFacts } = await import("../src/calendar.tsx");
      const { render, h } = await import("preact");
      const withWhere = new El("div");
      render(h(CalFacts, { d: decision(lang) as never }), withWhere as never);
      await new Promise((r) => setTimeout(r, 4));
      expect(all(withWhere, "cc-where")[0]!.textContent).toContain("Kong Office");
      const noWhere = new El("div");
      render(h(CalFacts, { d: decision(lang, { where: undefined }) as never }), noWhere as never);
      await new Promise((r) => setTimeout(r, 4));
      expect(all(noWhere, "cc-where").length).toBe(0);
      render(null, withWhere as never);
      render(null, noWhere as never);
    });

    test(`${lang}: the other side is silent when the wall clock is the same`, async () => {
      await rig(lang);
      const { CalFacts } = await import("../src/calendar.tsx");
      const { render, h } = await import("preact");
      const root = new El("div");
      render(h(CalFacts, { d: decision(lang, { start: "2026-12-12T15:00:00+08:00", end: "2026-12-12T15:30:00+08:00" }) as never }), root as never);
      await new Promise((r) => setTimeout(r, 4));
      expect(all(root, "cc-zone").length).toBe(0);
      render(null, root as never);
    });
  }

  test("nobody is notified is silent unless there is someone to tell", async () => {
    await rig("en");
    const { CalFacts } = await import("../src/calendar.tsx");
    const { render, h } = await import("preact");
    const quiet = new El("div");
    render(h(CalFacts, { d: decision("en", { notify: [] }) as never }), quiet as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(all(quiet, "cc-line").some((e) => (e.attrs.class ?? "").includes("notify"))).toBe(false);
    expect(text(quiet)).not.toContain("Nobody is notified");
    render(null, quiet as never);
    const invite = new El("div");
    render(h(CalFacts, { d: decision("en", { notify: ["Lina Chen"] }) as never }), invite as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(text(invite)).toContain("Lina Chen gets an invitation");
    render(null, invite as never);
    const answer = new El("div");
    render(h(CalFacts, { d: decision("en", { kind: "respond", response: "declined", organizer: "", notify: [] }) as never }), answer as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(text(answer)).toContain("Nobody is notified");
    render(null, answer as never);
  });

  test("a move shows the old time struck and the new time after a drawn arrow", async () => {
    await rig("zh");
    const { CalFacts } = await import("../src/calendar.tsx");
    const { render, h } = await import("preact");
    const root = new El("div");
    render(h(CalFacts, { d: decision("zh", { kind: "move", was: { start: "2026-12-10T10:00:00+09:00", end: "2026-12-10T10:30:00+09:00" } }) as never }), root as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(all(root, "cc-was")[0]!.textContent).toContain("原来");
    expect(all(root, "cc-was")[0]!.children.some((c) => c.localName === "s")).toBe(true);
    expect(all(root, "cc-new")[0]!.textContent).toContain("15:00–15:30");
    expect(all(root, "cal-arrow").length).toBe(1);
    render(null, root as never);
  });

  test("the leaf carries the state: a check, a cross, a quiet strike", async () => {
    const A = await rig("en");
    const { CalFacts } = await import("../src/calendar.tsx");
    const { render, h } = await import("preact");
    const drawOne = async (d: ReturnType<typeof decision>) => {
      const root = new El("div");
      render(h(CalFacts, { d: d as never }), root as never);
      await new Promise((r) => setTimeout(r, 4));
      return root;
    };
    A.S.calRuns.set("done", { state: "done", link: "https://calendar.google.com/x", seq: 3 });
    // The run is read when the card is drawn, so draw after it is known.
    const done2 = await drawOne({ ...decision("en", {}, "done"), resolved: { option: "go", by: "user" } });
    expect(all(done2, "cal-leaf").length).toBe(1);
    expect(all(done2, "cal-leaf-badge").length).toBe(1);
    render(null, done2 as never);

    A.S.calRuns.set("failed", { state: "failed", error: "no", seq: 4 });
    const failed2 = await drawOne({ ...decision("en", {}, "failed"), resolved: { option: "go", by: "user" } });
    expect(all(failed2, "failed").length).toBeGreaterThan(0);
    render(null, failed2 as never);

    const cancel = await drawOne({ ...decision("en", { kind: "cancel" }, "cancel") });
    expect(all(cancel, "cancel").length).toBeGreaterThan(0);
    expect(all(cancel, "cal-leaf-strike").length).toBe(1);
    render(null, cancel as never);
  });
});

describe("how a calendar change settles (D642)", () => {
  test("adding says it is still working after twenty seconds", async () => {
    const A = await rig("en");
    const d = { ...decision("en", {}, "slow"), pending: "go", answeredAt: Date.now() - 25_000 };
    A.S.decisions.set("slow", d as never);
    const { CalSettle } = await import("../src/calendar.tsx");
    const { render, h } = await import("preact");
    const root = new El("div");
    render(h(CalSettle, { d: d as never }), root as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(text(root)).toContain("Still working");
    expect(all(root, "spin").length).toBe(1);
    render(null, root as never);
  });

  test("added offers the calendar, failed says why, held says nothing changed", async () => {
    const A = await rig("en");
    const { CalSettle } = await import("../src/calendar.tsx");
    const { render, h } = await import("preact");
    const base = { ...decision("en", {}, "done"), pending: "go", resolved: { option: "go", by: "user" } };
    A.S.calRuns.set("done", { state: "done", link: "https://calendar.google.com/x", seq: 2 });
    const done = new El("div");
    render(h(CalSettle, { d: base as never }), done as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(text(done)).toContain("Added");
    expect(all(done, "btn").some((b) => b.textContent.includes("Open in calendar"))).toBe(true);
    render(null, done as never);

    A.S.calRuns.set("done", { state: "failed", error: "Google Calendar didn't answer. Check first.", seq: 3 });
    const failed = new El("div");
    render(h(CalSettle, { d: base as never }), failed as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(text(failed)).toContain("Couldn't add");
    expect(text(failed)).toContain("Google Calendar didn't answer");
    render(null, failed as never);

    const held = new El("div");
    render(h(CalSettle, { d: { ...base, resolved: { option: "hold", by: "user" } } as never }), held as never);
    await new Promise((r) => setTimeout(r, 4));
    expect(text(held)).toContain("Nothing changed");
    render(null, held as never);
  });
});

test("a card's kind mark leads its words; the calendar's mark is its leaf", async () => {
  const A = await rig("en");
  const { Ask } = await import("../src/views.tsx");
  const { render, h } = await import("preact");
  const mail = { decisionId: "m1", question: "Send the draft reply to Lina?", goLabel: "Send", defaultOption: "hold", reversible: false, draft: { first: "Hi Lina," }, seq: 1 };
  A.S.decisions.set("m1", mail as never);
  const root = new El("div");
  render(h(Ask, { d: mail as never }), root as never);
  await new Promise((r) => setTimeout(r, 4));
  const bubble = all(root, "bubble")[0]!;
  expect(all(root, "kind-mark").length).toBe(1);
  expect(bubble.all().some((e) => (e.attrs.class ?? "").includes("kind-mark"))).toBe(true);
  expect(bubble.textContent.indexOf("Send the draft reply")).toBeGreaterThan(-1);
  render(null, root as never);

  const cal = { ...decision("en"), decisionId: "c1", pending: "" };
  A.S.decisions.set("c1", cal as never);
  const calRoot = new El("div");
  render(h(Ask, { d: cal as never }), calRoot as never);
  await new Promise((r) => setTimeout(r, 4));
  expect(all(calRoot, "cal-leaf").length).toBe(1);
  expect(all(calRoot, "kind-mark").length).toBe(0);
  render(null, calRoot as never);
});

test("the kind mark is read from the card's own fields", async () => {
  const { askKind } = await import("../src/ask-kind.ts");
  const at = (over: Record<string, unknown>) => askKind(over as never);
  expect(at({ cal: {} })).toBe(""); // the date leaf is the calendar's mark
  expect(at({ call: { kind: "go" } })).toBe("call");
  expect(at({ pay: {} })).toBe("pay");
  expect(at({ checkout: {} })).toBe("cart");
  expect(at({ draft: { first: "hi" }, findId: "f1" })).toBe("draft");
  expect(at({ src: { kind: "write", item: { kind: "github" } } })).toBe("comment");
  expect(at({ src: { kind: "write", close: true, item: { kind: "github" } } })).toBe("close");
  expect(at({ src: { kind: "review", item: { kind: "github", pr: true } } })).toBe("pr");
  expect(at({ src: { kind: "write", item: { kind: "obsidian" } } })).toBe("todo");
  expect(at({ src: { kind: "trust", item: { kind: "github" } } })).toBe("trust");
  expect(at({ signIn: { site: "GitHub" } })).toBe("signin");
  expect(at({ key: {} })).toBe("key");
  expect(at({ phone: {} })).toBe("phone");
  expect(at({ handset: {} })).toBe("phone");
  expect(at({ computer: {} })).toBe("computer");
  expect(at({ memPlugin: {} })).toBe("plugin");
  expect(at({ trust: {} })).toBe("trust");
  expect(at({ sender: { from: "x" } })).toBe("message");
  expect(at({ routineId: "r1" })).toBe("reminder");
  expect(at({ loop: { taskId: "t1" } })).toBe("reminder");
  expect(at({ anywhere: { hostname: "x" } })).toBe("tunnel");
  expect(at({ question: "Send this file to Sam?", goLabel: "Send" })).toBe("file");
  expect(at({ question: "Send an email to Sam?", goLabel: "Send" })).toBe("mail");
  expect(at({ question: "Send a message to Sam?", goLabel: "Send" })).toBe("message");
  expect(at({ question: "Call the dentist?", goLabel: "Call" })).toBe("call");
  expect(at({ question: "Pay ¥480 to Kong Coffee?", goLabel: "Pay" })).toBe("pay");
  expect(at({ question: "Check out the order at Kong Coffee?", goLabel: "Checkout" })).toBe("cart");
  expect(at({ question: "Draft a reply to Lina?", goLabel: "Draft" })).toBe("draft");
  expect(at({ question: "Close the issue?", goLabel: "Close" })).toBe("close");
  expect(at({ question: "Post the review on #11389?", goLabel: "Post" })).toBe("pr");
  expect(at({ question: "Wake me at 08:30?", goLabel: "Wake" })).toBe("reminder");
  expect(at({ question: "Sign in to GitHub?", goLabel: "Sign in" })).toBe("signin");
  expect(at({ question: "Can you check the figures?" })).toBe("ask");
  expect(at({ question: "Can you check the PR?", goLabel: "Check" })).toBe("ask");
  expect(at({ question: "Can you check the payment?", goLabel: "Check" })).toBe("ask");
});

test("the ask above the card is a few words, never the title again", async () => {
  await rig("zh");
  const { calAsk } = await import("../src/calendar.tsx");
  const c = change("zh") as never;
  expect(calAsk({ ...c, kind: "create" } as never)).toBe("加到日历？");
  expect(calAsk({ ...c, kind: "move" } as never)).toBe("改到新的时间？");
  expect(calAsk({ ...c, kind: "cancel" } as never)).toBe("取消这个日程？");
  expect(calAsk({ ...c, kind: "respond", response: "declined" } as never)).toBe("拒绝邀请？");
});
