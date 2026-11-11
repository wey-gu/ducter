// A demo core for 看它上网 / Watch it browse and taking turns (D190): a real core with Ducter's
// own browser (headless Chrome for Testing), a browser task that works a local test shop in a
// loop (open, read, click, type, scroll), stub partner and runner. Shots, manual checks and the
// frame measurements only; nothing leaves this machine.
//   DUCTER_CHROME=<Chrome for Testing> DUCTER_PORT=7795 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-browse.ts
// The shop answers as shop.example.com (Chrome maps the name to it). Each 5 s the open views'
// stream numbers are printed ([demo-browse] stats …).
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const SITE = "shop.example.com";

const page = (body: string, title: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 -apple-system,system-ui,"PingFang SC",sans-serif;margin:0;background:#f6f4ef;color:#23211d}header{background:#2d5b3c;color:#fff;padding:14px 22px;font-weight:800;letter-spacing:.3px}
main{max-width:720px;margin:24px auto;padding:0 20px}.card{background:#fff;border-radius:14px;padding:18px 20px;margin:0 0 14px;box-shadow:0 1px 3px #0001}h1{font-size:24px;margin:0 0 8px}p{color:#5d584f;margin:0 0 12px}
label{display:block;font-size:14px;font-weight:600;margin:12px 0 6px}input{box-sizing:border-box;width:100%;font:inherit;padding:10px 12px;border:1px solid #cfc8bb;border-radius:8px}
button,.btn{display:inline-block;margin-top:14px;font:inherit;font-weight:700;padding:10px 18px;border:0;border-radius:8px;background:#2d5b3c;color:#fff;text-decoration:none}.price{font-weight:800;color:#2d5b3c}.row{display:flex;justify-content:space-between;align-items:center;gap:12px}</style>
<header>Greenleaf Supply</header><main>${body}</main>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const items = [
  ["V60 filter paper, 100 sheets", "$6.50"],
  ["Kalita 185 filters, 100", "$8.90"],
  ["Chemex bonded filters, 100", "$11.20"],
  ["Cotton filter cloth, 3 pack", "$9.00"],
];
const site = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/search")
      return page(
        `<h1>Results for “${(u.searchParams.get("q") ?? "").replace(/[<>&"]/g, "")}”</h1>` +
          items.map(([n, p], i) => `<div class="card row"><div><b>${n}</b><p>In stock · ships tomorrow</p></div><div><span class="price">${p}</span><br><a class="btn" href="/item/${i}">View</a></div></div>`).join(""),
        "Search · Greenleaf Supply",
      );
    if (u.pathname.startsWith("/item/")) {
      const [n, p] = items[Number(u.pathname.split("/")[2]) || 0]!;
      return page(`<div class="card"><h1>${n}</h1><p class="price">${p}</p><p>Unbleached, fits 02 drippers. Pack of 100.</p><label for="q">Quantity</label><input id="q" name="q" value="1"><button onclick="document.title='Added · Greenleaf'">Add to cart</button></div>`, `${n} · Greenleaf Supply`);
    }
    return page(`<div class="card"><h1>Find supplies</h1><form action="/search"><label for="s">Search</label><input id="s" name="q" placeholder="filter paper"><button>Search</button></form></div>`, "Greenleaf Supply");
  },
});
process.env.DUCTER_CHROME_FLAGS = `--host-resolver-rules=MAP ${SITE} 127.0.0.1`;
const ORIGIN = `http://${SITE}:${site.port}`;

const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: "127.0.0.1", push: false, browser: { idleMs: 60 * 60_000 } });
const runner = stubRunner(core);
runner.send = async (taskId, text) => (console.log(`[demo-browse] told ${taskId}: ${text}`), { delivered: "prompted" });
core.setRunner(runner);
core.setPartner({ onTrigger() {} });
const log = core.log;

const ask = zh ? "滤纸快用完了，帮我在 Greenleaf 上看看 V60 滤纸，加一包到购物车" : "We're nearly out of filter paper: find V60 filters on Greenleaf and put a pack in the cart";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: zh ? "好，我去 Greenleaf 上找。" : "On it. I'll look on Greenleaf.", replyTo: u.seq } });
const title = zh ? "在 Greenleaf 上找 V60 滤纸" : "Find V60 filter paper on Greenleaf";
log.append({ stream: "task:t_buy", origin: "partner", kind: "task_open", body: { taskId: "t_buy", title, project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", model: "gpt-5.5", brief: ask } });
core.tasks.setState("t_buy", "working", "hot");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "在做" : "Working", state: "running", taskId: "t_buy" } });
core.ducterBrowser!.port.attach("t_buy", { profile: "default", evidenceDir: `${core.dataDir}/evidence/t_buy`, downloads: `${core.dataDir}/scratch/t_buy` });

// The "agent": a loop of real browser tools, slow enough to watch. It pauses when it's the user's
// turn (the tools refuse) and goes on when they hand it back.
const ctx = { role: "task" as const, taskId: "t_buy" };
const call = (name: string, args: object = {}) => core.mcp.call(ctx, name, args) as Promise<string>;
const ref = (text: string, re: RegExp) => Number(text.match(re)?.[1] ?? 0);
let stop = false;
(async () => {
  while (!stop) {
    try {
      let out = await call("browser_open", { url: `${ORIGIN}/` });
      await Bun.sleep(1500);
      await call("browser_type", { ref: ref(out, /\[(\d+)\] text field "Search"/), text: "V60 filter paper" });
      await Bun.sleep(1200);
      out = await call("browser_read");
      await call("browser_click", { ref: ref(out, /\[(\d+)\] button "Search"/) });
      await Bun.sleep(1800);
      await call("browser_scroll", { direction: "down", screens: 0.6 });
      await Bun.sleep(1500);
      out = await call("browser_read", { query: "V60" });
      await call("browser_click", { ref: ref(out, /\[(\d+)\] link "View"/) });
      await Bun.sleep(1800);
      out = await call("browser_read");
      await call("browser_click", { ref: ref(out, /\[(\d+)\] button "Add to cart"/) });
      await Bun.sleep(3000);
    } catch {
      await Bun.sleep(1000); // the user's turn (or a step that missed): try again in a moment
    }
  }
})();

console.log(`[demo-browse] ${core.url.replace("ws://", "http://").replace("/ws", "/app")}#task=t_buy`);
setInterval(() => {
  for (const v of core.ducterBrowser!.live.views()) {
    const s = core.ducterBrowser!.live.stats(v.id);
    if (s) console.log(`[demo-browse] stats ${v.kind} ${v.turn} frames=${s.frames} kb=${Math.round(s.bytes / 1024)} rtt=${s.rttMs ?? "-"}ms lag=${s.lagMs ?? "-"}ms q=${s.quality}`);
  }
}, 5000);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stop = true;
    void core.stop().finally(() => (site.stop(true), process.exit(0)));
  });
