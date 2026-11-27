// D644: the Settings polish's shared-control geometry, rendered under the real app.css in
// headless Chrome at the widths the pass covers. The probes are the rows that were wrong: a switch
// row's words beside its 44 switch at 320 (the tile went off the left), a group head's state word
// beside its words, the English "Follow the system" / "Ask you first" choices that used to fold into
// a tall stack, the details' facts apart, and a settings list row. No control is under 44 × 44 on a
// touch width (44), none under 36 on a desktop width (the 36 controls the set allows there), and
// nothing runs past the sheet at 320, 390, 768 or 1180.
import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const controls = readFileSync(join(import.meta.dir, "../src/controls.tsx"), "utf8");

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p): p is string => !!p && existsSync(p));

const probe = (w: number, touch: boolean) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}
html,body{margin:0;height:auto;background:var(--bg)}
#probe{margin:0 auto;width:${w < 700 ? w : 608}px;max-width:100%;height:auto;max-height:none;overflow:visible;position:static;translate:none}
</style></head><body>
<div id="probe" class="sheet" data-w="${w}" data-touch="${touch}">
  <div class="set-page pushed">
    <h2 class="set-title">设置</h2>
    <div class="pane-says"><p class="ps-say">每个任务我挑最合适、额度最够的那个。</p></div>
    <section class="set">
      <h3>做事的</h3>
      <div class="set-card chat-app g-group todo-src">
        <div class="chat-head">
          <span class="g-tile"><span class="brand-mark">t</span></span>
          <span class="grow"><b>Tuwa</b><small>能打电话了</small></span>
          <span class="g-state">今天还没打</span>
        </div>
        <div class="chat-row tiled">
          <span class="g-tile"><span class="brand-mark">C</span></span>
          <span class="grow"><b>Codex</b><small>额度还剩 64%，周一 22:52 恢复<br>我想事情也用它</small></span>
          <label class="switch bare"><input type="checkbox" role="switch" aria-label="用它做事，Codex"></label>
        </div>
        <div class="chat-row flat">
          <span class="grow"><b>浅色和深色</b><small>只改这个窗口。</small></span>
          <div class="seg sized" role="radiogroup" aria-label="浅色和深色">
            <button role="radio" aria-checked="false">System</button>
            <button role="radio" aria-checked="true" class="on">Light</button>
            <button role="radio" aria-checked="false">Dark</button>
          </div>
        </div>
        <button class="set-row">
          <span class="g-tile"><span class="brand-mark">P</span></span>
          <span class="grow"><b>伙伴</b><small>在 Hetzner Server 上运行，用 Codex 想事情</small></span>
          <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5l3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
        </button>
        <button class="set-row">
          <span class="g-tile"><span class="brand-mark">M</span></span>
          <span class="grow"><b>记忆</b><small>我记得的关于你的事，和帮我记的 Nowledge Mem</small></span>
          <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5l3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
        </button>
        <div class="chat-foot">
          <small class="grow">每个任务我挑最合适、额度最够的那个。</small>
          <span class="g-acts"><button class="btn text sm"><span class="lbl">Remove</span></button><button class="btn secondary sm"><span class="lbl">Try again</span></button></span>
        </div>
      </div>
    </section>
    <section class="set">
      <h3>你的资料</h3>
      <div class="set-card">
        <button class="set-row">
          <span class="af-mark">W</span>
          <span class="grow"><b>Wey Gu</b>
            <span class="facts af-facts"><span>weyl.gu@gmail.com</span><span>+86&nbsp;138&nbsp;0000&nbsp;0000</span></span>
            <small>也替你存着住址，只用来填。</small>
          </span>
          <span class="g-state">已存</span>
        </button>
      </div>
    </section>
  </div>
