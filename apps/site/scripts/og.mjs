// Draws the site's share images from an HTML page in the site's own type, palette and clay art:
//
//   public/og.png                     1200 x 630, what WeChat, X, Slack and iMessage show
//   .shots/brand/social-preview.png   1280 x 640 CSS, rendered at 2x = 2560 x 1280, for GitHub
//
// The social card reads D414's Line from design/positioning.md, the character from its 1024 px
// master, and one real screen of On hand from a fresh 2x capture of the web client
// (public/shots/onhand-2x.png: DEMO_STATE=one, 1440 x 1000 at 2x, no browser chrome). Three
// compositions are drawn (social-a, social-b, social-c); `social` is the chosen one.
//
// Everything is rendered at deviceScaleFactor 2. The social card is saved as a full-colour PNG
// at 2560 x 1280 (GitHub accepts 2x; a 1 MB cap). The site's og.png is rendered at 2x and
// downsampled to 1200 x 630, full colour, no palette. If a file would exceed 1 MB it is saved as
// a q92 4:4:4 JPEG instead and the script says so.
//
//   node scripts/og.mjs                         # the site's og.png
//   node scripts/og.mjs --layout social-a --out ../../.shots/brand/social-candidates/a.png
//   node scripts/og.mjs --layout social         # the chosen social card
//
// Needs Chrome (CHROME=/path/to/chrome to choose one). Not run by the build: the images are
// committed or kept as brand evidence.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(site, "public");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const layout = arg("layout", "a");
const social = layout.startsWith("social");
// GitHub's card is 1280 x 640 CSS and is shipped at 2x; the site's og is 1200 x 630 at 1x.
const [W, H] = social ? [1280, 640] : [1200, 630];
const OUT_SCALE = social ? 2 : 1;
const RENDER_SCALE = 2;
const MAX_BYTES = 1024 * 1024;
const out = resolve(arg("out", social ? join(site, "../../.shots/brand/social-preview.png") : join(pub, "og.png")));
mkdirSync(dirname(out), { recursive: true });

/** The site's tagline, from the home page's <h1>: its first sentence and the quieter line after it. */
function tagline(src = readFileSync(join(site, "src/pages/index.astro"), "utf8")) {
  const h1 = src.match(/<h1>([\s\S]*?)<\/h1>/)?.[1];
  if (!h1) throw new Error("no <h1> on the home page");
  const quiet = h1.match(/<span class="line quiet">([\s\S]*?)<\/span>/)?.[1]?.trim();
  const first = h1.replace(/<span[\s\S]*<\/span>/, "").trim();
  if (!first || !quiet) throw new Error("the home page's <h1> isn't a line and a quiet line");
  return { first, quiet };
}

const url = (p) => pathToFileURL(join(pub, p)).href;

