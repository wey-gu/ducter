// D436: 跑腿到付款 / An errand to the checkout, for shots and manual checks. A real core with
// Ducter's own browser (headless Chrome for Testing) and a local fixture shop served over https
// with a throwaway self-signed certificate as shop.example (Chrome maps the name to 127.0.0.1;
// nothing leaves this machine, no real shop, no real card). Stub partner and runner: the task's
// steps are the browser tools called here, in the order a task would call them.
//   DUCTER_CHROME=<Chrome for Testing> DUCTER_PORT=7798 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STATE=checkout bun apps/web/demo-errand.ts
// DEMO_STATE: step (the shop's "confirm it's you" handed over), checkout (the 去付款 card, default),
// paid (the person paid in the live view; the report and Done for you).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { startFixtureShop } from "../../packages/core/test/fixture-shop.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const state = (process.env.DEMO_STATE ?? "checkout") as "step" | "checkout" | "paid";
const SITE = "shop.example";

// A throwaway certificate for the fixture's https (Ducter's tools stop only on a secure page).
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-errand-"));
const key = join(scratch, "key.pem");
const cert = join(scratch, "cert.pem");
Bun.spawnSync(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", `/CN=${SITE}`, "-addext", `subjectAltName=DNS:${SITE}`], { stdout: "ignore", stderr: "ignore" });
const shop = startFixtureShop({ lang: zh ? "zh" : "en", verify: true, tls: { cert: readFileSync(cert, "utf8"), key: readFileSync(key, "utf8") } });
process.env.DUCTER_CHROME_FLAGS = `--host-resolver-rules=MAP ${SITE} 127.0.0.1 --ignore-certificate-errors`;
const ORIGIN = `https://${SITE}:${shop.port}`;

const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: "127.0.0.1", push: false, browser: { idleMs: 60 * 60_000 } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
core.autofill.store.put({ kind: "detail", values: zh ? { name: "林小满", phone: "13800138000" } : { name: "Lin Xiaoman", phone: "+86 138 0013 8000" } });
const log = core.log;

const ask = zh ? "帮我把购物车里那三样买了" : "Buy the three things in my cart";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: zh ? "我去买，到付款那步停下给你。" : "On it. I'll stop at the checkout for you to pay.", replyTo: u.seq } });
const id = "t_cart";
const title = zh ? "把购物车里那三样买了" : "Buy the three things in the cart";
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: ask, needs: { buy: true, browse: true, signedIn: true, site: SITE }, language: zh ? "zh" : "en" } as Bodies["task_open"] });
core.tasks.setState(id, "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "在做" : "Working", state: "running", taskId: id } });
core.ducterBrowser!.port.attach(id, { profile: "default", evidenceDir: `${core.dataDir}/evidence/${id}`, downloads: `${core.dataDir}/scratch/${id}` });
const ctx = { role: "task" as const, taskId: id };
const call = (name: string, args: object = {}) => core.mcp.call(ctx, name, args).then(String);
const refOf = (read: string, words: string) => Number(read.split("\n").find((l) => /^\[\d+\]/.test(l) && l.includes(words))!.match(/^\[(\d+)\]/)![1]);
const lastDecision = (pred: (d: Bodies["decision"]) => boolean) => log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).map((e) => e.body as Bodies["decision"]).filter(pred).at(-1)!;
const say = (text: string, decisionId?: string) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ...(decisionId ? { decisionId } : {}) } });

// The cart the person already filled (their three things), then the legwork to the checkout.
for (const item of ["cable", "beans", "notebook"]) await fetch(`https://127.0.0.1:${shop.port}/cart/add`, { method: "POST", body: new URLSearchParams({ id: item }), tls: { rejectUnauthorized: false } } as RequestInit);
const cart = await call("browser_open", { url: `${ORIGIN}/cart` });
await call("browser_click", { ref: refOf(cart, zh ? "去结算" : "Checkout") });
await call("browser_ask_sign_in", { url: `${ORIGIN}/verify`, step: zh ? "点一下「我不是机器人」" : "Tap “I'm not a robot”" });
const step = lastDecision((d) => !!d.signIn?.step);
say(zh ? "小铺要先确认是你本人在下单，这一步得你来点一下。" : "The shop wants to check it's really you; that one tap is yours.", step.decisionId);

if (state !== "step") {
  // The person's tap, as they'd make it in the live view (here straight on the page), then 好了.
  const { b, sessionId } = await core.ducterBrowser!.host.tab(id);
  await b.cdp.send("Runtime.evaluate", { expression: `document.querySelector("form[action='/verify'] button").click()` }, sessionId);
  await Bun.sleep(800);
  core.decisions.decide(step.decisionId, "go");
  const co = await call("browser_read");
  await call("browser_fill", { ref: refOf(co, zh ? "收货人" : "Name"), use: "me.name" });
  await call("browser_fill", { ref: refOf(co, zh ? "手机号" : "Phone"), use: "me.phone" });
  const items = zh ? ["USB-C 数据线 1.8 米", "云南小粒咖啡豆 500 g", "A5 方格笔记本 3 本装"] : ["USB-C cable, 1.8 m", "Yunnan coffee beans, 500 g", "A5 grid notebooks, pack of 3"];
  await call("browser_at_checkout", { what: zh ? "购物车里的三样" : "The three things in your cart", total: "154.70", currency: "CNY", items });
  const card = lastDecision((d) => !!d.checkout);
  say(zh ? "三样都在，一共 ¥154.70，收货人和手机号填好了，停在付款这一步。" : "All three are in, ¥154.70 in total, your name and phone filled in; it's waiting at the payment step.", card.decisionId);

  if (state === "paid") {
    const { b: b2, sessionId: s2 } = await core.ducterBrowser!.host.tab(id);
    await b2.cdp.send("Runtime.evaluate", { expression: `document.querySelector("form[action='/pay'] button").click()` }, s2);
    await Bun.sleep(800);
    core.decisions.decide(card.decisionId, "go");
    await Bun.sleep(100);
    log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: zh ? "已支付：订单 EM-20261121-0042，三样一共 ¥154.70，预计 11 月 24 日送达。" : "Paid: order EM-20261121-0042, three items, ¥154.70, arriving Nov 24.", questions: [], evidence: [{ kind: "url", label: SITE, ref: `${ORIGIN}/pay` }] } });
    say(zh ? "买好了：订单号 EM-20261121-0042，一共 ¥154.70，预计 11 月 24 日到。" : "Done: order EM-20261121-0042, ¥154.70 in total, arriving Nov 24.");
  }
}
console.log(`[demo-errand] ${core.url.replace("ws://", "http://").replace("/ws", "/app")}  state ${state}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void core.stop().finally(() => (shop.stop(), process.exit(0))));
