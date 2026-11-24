// D454: 移走 / Remove a finished card or group from On hand: what ⋯ offers, when a group counts as
// finished, the board leaving out what was removed (here at once, and as the home says), an old
// finished task never kept from the Log, the words (no counter, no joiner), and every finished card
// and group wired to ×, ⋯ and a swipe.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Attention, TaskCard, TaskGroupView } from "@ducter/protocol";
import { groupWords } from "../src/i18n-groups.ts";
import { boardGroups, finishedGroup } from "../src/groups-view.ts";
import { finishedMenu } from "../src/away.tsx";
import { Store } from "../src/store.ts";

test("⋯ on a finished card: try again and see why when it didn't work out; open when done; remove always last", () => {
  expect(finishedMenu({ failedIds: ["a"], openId: "a" })).toEqual(["retry", "why", "remove"]);
  expect(finishedMenu({ failedIds: [], openId: "a" })).toEqual(["open", "remove"]);
  expect(finishedMenu({ failedIds: [] })).toEqual(["remove"]);
});

const G = (members: TaskGroupView["members"], over: Partial<TaskGroupView> = {}): TaskGroupView => ({ id: "g1", name: "通用设置", order: "one_by_one", by: "you", persona: "default", createdAt: "", members, ...over });

test("a group is finished when none of its parts works, needs the person or waits; what is held counts only behind a stop", () => {
  const att: Record<string, Attention> = { a: "failed", b: "done", c: "working" };
  const board = (g: TaskGroupView) => boardGroups([g], (id) => (id in att ? 3 : -1), (id) => att[id])[0]!;
  // The author's card: a hand-over of one to-do that didn't work out.
  const one = finishedGroup(board(G([{ taskId: "a" }], { hand: { note: "", shape: "one", items: [] } as never })))!;
  expect(one).toMatchObject({ groupId: "g1", taskIds: ["a"], failedIds: ["a"], openId: "a" });
  expect(finishedMenu(one)).toEqual(["retry", "why", "remove"]);
  // Done and failed: retry the failed one, see why opens it.
  expect(finishedGroup(board(G([{ taskId: "b" }, { taskId: "a" }])))).toMatchObject({ taskIds: ["b", "a"], failedIds: ["a"], openId: "a" });
  // All done: open the last part.
  expect(finishedGroup(board(G([{ taskId: "b" }, { taskId: "b" }])))).toMatchObject({ failedIds: [], openId: "b" });
  // A part at work: not yet.
  expect(finishedGroup(board(G([{ taskId: "b" }, { taskId: "c" }])))).toBeUndefined();
  // Held in line with nothing stopped: not yet; behind a stopped part: finished (the rest drops with it).
  const held = { key: "h1", title: "补测试", at: "" };
  expect(finishedGroup(board(G([{ taskId: "b" }, held])))).toBeUndefined();
  expect(finishedGroup(board(G([{ taskId: "a" }, held], { stopped: { taskId: "a", why: "failed" } })))).toMatchObject({ failedIds: ["a"] });
});

const card = (taskId: string, attention: Attention, updatedAt: string): TaskCard => ({ taskId, persona: "default", title: taskId, project: "", place: { kind: "none" }, harness: "codex", attention, residency: "archived", openedAt: updatedAt, updatedAt }) as TaskCard;

test("the board leaves out what was removed, at once and as the home says, and never keeps an old finished task from the Log", () => {
  const s = new Store();
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  for (const c of [card("a", "failed", now), card("b", "done", now), card("old", "failed", old), card("new", "working", now)]) s.tasks.set(c.taskId, { id: c.taskId, events: [], card: c } as never);
  s.onHand = { tasks: [card("a", "failed", now), card("b", "done", now)], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 1 }, waiters: [] };
  const done = () => s.board().lanes[3]!.map((t) => t.id).sort();
  expect(done()).toEqual(["a", "b"]);
  // Here at once.
  s.awayNow.add("a");
  expect(done()).toEqual(["b"]);
  s.awayNow.clear();
  // As the home says.
  s.onHand = { ...s.onHand, away: ["b"] };
  expect(done()).toEqual(["a"]);
  // A task just opened that the snapshot doesn't hold yet still shows.
  expect(s.board().lanes[1]!.map((t) => t.id)).toEqual(["new"]);
});

test("the words: no counter, no joiner, Past tasks named as the glossary does", () => {
  const ours = (l: "zh" | "en") => Object.entries(groupWords[l]).filter(([k]) => k.startsWith("away."));
  for (const l of ["zh", "en"] as const) {
    expect(ours(l).length).toBe(7);
    for (const [, v] of ours(l)) expect(v).not.toMatch(/件|\bpart\b| · /i);
  }
  expect(groupWords.zh["away.remove"]).toBe("移走");
  expect(groupWords.zh["away.retry"]).toBe("再试一次");
  expect(groupWords.zh["away.why"]).toBe("看看为什么");
  expect(groupWords.zh["away.done"]).toContain("做过的事");
  expect(groupWords.en["away.done"]).toContain("Past tasks");
});

test("every finished card and group on On hand offers ×, ⋯ and a swipe", () => {
  const src = readFileSync(join(import.meta.dir, "../src/onhand.tsx"), "utf8");
  // D467: the one card (a new result and a seen one alike) and the group.
  expect(src.match(/useSwipeAway\(ref, fin\)/g)?.length).toBe(2);
  // D524: over the time, or (a row with actions of its own) its ⋯ alone in that group.
  expect(src.match(/<FinishedActs f=\{fin\}/g)?.length).toBe(2);
  expect(src).toContain('<FinishedActs f={fin} full={room === "full"} menuOnly />');
  // The group: × in its head, its ⋯ menu leads with try again / see why and ends with remove.
  expect(src).toContain("{fin && <AwayX f={fin} />}");
  expect(src).toContain('runFinished("remove", fin');
  expect(src).toContain("A.S.awayNow.has(g.id)");
});
