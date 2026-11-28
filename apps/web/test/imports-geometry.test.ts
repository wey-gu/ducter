// D672 (polish103): the installed plugin row's one meta line (its source's short name,
// 你加的 / Added by you, and the check) keeps the two-line rhythm and never spills at 390 or 1180,
// rendered under the real app.css in headless Chrome. The full URL is never the row's own text.
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
  <section class="set-card chat-app import-src">
    <div class="import-meta" id="meta">
      <span class="import-source" id="src" title="https://github.com/lin/acme-notes">lin/acme-notes</span>
      <span class="import-added" id="added">你加的</span>
      <span class="import-unreviewed" id="check">没有人替你检查过。</span>
    </div>
  </section>
</div>
<script>
window.__audit = () => {
  const meta = document.getElementById("meta");
  const src = document.getElementById("src");
  const s = meta.getBoundingClientRect();
  const t = src.getBoundingClientRect();
  return { metaW: meta.clientWidth, metaSW: meta.scrollWidth, metaH: s.height, srcText: src.textContent, srcTop: t.top, checkTop: document.getElementById("check").getBoundingClientRect().top, addedTop: document.getElementById("added").getBoundingClientRect().top };
};
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

describe("the installed plugin row's meta line keeps its two-line rhythm", () => {
  test("the source is the short name, never the URL, and the line wraps without spilling", async () => {
    if (!CHROME) return; // a machine without Chrome skips the rendered geometry tests too
    const dir = mkdtempSync(join(tmpdir(), "ducter-imports-geom-"));
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
        await sc("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: 900 });
        await sc("Page.navigate", { url: `file://${html}` });
        await Bun.sleep(220);
        const r = await sc("Runtime.evaluate", { expression: "window.__audit()", returnByValue: true });
        const v = r.result?.value as { metaW: number; metaSW: number; metaH: number; srcText: string; srcTop: number; checkTop: number; addedTop: number };
        expect(v.srcText, `the row's source at ${w}`).toBe("lin/acme-notes");
        expect(v.srcText, `the row never shows its URL at ${w}`).not.toContain("https://");
        // No horizontal spill: the wrap keeps the line inside its card.
        expect(v.metaSW, `no horizontal spill at ${w}`).toBeLessThanOrEqual(v.metaW + 1);
        expect(v.metaH, `a real meta line at ${w}`).toBeGreaterThan(0);
      }
      await send("Target.closeTarget", { targetId });
      ws.close();
    } finally {
      proc.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
