// D85: detecting the four first-wave harnesses on a machine, from presence only.
import { expect, test } from "bun:test";
import { compareVersions, probeHarnesses } from "../src/harness-probe.ts";

const files = (m: Record<string, string>) => (p: string) => m[p];

test("a machine with all four: logins read from their own commands and files", async () => {
  const r = await probeHarnesses({
    which: (c) => (["claude", "codex", "node", "dsh"].includes(c) ? `/bin/${c}` : null),
    piBundled: () => "", // D363: node runs OAR's bundled pi (a checkout); no version to report
    exec: async (argv) =>
      argv[0]!.endsWith("claude")
        ? { code: 0, out: '{"loggedIn": true}' }
        : argv[0]!.endsWith("codex")
          ? { code: 0, out: "Logged in using ChatGPT" }
          : { code: 0, out: "0.2.2-rc.1" },
    env: {},
    home: "/h",
    dataDir: "/d",
    read: files({ "/h/.pi/agent/models.json": JSON.stringify({ providers: { minimax: { apiKey: "x" } } }), "/d/env": "DEEPSEEK_API_KEY=sk-x\n" }),
    // D415: no Antigravity here (never this Mac's own /Applications).
    exists: () => false,
    dangling: () => false,
  });
  expect(r).toEqual([
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    { harness: "pi", installed: true, loggedIn: true, canBePartner: true, billing: "usage" }, // D177
    // D156: a copy that answers --version says it; /bin/dsh is no channel Ducter knows.
    { harness: "deepseek-harness", installed: true, loggedIn: true, canBePartner: true, billing: "usage", version: "0.2.2-rc.1", how: "unknown" },
    { harness: "antigravity", installed: false, loggedIn: false, canBePartner: false },
  ]);
});

test("pi with no provider and DeepSeek Harness too old or without a key are not signed in", async () => {
  const base = { which: (c: string) => (c === "node" || c === "dsh" ? `/bin/${c}` : null), env: {}, home: "/h", dataDir: "/d", piBundled: () => "" };
  const old = await probeHarnesses({ ...base, exec: async () => ({ code: 0, out: "0.2.0" }), read: files({ "/d/env": "OO_TOKEN=x" }), only: ["pi", "deepseek-harness"] });
  expect(old).toEqual([
    { harness: "pi", installed: true, loggedIn: false, canBePartner: false },
    { harness: "deepseek-harness", installed: false, loggedIn: false, canBePartner: false },
  ]);
  const nokey = await probeHarnesses({ ...base, exec: async () => ({ code: 0, out: "0.2.2-rc.1" }), read: files({}), only: ["deepseek-harness"] });
  expect(nokey).toEqual([{ harness: "deepseek-harness", installed: true, loggedIn: false, canBePartner: false, version: "0.2.2-rc.1", how: "unknown" }]);
  const envKey = await probeHarnesses({ ...base, env: { DEEPSEEK_API_KEY: "sk" }, exec: async () => ({ code: 0, out: "dsh 0.2.1-rc.5" }), read: files({}), only: ["deepseek-harness"] });
  expect(envKey[0]!.loggedIn).toBe(true);
});

test("D371: DeepSeek Harness.app's own dsh, signed in with the DeepSeek account (no key): installed with the app, signed in", async () => {
  const bin = "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh";
  const grant = "version: 1\nrecords:\n  deepseek-account-platform/default:\n    kind: grant\n    payload:\n      version: 1\n      token: not-a-real-token\n      issuer: https://platform.deepseek.com\n";
  const r = await probeHarnesses({ which: (c) => (c === "dsh" ? bin : null), exec: async () => ({ code: 0, out: "0.2.2-rc.3\n" }), env: {}, home: "/h", dataDir: "/d", read: files({ "/h/.dsh/.credentials.yaml": grant }), realpath: (p) => p, only: ["deepseek-harness"] });
  expect(r).toEqual([{ harness: "deepseek-harness", installed: true, loggedIn: true, canBePartner: true, billing: "usage", version: "0.2.2-rc.3", how: "app" }]);
  // The app's "install the command" link in /usr/local/bin reads as the app's too.
  const linked = await probeHarnesses({ which: (c) => (c === "dsh" ? "/usr/local/bin/dsh" : null), exec: async () => ({ code: 0, out: "0.2.2-rc.3" }), env: {}, home: "/h", dataDir: "/d", read: files({}), realpath: () => bin, only: ["deepseek-harness"] });
  expect(linked[0]).toMatchObject({ how: "app", loggedIn: false });
  // A grant whose token is gone (signed out in the app) is not a sign-in.
  const out = await probeHarnesses({ which: (c) => (c === "dsh" ? bin : null), exec: async () => ({ code: 0, out: "0.2.2-rc.3" }), env: {}, home: "/h", dataDir: "/d", read: files({ "/h/.dsh/.credentials.yaml": "records:\n  deepseek-account-platform/device:\n    kind: plain\n    payload:\n      id: x\n" }), realpath: (p) => p, only: ["deepseek-harness"] });
  expect(out[0]!.loggedIn).toBe(false);
});

test("versions compare with prereleases", () => {
  expect(compareVersions("0.2.1-rc.5", "0.2.1-rc.5")).toBe(0);
  expect(compareVersions("0.2.2-rc.1", "0.2.1-rc.5")! > 0).toBe(true);
  expect(compareVersions("0.2.1-rc.4", "0.2.1-rc.5")! < 0).toBe(true);
  expect(compareVersions("0.2.1", "0.2.1-rc.5")! > 0).toBe(true);
  expect(compareVersions("x", "0.2.1")).toBeNull();
});

test("D363: node alone is not pi (the single binary runs only a pi command)", async () => {
  const r = await probeHarnesses({ which: (c) => (c === "node" ? "/usr/bin/node" : null), exec: async () => ({ code: 1, out: "" }), env: {}, home: "/h", dataDir: "/d", read: () => undefined, only: ["pi"] });
  expect(r[0]).toMatchObject({ harness: "pi", installed: false });
});
