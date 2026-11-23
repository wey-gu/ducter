// Environment port (system.md): resolve a task's Place into a working directory.
//   repo   -> git worktree at <Ducter folder>/worktrees/<repo>/<slug> on branch ducter/<slug>
//             (D204, the visible ~/ducter: protocol/src/ducter-folder.ts; D198's naming). Tasks
//             from before keep their stored path (<dataDir>/worktrees/<repo>/<slug> or <taskId>)
//   folder -> the folder as given
//   none   -> scratch dir <dataDir>/scratch/<taskId>
//   browser-> scratch dir too; the browser is a cua-driver MCP sidecar (browser.ts)
import { mkdirSync, existsSync, readdirSync, realpathSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Place } from "@ducter/protocol";
import { gitEnv } from "@ducter/protocol/src/tool-env.ts";
import { ducterDataRefusal, ducterFolder, isDucterData, markDucterFolder } from "@ducter/protocol/src/ducter-folder.ts";
import { cloneRepo, cloneTarget } from "@ducter/protocol/src/clone.ts";
import { cutAtWordEnd } from "@ducter/protocol/src/names.ts";

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * D201: one readable name, in its words' own script. Letters, marks and digits of any script
 * stay (`\p{L}\p{M}\p{N}`; a path segment keeps `.`, `_` and `-` too); every run of anything
 * else is one `-`. NFC (as macOS stores names, so one name compares equal however it was typed);
 * never starts with `-`, `.` or a mark, never ends with `-` or `.`; at most `max` characters,
 * cut between graphemes and within 200 UTF-8 bytes (a file name holds 255). "" if nothing is left.
 */
