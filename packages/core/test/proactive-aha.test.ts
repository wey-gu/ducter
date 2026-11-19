// D388 (research/154): the moments a good personal AI gives, replayed through the whole engine on
// fakes (the rig: the real Log, settings, rules; a fake clock, fake accounts, recorded triage,
// code's bar, a fake web look). It must say the contradiction before travel is booked, come back
// once with the time it named as missing, name what it doesn't know, answer "how did you know?"
// from its own lines, bundle what comes together, and stay quiet where nothing is wrong. The same
// timeline is printed by packages/partner/eval/proactive/aha.ts.
import { afterEach, expect, test } from "bun:test";
import type { ProactiveMode } from "@ducter/protocol";
import { fitsBudget } from "../src/proactive/judge.ts";
import { samePlan } from "../src/proactive/plans.ts";
import { hit, runAha } from "./aha-run.ts";
import { AGIBAR_PAGE, AHA_NEVER, AHA_SAY } from "./fixtures/aha-days.ts";
import type { Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));
const run = async (mode: ProactiveMode, o: Parameters<typeof runAha>[1] = {}) => {
  const x = await runAha(mode, o);
  rigs.push(x.r);
  return x;
};

test("每天最多 3 件: the contradiction before travel, the time filled once, the quota and the two old aha moments; never the agreeing meetup or their own words", async () => {
  const { said, r, look } = await run("three");
  for (const w of AHA_SAY) {
    const h = hit(said, w);
    expect(h ? w.case : `missed ${w.case}: ${JSON.stringify(said.map((s) => s.text))}`).toBe(w.case);
    expect(h!.at).toBeLessThanOrEqual(Date.parse(w.by));
  }
  for (const n of AHA_NEVER) expect(said.filter((s) => s.text.includes(n))).toEqual([]);
  expect(new Set(said.map((s) => s.text)).size).toBe(said.length);
  for (const s of said) expect(fitsBudget(s.text, "zh") ? "fits" : `${[...s.text].length}: ${s.text}`).toBe("fits");

  const contra = hit(said, AHA_SAY[0]!)!;
  // Before travel is booked: said the evening the weekly report came, not at night, and says what to do.
  expect(contra.at).toBeLessThan(Date.parse("2026-11-18T23:00:00+08:00"));
  expect(contra.text).toContain("订票前先跟主办方确认");
  expect(contra.unknown).toBe("几点开始");
  // 怎么知道的: the calendar's hold first, then the weekly report, each with what it says.
  expect(contra.how.map((h) => h.src)).toEqual(["calendar", "mail"]);
  expect(contra.how[0]!.says).toBe("11/21（周六），全天，没写时间");
  expect(contra.how[1]!.says).toBe("11/20（周五）");

  // The follow-up: once, no sooner than half an hour after, linked to the page it read.
  const fill = hit(said, AHA_SAY[1]!)!;
  expect(fill.at - contra.at).toBeGreaterThanOrEqual(30 * 60_000);
  expect(fill.how[0]).toMatchObject({ src: "web", url: AGIBAR_PAGE });
  expect(fill.text).toContain("几点上场页面上没写");
  expect(said.filter((s) => s.kind === "update")).toHaveLength(1);
  // Only the open question went to the web, with nothing private in it: the plan, its place, the two days.
  expect(look!.asked).toHaveLength(1);
  expect(look!.asked[0]).toContain("AGI Bar");
  expect(look!.asked[0]).toContain("2026-11-21");
  expect(look!.asked[0]).not.toMatch(/Lina|周报|Wey|example\.org/);

  // The quota names what the mail didn't say; things found together are one calm message (the first morning: the renewal, the flight and Mia; never the stranger's pitch).
  const quota = hit(said, AHA_SAY[2]!)!;
  expect(quota.text).toContain("还剩多少");
  const first = said.find((s) => s.text.includes("ducter-demo.example"))!;
  expect(said.filter((s) => s.noteId === first.noteId).map((s) => s.kind).sort()).toEqual(["deadline", "mismatch", "waiting_on_you"]);

  // "How did you know?": composed from the lines, in order, with the page; what it doesn't know and didn't change.
  const n = r.p.noticed();
  const agi = n.items.find((i) => i.kind === "mismatch" && i.text.includes("AGI Bar"))!;
  expect(agi.why).toContain("日历");
  expect(agi.why).toContain("周报");
  expect(agi.why).toContain("还不知道：几点开始");
  expect(agi.why).toContain("日历我没改");
  const filled = n.items.find((i) => i.kind === "update")!;
  expect(filled.why).toContain(AGIBAR_PAGE);
}, 120_000);

test("no web look, or one that settles nothing: the contradiction is said, and nothing follows it", async () => {
  for (const web of ["off", "none"] as const) {
    const { said, look } = await run("three", { web });
    expect(hit(said, AHA_SAY[0]!)).toBeDefined();
    expect(said.filter((s) => s.kind === "update")).toEqual([]);
    if (look) expect(look.asked.length).toBeLessThanOrEqual(2);
  }
}, 240_000);

test("只说急的: the contradiction two days out is urgent and goes; the quota and the renewal a week out wait", async () => {
  const { said } = await run("urgent");
  expect(hit(said, AHA_SAY[0]!)).toBeDefined();
  expect(said.some((s) => s.text.includes("95%"))).toBe(false);
}, 120_000);

test("an early morning note is assembled when the person looks, never when a socket reconnects (an update's restart)", async () => {
  const { rig } = await import("./proactive-rig.ts");
  const r = rig({ mode: "three", start: Date.parse("2026-11-10T06:30:00+08:00"), present: true });
  rigs.push(r);
  await r.p.lookNow(40);
  r.p.hello("Asia/Shanghai");
  await r.settle();
  expect(r.notes().filter((n) => n.body.rung === "morning")).toEqual([]);
  r.p.hello(undefined, true);
  await r.settle();
  expect(r.notes().filter((n) => n.body.rung === "morning")).toHaveLength(1);
});

test("the same plan by name, never by its city or its kind", () => {
  expect(samePlan("AGI Bar 北京分享", "AGI Bar Beijing talk")).toBe(true);
  expect(samePlan("北京 agibar 分享", "AGI Bar Beijing")).toBe(true);
  expect(samePlan("去西湖音乐节", "西湖音乐节")).toBe(true);
  expect(samePlan("AI Builders Meetup", "AI Builders Meetup Shanghai")).toBe(true);
  expect(samePlan("Beijing dinner", "AGI Bar Beijing talk")).toBe(false);
  expect(samePlan("北京分享", "北京见面")).toBe(false);
  expect(samePlan("Weekly sync", "Weekly report")).toBe(false);
});
