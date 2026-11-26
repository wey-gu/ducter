// D204 (the person's folder): moving this computer's Ducter folder when they choose another place.
// `projects/` and `worktrees/` go with it, the marker is kept, and git is told where its linked
// worktrees are now (`git worktree repair`), for every repository under projects/ and every
// working copy under worktrees/. A case-only rename on a case-insensitive disk (APFS: ~/ducter is
// ~/Ducter) is two renames: to a temporary name, then to the name asked for.
//
// This module only touches the two folders; the home keeps the choice, checks that no task is
// running, and records a `folder_moved` Log event that maps the old paths to the new ones.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { FOLDER_MARKER, expandFolderPath, markDucterFolder } from "./ducter-folder.ts";
import { gitEnv } from "./tool-env.ts";
import type { GitSpawn } from "./clone.ts";

export type FolderMoveResult =
  | { ok: true; from: string; path: string; moved: boolean; projects: number; worktrees: number; repaired: number }
  | { ok: false; reason: "invalid" | "exists" | "inside" | "data" | "cross_device" | "not_dir" | "failed"; message: string };

export interface FolderMoveOpts {
  from: string;
  /** Absolute, `~` or `~/…`; relative paths are taken from the home folder. */
  to: string;
  home?: string;
  /** Refuse a target inside Ducter's own data folder (D207), when the caller has it. */
  dataDir?: string;
  /** Test seam: how `git worktree repair` runs here. */
  spawn?: GitSpawn;
  /** Test seam: the rename itself (a different disk answers EXDEV, which is refused, never copied). */
  rename?: (from: string, to: string) => void;
  env?: Record<string, string | undefined>;
}

const realGitSpawn: GitSpawn = async (args, o) => {
  const p = Bun.spawn(["git", ...args], { env: o.env, stdout: "ignore", stderr: "pipe", stdin: "ignore" });
  let timedOut = false;
  const timer = setTimeout(() => ((timedOut = true), p.kill()), o.timeoutMs);
  try {
    const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
    return { code, err: err.slice(-4000), ...(timedOut ? { timedOut } : {}) };
  } finally {
    clearTimeout(timer);
  }
};

