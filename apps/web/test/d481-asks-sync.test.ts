// D481: a question answered anywhere is answered on every surface of this client: the card in the
// conversation, On hand's rows and its 等你 count, a partner's own asks, the opened task's page.
// The matrix: each way it can be resolved (go, hold, reply, its default, closed because its task
// ended) by each way the word arrives (live; missed while away and closed by On hand's openAsks,
// then the home's own events from asks_get), for a task's question and the partner's own (a loop's
// card has no task). hel, 2026-11-23: d_41d4dd8a8a stayed open on one window after its reply.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent, OnHand } from "@ducter/protocol";
import { Store } from "../src/store.ts";

let seq = 0;
const ev = <K extends keyof Bodies>(kind: K, body: Bodies[K], stream = "channel"): LogEvent => ({ seq: ++seq, ts: new Date(Date.parse("2026-11-23T01:00:00Z") + seq * 1000).toISOString(), stream, origin: "system", kind, body }) as LogEvent;
const onHand = (ids: string[], asOf: number): OnHand => ({ tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], openAsks: { ids, asOf } });

type Kind = "task" | "partner";
function asked(s: Store, kind: Kind) {
  const id = `d_${kind}${seq}`;
  if (kind === "task") {
    s.apply({ t: "events", events: [ev("task_open", { taskId: "b7gw6r2e", title: "在 hel 用 Gemini 审改 Mem 长文案并开 PR", project: "", place: { kind: "none" }, harness: "antigravity", brief: "x" }, "task:b7gw6r2e"), ev("task_state", { taskId: "b7gw6r2e", attention: "needs_you", residency: "warm" }, "task:b7gw6r2e")] });
    s.apply({ t: "events", events: [ev("decision", { decisionId: id, taskId: "b7gw6r2e", question: "要开 PR 吗？", goLabel: "开 PR", defaultOption: "hold", reversible: true })] });
  } else s.apply({ t: "events", events: [ev("decision", { decisionId: id, question: "「在 hel 用 Gemini 审改 Mem 长文案并开 PR」这一轮跑了很久。", goLabel: "现在跑一次", defaultOption: "hold", reversible: true, loop: { taskId: "b7gw6r2e" } })] });
  return id;
}

/** Every surface's view of the question: true where it still shows as waiting for the person. */
function surfaces(s: Store, id: string, kind: Kind) {
  const d = s.decisions.get(id);
  return {
    card: !!d && !d.resolved && !d.pending, // the conversation's card (and the sheet's): its buttons
    onHand: s.openDecisions().some((x) => x.decisionId === id), // On hand's rows, its count, the menu bar's
    partnerAsks: kind === "partner" ? s.partnerDecisions().some((x) => x.decisionId === id) : false,
    taskPage: kind === "task" ? s.pendingDecision("b7gw6r2e")?.decisionId === id : false,
  };
}
const NONE = { card: false, onHand: false, partnerAsks: false, taskPage: false };

const WAYS: Bodies["decision_resolved"][] = [
  { decisionId: "", option: "go", by: "user" },
  { decisionId: "", option: "hold", by: "user" },
  { decisionId: "", option: "reply", text: "应该是一直在推进，你可以直接看看吧？", by: "user" },
  { decisionId: "", option: "hold", by: "default" },
  { decisionId: "", option: "hold", by: "ended", settled: true },
];

const CASES = (["task", "partner"] as Kind[]).flatMap((kind) => WAYS.map((way) => ({ kind, way })));

test("live: each way of answering closes every surface at once, for a task's question and the partner's own", () => {
  for (const { kind, way } of CASES) {
      const s = new Store();
      s.apply({ t: "welcome", persona: "default", headSeq: 0 } as never);
      const id = asked(s, kind);
      expect(Object.values(surfaces(s, id, kind)).some(Boolean)).toBe(true);
      s.apply({ t: "events", events: [ev("decision_resolved", { ...way, decisionId: id })] });
      expect(surfaces(s, id, kind)).toEqual(NONE);
      expect(s.decisions.get(id)!.resolved).toMatchObject({ option: way.option, by: way.by });
  }
});

