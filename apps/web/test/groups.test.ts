// D360: 分组 / Groups on On hand: the words equal the Mac's, and the board places a group in its most
// urgent member's section, folds the rest, and says a stopped line in its own words.
import { expect, test } from "bun:test";
import type { Attention, TaskGroupView } from "@ducter/protocol";
import { groupWords } from "../src/i18n-groups.ts";
import { boardGroups, foldedRows, groupCount, markOf } from "../src/groups-view.ts";
import { format } from "../src/i18n.ts";

// The words equal the Mac's, key for key: words.test.ts checks every mirrored table (D488).

// D430: no counter noun anywhere on the card; the count is the conversation's, shown only while
// something is done and something is left.
test("the card counts in the conversation's words, and only while something is done and something left", () => {
  for (const v of [...Object.values(groupWords.zh), ...Object.values(groupWords.en)]) expect(v).not.toMatch(/件|\bpart\b/i);
  const row = (attention: Attention) => ({ kind: "task" as const, taskId: "x", part: 1, attention });
  expect(groupCount([row("done"), row("working"), row("working")])).toEqual({ done: 1, left: 2 });
  expect(groupCount([row("working"), row("working")])).toBeUndefined();
  expect(groupCount([row("done"), row("done")])).toBeUndefined();
  expect(groupCount([row("done"), row("failed"), { kind: "held", key: "h", part: 3, title: "t" }])).toEqual({ done: 1, left: 1 });
  // Taking a group apart says the tasks stay (research/133: without it raters read it as deleting them).
  expect(groupWords.zh["group.ungroup"]).toContain("任务都留着");
  expect(groupWords.en["group.ungroup"]).toContain("the tasks stay");
});

const G = (over: Partial<TaskGroupView> = {}): TaskGroupView => ({
  id: "g1",
  name: "登录页重做",
  order: "one_by_one",
  by: "partner",
  persona: "default",
  createdAt: "",
  members: [{ taskId: "a" }, { taskId: "b" }, { key: "h1", title: "补端到端测试", at: "" }],
  ...over,
});

test("a group stands in its most urgent member's section, its tasks out of their own", () => {
  const lanes: Record<string, number> = { a: 3, b: 1 };
  const att: Record<string, Attention> = { a: "done", b: "working" };
  const [b] = boardGroups([G()], (id) => lanes[id] ?? -1, (id) => att[id]);
  expect(b!.lane).toBe(1); // working beats done
  expect([...b!.ids]).toEqual(["a", "b"]);
  expect([b!.done, b!.of]).toEqual([1, 3]);
  expect(b!.rows.map(markOf)).toEqual(["done", "working", "held"]);
  // A part that needs the person brings the whole card up to 等你.
  att.b = "needs_you";
  lanes.b = 0;
  expect(boardGroups([G()], (id) => lanes[id] ?? -1, (id) => att[id])[0]!.lane).toBe(0);
});

test("no card for one member, nor for a group none of whose tasks is on the board", () => {
  expect(boardGroups([G({ members: [{ taskId: "a" }] })], () => 1, () => "working")).toEqual([]);
  expect(boardGroups([G()], () => -1, () => "done")).toEqual([]);
});

test("a stopped line says which part ended and which is next, and stands with what needs you", () => {
  const g = G({ members: [{ taskId: "a" }, { taskId: "b" }, { key: "h1", title: "c", at: "" }, { key: "h2", title: "d", at: "" }], stopped: { taskId: "b", why: "failed" } });
  const [b] = boardGroups([g], (id) => (id === "a" ? 3 : 3), (id) => (id === "a" ? "done" : "failed"));
  expect(b!.lane).toBe(0);
  expect(b!.stopped).toEqual({ why: "failed", part: 2, next: 3, waiting: 2, taskId: "b" });
  // D430: the part is named by its own words, never by a number.
  expect(format(groupWords.zh["group.stopped.failed.many"]!, ["更新状态页"])).toBe("「更新状态页」没做成，后面的都在等你决定。");
  expect(format(groupWords.zh["group.stopped.failed"]!, ["更新状态页", "写发布说明"])).toBe("「更新状态页」没做成，「写发布说明」在等你决定。");
  expect(format(groupWords.en["group.stopped.failed"]!, ["update the status page", "write the notes"])).toBe("“update the status page” didn't work out; “write the notes” is waiting for you.");
});

test("a folded card keeps what is live and the next in line, the rest as n more", () => {
  const members = [{ taskId: "a" }, { taskId: "b" }, { taskId: "c" }, { key: "h1", title: "d", at: "" }, { key: "h2", title: "e", at: "" }];
  const att: Record<string, Attention> = { a: "done", b: "done", c: "working" };
  const [b] = boardGroups([G({ members })], () => 1, (id) => att[id]);
  const f = foldedRows(b!);
  expect(f.shown.map((r) => r.part)).toEqual([3, 4]);
  expect(f.rest).toBe(3);
  // Three or fewer: all of them.
  expect(foldedRows(boardGroups([G()], () => 1, () => "working")[0]!).rest).toBe(0);
});
