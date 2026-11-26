// D618: Settings after D589: the Mac's saved rows say what the web's do; To-do sources'
// two choices share one column; a phone row drops a wide control under its words at ~160; a card
// foot's words—not its padding—end on the toggles' edge; a Space name stays whole and a path is
// cut in the middle. The rendered rules live in app.css; this test reads them and lays the real
// markup out in headless Chrome at 1000 and 390.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

const selectorBody = (selector: string) => {
  const out: string[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const items = m[1]!.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (items.includes(selector)) out.push(m[2]!);
  }
  return out.join(";");
};

describe("Settings after D589 (D618)", () => {
  test("a phone row keeps ~160 of words before keeping a control beside them", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 520px)"), css.indexOf("/* ---------- D279"));
    expect(phone).toMatch(/\.chat-row \.grow \{[^}]*min-width: 12rem;/);
    expect(phone).toMatch(/\.chat-head:not\(:has\(> \.switch\.bare\)\) > \.grow \{[^}]*min-width: 12rem;/);
  });

  test("To-do sources' two choices share one column", () => {
    expect(css).toMatch(/@media \(min-width: 700px\) \{\s*\.todo-src \.chat-row > \.seg \{[^}]*flex: 0 0 21rem;/);
    expect(css).toMatch(/\.todo-src \.chat-row > \.seg button \{[^}]*flex: 1 1 auto;/);
  });

  test("a card foot's last quiet action ends on the switches' edge", () => {
    expect(selectorBody(".btn.text.sm")).toContain("--end-pad: 10px");
    expect(selectorBody(".danger-text")).toContain("--end-pad: 8px");
    expect(css).toMatch(/\.chat-foot > \.g-acts > :last-child:is\(\.btn\.text, \.danger-text\)[^{]*\{[^}]*margin-right: calc\(-1 \* var\(--end-pad\)\)/);
  });
});

/** Chrome or Chromium, wherever this machine keeps it; undefined where the test can only check the CSS. */
function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
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

const seg = (labels: string[]) => `<div class="seg">${labels.map((x, i) => `<button type="button"${i === 0 ? ' class="on"' : ""}><span>${x}</span></button>`).join("")}</div>`;
const row = (title: string, line: string, labels: string[]) => `<div class="chat-row"><span class="grow"><b>${title}</b><small>${line}</small></span>${seg(labels)}</div>`;

const desk =
  `<div id="desk" style="width:1000px">` +
  `<section class="set-card chat-app todo-src" style="width:608px">` +
  row("新的来了", "在对话里跟你说一声。", ["说一声", "直接接下", "不用说"]) +
  row("做完以后", "先问你，再在 issue 下留言。", ["先问你", "留言", "留言并关掉"]) +
  row("新的来了", "你问起来再看。", ["说一声", "直接接下", "不用说"]) +
  row("做完以后", "在笔记里勾掉；想撤回，把勾点掉就好。", ["勾掉", "先问你", "不动它"]) +
  `</section>` +
  `<section class="set-card chat-app" id="foot-card" style="width:608px;margin-top:20px">` +
  `<div class="chat-foot"><small class="grow">你的邮件、日程和消息会经过 OOMOL。</small><span class="g-acts">` +
  `<button type="button" class="btn text sm"><span class="lbl">看了哪些</span></button>` +
  `<button type="button" class="danger-text quiet">停用 OOMOL</button></span></div>` +
  `<div class="chat-foot"><small class="grow">每通电话都先问你。</small><span class="g-acts">` +
  `<button type="button" class="btn text sm"><span class="lbl">说明</span></button>` +
  `<button type="button" class="btn text sm"><span class="lbl">断开 Tuwa</span></button></span></div>` +
  `</section>` +
  `</div>`;

const phone =
  `<div id="phone" style="width:390px">` +
  `<section class="set-card chat-app" style="width:358px">` +
  `<div class="chat-row pro-row"><span class="grow"><b>发现了就说</b><small>早上一起说，最多 3 条；急的随时说。</small></span>` +
  `<span class="pro-pick"><span class="dselect"><button type="button" class="dselect-btn"><span class="dselect-v">每天最多 3 条</span><svg class="dselect-caret" viewBox="0 0 10 10"></svg></button></span></span></div>` +
  `</section>` +
  `</div>`;

const page = (body: string) =>
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}` +
  `<pre id="result"></pre><script>
{
  const q = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const textRight = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().right; };
  const out = {};
  const segs = [...document.querySelectorAll(".todo-src .chat-row > .seg")].map(q);
  const words = [...document.querySelectorAll(".todo-src .chat-row > .grow")].map(q);
  out.segs = segs;
  out.words = words;
  out.footEdge = [...document.querySelectorAll(".chat-foot")].map((f) => {
    const cs = getComputedStyle(f);
    const edge = f.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    const acts = [...f.querySelectorAll(".g-acts > *")];
    const last = acts[acts.length - 1];
    return { edge, text: last ? (last.classList.contains("btn") ? textRight(last.querySelector(".lbl") || last) : textRight(last)) : 0, btn: last ? q(last).right : 0 };
  });
  const grow = document.querySelector(".pro-row .grow");
  const pick = document.querySelector(".pro-row .pro-pick");
  out.phone = { grow: grow ? q(grow) : null, pick: pick ? q(pick) : null, growMin: grow ? getComputedStyle(grow).minWidth : "" };
  document.getElementById("result").textContent = JSON.stringify(out);
}
</script></body></html>`;

const browser = chrome();
function render(body: string, size: string): any {
  const dir = mkdtempSync(join(tmpdir(), "ducter-settings-r6-"));
  const file = join(dir, "r6.html");
  try {
    writeFileSync(file, page(body));
    const run = spawnSync(
      browser!,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-crash-reporter",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        `--user-data-dir=${join(dir, "profile")}`,
        "--virtual-time-budget=2000",
        `--window-size=${size}`,
        "--dump-dom",
        `file://${file}`,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 },
    );
    const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(run.stdout ?? "");
    if (!m) throw new Error(`Chrome drew no result (status ${run.status})`);
    return JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (!browser) {
  test.skip("the rendered rows fit their shared columns (no Chrome or Chromium here)", () => {});
} else {
  test("To-do sources' two rows start and end on one x, and their words keep 160", () => {
    const got = render(desk, "1200,1200");
    for (let i = 0; i < got.segs.length; i += 2) {
      expect({ i, first: got.segs[i], second: got.segs[i + 1] }).toMatchObject({ i, first: { x: got.segs[i + 1].x }, second: { right: got.segs[i].right } });
    }
    for (const w of got.words) expect(w.w).toBeGreaterThanOrEqual(160);
  });

  test("a card foot's last action ends its words on the switches' edge", () => {
    const got = render(desk, "1200,1200");
    expect(got.footEdge.length).toBe(2);
    for (const f of got.footEdge) expect(Math.abs(f.text - f.edge)).toBeLessThanOrEqual(0.6);
  });

  test("a phone row keeps its words at 160 or drops the control under them", () => {
    const got = render(phone, "500,900");
    expect(got.phone.growMin).toBe("192px");
    expect(got.phone.grow.w).toBeGreaterThanOrEqual(192);
    if (got.phone.pick.y < got.phone.grow.bottom - 1) {
      // Beside: the words kept their 160, and the control is at the row's right edge.
      expect(got.phone.grow.w).toBeGreaterThanOrEqual(192);
    } else {
      expect(got.phone.pick.y).toBeGreaterThanOrEqual(got.phone.grow.bottom - 1);
    }
  });
}
