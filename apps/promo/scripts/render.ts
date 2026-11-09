// Renders the launch video, 16:9 and 1:1, to .shots/promo (D75: renders stay out of git).
// Uses the Remotion CLI (it runs on Node, which renders reliably; Bun's runtime loses the browser).
//   bun scripts/render.ts                 both cuts
//   COMP=Launch bun scripts/render.ts     one cut
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const out = resolve(process.env.DUCTER_SHOTS_DIR ?? resolve(root, "../../.shots"), "promo");
mkdirSync(out, { recursive: true });

for (const id of (process.env.COMP ?? "Launch,LaunchSquare").split(",")) {
  const file = resolve(out, `ducter-${id === "Launch" ? "launch-16x9" : "launch-1x1"}.mp4`);
  execFileSync("npx", ["remotion", "render", id, file, "--crf=18", "--concurrency=4"], { cwd: root, stdio: "inherit" });
}
