// D630: Cursor in Ducter. No live Cursor call: a fake @cursor/sdk module stands in for the
// SDK OAR loads in its child, and the real OAR subprocess runtime is driven through Ducter's port.
// Covers the child wiring (compiled: Ducter re-enters itself; checkout: OAR's own `node -e`), the
// D102 session overlay (the child sees only the allowlist, not Ducter's or other agents' keys),
// and the hidden CLI entrypoint. OAR ships no Cursor test double; this fake SDK is the scripted one.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCursorRuntime } from "@botiverse/oar/runtimes/cursor";
import type { HarnessEvent, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { CURSOR_CHILD_COMMAND, cursorRuntimePlan } from "../src/cursor.ts";
import { adaptSpec, createOarHarnessPort } from "../src/oar.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cursor-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const SDK_SOURCE = `
export const Cursor = {
  models: { list: async () => [{ id: "default", displayName: "Auto" }] },
  auth: { status: async () => ({ kind: "logged_out" }), login: async () => {}, logout: async () => {} },
};
export class FileCredentialStore {
  async load() {}
  async save() {}
  async clear() {}
}
const report = () => JSON.stringify({
  path: !!process.env.PATH,
  home: !!process.env.HOME,
  anthropic: process.env.ANTHROPIC_API_KEY ?? null,
  cursor: process.env.CURSOR_API_KEY ?? null,
  leak: process.env.RANDOM_LEAK ?? null,
});
function run() {
  return {
    id: "run-test",
    wait: async () => ({ id: "run-test", status: "finished", model: { id: "default" } }),
    stream: () => (async function* () {})(),
    steer: async () => ({ outcome: "complete_delivered" }),
    cancel: async () => {},
  };
}
function agent(model) {
  return {
    agentId: "agent-test",
    model: model ?? { id: "default" },
    send: async (_content, options) => {
      options.onDelta({ update: { type: "text-delta", text: report() } });
      return run();
    },
    close: async () => {},
    [Symbol.asyncDispose]: async () => {},
  };
}
export const Agent = {
  create: async (options) => agent(options.model),
  resume: async (_id, options) => agent(options.model),
  listRuns: async () => ({ items: [] }),
};
`;

/** Install a fake pinned SDK in Ducter's tools folder (what `agent-setup` does with npm). */
function installFakeSdk(version = "1.4.1"): string {
  const pkgDir = join(dir, "tools", "node", "lib", "node_modules", "@cursor", "sdk");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "@cursor/sdk", version, type: "module", exports: { ".": "./index.mjs" } }));
  writeFileSync(join(pkgDir, "index.mjs"), SDK_SOURCE);
  return pathToFileURL(join(pkgDir, "index.mjs")).href;
}

const env = (): Record<string, string> => ({ PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp" });

const spec = (): SessionSpec => ({
  harness: "cursor",
  cwd: dir,
  appendSystemPrompt: "Brief: fix the flaky test.",
  mcp: [],
  permissionMode: "bypass",
  isolateUserConfig: true,
});

const until = async (ok: () => boolean, ms = 20_000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(10);
  }
};

test("D630: the runtime plan is subprocess; a compiled host re-enters itself, a checkout uses OAR's own -e child", () => {
  expect(cursorRuntimePlan({ dataDir: dir })).toBeUndefined();
  const sdkModule = installFakeSdk();
  const dev = cursorRuntimePlan({ dataDir: dir, compiled: false, execPath: "/opt/ducter" });
  expect(dev?.execution).toBe("subprocess");
  expect(dev?.childProcess).toBeUndefined();
  const compiled = cursorRuntimePlan({ dataDir: dir, compiled: true, execPath: "/opt/ducter" });
  expect(compiled?.execution).toBe("subprocess");
  expect(compiled?.childProcess).toEqual({ command: "/opt/ducter", args: [CURSOR_CHILD_COMMAND] });
  // OAR pins exactly 1.4.1: a copy with another version is not handed over.
  writeFileSync(join(dir, "tools", "node", "lib", "node_modules", "@cursor", "sdk", "package.json"), JSON.stringify({ name: "@cursor/sdk", version: "1.4.0", type: "module", exports: { ".": "./index.mjs" } }));
  expect(cursorRuntimePlan({ dataDir: dir, compiled: false })).toBeUndefined();
});

test("D630: a Cursor session in OAR's subprocess mode sees only Ducter's D102 overlay", async () => {
  const sdkModule = installFakeSdk();
  const rt = createCursorRuntime({ execution: "subprocess", sdkModule });
  const port = createOarHarnessPort({
    dataDir: dir,
    loadRuntime: async () => rt as never,
    env: { ANTHROPIC_API_KEY: "other-agents-key", CURSOR_API_KEY: "cursor-key" },
  });
  const prev = process.env.RANDOM_LEAK;
  process.env.RANDOM_LEAK = "ducters-own-secret";
  const seen: HarnessEvent[] = [];
  let session: Awaited<ReturnType<typeof port.start>> | undefined;
  try {
    session = await port.start(spec());
    const reading = (async () => {
      for await (const ev of session.events()) seen.push(ev);
    })();
    await session.send("hello");
    await until(() => seen.some((e) => e.turnEnd === true));
    await session.close();
    await Promise.race([reading, Bun.sleep(500)]);
    const text = seen.filter((e) => e.role === "assistant" && typeof e.text === "string").map((e) => e.text!).join("");
    const envSeen = JSON.parse(text);
    // D102: the basics are there; another agent's key and Ducter's own secret are not; OAR takes
    // CURSOR_API_KEY out of the child and hands it to the SDK as apiKey instead.
    expect(envSeen).toEqual({ path: true, home: true, anthropic: null, cursor: null, leak: null });
  } finally {
    if (session) await session.close().catch(() => {});
    if (prev === undefined) delete process.env.RANDOM_LEAK;
    else process.env.RANDOM_LEAK = prev;
  }
});

test("D630: the hidden __cursor-child entrypoint is what OAR's childProcess runs", async () => {
  const sdkModule = installFakeSdk();
  const main = join(import.meta.dir, "..", "..", "cli", "src", "main.ts");
  const rt = createCursorRuntime({
    execution: "subprocess",
    sdkModule,
    childProcess: { command: process.execPath, args: [main, CURSOR_CHILD_COMMAND] },
  });
  const inst = await rt.installation({ env: env() });
  expect(inst.kind).toBe("available");
  const listed = await rt.listModels(inst, { env: env(), timeoutMs: 30_000 });
  expect(listed).toEqual({ kind: "ok", models: [{ id: "default", displayName: "Auto" }] });
}, 60_000);

test("D630: the harness spec still refuses a Cursor prompt natively but keeps the D102 env", () => {
  const refused = createCursorRuntime({ execution: "subprocess", sdkModule: "file:///tmp/none/index.js" }).refusedSessionOptions as Record<string, string>;
  expect("env" in refused).toBe(false);
  const a = adaptSpec(spec(), { dataDir: dir, refused });
  expect(Object.keys(a.options.env ?? {}).length).toBeGreaterThan(0);
});
