// D615: a board Go is only ever Ducter's board path. A review board is made by Ducter itself,
// never stood in for by the app tool; an offer that can't be honoured makes nothing and gets one
// plain line why. An offer withdrawn because its task doesn't run in rounds is not answered.
import { expect, test } from "bun:test";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { renderTrigger, type RenderCtx } from "../src/render.ts";

const decision = (kind: "reviews" | "reports"): Bodies["decision"] => ({
  decisionId: "d_board",
  question: "Keep these on a board?",
  goLabel: "Make a board",
  holdLabel: "No thanks",
  defaultOption: "hold",
  reversible: false,
  board: { taskId: "tfix", title: "Fix the Plus annual card", kind },
});
const ctx = (kind: "reviews" | "reports") =>
  ({ taskTitle: () => "Fix the Plus annual card", decision: (id: string) => (id === "d_board" ? decision(kind) : undefined) }) as unknown as RenderCtx;
const event = (body: Bodies["decision_resolved"]): LogEvent => ({ seq: 2, ts: "2026-11-27T17:11:07.000Z", persona: "p", stream: "channel", origin: "user", kind: "decision_resolved", body });

test("Go on a review board offer: Ducter's board path only, never app standing in, one line why if it couldn't", () => {
  const line = renderTrigger(event({ decisionId: "d_board", option: "go", by: "user" }), ctx("reviews"));
  expect(line).toContain("Ducter's board path");
  expect(line).toContain("never call the app tool to stand in");
  expect(line).toContain("one plain line why");
});

test("Go on a reports board offer: the app tool is the board's one path; a refusal makes nothing", () => {
  const line = renderTrigger(event({ decisionId: "d_board", option: "go", by: "user" }), ctx("reports"));
  expect(line).toContain("as the board's one path");
  expect(line).toContain("Never another app to stand in");
  expect(line).toContain("say one plain line why");
});

test("a withdrawn board offer is never read as the person saying no", () => {
  const line = renderTrigger(event({ decisionId: "d_board", option: "hold", by: "withdrawn", settled: true }), ctx("reviews"));
  expect(line).toContain("withdrawn");
  expect(line).toContain("doesn't run in rounds");
  expect(line).not.toContain("the user said no");
});
