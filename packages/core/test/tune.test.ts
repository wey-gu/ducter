// D202 (design/new-task.md "Model and effort"): New task's Who lists every agent on every computer;
// each agent's models come from its own live list (the home's and a worker's), Ducter's suggestion
// tagged; an effort is kept only when the chosen model on its computer offers it.
import { afterEach, expect, test } from "bun:test";
import type { ServerFrame, TaskCard } from "@ducter/protocol";
import type { ListedModel, Runner } from "@ducter/protocol/src/internal.ts";
import { normalizeRemote } from "@ducter/protocol/src/folder-info.ts";
import { fwCandidates, type Computer } from "../src/candidates.ts";
import { agentModels, checkEffort, createModelCatalog, shortModels, type ModelCatalog } from "../src/models.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const ALL = ["low", "medium", "high", "xhigh", "max"];
/** Claude Code 2.1.322's list, as OAR listModels gave it (trimmed). */
const CLAUDE: ListedModel[] = [
  { id: "default", label: "Default (recommended)", efforts: ALL },
  { id: "opus", label: "Opus 5.5", efforts: ALL },
  { id: "fable", label: "Fable 5.2", efforts: ALL },
  { id: "sonnet", label: "Sonnet 5.5", efforts: ALL },
  { id: "haiku", label: "Haiku 5.5", efforts: ALL },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  { id: "claude-opus-4-6", label: "Opus 4.6", efforts: ["low", "medium", "high", "max"] },
];
/** Codex 0.167.1's list (trimmed). */
const CODEX: ListedModel[] = [
  { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: [...ALL, "ultra"], defaultEffort: "low" },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", efforts: [...ALL, "ultra"], defaultEffort: "low", default: true },
  { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: ALL, defaultEffort: "medium" },
];

const h = (harness: string, installed = true) => ({ harness, installed, loggedIn: installed, canBePartner: true });
const settings = { brain: { harness: "claude-code" }, taskAccounts: {} } as any;
// The author's setup: the home is the server hel with Codex only; the Mac is its worker with Claude Code.
const hel: Computer = { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [h("codex"), h("claude-code", false)] };
const mac: Computer = { id: "dev_mac", name: "Macbook Pro M3", home: false, state: "awake", alwaysOn: false, mac: true, harnesses: [h("claude-code"), h("codex")] };

test("a folder on hel: Claude Code on the Mac is still listed, on Macbook Pro M3, ranked by the tier table", () => {
  const list = fwCandidates({ work: { title: "" }, computers: [hel, mac], place: { kind: "repo", device: "local", repoPath: "/root/ducter" }, settings, rules: [], every: true });
  expect(list[0]).toMatchObject({ harness: "codex", device: "local" });
  const claude = list.find((c) => c.harness === "claude-code" && c.device === "dev_mac");
  expect(claude).toMatchObject({ model: "opus", blocked: "elsewhere", deviceName: "Macbook Pro M3" });
  expect(list.find((c) => c.harness === "claude-code" && c.device === "local")).toMatchObject({ blocked: "not_installed" });
  // Without every (the switch sheet), the old caps hold.
  expect(fwCandidates({ work: { title: "" }, computers: [hel, mac], place: { kind: "repo", device: "local", repoPath: "/root/ducter" }, settings, rules: [] }).length).toBeLessThanOrEqual(15);
});

test("one agent's row: its own named models, the suggestion tagged, each with its levels and default", () => {
  expect(shortModels("claude-code", CLAUDE).map((m) => m.id)).toEqual(["opus", "fable", "sonnet", "haiku"]);
  const cc = agentModels("claude-code", "dev_mac", "opus", CLAUDE);
  expect(cc).toMatchObject({ harness: "claude-code", device: "dev_mac", from: "live" });
  expect(cc.models[0]).toEqual({ id: "opus", label: "Opus 5.5", suggested: true, efforts: ALL });
  expect(cc.models.filter((m) => m.suggested)).toHaveLength(1);
  // Codex runs its own default when no model is named: that is the suggestion, with its default effort.
  const cx = agentModels("codex", undefined, undefined, CODEX);
  expect(cx.models.find((m) => m.suggested)).toMatchObject({ id: "gpt-6.1-terra", default: true, defaultEffort: "low" });
  // The list couldn't be read: the tier table, no effort levels.
  const tiers = agentModels("claude-code", undefined, "opus", undefined);
  expect(tiers).toMatchObject({ from: "tiers" });
  expect(tiers.models.map((m) => [m.id, !!m.suggested, m.efforts])).toEqual([
    ["opus", true, undefined],
    ["sonnet", false, undefined],
  ]);
});

