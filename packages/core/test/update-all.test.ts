// 全部更新 / Update all (D224): the order (the home, then the other computers, then each computer's
// AI agents), the safe point (an agent update waits for the tasks using it, never stops them),
// failures kept apart (a computer stays with a home that didn't update; agents go on), the plan
// picked up again by a restarted home, 停止剩下的, and the night. A fake world of devices stands in
// for the devices frame; fake single-update starters record what was asked and when. No network.
import { afterEach, expect, test } from "bun:test";
import type { DeviceHarness, DeviceView, UpdateAllItem } from "@ducter/protocol";
import { createUpdateAll, offerFrom, readPlanFile, type UpdateAll } from "../src/update-all.ts";
import { openLog } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const agent = (harness: string, version: string, latest: string, o: Partial<DeviceHarness> = {}): DeviceHarness =>
  ({ harness, installed: true, loggedIn: true, canBePartner: false, version, latest, how: "npm", available: latest !== version, ...o }) as DeviceHarness;

function device(id: string, o: { home?: boolean; version?: string; latest?: string; how?: "self" | "app" | "source" | "manual"; fromHere?: boolean; state?: DeviceView["state"]; kind?: DeviceView["kind"]; harnesses?: DeviceHarness[] } = {}): DeviceView {
  const version = o.version ?? "0.0.30";
  const latest = o.latest ?? "0.0.31";
  return {
    id,
    name: id === "local" ? "hel" : id,
    kind: o.kind ?? "server",
    home: !!o.home,
    state: o.state ?? "awake",
    version,
    harnesses: o.harnesses ?? [],
    abilities: [],
    update: { current: version, latest, available: latest !== version, how: o.how ?? "self", ...(o.fromHere ? { fromHere: true } : {}) },
  };
}

/** The fake world: the devices frame, what each single update was asked, and when. */
function world(devs: DeviceView[], o: { dir?: string; busy?: Record<string, number>; now?: { t: number } } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  const clock = o.now ?? { t: Date.parse("2026-11-12T10:00:00Z") };
  const calls: string[] = [];
  const busy = o.busy ?? {};
  const answers: Record<string, { ok: false; reason: any; detail?: string }> = {};
  const fns = new Set<() => void>();
  const updates = {
    start: async (id: string, a: { to?: string }) => {
      calls.push(`ducter:${id}`);
      if (answers[`ducter:${id}`]) return answers[`ducter:${id}`]!;
      const dv = devs.find((x) => x.id === id)!;
      dv.update = { ...dv.update!, phase: "downloading", from: dv.update!.current, to: a.to! };
      return { ok: true as const };
    },
    onChange: (fn: () => void) => (fns.add(fn), () => fns.delete(fn)),
  };
  const agents = {
    start: async (id: string, h: string, a: { to?: string }) => {
      calls.push(`agent:${id}:${h}`);
      if (answers[`agent:${id}:${h}`]) return answers[`agent:${id}:${h}`]!;
      const x = devs.find((d) => d.id === id)!.harnesses.find((y) => y.harness === h)!;
      x.update = { phase: "updating", from: x.version!, to: a.to!, at: new Date(clock.t).toISOString() };
      return { ok: true as const };
    },
    onChange: (fn: () => void) => (fns.add(fn), () => fns.delete(fn)),
  };
  const make = (extra: Partial<Parameters<typeof createUpdateAll>[0]> = {}): UpdateAll => {
    const ua = createUpdateAll({
      dataDir: t.dir,
      log,
      now: () => clock.t,
      updates: () => updates as any,
      agents: () => agents as any,
      devices: async () => devs,
      busy: (d, h) => busy[`${d}:${h}`] ?? 0,
      tickMs: 0,
      nightEveryMs: 0,
      ...extra,
    });
    stops.push(() => ua.stop_());
    return ua;
  };
  stops.push(() => log.close?.(), t.cleanup);
  /** A device's Ducter now runs v (its restart came back), or its update failed. */
  const ducterOn = (id: string, v: string) => {
    const dv = devs.find((x) => x.id === id)!;
    dv.version = v;
    dv.update = { ...dv.update!, current: v, available: false, phase: "done", to: v };
  };
  const ducterFailed = (id: string, reason: string) => {
    const dv = devs.find((x) => x.id === id)!;
    dv.update = { ...dv.update!, phase: "failed", reason: reason as any, rolledBack: true };
  };
  const agentOn = (id: string, h: string, v: string) => {
    const x = devs.find((d) => d.id === id)!.harnesses.find((y) => y.harness === h)!;
    x.update = { phase: "done", from: x.version!, to: v, at: new Date(clock.t).toISOString() };
    x.version = v;
    x.available = false;
  };
  return { dir: t.dir, log, calls, busy, answers, clock, make, ducterOn, ducterFailed, agentOn, devs };
}

