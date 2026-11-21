// The projects in this computer's Ducter folder, and its folders one level at a time. D204: a
// computer says which projects it has by listing `<Ducter folder>/projects/*` (the ones Ducter
// cloned there, and anything the user put there), never by guessing where people keep code; the
// home lists its own and a worker answers the home's `repos` op (runner/src/worker-host.ts). And
// one listing for the card's 找一个文件夹… / Find a folder… (D203: the worker's `browse` op, and the
// home's own). Read-only, and only under the user's home folder.
//
// Privacy: the listing reads folder names and timestamps (stat of .git/HEAD, .git/index,
// .git/logs/HEAD) and, for each project, .git/config, .git/HEAD and the origin's HEAD to say its
// origin and default branch. It never runs git and sends nothing by itself.
import { readdirSync, readFileSync, realpathSync, statSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { normalizeRemote } from "./folder-info.ts";

/** D204: how many projects a computer reports for the New task card (most recently touched first). */
export const REPOS_REPORTED = 50;

export interface RepoHint {
  name: string; // folder name, e.g. "hawdb"
  path: string; // absolute, e.g. "/Users/ana/ducter/projects/hawdb"
  touchedAt: string; // ISO time of the newest of HEAD / index / logs/HEAD
  /** D203: the origin, normalized (host/owner/repo). */
  remote?: string;
  /** D203: what a task starts from unless picked: origin's HEAD, else main or master, else the checkout's. */
  defaultBranch?: string;
}

export interface FsLike {
  readdir(dir: string): string[];
  isDir(p: string): boolean;
  /** mtime in ms, or 0 if the path is missing. */
  mtime(p: string): number;
  /** The path with links resolved (and, on a case-insensitive disk, its real case). */
  real(p: string): string;
  /** D203: a small file's text, or undefined. */
  readText?(p: string): string | undefined;
  /** D203: the path is a symbolic link (browse resolves it before it trusts it). */
  isLink?(p: string): boolean;
  /** D203: something is at the path (a file or a folder). */
  exists?(p: string): boolean;
}

export const realFs: FsLike = {
  readdir: (d) => {
    try {
      return readdirSync(d);
    } catch {
      return [];
    }
  },
  isDir: (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  mtime: (p) => {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return 0;
    }
  },
  real: (p) => {
    try {
      return realpathSync.native(p);
    } catch {
      return p;
    }
  },
  readText: (p) => {
    try {
      const s = statSync(p);
      return s.isFile() && s.size < 256 * 1024 ? readFileSync(p, "utf8") : undefined;
    } catch {
      return undefined;
    }
  },
  isLink: (p) => {
    try {
      return lstatSync(p).isSymbolicLink();
    } catch {
      return false;
    }
  },
  exists: (p) => {
    try {
      lstatSync(p);
      return true;
    } catch {
      return false;
    }
  },
};

/** D203: the origin's URL in `.git/config`, normalized; undefined without one. */
export function originOf(config: string | undefined): string | undefined {
  if (!config) return undefined;
  let inOrigin = false;
  for (const raw of config.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inOrigin = /^\[\s*remote\s+"origin"\s*\]$/.test(line);
      continue;
    }
    const m = inOrigin ? /^url\s*=\s*(.+)$/.exec(line) : null;
    if (m) return normalizeRemote(m[1]!.replace(/^"|"$/g, "")) || undefined;
  }
  return undefined;
}

/** D203: a repo's default branch from its files alone (no git process), as repoBranches says it. */
export function defaultBranchOf(git: string, fs: FsLike): string | undefined {
  const read = (p: string) => fs.readText?.(join(git, p))?.trim();
  const has = (b: string) => (fs.exists ? fs.exists(join(git, "refs", "heads", b)) : false) || new RegExp(`\\srefs/heads/${b.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`, "m").test(read("packed-refs") ?? "");
  const origin = /^ref:\s*refs\/remotes\/origin\/(.+)$/.exec(read("refs/remotes/origin/HEAD") ?? "")?.[1];
  const head = /^ref:\s*refs\/heads\/(.+)$/.exec(read("HEAD") ?? "")?.[1];
  return [origin, "main", "master"].find((b) => b && (has(b) || b === head)) ?? head;
}

/**
 * D204: the git repos directly inside `dir` (a computer's `<Ducter folder>/projects`), most
 * recently touched first, at most `limit`, each with its origin and default branch read from its
 * files. Absolute paths. A missing folder has none.
 */
