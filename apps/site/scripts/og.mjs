// Draws the share image (public/og.png, 1200 x 630): what WeChat, X, Slack and iMessage show when
// someone shares ducter.ai. An HTML page in the site's own type, palette and clay art, with a real
// screen of the app (public/shots/hero-light.webp: the morning note above a finished job), rendered
// by headless Chrome and squeezed to a palette PNG. The tagline is read from the home page's <h1>,
// so changing the line (or retaking the shot) and running this again redraws it.
//
//   node scripts/og.mjs                    # the chosen layout, to public/og.png
//   node scripts/og.mjs --layout b --out /tmp/b.png
//
// Three layouts were drawn and rated (design/site.md, "The share image"); `a` won and is the default.
// Needs Chrome (CHROME=/path/to/chrome to choose one). Not run by the build: og.png is committed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(site, "public");
const W = 1200, H = 630, MAX_BYTES = 400 * 1024;

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const layout = arg("layout", "a");
const out = resolve(arg("out", join(pub, "og.png")));

/** The tagline, from the home page's <h1>: its first sentence and the quieter line after it. */
function tagline(src = readFileSync(join(site, "src/pages/index.astro"), "utf8")) {
  const h1 = src.match(/<h1>([\s\S]*?)<\/h1>/)?.[1];
  if (!h1) throw new Error("no <h1> on the home page");
  const quiet = h1.match(/<span class="line quiet">([\s\S]*?)<\/span>/)?.[1]?.trim();
  const first = h1.replace(/<span[\s\S]*<\/span>/, "").trim();
  if (!first || !quiet) throw new Error("the home page's <h1> isn't a line and a quiet line");
  return { first, quiet };
}

const url = (p) => pathToFileURL(join(pub, p)).href;
const SHOT = { file: "shots/hero-light.webp", w: 1080, h: 1350 };

/** A window onto part of the real screen, in source pixels, drawn `w` wide. */
function crop([x1, y1, x2, y2], w, cls = "") {
  const s = w / (x2 - x1);
  return `<div class="crop ${cls}" style="width:${w}px;height:${Math.round((y2 - y1) * s)}px">` +
    `<img src="${url(SHOT.file)}" style="width:${SHOT.w * s}px;left:${-x1 * s}px;top:${-y1 * s}px" alt=""></div>`;
}
// Regions of hero-light.webp (1080 x 1350).
const R = {
  whole: [40, 0, 1040, 1350],
  note: [64, 130, 906, 660], // "Morning. Two things need you:" and both items
  noteOne: [64, 130, 906, 400], // its first item, with Open the renewal page
  done: [64, 950, 906, 1215], // "Fixed. …" and Merge into main
};

const art = (name, w) => `<img class="art" src="${url(`art/${name}-480.webp`)}" style="width:${w}px" alt="">`;
// The address, alone: the character is already in the picture once.
const word = `<div class="mark">ducter.ai</div>`;

const css = `
@font-face { font-family: "Bricolage"; src: url("${url("fonts/bricolage.woff2")}") format("woff2-variations"); font-weight: 200 800; }
@font-face { font-family: "Instrument"; src: url("${url("fonts/instrument-sans.woff2")}") format("woff2-variations"); font-weight: 400 700; }
:root { --bg: #fff6ea; --bg-deep: #fcecd7; --ink: #2b2118; --ink-2: #4a3d30; --muted: #75654f; --line: #e8d9c4; --line-2: #e0c9b0; --accent: #ff8a3d; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
body { position: relative; background: var(--bg); color: var(--ink); font-family: "Instrument", sans-serif; -webkit-font-smoothing: antialiased; }
.glow { position: absolute; border-radius: 50%; background: radial-gradient(closest-side, var(--bg-deep), rgb(252 236 215 / 0)); }
h1 { margin: 0; font-family: "Bricolage", sans-serif; font-optical-sizing: auto; font-weight: 800; letter-spacing: -0.035em; line-height: 0.96; color: var(--ink); text-wrap: balance; }
h1 .quiet { display: block; margin-top: 0.3em; font-size: 0.56em; line-height: 1.1; letter-spacing: -0.025em; color: var(--ink-2); }
.mark { display: flex; align-items: center; gap: 12px; font-family: "Bricolage", sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; color: var(--ink); }
.art { display: block; height: auto; filter: drop-shadow(0 10px 14px rgb(43 33 24 / 0.18)); }
.crop { position: relative; overflow: hidden; border-radius: 22px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line), 0 4px 0 var(--line), 0 26px 50px -22px rgb(43 33 24 / 0.32); }
.crop img { position: absolute; display: block; max-width: none; }
.abs { position: absolute; }
`;

