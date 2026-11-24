// A demo core for D505 (rev.): a server home (hel) whose task needs the person signed in to Taobao, which
// their MacBook's Chrome already is. The first time for that site: one go/hold card, 换过去 / Move it
// there or 我在这里登录 / I'll sign in here, in the conversation and in the task. Two sites said yes
// to before are listed in Settings › Devices › hel › 上网 under Signed-in sites, each with 移除.
// The card is put up the way browser_ask_sign_in puts it (the same report); nothing moves here.
//   DUCTER_CHROME=<Chrome for Testing> DUCTER_PORT=7506 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-signin-ask.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
process.env.DUCTER_BROWSER_DRIVER = "ducter";
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  push: false,
  platform: "linux",
  update: { homeName: "hel" },
  deviceProbes: { native: async () => null, cua: async () => ({ missing: "not here" }) as never, harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "server" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
// Said yes to before (D505 (rev.)): these go straight to the MacBook's Chrome.
core.settings.rememberChrome("jd.com");
core.settings.rememberChrome("github.com");
const log = core.log;

const ask = zh ? "看看我淘宝最近的订单，有没有还没发货的" : "Check my recent Taobao orders: has anything not shipped yet?";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j506", text: zh ? "好，我去淘宝上看看。" : "On it. I'll look on Taobao.", replyTo: u.seq } });
const title = zh ? "看淘宝最近的订单" : "Check recent Taobao orders";
log.append({ stream: "task:t506", origin: "partner", kind: "task_open", body: { taskId: "t506", title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: ask, language: zh ? "zh" : "en", needs: { browse: true } } as never });
core.tasks.setState("t506", "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j506", text: zh ? "在做" : "Working", state: "running", taskId: "t506" } });
await Bun.sleep(30);

const W = zh
  ? { q: "要登录 taobao.com。换到 MacBook 上你已登录的 Chrome 接着做？", go: "换过去", hold: "我在这里登录" }
  : { q: "This needs you signed in to taobao.com. Continue on MacBook, in your Chrome where you're signed in?", go: "Move it there", hold: "I'll sign in here" };
log.append({
  stream: "task:t506",
  origin: "task",
  kind: "report",
  body: { taskId: "t506", state: "needs_input", summary: W.q, questions: [{ id: "sign_in_where", text: W.q, blocking: true, default: W.go, reversible: false, signInWhere: { site: "taobao.com", url: "https://login.taobao.com/", to: "MacBook", hold: W.hold } }], evidence: [] },
});
core.tasks.setState("t506", "needs_you", "hot");
await Bun.sleep(50);
const d = log.read({ stream: "channel", kinds: ["decision"], limit: 5 }).map((e) => e.body as { decisionId: string; signInWhere?: unknown }).find((b) => b.signInWhere)!;
log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: { text: zh ? "订单要登录淘宝才看得到。你 MacBook 上的 Chrome 已经登录着，换过去接着做？" : "The orders need you signed in to Taobao. Your MacBook's Chrome already is: carry on there?", decisionId: d.decisionId },
});
console.log(`[demo-signin-ask] ${core.url.replace("ws://", "http://").replace("/ws", "/app")}  decision ${d.decisionId}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void core.stop().finally(() => process.exit(0)));
