// D382: Ask me later's events on a card, step by step, on the fixture the Mac app reads too: back at
// its time the card has no countdown until it is seen; Decide now brings it back with one.
import { expect, test } from "bun:test";
import fixture from "../../../packages/protocol/fixtures/later-events.json";
import { Store } from "../src/store.ts";

test("Ask me later's events, as the Mac app applies them", () => {
  const s = new Store();
  s.applyEvent({ seq: 1, ts: "2026-11-19T15:00:00.000Z", persona: "default", stream: "channel", origin: "system", kind: "decision", body: fixture.decision } as never);
  for (const [i, step] of fixture.steps.entries()) {
    s.applyEvent({ seq: i + 2, ts: step.ts, persona: "default", stream: "channel", origin: "system", kind: step.kind, body: step.body } as never);
    const d = s.decisions.get(fixture.decision.decisionId)!;
    expect({ later: d.later ?? null, backAt: d.backAt ?? null, defaultAt: d.defaultAt ?? null }).toEqual(step.want);
  }
});
