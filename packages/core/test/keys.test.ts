// D102: keys live in <dataDir>/keys.env (0600); an older <dataDir>/env (a server unit's
// EnvironmentFile) keeps only settings. The move is idempotent and tightens permissions.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSecretName, migrateKeys, readKeys, scrubKeysFromEnv } from "@ducter/protocol/src/keys.ts";
import { startCore } from "../src/core.ts";
import { probeHarnesses } from "../src/harness-probe.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-keys-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mode = (p: string) => statSync(p).mode & 0o777;
const OLD = [
  "# Ducter on this server",
  "DUCTER_PUBLIC_URL=https://ducter.example.invalid",
  "HTTPS_PROXY=http://127.0.0.1:3128",
  'DEEPSEEK_API_KEY="sk-ds-fake-1"',
  "export CLAUDE_CODE_OAUTH_TOKEN='sk-ant-oat-fake-2'",
  "",
].join("\n");

test("keys move from env to keys.env; settings stay; both end 0600; a second run changes nothing", () => {
  writeFileSync(join(dir, "env"), OLD, { mode: 0o644 });
  expect(migrateKeys(dir).moved.sort()).toEqual(["CLAUDE_CODE_OAUTH_TOKEN", "DEEPSEEK_API_KEY"]);
  const env = readFileSync(join(dir, "env"), "utf8");
  const keys = readFileSync(join(dir, "keys.env"), "utf8");
  expect(env).not.toContain("sk-");
  expect(env).toContain("DUCTER_PUBLIC_URL=https://ducter.example.invalid");
  expect(env).toContain("HTTPS_PROXY=http://127.0.0.1:3128");
  expect(env).toContain("# Ducter on this server");
  expect(readKeys(dir)).toEqual({ DEEPSEEK_API_KEY: "sk-ds-fake-1", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-fake-2" });
  expect(mode(join(dir, "env"))).toBe(0o600);
  expect(mode(join(dir, "keys.env"))).toBe(0o600);

  expect(migrateKeys(dir).moved).toEqual([]);
  expect(readFileSync(join(dir, "env"), "utf8")).toBe(env);
  expect(readFileSync(join(dir, "keys.env"), "utf8")).toBe(keys);
});

test("a key already in keys.env keeps its value; loose permissions on keys.env are tightened", () => {
  writeFileSync(join(dir, "keys.env"), "DEEPSEEK_API_KEY=sk-ds-fake-new\n", { mode: 0o644 });
  writeFileSync(join(dir, "env"), "DEEPSEEK_API_KEY=sk-ds-fake-old\nOPENAI_API_KEY=sk-oa-fake\n");
  migrateKeys(dir);
  expect(readKeys(dir)).toEqual({ DEEPSEEK_API_KEY: "sk-ds-fake-new", OPENAI_API_KEY: "sk-oa-fake" });
  expect(readFileSync(join(dir, "env"), "utf8")).not.toContain("sk-");
  expect(mode(join(dir, "keys.env"))).toBe(0o600);
});

test("no env file: nothing to move, nothing created", () => {
  expect(migrateKeys(dir).moved).toEqual([]);
  expect(existsSync(join(dir, "keys.env"))).toBe(false);
  expect(existsSync(join(dir, "env"))).toBe(false);
});

test("an un-migrated env file is still read for keys (until the move), keys.env wins", () => {
  writeFileSync(join(dir, "env"), "DEEPSEEK_API_KEY=sk-ds-fake-old\nDUCTER_PUBLIC_URL=x\n");
  writeFileSync(join(dir, "keys.env"), "CLAUDE_CODE_OAUTH_TOKEN=t\n");
  expect(readKeys(dir)).toEqual({ DEEPSEEK_API_KEY: "sk-ds-fake-old", CLAUDE_CODE_OAUTH_TOKEN: "t" });
});

test("secret-shaped names", () => {
  for (const n of ["DEEPSEEK_API_KEY", "OO_CONNECTOR_TOKEN", "AWS_SECRET_ACCESS_KEY", "DB_PASSWORD", "GITHUB_TOKEN", "ANTHROPIC_AUTH_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS"]) expect(isSecretName(n)).toBe(true);
  for (const n of ["PATH", "PWD", "SSH_AUTH_SOCK", "KEYCHAIN_PATH", "CLAUDE_CODE_MAX_OUTPUT_TOKENS", "ANTHROPIC_BASE_URL", "BYPASS_MODE"]) expect(isSecretName(n)).toBe(false);
});

test("scrub drops only a variable whose value is the key file's", () => {
  const env: Record<string, string | undefined> = { DEEPSEEK_API_KEY: "a", OPENAI_API_KEY: "mine", PATH: "/bin" };
  expect(scrubKeysFromEnv({ DEEPSEEK_API_KEY: "a", OPENAI_API_KEY: "other" }, env)).toEqual(["DEEPSEEK_API_KEY"]);
  expect(env).toEqual({ OPENAI_API_KEY: "mine", PATH: "/bin" });
});

test("starting core moves the keys and takes the ones a unit loaded out of its environment", () => {
  writeFileSync(join(dir, "env"), "DEEPSEEK_API_KEY=sk-ds-fake-core\n", { mode: 0o644 });
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "sk-ds-fake-core"; // what systemd's EnvironmentFile did
  try {
    const core = startCore({ dataDir: dir, port: 0 });
    core.stop();
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(readKeys(dir).DEEPSEEK_API_KEY).toBe("sk-ds-fake-core");
    expect(readFileSync(join(dir, "env"), "utf8")).not.toContain("sk-");
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
});

test("the probes read keys.env: DeepSeek Harness's key, Claude Code's token; pi is not signed in by the DeepSeek key", async () => {
  const files: Record<string, string> = { "/d/keys.env": "DEEPSEEK_API_KEY=sk-x\nCLAUDE_CODE_OAUTH_TOKEN=t\n" };
  const r = await probeHarnesses({
    which: (c) => (["claude", "node", "dsh"].includes(c) ? `/bin/${c}` : null),
    exec: async (argv) => (argv[0] === "claude" ? { code: 1, out: '{"loggedIn": false}' } : { code: 0, out: "0.2.2-rc.1" }),
    env: {},
    home: "/h",
    dataDir: "/d",
    read: (p) => files[p],
    only: ["claude-code", "pi", "deepseek-harness"],
  });
  expect(r.map((h) => [h.harness, h.loggedIn])).toEqual([
    ["claude-code", true],
    ["pi", false],
    ["deepseek-harness", true],
  ]);
});
