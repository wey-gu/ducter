// D144 without a Chrome: the live-view protocol over a fake CDP (blind first, one frame in flight,
// rate limit, input mapping, only the opener drives it, done = Go), the installer's choices, the
// Sites grouping, and 上网 on a Linux server in Devices.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { createLive } from "../src/browser/live.ts";
import type { BrowserHost, RunningBrowser } from "../src/browser/host.ts";
import type { CdpConn, CdpEvent } from "../src/browser/cdp.ts";
import { aptNames, cftPlatform, chromeArgs, debPackages, installChrome, plainUserAgent, type Exec } from "../src/browser/chrome.ts";
import { readSites, rememberSite, siteOf } from "../src/browser/sites.ts";
import { pageUrl } from "../src/browser/tools.ts";
import { forwardText } from "../src/decisions.ts";
import { createDevicesView } from "../src/devices.ts";
import type { BrowserSetup } from "../src/browser/index.ts";
import { tempDir } from "./helpers.ts";

function fakeCdp() {
  const calls: { method: string; params: any; sessionId?: string }[] = [];
  const fns = new Set<(e: CdpEvent) => void>();
  const cdp: CdpConn = {
    async send(method, params = {}, sessionId) {
      calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
      if (method === "Target.createTarget") return { targetId: "T-new" };
      if (method === "Target.attachToTarget") return { sessionId: "S-live" };
      if (method === "Target.getTargetInfo") return { targetInfo: { url: "https://github.com/login", title: "Sign in to GitHub" } };
      return {};
    },
    on: (fn) => (fns.add(fn), () => fns.delete(fn)),
    onClose: () => () => {},
    closed: () => false,
    close() {},
  };
  const emit = (e: CdpEvent) => fns.forEach((f) => f(e));
  return { cdp, calls, emit };
}

function fakeHost(dataDir: string, cdp: CdpConn) {
  const live = new Map<string, string>();
  const b: RunningBrowser = { name: "default", dir: join(dataDir, "browser-profiles", "default"), cdp, sessions: new Map(), gen: 1 };
  const host = {
    dataDir,
    setLive: (p: string, id?: string) => (id ? live.set(p, id) : live.delete(p)),
    blind: (p: string) => live.has(p),
    ensure: async () => b,
    task: (id: string) => (id === "t1" ? { taskId: "t1", profile: "default", evidenceDir: "", downloads: "", tabs: ["T-task"], current: "T-task" } : undefined),
    touch() {},
  } as unknown as BrowserHost;
  return { host, live };
}

function setup(o: { pending?: boolean; maxFps?: number } = {}) {
  const td = tempDir();
  const f = fakeCdp();
  const { host } = fakeHost(td.dir, f.cdp);
  const decided: string[] = [];
  let pending = o.pending ?? true;
  const live = createLive({
    host,
    decisions: {
      get: (id) => (id === "d1" ? { taskId: "t1", signIn: { site: "github.com", url: "https://github.com/login" } } : id === "d2" ? { taskId: "t1" } : undefined),
      isPending: () => pending,
      decide: (id) => ((pending = false), decided.push(id)),
    },
    tasks: { get: () => ({ persona: "default", place: { kind: "browser", profile: "default" } }) },
    persona: "default",
    maxFps: o.maxFps ?? 1000,
  });
  const frames: ServerFrame[] = [];
  const sink = { send: (fr: ServerFrame) => frames.push(fr) };
  return { td, ...f, host, live, frames, sink, decided };
}

const frame = (data: string, w = 390, h = 844): CdpEvent => ({ method: "Page.screencastFrame", sessionId: "S-live", params: { data, sessionId: 7, metadata: { deviceWidth: w, deviceHeight: h } } });

