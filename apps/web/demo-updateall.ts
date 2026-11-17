// A demo core for 全部更新 / Update all's pictures (D224): hel is the home (a server on 0.0.30, its
// Claude Code and Codex behind), a mini does tasks for it (0.0.30, its Codex behind), a MacBook is
// away. Real core and real web client; the release feed, the registry, the installs and the
// mini's answers are fakes (no network, nothing installed).
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-updateall.ts
// Then, on DEMO_CTL_PORT (7799): POST /go (the tap), /home (hel comes back on 0.0.31), /mini
// (the mini's download moves; ?fail=1 makes it fail), /free (the task on Claude Code pauses),
// /agents (the agents' updaters finish).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const en = process.env.DEMO_LANG === "en";
const feed = async () => new Response(JSON.stringify({ tag_name: "v0.0.31", body: "- Update all\n<!-- whats-new\nzh: 一键全部更新\nen: Update everything at once\n-->\n" }));
const registry = async (u: string) =>
  u.includes("@openai/codex") ? new Response('{"version":"0.168.0"}') : u.includes("claude-code-releases") ? new Response("2.1.322") : new Response("", { status: 404 });
let homeDone: (() => void) | undefined;
// hel's agents: their versions move when their updater "runs" (held until /agents).
const ver: Record<string, string> = { "claude-code": "2.1.319", codex: "0.167.0" };
const how: Record<string, "installer" | "npm"> = { "claude-code": "installer", codex: "npm" };
const agentGate: (() => void)[] = [];
const agentRun = async (argv: string[]) => {
  const h = argv.join(" ").includes("codex") ? "codex" : argv.join(" ").includes("claude") ? "claude-code" : "";
  if (h) {
    await new Promise<void>((r) => agentGate.push(r));
    ver[h] = h === "codex" ? "0.168.0" : "2.1.322";
  }
  return { code: 0, out: "" };
};
// D329: hel's own Nowledge Mem (a pipx copy) has a newer one out: a step of the plan too. Nothing runs.
let memVer = "0.10.118";
const memOk = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const memRun = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return memOk(`nmem ${memVer}`);
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return memOk({ status: "healthy", backend: "cloud", update: { current: memVer, latest: "0.10.121", update_available: memVer !== "0.10.121" } });
  if (a === "bridge setup") return memOk({ candidates: [{ id: "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11", label: "Only me", kind: "personal" }] });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const NMEM = "/home/wei/.local/pipx/venvs/nmem-cli/bin/nmem";
const memTools: Record<string, string> = { nmem: NMEM, pipx: "/usr/bin/pipx" };
const memSys = { which: (c: string) => memTools[c], exists: (p: string) => p === NMEM, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/wei", platform: "linux" as const, uid: 1000 };
let memGate: (() => void) | undefined;
const memExec = async (argv: string[]) => {
  if (argv.includes("upgrade")) {
    await new Promise<void>((r) => (memGate = r));
    memVer = "0.10.121";
  }
  return { code: 0, out: "", err: "" };
};
const core = startCore({
  ooSource: noOo,
  bridgeLink: { run: memRun as never, env: {}, sys: memSys as never, exec: memExec as never },
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => Object.keys(ver).map((h) => ({ harness: h, installed: true, loggedIn: true, version: ver[h], how: how[h] })) as any,
    kind: async () => "server",
  },
  update: {
    fetch: feed,
    how: "self",
    version: "0.0.30",
    homeName: "hel",
    autoEveryMs: 0,
    graceMs: 10,
    // The home's own update: downloading, then held until /home (then "swapped").
    run: async (i) => {
      i.onPhase?.("downloading", 0.62);
      await new Promise<void>((r) => (homeDone = r));
      i.onPhase?.("verifying");
      return { ok: true, restarting: false, target: "/x/ducter" };
    },
  },
  agents: {
    fetch: registry as any,
    sys: { fetch: registry as any, run: agentRun as any, freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() },
    detect: async (h) => (ver[h] ? { version: ver[h], how: how[h]!, path: `/usr/local/bin/${h}` } : undefined),
    loggedIn: async () => true,
    exists: () => true,
    autoEveryMs: 0,
    settleMs: 60 * 60_000,
  },
  updateAll: { tickMs: 500, nightEveryMs: 0 },
  memPlugins: { inspectLocal: async () => undefined, everyMs: 0, connected: () => false },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
await core.release.check(true);
await core.bridgeLink.view(); // D329: the home's Mem looked at once, so the offer holds it

// The mini, doing tasks for hel; it answers the update op and reports its steps when told.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "mini", platform: "darwin-arm64", computer: "mini" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  if (f.op === "update") {
    ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { ok: true } }));
    ws.send(JSON.stringify({ t: "update", phase: "downloading", progress: 0.18, from: "0.0.30", to: "0.0.31" }));
  } else if (f.op === "agent_update") ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { ok: true } }));
  else ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: null }));
};
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "mini",
    version: "0.0.30",
    how: "self",
    abilities: [{ id: "web", state: "off", where: "chrome" }],
    harnesses: [{ id: "codex", installed: true, loggedIn: true, version: "0.165.2", how: "brew" }],
  }),
);
// The MacBook: paired, away (last seen yesterday), behind.
core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook", platform: "darwin-arm64", computer: "MacBook" } as any);
core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios-safari" });
await Bun.sleep(100);
await core.agents.check();

// One task on hel uses Claude Code right now: its update waits for it.
const title = en ? "Turn the weekly report into Keynote" : "把周报做成 Keynote";
core.log.append({ stream: "task:t_key", origin: "partner", kind: "task_open", body: { taskId: "t_key", title, project: "", place: { kind: "none" }, harness: "claude-code", brief: title } });
core.tasks.setState("t_key", "working", "hot");

const homeOn = () => {
  homeDone?.();
};
Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7799),
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/go") return Response.json(await core.updateAll.start("user"));
    if (url.pathname === "/home") return homeOn(), new Response("ok");
    if (url.pathname === "/mem") return memGate?.(), new Response("ok");
    if (url.pathname === "/mini") {
      const fail = url.searchParams.get("fail") === "1";
      ws.send(JSON.stringify(fail ? { t: "update", phase: "failed", from: "0.0.30", to: "0.0.31", reason: "checksum", rolledBack: false } : { t: "update", phase: "downloading", progress: 0.71, from: "0.0.30", to: "0.0.31" }));
      return new Response("ok");
    }
    if (url.pathname === "/free") return core.tasks.setState("t_key", "waiting", "hot"), new Response("ok");
    if (url.pathname === "/agents") return agentGate.splice(0).forEach((r) => r()), new Response("ok");
    return new Response("?", { status: 404 });
  },
});
console.log(`demo at http://127.0.0.1:${core.port}/app`);
