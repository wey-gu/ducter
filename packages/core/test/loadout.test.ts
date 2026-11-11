// Who does the tasks (D89): fw_candidates v0 (filters, rules, tier table, the partner's reserve),
// who a new task goes to and why, Your rules over the socket, switching a task, and the one
// "make it a rule?" after two switches the same way.
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeviceHarness, LogEvent, RuleView, ServerFrame, Settings } from "@ducter/protocol";
import { brainModelRows, chooseBody, fwCandidates } from "../src/candidates.ts";
import { startCore, triggersPartner, type Core } from "../src/core.ts";
import { openRules, ruleFor } from "../src/rules.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const cc = (left = 0.64, extra: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left, sharedBy: 2 }, ...extra });
const cx = (left = 0.48, extra: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left }, ...extra });
const pi: DeviceHarness = { harness: "pi", installed: true, loggedIn: false, canBePartner: false };
const ds: DeviceHarness = { harness: "deepseek-harness", installed: false, loggedIn: false, canBePartner: false };
const settings = (s: Partial<Pick<Settings, "brain" | "taskAccounts">> = {}): Pick<Settings, "brain" | "taskAccounts"> => ({ brain: { harness: "claude-code", model: "opus" }, ...s });
const rule = (harness: string, match: string[], text = `${match[0]} → ${harness}`): RuleView => ({ id: `r_${harness}_${match[0]}`, text, harness, match, createdAt: "2026-11-09T00:00:00Z" });

test("candidates: the strongest with the most limit first, then the others, then who can't with why", () => {
  const list = fwCandidates({ work: { title: "Fix CI in HawDB" }, harnesses: [cc(), cx(), pi, ds], settings: settings(), rules: [] });
  expect(list.map((c) => `${c.harness}:${c.model ?? ""}:${c.blocked ?? c.reason.kind}`)).toEqual([
    "claude-code:opus:fit",
    "codex::fit",
    "claude-code:sonnet:fast",
    // D177: DeepSeek Harness's rows carry DeepSeek's models; blocked, its strongest is named.
    "deepseek-harness:deepseek-official/deepseek-v4-pro:not_installed",
    "pi::no_model",
  ]);
  expect(list[0]!.left).toBe(0.64);
});

test("candidates: a rule puts its agent first and says which rule; the current one is marked first", () => {
  const r = rule("codex", ["backend", "后端"], "后端的事 → Codex");
  const list = fwCandidates({ work: { title: "后端 API 重构" }, harnesses: [cc(), cx()], settings: settings(), rules: [r], current: { harness: "claude-code", model: "sonnet" } });
  expect(list[0]).toMatchObject({ harness: "claude-code", model: "sonnet", current: true, reason: { kind: "current" } });
  expect(list[1]).toMatchObject({ harness: "codex", reason: { kind: "rule", ruleId: r.id, text: "后端的事 → Codex" } });
});

test("candidates: Use it for tasks off, and the partner's reserve, are hard filters", () => {
  const off = fwCandidates({ work: { title: "x" }, harnesses: [cc(), cx()], settings: settings({ taskAccounts: { codex: { enabled: false } } }), rules: [] });
  expect(off.find((c) => c.harness === "codex")!.blocked).toBe("off");
  const low = fwCandidates({ work: { title: "x" }, harnesses: [cc(0.05), cx()], settings: settings(), rules: [] });
  expect(low[0]!.harness).toBe("codex");
  expect(low.find((c) => c.harness === "claude-code")!.blocked).toBe("reserve");
  // The reserve is the brain's only: Codex at 5% still does tasks when Claude Code is the brain.
  const cxLow = fwCandidates({ work: { title: "x" }, harnesses: [cx(0.05)], settings: settings(), rules: [] });
  expect(cxLow[0]!.blocked).toBeUndefined();
});

