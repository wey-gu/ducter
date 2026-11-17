// A demo core for the website's pictures (D326): one ordinary day in the conversation. The
// morning note with two finds from life (a domain about to lapse, a night with nowhere to stay),
// each with its next step, then an errand handed over and finished: a dinner table booked.
//   DUCTER_PORT=7960 DUCTER_DATA_DIR=<scratch> DEMO_LANG=en bun apps/web/demo-site.ts
// Then headless Chrome at http://127.0.0.1:7960/app (see design/site.md "Pictures").
import { startCore, stubRunner } from "./demo-core.ts";
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
      ask: "周六晚上 7 点左右订个四人桌，妈妈腿不好，要不用爬楼梯的",
      ack: "我去找周六晚上不用爬楼梯的四人桌，订好告诉你。",
      title: "订周六的四人晚餐",
      done: "订好了：周六晚上 7:15，橄榄与炭四人桌，在一楼，门口没有台阶。确认信在你邮箱里，周五中午前都能免费取消。",
    }
  : {
      opening: "Morning. Two things need you:",
      find1: "ducter.dev expires on Nov 16, and it isn't renewed yet.",
      go1: "Open the renewal page",
      find2: "You land in Tokyo on Nov 21, but the hotel starts on the 22nd: nowhere to stay that night.",
      go2: "Find a place to stay",
      ask: "Book a table for four on Saturday around 7. Somewhere Mom can get into without stairs",
      ack: "I'll find a table for four on Saturday with no stairs, and tell you when it's booked.",
      title: "Book Saturday dinner for four",
      done: "Booked: a table for four at Olive & Ash, Saturday at 7:15, on the ground floor with no step at the door. The confirmation is in your mail, and it's free to cancel until Friday noon.",
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
const taskId = "t_dinner";
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: w.title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: w.ask } } as never);
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId } });
log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: w.done, questions: [], evidence: [{ kind: "url", label: zh ? "订位确认" : "Booking confirmation", ref: "https://example.com/reservations/OA-4417" }] } } as never);
core.tasks.setState(taskId, "done", "warm");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "done", taskId } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.done, replyTo: u.seq } });

console.log(`[demo-site] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
