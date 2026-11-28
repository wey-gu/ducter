// D663: 找设置 / Find a setting laid out under the real app.css in headless Chrome at 390 (a finger)
// and 1180: the field under the title at least 44 tall under a finger, full-width found rows at
// least 44 tall, the value never past the card, the pane its own line, nothing past the sheet.
import { expect, test } from "bun:test";
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
  "/usr/bin/chromium",
].find((p): p is string => !!p && existsSync(p));

const chev = `<span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5l3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></span>`;
const row = (t: string, pane: string, value: string) =>
  `<button type="button" role="option" class="set-row sf-row"><span class="sf-art"><img src="" alt="" width="32" height="32"></span><span class="grow"><b>${t}</b>${pane ? `<small class="sf-pane">${pane}</small>` : ""}</span>${value ? `<span class="sf-value">${value}</span>` : ""}${chev}</button>`;
const probe = (w: number) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}
html,body{margin:0;height:auto;background:var(--bg)}
#probe{margin:0 auto;width:${w < 700 ? w : 608}px;max-width:100%;height:auto;max-height:none;overflow:visible;position:static;translate:none;padding:0 16px;box-sizing:border-box}
</style></head><body>
<div id="probe" class="sheet"><div class="set-page">
  <h2>Settings</h2>
  <label class="find-field set-find" id="field"><svg width="16" height="16"></svg><input type="search" value="notif" aria-label="Find a setting"><button type="button" class="find-clear" aria-label="Clear"><svg width="12" height="12"></svg></button></label>
  <p class="sf-count">4 settings found</p>
  <div class="set-card set-list sf-list" role="listbox">
    ${row("Notifications", "", "On")}
    ${row("Quiet hours", "Notifications", "23:00 to 08:00")}
    ${row("When I notice something", "Notifications", "Up to 3 a day")}
    ${row("How long before I go with the default", "Notifications", "30 min")}
    ${row("Let agents connected to Nowledge Mem reach Ducter", "Agent messaging", "")}
  </div>
  <div class="sf-none"><span class="avatar" style="width:36px;height:36px"></span><div class="sf-none-words"><p class="sf-none-say">No setting called “a very long thing someone typed into the field”.</p><p class="sf-none-ask">Tell me what you'd like changed, and I'll change it.</p><button class="btn secondary sm"><span class="lbl">Tell Ducter in the conversation</span></button></div></div>
</div></div>
<script>
window.__audit = (touch) => {
  const bad = [];
  const probe = document.getElementById('probe');
  const pr = probe.getBoundingClientRect();
  for (const e of probe.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left < pr.left - 1 || r.right > pr.right + 1) bad.push('past the sheet: ' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
  }
  const field = document.getElementById('field').getBoundingClientRect();
  if (field.height < (touch ? 44 : 40) - 0.5) bad.push('field ' + field.height + ' tall');
  const card = document.querySelector('.sf-list').getBoundingClientRect();
  for (const r of document.querySelectorAll('.sf-row')) {
    const b = r.getBoundingClientRect();
    if (b.height < 44) bad.push('row ' + b.height + ' tall');
    if (Math.abs(b.width - card.width) > 1) bad.push('row not full width: ' + b.width + ' of ' + card.width);
    const v = r.querySelector('.sf-value');
    if (v && v.getBoundingClientRect().right > b.right) bad.push('value past its row');
    const words = r.querySelector('.grow').getBoundingClientRect();
    if (words.width < 120) bad.push('words squeezed to ' + words.width);
  }
  if (touch) {
    const x = document.querySelector('.find-clear').getBoundingClientRect();
    if (x.width < 44 || x.height < 44) bad.push('clear ' + x.width + '×' + x.height);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('sideways scroll');
  return bad;
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

test("the field, the found rows and the calm line hold at 390 and 1180 (D663)", async () => {
  if (!CHROME) return;
  const dir = mkdtempSync(join(tmpdir(), "ducter-setfind-"));
  const html = join(dir, "probe.html");
  const port = 9800 + Math.floor(Math.random() * 150);
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, "profile")}`, "about:blank"], { stdio: "ignore" });
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
    let sessionId = "";
    const send = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<any>((ok, bad) => {
        const n = ++id;
        pend.set(n, { ok, bad });
        ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    sessionId = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
    await send("Page.enable");
    await send("Runtime.enable");
    for (const w of [390, 1180]) {
      const touch = w < 700;
      writeFileSync(html, probe(w));
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: touch, screenWidth: w, screenHeight: 900 });
      await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
      await send("Page.navigate", { url: `file://${html}` });
      await Bun.sleep(250);
      const r = await send("Runtime.evaluate", { expression: `window.__audit(${touch})`, returnByValue: true });
      const bad = r.result?.value as string[];
      expect(bad, `${w}px: ${bad?.join("; ")}`).toEqual([]);
    }
    ws.close();
  } finally {
    proc.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
