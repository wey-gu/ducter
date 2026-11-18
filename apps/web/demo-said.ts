// A demo core for D379: who does which work, said and never saved as a rule, still holds. The
// person said 「订酒店这类别用 Claude Code」 earlier and the partner only answered; the next booking
// goes to Codex by Ducter's own reading (the real core's choose), its line says 你说过「…」, and one
// card under the ack asks to keep it as a rule. For screenshots of the web and Mac clients.
//   DUCTER_PORT=7979 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-said.ts
// DEMO_STAGE: 1 = the card waiting (default); 2 = kept as a rule (Go).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, DeviceHarness } from "@ducter/protocol";
import { harnessName } from "@ducter/protocol";
import { said } from "../../packages/partner/src/words.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "1");
const harnesses: DeviceHarness[] = [
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.41, resetsAt: new Date(Date.now() + 30 * 3600_000).toISOString() }, models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] },
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.72, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() } },
];
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);

const w = zh
  ? {
      pref: "对了，请你记住，订酒店等生活相关的工作别用 claude code 哈",
      prefAck: "好，以后查机票、订酒店这类生活上的事都不用 Claude Code。",
      ask: "帮我算一下北京往返大阪 12 月 20 到 24 号、加上朗丽兹两晚的总价，准备好确认页，先别付",
      ack: "我去查机票和朗丽兹两晚的价格，算好总价，停在确认页不付。",
      title: "北京往返大阪加朗丽兹两晚总价",
    }
  : {
      pref: "By the way, remember: don't use Claude Code for booking hotels and other everyday errands",
      prefAck: "Got it: no Claude Code for hotels, flights and other everyday errands from now on.",
      ask: "Work out the total for Beijing–Osaka return, Dec 20 to 24, plus two nights at the Ritz-Carlton, and get the confirmation page ready. Don't pay yet",
      ack: "I'll price the flights and the two nights, add them up, and stop at the confirmation page without paying.",
      title: "Beijing–Osaka return plus two nights: total",
    };

// Said the day before, answered, and never saved as a rule (the hel case).
const p = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.pref } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.prefAck, replyTo: p.seq } });
await tick();

const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
const place = { kind: "browser" as const, device: "local", profile: "default" };
// Who does it, as the real core picks it from what was said.
const pick = await core.loadout.choose({ title: w.title, place, needs: { browse: true }, workKind: "errand" });
if (!pick || "none" in pick || pick.why.kind !== "said" || !pick.why.said) throw new Error(`demo-said: the saying didn't decide it (${JSON.stringify(pick)})`);
const taskId = "t_osaka";
log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: w.title, project: "", place, harness: pick.harness, ...(pick.model ? { model: pick.model } : {}), brief: w.ask, workKind: "errand" } });
log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: pick.harness, ...(pick.model ? { model: pick.model } : {}), why: pick.why } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId } });
core.tasks.setState(taskId, "working", "hot");
await tick();

// The one card, in the words the partner's code puts there (packages/partner/src/words.ts).
const lang = zh ? "zh" : "en";
const quote = pick.why.text ?? "";
const decisionId = "d_said";
const card: Bodies["decision"] = {
  decisionId,
  question: said(lang, "saidQuestion", { quote, agent: harnessName(pick.harness) }),
  goLabel: said(lang, "saidGo"),
  holdLabel: said(lang, "saidHold"),
  defaultOption: "hold",
  reversible: false,
  saying: { ...pick.why.said, quote },
};
log.append({ stream: "channel", origin: "partner", kind: "decision", body: card });
if (stage >= 2) {
  await tick();
  core.decisions.decide(decisionId, "go");
}
console.log(`demo-said ready on :${process.env.DUCTER_PORT ?? "?"} (stage ${stage}, ${zh ? "zh" : "en"})`);
