// D615: a board is only for work that comes back in rounds. A one-off dev fix (its own page,
// its PR and the hand-off say everything) never gets an offer, whatever its report count; a loop's
// or a Keep's task does. An offer an older version left open for a one-off task is withdrawn on
// start (decision_resolved hold, by "withdrawn"), and a Go on an offer that can't be honoured makes
// nothing. No model, no real GitHub.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const NOW = Date.parse("2026-11-27T17:04:00Z");

function boot(dir?: string) {
  const t = dir ? undefined : tempDir();
  if (t) stops.push(t.cleanup);
  const dataDir = dir ?? join(t!.dir, "data");
  const core = startCore({ dataDir, port: 0, push: false, batchMs: 5 });
  stops.push(() => core.stop());
  core.settings.set({ language: "en" });
  core.setPartner({ onTrigger: () => {} });
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model in this test")), available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("no");
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  const open = (taskId: string, title: string, brief: string, needs?: { reviews?: boolean }) => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief, ...(needs ? { needs } : {}) } });
    core.tasks.setState(taskId, "working", "hot");
  };
  const loop = (taskId: string) => core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_loop", body: { taskId, state: "on", reason: "every round", since: new Date(NOW).toISOString() } });
  const report = (taskId: string, n = 1) => core.log.append({ stream: "channel", origin: "task", kind: "report", body: { taskId, state: "done", summary: `Round ${n}: done.`, questions: [], evidence: [] } });
  const cards = () => core.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).map((e) => e.body as Bodies["decision"]).filter((d) => d.board);
  const resolutions = () => core.log.read({ stream: "channel", kinds: ["decision_resolved"], limit: 200 }).map((e) => e.body as Bodies["decision_resolved"]);
  return { core, open, loop, report, cards, resolutions, dataDir };
}

test("a one-off dev task with many reports gets no offer; a loop's task does", async () => {
  const b = boot();
  b.open("tfix", "Fix the Plus annual card", "Fix the annual quota date and open a PR; the Babysitter follows the PR.");
  for (let i = 1; i <= 6; i++) b.report("tfix", i);
  expect(b.cards()).toHaveLength(0);

  b.open("tloop", "Check the fares every morning", "Every morning, check the Friday fares.");
  b.loop("tloop");
  for (let i = 1; i <= 3; i++) b.report("tloop", i);
  expect(b.cards()).toHaveLength(1);
  expect(b.cards()[0]!.board).toMatchObject({ taskId: "tloop", kind: "reports" });
});

test("an old open board offer for a one-off task is withdrawn on start", async () => {
  const first = boot();
  first.open("tfix", "Fix the Plus annual card", "Fix it and hand the PR over.");
  first.core.log.append({
    stream: "channel",
    origin: "partner",
    kind: "decision",
    body: { decisionId: "d_old", question: "Keep these on a board?", goLabel: "Make a board", holdLabel: "No thanks", defaultOption: "hold", reversible: false, board: { taskId: "tfix", title: "Fix the Plus annual card", kind: "reviews" } },
  });
  const dir = first.dataDir;
  await first.core.stop();

  const again = boot(dir);
  const r = again.resolutions().find((x) => x.decisionId === "d_old");
  expect(r).toMatchObject({ option: "hold", by: "withdrawn", settled: true });
  expect(again.core.apps.list(again.core.persona.id)).toHaveLength(0);
  // Withdrawn means it can't be answered into an app later.
  expect(() => again.core.decisions.decide("d_old", "go")).toThrow();
});

test("a Go on an unqualified board offer makes no app and leaves one plain line", async () => {
  const b = boot();
  // A review task the partner marked once, but it never runs in rounds: an offer left by an older
  // version, answered before the next rule evaluation took it back.
  b.open("trev", "Review once", "Review one PR, then done.", { reviews: true });
  b.core.log.append({
    stream: "channel",
    origin: "partner",
    kind: "decision",
    body: { decisionId: "d_race", question: "Keep these on a board?", goLabel: "Make a board", holdLabel: "No thanks", defaultOption: "hold", reversible: false, board: { taskId: "trev", title: "Review once", kind: "reviews" } },
  });
  b.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_race", option: "go", by: "user" } });
  await Bun.sleep(10);
  // Nothing was made, and no improvised app stands in.
  expect(b.core.apps.list(b.core.persona.id)).toHaveLength(0);
  expect((await b.core.boards!.makeReviewBoard("trev")).ok).toBe(false);
});
