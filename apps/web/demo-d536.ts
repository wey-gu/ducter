// A demo core for D536 (each partner thinks with its own): the author's four partners on hel. The
// default (Ducter) thinks with Codex GPT-6.2-Astra, the default for all; 多比 and 小新 follow it; 小玛
// (GTM growth hacker) thinks with Claude Code Opus at high effort, and 小新 with Codex GPT-6.2-Sol.
// Real core and real web client; the runner is a stub, the agents' lists the ones they gave.
//   DUCTER_PORT=7852 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d536.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { DeviceHarness } from "@ducter/protocol";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { createModelCatalog } from "../../packages/core/src/models.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");

const harnesses: DeviceHarness[] = [
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.64, resetsAt: new Date(Date.now() + 2 * 86400_000).toISOString() } },
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.81, resetsAt: new Date(Date.now() + 4 * 3600_000).toISOString() } },
];
// Codex 0.169.1's own list (D352) and Claude Code's named models with their levels.
const E = ["low", "medium", "high", "xhigh", "max", "ultra"];
const codex: ListedModel[] = [
  { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: E, defaultEffort: "low", default: true },
  { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: E, defaultEffort: "low" },
  { id: "gpt-6.1-terra", label: "GPT-6.1-Terra", efforts: E, defaultEffort: "low" },
  { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: E.slice(0, 5), defaultEffort: "medium" },
];
const claude: ListedModel[] = [
  { id: "opus", label: "Opus", efforts: ["low", "medium", "high", "max"] },
  { id: "sonnet", label: "Sonnet", efforts: ["low", "medium", "high"] },
];

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  partners: true,
  models: createModelCatalog({ read: async (_d, h) => (h === "codex" ? codex : h === "claude-code" ? claude : undefined) }),
  hostname: "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), native: async () => undefined, harnesses: async () => harnesses, kind: async () => "server" },
  update: { homeName: "hel", autoEveryMs: 0 } as never,
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.setPartnerFactory(() => ({ onTrigger() {} }));
core.settings.set({ language: zh ? "zh" : "en", brain: { harness: "codex", model: "gpt-6.2-astra" } });
core.partners.set("default", { about: zh ? "工作、代码和发布" : "work, code and releases" });

const add = (name: string, about: string) => {
  const r = core.partners.add({ name, about });
  if (!r.ok) throw new Error(r.error);
  return r.partner.id;
};
add(zh ? "多比" : "Dobby", zh ? "读书和跑步" : "reading and running");
const xin = add(zh ? "小新" : "Shin", zh ? "账单、报销和保险" : "bills, expenses and insurance");
const ma = add(zh ? "小玛" : "Ma", zh ? "GTM growth hacker，增长、投放和发布节奏" : "GTM growth hacker: growth, ads and launch rhythm");
core.partners.set(ma, { brain: { harness: "claude-code", model: "opus", effort: "high" } });
core.partners.set(xin, { brain: { harness: "codex", model: "gpt-6.2-sol" } });

core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "小玛以后用 Opus 想事情吧" : "Have Ma think with Opus from now on" } });
core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "好，小玛从下一句起用 Claude Code 的 Opus 想事情。" : "Done: Ma thinks with Claude Code's Opus from its next message." } });
console.log(`demo-d536 on ${core.url} · ${zh ? "zh" : "en"}`);
