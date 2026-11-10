// What the newest Ducter release is (D148). The home reads GitHub's releases/latest for
// wey-gu/ducter (else the releases/latest redirect, which names the version but carries no
// notes), at most every hour, and keeps the answer and when it was read in
// <dataDir>/updates/latest.json; the cards say "up to date" only with that time beside it. Offline,
// rate-limited or refused: silent, the last answer stays. DUCTER_UPDATE_CHECK=off never asks.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bareVersion, compareVersions, isVersion } from "@ducter/protocol/src/version.ts";

export const REPO = "wey-gu/ducter";
export const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
export const PAGE_LATEST = `https://github.com/${REPO}/releases/latest`;
export const CHECK_EVERY_MS = 60 * 60_000;
/** Opening Devices or Updates and about reads it again when the last answer is older than this. */
export const FRESH_MS = 15 * 60_000;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** What's new in a release, short and in each language (never the other language as a stand-in). */
export type ReleaseNotes = { zh?: string[]; en?: string[] };

export interface Release {
  version: string;
  /** What's new, from the notes' whats-new block: per language, at most two whole lines. */
  notes: ReleaseNotes;
  security: boolean;
  url: string; // the release page
  assets?: string[]; // file names, when the API answered
}

/** The longest line a card shows whole (zh counts each character, en each letter). */
export const NOTE_MAX = { zh: 40, en: 80 } as const;

/**
 * What's new, as the release says it in each language: the CHANGELOG section's whats-new block
 * (an HTML comment, so the release page doesn't show it twice):
 *
 *     <!-- whats-new
 *     zh: 每件事都说清楚在哪台电脑上做。
 *     en: Each task says which computer it runs on.
 *     -->
 *
 * At most two lines per language, each kept whole (never cut mid-sentence); a line longer than a
 * card shows is left out. No block: no notes (the release's English body is never shown as them).
 */
export function whatsNew(body: string | undefined, max = 2): ReleaseNotes {
  const m = /<!--\s*whats-new\b([\s\S]*?)-->/.exec(body ?? "");
  const out: ReleaseNotes = {};
  for (const raw of (m?.[1] ?? "").split(/\r?\n/)) {
    const l = /^\s*(zh|en)\s*[:：]\s*(.+?)\s*$/.exec(raw);
    if (!l) continue;
    const lang = l[1] as "zh" | "en";
    const line = l[2]!;
    if ([...line].length > NOTE_MAX[lang]) continue;
    const list = (out[lang] ??= []);
    if (list.length < max) list.push(line);
  }
  return out;
}

/** Some language has a line (a saved answer from before D172 has a plain list: none). */
export const hasNotes = (n: ReleaseNotes | string[] | undefined): n is ReleaseNotes => !!n && !Array.isArray(n) && Boolean(n.zh?.length || n.en?.length);

