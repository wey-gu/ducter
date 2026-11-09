// D154 without a Chrome: Ducter's browser says which browser it is (browser_open's first line,
// the live view's top line), `browser_check` starts it, opens a page and quits with no task, the
// partner has that check on a server, and 试一下 / Try it is a live view with no card behind it.
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { TRY_LIVE, type ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { checkLine } from "../src/browser/check.ts";
import { fakeChrome, type FakeChrome } from "./fake-chrome.ts";
import { tempDir } from "./helpers.ts";

let core: Core | undefined;
let td: ReturnType<typeof tempDir> | undefined;
afterEach(async () => {
  await core?.stop();
  core = undefined;
  td?.cleanup();
  td = undefined;
});

function start(o: { installed?: boolean; chrome?: FakeChrome; platform?: string } = {}) {
  td = tempDir();
  const chrome = o.chrome ?? fakeChrome();
  core = startCore({
    dataDir: td.dir,
    port: 0,
    push: false,
    platform: o.platform ?? "linux",
    browser: {
      find: () => (o.installed === false ? undefined : { path: "/opt/chrome", version: "157.0.8103.38", source: "ducter" as const }),
      launch: chrome.launch,
      connect: chrome.connect,
      device: () => "hel",
      idleMs: 60_000,
    },
  });
  return { core, chrome };
}

describe("which browser (D154)", () => {
  test("browser_open's first line names Ducter's own browser, the machine and the profile", async () => {
    const { core } = start();
    core.log.append({
      stream: "task:t1",
      origin: "partner",
      kind: "task_open",
      body: { taskId: "t1", title: "Check a page", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "Open example.com." },
    });
    core.ducterBrowser!.port.attach("t1", { profile: core.persona.id, evidenceDir: join(td!.dir, "ev"), downloads: join(td!.dir, "dl") });
    const out = (await core.mcp.call({ role: "task", taskId: "t1" }, "browser_open", { url: "example.com" })) as string;
    const first = out.split("\n")[0]!;
    expect(first).toBe(`Browser: Ducter's own browser on hel (Chrome for Testing 157.0.8103.38, profile "${core.persona.id}"), headless on that machine; not the user's own Chrome`);
    expect(out).toContain("Page: Example Domain");
  });
});

describe("browser check (D154)", () => {
  test("starts the browser, opens example.com in a tab of its own, closes it and quits", async () => {
    const { core, chrome } = start();
    const r = await core.ducterBrowser!.check();
    expect(r).toMatchObject({ ok: true, url: "https://example.com/", title: "Example Domain", browser: { device: "hel", name: "Chrome for Testing", version: "157.0.8103.38", profile: core.persona.id } });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    const m = chrome.calls.map((c) => c.method);
    expect(m).toContain("Target.closeTarget");
    expect(m.at(-1)).toBe("Browser.close"); // nothing else held it: quit (sign-ins saved)
    expect(core.ducterBrowser!.host.running(core.persona.id)).toBeUndefined();
    expect(checkLine(r)).toMatch(/^Works: opened https:\/\/example\.com\/ \("Example Domain"\) in \d+\.\d s, then closed the tab\. It is Ducter's own browser on hel \(Chrome for Testing 157\.0\.8103\.38, /);
  });

  test("the version said is the one that answered, not the one on file", async () => {
    const { core } = start({ chrome: fakeChrome({ product: "HeadlessChrome/158.0.1.2" }) });
    expect((await core.ducterBrowser!.check()).browser?.version).toBe("158.0.1.2");
  });

  test("a browser a task holds stays up; only the check's tab closes", async () => {
    const { core, chrome } = start();
    core.ducterBrowser!.port.attach("t1", { profile: core.persona.id, evidenceDir: join(td!.dir, "ev"), downloads: join(td!.dir, "dl") });
    await core.ducterBrowser!.host.ensure(core.persona.id);
    expect((await core.ducterBrowser!.check()).ok).toBe(true);
    expect(chrome.calls.map((c) => c.method)).not.toContain("Browser.close");
    expect(core.ducterBrowser!.host.running(core.persona.id)).toBeDefined();
  });

  test("not installed: says so, starts nothing", async () => {
    const { core, chrome } = start({ installed: false });
    const r = await core.ducterBrowser!.check();
    expect(r).toMatchObject({ ok: false, reason: "missing" });
    expect(chrome.launches).toBe(0);
    expect(checkLine(r)).toContain("isn't installed");
  });

  test("a page that won't load is a failure with its reason, and the browser still quits", async () => {
    const { core, chrome } = start({ chrome: fakeChrome({ navError: "net::ERR_NAME_NOT_RESOLVED" }) });
    const r = await core.ducterBrowser!.check();
    expect(r).toMatchObject({ ok: false, reason: "failed" });
    expect(r.message).toContain("ERR_NAME_NOT_RESOLVED");
    expect(chrome.calls.map((c) => c.method).at(-1)).toBe("Browser.close");
  });

  test("the partner has browser_check on a server, not on a Mac", async () => {
    const { core } = start();
    expect(core.mcp.tools("partner")).toContain("browser_check");
    const said = (await core.mcp.call({ role: "partner" }, "browser_check", {})) as string;
    expect(said).toContain("It is Ducter's own browser on hel");
    expect(said).toContain("No task was needed");
    await core.stop();
    td!.cleanup();
    const mac = start({ platform: "darwin" });
    expect(mac.core.mcp.tools("partner")).not.toContain("browser_check");
  });

  test("over the socket: browser_check answers with the same result", async () => {
    const { core } = start();
    const ws = new WebSocket(core.url);
    const frames: ServerFrame[] = [];
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ t: "hello" }));
    ws.send(JSON.stringify({ t: "browser_check" }));
    for (let i = 0; i < 100 && !frames.some((f) => f.t === "browser_check"); i++) await Bun.sleep(20);
    ws.close();
    expect(frames.find((f) => f.t === "browser_check")).toMatchObject({ ok: true, browser: { device: "hel" } });
  });
});

describe("试一下 / Try it (D154)", () => {
  test("a live view on example.com with no card: blind while open, its tab closed after, nothing answered or remembered", async () => {
    const { core, chrome } = start();
    const frames: ServerFrame[] = [];
    const sink = { send: (f: ServerFrame) => frames.push(f) };
    const b = core.ducterBrowser!;
    const id = await b.live.tryIt(sink, { width: 390, height: 700, scale: 2 });
    expect(id).toBeTruthy();
    expect(frames[0]).toMatchObject({ t: "live", state: "open", decisionId: TRY_LIVE, site: "example.com", browser: { device: "hel", name: "Chrome for Testing", profile: core.persona.id } });
    expect(chrome.calls.find((c) => c.method === "Target.createTarget")?.params).toEqual({ url: "https://example.com/" });
    expect(b.host.blind(core.persona.id)).toBe(true);
    await b.live.close(sink, id!, true);
    expect(frames.at(-1)).toMatchObject({ t: "live", state: "closed", reason: "done", decisionId: TRY_LIVE });
    expect(chrome.calls.filter((c) => c.method === "Target.closeTarget")).toHaveLength(1);
    expect(b.host.blind(core.persona.id)).toBe(false);
    expect(await b.sites.list(core.persona.id).catch(() => [])).toEqual([]);
  });
});
