// Regenerates public/art/* from the repo's clay art (design/art/assets/alpha) and app
// screenshots. Each asset is trimmed to its alpha bounds and exported as AVIF + WebP at a
// few widths; src/art.json records the intrinsic sizes so <Art> can reserve space (no CLS).
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const out = resolve(here, "../public/art");
mkdirSync(out, { recursive: true });

const clay = (name) => resolve(repo, "design/art/assets/alpha", name + ".png");
const jobs = [
  // name, source, widths
  ["ducter_idle", clay("ducter_idle"), [160, 320, 480]],
  ["ducter_working", clay("ducter_working"), [160, 320, 480]],
  ["ducter_done", clay("ducter_done"), [160, 320, 480]],
  ["ducter_needsyou", clay("ducter_needsyou"), [160, 320, 480]],
  ["ducter_napping", clay("ducter_napping"), [160, 320, 480]],
  ["laptop_awake", clay("laptop_awake"), [320, 640]],
  ["mini_asleep", clay("mini_asleep"), [240, 480]],
  ["server_awake", clay("server_awake"), [240, 480]],
  ["pedestal", clay("pedestal"), [400, 800]],
  ["phone", clay("phone"), [240, 480]],
  ["ab_web", clay("ab_web"), [128, 256]],
  ["ab_remote", clay("ab_remote"), [128, 256]],
  ["ab_computer", clay("ab_computer"), [128, 256]],
  ["ab_phone_locked", clay("ab_phone_locked"), [128, 256]],
  ["ab_call_locked", clay("ab_call_locked"), [128, 256]],
  ["slot_empty", clay("slot_empty"), [128, 256]],
  ["token_orange", clay("token_orange"), [96, 192]],
  ["token_ink", clay("token_ink"), [96, 192]],
];

const manifest = {};
for (const [name, src, widths, opt = {}] of jobs) {
  let base = sharp(src);
  if (opt.trim !== false) base = base.trim({ threshold: 1 });
  const buf = await base.png().toBuffer({ resolveWithObject: true });
  const { width, height } = buf.info;
  manifest[name] = { w: width, h: height, widths: [] };
  for (const w of widths) {
    const ww = Math.min(w, width);
    const img = sharp(buf.data).resize({ width: ww });
    await img.clone().avif({ quality: 58, effort: 6 }).toFile(`${out}/${name}-${ww}.avif`);
    await img.clone().webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(`${out}/${name}-${ww}.webp`);
    manifest[name].widths.push(ww);
  }
}
writeFileSync(resolve(here, "../src/art.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "assets");
