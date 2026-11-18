// D360: 分组 / Groups on On hand: the words equal the Mac's, and the board places a group in its most
// urgent member's section, folds the rest, and says a stopped line in its own words.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Attention, TaskGroupView } from "@ducter/protocol";
import { groupWords } from "../src/i18n-groups.ts";
import { boardGroups, foldedRows, markOf } from "../src/groups-view.ts";
import { format } from "../src/i18n.ts";

const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/groups.go"), "utf8");
const goTable = (name: string) => {
  const body = mac.split(`var ${name} = Table{`)[1]!.split("\n}")[0]!;
  return Object.fromEntries([...body.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",$/gm)].map((m) => [m[1], JSON.parse(`"${m[2]}"`)]));
};

test("the web's group words are the Mac's, key for key", () => {
  expect(goTable("zhGroups")).toEqual(groupWords.zh);
  expect(goTable("enGroups")).toEqual(groupWords.en);
});

test("the count reads in each language's own order", () => {
  expect(format(groupWords.zh["group.done"]!, [1, 3])).toBe("3 件里做完 1 件");
  expect(format(groupWords.en["group.done"]!, [1, 3])).toBe("1 of 3 done");
  // Taking a group apart says the tasks stay (research/131: without it raters read it as deleting them).
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
  expect(format(groupWords.zh["group.stopped.failed.many"]!, [2, 2])).toBe("第 2 件没做成，后面 2 件在等你决定。");
  expect(format(groupWords.zh["group.go"]!, [3])).toBe("不管它，做第 3 件");
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
