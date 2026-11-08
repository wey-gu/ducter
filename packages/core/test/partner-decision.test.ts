// Partner-level decisions (the partner's `ask`, no taskId): resolving one only wakes the partner.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

test("a taskless decision: user Go wakes the partner, nothing is forwarded, cards untouched; reversible default applies", async () => {
  const t = tempDir();
  const clock = new FakeClock();
  const core: Core = startCore({ dataDir: t.dir, port: 0, clock, defaultDelayMs: 60_000 });
  stops.push(t.cleanup, () => core.stop());
  const woke: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void woke.push(e) });
  const forwarded: string[] = [];
  core.decisions.setHook((_id, text) => void forwarded.push(text));

  core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d1", question: "Change the signature?", goLabel: "Change it", defaultOption: "hold", reversible: false } });
  core.decisions.decide("d1", "go");
  await Bun.sleep(5);
  expect(woke.map((e) => e.kind)).toEqual(["decision_resolved"]);
  expect(forwarded).toEqual([]);
  expect(core.tasks.list()).toEqual([]);

  core.log.append({
    stream: "channel", origin: "partner", kind: "decision",
    body: { decisionId: "d2", question: "Open a draft PR?", goLabel: "Open it", defaultOption: "go", reversible: true, defaultAt: new Date(clock.now() + 60_000).toISOString() },
  });
  clock.advance(60_000);
  const r = core.log.read({ kinds: ["decision_resolved"] }).at(-1)!.body as Bodies["decision_resolved"];
  expect(r).toEqual({ decisionId: "d2", option: "go", by: "default" });
  await Bun.sleep(5);
  expect(woke.map((e) => e.kind)).toEqual(["decision_resolved", "decision_resolved"]);
});
