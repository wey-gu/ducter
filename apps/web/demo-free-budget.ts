// A demo core for D449: the partner thinks with pi on a free OpenRouter key (no plan, no other
// agent). DEMO_MODE=left: a busy morning, about 12 requests left today; DEMO_MODE=out: the day's
// cap is spent, the message waits for OpenRouter's own reset. For screenshots and manual checks
// (the partner itself is a stub: its line is written as the real one says it,
// packages/partner/src/words.ts). Never a real key: the free fact is marked directly.
//   DUCTER_PORT=7974 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_MODE=out bun apps/web/demo-free-budget.ts
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { freeDayReset, type DeviceHarness } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const out = process.env.DEMO_MODE === "out";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");

const MODEL = "openrouter/google/gemma-4-31b-it:free";
const harnesses: DeviceHarness[] = [
  { harness: "claude-code", installed: false, loggedIn: false, canBePartner: false },
  { harness: "codex", installed: false, loggedIn: false, canBePartner: false },
  { harness: "pi", installed: true, loggedIn: true, canBePartner: true, billing: "usage" },
];

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "server" },
});
core.setPartner({ onTrigger() {} });
for (let i = 0; i < 100 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(20);
core.settings.brainFromKey("pi", MODEL);
core.freeBudget!.mark!("openrouter", true);

const reset = freeDayReset("openrouter", Date.now());
const d = new Date(reset);
const at = `${d.getDate() !== new Date().getDate() ? (zh ? "明天 " : "tomorrow ") : ""}${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const ask = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "帮我查下周五去杭州的高铁，下午出发的" : "Find me a train to Hangzhou next Friday, leaving in the afternoon" } });
core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "周五下午有三趟：G7361 13:05、G7365 14:20、G7371 15:40，二等座都还有票。" : "Three on Friday afternoon: G7361 at 13:05, G7365 at 14:20 and G7371 at 15:40, all with second-class seats left.", replyTo: ask.seq } });
// A busy morning: the partner's turns and two small tasks.
core.freeBudget!.spend("pi", 38);
if (out) {
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "那顺便看看周日回来的" : "And the ones coming back on Sunday?" } });
  const said = `429 {"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"${Date.parse(reset)}"}}}}`;
  // The partner's turn failed on OpenRouter's cap: core holds pi until OpenRouter's own reset.
  await core.brainHold!.hit({ harness: "pi", failure: "quota", resetsAt: reset, source: "provider", said, free: "openrouter" });
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? `OpenRouter 的免费额度今天用完了，${at} 恢复；想不等的话，充 $10 就能多很多。这期间发来的，到时按顺序回你。` : `OpenRouter's free allowance is used up for today. It's back at ${at}; if you'd rather not wait, $10 of credit lifts it a lot. I'll answer anything you send meanwhile then, in order.` } });
}
console.log(`demo-free-budget on ${core.url} · ${zh ? "zh" : "en"} · ${out ? "out" : "left"}`);
