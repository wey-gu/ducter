// D348 (research/124 F8): a folder task's undo line is said once per task. Its first report with
// changes asks the partner to say they can be undone; a later report with the same changes, open
// until the same day, says it was told already; a report whose changes grew asks again.
import { expect, test } from "bun:test";
import type { FolderSummary, LogEvent } from "../../protocol/src/index.ts";
import { renderTrigger } from "../src/render.ts";

const folder = (o: Partial<FolderSummary> = {}): FolderSummary => ({ added: 2, changed: 1, removed: 0, moved: 0, renamed: 0, folders: 0, undo: "open", undoUntil: "2026-11-24T10:00:00.000Z", at: "2026-11-17T10:00:00.000Z", ...o });
const report = (seq: number, f?: FolderSummary): LogEvent =>
  ({ seq, ts: "2026-11-17T10:00:00.000Z", persona: "p", stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "ok", questions: [], evidence: [], ...(f ? { folder: f } : {}) } }) as LogEvent;
const ctx = (before?: FolderSummary) => ({ taskTitle: () => undefined, decision: () => undefined, undoBefore: () => before });

test("the first report with changes says they can be undone", () => {
  const t = renderTrigger(report(5, folder()), ctx(undefined));
  expect(t).toContain("The user can undo all of it with one tap until 2026-11-24");
  expect(t).not.toContain("Don't say it again");
});

test("the same changes again: told already, not said again", () => {
  const t = renderTrigger(report(9, folder({ at: "2026-11-17T10:05:00.000Z" })), ctx(folder()));
  expect(t).toContain("you already told the user they can undo them. Don't say it again.");
  expect(t).not.toContain("with one tap");
});

test("changes that grew, or a new day to undo by, are said again", () => {
  expect(renderTrigger(report(9, folder({ added: 3 })), ctx(folder()))).toContain("with one tap");
  expect(renderTrigger(report(9, folder({ undoUntil: "2026-11-25T10:00:00.000Z" })), ctx(folder()))).toContain("with one tap");
  // An earlier copy that was undone since is no reason to stay quiet.
  expect(renderTrigger(report(9, folder()), ctx(folder({ undo: "undone" })))).toContain("with one tap");
});
