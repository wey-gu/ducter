// D535: every needs-you count is a door, and On hand opens on its overview. The conversation's
// 「n 个等你」, a partner's pebble and the line over the composer open the next item of the count
// in 等你's order and step on; a Keep's page lives only while On hand is shown; Esc goes up from it
// to the overview first.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = new Date().toISOString();
const card = (id: string, title: string, attention: string) => ({
  taskId: id,
  persona: "default",
  title,
  project: "ducter",
  place: { kind: "none" },
  harness: "claude-code",
  attention,
  residency: "hot",
  openedAt: now,
  updatedAt: now,
});

// The page's globals the routes touch, for a test without a DOM: set for this file, put back after.
const g = globalThis as any;
const had = { location: g.location, history: g.history, scrollTo: g.scrollTo };
beforeAll(() => {
  g.location = { hash: "", pathname: "/" };
  g.history = { length: 1, pushState: (_: unknown, __: string, h: string) => void (g.location.hash = h) };
  g.scrollTo = () => {};
});
afterAll(() => {
  for (const [k, v] of Object.entries(had)) v === undefined ? delete g[k] : (g[k] = v);
});

async function home() {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const k = await import("../src/keep.tsx");
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [card("t_pr", "PR #11024 要不要合进 main", "needs_you"), card("t_ci", "Android 构建在 CI 上挂了", "failed"), card("t_run", "整理本周 mem 的发布说明", "working")],
      counts: { needs_you: 1, working: 1, waiting: 0, done_today: 0 },
      waiters: [],
      keeps: [{ id: "kp_review", title: "持续评审 nowledge-co，并处理 100gle 分给你的待办", life: "on", run: "same", wakes: [], taskIds: [], since: now }],
    },
  } as any);
  return { A, o, k };
}

describe("a count is a door (D535)", () => {
  test("the door's items are the count's, and each tap steps on and wraps", async () => {
    const { A, o } = await home();
    const items = o.doorItems("");
    expect(items.length).toBe(A.needsCount());
    expect(items.map((i) => i.taskId)).toEqual(["t_pr", "t_ci"]);
    expect(o.nextDoor(items, "")).toBe(0);
    expect(o.nextDoor(items, "t:t_pr")).toBe(1);
    expect(o.nextDoor(items, "t:t_ci")).toBe(0);
    expect(o.nextDoor(items, "t:gone")).toBe(0);
  });

  test("a tap opens On hand's overview on the item, a Keep's page closed, no filter", async () => {
    const { A, o, k } = await home();
    o.door.last = "";
    k.K.open = "kp_review";
    o.L.filter = 3;
    A.applyRoute({ name: "conv" });
    expect(o.openDoor("")).toBe(true);
    expect(A.route.name).toBe("onhand");
    expect(k.K.open).toBe("");
    expect(o.L.filter).toBe(0);
    expect(o.L.focus).toBe("t_pr");
    o.openDoor("");
    expect(o.L.focus).toBe("t_ci");
    o.openDoor("");
    expect(o.L.focus).toBe("t_pr");
  });

  test("the conversation's line says which words are the door", async () => {
    const { A } = await home();
    const s = A.summaryParts();
    expect(s.needs).toBe(A.L.t("header.needs", A.needsCount()));
    expect(s.parts).toContain(s.needs!);
  });
});

describe("On hand opens on its overview (D535)", () => {
  test("leaving On hand closes a Keep's page; a deep link opens it straight", async () => {
    const { A, k } = await home();
    A.applyRoute({ name: "conv" });
    k.openKeep("kp_review");
    expect(A.route.name).toBe("onhand");
    expect(k.K.open).toBe("kp_review");
    A.applyRoute({ name: "task", id: "t_run" });
    expect(k.K.open).toBe("");
    A.applyRoute({ name: "onhand" });
    expect(k.K.open).toBe("");
  });

  test("Esc on a Keep's page goes up to the overview, then to the conversation", async () => {
    const { A, k } = await home();
    k.openKeep("kp_review");
    expect(A.upInPlace?.()).toBe(true);
    expect(k.K.open).toBe("");
    expect(A.route.name).toBe("onhand");
    expect(A.upInPlace?.()).toBe(false);
  });
});