test("choose: rule > default; a rule that can't be met moves with why, never silently", () => {
  const r = rule("codex", ["backend"]);
  expect(chooseBody({ work: { title: "Backend refactor" }, harnesses: [cc(), cx()], settings: settings(), rules: [r] })).toEqual({ harness: "codex", why: { kind: "rule", ruleId: r.id, text: r.text } });
  // The ranking's model goes with the pick, so the card says what runs.
  expect(chooseBody({ work: { title: "Write the README" }, harnesses: [cc(), cx()], settings: settings(), rules: [r] })).toEqual({ harness: "claude-code", model: "opus", why: { kind: "default" } });
  // A rule whose agent is switched off moves, and says the real reason (not "limit").
  const moved = chooseBody({ work: { title: "Backend refactor" }, harnesses: [cc(), cx()], settings: settings({ taskAccounts: { codex: { enabled: false } } }), rules: [r] });
  expect(moved).toEqual({ harness: "claude-code", model: "opus", why: { kind: "unavailable", from: "codex", blocked: "off", ruleId: r.id, text: r.text } });
  // Only the reserve left on the brain's account: the task goes elsewhere and says why.
  expect(chooseBody({ work: { title: "x" }, harnesses: [cc(0.08), cx()], settings: settings(), rules: [] })).toEqual({ harness: "codex", why: { kind: "limit", from: "claude-code" } });
  // A pin wins; nobody left: undefined (the caller says it in one line).
  expect(chooseBody({ work: { title: "Backend" }, harnesses: [cc(), cx()], settings: settings(), rules: [r], pinned: { harness: "claude-code", model: "sonnet" } })).toEqual({ harness: "claude-code", model: "sonnet", why: { kind: "partner" } });
  expect(chooseBody({ work: { title: "x" }, harnesses: [cc(0.02), pi], settings: settings(), rules: [] })).toBeUndefined();
});

test("choose: a blocked pin says the real reason; the person's own pick never moves silently", () => {
  const signedOut = cx(0.5, { loggedIn: false });
  // The partner's pin of a signed-out agent moves, with why "unavailable: signed_out", not "limit".
  expect(chooseBody({ work: { title: "x" }, harnesses: [cc(), signedOut], settings: settings(), rules: [], pinned: { harness: "codex" } })).toEqual({
    harness: "claude-code",
    model: "opus",
    why: { kind: "unavailable", from: "codex", blocked: "signed_out" },
  });
  // The reserve is still a limit.
  expect(chooseBody({ work: { title: "x" }, harnesses: [cc(0.05), cx()], settings: settings(), rules: [], pinned: { harness: "claude-code" } })).toEqual({ harness: "codex", why: { kind: "limit", from: "claude-code" } });
  // The person picked it (New task, --agent): a one-line problem, no move.
  for (const [h, extra, words] of [
    [cx(0.5, { loggedIn: false }), undefined, "isn't signed in"],
    [cx(), { taskAccounts: { codex: { enabled: false } } }, "Use it for tasks is off"],
    [cx(0.5, { installed: false }), undefined, "isn't installed"],
  ] as const) {
    const r = chooseBody({ work: { title: "x" }, harnesses: [cc(), h], settings: settings(extra ?? {}), rules: [], pinned: { harness: "codex" }, pinnedBy: "you" });
    expect(r).toEqual({ problem: expect.stringContaining(words) });
    expect((r as { problem: string }).problem).toStartWith("Codex can't take this task:");
  }
});

test("rules: whole Latin words, Chinese as written; the same kind of work said again replaces the old rule", () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const rules = openRules(t.dir);
  const a = rules.add({ text: "UI → Claude Code", harness: "claude-code", match: ["UI", "界面"] });
  expect(ruleFor(rules.list(), { title: "Fix the build" })).toBeUndefined();
  expect(ruleFor(rules.list(), { title: "Polish the UI" })?.id).toBe(a.id);
  expect(ruleFor(rules.list(), { title: "改一下设置界面" })?.id).toBe(a.id);
  rules.add({ text: "后端的事 → Codex", harness: "codex", match: ["backend", "后端"] });
  const b2 = rules.add({ text: "后端的事 → Claude Code", harness: "claude-code", match: ["后端"] });
  expect(rules.list().map((r) => r.text)).toEqual(["UI → Claude Code", "后端的事 → Claude Code"]);
  expect(existsSync(join(t.dir, "rules.json"))).toBe(true);
  expect(openRules(t.dir).list().map((r) => r.id)).toEqual([a.id, b2.id]);
  expect(() => rules.add({ text: "x", harness: "nope", match: ["x"] })).toThrow();
  expect(() => rules.add({ text: "x", harness: "codex", match: [] })).toThrow();
});

// ---------- over the socket ----------

let harnessesNow: DeviceHarness[] = [];
function boot(): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => harnessesNow, kind: async () => "laptop" } });
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

const openTask = (core: Core, id: string, title: string, harness = "codex") => {
  core.log.append({ stream: `task:${id}`, origin: "system", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "none" }, harness, brief: title } });
  core.log.append({ stream: `task:${id}`, origin: "system", kind: "body_selected", body: { taskId: id, harness, why: { kind: "default" } } });
  core.tasks.setState(id, "working", "hot");
};

