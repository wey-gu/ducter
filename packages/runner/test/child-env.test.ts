// D102: a harness child gets an explicit, minimal environment. Every key Ducter holds (its key
// file, a connection token) and every key in Ducter's own environment stays out of every harness
// that does not sign in with it. Checked through the real port (createOarHarnessPort.start) on
// OAR's scripted runtime, with a fake that records the env OAR would start the child with.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import { HARNESS_IDS, type HarnessId } from "@ducter/protocol";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createOarHarnessPort, codexKeyNames } from "../src/oar.ts";
import { allowedFor, childEnvironment, childEnvOverlay } from "../src/child-env.ts";

// Fake values only; never a real key.
const DS_KEY = "sk-ds-fake-0001";
const DS_FILE_KEY = "sk-ds-fake-file-0002";
const CLAUDE_TOKEN = "sk-ant-oat-fake-0003";
const OO_TOKEN = "oo-fake-connector-0004";
const CONN_TOKEN = "conn-fake-runtime-0005";

/** OAR's child env: the host env, then the overlay (a string sets, null removes): shared/environment.js. */
function sessionEnvironment(overlay: Record<string, string | null> | undefined, inherited: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(inherited)) if (typeof v === "string") out[k] = v;
  for (const [k, v] of Object.entries(overlay ?? {})) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** A scripted runtime that records the environment each session's process would get. */
function envCapture(seen: Partial<Record<HarnessId, Record<string, string>>>, h: HarnessId): Runtime {
  const rt = scriptedRuntime({ id: h, turn: async (t) => t.say("ok") });
  return new Proxy(rt, {
    get(target, prop, recv) {
      if (prop === "session")
        return (inst: any, options: any, ctx: any) => {
          seen[h] = sessionEnvironment(options.env, process.env);
          return target.session(inst, options, ctx);
        };
      return Reflect.get(target, prop, recv);
    },
  });
}

let dir: string;
const saved: Record<string, string | undefined> = {};
const PARENT: Record<string, string> = {
  DEEPSEEK_API_KEY: DS_KEY,
  OO_CONNECTOR_TOKEN: OO_TOKEN,
  OO_CONNECTOR_URL: "http://127.0.0.1:9/oo",
  GITHUB_TOKEN: "ghp-fake-0006",
  AWS_SECRET_ACCESS_KEY: "aws-fake-0007",
  NMEM_API_KEY: "nmem-fake-0008",
  DUCTER_TOKEN: "dtk-fake-0009",
  ANTHROPIC_BASE_URL: "https://example.invalid/anthropic",
  OPENAI_BASE_URL: "https://example.invalid/openai",
  SOME_RANDOM_SETTING: "x",
  DUCTER_PUBLIC_URL: "https://ducter.example.invalid",
  LC_ALL: "en_US.UTF-8",
};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-child-env-"));
  for (const [k, v] of Object.entries(PARENT)) (saved[k] = process.env[k]), (process.env[k] = v);
  // Ducter's own files: the key file and the connection token store (D96).
  writeFileSync(join(dir, "keys.env"), `DEEPSEEK_API_KEY=${DS_FILE_KEY}\nCLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_TOKEN}"\n`, { mode: 0o600 });
  writeFileSync(join(dir, "connection-tokens.json"), JSON.stringify({ c1: CONN_TOKEN }), { mode: 0o600 });
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
  rmSync(dir, { recursive: true, force: true });
});

const task = (harness: HarnessId): SessionSpec => ({
  harness,
  cwd: join(dir, "task"),
  appendSystemPrompt: "Brief.",
  mcp: [{ name: "ducter", url: "http://127.0.0.1:7777/mcp", headers: { Authorization: "Bearer dtk.test.sig" } }],
  permissionMode: "bypass",
});

async function openAll(): Promise<Partial<Record<HarnessId, Record<string, string>>>> {
  const seen: Partial<Record<HarnessId, Record<string, string>>> = {};
  const port = createOarHarnessPort({ loadRuntime: async (h) => envCapture(seen, h), dataDir: dir });
  for (const h of HARNESS_IDS) {
    const s = await port.start(task(h));
    await s.close();
    const p = await port.start({ ...task(h), isolateUserConfig: true, systemPrompt: "You are Ducter." });
    await p.close();
  }
  return seen;
}

