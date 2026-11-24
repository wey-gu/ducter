// D390: the partner's models come from its agent's own live list on the home (the catalog the task
// composer reads), the tier table giving a known one its words; before any list, the tier rows.
import { afterEach, expect, test } from "bun:test";
import type { DeviceHarness, ServerFrame } from "@ducter/protocol";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { brainNow } from "../src/brain.ts";
import { startCore, type Core } from "../src/core.ts";
import { createModelCatalog, type ModelCatalog } from "../src/models.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const CODEX: ListedModel[] = [
  { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: ["low", "medium", "high"], defaultEffort: "low", default: true },
  { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: ["low", "medium", "high"], defaultEffort: "low" },
];
const cxOnly: DeviceHarness[] = [
  { harness: "claude-code", installed: false, loggedIn: false, canBePartner: false },
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true },
];

test("brainNow: a Codex home with its list read offers Sol and Astra, its default marked, no guessed kind", () => {
  const now = brainNow({ harness: "claude-code", model: "opus" }, false, cxOnly, (h) => (h === "codex" ? CODEX : undefined));
  expect(now).toMatchObject({ harness: "codex", auto: true, why: "only_codex" });
  // D536: each with its effort levels from the live list.
  expect(now.models).toEqual([
    { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", default: true, efforts: ["low", "medium", "high"], defaultEffort: "low" },
    { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: ["low", "medium", "high"], defaultEffort: "low" },
  ]);
  // Chosen Astra: still both, the setting's model named.
  const set = brainNow({ harness: "codex", model: "gpt-6.2-astra" }, true, cxOnly, () => CODEX);
  expect(set.model).toBe("gpt-6.2-astra");
  expect(set.models.map((m) => m.id)).toEqual(["gpt-6.2-sol", "gpt-6.2-astra"]);
});

test("brainNow: no list read yet keeps the tier rows (Codex: none, its own default; Claude Code: Opus, Sonnet)", () => {
  expect(brainNow({ harness: "codex" }, true, cxOnly, () => undefined).models).toEqual([]);
  expect(brainNow({ harness: "codex" }, true, cxOnly).models).toEqual([]);
  const cc: DeviceHarness[] = [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }];
  expect(brainNow({ harness: "claude-code", model: "opus" }, true, cc, () => []).models).toEqual([
    { id: "opus", label: "Opus", kind: "smart" },
    { id: "sonnet", label: "Sonnet", kind: "fast" },
  ]);
});

test("brainNow: Claude Code's live list keeps the tier table's kinds and leaves out its pinned versions and alias; the model in use stays past the row's eight", () => {
  const cc: DeviceHarness[] = [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }];
  const list: ListedModel[] = [
    { id: "default", label: "Default (recommended)" },
    { id: "opus", label: "Opus" },
    { id: "sonnet", label: "Sonnet" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
  ];
  expect(brainNow({ harness: "claude-code", model: "sonnet" }, true, cc, () => list).models).toEqual([
    { id: "opus", label: "Opus", kind: "smart" },
    { id: "sonnet", label: "Sonnet", kind: "fast" },
  ]);
  const many: ListedModel[] = Array.from({ length: 10 }, (_, i) => ({ id: `gpt-test-${i}`, label: `Test ${i}` }));
  const rows = brainNow({ harness: "codex", model: "gpt-test-9" }, true, cxOnly, () => many).models;
  expect(rows).toHaveLength(8);
  expect(rows.at(-1)!.id).toBe("gpt-test-9");
});

test("catalog: peek answers at once from the last read, whatever its age, and never reads", async () => {
  let reads = 0;
  let t = 0;
  const cat = createModelCatalog({ read: async () => (reads++, CODEX), now: () => t, ttlMs: 10 });
  expect(cat.peek!("local", "codex")).toBeUndefined();
  expect(reads).toBe(0);
  await cat.get("local", "codex", 100);
  t = 1_000;
  expect(cat.peek!("", "codex")).toBe(CODEX);
  expect(reads).toBe(1);
});

// ---------- over the socket ----------

function boot(models: ModelCatalog): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => cxOnly, kind: async () => "laptop" }, models });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function client(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

type S = Extract<ServerFrame, { t: "settings" }>;

test("socket: Settings first shows the tier rows, then Codex's list once read, pushed in a fresh frame; Astra chosen is kept", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let reads = 0;
  const cat = createModelCatalog({ read: async (device, harness) => (reads++, await gate, device === "local" && harness === "codex" ? CODEX : undefined) });
  const core = boot(cat);
  for (let i = 0; i < 50 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  const c = await client(core.url);
  c.send({ t: "settings" });
  const first = await c.until<S>((f) => f.t === "settings" && f.brainNow?.harness === "codex");
  expect(first.brainNow!.models).toEqual([]);
  const n = c.frames.length;
  release();
  const next = await c.until<S>((f) => f.t === "settings" && !!f.brainNow?.models.length, n);
  expect(next.brainNow!.models.map((m) => `${m.label}${m.default ? "*" : ""}`)).toEqual(["GPT-6.2-Sol*", "GPT-6.2-Astra"]);
  c.send({ t: "settings_set", patch: { brain: { harness: "codex", model: "gpt-6.2-astra" } } });
  const chosen = await c.until<S>((f) => f.t === "settings" && f.settings.brain.model === "gpt-6.2-astra");
  expect(chosen.brainNow).toMatchObject({ harness: "codex", model: "gpt-6.2-astra", auto: false });
  expect(chosen.brainNow!.models.map((m) => m.id)).toEqual(["gpt-6.2-sol", "gpt-6.2-astra"]);
  // The partner's next session starts on it (partnerFallback steps aside once the person chose).
  expect(core.partnerFallback?.()).toBeUndefined();
  expect(core.settings.get().brain).toEqual({ harness: "codex", model: "gpt-6.2-astra" });
  // A fresh list answers from the catalog: no read per frame, and no frame pushed for the same list.
  await Bun.sleep(50);
  expect(reads).toBe(1);
});

test("brain_switch: 用 astra 跟我聊 matches Codex's own list, asks which when two fit, and sets what the partner thinks with", async () => {
  const listed: ListedModel[] = [...CODEX, { id: "gpt-6-astra", label: "GPT-6-Astra" }];
  const core = boot(createModelCatalog({ read: async () => listed }));
  for (let i = 0; i < 50 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  const call = (args: object) => core.mcp.call({ role: "partner" }, "brain_switch", args) as Promise<any>;
  const two = await call({ model: "astra" });
  expect(two.ok).toBe(false);
  expect(two.error).toContain("gpt-6.2-astra, gpt-6-astra");
  expect(core.settings.brainChosen()).toBe(false);
  const r = await call({ model: "6.2 astra" });
  expect(r).toMatchObject({ ok: true, harness: "codex", model: "gpt-6.2-astra", label: "GPT-6.2-Astra" });
  expect(core.settings.get().brain).toEqual({ harness: "codex", model: "gpt-6.2-astra" });
  expect(core.partnerFallback?.()).toBeUndefined();
  expect((await call({ model: "gpt-6.2-astra" })).already).toBe(true);
  // Claude Code isn't signed in on this home: said in one line, nothing changed.
  const cc = await call({ harness: "claude-code", model: "opus" });
  expect(cc.ok).toBe(false);
  expect(cc.error).toContain("isn't signed in");
  expect((await call({ model: "gpt-nope" })).error).toContain("has no model");
  expect(core.settings.get().brain.model).toBe("gpt-6.2-astra");
});
