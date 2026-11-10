// Scores the cascade (rules → triage → ledger → detectors → the bar) on the synthetic inboxes:
// misses and false alarms per kind, what "now" would say, and how often the cap of 3 bites, so the
// cap and the per-kind bars can be tuned later. Triage and the bar are seams: recorded answers by
// default (no model), a live cheap model and the partner's own model when wired.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAILY_CAP, FIND_KINDS, type FindKind } from "../../../protocol/src/index.ts";
import { detect } from "../../../core/src/proactive/detect.ts";
import { barJudge, type FindJudge } from "../../../core/src/proactive/judge.ts";
import { openLedger } from "../../../core/src/proactive/ledger.ts";
import { stage1 } from "../../../core/src/proactive/stage1.ts";
import { eventFact, factsOf, recordedTriage, type Triage } from "../../../core/src/proactive/triage.ts";
import { fixtureItems } from "../../../core/test/proactive-fill.ts";
import { MORNING, ZONE } from "../../../core/test/fixtures/inbox.ts";
import type { BarScenario } from "./inboxes.ts";

export interface ScenarioResult {
  name: string;
  said: { kind: FindKind; text: string; urgent: boolean }[];
  misses: { kind: FindKind; contains: string }[];
  falseAlarms: { kind: FindKind; text: string }[];
  urgentMissed: FindKind[];
  /** Kept past the bar beyond the daily cap (they wait for the next morning). */
  overCap: number;
  tokens: number;
}

export async function runScenario(s: BarScenario, o: { triage?: Triage; judge?: FindJudge; zh?: boolean } = {}): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), "ducter-bar-"));
  try {
    const ledger = openLedger(dir);
    const triage = o.triage ?? recordedTriage(s.fx.triage);
    const s1 = stage1(fixtureItems(s.fx));
    ledger.add(s1.events.map(eventFact).filter((f): f is NonNullable<typeof f> => Boolean(f)));
    const items = [...s1.pass, ...s1.sent];
    let tokens = 0;
    for (let i = 0; i < items.length; i += 20) {
      const batch = items.slice(i, i + 20);
      const r = await triage(batch, { today: "2026-11-10", zone: ZONE });
      tokens += r.tokens;
      ledger.add(batch.flatMap((it) => factsOf(it, r.out.find((x) => x.id === it.id))));
    }
    const cands = detect(ledger, { now: MORNING, zone: ZONE });
    const zh = o.zh ?? true;
    const v = await (o.judge ?? barJudge)(cands, { zh, today: "2026-11-10", bars: {} });
    tokens += v.tokens;
    const keep = new Map(v.verdicts.filter((x) => x.keep).map((x) => [x.key, x.text]));
    const said = cands.filter((c) => keep.has(c.key)).sort((a, b) => b.cost - a.cost).map((c) => ({ kind: c.kind, text: keep.get(c.key)!, urgent: c.urgent }));
    const misses = s.say.filter((w) => !said.some((x) => x.kind === w.kind && x.text.includes(w.contains)));
    const falseAlarms = said.filter((x) => s.never.includes(x.kind) || !s.say.some((w) => w.kind === x.kind));
    const urgentMissed = (s.urgent ?? []).filter((k) => !said.some((x) => x.kind === k && x.urgent));
    return { name: s.name, said, misses, falseAlarms, urgentMissed, overCap: Math.max(0, said.length - DAILY_CAP), tokens };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function perKind(results: ScenarioResult[]) {
  const rows = FIND_KINDS.map((k) => ({ kind: k, said: 0, misses: 0, falseAlarms: 0 }));
  for (const r of results) {
    for (const x of r.said) rows.find((y) => y.kind === x.kind)!.said++;
    for (const x of r.misses) rows.find((y) => y.kind === x.kind)!.misses++;
    for (const x of r.falseAlarms) rows.find((y) => y.kind === x.kind)!.falseAlarms++;
  }
  return rows;
}