</div>
<script>
window.__audit = (min) => {
  const bad = [];
  const probe = document.getElementById('probe');
  const pr = probe.getBoundingClientRect();
  const name = (e) => (e.tagName.toLowerCase() + '.' + String(e.className || '').split(/\\s+/).filter(Boolean).join('.')).slice(0, 80);
  for (const e of probe.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left < pr.left - 1 || r.right > pr.right + 1) bad.push('past the sheet: ' + name(e) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + Math.round(pr.left) + '..' + Math.round(pr.right));
  }
  const targets = probe.querySelectorAll('button, .seg button');
  for (const e of targets) {
    let r = e.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    // The D311 invisible box: a ::before centred on the control at least 44 square.
    const bef = getComputedStyle(e, '::before');
    if (bef.content && bef.content !== 'none' && bef.position === 'absolute') {
      const bw = parseFloat(bef.width), bh = parseFloat(bef.height);
      if (Number.isFinite(bw) && Number.isFinite(bh) && bw >= 44 && bh >= 44) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        r = { left: cx - bw / 2, right: cx + bw / 2, top: cy - bh / 2, bottom: cy + bh / 2, width: bw, height: bh };
      }
    }
    if (r.width < min - 0.5 || r.height < min - 0.5) bad.push('small: ' + name(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + ' (' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30) + ')');
  }
  const sized = probe.querySelector('.seg.sized');
  if (sized && sized.scrollWidth > sized.clientWidth + 1) bad.push('the choice spills: ' + sized.scrollWidth + ' > ' + sized.clientWidth);
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + innerWidth);
  return bad;
};
</script></body></html>`;

/** Chrome's websocket for the page target; Chrome must be the one this profile started. */
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

describe("Settings' shared controls hold at every width", () => {
  test("no control under 44 on touch, none under 36 on a desktop, and nothing past the sheet", async () => {
    if (!CHROME) return; // a machine without Chrome already skips the other rendered geometry tests
    const dir = mkdtempSync(join(tmpdir(), "ducter-setgeom-"));
    const html = join(dir, "probe.html");
    writeFileSync(html, probe(390, true));
    const port = 9300 + Math.floor(Math.random() * 500);
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
      // The flattened session's commands carry the session id.
      const sc = (m: string, p: Record<string, unknown> = {}) =>
        new Promise<any>((ok, bad) => {
          const n = ++id;
          pend.set(n, { ok, bad });
          ws.send(JSON.stringify({ id: n, method: m, params: p, sessionId }));
        });
      await sc("Page.enable");
      await sc("Runtime.enable");
      for (const w of [320, 390, 768, 1180]) {
        const touch = w <= 768;
        writeFileSync(html, probe(w, touch));
        await sc("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: touch, screenWidth: w, screenHeight: 900 });
        if (touch) await sc("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        else await sc("Emulation.setTouchEmulationEnabled", { enabled: false });
        await sc("Page.navigate", { url: `file://${html}` });
        await Bun.sleep(220);
        const r = await sc("Runtime.evaluate", { expression: `window.__audit(${touch ? 44 : 36})`, returnByValue: true });
        const bad = r.result?.value as string[];
        expect(bad, `${w}px: ${bad?.join("; ")}`).toEqual([]);
      }
      await send("Target.closeTarget", { targetId });
      ws.close();
    } finally {
      proc.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90000);
});

test("a bare switch keeps a 44-point box under a finger", () => {
  // The drawn pill is 44 × 26; the label's box takes the finger (D311, the shared Switch).
  const at = css.indexOf("@media (pointer: coarse)");
  const rule = css.slice(at, css.indexOf("}", css.indexOf(".switch.bare::before", at)) + 1);
  expect(rule).toContain("width: max(44px, 100%)");
  expect(rule).toContain("height: max(44px, 100%)");
});

test("the choice's fit tries the words' own width before it folds", () => {
  expect(controls).toContain('el.classList.add("sized")');
  expect(controls.indexOf('el.classList.add("sized")')).toBeLessThan(controls.indexOf('el.classList.add("stack")'));
  expect(css).toMatch(/\.seg\.sized button \{[^}]*flex: 1 1 auto;/);
  // A choice whose row is already past the card is no fit, however wide the choice grew.
  expect(controls).toContain("row.scrollWidth > row.clientWidth");
  // The card's inner width caps a phone's full-width choice; a 320 screen had one 40 points out.
  expect(css).toMatch(/max-width: calc\(100% \+ var\(--chat-col\) \+ var\(--set-in, var\(--s4\)\)\)/);
  // A bare switch in a pushed page keeps its bare box (the switch row's 76-wide padding pushed tiles off).
  expect(css).toContain(".set-page.pushed .switch.bare");
});
