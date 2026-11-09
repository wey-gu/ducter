// Regenerates public/art/* from the repo's clay art (design/art/assets/alpha, and the app's
// runtime art for the not-yet abilities). Each asset is trimmed to its alpha bounds and exported as AVIF + WebP at a
// few widths; src/art.json records the intrinsic sizes so <Art> can reserve space (no CLS).
// The idle face also gets its closed eyes (D77's blink): tools/art/eyes.py makes them from the
// same trimmed render, as a layer that is transparent everywhere but the eyes, and gives the lid
// boxes, which art.json keeps for <Blink>.
import sharp from "sharp";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const out = resolve(here, "../public/art");
mkdirSync(out, { recursive: true });

const clay = (name) => resolve(repo, "design/art/assets/alpha", name + ".png");
// The not-yet look of an ability (desaturated, a little see-through) has no alpha master: it is
// made for the app at 640 (apps/desktop/internal/theme/art/clay), which is plenty for the web.
const app = (name) => resolve(repo, "apps/desktop/internal/theme/art/clay", name + "@640.png");
const coin = (name) => resolve(repo, "apps/desktop/internal/theme/art/clay", name + "@256.png");
const jobs = [
  // name, source, widths
  ["ducter_idle", clay("ducter_idle"), [160, 320, 480]],
  ["ducter_working", clay("ducter_working"), [160, 320, 480]],
  ["ducter_done", clay("ducter_done"), [160, 320, 480]],
  ["ducter_needsyou", clay("ducter_needsyou"), [160, 320, 480]],
  ["ducter_napping", clay("ducter_napping"), [160, 320, 480]],
  // The Isles (D81): the islands, the devices standing on them, the abilities' objects on the
  // water in front of home, the AI accounts' tokens.
  ["island_big", clay("island_big"), [480, 960]],
  ["island_small", clay("island_small"), [240, 480]],
  ["laptop_awake", clay("laptop_awake"), [320, 640]],
  ["mini_asleep", clay("mini_asleep"), [240, 480]],
  ["server_awake", clay("server_awake"), [240, 480]],
  ["phone", clay("phone"), [120, 240]],
  ["ab_web", clay("ab_web"), [160, 320]],
  ["ab_remote", clay("ab_remote"), [160, 320]],
  ["ab_web_later", app("ab_web_later"), [128, 256]],
  ["ab_computer_later", app("ab_computer_later"), [128, 256]],
  ["ab_phone_later", app("ab_phone_later"), [128, 256]],
  ["ab_call_later", app("ab_call_later"), [128, 256]],
  ["slot_empty", clay("slot_empty"), [160, 320]],
  // Each AI agent's own coin (tools/art/coins.py makes them at 256 for the app; no larger master).
  ["coin_claude_code", coin("coin_claude_code"), [96, 192]],
  ["coin_codex", coin("coin_codex"), [96, 192]],
  // What a wait waits for (On hand): a cloud for a CI run.
  ["wait_ci", clay("wait_ci"), [64, 128]],
];

const manifest = {};
const encode = async (name, png, widths, width) => {
  const done = [];
  for (const w of widths) {
    const ww = Math.min(w, width);
    const img = sharp(png).resize({ width: ww });
    await img.clone().avif({ quality: 58, effort: 6 }).toFile(`${out}/${name}-${ww}.avif`);
    await img.clone().webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(`${out}/${name}-${ww}.webp`);
    done.push(ww);
  }
  return done;
};
for (const [name, src, widths, opt = {}] of jobs) {
  let base = sharp(src);
  if (opt.trim !== false) base = base.trim({ threshold: 1 });
  const buf = await base.png().toBuffer({ resolveWithObject: true });
  const { width, height } = buf.info;
  manifest[name] = { w: width, h: height, widths: await encode(name, buf.data, widths, width) };
  if (name === "ducter_idle") {
    // The closed eyes, from the very pixels just encoded.
    const tmp = mkdtempSync(join(tmpdir(), "ducter-eyes-"));
    try {
      await sharp(buf.data).png().toFile(join(tmp, "open.png"));
      const eyes = resolve(repo, "tools/art/eyes.py");
      const lids = JSON.parse(execFileSync("python3", [eyes, "--layer", join(tmp, "open.png"), join(tmp, "closed.png")], { encoding: "utf8" }));
      const closed = await sharp(join(tmp, "closed.png")).png().toBuffer();
      const done = await encode("ducter_idle_closed", closed, widths, width);
      manifest.ducter_idle_closed = { w: width, h: height, widths: done, lids };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}
writeFileSync(resolve(here, "../src/art.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "assets");
