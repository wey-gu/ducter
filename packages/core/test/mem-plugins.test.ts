// D169: Nowledge Mem in the user's agents, per computer. The check is Mem's own local one
// (fixtures from a real Mac and a fresh worker); a worker answers through its op. One card per
// computer and agent, ever, Go 装上 recommended but never applied by itself; 装上 is a task there;
// memory off: nothing shown, nothing offered, nothing installed.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, DeviceHarness, LogEvent, MemPluginView, TaskCard } from "@ducter/protocol";
import { memPluginsFromInspect } from "@ducter/protocol/src/mem-plugins.ts";
import { createMemPlugins, memSetupBrief } from "../src/mem-plugins.ts";

const fx = (n: string) => memPluginsFromInspect(JSON.parse(readFileSync(join(import.meta.dir, "../../protocol/fixtures/mem-inspect", n), "utf8")), "2026-11-10T08:00:00.000Z");

function fakeLog() {
  const events: LogEvent[] = [];
  const fns = new Set<(e: LogEvent) => void>();
  return {
    events,
    append(e: any) {
      const ev = { seq: events.length + 1, ts: new Date().toISOString(), persona: "p", ...e } as LogEvent;
      events.push(ev);
      for (const f of fns) f(ev);
      return ev;
    },
    read: (q: { kinds?: string[] }) => events.filter((e) => !q.kinds || q.kinds.includes(e.kind)),
    subscribe: (f: (e: LogEvent) => void) => (fns.add(f), () => fns.delete(f)),
    head: () => events.length,
    search: () => [],
  };
}

