// A demo core for the website's pictures (D326): one ordinary day in the conversation. The
// morning note with two finds from life (a domain about to lapse, a night with nowhere to stay),
// each with its next step, then a coding task handed over and finished with its proof.
//   DUCTER_PORT=7960 DUCTER_DATA_DIR=<scratch> DEMO_LANG=en bun apps/web/demo-site.ts
// Then headless Chrome at http://127.0.0.1:7960/app (see design/site.md "Pictures").
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "en") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} }); // silent: the seed is the whole story
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(30);
const w = zh
  ? {
      opening: "早。有两件事要你看一眼：",
      find1: "ducter.dev 11 月 16 日到期，还没续费。",
      go1: "打开续费页",
      find2: "你 11 月 21 日到东京，那晚还没订住处：酒店从 22 日开始。",
      go2: "找个住处",
      ask: "修好 HawDB 里那个时好时坏的压缩测试，弄好告诉我",
      ack: "我去 hawdb 里看看那个压缩测试，弄清楚了告诉你。",
      title: "修好不稳定的压缩测试",
      done: "修好了。测试固定睡 200 毫秒，等刷盘落地，机器一忙就不够；现在等刷盘信号。连跑 50 次都通过。改动在 ducter/compaction-fix 上，没推送。",
    }
  : {
      opening: "Morning. Two things need you:",
      find1: "ducter.dev expires on Nov 16, and it isn't renewed yet.",
      go1: "Open the renewal page",
      find2: "You land in Tokyo on Nov 21, but the hotel starts on the 22nd: nowhere to stay that night.",
      go2: "Find a place to stay",
      ask: "Fix the flaky compaction test in HawDB and tell me when it's done",
      ack: "I'll find out why HawDB's compaction test flakes, and tell you when it's clear.",
      title: "Fix the flaky compaction test",
      done: "Fixed. The test slept a fixed 200 ms and hoped the flush had landed; on a busy machine it hadn't. It now waits for the flush itself, and 50 runs in a row pass. The change is on ducter/compaction-fix; nothing is pushed.",
    };

log.append({
  stream: "channel",
  origin: "partner",
  kind: "finds",
  body: {
    noteId: "n_site",
    rung: "morning",
    opening: w.opening,
    finds: [
      { findId: "f1", kind: "deadline", text: w.find1, how: [], decisionId: "d_f1", goLabel: w.go1 },
      { findId: "f2", kind: "mismatch", text: w.find2, how: [], decisionId: "d_f2", goLabel: w.go2 },
    ],
  },
} as never);
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_f1", question: w.find1, goLabel: w.go1, defaultOption: "hold", reversible: false, findId: "f1" } } as never);
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_f2", question: w.find2, goLabel: w.go2, defaultOption: "hold", reversible: false, findId: "f2" } } as never);
await tick();

const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
const taskId = "t_flaky";
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: w.title, project: "HawDB", place: { kind: "repo", device: "local", repoPath: "~/dev/hawdb", branch: "ducter/compaction-fix" }, harness: "claude-code", brief: w.ask } } as never);
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId } });
log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: w.done, questions: [], evidence: [{ kind: "test", label: "cargo test · 50/50 pass", ref: "cargo test" }, { kind: "test", label: "Workspace · 412 pass", ref: "cargo test --workspace" }] } } as never);
core.tasks.setState(taskId, "done", "warm");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "done", taskId } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.done, replyTo: u.seq } });

console.log(`[demo-site] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
