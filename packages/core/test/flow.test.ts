// Registry projection, decisions with defaults (fake clock), and the living message.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createDecisions } from "../src/decisions.ts";
import { createLiving } from "../src/living.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { openTask, report, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

function setup() {
  const t = tempDir();
  cleanup = t.cleanup;
  const clock = new FakeClock();
  const path = join(t.dir, "ducter.db");
  const log = openLog({ path, persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const forwarded: [string, string][] = [];
  const decisions = createDecisions({ log, tasks, clock, onDecision: (id, text) => void forwarded.push([id, text]) });
  const living = createLiving({ log, tasks, decisions, clock });
  return { path, clock, log, tasks, decisions, living, forwarded };
}

const kinds = (log: ReturnType<typeof openLog>, k: string) => log.read({}).filter((e) => e.kind === k);

test("registry projects task_open / task_state / report and counts On hand", () => {
  const { path, log, tasks, clock } = setup();
  openTask(log, "t1");
  openTask(log, "t2", "Second");
  openTask(log, "t3", "Third");
  expect(tasks.get("t1")).toMatchObject({ attention: "queued", residency: "provisioning", title: "Fix the flaky test" });
  tasks.setState("t1", "working", "hot");
  tasks.setState("t2", "blocked", "warm", "CI");
  tasks.setState("t3", "done", "warm");
  report(log, "t1", { summary: "Halfway." });
  expect(tasks.get("t1")).toMatchObject({ attention: "working", residency: "hot", lastReport: { summary: "Halfway." } });
  const oh = tasks.onHand();
  expect(oh.counts).toEqual({ needs_you: 0, working: 1, waiting: 1, done_today: 1 });
  expect(oh.tasks.map((t) => t.taskId)).toEqual(["t2", "t1", "t3"]);
  expect(() => tasks.setState("nope", "working", "hot")).toThrow();
  // Rebuilt identically from the Log.
  const again = createRegistry(openLog({ path, persona: "default", clock }), clock);
  expect(again.get("t2")).toEqual(tasks.get("t2")!);
});

test("blocking question -> decision + needs_you; reversible default auto-resolves at defaultAt", async () => {
  const { log, tasks, clock, forwarded } = setup();
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  report(log, "t1", {
    state: "needs_input",
    summary: "main moved; rebase or merge?",
    questions: [{ id: "q1", text: "Rebase onto main?", blocking: true, default: "Rebase", reversible: true }],
  });
  await tick();
  const [d] = kinds(log, "decision");
  const body = d!.body as Bodies["decision"];
  expect(body).toMatchObject({ taskId: "t1", question: "Rebase onto main?", goLabel: "Rebase", defaultOption: "go", reversible: true });
  expect(Date.parse(body.defaultAt!) - clock.now()).toBe(30 * 60 * 1000);
  expect(tasks.get("t1")).toMatchObject({ attention: "needs_you", pendingDecisionId: body.decisionId });
  expect(tasks.onHand().counts.needs_you).toBe(1);

  clock.advance(29 * 60 * 1000);
  expect(kinds(log, "decision_resolved")).toHaveLength(0);
  clock.advance(60 * 1000);
  const [r] = kinds(log, "decision_resolved");
  expect(r!.body).toEqual({ decisionId: body.decisionId, option: "go", by: "default" });
  expect(tasks.get("t1")).toMatchObject({ attention: "working" });
  expect(tasks.get("t1")!.pendingDecisionId).toBeUndefined();
  await tick();
  expect(forwarded).toEqual([["t1", "User says Go: Rebase."]]);
});

test("irreversible questions wait for the user; reply text is forwarded, hold is not", async () => {
  const { log, tasks, clock, decisions, forwarded } = setup();
  openTask(log, "t1");
  report(log, "t1", { state: "needs_input", summary: "Force push?", questions: [{ id: "q", text: "Force push?", blocking: true, default: "Push", reversible: false }] });
  await tick();
  const d1 = kinds(log, "decision")[0]!.body as Bodies["decision"];
  expect(d1.defaultAt).toBeUndefined();
  clock.advance(3 * 3600 * 1000);
  expect(kinds(log, "decision_resolved")).toHaveLength(0);
  decisions.decide(d1.decisionId, "hold");
  expect(tasks.get("t1")!.attention).toBe("blocked");
  expect(tasks.get("t1")!.reason).toBeUndefined(); // internal words never reach the card
  expect(() => decisions.decide(d1.decisionId, "go")).toThrow(/already resolved/);

  report(log, "t1", { state: "needs_input", summary: "Which file?", questions: [] });
  const d2 = kinds(log, "decision")[1]!.body as Bodies["decision"];
  expect(d2).toMatchObject({ goLabel: "Continue", defaultOption: "hold", question: "Which file?" });
  expect(() => decisions.decide(d2.decisionId, "reply")).toThrow(/needs text/);
  decisions.decide(d2.decisionId, "reply", "Use src/a.ts");
  await tick();
  // Hold stays on the card (Waiting) without starting a turn in the idle task.
  expect(forwarded).toEqual([["t1", "Use src/a.ts"]]);
});

test("report states map to attention; done needs evidence", async () => {
  const { log, tasks } = setup();
  openTask(log, "t1");
  openTask(log, "t2");
  report(log, "t1", { state: "done", summary: "Fixed." });
  await tick();
  expect(tasks.get("t1")!.attention).toBe("done_claimed");
  // Like runner's report_to_main: append, then set done_claimed itself; core reconciles to done.
  report(log, "t2", { state: "done", summary: "Fixed.", evidence: [{ kind: "test", label: "bun test", ref: "10/10 pass" }] });
  tasks.setState("t2", "done_claimed", "hot", "report: done");
  await tick();
  expect(tasks.get("t2")!.attention).toBe("done");
  report(log, "t1", { state: "blocked", summary: "Waiting on CI" });
  await tick();
  expect(tasks.get("t1")).toMatchObject({ attention: "blocked", reason: "Waiting on CI" });
  report(log, "t1", { state: "failed", summary: "Env broken" });
  await tick();
  expect(tasks.get("t1")!.attention).toBe("failed");
});

test("an answer resolved just before a crash, never handed to its task, is handed over after the restart (once)", async () => {
  const { path, log, clock, decisions, living } = setup();
  const ask = (taskId: string, text: string) => {
    openTask(log, taskId);
    report(log, taskId, { state: "needs_input", summary: text, questions: [{ id: "q", text, blocking: true, reversible: false }] });
  };
  ask("t1", "Which file?"); // answered, then the process died before the forward
  ask("t2", "Which branch?"); // answered and delivered (the runner logged the input)
  ask("t3", "Rename it?"); // answered by a direct message (silent)
  await tick();
  const ids = log.read({ kinds: ["decision"] }).map((e) => (e.body as Bodies["decision"]).decisionId);
  decisions.decide(ids[0]!, "reply", "src/a.ts");
  decisions.decide(ids[1]!, "go");
  log.append({ stream: "task:t2", origin: "task", kind: "task_event", body: { taskId: "t2", role: "user", from: "user", text: "User says Go: Continue." } });
  log.append({ stream: "task:t3", origin: "task", kind: "task_event", body: { taskId: "t3", role: "user", from: "user", text: "yes, rename" } });
  decisions.answeredByMessage("t3", "yes, rename", "user");
  decisions.stop();
  living.stop();
  log.close();

  const log2 = openLog({ path, persona: "default", clock });
  const tasks2 = createRegistry(log2, clock);
  const d2 = createDecisions({ log: log2, tasks: tasks2, clock });
  expect(d2.takeUnforwarded().map(({ taskId, text }) => [taskId, text])).toEqual([["t1", "src/a.ts"]]);
  expect(d2.takeUnforwarded()).toEqual([]);
  // Once the runner logs it as input, a further restart doesn't send it again.
  log2.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "user", from: "user", text: "src/a.ts" } });
  d2.stop();
  const d3 = createDecisions({ log: log2, tasks: tasks2, clock });
  expect(d3.takeUnforwarded()).toEqual([]);
  d3.stop();
  log2.close();
});

