// D272: the one place that decides what a task environment inherits for git and GitHub. A task
// on the person's computer keeps the route to their own git sign-in (HOME, gh's config folder,
// the ssh agent) and nothing else of theirs; a sandbox gets a scoped token and the helper made
// explicit. Fake values only; never a real key.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessEnv } from "../src/oar.ts";
import { CREDENTIAL_ROUTE, taskCredentials } from "../src/task-credentials.ts";
import { childEnvironment } from "../src/child-env.ts";
import { createWorkerHost } from "../src/worker-host.ts";
import type { GhRun } from "@ducter/protocol/src/git-login.ts";

const PERSON = {
  PATH: "/usr/bin:/bin",
  HOME: "/home/wey",
  USER: "wey",
  GH_CONFIG_DIR: "/home/wey/.config/gh-work",
  GIT_CONFIG_GLOBAL: "/home/wey/.gitconfig-ducter",
  SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
  XDG_CONFIG_HOME: "/home/wey/.config",
  // Not the task's:
  GH_TOKEN: "ghp_fake_person_token_0001",
  GITHUB_TOKEN: "ghp_fake_person_token_0002",
  OPENAI_API_KEY: "sk-fake-openai-0003",
  ANTHROPIC_API_KEY: "sk-ant-fake-0004",
  STRIPE_SECRET_KEY: "sk_live_fake_0005",
  AWS_SECRET_ACCESS_KEY: "aws-fake-0006",
  DATABASE_URL: "postgres://u:p@h/db",
};

describe("D272 task credentials", () => {
  test("home: the route to the person's own git sign-in, only the names set", () => {
    const c = taskCredentials({ kind: "home" }, PERSON);
    expect(c.route).toBe("person's git and gh, from home");
    expect(c.env).toEqual({
      HOME: "/home/wey",
      GH_CONFIG_DIR: "/home/wey/.config/gh-work",
      GIT_CONFIG_GLOBAL: "/home/wey/.gitconfig-ducter",
      SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
      XDG_CONFIG_HOME: "/home/wey/.config",
    });
    for (const k of Object.keys(c.env)) expect(CREDENTIAL_ROUTE as readonly string[]).toContain(k);
  });

  test("a task's environment carries the git credential route and not unrelated keys", () => {
    const data = mkdtempSync(join(tmpdir(), "ducter-taskcred-"));
    try {
      for (const h of ["claude-code", "codex", "pi"] as const) {
        const overlay = harnessEnv(h, { dataDir: data, inherited: PERSON });
        // What OAR starts the child with: the host's env, then the overlay (null removes).
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(PERSON)) env[k] = v;
        for (const [k, v] of Object.entries(overlay)) {
          if (v === null) delete env[k];
          else env[k] = v;
        }
        expect(env.HOME).toBe("/home/wey");
        expect(env.GH_CONFIG_DIR).toBe("/home/wey/.config/gh-work"); // gh's login folder: kept (was dropped before D272)
        expect(env.GIT_CONFIG_GLOBAL).toBe("/home/wey/.gitconfig-ducter");
        expect(env.SSH_AUTH_SOCK).toBe("/tmp/ssh-agent.sock");
        for (const k of ["GH_TOKEN", "GITHUB_TOKEN", "STRIPE_SECRET_KEY", "AWS_SECRET_ACCESS_KEY", "DATABASE_URL"]) expect(env[k]).toBeUndefined();
        if (h === "claude-code") expect(env.OPENAI_API_KEY).toBeUndefined(); // pi and Codex may sign in with it (HARNESS_KEYS)
        if (h === "codex") expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      }
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });

  test("sandbox: a scoped token and gh as github.com's only helper, never the person's environment", () => {
    const c = taskCredentials({ kind: "sandbox", githubToken: "ghs_fake_scoped_0007", ghPath: "/opt/gh/bin/gh" }, PERSON);
    expect(c.route).toBe("scoped token through gh");
    expect(c.env.GH_TOKEN).toBe("ghs_fake_scoped_0007");
    expect(c.env.GITHUB_TOKEN).toBeNull();
    expect(c.env.GIT_CONFIG_VALUE_0).toBe(""); // other helpers for the host cleared first
    expect(c.env.GIT_CONFIG_VALUE_1).toBe("!/opt/gh/bin/gh auth git-credential");
    expect(c.env.HOME).toBeUndefined();
    expect(JSON.stringify(c.env)).not.toContain("ghp_fake_person_token");
    // Passed explicitly into a sandboxed child, it survives the allowlist; the person's keys don't.
    const env = childEnvironment("claude-code", { inherited: { PATH: "/bin" }, explicit: c.env });
    expect(env.GH_TOKEN).toBe("ghs_fake_scoped_0007");
    expect(env.GIT_CONFIG_KEY_1).toBe("credential.https://github.com.helper");
    // No token for it: none at all.
    expect(taskCredentials({ kind: "sandbox" }, PERSON)).toEqual({ route: "none", env: { GH_TOKEN: null, GITHUB_TOKEN: null } });
  });
});

describe("D272 worker ops", () => {
  const host = (ghRun?: GhRun, dataDir = mkdtempSync(join(tmpdir(), "ducter-wk-"))) => {
    const sent: any[] = [];
    const h = createWorkerHost({ dataDir, home: dataDir, harness: { start: async () => ({}) as never, available: async () => [] } as never, mainBase: "http://x", deviceToken: "t", send: (f) => sent.push(f), ...(ghRun ? { ghRun } : {}) });
    const call = async (op: string, args: object) => {
      await h.handle({ t: "req", id: 1, op, args } as never);
      return sent.pop();
    };
    return { call, dataDir };
  };

  test("newFolder makes it in this computer's Ducter folder, checking the name here again", async () => {
    const { call, dataDir } = host();
    try {
      const ok = await call("newFolder", { name: "Trip plans" });
      expect(ok.ok).toBe(true);
      expect(ok.result).toEqual({ ok: true, path: join(dataDir, "ducter", "projects", "Trip plans"), name: "Trip plans" });
      expect((await call("newFolder", { name: "../x" })).result.ok).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("gitLogin answers this computer's gh status, and a token goes to gh's stdin only", async () => {
    const seen: { args: string[]; stdin?: string }[] = [];
    const gh: GhRun = async (args, o) => {
      seen.push({ args, ...(o.stdin !== undefined ? { stdin: o.stdin } : {}) });
      if (args[1] === "status") return seen.some((s) => s.stdin) ? { code: 0, out: JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, login: "wey-gu" }] } }), err: "" } : { code: 1, out: "", err: "not logged in" };
      return { code: 0, out: "", err: "" };
    };
    const { call, dataDir } = host(gh);
    try {
      expect((await call("gitLogin", { action: "status" })).result).toEqual({ state: "signed_out" });
      const tok = "ghp_" + "b".repeat(36);
      expect((await call("gitLogin", { action: "token", token: tok })).result).toEqual({ state: "signed_in", account: "wey-gu" });
      expect(seen.find((s) => s.stdin)?.stdin).toBe(tok + "\n");
      expect(seen.some((s) => s.args.includes(tok))).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