/** PNG dimensions from the IHDR, so a fresh capture or an override needs no extra flag. */
function pngSize(file) {
  const head = readFileSync(file);
  if (head.toString("ascii", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG`);
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}

const SHOT = { file: url("shots/hero-light.webp"), w: 1080, h: 1350 };
// The calm On hand capture (2x, 1440 x 1000 CSS): one thing needs you, two at work, one done.
const SCREEN_PATH = join(pub, "shots/onhand-2x.png");
const SCREEN_FILE = arg("screen", "");
const SCREEN = SCREEN_FILE
  ? (() => {
      const file = resolve(SCREEN_FILE);
      return { file: pathToFileURL(file).href, ...pngSize(file) };
    })()
  : { file: url("shots/onhand-2x.png"), ...pngSize(SCREEN_PATH) };
if (social && !existsSync(new URL(SCREEN.file))) throw new Error(`no screen capture at ${SCREEN.file}`);

/** A window onto part of a real screen, in source pixels, drawn `w` wide. */
function cropOf(shot, [x1, y1, x2, y2], w, cls = "") {
  const s = w / (x2 - x1);
  return `<div class="crop ${cls}" style="width:${w}px;height:${Math.round((y2 - y1) * s)}px">` +
    `<img src="${shot.file}" style="width:${shot.w * s}px;left:${-x1 * s}px;top:${-y1 * s}px" alt=""></div>`;
}
const crop = (r, w, cls = "") => cropOf(SHOT, r, w, cls);
const screen = (r, w) => cropOf(SCREEN, r, w, "screen");
// Regions of hero-light.webp (1080 x 1350), kept for the earlier layouts.
const R = {
  whole: [40, 0, 1040, 1350],
  note: [64, 167, 906, 697],
  noteOne: [64, 167, 906, 437],
  done: [64, 990, 906, 1215],
};
// Regions of onhand-2x.png (2880 x 2000): the main column, without the project rail or the
// task-detail panel. Tall for a split card, wide for a stacked one.
const S = {
  tall: [500, 124, 2100, 1450], // 1600 x 1326, crop below the header hairline (rows 118–119); ~29 px top and bottom
  wide: [500, 180, 2100, 1000], // 1600 x 820
};

// The character, trimmed from its 1024 px master at render time; nothing is scaled up.
const CHARACTER_MASTER = join(site, "../../design/art/assets/alpha/ducter_done.png");
let characterUrl = url("art/ducter_done-480.webp");
const character = (w) => `<img class="art" src="${characterUrl}" style="width:${w}px" alt="">`;
// The address, alone: the character is already in the picture once.
const word = `<div class="mark">ducter.ai</div>`;

/** D414's line, read from positioning.md: never a second copy of the words. */
function positioningLine(src = readFileSync(join(site, "../../design/positioning.md"), "utf8")) {
  const row = src.split("\n").find((l) => /^\| \*\*Line\*\*/.test(l));
  const en = row?.split("|")[2]?.trim();
  if (!en) throw new Error("no Line row in design/positioning.md");
  const [first, ...rest] = en.split(/(?<=\.)\s+/);
  return { first, quiet: rest.join(" "), line: en };
}

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
.second { margin: 20px 0 0; font-family: "Instrument", sans-serif; font-weight: 400; font-size: 28px; line-height: 1.4; letter-spacing: -0.01em; color: var(--ink-2); }
.mark { display: flex; align-items: center; gap: 12px; font-family: "Bricolage", sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; color: var(--ink); }
.signature { display: flex; align-items: baseline; gap: 14px; }
.signature .mark { font-size: 26px; line-height: 1; gap: 0; }
.art { display: block; height: auto; filter: drop-shadow(0 10px 14px rgb(43 33 24 / 0.18)); }
.crop { position: relative; overflow: hidden; border-radius: 24px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line), 0 4px 0 var(--line), 0 30px 56px -24px rgb(43 33 24 / 0.34); }
.crop img { position: absolute; display: block; max-width: none; }
.abs { position: absolute; }
`;

/** Each layout: where the line, the screen and the character go. */
const layouts = {
  // The site's og.png: the home page's promise on the left, the real hero screen on the right,
  // the character above the address at the lower left. Kept as the earlier winner.
  a: (t) => `
    <div class="glow" style="width:900px;height:900px;right:-260px;top:-160px"></div>
    <div class="abs" style="left:64px;top:62px;width:560px"><h1 style="font-size:62px">${t.first}<span class="quiet">${t.quiet}</span></h1></div>
    <div class="abs" style="left:64px;bottom:54px">${word}</div>
    <div class="abs" style="left:72px;bottom:106px">${character(116)}</div>
    <div class="abs" style="left:710px;top:50px">${crop(R.whole, 400)}</div>`,
  // Social A: line left, screen right. A won the three-way comparison: the line reads first, the
  // screen is quiet proof, and the left column is one lockup on the 96 px grid. The second line is
  // the text face; the signature row is a small character beside the address.
  "social-a": (t) => `
    <div class="abs" style="left:96px;top:102px;width:460px"><h1 style="font-size:62px">${t.first}</h1><p class="second">${t.quiet}</p></div>
    <div class="abs signature" style="left:96px;bottom:96px">${character(73)}<div class="mark">ducter.ai</div></div>
    <div class="abs" style="left:684px;top:108px">${screen(S.tall, 500)}</div>`,
  // Social B: screen left, line right. The proof leads; the words answer it.
  "social-b": (t) => `
    <div class="abs" style="left:96px;top:96px">${screen(S.tall, 551)}</div>
    <div class="abs" style="left:724px;top:96px;width:460px"><h1 style="font-size:62px">${t.first}<span class="quiet" style="font-size:26px">${t.quiet}</span></h1></div>
    <div class="abs" style="left:724px;bottom:96px">${word}</div>
    <div class="abs" style="left:736px;bottom:172px">${character(120)}</div>`,
  // Social C: line top left, character top right, one wide screen below, address at the lower left.
  "social-c": (t) => `
    <div class="abs" style="left:96px;top:96px;width:560px"><h1 style="font-size:64px">${t.first}<span class="quiet" style="font-size:26px;max-width:500px">${t.quiet}</span></h1></div>
    <div class="abs" style="left:96px;bottom:96px">${word}</div>
    <div class="abs" style="left:1000px;top:96px">${character(140)}</div>
    <div class="abs" style="left:640px;top:270px">${screen(S.wide, 544)}</div>`,
  // The chosen social card; set to the winner after the three candidates were compared.
  social: (t) => layouts["social-a"](t),
  // The earlier site layouts, kept so the history can still be drawn.
  b: (t) => `
    <div class="glow" style="width:1000px;height:700px;left:100px;top:-200px"></div>
    <div class="abs" style="left:64px;top:52px">${crop(R.noteOne, 520)}</div>
    <div class="abs" style="left:616px;top:150px">${crop(R.done, 520)}</div>
    <div class="abs" style="left:640px;top:24px;transform:rotate(8deg)">${character(112)}</div>
    <div class="abs" style="left:64px;right:64px;bottom:56px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px">
      <h1 style="font-size:54px;max-width:820px">${t.first} <span class="quiet" style="display:inline;margin:0;font-size:1em;color:var(--muted)">${t.quiet}</span></h1>
      <div style="white-space:nowrap">${word}</div>
    </div>`,
  c: (t) => `
    <div class="glow" style="width:760px;height:760px;left:-150px;top:-60px"></div>
    <div class="abs" style="left:40px;top:262px">${character(300)}</div>
    <div class="abs" style="left:250px;top:64px;transform:rotate(-2deg)">${crop(R.note, 420)}</div>
    <div class="abs" style="left:716px;top:150px;width:430px"><h1 style="font-size:62px">${t.first}<span class="quiet">${t.quiet}</span></h1></div>
    <div class="abs" style="left:716px;bottom:64px">${word}</div>`,
};

function html(name) {
  const draw = layouts[name];
  if (!draw) throw new Error(`no layout ${name}: ${Object.keys(layouts).join(", ")}`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${draw(social ? positioningLine() : tagline())}</body></html>`;
}

function chrome() {
  const found = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => p && existsSync(p));
  if (!found) throw new Error("no Chrome: set CHROME=/path/to/chrome");
  return found;
}

const dir = mkdtempSync(join(tmpdir(), "ducter-og-"));
let written = out;
try {
  // The 1024 master, trimmed to the character's own bounds: no upscaling, no lossy step.
  if (existsSync(CHARACTER_MASTER)) {
    const trimmed = join(dir, "character.png");
    await sharp(CHARACTER_MASTER).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toFile(trimmed);
    characterUrl = pathToFileURL(trimmed).href;
  }

  const page = join(dir, "og.html");
  const raw = join(dir, "raw.png");
  // A sandbox without a writable temp profile can set OG_PROFILE to a workspace folder.
  const profile = process.env.OG_PROFILE ? resolve(process.env.OG_PROFILE) : join(dir, "profile");
  mkdirSync(profile, { recursive: true });
  writeFileSync(page, html(layout));
  try {
    execFileSync(chrome(), [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${profile}`, "--allow-file-access-from-files", `--force-device-scale-factor=${RENDER_SCALE}`,
      `--window-size=${W},${H}`, "--virtual-time-budget=5000", `--screenshot=${raw}`, pathToFileURL(page).href,
    ], { stdio: "ignore" });
  } catch (error) {
    // Chrome's teardown watchdog can return a non-zero status after it has written the shot.
    if (!existsSync(raw)) throw error;
  }
  const meta = await sharp(raw).metadata();
  if (meta.width !== W * RENDER_SCALE || meta.height !== H * RENDER_SCALE) {
    throw new Error(`Chrome drew ${meta.width} x ${meta.height}, not ${W * RENDER_SCALE} x ${H * RENDER_SCALE}`);
  }

  let image = sharp(raw);
  if (OUT_SCALE === 1) image = image.resize(W, H, { kernel: "lanczos3" });
  const png = await image.clone().png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10, palette: false }).toBuffer();
  if (png.length <= MAX_BYTES) {
    writeFileSync(out, png);
    written = out;
  } else {
    written = out.replace(/\.png$/i, ".jpg");
    await image.clone().jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toFile(written);
    if (written !== out) rmSync(out, { force: true });
  }
  const bytes = readFileSync(written).length;
  if (bytes > MAX_BYTES) throw new Error(`${written} is ${Math.round(bytes / 1024)} KB, over ${MAX_BYTES / 1024} KB`);
  console.log(`og: layout ${layout}, ${meta.width} x ${meta.height} rendered, ${written.endsWith(".png") ? "PNG" : "JPEG q92 4:4:4"}, ${Math.round(bytes / 1024)} KB, ${written}`);
  if (social && meta.width !== 2560) console.log(`og: social is ${meta.width} x ${meta.height}; GitHub accepts the 2x card`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
