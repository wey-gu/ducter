import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { browserBrief, browserGate, closeBrowserGracefully, profileName, resetCuaDriverProbe, socketPath, stopFocusGuards, type Exec } from "../src/browser.ts";
import { createFocusGuard, parseDucterBrowsers, type FocusProbe } from "../src/focus-guard.ts";
import { parkedBounds } from "../src/cdp.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

const BIN = "/opt/cua/CuaDriver.app/Contents/MacOS/cua-driver";
const TOOLS_044 = ["browser_prepare: Prepare", "get_browser_state: Read", "browser_navigate: Go", "list_windows: List", "page: Legacy", "end_session: End", "click: Click"].join("\n");
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

function capturingRuntime(seen: { options?: any }, turn: (t: ScriptedTurn) => Promise<void> = async () => {}): Runtime {
  const rt = scriptedRuntime({ id: "claude", turn });
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
afterEach(() => {
  stopFocusGuards();
  rmSync(dir, { recursive: true, force: true });
});

const idleProbe: FocusProbe = { front: async () => undefined, ducterBrowsers: async () => [], activate: async () => {} };

describe("browser place: session-config wiring", () => {
  test("attaches cua-driver as a stdio MCP sidecar next to Ducter's MCP, with the persona profile", async () => {
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskb0001",
      browser: { env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", daemonTimeoutMs: 1000, focusProbe: idleProbe },
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
    // env-gate first slice: only the browser tools; no user MCP servers, skills or CLAUDE.md.
    expect(o.disallowedTools).toEqual(expect.arrayContaining(["AskUserQuestion", "mcp__browser__page", "mcp__browser__end_session", "mcp__browser__click"]));
    expect(o.disallowedTools).not.toContain("mcp__browser__browser_navigate");
    expect(o.launchArgs).toEqual(["--tools", "Bash,Read,Write,ToolSearch"]);
    expect(o.userConfiguration).toBe("exclude");

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
    const runner = createRunner(core, { harness: port, newId: () => `tskb000${++n}`, browser: { env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe } });
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

  test("gate follows the user's saved choice unless the env pins it", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-gate-"));
    try {
      expect(browserGate({}, dir)).toBe("auto");
      writeFileSync(join(dir, "abilities.json"), JSON.stringify({ web: false }));
      expect(browserGate({}, dir)).toBe("off");
      expect(browserGate({ DUCTER_BROWSER: "1" }, dir)).toBe("on");
      writeFileSync(join(dir, "abilities.json"), JSON.stringify({ web: true }));
      expect(browserGate({}, dir)).toBe("on");
      expect(browserGate({ DUCTER_BROWSER: "0" }, dir)).toBe("off");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  test("sign-in handoff: Go means 'done, carry on' (live run: a 'skip' default made Go skip the sign-in)", () => {
    const b = browserBrief({ partnerName: "Ducter", profile: "p1", session: "s", bin: "cua-driver", socket: "/s", evidenceDir: "/e" });
    expect(b).toContain("never make the default \"skip\"");
    expect(b).toContain("never report what the page shows without reading it");
    expect(b).not.toContain("end_session");
  });
});

describe("focus guard (macOS: a freshly launched Ducter Chrome steals focus)", () => {
  function world() {
    const w = { t: 0, front: 100 as number | undefined, chrome: [] as number[], activated: [] as number[] };
    const probe: FocusProbe = {
      front: async () => w.front,
      ducterBrowsers: async () => w.chrome,
      activate: async (pid) => {
        w.activated.push(pid);
        w.front = pid;
      },
    };
    return { w, guard: createFocusGuard({ probe, now: () => w.t, graceMs: 5000, idleStopMs: 60_000 }) };
  }

  test("a Chrome that grabs focus right after launch gives it back to the user's app", async () => {
    const { w, guard } = world();
    await guard.tick(); // user is in pid 100
    w.t = 1000;
    w.chrome = [500];
    w.front = 500; // launched and activated itself
    await guard.tick();
    expect(w.activated).toEqual([100]);
    expect(w.front).toBe(100);
  });

  test("after the grace period, the user choosing the browser window is respected", async () => {
    const { w, guard } = world();
    await guard.tick();
    w.t = 1000;
    w.chrome = [500];
    await guard.tick(); // launched in the background, seen at t=1000
    w.t = 20_000;
    w.front = 500; // user clicked it (to watch, or to sign in)
    await guard.tick();
    expect(w.activated).toEqual([]);
  });

  test("other apps are never touched", async () => {
    const { w, guard } = world();
    await guard.tick();
    w.front = 200;
    await guard.tick();
    w.front = 300;
    await guard.tick();
    expect(w.activated).toEqual([]);
  });
});

describe("closing the browser so sign-ins are saved", () => {
  async function runWithReport(state: "done" | "needs_input") {
    const drv = fakeDriver(TOOLS_044);
    const closed: string[] = [];
    const turn = async (t: ScriptedTurn) => {
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state, summary: "s" }), () =>
        core.call("report_to_main", { state, summary: "s", questions: state === "needs_input" ? [{ id: "q1", text: "Sign in?", blocking: true, default: "skip", reversible: true }] : [] }, "tskd0001"),
      );
    };
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime({}, turn) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskd0001",
      browser: { env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe, closeBrowser: async (dir) => (closed.push(dir), true) },
    });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "browser", device: "local", profile: "default" } });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");
    await Bun.sleep(20);
    return { runner, closed, taskId: card.taskId };
  }

  test("a task that reports done gets its browser closed cleanly (not killed)", async () => {
    const { runner, closed } = await runWithReport("done");
    expect(closed).toEqual([join(core.dataDir, "browser-profiles", "p1")]);
    await runner.dispose();
  });

  test("a task waiting on the user keeps its browser open (they may need to sign in there)", async () => {
    const { runner, closed, taskId } = await runWithReport("needs_input");
    expect(closed).toEqual([]);
    await runner.drop(taskId);
    expect(closed.length).toBe(1);
    await runner.dispose();
  });

  test("closeBrowserGracefully sends CDP Browser.close to the profile's own endpoint", async () => {
    const got: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req, srv) {
        if (new URL(req.url).pathname === "/devtools/browser/abc" && srv.upgrade(req)) return;
        return new Response("no", { status: 404 });
      },
      websocket: {
        message(ws, m) {
          got.push(String(m));
          ws.send(JSON.stringify({ id: 1, result: {} }));
          ws.close();
        },
      },
    });
    const profile = join(dir, "prof");
    mkdirSync(profile);
    writeFileSync(join(profile, "DevToolsActivePort"), `${server.port}\n/devtools/browser/abc\n`);
    expect(await closeBrowserGracefully(profile)).toBe(true);
    expect(JSON.parse(got[0]!)).toMatchObject({ id: 1, method: "Browser.close" });
    server.stop(true);
    // Stale port file (browser gone): reports false, does not throw.
    expect(await closeBrowserGracefully(profile, 1000)).toBe(false);
    expect(await closeBrowserGracefully(join(dir, "missing"))).toBe(false);
  });
});

