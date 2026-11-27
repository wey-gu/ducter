// D642: the calendar card fits a phone (320, 390, 430) and the conversation's widest column
// (1180), and its leaf and title share a top line. Rendered in headless Chrome against the real
// app.css; the static markup is the component's tree (test/cal-card.test.tsx reads the real one).
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const title = "和 Lina 对一下 HawDB 发布和这周所有市场材料";
const where = "Kong Office，12 楼东侧会议室";

const card = `<div class="partner askq"><div class="bubble ask-line"><span class="ask-words"><span class="ask-said">加到日历？</span></span></div>` +
  `<div class="cal-change create"><div class="cc-main"><span class="cal-leaf open"><span class="cal-leaf-band"><span>12 月</span><i class="cal-leaf-dot"></i></span><span class="cal-leaf-day">12</span><span class="cal-leaf-wd">周六</span></span>` +
  `<div class="cc-body"><div class="cc-title">${title}</div><div class="cc-when">12 月 12 日 周六 15:00–15:30</div><div class="cc-zone">新加坡时间 周六 14:00</div>` +
  `<div class="cc-where"><svg class="cal-pin" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.8S2.3 7.4 2.3 5.1a3.7 3.7 0 0 1 7.4 0C9.7 7.4 6 10.8 6 10.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="6" cy="5" r="1.3" fill="currentColor"/></svg><span>${where}</span></div>` +
  `<div class="cc-line in"><span class="cal-dot"></span><span class="cc-cal">主日历</span><span class="cc-whose">weyl.gu</span></div>` +
  `<div class="cc-line notify">会发邀请给 Lina Chen</div></div></div></div>` +
  `<div class="tray dk-card"><div class="dk"><div class="dk-acts"><button class="btn primary"><span class="lbl">添加到日历</span></button>` +
  `<span class="dk-quiet"><button class="btn text"><span class="lbl">暂不添加</span></button><button class="btn text"><span class="lbl">回复…</span></button></span></div></div></div></div>`;

const surface = (w: number) => `<div class="geo-col" data-width="${w}" style="width:${w}px"><div class="geo-card" data-card>${card}</div></div>`;
const page = (widths: number[], viewport: number) =>
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}
   html,body{margin:0;background:var(--bg);} .geo-col{margin:0 0 24px;} .geo-card{width:100%;}
  </style></head><body>${widths.map(surface).join("")}<pre id="result"></pre><script>
  {
    const bad = [];
    for (const col of document.querySelectorAll(".geo-col")) {
      const w = Number(col.dataset.width);
      const card = col.querySelector(".cal-change");
      if (!card) { bad.push({ w, why: "no card" }); continue; }
      const box = card.getBoundingClientRect();
      const phone = col.getBoundingClientRect();
      if (card.scrollWidth > card.clientWidth + 1) bad.push({ w, why: "card scrollWidth " + card.scrollWidth + " > " + card.clientWidth });
      if (box.right > phone.right + 1 || box.left < phone.left - 1) bad.push({ w, why: "card " + box.left.toFixed(1) + ".." + box.right.toFixed(1) + " outside " + phone.left.toFixed(1) + ".." + phone.right.toFixed(1) });
      for (const el of card.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) bad.push({ w, why: el.className + " outside the card" });
      }
      const leaf = card.querySelector(".cal-leaf").getBoundingClientRect();
      const title = card.querySelector(".cc-title").getBoundingClientRect();
      if (Math.abs(leaf.top - title.top) > 4) bad.push({ w, why: "leaf top " + leaf.top.toFixed(1) + " vs title top " + title.top.toFixed(1) });
      if (title.left < leaf.right + 8) bad.push({ w, why: "title left " + title.left.toFixed(1) + " vs leaf right " + leaf.right.toFixed(1) });
      if (title.width < 120) bad.push({ w, why: "title only " + title.width.toFixed(1) + " wide" });
      if (w === 1180 && box.width > 620) bad.push({ w, why: "card wider than the conversation's measure: " + box.width });
    }
    document.getElementById("result").textContent = JSON.stringify({ widths: [...document.querySelectorAll(".geo-col")].map((c) => Number(c.dataset.width)), viewport: ${viewport}, bad });
  }
  </script></body></html>`;

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
  ].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  return undefined;
}

const browser = chrome();
const run = (widths: number[], viewport: number) => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-cal-geometry-"));
  const file = join(dir, "cal.html");
  const profile = join(dir, "profile");
  try {
    writeFileSync(file, page(widths, viewport));
    const r = spawnSync(browser!, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--user-data-dir=" + profile, "--window-size=" + viewport + ",1600",
      "--virtual-time-budget=2000", "--dump-dom", "file://" + file,
    ], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(r.stdout ?? "");
    if (!m) throw new Error(`Chrome drew no result: ${(r.stderr ?? "").slice(-800)}`);
    return JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { widths: number[]; viewport: number; bad: { w: number; why: string }[] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

if (!browser) {
  test.skip("the calendar card fits its widths (no Chrome or Chromium here)", () => {});
} else {
  describe("the calendar card's geometry (D642)", () => {
    test("320, 390 and 430: no overflow, the leaf and title on one top line", () => {
      const got = run([320, 390, 430], 500);
      expect(got.widths).toEqual([320, 390, 430]);
      expect(got.bad).toEqual([]);
    });
    test("1180: the conversation's widest column, still one card", () => {
      const got = run([1180], 1180);
      expect(got.widths).toEqual([1180]);
      expect(got.bad).toEqual([]);
    });
  });
}
