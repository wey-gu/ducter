// The git repos on this computer, and its folders one level at a time (D203). One scan for
// `ducter up`'s first-run hints (cli/src/firstrun.ts), the home's own New task places and a
// worker's `repos` op (runner/src/worker-host.ts), so a home on a server knows which repos the
// user's Mac has; and one listing for the card's 找一个文件夹… / Find a folder… (the worker's
// `browse` op, and the home's own). Read-only, and only under the user's home folder.
//
// Privacy: the scan reads folder names and timestamps (stat of .git/HEAD, .git/index,
// .git/logs/HEAD); with `details` it also reads .git/config, .git/HEAD and the origin's HEAD to
// say a repo's origin and default branch. It never runs git, never reads another tool's own
// folders (hidden folders are skipped) and sends nothing by itself.
import { readdirSync, readFileSync, realpathSync, statSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { normalizeRemote } from "./folder-info.ts";

/** Where people keep code, in the order people usually mean them. */
export const REPO_ROOTS = ["dev", "code", "src", "Projects", "projects", "work", "repos", "git"];

/** D203: how many repos a computer reports for the New task card (most recently touched first). */
export const REPOS_REPORTED = 20;

export interface RepoHint {
  name: string; // folder name, e.g. "hawdb"
  path: string; // "~/dev/hawdb" (absolute with `absolute`)
  touchedAt: string; // ISO time of the newest of HEAD / index / logs/HEAD
  /** D203 (details): the origin, normalized (host/owner/repo). */
  remote?: string;
  /** D203 (details): what a task starts from unless picked: origin's HEAD, else main or master, else the checkout's. */
  defaultBranch?: string;
}

export interface FsLike {
  readdir(dir: string): string[];
  isDir(p: string): boolean;
  /** mtime in ms, or 0 if the path is missing. */
  mtime(p: string): number;
  /** The path with links resolved (and, on a case-insensitive disk, its real case). */
  real(p: string): string;
  /** D203: a small file's text, or undefined (details only). */
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

const SKIP = new Set(["node_modules", "vendor", "target", "dist", "build", "Library"]);
const MAX_PER_ROOT = 600; // entries looked at per root, so a huge folder can't stall a scan

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
 * Real git checkouts (a `.git` folder; worktrees and submodules have a `.git` file) up to depth 2
 * under REPO_ROOTS, most recently touched first. details (D203): each one's origin and default
 * branch too; absolute: paths as they are, not ~/….
 */
export function findRepos(home = homedir(), fs: FsLike = realFs, limit = 3, opts: { details?: boolean; absolute?: boolean } = {}): { count: number; repos: RepoHint[] } {
  const found = new Map<string, { name: string; path: string; t: number }>();
  const seenRoots = new Set<string>();
  const visit = (dir: string, depth: number, budget: { n: number }) => {
    for (const name of fs.readdir(dir)) {
      if (budget.n-- <= 0) return;
      if (name.startsWith(".") || SKIP.has(name)) continue;
      const p = join(dir, name);
      if (!fs.isDir(p)) continue;
      const git = join(p, ".git");
      if (fs.isDir(git)) {
        const t = Math.max(fs.mtime(join(git, "HEAD")), fs.mtime(join(git, "index")), fs.mtime(join(git, "logs", "HEAD")));
        found.set(p, { name, path: p, t });
      } else if (depth < 2) visit(p, depth + 1, budget);
    }
  };
  for (const r of REPO_ROOTS) {
    const root = join(home, r);
    if (!fs.isDir(root)) continue;
    // On a case-insensitive disk ~/projects and ~/Projects are one folder; a link may alias another.
    const key = fs.real(root);
    if (seenRoots.has(key)) continue;
    seenRoots.add(key);
    visit(root, 1, { n: MAX_PER_ROOT });
  }
  const all = [...found.values()].sort((a, b) => b.t - a.t);
  const tilde = (p: string) => (!opts.absolute && p.startsWith(home + "/") ? "~" + p.slice(home.length) : p);
  return {
    count: all.length,
    repos: all.slice(0, limit).map((r) => {
      const hint: RepoHint = { name: r.name, path: tilde(r.path), touchedAt: new Date(r.t || 0).toISOString() };
      if (opts.details) {
        const git = join(r.path, ".git");
        const remote = originOf(fs.readText?.(join(git, "config")));
        const def = defaultBranchOf(git, fs);
        if (remote) hint.remote = remote;
        if (def) hint.defaultBranch = def;
      }
      return hint;
    }),
  };
}

/** D203: at most this many folders in one listing (the rest: `more`). */
export const BROWSE_MAX = 200;

/** D203: one folder in a listing: its name, its path, and whether it is a git repo. */
export interface BrowseFolder {
  name: string;
  path: string;
  repo?: true;
}

/** D203: a folder's subfolders on this computer (never its files), repos first. */
export type BrowseResult =
  | { ok: true; path: string; home: string; parent?: string; folders: BrowseFolder[]; more?: true }
  | { ok: false; reason: "outside" | "not_found"; message: string };

/** `inner` is `outer` or inside it (both real paths). */
const within = (outer: string, inner: string) => inner === outer || inner.startsWith(outer.endsWith("/") ? outer : outer + "/");

/**
 * D203: the subfolders of `path` (absent or "~": the home folder), for 找一个文件夹… / Find a folder….
 * Confined to the home folder: the path and every listed link are resolved first, and anything
 * that lands outside is refused (the path) or left out (a link). Hidden folders are skipped;
 * file names are never returned; at most BROWSE_MAX folders, repos first, then by name.
 */
export function listFolders(path: string | undefined, home = homedir(), fs: FsLike = realFs, max = BROWSE_MAX): BrowseResult {
  const realHome = fs.real(home);
  const raw = String(path ?? "").trim();
  const given = !raw || raw === "~" ? home : raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
  if (!given.startsWith("/")) return { ok: false, reason: "outside", message: "Only folders inside the home folder can be listed." };
  const asked = resolve(given);
  if (!fs.isDir(asked)) return { ok: false, reason: "not_found", message: `There's no folder at ${raw}.` };
  const dir = fs.real(asked);
  if (!within(realHome, dir)) return { ok: false, reason: "outside", message: "Only folders inside the home folder can be listed." };
  const folders: BrowseFolder[] = [];
  let more = false;
  const names = fs.readdir(dir).filter((n) => !n.startsWith(".")).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  for (const name of names) {
    let p = join(dir, name);
    if (!fs.isDir(p)) continue; // files (and links to files) are never listed
    if (fs.isLink?.(p)) {
      const to = fs.real(p);
      if (!within(realHome, to)) continue; // a link that leads out of the home folder
      p = to;
    }
    if (folders.length >= max) {
      more = true;
      break;
    }
    const repo = fs.exists ? fs.exists(join(p, ".git")) : fs.isDir(join(p, ".git"));
    folders.push({ name, path: p, ...(repo ? { repo: true as const } : {}) });
  }
  folders.sort((a, b) => Number(!!b.repo) - Number(!!a.repo));
  const up = dirname(dir);
  return { ok: true, path: dir, home: realHome, ...(dir !== realHome && within(realHome, up) ? { parent: up } : {}), folders, ...(more ? { more: true as const } : {}) };
}