const states = (ua: UpdateAll) => Object.fromEntries(ua.plan()!.items.map((i: UpdateAllItem) => [i.key, i.state]));

test("the offer is in the one safe order: the home, the other computers, then each computer's agents; what can't take part says why", () => {
  const devs = [
    device("mini", { harnesses: [agent("codex", "0.160.0", "0.167.0")] }),
    device("local", { home: true, harnesses: [agent("claude-code", "2.1.319", "2.1.322"), agent("pi", "1.5.1", "1.5.1")] }),
    device("macbook", { kind: "laptop", how: "app", fromHere: true }),
    device("old-mac", { kind: "laptop", how: "app" }),
    device("asleep", { state: "asleep", harnesses: [agent("pi", "1.5.0", "1.5.1")] }),
    device("current", { version: "0.0.31", harnesses: [agent("pi", "1.5.0", "1.5.1", { how: "app", available: false })] }),
  ];
  const { offer, notNow } = offerFrom(devs);
  expect(offer.map((i) => i.key)).toEqual(["ducter:local", "ducter:mini", "ducter:macbook", "agent:local:claude-code", "agent:mini:codex"]);
  expect(offer[0]).toMatchObject({ kind: "ducter", deviceName: "hel", from: "0.0.30", to: "0.0.31", state: "queued" });
  expect(offer[3]).toMatchObject({ kind: "agent", harness: "claude-code", from: "2.1.319", to: "2.1.322" });
  expect(notNow).toEqual([
    { device: "old-mac", deviceName: "old-mac", why: "app_old", items: 1 },
    { device: "asleep", deviceName: "asleep", why: "offline", items: 2 },
  ]);
  // At night: only what updates by itself, only signed-in agents, only to versions Ducter checked.
  const night = offerFrom(
    [device("local", { home: true, harnesses: [agent("claude-code", "2.1.319", "2.1.322"), agent("pi", "1.4.0", "9.9.9")] }), device("macbook", { kind: "laptop", how: "app", fromHere: true })],
    { night: true },
  );
  expect(night.offer.map((i) => `${i.key}→${i.to}`)).toEqual(["ducter:local→0.0.31", "agent:local:claude-code→2.1.322", "agent:local:pi→1.5.1"]);
});

