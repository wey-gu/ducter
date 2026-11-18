// A demo core for 晚点再问我 / Ask me later (D382): late in the evening, four asks wait. One was put
// off to the morning (it stands in Waiting with when it asks again), one came back at its time
// (said once above its buttons), and two are open, one with a countdown.
//   DUCTER_PORT=7841 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-later.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { laterChoices } from "@ducter/protocol";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);

const asks = zh
  ? [
      { title: "HawDB：发布说明", q: "发布说明写好了，要发到 #hawdb-release 吗？", said: "发布说明写好了。要我发到 #hawdb-release 吗？", go: "发送", rev: false },
      { title: "ducter：iOS 构建号", q: "TestFlight 要求构建号比上次大，改成 87 再上传？", said: "TestFlight 要构建号比上次大。我改成 87 再传，行吗？", go: "改成 87", rev: true },
      { title: "周报：给 Weizhen", q: "周报草稿好了，现在发给 Weizhen 吗？", said: "周报草稿好了，现在发给 Weizhen 吗？", go: "发送", rev: false },
      { title: "mem：清理旧分支", q: "有 14 个合并过的分支，要在 GitHub 上删掉吗？", said: "有 14 个已经合并的分支，要在 GitHub 上删掉吗？", go: "删除", rev: false },
    ]
  : [
      { title: "HawDB: release notes", q: "The release notes are written. Post them to #hawdb-release?", said: "The release notes are written. Shall I post them to #hawdb-release?", go: "Post", rev: false },
      { title: "ducter: iOS build number", q: "TestFlight needs a higher build number than last time. Bump it to 87 and upload?", said: "TestFlight wants a higher build number. I'll bump it to 87 and upload, OK?", go: "Bump to 87", rev: true },
      { title: "Weekly report for Weizhen", q: "The weekly report draft is ready. Send it to Weizhen now?", said: "The weekly report draft is ready. Send it to Weizhen now?", go: "Send", rev: false },
      { title: "mem: old branches", q: "14 merged branches are left. Delete them on GitHub?", said: "14 merged branches are left. Delete them on GitHub?", go: "Delete", rev: false },
    ];

const ids: string[] = [];
for (const [i, a] of asks.entries()) {
  const taskId = `t_${i + 1}`;
  log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: a.title, project: "", place: { kind: "none" }, harness: "claude-code", brief: a.q } });
  core.tasks.setState(taskId, "working", "hot");
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "needs_input", summary: a.q, questions: [{ id: "q", text: a.q, blocking: true, default: a.go, reversible: a.rev }], evidence: [] } });
  await tick();
  const d = log.read({ kinds: ["decision"] }).at(-1)!.body as { decisionId: string };
  ids.push(d.decisionId);
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: a.said, decisionId: d.decisionId } });
  await tick();
}
// The release notes were put off to the morning; the weekly report was put off and is back.
const morning = laterChoices(new Date()).find((c) => c.key === "morning")!.at;
core.decisions.later(ids[0]!, Date.parse(morning));
await tick();
log.append({ stream: "channel", origin: "user", kind: "decision_later", body: { decisionId: ids[2]!, until: new Date(Date.now() + 3600_000).toISOString(), by: "user" } });
await tick();
log.append({ stream: "channel", origin: "system", kind: "decision_back", body: { decisionId: ids[2]!, by: "time" } });
await tick();
core.living.render();

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
