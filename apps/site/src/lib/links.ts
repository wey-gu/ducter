import { existsSync } from "node:fs";
import { join } from "node:path";
import film from "./film.json";
import { repoFacts, RELEASES_URL, REPO_URL } from "./github";

/** The download and source links every page shows, decided once at build time. */
export async function siteLinks() {
  const facts = await repoFacts();
  const dl = facts.dmgUrl
    ? { href: facts.dmgUrl, label: "Download for Mac", note: facts.version ? `${facts.version} · macOS` : "macOS" }
    : { href: "#install", label: "Get Ducter", note: "The Mac download is coming soon. You can build it from source today." };
  // Shown always: the repo opens with the first release, before a deploy with this link.
  const gh = { href: REPO_URL, label: "GitHub" };
  return { facts, dl, gh, releases: RELEASES_URL };
}

/**
 * The launch film (D75 keeps the video out of git). Its source of truth is a GitHub release asset
 * (src/lib/film.json); scripts/film.mjs copies it into public/film/ at build time, because GitHub
 * serves assets as downloads that Safari and iOS won't play inline. `src` is null when that copy
 * failed, and the page then shows the poster linking to the release. See design/site-audit-2026-11.md.
 */

export function launchFilm() {
  // Astro builds from apps/site, so the working directory is the site root.
  const local = join(process.cwd(), "public", "film", film.release, film.file);
  const release = `https://github.com/wey-gu/ducter/releases/tag/${film.release}`;
  return { src: existsSync(local) ? `/film/${film.release}/${film.file}` : null, poster: film.poster, seconds: film.seconds, release };
}