test("an effort is kept only when the model offers it", () => {
  expect(checkEffort("claude-code", "sonnet", "xhigh", CLAUDE)).toEqual({ ok: true });
  expect(checkEffort("claude-code", "claude-opus-4-6", "xhigh", CLAUDE)).toMatchObject({ ok: false, why: expect.stringContaining("Opus 4.6 doesn't offer effort xhigh") });
  expect(checkEffort("claude-code", "claude-haiku-4-5-20251001", "low", CLAUDE)).toMatchObject({ ok: false, why: expect.stringContaining("it takes none") });
  expect(checkEffort("claude-code", "opus", "ultra", CLAUDE)).toMatchObject({ ok: false });
  // No model named: the agent's own default model (Codex's, Claude Code's "default" alias).
  expect(checkEffort("codex", undefined, "ultra", CODEX)).toEqual({ ok: true });
  expect(checkEffort("claude-code", undefined, "max", CLAUDE)).toEqual({ ok: true });
  expect(checkEffort("pi", "x", "high", undefined)).toMatchObject({ ok: false });
  // The list couldn't be read: not sent (levels differ per model).
  expect(checkEffort("claude-code", "opus", "high", undefined)).toMatchObject({ ok: false, why: expect.stringContaining("couldn't read") });
});

test("the catalog keeps a list a while, never waits past its wait, and a later card gets what came late", async () => {
  let reads = 0;
  let slow = false;
  let now = 0;
  const cat = createModelCatalog({
    read: async () => {
      reads++;
      if (slow) await Bun.sleep(200);
      return CODEX;
    },
    now: () => now,
  });
  expect(await cat.get("local", "codex", 1000)).toBe(CODEX);
  expect(await cat.get("local", "codex", 1000)).toBe(CODEX);
  expect(reads).toBe(1);
  now = 11 * 60_000;
  slow = true;
  const t0 = Date.now();
  // Stale: the old list now (the wait ran out), the fresh one when it lands.
  expect(await cat.get("local", "codex", 20)).toBe(CODEX);
  expect(Date.now() - t0).toBeLessThan(150);
  expect(await cat.get("dev_mac", "codex", 10)).toBeUndefined();
  await Bun.sleep(250);
  expect(await cat.get("dev_mac", "codex", 10)).toBe(CODEX);
});

test("a repo's origin in one form across computers", () => {
  expect(normalizeRemote("git@github.com:Wey-Gu/Ducter.git")).toBe("github.com/wey-gu/ducter");
  expect(normalizeRemote("https://token@github.com/wey-gu/ducter.git/")).toBe("github.com/wey-gu/ducter");
  expect(normalizeRemote("ssh://git@github.com:22/wey-gu/ducter")).toBe("github.com/wey-gu/ducter");
});

/** A core with Claude Code and Codex signed in here, their lists from the catalog seam, and a runner that remembers what it was asked. */
function boot(models: ModelCatalog) {
  const t = tempDir();
  const harnesses = async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: true },
  ];
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "laptop" }, models });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  let n = 0;
  core.setRunner({
    harness: { start: async () => ({}) as any, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      opened.push(input);
      const taskId = `t${++n}`;
      const pick = await core.bodies!.choose({ title: input.title, harness: input.harness, model: input.model, effort: input.effort, by: "you" });
      const p = pick && !("none" in pick) ? pick : undefined;
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: "", place: input.place ?? { kind: "none" }, harness: p?.harness ?? "codex", ...(p?.model ? { model: p.model } : {}), ...(p?.effort ? { effort: p.effort } : {}), brief: input.brief, origin: "you" } });
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: p?.harness ?? "codex", ...(p?.model ? { model: p.model } : {}), ...(p?.effort ? { effort: p.effort } : {}), why: { kind: "you" } } });
      if (p?.effortDropped) (opened.at(-1) as any).dropped = p.effortDropped;
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return { core, opened };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 4000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until };
}

test("task_new_options carries each agent's models; task_new's effort round-trips to the task, checked against the model", async () => {
  const asked: string[] = [];
  const catalog = createModelCatalog({ read: async (device, harness) => (asked.push(`${device} ${harness}`), harness === "claude-code" ? CLAUDE : harness === "codex" ? CODEX : undefined) });
  const { core, opened } = boot(catalog);
  const c = await client(core);
  c.send({ t: "task_new_options" });
  const o = await c.until<Extract<ServerFrame, { t: "task_new_options" }>>((f) => f.t === "task_new_options");
  const cc = o.models?.find((m) => m.harness === "claude-code");
  expect(cc).toMatchObject({ from: "live" });
  expect(cc!.models.map((m) => m.id)).toEqual(["opus", "fable", "sonnet", "haiku"]);
  expect(cc!.models.find((m) => m.suggested)?.id).toBe("opus");
  expect(o.models?.find((m) => m.harness === "codex")?.models.find((m) => m.suggested)?.id).toBe("gpt-6.1-terra");
  expect(asked.sort()).toEqual(["local claude-code", "local codex"]);

  c.send({ t: "task_new", words: "Think hard about the cache.", harness: "claude-code", model: "sonnet", effort: "high", clientId: "e1" });
  const r = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result" && f.clientId === "e1");
  expect(opened[0]).toMatchObject({ harness: "claude-code", model: "sonnet", effort: "high" });
  expect(r.card).toMatchObject({ harness: "claude-code", model: "sonnet", effort: "high", body: { effort: "high" } });

  // Haiku 4.5 takes no effort: dropped, with why.
  c.send({ t: "task_new", words: "Quick one.", harness: "claude-code", model: "claude-haiku-4-5-20251001", effort: "low", clientId: "e2" });
  const r2 = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result" && f.clientId === "e2");
  expect(r2.card?.effort).toBeUndefined();
  expect((opened[1] as any).dropped).toContain("Haiku 4.5 doesn't offer effort low");
});
