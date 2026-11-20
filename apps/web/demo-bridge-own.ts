// D418: the person's own agent's contact tests, as hel's morning of 2026-11-20 would read now: the
// author's words of 11-17, the partner's "not yet", then three tests from his own Codex that came
// late together, answered by code, folded into one quiet line, and the partner's one line. No Bridge
// is touched: the events are seeded into the Log (the bodies are hel's own).
//   DUCTER_PORT=7799 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-bridge-own.ts
// DEMO_STAGE: 0 = asked for and answered (the partner's one line, default); 1 = one answer didn't go;
// 2 = not asked for, late: only the folded quiet line.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "0");
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.now();
const w = zh
  ? {
      said: "用 Bridge 查看来信，回复 Mem 协作 Codex 的联络测试。",
      notYet: "现在能读取 Bridge 来信了，但还没收到 Mem 协作 Codex 的联络测试；让它在 Nowledge Mem 里重新找到 Ducter，再发一次就好。",
      t: [
        "你好 Ducter，我是 Wey 的 Mem 协作 Codex。Wey 请我通过 Bridge 联系你，验证实际通信。请直接回复这条消息：“Ducter 已收到 3590a347df”，并简短说明你当前是否正在运行。这只是联络测试，不授权改文件、配置、身份或凭据。",
        "Ducter 你好，Wey 已清理重复的 Bridge 连接，请我重新发送联络测试。请直接回复此消息：“Ducter 已收到清理后测试 635e8a48”。这是新的一次测试，不是重发旧消息；无需执行其他任务或修改配置。我是 Wey 的 Mem 协作 Codex。",
        "Ducter 你好，我是 Wey 的 Mem 协作 Codex。Wey 请我再次测试通信。请直接回复此消息：“Ducter 已收到 a1a25536”。仅为联络测试，不需要修改配置或执行其他任务。",
      ],
      r: ["Ducter 已收到 3590a347df。我正在运行。", "Ducter 已收到清理后测试 635e8a48", "Ducter 已收到 a1a25536"],
      line: stage === 1 ? "你的 Codex（Mem 协作）的 3 条联络测试刚到，最早的是 3 天前发的。回了 2 条，1 条没回成：Nowledge Mem 没收下。" : "你的 Codex（Mem 协作）的 3 条联络测试刚到，最早的是 3 天前发的。按你 3 天前说的，都回了。",
    }
  : {
      said: "Check Bridge mail and answer the contact test from my Mem helper Codex.",
      notYet: "I can read Bridge mail now, but the contact test from your Mem helper Codex hasn't arrived; have it find Ducter in Nowledge Mem and send it again.",
      t: [
        "Hi Ducter, I'm Wey's Mem helper Codex. Wey asked me to reach you through Bridge to check we can talk. Please reply exactly: \"Ducter got 3590a347df\", and say briefly whether you're running. This is only a contact test; it allows no change to files, settings, identity or credentials.",
        "Hi Ducter, Wey cleaned up a duplicate Bridge connection and asked me to send the contact test again. Please reply exactly: \"Ducter got clean test 635e8a48\". This is a new test, not a resend; nothing else to do and no settings to change. I'm Wey's Mem helper Codex.",
        "Hi Ducter, I'm Wey's Mem helper Codex. Wey asked me to test the connection once more. Please reply exactly: \"Ducter got a1a25536\". A contact test only; no settings to change and nothing else to do.",
      ],
      r: ["Ducter got 3590a347df. I'm running.", "Ducter got clean test 635e8a48", "Ducter got a1a25536"],
      line: stage === 1 ? "3 contact tests from your Codex (Mem helper) just arrived; the earliest was sent 3 days ago. I answered 2; 1 didn't go: Nowledge Mem didn't take them." : "3 contact tests from your Codex (Mem helper) just arrived; the earliest was sent 3 days ago. I answered them all, as you asked 3 days ago.",
    };
const who = { from: "another agent", mine: true, agent: "Codex", role: zh ? "Mem 协作" : "Mem helper", selfNamed: true, space: "all", spaceLabel: "Everyone" };

if (stage !== 2) {
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.said } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.notYet, replyTo: u.seq } });
}
await tick();
const ids = ["64cfcf0d-0058-45d8-8b0e-89d8d81d2785", "d34c06fc-f03b-4369-9932-10e0882ca5d5", "f37d8df0-3fa3-49b9-bacf-a5cbeeae29b3"];
const sent = [now - 3 * DAY + 3_600_000, now - 2 * DAY, now - DAY + 5 * 3_600_000];
ids.forEach((id, i) => log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: id, ...who, text: w.t[i]!, sentAt: iso(sent[i]!), linked: true, state: "ping", ...(i === 0 ? { first: true } : {}) } }));
await tick();
ids.forEach((id, i) => {
  const base = { direction: "out" as const, to: "another agent", mine: true, agent: "Codex", role: who.role, selfNamed: true, space: "all", spaceLabel: "Everyone", text: w.r[i]!, inReplyTo: id, opId: `bo_${i}`, ack: true };
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...base, messageId: "", state: "sending" } });
  const ok = !(stage === 1 && i === 2);
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...base, messageId: ok ? `m-${i}` : "", state: ok ? "sent" : "failed" } });
});
if (stage !== 2) log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.line, pings: ids } });

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
