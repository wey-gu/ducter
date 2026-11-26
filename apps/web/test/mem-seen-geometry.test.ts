// D617: the recalled line under the brief fits at 390 (a phone) and 1150 (a laptop): the
// one muted line, the unfolded list, a long memory title and 这条不对 all stay inside the column,
// and nothing scrolls sideways. Rendered under the real app.css in headless Chrome; the Mac has
// the same check at 1150 (mem_seen_test.go).
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const found = Bun.which(n);
    if (found) return found;
  }
  return undefined;
}

const LONG = "A very long memory title that should wrap inside the column and never run past the page at three hundred and ninety pixels wide";
const TITLE = (s: string) => `<span class="lbl">${s}</span>`;
const chev = `<svg class="chev-g btn-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const row = (title: string) =>
  `<div class="recalled-row"><button class="tlink recalled-title" type="button">${title}${chev}</button>` +
  `<button class="btn text sm recalled-wrong" type="button"><span class="lbl">这条不对</span></button></div>`;

const page = (w: number) =>
  `<div class="recalled-page" data-width="${w}" style="width:${w}px">` +
  `<section class="brief"><small>你交给它的事</small><div class="brief-text">Make the scheduler test stable.</div></section>` +
  `<div class="recalled"><button class="btn text sm recalled-toggle" type="button" aria-expanded="true"><span class="lbl">带进来 2 条记忆</span>${chev}</button>` +
  `<div class="recalled-list">${row("测试统一用假时钟")}${row(LONG)}</div></div></div>`;

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body>` +
  [390, 1150].map(page).join("") +
  `<pre id="result"></pre><script>
{
  const bad = [];
  for (const p of document.querySelectorAll(".recalled-page")) {
    const box = p.getBoundingClientRect();
    for (const el of p.querySelectorAll(".recalled, .recalled-toggle, .recalled-list, .recalled-row, .recalled-title, .recalled-wrong")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1))
        bad.push({ w: p.dataset.width, why: el.className + " right " + r.right.toFixed(1) + " vs " + box.right.toFixed(1) });
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        bad.push({ w: p.dataset.width, why: el.className + " scrollWidth " + el.scrollWidth + " > " + el.clientWidth });
    }
    const headEl = p.querySelector(".recalled-toggle");
    const head = headEl.getBoundingClientRect();
    const headText = head.left + (parseFloat(getComputedStyle(headEl).paddingLeft) || 0);
    const list = p.querySelector(".recalled-list").getBoundingClientRect();
    const titles = [...p.querySelectorAll(".recalled-title")].map((e) => e.getBoundingClientRect());
    const wrongs = [...p.querySelectorAll(".recalled-wrong")].map((e) => e.getBoundingClientRect());
    if (Math.abs(headText - titles[0].left) > 1)
      bad.push({ w: p.dataset.width, why: "head text " + headText.toFixed(1) + " vs row text " + titles[0].left.toFixed(1) });
    if (wrongs.length > 1 && Math.abs(wrongs[0].left - wrongs[1].left) > 1)
      bad.push({ w: p.dataset.width, why: "wrong actions not one column: " + wrongs[0].left.toFixed(1) + " vs " + wrongs[1].left.toFixed(1) });
    for (const w of wrongs) if (Math.abs(w.right - list.right) > 1)
      bad.push({ w: p.dataset.width, why: "wrong action not at the row edge: " + w.right.toFixed(1) + " vs " + list.right.toFixed(1) });
    for (const t of titles) if (t.right > wrongs[0].left + 1)
      bad.push({ w: p.dataset.width, why: "title runs into the action column: " + t.right.toFixed(1) + " vs " + wrongs[0].left.toFixed(1) });
  }
  document.getElementById("result").textContent = JSON.stringify({ widths: [...document.querySelectorAll(".recalled-page")].map((p) => p.dataset.width), bad });
}
</script></body></html>`;

test("the action is the muted quiet style, and the head and rows start on one edge", () => {
  const block = (sel: string) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(css)?.[1] ?? "";
  expect(block(".recalled-wrong")).toMatch(/color:\s*var\(--ink-muted\)/);
  expect(block(".recalled-wrong")).toMatch(/justify-self:\s*end/);
  expect(block(".recalled .recalled-toggle.btn")).toMatch(/padding-left:\s*0/);
  expect(block(".recalled-list")).toMatch(/padding:\s*0/);
  expect(block(".recalled-title")).toMatch(/overflow-wrap:\s*anywhere/);
});

const browser = chrome();
if (!browser) {
  test.skip("the recalled line fits 390 and 1150 (no Chrome or Chromium here)", () => {});
} else {
  test("the recalled line fits 390 and 1150 (rendered in Chrome)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-mem-seen-"));
    const file = join(dir, "mem-seen.html");
    const profile = join(dir, "profile");
    try {
      writeFileSync(file, html);
      const run = spawnSync(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-crash-reporter",
          "--no-first-run",
          "--no-default-browser-check",
          "--hide-scrollbars",
          `--user-data-dir=${profile}`,
          "--virtual-time-budget=2000",
          "--window-size=500,1200",
          "--dump-dom",
          `file://${file}`,
        ],
        { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 },
      );
      const out = `${run.stdout ?? ""}`;
      const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
      if (!m) throw new Error(`Chrome drew no result (status ${run.status}):\n${out.slice(-1200)}\n${run.stderr?.slice(-1200) ?? ""}`);
      const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { widths: string[]; bad: { w: string; why: string }[] };
      expect(got.widths).toEqual(["390", "1150"]);
      expect(got.bad).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
