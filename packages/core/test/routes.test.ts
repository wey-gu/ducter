// D503 (research/219): a limit hit continues on the same model another way. The routes (pure), the
// account fingerprint each computer's probe keeps, the limit waits taking a route at a hit, and
// the partner's reserve at a new task's pick. Fake computers, a fake clock, a fake loadout.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { AccountUsage, Bodies, Candidate, DeviceHarness, Settings } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import type { AgentLimit } from "../src/agent-limits.ts";
import type { Computer } from "../src/candidates.ts";
import { FakeClock } from "../src/clock.ts";
import { accountPrint, probeHarnesses } from "../src/harness-probe.ts";
import { createLimitWaits } from "../src/limits.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { fullest, overReserve, RESERVE_AT, sameModelRoutes } from "../src/routes.ts";
import { createWork } from "../src/work.ts";
import { openTask, tempDir, tick } from "./helpers.ts";

const NOW = Date.parse("2026-11-24T06:00:00Z");
const A = "aaaaaaaaaaaa"; // the home's Claude account
const B = "bbbbbbbbbbbb"; // another Claude account

const claude = (account?: string, more: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", ...(account ? { account } : {}), ...more });
const comp = (id: string, name: string, harnesses: DeviceHarness[], more: Partial<Computer> = {}): Computer => ({ id, name, home: false, state: "awake", alwaysOn: true, mac: true, harnesses, ...more });
const cand = (device: string, more: Partial<Candidate> = {}): Candidate => ({ harness: "claude-code", model: "opus", reason: { kind: "fit" }, billing: "plan", device, ...more });

const HOME = comp("home", "MacBook", [claude(A)], { home: true, alwaysOn: false });
const HEL = comp("hel", "hel", [claude(B)]);

test("another account of the same agent on another computer is a route; the same account is not", () => {
  const same = comp("mini", "mini", [claude(A)]);
  const r = sameModelRoutes({ harness: "claude-code", model: "opus", computers: [HOME, same, HEL], candidates: [cand("home", { current: true }), cand("mini"), cand("hel")], limits: [], now: NOW });
  expect(r.map((x) => x.deviceName)).toEqual(["hel"]);
  expect(r[0]).toMatchObject({ device: "hel", harness: "claude-code", model: "opus", account: B });
});

test("never a route: an account Ducter can't name, a key paid per use, a computer asleep, one where the task can't run, a used-up account", () => {
  const ask = (c: Computer, cs: Candidate[] = [cand(c.id)], limits: AgentLimit[] = []) => sameModelRoutes({ harness: "claude-code", model: "opus", computers: [HOME, c], candidates: cs, limits, now: NOW });
  expect(ask(comp("w", "w", [claude()]))).toEqual([]); // an older worker: no fingerprint
  expect(ask(comp("w", "w", [claude(B, { billing: "usage" })]))).toEqual([]);
  expect(ask(comp("w", "w", [claude(B)], { state: "asleep" }))).toEqual([]);
  expect(ask(HEL, [cand("hel", { blocked: "off" as Candidate["blocked"] })])).toEqual([]);
  expect(ask(HEL, [])).toEqual([]);
  expect(ask(HEL, [cand("hel")], [{ device: "hel", harness: "claude-code", state: "used_up", until: new Date(NOW + 3_600_000).toISOString() }])).toEqual([]);
  // A used-up account stays used up on every computer it is signed in on.
  const hel2 = comp("hel2", "hel2", [claude(B)]);
  expect(sameModelRoutes({ harness: "claude-code", computers: [HOME, HEL, hel2], candidates: [cand("hel"), cand("hel2")], limits: [{ device: "hel", harness: "claude-code", state: "used_up" }], now: NOW })).toEqual([]);
  // A limit whose reset has passed holds no more.
  expect(ask(HEL, [cand("hel")], [{ device: "hel", harness: "claude-code", state: "used_up", until: new Date(NOW - 1000).toISOString() }]).length).toBe(1);
  // The home's own account unknown (a sign-in by token): nothing can be told apart.
  expect(sameModelRoutes({ harness: "claude-code", computers: [comp("home", "MacBook", [claude()], { home: true }), HEL], candidates: [cand("hel")], limits: [], now: NOW })).toEqual([]);
  // Another model than the one the task uses, where the computer lists its models.
  expect(sameModelRoutes({ harness: "claude-code", model: "opus", computers: [HOME, comp("w", "w", [claude(B, { models: [{ id: "sonnet", label: "Sonnet" }] })])], candidates: [cand("w")], limits: [], now: NOW })).toEqual([]);
});

test("ranked by room left, then by the soonest reset", () => {
  const x = comp("x", "x", [claude("xxxxxxxxxxxx", { allowance: { left: 0.2, resetsAt: new Date(NOW + 60_000).toISOString() } })]);
  const y = comp("y", "y", [claude("yyyyyyyyyyyy", { allowance: { left: 0.9 } })]);
  const z = comp("z", "z", [claude("zzzzzzzzzzzz", { allowance: { left: 0.2, resetsAt: new Date(NOW + 10_000).toISOString() } })]);
  const r = sameModelRoutes({ harness: "claude-code", computers: [HOME, x, y, z], candidates: [cand("x"), cand("y"), cand("z")], limits: [], now: NOW });
  expect(r.map((c) => c.deviceName)).toEqual(["y", "z", "x"]);
});

test("the reserve: the partner's own account with only its reserve left (D89: 90 % used) on the home", () => {
  const u = (used: number, limited?: boolean): AccountUsage => ({ harness: "claude-code", windows: [{ label: "5 hours", used }], at: "", ...(limited ? { limited } : {}) });
  expect(RESERVE_AT).toBe(0.9);
  expect(fullest(u(0.4))).toBe(0.4);
  expect(fullest(undefined)).toBeUndefined();
  expect(overReserve({ harness: "claude-code", partnerHarness: "claude-code", onHome: true, usage: u(0.91) })).toBe(true);
  expect(overReserve({ harness: "claude-code", partnerHarness: "claude-code", onHome: true, usage: u(0.5) })).toBe(false);
  expect(overReserve({ harness: "claude-code", partnerHarness: "claude-code", onHome: true, usage: u(0.1, true) })).toBe(true);
  expect(overReserve({ harness: "codex", partnerHarness: "claude-code", onHome: true, usage: u(0.99) })).toBe(false);
  expect(overReserve({ harness: "claude-code", partnerHarness: "claude-code", onHome: false, usage: u(0.99) })).toBe(false);
  expect(overReserve({ harness: "claude-code", partnerHarness: "claude-code", onHome: true, usage: undefined })).toBe(false);
});

test("each computer's probe keeps a fingerprint of the account, never the email", async () => {
  const p = accountPrint("claude-code", ["Someone@Example.test", "org-1"]);
  expect(p).toMatch(/^[0-9a-f]{12}$/);
  expect(accountPrint("claude-code", ["someone@example.test ", "org-1"])).toBe(p!);
  expect(accountPrint("claude-code", ["other@example.test", "org-1"])).not.toBe(p!);
  expect(accountPrint("codex", ["someone@example.test", "org-1"])).not.toBe(p!);
  expect(accountPrint("codex", [undefined, ""])).toBeUndefined();
  const r = await probeHarnesses({
    which: (c) => (c === "claude" || c === "codex" ? `/bin/${c}` : null),
    exec: async (argv) => (argv[0] === "claude" ? { code: 0, out: '{"loggedIn": true, "email": "Someone@Example.test", "orgId": "org-1", "authMethod": "claude.ai"}' } : { code: 0, out: "Logged in using ChatGPT" }),
    env: { CODEX_HOME: "/cx" },
    home: "/h",
    dataDir: "/d",
    read: (path) => (path === "/cx/auth.json" ? JSON.stringify({ auth_mode: "chatgpt", tokens: { account_id: "acct-1", access_token: "not-a-real-token" } }) : undefined),
    only: ["claude-code", "codex"],
    exists: () => false,
  });
  expect(r.find((h) => h.harness === "claude-code")?.account).toBe(p!);
  expect(r.find((h) => h.harness === "codex")?.account).toBe(accountPrint("codex", ["acct-1"])!);
  expect(JSON.stringify(r)).not.toContain("example.test");
  expect(JSON.stringify(r)).not.toContain("not-a-real-token");
});

// ---------- the limit waits take a route at a hit ----------

let cleanup = () => {};
afterEach(() => cleanup());
const flush = async () => {
  for (let i = 0; i < 30; i++) await tick();
};

function setup(o: { computers?: Computer[]; candidates?: Candidate[]; moveOk?: boolean } = {}) {
  const t = tempDir();
  const clock = new FakeClock(NOW);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const mcp = createMcpHub({ secret: "s" });
  const runner = { send: async () => ({ delivered: "prompted" as const }) } as unknown as Runner;
  const work = createWork({ log, tasks, mcp, runner: () => runner, clock, persona: "default", minEveryMs: 1000, restartLookMs: 10 });
  const moved: { taskId: string; harness: string; model?: string; device?: string; by?: string }[] = [];
  const loadout = {
    candidates: async () => o.candidates ?? [cand("home", { current: true }), cand("hel")],
    computers: async () => o.computers ?? [HOME, HEL],
    async switchTask(taskId: string, harness: string, model: string | undefined, _r: unknown, device?: string, _e?: string, by?: "partner" | "limit") {
      moved.push({ taskId, harness, ...(model ? { model } : {}), ...(device ? { device } : {}), ...(by ? { by } : {}) });
      return { ok: o.moveOk ?? true };
    },
  };
  const limits = createLimitWaits({ log, tasks, waiters: work.waiters, loadout, settings: { get: () => ({ limitHandoff: false }) as Settings }, runner: () => runner, clock, limitsNow: () => [] });
  cleanup = () => {
    limits.stop();
    work.stop();
    log.close();
    t.cleanup();
  };
  const hit = (taskId: string, failure: "quota" | "rate_limited" = "quota") =>
    log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "system", from: "runner", text: "usage limit", raw: { limit: { harness: "claude-code", failure, source: "event", resetsAt: new Date(NOW + 3 * 3_600_000).toISOString() } } } });
  const waits = () => log.read({ kinds: ["waiter"], limit: 1000 }).filter((e) => (e.body as Bodies["waiter"]).limit);
  const routed = () => log.read({ kinds: ["task_event"], limit: 1000 }).filter((e) => (e.body as { raw?: { limitRouted?: unknown } }).raw?.limitRouted);
  return { log, tasks, moved, hit, waits, routed };
}

