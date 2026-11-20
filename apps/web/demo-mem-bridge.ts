// D433: a demo core for 和你的其他 agent 通信 / Talk with your other agents and the 想起了 line, in one
// state each. No nmem runs: a scripted stand-in answers the read-only checks, as nmem 0.10.121 would.
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=reach bun apps/web/demo-mem-bridge.ts
// DEMO_STAGE: reach (connected: who can reach the partner, and Recently with one reply that didn't go and
//   one still being checked; open #settings=peers) · away (another computer, hel, receives the partner's
//   mail and Mem last saw it 3 days ago; #settings=peers) · recall (a reply that leaned on a past
//   conversation with Codex: 想起了你 11月12日 和 Codex 聊的; the conversation) · boxes (D444: as reach, with
//   Mem's grouped contact list read: Codex's mailbox open, Claude Code's closed; #settings=peers).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "reach";
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const DAY = 86_400_000;
const now = Date.now();
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
// D324's label for another home: the identity, the home, a key tag.
const hel = { connection_id: "00000000-0000-4000-8000-000000000002", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter-on-hel-3fa91c", state: "active", activity_available: true, last_seen_at_ms: now - 3 * DAY - 2 * 3_600_000 };
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok(stage === "away" ? "nmem 0.10.121" : "nmem 0.10.118");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a.includes("connections list --help")) return { code: 0, out: "Options:\n      --include-activity\n          Include advisory device activity in the version two JSON presentation\n", err: "" };
  if (a === "status") return ok({ status: "healthy", backend: "cloud" });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (stage === "away" && a.includes("connections list")) return ok({ schema_version: 2, connections: [hel], next_connection_id: null });
  if (a.includes("connections connect")) {
    conn.client_label = args[args.indexOf("--context") + 1] ?? "ducter";
    return ok({ state: "connected", agent_context: conn.client_label, connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  // Nothing listed until this home connects (its own label, D324).
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: conn.client_label === "ducter" ? [] : [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const sys = { which: () => undefined, exists: () => false, read: () => undefined, list: () => [], real: (p: string) => p, home: "/Users/demo", platform: "darwin" as const, uid: 501 };
const core = startCore({
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
      { harness: "antigravity", installed: true, loggedIn: true, version: "1.5.2", how: "installer" },
    ],
    kind: async () => "laptop",
  },
  // Mem's own check, faked: Codex has the plugin, Claude Code doesn't yet (nothing is installed by the demo).
  memPlugins: { inspectLocal: async () => ({ "claude-code": { state: stage === "boxes" ? "installed" : "absent" }, codex: { state: "installed", version: "0.7.34" } }), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(30);

if (stage === "reach" || stage === "boxes") {
  void core.bridgeLink.connect();
  const who = { from: "another agent", mine: true, agent: "Codex", role: zh ? "Mem 协作" : "Mem helper", selfNamed: true, space: SPACE };
  const ask = zh ? "PR #412 的 benchmark 重跑完了，帮我看下结果有没有回退" : "The benchmark rerun for PR #412 is done; check whether it regressed";
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-in-1", ...who, text: ask, linked: true } });
  await tick();
  const out = (opId: string, text: string, state: string, extra: Record<string, unknown> = {}) =>
    log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: state === "sent" ? `m-${opId}` : "", to: "another agent", ...who, text, opId, state, ...extra } as never });
  out("o1", zh ? "看过了：p99 从 41 ms 到 43 ms，在噪声里，没有回退。" : "Checked: p99 went from 41 ms to 43 ms, within noise; no regression.", "sending", { inReplyTo: "m-in-1" });
  out("o1", zh ? "看过了：p99 从 41 ms 到 43 ms，在噪声里，没有回退。" : "Checked: p99 went from 41 ms to 43 ms, within noise; no regression.", "sent", { inReplyTo: "m-in-1" });
  await tick();
  out("o2", zh ? "那个 flaky 的 recall 测试你今晚还改吗？" : "Are you still fixing the flaky recall test tonight?", "sending", { decisionId: "d-1" });
  out("o2", zh ? "那个 flaky 的 recall 测试你今晚还改吗？" : "Are you still fixing the flaky recall test tonight?", "unknown", { decisionId: "d-1" });
  await tick();
  const cc = { from: "another agent", mine: true, agent: "Claude Code", role: zh ? "终端" : "terminal", selfNamed: true, space: SPACE };
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "", to: "another agent", ...cc, text: zh ? "收到，我接着盯 CI。" : "Got it, I'll keep an eye on CI.", opId: "o3", state: "failed" } as never });
}
// D444: what Mem's grouped contact list said (as the partner's Bridge client would set it).
if (stage === "boxes") core.bridgeLink.setMailboxes?.([{ harness: "codex", open: true }, { harness: "claude-code", open: false }]);
if (stage === "recall") {
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "我上次怎么修的那个 recall 测试老挂的问题？" : "How did I fix that flaky recall test last time?" } });
  const m = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "是索引还没建好就开始查了。你让测试先等 indexReady()，再发第一个查询，之后就没再挂过。" : "It queried before the index was built. You made the test await indexReady() before its first query, and it hasn't failed since.", replyTo: u.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "memory_recalled", body: { memoryId: "t_flaky", title: zh ? "修 recall 测试的偶发失败" : "Fix flaky recall test", by: "tool", from: "Codex", thread: true, date: new Date(now - 8 * DAY).toISOString().slice(0, 10), aboutSeq: m.seq, replyTo: u.seq } });
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app${stage === "recall" ? "" : "#settings=peers"} (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
