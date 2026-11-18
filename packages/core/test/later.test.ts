// D382: 晚点再问我 / Ask me later: a waiting question put off to a time, its countdown stopped,
// back at its time with the same countdown length, said once; and the offered times.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { laterable, laterChoices, laterRefusal, pickedTime } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createDecisions } from "../src/decisions.ts";
import { createLiving } from "../src/living.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { openTask, report, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

const MIN = 60_000;
const HOUR = 60 * MIN;

function setup(dir?: string) {
  const t = dir ? { dir, cleanup: () => {} } : tempDir();
  if (!dir) cleanup = t.cleanup;
  const clock = new FakeClock();
  const path = join(t.dir, "ducter.db");
  const log = openLog({ path, persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const forwarded: [string, string][] = [];
  const decisions = createDecisions({ log, tasks, clock, onDecision: (id, text) => void forwarded.push([id, text]) });
  const living = createLiving({ log, tasks, decisions, clock });
  return { dir: t.dir, path, clock, log, tasks, decisions, living, forwarded };
}
const kinds = (log: ReturnType<typeof openLog>, k: string) => log.read({}).filter((e) => e.kind === k);

async function ask(s: ReturnType<typeof setup>, taskId = "t1") {
  openTask(s.log, taskId);
  s.tasks.setState(taskId, "working", "hot");
  report(s.log, taskId, { state: "needs_input", summary: "Send the weekly report?", questions: [{ id: "q", text: "Send the weekly report to Example Lead?", blocking: true, default: "Send", reversible: true }] });
  await tick();
  return kinds(s.log, "decision").at(-1)!.body as Bodies["decision"];
}

const read = (s: { log: ReturnType<typeof openLog> }) => {
  const upToSeq = s.log.read({}).at(-1)!.seq;
  s.log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq } });
};

test("put off: out of Needs you, no default while away; back at its time, no default until it is seen", async () => {
  const s = setup();
  const d = await ask(s);
  expect(s.tasks.onHand().counts.needs_you).toBe(1);
  s.decisions.later(d.decisionId, s.clock.now() + 10 * HOUR);
  await tick();
  expect(s.tasks.get("t1")).toMatchObject({ attention: "blocked" });
  expect(s.tasks.get("t1")!.pendingDecision!.later).toBe(new Date(s.clock.now() + 10 * HOUR).toISOString());
  expect(s.tasks.onHand().counts).toMatchObject({ needs_you: 0, waiting: 1 });
  expect(s.decisions.isPending(d.decisionId)).toBe(true);
  // Its 30-minute default would have fired long ago: it doesn't.
  s.clock.advance(9 * HOUR);
  expect(kinds(s.log, "decision_resolved")).toHaveLength(0);
  // The living message no longer carries it.
  s.living.render();
  expect((kinds(s.log, "living_msg").at(-1)!.body as Bodies["living_msg"]).items.filter((i) => i.decisionId)).toHaveLength(0);
  s.clock.advance(HOUR);
  await tick();
  const [b] = kinds(s.log, "decision_back");
  expect(b!.body).toEqual({ decisionId: d.decisionId, by: "time" }); // no countdown yet
  expect(s.tasks.get("t1")).toMatchObject({ attention: "needs_you" });
  expect(s.tasks.onHand().counts.needs_you).toBe(1);
  expect(s.tasks.get("t1")!.pendingDecision!.defaultAt).toBeUndefined();
  expect(s.tasks.get("t1")!.pendingDecision!.later).toBeUndefined();
  expect(s.tasks.get("t1")!.pendingDecision!.backAt).toBeTruthy();
  // Said once: the living message has it again, marked back.
  s.living.render();
  const items = (kinds(s.log, "living_msg").at(-1)!.body as Bodies["living_msg"]).items;
  expect(items).toEqual([expect.objectContaining({ decisionId: d.decisionId, kind: "decision", back: expect.any(String) })]);
  // Nobody looks for six hours: nothing runs; it stays in Needs you.
  s.clock.advance(6 * HOUR);
  await tick();
  expect(kinds(s.log, "decision_resolved")).toHaveLength(0);
  expect(kinds(s.log, "decision_seen")).toHaveLength(0);
  // A read that stops short of its return isn't seeing it.
  s.log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: b!.seq - 1 } });
  await tick();
  expect(kinds(s.log, "decision_seen")).toHaveLength(0);
  // Seen on some client: its countdown runs its first length from now, once.
  read(s);
  read(s);
  await tick();
  const seen = kinds(s.log, "decision_seen");
  expect(seen).toHaveLength(1);
  const restarted = (seen[0]!.body as Bodies["decision_seen"]).defaultAt;
  expect(Date.parse(restarted) - s.clock.now()).toBe(30 * MIN);
  expect(s.tasks.get("t1")!.pendingDecision).toMatchObject({ defaultAt: restarted });
  s.clock.advance(29 * MIN);
  expect(kinds(s.log, "decision_resolved")).toHaveLength(0);
  s.clock.advance(MIN);
  expect(kinds(s.log, "decision_resolved").at(-1)!.body).toMatchObject({ decisionId: d.decisionId, option: "go", by: "default" });
  await tick();
  expect(s.forwarded).toEqual([["t1", "User says Go: Send."]]);
});

test("answered while away: the answer stands and it never comes back", async () => {
  const s = setup();
  const d = await ask(s);
  s.decisions.later(d.decisionId, s.clock.now() + 2 * HOUR);
  await tick();
  s.decisions.decide(d.decisionId, "go");
  await tick();
  expect(s.tasks.get("t1")!.attention).toBe("working");
  s.clock.advance(3 * HOUR);
  await tick();
  expect(kinds(s.log, "decision_back")).toHaveLength(0);
  expect(s.decisions.laterUntil(d.decisionId)).toBeUndefined();
});

