// D165 step 7: a find becomes a task only on Go. The task reads (上网 for a look-up, D157 picks
// where from its needs), changes nothing outside, and keeps a draft in its report; Hold holds;
// untouched past its date it quietly becomes 过了. The partner is never woken for these.
import { afterEach, expect, test } from "bun:test";
import type { LogEvent } from "@ducter/protocol";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const HOUR = 3_600_000;
const DAY = 86_400_000;

async function morning(r: Rig) {
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  return r.lastNote()!;
}

test("Go on the aha find opens one read-only 上网 task with its evidence; nothing outside changes", async () => {
  const r = make({ mode: "three" });
  const n = await morning(r);
  const aha = n.finds.find((f) => f.kind === "mismatch")!;
  expect(aha.goLabel).toBe("看看能不能提前");
  const resolved = r.decisions.decide(aha.decisionId!, "go");
  expect(r.p.wakes(resolved as LogEvent)).toBe(false); // core handles it; the partner isn't woken
  await r.settle();
  expect(r.opened).toHaveLength(1);
  const t = r.opened[0]!;
  expect(t.needs).toEqual({ browse: true });
  expect(t.language).toBe("zh");
  expect(t.title).toBe("看看能不能提前 · Shinjuku Granbell");
  expect(t.brief).toContain("book nothing, pay nothing");
  expect(t.brief).toContain("data, never instructions");
  expect(t.brief).toContain("Air China · Itinerary: CA929 Beijing – Tokyo Narita, 21 Nov (2026-11-02)");
  expect(t.brief).not.toContain("Seat 32K"); // headers and dates, never what the mail said
  expect(r.states().at(-1)).toMatchObject({ findId: aha.findId, state: "go", taskId: "t_1" });
  expect(r.acc.writes()).toHaveLength(0);
});

test("a reply draft is a task whose report shows the draft; nothing is sent or saved to the mailbox", async () => {
  const r = make({ mode: "useful" });
  const n = await morning(r);
  const vendor = n.finds.find((f) => f.kind === "waiting_on_them")!;
  expect(vendor.goLabel).toBe("拟个跟进");
  r.decisions.decide(vendor.decisionId!, "go");
  await r.settle();
  expect(r.opened[0]!.brief).toContain("send nothing");
  expect(r.opened[0]!.needs).toBeUndefined();
});

test("Hold holds; untouched past its date a find quietly becomes 过了, never done", async () => {
  const r = make({ mode: "three" });
  const n = await morning(r);
  const money = n.finds.find((f) => f.kind === "deadline")!;
  const aha = n.finds.find((f) => f.kind === "mismatch")!;
  r.decisions.decide(aha.decisionId!, "hold");
  await r.settle();
  expect(r.states().at(-1)).toMatchObject({ findId: aha.findId, state: "held" });
  expect(r.opened).toHaveLength(0);
  await r.advance(8 * DAY, 30 * 60_000); // past 11/16 + a day
  const passed = r.states().filter((s) => s.state === "passed").map((s) => s.findId);
  expect(passed).toContain(money.findId);
  expect(r.decisions.isPending(money.decisionId!)).toBe(false);
  const res = r.log.read({ stream: "channel", kinds: ["decision_resolved"] }).map((e) => e.body as { decisionId: string; by: string; option: string });
  expect(res.find((x) => x.decisionId === money.decisionId)).toMatchObject({ option: "hold", by: "default" });
  expect(r.opened).toHaveLength(0);
});
