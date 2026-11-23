// D502: cross-source findings in shadow. Code's guards over what the model returns (cited facts
// real, one per fact set, a cap), the comparison with the detectors, dedupe across passes, the
// day's budget; the engine logs a pass on the partner stream and says nothing; the week counts it.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { CROSS_FINDINGS_MAX, CROSS_RUNS_A_DAY, guardFindings, parseFindings, shadowPass, type CrossAsk } from "../src/proactive/cross.ts";
import type { Candidate } from "../src/proactive/candidate.ts";
import type { Fact } from "../src/proactive/ledger.ts";
import { shadowWeek } from "../src/proactive/week.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const NOW = Date.parse("2026-11-24T09:00:00+08:00");
const ref = (id: string) => ({ connectionId: "c", service: "gmail", id });
const flight: Fact = { id: "f_fl", ref: ref("m1"), label: "MU 523", at: "2026-11-20T10:00:00+08:00", date: "2026-12-03T14:20:00+09:00", type: "booking", what: "flight", name: "MU 523", place: "Osaka", start: "2026-12-03T10:50:00+08:00", end: "2026-12-03T14:20:00+09:00" };
const hotel: Fact = { id: "f_ht", ref: ref("m2"), label: "Shibuya Stream", at: "2026-11-20T10:00:00+08:00", date: "2026-12-07", type: "booking", what: "hotel", name: "Shibuya Stream", place: "Tokyo", start: "2026-12-04", end: "2026-12-07" };
const old: Fact = { id: "f_old", ref: ref("m3"), label: "Uber", at: "2026-10-01T10:00:00+08:00", date: "2026-10-01T10:00:00+08:00", type: "payment", name: "Uber" };
const ask = (findings: unknown[], tokens = 900): CrossAsk => async () => ({ findings: findings as never, tokens });

test("code drops a finding that cites a fact it wasn't shown, or none, or no words; one per fact set; a cap", () => {
  const g = guardFindings(
    [
      { facts: ["f_ht", "f_fl"], text: "Lands in Osaka, the hotel is in Tokyo.", why: "a night lost", next: "check the hotel", confidence: 1.7 },
      { facts: ["f_fl", "f_ht"], text: "Same thing again." },
      { facts: ["f_fl", "f_made_up"], text: "Invented." },
      { facts: [], text: "Nothing cited." },
      { facts: ["f_fl"], text: "  " },
    ],
    [flight, hotel],
  );
  expect(g.kept).toEqual([{ key: "f_fl+f_ht", facts: ["f_fl", "f_ht"], text: "Lands in Osaka, the hotel is in Tokyo.", why: "a night lost", next: "check the hotel", confidence: 1 }]);
  expect(Object.fromEntries(g.dropped.map((d) => [d.why, d.n]))).toEqual({ duplicate: 1, unknown_fact: 1, no_facts: 1, no_text: 1 });
  const many = guardFindings(Array.from({ length: CROSS_FINDINGS_MAX + 2 }, (_, i) => ({ facts: i % 2 ? ["f_fl"] : ["f_ht"], text: `t${i}` })), [flight, hotel]);
  expect(many.kept.length).toBe(2);
  expect(parseFindings('Sure: [{"facts":["f_fl"],"text":"x"}] done')).toHaveLength(1);
  expect(parseFindings("no array")).toEqual([]);
});

