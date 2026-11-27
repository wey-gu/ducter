// D646: a Mem problem is a title and a line (never a bold sentence with a newline), and its
// one action stays at the row's edge on a phone (390) and a laptop (1000): nothing runs past the
// card, the words keep a real column, and the action never sits on top of them.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  for (const p of [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ]) {
    if (p && existsSync(p)) return p;
  }
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const found = Bun.which(n);
    if (found) return found;
  }
  return undefined;
}

const TITLE = "Nowledge Mem 那边暂时接不了";
const LINE = "不是你这边的问题，记忆照常能用。过一阵再点「再试一次」，不会多出一个连接。";
const row = (w: number) =>
  `<div class="set-page pushed" data-width="${w}" style="width:${w}px">` +
  `<section class="set-card chat-app g-group"><div class="chat-row tiled">` +
  `<span class="g-tile"></span>` +
  `<span class="grow"><b>${TITLE}</b><small>${LINE}</small></span>` +
  `<button type="button" class="btn secondary sm"><span class="lbl">再看一次</span></button>` +
  `</div></section></div>`;

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body>` +
  [390, 1000].map(row).join("") +
  `<pre id="result"></pre><script>
{
  const bad = [];
  for (const page of document.querySelectorAll(".set-page")) {
    const box = page.getBoundingClientRect();
    const card = page.querySelector(".chat-row");
    if (card.scrollWidth > card.clientWidth + 1) bad.push({ w: page.dataset.width, why: "row scrolls " + card.scrollWidth + " > " + card.clientWidth });
    const words = page.querySelector(".grow").getBoundingClientRect();
    const btn = page.querySelector(".btn").getBoundingClientRect();
    const b = page.querySelector("b").getBoundingClientRect();
    const small = page.querySelector("small").getBoundingClientRect();
    if (words.width < 120) bad.push({ w: page.dataset.width, why: "words squeezed to " + words.width });
    if (btn.left < words.right - 1) bad.push({ w: page.dataset.width, why: "action over the words" });
    if (btn.right > box.right + 1) bad.push({ w: page.dataset.width, why: "action past the card" });
    if (!b.height || !small.height || small.top < b.bottom - 1) bad.push({ w: page.dataset.width, why: "title and line not one above the other" });
    if (small.width < 120) bad.push({ w: page.dataset.width, why: "line squeezed to " + small.width });
  }
  document.getElementById("result").textContent = JSON.stringify({ widths: [...document.querySelectorAll(".set-page")].map((p) => p.dataset.width), bad });
}
</script></body></html>`;

const browser = chrome();
if (!browser) {
  test.skip("a Mem problem fits 390 and 1000 (no Chrome or Chromium here)", () => {});
} else {
  test("a Mem problem fits 390 and 1000 (rendered in Chrome)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-mem-state-"));
    const file = join(dir, "mem-state.html");
    const profile = join(dir, "profile");
    try {
      writeFileSync(file, html);
      const run = spawnSync(
        browser,
        ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${profile}`, "--virtual-time-budget=2000", "--window-size=1100,900", "--dump-dom", `file://${file}`],
        { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 },
      );
      const out = `${run.stdout ?? ""}`;
      const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
      if (!m) throw new Error(`Chrome drew no result (status ${run.status}):\n${out.slice(-1200)}\n${run.stderr?.slice(-1200) ?? ""}`);
      const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { widths: string[]; bad: { w: string; why: string }[] };
      expect(got.widths).toEqual(["390", "1000"]);
      expect(got.bad).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
