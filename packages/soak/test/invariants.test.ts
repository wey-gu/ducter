import { describe, expect, test } from "bun:test";
import type { Bodies, EventKind, LogEvent, TaskCard } from "@ducter/protocol";
import { checkDecisions, checkForwards, checkJobs, checkLiving, checkMessages, checkReports, checkResting, checkSeqs, checkWaiters, type DriverRecord } from "../src/invariants.ts";

let seq = 0;
const ev = <K extends EventKind>(kind: K, body: Bodies[K], o: Partial<LogEvent> = {}): LogEvent => ({
  seq: ++seq,
  ts: new Date(1_000_000 + seq * 1000).toISOString(),
  persona: "p",
  stream: "channel",
  origin: "system",
  kind,
  body,
  ...o,
});
const reset = () => void (seq = 0);
const rec = (): DriverRecord => ({ sent: new Map(), echoed: new Set(), decided: new Map() });
const card = (o: Partial<TaskCard>): TaskCard => ({
  taskId: "t1",
  persona: "p",
  title: "soak t1",
  project: "",
  place: { kind: "none" },
  harness: "claude-code",
  attention: "done",
  residency: "warm",
  openedAt: "",
  updatedAt: "",
  ...o,
});

describe("soak invariants", () => {
  test("seqs must be gapless", () => {
    reset();
    const evs = [ev("read_receipt", { upToSeq: 0 }), ev("read_receipt", { upToSeq: 0 })];
    expect(checkSeqs(evs)).toEqual([]);
    expect(checkSeqs([evs[1]!])[0]!.check).toBe("seq");
  });

  test("a soak message with no effect is unanswered; two effects are doubled", () => {
    reset();
    const evs = [
      ev("user_msg", { text: "#soak chat x1", clientId: "c1" }, { origin: "user" }),
      ev("user_msg", { text: "#soak task t2 slow=1", clientId: "c2" }, { origin: "user" }),
      ev("task_open", { taskId: "a", title: "soak t2", project: "", place: { kind: "none" }, harness: "claude-code", brief: "" }),
      ev("task_open", { taskId: "b", title: "soak t2", project: "", place: { kind: "none" }, harness: "claude-code", brief: "" }),
    ];
    const r = rec();
    r.echoed.add("c3");
    expect(checkMessages(evs, r).map((f) => f.check).sort()).toEqual(["user_msg.doubled", "user_msg.lost", "user_msg.unanswered"]);
  });

  test("decisions: twice, and a due default that never applied", () => {
    reset();
    const evs = [
      ev("decision", { decisionId: "d1", taskId: "t1", question: "q", goLabel: "g", defaultOption: "go", reversible: true, defaultAt: new Date(0).toISOString() }),
      ev("decision", { decisionId: "d2", taskId: "t1", question: "q", goLabel: "g", defaultOption: "go", reversible: true }),
      ev("decision_resolved", { decisionId: "d2", option: "go", by: "user" }),
      ev("decision_resolved", { decisionId: "d2", option: "go", by: "default" }),
    ];
    expect(checkDecisions(evs, Date.now()).map((f) => f.check).sort()).toEqual(["decision.default_missed", "decision.twice"]);
  });

  test("a Go must reach its task exactly once", () => {
    reset();
    const ask = ev("decision", { decisionId: "d1", taskId: "t1", question: "q", goLabel: "ship", defaultOption: "go", reversible: true });
    const res = ev("decision_resolved", { decisionId: "d1", option: "go", by: "user" }, { origin: "user" });
    expect(checkForwards([ask, res])[0]!.check).toBe("forward.lost");
    const fwd = () => ev("task_event", { taskId: "t1", role: "user", from: "user", text: "User says Go: ship." }, { stream: "task:t1" });
    const one = fwd();
    expect(checkForwards([ask, res, one])).toEqual([]);
    expect(checkForwards([ask, res, one, fwd()])[0]!.check).toBe("forward.twice");
  });

  test("waiters: one end each, never early, never missed", () => {
    reset();
    const at = new Date(1_000_000 + 10_000).toISOString();
    const evs = [
      ev("waiter", { waiterId: "w1", at, reason: "soak-wait k", state: "armed" }),
      ev("waiter", { waiterId: "w1", at, reason: "soak-wait k", state: "fired" }),
      ev("waiter", { waiterId: "w1", at, reason: "soak-wait k", state: "fired" }),
      ev("waiter", { waiterId: "w2", at, reason: "r", state: "armed" }),
    ];
    const checks = checkWaiters(evs, Date.now()).map((f) => f.check).sort();
    expect(checks).toContain("waiter.twice");
    expect(checks).toContain("waiter.early");
    expect(checks).toContain("waiter.missed");
    expect(checks).toContain("waiter.unheard");
  });

  test("acks and job results are not doubled", () => {
    reset();
    const evs = [
      ev("ack", { jobId: "j", text: "a", replyTo: 1 }, { origin: "partner" }),
      ev("ack", { jobId: "j", text: "a", replyTo: 1 }, { origin: "partner" }),
      ev("job_status", { jobId: "j", text: "a", state: "done", taskId: "t" }, { origin: "partner" }),
      ev("job_status", { jobId: "j", text: "a", state: "done", taskId: "t" }, { origin: "partner" }),
    ];
    expect(checkJobs(evs).map((f) => f.check).sort()).toEqual(["ack.dup", "job_status.dup"]);
  });

  test("at rest: nothing working, needs_you only with a question", () => {
    expect(checkResting([card({ attention: "working" })])[0]!.check).toBe("rest.stuck");
    expect(checkResting([card({ attention: "needs_you" })])[0]!.check).toBe("rest.needs_you_without_question");
    expect(checkResting([card({ attention: "working", place: { kind: "none", device: "w" } })], { offlineDevices: new Set(["w"]) })).toEqual([]);
  });

  test("the open living message never asks an answered question", () => {
    reset();
    const evs = [
      ev("decision", { decisionId: "d1", taskId: "t1", question: "q", goLabel: "g", defaultOption: "hold", reversible: false }),
      ev("living_msg", { items: [{ taskId: "t1", kind: "decision", title: "x", text: "q", decisionId: "d1" }] }),
      ev("decision_resolved", { decisionId: "d1", option: "go", by: "user" }),
    ];
    expect(checkLiving(evs, [card({ attention: "working" })]).map((f) => f.check).sort()).toEqual(["living.answered_question", "living.state"]);
    // Read: frozen, it was true when the user saw it.
    expect(checkLiving([...evs, ev("read_receipt", { upToSeq: 99 })], [card({ attention: "working" })])).toEqual([]);
  });

  test("a second done report with no new input is flagged", () => {
    reset();
    const done = () => ev("report", { taskId: "t1", state: "done", summary: "s", questions: [], evidence: [] }, { stream: "task:t1" });
    expect(checkReports([done(), done()])[0]!.check).toBe("report.done_twice");
    expect(checkReports([done(), ev("task_event", { taskId: "t1", role: "user", from: "user", text: "more" }, { stream: "task:t1" }), done()])).toEqual([]);
  });
});
