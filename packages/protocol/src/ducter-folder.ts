// The Ducter folder (D204): one visible folder per computer, like Conductor's ~/conductor, that
// holds what Ducter makes there for the user to see: the projects it cloned
// (`projects/<repo>`) and the tasks' working copies (`worktrees/<repo>/<branch slug>`). The
// hidden data folder (~/.ducter) keeps the Log, settings and the rest.
//
// Which folder (`ducterFolder`), in order:
//   1. $DUCTER_FOLDER, when set (~/… allowed): exactly that.
//   2. A Ducter with a data folder of its own (not the default ~/.ducter: a test, the soak, a
//      second Ducter on one computer) keeps it inside that data folder, `<dataDir>/ducter`, so it
//      never touches the user's ~/ducter.
//   3. Else the first of ~/ducter, ~/ducter-work, ~/ducter-work-2 … that carries Ducter's marker
//      (`.ducter-folder`); none does: the first that is missing, or a folder holding nothing but
//      `projects/` and `worktrees/` (empty counts). A ~/ducter that is someone else's (a clone of
//      the ducter repo, say: anything else in it, no marker) is never touched.
// Resolving reads only; `ensureDucterFolder` makes it and writes the marker on first use.
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

/** The file that says a folder is Ducter's. */
export const FOLDER_MARKER = ".ducter-folder";
/** The folder's name in the home folder, and the fallback's when that one is someone else's. */
export const FOLDER_NAME = "ducter";
export const FALLBACK_NAME = "ducter-work";

/** What may be in a folder Ducter takes as its own without a marker. */
const SHAPE = new Set(["projects", "worktrees", FOLDER_MARKER, ".DS_Store"]);

export interface DucterFolderOpts {
  home?: string;
  /** The data folder this Ducter runs with (default ~/.ducter). */
  dataDir?: string;
  env?: Record<string, string | undefined>;
  /** Test seam: what is on disk. */
  fs?: { exists(p: string): boolean; isDir(p: string): boolean; entries(p: string): string[] };
}

const realFs: NonNullable<DucterFolderOpts["fs"]> = {
  exists: (p) => existsSync(p),
  isDir: (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  entries: (p) => {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  },
};

export interface DucterFolder {
  path: string;
  /** How it was chosen: the env, a data folder of its own, the default, or the fallback. */
  why: "env" | "data" | "default" | "fallback";
}

/** D204: this computer's Ducter folder (read-only: nothing is made). */
export function ducterFolder(o: DucterFolderOpts = {}): DucterFolder {
  const home = o.home ?? homedir();
  const env = o.env ?? process.env;
  const fs = o.fs ?? realFs;
  const set = env.DUCTER_FOLDER?.trim();
  if (set) return { path: resolve(set === "~" ? home : set.startsWith("~/") ? join(home, set.slice(2)) : set), why: "env" };
  const dataDir = resolve(o.dataDir ?? env.DUCTER_DATA_DIR ?? join(home, ".ducter"));
  if (dataDir !== resolve(home, ".ducter")) return { path: join(dataDir, FOLDER_NAME), why: "data" };
  const names = [FOLDER_NAME, FALLBACK_NAME, ...Array.from({ length: 8 }, (_, i) => `${FALLBACK_NAME}-${i + 2}`)];
  const at = names.map((n) => join(home, n));
  const ours = at.find((p) => fs.isDir(p) && fs.exists(join(p, FOLDER_MARKER)));
  // Free: missing, or a folder holding nothing but what Ducter keeps there (projects/, worktrees/:
  // the user made it by hand, or the marker was deleted).
  const free = ours ?? at.find((p) => !fs.exists(p) || (fs.isDir(p) && fs.entries(p).every((n) => SHAPE.has(n)))) ?? at[at.length - 1]!;
  return { path: free, why: free === at[0] ? "default" : "fallback" };
}

/** D204: where Ducter's clones go on this computer. */
export const projectsDir = (o: DucterFolderOpts = {}) => join(ducterFolder(o).path, "projects");
/** D204: where new tasks' working copies go on this computer. */
export const worktreesDir = (o: DucterFolderOpts = {}) => join(ducterFolder(o).path, "worktrees");

const MARKER_TEXT =
  "This folder is Ducter's: projects/ holds the projects it cloned for you (yours to keep),\n" +
  "worktrees/ the working copies of its tasks (removed when a task is archived).\n";

/** D204: the Ducter folder, made (with its marker) if it isn't there yet; its path. */
export function ensureDucterFolder(o: DucterFolderOpts = {}): string {
  return markDucterFolder(ducterFolder(o).path);
}

/** D204: `path` made if missing, and marked as Ducter's. */
export function markDucterFolder(path: string): string {
  mkdirSync(path, { recursive: true });
  const mark = join(path, FOLDER_MARKER);
  if (!existsSync(mark)) writeFileSync(mark, MARKER_TEXT);
  return path;
}

const inside = (outer: string, p: string) => p.startsWith(outer.endsWith(sep) ? outer : outer + sep);

/**
 * D204: the folder of Ducter's working copies that `worktree` is in, or undefined when Ducter
 * didn't make it: `<dataDir>/worktrees` (tasks from before D204) or `<a Ducter folder>/worktrees`
 * (one that carries the marker, so a task keeps archiving after DUCTER_FOLDER changes).
 */
export function worktreesRootOf(worktree: string, dataDir: string, exists: (p: string) => boolean = existsSync): string | undefined {
  const wt = resolve(worktree);
  const old = resolve(dataDir, "worktrees");
  if (inside(old, wt)) return old;
  for (let d = dirname(wt); d !== dirname(d); d = dirname(d))
    if (basename(d) === "worktrees" && inside(d, wt) && exists(join(dirname(d), FOLDER_MARKER))) return d;
  return undefined;
}

/** `p` with symlinks resolved as far as it exists (macOS: /var → /private/var), the rest as given. */
function realish(p: string): string {
  let cur = resolve(p);
  const rest: string[] = [];
  for (let i = 0; i < 64; i++) {
    try {
      return join(realpathSync(cur), ...rest.reverse());
    } catch {
      const up = dirname(cur);
      if (up === cur) break;
      rest.push(basename(cur));
      cur = up;
    }
  }
  return resolve(p);
}

/**
 * D207: whether `path` is Ducter's own data (the data folder itself or anything in it: the Log,
 * the partner's state, settings), where no task ever works or writes. Inside it, only what
 * Ducter keeps there for the user's work is not data: the Ducter folder when it lives in the data
 * folder (a test's or a second Ducter's, `<dataDir>/ducter`) and the working copies of tasks from
 * before D204 (`<dataDir>/worktrees`). A task with no place of its own gets `<dataDir>/scratch/<id>`
 * from the runner, never through a folder place.
 */
export function isDucterData(path: string, dataDir: string, o: Omit<DucterFolderOpts, "dataDir" | "fs"> = {}): boolean {
  const p = realish(path);
  const d = realish(dataDir);
  if (p !== d && !inside(d, p)) return false;
  for (const ok of [ducterFolder({ ...o, dataDir }).path, join(dataDir, "worktrees")]) {
    const r = realish(ok);
    if (r !== d && (p === r || inside(r, p))) return false;
  }
  return true;
}

/** D207: the one line a task_open or New task gets for a place in Ducter's data folder. */
export function ducterDataRefusal(path: string): string {
  return `${path} is Ducter's own data folder, so no task works there. For work with no folder of its own use {"kind":"none"}: the task gets an empty scratch folder of its own.`;
}
