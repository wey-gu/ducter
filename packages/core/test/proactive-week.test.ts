// D464: Ducter counts its own offers. A week of offers on a fake Log and a fake clock: what was
// shown, opened (怎么知道的, 还有几条), taken up (Go, 有用, a reply), held, muted, faded or still
// live, by source and by kind, with interruptions apart; and the engine logs what was opened once.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { AppendInput, Bodies, EventKind, FindView } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { mondayOf, readWeekEvents, weekReport, weeksSince } from "../src/proactive/week.ts";
import { tempDir } from "./helpers.ts";
import { MORNING } from "./fixtures/inbox.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const ZONE = "Asia/Shanghai";
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));

function fakeLog() {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-01T00:00:00Z"));
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  cleanups.push(() => {
    log.close();
    t.cleanup();
  });
  /** One event at a local time in Shanghai ("2026-11-17", "09:00"). */
  const put = <K extends EventKind>(day: string, hm: string, kind: K, body: Bodies[K], origin: AppendInput<K>["origin"] = "system") => {
    setTime(clock, Date.parse(`${day}T${hm}:00+08:00`));
    log.append({ stream: "channel", origin, kind, body } as AppendInput<K>);
  };
  return { log, clock, put };
}
function setTime(clock: FakeClock, t: number) {
  clock.advance(t - clock.now());
}
const find = (findId: string, kind: FindView["kind"], text: string, offer = true): FindView => ({ findId, kind, text, how: [], decisionId: `d_${findId}`, goLabel: "看看", ...(offer ? { offer: true } : {}) });

/** Two weeks and a bit of the author's offers (Sunday 2026-11-22 is today). */
function aWeek() {
  const f = fakeLog();
  const { put } = f;
  // Three weeks ago: outside a two-week count.
  put("2026-11-03", "08:00", "finds", { noteId: "n0", rung: "morning", opening: "早。", finds: [find("c1", "deadline", "旧的")] }, "partner");
  // Last week: one faded; one taken up the next week (still last week's).
  put("2026-11-10", "08:00", "finds", { noteId: "n1", rung: "morning", opening: "早。", finds: [find("b1", "deadline", "Cloudflare 11/15 起收费"), find("b2", "service", "nightly-stats 失败了 3 次")] }, "partner");
  put("2026-11-11", "08:00", "find_state", { findId: "b1", kind: "deadline", state: "passed" });
  // This week's morning note: six offers from every source.
  put("2026-11-16", "07:00", "decision", { decisionId: "d_a6", question: "今天能清掉的 3 个待办", goLabel: "交给 Ducter", defaultOption: "hold", reversible: false, findId: "a6", offer: true } as Bodies["decision"], "partner");
  put("2026-11-17", "08:00", "finds", {
    noteId: "n2",
    rung: "morning",
    opening: "早。",
    finds: [
      find("a1", "waiting_on_you", "Lina 问你 #2141 什么时候能 review"),
      find("a2", "deadline", "域名 12/01 到期"),
      find("a3", "next_step", "WAL group commit 做完了，#2203 还开着"),
      find("a4", "remembered", "你记下的：周五前把 benchmark 发给 Weizhen"),
      find("a5", "loose_end", "你提过要看 Bun 1.4 的 changelog"),
      find("a6", "todos", "今天能清掉的 3 个待办"),
    ],
  }, "partner");
  put("2026-11-16", "20:00", "decision_resolved", { decisionId: "d_b2", option: "go", by: "user" }, "user");
  put("2026-11-17", "09:00", "find_opened", { findId: "a1", kind: "waiting_on_you", what: "how" }, "user");
  put("2026-11-17", "09:01", "decision_resolved", { decisionId: "d_a1", option: "go", by: "user" }, "user");
  put("2026-11-17", "09:01", "find_state", { findId: "a1", kind: "waiting_on_you", state: "go", taskId: "t_1" });
  put("2026-11-17", "10:00", "find_state", { findId: "a2", kind: "deadline", state: "useful" }, "user");
  put("2026-11-17", "11:00", "find_opened", { findId: "a4", kind: "remembered", what: "more" }, "user");
  put("2026-11-17", "11:00", "find_opened", { findId: "a5", kind: "loose_end", what: "more" }, "user");
  put("2026-11-17", "11:02", "find_state", { findId: "a5", kind: "loose_end", state: "muted", ruleId: "r1" }, "user");
  // A fold-in repeats the note's finds and adds one.
  put("2026-11-17", "15:00", "finds", { noteId: "n3", rung: "fold", revises: "n2", opening: "早。", finds: [find("a1", "waiting_on_you", "x"), find("a7", "said", "你说下午三点提醒你给妈妈打电话")], added: 1 }, "partner");
  put("2026-11-18", "08:00", "decision_resolved", { decisionId: "d_a4", option: "hold", by: "default" });
  put("2026-11-18", "08:00", "find_state", { findId: "a4", kind: "remembered", state: "passed" });
  put("2026-11-18", "08:00", "decision_resolved", { decisionId: "d_a6", option: "hold", by: "default" });
  put("2026-11-18", "20:00", "user_msg", { text: "这个 #2203 我来关", reply: { seq: 1, from: "partner", kind: "find", quote: "WAL", ts: "2026-11-17T00:00:00Z", findId: "a3" } }, "user");
  // Interruptions: one taken up, one let pass.
  put("2026-11-19", "14:00", "finds", { noteId: "n4", rung: "now", opening: "", finds: [find("i1", "plan_changed", "CA930 改到 21:40 起飞", false)] }, "partner");
  put("2026-11-19", "14:05", "decision_resolved", { decisionId: "d_i1", option: "go", by: "user" }, "user");
  put("2026-11-20", "09:50", "finds", { noteId: "n5", rung: "meeting", opening: "", finds: [find("i2", "meeting", "10 点的 standup，#2141 还没回", false)] }, "partner");
  put("2026-11-20", "12:00", "find_state", { findId: "i2", kind: "meeting", state: "passed" });
  setTime(f.clock, Date.parse("2026-11-22T10:00:00+08:00"));
  return f;
}

