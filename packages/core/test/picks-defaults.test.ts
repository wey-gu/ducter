// D617: a default-hold decision settles itself at its defaultAt, even when the card is not
// reversible (the morning's picks are one; before, they stayed open for days). A newer picks offer
// replaces the older, and a restart settles what the clock passed while the home was down, once.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createDecisions } from "../src/decisions.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const START = Date.parse("2026-11-26T12:00:00Z");

function boot(seed?: (append: (d: Bodies["decision"]) => void) => void) {
  const t = tempDir();
  const clock = new FakeClock(START);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const append = (d: Bodies["decision"]) => void log.append({ stream: "channel", origin: "partner", kind: "decision", body: d });
  seed?.(append);
  const tasks = createRegistry(log, clock);
  const decisions = createDecisions({ log, tasks, clock });
  // The home's On hand snapshot: openAsks is the decisions' one open set (core.ts does this).
  tasks.setDecorator((o) => ({ ...o, openAsks: { ids: decisions.openIds(), asOf: log.head() } }));
  stops.push(t.cleanup, () => decisions.stop());
  return { log, clock, tasks, decisions };
}

const picks = (id: string, at: string, defaultAt: string, text = "今天能替你清掉这 3 个。"): Bodies["decision"] => ({
  decisionId: id,
  question: text,
  goLabel: "交给Ducter",
  holdLabel: "今天先不",
  defaultOption: "hold",
  defaultAt,
  reversible: false,
  findId: `find_${id}`,
  offer: true,
  src: { kind: "picks", item: { source: "gh", kind: "github", ref: "acme/web#1", label: "#1", title: "Fix it" }, items: [] },
});

const resolutions = (log: ReturnType<typeof openLog>, id: string) =>
  log.read({ stream: "channel", kinds: ["decision_resolved"], limit: 100 }).map((e) => e.body as Bodies["decision_resolved"]).filter((r) => r.decisionId === id);

test("a picks offer past its defaultAt settles to hold at start, once, and leaves no count", async () => {
  const due = "2026-11-26T10:00:00Z"; // two hours before START
  const b = boot((append) => {
    append(picks("d_old", "2026-11-25T23:00:00Z", due));
  });
  // The constructor settled it at once (before the next turn), marked as the default.
  expect(b.decisions.isPending("d_old")).toBe(false);
  expect(b.decisions.resolution("d_old")).toMatchObject({ option: "hold", by: "default" });
  expect(b.decisions.openIds()).toEqual([]);
  expect(b.tasks.onHand().openAsks?.ids).toEqual([]);
  expect(b.tasks.onHand().counts.needs_you).toBe(0);
  expect(resolutions(b.log, "d_old")).toEqual([{ decisionId: "d_old", option: "hold", by: "default" }]);
  // Its note fades with it: the Go can never be pressed after the home settled it.
  const faded = b.log.read({ stream: "channel", kinds: ["find_state"], limit: 20 }).map((e) => e.body as { findId: string; state: string }).filter((s) => s.findId === "find_d_old");
  expect(faded).toEqual([{ findId: "find_d_old", kind: "todos", state: "passed" }]);

  // A second start over the same Log settles nothing again.
  const clock2 = new FakeClock(START + 60_000);
  const tasks2 = createRegistry(b.log, clock2);
  const again = createDecisions({ log: b.log, tasks: tasks2, clock: clock2 });
  stops.push(() => again.stop());
  expect(resolutions(b.log, "d_old")).toHaveLength(1);
  expect(again.openIds()).toEqual([]);
});

test("a newer picks offer replaces yesterday's, and the next morning's default settles the newest", () => {
  const b = boot();
  b.log.append({ stream: "channel", origin: "partner", kind: "decision", body: picks("d_day1", "2026-11-26T12:00:00Z", "2026-11-26T22:00:00Z", "昨天替你清掉了 1 个。今天能替你清掉这 3 个。") });
  expect(b.decisions.isPending("d_day1")).toBe(true);
  // The next morning's offer is a replacement, not a second card nobody can answer.
  b.log.append({ stream: "channel", origin: "partner", kind: "decision", body: picks("d_day2", "2026-11-26T12:01:00Z", "2026-11-26T22:00:00Z") });
  expect(b.decisions.isPending("d_day1")).toBe(false);
  expect(b.decisions.resolution("d_day1")).toMatchObject({ option: "hold", by: "default" });
  expect(b.decisions.isPending("d_day2")).toBe(true);
  // 22:00, its defaultAt: it settles itself to hold.
  b.clock.advance(10 * 3_600_000);
  expect(b.decisions.isPending("d_day2")).toBe(false);
  expect(b.decisions.resolution("d_day2")).toMatchObject({ option: "hold", by: "default" });
  expect(b.decisions.openIds()).toEqual([]);
  expect(b.tasks.onHand().counts.needs_you).toBe(0);
});

test("a restart with three stale picks (the author's home) settles the older two and the newest once, leaving the count at 0", () => {
  const b = boot((append) => {
    append(picks("d_32bb9791866e", "2026-11-22T23:00:00Z", "2026-11-23T09:00:00Z"));
    append(picks("d_126d1b5a74c7", "2026-11-24T23:00:00Z", "2026-11-25T09:00:00Z", "昨天替你清掉了 1 个。今天能替你清掉这 3 个。"));
    append(picks("d_37f9149e0d67", "2026-11-25T23:00:00Z", "2026-11-26T09:00:00Z"));
  });
  for (const id of ["d_32bb9791866e", "d_126d1b5a74c7", "d_37f9149e0d67"]) {
    expect(b.decisions.isPending(id)).toBe(false);
    expect(b.decisions.resolution(id)).toMatchObject({ option: "hold", by: "default" });
    expect(resolutions(b.log, id)).toHaveLength(1);
  }
  expect(b.decisions.openIds()).toEqual([]);
  expect(b.tasks.onHand().counts.needs_you).toBe(0);
  expect(b.tasks.onHand().openAsks?.ids).toEqual([]);
});

test("a Hold default before its time waits; a normal reversible question still settles as before", () => {
  const b = boot();
  b.log.append({ stream: "channel", origin: "partner", kind: "decision", body: picks("d_future", "2026-11-26T12:00:00Z", "2026-11-26T22:00:00Z") });
  expect(b.decisions.isPending("d_future")).toBe(true);
  // A plain reversible Hold question still settles itself at its defaultAt, exactly as before.
  b.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_plain", question: "要现在跑吗？", goLabel: "现在跑", defaultOption: "hold", reversible: true, defaultAt: new Date(START + 30 * 60_000).toISOString() } });
  expect(b.decisions.openIds()).toContain("d_plain");
  b.clock.advance(31 * 60_000);
  expect(b.decisions.isPending("d_plain")).toBe(false);
  expect(b.decisions.resolution("d_plain")).toMatchObject({ option: "hold", by: "default" });
  // The offer still waits at the home (a client may draw its note's Go), but it is not a needs-you
  // item: the count and the lists read askOpen, which excludes every offer.
  expect(b.decisions.isPending("d_future")).toBe(true);
  expect(b.decisions.openIds()).toEqual(["d_future"]);
  expect(b.tasks.onHand().counts.needs_you).toBe(0);
});
