// D674 (research/247 Brief B): the shadow gets a verdict. The review lists what the passes
// recorded; the verdicts land in the Log once; the gate is code and reads only the labels; nothing
// the model noticed is said before the gate, and the review itself creates no message or task.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, LogEvent, ShadowItem, ShadowRun } from "@ducter/protocol";
import { shadowPass, type CrossAsk } from "../src/proactive/cross.ts";
import { detect } from "../src/proactive/detect.ts";
import type { Fact, FactType, Ledger } from "../src/proactive/ledger.ts";
import { promotedCandidates, promoteShadow, shadowItemId, shadowItems, shadowReview, withLabels } from "../src/proactive/shadow-review.ts";
import { fixtures, NOW as FX_NOW, ZONE as FX_ZONE, type Fixture } from "../eval/findings/fixtures.ts";
import { shadowWeek, weekReport } from "../src/proactive/week.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const DAY = 86_400_000;
const ZONE = "Asia/Shanghai";
const ref = (id: string) => ({ connectionId: "c", service: "gmail", id });

let r: Rig | undefined;
afterEach(() => {
  r?.stop();
  r = undefined;
});

/** Six facts that pair up three ways, and a fake cheap model that finds six things across them. */
const six = (): Omit<Fact, "id" | "date">[] =>
  [
    { ref: ref("m1"), label: "MU 523", at: "2026-11-08T10:00:00+08:00", type: "booking", what: "flight", name: "MU 523", place: "Osaka", start: "2026-12-03T10:50:00+08:00", end: "2026-12-03T14:20:00+09:00" },
    { ref: ref("m2"), label: "Shibuya Stream", sender: "Hotels.com", at: "2026-11-08T10:00:00+08:00", type: "booking", what: "hotel", name: "Shibuya Stream", place: "Tokyo", start: "2026-12-03", end: "2026-12-07" },
    { ref: ref("m3"), label: "ducter.dev renews", sender: "Cloudflare", at: "2026-11-08T10:00:00+08:00", type: "renewal", name: "ducter.dev", due: "2026-12-01" },
    { ref: ref("m4"), label: "Card ending 4242 declined", sender: "Stripe", at: "2026-11-08T10:00:00+08:00", type: "payment", name: "Cloudflare", amount: "$10" },
    { ref: ref("m5"), label: "Board dinner", at: "2026-11-08T10:00:00+08:00", type: "meeting", title: "Board dinner", start: "2026-12-03T19:00:00+08:00", end: "2026-12-03T21:00:00+08:00" },
    { ref: ref("m6"), label: "Lina's offsite", sender: "Lina", at: "2026-11-08T10:00:00+08:00", type: "plan", name: "Offsite", day: "2026-12-03", src: "mail" },
  ] as never;

const SIX = ["MU 523", "Shibuya Stream", "ducter.dev renews", "Card ending 4242 declined", "Board dinner", "Lina's offsite"];
const sixModel: CrossAsk = async (facts) => {
  const id = (n: number) => facts.find((f) => f.label === SIX[n])!.id;
  const pairs: [number, number][] = [
    [0, 1],
    [2, 3],
    [0, 4],
    [0, 5],
    [1, 5],
    [4, 5],
  ];
  return { findings: pairs.map(([a, b], n) => ({ facts: [id(a), id(b)], text: `Finding ${n + 1}: these two don't fit.`, why: "a night lost", next: "check it", confidence: 0.8 })), tokens: 900 };
};

