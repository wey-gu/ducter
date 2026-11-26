// A demo core for D599: a task on haswell cloning a private repo needs gh signed in to GitHub. Its
// sign-in command printed GitHub's device page and a one-time code; the card carries them.
// DEMO_STAGE=waiting (default): 登录 GitHub, the code with Copy, Open GitHub, the wait with the minutes left.
// DEMO_STAGE=expired: the code ran out: 再要一个码.
// DEMO_STAGE=done: Ducter's check saw it: 已登录 GitHub, the task at work again.
// DEMO_STAGE=before: the card as a task wrote it before D599 (its words only, no card shape): with
//   this client the words' link and code are real (AskText); the old client draws them as a title.
// DEMO_STAGE=words: any task's question with a link and a command in backticks (AskText).
// No CLI is named on the card, so nothing is checked on this machine: no gh runs, nothing signs in.
//   DUCTER_PORT=7599 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh [DEMO_STAGE=…] bun apps/web/demo-device-signin.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { normalizeReport } from "../../packages/runner/src/tools.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "waiting";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: "127.0.0.1", push: false, browser: false });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const log = core.log;
const ask = zh ? "把 nowledge-co/mem 克隆到 haswell 上，跑一遍构建和测试" : "Clone nowledge-co/mem on haswell and run its build and tests";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j599", text: zh ? "好，我让它在 haswell 上克隆、构建、跑测试。" : "On it: clone, build and test on haswell.", replyTo: u.seq } });
const title = zh ? "在 haswell 上克隆 mem 并跑通测试" : "Clone mem on haswell and run its tests";
const open = { taskId: "t599", title, project: "", place: { kind: "none" }, harness: "claude-code", brief: ask, language: zh ? "zh" : "en" };
log.append({ stream: "task:t599", origin: "partner", kind: "task_open", body: open as never });
core.tasks.setState("t599", "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j599", text: zh ? "在做" : "Working", state: "running", taskId: "t599" } });
const ev = (body: Record<string, unknown>) => log.append({ stream: "task:t599", origin: "system", kind: "task_event", body: { taskId: "t599", ...body } as never });
ev({ role: "assistant", text: zh ? "nowledge-co/mem 是私有仓库，haswell 上的 gh 还没登录 GitHub。我在后台跑了 gh auth login。" : "nowledge-co/mem is private and gh on haswell isn't signed in to GitHub. I started gh auth login in the background." });
ev({ role: "tool", tool: { name: "Bash", input: "BROWSER=true .github-cli/gh auth login --hostname github.com --git-protocol https --web", output: "! First copy your one-time code: 8694-B656\nOpen this URL to continue in your web browser: https://github.com/login/device" } });
await Bun.sleep(30);

const minutes = stage === "expired" ? -1 : 14;
const until = new Date(Date.now() + minutes * 60_000 + 20_000).toISOString();
const words = zh
  ? "请打开 https://github.com/login/device，输入设备码 8694-B656 并在 GitHub 网页上授权。完成后请回复「已授权」。"
  : "Open https://github.com/login/device, enter the device code 8694-B656 and approve it on GitHub. Reply “approved” when you're done.";
const q =
  stage === "before"
    ? { id: "q", text: words, blocking: true, reversible: false, default: zh ? "继续" : "Continue" }
    : stage === "words"
      ? { id: "q", text: zh ? "构建要 Node 22，haswell 上是 20。按 https://nodejs.org/en/download 的说明，用 `fnm install 22` 装上再继续？" : "The build needs Node 22 and haswell has 20. Install it with `fnm install 22` (see https://nodejs.org/en/download) and carry on?", blocking: true, reversible: false, default: zh ? "装上再继续" : "Install it" }
      : { id: "sign_in", text: "Sign in to GitHub: open https://github.com/login/device and enter 8694-B656.", blocking: true, reversible: false, deviceSignIn: { service: "GitHub", url: "https://github.com/login/device", code: "8694-B656", until } };
// "before": the task's worded question goes through report_to_main's own normalizing, as it would live
// (from D599 on, the runner's recognizer gives it the card's shape; before, it stays words). The CLI is
// left off the card here so nothing runs gh on this machine.
const raw = { state: "needs_input", summary: zh ? "要登录 GitHub" : "Needs a GitHub sign-in", questions: [q], evidence: [] };
const report = stage === "before" ? normalizeReport("t599", raw) : ({ taskId: "t599", ...raw } as never);
for (const x of (report as { questions: { deviceSignIn?: { cli?: string } }[] }).questions) if (x.deviceSignIn) delete x.deviceSignIn.cli;
log.append({ stream: "task:t599", origin: "task", kind: "report", body: report as never });
core.tasks.setState("t599", "needs_you", "hot");
await Bun.sleep(50);
const d = log.read({ stream: "channel", kinds: ["decision"], limit: 5 }).map((e) => e.body as { decisionId: string }).at(-1)!;
// The partner's word for it (D129), as it relays a task's ask.
const said =
  stage === "before"
    ? zh ? "它需要你在 GitHub 网页上授权一下，才能克隆这个私有仓库。" : "It needs you to approve it on GitHub's page before it can clone the private repo."
    : stage === "words"
      ? zh ? "构建要 Node 22，haswell 上只有 20。按 https://nodejs.org/en/download 的说明，用 `fnm install 22` 装上再继续？" : "The build needs Node 22 and haswell has 20. Install it with `fnm install 22` (see https://nodejs.org/en/download) and carry on?"
      : zh ? "haswell 上的 gh 要登录 GitHub，才能克隆这个私有仓库。" : "gh on haswell needs a GitHub sign-in to clone the private repo.";
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: said, decisionId: d.decisionId } as never });
if (stage === "done") {
  log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "go", by: "ended", settled: true, signedIn: true } as never });
  ev({ role: "user", from: "ducter", text: "Signed in to GitHub: its own status command says so now. Carry on with the work that needed it; don't ask the person about it." });
  ev({ role: "assistant", text: zh ? "gh 已登录。正在克隆 nowledge-co/mem。" : "gh is signed in. Cloning nowledge-co/mem." });
  core.tasks.setState("t599", "working", "hot");
}
console.log(`[demo-device-signin] ${core.url.replace("ws://", "http://").replace("/ws", "/app")}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void core.stop().finally(() => process.exit(0)));
