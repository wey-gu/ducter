// D473: `ducter repairs` counts where each failure ended: mended by Ducter, by the partner, or
// reaching the person. Synthetic events in a real home's shapes.
import { expect, test } from "bun:test";
import type { Bodies, CantStart, EventKind, LogEvent, MendBody } from "@ducter/protocol";
import { repairReport } from "../src/mend-week.ts";

let seq = 0;
const at = (min: number) => new Date(Date.parse("2026-11-17T10:00:00Z") + min * 60_000).toISOString();
const ev = <K extends EventKind>(min: number, kind: K, body: Bodies[K], origin: LogEvent["origin"] = "system"): LogEvent => ({ seq: ++seq, ts: at(min), persona: "default", stream: `task:${(body as { taskId: string }).taskId}`, origin, kind, body });
const failed = (min: number, taskId: string, cant: CantStart) => ev(min, "task_state", { taskId, attention: "failed", residency: "archived", cant });
const state = (min: number, taskId: string, attention: Bodies["task_state"]["attention"]) => ev(min, "task_state", { taskId, attention, residency: "hot" });
const mend = (min: number, b: Omit<MendBody, "attempt" | "tried" | "state"> & Partial<MendBody>) => ev(min, "mend", { attempt: 1, tried: [], state: b.rung === "rethink" ? "ok" : "going", ...b });
const open = (min: number, taskId: string, origin: LogEvent["origin"] = "system") => ev(min, "task_open", { taskId, title: "x", project: "", place: { kind: "none" }, harness: "codex", brief: "x" }, origin);
const other: CantStart = { why: "other", computer: "Mac", what: "mem" };

test("healed by Ducter, fixed by the partner, reached the person by a tap, and still failed", () => {
  const evs = [
    // a: Ducter's own clone did it.
    failed(0, "a", { ...other, why: "no_repo", cloneHere: true }),
    mend(0, { taskId: "a", cls: "start", rung: "repair", how: "clone_here" }),
    open(0, "a"),
    state(1, "a", "queued"),
    state(2, "a", "working"),
    // b: nothing to try; the partner sent it words and it started.
    failed(3, "b", { ...other, why: "no_folder" }),
    mend(3, { taskId: "b", cls: "start", rung: "rethink" }),
    ev(4, "task_event", { taskId: "b", role: "user", from: "partner", text: "the repo is nowledge-co/mem" }),
    open(4, "b"),
    state(5, "b", "working"),
    // c: the person tapped 再试一次 (a start nobody else asked for).
    failed(6, "c", other),
    open(7, "c"),
    state(8, "c", "working"),
    // d: Ducter's retry failed the same way; the partner was told; still failed when counted.
    failed(9, "d", other),
    mend(9, { taskId: "d", cls: "start", rung: "retry", how: "reopen" }),
    open(10, "d"),
    failed(10, "d", other),
    mend(10, { taskId: "d", cls: "start", rung: "rethink", budget: true }),
    // e: a stall the partner carried on.
    ev(11, "task_event", { taskId: "e", role: "system", text: "stall", raw: { stall: true } }),
    mend(11, { taskId: "e", cls: "stall", rung: "rethink" }),
    ev(12, "task_event", { taskId: "e", role: "user", from: "partner", text: "carry on with the tests" }),
    state(12, "e", "working"),
  ];
  const r = repairReport(evs, { now: Date.parse("2026-11-20T00:00:00Z"), weeks: 1 });
  expect(r.weeks).toHaveLength(1);
  expect(r.weeks[0]).toMatchObject({ week: "2026-11-16", failures: { start: 4, stall: 1 }, healed: 1, partnerFixed: 2, reachedPerson: 2, rethought: 3, held: 1 });
  expect(r.weeks[0]!.byHow.clone_here).toEqual({ tried: 1, worked: 1 });
  expect(r.weeks[0]!.byHow.reopen).toEqual({ tried: 1, worked: 0 });
  expect(r.causes).toEqual({ no_repo: 1, no_folder: 1, other: 2 });
});

test("weeks before the span are left out; an empty week says nothing went wrong", () => {
  const r = repairReport([failed(0, "a", other)], { now: Date.parse("2026-11-30T00:00:00Z"), weeks: 1 });
  expect(r.weeks).toEqual([expect.objectContaining({ week: "2026-11-30", failures: { start: 0, stall: 0 } })]);
});
