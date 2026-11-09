// D151: `ducter ability add browser` and `ducter browser …` against a running core on a Linux
// server (fake installer; no Chrome).
import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdAbility, cmdBrowser } from "../src/browser-cmd.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function start(installer: () => Promise<any>) {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-browser-"));
  let installed = false;
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
  expect(out.lines[1]).toContain("Usage: ducter browser sites");
});