test("现在就定 / Decide now brings it back at once; a time too near, too far or a card that can't wait is refused", async () => {
  const s = setup();
  const d = await ask(s);
  expect(() => s.decisions.later(d.decisionId, s.clock.now() + MIN)).toThrow(/later than now/);
  expect(() => s.decisions.later(d.decisionId, s.clock.now() + 40 * 24 * HOUR)).toThrow(/30 days/);
  s.decisions.later(d.decisionId, s.clock.now() + 5 * HOUR);
  await tick();
  s.decisions.later(d.decisionId, null);
  await tick();
  // Brought back by the person, it is in front of them: its countdown runs at once.
  const nb = kinds(s.log, "decision_back").at(-1)!.body as Bodies["decision_back"];
  expect(nb).toMatchObject({ by: "user" });
  expect(Date.parse(nb.defaultAt!) - s.clock.now()).toBe(30 * MIN);
  expect(s.tasks.get("t1")!.attention).toBe("needs_you");
  s.clock.advance(6 * HOUR);
  await tick();
  expect(kinds(s.log, "decision_back")).toHaveLength(1); // its old time doesn't bring it back twice
  // A sign-in card can't wait: its moment is the point.
  report(s.log, "t1", { state: "needs_input", summary: "Sign in", questions: [{ id: "s", text: "Sign in to example.test", blocking: true, reversible: false, signIn: { site: "example.test", url: "https://example.test" } } as never] });
  await tick();
  const si = kinds(s.log, "decision").at(-1)!.body as Bodies["decision"];
  expect(() => s.decisions.later(si.decisionId, s.clock.now() + HOUR)).toThrow(/can't wait/);
});

test("a restart keeps it away, and one whose time passed while down comes back at start", async () => {
  const s = setup();
  const d = await ask(s);
  s.decisions.later(d.decisionId, s.clock.now() + 2 * HOUR);
  await tick();
  s.decisions.stop();
  s.living.stop();
  // Down for three hours: on start it is back at once, with its countdown from now.
  const log2 = openLog({ path: s.path, persona: "default", clock: s.clock });
  s.clock.advance(3 * HOUR);
  const tasks2 = createRegistry(log2, s.clock);
  expect(tasks2.get("t1")!.attention).toBe("blocked");
  createDecisions({ log: log2, tasks: tasks2, clock: s.clock });
  await tick();
  expect(kinds(log2, "decision_back")).toHaveLength(1);
  expect(tasks2.get("t1")!.attention).toBe("needs_you");
  expect((kinds(log2, "decision_back")[0]!.body as Bodies["decision_back"]).defaultAt).toBeUndefined();
  s.clock.advance(5 * HOUR);
  expect(kinds(log2, "decision_resolved")).toHaveLength(0); // unseen: it waits
});

test("a read past its return that came while the countdown was never logged starts it at start", async () => {
  const s = setup();
  const d = await ask(s);
  s.decisions.later(d.decisionId, s.clock.now() + HOUR);
  await tick();
  s.clock.advance(HOUR);
  await tick();
  s.decisions.stop();
  s.living.stop();
  // The read lands in the Log while no decisions module listens (the process was going down).
  read(s);
  const tasks2 = createRegistry(s.log, s.clock);
  createDecisions({ log: s.log, tasks: tasks2, clock: s.clock });
  await tick();
  const seen = kinds(s.log, "decision_seen");
  expect(seen).toHaveLength(1);
  expect(Date.parse((seen[0]!.body as Bodies["decision_seen"]).defaultAt) - s.clock.now()).toBe(30 * MIN);
  s.clock.advance(30 * MIN);
  expect(kinds(s.log, "decision_resolved").at(-1)!.body).toMatchObject({ decisionId: d.decisionId, by: "default" });
});

test("the offered times: tonight before 19:00, the next morning, Monday unless that is tomorrow", () => {
  // A Thursday afternoon (local time).
  const thu = new Date(2026, 10, 19, 15, 0);
  const a = laterChoices(thu, "08:00");
  expect(a.map((c) => c.key)).toEqual(["tonight", "morning", "monday"]);
  expect(new Date(a[0]!.at).getHours()).toBe(20);
  expect(new Date(a[1]!.at).getDate()).toBe(20);
  expect(new Date(a[2]!.at)).toEqual(new Date(2026, 10, 23, 8, 0));
  // 23:00: no tonight; the morning is tomorrow's.
  const late = laterChoices(new Date(2026, 10, 19, 23, 0), "07:30");
  expect(late.map((c) => c.key)).toEqual(["morning", "monday"]);
  expect(new Date(late[0]!.at)).toEqual(new Date(2026, 10, 20, 7, 30));
  // 06:00: this morning still ahead.
  const early = laterChoices(new Date(2026, 10, 19, 6, 0));
  expect(early[1]).toMatchObject({ key: "morning", today: true });
  // Sunday evening: the next morning is Monday, said once.
  expect(laterChoices(new Date(2026, 10, 22, 21, 0)).map((c) => c.key)).toEqual(["morning"]);
  // Monday: next Monday is a week on.
  expect(new Date(laterChoices(new Date(2026, 10, 23, 10, 0)).at(-1)!.at)).toEqual(new Date(2026, 10, 30, 8, 0));
  expect(pickedTime(thu, 1, "9:30")).toEqual(new Date(2026, 10, 20, 9, 30));
  expect(pickedTime(thu, 0, "21")).toEqual(new Date(2026, 10, 19, 21, 0));
  expect(pickedTime(thu, 0, "25:00")).toBeUndefined();
  expect(laterRefusal(thu.getTime() + MIN, thu.getTime())).toBe("past");
  expect(laterable({})).toBe(true);
  expect(laterable({ pay: {} })).toBe(false);
});