describe("the review card and its labels", () => {
  test("a week of six findings: the card lists six, two labels land in the Log, the same label twice is one", async () => {
    r = rig({ mode: "useful" });
    r.p.ledger.add(six() as never);
    r.p.setModels({ cross: sixModel });
    const run = await r.p.cross("asked");
    expect(run.findings).toHaveLength(6);
    // Each finding carries the facts it joined as the card shows them (source, header, sender).
    expect(run.findings[0]!.rows!.map((f) => f.src)).toEqual(["mail", "mail"]);
    const review = r.p.shadowReview();
    expect(review.items).toHaveLength(6);
    expect(review.items.every((i) => i.source === "shadow" && !i.verdict)).toBe(true);
    expect(review.gate).toMatchObject({ pass: false, why: "no_labels" });
    const [a, b] = review.items;
    const channelBefore = r.log.read({ stream: "channel" }).length;
    expect("review" in r.p.shadowLabel(a!.id, "yes")).toBe(true);
    r.p.shadowLabel(a!.id, "yes"); // the same verdict again: no second event
    const after = r.p.shadowLabel(b!.id, "no");
    const labels = r.log.read({ stream: "partner", kinds: ["shadow_labels"] }).map((e) => e.body as Bodies["shadow_labels"]);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatchObject({ findingId: a!.id, runId: run.runId, verdict: "yes" });
    expect(typeof labels[0]!.at).toBe("string");
    expect(labels[1]).toMatchObject({ findingId: b!.id, verdict: "no" });
    if (!("review" in after)) throw new Error("no review");
    expect(after.review.items.filter((i) => i.verdict)).toHaveLength(2);
    // Unlabelled first: the two labelled ones sink to the end.
    expect(after.review.items.slice(-2).map((i) => i.id).sort()).toEqual([a!.id, b!.id].sort());
    // A changed mind is a new event; an unknown id writes nothing.
    r.p.shadowLabel(a!.id, "no");
    expect(r.p.shadowLabel("nope", "yes")).toEqual({ error: "unknown_item" });
    expect(r.log.read({ stream: "partner", kinds: ["shadow_labels"] })).toHaveLength(3);
    // Nothing reached the conversation, no task, no push: the labels are the only new thing.
    expect(r.log.read({ stream: "channel" }).length).toBe(channelBefore);
    expect(r.opened).toEqual([]);
    expect(r.sent).toEqual([]);
  });

  test("这类以后都别标 stops the sort: its other items count as a no and leave the line's count", async () => {
    r = rig({ mode: "useful" });
    r.p.ledger.add(six() as never);
    r.p.setModels({ cross: sixModel });
    await r.p.cross("asked");
    const items = r.p.shadowReview().items;
    // Two findings rest on the same fact types (the model is shown the facts soonest first).
    const sorts = new Map<string, ShadowItem[]>();
    for (const i of items) sorts.set(i.sort, [...(sorts.get(i.sort) ?? []), i]);
    const [sort, pair] = [...sorts.entries()].find(([, xs]) => xs.length >= 2)!;
    expect(pair.length).toBeGreaterThanOrEqual(2);
    const res = r.p.shadowLabel(pair[0]!.id, "stop");
    if (!("review" in res)) throw new Error("no review");
    const got = res.review.items.filter((i) => i.sort === sort);
    expect(got.every((i) => i.stopped)).toBe(true);
    expect(got.find((i) => i.id === pair[0]!.id)!.verdict).toBe("no");
    expect(got.find((i) => i.id === pair[1]!.id)!.verdict).toBeUndefined();
    // The others of that sort no longer wait for a word.
    expect(res.review.items.filter((i) => !i.verdict && !i.stopped)).toHaveLength(items.length - got.length);
    const label = r.log.read({ stream: "partner", kinds: ["shadow_labels"] }).at(-1)!.body as Bodies["shadow_labels"];
    expect(label).toMatchObject({ verdict: "no", stop: sort });
  });

  test("the morning note offers the review once a week, never pushed, and it fades at the next morning", async () => {
    r = rig({ mode: "three" });
    r.p.ledger.add(six() as never);
    r.p.setModels({ cross: sixModel });
    await r.p.cross("asked");
    await r.p.morning();
    const offer = r.lastNote()?.shadowReview;
    expect(offer?.count).toBe(6);
    expect(Date.parse(offer!.until)).toBeGreaterThan(r.clock.now());
    expect(Date.parse(offer!.until) - r.clock.now()).toBeLessThanOrEqual(DAY + 3_600_000);
    // The notification never carries it, and the decisions hold nothing that needs the person.
    for (const s of r.sent) expect(JSON.stringify(s)).not.toContain("Finding");
    expect(r.decisions.pending?.() ?? []).toEqual([]);
    await r.advance(DAY);
    await r.p.morning();
    expect(r.notes().filter((e) => (e.body as Bodies["finds"]).shadowReview).length).toBe(1);
  }, 60_000);

  test("nothing noticed, or all of it labelled: no offer", async () => {
    r = rig({ mode: "three" });
    await r.p.morning();
    expect(r.notes().some((e) => (e.body as Bodies["finds"]).shadowReview)).toBe(false);
    r.stop();
    r = rig({ mode: "three" });
    r.p.ledger.add(six() as never);
    r.p.setModels({ cross: sixModel });
    await r.p.cross("asked");
    for (const i of r.p.shadowReview().items) r.p.shadowLabel(i.id, "no");
    await r.p.morning();
    expect(r.notes().some((e) => (e.body as Bodies["finds"]).shadowReview)).toBe(false);
  });
});