const values = (env: Record<string, string>) => new Set(Object.values(env));

describe("a harness child's environment", () => {
  test("Claude Code, Codex and pi never see the DeepSeek key, a connection token or any other key", async () => {
    const seen = await openAll();
    for (const h of ["claude-code", "codex", "pi"] as const) {
      const env = seen[h]!;
      expect(env.DEEPSEEK_API_KEY).toBeUndefined();
      for (const k of ["OO_CONNECTOR_TOKEN", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "NMEM_API_KEY", "DUCTER_TOKEN"]) expect(env[k]).toBeUndefined();
      for (const secret of [DS_KEY, DS_FILE_KEY, OO_TOKEN, CONN_TOKEN]) expect(values(env).has(secret)).toBe(false);
      // No fake secret value under any name, except Claude Code's own login token (below).
      const { CLAUDE_CODE_OAUTH_TOKEN: _own, ...rest } = h === "claude-code" ? env : { ...env, CLAUDE_CODE_OAUTH_TOKEN: "" };
      expect(JSON.stringify(rest)).not.toContain("fake-0");
      // The basics stay.
      expect(env.PATH).toBe(process.env.PATH!);
      expect(env.HOME).toBe(process.env.HOME!);
      expect(env.LC_ALL).toBe("en_US.UTF-8");
      expect(env.DUCTER_PUBLIC_URL).toBe(PARENT.DUCTER_PUBLIC_URL!);
      expect(env.SOME_RANDOM_SETTING).toBeUndefined();
    }
  });

  test("each harness gets its own sign-in and settings, and only its own", async () => {
    const seen = await openAll();
    // pi, Codex and DeepSeek Harness never get the Claude Code token.
    for (const h of ["codex", "pi", "deepseek-harness"] as const) expect(seen[h]!.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(seen["claude-code"]!.ANTHROPIC_BASE_URL).toBe(PARENT.ANTHROPIC_BASE_URL!);
    expect(seen.codex!.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(seen.codex!.OPENAI_BASE_URL).toBe(PARENT.OPENAI_BASE_URL!);
    expect(seen["claude-code"]!.OPENAI_BASE_URL).toBeUndefined();
  });

  test("Claude Code gets its login token from Ducter's key file (a server's `claude setup-token`)", async () => {
    const seen = await openAll();
    expect(seen["claude-code"]!.CLAUDE_CODE_OAUTH_TOKEN).toBe(CLAUDE_TOKEN);
  });

  test("DeepSeek Harness sees its key; the environment Ducter runs with wins over the file", async () => {
    let seen = await openAll();
    const ds = seen["deepseek-harness"]!;
    expect(ds.DEEPSEEK_API_KEY).toBe(DS_KEY);
    for (const secret of [OO_TOKEN, CONN_TOKEN, CLAUDE_TOKEN]) expect(values(ds).has(secret)).toBe(false);
    delete process.env.DEEPSEEK_API_KEY;
    seen = await openAll();
    expect(seen["deepseek-harness"]!.DEEPSEEK_API_KEY).toBe(DS_FILE_KEY);
    expect(seen.pi!.DEEPSEEK_API_KEY).toBeUndefined();
  });

  test("the probes (installed, signed in, models) run with the same environment", async () => {
    const seen: Record<string, Record<string, string>> = {};
    const port = createOarHarnessPort({
      dataDir: dir,
      loadRuntime: async (h) => {
        const rt = scriptedRuntime({ id: h, turn: async (t) => t.say("ok") });
        return new Proxy(rt, {
          get(target, prop, recv) {
            if (prop === "installation")
              return async (o: any) => {
                seen[h] = sessionEnvironment(o?.env, process.env);
                return (target as any).installation(o);
              };
            return Reflect.get(target, prop, recv);
          },
        });
      },
    });
    await port.available();
    expect(seen.pi!.DEEPSEEK_API_KEY).toBeUndefined();
    expect(seen.codex!.OO_CONNECTOR_TOKEN).toBeUndefined();
    expect(seen["deepseek-harness"]!.DEEPSEEK_API_KEY).toBe(DS_KEY);
    expect(seen["claude-code"]!.CLAUDE_CODE_OAUTH_TOKEN).toBe(CLAUDE_TOKEN);
  });

  test("a real child process started with the overlay has only what was allowed", async () => {
    const overlay = childEnvOverlay("codex", { inherited: process.env, keys: { DEEPSEEK_API_KEY: DS_FILE_KEY } });
    const env = sessionEnvironment(overlay, process.env);
    const p = Bun.spawn(["/usr/bin/env"], { env, stdout: "pipe" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    expect(out).not.toContain("DEEPSEEK_API_KEY");
    expect(out).not.toContain("OO_CONNECTOR_TOKEN");
    expect(out).toContain("PATH=");
  });
});

describe("the allowlist", () => {
  test("Codex keeps the desktop app's browser access host (D130); no other harness does", () => {
    for (const n of ["BROWSER_USE_ACCESS_PIPE_PATH", "BROWSER_USE_ACCESS_EXECUTOR_ID", "BROWSER_USE_ACCESS_VERIFYING_IDENTITY"]) {
      expect(allowedFor("codex", n)).toBe(true);
      expect(allowedFor("claude-code", n)).toBe(false);
    }
    expect(allowedFor("codex", "BROWSER_USE_BACKEND_API_URL")).toBe(false);
  });

  test("secret-shaped names are dropped even under an allowed prefix; explicit vars pass", () => {
    expect(allowedFor("claude-code", "CLAUDE_CONFIG_DIR")).toBe(true);
    expect(allowedFor("claude-code", "ANTHROPIC_API_KEY")).toBe(false); // granted, not inherited by prefix
    expect(allowedFor("codex", "CODEX_HOME")).toBe(true);
    expect(allowedFor("pi", "PI_CODING_AGENT_DIR")).toBe(true);
    expect(allowedFor("pi", "GIT_ASKPASS")).toBe(true);
    expect(allowedFor("pi", "GIT_TOKEN")).toBe(false);
    expect(allowedFor("deepseek-harness", "DUCTER_APNS_KEY_FILE")).toBe(false);
    expect(allowedFor("deepseek-harness", "SSH_AUTH_SOCK")).toBe(true);
    const env = childEnvironment("pi", { inherited: { PATH: "/bin", ANTHROPIC_API_KEY: "a", DEEPSEEK_API_KEY: "d" }, explicit: { ENABLE_X: "1" } });
    expect(env).toEqual({ PATH: "/bin", ANTHROPIC_API_KEY: "a", ENABLE_X: "1" });
  });

  test("Codex also gets the key its own config names for a custom provider", () => {
    expect(codexKeyNames({ model_providers: { azure: { env_key: "AZURE_OPENAI_API_KEY" }, bad: { env_key: "x y" } } })).toEqual(["AZURE_OPENAI_API_KEY"]);
    const env = childEnvironment("codex", { inherited: { AZURE_OPENAI_API_KEY: "z", MISTRAL_API_KEY: "m" }, grants: ["AZURE_OPENAI_API_KEY"] });
    expect(env).toEqual({ AZURE_OPENAI_API_KEY: "z" });
  });

  test("the overlay nulls what was left out and repeats nothing kept unchanged", () => {
    const o = childEnvOverlay("claude-code", { inherited: { PATH: "/bin", CLAUDE_CODE_SESSION_ID: "s", OPENAI_API_KEY: "o" }, keys: { CLAUDE_CODE_OAUTH_TOKEN: "t" } });
    // CLAUDE_CODE_SESSION_ID is not repeated: OAR's own parent-session removal still applies to it.
    expect(o).toEqual({ OPENAI_API_KEY: null, CLAUDE_CODE_OAUTH_TOKEN: "t" });
  });
});
