// D624: boards are no longer offered, but a small app a task or Keep keeps current still
// works: app_data writes only data, capped and rate-limited, and a done report from a task that
// fills one wakes nobody. Fake gh, no model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { APP_TASK_WRITES_PER_HOUR, type Bodies, type Runner, type TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot() {
  const t = tempDir();
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "en" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model in this test")), available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("no");
    },
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  const open = (taskId: string, title: string, brief: string) => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief } });
    core.tasks.setState(taskId, "working", "hot");
  };
  const call = (taskId: string, tool: string, args: unknown) => core.mcp.call({ role: "task", taskId } as never, tool, args) as Promise<string>;
  return { core, told, open, call };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test("app_data: a task given an app writes its data, nothing else; capped and rate-limited", async () => {
  const { core, told, open, call } = boot();
  open("tfare", "Train fares to Shanghai", "Every morning, check the G-train fares Beijing to Shanghai for Friday.");
  open("tother", "Something else", "Fix the flaky test.");
  expect(core.mcp.listed({ role: "task", taskId: "tfare" } as never)).not.toContain("app_data");
  const html = `<ul id="l"></ul><script>var f=ducter.get("fares")||[];document.getElementById("l").textContent=f.length</script>`;
  const m = core.apps.make(core.persona.id, { name: "Fares", html, task: { id: "tfare", title: "Train fares to Shanghai" } });
  expect(m.ok).toBe(true);
  const id = (m as { app: { id: string } }).app.id;
  await settle();
  expect(told.find((t) => t.taskId === "tfare")?.text).toMatch(new RegExp(`app_data.*app ${id}.*fares`, "s"));
  expect(core.mcp.listed({ role: "task", taskId: "tfare" } as never)).toContain("app_data");
  expect(core.mcp.listed({ role: "task", taskId: "tother" } as never)).not.toContain("app_data");
  expect(await call("tfare", "app_data", { app: id, set: { fares: [{ train: "G1", price: 553 }], at: "07:00" } })).toMatch(/^Kept: fares, at/);
  expect(core.apps.data(id)).toEqual({ fares: [{ train: "G1", price: 553 }], at: "07:00" });
  expect(core.apps.html(id)).toBe(html);
  expect(await call("tfare", "app_data", { app: id, set: { at: null } })).toMatch(/^Kept/);
  expect(core.apps.data(id)).toEqual({ fares: [{ train: "G1", price: 553 }] });
  // Another task's app, a bad key, too much, too often.
  expect(core.apps.fill(id, "tother", { x: 1 })).toMatchObject({ ok: false });
  expect(await call("tfare", "app_data", { app: id, set: {} })).toMatch(/at least one key/);
  expect(await call("tfare", "app_data", { app: id, set: { ["k".repeat(65)]: 1 } })).toMatch(/printable/);
  expect(await call("tfare", "app_data", { app: id, set: { big: "x".repeat(600_000) } })).toMatch(/over/);
  for (let i = 0; i < APP_TASK_WRITES_PER_HOUR; i++) core.apps.fill(id, "tfare", { n: i });
  expect(await call("tfare", "app_data", { app: id, set: { n: 99 } })).toMatch(/this hour/);
});

test("a round's done report from a task that keeps an app current wakes nobody; a question still does", async () => {
  const { core, open } = boot();
  let woke = 0;
  core.setPartner({ onTrigger: () => void woke++ });
  open("tfare", "上海高铁票价", "每天早上看一下周五北京到上海的高铁票价。");
  core.apps.make(core.persona.id, { name: "高铁票价", html: "<p>x</p>", task: { id: "tfare", title: "上海高铁票价" } });
  core.log.append({ stream: "task:tfare", origin: "task", kind: "report", body: { taskId: "tfare", state: "done", summary: "第 4 轮：应用已更新。", questions: [], evidence: [] } });
  await settle();
  expect(woke).toBe(0);
  core.log.append({ stream: "task:tfare", origin: "task", kind: "report", body: { taskId: "tfare", state: "blocked", summary: "12306 要重新登录。", questions: [], evidence: [] } });
  await settle();
  expect(woke).toBeGreaterThan(0);
});