test("socket: rules are listed and removed; a removal reaches every subscriber", async () => {
  harnessesNow = [cc(), cx()];
  const core = boot();
  const r = core.rules.add({ text: "后端的事 → Codex", harness: "codex", match: ["后端"] });
  const a = await client(core.url);
  const b = await client(core.url);
  a.send({ t: "rules" });
  b.send({ t: "rules" });
  type Rules = Extract<ServerFrame, { t: "rules" }>;
  expect((await a.until<Rules>((f) => f.t === "rules")).rules.map((x) => x.id)).toEqual([r.id]);
  await b.until((f) => f.t === "rules");
  const n = b.frames.length;
  a.send({ t: "rule_remove", id: r.id });
  expect((await b.until<Rules>((f) => f.t === "rules", n)).rules).toEqual([]);
});

// D150: a Codex-only home. The frame says what the partner really thinks with (Codex, picked by
// core), offers no Claude Code models, and a write of Claude Code is refused in plain words.
test("socket: a Codex-only home shows Codex, auto, and refuses Claude Code", async () => {
  harnessesNow = [cc(0.5, { installed: false, loggedIn: false, canBePartner: false }), cx()];
  const core = boot();
  for (let i = 0; i < 50 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  const c = await client(core.url);
  c.send({ t: "settings" });
  type S = Extract<ServerFrame, { t: "settings" }>;
  const s = await c.until<S>((f) => f.t === "settings");
  expect(s.brainNow).toMatchObject({ harness: "codex", auto: true, why: "only_codex" });
  expect(s.brainNow!.models.map((m) => m.id)).not.toContain("opus");
  c.send({ t: "settings_set", patch: { brain: { harness: "claude-code", model: "opus" } } });
  const err = await c.until<Extract<ServerFrame, { t: "error" }>>((f) => f.t === "error");
  expect(err.message).toContain("Claude Code isn't signed in");
  expect(core.settings.brainChosen()).toBe(false);
  expect(core.partnerFallback?.()).toEqual({ harness: "codex" });
});

// D177: a home with only a DeepSeek key works as it is: DeepSeek Harness, auto, said truthfully.
test("socket: a DeepSeek-only home thinks with DeepSeek Harness, auto", async () => {
  const dsIn: DeviceHarness = { harness: "deepseek-harness", installed: true, loggedIn: true, canBePartner: true, billing: "usage", models: [{ id: "deepseek-official/deepseek-flash", label: "DeepSeek-V4.1-Flash" }, { id: "deepseek-official/deepseek-v4-pro", label: "DeepSeek-V4-Pro" }] };
  harnessesNow = [cc(0.5, { installed: false, loggedIn: false, canBePartner: false }), { ...pi, loggedIn: true, canBePartner: true }, dsIn];
  const core = boot();
  for (let i = 0; i < 50 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  const c = await client(core.url);
  c.send({ t: "settings" });
  type S = Extract<ServerFrame, { t: "settings" }>;
  const s = await c.until<S>((f) => f.t === "settings");
  // DeepSeek Harness before pi (PARTNER_FALLBACK); a plan (Codex) would come before both.
  expect(s.brainNow).toMatchObject({ harness: "deepseek-harness", auto: true, why: "only_signed_in" });
  // The models in plain words, smartest and faster (never the provider/model id).
  expect(s.brainNow!.models).toEqual([
    { id: "deepseek-official/deepseek-flash", label: "Flash", kind: "fast" },
    { id: "deepseek-official/deepseek-v4-pro", label: "V4 Pro", kind: "smart" },
  ]);
  // Not listed by the home: the tier table's two, in the same words.
  expect(brainModelRows("deepseek-harness", undefined).map((m) => `${m.label}:${m.kind}`)).toEqual(["V4 Pro:smart", "Flash:fast"]);
  // pi: DeepSeek's only when pi lists them (its models follow its providers).
  expect(brainModelRows("pi", { harness: "pi", installed: true, loggedIn: true, canBePartner: true })).toEqual([]);
  expect(core.partnerFallback?.()).toEqual({ harness: "deepseek-harness" });
});

test("socket: brain must be signed in here and able to be the partner", async () => {
  harnessesNow = [cc(), pi];
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "settings_set", patch: { brain: { harness: "pi" } } });
  await c.until((f) => f.t === "error");
  expect(core.settings.get().brain.harness).toBe("claude-code");
  c.send({ t: "settings_set", patch: { brain: { harness: "claude-code", model: "sonnet" }, taskAccounts: { codex: { enabled: false } } } });
  type S = Extract<ServerFrame, { t: "settings" }>;
  const s = await c.until<S>((f) => f.t === "settings" && f.settings.brain.model === "sonnet");
  expect(s.settings.taskAccounts).toEqual({ codex: { enabled: false } });
});

