// Copies the art, fonts and sound the video uses from where they live in the repo into public/
// (gitignored). Nothing here is drawn for the video: it is Ducter's own clay art, the title
// moment's layers and sound (D87), the site's fonts, and the README's product shots.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../..");
const out = resolve(import.meta.dir, "../public");
const theme = "apps/desktop/internal/theme";

const files: Record<string, string> = {
  "title/sky.webp": `${theme}/art/title/sky.webp`,
  "title/island.webp": `${theme}/art/title/island.webp`,
  "title/ducter.webp": `${theme}/art/title/ducter.webp`,
  "title/ducter_closed.webp": `${theme}/art/title/ducter_closed.webp`,
  "title/logo.webp": `${theme}/art/title/logo.webp`,
  "title/logo_lit.webp": `${theme}/art/title/logo_lit.webp`,
  "sound/title.wav": `${theme}/sound/title.wav`,
  "fonts/bricolage.woff2": "apps/site/public/fonts/bricolage.woff2",
  "fonts/jetbrains-mono.woff2": "apps/site/public/fonts/jetbrains-mono.woff2",
  "shots/on-hand.webp": ".github/readme/on-hand.webp",
  "shots/task.webp": ".github/readme/task.webp",
};
for (const pose of ["idle", "idle_closed", "working", "needsyou", "done", "waiting", "napping"]) {
  files[`ducter/${pose}.png`] = `${theme}/art/ducter_${pose}@400.png`;
}
for (const name of [
  "island_big@1280", "island_small@1280", "laptop_awake@640", "server_awake@640", "mini_awake@640",
  "mini_asleep@640", "phone@640", "ab_remote@640", "ab_web@640", "coin_claude_code@256", "coin_codex@256",
  "coin_pi@256", "coin_deepseek_harness@256", "coin_sheen@256", "wait_ci@256", "wait_clock@256",
]) {
  files[`clay/${name.split("@")[0]}.png`] = `${theme}/art/clay/${name}.png`;
}

let n = 0;
for (const [to, from] of Object.entries(files)) {
  const src = join(repo, from);
  if (!existsSync(src)) throw new Error(`missing ${from}`);
  const dst = join(out, to);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  n++;
}
console.log(`assets: ${n} files in public/`);