test("core hands the lost answer to the runner when it is wired", async () => {
  const t = tempDir();
  cleanup = t.cleanup;
  const { startCore } = await import("../src/core.ts");
  const c1 = startCore({ dataDir: t.dir, port: 0 });
  c1.setRunner({ send: async () => ({ delivered: "queued" }) } as any); // delivers nothing, logs nothing: the crash
  openTask(c1.log, "t1");
  report(c1.log, "t1", { state: "needs_input", summary: "Which file?", questions: [{ id: "q", text: "Which file?", blocking: true, reversible: false }] });
  await tick();
  c1.decisions.decide((c1.log.read({ kinds: ["decision"] })[0]!.body as Bodies["decision"]).decisionId, "reply", "src/a.ts");
  await c1.stop();
  const c2 = startCore({ dataDir: t.dir, port: 0 });
  const sent: [string, string, string | undefined][] = [];
  c2.setRunner({ send: async (id: string, text: string, _m: unknown, from?: string) => (sent.push([id, text, from]), { delivered: "prompted" }) } as any);
  await tick();
  await tick();
  expect(sent).toEqual([["t1", "src/a.ts", "user"]]);
  await c2.stop();
});

test("pending reversible defaults are re-armed after a restart", async () => {
  const { path, log, clock, decisions, living } = setup();
  openTask(log, "t1");
  report(log, "t1", { state: "needs_input", summary: "?", questions: [{ id: "q", text: "Rebase?", blocking: true, default: "Rebase", reversible: true }] });
  await tick();
  decisions.stop();
  living.stop();
  log.close();
  // Simulate restart: fresh projection + decisions over the same file.
  const log2 = openLog({ path, persona: "default", clock });
  const tasks2 = createRegistry(log2, clock);
  createDecisions({ log: log2, tasks: tasks2, clock });
  clock.advance(31 * 60 * 1000);
  expect(log2.read({ kinds: ["decision_resolved"] }).map((e) => (e.body as Bodies["decision_resolved"]).by)).toEqual(["default"]);
  expect(tasks2.get("t1")!.attention).toBe("working");
});

