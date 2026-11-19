// A demo core for D390: Settings › Partner on a home where only Codex is signed in, its model list
// read from Codex itself (the list the task composer shows). For screenshots and manual checks.
//   DUCTER_PORT=7972 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-brain-models.ts
// DEMO_SLOW=<ms>: Codex takes that long to list its models (the first frame has none; the next has them).
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { DeviceHarness } from "@ducter/protocol";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { createModelCatalog } from "../../packages/core/src/models.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const slow = Number(process.env.DEMO_SLOW ?? 0);

const harnesses: DeviceHarness[] = [
  { harness: "claude-code", installed: false, loggedIn: false, canBePartner: false },
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.72, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() } },
];

// D352: Codex 0.169.1's list (trimmed), the two models it added on 2026-11-18 first.
const E = ["low", "medium", "high", "xhigh", "max", "ultra"];
const codex: ListedModel[] = [
  { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: E, defaultEffort: "low", default: true },
  { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: E, defaultEffort: "low" },
  { id: "gpt-6.1-terra", label: "GPT-6.1-Terra", efforts: E, defaultEffort: "low" },
  { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: E.slice(0, 5), defaultEffort: "medium" },
];

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  models: createModelCatalog({ read: async (_device, harness) => (slow && (await Bun.sleep(slow)), harness === "codex" ? codex : undefined) }),
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "server" },
});
core.setPartner({ onTrigger() {} });
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "我想换个模型跟你聊" : "I'd like you on another model" } });
console.log(`demo-brain-models on ${core.url} · ${zh ? "zh" : "en"}${slow ? ` · slow ${slow}ms` : ""}`);
