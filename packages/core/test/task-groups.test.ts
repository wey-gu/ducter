// D360: groups of tasks and their line, over a fake registry and a fake runner.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Attention, LogEvent, Place, TaskCard } from "@ducter/protocol";
import { createTaskGroups, lineOf, type HeldOpen } from "../src/task-groups.ts";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const repo = (path = "~/dev/app", device = "local"): Place => ({ kind: "repo", device, repoPath: path });

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "ducter-groups-"));
  dirs.push(dir);
  const cards = new Map<string, TaskCard>();
  const opened: HeldOpen[] = [];
  let n = 0;
  const tasks = {
    get: (id: string) => cards.get(id),
    list: () => [...cards.values()],
    onHand: () => ({ tasks: [...cards.values()], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [] }),
    setState() {},
  };
  const runner = {
    async openTask(input: HeldOpen): Promise<TaskCard> {
      opened.push(input);
      const id = `t${++n}`;
      const place = input.place?.kind === "repo" ? { ...input.place, branch: `ducter/${id}` } : (input.place ?? { kind: "none" as const });
      const c = { taskId: id, persona: input.persona, title: input.title, project: "", place, harness: "claude-code", attention: "working", residency: "hot", openedAt: "", updatedAt: "" } as TaskCard;
      cards.set(id, c);
      return c;
    },
  };
  let changes = 0;
  const make = () => createTaskGroups({ dataDir: dir, tasks, runner: () => runner, now: () => 1_700_000_000_000, changed: () => changes++ });
  const g = make();
  const set = (id: string, attention: Attention, extra: Partial<TaskCard> = {}) => {
    Object.assign(cards.get(id)!, { attention, ...extra });
    const e = { seq: 1, ts: "", persona: "p", stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention, residency: "hot" } } as LogEvent;
    return e;
  };
  const input = (title: string, place?: Place): HeldOpen => ({ persona: "p", title, brief: `do ${title}`, ...(place ? { place } : {}) });
  return { g, make, cards, opened, set, input, changes: () => changes };
}

test("a split in one repo runs one after another: the later parts are held, not opened", async () => {
  const r = rig();
  const a = await r.g.open("p", "登录页重做", r.input("换表单", repo()));
  const b = await r.g.open("p", "登录页重做", r.input("短信验证码", repo()));
  const c = await r.g.open("p", "登录页重做", r.input("端到端测试", repo()));
  expect("card" in a).toBe(true);
  expect("held" in b && b.after).toBe("换表单");
  expect("held" in c && c.after).toBe("短信验证码");
  expect(r.opened.length).toBe(1); // no agent spent on what waits
  const v = r.g.list()[0]!;
  expect(v.name).toBe("登录页重做");
  expect(v.members.map((m) => ("taskId" in m ? m.taskId : m.title))).toEqual(["t1", "短信验证码", "端到端测试"]);
});

test("when a part is done the next opens from its branch, with a line saying which part it is", async () => {
  const r = rig();
  await r.g.open("p", "登录页重做", r.input("换表单", repo()));
  await r.g.open("p", "登录页重做", r.input("短信验证码", repo()));
  await r.g.open("p", "登录页重做", r.input("端到端测试", repo()));
  r.g.onEvent(r.set("t1", "working"));
  await r.g.pump();
  expect(r.opened.length).toBe(1); // still working: nothing moves
  r.g.onEvent(r.set("t1", "needs_you"));
  await r.g.pump();
  expect(r.opened.length).toBe(1); // it needs the person: the line waits with it
  // A task's result back is done_claimed until it is merged: the line moves on it (D216).
  r.set("t1", "done_claimed", { lastReport: { state: "done", summary: "the form uses the new component" } as never });
  await r.g.pump();
  expect(r.opened.length).toBe(2);
  const second = r.opened[1]!;
  expect(second.place).toMatchObject({ kind: "repo", baseBranch: "ducter/t1" });
  expect(second.brief).toContain('part 2 of 3 of "登录页重做"');
  expect(second.brief).toContain("the form uses the new component");
  expect(second.brief.endsWith("do 短信验证码")).toBe(true);
  expect(r.opened.length).toBe(2); // the third waits for the second
});

