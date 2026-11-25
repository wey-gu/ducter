// D489: Agent messaging in the author's real shape. The home is the server hel, on the person's one
// Nowledge Mem (Nowledge Cloud; the partner listens in "Only me"); the person's MacBook Pro M3 is a
// computer for tasks with Claude Code, Codex, pi and Antigravity, Mem's plugin in each. D560: Claude Code's
// plugin (0.7.37) readies each new session by itself and none has connected yet, so its next session hears
// back; Codex both ways (Mem has an active connection labelled codex); pi's own Mem plugin carries no Bridge
// (Ducter's tasks on it pass messages through Ducter). No nmem runs: scripted stand-ins answer as nmem would.
//   DUCTER_PORT=7489 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=author bun apps/web/demo-d489.ts
// DEMO_STAGE:
//   author    as above, with a week of exchanges (a request that became a task, one answered, the
//             partner's question waiting, a reply to Claude Code that didn't go)
//   fresh     as author, nothing exchanged yet
//   linked    as author after a Claude Code session connected: both ways for both
//   old       D560: Claude Code's plugin is 0.7.20 and Mem offers 0.7.38: its update is the one button
//   plugin    Codex has no Mem plugin on the Mac yet (one tap to install)
//   off       the switch off
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "author";
const SPACE = "personal-7d1e0c2a";
const CLOUD = "https://cloud.nowledge.co/remote-api";
const MAC = "MacBook Pro M3";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const candidates = [
  { id: "default", label: "Before the team", kind: "default", readers: 6, write_default: false },
  { id: "all", label: "Everyone", kind: "commons", readers: 10, write_default: false },
  { id: "codex", label: "Codex", kind: "team", readers: 7, write_default: false },
  { id: "dev-team", label: "dev team", kind: "team", readers: 7, write_default: false },
  { id: "nowledge-co/mem", label: "Nowledge Co/mem", kind: "team", readers: 7, write_default: false },
  { id: "nowledge-mem", label: "Nowledge Mem", kind: "team", readers: 7, write_default: false },
  { id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true },
  { id: "userfiles", label: "userFiles", kind: "team", readers: 8, write_default: false },
];
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok("nmem 0.10.122");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a.includes("connections list --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "ok", backend: "cloud", mode: "remote", api_url: CLOUD });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates });
  if (a.includes("connections connect")) {
    conn.client_label = args[args.indexOf("--context") + 1] ?? "ducter";
    return ok({ state: "connected", agent_context: conn.client_label, connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: conn.client_label === "ducter" ? [] : [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const sys = { which: () => undefined, exists: () => false, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/weyl", platform: "linux" as const, uid: 1000 };
let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({
  clock,
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  platform: "linux",
  bridgeLink: { run: run as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) },
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" }],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0, run: () => new Promise(() => {}) },
  memPlugins: { inspectLocal: async () => ({ codex: stage === "plugin" ? { state: "absent" } : { state: "installed", version: "0.1.53" } }), ...(stage === "old" ? { checkUpdates: async () => ({ "claude-code": "0.7.38", codex: "0.1.53" }) } : {}), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
if (stage === "off") core.settings.set({ peers: { reach: "off" } } as never);
if (stage !== "off") void core.bridgeLink.connect(); // off: the link is down, as after the switch
// D560: Mem's connections say which tools can receive; nothing is ever said closed.
core.bridgeLink.setMailboxes?.([...(stage === "plugin" ? [] : [{ harness: "codex", open: true }]), ...(stage === "linked" ? [{ harness: "claude-code", open: true }] : [])]);

const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: MAC, platform: "darwin-arm64", computer: MAC } as never) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as never);
await new Promise<void>((r) => (ws.onopen = () => r()));
const codexPlugin = stage === "plugin" ? { state: "absent" } : { state: "installed", version: "0.1.53" };
const claudePlugin = { state: "installed", version: stage === "old" ? "0.7.20" : "0.7.37" };
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  const reply = (result: unknown) => ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result }));
  if (f.op === "mem_plugins")
    return reply({ "claude-code": claudePlugin, codex: codexPlugin, pi: { state: "installed", version: "0.2.4" }, antigravity: { state: "installed", version: "0.1.9" } });
  if (f.op === "mem_bridge_look") return reply({ signedIn: true, setup: { state: "selection_needed", candidates } });
  reply(null);
};
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.1.19",
    how: "app",
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true, version: "2.1.322", how: "installer" },
      { id: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" },
      { id: "pi", installed: true, loggedIn: true, version: "0.71.0", how: "npm" },
      { id: "antigravity", installed: true, loggedIn: true, version: "1.4.2", how: "app" },
    ],
    mem: { state: "ready", version: "0.10.122", agents: ["claude-code", "codex", "pi", "antigravity"], carried: true },
  }),
);
await Bun.sleep(300);
void core.memPlugins?.check();

if (stage === "author" || stage === "linked") {
  const log = core.log;
  const tick = () => Bun.sleep(30);
  core.settings.setPeers?.({ trusted: ["Codex"] });
  const codex = { from: "another agent", mine: true, agent: "Codex", role: zh ? "Mem 协作" : "Mem helper", selfNamed: true, space: SPACE };
  const cc = { from: "another agent", mine: true, agent: "Claude Code", role: zh ? "终端" : "terminal", selfNamed: true, space: SPACE };
  const at = (ms: number) => ((shift = -ms), { sentAt: iso(now - ms) });
  // Two days ago: Codex handed over the benchmark rerun; the partner took it as a task (trusted).
  const t1 = zh ? "重跑 PR #412 的 benchmark" : "Rerun the benchmark for PR #412";
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-1", ...codex, ...at(2 * DAY), text: zh ? "PR #412 合进去之后帮我重跑一遍 benchmark，看 p99 有没有回退。" : "Once PR #412 is in, rerun the benchmark and see whether p99 regressed.", linked: true, first: true } });
  log.append({ stream: "task:t_bench", origin: "partner", kind: "task_open", body: { taskId: "t_bench", title: t1, project: "HawDB", place: { kind: "none" }, harness: "codex", brief: "x" } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-claim-1", to: "another agent", ...codex, text: zh ? `接下了，开了任务「${t1}」。` : `On it: task "${t1}".`, inReplyTo: "m-in-1", taskId: "t_bench", opId: "c1", state: "sent" } as never });
  await tick();
  // Yesterday: Codex asked a question; the partner answered it.
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-2", ...codex, ...at(DAY), text: zh ? "recall 测试上次偶发失败是怎么修的？" : "How was the flaky recall test fixed last time?", linked: true } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-rep-2", to: "another agent", ...codex, text: zh ? "先等 indexReady() 再发第一个查询，之后就没再挂过。" : "Await indexReady() before the first query; it hasn't failed since.", inReplyTo: "m-in-2", opId: "c2", state: "sent" } as never });
  await tick();
  // This morning: Claude Code asked; the reply didn't go (its mailbox is closed).
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-5", ...cc, ...at(5 * HOUR), text: zh ? "CI 红了，是不是 main 上谁动了 runner？" : "CI is red; did someone touch the runner on main?", linked: true } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "", to: "another agent", ...cc, text: zh ? "是昨晚的 runner 改动，我开了任务去看。" : "It's last night's runner change; I've opened a task.", inReplyTo: "m-in-5", opId: "c5", state: "failed" } as never });
  await tick();
  shift = 0;
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=peers (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
