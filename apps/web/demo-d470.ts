// D470: a demo core for 和你的其他 agent 通信 / Talk with your other agents, in one state each, and the
// conversation where a request from the person's own Codex arrives. No nmem runs: a scripted stand-in
// answers the read-only checks as nmem 0.10.121 would, and every exchange is seeded into the Log.
//   DUCTER_PORT=7461 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=exchanges bun apps/web/demo-d470.ts
// DEMO_STAGE:
//   linked    both Claude Code and Codex reach the partner and Mem lists both mailboxes open; nothing exchanged
//   oneway    Codex both ways; Claude Code reaches the partner but Mem lists its mailbox closed
//   empty     Mem connected, neither agent has Mem's plugin yet: nothing can reach the partner
//   exchanges as oneway, with a week of exchanges: a request that became a task, one answered, one waiting
//             on the person's card, the partner's question still unanswered, a reply that didn't go; Codex
//             trusted to start work (X2); a teammate's reviewer let through (D334); the HawDB request in
//             the conversation, said in the partner's own words
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "exchanges";
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok("nmem 0.10.121");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a.includes("connections list --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "healthy", backend: "cloud" });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) {
    conn.client_label = args[args.indexOf("--context") + 1] ?? "ducter";
    return ok({ state: "connected", agent_context: conn.client_label, connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: conn.client_label === "ducter" ? [] : [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const sys = { which: () => undefined, exists: () => false, read: () => undefined, list: () => [], real: (p: string) => p, home: "/Users/demo", platform: "darwin" as const, uid: 501 };
const plugin = stage === "empty" ? "absent" : "installed";
// The core's clock is set back while each exchange is seeded, so each carries its own time.
let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({
  clock,
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  bridgeLink: { run: run as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) },
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.319", how: "installer" },
      { harness: "codex", installed: true, loggedIn: true, version: "0.168.0", how: "npm" },
    ],
    kind: async () => "laptop",
  },
  // Mem's own check, faked; nothing is installed by the demo.
  memPlugins: { inspectLocal: async () => ({ "claude-code": { state: plugin, ...(plugin === "installed" ? { version: "0.7.37" } : {}) }, codex: { state: plugin, ...(plugin === "installed" ? { version: "0.7.37" } : {}) } }), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(30);
void core.bridgeLink.connect();

if (stage === "linked") core.bridgeLink.setMailboxes?.([{ harness: "codex", open: true }, { harness: "claude-code", open: true }]);
if (stage === "oneway" || stage === "exchanges") core.bridgeLink.setMailboxes?.([{ harness: "codex", open: true }, { harness: "claude-code", open: false }]);

if (stage === "exchanges") {
  core.settings.setPeers?.({ trusted: ["Codex"], allowed: ["reviewer (dev team)"] });
  const codex = { from: "another agent", mine: true, agent: "Codex", role: zh ? "Mem 协作" : "Mem helper", selfNamed: true, space: SPACE };
  const cc = { from: "another agent", mine: true, agent: "Claude Code", role: zh ? "终端" : "terminal", selfNamed: true, space: SPACE };
  const at = (ms: number) => ((shift = -ms), { sentAt: iso(now - ms) });
  // 1. Two days ago: Codex handed over the benchmark rerun; the partner took it as a task (X2: trusted).
  const t1 = zh ? "重跑 PR #412 的 benchmark" : "Rerun the benchmark for PR #412";
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-1", ...codex, ...at(2 * DAY), text: zh ? "PR #412 合进去之后帮我重跑一遍 benchmark，看 p99 有没有回退。" : "Once PR #412 is in, rerun the benchmark and see whether p99 regressed.", linked: true, first: true } });
  log.append({ stream: "task:t_bench", origin: "partner", kind: "task_open", body: { taskId: "t_bench", title: t1, project: "HawDB", place: { kind: "none" }, harness: "codex", brief: "x" } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-claim-1", to: "another agent", ...codex, text: zh ? `接下了，开了任务「${t1}」。` : `On it: task "${t1}".`, inReplyTo: "m-in-1", taskId: "t_bench", opId: "c1", state: "sent" } as never });
  await tick();
  // 2. Yesterday: Codex asked a question; the partner answered it.
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-2", ...codex, ...at(DAY), text: zh ? "recall 测试上次偶发失败是怎么修的？" : "How was the flaky recall test fixed last time?", linked: true } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-rep-2", to: "another agent", ...codex, text: zh ? "先等 indexReady() 再发第一个查询，之后就没再挂过。" : "Await indexReady() before the first query; it hasn't failed since.", inReplyTo: "m-in-2", opId: "c2", state: "sent" } as never });
  await tick();
  // 3. Yesterday: the partner asked Claude Code for the person; Mem took it, no answer yet.
  shift = -22 * HOUR;
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-q-3", to: "another agent", ...cc, text: zh ? "那个 flaky 的 CI 你今晚还修吗？" : "Are you still fixing the flaky CI tonight?", decisionId: "d-q3", opId: "c3", state: "sent" } as never });
  await tick();
  // 4. A teammate's reviewer asked a question; answered from what the Space shares.
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-4", from: "reviewer (dev team)", agent: "reviewer (dev team)", ...at(20 * HOUR), text: zh ? "API 改名那件事 Wey 定了吗？" : "Has Wey decided on the API rename?", linked: true } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-rep-4", to: "reviewer (dev team)", agent: "reviewer (dev team)", text: zh ? "还没定，我问了他，定了告诉你。" : "Not yet; I've asked him and will tell you.", inReplyTo: "m-in-4", opId: "c4", state: "sent" } as never });
  await tick();
  // 5. This morning: a reply to Claude Code that didn't go (its mailbox is closed).
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-5", ...cc, ...at(5 * HOUR), text: zh ? "CI 红了，是不是 main 上谁动了 runner？" : "CI is red; did someone touch the runner on main?", linked: true } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "", to: "another agent", ...cc, text: zh ? "是昨晚的 runner 改动，我开了任务去看。" : "It's last night's runner change; I've opened a task.", inReplyTo: "m-in-5", opId: "c5", state: "failed" } as never });
  await tick();
  // 6. Today: Codex sent the HawDB 0.9 checklist; the partner says it in its own words and asks.
  const ask = zh ? "0.9 的发布清单放在「HawDB 0.9 发布清单」了，打 tag 前帮我过一遍，重点看基准。" : "The 0.9 release checklist is in \"HawDB 0.9 release checklist\"; go through it before the tag, mainly the benchmarks.";
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-6", ...codex, ...at(40 * 60_000), text: ask, linked: true } });
  shift = -39 * 60_000;
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "你的 Codex 把 HawDB 0.9 的发布清单发过来了，让我在打 tag 前过一遍。三步都齐，只差重跑基准。要我现在去跑吗？" : "Your Codex sent over the HawDB 0.9 release checklist and asked me to go through it before the tag. Three steps are done; only the benchmark rerun is left. Shall I run it now?" } });
  shift = 0;
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=peers (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