type Dev = { id: string; name: string; home: boolean; awake: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean }[] };
const signed = (...hs: string[]) => hs.map((harness) => ({ harness, installed: true, loggedIn: true }));

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "ducter-memplug-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(o: { on?: boolean; worker?: Record<string, MemPluginView> | "old"; devs?: Dev[]; t0?: number; catalog?: () => Promise<Record<string, string> | undefined> } = {}) {
  const log = fakeLog();
  let t = o.t0 ?? 1_000_000;
  let on = o.on ?? true;
  const devs: Dev[] = o.devs ?? [{ id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code", "codex") }];
  const opened: any[] = [];
  const calls: string[] = [];
  const mp = createMemPlugins({
    dataDir: dir,
    log: log as any,
    tasks: { get: () => undefined, list: () => [] } as any,
    persona: { id: "p" },
    runner: () => ({ openTask: async (i: any) => (opened.push(i), { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
    on: () => on,
    lang: () => "zh",
    inspectLocal: async () => (calls.push("local"), fx("mac-2026-11-10.json")),
    inspectWorker: async (id) => {
      calls.push(id);
      if (o.worker === "old") throw new Error("unknown op mem_plugins");
      return o.worker ?? fx("worker-fresh.json");
    },
    devices: async () => devs,
    ...(o.catalog ? { checkUpdates: async () => (calls.push("catalog"), o.catalog!()) } : {}),
    now: () => t,
    everyMs: 0,
  });
  const decisions = () => log.events.filter((e) => e.kind === "decision").map((e) => e.body as Bodies["decision"]);
  return { log, mp, devs, opened, calls, decisions, later: (ms: number) => (t += ms), setOn: (v: boolean) => (on = v) };
}

const agents = (...hs: string[]): DeviceHarness[] => hs.map((harness) => ({ harness, installed: true, loggedIn: true, canBePartner: false }));

test("the home's line per agent, from Mem's own check; memory off shows nothing", async () => {
  const s = setup();
  await s.mp.check();
  const v = s.mp.view("local", agents("claude-code", "codex"));
  expect(v[0]!.mem).toEqual({ state: "installed", version: "0.7.34", checkedAt: "2026-11-10T08:00:00.000Z" });
  expect(v[1]!.mem).toMatchObject({ state: "review", why: "multiple" });
  // Not installed agents carry no line.
  expect(s.mp.view("local", [{ harness: "pi", installed: false, loggedIn: false, canBePartner: false }])[0]!.mem).toBeUndefined();
  s.setOn(false);
  expect(s.mp.view("local", agents("claude-code"))[0]!.mem).toBeUndefined();
  await s.mp.check();
  expect(s.calls).toEqual(["local"]); // off: not even checked
});

test("a worker answers through its op; an older one says nothing, and its card shows no line", async () => {
  const devs: Dev[] = [{ id: "w1", name: "mini", home: false, awake: true, harnesses: signed("codex") }];
  const s = setup({ devs, worker: "old" });
  await s.mp.check("w1");
  expect(s.calls).toEqual(["w1"]);
  expect(s.mp.view("w1", agents("codex"))[0]!.mem).toBeUndefined();
});

test("every signed-in agent without it gets one card, Go 装上 recommended and waiting for the tap; once ever", async () => {
  const devs: Dev[] = [{ id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") }];
  const s = setup({ devs });
  await s.mp.check(); // Claude Code has it on hel (the Mac fixture): no card
  expect(s.decisions()).toHaveLength(0);
  devs.push({ id: "w1", name: "mini", home: false, awake: true, harnesses: signed("claude-code", "codex") });
  await s.mp.check("w1");
  const d = s.decisions();
  expect(d.map((x) => x.memPlugin)).toEqual([
    { device: "w1", deviceName: "mini", harness: "claude-code" },
    { device: "w1", deviceName: "mini", harness: "codex" },
  ]);
  expect(d[0]).toMatchObject({ goLabel: "安装", defaultOption: "go", reversible: true });
  expect(d[0]!.defaultAt).toBeUndefined(); // never applied by itself: it changes the agent's own settings
  expect(d[0]!.question).toBe("mini 上的 Claude Code 还没装 Nowledge Mem。装上以后，我在那儿做事和你自己用 Claude Code 时都记得你；会改 Claude Code 自己的设置。");
  // Checked again (a day later, after a restart): never again.
  await s.mp.check("w1");
  const again = setup({ devs, t0: 1_000_000 + 2 * 60 * 60 * 1000 });
  await again.mp.check();
  expect(s.decisions()).toHaveLength(2);
  expect(again.decisions()).toHaveLength(0);
});

test("present(): what a task there has, in any form but absent, by id or name; memory off: never (research/48 M1)", async () => {
  const devs: Dev[] = [
    { id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") },
    { id: "w1", name: "mini", home: false, awake: true, harnesses: signed("claude-code") },
  ];
  const s = setup({ devs });
  await s.mp.check();
  expect(s.mp.present(undefined, "claude-code")).toBe(true);
  // A review (the author's Codex: two registrations) still loads the plugin's bundle: present, so no Ducter recall on top.
  expect(s.mp.present("local", "codex")).toBe(true);
  expect(s.mp.present("local", "deepseek-harness")).toBe(true); // a review too (a DSH profile bundle)
  expect(s.mp.present("local", "pi")).toBe(false); // absent: Ducter's recall stands in
  expect(s.mp.present("mini", "claude-code")).toBe(false); // the fresh worker
  expect(s.mp.present("w1", "claude-code")).toBe(false);
  s.setOn(false);
  expect(s.mp.present(undefined, "claude-code")).toBe(false);
});

test("an agent signed in later on a known computer gets its one card; memory off: none", async () => {
  const devs: Dev[] = [{ id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") }];
  const s = setup({ devs });
  await s.mp.check();
  devs[0]!.harnesses.push({ harness: "pi", installed: true, loggedIn: true });
  await s.mp.check();
  expect(s.decisions().map((d) => d.memPlugin?.harness)).toEqual(["pi"]); // pi is absent in the Mac fixture
  devs[0]!.harnesses.push({ harness: "codex", installed: true, loggedIn: true });
  await s.mp.check();
  expect(s.decisions()).toHaveLength(1); // codex there is a review, not absent: no card
  s.setOn(false);
  devs[0]!.harnesses.push({ harness: "deepseek-harness", installed: true, loggedIn: true });
  await s.mp.check();
  expect(s.decisions()).toHaveLength(1);
});

test("装上 opens one task there with that agent and Mem's own guide; the check runs again when it ends", async () => {
  const devs: Dev[] = [
    { id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") },
    { id: "w1", name: "mini", home: false, awake: true, harnesses: signed("codex") },
  ];
  const s = setup({ devs });
  const r = await s.mp.install("w1", "codex");
  expect(r).toEqual({ ok: true, taskId: "tsk1" });
  expect(s.opened[0]).toMatchObject({ harness: "codex", place: { kind: "none", device: "w1" }, origin: "you", language: "zh", title: "为 mini 上的 Codex 安装 Nowledge Mem" });
  expect(s.opened[0].brief).toContain("https://mem.nowledge.co/SKILL.md");
  expect(s.opened[0].brief).toContain('nmem --json plugins inspect --host codex-cli');
  // Twice (D552): the same task while the first is open, never a second one; the card says a task is on it.
  expect(await s.mp.install("w1", "codex")).toEqual({ ok: true, taskId: "tsk1" });
  expect(s.opened).toHaveLength(1);
  await s.mp.check("w1");
  expect(s.mp.view("w1", agents("codex"))[0]!.mem?.taskId).toBe("tsk1");
  s.calls.length = 0;
  s.log.append({ stream: "task:tsk1", origin: "system", kind: "task_state", body: { taskId: "tsk1", attention: "done_claimed", residency: "hot" } });
  await new Promise((r) => setTimeout(r, 5));
  expect(s.calls).toEqual(["w1"]);
  expect(s.mp.view("w1", agents("codex"))[0]!.mem?.taskId).toBeUndefined();
});

// D466: a newer plugin, from Mem's own `plugins check` on the home, laid over every computer's inspect.
test("D466: a newer version out turns installed into an update from to, on every computer; asked once a day; kept across a restart", async () => {
  const devs: Dev[] = [
    { id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code", "codex") },
    { id: "w1", name: "mini", home: false, awake: true, harnesses: signed("claude-code") },
  ];
  let answer: Record<string, string> | undefined = { "claude-code": "0.7.37" };
  const s = setup({ devs, worker: { "claude-code": { state: "installed", version: "0.7.36" } }, catalog: async () => answer });
  await s.mp.check();
  expect(s.mp.view("local", agents("claude-code"))[0]!.mem).toMatchObject({ state: "update", version: "0.7.34", available: "0.7.37" });
  expect(s.mp.view("w1", agents("claude-code"))[0]!.mem).toMatchObject({ state: "update", version: "0.7.36", available: "0.7.37" });
  // Codex's several copies stay a review with their versions; the check doesn't list Codex.
  expect(s.mp.view("local", agents("codex"))[0]!.mem).toMatchObject({ state: "review", why: "multiple", versions: ["0.1.10", "0.1.49"] });
  // An update still counts as the plugin there (a task there gets its own context, D168).
  expect(s.mp.present(undefined, "claude-code")).toBe(true);
  expect(s.calls.filter((c) => c === "catalog")).toHaveLength(1);
  // Asked again only once it is a day old.
  await s.mp.check();
  expect(s.calls.filter((c) => c === "catalog")).toHaveLength(1);
  s.later(21 * 60 * 60 * 1000);
  answer = { "claude-code": "0.7.40" };
  await s.mp.check();
  expect(s.calls.filter((c) => c === "catalog")).toHaveLength(2);
  expect(s.mp.view("local", agents("claude-code"))[0]!.mem?.available).toBe("0.7.40");
  // A restarted home knows it before its first ask.
  const saved = JSON.parse(readFileSync(join(dir, "mem-plugins.json"), "utf8"));
  expect(saved.catalog.versions).toEqual({ "claude-code": "0.7.40" });
});

test("D466: offline or unreadable says nothing: no update without an answer, the last good answer stands", async () => {
  let answer: Record<string, string> | undefined;
  const s = setup({ catalog: async () => answer });
  await s.mp.check();
  expect(s.mp.view("local", agents("claude-code"))[0]!.mem).toMatchObject({ state: "installed", version: "0.7.34" });
  // Failing again and again is asked each check (nothing kept), never shown.
  await s.mp.check();
  expect(s.calls.filter((c) => c === "catalog")).toHaveLength(2);
  answer = { "claude-code": "0.7.37" };
  await s.mp.check();
  expect(s.mp.view("local", agents("claude-code"))[0]!.mem?.state).toBe("update");
  // Offline after a good answer: it stands.
  s.later(21 * 60 * 60 * 1000);
  answer = undefined;
  await s.mp.check();
  expect(s.mp.view("local", agents("claude-code"))[0]!.mem).toMatchObject({ state: "update", available: "0.7.37" });
  // A throw is offline too (a home that never had an answer).
  rmSync(join(dir, "mem-plugins.json"));
  const t = setup({ catalog: async () => Promise.reject(new Error("timeout")) });
  await t.mp.check();
  expect(t.mp.view("local", agents("claude-code"))[0]!.mem?.state).toBe("installed");
});

test("D466: 更新 opens a task that updates by Mem's own guide, from to; 理成一份 one that leaves one copy; both by the tap only", async () => {
  const s = setup({ catalog: async () => ({ "claude-code": "0.7.37" }) });
  await s.mp.check();
  // Nothing runs by itself: no card for an update, no task.
  expect(s.decisions()).toHaveLength(0);
  expect(s.opened).toHaveLength(0);
  expect(await s.mp.install("local", "claude-code")).toEqual({ ok: true, taskId: "tsk1" });
  expect(s.opened[0]).toMatchObject({ harness: "claude-code", origin: "you", title: "为 hel 上的 Claude Code 更新 Nowledge Mem" });
  expect(s.opened[0].brief).toContain("from 0.7.34 to 0.7.37");
  expect(s.opened[0].brief).toContain("The user tapped Update");
  expect(s.opened[0].brief).toContain("https://mem.nowledge.co/SKILL.md");
  expect(await s.mp.install("local", "codex")).toEqual({ ok: true, taskId: "tsk2" });
  expect(s.opened[1]).toMatchObject({ harness: "codex", title: "把 hel 上 Codex 里的 Nowledge Mem 理成一份" });
  expect(s.opened[1].brief).toContain("versions 0.1.10, 0.1.49");
  expect(s.opened[1].brief).toContain("never delete its files by hand");
});

test("装上 refuses honestly: off, unknown, away, nobody signed in there", async () => {
  const devs: Dev[] = [
    { id: "local", name: "hel", home: true, awake: true, harnesses: [] },
    { id: "w2", name: "air", home: false, awake: false, harnesses: signed("codex") },
  ];
  const s = setup({ devs });
  expect(await s.mp.install("local", "nope")).toEqual({ ok: false, reason: "unknown" });
  expect(await s.mp.install("w2", "codex")).toEqual({ ok: false, reason: "offline" });
  expect(await s.mp.install("local", "claude-code")).toEqual({ ok: false, reason: "no_agent" });
  s.setOn(false);
  expect(await s.mp.install("w2", "codex")).toEqual({ ok: false, reason: "off" });
  expect(s.opened).toHaveLength(0);
});

test("Go on the card opens the same task; Hold does nothing", async () => {
  const devs: Dev[] = [{ id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") }];
  const s = setup({ devs });
  await s.mp.check();
  devs[0]!.harnesses.push({ harness: "pi", installed: true, loggedIn: true });
  await s.mp.check();
  const d = s.decisions()[0]!;
  s.log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "hold", by: "default" } });
  await new Promise((r) => setTimeout(r, 5));
  expect(s.opened).toHaveLength(0);
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "go", by: "user" } });
  await new Promise((r) => setTimeout(r, 5));
  expect(s.opened[0]).toMatchObject({ harness: "pi", place: { kind: "none" } });
});

test("the setup brief: Mem's guide is the only source of steps, never guess a key, verify with the check", () => {
  const b = memSetupBrief({ agent: "Claude Code", host: "claude-code", device: "hel", lang: "en" });
  expect(b).toContain("only source of the steps");
  expect(b).toContain("Never guess a server address, an API key");
  expect(b).toContain("Nothing of Ducter's");
  expect(b).toContain("has to be restarted");
});

// ---------- over the real client socket ----------

test("without Mem connected (the default here: no identity bound): no line, no card, 装上 says off", async () => {
  const { startCore } = await import("../src/core.ts");
  let checks = 0;
  const core = startCore({
    dataDir: dir,
    port: 0,
    batchMs: 5,
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }], kind: async () => "server" },
    update: { autoEveryMs: 0 },
    agents: { autoEveryMs: 0 },
    memPlugins: { inspectLocal: async () => (checks++, fx("worker-fresh.json")) },
  });
  try {
    await core.memPlugins.check();
    expect(checks).toBe(0);
    const f = await core.devicesView.frame();
    expect(f.devices[0]!.harnesses[0]!.mem).toBeUndefined();
    expect(await core.memPlugins.install("local", "claude-code")).toEqual({ ok: false, reason: "off" });
    expect(core.log.read({ stream: "channel", kinds: ["decision"] })).toHaveLength(0);
  } finally {
    await core.stop();
  }
});

test("over the socket: the devices frame carries the Mem line; 装上 opens the task; a refresh checks again", async () => {
  const { startCore } = await import("../src/core.ts");
  let checks = 0;
  const list: DeviceHarness[] = [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }];
  const core = startCore({
    dataDir: dir,
    port: 0,
    batchMs: 5,
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => list, kind: async () => "server" },
    update: { autoEveryMs: 0 },
    agents: { autoEveryMs: 0 },
    memPlugins: { inspectLocal: async () => (checks++, fx("worker-fresh.json")), connected: () => true },
  });
  const opened: any[] = [];
  core.setRunner({ openTask: async (i: any) => (opened.push(i), { taskId: "tsk_mem" }) } as any);
  core.setPartner({ onTrigger: () => {} });
  const frames: any[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  const until = async (pred: (f: any) => boolean) => {
    for (let i = 0; i < 400; i++) {
      const hit = [...frames].reverse().find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((x) => x.t)}`);
  };
  try {
    ws.send(JSON.stringify({ t: "hello" }));
    await until((x) => x.t === "on_hand");
    ws.send(JSON.stringify({ t: "devices" }));
    const mem = (x: any) => x.t === "devices" && x.devices[0]?.harnesses[0]?.mem;
    expect((await until(mem)).devices[0].harnesses[0].mem).toMatchObject({ state: "absent" });
    ws.send(JSON.stringify({ t: "mem_plugin_install", device: "local", harness: "claude-code" }));
    expect(await until((x) => x.t === "mem_plugin_result")).toEqual({ t: "mem_plugin_result", device: "local", harness: "claude-code", ok: true, taskId: "tsk_mem" });
    expect(opened[0]).toMatchObject({ harness: "claude-code", origin: "you", place: { kind: "none" } });
    const before = checks;
    core.devicesView.refresh();
    for (let i = 0; i < 300 && checks === before; i++) await Bun.sleep(10);
    expect(checks).toBeGreaterThan(before);
  } finally {
    ws.close();
    await core.stop();
  }
});

// D552: hel, 2026-11-24: one 更新 on Claude Code's Mem plugin, and four tasks in 30 s.
test("D552: taps while the update task is still being opened get that same task; the line is busy from the tap", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const log = fakeLog();
  const opened: any[] = [];
  const mp = createMemPlugins({
    dataDir: dir,
    log: log as any,
    tasks: { get: () => undefined, list: () => [] } as any,
    persona: { id: "p" },
    // The runner takes its time (a worker's session starting): every tap lands before it answers.
    runner: () => ({ openTask: async (i: any) => (opened.push(i), await gate, { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
    on: () => true,
    lang: () => "zh",
    inspectLocal: async () => fx("mac-2026-11-10.json"),
    inspectWorker: async () => undefined,
    devices: async () => [{ id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") }],
    checkUpdates: async () => ({ "claude-code": "0.7.38" }),
    everyMs: 0,
  });
  await mp.check();
  const taps = [mp.install("local", "claude-code"), mp.install("local", "claude-code"), mp.install("local", "claude-code"), mp.install("local", "claude-code")];
  await new Promise((r) => setTimeout(r, 5));
  // Busy from the first tap, before any task id: the button reads 更新中 everywhere.
  expect(mp.view("local", agents("claude-code"))[0]!.mem).toMatchObject({ state: "update", busy: true });
  release();
  const got = await Promise.all(taps);
  expect(opened).toHaveLength(1);
  expect(got).toEqual([0, 1, 2, 3].map(() => ({ ok: true, taskId: "tsk1" })));
  const m = mp.view("local", agents("claude-code"))[0]!.mem!;
  expect(m.taskId).toBe("tsk1");
  expect(m.busy).toBeUndefined();
  // Later taps while it is open: still the one task.
  expect(await mp.install("local", "claude-code")).toEqual({ ok: true, taskId: "tsk1" });
  expect(opened).toHaveLength(1);
  mp.stop();
});

test("D552: the work a failed update task hands on stays the update; when it lands, the line says the version it reached", async () => {
  let version = "0.7.34";
  const log = fakeLog();
  const opened: any[] = [];
  const inspect = () => {
    const m = fx("mac-2026-11-10.json");
    return { ...m, "claude-code": { ...m["claude-code"]!, version } };
  };
  const mp = createMemPlugins({
    dataDir: dir,
    log: log as any,
    tasks: { get: () => undefined, list: () => [] } as any,
    persona: { id: "p" },
    runner: () => ({ openTask: async (i: any) => (opened.push(i), { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
    on: () => true,
    lang: () => "zh",
    inspectLocal: async () => inspect(),
    inspectWorker: async () => undefined,
    devices: async () => [{ id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code", "codex") }],
    checkUpdates: async () => ({ "claude-code": "0.7.38" }),
    everyMs: 0,
  });
  await mp.check();
  expect(await mp.install("local", "claude-code")).toEqual({ ok: true, taskId: "tsk1" });
  const tick = () => new Promise((r) => setTimeout(r, 10));
  // Claude Code couldn't start there (D549): the task fails, and the mend opens the work again on Codex.
  log.append({ stream: "task:tsk1", origin: "system", kind: "task_state", body: { taskId: "tsk1", attention: "failed", residency: "hot" } });
  await tick();
  log.append({ stream: "task:tsk9", origin: "partner", kind: "task_open", body: { taskId: "tsk9", title: "为 hel 上的 Claude Code 更新 Nowledge Mem", brief: "…", harness: "codex", replaces: "tsk1" } });
  await tick();
  // Still the one update: no Update button to tap again, the line on the work that goes on.
  expect(mp.view("local", agents("claude-code"))[0]!.mem).toMatchObject({ state: "update", taskId: "tsk9" });
  expect(await mp.install("local", "claude-code")).toEqual({ ok: true, taskId: "tsk9" });
  expect(opened).toHaveLength(1);
  // Codex updates it: the check runs when that task ends, the notice clears, and the line says so.
  version = "0.7.38";
  log.append({ stream: "task:tsk9", origin: "system", kind: "task_state", body: { taskId: "tsk9", attention: "done_claimed", residency: "hot" } });
  await tick();
  const m = mp.view("local", agents("claude-code"))[0]!.mem!;
  expect(m).toMatchObject({ state: "installed", version: "0.7.38", updated: true });
  expect(m.taskId).toBeUndefined();
  // Until the next check.
  await mp.check();
  expect(mp.view("local", agents("claude-code"))[0]!.mem!.updated).toBeUndefined();
  mp.stop();
});
