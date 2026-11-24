// D514: the keep-rules of the working-copy tidy, one by one, as a pure function of facts.
import { expect, test } from "bun:test";
import { TIDY_DROPPED_MS, TIDY_FINISHED_MS, copyVerdict, taskVerdict, tidiedLine, tidySize, tidyVerdict, type CopyFacts, type TaskTidyFacts } from "../src/tidy.ts";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 3600_000;
const finished = (o: Partial<TaskTidyFacts> = {}): TaskTidyFacts => ({ attention: "done", residency: "parked", idleSince: ago(4 * DAY), ...o });
const clean: CopyFacts = { ours: true, exists: true, dirty: 0, unpushed: 0, bytes: 540 * 1024 * 1024 };

test("a finished task idle past 3 days, its copy Ducter's, clean and pushed: tidied", () => {
  expect(tidyVerdict(finished(), clean, NOW)).toEqual({ tidy: true, why: "finished" });
  for (const attention of ["done_claimed", "failed", "superseded"] as const) expect(tidyVerdict(finished({ attention }), clean, NOW)).toEqual({ tidy: true, why: "finished" });
  // A warm session (idle, its process up) is closed by the tidy: not a reason to keep.
  expect(tidyVerdict(finished({ residency: "warm" }), clean, NOW).tidy).toBe(true);
});

test("live: working, waiting, needing the person, queued, a turn or a start under way, a hot session", () => {
  for (const attention of ["queued", "working", "needs_you", "blocked"] as const) expect(taskVerdict(finished({ attention }), NOW)).toEqual({ tidy: false, keep: "live" });
  expect(taskVerdict(finished({ busy: true }), NOW)).toEqual({ tidy: false, keep: "live" });
  expect(taskVerdict(finished({ residency: "hot" }), NOW)).toEqual({ tidy: false, keep: "live" });
  expect(taskVerdict(finished({ residency: "provisioning" }), NOW)).toEqual({ tidy: false, keep: "live" });
});

test("held by the home: a wait of its own, a Keep, an open PR, the person's star or keep", () => {
  for (const hold of ["waiting", "looking_after", "pr_open", "pinned"] as const) {
    expect(tidyVerdict(finished({ hold }), clean, NOW)).toEqual({ tidy: false, keep: hold });
    // Whatever its age.
    expect(tidyVerdict(finished({ hold, idleSince: ago(400 * DAY) }), clean, NOW)).toEqual({ tidy: false, keep: hold });
  }
});

test("the copy: not Ducter's, uncommitted files, commits nowhere else, git can't tell, no facts at all", () => {
  expect(tidyVerdict(finished(), { ...clean, ours: false }, NOW)).toEqual({ tidy: false, keep: "not_ours" });
  expect(tidyVerdict(finished(), { ...clean, dirty: 17 }, NOW)).toEqual({ tidy: false, keep: "uncommitted" });
  expect(tidyVerdict(finished(), { ...clean, unpushed: 2 }, NOW)).toEqual({ tidy: false, keep: "unpushed" });
  expect(tidyVerdict(finished(), { ...clean, unpushed: null }, NOW)).toEqual({ tidy: false, keep: "cant_tell" });
  expect(tidyVerdict(finished(), undefined, NOW)).toEqual({ tidy: false, keep: "cant_tell" });
  // Not Ducter's is said before anything git says.
  expect(copyVerdict({ ours: false, exists: true, dirty: 3, unpushed: 1 })).toEqual({ tidy: false, keep: "not_ours" });
  // A folder already gone: only its record goes; nothing to keep.
  expect(tidyVerdict(finished(), { ours: true, exists: false, dirty: 0, unpushed: 0 }, NOW)).toEqual({ tidy: true, why: "finished" });
});

test("the windows: finished 3 days, dropped 7 (Undo), each said with when it goes", () => {
  expect(taskVerdict(finished({ idleSince: ago(TIDY_FINISHED_MS - 60_000) }), NOW)).toEqual({ tidy: false, keep: "recent", until: new Date(NOW + 60_000).toISOString() });
  expect(taskVerdict(finished({ idleSince: ago(TIDY_FINISHED_MS) }), NOW).tidy).toBe(true);
  expect(taskVerdict(finished({ attention: "dropped", idleSince: ago(4 * DAY) }), NOW)).toMatchObject({ tidy: false, keep: "recent" });
  expect(taskVerdict(finished({ attention: "dropped", idleSince: ago(TIDY_DROPPED_MS) }), NOW)).toEqual({ tidy: true, why: "dropped" });
  // Its own windows (tests, the env): a minute either way.
  expect(taskVerdict(finished({ idleSince: ago(61_000) }), NOW, { finishedMs: 60_000, droppedMs: 120_000 }).tidy).toBe(true);
  expect(taskVerdict(finished({ attention: "dropped", idleSince: ago(61_000) }), NOW, { finishedMs: 60_000, droppedMs: 120_000 }).tidy).toBe(false);
  // A date that can't be read is never taken as old.
  expect(taskVerdict(finished({ idleSince: "?" }), NOW)).toEqual({ tidy: false, keep: "cant_tell" });
});

test("the order: live before a hold before the window before the copy", () => {
  expect(tidyVerdict(finished({ attention: "working", hold: "pinned" }), { ...clean, dirty: 1 }, NOW)).toEqual({ tidy: false, keep: "live" });
  expect(tidyVerdict(finished({ hold: "pr_open", idleSince: ago(DAY) }), { ...clean, dirty: 1 }, NOW)).toEqual({ tidy: false, keep: "pr_open" });
  expect(tidyVerdict(finished({ idleSince: ago(DAY) }), { ...clean, dirty: 1 }, NOW)).toMatchObject({ keep: "recent" });
});

test("the computer's quiet line, zh and en, no dot-joins; nothing when nothing was tidied", () => {
  expect(tidiedLine("zh", { count: 12, bytes: 3.4 * 1024 ** 3 })).toBe("整理过 12 个用完的工作副本，腾出 3.4 GB");
  expect(tidiedLine("en", { count: 12, bytes: 3.4 * 1024 ** 3 })).toBe("Tidied 12 finished working copies, 3.4 GB freed");
  expect(tidiedLine("zh", { count: 0, bytes: 0 })).toBe("");
  expect(tidiedLine("en", undefined)).toBe("");
  expect(tidySize(540 * 1024 * 1024)).toBe("540 MB");
  expect(tidiedLine("zh", { count: 3, bytes: 1 })).not.toContain(" · ");
});