test("one tap: the home first; the other computers only once it is back on the new version; agents after their own computer, one at a time there", async () => {
  const w = world([
    device("local", { home: true, harnesses: [agent("claude-code", "2.1.319", "2.1.322"), agent("pi", "1.5.0", "1.5.1")] }),
    device("mini", { harnesses: [agent("codex", "0.160.0", "0.167.0")] }),
    device("box"),
  ]);
  const ua = w.make();
  expect(await ua.start()).toMatchObject({ ok: true });
  await ua.step();
  expect(w.calls).toEqual(["ducter:local"]);
  expect(states(ua)).toMatchObject({ "ducter:local": "running", "ducter:mini": "queued", "agent:local:claude-code": "queued" });
  // Its steps show on the plan's line.
  w.devs[0]!.update = { ...w.devs[0]!.update!, phase: "downloading", progress: 0.4 };
  await ua.step();
  expect(ua.plan()!.items[0]).toMatchObject({ state: "running", phase: "downloading", progress: 0.4 });
  w.ducterOn("local", "0.0.31");
  await ua.step();
  // Both computers side by side; the home's agents one at a time; the mini's codex waits for the mini.
  expect(w.calls).toEqual(["ducter:local", "ducter:mini", "ducter:box", "agent:local:claude-code"]);
  w.agentOn("local", "claude-code", "2.1.322");
  await ua.step();
  expect(w.calls.at(-1)).toBe("agent:local:pi");
  w.ducterOn("mini", "0.0.31");
  await ua.step();
  expect(w.calls.at(-1)).toBe("agent:mini:codex");
  w.agentOn("local", "pi", "1.5.1");
  w.agentOn("mini", "codex", "0.167.0");
  w.ducterOn("box", "0.0.31");
  await ua.step();
  expect(Object.values(states(ua)).every((s) => s === "done")).toBe(true);
  expect(ua.plan()!.finishedAt).toBeDefined();
  const ev = w.log.read({ stream: "devices", kinds: ["update_all"] }).map((e) => e.body as any);
  expect(ev.map((b) => b.phase)).toEqual(["started", "finished"]);
  expect(ev[1]).toMatchObject({ items: 6, done: 6, failed: 0, by: "user" });
  // Nothing new to offer while it's over; a second tap with nothing behind says so.
  expect(await ua.start()).toEqual({ ok: false, reason: "nothing" });
});

test("the safe point: an agent update waits while tasks use it there, says how many, and never stops them", async () => {
  const w = world([device("local", { home: true, version: "0.0.31", harnesses: [agent("claude-code", "2.1.319", "2.1.322")] })], { busy: { "local:claude-code": 2 } });
  const ua = w.make();
  await ua.start();
  await ua.step();
  expect(w.calls).toEqual([]);
  expect(ua.plan()!.items[0]).toMatchObject({ state: "waiting", busy: 2 });
  w.busy["local:claude-code"] = 1;
  await ua.step();
  expect(ua.plan()!.items[0]).toMatchObject({ state: "waiting", busy: 1 });
  w.busy["local:claude-code"] = 0;
  await ua.step();
  expect(w.calls).toEqual(["agent:local:claude-code"]);
  expect(ua.plan()!.items[0]!.busy).toBeUndefined();
  // A turn that began in between: the agent's own safe point says busy; the plan goes back to waiting.
  const w2 = world([device("local", { home: true, version: "0.0.31", harnesses: [agent("pi", "1.5.0", "1.5.1")] })]);
  w2.answers["agent:local:pi"] = { ok: false, reason: "busy" };
  const ua2 = w2.make();
  await ua2.start();
  await ua2.step();
  expect(ua2.plan()!.items[0]).toMatchObject({ state: "waiting", busy: 1 });
});

test("failures stay apart: a home that didn't update keeps the computers with it; agents go on; one computer's failure doesn't touch another", async () => {
  const w = world([device("local", { home: true, harnesses: [agent("pi", "1.5.0", "1.5.1")] }), device("mini", { harnesses: [agent("codex", "0.160.0", "0.167.0")] })]);
  const ua = w.make();
  await ua.start();
  await ua.step();
  w.ducterFailed("local", "health");
  await ua.step();
  expect(ua.plan()!.items.find((i) => i.key === "ducter:local")).toMatchObject({ state: "failed", reason: "health", rolledBack: true });
  expect(ua.plan()!.items.find((i) => i.key === "ducter:mini")).toMatchObject({ state: "skipped", reason: "home", detail: "hel" });
  // The agents don't depend on Ducter's version: both go on.
  expect(w.calls).toEqual(["ducter:local", "agent:local:pi", "agent:mini:codex"]);

  // A worker that fails: the other worker and every agent still update; the plan ends with it said.
  const w2 = world([device("local", { home: true, version: "0.0.31" }), device("mini"), device("box", { harnesses: [agent("pi", "1.5.0", "1.5.1")] })]);
  w2.answers["ducter:mini"] = { ok: false, reason: "disk", detail: "120 MB free" };
  const ua2 = w2.make();
  await ua2.start();
  await ua2.step();
  expect(states(ua2)).toEqual({ "ducter:mini": "failed", "ducter:box": "running", "agent:box:pi": "queued" });
  w2.ducterFailed("box", "checksum");
  await ua2.step();
  expect(w2.calls).toContain("agent:box:pi");
  w2.agentOn("box", "pi", "1.5.1");
  await ua2.step();
  expect(states(ua2)).toEqual({ "ducter:mini": "failed", "ducter:box": "failed", "agent:box:pi": "done" });
  expect(ua2.plan()!.items[0]).toMatchObject({ reason: "disk", detail: "120 MB free" });
  const end = w2.log.read({ stream: "devices", kinds: ["update_all"] }).at(-1)!.body as any;
  expect(end).toMatchObject({ phase: "finished", done: 1, failed: 2 });
  // "Nothing newer" for an agent is never a failure (D172).
  const w3 = world([device("local", { home: true, version: "0.0.31", harnesses: [agent("pi", "1.5.0", "1.5.1")] })]);
  w3.answers["agent:local:pi"] = { ok: false, reason: "no_update" };
  const ua3 = w3.make();
  await ua3.start();
  await ua3.step();
  expect(states(ua3)).toEqual({ "agent:local:pi": "done" });
});

