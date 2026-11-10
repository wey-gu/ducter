// D168: memory inside Ducter's tasks, served by the partner's own Mem client and switch: the
// recall in front of a task's first turn, and a read-only memory_search for tasks (capped,
// logged by id, none for a browser task, none with memory off). A task's `remember` reaches the
// partner as a proposal; only the partner writes, with the task's provenance.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, TaskCard } from "../../protocol/src/index.ts";
import { createPartner, noMemory, renderTrigger } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const SEED = [
  { title: "测试统一用假时钟", content: "The user wants fake clocks in every test, never real sleeps.", date: "2026-10-02" },
  { title: "Commit style", content: "Small commits with imperative subjects." },
];

function setup(o: { memoryOff?: boolean; client?: ReturnType<typeof fakeMemory> } = {}) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-taskmem-")));
  let memoryOn = !o.memoryOff;
  fc.core.settings = { get: () => ({ memory: memoryOn }) as any, setForgetter() {}, setMemState() {} };
  const mem = o.client ?? fakeMemory(SEED.map((s, i) => ({ ...s, id: `mem_${i}` })) as any);
  const fr = fakeRunner(async (_i, s) => s.end());
  fr.bindCards(fc.cards);
  createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: mem.memory });
  const card = (id: string, kind: "none" | "browser"): TaskCard => {
    const c = { taskId: id, persona: "p1", title: "t", project: "", place: kind === "browser" ? { kind, device: "local", profile: "default" } : { kind }, harness: "claude-code", attention: "working", residency: "hot", openedAt: "", updatedAt: "" } as TaskCard;
    fc.cards.set(id, c);
    return c;
  };
  const taskTool = (args: unknown, taskId: string) => fc.tools.get("task:memory_search")!.handler(args, { role: "task", taskId } as any) as Promise<any>;
  return { fc, mem, card, taskTool, setOn: (v: boolean) => (memoryOn = v) };
}

test("recall: the partner's client, a few short notes with ids; off: nothing asked", async () => {
  const s = setup();
  const notes = await s.fc.core.taskMemory!.recall({ taskId: "t1", persona: "p1", title: "Fix the flaky test", brief: "Make the clock test stable" });
  expect(notes![0]).toMatchObject({ id: "mem_0", title: "测试统一用假时钟" });
  expect(notes!.every((n) => n.content.length <= 200)).toBe(true);
  expect(s.mem.searches[0]!.query).toBe("Fix the flaky test Make the clock test stable");
  s.setOn(false);
  expect(s.fc.core.taskMemory!.on()).toBe(false);
  expect(await s.fc.core.taskMemory!.recall({ taskId: "t1", persona: "p1", title: "x", brief: "y" })).toBeUndefined();
  expect(s.mem.searches).toHaveLength(1);
});

test("memory_search for a task: short results with ids, the read logged on its stream by id only", async () => {
  const s = setup();
  s.card("t1", "none");
  const r = await s.taskTool({ query: "fake clock", limit: 9 }, "t1");
  expect(r.ok).toBe(true);
  expect(r.results[0]).toMatchObject({ id: "mem_0", title: "测试统一用假时钟" });
  expect(s.mem.searches.at(-1)!.limit).toBe(5); // capped
  const logged = s.fc.events.find((e) => e.stream === "task:t1" && e.kind === "task_event");
  expect((logged!.body as Bodies["task_event"]).raw).toEqual({ memory: "search", query: "fake clock", ids: ["mem_0"] });
  expect(JSON.stringify(logged!.body)).not.toContain("real sleeps");
});

test("at most six reads per task; a browser task and memory off get none", async () => {
  const s = setup();
  s.card("t1", "none");
  for (let i = 0; i < 6; i++) expect((await s.taskTool({ query: "q" + i }, "t1")).ok).toBe(true);
  expect((await s.taskTool({ query: "again" }, "t1")).ok).toBe(false);
  s.card("b1", "browser");
  const b = await s.taskTool({ query: "anything" }, "b1");
  expect(b).toMatchObject({ ok: false, available: false });
  s.setOn(false);
  s.card("t2", "none");
  expect(await s.taskTool({ query: "x" }, "t2")).toMatchObject({ ok: false, available: false });
  expect(s.mem.searches).toHaveLength(6);
});

test("Mem switched off for the run (no client): tasks get no memory", () => {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-taskmem-")));
  const fr = fakeRunner(async (_i, s) => s.end());
  createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: noMemory });
  expect(fc.core.taskMemory!.on()).toBe(false);
});

test("a remember proposal reaches the partner to distill; an answered Mem card says nothing to do", () => {
  const s = setup();
  const e = s.fc.core.log.append({
    stream: "task:t1",
    origin: "task",
    kind: "report",
    body: { taskId: "t1", state: "done", summary: "done", questions: [], evidence: [], remember: [{ title: "Prefers pnpm", content: "Uses pnpm in every repo." }] },
  });
  const text = renderTrigger(e, { taskTitle: () => "x", decision: () => undefined });
  expect(text).toContain("worth remembering, the task thinks: Prefers pnpm: Uses pnpm in every repo.");
  expect(text).toContain("memory_add it in your own words");
  expect(s.mem.searches).toHaveLength(0);
  const card: Bodies["decision"] = { decisionId: "d1", question: "q", goLabel: "装上", defaultOption: "hold", reversible: true, memPlugin: { device: "w1", deviceName: "mini", harness: "codex" } };
  const done = s.fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", option: "hold", by: "default" } });
  expect(renderTrigger(done, { taskTitle: () => undefined, decision: () => card })).toContain("never bring it up again");
});
