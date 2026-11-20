// D415: Antigravity's sessions through OAR 0.124, on OAR's own declared contract (its runtime's
// refusedSessionOptions, held by a scripted runtime that refuses by presence what agy refuses).
// No agy runs: what each spec becomes, Ducter's MCP over its stdio bridge with no credential in
// the entry, the brief appended to agy's own instructions (again on every resume), and a resume
// in another folder refused the way OAR refuses it.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import { ResumeCwdError, type Runtime } from "@botiverse/oar/browser";
import { antigravityRuntime } from "@botiverse/oar/runtimes/antigravity";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { adaptSpec, createOarHarnessPort } from "../src/oar.ts";
import { childEnvironment } from "../src/child-env.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-agy-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ducterMcp = { name: "ducter", url: "http://127.0.0.1:7777/mcp?task=t1", headers: { Authorization: "Bearer dtk.test.sig" } };
const task = (over: Partial<SessionSpec> = {}): SessionSpec => ({
  harness: "antigravity",
  cwd: join(dir, "repo"),
  appendSystemPrompt: "Brief: fix the flaky test.",
  mcp: [ducterMcp],
  permissionMode: "bypass",
  ...over,
});
const refused = antigravityRuntime.refusedSessionOptions as Record<string, string>;

test("OAR 0.124's own declarations for agy: what Ducter's adapter is built on", () => {
  for (const k of ["systemPrompt", "disallowedTools", "userConfiguration", "mcpServerCredentials", "additionalDirectories", "fork"]) expect(k in refused).toBe(true);
  expect(antigravityRuntime.minVersion).toBe("1.5.0");
  expect(antigravityRuntime.sessionCapabilities()).toMatchObject({ steer: true, mcpTransports: expect.arrayContaining(["stdio"]) });
  expect(antigravityRuntime.manualCompaction.kind).toBe("unsupported");
  expect(antigravityRuntime.brand.name).toBe("Antigravity");
});

test("a task: the brief appended to agy's own, nothing it refuses sent, Ducter's MCP over the bridge with no credential in the entry", () => {
  const a = adaptSpec(task({ disallowedTools: ["WebFetch"], effort: "high", model: "gemini-3.8-flash" }), { dataDir: dir, refused });
  expect(a.options.appendSystemPrompt).toBe("Brief: fix the flaky test.");
  expect(a.preamble).toBeUndefined();
  expect(a.options).toMatchObject({ model: "gemini-3.8-flash", effort: "high" });
  for (const k of ["systemPrompt", "disallowedTools", "userConfiguration", "launchArgs"]) expect(k in a.options).toBe(false);
  const [m] = a.options.mcpServers as { name: string; command: string; args: string[]; env?: unknown }[];
  expect(m!.name).toBe("ducter");
  expect("url" in m! || "headers" in m! || "env" in m!).toBe(false);
  // The token lives in a 0600 file under Ducter's folder, never in what agy writes to its database.
  const file = m!.args.at(-1)!;
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ url: ducterMcp.url, headers: ducterMcp.headers });
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(a.options.mcpServers)).not.toContain("dtk.");
});

test("a system prompt (never the partner, but any spec that carries one) joins the appended instructions", () => {
  const a = adaptSpec(task({ systemPrompt: "You are a careful engineer." }), { dataDir: dir, refused });
  expect(a.options.systemPrompt).toBeUndefined();
  expect(a.options.appendSystemPrompt).toBe("You are a careful engineer.\n\nBrief: fix the flaky test.");
});

test("a stdio entry carrying its own env is left out (agy would keep it on disk)", () => {
  const a = adaptSpec(task({ mcp: [ducterMcp, { name: "cua", command: "/x/cua", env: { CUA_TOKEN: "t" } }] }), { dataDir: dir, refused });
  expect((a.options.mcpServers as { name: string }[]).map((m) => m.name)).toEqual(["ducter"]);
});

