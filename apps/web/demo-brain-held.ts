// A demo core for D435: the partner's own agent (Claude Code) is out of credit. DEMO_MODE=fallback:
// Codex is signed in too and answers meanwhile; DEMO_MODE=waits: nothing else can answer, so the
// message waits for the reset. For screenshots and manual checks (the partner itself is a stub:
// its lines are written as the real one says them, packages/partner/src/words.ts).
//   DUCTER_PORT=7973 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_MODE=waits bun apps/web/demo-brain-held.ts
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { DeviceHarness } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const waits = process.env.DEMO_MODE === "waits";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");

const n = new Date();
const reset = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 20, 53);
if (reset.getTime() < Date.now()) reset.setDate(reset.getDate() + 1);
const at = `${reset.getDate() !== n.getDate() ? (zh ? "明天 " : "tomorrow ") : ""}${reset.getHours()}:${String(reset.getMinutes()).padStart(2, "0")}`;

const harnesses: DeviceHarness[] = [
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0, resetsAt: reset.toISOString() } },
  waits ? { harness: "codex", installed: false, loggedIn: false, canBePartner: false } : { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.64 } },
];

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "server" },
});
core.setPartner({ onTrigger() {} });
for (let i = 0; i < 100 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(20);

const user = zh ? "今天下午有什么安排？" : "What's on this afternoon?";
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: user } });
// The partner's turn failed on Claude Code's limit: core holds it until the reset (brain-hold.ts).
await core.brainHold!.hit({ harness: "claude-code", failure: "quota", resetsAt: reset.toISOString(), source: "event" });
if (waits) {
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? `Claude Code 的额度用完了，别的 AI 也接不上。${at} 恢复后我接着回你，这期间发来的也按顺序回。` : `Claude Code is out of credit and no other AI can take over. It's back at ${at}; I'll answer then, and anything you send meanwhile, in order.` } });
} else {
  const ask = core.log.head();
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? `Claude Code 的额度用完了，这会儿先用 Codex 答你，${at} 换回来。` : `Claude Code is out of credit, so Codex is answering you for now. Back to Claude Code at ${at}.` } });
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "下午 3 点和 Weizhen 过 HawDB 的 review，5 点前要把周报发出去。" : "The HawDB review with Weizhen at 3, and the weekly report is due by 5.", replyTo: ask } });
}
console.log(`demo-brain-held on ${core.url} · ${zh ? "zh" : "en"} · ${waits ? "waits" : "fallback"}`);