/** A release says it fixes a security problem: in its name, a heading, or a line that starts with it. */
export function isSecurity(body: string | undefined, name?: string): boolean {
  if (name && /\bsecurity\b|安全/i.test(name)) return true;
  return (body ?? "").split(/\r?\n/).some((l) => /^\s*(#+\s*|[-*]\s*)?(\*\*)?(security|安全)\b/i.test(l));
}

/**
 * The newest published release, or undefined when there is none (no releases, a private repo: the
 * API says 404). Throws when GitHub can't be reached at all.
 */
export async function fetchLatest(fetch: Fetch, o: { api?: string; page?: string } = {}): Promise<Release | undefined> {
  const api = o.api ?? API_LATEST;
  const page = o.page ?? PAGE_LATEST;
  let apiErr: unknown;
  try {
    const r = await fetch(api, { headers: { accept: "application/vnd.github+json", "user-agent": "ducter-updater" }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) return undefined;
    if (r.ok) {
      const j: any = await r.json();
      if (j?.draft || j?.prerelease) return undefined;
      const version = bareVersion(String(j?.tag_name ?? ""));
      if (!isVersion(version)) return undefined;
      return {
        version,
        notes: whatsNew(j.body),
        security: isSecurity(j.body, j.name),
        url: typeof j.html_url === "string" ? j.html_url : `https://github.com/${REPO}/releases/tag/v${version}`,
        assets: Array.isArray(j.assets) ? j.assets.map((a: any) => String(a?.name ?? "")).filter(Boolean) : undefined,
      };
    }
    apiErr = new Error(`GitHub answered ${r.status}`);
  } catch (err) {
    apiErr = err;
  }
  // No API (a rate limit): the release page redirects to …/releases/tag/vX.
  try {
    const r = await fetch(page, { redirect: "manual", headers: { "user-agent": "ducter-updater" }, signal: AbortSignal.timeout(10_000) });
    const to = r.headers.get("location") ?? (r.redirected ? r.url : "");
    const m = /\/releases\/tag\/v?([^/?#]+)$/.exec(to);
    if (m && isVersion(m[1])) return { version: bareVersion(m[1]!), notes: {}, security: false, url: to };
    if (r.status === 404) return undefined;
  } catch {}
  throw apiErr instanceof Error ? apiErr : new Error(String(apiErr));
}

export interface ReleaseWatch {
  /** The newest release as last read (undefined: none, or never read). */
  latest(): Release | undefined;
  checkedAt(): string | undefined;
  /** Reads GitHub again when the last answer is older than an hour (force: now). Never throws. */
  check(force?: boolean): Promise<Release | undefined>;
  /** latest is newer than v. */
  newer(v: string): boolean;
  /** Told after every answer (the version, or only when it was read, changed). */
  onChange(fn: () => void): () => void;
  stop(): void;
}

interface Saved {
  release?: Release;
  checkedAt: string;
}

export function createReleaseWatch(o: { dataDir: string; fetch?: Fetch; now?: () => number; env?: Record<string, string | undefined>; everyMs?: number; timer?: boolean }): ReleaseWatch {
  const env = o.env ?? process.env;
  const now = o.now ?? Date.now;
  const fetchFn = o.fetch ?? ((u, i) => fetch(u, i));
  const off = /^(0|off|false|no)$/i.test((env.DUCTER_UPDATE_CHECK ?? "").trim());
  const every = o.everyMs ?? CHECK_EVERY_MS;
  const file = join(o.dataDir, "updates", "latest.json");
  // Tests and a local mirror only: a feed on this machine (as the app's DUCTER_UPDATE_FEED).
  const feed = env.DUCTER_UPDATE_FEED && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(env.DUCTER_UPDATE_FEED) ? env.DUCTER_UPDATE_FEED : undefined;
  let saved: Saved | undefined;
  try {
    if (existsSync(file)) saved = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const fns = new Set<() => void>();
  let inflight: Promise<Release | undefined> | undefined;

  const persist = () => {
    try {
      mkdirSync(join(o.dataDir, "updates"), { recursive: true });
      writeFileSync(file + ".tmp", JSON.stringify(saved, null, 2));
      renameSync(file + ".tmp", file);
    } catch {}
  };

  const check = async (force = false): Promise<Release | undefined> => {
    if (off) return saved?.release;
    const age = saved ? now() - Date.parse(saved.checkedAt) : Infinity;
    if (!force && age < every) return saved?.release;
    inflight ??= (async () => {
      try {
        const release = await fetchLatest(fetchFn, feed ? { api: feed, page: feed } : {});
        saved = { ...(release ? { release } : {}), checkedAt: new Date(now()).toISOString() };
        persist();
        // Every answer: the cards say when it was read ("checked just now").
        for (const fn of fns) queueMicrotask(fn);
      } catch {
        // Offline or refused: keep what we knew; try again at the next tick.
      } finally {
        inflight = undefined;
      }
      return saved?.release;
    })();
    return inflight;
  };

  const timer = o.timer === false || off ? undefined : setInterval(() => void check(), Math.min(every, 60 * 60_000));
  (timer as any)?.unref?.();
  if (o.timer !== false) void check();

  return {
    latest: () => saved?.release,
    checkedAt: () => saved?.checkedAt,
    check,
    newer: (v) => Boolean(saved?.release && compareVersions(saved.release.version, v) > 0),
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop: () => clearInterval(timer),
  };
}
