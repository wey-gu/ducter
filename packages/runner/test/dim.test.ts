// D625: Dim (DimAgent) is OAR's community runtime: `createDimRuntime` from
// @botiverse/oar/community, exported since OAR 0.138.0. The loader feature-detects the export:
// absent reads as unavailable (never a crash), present runs the same shared path as every other
// agent. No `dima` process is started and no home is touched.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import { HARNESSES, HARNESS_KEYS } from "@ducter/protocol";
import type { HarnessEvent, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { DIM_COMING, adaptSpec, createOarHarnessPort, dimRuntimeFrom } from "../src/oar.ts";
import { childEnvironment } from "../src/child-env.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-dim-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ducterMcp = { name: "ducter", url: "http://127.0.0.1:7777/mcp?task=t1", headers: { Authorization: "Bearer dtk.test.sig" } };
const spec = (over: Partial<SessionSpec> = {}): SessionSpec => ({
  harness: "dim",
  cwd: join(dir, "repo"),
  appendSystemPrompt: "Brief: fix the flaky test.",
  mcp: [ducterMcp],
  permissionMode: "bypass",
  ...over,
});

// A subset of the refusals OAR's community runtime declares (community/dim/options.ts), so this
// test says the adaptation without needing `dima` installed.
const DIM_REFUSED: Record<string, string> = {
  systemPrompt: "no system prompt channel",
  appendSystemPrompt: "no append channel",
  disallowedTools: "no tool-denial channel",
  userConfiguration: "no clean setup",
  mcpServerCredentials: "credentials in an entry unverified",
};

test("this OAR exports Dim: the community entry yields a runtime and its own refusals", async () => {
  const rt = dimRuntimeFrom(await import("@botiverse/oar/community"));
  expect(rt?.id).toBe("dim");
  expect(typeof rt?.refusedSessionOptions?.systemPrompt).toBe("string");
  expect(typeof rt?.refusedSessionOptions?.userConfiguration).toBe("string");
  // The shipped refusal map moves the same options this test's prefix does.
  const a = adaptSpec(spec({ systemPrompt: "You are Ducter.", disallowedTools: ["WebFetch"] }), { dataDir: dir, refused: rt!.refusedSessionOptions });
  expect(a.options.systemPrompt).toBeUndefined();
  expect(a.options.disallowedTools).toBeUndefined();
  expect(a.preamble).toBe("You are Ducter.\n\nBrief: fix the flaky test.");
});

test("feature detection: no createDimRuntime means unavailable, its own words, never an exception", async () => {
  expect(dimRuntimeFrom(undefined)).toBeUndefined();
  expect(dimRuntimeFrom({})).toBeUndefined();
  expect(dimRuntimeFrom({ createDimRuntime: undefined })).toBeUndefined();
  const port = createOarHarnessPort({ dataDir: dir, community: async () => ({}) });
  // Neither a session nor a crash: the one line a person sees, and the harness says why.
  await expect(port.start(spec())).rejects.toThrow(DIM_COMING);
});

test("feature detection: a factory that is there runs a scripted turn through the shared path", async () => {
  const inputs: string[] = [];
  const rt = scriptedRuntime({ id: "dim", turn: (t) => void (inputs.push(t.input), t.say("Dim here.")) });
  expect(dimRuntimeFrom({ createDimRuntime: () => rt })).toBe(rt);
  const port = createOarHarnessPort({ dataDir: dir, community: async () => ({ createDimRuntime: () => rt }) });
  const session = await port.start(spec());
  try {
    const events: HarnessEvent[] = [];
    const it = session.events()[Symbol.asyncIterator]();
    await session.send("hello");
    for (;;) {
      const step = await it.next();
      if (step.done) break;
      events.push(step.value);
      if (step.value.turnEnd) break;
    }
    expect(inputs).toEqual(["hello"]);
    expect(events.some((e) => e.role === "assistant" && (e.text ?? "").includes("Dim here."))).toBe(true);
  } finally {
    await session.close();
  }
});

test("a Dim spec: both prompts take the first message, no denial, MCP over the stdio bridge, no credentials in the entry", () => {
  const a = adaptSpec(spec({ systemPrompt: "You are Ducter.", disallowedTools: ["WebFetch"] }), { dataDir: dir, refused: DIM_REFUSED });
  expect(a.options.systemPrompt).toBeUndefined();
  expect(a.options.appendSystemPrompt).toBeUndefined();
  expect(a.preamble).toBe("You are Ducter.\n\nBrief: fix the flaky test.");
  expect(a.options.disallowedTools).toBeUndefined();
  expect(a.options.userConfiguration).toBeUndefined();
  const [m] = a.options.mcpServers as { name: string; command: string; args: string[]; env?: unknown; headers?: unknown }[];
  expect(m!.name).toBe("ducter");
  expect("url" in m! || "headers" in m! || "env" in m!).toBe(false);
  expect(JSON.parse(readFileSync(m!.args.at(-1)!, "utf8"))).toEqual({ url: ducterMcp.url, headers: ducterMcp.headers });
});

test("a Dim spec: a home set by the person rides in launchArgs; without one Dim's default home is used", () => {
  const none = adaptSpec(spec(), { dataDir: dir });
  expect(none.options.launchArgs).toBeUndefined();
  const home = adaptSpec(spec({ launchArgs: ["--home", "/p/dim-home"] }), { dataDir: dir });
  expect(home.options.launchArgs).toEqual(["--home", "/p/dim-home"]);
  // A --model-config home has no model or effort config option: OAR refuses both there.
  const config = adaptSpec(spec({ launchArgs: ["--home", "/p/dim-home", "--model-config", "/p/models.json"], model: "deepseek-flash", effort: "high" }), { dataDir: dir });
  expect("model" in config.options).toBe(false);
  expect("effort" in config.options).toBe(false);
});

test("D625: Dim is a task agent with no steer, and shares no other agent's key", () => {
  expect(HARNESSES.dim).toMatchObject({ name: "Dim", task: true, partner: false, steer: false, images: true, isolation: "none", systemPrompt: "none", taskInstructions: "first-turn", mcp: "stdio-bridge", noWebTasks: true });
  expect(HARNESS_KEYS.dim).toEqual([]);
  const inherited = { PATH: "/usr/bin", HOME: "/h", DIM_HOME: "/h/.dimcode-alpha", DIMCODE_FOO: "1", DIM_API_KEY: "dim-secret", DEEPSEEK_API_KEY: "ds", ANTHROPIC_API_KEY: "a", OPENCODE_API_KEY: "o", OAR_DIM_BIN: "/opt/dima" };
  const env = childEnvironment("dim", { inherited });
  expect(env).toMatchObject({ DIM_HOME: "/h/.dimcode-alpha", DIMCODE_FOO: "1", OAR_DIM_BIN: "/opt/dima" });
  for (const k of ["DIM_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENCODE_API_KEY"]) expect(k in env).toBe(false);
});
