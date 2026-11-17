// Build-time facts about the GitHub repo, so the page never links to a 404.
// The download links come from the latest release's assets (the .dmg, the Linux bundles, the
// Android .apk, SHA256SUMS.txt); the fallbacks show only while no release has them. They change on
// the next deploy. The download page also asks GitHub once in the visitor's browser and moves to a
// newer release if one came out since (src/scripts/download.ts); if that call fails, these stay.
export const REPO = "wey-gu/ducter";
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;

export interface Asset {
  name: string;
  url: string;
  /** Bytes. */
  size: number;
  /** From the release's SHA256SUMS.txt, when it lists the file. */
  sha256: string | null;
}

/** The release assets the download page offers, by what they are (names from release.yml). */
export interface ReleaseAssets {
  dmg: Asset | null;
  linuxX64: Asset | null;
  linuxArm64: Asset | null;
  apk: Asset | null;
  sums: Asset | null;
}

export interface RepoFacts {
  isPublic: boolean;
  /** Direct link to the latest release's .dmg, if a release with one exists. */
  dmgUrl: string | null;
  /** Direct link to the latest release's Android app (Ducter-<v>-android.apk, D181), if it has one. */
  apkUrl: string | null;
  /** The tag, e.g. "v0.0.65". */
  version: string | null;
  /** ISO time the release was published. */
  publishedAt: string | null;
  /** The release's page on GitHub (its notes). */
  releaseUrl: string | null;
  assets: ReleaseAssets;
}

const none: ReleaseAssets = { dmg: null, linuxX64: null, linuxArm64: null, apk: null, sums: null };
const empty = (isPublic: boolean): RepoFacts => ({ isPublic, dmgUrl: null, apkUrl: null, version: null, publishedAt: null, releaseUrl: null, assets: none });

async function get(url: string, text = false): Promise<any | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "ducter-site" };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return text ? await res.text() : await res.json();
  } catch {
    return null;
  }
}

/** "<sha256>  <file>" lines, as `sha256sum` writes them. */
export function parseSums(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split("\n")) {
    const hit = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/.exec(line.trim());
    if (hit) m.set(hit[2], hit[1]);
  }
  return m;
}

/** Picks the assets by the names release.yml gives them. */
export function pickAssets(list: any[], sums: Map<string, string>): ReleaseAssets {
  const find = (test: (n: string) => boolean): Asset | null => {
    const a = list.find((x: any) => typeof x?.name === "string" && test(x.name));
    return a ? { name: a.name, url: a.browser_download_url, size: a.size ?? 0, sha256: sums.get(a.name) ?? null } : null;
  };
  return {
    dmg: find((n) => n.endsWith("-arm64.dmg") || n.endsWith(".dmg")),
    linuxX64: find((n) => n.endsWith("-linux-x64.tar.gz")),
    linuxArm64: find((n) => n.endsWith("-linux-arm64.tar.gz")),
    apk: find((n) => n.endsWith("-android.apk")),
    sums: find((n) => n === "SHA256SUMS.txt"),
  };
}

let cached: Promise<RepoFacts> | null = null;
export function repoFacts(): Promise<RepoFacts> {
  cached ??= (async () => {
    if (process.env.DUCTER_SITE_OFFLINE) return empty(false);
    const repo = await get(`https://api.github.com/repos/${REPO}`);
    const isPublic = !!repo && repo.private === false;
    if (!isPublic) return empty(isPublic);
    const rel = await get(`https://api.github.com/repos/${REPO}/releases/latest`);
    const list: any[] = Array.isArray(rel?.assets) ? rel.assets : [];
    const sumsAsset = list.find((a: any) => a?.name === "SHA256SUMS.txt");
    const sumsText = sumsAsset ? await get(sumsAsset.browser_download_url, true) : null;
    const assets = pickAssets(list, parseSums(typeof sumsText === "string" ? sumsText : ""));
    return {
      isPublic,
      dmgUrl: assets.dmg?.url ?? null,
      apkUrl: assets.apk?.url ?? null,
      version: rel?.tag_name ?? null,
      publishedAt: rel?.published_at ?? null,
      releaseUrl: rel?.html_url ?? null,
      assets,
    };
  })();
  return cached;
}

/** 71762695 → "68 MB"; 3447363 → "3.3 MB". */
export function formatSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** "2026-11-17T00:25:34Z" → "November 17, 2026" (UTC, so every build says the same). */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