test("a merged part hands on no branch: the next starts from the repo's base", async () => {
  const r = rig();
  await r.g.open("p", "x", r.input("a", repo()));
  await r.g.open("p", "x", r.input("b", repo()));
  r.set("t1", "done", { integrated: { act: "merge", at: "" } });
  await r.g.pump();
  expect((r.opened[1]!.place as { baseBranch?: string }).baseBranch).toBeUndefined();
  expect(r.opened[1]!.brief).toContain("is done and merged");
});

test("parts in other folders, on other computers or with no place run side by side", async () => {
  const r = rig();
  await r.g.open("p", "发布", r.input("app", repo("~/dev/app")));
  const web = await r.g.open("p", "发布", r.input("site", repo("~/dev/site")));
  const other = await r.g.open("p", "发布", r.input("app on the server", repo("~/dev/app", "hel")));
  const none = await r.g.open("p", "发布", r.input("write the note"));
  expect(["card" in web, "card" in other, "card" in none]).toEqual([true, true, true]);
  expect(r.opened.length).toBe(4);
  expect(lineOf(repo("~/dev/app/"))).toBe(lineOf(repo("~/dev/app")));
});

test("a part that fails stops its line: the rest wait for the person, who can go on or drop them", async () => {
  const r = rig();
  await r.g.open("p", "g", r.input("a", repo()));
  await r.g.open("p", "g", r.input("b", repo()));
  await r.g.open("p", "g", r.input("c", repo()));
  r.set("t1", "failed");
  await r.g.pump();
  let v = r.g.list()[0]!;
  expect(v.stopped).toEqual({ taskId: "t1", why: "failed" });
  expect(r.opened.length).toBe(1);
  // Go on with the next: b opens (from no branch of a failed part) and says the one before didn't finish.
  const res = await r.g.frame({ t: "task_group", op: "next", groupId: v.id });
  expect(res.ok).toBe(true);
  expect(r.opened.length).toBe(2);
  expect(r.opened[1]!.title).toBe("b");
  expect(r.opened[1]!.brief).toContain("didn't finish");
  v = r.g.list()[0]!;
  expect(v.stopped).toBeUndefined();
  // Drop the rest: c never opens; the tasks stay.
  await r.g.frame({ t: "task_group", op: "drop_rest", groupId: v.id });
  r.set("t2", "done");
  await r.g.pump();
  expect(r.opened.length).toBe(2);
  expect(r.g.list()[0]!.members).toEqual([{ taskId: "t1" }, { taskId: "t2" }]);
});

test("a stopped part continued until it is done moves the line on by itself", async () => {
  const r = rig();
  await r.g.open("p", "g", r.input("a", repo()));
  await r.g.open("p", "g", r.input("b", repo()));
  r.set("t1", "dropped");
  await r.g.pump();
  expect(r.g.list()[0]!.stopped?.why).toBe("dropped");
  r.set("t1", "working");
  await r.g.pump();
  expect(r.g.list()[0]!.stopped).toBeUndefined();
  r.set("t1", "done");
  await r.g.pump();
  expect(r.opened.map((x) => x.title)).toEqual(["a", "b"]);
});

test("the person reorders what is held, switches to side by side, and takes a group apart without losing work", async () => {
  const r = rig();
  await r.g.open("p", "g", r.input("a", repo()));
  await r.g.open("p", "g", r.input("b", repo()));
  await r.g.open("p", "g", r.input("c", repo()));
  const v = r.g.list()[0]!;
  const c = v.members[2]!;
  await r.g.frame({ t: "task_group", op: "move", groupId: v.id, member: "key" in c ? c.key : "", to: 0 });
  expect(r.g.list()[0]!.members.map((m) => ("key" in m ? m.title : m.taskId))).toEqual(["t1", "c", "b"]);
  await r.g.frame({ t: "task_group", op: "order", groupId: v.id, order: "side_by_side" });
  expect(r.opened.map((x) => x.title)).toEqual(["a", "c", "b"]); // all at once now
  // Taking it apart: the tasks stay, the group goes.
  await r.g.frame({ t: "task_group", op: "dissolve", groupId: v.id });
  expect(r.g.list()).toEqual([]);
  expect(r.cards.size).toBe(3);
});

