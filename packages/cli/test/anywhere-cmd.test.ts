// D228: `ducter anywhere on | off | status` against a running core, its tunnel faked.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import type { TunnelSys } from "@ducter/core/src/anywhere.ts";
import { cmdAnywhere } from "../src/anywhere-cmd.ts";
import { plainStyle } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function start(o: { fail?: boolean; own?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-anywhere-"));
  if (o.own) writeFileSync(join(dir, "public-url"), "https://hel.example.com\n");
  const live = new Set<number>();
  let pid = 0;
  const sys: TunnelSys = {
    ensure: async (getting) => (getting(), o.fail ? { error: "cloudflare" } : { bin: "/fake/cloudflared" }),
    start: async () => (live.add(++pid), { pid }),
    alive: async (h) => !!h.pid && live.has(h.pid),
    stop: async (h) => void (h.pid && live.delete(h.pid)),
    hostname: async () => `quiet-river-${pid}.trycloudflare.com`,
    ready: async () => true,
    resolves: async () => true,
    freePort: async () => 21000,
    fetch: (async () => new Response("{}")) as unknown as typeof fetch,
  };
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin", anywhereSys: sys, deviceProbes: { cua: async () => ({ missing: "x" }), native: async () => undefined, harnesses: async () => [], kind: async () => "laptop" } });
  return core;
}

const run = async (c: Core, rest: string[], json = false, lang: "en" | "zh" = "en") => {
  const lines: string[] = [];
  const code = await cmdAnywhere({ t: translator(lang), style: plainStyle, target: { kind: "local", port: c.port }, json, rest, print: (s) => lines.push(s) });
  return { code, out: lines.join("\n") };
};

test("on: it opens, says the address, who gets in and that it moves; status and off", async () => {
  const c = start();
  expect((await run(c, ["status"])).out).toContain("From anywhere is off");
  const on = await run(c, ["on"]);
  expect(on.code).toBe(0);
  expect(on.out).toContain("From anywhere: on, at https://quiet-river-1.trycloudflare.com");
  expect(on.out).toContain("The address changes when this computer restarts");
  expect(on.out).toContain("Only devices you connect get in");
  const st = JSON.parse((await run(c, ["status"], true)).out);
  expect(st).toMatchObject({ on: true, address: "https://quiet-river-1.trycloudflare.com", anywhere: { how: "tunnel", state: "on", moves: true } });
  expect(st.anywhere.follow).toBeUndefined(); // the key stays off the terminal
  const off = await run(c, ["off"], false, "zh");
  expect(off.code).toBe(0);
  expect(off.out).toContain("「在哪儿都能用」关掉了");
  expect(JSON.parse((await run(c, ["status"], true)).out)).toEqual({ on: false });
});

test("it can't reach Cloudflare: said plainly, exit 1", async () => {
  const c = start({ fail: true });
  const r = await run(c, ["on"]);
  expect(r.code).toBe(1);
  expect(r.out).toContain("Couldn't turn on: Cloudflare couldn't be reached from here.");
});

test("an address of the person's own: on already, and off points to ducter domain --remove", async () => {
  const c = start({ own: true });
  expect((await run(c, ["status"])).out).toContain("on, at your own address https://hel.example.com");
  const off = await run(c, ["off"]);
  expect(off.code).toBe(1);
  expect(off.out).toContain("ducter domain --remove");
  expect((await run(c, ["nonsense"])).code).toBe(2);
});
