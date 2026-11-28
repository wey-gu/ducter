// D674 (research/247 Brief B): the shadow's review card on the web. Its words are the Mac's,
// zh and en, never joined with " · " and never picked inline by language; the line rides in the
// morning note's foot and fades; the rows keep their places while the sheet is open; and a row, laid
// out by the real app.css in headless Chrome at 320, 390 and 1180, spills nothing and keeps its
// three answers inside it. The Mac's: apps/desktop/internal/views/shadow_test.go.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shadowWords } from "../src/i18n-shadow.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("the review's words and wiring", () => {
  test("every word in zh and en, the same on the Mac, none joined", () => {
    const go = read("../desktop/internal/i18n/shadow.go");
    expect(Object.keys(shadowWords.zh).sort()).toEqual(Object.keys(shadowWords.en).sort());
    for (const lang of ["zh", "en"] as const)
      for (const [k, w] of Object.entries(shadowWords[lang])) {
        expect(go, `Go ${k}`).toContain(`${JSON.stringify(k)}:`);
        expect(go, `Go ${lang} ${k}`).toContain(JSON.stringify(w).slice(1, -1));
        expect(w).not.toContain(" · ");
      }
    expect(shadowWords.zh["shadow.yes"]).toBe("应该早说");
    expect(shadowWords.zh["shadow.no"]).toBe("不该说");
    expect(shadowWords.zh["shadow.stop"]).toBe("这类以后都别标");
    expect(shadowWords.en["shadow.yes"]).toBe("Should have said it");
    expect(shadowWords.en["shadow.no"]).toBe("Shouldn't have said it");
    expect(shadowWords.en["shadow.stop"]).toBe("Stop asking about this kind");
  });

  test("the sheet uses only shared controls and table words; the line sits in the note's foot and fades", () => {
    const src = read("src/shadow-review.tsx");
    expect(src).not.toMatch(/lang === "zh"|\.lang === /);
    expect(src).not.toMatch(/<button(?! class="past-x")/); // the shared Btn, apart from the sheet's own close (as 这周记下的)
    expect(src).toContain('A.send({ t: "shadow_label", findingId: i.id, verdict: a })');
    expect(src).toMatch(/Date\.parse\(until\) > Date\.now\(\)/);
    // The rows keep their places while open: a verdict never moves the row away.
    expect(src).toMatch(/was\.get\(a\.id\)/);
    const finds = read("src/finds.tsx");
    expect(finds).toMatch(/<div class="note-foot">\s*\{n\.shadowReview && n\.shadowReview\.count > 0 && <ShadowLine/);
    expect(read("src/views.tsx")).toContain('if (A.sheet.kind === "shadow") return <ShadowSheet />;');
  });
});

// ---------- geometry: the row under the real app.css ----------

const css = read("static/app.css");
const row = (lang: "zh" | "en", settled: boolean) => {
  const w = lang === "zh"
    ? { t: "12 月 3 日 MU 523 下午落地大阪关西，那晚订的涩谷酒店在东京，从机场过去要三个多小时。", next: "我会先：看看酒店能不能改到 12 月 4 日", src: "邮件", yes: "应该早说", no: "不该说", stop: "这类以后都别标", got: "好，这种该早点说。", change: "改", when: "昨天" }
    : { t: "MU 523 lands at Osaka Kansai on the afternoon of Dec 3, but that night's hotel is in Shibuya, Tokyo, over three hours away.", next: "I'd start with: see if the hotel can move to Dec 4", src: "Mail", yes: "Should have said it", no: "Shouldn't have said it", stop: "Stop asking about this kind", got: "Got it: worth saying sooner.", change: "Change", when: "yesterday" };
  const fact = (label: string, from: string) => `<li class="shadow-fact"><span class="shadow-src">${w.src}</span><span class="facts shadow-fact-words"><span>${label}</span><span>${from}</span></span></li>`;
  const acts = settled
    ? `<div class="shadow-acts done"><span class="shadow-got">${w.got}</span><button class="btn text sm"><span class="lbl">${w.change}</span></button></div>`
    : `<div class="shadow-acts"><button class="btn secondary sm"><span class="lbl">${w.yes}</span></button><button class="btn text sm"><span class="lbl">${w.no}</span></button><button class="btn text sm shadow-stop"><span class="lbl">${w.stop}</span></button></div>`;
  return `<div class="shadow-row${settled ? " settled" : ""}"><p class="shadow-t">${w.t}</p><p class="shadow-next">${w.next}</p><ul class="shadow-facts">${fact("Flight confirmation MU523 Shanghai–Osaka", "China Eastern")}${fact("Reservation confirmed: Shibuya Stream Excel Hotel", "Hotels.com")}</ul><div class="shadow-foot"><span class="facts shadow-when"><span>${w.when}</span></span>${acts}</div></div>`;
};
const page = (w: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${w}"><style>${css} html,body{margin:0;background:var(--bg);}</style></head><body>` +
  `<div class="learned-list shadow-list" style="width:${w < 640 ? w - 32 : 544}px;padding:0 16px">${row("zh", false)}${row("en", false)}${row("zh", true)}${row("en", true)}</div><pre id="result"></pre><script>
  {
    const bad = [];
    for (const r of document.querySelectorAll(".shadow-row")) {
      const rb = r.getBoundingClientRect();
      for (const c of r.querySelectorAll("*")) {
        const cb = c.getBoundingClientRect();
        if (cb.width && (cb.right > rb.right + 0.5 || cb.left < rb.left - 0.5)) bad.push((c.className || c.tagName) + " spills its row");
      }
      for (const b of r.querySelectorAll(".btn .lbl")) if (b.scrollWidth > b.clientWidth + 1) bad.push("clipped: " + b.textContent);
      // The answer comes first in reading order, and on a phone it leads its row.
      const yes = r.querySelector(".btn.secondary");
      if (yes && innerWidth < 640 && yes.getBoundingClientRect().left > rb.left + 40) bad.push("the answer doesn't lead its row");
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) bad.push("the page scrolls sideways");
    document.getElementById("result").textContent = JSON.stringify({ bad });
  }
  </script></body></html>`;

function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  return undefined;
}

const browser = chrome();
(browser ? describe : describe.skip)("a review row under the real app.css", () => {
  for (const w of [320, 390, 1180])
    test(`at ${w}: nothing spills, no label clipped, no sideways scroll`, () => {
      const dir = mkdtempSync(join(tmpdir(), "ducter-shadow-geometry-"));
      const file = join(dir, "shadow.html");
      try {
        writeFileSync(file, page(w));
        const run = spawnSync(browser!, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=2000", `--window-size=${w},1400`, "--dump-dom", `file://${file}`], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
        const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(`${run.stdout ?? ""}`);
        if (!m) throw new Error(`Chrome drew no result (status ${run.status})`);
        const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')) as { bad: string[] };
        expect(got.bad).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
});
