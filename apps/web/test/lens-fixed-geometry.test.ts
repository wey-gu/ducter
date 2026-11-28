// D654: the fixed words of the project lens (不在项目里 / Not in a project, 电脑上的事 /
// On your computers) never truncate mid-word. Middle ellipsis is for project names only; the
// fixed words wrap or the column gives them room. Rendered in headless Chrome against the real
// app.css at 390, 1000, 1180 and 1400, in zh and en.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

// A lens row for a fixed phrase, exactly the tree LensEntry draws for OTHER / COMPUTERS
// (a <b class="proj-name fixed">, no MidName), plus one project name for contrast.
const fixedRow = (name: string, n: number) =>
  `<button class="lens-row"><span class="nm"><span class="nm-line"><b class="proj-name fixed">${name}</b></span></span><span class="n">${n}</span></button>`;
const projectRow = (name: string, n: number) =>
  `<button class="lens-row"><span class="nm"><span class="nm-line"><b class="proj-name">${name}</b></span></span><span class="n">${n}</span></button>`;

const surface = (w: number, lang: "zh" | "en") => {
  const zh = lang === "zh";
  return `<div class="geo-col" data-width="${w}" data-lang="${lang}"><nav class="lens-col" style="display:flex;position:static;width:${w < 260 ? w - 16 : 260}px">` +
    `${fixedRow(zh ? "不在项目里" : "Not in a project", 4)}${fixedRow(zh ? "电脑上的事" : "On your computers", 2)}${projectRow("nowledge-labs-website", 1)}` +
    `</nav></div>`;
};

const page = (widths: number[], langs: ("zh" | "en")[]) =>
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}
   html,body{margin:0;background:var(--bg);} .geo-col{margin:0 0 24px;}
  </style></head><body>${widths.flatMap((w) => langs.map((l) => surface(w, l))).join("")}<pre id="result"></pre><script>
  {
    const bad = [];
    for (const col of document.querySelectorAll(".geo-col")) {
      const w = Number(col.dataset.width);
      const lang = col.dataset.lang;
      const full = lang === "zh" ? ["不在项目里", "电脑上的事"] : ["Not in a project", "On your computers"];
      const fixed = col.querySelectorAll(".nm b.fixed");
      if (fixed.length !== 2) { bad.push({ w, lang, why: "no fixed rows: " + fixed.length }); continue; }
      [...fixed].forEach((el, i) => {
        if (el.textContent !== full[i]) bad.push({ w, lang, why: "cut to \u201c" + el.textContent + "\u201d" });
        const st = getComputedStyle(el);
        if (st.whiteSpace !== "normal") bad.push({ w, lang, why: "white-space " + st.whiteSpace + " on " + full[i] });
        // The phrase is whole: its content never runs past its own box (no clipping).
        if (el.scrollWidth > el.clientWidth + 1) bad.push({ w, lang, why: full[i] + " clipped " + el.scrollWidth + " > " + el.clientWidth });
      });
      // A project name is still one line, cut in the middle by MidName (JS), not the CSS here.
      const proj = col.querySelector(".nm b:not(.fixed)");
      if (!proj || getComputedStyle(proj).whiteSpace !== "nowrap") bad.push({ w, lang, why: "project name is not nowrap" });
    }
    document.getElementById("result").textContent = JSON.stringify({ bad });
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
if (!browser) {
  describe.skip("the fixed lens words never truncate at 390/1000/1180/1400 (no Chrome here)", () => {});
} else {
  describe("the fixed lens words never truncate at 390/1000/1180/1400", () => {
    test("zh and en are whole at every width", () => {
      const dir = mkdtempSync(join(tmpdir(), "ducter-lens-geometry-"));
      const file = join(dir, "lens.html");
      try {
        writeFileSync(file, page([390, 1000, 1180, 1400], ["zh", "en"]));
        const run = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=2000", "--window-size=1400,1200", "--dump-dom", `file://${file}`], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
        const out = `${run.stdout ?? ""}`;
        const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
        if (!m) throw new Error(`Chrome drew no result (status ${run.status}):\n${out.slice(-800)}`);
        const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')) as { bad: { w: number; lang: string; why: string }[] };
        expect(got.bad).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}
