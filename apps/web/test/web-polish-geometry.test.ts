// D636: the eight web polish fixes' three layout guards. The source row's one button keeps its
// whole label and stands in the row's trailing column (under the words on their left edge when the
// row stacks); the rail beside an opened task gives its title the room first (no diff counts or time
// on that line); the whole-screen task bar gives its title 9 em before any secondary mark and folds
// the crumbs first. Rendered under the real app.css in headless Chrome, as ask-geometry does.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sourceRow = (title: string, action: string) => `
  <div class="ocard src-sum">
    <span class="omain static">
      <span class="omark k-src" aria-hidden="true"><span class="todo-mark"></span></span>
      <span class="otx"><span class="o1"><span class="t offer">${esc(title)}</span></span></span>
    </span>
    <span class="ocol"><span class="oacts on"><button type="button" class="btn secondary sm"><span class="lbl">${esc(action)}</span></button></span></span>
  </div>`;

const railRow = `
  <div class="trows"><div class="trow a-blocked${""}">
    <a class="tmain task-link" href="#">
      <span class="l1">
        <span class="partner-mark" aria-hidden="true"><span class="pface"><span class="peb"></span></span></span>
        <span class="t">跟进 PR #11166 的评审意见，把 CI 和两处类型错误一起修掉</span>
        <span class="stat"><i class="add">+88</i><i class="del">−21</i></span>
        <span class="time">4 分钟前</span>
        <span class="sface" aria-hidden="true"><span class="sring"></span></span>
      </span>
      <span class="l2"><span class="w">等 PR #11166 的 CI 跑完</span></span>
    </a>
  </div></div>`;

const header = (w: number) => `
  <header class="top crumbs" data-w="${w}" style="width:${w}px">
    <button class="back crumb-up"><span>任务</span></button>
    <nav class="trail" aria-label="任务">
      <button class="crumb">对话</button><span class="slash">/</span>
      <button class="crumb">任务</button><span class="slash">/</span>
      <h1 class="here">修复设置页的 OpenAI 自定义 Base URL 与模型切换后保存不生效</h1>
    </nav>
    <span class="acts">
      <span class="tv-nav"><button class="tv-step">‹</button><span class="tv-pos"><b>10</b><span>/</span><span>15</span></span><button class="tv-step">›</button></span>
      <span class="info-anchor"><button class="info-btn"><span class="info-label">ducter/settings-base-url</span><span class="chev-g"></span></button></span>
      <button class="bench-toggle" aria-label="工作台"></button>
      <button class="tv-act share-btn" aria-label="分享"></button>
      <span class="more-menu"><button class="plus more-btn" aria-label="更多">⋯</button></span>
      <button class="plus fill" aria-label="铺满"></button>
      <span class="places" style="width:112px;height:34px"></span>
    </span>
  </header>`;

const probe = (kind: string, w: number) =>
  kind === "rail"
    ? `<div class="onhand-list room-rail" data-kind="rail" data-w="${w}" style="width:${w}px">${railRow}</div>`
    : kind === "header"
      ? header(w)
      : `<div class="onhand-list room-${kind}" data-kind="${kind}" data-w="${w}" style="width:${w}px">
           <div class="ocards src-sheet">${sourceRow("里面有 51 个我能直接做，先挑几个交给我吧。", "挑几个交给我")}${sourceRow("1 个 PR 等你 review", "去看看")}</div>
         </div>`;

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body>
  ${probe("full", 760)}
  ${probe("side", 527)}
  ${probe("phone", 390)}
  ${probe("rail", 300)}
  ${header(1440)}
  ${header(1000)}
  <pre id="result"></pre>
  <script>
  {
    const bad = [];
    for (const root of document.querySelectorAll(".onhand-list[data-kind]")) {
      const kind = root.dataset.kind, w = Number(root.dataset.w);
      if (kind === "rail") {
        const t = root.querySelector(".trow .l1 .t");
        const stat = root.querySelector(".trow .l1 .stat");
        const time = root.querySelector(".trow .l1 .time");
        if (!t) bad.push({ kind, w, why: "no title" });
        else if (t.getBoundingClientRect().width < 120) bad.push({ kind, w, why: "title only " + t.getBoundingClientRect().width.toFixed(1) + " wide" });
        if (stat && getComputedStyle(stat).display !== "none") bad.push({ kind, w, why: "diff counts still on the rail line" });
        if (time && getComputedStyle(time).display !== "none") bad.push({ kind, w, why: "time still on the rail line" });
        continue;
      }
      for (const card of root.querySelectorAll(".ocard")) {
        const btn = card.querySelector(".btn");
        const lbl = btn && btn.querySelector(".lbl");
        const box = btn && btn.getBoundingClientRect();
        const otx = card.querySelector(".otx").getBoundingClientRect();
        if (!btn || !lbl) { bad.push({ kind, w, why: "no action" }); continue; }
        if (lbl.scrollWidth > lbl.clientWidth + 1) bad.push({ kind, w, why: "label cut: " + lbl.scrollWidth + " > " + lbl.clientWidth });
        if (box.right > card.getBoundingClientRect().right + 1) bad.push({ kind, w, why: "button past the card" });
        if (kind === "full") {
          if (box.left < card.querySelector(".omain").getBoundingClientRect().right - 1) bad.push({ kind, w, why: "button at " + box.left.toFixed(1) + ", omain right " + card.querySelector(".omain").getBoundingClientRect().right.toFixed(1) + ", col " + getComputedStyle(card.querySelector(".ocol")).position + " " + getComputedStyle(card.querySelector(".ocol")).width });
        } else if (Math.abs(box.left - otx.left) > 3) {
          bad.push({ kind, w, why: "button at " + box.left.toFixed(1) + ", text at " + otx.left.toFixed(1) });
        }
      }
    }
    for (const top of document.querySelectorAll(".top.crumbs[data-w]")) {
      const w = Number(top.dataset.w);
      const here = top.querySelector(".here");
      const acts = top.querySelector(".acts");
      const h = here.getBoundingClientRect(), a = acts.getBoundingClientRect();
      if (h.width < 110) bad.push({ kind: "header", w, why: "title only " + h.width.toFixed(1) + " wide" });
      if (a.left < h.right - 1) bad.push({ kind: "header", w, why: "actions over the title" });
      const shown = (sel) => { const e = top.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
      if (w === 1000) {
        if (shown(".trail > .crumb")) bad.push({ kind: "header", w, why: "crumbs still take the title's room" });
        if (shown(".bench-toggle")) bad.push({ kind: "header", w, why: "the workbench mark still on the bar" });
        if (!shown(".fill")) bad.push({ kind: "header", w, why: "the fill (the way back beside) is gone" });
        if (shown(".info-label")) bad.push({ kind: "header", w, why: "branch label still on the bar" });
      } else {
        if (!shown(".trail > .crumb")) bad.push({ kind: "header", w, why: "crumbs gone at 1440" });
        if (!shown(".bench-toggle") || !shown(".fill")) bad.push({ kind: "header", w, why: "secondary marks gone at 1440" });
      }
    }
    document.getElementById("result").textContent = JSON.stringify({ bad });
  }
  </script></body></html>`;