test("weeks start on Monday in the person's zone", () => {
  expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // a Sunday
  expect(mondayOf("2026-11-16")).toBe("2026-11-16");
  expect(mondayOf("2026-11-10")).toBe("2026-11-09");
});

test("a week of offers: shown, opened, taken up, faded, live; by source and kind; interruptions apart", () => {
  const { log, clock } = aWeek();
  const now = clock.now();
  const r = weekReport(readWeekEvents(log, weeksSince(now, ZONE, 2)), { now, zone: ZONE, weeks: 2, mode: "useful" });
  expect(r.weeks.map((w) => [w.from, w.to, w.current])).toEqual([
    ["2026-11-09", "2026-11-15", false],
    ["2026-11-16", "2026-11-22", true],
  ]);
  const [last, cur] = r.weeks as [(typeof r.weeks)[0], (typeof r.weeks)[0]];
  // Last week: a Go given on Monday counts with the offer, in the week it was said.
  expect(last.offers).toMatchObject({ shown: 2, go: 1, taken: 1, faded: 1, waiting: 0 });
  // This week: the fold-in's repeat counts once; a7 is still live.
  expect(cur.offers).toEqual({ shown: 7, opened: 3, go: 1, useful: 1, replied: 1, held: 0, muted: 1, faded: 2, waiting: 1, taken: 3, answered: 5 });
  expect(Object.fromEntries(Object.entries(cur.bySource).map(([k, v]) => [k, v.shown]))).toEqual({ accounts: 2, tasks: 1, mem: 1, conversation: 2, todos: 1 });
  expect(cur.bySource.tasks).toMatchObject({ replied: 1, taken: 1 });
  expect(cur.bySource.mem).toMatchObject({ opened: 1, faded: 1, taken: 0 });
  expect(cur.byKind.todos).toMatchObject({ shown: 1, faded: 1 });
  expect(cur.byKind.loose_end).toMatchObject({ muted: 1, faded: 0 });
  expect(cur.interruptions).toMatchObject({ shown: 2, go: 1, taken: 1, faded: 1 });
  expect(cur.takenUp.map((x) => [x.kind, x.by, x.offer])).toEqual([
    ["waiting_on_you", "go", true],
    ["deadline", "useful", true],
    ["next_step", "replied", true],
    ["plan_changed", "go", false],
  ]);
  // Three weeks back, the first one appears.
  const r3 = weekReport(readWeekEvents(log, weeksSince(now, ZONE, 3)), { now, zone: ZONE, weeks: 3, mode: "useful" });
  expect(r3.weeks[0]!.offers.shown).toBe(1);
});

