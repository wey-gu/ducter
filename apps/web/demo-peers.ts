// A demo core for the user's other agents (D170, design/bridge.md X1–X3): a request line from the
// user's own terminal Claude Code, its question as one card (its suggestion marked), the reply line
// after the answer, and X2's offer. No Bridge is touched: the events are seeded into the Log.
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_STAGE=0 bun apps/web/demo-peers.ts
// DEMO_STAGE: 0 = the question is open; 1 = answered, then X2's offer.
import { startCore, stubRunner } from "@ducter/core";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "0");
const core = startCore({ persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const w = zh
  ? {
      user: "我出门吃个饭，一小时回来",
      ok: "好，路上慢点。",
      req: "Linux 那几项已经绿了，就差 macOS。现在把 fix-linux-ci 推上去，还是等 macOS 跑完？我建议等。",
      q: "Linux 那几项已经绿了，就差 macOS。现在把 fix-linux-ci 推上去，还是等 macOS 跑完？",
      go: "等 macOS 跑完再推",
      other: "现在推",
      reply: "用户选了：「等 macOS 跑完再推」",
      req2: "帮我把 ducter status 的 --json 输出修好，只改 CLI。",
      offer: "以后你的 terminal-claude 发来的活，直接接？",
      offerGo: "直接接",
    }
  : {
      user: "Out for lunch, back in an hour",
      ok: "Enjoy it.",
      req: "The Linux jobs are green; only macOS is left. Push fix-linux-ci now, or wait for macOS? I'd wait.",
      q: "The Linux jobs are green; only macOS is left. Push fix-linux-ci now, or wait for macOS to finish?",
      go: "Wait for macOS, then push",
      other: "Push now",
      reply: "The user chose: «Wait for macOS, then push»",
      req2: "Fix the --json output of ducter status; CLI only.",
      offer: "Take work from your terminal-claude without asking from now on?",
      offerGo: "Take it directly",
    };

const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.user } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.ok, replyTo: u.seq } });
await tick();
log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm-q", from: "terminal-claude", agent: "terminal-claude", mine: true, text: w.req } });
log.append({
  stream: "channel",
  origin: "partner",
  kind: "decision",
  body: { decisionId: "d_peer", question: w.q, goLabel: w.go, defaultOption: "hold", reversible: false, asker: { messageId: "bm-q", agent: "terminal-claude", mine: true, where: "~/dev/ducter", suggests: true, other: w.other } },
});
await tick();
if (stage >= 1) {
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_peer", option: "go", by: "user" } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "bm-o1", to: "terminal-claude", agent: "terminal-claude", mine: true, text: w.reply, inReplyTo: "bm-q", state: "sent" } });
  await tick();
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm-r", from: "terminal-claude", agent: "terminal-claude", mine: true, text: w.req2 } });
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_trust", question: w.offer, goLabel: w.offerGo, defaultOption: "hold", reversible: false, trust: { agent: "terminal-claude" } } });
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
