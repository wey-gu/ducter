// D565: partners of different figures (Ducter the pebble, 小家 the bun, 多比 the cloud, 小玛 the cube by
// default), each with a short conversation and tasks of its own on the one On hand, to show each figure
// in the switch, the bar, its conversation, its task marks and Settings › 伙伴's picker.
//   DUCTER_PORT=7965 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_FIGS=bun,cloud,cube bun apps/web/demo-d565.ts
// DEMO_FIGS are the three other partners' figures, in order (sprout and bean for the other two).
// DEMO_N is how many other partners (3 by default; 2 leaves room to add one and meet the six).
import { startCore, stubRunner, realClock } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Place } from "@ducter/protocol";
import { FIGURE_LOOK, type PartnerFigure } from "@ducter/protocol/src/partners.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const figs = (process.env.DEMO_FIGS ?? "bun,cloud,cube").split(",") as PartnerFigure[];
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", clock: realClock, partners: true });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "MacBook", repoPath, branch, baseBranch: "main" });

type T = { title: string; state: "working" | "done" | "needs_you"; summary: string; repo?: boolean; ask?: string };
let n = 0;
function seed(persona: string | undefined, talk: [string, string][], ts: T[]) {
  const stream = persona ? `channel:${persona}` : "channel";
  for (const [you, me] of talk) {
    log.append({ stream, origin: "user", kind: "user_msg", body: { text: you } });
    log.append({ stream, origin: "partner", kind: "ai_msg", body: { text: me } });
  }
  for (const x of ts) {
    const id = `t_${persona ?? "d"}_${++n}`;
    log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", ...(persona ? { persona } : {}), body: { taskId: id, title: x.title, project: x.repo ? "ducter" : "", place: x.repo ? repo("~/dev/ducter", `ducter/${id}`) : { kind: "none" }, harness: "claude-code", model: "opus", brief: x.title } });
    log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: x.state === "done" ? "done" : x.state === "needs_you" ? "needs_input" : "progress", summary: x.summary, questions: [], evidence: [] } });
    if (x.ask) log.append({ stream: `task:${id}`, origin: "task", kind: "decision", body: { decisionId: `d_${id}`, taskId: id, question: x.ask, goLabel: w("好", "Yes"), defaultOption: "hold", reversible: true } });
    core.tasks.setState(id, x.state === "done" ? "done" : x.state === "needs_you" ? "needs_you" : "working", x.state === "done" ? "parked" : "hot");
  }
}

core.partners.set("default", { about: w("工作、代码和发布", "work, code and releases") });
seed(undefined, [[w("HawDB 那个压缩测试修好了吗", "Is the HawDB compaction test fixed?"), w("在跑第 30 遍，前 29 遍都过了。跑完我告诉你。", "On run 30; the first 29 passed. I'll tell you when it's done.")]], [
  { title: w("修好 HawDB 里时好时坏的压缩测试", "Fix the flaky compaction test in HawDB"), state: "working", summary: w("在跑第 30 遍，前 29 遍都过了", "On run 30; the first 29 passed"), repo: true },
  { title: w("整理本周 mem 的发布说明", "This week's mem release notes"), state: "done", summary: w("写好了，放在 PR 的描述里", "Written, in the PR's description"), repo: true },
]);
const ids: Record<string, string> = {};
const others = [
  [w("小家", "Home"), w("家里的事、看病、孩子", "home, the doctor, the kids"), [[w("周六能约上小米的牙医吗", "Can we get Mia to the dentist on Saturday?"), w("诊所周六上午还有 9:30 和 10:45，我问你一下再约。", "The clinic has 9:30 and 10:45 on Saturday morning; I'll check with you before booking.")]], [
    { title: w("约周六上午小米的牙医", "Book Mia's dentist for Saturday morning"), state: "needs_you", summary: w("诊所还有 9:30 和 10:45", "The clinic has 9:30 and 10:45"), ask: w("约 9:30 吗？", "Book 9:30?") },
    { title: w("比一比三家儿童牙科的价格", "Compare three children's dentists' prices"), state: "done", summary: w("社区那家最便宜，380 元", "The one down the road is cheapest, 380") },
  ]],
  [w("多比", "Dobby"), w("读书、跑步和周末的安排", "reading, running and weekend plans"), [[w("周末想爬个山，不要太累的", "I'd like an easy hike this weekend"), w("在看香山和凤凰岭两条线，晚点把时间和路况一起给你。", "I'm looking at two trails; I'll bring you the times and the trail conditions later.")]], [
    { title: w("找周末爬山的路线", "A hiking route for the weekend"), state: "working", summary: w("在看香山和凤凰岭", "Looking at two trails") },
  ]],
  [w("小玛", "Mara"), w("账单、报销和保险", "bills, expenses and insurance"), [[w("11 月的报销弄一下", "Sort out November's expenses"), w("找到 7 张发票，合计 2,318 元，还差一张打车的。", "Found 7 receipts, 2,318 in all; one taxi receipt is still missing.")]], [
    { title: w("整理 11 月的报销", "November's expenses"), state: "working", summary: w("找到 7 张发票，合计 2,318 元", "Found 7 receipts, 2,318 in all") },
  ]],
] as const;
for (const [i, [name, about, talk, ts]] of others.slice(0, Number(process.env.DEMO_N ?? 3)).entries()) {
  const figure = figs[i] ?? "bun";
  const p = core.partners.add({ name, about, figure, look: FIGURE_LOOK[figure] === "sand" ? "sage" : FIGURE_LOOK[figure] });
  if (p.ok) (ids[name] = p.partner.id), seed(p.partner.id, talk as unknown as [string, string][], ts as unknown as T[]);
}
console.log(`[demo] partners ${JSON.stringify(ids)}`);
console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
