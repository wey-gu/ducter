// D375: what Memory's Nowledge Mem head and a lent computer's Mem row say about Mem's own health.
import { expect, test } from "bun:test";
import type { BridgeView, DeviceMemView } from "@ducter/protocol";
import { memHealthLook } from "../src/mem-view.ts";
import { memRowHealth } from "../src/worker-mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";
import { workerMemWords } from "../src/i18n-workermem.ts";
import { TABLES } from "../src/i18n.ts";

const b = (x: Partial<BridgeView> = {}) => ({ state: "connected", ...x }) as BridgeView;

test("not read yet: the plain Connected; all well: the calm line", () => {
  expect(memHealthLook(undefined, b())).toEqual({ look: "unread" });
  expect(memHealthLook({}, b())).toEqual({ look: "ok" });
});

test("old: Update only when Ducter can run it, and never twice (the update row already offers it)", () => {
  expect(memHealthLook({ issue: "old" }, b({ canRun: true }))).toEqual({ look: "old", canUpdate: true });
  expect(memHealthLook({ issue: "old" }, b())).toEqual({ look: "old", canUpdate: false });
  expect(memHealthLook({ issue: "old" }, b({ state: "update_mem", canRun: true }))).toEqual({ look: "unread" });
});

test("unreachable and signed out are said as they are", () => {
  expect(memHealthLook({ issue: "unreachable" }, b())).toEqual({ look: "unreachable" });
  expect(memHealthLook({ issue: "signed_out" }, b())).toEqual({ look: "signed_out" });
});

test("plugin: the agents left, busy while Mem's own command runs, gone once it put one in", () => {
  const h = { issue: "plugin" as const, agents: ["claude-code", "codex"] };
  expect(memHealthLook(h, b(), [])).toEqual({ look: "plugin", agents: ["claude-code", "codex"], busy: false });
  expect(memHealthLook(h, b(), [{ harness: "codex", mem: { state: "absent", busy: true } }])).toEqual({ look: "plugin", agents: ["claude-code", "codex"], busy: true });
  expect(memHealthLook(h, b(), [{ harness: "claude-code", mem: { state: "installed", fresh: true } }])).toEqual({ look: "plugin", agents: ["codex"], busy: false });
  expect(memHealthLook(h, b(), ["claude-code", "codex"].map((harness) => ({ harness, mem: { state: "installed", fresh: true as const } })))).toEqual({ look: "ok" });
});

test("a lent computer's row: only while it would ask to sign in, and only these three", () => {
  const m = (x: Partial<DeviceMemView>) => ({ state: "sign_in", ...x }) as DeviceMemView;
  expect(memRowHealth(m({ health: { issue: "unreachable" } }))).toBe("unreachable");
  expect(memRowHealth(m({ health: { issue: "signed_out" } }))).toBe("signed_out");
  expect(memRowHealth(m({ health: { issue: "old" } }))).toBe("old");
  expect(memRowHealth(m({}))).toBeUndefined();
  expect(memRowHealth(m({ health: { issue: "plugin" } }))).toBeUndefined();
  expect(memRowHealth(m({ health: { issue: "unreachable" }, step: { phase: "connecting" } }))).toBeUndefined();
  expect(memRowHealth({ state: "ready", health: { issue: "unreachable" } })).toBeUndefined();
});

test("the words exist in both languages, the same keys", () => {
  for (const words of [memoryWords, workerMemWords]) {
    const zh = Object.keys(words.zh).filter((k) => k.includes("health") || k === "wmem.again" || k === "wmem.update");
    expect(zh.length).toBeGreaterThan(0);
    for (const k of zh) expect(words.en[k]).toBeTruthy();
  }
});

test("D375: the offer closed by itself reads as done; re-signing in has its own line", () => {
  expect(TABLES.zh["memp.card.done"]).toBe("已装好");
  expect(TABLES.en["memp.card.done"]).toBe("Installed");
  expect(TABLES.zh["mem.health.resign.how"]).toBe("在 Nowledge Mem 的 设置 › Connectors 里重新生成连接提示，把整段贴在这里。");
  expect(TABLES.en["mem.health.resign.how"]).toContain("Settings › Connectors");
});
