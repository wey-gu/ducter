import { repoFacts, RELEASES_URL, REPO_URL } from "./github";

/** The download and source links every page shows, decided once at build time. */
export async function siteLinks() {
  const facts = await repoFacts();
  const dl = facts.dmgUrl
    ? { href: facts.dmgUrl, label: "Download for Mac", note: facts.version ? `${facts.version} · macOS` : "macOS" }
    : { href: "#install", label: "Get Ducter", note: "The Mac download is coming soon. You can build it from source today." };
  const gh = facts.isPublic ? { href: REPO_URL, label: "GitHub" } : { href: "#open", label: "Source" };
  return { facts, dl, gh, releases: RELEASES_URL };
}
