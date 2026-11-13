// D243 (research/81): the day dots spoke four times and Ducter said nothing, replayed through the
// whole engine on fakes (the rig: the real Log, settings, rules; a fake clock and fake accounts;
// recorded triage; code's bar). It must say the right things, by themselves, at the right times,
// in good words, and stay quiet on the noise. The same timeline is printed by
// packages/partner/eval/proactive/day.ts.
import { afterEach, expect, test } from "bun:test";
import type { ProactiveMode } from "@ducter/protocol";
import { fitsBudget } from "../src/proactive/judge.ts";
import { DOTS_NEVER, DOTS_SAY, DOTS_START, dotsDay } from "./fixtures/dots-day.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));

export interface Said {
  at: number;
  rung: string;
  kind: string;
  text: string;
}

/** Runs the three days (Wed 07:00 to Sat 12:00), mail arriving as it did; returns what was said and when. */
export async function runDots(mode: ProactiveMode, o: { ask?: string } = {}) {
  const { fx, later } = dotsDay();
  const r = rig({ mode, fx, start: DOTS_START, present: true });
  rigs.push(r);
  await r.settle();
  const end = Date.parse("2026-11-14T12:00:00+08:00");
  const STEP = 10 * 60_000;
  const queue = [...later].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let asked: ReturnType<typeof r.p.noticed> | undefined;
  while (r.clock.now() < end) {
    await r.advance(STEP, STEP);
    while (queue.length && Date.parse(queue[0]!.at) <= r.clock.now()) {
      const l = queue.shift()!;
      fx.mail.push({ ...l.mail, date: new Date(r.clock.now() + 1000).toISOString() });
      fx.triage[l.mail.id] = l.triage;
    }
    if (o.ask && !asked && r.clock.now() >= Date.parse(o.ask)) asked = r.p.noticed();
  }
  const said: Said[] = r.notes().flatMap((e) => (e.body.revises ? [] : e.body.finds.map((f) => ({ at: e.ts ? Date.parse(e.ts) : 0, rung: e.body.rung, kind: f.kind, text: f.text }))));
  // A fold-in revises the morning note: its added finds are said when it folds.
  for (const e of r.notes()) if (e.body.revises && e.body.added) for (const f of e.body.finds.slice(-e.body.added)) said.push({ at: Date.parse(e.ts), rung: "fold", kind: f.kind, text: f.text });
  return { r, said, asked };
}

test("每天最多 3 件: the four things dots said, and the stuck user and the failing job, each said once, in time; the noise never", async () => {
  const { said, r } = await runDots("three", { ask: "2026-11-13T11:00:00+08:00" });
  for (const w of DOTS_SAY) {
    const hit = said.find((s) => s.kind === w.kind && s.text.includes(w.contains));
    expect(hit ? `${w.kind} ${w.contains}` : `missed ${w.kind} ${w.contains}`).toBe(`${w.kind} ${w.contains}`);
    expect(hit!.at).toBeLessThanOrEqual(Date.parse(w.by));
  }
  for (const n of DOTS_NEVER) expect(said.filter((s) => s.text.includes(n))).toEqual([]);
  // Each once; each in the phone's budget; never about itself.
  expect(new Set(said.map((s) => s.text)).size).toBe(said.length);
  for (const s of said) {
    expect(fitsBudget(s.text, true)).toBe(true);
    expect(s.text).not.toMatch(/我(看|读|查)了|封(邮件|信)|还没(主动)?(告诉|跟你说)/);
  }
  // Nothing during quiet hours (23:00–08:00) except the morning note at its end.
  for (const s of said) {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(new Date(s.at)));
    expect(h >= 8 && h < 23).toBe(true);
  }
  expect(r.sent.length).toBeGreaterThan(0);
}, 120_000);

test("只说急的 (hel's setting): no daily note, yet the trip, the maintenance, the failing job and the money due tomorrow get through", async () => {
  const { said } = await runDots("urgent");
  const has = (kind: string, w: string) => said.some((s) => s.kind === kind && s.text.includes(w));
  expect(has("coming_up", "NH 920")).toBe(true);
  expect(has("service", "PlanetScale")).toBe(true);
  expect(has("service", "nightly-stats")).toBe(true);
  expect(has("deadline", "Cloudflare AI Search")).toBe(true);
  // A shutdown later called off is never said.
  expect(said.some((s) => s.text.includes("Conductor"))).toBe(false);
  for (const n of DOTS_NEVER) expect(said.filter((s) => s.text.includes(n))).toEqual([]);
}, 120_000);

test("asked at 11:00 (noticed): what matters, time-bound first, the carpets last if at all", async () => {
  const { asked } = await runDots("urgent", { ask: "2026-11-13T11:00:00+08:00" });
  expect(asked?.watching).toBe(true);
  const texts = asked!.items.map((i) => i.text);
  const top = texts.slice(0, 5).join(" | ");
  for (const w of ["NH 920", "PlanetScale", "nightly-stats", "Cloudflare AI Search"]) expect(top).toContain(w);
  const ww = texts.findIndex((t) => t.includes("WeWork"));
  expect(ww === -1 || ww >= 4).toBe(true);
  for (const i of asked!.items) expect(i.how.length).toBeGreaterThan(0);
}, 120_000);