test("missed while away: On hand's openAsks closes it on every surface, then the home's events (asks_get) say how", () => {
  for (const { kind, way } of CASES) {
      const s = new Store();
      s.apply({ t: "welcome", persona: "default", headSeq: 0 } as never);
      const id = asked(s, kind);
      const resolved = ev("decision_resolved", { ...way, decisionId: id }); // logged while this client slept: never delivered
      // Reconnect: a snapshot newer than the resolution, without it in the open set.
      s.apply({ t: "welcome", persona: "default", headSeq: seq } as never);
      s.apply({ t: "on_hand", onHand: onHand([], seq) });
      expect(surfaces(s, id, kind)).toEqual(NONE);
      expect(s.decisions.get(id)!.elsewhere).toBe(true);
      expect(s.takeAsksWanted()).toEqual([id]);
      expect(s.takeAsksWanted()).toEqual([]); // once a socket
      // asks_get's answer: the home's own resolution replaces the stand-in.
      s.apply({ t: "events", events: [resolved] });
      expect(s.decisions.get(id)!.elsewhere).toBeUndefined();
      expect(s.decisions.get(id)!.resolved).toMatchObject({ option: way.option, by: way.by });
      expect(surfaces(s, id, kind)).toEqual(NONE);
  }
});

test("snapshot vs event order: a question asked after the snapshot's asOf is never closed by it", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", headSeq: 0 } as never);
  const asOf = seq;
  const id = asked(s, "partner"); // its event came after the snapshot was taken
  s.apply({ t: "on_hand", onHand: onHand([], asOf) });
  expect(surfaces(s, id, "partner").onHand).toBe(true);
  expect(s.takeAsksWanted()).toEqual([]);
});

test("open at the home but unknown here (asked before what this page loaded): asked for, then shown on every surface", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", headSeq: 0 } as never);
  const d = ev("decision", { decisionId: "d_far", question: "要把 hel 的 CI 等待改成每小时一次吗？", goLabel: "改", defaultOption: "hold", reversible: true });
  s.apply({ t: "on_hand", onHand: onHand(["d_far"], seq) });
  expect(s.takeAsksWanted()).toEqual(["d_far"]);
  s.apply({ t: "events", events: [d] });
  expect(surfaces(s, "d_far", "partner")).toEqual({ card: true, onHand: true, partnerAsks: true, taskPage: false });
  // Asked once a socket; a new socket asks again for what it still lacks.
  s.apply({ t: "on_hand", onHand: onHand(["d_far", "d_x"], seq) });
  expect(s.takeAsksWanted()).toEqual(["d_x"]);
  s.apply({ t: "on_hand", onHand: onHand(["d_far", "d_x"], seq) });
  expect(s.takeAsksWanted()).toEqual([]);
  s.apply({ t: "welcome", persona: "default", headSeq: seq } as never);
  s.apply({ t: "on_hand", onHand: onHand(["d_far", "d_x"], seq) });
  expect(s.takeAsksWanted()).toEqual(["d_x"]);
});

test("a question the home still has open stays open, even one this page answered and the home never got (it shows as sent)", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", headSeq: 0 } as never);
  const id = asked(s, "partner");
  s.apply({ t: "on_hand", onHand: onHand([id], seq) });
  expect(surfaces(s, id, "partner").onHand).toBe(true);
  expect(s.decisions.get(id)!.resolved).toBeUndefined();
});

test("words left in a card's reply box after it was answered elsewhere are offered as a message, on both card layouts, zh and en", () => {
  const views = readFileSync(join(import.meta.dir, "../src/views.tsx"), "utf8");
  expect(views.match(/<LeftDraft /g)?.length).toBe(2);
  expect(readFileSync(join(import.meta.dir, "../src/app.ts"), "utf8")).toContain("sendLeftDraft(d: DecisionState, text: string)");
  const i18n = readFileSync(join(import.meta.dir, "../src/i18n.ts"), "utf8");
  for (const k of ["decision.left.line", "decision.left.send", "decision.left.drop", "decision.resolved.ended", "decision.resolved.elsewhere"]) expect(i18n.split(`"${k}"`).length).toBe(3);
});
