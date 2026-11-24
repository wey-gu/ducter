// A demo core for D505 (rev.): a server home (hel) with the person's MacBook as a computer for tasks
// (上网 in their own Chrome). A task asked to compare a product's prices and reviews meets a page
// that wants the person signed in to Taobao, which nothing in the ask said (so it started on hel).
// DEMO_STAGE=ask (default): the first time for that site, one go/hold card, 换过去 / Move it there or
//   我在这里登录 / I'll sign in here, in the conversation and in the task. Two sites said yes to
//   before are listed in Settings › Devices › hel › 上网, each with 移除.
// DEMO_STAGE=after: 换过去 was tapped: the task carries on on the MacBook, its line 换到 MacBook 接着做,
//   its where line's reason 你说过 taobao.com 都直接用你的 Chrome.
// The card is put up the way browser_ask_sign_in puts it (the same report); the move is written as
// the runner writes it. Nothing leaves this machine.
//   DUCTER_CHROME=<Chrome for Testing> DUCTER_PORT=7506 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh [DEMO_STAGE=after] bun apps/web/demo-signin-ask.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const after = process.env.DEMO_STAGE === "after";
const MAC = "MacBook";
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
// Said yes to before: these go straight to the MacBook's Chrome.
core.settings.rememberChrome("jd.com");
core.settings.rememberChrome("github.com");
if (after) core.settings.rememberChrome("taobao.com");

// The MacBook, joined as a computer for tasks, browsing in the person's own Chrome.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: MAC, platform: "darwin-arm64", computer: MAC } as never) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as never);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t === "req") ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: null }));
};
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.1.30",
    how: "app",
    abilities: [{ id: "web", state: "on", where: "chrome", detail: "codex" }],
    harnesses: [{ id: "codex", installed: true, loggedIn: true, version: "0.170.0", how: "npm" }],
  }),
);
await Bun.sleep(100);

const log = core.log;
const ask = zh ? "查一下这个商品最近三个月的价格，顺便看看评价 https://item.taobao.com/item.htm?id=7316580424" : "Look up this item's price over the last three months, and read its reviews too https://item.taobao.com/item.htm?id=7316580424";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j506", text: zh ? "好，我去查价格和评价。" : "On it: prices and reviews.", replyTo: u.seq } });
const title = zh ? "查这个商品三个月的价格和评价" : "Price history and reviews for this item";
const open = { taskId: "t506", title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: ask, language: zh ? "zh" : "en", needs: { browse: true } };
log.append({ stream: "task:t506", origin: "partner", kind: "task_open", body: open as never });
core.tasks.setState("t506", "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j506", text: zh ? "在做" : "Working", state: "running", taskId: "t506" } });
const ev = (body: Record<string, unknown>) => log.append({ stream: "task:t506", origin: "system", kind: "task_event", body: { taskId: "t506", ...body } as never });
ev({ role: "assistant", text: zh ? "打开了商品页，价格曲线要登录淘宝才显示。" : "Opened the item page; the price chart only shows once you're signed in to Taobao." });
await Bun.sleep(30);

if (!after) {
  const W = zh
    ? { q: "要登录 taobao.com。换到 MacBook 上你已登录的 Chrome 接着做？", go: "换过去", hold: "我在这里登录" }
    : { q: "This needs you signed in to taobao.com. Continue on MacBook, in your Chrome where you're signed in?", go: "Move it there", hold: "I'll sign in here" };
  log.append({
    stream: "task:t506",
    origin: "task",
    kind: "report",
    body: { taskId: "t506", state: "needs_input", summary: W.q, questions: [{ id: "sign_in_where", text: W.q, blocking: true, default: W.go, reversible: false, signInWhere: { site: "taobao.com", url: "https://login.taobao.com/", to: MAC, hold: W.hold } }], evidence: [] },
  });
  core.tasks.setState("t506", "needs_you", "hot");
  await Bun.sleep(50);
  const d = log.read({ stream: "channel", kinds: ["decision"], limit: 5 }).map((e) => e.body as { decisionId: string; signInWhere?: unknown }).find((b) => b.signInWhere)!;
  log.append({
    stream: "channel",
    origin: "partner",
    kind: "ai_msg",
    body: { text: zh ? "价格曲线要登录淘宝才看得到。你 MacBook 上的 Chrome 已经登录着，换过去接着做？" : "The price chart needs you signed in to Taobao. Your MacBook's Chrome already is: carry on there?", decisionId: d.decisionId },
  });
} else {
  // As the runner's moveTask writes it (D505 and its rev.): the place there, who and why, the move line.
  log.append({ stream: "task:t506", origin: "user", kind: "task_open", body: { ...open, place: { kind: "browser", device: MAC, profile: "default" } } as never });
  log.append({ stream: "task:t506", origin: "user", kind: "body_selected", body: { taskId: "t506", harness: "codex", why: { kind: "default", where: { device: MAC, kind: "signed_in", site: "taobao.com", uses: "chrome", always: true } } } as never });
  ev({ role: "system", from: "runner", text: `moved from hel to ${MAC}`, raw: { switched: { from: "codex", to: "codex" }, moved: { from: "hel", to: MAC, signIn: "taobao.com" } } });
  ev({ role: "assistant", text: zh ? "在 MacBook 的 Chrome 里打开了价格曲线：三个月里最低 ¥189（10 月 11 日），现在 ¥219。" : "Opened the price chart in the MacBook's Chrome: the low in three months was ¥189 (Oct 11); it's ¥219 now." });
  core.tasks.setState("t506", "working", "hot");
}
console.log(`[demo-signin-ask] ${core.url.replace("ws://", "http://").replace("/ws", "/app")}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void core.stop().finally(() => process.exit(0)));