test("living message: one open message, revisions supersede, read freezes", async () => {
  const { log, tasks, living } = setup();
  openTask(log, "t1", "Flaky test");
  openTask(log, "t2", "Docs");
  await tick();
  expect(kinds(log, "living_msg")).toHaveLength(0); // nothing to say yet

  report(log, "t1", { state: "progress", summary: "Reproduced the flake." });
  await tick();
  const v1 = kinds(log, "living_msg");
  expect(v1).toHaveLength(1);
  expect(v1[0]!.supersedes).toBeUndefined();
  expect((v1[0]!.body as Bodies["living_msg"]).items).toEqual([{ taskId: "t1", kind: "progress", title: "Flaky test", text: "Reproduced the flake." }]);

  report(log, "t2", { state: "needs_input", summary: "?", questions: [{ id: "q", text: "Publish?", blocking: true, default: "Publish", reversible: false }] });
  await tick();
  const v2 = kinds(log, "living_msg");
  expect(v2).toHaveLength(2); // report + decision + task_state coalesced into one revision
  expect(v2[1]!.supersedes).toBe(v1[0]!.seq);
  const items = (v2[1]!.body as Bodies["living_msg"]).items;
  expect(items.map((i) => i.kind)).toEqual(["decision", "progress"]); // needs-you first
  expect(items[0]!.decisionId).toBe(tasks.get("t2")!.pendingDecisionId!);

  log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: log.head() } });
  await tick();
  expect(living.openSeq()).toBeUndefined();
  expect(kinds(log, "living_msg")).toHaveLength(2); // a read does not render

  report(log, "t1", { state: "done", summary: "Fixed: retry removed.", evidence: [{ kind: "diff", label: "diff", ref: "abc123" }] });
  await tick();
  const v3 = kinds(log, "living_msg");
  expect(v3).toHaveLength(3);
  expect(v3[2]!.supersedes).toBeUndefined(); // fresh message after the freeze
  // Already-seen items (the pending decision) are not repeated.
  expect((v3[2]!.body as Bodies["living_msg"]).items.map((i) => [i.taskId, i.kind])).toEqual([["t1", "done"]]);
});
