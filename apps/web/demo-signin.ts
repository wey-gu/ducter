// A demo core for the sign-in card and the live view (D150): a real core with Ducter's own
// browser (headless Chrome for Testing), a browser task that asked to sign in to a local test
// site, stub partner and runner. Shots and manual checks only; no real site is signed into.
//   DUCTER_CHROME=<Chrome for Testing> DUCTER_PORT=7796 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-signin.ts
// The test site answers as console.example.com (Chrome maps the name to it; nothing leaves this machine).
import { startCore, stubRunner } from "@ducter/core";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const SITE = "console.example.com";

const page = (body: string, title: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#f4f5f7;color:#1d2330}main{max-width:380px;margin:48px auto;padding:28px 24px;background:#fff;border-radius:14px;box-shadow:0 1px 3px #0002}
h1{font-size:22px;margin:0 0 4px}p{color:#5b6475;margin:0 0 20px}label{display:block;font-size:14px;font-weight:600;margin:14px 0 6px}input{box-sizing:border-box;width:100%;font:inherit;padding:10px 12px;border:1px solid #c9ced8;border-radius:8px}
button{margin-top:22px;width:100%;font:inherit;font-weight:700;padding:11px;border:0;border-radius:8px;background:#2f5bea;color:#fff}.logo{font-weight:800;letter-spacing:.5px;color:#2f5bea;margin-bottom:18px}</style>
<main><div class="logo">Example Console</div>${body}</main>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const site = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/login" && req.method === "POST") return new Response(null, { status: 303, headers: { Location: "/orders", "Set-Cookie": "session=demo; Max-Age=86400; Path=/" } });
    if (u.pathname === "/login")
      return page(
        `<h1>Sign in</h1><p>to continue to your orders</p><form method="post" action="/login"><label for="e">Email</label><input id="e" name="e" autocomplete="username" placeholder="you@example.com"><label for="p">Password</label><input id="p" name="p" type="password"><button>Sign in</button></form>`,
        "Sign in · Example Console",
      );
    if (!/session=demo/.test(req.headers.get("cookie") ?? "")) return new Response(null, { status: 303, headers: { Location: "/login" } });
    return page(`<h1>Orders</h1><p>3 orders this month</p>`, "Orders · Example Console");
  },
});
process.env.DUCTER_CHROME_FLAGS = `--host-resolver-rules=MAP ${SITE} 127.0.0.1`;
const ORIGIN = `http://${SITE}:${site.port}`;

const core = startCore({ persona: { id: "default", name: "Ducter", identity: "" }, hostname: "127.0.0.1", push: false, browser: { idleMs: 60 * 60_000 } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;

const ask = zh ? "帮我看看 Example Console 上这个月的订单" : "Check this month's orders on Example Console";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: zh ? "好，我去 Example Console 上看看。" : "On it. I'll look on Example Console.", replyTo: u.seq } });
const title = zh ? "看 Example Console 这个月的订单" : "Check this month's orders on Example Console";
log.append({ stream: "task:t_orders", origin: "partner", kind: "task_open", body: { taskId: "t_orders", title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: ask } });
core.tasks.setState("t_orders", "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "在做" : "Working", state: "running", taskId: "t_orders" } });
core.ducterBrowser!.port.attach("t_orders", { profile: "default", evidenceDir: `${core.dataDir}/evidence/t_orders`, downloads: `${core.dataDir}/scratch/t_orders` });
const ctx = { role: "task" as const, taskId: "t_orders" };
await core.mcp.call(ctx, "browser_open", { url: `${ORIGIN}/orders` });
await core.mcp.call(ctx, "browser_ask_sign_in", { url: `${ORIGIN}/login`, why: zh ? "登录以后我去看这个月的订单。" : "Once you're signed in I'll read this month's orders." });
await Bun.sleep(50);
const d = log.read({ stream: "channel", kinds: ["decision"], limit: 5 }).map((e) => e.body as { decisionId: string; signIn?: unknown }).find((b) => b.signIn)!;
log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: { text: zh ? `要看订单，得先登录 ${SITE}。你点一下，自己登录就好。` : `To read the orders I need you signed in to ${SITE}. Tap below and sign in yourself.`, decisionId: d.decisionId },
});
console.log(`[demo-signin] ${core.url.replace("ws://", "http://").replace("/ws", "/app")}  decision ${d.decisionId}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void core.stop().finally(() => (site.stop(true), process.exit(0))));
