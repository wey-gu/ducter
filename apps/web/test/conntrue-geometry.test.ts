// D666 (research/247 Brief D): the two quiet links under Accounts and the device rename reach
// a thumb's 44 at 390, rendered under the real app.css in headless Chrome with touch emulation.
import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  "/usr/bin/google-chrome",
].find((p): p is string => !!p && existsSync(p));

const page = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}
html, body { margin: 0; background: var(--bg); }
#probe { width: 390px; max-width: 100%; padding: 12px; }
</style></head><body>
<div id="probe" class="set">
  <section class="accounts">
    <button class="qlink" id="add">用地址和密钥添加<svg width="12" height="12"></svg></button>
  </section>
  <form class="acct-form">
    <button type="button" class="qlink" id="how">怎么连<svg width="12" height="12"></svg></button>
  </form>
  <div class="dc-name"><button class="dev-name" id="name">Weyl 的 MacBook Pro<span class="pen"></span></button></div>
</div>
<script>
window.__audit = () => ["add", "how", "name"].map((id) => {
  const r = document.getElementById(id).getBoundingClientRect();
  return { id, w: r.width, h: r.height };
});
</script></body></html>`;

async function cdp(port: number) {
  for (let i = 0; i < 100; i++) {
    try {
      const v = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
      if (v.webSocketDebuggerUrl) return v.webSocketDebuggerUrl;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("Chrome's debugging port never answered");
}

describe("the quiet links reach 44 at 390", () => {
  test("用地址和密钥添加, 怎么连 and the device name are 44 tall and wide under a finger", async () => {
    if (!CHROME) return; // a machine without Chrome skips the other rendered geometry tests too
    const dir = mkdtempSync(join(tmpdir(), "ducter-conntrue-geom-"));
    const html = join(dir, "probe.html");
    writeFileSync(html, page);
    const port = 9800 + Math.floor(Math.random() * 300);
    const proc = spawn(CHROME, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run",
      "--no-default-browser-check", "--hide-scrollbars", `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(dir, "profile")}`, "about:blank",
    ], { stdio: "ignore" });
    try {
      const ws = new WebSocket(await cdp(port));
      await new Promise<void>((ok, bad) => ((ws.onopen = () => ok()), (ws.onerror = () => bad(new Error("ws")))));
      let id = 0;
      const pend = new Map<number, { ok: (v: any) => void; bad: (e: Error) => void }>();
      ws.onmessage = (m) => {
        const msg = JSON.parse(String(m.data));
        if (msg.id && pend.has(msg.id)) {
          const p = pend.get(msg.id)!;
          pend.delete(msg.id);
          msg.error ? p.bad(new Error(JSON.stringify(msg.error))) : p.ok(msg.result);
        }
      };
      const send = (method: string, params: Record<string, unknown> = {}) =>
        new Promise<any>((ok, bad) => {
          const n = ++id;
          pend.set(n, { ok, bad });
          ws.send(JSON.stringify({ id: n, method, params }));
        });
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const sc = (method: string, params: Record<string, unknown> = {}) =>
        new Promise<any>((ok, bad) => {
          const n = ++id;
          pend.set(n, { ok, bad });
          ws.send(JSON.stringify({ id: n, method, params, sessionId }));
        });
      await sc("Page.enable");
      await sc("Runtime.enable");
      for (const w of [390, 1180]) {
        const touch = w === 390;
        await sc("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: touch, screenWidth: w, screenHeight: 900 });
        await sc("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 5 });
        await sc("Page.navigate", { url: `file://${html}` });
        await Bun.sleep(220);
        const r = await sc("Runtime.evaluate", { expression: "window.__audit()", returnByValue: true });
        for (const v of r.result?.value as { id: string; w: number; h: number }[]) {
          if (touch) {
            expect(v.h, `${v.id} height at ${w}`).toBeGreaterThanOrEqual(44);
            expect(v.w, `${v.id} width at ${w}`).toBeGreaterThanOrEqual(44);
          }
        }
      }
      await send("Target.closeTarget", { targetId });
      ws.close();
    } finally {
      proc.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
