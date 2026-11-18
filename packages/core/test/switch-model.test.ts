// D352: a model Codex added overnight is in the list without a Ducter release (the list is read
// again as soon as the agent's version changes), and "这个任务换成 6.2 sol" to the partner switches
// the task's model in place: matched to Codex's own list, the same session, from the next turn.
import { afterEach, expect, test } from "bun:test";
import type { ListedModel, Runner } from "@ducter/protocol/src/internal.ts";
import { createModelCatalog } from "../src/models.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const ALL = ["low", "medium", "high", "xhigh", "max", "ultra"];
/** Codex 0.169.1's own list (OAR listModels, 2026-11-18), trimmed. */
const CODEX_169: ListedModel[] = [
  { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: ALL, defaultEffort: "low", window: 500_000 },
  { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: ALL, defaultEffort: "low", window: 272_000 },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", efforts: ALL, defaultEffort: "low", default: true, window: 500_000 },
  { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: ALL, defaultEffort: "low", window: 500_000 },
  { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: ALL.slice(0, 5), defaultEffort: "medium", window: 272_000 },
];
const CODEX_167 = CODEX_169.slice(2);

test("the list is kept per agent version: an update to a build with new models is read again at once", async () => {
  let version = "0.167.0";
  let reads = 0;
  const cat = createModelCatalog({
    read: async () => (reads++, version === "0.167.0" ? CODEX_167 : CODEX_169),
    version: () => version,
    now: () => 0, // the TTL never runs out here: only the version moves
  });
  expect((await cat.get("local", "codex", 1000))?.map((m) => m.id)).not.toContain("gpt-6.2-sol");
  await cat.get("local", "codex", 1000);
  expect(reads).toBe(1);
  version = "0.169.1"; // `codex update` overnight
  expect((await cat.get("local", "codex", 1000))?.map((m) => m.id)).toContain("gpt-6.2-sol");
  expect(reads).toBe(2);
  await cat.get("local", "codex", 1000);
  expect(reads).toBe(2);
  // A version that can't be read (a worker that doesn't say) keeps the TTL rule.
  version = undefined as unknown as string;
  await cat.get("local", "codex", 1000);
  expect(reads).toBe(2);
});

/** A core with one Codex task on its default model, and a runner that records each switch. */
function boot(list: ListedModel[] | undefined, attention: "working" | "done" = "working") {
  const t = tempDir();
  const harnesses = async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: true },
  ];
  const models = createModelCatalog({ read: async (_d, h) => (h === "codex" ? list : undefined) });
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "laptop" }, models });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const switched: { taskId: string; harness: string; model?: string; effort?: string }[] = [];
  core.setRunner({
    harness: { start: async () => ({}) as any, available: async () => [] },
    openTask: async () => ({}) as any,
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
    async switchBody(taskId: string, harness: string, model?: string, effort?: string) {
      switched.push({ taskId, harness, ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
      return { ok: true };
    },
  } as unknown as Runner);
  core.log.append({ stream: "task:t1", origin: "system", kind: "task_open", body: { taskId: "t1", title: "准备 App Store Connect 的上架资料", project: "ducter", place: { kind: "none" }, harness: "codex", brief: "x" } });
  core.tasks.setState("t1", attention, attention === "working" ? "hot" : "parked");
  const call = async (args: object) => {
    const r = await core.mcp.call({ role: "partner" }, "task_switch", args);
    return (typeof r === "string" ? JSON.parse(r) : r) as { ok: boolean; error?: string; model?: string; label?: string; effort?: string; note?: string };
  };
  return { core, switched, call };
}

test("“这个任务换成 6.2 sol”: the same Codex, gpt-6.2-sol in place, from its next turn", async () => {
  const { core, switched, call } = boot(CODEX_169);
  const r = await call({ taskId: "t1", model: "6.2 sol" });
  expect(r).toMatchObject({ ok: true, model: "gpt-6.2-sol", label: "GPT-6.2-Sol", effort: "low" });
  expect(r.note).toContain("the turn it is in finishes as it was");
  expect(switched).toEqual([{ taskId: "t1", harness: "codex", model: "gpt-6.2-sol" }]);
  expect(core.tasks.get("t1")?.model).toBe("gpt-6.2-sol");
  // An effort the model offers, with it.
  expect(await call({ taskId: "t1", model: "6.2 astra", effort: "High" })).toMatchObject({ ok: true, model: "gpt-6.2-astra", effort: "high" });
  expect(switched.at(-1)).toEqual({ taskId: "t1", harness: "codex", model: "gpt-6.2-astra", effort: "high" });
});

test("what it can't match is said back, never guessed", async () => {
  const { switched, call } = boot(CODEX_169);
  expect((await call({ taskId: "t1", model: "sol" })).error).toContain("could be gpt-6.2-sol, gpt-6.1-sol");
  expect((await call({ taskId: "t1", model: "gpt-9" })).error).toContain("Codex has no model \"gpt-9\" here. It offers: gpt-6.2-sol");
  expect((await call({ taskId: "t1", model: "6 luna", effort: "ultra" })).error).toContain("GPT-6-Luna doesn't offer effort ultra");
  expect((await call({ taskId: "t1" })).error).toContain("Say which model");
  expect((await call({ taskId: "nope", model: "6.2 sol" })).error).toContain("can't find that task");
  expect(switched).toEqual([]);
});

test("Codex's list can't be read: the registry's ids still match; a finished task's next turn uses it", async () => {
  const { switched, call } = boot(undefined, "done");
  const r = await call({ taskId: "t1", model: "6.2 sol" });
  expect(r).toMatchObject({ ok: true, model: "gpt-6.2-sol" });
  expect(r.note).toContain("its next turn uses");
  expect(switched).toEqual([{ taskId: "t1", harness: "codex", model: "gpt-6.2-sol" }]);
});