test("the plan outlives the home's own restart: the new home picks it up, judges its own step by what it runs, and goes on", async () => {
  const devs = [device("local", { home: true, harnesses: [agent("pi", "1.5.0", "1.5.1")] }), device("mini")];
  const w = world(devs);
  const ua = w.make();
  const r = await ua.start();
  await ua.step();
  expect(w.calls).toEqual(["ducter:local"]);
  // On disk before the restart, the home's step under way.
  expect(readPlanFile(w.dir)!.items[0]).toMatchObject({ key: "ducter:local", state: "running" });
  ua.stop_(); // the process is replaced

  // The new home: on 0.0.31, its card fresh (no phase), the mini not yet.
  const devs2 = [device("local", { home: true, version: "0.0.31", harnesses: [agent("pi", "1.5.0", "1.5.1")] }), device("mini")];
  devs2[0]!.update = { current: "0.0.31", latest: "0.0.31", available: false, how: "self" };
  const w2 = world(devs2, { dir: w.dir });
  const ua2 = w2.make();
  await ua2.step();
  expect(ua2.plan()!.id).toBe((r as any).id);
  expect(states(ua2)).toMatchObject({ "ducter:local": "done", "ducter:mini": "running", "agent:local:pi": "running" });
  expect(w2.calls).toEqual(["ducter:mini", "agent:local:pi"]);

  // Rolled back instead: the restarted (old) home reads the helper's outcome, and says so.
  const w3 = world([device("local", { home: true }), device("mini")]);
  const ua3 = w3.make();
  await ua3.start();
  await ua3.step();
  ua3.stop_();
  const back = [device("local", { home: true }), device("mini")];
  back[0]!.update = { ...back[0]!.update!, phase: "failed", from: "0.0.30", to: "0.0.31", reason: "health", rolledBack: true };
  const w4 = world(back, { dir: w3.dir });
  const ua4 = w4.make();
  await ua4.step();
  expect(states(ua4)).toEqual({ "ducter:local": "failed", "ducter:mini": "skipped" });
  expect(w4.calls).toEqual([]);
});

