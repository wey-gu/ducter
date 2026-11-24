// A demo core for D538: 关于这台 / About this computer. hel is the home (a server: 7.6 GB, no swap,
// 1.0 GB free, stopped twice for memory that day), haswell does tasks for it (64 GB, 41 GB free), and
// the person said once that heavy verification goes to haswell and that hel runs no browsers. Real
// core and real web client; the computers' looks are fixed, nothing reaches Mem.
//   DUCTER_PORT=7538 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d538.ts
// then open http://127.0.0.1:7538/app#settings=devices, tap haswell, open 关于这台.
import { mkdirSync, writeFileSync } from "node:fs";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const GB = 2 ** 30;
const en = process.env.DEMO_LANG === "en";
const dataDir = process.env.DUCTER_DATA_DIR ?? "";
if (dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const rule = (id: string, text: string, device: string, where: object, at: string) => ({ id, text, harness: "", match: [], createdAt: at, device, where });
  writeFileSync(
    `${dataDir}/rules.json`,
    JSON.stringify({
      rules: [
        rule("rule_a1", en ? "haswell has lots of memory, put verification and test runs there" : "haswell 内存大，验证、跑测试的活多放它", "haswell", { heavy: true, mem: "ducter-placement-rule_a1" }, "2026-11-24T08:00:00.000Z"),
        rule("rule_b2", en ? "No browsers on hel" : "hel 别跑浏览器", "hel", { avoid: true, web: true }, "2026-11-24T08:01:00.000Z"),
      ],
    }),
  );
}

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "codex", installed: true, loggedIn: true, version: "0.172.0", how: "npm" },
      { harness: "antigravity", installed: true, loggedIn: true, version: "1.5.16", how: "installer" },
    ],
    kind: async () => "server",
    resources: async () => ({ at: "2026-11-24T07:26:00.000Z", memTotal: 7.6 * GB, memFree: 1.0 * GB, cores: 4, load: 4.4, swapTotal: 0, diskFree: 38 * GB, diskTotal: 75 * GB, oom: ["2026-11-24T07:26:01.000Z", "2026-11-24T07:30:15.000Z"] }),
  },
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.1.42", body: "" })), how: "self", version: "0.1.42", homeName: "hel", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: (async () => new Response("", { status: 404 })) as any, sys: { fetch: (async () => new Response("", { status: 404 })) as any, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
  memPlugins: { inspectLocal: async () => ({}), everyMs: 0, connected: () => false },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

// haswell, doing tasks for hel, with its own look on its hello and its heartbeat.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "haswell", platform: "linux-x64", computer: "haswell" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
const look = { at: "2026-11-24T07:26:00.000Z", memTotal: 64 * GB, memFree: 41 * GB, cores: 16, load: 2.1, swapTotal: 8 * GB, diskFree: 312 * GB, diskTotal: 931 * GB };
ws.send(
  JSON.stringify({
    t: "hello",
    os: "linux",
    arch: "x64",
    kind: "server",
    alwaysOn: true,
    version: "0.1.42",
    how: "self",
    abilities: [{ id: "web", state: "on", where: "ducter" }],
    harnesses: [
      { id: "codex", installed: true, loggedIn: true, version: "0.172.0", how: "npm" },
      { id: "claude-code", installed: true, loggedIn: true, version: "2.1.331", how: "installer" },
    ],
    resources: look,
  }),
);
setInterval(() => ws.send(JSON.stringify({ t: "ping", res: look })), 15_000);
console.log(`[demo] http://127.0.0.1:${core.port}/app#settings=devices`);