export function nameSegment(s: string, opts: { path?: boolean; lowerAscii?: boolean; max?: number } = {}): string {
  let t = s.normalize("NFC");
  if (opts.lowerAscii) t = t.replace(/[A-Z]+/g, (m) => m.toLowerCase());
  t = t.replace(opts.path ? /[^\p{L}\p{M}\p{N}._-]+/gu : /[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^[-.\p{M}]+/u, "");
  const max = opts.max ?? 80;
  let out = "";
  let n = 0;
  let next = "";
  for (const { segment } of graphemes.segment(t)) {
    if (n >= max || Buffer.byteLength(out + segment) > 200) {
      next = segment;
      break;
    }
    out += segment;
    n++;
  }
  return cutAtWordEnd(out, next).replace(/[-.]+$/, "");
}


/**
 * A new task's branch is `ducter/<slugify(title)>`, and its folder that slug too (D198). D201:
 * the title's own words in their own script, ASCII letters lowercased, at most 40 characters;
 * `task` only when the title has no letter or digit at all (emoji or punctuation only).
 */
export function slugify(title: string, max = 40): string {
  return nameSegment(title, { lowerAscii: true, max }) || "task";
}

export async function git(cwd: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  // D102: git in the user's repo gets the basics and its own GIT_* settings, never Ducter's keys.
  // D415: and never an optional lock: Ducter's own reads (a status, a diff) don't refresh the
  // index, so they can't hold index.lock while a worktree is being made (hel, 2026-11-20).
  const p = Bun.spawn(["git", "-C", cwd, ...args], { env: { ...gitEnv(), GIT_OPTIONAL_LOCKS: "0" }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { ok: code === 0, out: out.trim(), err: err.trim() };
}

export interface ResolvedPlace {
  place: Place; // with resolved fields filled in (worktree, branch, baseBranch, absolute paths)
  cwd: string;
  /** D157: a task moved here from another computer: its branch comes from origin. */
  fetch?: boolean;
  /** D204: the Ducter folder the new worktree goes in (made and marked when it is provisioned). */
  folder?: string;
  /** D395: the repository is cloned into repoPath first (no computer had it). */
  clone?: { address: string; dataDir: string };
  /** D415: 清掉旧的再试 / Clear it and try again: a lock git left is removed when no git is running. */
  clearLock?: boolean;
}

/**
 * D395: a start that failed because of its place, read from its message (a worker's error comes
 * back as its words alone): no repository there, no folder, or a clone that failed.
 */
export function placeProblem(message: string): { why: PlaceWhy; path: string } | undefined {
  const m = /^(?:Error: )?not a git repository: (.+)$/m.exec(message);
  if (m) return { why: "no_repo", path: m[1]!.trim() };
  const f = /^(?:Error: )?folder does not exist: (.+)$/m.exec(message);
  if (f) return { why: "no_folder", path: f[1]!.trim() };
  const c = /^(?:Error: )?couldn't clone ([^\s:]+)/m.exec(message) ?? /^(?:Error: )?cloned (\S+) into/m.exec(message);
  if (c) return { why: "clone_failed", path: c[1]!.trim() };
  // D415: git said another git holds the repository (a lock file it found there).
  const l = /Unable to create '([^']+\.lock)': File exists/.exec(message) ?? /^(?:Error: )?the repository is busy: (.+)$/m.exec(message);
  if (l) return { why: "busy", path: l[1]!.trim() };
  // D472: a working folder that isn't there, as the agent's start or git said it (the folder a
  // task was to run in, missing on that computer: hel's /root/dev/mem read as "other" before).
  const g = /cannot change to '([^']+)': No such file or directory/.exec(message);
  if (g) return { why: "no_folder", path: g[1]!.trim() };
  const e = /ENOENT: no such file or directory, (?:chdir|uv_cwd|scandir|stat|lstat|realpath|posix_spawn)\b[^'\n]*'([^']+)'/.exec(message) ?? /no such file or directory \(cwd: ([^)]+)\)/i.exec(message);
  if (e && !/spawn \S+ ENOENT/.test(message)) return { why: "no_folder", path: e[1]!.trim() };
  return undefined;
}

export type PlaceWhy = "no_repo" | "no_folder" | "clone_failed" | "busy";
export type StartWhy = PlaceWhy | "agent" | "not_installed" | "signed_out" | "old" | "away" | "other";

/**
 * D415: every start failure, read into a word the card can say: its place (above), the agent that
 * couldn't start (its program, a sign-in, its session), its computer gone away, or something else
 * (said plainly, with 再试一次). The card never shows a bare git or stack message.
 */
export function startProblem(message: string): { why: StartWhy; path: string } {
  const p = placeProblem(message);
  if (p) return p;
  if (/can't be reached|is offline|not connected|went away|disconnected/i.test(message)) return { why: "away", path: "" };
  // D472: the common agent failures have their own word and their own fix (install it there, sign
  // in there, update that computer's Ducter), so "other" is what is truly unknown.
  if (/\bis not installed\b|command not found|spawn \S+ ENOENT|not found on PATH|needs node or the \S+ command on PATH/i.test(message)) return { why: "not_installed", path: "" };
  if (/not (?:signed|logged) in|please (?:sign|log) ?in|\b(?:sign|log) ?in (?:required|again|first)|unauthori[sz]ed|\b401\b|invalid (?:api key|credentials)|authentication (?:failed|required)|credentials? (?:expired|missing)/i.test(message)) return { why: "signed_out", path: "" };
  if (/unknown op \w+|needs a newer Ducter|unknown harness|harness \S+ is not supported/i.test(message)) return { why: "old", path: "" };
  if (/session|harness|not installed|command not found|ENOENT|spawn|signed? in|log ?in|auth|api key|quota|rate.?limit/i.test(message)) return { why: "agent", path: "" };
  return { why: "other", path: "" };
}

/** D395: a place that can't be used as it is: the reason in a word, for the task's card. */
export class PlaceError extends Error {
  override name = "PlaceError";
  constructor(
    readonly why: PlaceWhy,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/** D207: a place in Ducter's own data folder, refused before the task exists. */
export class DucterDataError extends Error {
  override name = "DucterDataError";
  constructor(readonly path: string) {
    super(ducterDataRefusal(path));
  }
}

/** Decide paths and names without touching the disk (used for task_open). */
export async function planPlace(place: Place | undefined, taskId: string, title: string, dataDir: string): Promise<ResolvedPlace> {
  const p = place ?? { kind: "none" };
  switch (p.kind) {
    case "none":
      return { place: p, cwd: join(dataDir, "scratch", taskId) };
    case "folder": {
      const path = resolve(expandHome(p.path));
      if (isDucterData(path, dataDir)) throw new DucterDataError(path);
      return { place: { ...p, path }, cwd: path };
    }
    case "repo": {
      // D395: cloned here first: the folder the clone makes (or this computer's copy already there).
      const target = p.clone && !existsSync(resolve(expandHome(p.repoPath))) ? cloneTarget(p.clone, { dataDir }) : undefined;
      const repoPath = target ?? resolve(expandHome(p.repoPath));
      if (isDucterData(repoPath, dataDir)) throw new DucterDataError(repoPath);
      // Whether Open draft PR can work at all (fresh-user QA: offered on a repo with no origin).
      const hasRemote = existsSync(repoPath) ? { hasRemote: (await git(repoPath, ["remote", "get-url", "origin"])).ok } : {};
      if (p.worktree) {
        const wt = resolve(expandHome(p.worktree));
        if (isDucterData(wt, dataDir)) throw new DucterDataError(wt);
        return { place: { ...p, repoPath, worktree: wt, ...hasRemote }, cwd: wt };
      }
      let baseBranch = p.baseBranch;
      if (!baseBranch && existsSync(repoPath)) {
        const head = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
        baseBranch = head.ok && head.out !== "HEAD" ? head.out : undefined;
      }
      // D415: a name already there is used again only when it carries nothing (a start that failed).
      const want = p.branch ?? `ducter/${slugify(title)}`;
      const branch = existsSync(repoPath) ? await freeBranch(repoPath, want, baseBranch) : want;
      void taskId;
      const folder = ducterFolder({ dataDir }).path;
      const worktree = worktreeFor(dataDir, repoPath, branch, folder);
      return { place: { ...p, repoPath, worktree, branch, baseBranch, ...hasRemote }, cwd: worktree, folder, ...(p.clone && !existsSync(repoPath) ? { clone: { address: p.clone, dataDir } } : {}) };
    }
    case "browser":
      // The browser itself is a sidecar (browser.ts); the task also gets a scratch dir.
      return { place: { ...p, device: p.device || "local", profile: p.profile || "default" }, cwd: join(dataDir, "scratch", taskId) };
  }
}

/**
 * D415: the branch a new task gets. Free: used as is. Already there but carrying nothing (no commit
 * past its base, checked out nowhere: what a start that failed left behind): used again. Taken
 * (checked out in a worktree, or with work on it): the next free `-2`, `-3`, never someone else's.
 */
export async function freeBranch(repoPath: string, want: string, base?: string): Promise<string> {
  const list = await git(repoPath, ["worktree", "list", "--porcelain"]);
  const out = new Set(list.ok ? [...list.out.matchAll(/^branch refs\/heads\/(.+)$/gm)].map((m) => m[1]!) : []);
  const usable = async (b: string) => {
    if (out.has(b) || plannedBranches.has(`${repoPath}|${b}`)) return false;
    if (!(await git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`])).ok) return true;
    const ahead = await git(repoPath, ["rev-list", "--count", `${base ?? "HEAD"}..refs/heads/${b}`]);
    return ahead.ok && ahead.out === "0";
  };
  let name = want;
  for (let n = 2; !(await usable(name)) && n < 100; n++) name = `${want}-${n}`;
  plannedBranches.add(`${repoPath}|${name}`);
  if (plannedBranches.size > 256) plannedBranches.delete(plannedBranches.values().next().value!);
  return name;
}
/** Branches planned in this process and not made yet: two tasks planned at once never share one. */
const plannedBranches = new Set<string>();

/** Paths planned in this process and not yet on disk: two tasks planned at once never share one. */
const planned = new Set<string>();

/** One path segment a person can read (D201: letters and digits of any script, `.`, `_`, `-`); never empty, `.` or `..`. */
function segment(s: string): string {
  return nameSegment(s, { path: true }) || "task";
}

/**
 * A name already taken in `dir`: on disk or planned in this process. APFS matches case and
 * Unicode form by itself; a case- and form-sensitive disk (ext4) doesn't, so the names there
 * are compared NFC too (two spellings of one title never get two folders that look the same).
 */
function taken(dir: string, name: string): boolean {
  const path = join(dir, name);
  if (existsSync(path) || planned.has(path)) return true;
  try {
    return readdirSync(dir).some((n) => n.normalize("NFC") === name);
  } catch {
    return false;
  }
}

/**
 * D198, D204: a new task's worktree is <Ducter folder>/worktrees/<repo name>/<branch slug>, so an
 * editor's recent list or Finder says which task it is. The slug is the branch's part after
 * `ducter/`; a path already there (on disk or planned) gets `-2`, `-3`. archiveWorktree removes
 * only what Ducter made (worktreesRootOf). `folder` defaults to this computer's Ducter folder.
 */
export function worktreeFor(dataDir: string, repoPath: string, branch: string, folder = ducterFolder({ dataDir }).path): string {
  const dir = join(folder, "worktrees", segment(basename(repoPath)));
  const base = segment(branch.replace(/^ducter\//, ""));
  let name = base;
  for (let n = 2; taken(dir, name); n++) name = `${base}-${n}`;
  const path = join(dir, name);
  planned.add(path);
  if (planned.size > 256) planned.delete(planned.values().next().value!);
  return path;
}

/** Working directory of an already-planned place (task recovery after a restart). */
export function cwdOf(p: Place, taskId: string, dataDir: string): string {
  switch (p.kind) {
    case "repo":
      return p.worktree ?? p.repoPath;
    case "folder":
      return p.path;
    default:
      return join(dataDir, "scratch", taskId);
  }
}

/** Create the directory / worktree. Throws with git's message on failure. */
export async function provisionPlace(r: ResolvedPlace): Promise<void> {
  const p = r.place;
  if (p.kind === "none" || p.kind === "browser") {
    mkdirSync(r.cwd, { recursive: true });
    return;
  }
  if (p.kind === "folder") {
    if (!existsSync(r.cwd)) throw new PlaceError("no_folder", r.cwd, `folder does not exist: ${r.cwd}`);
    return;
  }
  if (p.kind === "repo") {
    if (existsSync(r.cwd)) return; // explicit or already-created worktree
    // D395: no computer had it: cloned here first, into the Ducter folder, with this computer's own git.
    if (r.clone && !existsSync(p.repoPath)) {
      const c = await cloneRepo(r.clone.address, { dataDir: r.clone.dataDir });
      if (!c.ok) throw new PlaceError("clone_failed", p.repoPath, `couldn't clone ${r.clone.address}: ${c.message}`);
      if (resolve(c.path) !== resolve(p.repoPath)) throw new PlaceError("clone_failed", p.repoPath, `cloned ${r.clone.address} into ${c.path}, not ${p.repoPath}`);
    }
    const top = await git(p.repoPath, ["rev-parse", "--show-toplevel"]);
    if (!top.ok) throw new PlaceError("no_repo", p.repoPath, `not a git repository: ${p.repoPath}`);
    if (r.folder && r.cwd.startsWith(r.folder + "/")) markDucterFolder(r.folder);
    mkdirSync(join(r.cwd, ".."), { recursive: true });
    // D157: moved here from another computer: the pushed branch is the work (E3).
    if (r.fetch && p.branch) {
      const got = await git(p.repoPath, ["fetch", "origin", `${p.branch}:${p.branch}`]);
      if (!got.ok && !(await git(p.repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${p.branch}`])).ok) throw new Error(`couldn't fetch ${p.branch} from origin: ${got.err.split("\n")[0]}`);
    }
    // D415: a lock another git holds for a moment (an editor's status, a reader of the new
    // worktree) is waited out; one a dead git left is cleared when no git is running; only a lock
    // that stays is the card's 仓库正忙 / The repository is busy, with 清掉旧的再试.
    let last = "";
    for (let attempt = 0; attempt < LOCK_TRIES; attempt++) {
      const branchExists = p.branch ? (await git(p.repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${p.branch}`])).ok : false;
      const args = branchExists ? ["worktree", "add", r.cwd, p.branch!] : ["worktree", "add", r.cwd, "-b", p.branch!, p.baseBranch ?? "HEAD"];
      const res = await git(p.repoPath, args);
      // The branch is on disk now (or the add failed for good): git says from here whether it is taken.
      plannedBranches.delete(`${p.repoPath}|${p.branch}`);
      if (res.ok) return;
      last = res.err;
      const lock = lockIn(res.err);
      if (!lock) throw new Error(`git worktree add failed: ${res.err}`);
      // What the failed add left of Ducter's own: an empty folder (git removes its own record). The
      // person's other worktree records are theirs: never pruned from here.
      try {
        if (existsSync(r.cwd) && !existsSync(join(r.cwd, ".git")) && readdirSync(r.cwd).length === 0) rmdirSync(r.cwd);
      } catch {}
      const cleared = await clearStaleLock(lock, { force: !!r.clearLock });
      if (attempt < LOCK_TRIES - 1) await Bun.sleep(cleared ? 50 : LOCK_WAIT_MS * (attempt + 1));
    }
    const lock = lockIn(last) ?? p.repoPath;
    throw new PlaceError("busy", lock, `the repository is busy: ${lock}`);
  }
}

const lockIn = (err: string) => /Unable to create '([^']+\.lock)': File exists/.exec(err)?.[1];

/** D415: how many times a worktree add meets a lock before the card says the repository is busy. */
export const LOCK_TRIES = 4;
export const LOCK_WAIT_MS = 400;
/** A lock older than this, with no git running, was left by a git that died: cleared by itself. */
export const STALE_LOCK_MS = 10 * 60_000;

/** Is a git running on this computer now (whatever lock it holds is never cleared)? */
export async function gitRunning(): Promise<boolean> {
  try {
    const p = Bun.spawn(["pgrep", "-x", "git"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    if (code > 1) return true; // pgrep itself failed: assume one is, and never clear
    return out.trim().length > 0;
  } catch {
    return true;
  }
}

/**
 * D415: clear a lock git left, only when it is safe: a `.lock` file inside a repository's git folder,
 * no git running on this computer, and either old (STALE_LOCK_MS: its git died long ago) or the
 * person tapped 清掉旧的再试 (`force`). Only that file, never while a git could be holding it.
 * True when it was cleared (or is gone already).
 */
export async function clearStaleLock(lock: string, o: { force?: boolean; now?: number; running?: () => Promise<boolean> } = {}): Promise<boolean> {
  if (!lock.endsWith(".lock") || !/\/\.git\//.test(lock)) return false;
  let at: number;
  try {
    at = statSync(lock).mtimeMs;
  } catch {
    return true; // gone already: the next try goes ahead
  }
  if (!o.force && (o.now ?? Date.now()) - at < STALE_LOCK_MS) return false;
  if (await (o.running ?? gitRunning)()) return false;
  try {
    unlinkSync(lock);
    return true;
  } catch {
    return false;
  }
}

export function realpathOr(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
