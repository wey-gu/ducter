// D609: a hand-off is a thing, not a message. One record per item (sender + receiver + ref): a
// second hand-off of the same item merges into the open one, a claim by the receiver's task makes it
// taken, done / returned / declined are the only endings, and an untaken one is said once. The doors
// tested here are keep_change hand and a task's hand (giveLocal); Bridge mail has its own replay.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { handoffItem, helperQuestions } from "@ducter/protocol/src/handoff.ts";
import { isHelperWork } from "@ducter/protocol/src/helpers.ts";
import { startCore } from "../src/core.ts";
import { FakeClock } from "../src/clock.ts";
import { registerTaskTools } from "../../runner/src/tools.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir: string, clock: FakeClock) {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, clock, keeps: { endAsk: async () => ({}) }, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("not here");
    },
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return { core, told };
}

const HELPER = "PR Babysitter";
const SEED_TASK = (core: ReturnType<typeof boot>["core"], taskId: string, title: string) =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief: "x" } });

function helper(core: ReturnType<typeof boot>["core"]) {
  const made = core.helpers.make({ name: HELPER, about: "PRs", brief: "Own each PR to the end." });
  if (!made.ok) throw new Error(made.error);
  core.keeps.sync();
  const keep = core.keeps.all().find((k) => k.from.kind === "helper" && k.from.helperId === made.helper.id);
  if (!keep) throw new Error("no helper keep");
  return { helper: made.helper, keep };
}

function claim(core: ReturnType<typeof boot>["core"], helperId: string, inReplyTo: string, taskId: string) {
  return core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "", state: "sent", helper: helperId, inReplyTo, taskId, text: "Taken", to: "Ducter" } });
}