test("a pass compares with the detectors, marks what was said, and never logs a fact set twice", async () => {
  const mismatch = { key: "mismatch:f_fl:f_ht", kind: "mismatch", facts: ["f_fl", "f_ht"] } as Candidate;
  const heads = { key: "coming:f_fl", kind: "coming_up", facts: ["f_fl"] } as Candidate;
  const seen: Record<string, number> = {};
  const base = { by: "asked" as const, now: NOW, ctx: { lang: "en" as const, today: "2026-11-24", zone: "Asia/Shanghai" }, facts: [flight, hotel, old], saidFacts: new Set(["f_fl"]), seen };
  const r1 = await shadowPass({ ...base, runId: "s1", candidates: [mismatch, heads], ask: ask([{ facts: ["f_fl", "f_ht"], text: "Wrong city." }]) });
  expect(r1.facts).toBe(2); // the payment from October is over
  expect(r1.findings[0]).toMatchObject({ alsoBy: ["mismatch"], said: true });
  expect(r1.detectorsOnly).toEqual([]);
  const r2 = await shadowPass({ ...base, runId: "s2", candidates: [heads], ask: ask([{ facts: ["f_fl", "f_ht"], text: "Wrong city." }]) });
  expect(r2.findings).toEqual([]);
  expect(r2.repeats).toBe(1);
  // A heads-up on the same flight is a reminder, not the same finding; a join the model didn't touch is the detectors' alone.
  const r3 = await shadowPass({ ...base, runId: "s3", seen: {}, candidates: [heads, mismatch], ask: ask([]) });
  expect(r3.detectorsOnly.map((d) => d.kind)).toEqual(["mismatch"]);
  const r4 = await shadowPass({ ...base, runId: "s4", seen: {}, candidates: [heads], ask: ask([{ facts: ["f_fl", "f_ht"], text: "x" }]) });
  expect(r4.findings[0]!.alsoBy).toEqual([]);
  expect((await shadowPass({ ...base, runId: "s5", candidates: [], ask: ask([]), over: true })).skipped).toBe("budget");
  const failing: CrossAsk = async () => {
    throw new Error("quota");
  };
  expect(await shadowPass({ ...base, runId: "s6", candidates: [], ask: failing })).toMatchObject({ skipped: "failed", error: "quota" });
});

let r: Rig | undefined;
afterEach(() => {
  r?.stop();
  r = undefined;
});

test("the engine logs a pass on the partner stream, says nothing, and keeps to the day's runs", async () => {
  r = rig({ mode: "useful" });
  r.p.ledger.add([
    { ref: ref("m1"), label: "MU 523", at: "2026-11-20T10:00:00+08:00", type: "booking", what: "flight", name: "MU 523", place: "Osaka", start: "2026-12-03T10:50:00+08:00", end: "2026-12-03T14:20:00+09:00" },
    { ref: ref("m2"), label: "Shibuya Stream", at: "2026-11-20T10:00:00+08:00", type: "booking", what: "hotel", name: "Shibuya Stream", place: "Tokyo", start: "2026-12-03", end: "2026-12-07" },
  ]);
  let calls = 0;
  r.p.setModels({
    cross: async (facts) => {
      calls++;
      return { findings: [{ facts: facts.map((f) => f.id), text: "Lands in Osaka, sleeps in Tokyo.", confidence: 0.9 }], tokens: 1200 };
    },
  });
  const channelBefore = r.log.read({ stream: "channel" }).length;
  const run = await r.p.cross("asked");
  expect(run.findings).toHaveLength(1);
  for (let i = 1; i < CROSS_RUNS_A_DAY; i++) await r.p.cross("asked");
  expect((await r.p.cross("asked")).skipped).toBe("budget");
  expect(calls).toBe(CROSS_RUNS_A_DAY);
  const logged = r.log.read({ stream: "partner", kinds: ["shadow_finds"] }) as LogEvent<"shadow_finds">[];
  expect(logged).toHaveLength(CROSS_RUNS_A_DAY + 1);
  expect(r.log.read({ stream: "channel" }).length).toBe(channelBefore);
  expect(r.opened).toEqual([]);
  const w = shadowWeek(logged)!;
  expect(w).toMatchObject({ runs: CROSS_RUNS_A_DAY, findings: 1, shadowOnly: 1 });
  expect(w.list[0]!.text).toBe("Lands in Osaka, sleeps in Tokyo.");
  expect((logged[0]!.body as Bodies["shadow_finds"]).by).toBe("asked");
});
