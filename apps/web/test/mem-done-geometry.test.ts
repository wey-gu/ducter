// D652: the failed line of 改 / 忘掉 fits at 390 (a phone) and 1150 (a laptop), in the failed
// ink, under the row as it was, with the actions still whole. Rendered under the real app.css in
// headless Chrome. The Mac has the same line at 1150 (memory_done_test.go).
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const found = Bun.which(n);
    if (found) return found;
  }
  return undefined;
}

const tile = `<span class="g-tile"><span class="mem-dot"></span></span>`;
const row = (title: string) => `<button class="chat-row tiled mem-item open" type="button">${tile}<span class="grow"><b dir="auto">${title}</b><small>Codex 记的</small></span><span class="g-state">2 天前</span></button>`;
const fail = (why: string) => `<div class="chat-foot mem-item-acts"><small class="grow mem-failed" role="alert">没改成功：${why}</small></div>`;
const acts = `<div class="chat-foot mem-item-acts"><small class="grow">不对？改一下，或者让我忘掉。</small><span class="g-acts"><button class="btn text sm" type="button"><span class="lbl">修改</span></button><button class="danger-text quiet" type="button">忘掉</button></span></div>`;
const page = (w: number) => `<div class="shot" data-w="${w}" style="width:${w}px"><section class="set-card chat-app g-group">${row("聊天用中文，仓库里的文档和代码用英文")}${fail("Nowledge Mem 的登录失效了。在上面重新登录一次，再试。")}${acts}</section></div>`;

test("the failed line is in the failed ink, not a callout", () => {
  const block = /\.mem-item-acts \.mem-failed\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(block).toMatch(/color:\s*var\(--failed-ink\)/);
  expect(block).not.toMatch(/background|border-left/);
});

const browser = chrome();
if (!browser) {
  test.skip("the failed line fits 390 and 1150 (no Chrome or Chromium here)", () => {});
} else {
  for (const w of [390, 1150]) {
    test(`the failed line and the row's actions fit ${w} (rendered in Chrome)`, () => {
      const dir = mkdtempSync(join(tmpdir(), "ducter-mem-done-"));
      try {
        const file = join(dir, `mem-done-${w}.html`);
        const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0">${page(w)}<span id="ink" style="color:var(--failed-ink)">x</span><pre id="result"></pre><script>
{
  const bad = [];
  const page = document.querySelector(".shot");
  const box = page.getBoundingClientRect();
  for (const el of page.querySelectorAll(".mem-item, .mem-item-acts, .mem-failed, .btn, .danger-text")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) bad.push(el.className + " " + r.left.toFixed(1) + ".." + r.right.toFixed(1) + " vs " + box.left.toFixed(1) + ".." + box.right.toFixed(1));
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) bad.push(el.className + " scrollWidth " + el.scrollWidth + " > " + el.clientWidth);
  }
  const line = document.querySelector(".mem-failed");
  const ink = getComputedStyle(line).color;
  const fail = getComputedStyle(document.getElementById("ink")).color;
  document.getElementById("result").textContent = JSON.stringify({ w: ${w}, bad, ink, fail, h: line.getBoundingClientRect().height });
}
</script></body></html>`;
        writeFileSync(file, html);
        const run = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${join(dir, `profile-${w}`)}`, "--virtual-time-budget=2000", `--window-size=${w + 40},1000`, "--dump-dom", `file://${file}`], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
        const out = `${run.stdout ?? ""}`;
        const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
        if (!m) throw new Error(`Chrome drew no result at ${w} (status ${run.status}):\n${out.slice(-1200)}\n${run.stderr?.slice(-1200) ?? ""}`);
        const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { w: number; bad: string[]; ink: string; fail: string; h: number };
        expect(got.bad).toEqual([]);
        expect(got.ink).toBe(got.fail);
        expect(got.h).toBeGreaterThan(10);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}
