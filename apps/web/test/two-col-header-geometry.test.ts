// D635: the two-column / mobile header. At every width a person meets it (a fold's halves,
// an iPad in Split View, an iPad held either way, a large phone across), the bar is one line:
// one leading way up, one ⋯ for the task's own actions, one fill, and the places as one button.
// No action control is under 44 x 44, and nothing wraps. The real app's branching is checked in
// full-screen-header.test.tsx; this renders the same classes against the real CSS in Chrome.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

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

const conv = `<span class="rail-toggle"><button class="icon-btn" data-44 aria-label="partners rail">…</button></span>
<button class="who-face" data-44 aria-label="partner"></button>
<span class="who"><button class="name" aria-label="partner">Ducter</button><button class="sum" aria-label="needs you">4 needs you</button></span>
<span class="places-menu"><button class="places-btn" data-44 aria-label="places"></button></span>`;
const task = `<button class="back" data-44 aria-label="Tasks"><svg width="16" height="16" aria-hidden="true"></svg>任务</button><span style="flex:1"></span>
<span class="more-menu task-more"><button class="more-btn" data-44 aria-label="More">⋯</button></span>
<button class="plus fill" data-44 aria-label="Fill"></button>`;
const tasksFull = `<button class="crumb" data-44>对话</button><span class="slash">/</span><h1 class="here">任务</h1>
<span class="acts"><button class="btn secondary sm nav" data-44>新建</button><button class="plus fill" data-44 aria-label="Fill"></button>
<span class="places-menu"><button class="places-btn" data-44 aria-label="places"></button></span></span>`;
const taskFull = `<button class="crumb" data-44>对话</button><span class="slash">/</span><button class="crumb" data-44>任务</button><span class="slash">/</span><h1 class="here">Fix the flaky test</h1>
<span class="acts"><span class="more-menu task-more"><button class="more-btn" data-44 aria-label="More">⋯</button></span><button class="plus fill" data-44 aria-label="Back beside"></button>
<span class="places-menu"><button class="places-btn" data-44 aria-label="places"></button></span></span>`;
// D544: under 720 only the way up is drawn (the container query on .top); above it, the trail.
const fullTask = (narrow: boolean) => `<header class="top crumbs">${narrow ? `<button class="back crumb-up" data-44 aria-label="Tasks"><svg width="16" height="16" aria-hidden="true"></svg>任务</button>` : taskFull}</header>`;
const fullTasks = (narrow: boolean) => `<header class="top crumbs">${narrow ? `<button class="back crumb-up" data-44 aria-label="Tasks"><svg width="16" height="16" aria-hidden="true"></svg>任务</button>` : tasksFull}</header>`;

const widths = [339, 420, 472, 507, 678, 841, 981, 1024, 1180];
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0">
${widths.map((w) => `<div class="canvas" data-w="${w}" style="width:${w}px;margin:0 0 12px">
<header class="top">${conv}</header>
<header class="top">${task}</header>
${fullTasks(w < 720)}
${fullTask(w < 720)}
</div>`).join("\n")}
<pre id="result"></pre><script>
{
  const bad = [];
  for (const c of document.querySelectorAll(".canvas")) {
    const w = Number(c.dataset.w);
    for (const top of c.querySelectorAll(".top")) {
      if (top.scrollWidth > top.clientWidth + 1) bad.push({ w, what: "overflow", scroll: top.scrollWidth, client: top.clientWidth, cls: top.className });
      const h = Math.round(top.getBoundingClientRect().height);
      if (h !== 60) bad.push({ w, what: "height", h, cls: top.className });
      for (const el of top.querySelectorAll("[data-44]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) bad.push({ w, what: "small", cls: String(el.className), wd: Math.round(r.width), ht: Math.round(r.height), label: el.getAttribute("aria-label") });
      }
      if (top.querySelector(".tv-step, .info-btn, .bench-toggle, .share-btn, .place")) bad.push({ w, what: "an old row icon", cls: top.className });
      if (top.querySelectorAll(".task-more").length > 1) bad.push({ w, what: "two task menus" });
    }
  }
  document.getElementById("result").textContent = JSON.stringify({ bad });
}
</script></body></html>`;

const browser = chrome();
if (!browser) {
  test.skip("the two-column header fits every width (no Chrome or Chromium here)", () => {});
} else {
  test("one leading way up, one ⋯, one fill, one places button; 44 x 44; never wraps", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-two-col-"));
    const file = join(dir, "headers.html");
    try {
      writeFileSync(file, html);
      const run = spawnSync(
        browser,
        ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=2000", "--window-size=1400,1400", "--dump-dom", `file://${file}`],
        { encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
      );
      const out = `${run.stdout ?? ""}`;
      const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
      if (!m) throw new Error(`Chrome drew no result (status ${run.status}): ${out.slice(-800)} ${run.stderr?.slice(-800) ?? ""}`);
      const got = JSON.parse(m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      expect(got.bad).toEqual([]);
      expect(css).toContain(".top .task-more .more-btn {");
      expect(css).toMatch(/\.top \.task-more \.more-btn \{[^}]*width: 44px;/);
      expect(css).toMatch(/\.top \.task-more \.more-btn \{[^}]*height: 44px;/);
      expect(css).toMatch(/\.top \.btn\.sm\.nav \{[^}]*height: 44px;/);
      expect(css).toMatch(/\.top \.rail-toggle \.icon-btn \{[^}]*width: 44px;[^}]*height: 44px;/);
      expect(css).toMatch(/\.top \.who-face \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
      expect(css).toMatch(/\.top\.crumbs \.crumb \{[^}]*min-width: 44px;/);
      expect(css).toMatch(/\.top \.task-menu \[role\^="menuitem"\] \{[^}]*min-height: 44px;/);
      expect(css).toMatch(/\.top \{[^}]*flex-wrap: nowrap;/);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }, 90_000);
}

describe("the places and the task actions choose the compact form", () => {
  const views = readFileSync(join(import.meta.dir, "../src/views.tsx"), "utf8");
  test("the task's secondary actions are in the one ⋯ menu, not a row of icons", () => {
    expect(views).toContain("<TaskMenu task={task} state={stateSentence} />");
    expect(views).not.toContain("TaskNav");
    expect(views).not.toContain("TaskInfoButton");
    expect(views).not.toContain("BenchToggle");
    expect(views).not.toContain("TaskMore");
  });
  test("places are one button on a touch screen or a phone-class width", () => {
    expect(views).toContain('const small = useRoomy("(max-width: 999px)");');
    expect(views).toContain('const touch = useRoomy("(any-pointer: coarse)");');
    expect(views).toContain("if (narrow || small || touch) {");
  });
});