const working = (s: ReturnType<typeof setup>, id: string) => {
  openTask(s.log, id, "跑完 WAL 基准测试");
  s.tasks.setState(id, "working", "hot");
};

test("a limit hit with another account of the same agent on hel: the task moves there at once, same model, no wait, nothing to choose", async () => {
  const s = setup();
  working(s, "t1");
  s.hit("t1");
  await flush();
  expect(s.moved).toEqual([{ taskId: "t1", harness: "claude-code", device: "hel", by: "limit" }]);
  expect(s.waits()).toEqual([]);
  expect((s.routed()[0]!.body as { raw: { limitRouted: unknown } }).raw.limitRouted).toEqual({ harness: "claude-code", from: "local", to: "hel" });
});

test("no other route (the same account elsewhere), a throttle, or a move that fails: the D297 wait as before", async () => {
  const same = setup({ computers: [HOME, comp("hel", "hel", [claude(A)])] });
  working(same, "t1");
  same.hit("t1");
  await flush();
  expect(same.moved).toEqual([]);
  expect(same.waits().length).toBe(1);
  cleanup();

  const throttle = setup();
  working(throttle, "t2");
  throttle.hit("t2", "rate_limited");
  await flush();
  expect(throttle.moved).toEqual([]);
  expect(throttle.waits().length).toBe(1);
  cleanup();

  const fails = setup({ moveOk: false });
  working(fails, "t3");
  fails.hit("t3");
  await flush();
  expect(fails.moved.length).toBe(1);
  expect(fails.routed()).toEqual([]);
  expect(fails.waits().length).toBe(1);
});