test("socket: a new task says who and why; candidates list the top with reasons; a switch says 'you'", async () => {
  harnessesNow = [cc(), cx(), pi];
  const core = boot();
  const r = core.rules.add({ text: "后端的事 → Codex", harness: "codex", match: ["后端"] });
  const pick = await core.loadout.choose({ title: "后端 API 重构" });
  expect(pick).toEqual({ harness: "codex", why: { kind: "rule", ruleId: r.id, text: r.text } });
  openTask(core, "t1", "后端 API 重构");
  const c = await client(core.url);
  c.send({ t: "candidates", taskId: "t1" });
  type Cands = Extract<ServerFrame, { t: "candidates" }>;
  const cands = await c.until<Cands>((f) => f.t === "candidates");
  expect(cands.candidates.map((x) => x.harness + ":" + (x.model ?? "") + ":" + (x.current ? "now" : x.blocked ?? x.reason.kind))).toEqual([
    "codex::now",
    "claude-code:opus:fit",
    "claude-code:sonnet:fast",
    "pi::no_model",
  ]);
  c.send({ t: "task_switch", taskId: "t1", harness: "claude-code", model: "opus" });
  type Res = Extract<ServerFrame, { t: "action_result" }>;
  expect(await c.until<Res>((f) => f.t === "action_result")).toMatchObject({ action: "switch", ok: true });
  expect(core.tasks.get("t1")!.body).toEqual({ harness: "claude-code", model: "opus", why: { kind: "you", from: "codex" } });
  expect(core.tasks.get("t1")!.harness).toBe("claude-code");
  // Someone who can't take it: refused with why, nothing moved.
  c.send({ t: "task_switch", taskId: "t1", harness: "pi" });
  const no = await c.until<Res>((f) => f.t === "action_result" && !f.ok);
  expect(no.message).toContain("pi");
  expect(core.tasks.get("t1")!.harness).toBe("claude-code");
});

test("the second switch the same way wakes the partner once to offer a rule", async () => {
  harnessesNow = [cc(), cx()];
  const core = boot();
  const woke: LogEvent[] = [];
  core.log.subscribe((e) => triggersPartner(e) && woke.push(e));
  openTask(core, "t1", "Refactor the storage layer");
  openTask(core, "t2", "Refactor the query planner");
  openTask(core, "t3", "Refactor the WAL");
  expect((await core.loadout.switchTask("t1", "claude-code", undefined, undefined)).ok).toBe(true);
  expect(woke).toHaveLength(0);
  await core.loadout.switchTask("t2", "claude-code", undefined, undefined);
  expect(woke).toHaveLength(1);
  expect((woke[0]!.body as { text: string }).text).toContain("second time");
  expect((woke[0]!.body as { text: string }).text).toContain("Refactor the storage layer");
  await core.loadout.switchTask("t3", "claude-code", undefined, undefined);
  expect(woke).toHaveLength(1); // asked once
});

// A Codex-only server (D143): nothing chosen, Claude Code not signed in, Codex is: the partner
// thinks with Codex; once Claude Code signs in, or the user chooses, that wins.
test("partner fallback: Codex when it's the only one signed in and nothing was chosen", async () => {
  harnessesNow = [cc(0.5, { loggedIn: false }), cx()];
  const core = boot();
  for (let i = 0; i < 50 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  expect(core.partnerFallback?.()).toEqual({ harness: "codex" });
  harnessesNow = [cc(), cx()];
  core.devicesView.refresh();
  core.devicesView.harnessesNow();
  await Bun.sleep(30);
  expect(core.partnerFallback?.()).toBeUndefined();
  harnessesNow = [cc(0.5, { loggedIn: false }), cx()];
  core.devicesView.refresh();
  core.devicesView.harnessesNow();
  await Bun.sleep(30);
  core.settings.set({ brain: { harness: "claude-code", model: "sonnet" } });
  expect(core.partnerFallback?.()).toBeUndefined();
});

test("choose: one computer that can browse takes a browser task, a pinned one included (D191 trial)", async () => {
  // The New task card's browser place on a one-computer home: the ranking knows this computer browses.
  const t = tempDir();
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    deviceProbes: { cua: async () => ({ missing: "test" }), native: async () => "codex", harnesses: async () => [cc(), cx()], kind: async () => "laptop" },
  });
  stops.push(t.cleanup, () => core.stop());
  const place = { kind: "browser" as const, device: "local", profile: "default" };
  expect(await core.loadout.choose({ title: "Pay the test checkout", place, harness: "claude-code", model: "sonnet", by: "you" })).toMatchObject({ harness: "claude-code", model: "sonnet" });
  expect(await core.loadout.choose({ title: "Pay the test checkout", place })).toMatchObject({ harness: "claude-code" });
});
