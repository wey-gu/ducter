// A demo core for D493: the decision card the author read on 2026-11-23 in an opened task, in the
// same shape and lengths (invented words): a task with a long title whose ask's action carries a
// time of its own (30 分钟后再试 / Try again in 30 min) and goes by itself in a while, so the default
// sentence says two times; and a short-verb ask (rebase) beside it, for the conversation and On hand.
//   DUCTER_PORT=7493 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d493.ts
// Then the web at /app#task=t493_mail, and the Mac with DUCTER_SHELL_URL (d493_shots_test.go).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(30);

const asks = [
  zh
    ? { id: "t493_mail", title: "打开 MacBook Pro M3 上 Claude Code 在 Nowledge Mem 的信箱", q: "信箱的登录页一直转圈，像是 Mem 那边还没起来。要我过一会儿再试吗？", go: "30 分钟后再试", said: "信箱的登录页一直转圈，Mem 那边像是还没起来。我过一会儿再试一次？" }
    : { id: "t493_mail", title: "Open Claude Code's inbox in Nowledge Mem on the MacBook Pro M3", q: "The inbox's sign-in page keeps spinning; Mem looks like it isn't up yet. Shall I try again in a while?", go: "Try again in 30 minutes", said: "The inbox's sign-in page keeps spinning; Mem doesn't look up yet. Shall I try again in a while?" },
  zh
    ? { id: "t493_rb", title: "mem：rebase 到 main", q: "main 上多了 4 个提交，rebase 后再提 PR？", go: "rebase", said: "main 上多了 4 个提交，和这次的改动没有冲突。我 rebase 一下再提 PR，行吗？" }
    : { id: "t493_rb", title: "mem: rebase onto main", q: "main has 4 new commits. Rebase, then open the PR?", go: "Rebase", said: "main has 4 new commits, none touching this change. I'll rebase and then open the PR, OK?" },
];
for (const a of asks) {
  log.append({ stream: `task:${a.id}`, origin: "partner", kind: "task_open", body: { taskId: a.id, title: a.title, project: "", place: { kind: "none" }, harness: "claude-code", brief: a.title } });
  core.tasks.setState(a.id, "working", "hot");
  log.append({ stream: `task:${a.id}`, origin: "task", kind: "report", body: { taskId: a.id, state: "needs_input", summary: a.q, questions: [{ id: "q", text: a.q, blocking: true, default: a.go, reversible: true }], evidence: [] } });
  await tick();
  const d = log.read({ kinds: ["decision"] }).at(-1)!.body as { decisionId: string };
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: a.said, decisionId: d.decisionId } });
  await tick();
}
core.living.render();

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