// ---------- the reserve at a new task's pick ----------

test("the partner's own account past the reserve: a new task goes to the same agent and model on another account; under it, it stays home", async () => {
  const { createLoadout } = await import("../src/loadout.ts");
  const t = tempDir();
  const clock = new FakeClock(NOW);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const dv = (id: string, name: string, home: boolean, account: string) => ({ id, name, kind: home ? "laptop" : "server", home, state: "awake", harnesses: [claude(account)], abilities: [] });
  const frame = { t: "devices", devices: [dv("home", "MacBook", true, A), dv("hel", "hel", false, B)], reach: { clients: [] } };
  let used = 0.92;
  const lo = createLoadout({
    log,
    tasks: createRegistry(log, clock),
    settings: { get: () => ({ brain: { harness: "claude-code" } }) } as never,
    rules: { list: () => [] } as never,
    devices: () => ({ frame: async () => frame }) as never,
    reserve: () => ({ harness: "claude-code", usage: { harness: "claude-code", windows: [{ label: "5 hours", used }], at: "" } }),
    limitsNow: () => [],
  });
  try {
    const first = await lo.choose({ title: "Fix the flaky test" });
    expect(first && "harness" in first ? first.harness : first).toBe("claude-code");
    // Whatever the ranking picked, the home's account past the reserve is left to the partner.
    expect(first).toMatchObject({ deviceId: "hel", home: false });
    used = 0.3;
    const home = await lo.choose({ title: "Fix the flaky test" });
    expect(home).toMatchObject({ deviceId: "home", home: true });
    // Under the reserve the ranking's own pick stands (the same as with no reserve at all).
    const plain = createLoadout({ log, tasks: createRegistry(log, clock), settings: { get: () => ({ brain: { harness: "claude-code" } }) } as never, rules: { list: () => [] } as never, devices: () => ({ frame: async () => frame }) as never });
    expect(home).toEqual((await plain.choose({ title: "Fix the flaky test" })) as never);
    // The person's own pick is theirs (by: "you"), past the reserve or not.
    used = 0.95;
    const mine = await lo.choose({ title: "Fix the flaky test", harness: "claude-code", by: "you" });
    expect(mine).toEqual((await plain.choose({ title: "Fix the flaky test", harness: "claude-code", by: "you" })) as never);
  } finally {
    lo.stop();
    log.close();
    t.cleanup();
  }
});
