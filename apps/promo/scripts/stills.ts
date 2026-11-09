// The storyboard: one still per scene (or the frames given), for both cuts, and a contact sheet
// of each. Output goes to .shots/promo/stills (D75: evidence stays out of git).
//   bun scripts/stills.ts                 one still per scene, near its end
//   bun scripts/stills.ts Decide:60 End:90   given frames within given scenes
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { SCENES, X, startOf } from "../src/timeline";

const repo = resolve(import.meta.dir, "../../..");
const out = resolve(process.env.DUCTER_SHOTS_DIR ?? resolve(repo, ".shots"), "promo/stills");
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const picks: [string, number][] = args.length
  ? args.map((a) => { const [n, f] = a.split(":"); return [n, Number(f)]; })
  : SCENES.map(([n, d]) => [n, Math.round((d - X) * 0.82)]);
const only = (process.env.COMP ?? "Launch,LaunchSquare").split(",");

const serveUrl = await bundle({ entryPoint: resolve(import.meta.dir, "../src/index.ts") });
for (const id of only) {
  const composition = await selectComposition({ serveUrl, id });
  const files: string[] = [];
  for (const [i, [name, f]] of picks.entries()) {
    const frame = startOf(name as never) + f;
    const output = resolve(out, `${id}-${String(i + 1).padStart(2, "0")}-${name}-${f}.png`);
    await renderStill({ serveUrl, composition, frame, output });
    files.push(output);
    console.log(output);
  }
  if (!args.length) {
    // a contact sheet: 2 columns for 16:9, 5 for 1:1
    const cols = composition.width === composition.height ? 5 : 2;
    const w = composition.width === composition.height ? 432 : 960;
    const h = Math.round((w * composition.height) / composition.width);
    const inputs = files.flatMap((f) => ["-i", f]);
    const scaled = files.map((_, i) => `[${i}]scale=${w}:${h}[s${i}]`).join(";");
    const layout = files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join("|");
    const sheet = resolve(out, `${id}-storyboard.png`);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", `${scaled};${files.map((_, i) => `[s${i}]`).join("")}xstack=inputs=${files.length}:layout=${layout}`, sheet]);
    console.log(sheet);
  }
}