export function projectRepos(dir: string, fs: FsLike = realFs, limit = REPOS_REPORTED): RepoHint[] {
  const found: { name: string; path: string; t: number }[] = [];
  for (const name of fs.readdir(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const git = join(p, ".git");
    if (!fs.isDir(p) || !fs.isDir(git)) continue;
    found.push({ name, path: p, t: Math.max(fs.mtime(join(git, "HEAD")), fs.mtime(join(git, "index")), fs.mtime(join(git, "logs", "HEAD"))) });
  }
  return found
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map((r) => {
      const git = join(r.path, ".git");
      const hint: RepoHint = { name: r.name, path: r.path, touchedAt: new Date(r.t || 0).toISOString() };
      const remote = originOf(fs.readText?.(join(git, "config")));
      const def = defaultBranchOf(git, fs);
      if (remote) hint.remote = remote;
      if (def) hint.defaultBranch = def;
      return hint;
    });
}

/** D203: at most this many folders in one listing (the rest: `more`). */
export const BROWSE_MAX = 200;

/** D203: one folder in a listing: its name, its path, and whether it is a git repo (D455: and its origin). */
export interface BrowseFolder {
  name: string;
  path: string;
  repo?: true;
  /** D455: a repo's origin, normalized (host/owner/repo), read from its .git/config. */
  remote?: string;
}

/** D455: the repo the listed folder is in (itself, or a folder above it inside the roots). */
export interface BrowseRepo {
  root: string;
  name: string;
  remote?: string;
}

/** D203: a folder's subfolders on this computer (never its files), repos first. D455: roots, when
 *  the computer allows more than its home folder; inRepo, when the folder listed is in a repo. */
export type BrowseResult =
  | { ok: true; path: string; home: string; parent?: string; folders: BrowseFolder[]; more?: true; inRepo?: BrowseRepo; roots?: string[] }
  | { ok: false; reason: "outside" | "not_found"; message: string };

/** `inner` is `outer` or inside it (both real paths). */
const within = (outer: string, inner: string) => inner === outer || inner.startsWith(outer.endsWith("/") ? outer : outer + "/");

/**
 * D455: the folders this computer lets Ducter look through and add, set on the computer itself
 * (never by the home or a client): DUCTER_FOLDER_ROOTS, absolute paths or ~/…, separated by ":".
 * Unset or empty: the home folder alone (D203). `explicit` says whether it was set, so adding a
 * folder is confined too only where the person asked for it.
 */
export function folderRoots(env: Record<string, string | undefined> = process.env, home = homedir()): { roots: string[]; explicit: boolean } {
  const roots = String(env.DUCTER_FOLDER_ROOTS ?? "")
    .split(":")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => (r === "~" ? home : r.startsWith("~/") ? join(home, r.slice(2)) : r))
    .filter((r) => r.startsWith("/"))
    .map((r) => resolve(r));
  return roots.length ? { roots: [...new Set(roots)], explicit: true } : { roots: [home], explicit: false };
}

/** D455: the path, links resolved, is inside one of the roots (links resolved too). */
export function insideRoots(path: string, roots: string[], fs: FsLike = realFs): boolean {
  const real = fs.real(resolve(path));
  return roots.some((r) => within(fs.real(r), real));
}

/**
 * D203: the subfolders of `path` (absent or "~": the home folder), for 找一个文件夹… / Find a folder….
 * Confined to the roots (D455: the home folder unless the computer sets DUCTER_FOLDER_ROOTS): the
 * path and every listed link are resolved first, and anything that lands outside is refused (the
 * path) or left out (a link). Hidden folders are skipped; file names are never returned; at most
 * BROWSE_MAX folders, repos first, then by name. D455: a repo's origin is read from its
 * .git/config (the repo's own metadata, never a file of the person's), and the repo the listed
 * folder is in, so adding can say it adds the whole repo.
 */
export function listFolders(path: string | undefined, home = homedir(), fs: FsLike = realFs, max = BROWSE_MAX, roots: string[] = [home]): BrowseResult {
  const realHome = fs.real(home);
  const realRoots = (roots.length ? roots : [home]).map((r) => fs.real(r));
  const inside = (p: string) => realRoots.some((r) => within(r, p));
  const outside = { ok: false as const, reason: "outside" as const, message: "Only folders inside the allowed folders can be listed." };
  const raw = String(path ?? "").trim();
  // The start: the home folder when it is allowed, else the first root.
  const start = inside(realHome) ? home : realRoots[0]!;
  const given = !raw || raw === "~" ? start : raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
  if (!given.startsWith("/")) return outside;
  const asked = resolve(given);
  if (!fs.isDir(asked)) return { ok: false, reason: "not_found", message: `There's no folder at ${raw}.` };
  const dir = fs.real(asked);
  if (!inside(dir)) return outside;
  const folders: BrowseFolder[] = [];
  let more = false;
  const names = fs.readdir(dir).filter((n) => !n.startsWith(".")).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const isRepo = (p: string) => (fs.exists ? fs.exists(join(p, ".git")) : fs.isDir(join(p, ".git")));
  const remoteOf = (p: string) => (fs.isDir(join(p, ".git")) ? originOf(fs.readText?.(join(p, ".git", "config"))) : undefined);
  for (const name of names) {
    let p = join(dir, name);
    if (!fs.isDir(p)) continue; // files (and links to files) are never listed
    if (fs.isLink?.(p)) {
      const to = fs.real(p);
      if (!inside(to)) continue; // a link that leads out of the roots
      p = to;
    }
    if (folders.length >= max) {
      more = true;
      break;
    }
    const repo = isRepo(p);
    const remote = repo ? remoteOf(p) : undefined;
    folders.push({ name, path: p, ...(repo ? { repo: true as const } : {}), ...(remote ? { remote } : {}) });
  }
  folders.sort((a, b) => Number(!!b.repo) - Number(!!a.repo));
  // D455: the repo this folder is in: itself, or the nearest folder above it inside the roots.
  let inRepo: BrowseRepo | undefined;
  for (let p = dir; inside(p); p = dirname(p)) {
    if (isRepo(p)) {
      const remote = remoteOf(p);
      inRepo = { root: p, name: p.split("/").filter(Boolean).pop() ?? p, ...(remote ? { remote } : {}) };
      break;
    }
    if (dirname(p) === p) break;
  }
  const up = dirname(dir);
  const homeOnly = realRoots.length === 1 && realRoots[0] === realHome;
  return {
    ok: true,
    path: dir,
    home: realHome,
    ...(dir !== up && inside(up) ? { parent: up } : {}),
    folders,
    ...(more ? { more: true as const } : {}),
    ...(inRepo ? { inRepo } : {}),
    ...(homeOnly ? {} : { roots: realRoots }),
  };
}