describe("the live view (D144)", () => {
  test("opens on the task's own tab, blind before the first frame, sized to the viewer", async () => {
    const s = setup();
    const id = await s.live.open(s.sink, "d1", { width: 390, height: 844 });
    expect(id).toBeTruthy();
    expect(s.host.blind("default")).toBe(true);
    expect(s.calls.find((c) => c.method === "Target.attachToTarget")?.params).toEqual({ targetId: "T-task", flatten: true });
    expect(s.calls.find((c) => c.method === "Emulation.setDeviceMetricsOverride")?.params).toMatchObject({ width: 390, height: 844, mobile: true });
    expect(s.calls.find((c) => c.method === "Page.startScreencast")?.params).toMatchObject({ format: "jpeg" });
    expect(s.frames[0]).toMatchObject({ t: "live", state: "open", site: "github.com", title: "Sign in to GitHub", width: 390, height: 844 });
    s.td.cleanup();
  });

  test("one frame in flight: the next waits for the ack, and only the latest is kept", async () => {
    const s = setup();
    const id = (await s.live.open(s.sink, "d1"))!;
    s.emit(frame("AAA"));
    s.emit(frame("BBB"));
    s.emit(frame("CCC"));
    const sent = () => s.frames.filter((f) => f.t === "live_frame") as Extract<ServerFrame, { t: "live_frame" }>[];
    expect(sent().map((f) => f.data)).toEqual(["AAA"]);
    // Every CDP frame is acked at once (Chrome keeps painting); the client's ack gates ours.
    expect(s.calls.filter((c) => c.method === "Page.screencastFrameAck")).toHaveLength(3);
    s.live.ack(s.sink, id, 99); // a stale ack does nothing
    expect(sent()).toHaveLength(1);
    s.live.ack(s.sink, id, 1);
    await Bun.sleep(5);
    expect(sent().map((f) => [f.seq, f.data])).toEqual([[1, "AAA"], [2, "CCC"]]);
    s.td.cleanup();
  });

  test("frames are rate-limited", async () => {
    const s = setup({ maxFps: 5 });
    const id = (await s.live.open(s.sink, "d1"))!;
    s.emit(frame("A"));
    s.live.ack(s.sink, id, 1);
    s.emit(frame("B"));
    expect(s.frames.filter((f) => f.t === "live_frame")).toHaveLength(1);
    await Bun.sleep(260);
    expect(s.frames.filter((f) => f.t === "live_frame")).toHaveLength(2);
    await s.live.close(s.sink, id);
    s.td.cleanup();
  });

  test("input maps fractions to the page's CSS pixels; text goes in as typed; only the opener drives it", async () => {
    const s = setup();
    const id = (await s.live.open(s.sink, "d1"))!;
    s.emit(frame("A", 400, 800));
    await s.live.input(s.sink, id, { kind: "mouse", type: "down", x: 0.5, y: 0.25 });
    await s.live.input(s.sink, id, { kind: "mouse", type: "up", x: 0.5, y: 0.25 });
    await s.live.input(s.sink, id, { kind: "text", text: "我的密码 secret" });
    await s.live.input(s.sink, id, { kind: "key", key: "Enter" });
    await s.live.input(s.sink, id, { kind: "wheel", x: 2, y: -1, dx: 0, dy: 120 });
    const mouse = s.calls.filter((c) => c.method === "Input.dispatchMouseEvent");
    expect(mouse[0]!.params).toMatchObject({ type: "mousePressed", x: 200, y: 200, button: "left", clickCount: 1 });
    expect(mouse[1]!.params).toMatchObject({ type: "mouseReleased", x: 200, y: 200 });
    expect(mouse[2]!.params).toMatchObject({ type: "mouseWheel", x: 400, y: 0, deltaY: 120 }); // clamped to the page
    expect(s.calls.find((c) => c.method === "Input.insertText")).toMatchObject({ params: { text: "我的密码 secret" }, sessionId: "S-live" });
    expect(s.calls.filter((c) => c.method === "Input.dispatchKeyEvent").map((c) => c.params.type)).toEqual(["keyDown", "keyUp"]);
    const before = s.calls.length;
    await s.live.input({ send() {} }, id, { kind: "text", text: "intruder" });
    expect(s.calls.length).toBe(before);
    s.td.cleanup();
  });

  test("好了 / Done: sees again, remembers the site, answers the card with Go", async () => {
    const s = setup();
    const id = (await s.live.open(s.sink, "d1"))!;
    await s.live.close(s.sink, id, true);
    expect(s.host.blind("default")).toBe(false);
    expect(s.calls.map((c) => c.method)).toContain("Page.stopScreencast");
    expect(s.frames.at(-1)).toMatchObject({ t: "live", state: "closed", reason: "done" });
    expect(s.decided).toEqual(["d1"]);
    expect(readSites(s.td.dir, "default").map((r) => r.site)).toEqual(["github.com"]);
    s.td.cleanup();
  });

  test("closing without Done, or the socket going away, leaves the card open", async () => {
    const s = setup();
    const a = (await s.live.open(s.sink, "d1"))!;
    await s.live.close(s.sink, a);
    expect(s.decided).toEqual([]);
    const b = (await s.live.open(s.sink, "d1"))!;
    expect(s.host.blind("default")).toBe(true);
    await s.live.drop(s.sink);
    expect(s.host.blind("default")).toBe(false);
    expect(s.live.views()).toEqual([]);
    expect(b).not.toBe(a);
    s.td.cleanup();
  });

  test("a second window takes the view over", async () => {
    const s = setup();
    const other: ServerFrame[] = [];
    await s.live.open(s.sink, "d1");
    await s.live.open({ send: (f) => other.push(f) }, "d1");
    expect(s.frames.at(-1)).toMatchObject({ t: "live", state: "closed", reason: "replaced" });
    expect(other[0]).toMatchObject({ state: "open" });
    expect(s.host.blind("default")).toBe(true);
    s.td.cleanup();
  });

  test("only a pending sign-in card opens a view", async () => {
    const s = setup();
    expect(await s.live.open(s.sink, "d2")).toBeUndefined();
    expect(s.frames[0]).toMatchObject({ state: "closed", reason: "failed" });
    const t = setup({ pending: false });
    expect(await t.live.open(t.sink, "d1")).toBeUndefined();
    expect(t.host.blind("default")).toBe(false);
    s.td.cleanup();
    t.td.cleanup();
  });
});

