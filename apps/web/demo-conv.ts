// A demo core for the conversation as a messaging app (D129): the App Store Connect run the
// author tested, in bubbles. The partner's own ask (answered or open), its ack, a task's question
// said in the partner's words, and the result.
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_STAGE=2 bun apps/web/demo-conv.ts
// DEMO_STAGE: 0 = the ask is open; 1 = answered, the task's question open; 2 = the result is in.
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "2");
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const w = zh
  ? {
      user: "帮我把 App Store Connect 准备好，让 Ducter 能上 TestFlight。",
      user2: "按 iOS 发布指南来就行",
      ask: "要在 App Store Connect 建好 Ducter 的 app 和内部测试组吗？建好就删不掉了，名字也会被占住。",
      goLabel: "创建",
      ack: "好，我去 App Store Connect 建，弄好了告诉你。",
      taskQ: "请先在当前 Chrome 的 App Store Connect 页面登录目标 Apple 账号；完成后我将继续创建 co.nowledge.ducter.ios 的 Bundle ID 并开启 Push Notifications。",
      said: "得先在浏览器里登录你的苹果账号，我才能接着建。登好了点一下就行。",
      saidGo: "接着建",
      result: "App Store Connect 准备好了：Ducter 的 app 和内部测试组都建好了。",
      more: "还差两样得你在苹果那边点一下，下次发版时我带你走一遍。",
      title: "准备 App Store Connect",
      thanks: "太好了，谢谢",
      reply: "不客气。",
    }
  : {
      user: "Get App Store Connect ready so Ducter can go out on TestFlight.",
      user2: "Follow the iOS release guide",
      ask: "Create Ducter's app and an internal testing group in App Store Connect? Once made it can't be deleted, and the name is taken for good.",
      goLabel: "create them",
      ack: "On it: setting up App Store Connect; I'll tell you when it's done.",
      taskQ: "Please sign in to the target Apple account in the App Store Connect page in the current Chrome; after that I will register the co.nowledge.ducter.ios Bundle ID and enable Push Notifications.",
      said: "I need you to sign in to your Apple account in the browser first. Tap below once you're in.",
      saidGo: "keep going",
      result: "App Store Connect is ready: Ducter's app and its internal testing group are set up.",
      more: "Two things still need a tap from you on Apple's side; I'll walk you through them at release time.",
      title: "Prepare App Store Connect",
      thanks: "Great, thanks",
      reply: "Anytime.",
    };

const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.user } });
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.user2 } });
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_own", question: w.ask, goLabel: w.goLabel, defaultOption: "hold", reversible: false } });
await tick();
if (stage >= 1) {
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_own", option: "go", by: "user" } });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
  log.append({ stream: "task:t_asc", origin: "partner", kind: "task_open", body: { taskId: "t_asc", title: w.title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: w.user } });
  core.tasks.setState("t_asc", "working", "hot");
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "在做" : "Working", state: "running", taskId: "t_asc" } });
  await tick();
  log.append({ stream: "task:t_asc", origin: "task", kind: "report", body: { taskId: "t_asc", state: "needs_input", summary: w.taskQ, questions: [{ id: "q", text: w.taskQ, blocking: true, default: w.saidGo, reversible: false }], evidence: [] } });
  await tick();
  const d = log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).find((e) => (e.body as { taskId?: string }).taskId === "t_asc");
  if (d) log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said, decisionId: (d.body as { decisionId: string }).decisionId } });
  await tick();
  if (stage >= 2 && d) {
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: (d.body as { decisionId: string }).decisionId, option: "go", by: "user" } });
    await tick();
    log.append({ stream: "task:t_asc", origin: "task", kind: "report", body: { taskId: "t_asc", state: "done", summary: "Registered the bundle id with Push, created the app record and the Internal group. Left: signing certificate, provisioning profile, CI upload key, APNs key.", questions: [], evidence: [{ kind: "url", label: "App Store Connect · Ducter", ref: "https://appstoreconnect.apple.com/apps" }] } });
    log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "做完了" : "Done", state: "done", taskId: "t_asc" } });
    await Bun.sleep(150);
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.result, replyTo: u.seq } });
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.more, replyTo: u.seq } });
    const t = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.thanks } });
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.reply, replyTo: t.seq } });
  }
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
