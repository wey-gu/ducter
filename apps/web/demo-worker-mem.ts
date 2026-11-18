// A demo core for D366's pictures: Nowledge Mem on a computer for tasks. The home has Mem connected
// (pretend), and haswell, a server lent for tasks with Codex and Claude Code signed in, says where
// Mem stands there. Real core and real web client; haswell is a pretend worker over the real
// socket (nothing is installed, no link is redeemed, no Mem is reached).
//   DUCTER_PORT=7841 DUCTER_DATA_DIR=$(mktemp -d) DEMO_CTL_PORT=7842 bun apps/web/demo-worker-mem.ts
// Then POST /mem?state=before | absent | installing | sign_in | used | connecting | ready | left on
// DEMO_CTL_PORT. The card's own taps step it too: 装上 → installing → sign_in; 登录 → connecting → ready.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.322", how: "installer" },
      { harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" },
    ],
    kind: async () => "server",
  },
  update: { homeName: "home-server", autoEveryMs: 0, run: () => new Promise(() => {}) },
  // The home's Mem: connected (pretend). Its own agents have the plugin.
  memPlugins: { inspectLocal: async () => ({ "claude-code": { state: "installed", version: "0.7.36" }, codex: { state: "installed", version: "0.7.36" } }), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

type Mem = Record<string, unknown> | undefined;
const states: Record<string, Mem> = {
  before: undefined,
  absent: { state: "absent", installable: true },
  installing: { state: "absent", installable: true, step: { phase: "installing", pct: 42 } },
  sign_in: { state: "sign_in", version: "0.10.120" },
  used: { state: "sign_in", version: "0.10.120", step: { phase: "failed", reason: "used" } },
  connecting: { state: "sign_in", version: "0.10.120", step: { phase: "connecting" } },
  ready: { state: "ready", version: "0.10.120", agents: ["claude-code", "codex"] },
  left: { state: "ready", version: "0.10.120", agents: ["codex"] },
};
let now = process.env.DEMO_MEM ?? "absent";

const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "haswell", platform: "linux-x64", computer: "haswell" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
const plugins = () => (now === "ready" ? { "claude-code": { state: "installed", version: "0.7.36" }, codex: { state: "installed", version: "0.7.36" } } : now === "left" ? { "claude-code": { state: "absent" }, codex: { state: "installed", version: "0.7.36" } } : null);
const say = (s: string) => {
  now = s;
  ws.send(JSON.stringify({ t: "mem", mem: states[s] ?? { state: "absent" } }));
};
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  if (f.op === "mem_plugins") return ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: plugins() }));
  ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: f.op === "mem_setup" ? { ok: true } : null }));
  if (f.op !== "mem_setup") return;
  if (f.args.action === "install") (say("installing"), setTimeout(() => say("sign_in"), 2500));
  if (f.args.action === "connect") (say("connecting"), setTimeout(() => say("ready"), 2500));
};
ws.send(
  JSON.stringify({
    t: "hello",
    os: "linux",
    arch: "x64",
    kind: "server",
    version: "0.0.80",
    how: "self",
    abilities: [{ id: "web", state: "off", where: "ducter" }],
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true, version: "2.1.322", how: "npm" },
      { id: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" },
      { id: "pi", installed: false, loggedIn: false, installable: true },
    ],
    ...(states[now] ? { mem: states[now] } : {}),
  }),
);

Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7842),
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/mem") {
      const s = url.searchParams.get("state") ?? "absent";
      // "before": a worker that says nothing about Mem (main before D366): the card as it was.
      if (s === "before") return new Response("restart the demo with DEMO_MEM=before", { status: 400 });
      say(s);
      return new Response("ok");
    }
    return new Response("?", { status: 404 });
  },
});
console.log(`demo at http://127.0.0.1:${core.port}/app`);
