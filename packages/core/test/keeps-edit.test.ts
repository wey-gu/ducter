// D533: a Keep changed in place by the person, on the one path the partner's keep_change takes: every
// value checked in code before anything changes, the change recorded as a line among its rounds with
// who made it, its Undo, the person's edited words read once by the cheap model into the rules they
// change (shown, never applied, until the person's Go), and the next round told its rules as they are.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, KeepBody, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore } from "../src/core.ts";
import type { KeepRulesAsk } from "../src/keeps.ts";
import { tempDir } from "./helpers.ts";
import { seedOld } from "./fixtures/keeps-old.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const readWords: { said: string; kind: string }[] = [];
/** The fake cheap model: reads 每小时 as 60 minutes, and tries to slip in what no edit may set. */
const fakeRules: KeepRulesAsk = async (w) => {
  readWords.push({ said: w.said, kind: w.rules.kind });
  if (w.said.includes("出错")) throw new Error("the model timed out");
  const out: Record<string, unknown> = {};
  if (w.said.includes("每小时")) out.everyMinutes = 60;
  if (w.said.includes("每天最多 3 个")) out.cap = 3;
  if (w.said.includes("不用问我")) (out.act = { action: "stop" }), (out.effect = "acts");
  return out as never;
};

function boot(dir: string) {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, keeps: { endAsk: async () => ({}), rulesAsk: fakeRules }, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  let n = 0;
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `run${++n}`;
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: "", place: { kind: "none" }, harness: input.harness ?? "claude-code", brief: input.brief } });
      core.tasks.setState(taskId, "working", "hot");
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return core;
}

const loopKeep = (core: ReturnType<typeof boot>, taskId: string) => core.keeps!.all().find((k) => k.from.kind === "loop" && k.from.taskId === taskId) as KeepBody;