describe("installing Ducter's browser (D144)", () => {
  test("platforms, deb.deps and t64 names", async () => {
    expect(cftPlatform("linux", "x64")).toBe("linux64");
    expect(cftPlatform("linux", "arm64")).toBe("linux-arm64");
    expect(cftPlatform("darwin", "arm64")).toBe("mac-arm64");
    expect(cftPlatform("win32", "x64")).toBeUndefined();
    expect(debPackages("ca-certificates\nlibasound2 (>= 1.0.17)\nlibcurl3-gnutls | libcurl3-nss | libcurl4\nwget\nxdg-utils (>= 1.0.2)\nlibnss3 (>= 2:3.35)")).toEqual(["libasound2", "libcurl3-gnutls", "libnss3"]);
    const exec: Exec = async (argv) => (argv[3] === "libasound2t64" ? { code: 0, out: "Package: libasound2t64\nVersion: 1" } : { code: 100, out: "" });
    expect(await aptNames(["libasound2", "libnss3"], exec)).toEqual(["libasound2t64", "libnss3"]);
  });

  test("the flags: new headless, loopback DevTools, the persona's profile, no sandbox only as root", () => {
    const a = chromeArgs({ chrome: "c", profileDir: "/d/browser-profiles/default", version: "157.0.8103.38", platform: "linux", root: true });
    expect(a).toContain("--headless=new");
    expect(a).toContain("--remote-debugging-address=127.0.0.1");
    expect(a).toContain("--user-data-dir=/d/browser-profiles/default");
    expect(a).toContain("--password-store=basic");
    expect(a).toContain("--no-sandbox");
    expect(a.find((x) => x.startsWith("--user-agent="))).toBe(`--user-agent=${plainUserAgent("157.0.8103.38", "linux")}`);
    expect(plainUserAgent("157.0.8103.38", "linux", "x64")).not.toContain("Headless");
    expect(chromeArgs({ chrome: "c", profileDir: "/p", platform: "linux" })).not.toContain("--no-sandbox");
  });

  function fakeInstall(dir: string, o: { missing: string[]; root: boolean; afterApt?: string[] }) {
    const calls: string[][] = [];
    let installed = false;
    const exec: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === "unzip") {
        const top = join(argv[5]!, "chrome-linux64");
        mkdirSync(top, { recursive: true });
        writeFileSync(join(top, "chrome"), "#!/bin/sh\n");
        writeFileSync(join(top, "deb.deps"), "libnss3 (>= 2:3.35)\nlibasound2 (>= 1.0.17)\nwget\n");
        return { code: 0, out: "" };
      }
      if (argv[0] === "ldd") return { code: 0, out: (installed ? (o.afterApt ?? []) : o.missing).map((l) => `\t${l} => not found`).join("\n") };
      if (argv[0] === "apt-cache") return argv[3] === "libasound2t64" ? { code: 0, out: "Package: libasound2t64" } : { code: 100, out: "" };
      if (argv[0] === "apt-get" && argv[1] === "install") installed = true;
      return { code: 0, out: "" };
    };
    const fetchFake = (async (url: string) =>
      String(url).endsWith(".json")
        ? Response.json({ channels: { Stable: { version: "157.0.8103.38", downloads: { chrome: [{ platform: "linux64", url: "https://example.test/chrome-linux64.zip" }] } } } })
        : new Response("zip-bytes")) as unknown as typeof fetch;
    return installChrome({ dataDir: dir, platform: "linux", arch: "x64", fetch: fetchFake, exec, root: o.root, check: async () => "HeadlessChrome/157" }).then((r) => ({ r, calls }));
  }

  test("as root: downloads, unpacks, installs the missing libraries (t64 names, CJK fonts), records it", async () => {
    const td = tempDir();
    const { r, calls } = await fakeInstall(td.dir, { missing: ["libnss3.so"], root: true });
    expect(r).toMatchObject({ ok: true, version: "157.0.8103.38" });
    const apt = calls.find((c) => c[0] === "apt-get" && c[1] === "install")!;
    expect(apt).toContain("libasound2t64");
    expect(apt).toContain("libnss3");
    expect(apt).toContain("fonts-noto-cjk");
    expect(apt).not.toContain("wget");
    const rec = JSON.parse(readFileSync(join(td.dir, "browser", "installed.json"), "utf8"));
    expect(rec.path).toBe(join(td.dir, "browser", "157.0.8103.38", "chrome-linux64", "chrome"));
    expect(existsSync(join(td.dir, "browser", "chrome-linux64-157.0.8103.38.zip"))).toBe(false);
    td.cleanup();
  });

  test("as a normal user: no sudo, the one command to run instead", async () => {
    const td = tempDir();
    const { r, calls } = await fakeInstall(td.dir, { missing: ["libnss3.so"], root: false });
    expect(r).toMatchObject({ ok: false, reason: "deps" });
    if (r.ok || r.reason !== "deps") throw new Error("unreachable");
    expect(r.command).toBe("sudo apt-get install -y --no-install-recommends libnss3 libasound2t64 fonts-liberation fonts-noto-cjk");
    expect(calls.some((c) => c[0] === "apt-get" || c[0] === "sudo")).toBe(false);
    expect(existsSync(join(td.dir, "browser", "installed.json"))).toBe(false);
    td.cleanup();
  });

  test("nothing missing: no apt at all", async () => {
    const td = tempDir();
    const { r, calls } = await fakeInstall(td.dir, { missing: [], root: true });
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c[0] === "apt-get")).toBe(false);
    td.cleanup();
  });
});

