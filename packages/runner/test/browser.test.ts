import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { browserBrief, browserGate, profileName, resetCuaDriverProbe, socketPath, type Exec } from "../src/browser.ts";
import { createFakeCore, type FakeCore } from "./fake-core.ts";

const BIN = "/opt/cua/CuaDriver.app/Contents/MacOS/cua-driver";
const TOOLS_044 = ["browser_prepare: Prepare", "get_browser_state: Read", "browser_navigate: Go", "list_windows: List"].join("\n");
const TOOLS_068 = ["page: Interact", "list_windows: List", "launch_app: Launch"].join("\n");

/** A fake cua-driver: records argv; the daemon "starts" once `open` is called. */
function fakeDriver(tools: string) {
  const calls: string[][] = [];
  let up = false;
  const exec: Exec = async (argv) => {
    calls.push(argv);
    if (argv[1] === "--version") return { code: 0, out: "cua-driver 0.44.0", err: "" };
    if (argv[1] === "list-tools") return { code: 0, out: tools, err: "" };
    if (argv[1] === "status") return up ? { code: 0, out: "Cua Driver daemon is running", err: "" } : { code: 1, out: "Cua Driver daemon is not running", err: "" };
    if (argv[0] === "/usr/bin/open") {
      up = true;
      return { code: 0, out: "", err: "" };
    }
    return { code: 1, out: "", err: "unexpected" };
  };
  return { exec, calls };
}

function capturingRuntime(seen: { options?: any }): Runtime {
  const rt = scriptedRuntime({ id: "claude", turn: async () => {} });
  return new Proxy(rt, {
    get(target, prop, recv) {
      if (prop === "session") {
        return (inst: any, options: any, ctx: any) => {
          seen.options = options;
          return target.session(inst, options, ctx);
        };
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

let dir: string;
let core: FakeCore;
beforeEach(() => {
  resetCuaDriverProbe();
  dir = mkdtempSync(join(tmpdir(), "ducter-browser-test-"));
  core = createFakeCore(join(dir, "d"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("browser place: session-config wiring", () => {
  test("attaches cua-driver as a stdio MCP sidecar next to Ducter's MCP, with the persona profile", async () => {
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskb0001",
      browser: { env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", daemonTimeoutMs: 1000 },
    });
    const card = await runner.openTask({ persona: "p1", title: "Latest OAR release", brief: "look it up", place: { kind: "browser", device: "", profile: "" } });
    await runner.whenStarted(card.taskId);
    expect(card.place).toEqual({ kind: "browser", device: "local", profile: "default" });

    const sock = socketPath(core.dataDir);
    const o = seen.options;
    expect(o.mcpServers).toEqual([
      { name: "ducter", type: "http", url: "http://127.0.0.1:0/mcp", headers: { Authorization: "Bearer task-token-tskb0001" } },
      { name: "browser", command: BIN, args: ["mcp", "--socket", sock] },
    ]);
    expect(o.cwd).toBe(join(core.dataDir, "scratch", "tskb0001"));
    expect(existsSync(o.cwd)).toBe(true);
    expect(existsSync(join(core.dataDir, "evidence", "tskb0001"))).toBe(true);
    expect(o.appendSystemPrompt).toContain('"mode":"isolated_named","name":"p1"');
    expect(o.appendSystemPrompt).toContain("report_to_main");
    expect(o.appendSystemPrompt).toContain("Never sign in");

    // The daemon is Ducter's own, launched through LaunchServices with the profile root.
    const open = drv.calls.find((c) => c[0] === "/usr/bin/open")!;
    expect(open).toEqual([
      "/usr/bin/open", "-n", "-g",
      "--env", `CUA_DRIVER_BROWSER_PROFILE_ROOT=${join(core.dataDir, "browser-profiles")}`,
      "--env", "CUA_DRIVER_RS_TELEMETRY_ENABLED=false",
      "/opt/cua/CuaDriver.app", "--args", "serve", "--socket", sock,
    ]);
    await runner.dispose();
  });

  test("a running daemon is reused, not relaunched", async () => {
    const drv = fakeDriver(TOOLS_044);
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime({}) });
    let n = 0;
    const runner = createRunner(core, { harness: port, newId: () => `tskb000${++n}`, browser: { env: {}, exec: drv.exec, which: () => BIN, platform: "darwin" } });
    for (let i = 0; i < 2; i++) {
      const c = await runner.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "browser", device: "local", profile: "default" } });
      await runner.whenStarted(c.taskId);
    }
    expect(drv.calls.filter((c) => c[0] === "/usr/bin/open").length).toBe(1);
    await runner.dispose();
  });

  test("an old cua-driver without typed browser tools fails task_open with what to do", async () => {
    const drv = fakeDriver(TOOLS_068);
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime({}) });
    const runner = createRunner(core, { harness: port, newId: () => "tskb0009", browser: { env: {}, exec: drv.exec, which: () => BIN } });
    await expect(runner.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "browser", device: "local", profile: "default" } })).rejects.toThrow(
      /no typed browser tools.*cua-driver update --apply/,
    );
    expect(core.events.find((e) => e.kind === "task_open")).toBeUndefined();
  });

  test("DUCTER_BROWSER=0 turns browser places off; other places are untouched", async () => {
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    let n = 0;
    const runner = createRunner(core, { harness: port, newId: () => `tskc000${++n}`, browser: { env: { DUCTER_BROWSER: "0" }, exec: drv.exec, which: () => BIN } });
    await expect(runner.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "browser", device: "local", profile: "default" } })).rejects.toThrow(/turned off/);
    const c = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(c.taskId);
    expect(seen.options.mcpServers.map((m: any) => m.name)).toEqual(["ducter"]);
    expect(drv.calls.length).toBe(0);
    await runner.dispose();
  });
});

describe("browser helpers", () => {
  test("gate", () => {
    expect(browserGate({})).toBe("auto");
    expect(browserGate({ DUCTER_BROWSER: "1" })).toBe("on");
    expect(browserGate({ DUCTER_BROWSER: "off" })).toBe("off");
  });

  test("profile names are cua-driver safe and per persona", () => {
    expect(profileName("p1")).toBe("p1");
    expect(profileName("p1", "default")).toBe("p1");
    expect(profileName("wey gu", "work")).toBe("wey-gu_work");
    expect(profileName("维")).toBe("persona");
  });

  test("socket path stays under the macOS limit", () => {
    expect(socketPath("/Users/x/.ducter")).toBe("/Users/x/.ducter/run/cua.sock");
    expect(Buffer.byteLength(socketPath("/" + "a".repeat(200)))).toBeLessThan(104);
  });

  test("browser brief snapshot", () => {
    expect(
      browserBrief({ partnerName: "Ducter", profile: "p1", session: "ducter-abc123", bin: "cua-driver", socket: "/d/run/cua.sock", evidenceDir: "/d/evidence/abc123" }),
    ).toMatchSnapshot();
  });
});
