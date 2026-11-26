// D594 (research/236): Antigravity works only when the person asks. On a fake clock with a stub
// runner (no agy, no model, no network): its task can't arm a wait or a timer of its own, the
// partner can't arm one for it, a routine never runs on it, and another agent's task still waits.
import { afterEach, expect, test } from "bun:test";
import type { Runner, TaskCard } from "@ducter/protocol";
import { HARNESSES, HARNESS_IDS, directOnly, directOnlyWhy } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir, tick } from "./helpers.ts";

const START = Date.parse("2026-11-26T05:12:00Z");
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot() {
  const t = tempDir();
  const clock = new FakeClock(START);
  const core: Core = startCore({ dataDir: t.dir, port: 0, push: false, clock, defaultDelayMs: 60_000 });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const opened: string[] = [];
  const runner = {
    async openTask(i: { harness?: string }): Promise<TaskCard> {
      opened.push(i.harness ?? "auto");
      throw new Error("no runner here");
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner as unknown as Runner);
  return { core, clock, opened };
}
type Boot = ReturnType<typeof boot>;
const open = (b: Boot, taskId: string, harness: string) => {
  b.core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: "走查 Mem 的界面", project: "", place: { kind: "none", device: "local" }, harness, brief: "看一眼 Mem 的设置页，四十五分钟后再看一轮。" } });
  b.core.tasks.setState(taskId, "working", "hot");
};
const armed = (b: Boot, taskId: string) => b.core.work.waiters.views().filter((w) => w.taskId === taskId && w.state === "armed");

test("D594/D600: Antigravity, Kimi Code and OpenCode work only when asked", () => {
  expect(HARNESS_IDS.filter((h) => directOnly(h))).toEqual(["antigravity", "kimi", "opencode"]);
  for (const h of ["antigravity", "kimi", "opencode"] as const) {
    expect(HARNESSES[h].directOnly).toBe(true);
    // The one line names the agent and the way on, in both languages, and carries its source.
    const why = directOnlyWhy(h)!;
    expect(why.zh).toContain("{agent} 只在你发话时干活");
    expect(why.en).toContain("{agent} works only when you ask");
    expect(why.source).toMatch(/^https:\/\//);
  }
  expect(directOnly(undefined)).toBe(false);
  expect(directOnly("not-an-agent")).toBe(false);
  expect(directOnlyWhy("codex")).toBeUndefined();
});

test("an Antigravity task arms no timer and no check of its own; a Codex task still does", async () => {
  const b = boot();
  open(b, "vd8hamrb", "antigravity");
  open(b, "swj3zc4w", "codex");
  await tick();
  const timer = (await b.core.mcp.call({ role: "task", taskId: "vd8hamrb" } as never, "wait_for", { reason: "四十五分钟后再看一轮 Mem 的设置页", afterMinutes: 45 })) as { ok: boolean; error?: string };
  expect(timer.ok).toBe(false);
  expect(timer.error).toContain("Antigravity 只在你发话时干活");
  expect(timer.error).toContain("Nothing was armed");
  const check = (await b.core.mcp.call({ role: "task", taskId: "vd8hamrb" } as never, "wait_for", { reason: "PR #11105 的 CI 通过", check: { argv: ["gh", "pr", "checks", "11105"], everyMinutes: 5 } })) as { ok: boolean };
  expect(check.ok).toBe(false);
  expect(armed(b, "vd8hamrb")).toEqual([]);
  const codex = (await b.core.mcp.call({ role: "task", taskId: "swj3zc4w" } as never, "wait_for", { reason: "四十五分钟后再看一轮评审", afterMinutes: 45 })) as { ok: boolean };
  expect(codex.ok).toBe(true);
  expect(armed(b, "swj3zc4w").length).toBe(1);
});

test("the partner can't park an Antigravity task on a wait either; the words come in English for English", async () => {
  const b = boot();
  open(b, "vd8hamrb", "antigravity");
  await tick();
  const r = (await b.core.mcp.call({ role: "partner" } as never, "wait_for", { reason: "PR #11105's CI passes", taskId: "vd8hamrb", check: { argv: ["gh", "pr", "checks", "11105"] } })) as { ok: boolean; error?: string };
  expect(r.ok).toBe(false);
  expect(r.error).toContain("Antigravity works only when you ask");
  expect(r.error).toContain("move the work to another agent");
  expect(armed(b, "vd8hamrb")).toEqual([]);
});

test("a routine is never set on Antigravity, Kimi or OpenCode, and never moved to them", async () => {
  const b = boot();
  const daily = { kind: "time" as const, every: "day" as const, time: "09:00", zone: "world" as const, tz: "Asia/Shanghai" };
  expect(() => b.core.work.routines.yours({ name: "看一眼 Mem 的评审", trigger: daily, brief: "看一眼 Mem 的评审。", harness: "antigravity" })).toThrow("Antigravity 只在你发话时干活");
  // D600: Kimi's own guidelines keep subscriptions to interactive use.
  expect(() => b.core.work.routines.yours({ name: "看一眼 Mem 的评审", trigger: daily, brief: "看一眼 Mem 的评审。", harness: "kimi" })).toThrow("Kimi Code 的订阅只限个人交互使用");
  // D600: OpenCode's subscription-OAuth route.
  expect(() => b.core.work.routines.yours({ name: "看一眼 Mem 的评审", trigger: daily, brief: "看一眼 Mem 的评审。", harness: "opencode" })).toThrow("Anthropic");
  const v = b.core.work.routines.yours({ name: "看一眼 Mem 的评审", trigger: daily, brief: "看一眼 Mem 的评审。", harness: "codex" });
  for (const h of ["antigravity", "kimi", "opencode"] as const) expect(b.core.work.routines.relocate(v.routineId, { harness: h })).toBe(false);
  expect(b.core.work.routines.relocate(v.routineId, { harness: "claude-code" })).toBe(true);
});

test("D600: a task on Kimi can't arm a wait: the reason is Kimi's, not Google's", async () => {
  const b = boot();
  open(b, "km000001", "kimi");
  await tick();
  const r = (await b.core.mcp.call({ role: "task", taskId: "km000001" } as never, "wait_for", { reason: "四十五分钟后再看一轮 Mem 的设置页", afterMinutes: 45 })) as { ok: boolean; error?: string };
  expect(r.ok).toBe(false);
  expect(r.error).toContain("Kimi Code 的订阅只限个人交互使用");
  expect(r.error).not.toContain("Google");
  expect(armed(b, "km000001")).toEqual([]);
});
