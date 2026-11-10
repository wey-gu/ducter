// Binary files in git must be runtime or build inputs, and small. Screenshots, before/after
// pairs, recordings, archives and app builds are work evidence or output, not source (D75):
// they go to .shots/ (gitignored) or a published gallery, never a commit.
// Run: bun scripts/check-binaries.ts   (CI runs it on every push)
import { $ } from "bun";

const BINARY = /\.(png|jpe?g|webp|gif|avif|ico|icns|mp4|mov|webm|pdf|zip|gz|tgz|dmg|ttf|otf|woff2?|wasm|bin|exe|a|o|dylib|so)$/i;
const MAX = 2 * 1024 * 1024; // per file
// Where a binary may live: what the apps load at runtime, the art the builds derive from,
// and the README's own images.
const ALLOW = [
  /^apps\/desktop\/internal\/theme\//,
  /^apps\/ios\/Ducter\//,
  /^apps\/android\/app\/src\/main\/res\//, // the Android app's icon, art and font (D178)
  /^apps\/android\/gradle\/wrapper\/gradle-wrapper\.jar$/, // the build's own bootstrap
  /^apps\/web\/static\//,
  /^apps\/site\/(public|src)\//,
  /^design\/art\/assets\/alpha\//,
  /^design\/art\/concepts\/r2\/r2_(char_clay|board_2)\.jpg$/, // reference images in batch.json
  /^packages\/runner\/assets\//,
  /^scripts\/macos\/dmg\//, // the disk image's window background (make-app.sh)
  /^\.github\/readme\//,
];

const files = (await $`git ls-files -z`.text()).split("\0").filter(Boolean);
const bad: string[] = [];
for (const f of files) {
  const file = Bun.file(f);
  if (!(await file.exists())) continue;
  const isBin = BINARY.test(f) || (file.size > 0 && (await file.slice(0, 8000).bytes()).includes(0));
  if (!isBin) continue;
  if (!ALLOW.some((r) => r.test(f))) bad.push(`${f}: binary outside the allowed places`);
  else if (file.size > MAX) bad.push(`${f}: ${(file.size / 1048576).toFixed(1)} MB, over 2 MB`);
}
if (bad.length) {
  console.error(bad.join("\n") + `\n${bad.length} binary file(s) don't belong in git (see scripts/check-binaries.ts).`);
  process.exit(1);
}
console.log(`ok: ${files.length} files, binaries only where allowed`);