describe("pieces", () => {
  test("sites group by registrable domain; the list keeps the latest sign-in first", () => {
    expect(siteOf(".accounts.google.com")).toBe("google.com");
    expect(siteOf("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(siteOf("127.0.0.1")).toBe("127.0.0.1");
    const td = tempDir();
    mkdirSync(join(td.dir, "browser-profiles"), { recursive: true });
    rememberSite(td.dir, "default", "github.com", new Date("2026-11-10T01:00:00Z"));
    rememberSite(td.dir, "default", "mail.google.com", new Date("2026-11-10T02:00:00Z"));
    rememberSite(td.dir, "default", "gist.github.com", new Date("2026-11-10T03:00:00Z"));
    expect(readSites(td.dir, "default").map((r) => r.site)).toEqual(["github.com", "google.com"]);
    td.cleanup();
  });

  test("only http(s) pages; a bare host gets https", () => {
    expect(pageUrl("github.com/login")).toBe("https://github.com/login");
    for (const bad of ["file:///etc/passwd", "chrome://settings", "javascript:alert(1)", "data:text/html,x"]) expect(() => pageUrl(bad)).toThrow(/only http and https/);
  });

  test("Go on a sign-in card tells the task the user did it themselves", () => {
    const d = { decisionId: "d", taskId: "t", question: "q", goLabel: "Signed in", defaultOption: "go" as const, reversible: false, signIn: { site: "github.com" } };
    expect(forwardText(d, { decisionId: "d", option: "go", by: "user" })).toContain("signed in to github.com");
  });
});

describe("上网 on a Linux server (D144)", () => {
  const auth = { list: () => [], createCode: () => ({ code: "x", expiresAt: 0 }), rename: () => ({ error: "unknown_device" }) } as any;
  const workers = { online: () => [], away: () => new Map(), onChange: () => () => {}, renamed() {} } as any;
  const probes = { cua: async () => ({ missing: "cua-driver is not installed" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" as const };

  function view(setupState: () => BrowserSetup) {
    const td = tempDir();
    let installs = 0;
    const listeners = new Set<() => void>();
    const v = createDevicesView({
      dataDir: td.dir, auth, workers, probes, platform: "linux", env: {},
      browser: { setup: setupState, install: async () => void installs++, onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)) },
    });
    return { td, v, installs: () => installs };
  }
  const web = async (v: ReturnType<typeof createDevicesView>) => (await v.frame()).devices[0]!.abilities.find((a) => a.id === "web")!;

  test("not installed: can be added (never 这台还装不了); adding installs it", async () => {
    let state: BrowserSetup = { state: "missing" };
    const s = view(() => state);
    expect(await web(s.v)).toEqual({ id: "web", state: "off", where: "ducter" });
    const r = await s.v.setAbility("local", "web", true);
    expect(r).toMatchObject({ ok: true });
    expect(s.installs()).toBe(1);
    state = { state: "installing", step: "download" };
    expect(await web(s.v)).toMatchObject({ state: "on", setup: "installing", where: "ducter" });
    state = { state: "ready", version: "157.0.8103.38" };
    expect(await web(s.v)).toEqual({ id: "web", state: "on", detail: "157.0.8103.38", where: "ducter" });
    s.v.stop();
    s.td.cleanup();
  });

  test("missing libraries as a normal user: says the command; adding again retries", async () => {
    const s = view(() => ({ state: "deps", command: "sudo apt-get install -y libnss3" }));
    expect(await web(s.v)).toMatchObject({ state: "unavailable", reason: "browser_deps", detail: "sudo apt-get install -y libnss3" });
    expect((await s.v.setAbility("local", "web", true)).ok).toBe(true);
    expect(s.installs()).toBe(1);
    s.v.stop();
    s.td.cleanup();
  });

  test("removed stays removed", async () => {
    const s = view(() => ({ state: "ready", version: "157" }));
    expect((await s.v.setAbility("local", "web", false)).ok).toBe(true);
    expect((await web(s.v)).state).toBe("off");
    s.v.stop();
    s.td.cleanup();
  });
});
