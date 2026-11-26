// D609: the sender's line and 手上的事 fit at 390 and 1150. A long title and a long why wrap; no
// row, group or line runs past its card. The CSS checks keep it readable without Chrome; with
// Chrome, the real app.css lays the markup out and scrollWidth/clientWidth are read back.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

function blocks(selector: string): string[] {
  const out: string[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const items = m[1]!.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (items.includes(selector)) out.push(m[2]!);
  }
  return out;
}
const decl = (selector: string) => blocks(selector).join(";");

describe("D609: the hand-off line and 手上的事 wrap", () => {
  test("the sender's line wraps a long token on the transcript's measure", () => {
    const line = decl(".task-page > .handoff-line");
    expect(line).toMatch(/max-width:\s*37\.5rem/);
    expect(line).toMatch(/overflow-wrap:\s*anywhere/);
  });

  test("a Keep's item title wraps in its column, never under the actions", () => {
    expect(decl(".kp-item")).toMatch(/grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto/);
    expect(decl(".kp-item .t")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(decl(".kp-item .body")).toMatch(/min-width:\s*0/);
  });

  test("a group's facts are separate elements that wrap", () => {
    expect(decl(".facts")).toMatch(/flex-wrap:\s*wrap/);
    expect(decl(".kp-handoff-facts")).toMatch(/font-size:\s*var\(--sm\)/);
  });
});

// ---- the rendered geometry: 390 and 1150, the real app.css ----

const LONG = "长标题".repeat(40) + " " + "a".repeat(160);
const WHY = "退回的原因：".repeat(20) + "b".repeat(80);
const item = (state: string, title = LONG, why = "") => {
  const acts = state === "given"
    ? `<button type="button" class="btn text sm"><span class="lbl">让它现在接</span></button><button type="button" class="btn text sm"><span class="lbl">不用跟了</span></button>`
    : `<button type="button" class="btn text sm"><span class="lbl">打开任务</span></button><button type="button" class="btn text sm"><span class="lbl">不用跟了</span></button>`;
  return `<div class="kp-item"><i class="kp-dot big work" aria-hidden="true"></i><span class="body">` +
    `<span class="t"><b>#11393</b><span>${title}</span></span>` +
    (why ? `<span class="st">${why}</span>` : `<span class="facts kp-handoff-facts"><span>Ducter 的任务「官网」</span><span>11 月 26 日 16:31</span></span>`) +
    `</span><span class="acts">${acts}</span></div>`;
};
const group = (head: string, rows: string) => `<h2 class="sec-head"><span class="nm">${head}</span></h2>${rows}`;
const keep = (w: number) =>
  `<div class="kp-page${w > 700 ? " wide" : ""}" data-w="${w}" style="width:${w}px"><div class="kp-main">` +
  `<h2 class="sec-head"><span class="nm">手上的事</span></h2>` +
  `<div class="kp-card kp-handoffs">` +
  group("等接手", item("given")) +
  group("在做", item("taken")) +
  group("退回了", item("returned", LONG, WHY)) +
  group("没接", item("declined", LONG, WHY)) +
  `</div></div>`;
const task = (w: number) =>
  `<div class="task-page" data-w="${w}" style="width:${w}px"><p class="handoff-line returned">PR Babysitter 退回了：${WHY}</p></div>`;

function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  for (const n of ["google-chrome", "chromium"]) {
    const found = Bun.which(n);
    if (found) return found;
  }
  return undefined;
}

const browser = chrome();
if (!browser) {
  test.skip("the hand-off line and 手上的事 fit 390 and 1150 (no Chrome here)", () => {});
} else {
  test("the hand-off line and 手上的事 fit 390 and 1150 (rendered in Chrome)", () => {
    for (const w of [390, 1150]) {
      const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0">` +
        task(w) + keep(w) +
        `<pre id="result"></pre><script>
{
  const bad = [];
  const pages = [...document.querySelectorAll("[data-w]")];
  for (const page of pages) {
    const box = page.getBoundingClientRect();
    if (page.scrollWidth > page.clientWidth + 1) bad.push({ w: page.dataset.w, what: page.className, why: "scrollWidth " + page.scrollWidth + " > " + page.clientWidth });
    for (const el of page.querySelectorAll(".kp-item, .handoff-line, .kp-card, .kp-hgroup")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) bad.push({ w: page.dataset.w, what: el.className, why: el.tagName + " " + r.left.toFixed(1) + ".." + r.right.toFixed(1) + " vs " + box.left.toFixed(1) + ".." + box.right.toFixed(1) });
    }
    for (const el of page.querySelectorAll(".kp-item, .handoff-line")) {
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) bad.push({ w: page.dataset.w, what: el.className, why: "scrollWidth " + el.scrollWidth + " > " + el.clientWidth });
    }
  }
  document.getElementById("result").textContent = JSON.stringify({ w: ${w}, bad });
}
</script></body></html>`;
      const dir = mkdtempSync(join(tmpdir(), "ducter-handoff-geometry-"));
      const file = join(dir, "handoff.html");
      try {
        writeFileSync(file, html);
        const run = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=2000", `--window-size=${w},1400`, "--dump-dom", `file://${file}`], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
        const out = `${run.stdout ?? ""}`;
        const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
        if (!m) throw new Error(`Chrome drew no result at ${w} (status ${run.status}):\n${out.slice(-1200)}\n${run.stderr?.slice(-1200) ?? ""}`);
        const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { w: number; bad: unknown[] };
        expect(got.bad).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
}
