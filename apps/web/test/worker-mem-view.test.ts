// D364: Nowledge Mem's row on a computer for tasks: its look, the agents not connected yet, and
// when the lend sheet shows it; the words in both languages.
import { expect, test } from "bun:test";
import type { DeviceHarness } from "@ducter/protocol";
import { lendShowsMem, memRowLook, unconnected } from "../src/worker-mem-view.ts";
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

test("every word in both languages, with the same blanks", () => {
  const zh = workerMemWords.zh;
  const en = workerMemWords.en;
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  for (const k of Object.keys(zh)) expect([k, (zh[k]!.match(/%s/g) ?? []).length]).toEqual([k, (en[k]!.match(/%s/g) ?? []).length]);
  // Never Mem's plumbing words (D295): no CLI, Space, identity, key.
  for (const v of [...Object.values(zh), ...Object.values(en)]) expect(v).not.toMatch(/\bCLI\b|Space|identity|API key|nmem /);
});