describe("D609: one record per item", () => {
  test("the same item handed twice is one record and one arrival; a follow-up with no ref joins it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-26T16:31:00Z"));
    const { core } = boot(t.dir, clock);
    stops.push(() => core.stop());
    const { helper: h, keep } = helper(core);

    const first = await core.keeps.change(keep.keepId, { hand: "接手 https://github.com/nowledge-co/mem/pull/11393：独立评审，OK 就 /lgtm" }, { by: "partner" });
    expect(first.ok).toBe(true);
    const second = await core.keeps.change(keep.keepId, { hand: "再补一句：最新提交要独立会话评审" }, { by: "partner" });
    expect(second.ok).toBe(true);
    const records = core.handoffs.ofHelper(h.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ state: "given", item: { kind: "pr", ref: "nowledge-co/mem#11393" } });
    expect(records[0]!.adds).toHaveLength(1);
    const mail = core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 99 }).filter((e) => (e.body as Bodies["bridge_msg"]).helper === h.id && (e.body as Bodies["bridge_msg"]).direction === "in");
    expect(mail).toHaveLength(1);

    // A claim by one of its tasks makes it taken; the arrival is not a second record.
    clock.advance(60_000);
    claim(core, h.id, (mail[0]!.body as Bodies["bridge_msg"]).messageId, "t-a");
    expect(core.handoffs.ofHelper(h.id)[0]).toMatchObject({ state: "taken", taskId: "t-a" });
    // D609: the helper's page carries the facts the views group; the task's card carries its line.
    const page = core.keeps.page(keep.keepId)!;
    expect(page.handoffs).toHaveLength(1);
    expect(page.handoffs![0]).toMatchObject({ state: "taken", sender: "you", to: HELPER, taskId: "t-a" });
    expect(page.handoffs![0]!.givenAt).toBeTruthy();
    // More words after it was taken: still one record, merged.
    await core.keeps.change(keep.keepId, { hand: "还要看 Prow/Tide 的检查" }, { by: "partner" });
    expect(core.handoffs.ofHelper(h.id)).toHaveLength(1);
    expect(core.handoffs.ofHelper(h.id)[0]!.adds).toHaveLength(2);
  });

  test("take it now wakes a fresh arrival once; withdraw ends it and says so to a task sender", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-26T18:00:00Z"));
    const { core, told } = boot(t.dir, clock);
    stops.push(() => core.stop());
    const { helper: h, keep } = helper(core);
    SEED_TASK(core, "t-wait", "等接手的任务");
    const r = core.handoffs.giveLocal({ helper: h, text: "请接手 nowledge-co/mem#11441", fromTask: "t-wait", fromTaskTitle: "修 Plus 年额卡", fromName: "Ducter" });
    const id = r.handoff.handoffId;
    const before = core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 99 }).length;
    const woke = core.handoffs.wake(id)!;
    expect(woke.messages).toHaveLength(2);
    expect(woke.wakeAt).toBeTruthy();
    expect(core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 99 }).length).toBe(before + 1);
    // A second tap within the minute is the same wake, not another round.
    core.handoffs.wake(id);
    expect(core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 99 }).length).toBe(before + 1);
    expect(core.tasks.get("t-wait")?.handoff).toMatchObject({ state: "given" });

    const gone = await core.handoffs.withdraw(id, { say: true });
    expect(gone).toMatchObject({ state: "withdrawn", why: "you stopped following it" });
    expect(core.keeps.page(keep.keepId)!.handoffs!.find((x) => x.id === id)).toMatchObject({ state: "withdrawn" });
    expect(told.at(-1)!.taskId).toBe("t-wait");
    expect(told.at(-1)!.text).toContain("stopped asking");
    expect(core.tasks.get("t-wait")?.handoff).toMatchObject({ state: "withdrawn" });
    claim(core, h.id, r.handoff.messages![0]!, "t-too-late");
    expect(core.handoffs.get(id)).toMatchObject({ state: "withdrawn" });
    expect(core.handoffs.dueUnclaimed(clock.now() + 11 * 60_000)).toHaveLength(0);
  });

  test("a task's hand-off: taken, then returned with why, said into the task that gave it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-26T17:02:00Z"));
    const { core, told } = boot(t.dir, clock);
    stops.push(() => core.stop());
    const { helper: h } = helper(core);
    SEED_TASK(core, "t-dev", "用 agy 处理 Mem #11390");
    expect(core.tasks.get("t-dev")?.title).toBe("用 agy 处理 Mem #11390");

    const r = core.handoffs.giveLocal({ helper: h, text: "请接手 nowledge-co/mem#11408", fromTask: "t-dev", fromName: "Ducter", head: "Ducter 的任务「用 agy 处理 Mem #11390」：" });
    expect(r.created).toBe(true);
    const rec = r.handoff;
    expect(rec.item).toMatchObject({ kind: "pr", ref: "nowledge-co/mem#11408" });
    const arrival = rec.messages![0]!;

    clock.advance(60_000);
    claim(core, h.id, arrival, "t-helper");
    expect(core.handoffs.byMessage(arrival)).toMatchObject({ state: "taken", taskId: "t-helper" });
    expect(core.tasks.get("t-dev")?.handoff).toMatchObject({ state: "taken", to: HELPER, taskId: "t-helper", item: { ref: "nowledge-co/mem#11408" } });
    expect(core.tasks.get("t-dev")?.handoff?.sender).toContain("用 agy 处理 Mem #11390");

    const back = await core.handoffs.finish(rec.handoffId, "returned", { why: "Not a PR in my scope: this is an issue.", say: true });
    expect(back).toMatchObject({ state: "returned", why: "Not a PR in my scope: this is an issue." });
    expect(told).toHaveLength(1);
    expect(told[0]!.taskId).toBe("t-dev");
    expect(told[0]!.text).toContain("handed \"nowledge-co/mem#11408\" back");
    expect(told[0]!.text).toContain("Not a PR in my scope");
    expect(core.tasks.get("t-dev")?.handoff).toMatchObject({ state: "returned", why: "Not a PR in my scope: this is an issue." });
    // The record's ending is final: a done report after it cannot reopen or overwrite it.
    expect(await core.handoffs.finish(rec.handoffId, "done", { why: "late" })).toBeUndefined();
  });

  test("a helper's task hands it back with why through report_to_main", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-26T19:30:00Z"));
    const { core, told } = boot(t.dir, clock);
    stops.push(() => core.stop());
    const { helper: h } = helper(core);
    SEED_TASK(core, "t-dev", "修 mem#11408");
    SEED_TASK(core, "t-helper", "接手 mem#11408");
    const r = core.handoffs.giveLocal({ helper: h, text: "请接手 nowledge-co/mem#11408", fromTask: "t-dev", fromName: "Ducter" });
    claim(core, h.id, r.handoff.messages![0]!, "t-helper");
    registerTaskTools(core as never, {});
    const out = String(await core.mcp.call({ role: "task", taskId: "t-helper" }, "report_to_main", { state: "blocked", summary: "这个不是我接的范围。", handoff: { back: "declined", why: "我只接 PR，这个是 issue。" } }));
    expect(out).toContain("handed back");
    expect(core.handoffs.get(r.handoff.handoffId)).toMatchObject({ state: "declined", why: "我只接 PR，这个是 issue。" });
    expect(told.at(-1)!.taskId).toBe("t-dev");
    expect(told.at(-1)!.text).toContain("handed \"nowledge-co/mem#11408\" back");
  });

  test("unclaimed after ten minutes is marked once; a later claim still takes it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-26T20:20:00Z"));
    const { core } = boot(t.dir, clock);
    stops.push(() => core.stop());
    const { helper: h } = helper(core);
    SEED_TASK(core, "t-backbone", "mem-backbone #378");
    const r = core.handoffs.giveLocal({ helper: h, text: "请接手 mem-backbone#378", fromTask: "t-backbone", fromName: "Ducter" });
    const t0 = clock.now();
    expect(core.handoffs.dueUnclaimed(t0 + 9 * 60_000)).toHaveLength(0);
    expect(core.handoffs.dueUnclaimed(t0 + 11 * 60_000)).toHaveLength(1);
    expect(core.handoffs.unclaim(r.handoff.handoffId, new Date(t0 + 11 * 60_000).toISOString())).toBe(true);
    expect(core.handoffs.get(r.handoff.handoffId)).toMatchObject({ state: "unclaimed" });
    expect(core.handoffs.dueUnclaimed(t0 + 30 * 60_000)).toHaveLength(0);
    expect(core.handoffs.unclaim(r.handoff.handoffId, new Date(t0 + 31 * 60_000).toISOString())).toBe(false);
    claim(core, h.id, r.handoff.messages![0]!, "t-taken-late");
    expect(core.handoffs.get(r.handoff.handoffId)).toMatchObject({ state: "taken", taskId: "t-taken-late" });
  });
});

