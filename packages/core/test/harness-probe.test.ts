// D85: detecting the four first-wave harnesses on a machine, from presence only.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    // D416: no Antigravity here (never this Mac's own /Applications).
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
    { harness: "cursor", installed: false, loggedIn: false, canBePartner: false },
    { harness: "devin", installed: false, loggedIn: false, canBePartner: false },
    { harness: "kimi", installed: false, loggedIn: false, canBePartner: false },
    { harness: "opencode", installed: false, loggedIn: false, canBePartner: false },
    // D625: this build's OAR has no createDimRuntime (the caller passes the detector; the bare
    // default is false), so Dim says 即将支持 rather than offering an install or a sign-in.
    { harness: "dim", installed: false, loggedIn: false, canBePartner: false, trouble: { kind: "coming" } },
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

test("D600: the four new agents are read where their own installers put them, and their sign-in by presence only", async () => {
  const rows = await probeHarnesses({
    which: (c) => (c === "devin" || c === "kimi" || c === "opencode" || c === "agent" ? `/bin/${c}` : null),
    exec: async (argv) =>
      argv[1] === "--version"
        ? { code: 0, out: argv[0]!.includes("opencode") ? "opencode 2.3.0" : argv[0]!.includes("devin") ? "3000.14.30821" : argv[0]!.includes("kimi") ? "2.6.3" : "2026.11.1" }
        : argv[1] === "auth" && argv[2] === "status"
          ? { code: 0, out: "Logged in (via Devin).\n  User:\n    Email: a@b.c\n" }
          : argv[1] === "auth" && argv[2] === "list"
            ? { code: 0, out: '{"openai":{"type":"oauth"}}' }
            : { code: 1, out: "" },
    env: {},
    home: "/h",
    dataDir: "/d",
    read: () => undefined,
    exists: (p) => p === "/h/.kimi-code/credentials/kimi-code.json" || p === "/h/.kimi-code/bin/kimi" || p === "/h/.opencode/bin/opencode",
    only: ["cursor", "devin", "kimi", "opencode"],
    cursorBundled: () => "1.4.1",
  });
  expect(rows).toEqual([
    { harness: "cursor", installed: true, loggedIn: false, canBePartner: false, version: "1.4.1", how: "ducter" },
    { harness: "devin", installed: true, loggedIn: true, canBePartner: false, billing: "plan", version: "3000.14.30821", how: "unknown" },
    { harness: "kimi", installed: true, loggedIn: true, canBePartner: false, billing: "plan", version: "2.6.3", how: "unknown" },
    { harness: "opencode", installed: true, loggedIn: true, canBePartner: false, billing: "usage", version: "2.3.0", how: "unknown" },
  ]);
  // The Kimi OAuth file is only looked for; its contents never read (read stays unused above).
  const noSdk = await probeHarnesses({ ...({ which: () => null, exec: async () => ({ code: 1, out: "" }), env: {}, home: "/h", dataDir: "/d", read: () => undefined, exists: () => false } as const), only: ["cursor"] });
  expect(noSdk[0]).toMatchObject({ harness: "cursor", installed: false, loggedIn: false });
});

test("D625: Dim is coming soon without createDimRuntime, and detected on PATH once it is there", async () => {
  const base = { which: (c: string) => (c === "dima" ? "/bin/dima" : c === "dim-nightly" ? "/bin/dim-nightly" : null), exec: async () => ({ code: 0, out: "dimcode 0.1.0-alpha.29\n" }), env: {}, home: "/h", dataDir: "/d", read: () => undefined, exists: () => false, only: ["dim"] as const };
  const coming = await probeHarnesses({ ...base, dimRuntime: async () => false });
  expect(coming).toEqual([{ harness: "dim", installed: false, loggedIn: false, canBePartner: false, trouble: { kind: "coming" } }]);
  const here = await probeHarnesses({ ...base, dimRuntime: async () => true });
  expect(here).toEqual([{ harness: "dim", installed: true, loggedIn: true, canBePartner: false, billing: "usage", version: "0.1.0-alpha.29", how: "unknown" }]);
  // No `dima`: nothing but the truth, not a coming row (the build can run it, it isn't installed).
  const gone = await probeHarnesses({ ...base, which: () => null, dimRuntime: async () => true });
  expect(gone).toEqual([{ harness: "dim", installed: false, loggedIn: false, canBePartner: false }]);
  // A command that answers without Dim's own version line is not Dim.
  const wrong = await probeHarnesses({ ...base, exec: async () => ({ code: 0, out: "some other cli 1.2.3" }), dimRuntime: async () => true });
  expect(wrong[0]).toMatchObject({ harness: "dim", installed: false, loggedIn: false });
  // OAR_DIM_BIN alone is enough (OAR's own order), and the nightly names are candidates.
  const pinned = await probeHarnesses({ ...base, which: () => null, env: { OAR_DIM_BIN: "/opt/dima" }, dimRuntime: async () => true });
  expect(pinned[0]).toMatchObject({ harness: "dim", installed: true, loggedIn: true });
});

