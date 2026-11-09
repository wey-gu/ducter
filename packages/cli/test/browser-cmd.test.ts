// D151: `ducter ability add browser` and `ducter browser …` against a running core on a Linux
// server (fake installer; no Chrome).
import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdAbility, cmdBrowser } from "../src/browser-cmd.ts";
import { translator } from "../src/i18n.ts";
import { fakeChrome } from "@ducter/core/test/fake-chrome.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function start(installer: () => Promise<any>, extra: Record<string, unknown> = {}, installedAtStart = false) {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-browser-"));
  let installed = installedAtStart;
  core = startCore({
    dataDir: dir,
    port: 0,
    push: false,
    platform: "linux",
    deviceProbes: { cua: async () => ({ missing: "cua-driver is not installed" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" },
    browser: {
      find: () => (installed ? { path: "/opt/chrome", version: "157.0.8103.38" } : undefined),
      installer: async () => {
        const r = await installer();
        if (r.ok) installed = true;
        return r;
      },
      ...extra,
    },
  });
  return core;
}

function capture() {
  const lines: string[] = [];
  const spy = spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.join(" ")));
  return { lines, done: () => spy.mockRestore() };
}

test("ability add browser installs Ducter's browser and says it is ready", async () => {
  const c = start(async () => (await Bun.sleep(100), { ok: true, version: "157.0.8103.38", path: "/opt/chrome" }));
  const out = capture();
  const code = await cmdAbility({ t: translator("en"), target: { kind: "local", port: c.port }, json: false, rest: ["add", "browser"] });
  out.done();
  expect(code).toBe(0);
  expect(out.lines.join("\n")).toContain("Getting Ducter's browser ready");
  expect(out.lines.at(-1)).toContain("can browse the web now (Chrome 157.0.8103.38)");
});

test("missing libraries as a normal user: the one command, in Chinese too", async () => {
  const c = start(async () => ({ ok: false, reason: "deps", command: "sudo apt-get install -y --no-install-recommends libnss3", missing: ["libnss3.so"], version: "157", path: "/x" }));
  const out = capture();
  const code = await cmdAbility({ t: translator("zh"), target: { kind: "local", port: c.port }, json: false, rest: ["add", "上网"] });
  out.done();
  expect(code).toBe(1);
  expect(out.lines.join("\n")).toContain("Chrome 还缺几个系统库");
  expect(out.lines.join("\n")).toContain("sudo apt-get install -y --no-install-recommends libnss3");
});

test("browser sites with nothing set up, and the usage line", async () => {
  const c = start(async () => ({ ok: false, reason: "failed", message: "x" }));
  const out = capture();
  expect(await cmdBrowser({ t: translator("en"), target: { kind: "local", port: c.port }, json: false, rest: ["sites"] })).toBe(0);
  expect(await cmdBrowser({ t: translator("en"), target: { kind: "local", port: c.port }, json: false, rest: ["nope"] })).toBe(2);
  expect(await cmdAbility({ t: translator("en"), target: { kind: "local", port: c.port }, json: false, rest: ["add", "phone"] })).toBe(2);
  out.done();
  expect(out.lines[0]).toContain("isn't set up here yet: ducter ability add browser");
  expect(out.lines[1]).toContain("Usage: ducter browser check | browser sites");
});

test("browser check (D154): which browser, on which machine, how long; --json for scripts", async () => {
  const chrome = fakeChrome();
  const c = start(async () => ({ ok: true }), { launch: chrome.launch, connect: chrome.connect, device: () => "hel" }, true);
  const out = capture();
  const target = { kind: "local" as const, port: c.port };
  expect(await cmdBrowser({ t: translator("zh"), target, json: false, rest: ["check"] })).toBe(0);
  expect(await cmdBrowser({ t: translator("en"), target, json: true, rest: ["check"] })).toBe(0);
  out.done();
  expect(out.lines[0]).toContain("example.com");
  expect(out.lines[1]).toMatch(/^hel 上 Ducter 的浏览器能用：Chrome for Testing 157\.0\.8103\.38，配置 \S+。打开 example\.com 用了 \d+\.\d 秒，已经关掉。$/);
  const j = JSON.parse(out.lines.slice(2).join("\n"));
  expect(j).toMatchObject({ ok: true, url: "https://example.com/", title: "Example Domain", browser: { device: "hel", name: "Chrome for Testing", version: "157.0.8103.38" } });
  expect(typeof j.ms).toBe("number");
  expect(j.t).toBeUndefined();
});

test("browser check before the browser is added: the one way to add it, exit 1", async () => {
  const c = start(async () => ({ ok: false, reason: "failed", message: "x" }));
  const out = capture();
  expect(await cmdBrowser({ t: translator("en"), target: { kind: "local", port: c.port }, json: false, rest: ["check"] })).toBe(1);
  out.done();
  expect(out.lines.at(-1)).toContain("ducter ability add browser");
});
