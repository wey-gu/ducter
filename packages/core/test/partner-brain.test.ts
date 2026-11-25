// D536: each partner can think with its own agent, model and effort. Absent, it follows the first
// partner's (Settings.brain, 默认用什么想事情). Its session, digests and holds run on its own; the
// person can set it in Settings or by saying it to any partner (brain_switch's partner).
import { afterEach, expect, test } from "bun:test";
import type { DeviceHarness, ServerFrame } from "@ducter/protocol";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { createBrainHold } from "../src/brain-hold.ts";
import { brainOf, brainOptions } from "../src/brain.ts";
import { startCore, type Core } from "../src/core.ts";
import { createModelCatalog } from "../src/models.ts";
import { cleanBrain, openPartners } from "../src/partners.ts";
import { renderPartners } from "../../partner/src/partner.ts";
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
const CLAUDE: ListedModel[] = [
  { id: "opus", label: "Opus", efforts: ["low", "medium", "high", "max"] },
  { id: "sonnet", label: "Sonnet", efforts: ["low", "medium", "high"] },
];
const both: DeviceHarness[] = [
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true },
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true },
];

function boot(): Core {
  const t = tempDir();
  const models = createModelCatalog({ read: async (_d, h) => (h === "codex" ? CODEX : h === "claude-code" ? CLAUDE : undefined) });
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, partners: true, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => both, kind: async () => "laptop" }, models });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.setPartnerFactory(() => ({ onTrigger: () => {} }));
  return core;
}

test("cleanBrain keeps an agent that may be the partner, a model and an effort as short ids; anything else is none", () => {
  expect(cleanBrain({ harness: "codex", model: "gpt-6.2-astra", effort: "high" })).toEqual({ harness: "codex", model: "gpt-6.2-astra", effort: "high" });
  expect(cleanBrain({ harness: "claude-code" })).toEqual({ harness: "claude-code" });
  expect(cleanBrain({ harness: "nope" })).toBeUndefined();
  expect(cleanBrain({ harness: "codex", model: "two words" })).toEqual({ harness: "codex" });
  expect(cleanBrain(null)).toBeUndefined();
  expect(brainOf(undefined, { harness: "codex" })).toEqual({ brain: { harness: "codex" }, own: false });
  expect(brainOf({ harness: "claude-code", model: "opus" }, { harness: "codex" })).toEqual({ brain: { harness: "claude-code", model: "opus" }, own: true });
});

test("a partner's own brain: kept in partners.json, null is the default's again, the default partner's is Settings'", () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = { read: () => [], append: () => ({}) } as never;
  const ps = openPartners({ dataDir: t.dir, log, persona: { id: "default", name: "Ducter" }, on: true });
  const r = ps.add({ name: "小玛", about: "GTM growth hacker" });
  expect(r.ok).toBe(true);
  const id = r.ok ? r.partner.id : "";
  expect(ps.get(id)?.brain).toBeUndefined();
  expect(ps.set(id, { brain: { harness: "claude-code", model: "opus", effort: "high" } }).ok).toBe(true);
  expect(ps.get(id)?.brain).toEqual({ harness: "claude-code", model: "opus", effort: "high" });
  // Kept across a restart.
  const again = openPartners({ dataDir: t.dir, log, persona: { id: "default", name: "Ducter" }, on: true });
  expect(again.get(id)?.brain).toEqual({ harness: "claude-code", model: "opus", effort: "high" });
  expect(again.set(id, { brain: { harness: "nope" } })).toEqual({ ok: false, error: "unknown" });
  expect(again.set("default", { brain: { harness: "codex" } })).toEqual({ ok: false, error: "unknown" });
  expect(again.set(id, { brain: null }).ok).toBe(true);
  expect(again.get(id)?.brain).toBeUndefined();
});

test("another partner's view thinks with its own; without one, the default's; brain_switch sets whose was said", async () => {
  const core = boot();
  for (let i = 0; i < 100 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  core.settings.set({ brain: { harness: "codex", model: "gpt-6.2-astra" } });
  const r = core.partners.add({ name: "小玛", about: "GTM growth hacker" });
  const id = r.ok ? r.partner.id : "";
  const view = core.partnerView(id);
  expect(view.settings!.get().brain).toEqual({ harness: "codex", model: "gpt-6.2-astra" });

  // Said to the default partner: 「小玛用 Opus」 sets 小玛's own; the default stays.
  const fromDefault = (await core.mcp.call({ role: "partner" }, "brain_switch", { partner: "小玛", harness: "claude-code", model: "opus" })) as any;
  expect(fromDefault).toMatchObject({ ok: true, partner: "小玛", harness: "claude-code", model: "opus" });
  expect(core.partners.get(id)?.brain).toEqual({ harness: "claude-code", model: "opus" });
  expect(core.settings.get().brain).toEqual({ harness: "codex", model: "gpt-6.2-astra" });
  expect(view.settings!.get().brain).toEqual({ harness: "claude-code", model: "opus" });
  // Its own was chosen: no D150 fallback for it.
  expect(view.partnerFallback?.()).toBeUndefined();

  // Said to 小玛 itself: "think harder" is its own effort, checked against the model's levels.
  const effort = (await core.mcp.call({ role: "partner", persona: id }, "brain_switch", { effort: "max" })) as any;
  expect(effort).toMatchObject({ ok: true, model: "opus", effort: "max" });
  expect(core.partners.get(id)?.brain).toEqual({ harness: "claude-code", model: "opus", effort: "max" });
  const bad = (await core.mcp.call({ role: "partner", persona: id }, "brain_switch", { model: "sonnet", effort: "max" })) as any;
  expect(bad.ok).toBe(false);
  expect(core.partners.get(id)?.brain?.effort).toBe("max");

  // The default's own switch is the default: the others without their own follow (said back).
  const b = core.partners.add({ name: "多比" });
  const dobby = b.ok ? b.partner.id : "";
  const def = (await core.mcp.call({ role: "partner" }, "brain_switch", { model: "gpt-6.2-sol" })) as any;
  expect(def).toMatchObject({ ok: true, model: "gpt-6.2-sol", alsoFor: ["多比"] });
  expect(core.partnerView(dobby).settings!.get().brain).toEqual({ harness: "codex", model: "gpt-6.2-sol" });

  // Back to the same as the first partner's.
  const same = (await core.mcp.call({ role: "partner" }, "brain_switch", { partner: "小玛", same: true })) as any;
  expect(same).toMatchObject({ ok: true, same: true });
  expect(core.partners.get(id)?.brain).toBeUndefined();
  expect((await core.mcp.call({ role: "partner" }, "brain_switch", { partner: "小新", model: "opus" })) as any).toMatchObject({ ok: false });
});

test("a hold is per agent: a partner on Claude Code sees Claude Code's hold, the default on Codex doesn't", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const events: unknown[] = [];
  const log = { read: () => [], head: () => 0, append: (e: unknown) => (events.push(e), e) } as never;
  const hold = createBrainHold({ log, base: () => "codex", home: () => both });
  stops.push(() => hold.stop());
  await hold.as(() => "claude-code").hit({ harness: "claude-code", failure: "quota", resetsAt: new Date(Date.now() + 3_600_000).toISOString() });
  expect(hold.now()).toBeUndefined();
  const mine = hold.as(() => "claude-code").now();
  expect(mine).toMatchObject({ from: "claude-code", why: "quota", to: "codex" });
  hold.ok("claude-code");
  expect(hold.as(() => "claude-code").now()).toBeUndefined();
});