// ---------- the gate ----------

const mem = (facts: Fact[]): Ledger => ({
  add: () => [],
  all: (type?: FactType) => (type ? facts.filter((f) => f.type === type) : [...facts]),
  of: <T extends FactType>(type: T) => facts.filter((f) => f.type === type) as Extract<Fact, { type: T }>[],
  sweep: () => 0,
  drop: () => 0,
  size: () => facts.length,
});

let seq = 0;
const ev = (body: ShadowRun, ts: string): LogEvent => ({ seq: ++seq, ts, stream: "partner", origin: "system", kind: "shadow_finds", body }) as unknown as LogEvent;
const label = (findingId: string, verdict: "yes" | "no", ts: string): LogEvent => ({ seq: ++seq, ts, stream: "partner", origin: "user", kind: "shadow_labels", body: { runId: "r", findingId, verdict, at: ts } }) as unknown as LogEvent;

/**
 * One pass per ledger on a given day, with a model that cites `pick` of its planted conflicts and
 * `extra` false findings (two everyday facts); the detectors' candidates from detect().
 */
async function passes(fxs: Fixture[], day: string, o: { pick?: (fx: Fixture) => Fixture["expect"]; extra?: (fx: Fixture) => number } = {}): Promise<LogEvent[]> {
  const out: LogEvent[] = [];
  const seen: Record<string, number> = {};
  for (const fx of fxs) {
    const planted = (o.pick ?? ((f) => f.expect))(fx);
    const everyday = fx.facts.filter((f) => f.type === "payment" || f.type === "billing").map((f) => f.id);
    const extras = Array.from({ length: o.extra?.(fx) ?? 0 }, (_, n) => ({ facts: [everyday[n % everyday.length]!, everyday[(n + 1) % everyday.length]!], text: `False alarm ${n} in ${fx.id}.`, confidence: 0.6 }));
    const ask: CrossAsk = async () => ({ findings: [...planted.map((e) => ({ facts: [...e.all, ...(e.any ? [e.any[0]!] : [])], text: e.what, confidence: 0.9 })), ...extras], tokens: 100 });
    const run = await shadowPass({ runId: `run-${fx.id}-${day}`, by: "daily", now: FX_NOW, ctx: { lang: "en", today: day, zone: FX_ZONE }, facts: fx.facts, candidates: detect(mem(fx.facts), { now: FX_NOW, zone: FX_ZONE }), saidFacts: new Set(), seen, ask });
    out.push(ev(run, `${day}T10:00:00+08:00`));
  }
  return out;
}

/** Hand-written labels: an item matters when it cites a planted conflict of its ledger. */
function handLabels(items: ShadowItem[], fxs: Fixture[], ts: string): LogEvent[] {
  return items.map((i) => {
    const ids = i.facts.map((f) => f.id);
    const fx = fxs.find((f) => f.facts.some((x) => ids.includes(x.id)));
    const matters = !!fx?.expect.some((e) => e.all.every((id) => ids.includes(id)));
    return label(i.id, matters ? "yes" : "no", ts);
  });
}