test("dissolving a group opens what was still held, on its own", async () => {
  const r = rig();
  await r.g.open("p", "g", r.input("a", repo()));
  await r.g.open("p", "g", r.input("b", repo()));
  await r.g.frame({ t: "task_group", op: "dissolve", groupId: r.g.list()[0]!.id });
  expect(r.opened.map((x) => x.title)).toEqual(["a", "b"]);
  expect(r.opened[1]!.brief).toBe("do b"); // no group line: it is on its own now
});

test("made by hand from two tasks; one alone is not a group; rename and remove", async () => {
  const r = rig();
  const a = await r.g.open("p", "solo", r.input("a"));
  expect(r.g.list()).toEqual([]); // one member: not shown
  const b = (await r.make().open("p", "other", r.input("b"))) as { card: TaskCard };
  void b;
  const made = await r.g.frame({ t: "task_group", op: "make", taskIds: ["t1"] });
  expect(made.ok).toBe(false);
  const ok = await r.g.frame({ t: "task_group", op: "make", taskIds: ["t1", "t2"], name: "  周末  出行 " });
  expect(ok.ok && ok.group?.name).toBe("周末 出行");
  expect(ok.ok && ok.group?.by).toBe("you");
  const id = (ok as { group: { id: string } }).group.id;
  await r.g.frame({ t: "task_group", op: "rename", groupId: id, name: "周末" });
  expect(r.g.of("t2")?.name).toBe("周末");
  await r.g.frame({ t: "task_group", op: "remove", groupId: id, member: "t2" });
  expect(r.g.list()).toEqual([]); // one left: no longer a group
  void a;
});

test("the partner's name finds its live group; join takes an early-opened part in", async () => {
  const r = rig();
  await r.g.open("p", "Redo sign-in", r.input("a", repo()));
  expect(r.g.wouldHold("p", "redo sign-in", repo())).toBe(true); // names match without case
  expect(r.g.wouldHold("p", "redo sign-in", repo("~/dev/other"))).toBe(false);
  expect(r.g.wouldHold("q", "redo sign-in", repo())).toBe(false); // another partner's
  const solo = await r.make().open("p", "nothing", r.input("early", repo("~/dev/x")));
  void solo;
  const j = r.g.join("p", "Redo sign-in", ["t2"], "partner");
  expect("error" in j).toBe(false);
  expect(r.g.of("t2")?.name).toBe("Redo sign-in");
});

test("groups and what is held survive a restart, and the line moves after it", async () => {
  const r = rig();
  await r.g.open("p", "g", r.input("a", repo()));
  await r.g.open("p", "g", r.input("b", repo()));
  const again = r.make();
  expect(again.list()[0]!.members.length).toBe(2);
  r.set("t1", "done");
  await again.pump();
  expect(r.opened.map((x) => x.title)).toEqual(["a", "b"]);
});

test("a held part that couldn't open is reported, never left waiting in silence (D638)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-groups-"));
  dirs.push(dir);
  const failed: string[] = [];
  const g = createTaskGroups({
    dataDir: dir,
    tasks: { get: () => undefined, list: () => [], onHand: () => ({ tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [] }), setState() {} } as never,
    runner: () => ({ openTask: async () => { throw new Error("现在没有 AI agent 能接这个任务。"); } }) as never,
    now: () => 1_700_000_000_000,
    heldFailed: (_groupId, _key, error) => failed.push(error),
  });
  const grp = g.create("p", "记忆提炼", { order: "side_by_side", hand: { shape: "side_by_side", items: [], cap: 3 } });
  g.hold(grp.id, [{ open: { persona: "p", title: "换表单", brief: "do it" } }]);
  for (let i = 0; i < 200 && !failed.length; i++) await new Promise((r) => setTimeout(r, 10));
  expect(failed).toEqual(["现在没有 AI agent 能接这个任务。"]);
  // It stays held (and its line stopped by pump's break), but never silently: the card is told.
  expect(g.get(grp.id)!.members.length).toBe(1);
});
