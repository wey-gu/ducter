// D478: a task opened with replaces=<id> retires that one by its id (never by a similar title):
// one that didn't work out is set aside, a finished one leaves On hand (D454, with its undo), one
// still at work is left as it is.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { createOnHandAway } from "../src/onhand-away.ts";
import { createRegistry } from "../src/registry.ts";
import { replaceTask } from "../src/replaces.ts";
import { openTask, tempDir } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

function setup() {
  const t = tempDir();
  cleanup = t.cleanup;
  const clock = new FakeClock(Date.parse("2026-11-22T12:00:00Z"));
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const away = createOnHandAway({ dataDir: t.dir, now: () => clock.now() });
  return { log, tasks, away };
}

test("a failed task opened again is set aside and leaves On hand; Remove's undo brings it back", () => {
  const s = setup();
  openTask(s.log, "old1", "在 hel 用 agy 审阅 Mem 长文案");
  s.tasks.setState("old1", "failed", "archived", "couldn't start");
  openTask(s.log, "new1", "Book a hotel in Kyoto"); // no title likeness needed: the id decides
  expect(replaceTask({ tasks: s.tasks, away: s.away }, "new1", "old1")).toEqual({ retired: true });
  expect(s.tasks.get("old1")?.attention).toBe("superseded");
  expect(s.away.isTask("old1")).toBe(true);
  s.away.put({ taskIds: ["old1"], back: true });
  expect(s.away.isTask("old1")).toBe(false);
});

test("a done task opened again leaves On hand, still done; one at work is left; unknown ids do nothing", () => {
  const s = setup();
  openTask(s.log, "done1");
  s.tasks.setState("done1", "done", "archived");
  openTask(s.log, "busy1");
  s.tasks.setState("busy1", "working", "live");
  openTask(s.log, "new1");
  expect(replaceTask({ tasks: s.tasks, away: s.away }, "new1", "done1")).toEqual({ retired: true });
  expect(s.tasks.get("done1")?.attention).toBe("done");
  expect(s.away.isTask("done1")).toBe(true);
  expect(replaceTask({ tasks: s.tasks, away: s.away }, "new1", "busy1")).toEqual({ retired: false, why: "at_work" });
  expect(s.tasks.get("busy1")?.attention).toBe("working");
  expect(replaceTask({ tasks: s.tasks, away: s.away }, "new1", "nope")).toEqual({ retired: false, why: "unknown" });
  expect(replaceTask({ tasks: s.tasks, away: s.away }, "new1", "new1")).toEqual({ retired: false, why: "same" });
});