describe("D533: a rule changed in place", () => {
  test("a rhythm: checked, applied at once, a line among its rounds, undone", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const keeps = core.keeps!;
    const k = loopKeep(core, "t_review");
    expect(keeps.page(k.keepId)!.editable).toEqual(expect.arrayContaining(["said", "every", "until", "speaks", "where", "agent"]));
    expect(keeps.page(k.keepId)!.editable).not.toContain("cap");

    // Code's guards, before anything changes: a rhythm in range, nothing this Keep doesn't have.
    expect(await keeps.change(k.keepId, { everyMinutes: 2 }, { by: "you" })).toMatchObject({ ok: false, error: expect.stringContaining("5 minutes") });
    expect(await keeps.change(k.keepId, { cap: 5 }, { by: "you" })).toMatchObject({ ok: false });
    expect(await keeps.change(k.keepId, { where: "auto" }, { by: "you" })).toMatchObject({ ok: false });
    expect(await keeps.change(k.keepId, { speaks: "x".repeat(400) }, { by: "you" })).toMatchObject({ ok: false });
    expect(core.log.read({ stream: `keep:${k.keepId}`, kinds: ["keep_edit"], limit: 10 })).toHaveLength(0);

    const r = await keeps.change(k.keepId, { everyMinutes: 60 }, { by: "you" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edits).toEqual([{ field: "every", from: "45", to: "60" }]);
    expect(r.undo).toEqual({ everyMinutes: 45 });
    expect(core.work.loops.get("t_review")!.everyMs).toBe(60 * 60_000);
    expect(keeps.get(k.keepId)!.wakes).toEqual([{ kind: "every", everyMs: 60 * 60_000 }]);
    const line = keeps.page(k.keepId)!.rounds.find((x) => x.woke === "edit");
    expect(line).toMatchObject({ edit: { by: "you", edits: [{ field: "every", from: "45", to: "60" }] } });

    // Undo puts it back and takes its line away: the pair cancels, the rounds never flood.
    const u = await keeps.change(k.keepId, r.undo!, { by: "you", undo: true });
    expect(u.ok).toBe(true);
    expect(core.work.loops.get("t_review")!.everyMs).toBe(45 * 60_000);
    const edits = () => keeps.page(k.keepId)!.rounds.filter((x) => x.woke === "edit");
    expect(edits()).toHaveLength(0);

    // Changes within ten minutes are one line with the net change; one changed and changed back drops out.
    await keeps.change(k.keepId, { everyMinutes: 60 }, { by: "you" });
    await keeps.change(k.keepId, { everyMinutes: 120 }, { by: "you" });
    await keeps.change(k.keepId, { speaks: "有新进展就说一句" }, { by: "you" });
    await keeps.change(k.keepId, { speaks: "" }, { by: "you" });
    expect(edits()).toHaveLength(1);
    expect(edits()[0]!.edit).toEqual({ by: "you", edits: [{ field: "every", from: "45", to: "120" }] });
    // An undo takes back only the newest change of the line.
    const last = await keeps.change(k.keepId, { everyMinutes: 30 }, { by: "you" });
    await keeps.change(k.keepId, (last as { undo: object }).undo, { by: "you", undo: true });
    expect(edits()[0]!.edit).toEqual({ by: "you", edits: [{ field: "every", from: "45", to: "120" }] });
  });

  test("the running task is told the rules as they are now, from its next round", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const keeps = core.keeps!;
    const k = loopKeep(core, "t_review");
    expect(keeps.rulesFor({ taskId: "t_review" })).toBeUndefined(); // never changed: its brief says it all
    await keeps.change(k.keepId, { until: "100gle 的待办清空为止", speaks: "有新进展就说一句" }, { by: "you" });
    const rules = keeps.rulesFor({ taskId: "t_review" })!;
    expect(rules).toContain("100gle 的待办清空为止");
    expect(rules).toContain("有新进展就说一句");
    expect(core.work.loops.get("t_review")!.until).toBe("100gle 的待办清空为止");
  });

  test("a helper's cap and its name in Bridge; a routine's agent from its next run", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const keeps = core.keeps!;
    const h = keeps.all().find((k) => k.from.kind === "helper" && k.life === "on")!;
    expect(keeps.page(h.keepId)).toMatchObject({ cap: 10, editable: expect.arrayContaining(["cap", "address"]) });
    expect(await keeps.change(h.keepId, { cap: 99 }, { by: "you" })).toMatchObject({ ok: false });
    expect(await keeps.change(h.keepId, { everyMinutes: 30 }, { by: "you" })).toMatchObject({ ok: false });
    const c = await keeps.change(h.keepId, { cap: 4 }, { by: "you" });
    expect(c).toMatchObject({ ok: true, edits: [{ field: "cap", from: "10", to: "4" }], undo: { cap: 10 } });
    expect(core.helpers!.get("nowledge-mem-pr-babysitter")!.daily).toBe(4);
    expect(await keeps.change(h.keepId, { address: "Docs proofreader" }, { by: "you" })).toMatchObject({ ok: false }); // another's name
    const a = await keeps.change(h.keepId, { address: "Mem PR babysitter" }, { by: "you" });
    expect(a.ok).toBe(true);
    expect(core.helpers!.get("nowledge-mem-pr-babysitter")!.name).toBe("Mem PR babysitter");
    expect(keeps.get(h.keepId)!.title).toBe("Mem PR babysitter");

    const r = await keeps.make({ title: "周报", said: "每周一早上 9 点给我写周报", brief: "Write the weekly report.", wake: { at: { kind: "time", every: "day", time: "09:00", zone: "personal", tz: "Asia/Shanghai" } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = await keeps.change(r.keep.keepId, { agent: "codex" }, { by: "you" });
    expect(w).toMatchObject({ ok: true, edits: [{ field: "agent", from: "auto", to: "codex" }], undo: { agent: "auto" } });
    expect(core.work.routines.get((r.keep.from as { routineId: string }).routineId)!.harness).toBe("codex");
    const back = await keeps.change(r.keep.keepId, { agent: "auto" }, { by: "you", undo: true });
    expect(back.ok).toBe(true);
    expect(core.work.routines.get((r.keep.from as { routineId: string }).routineId)!.harness).toBeUndefined();
  });
});

describe("D533: the person's words, read into the rules they change", () => {
  test("a proposal is a diff, nothing applied; only what code agrees with is kept; the Go applies it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const keeps = core.keeps!;
    const k = loopKeep(core, "t_review");
    const said = "持续评审 nowledge-co，改成每小时一轮；并处理 100gle 分给你的待办，每天最多 3 个，不用问我";
    const p = await keeps.propose(k.keepId, said);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    // Every hour is a rhythm this Keep has; a cap is a helper's; a gesture or what it may touch are never an edit's.
    expect(p.change).toEqual({ said, everyMinutes: 60 });
    expect(p.edits).toEqual([{ field: "said" }, { field: "every", from: "45", to: "60" }]);
    expect(core.work.loops.get("t_review")!.everyMs).toBe(45 * 60_000); // nothing yet
    expect(keeps.get(k.keepId)!.said).not.toBe(said);

    const r = await keeps.change(k.keepId, p.change, { by: "you" });
    expect(r.ok).toBe(true);
    expect(keeps.get(k.keepId)!.said).toBe(said);
    expect(core.work.loops.get("t_review")!.everyMs).toBe(60 * 60_000);
    expect(keeps.get(k.keepId)!.life).toBe("on");

    const f = await keeps.propose(k.keepId, "出错的一句");
    expect(f).toMatchObject({ ok: false, error: "failed" });
    expect(await keeps.propose(k.keepId, "  ")).toMatchObject({ ok: false });
  });

  test("the partner's keep_change takes the same path, and its line says the partner made it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const k = loopKeep(core, "t_review");
    const out = (await core.mcp.call({ role: "partner" }, "keep_change", { id: "t_review", action: "every", minutes: 60 })) as { ok: boolean; changed?: unknown };
    expect(out).toMatchObject({ ok: true, changed: [{ field: "every", from: "45", to: "60" }] });
    const e = core.log.read({ stream: `keep:${k.keepId}`, kinds: ["keep_edit"], limit: 5 }).map((x) => x.body as Bodies["keep_edit"]);
    expect(e).toEqual([{ keepId: k.keepId, by: "partner", edits: [{ field: "every", from: "45", to: "60" }] }]);
    const bad = (await core.mcp.call({ role: "partner" }, "keep_change", { id: "t_review", cap: 3 })) as { ok: boolean };
    expect(bad.ok).toBe(false);
  });
});
