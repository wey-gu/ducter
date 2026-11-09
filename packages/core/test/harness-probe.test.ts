// D85: detecting the four first-wave harnesses on a machine, from presence only.
import { expect, test } from "bun:test";
import { compareVersions, probeHarnesses } from "../src/harness-probe.ts";

const files = (m: Record<string, string>) => (p: string) => m[p];

test("a machine with all four: logins read from their own commands and files", async () => {
  const r = await probeHarnesses({
    which: (c) => (["claude", "codex", "node", "dsh"].includes(c) ? `/bin/${c}` : null),
    exec: async (argv) =>
      argv[0] === "claude"
        ? { code: 0, out: '{"loggedIn": true}' }
        : argv[0] === "codex"
          ? { code: 0, out: "Logged in using ChatGPT" }
          : { code: 0, out: "0.2.2-rc.1" },
    env: {},
    home: "/h",
    dataDir: "/d",
    read: files({ "/h/.pi/agent/models.json": JSON.stringify({ providers: { minimax: { apiKey: "x" } } }), "/d/env": "DEEPSEEK_API_KEY=sk-x\n" }),
  });
  expect(r).toEqual([
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    { harness: "pi", installed: true, loggedIn: true, canBePartner: false, billing: "usage" },
    { harness: "deepseek-harness", installed: true, loggedIn: true, canBePartner: false, billing: "usage" },
  ]);
});

test("pi with no provider and DeepSeek Harness too old or without a key are not signed in", async () => {
  const base = { which: (c: string) => (c === "node" || c === "dsh" ? `/bin/${c}` : null), env: {}, home: "/h", dataDir: "/d" };
  const old = await probeHarnesses({ ...base, exec: async () => ({ code: 0, out: "0.2.0" }), read: files({ "/d/env": "DEEPSEEK_API_KEY=sk-x" }), only: ["pi", "deepseek-harness"] });
  expect(old).toEqual([
    { harness: "pi", installed: true, loggedIn: false, canBePartner: false },
    { harness: "deepseek-harness", installed: false, loggedIn: false, canBePartner: false },
  ]);
  const nokey = await probeHarnesses({ ...base, exec: async () => ({ code: 0, out: "0.2.2-rc.1" }), read: files({}), only: ["deepseek-harness"] });
  expect(nokey).toEqual([{ harness: "deepseek-harness", installed: true, loggedIn: false, canBePartner: false }]);
  const envKey = await probeHarnesses({ ...base, env: { DEEPSEEK_API_KEY: "sk" }, exec: async () => ({ code: 0, out: "dsh 0.2.1-rc.5" }), read: files({}), only: ["deepseek-harness"] });
  expect(envKey[0]!.loggedIn).toBe(true);
});

test("versions compare with prereleases", () => {
  expect(compareVersions("0.2.1-rc.5", "0.2.1-rc.5")).toBe(0);
  expect(compareVersions("0.2.2-rc.1", "0.2.1-rc.5")! > 0).toBe(true);
  expect(compareVersions("0.2.1-rc.4", "0.2.1-rc.5")! < 0).toBe(true);
  expect(compareVersions("0.2.1", "0.2.1-rc.5")! > 0).toBe(true);
  expect(compareVersions("x", "0.2.1")).toBeNull();
});
