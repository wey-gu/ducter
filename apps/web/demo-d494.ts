// D494: Agent messaging with the author's helpers (你的帮手 / Your helpers), on D489's demo of his real
// shape (the home hel on his one Nowledge Mem; the MacBook Pro M3 a computer for tasks; Claude Code and
// Codex both ways once linked). Two helpers: "Nowledge Mem PR babysitter" taking PRs his agents hand over
// (two on hand, five this week, in invented words), and a stopped one. No nmem runs: scripted stand-ins.
//   DUCTER_PORT=7494 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d494.ts
// DEMO_STAGE: linked (default) | author | fresh | plugin | off, as demo-d489.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "linked";
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
// D494: the helpers, as the home keeps them (helpers.json), before core starts.
const dataDir = process.env.DUCTER_DATA_DIR!;
mkdirSync(dataDir, { recursive: true });
const helperOn = { id: "nowledge-mem-pr-babysitter", name: "Nowledge Mem PR babysitter", about: zh ? "我的 agent 交过来的 nowledge-co/mem PR，盯到能合并" : "nowledge-co/mem PRs my agents hand over, watched until they can merge", brief: "Watch CI and reviews; fix and push to the PR's branch; never merge.", persona: "default", agentId: "ducter-helper-nowledge-mem-pr-babysitter", state: "on", createdAt: iso(now - 3 * DAY), link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hel", connectionId: "c-h1", spaceId: SPACE }, mem: "ready" };
const helperOff = { id: "hawdb-bench-rerun", name: zh ? "HawDB 基准复跑" : "HawDB bench reruns", about: zh ? "合进 main 的 PR，重跑一遍 benchmark 看 p99" : "PRs merged to main: rerun the benchmark and check p99", brief: "", persona: "default", agentId: "ducter-helper-hawdb-bench-rerun", state: "stopped", createdAt: iso(now - 9 * DAY), mem: "ready" };
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helperOn, helperOff] }, null, 2));
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
  memPlugins: { inspectLocal: async () => ({ codex: stage === "plugin" ? { state: "absent" } : { state: "installed", version: "0.7.37" } }), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
if (stage === "off") core.settings.set({ peers: { reach: "off" } } as never);
if (stage !== "off") void core.bridgeLink.connect(); // off: the link is down, as after the switch
core.bridgeLink.setMailboxes?.([...(stage === "plugin" ? [] : [{ harness: "codex", open: true }]), { harness: "claude-code", open: stage === "linked" }]);

const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: MAC, platform: "darwin-arm64", computer: MAC } as never) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as never);
await new Promise<void>((r) => (ws.onopen = () => r()));
const codexPlugin = stage === "plugin" ? { state: "absent" } : { state: "installed", version: "0.7.37" };
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  const reply = (result: unknown) => ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result }));
  if (f.op === "mem_plugins")
    return reply({ "claude-code": { state: "installed", version: "0.7.37" }, codex: codexPlugin, pi: { state: "installed", version: "0.2.4" }, antigravity: { state: "installed", version: "0.1.9" } });
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

// D494: what the babysitter took this week: five PRs handed over, two still on hand.
{
  const log = core.log;
  const codexH = { from: "another agent", mine: true, agent: "Codex", role: zh ? "Mem 协作" : "Mem helper", selfNamed: true, space: SPACE, helper: helperOn.id };
  const prs = [["10932", "working"], ["10996", "blocked"], ["10847", "done"], ["10781", "done"], ["10969", "done"]] as const;
  for (const [i, [n, state]] of prs.entries()) {
    const id = `t_pr${n}`;
    log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: `m-h${i}`, ...codexH, sentAt: iso(now - (i + 1) * 9 * HOUR), text: `nowledge-co/mem#${n}`, linked: true } as never });
    // The three done ones are long finished (no task here any more): only the two on hand are open tasks.
    if (state !== "done") {
      log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? `盯 mem#${n} 到能合并` : `Watch mem#${n} until it can merge`, project: "mem", place: { kind: "none" }, harness: "codex", brief: "x" } });
      log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: state, residency: "warm", ...(state === "blocked" ? { reason: zh ? "等 CI 在新提交上跑完" : "CI on the new head" } : {}) } });
    }
    log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: `m-hc${i}`, to: "another agent", ...codexH, text: "on it", inReplyTo: `m-h${i}`, taskId: id, opId: `hc${i}`, state: "sent" } as never });
  }
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=peers (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
