// D157: Ducter's own browser on a worker. The Chrome runs on the worker (a fake one here, D154's
// seams); the main's browser host drives it over the worker's socket (a fake link that hands
// requests to the worker's ops and frames back up). The task's tools, the live view a sign-in
// card opens, and the blind rule are the home's own code on a "@<device>:<profile>" profile.
import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import type { WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import { createBrowserHost } from "../src/browser/host.ts";
import { createLive } from "../src/browser/live.ts";
import { remoteBrowserHost, routedHost, splitProfile, workerBrowserOps, workerProfile } from "../src/browser/remote.ts";
import { createWorkerBrowse } from "../src/worker-browse.ts";
import { fakeChrome } from "./fake-chrome.ts";
import { tempDir } from "./helpers.ts";

function pair(dir: string) {
  const chrome = fakeChrome({ title: "淘宝网 - 我的订单" });
  const sessions = new Map<string, (f: WorkerSessionFrame) => void>();
  const launched: string[] = [];
  const worker = workerBrowserOps({
    dataDir: join(dir, "worker"),
    send: (f: any) => sessions.get(f.key)?.(f),
    find: () => ({ path: "/opt/chrome", version: "157.0.8103.38" }),
    // A Chrome that keeps running until it is told to close.
    launch: async (o) => {
      launched.push(o.profileDir);
      const l = await chrome.launch();
      return { ...l, proc: { exited: new Promise<number>(() => {}), kill() {} } as any };
    },
    connect: chrome.connect,
  });
  let online = true;
  const link: WorkerLink = {
    id: "w1",
    name: "MacBook",
    online: () => online,
    call: async (op, args) => {
      if (!online) throw Object.assign(new Error("MacBook is not connected"), { offline: true });
      return worker.ops[op]!(args) as any;
    },
    onSession: (key, fn) => (sessions.set(key, fn), () => sessions.delete(key)),
    onOnline: () => () => {},
  };
  const home = createBrowserHost({ dataDir: join(dir, "main"), find: () => undefined });
  const remote = remoteBrowserHost(link, { dataDir: join(dir, "main") });
  const host = routedHost(home, (id) => (id === "w1" ? remote : undefined));
  const drop = () => {
    online = false;
    for (const [key, fn] of [...sessions]) fn({ t: "end", key, offline: true });
  };
  return { chrome, host, launched, worker, drop };
}

test("profiles name their computer; the home's stay plain", () => {
  expect(workerProfile("w1", "default")).toBe("@w1:default");
  expect(splitProfile("@w1:default")).toEqual({ device: "w1", profile: "default" });
  expect(splitProfile("default")).toBeUndefined();
});

test("the task's tools open tabs in the worker's Chrome, on the worker's own profile", async () => {
  const td = tempDir();
  const p = pair(td.dir);
  p.host.attach("t1", { profile: workerProfile("w1", "default"), evidenceDir: join(td.dir, "ev"), downloads: "/Users/me/.ducter/scratch/t1" });
  const { targetId, b } = await p.host.tab("t1");
  expect(targetId).toBe("T1");
  // Chrome started there, on its own profile folder (never the main's).
  expect(p.launched).toEqual([join(td.dir, "worker", "browser-profiles", "default")]);
  expect(p.chrome.calls.some((c) => c.method === "Target.createTarget")).toBe(true);
  // Downloads go to the worker's folder (set on the worker's Chrome), not made on the main.
  expect(p.chrome.calls.find((c) => c.method === "Browser.setDownloadBehavior")?.params.downloadPath).toBe("/Users/me/.ducter/scratch/t1");
  expect(p.host.about(workerProfile("w1", "default")).device).toBe("MacBook");
  expect(b.product).toBe("HeadlessChrome/157.0.8103.38");
  // A home profile never reaches the worker.
  expect(p.host.inUse("default")).toBe(false);
  await p.host.release("t1");
  expect(p.chrome.calls.some((c) => c.method === "Browser.close")).toBe(true);
  td.cleanup();
});

test("the sign-in card's live view: blind first, frames come up through the worker's socket", async () => {
  const td = tempDir();
  const p = pair(td.dir);
  const profile = workerProfile("w1", "default");
  p.host.attach("t1", { profile, evidenceDir: join(td.dir, "ev"), downloads: "" });
  await p.host.tab("t1"); // the task's own tab: T1
  let pending = true;
  const live = createLive({
    host: p.host,
    decisions: { get: (id) => (id === "d1" ? { taskId: "t1", signIn: { site: "taobao.com", url: "https://login.taobao.com" } } : undefined), isPending: () => pending, decide: () => void (pending = false) },
    tasks: { get: () => ({ persona: "default", place: { kind: "browser", profile: "default" } }) },
    persona: "default",
    maxFps: 1000,
  });
  const frames: ServerFrame[] = [];
  const sink = { send: (f: ServerFrame) => frames.push(f) };
  const id = await live.open(sink, "d1", { width: 390, height: 844 });
  expect(id).toBeTruthy();
  expect(p.host.blind(profile)).toBe(true); // the agent sees nothing while the user signs in
  expect(p.host.blind("default")).toBe(false); // the home's own profile isn't touched
  expect(frames[0]).toMatchObject({ t: "live", state: "open", site: "taobao.com", browser: { device: "MacBook" } });
  // A frame painted by the worker's Chrome reaches the window that opened the view.
  p.chrome.emit({ method: "Page.screencastFrame", sessionId: "S-T1", params: { data: "JPEG1", sessionId: 1, metadata: { deviceWidth: 390, deviceHeight: 844 } } });
  await Bun.sleep(5);
  expect(frames.find((f) => f.t === "live_frame")).toMatchObject({ data: "JPEG1", width: 390 });
  await live.close(sink, id!, true);
  expect(p.host.blind(profile)).toBe(false);
  expect(pending).toBe(false); // 好了 / Done answered the card
  td.cleanup();
});

test("the worker's socket goes: its browser reads as closed, the next tool starts it again", async () => {
  const td = tempDir();
  const p = pair(td.dir);
  p.host.attach("t1", { profile: workerProfile("w1", "default"), evidenceDir: "", downloads: "" });
  const { b } = await p.host.tab("t1");
  p.drop();
  expect(b.cdp.closed()).toBe(true);
  td.cleanup();
});

test("a worker's 上网: native tools say chrome; on a server, Ducter's browser installs there when added", async () => {
  const td = tempDir();
  const sent: any[] = [];
  const mac = createWorkerBrowse({ dataDir: join(td.dir, "mac"), send: (f) => sent.push(f), env: {}, platform: "darwin", cua: async () => ({ missing: "cua-driver is not installed" }), native: async () => "claude", perms: async () => undefined });
  // D235: 用电脑 rides along: it needs cua-driver on that Mac.
  expect(await mac.abilities()).toEqual([
    { id: "web", state: "on", detail: "claude", where: "chrome" },
    { id: "computer", state: "unavailable", reason: "cua_missing", detail: "cua-driver is not installed" },
  ]);
  expect(mac.alwaysOn("laptop")).toBe(false);

  let installed = false;
  mkdirSync(join(td.dir, "srv"), { recursive: true });
  const srv = createWorkerBrowse({
    dataDir: join(td.dir, "srv"),
    send: (f) => sent.push(f),
    env: {},
    platform: "linux",
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    find: () => (installed ? { path: "/x/chrome", version: "157.0.8103.38" } : undefined),
    install: async () => ((installed = true), { ok: true, version: "157.0.8103.38", path: "/x/chrome" }),
  });
  expect((await srv.abilities())[0]).toMatchObject({ state: "off", where: "ducter" });
  expect(await srv.set("web", true)).toEqual({ ok: true });
  await Bun.sleep(5);
  expect((await srv.abilities())[0]).toMatchObject({ state: "on", where: "ducter", detail: "157.0.8103.38" });
  expect(sent.at(-1)).toMatchObject({ t: "abilities", abilities: [{ state: "on", where: "ducter" }, { id: "computer", state: "later" }] });
  expect(await srv.ducter.status()).toEqual({ ok: true, version: "157.0.8103.38" });
  td.cleanup();
});