/** Each layout: where the line, the screen and the character go. */
const layouts = {
  // A: the line on the left, the whole screen on the right running off the bottom, the character
  // peeking over the screen's corner. Text first; the screen is the proof.
  a: (t) => `
    <div class="glow" style="width:900px;height:900px;right:-260px;top:-160px"></div>
    <div class="abs" style="left:72px;top:76px;width:560px"><h1 style="font-size:74px">${t.first}<span class="quiet">${t.quiet}</span></h1></div>
    <div class="abs" style="left:72px;bottom:64px">${word}</div>
    <div class="abs" style="left:684px;top:64px">${crop(R.whole, 452)}</div>
    <div class="abs" style="left:556px;top:404px;transform:rotate(-6deg)">${art("ducter_done", 150)}</div>`,
  // B: the screen leads. The morning note and the finished job as two real cards, large enough to
  // read, the character between them; the line across the bottom.
  b: (t) => `
    <div class="glow" style="width:1000px;height:700px;left:100px;top:-200px"></div>
    <div class="abs" style="left:64px;top:52px">${crop(R.noteOne, 520)}</div>
    <div class="abs" style="left:616px;top:150px">${crop(R.done, 520)}</div>
    <div class="abs" style="left:640px;top:24px;transform:rotate(8deg)">${art("ducter_done", 112)}</div>
    <div class="abs" style="left:64px;right:64px;bottom:56px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px">
      <h1 style="font-size:54px;max-width:820px">${t.first} <span class="quiet" style="display:inline;margin:0;font-size:1em;color:var(--muted)">${t.quiet}</span></h1>
      <div style="white-space:nowrap">${word}</div>
    </div>`,
  // C: the character leads. Big, on the left, holding up the morning note as if it's telling you;
  // the line on the right.
  c: (t) => `
    <div class="glow" style="width:760px;height:760px;left:-150px;top:-60px"></div>
    <div class="abs" style="left:40px;top:262px">${art("ducter_needsyou", 300)}</div>
    <div class="abs" style="left:250px;top:64px;transform:rotate(-2deg)">${crop(R.note, 420)}</div>
    <div class="abs" style="left:716px;top:150px;width:430px"><h1 style="font-size:62px">${t.first}<span class="quiet">${t.quiet}</span></h1></div>
    <div class="abs" style="left:716px;bottom:64px">${word}</div>`,
};

function html(name) {
  const draw = layouts[name];
  if (!draw) throw new Error(`no layout ${name}: ${Object.keys(layouts).join(", ")}`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${draw(tagline())}</body></html>`;
}

function chrome() {
  const found = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => p && existsSync(p));
  if (!found) throw new Error("no Chrome: set CHROME=/path/to/chrome");
  return found;
}

const dir = mkdtempSync(join(tmpdir(), "ducter-og-"));
try {
  const page = join(dir, "og.html");
  const raw = join(dir, "raw.png");
  writeFileSync(page, html(layout));
  execFileSync(chrome(), [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(dir, "profile")}`, "--allow-file-access-from-files", "--force-device-scale-factor=1",
    `--window-size=${W},${H}`, "--virtual-time-budget=4000", `--screenshot=${raw}`, pathToFileURL(page).href,
  ], { stdio: "ignore" });
  const meta = await sharp(raw).metadata();
  if (meta.width !== W || meta.height !== H) throw new Error(`Chrome drew ${meta.width} x ${meta.height}, not ${W} x ${H}`);
  await sharp(raw).png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 }).toFile(out);
  const bytes = statSync(out).size;
  if (bytes > MAX_BYTES) throw new Error(`${out} is ${Math.round(bytes / 1024)} KB, over ${MAX_BYTES / 1024} KB`);
  console.log(`og: layout ${layout}, ${Math.round(bytes / 1024)} KB, ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
