// D476: which repository a name is, from everything Ducter already knows, never a guess.
//
// hel, 2026-11-22: a task was to work in /root/dev/mem, which wasn't on hel. "mem" was the
// person's nowledge-co/mem: their Mac had it as /Users/weyl/dev/nowledge-mem with that origin, and
// On hand listed it as the project nowledge-mem. Ducter only looked for a project named exactly
// "mem" with its origin saved, found none, and so couldn't clone it onto hel; the partner moved the
// work to the Mac instead. Here every place Ducter knows a repository from is asked: the projects
// the person added (their saved origin, or the folder's own origin read where it is), and the
// repositories tasks worked in (a clone's address, or the folder's origin). A name matches a
// repository by its own name ("mem" for nowledge-co/mem), its project's or folder's name, or a word
// of that name ("mem" in nowledge-mem); the person's words ("Nowledge Mem") narrow it. Two
// repositories that fit equally are never picked between: the partner asks once, naming both.
import { basename } from "node:path";
import type { Place } from "@ducter/protocol";
import { remoteKey } from "@ducter/protocol/src/clones.ts";

export interface KnownSource {
  /** A name for it: the project's, or the folder's. */
  name: string;
  /** Its origin when already known (normalized or not). */
  remote?: string;
  /** Where it is, to read its origin there when it isn't known. */
  device?: string;
  path?: string;
}

export type RepoKnown = { remote: string } | { ambiguous: string[] } | undefined;

const norm = (s: string) => s.toLowerCase().replace(/\.git$/, "");
const squash = (s: string) => norm(s).replace(/[\s_.\-/]+/g, "");
const tokens = (s: string) => norm(s).split(/[\s_.\-/]+/).filter(Boolean);
/** "github.com/nowledge-co/mem" -> "nowledge-co/mem". */
export const shortRemote = (r: string) => remoteKey(r).replace(/^github\.com\//, "") || r;

/** The places a repository was seen: the projects (added) and the repositories tasks worked in. */
export function sourcesOf(projects: { name: string; place: Place; remote?: string }[], places: Place[]): KnownSource[] {
  const out: KnownSource[] = [];
  const seen = new Set<string>();
  const add = (s: KnownSource) => {
    const k = `${s.remote ? remoteKey(s.remote) : ""}\u0000${s.device ?? ""}\u0000${s.path ?? ""}\u0000${s.name}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  for (const p of projects) {
    const path = p.place.kind === "repo" ? p.place.repoPath : p.place.kind === "folder" ? p.place.path : "";
    const device = "device" in p.place ? p.place.device || "local" : "local";
    add({ name: p.name, ...(p.remote ? { remote: p.remote } : {}), ...(path ? { device, path } : {}) });
  }
  for (const pl of places) {
    if (pl.kind !== "repo" || !pl.repoPath) continue;
    add({ name: basename(pl.repoPath), ...(pl.clone ? { remote: pl.clone } : {}), device: pl.device || "local", path: pl.repoPath });
  }
  return out;
}

/**
 * The repository a name is. Sources without an origin are read where they are (folderRemote,
 * bounded by its own timeout); one that can't be read is left out.
 */
export async function whichRepo(
  a: { name?: string; words?: string[] },
  sources: KnownSource[],
  folderRemote?: (device: string, path: string) => Promise<string | undefined>,
): Promise<RepoKnown> {
  const name = norm(a.name ?? "").trim();
  const words = (a.words ?? []).join("\n");
  const said = squash(words);
  const saidTokens = new Set(tokens(words));
  // Each source with its origin (read once per place).
  const read = new Map<string, Promise<string | undefined>>();
  const withRemote = await Promise.all(
    sources.map(async (s) => {
      if (s.remote) return { s, remote: remoteKey(s.remote) || s.remote };
      if (!folderRemote || !s.device || !s.path) return { s, remote: undefined };
      const k = `${s.device}\u0000${s.path}`;
      if (!read.has(k)) read.set(k, folderRemote(s.device, s.path).catch(() => undefined));
      const r = await read.get(k)!;
      return { s, remote: r ? remoteKey(r) || r : undefined };
    }),
  );
  const known = withRemote.filter((x): x is { s: KnownSource; remote: string } => !!x.remote);
  if (!known.length) return undefined;
  const names = (x: { s: KnownSource; remote: string }) => [norm(x.s.name), norm(basename(x.remote)), ...(x.s.path ? [norm(basename(x.s.path))] : [])];
  // Tiers, best first: the name exactly; a word of it; then the person's words alone.
  const exact = name ? known.filter((x) => names(x).includes(name)) : [];
  const word = name && !exact.length ? known.filter((x) => names(x).some((n) => tokens(n).includes(name))) : [];
  const inWords = known.filter((x) => names(x).some((n) => (n.length >= 3 && said.includes(squash(n))) || saidTokens.has(n)));
  const tier = exact.length ? exact : word.length ? word : name ? [] : inWords;
  const distinct = (xs: { remote: string }[]) => [...new Set(xs.map((x) => x.remote))];
  let fits = distinct(tier);
  // The person's words narrow two that fit ("Nowledge Mem" over someone-else/mem).
  if (fits.length > 1) {
    const narrowed = distinct(tier.filter((x) => inWords.includes(x)));
    if (narrowed.length) fits = narrowed;
  }
  if (fits.length === 1) return { remote: fits[0]! };
  if (fits.length > 1) return { ambiguous: fits.map(shortRemote).sort() };
  return undefined;
}