test("a step that never says how it ended is called after a while; 停止剩下的 skips what hasn't started and lets the running finish", async () => {
  const w = world([device("local", { home: true, version: "0.0.31" }), device("mini"), device("box", { harnesses: [agent("pi", "1.5.0", "1.5.1")] })]);
  const ua = w.make();
  await ua.start();
  await ua.step();
  expect(states(ua)).toMatchObject({ "ducter:mini": "running", "ducter:box": "running", "agent:box:pi": "queued" });
  expect(ua.stop()).toBe(true);
  expect(states(ua)).toMatchObject({ "ducter:mini": "running", "agent:box:pi": "skipped" });
  expect(ua.plan()!.items.find((i) => i.key === "agent:box:pi")!.reason).toBe("stopped");
  w.ducterOn("mini", "0.0.31");
  w.clock.t += 46 * 60_000; // box went quiet mid-download
  await ua.step();
  expect(states(ua)).toEqual({ "ducter:mini": "done", "ducter:box": "failed", "agent:box:pi": "skipped" });
  expect(ua.plan()!.items[1]!.reason).toBe("no_answer");
  expect(w.log.read({ stream: "devices", kinds: ["update_all"] }).at(-1)!.body).toMatchObject({ phase: "stopped" });
  // A finished plan is shown a while (a day with a failure), and can be put away.
  expect(ua.view(w.devs).plan?.id).toBe(ua.plan()!.id);
  expect(ua.dismiss()).toBe(true);
  expect(ua.view(w.devs).plan).toBeUndefined();
});

test("a computer that went to sleep before its turn is skipped as away, and its agents with it", async () => {
  const w = world([device("local", { home: true }), device("mini", { kind: "laptop", harnesses: [agent("pi", "1.5.0", "1.5.1")] })]);
  const ua = w.make();
  await ua.start();
  await ua.step();
  w.devs[1]!.state = "asleep";
  w.ducterOn("local", "0.0.31");
  await ua.step();
  expect(states(ua)).toEqual({ "ducter:local": "done", "ducter:mini": "skipped", "agent:mini:pi": "skipped" });
  expect(ua.plan()!.items[1]!.reason).toBe("offline");
});

test("the night: with the switch on, inside quiet hours (else 3–5 at night), nothing working: the same plan; never twice for what failed", async () => {
  const clock = { t: Date.parse("2026-11-12T03:30:00Z") };
  const w = world([device("local", { home: true, harnesses: [agent("pi", "1.5.0", "1.5.1")] })], { now: clock });
  let working = 1;
  const s = { autoUpdate: false, quiet: null as any };
  const ua = w.make({ settings: () => s, working: () => working, tz: "UTC" });
  await ua.nightly();
  expect(ua.plan()).toBeUndefined(); // off
  s.autoUpdate = true;
  await ua.nightly();
  expect(ua.plan()).toBeUndefined(); // something is working
  working = 0;
  clock.t = Date.parse("2026-11-12T12:00:00Z");
  await ua.nightly();
  expect(ua.plan()).toBeUndefined(); // daytime
  clock.t = Date.parse("2026-11-12T03:30:00Z");
  await ua.nightly();
  expect(ua.plan()).toMatchObject({ by: "night" });
  w.ducterFailed("local", "checksum");
  await ua.step();
  w.agentOn("local", "pi", "1.5.1");
  await ua.step();
  expect(ua.plan()!.finishedAt).toBeDefined();
  // The next look the same night: the failed Ducter step isn't tried again; nothing else is behind.
  w.devs[0]!.update = { ...w.devs[0]!.update!, phase: undefined } as any;
  clock.t += 10 * 60_000;
  const before = ua.plan()!.id;
  await ua.nightly();
  expect(ua.plan()!.id).toBe(before);
  // With quiet hours set, those are the night.
  s.quiet = { start: "13:00", end: "14:00", tz: "UTC" };
  clock.t = Date.parse("2026-11-13T13:30:00Z");
  await ua.nightly();
  expect(ua.plan()!.id).not.toBe(before);
});

// ---------- through the real home (startCore): the frame, the op, the restart ----------

import { startCore, type Core } from "../src/core.ts";
import type { ServerFrame } from "@ducter/protocol";

const releaseFeed = (version: string) => async () => new Response(JSON.stringify({ tag_name: `v${version}`, body: "x" }), { status: 200 });

function bootHome(dir: string, version: string, run: (i: any) => Promise<any>): Core {
  const core = startCore({
    dataDir: dir,
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" },
    update: { fetch: releaseFeed("0.0.31"), how: "self", version, run, autoEveryMs: 0, graceMs: 50, homeName: "hel" },
    updateAll: { tickMs: 50, nightEveryMs: 0 },
  });
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function socket(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 400; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames, close: () => ws.close() };
}

