// D587: two living messages, each with a result the partner is still putting into words. Before
// D587 each drew its own 在看它做完的结果… / Looking over what it came back with…; now the
// conversation shows one, at its end. The partner is quiet (it never writes the words), so the line
// holds for D124's two minutes from each report (logged a minute ahead, so a shot has three).
//   DUCTER_PORT=7587 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d587.ts
// then http://127.0.0.1:7587/app
import { startCore, stubRunner, realClock } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
let skew = -20 * 60_000;
const clock = { ...realClock, now: () => Date.now() + skew };
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: "127.0.0.1", clock });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(40);
const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "MacBook", repoPath, branch, baseBranch: "main" });

async function asked(text: string, ack: string, id: string, title: string, place: Place) {
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: `j_${id}`, text: ack, replyTo: u.seq } });
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "HawDB", place, harness: "claude-code", model: "opus", brief: text } });
  core.tasks.setState(id, "working", "hot");
  await tick();
}
const done = async (id: string, summary: string) => {
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary, questions: [], evidence: [{ kind: "test", label: "cargo test", ref: "all pass" }] } as Bodies["report"] });
  await tick();
};

await asked(
  w("HawDB compaction 那个偶发失败的测试，帮我修一下，修好告诉我", "Fix the flaky compaction test in HawDB and tell me when it's done"),
  w("好，我开一个任务去查，在 MacBook 上。一般十来分钟，查清楚了告诉你。", "On it. I'm opening a task on the MacBook; it usually takes about ten minutes."),
  "t_flaky",
  w("修 compaction 偶发失败的测试", "Fix the flaky compaction test"),
  repo("~/dev/hawdb", "ducter/fix-flaky-compaction"),
);
skew = -12 * 60_000;
await asked(
  w("顺便把 bun 升到 1.3，跑一遍 CI", "Also bump bun to 1.3 and run CI"),
  w("好，另开一个任务升 bun，CI 跑完告诉你。", "Sure, a second task for bun; I'll tell you once CI is done."),
  "t_bun",
  w("升级 bun 到 1.3", "Bump bun to 1.3"),
  repo("~/dev/hawdb", "ducter/bun-1-3"),
);
// The first result: its living message, read (frozen) before the second comes.
skew = 60_000;
await done("t_flaky", w("修好了：compaction 在 flush 之前读了旧的 manifest，现在等 flush 完再读，连跑 200 次都过。", "Fixed: compaction read the old manifest before the flush; it now waits for it, and 200 runs in a row pass."));
await Bun.sleep(300);
log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: log.head() } });
await tick();
skew = 70_000;
await done("t_bun", w("bun 升到 1.3.4 了，CI 16 项全绿。", "bun is on 1.3.4 and all 16 CI checks are green."));
skew = 0;

console.log(`[demo] D587 demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