test("D630: Cursor is installed only when Ducter's pinned SDK is there, and says a Node floor plainly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-cursor-probe-"));
  const sdk = (version: string) => {
    const pkg = join(dir, "tools", "node", "lib", "node_modules", "@cursor", "sdk");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@cursor/sdk", version, type: "module", exports: { ".": "./index.mjs" } }));
    writeFileSync(join(pkg, "index.mjs"), "export const Cursor = {};\n");
  };
  const base = { which: () => null, exec: async () => ({ code: 1, out: "" }), env: {}, home: "/h", dataDir: dir, read: () => undefined, only: ["cursor"] as const };
  try {
    // Missing: the card offers 安装 (decorate adds installable); the probe itself says not there.
    expect((await probeHarnesses({ ...base, exists: () => false }))[0]).toEqual({ harness: "cursor", installed: false, loggedIn: false, canBePartner: false });
    sdk("1.4.1");
    // Ready, signed out: the SDK is there; no credential file and no key.
    expect((await probeHarnesses({ ...base, exists: () => false }))[0]).toEqual({ harness: "cursor", installed: true, loggedIn: false, canBePartner: false, version: "1.4.1", how: "ducter" });
    // Signed in by the SDK's own store, or by CURSOR_API_KEY in keys.env.
    expect((await probeHarnesses({ ...base, exists: (p: string) => p === "/h/.cursor/sdk/auth.json" }))[0]).toMatchObject({ installed: true, loggedIn: true });
    expect((await probeHarnesses({ ...base, exists: () => false, read: files({ [`${dir}/keys.env`]: "CURSOR_API_KEY=key_x\n" }) }))[0]).toMatchObject({ installed: true, loggedIn: true });
    // Node below OAR's 22.13 floor: said with the version and the need, never an install button.
    expect((await probeHarnesses({ ...base, exists: () => false, cursorNode: () => ({ version: "20.11.0", via: "ducter" }) }))[0]).toMatchObject({ installed: true, version: "1.4.1", trouble: { kind: "node_old", need: "22.13.0", have: "20.11.0", via: "ducter" } });
    // The system's Node is still Ducter's to avoid: the card says so and offers Ducter's own.
    expect((await probeHarnesses({ ...base, exists: () => false, cursorNode: () => ({ version: "20.11.0", via: "system" }) }))[0]).toMatchObject({ installed: true, trouble: { kind: "node_old", via: "system" } });
    // OAR pins the SDK exactly: another version is not runnable here.
    sdk("1.4.0");
    expect((await probeHarnesses({ ...base, exists: () => false }))[0]).toEqual({ harness: "cursor", installed: false, loggedIn: false, canBePartner: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("versions compare with prereleases", () => {
  expect(compareVersions("0.2.1-rc.5", "0.2.1-rc.5")).toBe(0);
  expect(compareVersions("0.2.2-rc.1", "0.2.1-rc.5")! > 0).toBe(true);
  expect(compareVersions("0.2.1-rc.4", "0.2.1-rc.5")! < 0).toBe(true);
  expect(compareVersions("0.2.1", "0.2.1-rc.5")! > 0).toBe(true);
  expect(compareVersions("x", "0.2.1")).toBeNull();
});

test("D549: as root, Claude Code is there and signed in but can't take a task (trouble root, never the partner); Codex runs", async () => {
  const base = {
    which: (c: string) => (["claude", "codex"].includes(c) ? `/bin/${c}` : null),
    exec: async (argv: string[]) => (argv[0]!.endsWith("claude") ? { code: 0, out: '{"loggedIn": true}' } : { code: 0, out: "Logged in using ChatGPT" }),
    env: {},
    home: "/root",
    dataDir: "/root/.ducter",
    read: () => undefined,
    only: ["claude-code", "codex"],
  };
  expect(await probeHarnesses({ ...base, uid: () => 0 })).toEqual([
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: false, billing: "plan", trouble: { kind: "root" } },
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
  ]);
  expect((await probeHarnesses({ ...base, uid: () => 1000 }))[0]).toEqual({ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" });
});

test("D363: node alone is not pi (the single binary runs only a pi command)", async () => {
  const r = await probeHarnesses({ which: (c) => (c === "node" ? "/usr/bin/node" : null), exec: async () => ({ code: 1, out: "" }), env: {}, home: "/h", dataDir: "/d", read: () => undefined, only: ["pi"] });
  expect(r[0]).toMatchObject({ harness: "pi", installed: false });
});
