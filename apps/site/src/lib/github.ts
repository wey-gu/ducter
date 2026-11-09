// Build-time facts about the GitHub repo, so the page never links to a 404.
// The repo is private until launch; the Mac app has no tagged release yet. Both flip on the
// next deploy after they change (no client-side calls, no rate limits for visitors).
export const REPO = "wey-gu/ducter";
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;

export interface RepoFacts {
  isPublic: boolean;
  /** Direct link to the latest release's .dmg, if a release with one exists. */
  dmgUrl: string | null;
  version: string | null;
}

async function get(url: string): Promise<any | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "ducter-site" };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

let cached: Promise<RepoFacts> | null = null;
export function repoFacts(): Promise<RepoFacts> {
  cached ??= (async () => {
    if (process.env.DUCTER_SITE_OFFLINE) return { isPublic: false, dmgUrl: null, version: null };
    const repo = await get(`https://api.github.com/repos/${REPO}`);
    const isPublic = !!repo && repo.private === false;
    if (!isPublic) return { isPublic, dmgUrl: null, version: null };
    const rel = await get(`https://api.github.com/repos/${REPO}/releases/latest`);
    const dmg = rel?.assets?.find((a: any) => typeof a?.name === "string" && a.name.endsWith(".dmg"));
    return { isPublic, dmgUrl: dmg?.browser_download_url ?? null, version: rel?.tag_name ?? null };
  })();
  return cached;
}