test("the weights now: kinds as learned, the senders furthest from 1", () => {
  const r = weekReport([], { now: MORNING, zone: ZONE, weeks: 1, mode: "useful", weights: { kind: { waiting_on_you: 2.25, deadline: 0.9025 }, sender: { "lina@example.org": 2.25, "news@shop.example": 0.857375, same: 1 } } });
  expect(r.weights.kind).toEqual({ waiting_on_you: 2.25, deadline: 0.9 });
  expect(r.weights.senders).toEqual([
    { sender: "lina@example.org", w: 2.25 },
    { sender: "news@shop.example", w: 0.86 },
  ]);
  expect(r.weeks).toHaveLength(1);
  expect(r.weeks[0]!.offers.shown).toBe(0);
});

test("reading the Log pages back past one read", () => {
  const { log, put } = fakeLog();
  put("2026-11-17", "08:00", "finds", { noteId: "n", rung: "morning", opening: "", finds: [find("z1", "deadline", "x")] }, "partner");
  for (let i = 0; i < 2100; i++) log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: `m${i}` } });
  const evs = readWeekEvents(log, Date.parse("2026-11-16T00:00:00+08:00"));
  expect(evs.some((e) => e.kind === "finds")).toBe(true);
  expect(evs.length).toBe(2101);
});

// ---------- the engine ----------

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));

test("opened is logged once per find and what, only for finds it said, and never moves a weight", async () => {
  const r = rig({ mode: "useful" });
  rigs.push(r);
  await r.p.lookNow(40);
  await r.advance(3_600_000 + 2 * 60_000);
  const n = r.notes().map((e) => e.body).find((b) => b.rung === "morning" && !b.quiet)!;
  const [first, second] = n.finds as [FindView, FindView];
  const before = r.p.weights();
  expect(r.p.opened([first.findId], "how")).toBe(1);
  expect(r.p.opened([first.findId], "how")).toBe(0);
  expect(r.p.opened([first.findId, second.findId, "find_nope"], "more")).toBe(2);
  expect(r.p.opened(["find_nope"], "how")).toBe(0);
  const logged = r.log.read({ stream: "channel", kinds: ["find_opened"] }).map((e) => e.body as Bodies["find_opened"]);
  expect(logged).toEqual([
    { findId: first.findId, kind: first.kind, what: "how" },
    { findId: first.findId, kind: first.kind, what: "more" },
    { findId: second.findId, kind: second.kind, what: "more" },
  ]);
  expect(r.p.weights()).toEqual(before);
  // Go on one: counted as taken up, and its kind's weight is what the report shows.
  r.decisions.decide(first.decisionId!, "go");
  await r.settle();
  const rep = weekReport(readWeekEvents(r.log, weeksSince(r.clock.now(), "Asia/Shanghai", 1)), { now: r.clock.now(), zone: "Asia/Shanghai", weeks: 1, mode: "useful", weights: r.p.weights() });
  const w = rep.weeks.at(-1)!;
  expect(w.offers.shown).toBe(n.finds.length);
  expect(w.offers).toMatchObject({ go: 1, taken: 1, opened: 2 });
  expect(rep.weights.kind[first.kind]).toBe(1.5);
  // Opening is remembered across a restart (the state file), so it is never logged twice.
  expect(JSON.parse(await Bun.file(join(r.dir, "proactive.json")).text()).opened).toContain(`how:${first.findId}`);
});
