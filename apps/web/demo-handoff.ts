// D609: the hand-off record on both surfaces: the sender's one line under its last report in each
// state (given, taken, done, returned, declined) and the helper's Keep with 手上的事 grouped by
// state. Never this machine's gh, oo or Mem.
//   DUCTER_PORT=7610 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-handoff.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-handoff-")), "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const SPACE = "personal-4e742092";
const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "Nowledge Mem PR Babysitter",
  about: w("用 Codex 接手 Nowledge Mem 的 PR，修复 CI 和评审问题，跟到可合并后通过 Bridge 回信。", "Take over Nowledge Mem PRs with Codex, fix CI and review comments, follow each until it can merge, then answer over Bridge."),
  brief: "Never merge.",
  persona: "default",
  agentId: "ducter-helper-nowledge-mem-pr-babysitter",
  state: "on",
  createdAt: iso(-50 * HOUR),
  link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server", connectionId: "c-demo", spaceId: SPACE },
  mem: "ready",
  said: "ready",
};
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helper] }, null, 2));

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", keeps: { endAsk: async () => ({ until: w("每个 PR 跟到能合并为止", "Each PR until it can merge") }) } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
core.keeps.sync();
const h = core.helpers.list()[0]!;
const keepId = core.keeps.all().find((k) => k.from.kind === "helper" && k.from.helperId === h.id)!.keepId;

const taskOpen = (id: string, title: string, summary: string) => {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place: { kind: "none" }, harness: "codex", brief: summary } });
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary, questions: [], evidence: [] } });
  core.tasks.setState(id, "done", "warm");
};
const give = (taskId: string, title: string, ref: string, said: string) => {
  const r = core.handoffs.giveLocal({ helper: h, text: said, fromTask: taskId, fromTaskTitle: title, fromName: "Ducter", head: w(`Ducter 的任务「${title}」：`, `Ducter's task "${title}":`), item: { kind: "pr", ref, title: ref } });
  return r.handoff;
};
const claim = (id: string, taskId: string) => {
  const rec = core.handoffs.get(id)!;
  core.handoffs.claim(rec.messages![0]!, taskId);
  return core.handoffs.get(id)!;
};

const states: { id: string; title: string; report: string; ref: string; why?: string; outcome?: string; withdrawn?: boolean }[] = [
  { id: "t_given", title: w("官网 #562 的评审", "The 官网 #562 review"), report: w("最新提交看过了，可以交给你了。", "The latest head is read; ready to hand over."), ref: "nowledge-co/nowledge-labs-website#562" },
  { id: "t_taken", title: w("修复 Plus 年付额度卡", "Fix the Plus annual quota card"), report: w("改好了，PR 开好了，交给你跟进。", "Fixed, the PR is open; handing it to you."), ref: "nowledge-co/mem#11441" },
  { id: "t_done", title: w("修好 mem#11393 的登录跳转", "Fix mem#11393's login redirect"), report: w("登录跳转修好，测试全过，PR 已交给帮手。", "The redirect is fixed, tests pass, the PR is with the helper."), ref: "nowledge-co/mem#11393", outcome: w("评审通过，已评论 /lgtm。", "Review passed, /lgtm left.") },
  { id: "t_returned", title: w("处理 mem#11408 的回归", "Handle mem#11408's regressions"), report: w("修好了，交给帮手。", "Fixed, handing it over."), ref: "nowledge-co/mem#11408", why: w("这个不是我接的范围：我只接 PR。", "Not in my scope: I take PRs.") },
  { id: "t_declined", title: w("看一下 mem#11389", "Look at mem#11389"), report: w("看过了，是一个 issue，交给帮手判断。", "It is an issue; handed over for the helper's call."), ref: "nowledge-co/mem#11389", why: w("超出我接的范围：这是个 issue。", "Out of scope: this is an issue.") },
  { id: "t_withdrawn", title: w("归档 mem#11030 的旧 PR", "Archive mem#11030's old PR"), report: w("看过了，先交给你，后来决定不跟了。", "I handed it over, then decided not to follow it."), ref: "nowledge-co/mem#11030", withdrawn: true },
];

for (const [i, s] of states.entries()) {
  taskOpen(s.id, s.title, s.report);
  const rec = give(s.id, s.title, s.ref, w(`请接手 ${s.ref}：按你自己的要求跟到底。`, `Please take ${s.ref}: own it to the end by your own rules.`));
  if (s.id === "t_given") continue;
  if (s.withdrawn) {
    await core.handoffs.withdraw(rec.handoffId, { say: false });
    continue;
  }
  claim(rec.handoffId, `t_helper_${i}`);
  if (s.id === "t_taken") continue;
  const end = s.outcome ? "done" : s.id === "t_returned" ? "returned" : "declined";
  core.handoffs.finish(rec.handoffId, end as "done" | "returned" | "declined", { why: s.why, outcome: s.outcome, say: false });
}

console.log(`[demo] D609 at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
console.log(`[demo] keep ${keepId}`);
for (const s of states) console.log(`[demo] task ${s.id} ${s.title}`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