// The labelled week: Monday 11-16 to Sunday 11-22; the gate is read on Tuesday 11-24.
const WEEK_DAY = "2026-11-18";
const LABELLED_AT = "2026-11-23T09:00:00+08:00";
const GATE = { now: FX_NOW, zone: FX_ZONE };

describe("promoteShadow: the gate is code, on the labels alone", () => {
  test("the 21 written ledgers, hand-labelled: shadow with the detectors finds more of what mattered at no lower precision", async () => {
    const fxs = fixtures();
    const runs = await passes(fxs, WEEK_DAY);
    const items = shadowItems(runs);
    const labels = handLabels(items, fxs, LABELLED_AT);
    const g = promoteShadow(withLabels(items, labels), GATE);
    expect(g.why).toBe("pass");
    expect(g.weeks).toBe(1);
    expect(g.mattered).toBe(13); // every planted conflict
    expect(g.together.found).toBeGreaterThan(g.detectors.found);
    expect(g.detectors.found).toBeLessThan(13);
    expect(g.shadow.precision).toBe(1);
    expect(g.shadow.precision!).toBeGreaterThanOrEqual(g.detectors.precision ?? 1);
    // Reproducible from the Log: the same events give the same answer.
    expect(promoteShadow(withLabels(shadowItems([...runs].reverse()), [...labels]), GATE)).toEqual(g);
  });

  test("a second, unlike set (money, not trips) with an eager model: its precision is lower, the gate stays shut", async () => {
    const fxs = fixtures().filter((f) => !f.facts.some((x) => x.type === "booking" && x.what === "flight"));
    expect(fxs.length).toBeGreaterThan(3);
    const runs = await passes(fxs, WEEK_DAY, { extra: () => 2 });
    const items = shadowItems(runs);
    const g = promoteShadow(withLabels(items, handLabels(items, fxs, LABELLED_AT)), GATE);
    expect(g.shadow.found).toBeGreaterThan(0);
    expect(g.why).toBe("lower_precision");
    expect(g.pass).toBe(false);
  });

  // Small hand-made sets for the three answers the brief pins.
  const item = (n: number, source: ShadowItem["source"], alsoBy: ShadowItem["alsoBy"] = []): ShadowItem => ({ id: `i${n}`, runId: "r", source, text: `item ${n}`, alsoBy: source === "detector" ? ["mismatch"] : alsoBy, said: false, at: `${WEEK_DAY}T10:00:00+08:00`, facts: [{ id: `f${n}`, type: "booking", src: "mail", label: "x", at: `${WEEK_DAY}T09:00:00+08:00` }], sort: "facts:booking" });
  const withV = (xs: ShadowItem[], v: ("yes" | "no")[]) => xs.map((x, k) => ({ ...x, verdict: v[k]! }));

  test("shadow finds two more of what mattered at equal precision: promoted", () => {
    // Detectors: 2 flagged, 1 right (50%). Shadow: 4 flagged (one shared with a detector), 2 right (50%).
    // The detector's own join mattered; the one both had didn't; shadow's own: two mattered, one didn't.
    const xs = withV([item(1, "detector"), item(2, "shadow", ["mismatch"]), item(3, "shadow"), item(4, "shadow"), item(5, "shadow")], ["yes", "no", "yes", "yes", "no"]);
    const g = promoteShadow(xs, GATE);
    expect(g.detectors).toEqual({ flagged: 2, found: 1, precision: 0.5 });
    expect(g.shadow).toEqual({ flagged: 4, found: 2, precision: 0.5 });
    expect(g.together.found - g.detectors.found).toBe(2);
    expect(g).toMatchObject({ pass: true, why: "pass" });
    // Past the gate: the fresh shadow-only finds become offers (never urgent), the shared one doesn't.
    const fresh = xs.map((x) => ({ ...x, at: new Date(FX_NOW - DAY).toISOString(), verdict: undefined }));
    const cands = promotedCandidates(fresh, g, FX_NOW);
    expect(cands.map((c) => c.key).sort()).toEqual(["shadow:i3", "shadow:i4", "shadow:i5"]);
    expect(cands.every((c) => !c.urgent && c.kind === "mismatch" && !!c.step)).toBe(true);
  });

  test("lower precision: refused; no labels: refused; this week's labels don't count yet", () => {
    const lower = withV([item(1, "detector"), item(2, "shadow"), item(3, "shadow"), item(4, "shadow")], ["yes", "yes", "no", "no"]);
    expect(promoteShadow(lower, GATE)).toMatchObject({ pass: false, why: "lower_precision" });
    expect(promotedCandidates(lower, promoteShadow(lower, GATE), FX_NOW)).toEqual([]);
    const none = [item(1, "detector"), item(2, "shadow")];
    expect(promoteShadow(none, GATE)).toMatchObject({ pass: false, why: "no_labels", weeks: 0 });
    const thisWeek = withV([item(1, "detector"), item(2, "shadow")], ["no", "yes"]).map((x) => ({ ...x, at: new Date(FX_NOW - 3_600_000).toISOString() }));
    expect(promoteShadow(thisWeek, GATE)).toMatchObject({ pass: false, why: "no_full_week" });
    // One item left unlabelled leaves its week out.
    const partial = withV([item(1, "detector"), item(2, "shadow"), item(3, "shadow")], ["no", "yes", undefined as never]);
    expect(promoteShadow(partial, GATE)).toMatchObject({ pass: false, why: "no_full_week" });
  });

  test("a detector's shape is covered only on two labelled weeks", () => {
    const wk = (day: string) => withV([item(1, "shadow", ["mismatch"]), item(2, "shadow")], ["yes", "yes"]).map((x) => ({ ...x, id: `${x.id}-${day}`, at: `${day}T10:00:00+08:00` }));
    expect(promoteShadow(wk("2026-11-18"), GATE).retire).toEqual([]);
    expect(promoteShadow([...wk("2026-11-11"), ...wk("2026-11-18")], GATE).retire).toEqual(["mismatch"]);
  });
});