/** Chrome or Chromium, wherever this machine keeps it (the composer-geometry pattern). */
function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  return undefined;
}

describe("web polish geometry", () => {
  test("the source row's action keeps its label in the trailing column or under the text", () => {
    expect(css).toMatch(/\.ocard \.ocol \.btn > \.lbl \{[^}]*overflow: visible/);
    expect(css).toMatch(/\.onhand-list\.room-side \.ocard\.src-sum \.ocol,?[\s\S]*?padding: 0 16px 14px 52px/);
  });

  test("the rail row gives its title the line, and the bar gives its title 9 em", () => {
    expect(css).toMatch(/\.room-rail \.trow \.l1 \.stat,[\s\S]*?\.room-rail \.trow \.l1 \.time \{[^}]*display: none/);
    expect(css).toMatch(/\.top\.crumbs \.here \{[^}]*min-width: 9em/);
  });

  const browser = chrome();
  if (!browser) {
    test.skip("the rows render at 1440 and 390 (no Chrome or Chromium here)", () => {});
  } else {
    test("the rows render at 1440 and 390 with no cut label and a title's room (Chrome)", () => {
      const dir = mkdtempSync(join(tmpdir(), "ducter-polish-geometry-"));
      const file = join(dir, "polish.html");
      const profile = join(dir, "profile");
      try {
        writeFileSync(file, html);
        const run = spawnSync(
          browser,
          ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${profile}`, "--virtual-time-budget=2000", "--window-size=1500,1200", "--dump-dom", `file://${file}`],
          { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 },
        );
        const out = `${run.stdout ?? ""}`;
        const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
        if (!m) throw new Error(`Chrome drew no result (status ${run.status}):\n${out.slice(-800)}\n${run.stderr?.slice(-800) ?? ""}`);
        const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { bad: { kind: string; w: number; why: string }[] };
        expect(got.bad).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 30_000);
  }
});