test("its child keeps where agy is and keeps its state; no other agent's key reaches it", () => {
  const env = childEnvironment("antigravity", { inherited: { PATH: "/usr/bin", HOME: "/h", OAR_ANTIGRAVITY_BIN: "/opt/agy", GEMINI_HOME: "/h/.g", AGY_CLI_DISABLE_AUTO_UPDATE: "true", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b", DEEPSEEK_API_KEY: "c" } });
  expect(env).toMatchObject({ OAR_ANTIGRAVITY_BIN: "/opt/agy", GEMINI_HOME: "/h/.g", AGY_CLI_DISABLE_AUTO_UPDATE: "true" });
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"]) expect(k in env).toBe(false);
});

/** A scripted runtime holding agy's contract: refuses by presence, refuses credentials in MCP entries, resume only in its own folder. */
function agyLike(seen: { options: any[]; inputs: string[]; cwdOf: Map<string, string> }, turn: (t: ScriptedTurn) => Promise<void> = async (t) => t.say("done")): Runtime {
  const rt = scriptedRuntime({
    id: "antigravity",
    turn: async (t) => {
      seen.inputs.push(t.input);
      await turn(t);
    },
  });
  return new Proxy(rt, {
    get(target, prop, recv) {
      if (prop === "refusedSessionOptions") return refused;
      if (prop === "session")
        return async (inst: any, options: any, ctx: any) => {
          for (const k of Object.keys(refused)) if (k in options) throw new Error(`refused: ${k}`);
          if ((options.mcpServers ?? []).some((s: any) => s.headers || (s.env && Object.keys(s.env).length))) throw new Error("refused: mcpServerCredentials");
          if (options.resume && seen.cwdOf.get(options.resume) !== options.cwd)
            throw new ResumeCwdError("Antigravity keeps a resumed session in its saved directory", { sessionId: options.resume, requestedCwd: options.cwd, reason: "other_cwd", savedCwd: seen.cwdOf.get(options.resume) ?? "/elsewhere" });
          seen.options.push(options);
          const s = await target.session(inst, options, ctx);
          seen.cwdOf.set(s.id, options.cwd);
          return s;
        };
      return Reflect.get(target, prop, recv);
    },
  });
}

test("on the scripted runtime: a turn runs; a resume gets its instructions again; a resume elsewhere is refused (the runner starts afresh)", async () => {
  const seen = { options: [] as any[], inputs: [] as string[], cwdOf: new Map<string, string>() };
  const port = createOarHarnessPort({ loadRuntime: async () => agyLike(seen), dataDir: dir });
  const s = await port.start(task());
  const it = s.events()[Symbol.asyncIterator]();
  await s.send("Start.");
  while (!(await it.next()).value?.turnEnd);
  // No preamble: the brief went as appended instructions, not into the first message.
  expect(seen.inputs[0]).toBe("Start.");
  await s.close();

  const back = await port.start(task({ resumeSessionId: s.id }));
  expect(seen.options.at(-1)).toMatchObject({ resume: s.id, appendSystemPrompt: "Brief: fix the flaky test." });
  await back.close();

  const moved = port.start(task({ resumeSessionId: s.id, cwd: join(dir, "other") }));
  await expect(moved).rejects.toBeInstanceOf(ResumeCwdError);
});

test("an agy OAR refuses (below 1.5.0) says why, not 'not installed'", async () => {
  const port = createOarHarnessPort({
    loadRuntime: async () => ({ installation: async () => ({ kind: "unsupported", code: "version_unsupported", reason: "Antigravity requires a stable agy CLI 1.5.0 or newer with native ACP; this installation reports 1.4.9" }) }) as any,
    dataDir: dir,
  });
  await expect(port.start(task())).rejects.toThrow(/can't run here: Antigravity requires a stable agy CLI 1\.5\.0/);
});

test("available(): signed in by agy's own authStatus; its models listed in Ducter's folder", async () => {
  let listedIn = "";
  const rt = {
    installation: async () => ({ kind: "available", via: "executable", command: "/home/w/.local/bin/agy", version: "1.5.13" }),
    authStatus: async () => ({ kind: "logged_in" }),
    listModels: async (_: unknown, o: { cwd?: string }) => ((listedIn = o.cwd ?? ""), { kind: "ok", models: [{ id: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash", effortLevels: ["low", "medium", "high"] }, { id: "claude-sonnet-5-5" }] }),
  };
  const port = createOarHarnessPort({ loadRuntime: async (h) => (h === "antigravity" ? (rt as any) : undefined), dataDir: join(dir, "d") });
  const ag = (await port.available()).find((h) => h.harness === "antigravity");
  expect(ag).toMatchObject({ installed: true, loggedIn: true, models: ["gemini-3.8-flash", "claude-sonnet-5-5"] });
  expect(await port.models!("antigravity")).toEqual([
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", efforts: ["low", "medium", "high"] },
    { id: "claude-sonnet-5-5", label: "claude-sonnet-5-5" },
  ]);
  expect(listedIn).toBe(join(dir, "d"));
});

test("D415 sign-out through the port: OAR's logout, confirmed by agy's own status", async () => {
  let asked = 0;
  const rt = (kind: string) => ({ installation: async () => ({ kind: "available", via: "executable", command: "/h/.local/bin/agy" }), logout: async () => (asked++, kind === "logged_out" ? { kind } : { kind: "failed", reason: "still_logged_in", detail: "agy models still answers" }) });
  const ok = createOarHarnessPort({ loadRuntime: async () => rt("logged_out") as any, dataDir: dir });
  expect(await ok.logout!("antigravity")).toEqual({ ok: true });
  const no = createOarHarnessPort({ loadRuntime: async () => rt("failed") as any, dataDir: dir });
  expect(await no.logout!("antigravity")).toEqual({ ok: false, detail: "agy models still answers" });
  const none = createOarHarnessPort({ loadRuntime: async () => ({ installation: async () => ({ kind: "available" }) }) as any, dataDir: dir });
  expect((await none.logout!("codex")).ok).toBe(false);
  expect(asked).toBe(2);
});