const dirs = (p: string): string[] => {
  try {
    return readdirSync(p)
      .map((n) => join(p, n))
      .filter((x) => {
        try {
          return statSync(x).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
};

const has = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** `p` under `from` (case-insensitively on a Mac's disk), mapped to `to`; else `p` as it is. */
function under(p: string, from: string, to: string): string {
  if (p === from || p.startsWith(from.endsWith(sep) ? from : from + sep)) return to + p.slice(from.length);
  const a = from.toLowerCase();
  const b = p.toLowerCase();
  if (b === a || b.startsWith(a.endsWith(sep) ? a : a + sep)) return to + p.slice(from.length);
  return p;
}

/** `repo/.git/worktrees/<name>` in a linked worktree's `.git` file, or undefined. */
function gitDirOf(worktree: string): string | undefined {
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(join(worktree, ".git"), "utf8"));
    return m ? resolve(worktree, m[1]!) : undefined;
  } catch {
    return undefined;
  }
}

const projectCount = (folder: string) => dirs(join(folder, "projects")).length;
const worktreeCount = (folder: string) => dirs(join(folder, "worktrees")).reduce((n, r) => n + dirs(r).length, 0);

/**
 * D204: move this computer's Ducter folder to `to`, keeping `projects/` and `worktrees/`, and
 * repair git's absolute worktree paths. Makes nothing when `from` isn't there yet (a first use):
 * the target is made and marked. Never merges into a folder that holds anything.
 */
export async function moveDucterFolder(o: FolderMoveOpts): Promise<FolderMoveResult> {
  const home = o.home ?? homedir();
  const raw = typeof o.to === "string" ? o.to.trim() : "";
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: "invalid", message: "Choose a folder to keep Ducter's work in." };
  const from = resolve(o.from);
  const to = isAbsolute(raw) ? resolve(raw) : expandFolderPath(raw, home);
  const counts = () => ({ projects: projectCount(to), worktrees: worktreeCount(to) });
  if (to === resolve("/") || to === resolve(home)) return { ok: false, reason: "invalid", message: "Ducter's folder can't be the home folder or the root of the disk." };
  if (o.dataDir && (to === resolve(o.dataDir) || underFolder(resolve(o.dataDir), to))) return { ok: false, reason: "data", message: "Ducter's folder can't go inside Ducter's own data folder." };
  if (from === to) {
    if (!existsSync(from)) markDucterFolder(to);
    return { ok: true, from, path: to, moved: false, ...counts(), repaired: 0 };
  }
  const caseOnly = from.toLowerCase() === to.toLowerCase();
  if (!caseOnly && (underFolder(from, to) || underFolder(to, from))) return { ok: false, reason: "inside", message: "Ducter's folder can't be moved inside itself or over the folder that holds it." };
  // The same physical folder, whatever the spelling (a case-only rename, or a link to it).
  let same = caseOnly;
  if (existsSync(from) && existsSync(to)) {
    try {
      same = caseOnly || realpathSync.native(from) === realpathSync.native(to);
    } catch {
      same = caseOnly;
    }
  }
  if (!existsSync(from)) {
    if (existsSync(to)) {
      if (!has(to)) return { ok: false, reason: "exists", message: `${to} is a file, not a folder.` };
      if (readdirSync(to).length && !existsSync(join(to, FOLDER_MARKER)) && !dirs(to).every((p) => ["projects", "worktrees"].includes(basename(p))))
        return { ok: false, reason: "exists", message: `${to} already has things in it. Choose an empty folder or a new name.` };
      markDucterFolder(to);
      return { ok: true, from, path: to, moved: false, ...counts(), repaired: 0 };
    }
    mkdirSync(dirname(to), { recursive: true });
    markDucterFolder(to);
    return { ok: true, from, path: to, moved: true, projects: 0, worktrees: 0, repaired: 0 };
  }
  if (!has(from)) return { ok: false, reason: "not_dir", message: `${from} is not a folder.` };
  if (!same && existsSync(to)) {
    if (!has(to)) return { ok: false, reason: "exists", message: `${to} is a file, not a folder.` };
    if (readdirSync(to).length) return { ok: false, reason: "exists", message: `${to} already has things in it. Choose an empty folder or a new name.` };
    rmdirSync(to);
  }
  const rename = o.rename ?? renameSync;
  try {
    if (same) {
      // APFS is usually case-insensitive: rename to a temporary name first, then to the one asked for.
      const temp = join(dirname(from), `.${basename(from)}.move-${process.pid}-${Date.now().toString(36)}`);
      rename(from, temp);
      try {
        rename(temp, to);
      } catch (err) {
        try {
          rename(temp, from);
        } catch {}
        throw err;
      }
    } else {
      mkdirSync(dirname(to), { recursive: true });
      rename(from, to);
    }
  } catch (err) {
    // A tree of repositories is never copied silently: a person can move it themselves and choose it here.
    if ((err as NodeJS.ErrnoException).code === "EXDEV") return { ok: false, reason: "cross_device", message: "Another disk: move the folder there yourself, then choose it here." };
    return { ok: false, reason: "failed", message: (err as Error).message };
  }
  markDucterFolder(to);
  const repaired = await repairWorktrees(from, to, o.spawn ?? realGitSpawn, o.env ?? process.env);
  return { ok: true, from, path: to, moved: true, ...counts(), repaired };
}

/**
 * D204: `git worktree repair` after a move: once for each repository under `projects/`, and once
 * for each working copy under `worktrees/` (its repository is read from the copy's own .git file,
 * then mapped out of the old folder). Returns how many runs git accepted.
 */
export async function repairWorktrees(from: string, to: string, spawn: GitSpawn = realGitSpawn, env: Record<string, string | undefined> = process.env): Promise<number> {
  const run = (args: string[]) => spawn(args, { env: { ...gitEnv(env), GIT_OPTIONAL_LOCKS: "0" }, timeoutMs: 120_000 });
  let repaired = 0;
  // A .git file written before the move may use the disk's real path (/private/var for /var).
  let fromReal = from;
  try {
    fromReal = realpathSync.native(from);
  } catch {}
  const worktrees = dirs(join(to, "worktrees")).flatMap((repo) => dirs(repo));
  const wtsByRepo = new Map<string, string[]>();
  for (const wt of worktrees) {
    const gitdir = gitDirOf(wt);
    if (!gitdir) continue;
    // <repo>/.git/worktrees/<name>: three folders up is the repository.
    const oldRepo = dirname(dirname(dirname(gitdir)));
    const repo = under(under(oldRepo, from, to), fromReal, to);
    const use = existsSync(join(repo, ".git")) ? repo : existsSync(join(oldRepo, ".git")) ? oldRepo : undefined;
    if (!use) continue;
    wtsByRepo.set(use, [...(wtsByRepo.get(use) ?? []), wt]);
  }
  // From each main repository, with each of its new worktree paths: both its .git/worktrees/<name>/gitdir
  // and the worktree's own .git file point at the new place.
  const repos = new Set([...dirs(join(to, "projects")).filter((p) => existsSync(join(p, ".git"))), ...wtsByRepo.keys()]);
  for (const repo of repos) {
    const paths = wtsByRepo.get(repo) ?? [];
    if (!paths.length) {
      if ((await run(["-C", repo, "worktree", "repair"])).code === 0) repaired++;
      continue;
    }
    for (const wt of paths) if ((await run(["-C", repo, "worktree", "repair", wt])).code === 0) repaired++;
  }
  // And from each working copy itself, which git accepts once its .git file is repaired above.
  for (const wts of wtsByRepo.values()) for (const wt of wts) if ((await run(["-C", wt, "worktree", "repair"])).code === 0) repaired++;
  return repaired;
}

/** D204: whether `p` is inside `folder` (a path prefix on a folder boundary); used by the home's checks. */
export function underFolder(folder: string, p: string): boolean {
  const a = resolve(folder);
  const b = resolve(p);
  return b === a || b.startsWith(a.endsWith(sep) ? a : a + sep);
}
