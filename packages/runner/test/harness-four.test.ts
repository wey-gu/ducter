// D600: Cursor, Devin CLI, Kimi Code and OpenCode through OAR. No agent runs: each spec's options
// come from OAR's own refused map (or the runtime's own declarations), and Ducter's MCP reaches the
// agents that refuse credentials in an entry over its stdio bridge. Cursor runs in OAR's subprocess
// mode, so its refused map no longer includes the D102 env overlay (see cursor.test.ts).
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCursorRuntime } from "@botiverse/oar/runtimes/cursor";
import { devinRuntime } from "@botiverse/oar/runtimes/devin";
import { kimiRuntime } from "@botiverse/oar/runtimes/kimi";
import { opencodeRuntime } from "@botiverse/oar/runtimes/opencode";
import { HARNESSES } from "@ducter/protocol";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { adaptSpec } from "../src/oar.ts";
import { childEnvironment } from "../src/child-env.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-harness-four-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ducterMcp = { name: "ducter", url: "http://127.0.0.1:7777/mcp?task=t1", headers: { Authorization: "Bearer dtk.test.sig" } };
const spec = (harness: SessionSpec["harness"], over: Partial<SessionSpec> = {}): SessionSpec => ({
  harness,
  cwd: join(dir, "repo"),
  appendSystemPrompt: "Brief: fix the flaky test.",
  mcp: [ducterMcp],
  permissionMode: "bypass",
  ...over,
});

test("D600: the four are task-only and carry their direct-only or pick-only stance", () => {
  for (const h of ["cursor", "devin", "kimi", "opencode"] as const) expect(HARNESSES[h]).toMatchObject({ task: true, partner: false });
  expect(HARNESSES.kimi.directOnly).toBe(true);
  expect(HARNESSES.opencode.directOnly).toBe(true);
  expect(HARNESSES.opencode.pickOnly).toBe(true);
  expect(HARNESSES.cursor.directOnly).toBeUndefined();
  expect(HARNESSES.devin.directOnly).toBeUndefined();
});

test("Devin: no prompt channel, no tool denial and no clean setup; Ducter's MCP over the stdio bridge", () => {
  const refused = devinRuntime.refusedSessionOptions as Record<string, string>;
  for (const k of ["systemPrompt", "appendSystemPrompt", "disallowedTools", "userConfiguration"]) expect(k in refused).toBe(true);
  const a = adaptSpec(spec("devin", { systemPrompt: "You are Ducter.", disallowedTools: ["WebFetch"] }), { dataDir: dir, refused });
  // Both prompts become the first message; OAR is never sent one it refuses.
  expect(a.options.systemPrompt).toBeUndefined();
  expect(a.options.appendSystemPrompt).toBeUndefined();
  expect(a.preamble).toBe("You are Ducter.\n\nBrief: fix the flaky test.");
  expect(a.options.disallowedTools).toBeUndefined();
  expect(a.options.userConfiguration).toBeUndefined();
  const [m] = a.options.mcpServers as { name: string; command: string; args: string[]; env?: unknown }[];
  expect(m!.name).toBe("ducter");
  expect("url" in m! || "headers" in m! || "env" in m!).toBe(false);
  const target = JSON.parse(readFileSync(m!.args.at(-1)!, "utf8"));
  expect(target).toEqual({ url: ducterMcp.url, headers: ducterMcp.headers });
});

test("Kimi: the system prompt takes the first message; appended instructions are native (OAR 0.137); HTTP MCP with headers", () => {
  const refused = kimiRuntime.refusedSessionOptions as Record<string, string>;
  // OAR 0.130's KAP adapter kept the system prompt refused and gained a native append channel.
  for (const k of ["systemPrompt", "disallowedTools", "userConfiguration"]) expect(k in refused).toBe(true);
  const a = adaptSpec(spec("kimi", { systemPrompt: "You are Ducter.", disallowedTools: ["WebFetch"] }), { dataDir: dir, refused });
  expect(a.options.systemPrompt).toBeUndefined();
  expect(a.options.appendSystemPrompt).toBe("Brief: fix the flaky test.");
  expect(a.preamble).toBe("You are Ducter.");
  expect(a.options.disallowedTools).toBeUndefined();
  expect(a.options.mcpServers).toEqual([{ name: "ducter", type: "http", url: ducterMcp.url, headers: ducterMcp.headers }]);
});