test("brainOptions: every agent on the home that may be the partner, with its models and their efforts", () => {
  const opts = brainOptions(both, (h) => (h === "codex" ? CODEX : undefined));
  expect(opts.map((o) => o.harness)).toEqual(["claude-code", "codex"]);
  expect(opts[1]!.models[0]).toMatchObject({ id: "gpt-6.2-sol", efforts: ["low", "medium", "high"] });
  expect(opts[0]!.models.map((m) => m.id)).toEqual(["opus", "sonnet"]);
  expect(brainOptions([{ harness: "codex", installed: true, loggedIn: false, canBePartner: true }])).toEqual([]);
});

test("the settings frame carries brainOptions only with more than one partner", async () => {
  const core = boot();
  for (let i = 0; i < 100 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "settings" }));
  const settings = async (after: number) => {
    for (let i = 0; i < 300; i++) {
      const f = frames.slice(after).find((x) => x.t === "settings");
      if (f) return f as Extract<ServerFrame, { t: "settings" }>;
      await Bun.sleep(10);
    }
    throw new Error("no settings frame");
  };
  expect((await settings(0)).brainOptions).toBeUndefined();
  const at = frames.length;
  ws.send(JSON.stringify({ t: "partner_add", name: "小玛" }));
  const next = await settings(at);
  expect(next.brainOptions?.map((o) => o.harness)).toEqual(["claude-code", "codex"]);
  // Set from Settings: partner_set with brain; null goes back to the default's.
  const id = core.partners.list()[1]!.id;
  ws.send(JSON.stringify({ t: "partner_set", id, brain: { harness: "claude-code", model: "opus", effort: "high" } }));
  for (let i = 0; i < 100 && !core.partners.get(id)?.brain; i++) await Bun.sleep(10);
  expect(core.partners.get(id)?.brain).toEqual({ harness: "claude-code", model: "opus", effort: "high" });
  ws.send(JSON.stringify({ t: "partner_set", id, brain: null }));
  for (let i = 0; i < 100 && core.partners.get(id)?.brain; i++) await Bun.sleep(10);
  expect(core.partners.get(id)?.brain).toBeUndefined();
});

test("[partners] says what this partner thinks with and whose setting it is, and the others' own", () => {
  const list = [
    { id: "default", name: "Ducter", asks: 0 },
    { id: "p2", name: "小玛", about: "GTM growth hacker", asks: 0, brain: { harness: "claude-code", model: "opus", effort: "high" } },
    { id: "p3", name: "多比", asks: 0 },
  ];
  const mine = renderPartners({ me: "p2", list }, { harness: "claude-code", model: "opus", effort: "high" });
  expect(mine).toContain("You think with Claude Code opus (effort high) (your own setting).");
  const def = renderPartners({ me: "default", list }, { harness: "codex", model: "gpt-6.2-astra" });
  expect(def).toContain("You think with Codex gpt-6.2-astra (the default the others without their own follow).");
  expect(def).toContain("小玛 (looks after: \"GTM growth hacker\"), thinks with Claude Code opus (effort high)");
  const dobby = renderPartners({ me: "p3", list }, { harness: "codex", model: "gpt-6.2-astra" });
  expect(dobby).toContain("(the same as Ducter's)");
});

test("D571: [partners] says how the user talks to another one, the chat app's way when the words came from one", () => {
  const list = [
    { id: "default", name: "Ducter", asks: 0 },
    { id: "p4", name: "小玛", asks: 0 },
  ];
  const app = renderPartners({ me: "default", list });
  expect(app).toContain("a tap on it in their list of partners");
  expect(app).not.toContain("This message came from");
  const slack = renderPartners({ me: "default", list }, undefined, "slack");
  expect(slack).toContain('This message came from Slack: there the user talks to one by starting a message with its name ("小玛，…"');
  expect(slack).toContain("do=pass their words; it says hello right where they wrote, in this same chat or thread.");
});