describe("browser status line, identity, task model", () => {
  test("a navigation to a new site becomes one system line; same host again stays quiet", async () => {
    const drv = fakeDriver(TOOLS_044);
    const nav = (url: string) => JSON.stringify({ target_id: "t", tab_id: "x", url, session: "s" });
    const turn = async (t: ScriptedTurn) => {
      await t.tool("mcp__browser__browser_navigate", nav("https://github.com/botiverse/oar/releases"), () => "ok");
      await t.tool("mcp__browser__browser_navigate", nav("https://github.com/botiverse/oar"), () => "ok");
      await t.tool("mcp__browser__browser_navigate", nav("https://www.news.ycombinator.com/"), () => "ok");
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done", summary: "s" }), () =>
        core.call("report_to_main", { state: "done", summary: "s" }, "tske0001"),
      );
    };
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime({}, turn) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tske0001",
      browser: { env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe, closeBrowser: async () => true },
    });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "browser", device: "local", profile: "default" } });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");
    const lines = core.events
      .filter((e) => e.kind === "task_event" && (e.body as any).role === "system" && (e.body as any).raw?.browser)
      .map((e) => [(e.body as any).text, (e.body as any).raw.browser.host]);
    expect(lines).toEqual([
      ["Looking at github.com", "github.com"],
      ["Looking at news.ycombinator.com", "news.ycombinator.com"],
    ]);
    await runner.dispose();
  });

  test("a newly launched Ducter browser gets the identity treatment once, on its own profile", async () => {
    const w = { chrome: [] as number[] };
    const probe: FocusProbe = {
      front: async () => 100,
      ducterBrowsers: async () => w.chrome,
      profileOf: (pid) => (pid === 500 ? "/d/browser-profiles/p1" : undefined),
      activate: async () => {},
    };
    const launched: [number][] = [];
    const guard = createFocusGuard({ probe, onLaunch: (pid) => launched.push([pid]) });
    await guard.tick();
    w.chrome = [500];
    await guard.tick();
    await guard.tick();
    expect(launched).toEqual([[500]]);
  });

  test("ps parsing keeps Chrome main processes on Ducter's root only", () => {
    const root = "/d/browser-profiles";
    const profiles = new Map<number, string>();
    const ps = [
      "  500 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=0 --user-data-dir=/d/browser-profiles/p1 --no-first-run about:blank",
      "  501 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper --type=renderer --user-data-dir=/d/browser-profiles/p1",
      "  600 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "  700 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/me/Library/Chrome",
    ].join("\n");
    expect(parseDucterBrowsers(ps, root, profiles)).toEqual([500]);
    expect(profiles.get(500)).toBe("/d/browser-profiles/p1");
  });

  test("the window parks bottom-right, smaller than the screen", () => {
    expect(parkedBounds({ l: 0, t: 25, w: 1512, h: 920 })).toEqual({ left: 593, top: 289, width: 907, height: 644 });
    expect(parkedBounds({ l: 0, t: 0, w: 1280, h: 720 })).toEqual({ left: 500, top: 204, width: 768, height: 504 });
  });

  test("DUCTER_TASK_MODEL applies only when the partner passes no model", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    let n = 0;
    const runner = createRunner(core, { harness: port, newId: () => `tskf000${++n}`, taskModel: "sonnet" });
    const a = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(a.taskId);
    expect(seen.options.model).toBe("sonnet");
    const b = await runner.openTask({ persona: "p1", title: "t", brief: "b", model: "haiku" });
    await runner.whenStarted(b.taskId);
    expect(seen.options.model).toBe("haiku");
    await runner.dispose();
  });
});