const byLabel = (facts: Fact[], label: string) => facts.find((f) => f.label === label)!.id;

describe("nothing is said before the gate", () => {
  /** A labelled week's pass, written as the engine writes one: five findings and one detector join. */
  const week = (): ShadowRun => {
    const row = (id: string) => ({ id, type: "booking", src: "mail" as const, label: id, at: "2026-11-09T10:00:00+08:00" });
    const f = (n: number, alsoBy: ShadowRun["findings"][number]["alsoBy"] = []) => ({ key: `w${n}a+w${n}b`, facts: [`w${n}a`, `w${n}b`], text: `Last week ${n}.`, why: "", next: "", confidence: 0.8, alsoBy, said: false, rows: [row(`w${n}a`), row(`w${n}b`)] });
    return { runId: "shadow_w", by: "daily", facts: 12, findings: [f(1, ["mismatch"]), f(2), f(3), f(4), f(5)], repeats: 0, dropped: [], detectorsOnly: [{ key: "mismatch:d1:d2", kind: "mismatch", facts: ["d1", "d2"], text: "A detector's join.", said: false, rows: [row("d1"), row("d2")] }], tokens: 100 };
  };

  test("a shadow-only finding stays out of the morning note until a labelled week opens the gate; then it is an offer", async () => {
    r = rig({ mode: "useful" });
    r.p.ledger.add(six() as never);
    r.log.append({ stream: "partner", origin: "system", kind: "shadow_finds", body: week() });
    await r.p.morning();
    const said = () => r!.notes().flatMap((e) => (e.body as Bodies["finds"]).finds.map((f) => f.text));
    expect(said().some((t) => t.startsWith("Last week") || t.startsWith("Finding"))).toBe(false);
    expect(r.lastNote()?.shadowReview?.count).toBe(6);
    // The week's verdicts: the detectors 1 of 2 (50%); shadow 3 of 5, three that the detectors missed.
    const items = r.p.shadowReview().items;
    const v: Record<string, "yes" | "no"> = { "A detector's join.": "yes", "Last week 1.": "no", "Last week 2.": "yes", "Last week 3.": "yes", "Last week 4.": "yes", "Last week 5.": "no" };
    for (const i of items) r.p.shadowLabel(i.id, v[i.text]!);
    expect(r.p.shadowReview().gate.why).toBe("no_full_week"); // the week isn't over yet
    // A fresh finding this week: still nothing said.
    r.p.setModels({ cross: async (facts) => ({ findings: [{ facts: [byLabel(facts, "ducter.dev renews"), byLabel(facts, "Card ending 4242 declined")], text: "Finding new: the renewal's card was declined.", confidence: 0.9 }], tokens: 100 }) });
    await r.p.cross("asked");
    expect(said().some((t) => t.startsWith("Finding"))).toBe(false);
    // It is in the same week: labelled too (shadow then 3 of 6, 50%, equal to the detectors').
    const fresh = r.p.shadowReview().items.find((i) => i.text.startsWith("Finding new"))!;
    r.p.shadowLabel(fresh.id, "no");
    // The week is over: the gate opens, and the next morning offers the fresh shadow-only finding.
    await r.advance(6 * DAY, 3_600_000);
    // The home's own inbox gave the passes a detector join of its own that week: not wanted (a no).
    const left = r.p.shadowReview(true).items.filter((i) => !i.verdict);
    expect(left.every((i) => i.source === "detector")).toBe(true);
    for (const i of left) r.p.shadowLabel(i.id, "no");
    const g = r.p.shadowReview().gate;
    expect(g).toMatchObject({ pass: true, weeks: 1, detectors: { found: 1, flagged: 2 + left.length }, shadow: { found: 3, flagged: 6 } });
    r.p.setModels({ cross: async (facts) => ({ findings: [{ facts: [byLabel(facts, "MU 523"), byLabel(facts, "Board dinner")], text: "Finding fresh: the dinner is while you fly.", confidence: 0.9 }], tokens: 100 }) });
    await r.p.cross("asked");
    await r.p.morning();
    const note = r.lastNote()!;
    const f = note.finds.find((x) => x.text.startsWith("Finding fresh"));
    expect(f).toBeDefined();
    expect(f!.offer).toBe(true);
    expect(note.rung).toBe("morning");
    expect(r.opened).toEqual([]);
  }, 60_000);
});

