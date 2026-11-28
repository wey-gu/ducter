// D662 (research/245 §3.5): many tasks at once, and the saved views. Each task goes through its own
// path (end, interrupt, reopen, drop, the loadout switch); the batch is logged once; a working task
// ends when its round ends; Undo for ten seconds puts every one back; a Keep that owns an ended task
// stops on the same clock. Views round-trip through views.json.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BULK_UNDO_MS, createBulk, type BulkPort, type BulkTask } from "../src/bulk.ts";
import { cleanView, createViews } from "../src/views.ts";

function fake(tasks: BulkTask[], keepOf: Record<string, string> = {}) {
  const calls: string[] = [];
  const logs: Parameters<BulkPort["logBatch"]>[0][] = [];
  let now = 1_000_000;
  const byId = new Map(tasks.map((x) => [x.id, { ...x }]));
  const port: BulkPort = {
    task: (id) => byId.get(id),
    end: async (id) => {
      calls.push(`end:${id}`);
      byId.get(id)!.attention = "done";
      return "done";
    },
    interrupt: async (id) => void calls.push(`interrupt:${id}`),
    reopen: async (id) => void calls.push(`reopen:${id}`),
    drop: async (id) => void calls.push(`drop:${id}`),
    undrop: async (id) => (calls.push(`undrop:${id}`), { ok: true }),
    switch: async (id, to) => (calls.push(`switch:${id}:${to.device ?? ""}:${to.harness ?? ""}`), { ok: true }),
    keepOf: (id) => (keepOf[id] ? { id: keepOf[id]!, name: "loop" } : undefined),
    stopKeep: async (id) => (calls.push(`stopKeep:${id}`), { ok: true }),
    logBatch: (b) => void logs.push(b),
    now: () => now,
  };
  return { port, calls, logs, tick: (ms: number) => (now += ms) };
}

const t = (id: string, attention: string, o: Partial<BulkTask> = {}): BulkTask => ({ id, title: id, attention, harness: "codex", device: "local", ...o });

describe("bulk: each task through its own path, one batch", () => {
  test("End on 8 with 2 working: 6 end now, 2 wait for their round, one log line", async () => {
    const ts = [t("a", "done"), t("b", "blocked"), t("c", "needs_you"), t("d", "working"), t("e", "queued"), t("f", "blocked"), t("g", "failed"), t("h", "blocked")];
    const f = fake(ts);
    const bulk = createBulk(f.port);
    const r = await bulk.run({ op: "end", taskIds: ts.map((x) => x.id) });
    expect(r.total).toBe(8);
    expect(r.done).toBe(6);
    expect(r.pending).toBe(2);
    expect(r.skipped).toBe(0);
    expect(f.calls.filter((c) => c.startsWith("end:"))).toHaveLength(6);
    expect(f.calls).not.toContain("end:d");
    expect(f.logs).toHaveLength(1);
    expect(f.logs[0]).toMatchObject({ op: "end", done: 6, pending: 2 });
    // The working one ends at its turn's end, never mid-turn.
    await bulk.turnEnded("d");
    expect(f.calls).toContain("end:d");
    expect(f.logs).toHaveLength(1);
  });

  test("Pause skips what isn't working; an imported task is never touched", async () => {
    const f = fake([t("w", "working"), t("b", "blocked"), t("i", "working", { imported: true })]);
    const r = await createBulk(f.port).run({ op: "pause", taskIds: ["w", "b", "i"] });
    expect(r.done).toBe(1);
    expect(r.skipped).toBe(2);
    expect(f.calls).toEqual(["interrupt:w"]);
  });

  test("Move goes through the one switch, skipping finished tasks, and Undo puts each back", async () => {
    const f = fake([t("a", "blocked"), t("b", "working", { device: "haswell" }), t("c", "done")]);
    const bulk = createBulk(f.port);
    const r = await bulk.run({ op: "move", taskIds: ["a", "b", "c"], device: "mac" });
    expect(r.done).toBe(2);
    expect(r.skipped).toBe(1);
    const u = await bulk.undo(r.batchId);
    expect(u).toMatchObject({ ok: true, undone: 2 });
    expect(f.calls).toContain("switch:b:haswell:codex");
    expect(f.calls).toContain("switch:a:local:codex");
  });

  test("Undo within ten seconds reopens what ended; after, it is too late", async () => {
    const f = fake([t("a", "blocked"), t("b", "blocked")]);
    const bulk = createBulk(f.port);
    const r1 = await bulk.run({ op: "end", taskIds: ["a"] });
    f.tick(BULK_UNDO_MS - 1);
    expect((await bulk.undo(r1.batchId)).ok).toBe(true);
    expect(f.calls).toContain("reopen:a");
    const r2 = await bulk.run({ op: "end", taskIds: ["b"] });
    f.tick(BULK_UNDO_MS + 1);
    expect((await bulk.undo(r2.batchId)).ok).toBe(false);
    expect(f.calls).not.toContain("reopen:b");
  });

  test("a Keep that owns an ended task stops with it, and Undo cancels the stop", async () => {
    const f = fake([t("a", "blocked"), t("b", "blocked")], { a: "kp_1", b: "kp_2" });
    const bulk = createBulk(f.port);
    const r = await bulk.run({ op: "end", taskIds: ["a"] });
    expect(r.keeps).toBe(1);
    await bulk.undo(r.batchId);
    await Bun.sleep(5);
    expect(f.calls).not.toContain("stopKeep:kp_1");
    const r2 = await bulk.run({ op: "end", taskIds: ["b"] });
    expect(r2.keeps).toBe(1);
    expect(f.logs.at(-1)!.keeps).toEqual(["kp_2"]);
  });

  test("a task whose path fails is counted as skipped; the rest still go", async () => {
    const f = fake([t("a", "blocked"), t("b", "blocked")]);
    f.port.drop = async (id) => {
      if (id === "a") throw new Error("no");
      f.calls.push(`drop:${id}`);
    };
    const r = await createBulk(f.port).run({ op: "drop", taskIds: ["a", "b"] });
    expect(r.done).toBe(1);
    expect(r.skipped).toBe(1);
  });
});