type DevicesFrame = Extract<ServerFrame, { t: "devices" }>;

test("over the socket: the devices frame offers it, update_all starts it, and the restarted home finishes the same plan", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  // The first home swaps itself and is about to be replaced (the helper restarts it).
  const first = bootHome(t.dir, "0.0.30", async (i) => {
    i.onPhase?.("downloading", 0.5);
    i.onPhase?.("verifying");
    await i.settle?.();
    i.onPhase?.("restarting");
    return { ok: true, restarting: true, target: "/x/ducter" };
  });
  await first.release.check(true);
  const c = await socket(first.url);
  c.send({ t: "devices" });
  const offered = await c.until<DevicesFrame>((f) => f.t === "devices" && !!(f as DevicesFrame).updateAll?.offer.length);
  expect(offered.updateAll!.offer).toMatchObject([{ key: "ducter:local", deviceName: "hel", from: "0.0.30", to: "0.0.31", state: "queued" }]);
  const n = c.frames.length;
  c.send({ t: "update_all" });
  expect(await c.until((f) => f.t === "update_all_result", n)).toMatchObject({ ok: true });
  const restarting = await c.until<DevicesFrame>((f) => f.t === "devices" && (f as DevicesFrame).updateAll?.plan?.items[0]?.phase === "restarting", n);
  const id = restarting.updateAll!.plan!.id;
  expect(restarting.updateAll!.offer).toEqual([]); // nothing to offer while it runs
  expect(first.log.read({ stream: "devices", kinds: ["update_all"] }).map((e) => (e.body as any).phase)).toEqual(["started"]);
  c.close();
  await first.stop();

  // The helper brought up 0.0.31: the same plan, its home step done, the plan over.
  const second = bootHome(t.dir, "0.0.31", async () => ({ ok: false, reason: "failed" }));
  stops.push(() => void second.stop());
  await second.release.check(true);
  const c2 = await socket(second.url);
  stops.push(() => c2.close());
  c2.send({ t: "devices" });
  const over = await c2.until<DevicesFrame>((f) => f.t === "devices" && !!(f as DevicesFrame).updateAll?.plan?.finishedAt);
  expect(over.updateAll!.plan).toMatchObject({ id, items: [{ key: "ducter:local", state: "done" }] });
  expect(second.log.read({ stream: "devices", kinds: ["update_all"] }).map((e) => (e.body as any).phase)).toEqual(["started", "finished"]);
  // 完成 puts it away.
  const m = c2.frames.length;
  c2.send({ t: "update_all", dismiss: true });
  expect(await c2.until((f) => f.t === "update_all_result", m)).toMatchObject({ ok: true });
});

// ---------- D226: a computer whose Ducter restarts under an agent's update ----------

// The author's MacBook (2026-11-12): 更新 tapped on its card a minute before Update all; the plan
// had only Codex there and started it at once; 5 s later the Mac's Ducter restarted into its new
// version and took the updater down with it; the row said 正在更新到 0.167.2 for 45 min.
test("an agent waits while its computer's Ducter updates outside the plan, and starts once that is over", async () => {
  const mac = device("mac", { kind: "laptop", how: "app", fromHere: true, harnesses: [agent("codex", "0.167.1", "0.167.2")] });
  mac.update = { ...mac.update!, phase: "downloading", from: "0.0.30", to: "0.0.31" };
  const w = world([device("local", { home: true, version: "0.0.31" }), mac]);
  const ua = w.make();
  expect(await ua.start()).toMatchObject({ ok: true });
  expect(ua.plan()!.items.map((i) => i.key)).toEqual(["agent:mac:codex"]); // its Ducter is under way already: not offered
  await ua.step();
  expect(w.calls).toEqual([]);
  expect(ua.plan()!.items[0]).toMatchObject({ state: "waiting", wait: "ducter" });
  // Restarting into the new version: still waiting.
  mac.update = { ...mac.update!, phase: "restarting" };
  await ua.step();
  expect(w.calls).toEqual([]);
  // Back on the new version: the agent goes, and the row no longer waits on Ducter.
  w.ducterOn("mac", "0.0.31");
  await ua.step();
  expect(w.calls).toEqual(["agent:mac:codex"]);
  expect(ua.plan()!.items[0]!.state).toBe("running");
  expect(ua.plan()!.items[0]!.wait).toBeUndefined();
});