test("the item id is the same in every pass, and differs by source", () => {
  expect(shadowItemId("shadow", "a+b")).toBe(shadowItemId("shadow", "a+b"));
  expect(shadowItemId("shadow", "a+b")).not.toBe(shadowItemId("detector", "a+b"));
  expect(shadowReview([], { now: FX_NOW, zone: ZONE })).toMatchObject({ from: "2026-11-16", to: "2026-11-24", items: [] });
  expect(shadowReview([], { now: FX_NOW, zone: ZONE, week: true })).toMatchObject({ from: "2026-11-16", to: "2026-11-22" });
});

test("`ducter proactive week` reads the labels: counts per week, each quoted find's verdict, and the gate", async () => {
  r = rig({ mode: "useful" });
  r.p.ledger.add(six() as never);
  r.p.setModels({ cross: sixModel });
  await r.p.cross("asked");
  const items = r.p.shadowReview().items;
  r.p.shadowLabel(items[0]!.id, "yes");
  r.p.shadowLabel(items[1]!.id, "no");
  const runs = r.log.read({ stream: "partner", kinds: ["shadow_finds"] });
  const labels = r.log.read({ stream: "partner", kinds: ["shadow_labels"] });
  const w = shadowWeek(runs, labels)!;
  expect(w.labels).toEqual({ items: items.length, labelled: 2, yes: 1, no: 1, stopped: 0 });
  expect(w.list.filter((x) => x.verdict).map((x) => x.verdict).sort()).toEqual(["no", "yes"]);
  const rep = weekReport([], { now: r.clock.now(), zone: ZONE, weeks: 1, mode: "useful", shadow: runs, labels, gate: r.p.shadowReview().gate });
  expect(rep.weeks[0]!.shadow!.labels!.labelled).toBe(2);
  expect(rep.gate).toMatchObject({ pass: false, why: "no_full_week" });
});
