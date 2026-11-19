// D366: Nowledge Mem's row on a computer for tasks: its look, the agents not connected yet, and
// when the lend sheet shows it; the words in both languages.
import { expect, test } from "bun:test";
import type { DeviceHarness } from "@ducter/protocol";
import { lendShowsMem, memKeepsPaste, memRowHealth, memRowLook, memRowTheirs, theirUpdateCommand, unconnected } from "../src/worker-mem-view.ts";
import { workerMemWords } from "../src/i18n-workermem.ts";

const h = (harness: string, installed: boolean, loggedIn = installed): DeviceHarness => ({ harness, installed, loggedIn, canBePartner: false });

test("a step under way or failed leads; else where it stands", () => {
  expect(memRowLook({ state: "absent", installable: true })).toBe("absent");
  expect(memRowLook({ state: "absent", step: { phase: "installing", pct: 20 } })).toBe("installing");
  expect(memRowLook({ state: "sign_in", step: { phase: "connecting" } })).toBe("connecting");
  expect(memRowLook({ state: "sign_in", step: { phase: "failed", reason: "used" } })).toBe("failed");
  expect(memRowLook({ state: "ready" })).toBe("ready");
});

test("an agent installed after the sign-in is left to connect; pi is never asked for", () => {
  const harnesses = [h("codex", true), h("claude-code", true), h("pi", true)];
  expect(unconnected({ harnesses, mem: { state: "ready", agents: ["codex"] } })).toEqual(["claude-code"]);
  expect(unconnected({ harnesses, mem: { state: "ready", agents: ["codex", "claude-code"] } })).toEqual([]);
  expect(unconnected({ harnesses, mem: { state: "sign_in" } })).toEqual([]);
});

test("the lend sheet shows it once an agent is signed in there", () => {
  expect(lendShowsMem({ harnesses: [h("codex", true, false)], mem: { state: "absent" } })).toBe(false);
  expect(lendShowsMem({ harnesses: [h("codex", true)], mem: { state: "absent" } })).toBe(true);
  expect(lendShowsMem({ harnesses: [h("codex", true)] })).toBe(false);
});

test("never Mem's plumbing words (D295): no CLI, Space, identity, key", () => {
  for (const v of [...Object.values(workerMemWords.zh), ...Object.values(workerMemWords.en)]) expect(v).not.toMatch(/\bCLI\b|Space|identity|API key|nmem /);
});

test("D370: the sign-in says what Mem really gives (its button, the whole thing) and every reason has words", () => {
  for (const L of [workerMemWords.zh, workerMemWords.en]) {
    for (const r of ["network", "space", "unsupported", "bad_link", "used", "unreachable", "refused", "old", "failed"]) expect(L[`wmem.failed.${r}`]).toBeTruthy();
    expect(L["wmem.signin.ph"]).toBeTruthy();
    expect(L["wmem.signin.ph"]).not.toContain("nmem_connect");
    expect(L["wmem.failed.bad_link"]).not.toMatch(/https:\/\/|nmem_connect/);
  }
  expect(workerMemWords.zh["wmem.signin.how"]).toContain("生成连接链接并复制提示");
  expect(workerMemWords.zh["wmem.signin.how"]).toContain("整段");
  expect(workerMemWords.en["wmem.signin.how"]).toContain("Generate connect link & copy prompt");
  expect(workerMemWords.zh["wmem.failed.used"]).toContain("15 分钟");
});

test("D386: the person's own nmem too old: its own row, never the paste; Ducter's own used once there", () => {
  const old = { state: "sign_in" as const, health: { issue: "old" as const }, theirs: { old: true as const, how: "pipx" as const }, installable: true };
  expect(memRowTheirs(old)).toBe("old");
  expect(memRowHealth(old)).toBeUndefined(); // not D375's "update it with its own guide"
  expect(memRowTheirs({ state: "sign_in", ours: true, theirs: { old: true } })).toBe("using");
  expect(memRowTheirs({ state: "sign_in" })).toBeUndefined();
  expect(theirUpdateCommand("pipx")).toBe("pipx upgrade nmem-cli");
  expect(theirUpdateCommand("uv")).toBe("uv tool upgrade nmem-cli");
  expect(theirUpdateCommand(undefined)).toBeUndefined();
});

test("D386: a paste stays after a failure only when it wasn't spent", () => {
  for (const r of ["bad_link", "old", "network", "space", "unsupported", "unreachable"] as const) expect(memKeepsPaste(r)).toBe(true);
  for (const r of ["used", "refused", "failed", undefined] as const) expect(memKeepsPaste(r)).toBe(false);
  for (const L of [workerMemWords.zh, workerMemWords.en]) for (const k of ["wmem.theirs.old", "wmem.theirs.why", "wmem.theirs.install", "wmem.theirs.using", "wmem.theirs.cmd", "wmem.theirs.guide"]) expect(L[k]).toBeTruthy();
});