describe("D609: classification by our own outbox", () => {
  test("only a question one of the helper's tasks asked makes a reply an answer", () => {
    const evs = [
      { body: { direction: "out", helper: "h1", taskId: "t-helper", messageId: "m-claim", by: undefined } },
      { body: { direction: "out", helper: "h1", taskId: "t-helper", messageId: "m-q", by: "task" } },
    ];
    const q = helperQuestions(evs);
    expect([...q]).toEqual(["m-q"]);
    // A reply under the claim (the old D598 rule would call it an answer) is new work.
    expect(isHelperWork({ direction: "in", messageId: "in-1", helper: "h1", inReplyTo: "m-claim" }, q)).toBe(true);
    // A reply to the helper's own question is an answer, not new work.
    expect(isHelperWork({ direction: "in", messageId: "in-2", helper: "h1", inReplyTo: "m-q" }, q)).toBe(false);
    expect(isHelperWork({ direction: "in", messageId: "in-3", helper: "h1" }, q)).toBe(true);
    expect(isHelperWork({ direction: "in", messageId: "in-4", helper: "h1", state: "muted" }, q)).toBe(false);
  });

  test("the item is read from a URL, owner/repo#n, a bare repo#n or the words", () => {
    expect(handoffItem({ text: "请接手 https://github.com/nowledge-co/mem/pull/11393" })).toMatchObject({ kind: "pr", ref: "nowledge-co/mem#11393" });
    expect(handoffItem({ text: "看 mem-backbone#378 的 CI" })).toMatchObject({ ref: "mem-backbone#378" });
    expect(handoffItem({ text: "修一下 nowledge-co/mem#11441" })).toMatchObject({ kind: "pr", ref: "nowledge-co/mem#11441" });
    expect(handoffItem({ text: "把这份设计评审一下" }).kind).toBe("text");
    expect(handoffItem({ text: "把这份设计评审一下" }).ref).toStartWith("text:");
  });
});
