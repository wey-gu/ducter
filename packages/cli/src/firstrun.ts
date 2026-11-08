// First-run hints: what the desktop's empty conversation can say about *this* machine, and the
// partner's chosen name. Both live as small JSON files in the data folder, written by `ducter up`
// and read by the client (apps/desktop/internal/hints).
//
// Privacy: repo detection is local and reads folder names and file timestamps only (stat of
// .git/HEAD, .git/index, .git/logs/HEAD). It never opens a file, runs git, or sends anything.
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HINTS_FILE = "firstrun.json";
export const PERSONA_FILE = "persona.json";

/** Where people keep code, in the order people usually mean them. */
export const REPO_ROOTS = ["dev", "code", "src", "Projects", "projects", "work", "repos", "git"];

export interface RepoHint {
  name: string; // folder name, e.g. "hawdb"
  path: string; // "~/dev/hawdb"
  touchedAt: string; // ISO time of the newest of HEAD / index / logs/HEAD
}

export interface Hints {
  version: 1;
  generatedAt: string;
  repoCount: number;
  repos: RepoHint[]; // most recently touched first, at most `limit`
}

export interface FsLike {
  readdir(dir: string): string[];
  isDir(p: string): boolean;
  /** mtime in ms, or 0 if the path is missing. */
  mtime(p: string): number;
  /** The path with links resolved (and, on a case-insensitive disk, its real case). */
  real(p: string): string;
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
};

const SKIP = new Set(["node_modules", "vendor", "target", "dist", "build", "Library"]);
const MAX_PER_ROOT = 600; // entries looked at per root, so a huge folder can't stall `up`

/** Real git checkouts (a `.git` folder; worktrees and submodules have a `.git` file) up to depth 2. */
export function findRepos(home = homedir(), fs: FsLike = realFs, limit = 3): { count: number; repos: RepoHint[] } {
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
  const tilde = (p: string) => (p.startsWith(home + "/") ? "~" + p.slice(home.length) : p);
  return {
    count: all.length,
    repos: all.slice(0, limit).map((r) => ({ name: r.name, path: tilde(r.path), touchedAt: new Date(r.t || 0).toISOString() })),
  };
}

export function buildHints(home = homedir(), fs: FsLike = realFs, now = new Date()): Hints {
  const { count, repos } = findRepos(home, fs);
  return { version: 1, generatedAt: now.toISOString(), repoCount: count, repos };
}

/** Writes atomically, so a client reading at the same moment never sees half a file. */
function writeJson(path: string, v: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, path);
}

export function writeHints(dataDir: string, hints: Hints) {
  writeJson(join(dataDir, HINTS_FILE), hints);
}

// ---------- The partner's name ----------

export interface PersonaFile {
  name?: string; // absent: the user kept the default (or Mem's name)
  askedAt?: string;
}

export function readPersonaFile(dataDir: string): PersonaFile | undefined {
  const p = join(dataDir, PERSONA_FILE);
  if (!existsSync(p)) return undefined;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return typeof j === "object" && j ? j : undefined;
  } catch {
    return undefined;
  }
}

export function writePersonaFile(dataDir: string, f: PersonaFile) {
  writeJson(join(dataDir, PERSONA_FILE), f);
}

/** A name someone typed, made safe to show: one line, no control characters, at most 24 chars. */
export function cleanName(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return [...s].slice(0, 24).join("");
}