test("OpenCode: its prompt and appended instructions are native; tool denial is refused", () => {
  const a = adaptSpec(spec("opencode", { systemPrompt: "You are Ducter.", disallowedTools: ["WebFetch"] }), { dataDir: dir, refused: opencodeRuntime.refusedSessionOptions as Record<string, string> });
  expect(a.options.systemPrompt).toBe("You are Ducter.");
  expect(a.options.appendSystemPrompt).toBe("Brief: fix the flaky test.");
  expect(a.preamble).toBeUndefined();
  expect(a.options.disallowedTools).toBeUndefined();
  expect(a.options.mcpServers).toEqual([{ name: "ducter", type: "http", url: ducterMcp.url, headers: ducterMcp.headers }]);
});

test("Cursor: subprocess mode takes the D102 env; both prompts move to the first message and the clean setup is native", () => {
  // D630: the subprocess refused map has no `env` (the child's environment is the session's).
  const rt = createCursorRuntime({ execution: "subprocess", sdkModule: "file:///tmp/fake-cursor-sdk/index.js" });
  const refused = rt.refusedSessionOptions as Record<string, string>;
  for (const k of ["systemPrompt", "appendSystemPrompt", "launchArgs"]) expect(k in refused).toBe(true);
  expect("env" in refused).toBe(false);
  const a = adaptSpec(spec("cursor", { systemPrompt: "You are Ducter.", disallowedTools: ["WebFetch"], launchArgs: ["--x"], isolateUserConfig: true }), { dataDir: dir, refused });
  expect(a.options.systemPrompt).toBeUndefined();
  expect(a.options.appendSystemPrompt).toBeUndefined();
  expect(a.preamble).toBe("You are Ducter.\n\nBrief: fix the flaky test.");
  expect(a.options.launchArgs).toBeUndefined();
  expect(a.options.disallowedTools).toBeUndefined();
  // The env overlay is still Ducter's (D102), and the task gets Cursor's native clean setup.
  expect(Object.keys(a.options.env!).length).toBeGreaterThan(0);
  expect(a.options.userConfiguration).toBe("exclude");
  // OAR #1195: Cursor keeps HTTP MCP entries with headers in both modes (never the stdio bridge).
  expect(a.options.mcpServers).toEqual([{ name: "ducter", type: "http", url: ducterMcp.url, headers: ducterMcp.headers }]);
});

test("D600: no new agent gets another agent's key; each gets only its own", () => {
  const inherited = { PATH: "/usr/bin", HOME: "/h", CURSOR_API_KEY: "c", WINDSURF_API_KEY: "w", OPENCODE_API_KEY: "o", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b", KIMI_CODE_HOME: "/h/.kimi-code", OAR_DEVIN_BIN: "/opt/devin" };
  const cursor = childEnvironment("cursor", { inherited });
  expect(cursor.CURSOR_API_KEY).toBe("c");
  for (const k of ["WINDSURF_API_KEY", "OPENCODE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) expect(k in cursor).toBe(false);
  const devin = childEnvironment("devin", { inherited });
  expect(devin).toMatchObject({ WINDSURF_API_KEY: "w", OAR_DEVIN_BIN: "/opt/devin" });
  for (const k of ["CURSOR_API_KEY", "OPENCODE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) expect(k in devin).toBe(false);
  const kimi = childEnvironment("kimi", { inherited });
  expect(kimi.KIMI_CODE_HOME).toBe("/h/.kimi-code");
  for (const k of ["CURSOR_API_KEY", "WINDSURF_API_KEY", "OPENCODE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) expect(k in kimi).toBe(false);
  // D600: never a provider key: OpenCode's plugins run in-process and can read the whole child env.
  const opencode = childEnvironment("opencode", { inherited });
  expect(opencode.OPENCODE_API_KEY).toBe("o");
  for (const k of ["CURSOR_API_KEY", "WINDSURF_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) expect(k in opencode).toBe(false);
});
