import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import {
  browserBrief,
  browserDriverPref,
  browserGate,
  closeBrowserGracefully,
  codexComputerBrief,
  computerUseGuard,
  DEFAULT_BROWSER_DRIVER,
  defaultNativeProbe,
  nativeBrowserBrief,
  nativeUrlOf,
  profileName,
  resetCuaDriverProbe,
  socketPath,
  stopFocusGuards,
  type Exec,
  type NativeKind,
} from "../src/browser.ts";
import { codexCleanArgs } from "../src/oar.ts";
import { SWITCHED_TO_CUA } from "../src/runner.ts";
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
/** The machine's own Claude in Chrome / Codex setup never leaks into these tests (D126). */
const noNative = () => undefined;

describe("browser place: session-config wiring", () => {
  test("attaches cua-driver as a stdio MCP sidecar next to Ducter's MCP, with the persona profile", async () => {
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskb0001",
      browser: { nativeProbe: noNative, env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", daemonTimeoutMs: 1000, focusProbe: idleProbe },
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
    const runner = createRunner(core, { harness: port, newId: () => `tskb000${++n}`, browser: { nativeProbe: noNative, env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe } });
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
    const runner = createRunner(core, { harness: port, newId: () => "tskb0009", browser: { nativeProbe: noNative, env: {}, exec: drv.exec, which: () => BIN } });
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
    const runner = createRunner(core, { harness: port, newId: () => `tskc000${++n}`, browser: { nativeProbe: noNative, env: { DUCTER_BROWSER: "0" }, exec: drv.exec, which: () => BIN } });
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
      browser: { nativeProbe: noNative, env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe, closeBrowser: async (dir) => (closed.push(dir), true) },
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
      browser: { nativeProbe: noNative, env: {}, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe, closeBrowser: async () => true },
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

describe("browser place: the harness's own browser tools first (D126, D130)", () => {
  const nativeFor =
    (...kinds: NativeKind[]) =>
    (h: string) =>
      kinds.find((k) => (h === "claude-code" ? k === "claude-in-chrome" : h === "codex" ? k.startsWith("codex-") : false));
  const place = { kind: "browser", device: "local", profile: "default" } as const;
  const NATIVE = { DUCTER_BROWSER_DRIVER: "native" };
  /** A Codex home of the test's own: the machine's ~/.codex never leaks in. */
  const codexHome = () => {
    const h = join(dir, "codex-home");
    mkdirSync(h, { recursive: true });
    writeFileSync(
      join(h, "config.toml"),
      [
        "[mcp_servers.cua-driver]",
        'command = "cua-driver"',
        "[mcp_servers.node_repl]",
        'command = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl"',
        '[plugins."github@openai-curated"]',
        "enabled = true",
        '[plugins."unified-computer-use@openai-bundled"]',
        "enabled = true",
        '[plugins."browser@openai-bundled"]',
        "enabled = true",
        "",
      ].join("\n"),
    );
    return h;
  };

  test("Claude Code: Claude in Chrome (--chrome), no cua-driver sidecar, clean config kept", async () => {
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, { harness: port, newId: () => "tskn0001", browser: { nativeProbe: nativeFor("claude-in-chrome"), env: NATIVE, exec: drv.exec, which: () => BIN } });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place });
    await runner.whenStarted(card.taskId);
    const o = seen.options;
    expect(o.mcpServers.map((m: any) => m.name)).toEqual(["ducter"]);
    expect(o.launchArgs).toEqual(["--chrome", "--tools", "Bash,Read,Write,ToolSearch"]);
    expect(o.userConfiguration).toBe("exclude");
    expect(o.appendSystemPrompt).toContain("Claude in Chrome");
    expect(o.appendSystemPrompt).toContain("Never sign in");
    expect(drv.calls).toEqual([]); // cua-driver is never probed or started
    await runner.dispose();
  });

  test("Codex: its own tools under a clean setup that keeps only the browser / Computer Use plugins", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ env: { CODEX_HOME: codexHome() }, loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, { harness: port, newId: () => "tskn0002", browser: { nativeProbe: nativeFor("codex-computer"), env: NATIVE, which: () => null } });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", harness: "codex", place });
    await runner.whenStarted(card.taskId);
    const args: string[] = seen.options.launchArgs;
    expect(seen.options.mcpServers.map((m: any) => m.name)).toEqual(["ducter"]);
    expect(args).toContain("mcp_servers.cua-driver.enabled=false"); // the user's own cua-driver is left out
    expect(args).not.toContain("mcp_servers.node_repl.enabled=false"); // the desktop app's browser service stays
    expect(args).toContain("plugins.github@openai-curated.enabled=false"); // bare id: a quoted one is not matched
    expect(args.some((a) => a.startsWith("plugins.unified-computer-use") || a.startsWith("plugins.browser@"))).toBe(false);
    expect(args).toContain("features.apps=false");
    for (const kept of ["plugins", "plugin_hooks", "computer_use", "browser_use"]) expect(args).not.toContain(`features.${kept}=false`);
    expect(seen.options.appendSystemPrompt).toContain("--new-window");
    await runner.dispose();
  });

  test("the partner's clean setup still turns Codex's plugins and Computer Use off", () => {
    const args = codexCleanArgs({ plugins: { "github@openai-curated": { enabled: true } } });
    expect(args).toContain("features.plugins=false");
    expect(args).toContain("features.computer_use=false");
    expect(args.some((a) => a.startsWith("plugins."))).toBe(false);
  });

  test("a harness without its own tools falls back to cua-driver", async () => {
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskn0006",
      browser: { nativeProbe: nativeFor("codex-computer"), env: NATIVE, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe },
    });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place }); // claude-code here
    await runner.whenStarted(card.taskId);
    expect(seen.options.mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]);
    await runner.dispose();
  });

  test("unset means native now (D130); =cua forces cua-driver even when the harness has its own tools", async () => {
    expect(DEFAULT_BROWSER_DRIVER).toBe("native");
    expect(browserDriverPref({})).toBe("native");
    expect(browserDriverPref(NATIVE)).toBe("native");
    expect(browserDriverPref({ DUCTER_BROWSER_DRIVER: "cua" })).toBe("cua");
    const drv = fakeDriver(TOOLS_044);
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskn0003",
      browser: { nativeProbe: nativeFor("claude-in-chrome"), env: { DUCTER_BROWSER_DRIVER: "cua" }, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe },
    });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place });
    await runner.whenStarted(card.taskId);
    expect(seen.options.mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]);
    expect(seen.options.launchArgs).toEqual(["--tools", "Bash,Read,Write,ToolSearch"]);
    await runner.dispose();
  });

  test("Browse the web turned off still wins over native tools", async () => {
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime({}) });
    const runner = createRunner(core, { harness: port, newId: () => "tskn0004", browser: { nativeProbe: nativeFor("claude-in-chrome"), env: { ...NATIVE, DUCTER_BROWSER: "0" } } });
    await expect(runner.openTask({ persona: "p1", title: "t", brief: "b", place })).rejects.toThrow(/turned off/);
  });

  test("native status lines carry own:true, one per new site", async () => {
    const turn = async (t: ScriptedTurn) => {
      await t.tool("mcp__claude-in-chrome__navigate", JSON.stringify({ url: "https://www.example.com/a", tabId: 1 }), () => "ok");
      await t.tool("mcp__claude-in-chrome__navigate", JSON.stringify({ url: "https://example.com/b", tabId: 1 }), () => "ok");
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done", summary: "s" }), () => core.call("report_to_main", { state: "done", summary: "s" }, "tskn0005"));
    };
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime({}, turn) });
    const runner = createRunner(core, { harness: port, newId: () => "tskn0005", browser: { nativeProbe: nativeFor("claude-in-chrome"), env: NATIVE } });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm");
    const lines = core.events.filter((e) => e.kind === "task_event" && (e.body as any).raw?.browser).map((e) => (e.body as any).raw.browser);
    expect(lines).toEqual([{ host: "example.com", url: "https://www.example.com/a", own: true }]);
    await runner.dispose();
  });

  test("Claude in Chrome says not connected: the task moves to cua-driver, said in a system line", async () => {
    const drv = fakeDriver(TOOLS_044);
    const all: any[] = [];
    const inputs: string[] = [];
    const turn = async (t: ScriptedTurn) => {
      inputs.push(t.input);
      if (t.options.launchArgs?.includes("--chrome")) {
        await t.tool("mcp__claude-in-chrome__tabs_context_mcp", "{}", () => "Browser extension is not connected. Please ensure the Claude browser extension is installed and running");
        await new Promise<void>((r) => t.signal.addEventListener("abort", () => r())); // the old session is closed
        return;
      }
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done", summary: "s" }), () => core.call("report_to_main", { state: "done", summary: "s" }, "tskn0007"));
    };
    const rt = scriptedRuntime({ id: "claude", turn });
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        new Proxy(rt, {
          get: (target, prop, recv) =>
            prop === "session" ? (inst: any, options: any, ctx: any) => (all.push(options), target.session(inst, options, ctx)) : Reflect.get(target, prop, recv),
        }),
    });
    const runner = createRunner(core, {
      harness: port,
      newId: () => "tskn0007",
      browser: { nativeProbe: nativeFor("claude-in-chrome"), env: NATIVE, exec: drv.exec, which: () => BIN, platform: "darwin", focusProbe: idleProbe, closeBrowser: async () => true },
    });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done on cua-driver");
    expect(all.length).toBe(2);
    expect(all[1].mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]);
    expect(all[1].launchArgs).toEqual(["--tools", "Bash,Read,Write,ToolSearch"]);
    expect(all[1].appendSystemPrompt).toContain("cua-driver");
    expect(all[1].appendSystemPrompt).not.toContain("Claude in Chrome tools");
    expect(inputs.at(-1)).toBe(SWITCHED_TO_CUA);
    const lines = core.events.filter((e) => e.kind === "task_event" && (e.body as any).role === "system").map((e) => (e.body as any).text);
    expect(lines).toContain("Claude in Chrome isn't connected; switched to Ducter's own browser");
    await runner.dispose();
  });

  test("Codex Computer Use: keys before its own window trip the guard once; the task is steered", async () => {
    const steered: string[][] = [];
    const turn = async (t: ScriptedTurn) => {
      await t.tool("mcp__cua_repl__js", JSON.stringify({ code: 'let app = await cua.getApp("Google Chrome"); await app.pressKey("super+t"); await app.typeText("https://example.com")' }), () => "ok");
      await t.tool("mcp__cua_repl__js", JSON.stringify({ code: 'await app.typeText("again")' }), () => "ok");
      steered.push([...t.steered]);
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done", summary: "s" }), () => core.call("report_to_main", { state: "done", summary: "s" }, "tskn0008"));
    };
    const port = createOarHarnessPort({ env: { CODEX_HOME: codexHome() }, loadRuntime: async () => capturingRuntime({}, turn) });
    const runner = createRunner(core, { harness: port, newId: () => "tskn0008", browser: { nativeProbe: nativeFor("codex-computer"), env: NATIVE, which: () => null } });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", harness: "codex", place });
    await runner.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
    const guards = core.events.filter((e) => e.kind === "task_event" && (e.body as any).raw?.browser?.guard);
    expect(guards.length).toBe(1);
    expect(steered[0]!.length).toBe(1);
    expect(steered[0]![0]).toContain("--new-window");
    await runner.dispose();
  });

  test("the Computer Use guard: opening a window first (shell or ⌘N) never trips it", () => {
    const js = (code: string) => ({ name: "mcp__cua_repl__js", input: { code } });
    let g = computerUseGuard();
    expect(g({ name: "exec_command", input: { cmd: 'open -na "Google Chrome" --args --new-window "https://a.com"' } })).toBeUndefined();
    expect(g(js('await app.typeText("hello")'))).toBeUndefined();
    g = computerUseGuard();
    expect(g(js('await app.pressKey("super+n"); await app.typeText("https://a.com")'))).toBeUndefined();
    g = computerUseGuard();
    expect(g(js("await app.getAXState()"))).toBeUndefined(); // reading is fine
    expect(g(js('await app.pressKey("Return")'))?.line).toContain("hadn't opened");
    expect(g(js('await app.pressKey("Return")'))).toBeUndefined(); // once
    g = computerUseGuard();
    expect(g(js('await app.typeText("x"); await app.pressKey("super+n")'))).toBeDefined(); // typed before opening
  });

  test("the URL of a native call: Claude in Chrome navigate, Codex cua_repl code, or its new window from the shell", () => {
    expect(nativeUrlOf({ name: "mcp__claude-in-chrome__navigate", input: { url: "https://a.com/x" } })).toBe("https://a.com/x");
    expect(nativeUrlOf({ name: "mcp__cua_repl__js", input: { code: 'await cua.createBrowserTab("iab", "https://news.ycombinator.com", { visible: true })' } })).toBe(
      "https://news.ycombinator.com",
    );
    expect(nativeUrlOf({ name: "mcp__cua_repl__js", input: { code: "await app.getAXState()" } })).toBeUndefined();
    expect(nativeUrlOf({ name: "exec_command", input: { cmd: 'open -na "Google Chrome" --args --new-window "https://b.org/y"' } })).toBe("https://b.org/y");
    expect(nativeUrlOf({ name: "mcp__browser__browser_navigate", input: { url: "https://a.com" } })).toBeUndefined();
  });

  test("the default probe: Codex from files and Ducter's env; Claude only when connected; pi never", async () => {
    const home = join(dir, "home");
    const env: Record<string, string> = { HOME: home, CODEX_HOME: "" };
    const which = () => null;
    expect(await defaultNativeProbe("claude-code", { env, which })).toBeUndefined(); // no host file
    expect(await defaultNativeProbe("codex", { env, which })).toBeUndefined();
    expect(await defaultNativeProbe("pi", { env, which })).toBeUndefined();
    if (process.platform !== "darwin") return;
    const codex = join(home, ".codex");
    mkdirSync(join(codex, "plugins", "cache", "openai-bundled", "unified-computer-use"), { recursive: true });
    mkdirSync(join(codex, "computer-use", "Codex Computer Use.app"), { recursive: true });
    writeFileSync(join(codex, "config.toml"), '[plugins."unified-computer-use@openai-bundled"]\nenabled = true\n[plugins."browser@openai-bundled"]\nenabled = true\n');
    expect(await defaultNativeProbe("codex", { env, which })).toBe("codex-computer");
    // The desktop app's browser access host reached Ducter (Ducter started under the app).
    const pipe = join(dir, "access.sock");
    writeFileSync(pipe, "");
    expect(await defaultNativeProbe("codex", { env: { ...env, BROWSER_USE_ACCESS_PIPE_PATH: pipe, BROWSER_USE_ACCESS_VERIFYING_IDENTITY: "k" }, which })).toBe("codex-browser");
    writeFileSync(join(codex, "config.toml"), '[features]\nplugins = false\n[plugins."unified-computer-use@openai-bundled"]\nenabled = true\n');
    expect(await defaultNativeProbe("codex", { env, which })).toBeUndefined(); // the user turned plugins off
  });

  test("every Codex task outside a browser place gets the Computer Use rules; claude-code does not", async () => {
    const seen: { options?: any } = {};
    const port = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen) });
    const runner = createRunner(core, { harness: port, newId: () => "tskn0009", browser: { nativeProbe: noNative, env: {} } });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", harness: "codex", place: { kind: "none" } });
    await runner.whenStarted(card.taskId);
    expect(seen.options.appendSystemPrompt).toContain("## The user's computer");
    await runner.dispose();
    const seen2: { options?: any } = {};
    const port2 = createOarHarnessPort({ loadRuntime: async () => capturingRuntime(seen2) });
    const runner2 = createRunner(core, { harness: port2, newId: () => "tskn0010", browser: { nativeProbe: noNative, env: {} } });
    const c2 = await runner2.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "none" } });
    await runner2.whenStarted(c2.taskId);
    expect(seen2.options.appendSystemPrompt).not.toContain("## The user's computer");
    await runner2.dispose();
    expect(codexComputerBrief("Ducter")).toMatchSnapshot();
  });

  test("outside a browser place the guard watches only once Chrome is in play", () => {
    const js = (code: string) => ({ name: "mcp__cua_repl__js", input: { code } });
    const g = computerUseGuard({ chromeOnly: true });
    expect(g(js('let notes = await cua.getApp("Notes"); await notes.typeText("list")'))).toBeUndefined();
    expect(g(js('let app = await cua.getApp("Google Chrome"); await app.typeText("https://a.com")'))).toBeDefined();
  });

  test("native briefs (snapshot)", () => {
    for (const kind of ["claude-in-chrome", "codex-browser", "codex-computer"] as const) {
      const brief = nativeBrowserBrief({ partnerName: "Ducter", kind, evidenceDir: "/d/evidence/t1" });
      expect(brief).toContain("close the tabs or window you opened");
      expect(brief).toContain("Never sign in");
      expect(brief).toMatchSnapshot();
    }
  });
});
describe("browser place: the browser comes back after a restart, on reopen, and per harness", () => {
  const place = { kind: "browser", device: "local", profile: "default" } as const;
  /** A port whose sessions are all recorded; `turn` decides what each does. */
  const recording = (all: any[], turn: (t: ScriptedTurn) => Promise<void>, loads: any[] = []) => {
    const rt = scriptedRuntime({ id: "claude", turn });
    return createOarHarnessPort({
      env: { CODEX_HOME: join(dir, "no-codex") },
      loadRuntime: async (_h: string, variant?: unknown) => (
        loads.push(variant),
        new Proxy(rt, {
          get: (target, prop, recv) =>
            prop === "session" ? (inst: any, options: any, ctx: any) => (all.push(options), target.session(inst, options, ctx)) : Reflect.get(target, prop, recv),
        })
      ),
    });
  };
  const cuaOpts = (drv: ReturnType<typeof fakeDriver>) => ({ nativeProbe: noNative, env: {}, exec: drv.exec, which: () => BIN, platform: "darwin" as const, focusProbe: idleProbe, closeBrowser: async () => true });
  const hang = async (t: ScriptedTurn) => {
    await new Promise<void>((r) => t.signal.addEventListener("abort", () => r()));
  };
  const expectBrowser = (o: any) => {
    expect(o.mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]);
    expect(o.appendSystemPrompt).toContain("## Your browser");
    expect(o.appendSystemPrompt).toContain("Never sign in");
    expect(o.launchArgs).toEqual(["--tools", "Bash,Read,Write,ToolSearch"]);
    expect(o.userConfiguration).toBe("exclude");
    expect(o.disallowedTools).toContain("mcp__browser__page");
  };

  test("a mid-turn browser task resumed after a restart keeps its browser, brief and denials", async () => {
    const drv = fakeDriver(TOOLS_044);
    const first: any[] = [];
    const r1 = createRunner(core, { harness: recording(first, hang), newId: () => "tskr0001", browser: cuaOpts(drv) });
    const card = await r1.openTask({ persona: "p1", title: "look it up", brief: "b", place });
    await r1.whenStarted(card.taskId);
    await waitFor(() => core.events.some((e) => e.kind === "task_event" && (e.body as any).raw?.sessionId), "session id logged");
    expectBrowser(first[0]);
    // The process dies mid-turn; a new runner rebuilds the task from the Log.
    const second: any[] = [];
    const r2 = createRunner(core, { harness: recording(second, async () => {}), newId: () => "tskr0002", browser: cuaOpts(drv) });
    await r2.whenStarted(card.taskId);
    expect(second.length).toBe(1);
    expect(second[0].resume).toBeTruthy();
    expectBrowser(second[0]);
    await r1.dispose();
    await r2.dispose();
  });

  test("reopening a finished browser task after a restart brings its browser back", async () => {
    const drv = fakeDriver(TOOLS_044);
    const first: any[] = [];
    const done = async (t: ScriptedTurn) => {
      await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done", summary: "s" }), () => core.call("report_to_main", { state: "done", summary: "s" }, "tskr0003"));
    };
    const r1 = createRunner(core, { harness: recording(first, done), newId: () => "tskr0003", browser: cuaOpts(drv) });
    const card = await r1.openTask({ persona: "p1", title: "t", brief: "b", place });
    await r1.whenStarted(card.taskId);
    await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
    await r1.dispose();
    const second: any[] = [];
    const r2 = createRunner(core, { harness: recording(second, async () => {}), newId: () => "tskr0004", browser: cuaOpts(drv) });
    await r2.reopen(card.taskId);
    expect(second.length).toBe(1);
    expectBrowser(second[0]);
    await r2.dispose();
  });

  test("a browser task on Codex (cua-driver) gets the clean setup that keeps Codex's own tools, and the Computer Use rules", async () => {
    const drv = fakeDriver(TOOLS_044);
    const all: any[] = [];
    const runner = createRunner(core, { harness: recording(all, async () => {}), newId: () => "tskr0005", browser: cuaOpts(drv) });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", harness: "codex", place });
    await runner.whenStarted(card.taskId);
    const o = all[0];
    expect(o.mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]);
    expect(o.launchArgs).toContain("features.apps=false");
    expect(o.launchArgs).not.toContain("features.plugins=false");
    expect(o.launchArgs).not.toContain("features.computer_use=false");
    expect(o.appendSystemPrompt).toContain("## Your browser");
    expect(o.appendSystemPrompt).toContain("## The user's computer");
    await runner.dispose();
  });

  test("a browser task on pi runs with pi's clean flags", async () => {
    const drv = fakeDriver(TOOLS_044);
    const all: any[] = [];
    const loads: any[] = [];
    const runner = createRunner(core, { harness: recording(all, async () => {}, loads), newId: () => "tskr0006", browser: cuaOpts(drv) });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", harness: "pi", place });
    await runner.whenStarted(card.taskId);
    expect(loads.at(-1)).toEqual({ clean: true });
    expect(all[0].mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]);
    await runner.dispose();
  });

  test("moving a browser task to another AI agent rebuilds its browser for that agent", async () => {
    const drv = fakeDriver(TOOLS_044);
    const all: any[] = [];
    const runner = createRunner(core, {
      harness: recording(all, async () => {}),
      newId: () => "tskr0007",
      browser: { ...cuaOpts(drv), nativeProbe: (h: string) => (h === "claude-code" ? ("claude-in-chrome" as const) : undefined) },
    });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place });
    await runner.whenStarted(card.taskId);
    expect(all[0].launchArgs).toContain("--chrome");
    await core.call("report_to_main", { state: "progress", summary: "half" }, card.taskId);
    core.tasks.setState(card.taskId, "working", "hot");
    expect((await runner.switchBody(card.taskId, "codex")).ok).toBe(true);
    const o = all.at(-1);
    expect(o.mcpServers.map((m: any) => m.name)).toEqual(["ducter", "browser"]); // Codex has no own tools here: cua-driver
    expect(o.appendSystemPrompt).not.toContain("Claude in Chrome");
    await runner.dispose();
  });
});
