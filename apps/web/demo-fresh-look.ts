// A demo core for D437, 另一个 AI 看过 / Another AI looked it over: a code task on the author's own
// repo (the install scripts) whose result another AI read once; it sent the task back once to fix
// the Windows script, and the README still names the old folder, said under the partner's result;
// then a reply on an issue whose Go card says what the look still found in it. For screenshots and
// manual checks (the partner itself is a stub: its words are written as the real one says them).
//   DUCTER_PORT=7974 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-fresh-look.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const w = zh
  ? {
      ask: "让安装脚本支持用 DUCTER_BIN 指定安装目录，macOS、Linux 和 Windows 都要",
      ack: "我去改三个平台的安装脚本，好了告诉你。",
      title: "安装目录可配置",
      found: ["Windows 的 install.ps1 没改", "README 里还写着旧的安装目录"],
      left: ["README 里还写着旧的安装目录"],
      summary: "两个安装脚本都先看 DUCTER_BIN，没设就用原来的目录。",
      said: "三个平台的安装脚本都改好了：设了 DUCTER_BIN 就装到那里，没设还是原来的目录。",
      ask2: "回一下 ducter#212，谢谢 @lin-yu，告诉他 0.1.3 修了",
      ack2: "我写好回复给你看。",
      title2: "回复 ducter#212",
      q2: "把这条回复发到 ducter-ai/ducter#212？\n\nThanks @lin-yu for the clear report! This is fixed in 0.1.2, so upgrading should take care of it.",
      said2: "回复写好了，你看一眼再发。",
      left2: ["回复里写的是 0.1.2，你说的是 0.1.3"],
      go2: "发出去",
    }
  : {
      ask: "Make the install scripts take DUCTER_BIN for the install folder, on macOS, Linux and Windows",
      ack: "I'll change the install scripts for all three and tell you when it's done.",
      title: "Configurable install folder",
      found: ["install.ps1 for Windows wasn't changed", "the README still names the old install folder"],
      left: ["the README still names the old install folder"],
      summary: "Both install scripts read DUCTER_BIN first and fall back to the old folder.",
      said: "The install scripts for all three are done: with DUCTER_BIN set they install there, otherwise where they always did.",
      ask2: "Reply on ducter#212: thank @lin-yu and say 0.1.3 fixed it",
      ack2: "I'll write the reply for you to look at.",
      title2: "Reply on ducter#212",
      q2: "Post this reply on ducter-ai/ducter#212?\n\nThanks @lin-yu for the clear report! This is fixed in 0.1.2, so upgrading should take care of it.",
      said2: "The reply is written; have a look before it goes.",
      left2: ["the reply says 0.1.2; you said 0.1.3"],
      go2: "Post",
    };

// The code task: done, looked over, sent back once, fixed, one point left.
const taskId = "t_bin";
const repo = { kind: "repo" as const, repoPath: "/home/me/dev/ducter", worktree: "/home/me/.ducter/worktrees/t_bin", branch: "ducter/install-bin", baseBranch: "main", hasRemote: true };
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: w.title, project: "ducter", place: repo, harness: "codex", brief: w.ask, language: zh ? "zh" : "en", workKind: "code" } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId } });
core.tasks.setState(taskId, "working", "hot");
log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "assistant", text: zh ? "install.sh 改好了，三个平台都能用。" : "install.sh is done; all three platforms work." } });
log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "user", from: "ducter", text: `Before your result goes to the user, another AI (Claude Code) read it once against what they asked, with a clean context. It found:\n1. ${w.found[0]}\n2. ${w.found[1]}\n\nFix what is right. If a point is wrong, change nothing for it and say why in one short line in your report. Then call report_to_main again, the same way as before. You are asked this once.` } });
log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "assistant", text: zh ? "补上了 install.ps1。README 不在这次要改的范围里，没动。" : "Added install.ps1. The README wasn't part of this, so I left it." } });
await tick();
log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: w.summary, questions: [], evidence: [{ kind: "test", label: zh ? "安装脚本的测试都过了" : "install script tests pass", ref: "bun test scripts" }], branch: { commits: 2, uncommitted: false, files: 2, adds: 14, dels: 3 }, look: { by: "claude-code", model: "haiku", found: w.found, left: w.left } } });
core.tasks.setState(taskId, "done", "warm");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "done", taskId } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said, replyTo: u.seq } });
await tick();

// The reply: its Go card, with what the look still found.
const task2 = "t_212";
const u2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask2 } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j2", text: w.ack2, replyTo: u2.seq } });
log.append({ stream: `task:${task2}`, origin: "partner", kind: "task_open", body: { taskId: task2, title: w.title2, project: "ducter", place: { kind: "none" }, harness: "codex", brief: w.ask2, language: zh ? "zh" : "en", workKind: "errand" } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j2", text: w.title2, state: "running", taskId: task2 } });
core.tasks.setState(task2, "working", "hot");
log.append({ stream: `task:${task2}`, origin: "task", kind: "report", body: { taskId: task2, state: "needs_input", summary: w.said2, questions: [{ id: "q", text: w.q2, blocking: true, default: w.go2, reversible: false }], evidence: [], look: { by: "claude-code", found: w.left2, left: w.left2 } } });
await tick();
const d = log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).find((e) => (e.body as { taskId?: string }).taskId === task2);
if (d) log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said2, decisionId: (d.body as { decisionId: string }).decisionId } });
console.log(`demo-fresh-look on ${core.url} · ${zh ? "zh" : "en"}`);
