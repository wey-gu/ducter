// Copies the launch film from its GitHub release into public/film/ before a build, so the page
// plays it from ducter.ai itself. GitHub serves release assets as attachments
// (application/octet-stream), which Safari and iOS refuse to play inline. D75 keeps the video out
// of git; public/film/ is generated and gitignored. Fails soft: with no film, the page shows the
// poster linking to the release.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const film = JSON.parse(readFileSync(join(site, "src", "lib", "film.json"), "utf8"));
// `cut` marks a re-render over the same asset: a new path, since /film/ is cached immutable
const dir = film.cut ? `${film.release}-${film.cut}` : film.release;
const outDir = join(site, "public", "film", dir);
const out = join(outDir, film.file);
const url = `https://github.com/wey-gu/ducter/releases/download/${film.release}/${film.file}`;

function isMp4(buf) {
  return buf.length >= 8 && buf.subarray(4, 8).toString("latin1") === "ftyp";
}

if (existsSync(out) && statSync(out).size > 100_000 && isMp4(readFileSync(out).subarray(0, 16))) {
  console.log(`film: ${film.file} already in public/film/${dir}/`);
  process.exit(0);
}
if (process.env.DUCTER_SITE_OFFLINE) {
  console.log("film: offline; the page shows the poster");
  process.exit(0);
}
try {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "ducter-site" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100_000 || !isMp4(buf)) throw new Error("not an MP4");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${out}.part`, buf);
  renameSync(`${out}.part`, out);
  console.log(`film: ${film.file} (${(buf.length / 1e6).toFixed(1)} MB) → public/film/${dir}/`);
} catch (err) {
  rmSync(`${out}.part`, { force: true });
  console.warn(`film: could not fetch ${url} (${err.message}); the page shows the poster`);
}
