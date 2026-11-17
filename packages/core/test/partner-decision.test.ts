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

// D340 (research/124 F1): a card whose Go deletes something never goes by itself, whoever made it.
test("a delete card never defaults to deleting: the partner's or a task's", async () => {
  const t = tempDir();
  const clock = new FakeClock();
  const core: Core = startCore({ dataDir: t.dir, port: 0, clock, defaultDelayMs: 60_000 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });

  // A partner card that slipped through as reversible with a Go default: the timer never fires.
  core.log.append({
    stream: "channel", origin: "partner", kind: "decision",
    body: { decisionId: "d9", question: "要把它自己加的 README.md 和 NOTES.md 删掉吗？删了就找不回来了。", goLabel: "删掉", defaultOption: "go", reversible: true, defaultAt: new Date(clock.now() + 60_000).toISOString() },
  });
  clock.advance(120_000);
  expect(core.log.read({ kinds: ["decision_resolved"] })).toEqual([]);
  expect(core.decisions.isPending("d9")).toBe(true);

  // A task's question with a delete default: the card keeps the label, waits on Hold, and has no time.
  core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "needs_input", summary: "Clean up?", evidence: [], questions: [{ id: "q1", text: "Remove the old fixtures folder?", default: "Remove it", blocking: true, reversible: true }] } });
  await Bun.sleep(5);
  const d = core.log.read({ kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).find((b) => b.taskId === "t1")!;
  expect(d).toMatchObject({ goLabel: "Remove it", defaultOption: "hold" });
  expect(d.defaultAt).toBeUndefined();
  // A reversible choice about the work still defaults to Go.
  core.log.append({ stream: "task:t2", origin: "task", kind: "report", body: { taskId: "t2", state: "needs_input", summary: "Which?", evidence: [], questions: [{ id: "q1", text: "Return cents or strings?", default: "Cents", blocking: true, reversible: true }] } });
  await Bun.sleep(5);
  const d2 = core.log.read({ kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).find((b) => b.taskId === "t2")!;
  expect(d2).toMatchObject({ defaultOption: "go" });
  expect(d2.defaultAt).toBeDefined();
});