test("a step whose computer went away says it waits for it; back and cut off, it starts again once, then fails with why", async () => {
  const w = world([device("local", { home: true, version: "0.0.31" }), device("mac", { kind: "laptop", version: "0.0.31", harnesses: [agent("codex", "0.167.1", "0.167.2")] })]);
  const mac = w.devs[1]!;
  const codex = mac.harnesses[0]!;
  const ua = w.make();
  await ua.start();
  await ua.step();
  expect(ua.plan()!.items[0]).toMatchObject({ state: "running", phase: "updating" });
  // Its Ducter restarts: away a moment.
  mac.state = "unreachable";
  await ua.step();
  expect(ua.plan()!.items[0]).toMatchObject({ state: "running", wait: "reconnect" });
  expect(readPlanFile(w.dir)!.items[0]).toMatchObject({ wait: "reconnect" });
  // Back, still on 0.167.1, and the home's view says the update was cut off.
  mac.state = "awake";
  w.clock.t += 60_000; // long before the 45 min
  codex.update = { phase: "failed", from: "0.167.1", to: "0.167.2", reason: "interrupted", at: new Date(w.clock.t).toISOString() };
  await ua.step();
  expect(w.calls).toEqual(["agent:mac:codex", "agent:mac:codex"]);
  expect(ua.plan()!.items[0]).toMatchObject({ state: "running", retried: true });
  expect(ua.plan()!.items[0]!.wait).toBeUndefined();
  // A frame from before the new attempt (the last interruption) is old news.
  await ua.step();
  expect(ua.plan()!.items[0]!.state).toBe("running");
  // Cut off again: failed, with the honest reason; not tried a third time.
  w.clock.t += 60_000;
  codex.update = { phase: "failed", from: "0.167.1", to: "0.167.2", reason: "interrupted", at: new Date(w.clock.t).toISOString() };
  await ua.step();
  expect(ua.plan()!.items[0]).toMatchObject({ state: "failed", reason: "interrupted", retried: true });
  expect(w.calls.length).toBe(2);
  expect(ua.plan()!.finishedAt).toBeDefined();
});

test("back after a restart: on its target it is done; with nobody updating it (a home that restarted forgot it) it starts again", async () => {
  const w = world([device("local", { home: true, version: "0.0.31" }), device("mac", { kind: "laptop", version: "0.0.31", harnesses: [agent("codex", "0.167.1", "0.167.2"), agent("pi", "1.5.0", "1.5.1")] })]);
  const [codex, pi] = w.devs[1]!.harnesses;
  const ua = w.make();
  await ua.start();
  await ua.step();
  expect(states(ua)).toMatchObject({ "agent:mac:codex": "running", "agent:mac:pi": "queued" });
  // The updater finished just before the restart, the frame was lost: the version there says done.
  codex!.version = "0.167.2";
  delete codex!.update;
  await ua.step();
  expect(states(ua)).toMatchObject({ "agent:mac:codex": "done", "agent:mac:pi": "running" });
  // The home restarts mid-step: the new one finds pi running on disk, and no update state for it
  // (it forgot), still on 1.5.0: nobody runs it, so it is started again.
  ua.stop_();
  delete pi!.update;
  const again = w.make();
  await again.step();
  expect(w.calls).toEqual(["agent:mac:codex", "agent:mac:pi", "agent:mac:pi"]);
  expect(again.plan()!.items.find((i) => i.key === "agent:mac:pi")).toMatchObject({ state: "running", retried: true });
  // The same process, a frame with no state yet right after it started it: not judged.
  delete pi!.update;
  await again.step();
  expect(again.plan()!.items.find((i) => i.key === "agent:mac:pi")!.state).toBe("running");
});
