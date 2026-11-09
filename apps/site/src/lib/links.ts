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