describe("views: kept on the home, views.json", () => {
  test("save, list, rename by id, remove: the file round-trips across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-views-"));
    try {
      const v = createViews({ dataDir: dir });
      const a = v.save({ id: "v1", name: "  CI 红了的 ", filter: { state: "waiting", project: "github.com/nowledge-co/mem", agent: "codex" }, sort: "changed", mode: "list" });
      expect(a.ok).toBe(true);
      v.save({ id: "v2", name: "haswell", filter: { computer: "haswell" }, sort: "age", mode: "list" });
      v.save({ id: "v1", name: "CI 红了", filter: { state: "waiting" }, sort: "urgency", mode: "list" });
      const again = createViews({ dataDir: dir });
      expect(again.list().map((x) => [x.id, x.name])).toEqual([["v1", "CI 红了"], ["v2", "haswell"]]);
      expect(again.list()[0]!.filter).toEqual({ state: "waiting" });
      expect(again.remove("v2").ok).toBe(true);
      expect(createViews({ dataDir: dir }).list()).toHaveLength(1);
      expect(JSON.parse(readFileSync(join(dir, "views.json"), "utf8")).version).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a bad field is dropped, a nameless view refused, a broken file starts empty", () => {
    expect(cleanView({ name: "", filter: {}, sort: "urgency", mode: "list" })).toBeUndefined();
    const v = cleanView({ id: "x", name: "a".repeat(80), filter: { state: "nope", long: true, extra: 1 } as never, sort: "weird" as never, mode: "grid" as never })!;
    expect(v.name.length).toBe(32);
    expect(v.filter).toEqual({ long: true });
    expect(v.sort).toBe("urgency");
    expect(v.mode).toBe("list");
    const dir = mkdtempSync(join(tmpdir(), "ducter-views-"));
    try {
      writeFileSync(join(dir, "views.json"), "{not json");
      expect(createViews({ dataDir: dir }).list()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bulk: a queued end outlives the undo window", () => {
  test("a working task's end lands at its turn's end even an hour later, and its Keep stops with it", async () => {
    const f = fake([t("w", "working"), t("x", "blocked")], { w: "kp_w" });
    const bulk = createBulk(f.port);
    const r = await bulk.run({ op: "end", taskIds: ["w"] });
    expect(r.pending).toBe(1);
    f.tick(60 * 60_000);
    expect((await bulk.undo(r.batchId)).ok).toBe(false);
    await bulk.run({ op: "pause", taskIds: ["x"] }); // a later batch's sweep keeps it
    await bulk.turnEnded("w");
    expect(f.calls).toContain("end:w");
    expect(f.calls).toContain("stopKeep:kp_w");
  });
});

describe("bulk and views through the real core", () => {
  test("Put down 3 (one already done) logs one task_bulk; views show on the board and in views.json", async () => {
    const { startCore } = await import("../src/core.ts");
    const { tempDir } = await import("./helpers.ts");
    const tmp = tempDir();
    const dataDir = join(tmp.dir, "data");
    const core = startCore({ dataDir, port: 0, push: false, batchMs: 5 });
    try {
      core.setPartner({ onTrigger: () => {} });
      const dropped: string[] = [];
      core.setRunner({ harness: { start: async () => Promise.reject(new Error("no")), available: async () => [] }, openTask: async () => Promise.reject(new Error("no")), send: async () => ({ delivered: "prompted" as const }), interrupt: async () => {}, drop: async (id: string) => void dropped.push(id) } as never);
      for (const [id, att] of [["a", "blocked"], ["b", "needs_you"], ["c", "done"]] as const) {
        core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: `Task ${id}`, project: "", place: { kind: "none" }, harness: "codex", brief: id } });
        core.tasks.setState(id, att, "warm");
      }
      const r = await core.bulk!({ op: "drop", taskIds: ["a", "b", "c"] });
      expect(r).toMatchObject({ total: 3, done: 2, skipped: 1 });
      expect(dropped.sort()).toEqual(["a", "b"]);
      const batches = core.log.read({ stream: "channel", kinds: ["task_bulk"], limit: 10 });
      expect(batches).toHaveLength(1);
      expect(batches[0]!.body).toMatchObject({ op: "drop", taskIds: ["a", "b", "c"], done: 2, skipped: 1 });
      const saved = core.viewSave!({ id: "v_ci", name: "PR 在等的 mem", filter: { pr: true, project: "github.com/nowledge-co/mem" }, sort: "changed", mode: "list" });
      expect(saved.ok).toBe(true);
      expect(core.views!().map((v) => v.name)).toEqual(["PR 在等的 mem"]);
      expect(JSON.parse(readFileSync(join(dataDir, "views.json"), "utf8")).views[0].id).toBe("v_ci");
    } finally {
      await core.stop();
      tmp.cleanup();
    }
  });
});
