// D617: an ask's words can hold a 120-character URL, a long path, a command, a branch or a
// hash. On a phone the question / confirm card must keep all of it inside the card at 320, 390 and
// 430: prose wraps (overflow-wrap, never word-break, so Chinese keeps its own breaks), links wrap,
// an inline code chip and the one-time code well wrap or truncate in their own box, a code block
// scrolls in its own box, and the buttons stay on the card. This test renders the real card markup
// under the real app.css in headless Chrome and reads scrollWidth/clientWidth back; the CSS checks
// below keep the failure readable when no Chrome is installed (the composer-geometry pattern).
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

/** Every declaration block whose selector list includes `selector` as one of its items. */
function blocks(selector: string): string[] {
  const out: string[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const items = m[1]!.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (items.includes(selector)) out.push(m[2]!);
  }
  return out;
}
const decl = (selector: string) => blocks(selector).join(";");

describe("an ask's words never run past its card (D617)", () => {
  test("prose wraps anywhere a long token needs it, with no word-break rule", () => {
    for (const sel of [".ask-said", ".decision .q", ".ask-link", ".asked .ask-words"]) {
      expect({ sel, wrap: decl(sel) }).toMatchObject({ sel, wrap: expect.stringMatching(/overflow-wrap:\s*anywhere/) });
      expect(decl(sel)).not.toMatch(/word-break:\s*(break-all|break-word)/);
    }
  });

  test("an inline code chip shrinks and wraps inside its own box", () => {
    const chip = decl(".ask-code");
    expect(chip).toMatch(/min-width:\s*0/);
    expect(chip).toMatch(/max-width:\s*100%/);
    const code = decl(".ask-code code");
    expect(code).toMatch(/min-width:\s*0/);
    expect(code).toMatch(/max-width:\s*100%/);
    // .partner code says nowrap for short tokens; the copy chip overrides it so a command wraps.
    expect(code).toMatch(/white-space:\s*normal/);
    expect(code).toMatch(/overflow-wrap:\s*anywhere/);
  });

  test("the one-time code well keeps Copy at the right", () => {
    expect(decl(".otc")).toMatch(/max-width:\s*100%/);
    expect(decl(".otc")).toMatch(/min-width:\s*0/);
    const code = decl(".otc code");
    expect(code).toMatch(/min-width:\s*0/);
    expect(code).toMatch(/max-width:\s*100%/);
    expect(code).toMatch(/overflow-wrap:\s*anywhere/);
    expect(decl(".otc .btn")).toMatch(/flex:\s*none/);
  });

  test("a code block scrolls in its own box", () => {
    for (const sel of [".ask-said pre", ".decision pre", ".partner pre"]) {
      const b = decl(sel);
      expect({ sel, body: b }).toMatchObject({ sel, body: expect.stringMatching(/overflow-x:\s*auto/) });
      expect(b).toMatch(/max-width:\s*100%/);
      expect(b).toMatch(/min-width:\s*0/);
    }
  });
});

// ---- the rendered geometry: 320, 390 and 430, the real app.css ----

// Chrome clamps a headless window at 500 wide, so each card is laid out in a column of its own
// exact width (320, 390, 430) with the phone's media rules (<= 599) on, as on the phone.
const WIDTHS = [320, 390, 430] as const;
const URL_120 = `https://example.com/${"a".repeat(100)}`; // 120 characters, no break
const PATH = `/Users/someone/projects/${"b".repeat(96)}/src/index.ts`;
const COMMAND = `git ${"c".repeat(110)}`;
const LONG_CODE = `ABCD-${"9".repeat(60)}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const codeChip = (s: string) =>
  `<button type="button" class="ask-code"><code translate="false">${esc(s)}</code><span class="g" aria-hidden="true">` +
  `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1h10v10H1z"/></svg></span></button>`;
const ASK_WORDS =
  `Here is the page ${esc(URL_120)} and the file ${esc(PATH)}. Run ${codeChip(COMMAND)} in that folder, ` +
  `then tell me about branch ${esc(PATH)}.`;

const goLabel = "Install Node 22 and run the whole build before you carry on";
const acts =
  `<div class="dk-acts"><button type="button" class="btn primary"><span class="lbl">${goLabel}</span></button>` +
  `<div class="dk-quiet"><button type="button" class="btn text"><span class="lbl">Not now</span></button>` +
  `<button type="button" class="btn text"><span class="lbl">Reply…</span></button></div></div>`;
const otc =
  `<div class="otc"><code>${LONG_CODE}</code><button type="button" class="btn secondary"><span class="lbl">Copy</span></button></div>`;
const blockCode = `<pre><code>${"x".repeat(180)}</code></pre>`;

/** The three surfaces the author met: the conversation's ask, a task page, and On hand. */
const surface = (kind: "conversation" | "task" | "onhand", w: number) => {
  const decision = `<div class="decision" data-card><div class="q"><span class="ask-said">${ASK_WORDS}</span></div><div class="dk">${acts}</div>${otc}${blockCode}</div>`;
  if (kind === "conversation")
    return `<div class="phone" data-width="${w}" style="width:${w}px"><div class="scroll" role="log">` +
      `<div class="partner askq"><div class="bubble" data-card dir="auto"><span class="ask-said">${ASK_WORDS}</span></div>` +
      `<div class="tray dk-card"><div class="dk">${acts}</div></div></div></div></div>`;
  if (kind === "task") return `<div class="phone" data-width="${w}" style="width:${w}px">${decision}</div>`;
  return `<div class="phone" data-width="${w}" style="width:${w}px"><div class="onhand-list"><div class="ocards"><div class="ocard">${decision}</div></div></div></div>`;
};

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>` +
  WIDTHS.map((w) => (["conversation", "task", "onhand"] as const).map((k) => surface(k, w)).join("")).join("") +
  `<pre id="result"></pre><script>
{
  const bad = [];
  for (const phone of document.querySelectorAll(".phone")) {
    const w = phone.dataset.width;
    for (const card of phone.querySelectorAll("[data-card]")) {
      const box = card.getBoundingClientRect();
      if (card.clientWidth > 0 && card.scrollWidth > card.clientWidth + 1)
        bad.push({ w, card: card.className, why: "scrollWidth " + card.scrollWidth + " > clientWidth " + card.clientWidth });
      for (const el of card.querySelectorAll("*")) {
        // A code block scrolls inside its own box (the test above), never the card.
        if (el.closest("pre")) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1))
          bad.push({ w, card: card.className, why: el.tagName + "." + String(el.className).split(" ")[0] + " right " + r.right.toFixed(1) + " vs " + box.right.toFixed(1) });
      }
    }
  }
  document.getElementById("result").textContent = JSON.stringify({ widths: [...document.querySelectorAll(".phone")].map((p) => p.dataset.width), bad });
}
</script></body></html>`;

/** Chrome or Chromium, wherever this machine keeps it; undefined where the test can only check the CSS. */
function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
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
  for (const n of names) {
    const found = Bun.which(n);
    if (found) return found;
  }
  return undefined;
}

const browser = chrome();
if (!browser) {
  test.skip("the ask card fits 320, 390 and 430 (no Chrome or Chromium here)", () => {});
} else {
  test("the ask card fits 320, 390 and 430 (rendered in Chrome)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-ask-geometry-"));
    const file = join(dir, "ask.html");
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
      const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { widths: string[]; bad: { w: string; card: string; why: string }[] };
      expect(got.widths).toEqual(["320", "320", "320", "390", "390", "390", "430", "430", "430"]);
      expect(got.bad).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
