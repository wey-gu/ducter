// Environment port (system.md): resolve a task's Place into a working directory.
//   repo   -> git worktree at <dataDir>/worktrees/<repo>/<slug> on branch ducter/<slug> (D198;
//             tasks from before it keep <dataDir>/worktrees/<taskId>, their stored path)
//   folder -> the folder as given
//   none   -> scratch dir <dataDir>/scratch/<taskId>
//   browser-> scratch dir too; the browser is a cua-driver MCP sidecar (browser.ts)
import { mkdirSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Place } from "@ducter/protocol";
import { gitEnv } from "@ducter/protocol/src/tool-env.ts";

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
  for (const { segment } of graphemes.segment(t)) {
    if (n >= max || Buffer.byteLength(out + segment) > 200) break;
    out += segment;
    n++;
  }
  return out.replace(/[-.]+$/, "");
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
  const p = Bun.spawn(["git", "-C", cwd, ...args], { env: gitEnv(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { ok: code === 0, out: out.trim(), err: err.trim() };
}

export interface ResolvedPlace {
  place: Place; // with resolved fields filled in (worktree, branch, baseBranch, absolute paths)
  cwd: string;
  /** D157: a task moved here from another computer: its branch comes from origin. */
  fetch?: boolean;
}

/** Decide paths and names without touching the disk (used for task_open). */
export async function planPlace(place: Place | undefined, taskId: string, title: string, dataDir: string): Promise<ResolvedPlace> {
  const p = place ?? { kind: "none" };
  switch (p.kind) {
    case "none":
      return { place: p, cwd: join(dataDir, "scratch", taskId) };
    case "folder": {
      const path = resolve(expandHome(p.path));
      return { place: { ...p, path }, cwd: path };
    }
    case "repo": {
      const repoPath = resolve(expandHome(p.repoPath));
      // Whether Open draft PR can work at all (fresh-user QA: offered on a repo with no origin).
      const hasRemote = existsSync(repoPath) ? { hasRemote: (await git(repoPath, ["remote", "get-url", "origin"])).ok } : {};
      if (p.worktree) {
        const wt = resolve(expandHome(p.worktree));
        return { place: { ...p, repoPath, worktree: wt, ...hasRemote }, cwd: wt };
      }
      let branch = p.branch ?? `ducter/${slugify(title)}`;
      if (!p.branch && existsSync(repoPath)) {
        const taken = await git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
        if (taken.ok) branch = `${branch}-${taskId}`;
      }
      const worktree = worktreeFor(dataDir, repoPath, branch);
      let baseBranch = p.baseBranch;
      if (!baseBranch && existsSync(repoPath)) {
        const head = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
        baseBranch = head.ok && head.out !== "HEAD" ? head.out : undefined;
      }
      return { place: { ...p, repoPath, worktree, branch, baseBranch, ...hasRemote }, cwd: worktree };
    }
    case "browser":
      // The browser itself is a sidecar (browser.ts); the task also gets a scratch dir.
      return { place: { ...p, device: p.device || "local", profile: p.profile || "default" }, cwd: join(dataDir, "scratch", taskId) };
  }
}

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
 * D198: a new task's worktree is <dataDir>/worktrees/<repo name>/<branch slug>, so an editor's
 * recent list or Finder says which task it is. The slug is the branch's part after `ducter/`;
 * a path already there (on disk or planned) gets `-2`, `-3`. Still under <dataDir>/worktrees,
 * where archiveWorktree removes only what Ducter made.
 */
export function worktreeFor(dataDir: string, repoPath: string, branch: string): string {
  const dir = join(dataDir, "worktrees", segment(basename(repoPath)));
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
    if (!existsSync(r.cwd)) throw new Error(`folder does not exist: ${r.cwd}`);
    return;
  }
  if (p.kind === "repo") {
    if (existsSync(r.cwd)) return; // explicit or already-created worktree
    const top = await git(p.repoPath, ["rev-parse", "--show-toplevel"]);
    if (!top.ok) throw new Error(`not a git repository: ${p.repoPath}`);
    mkdirSync(join(r.cwd, ".."), { recursive: true });
    // D157: moved here from another computer: the pushed branch is the work (E3).
    if (r.fetch && p.branch) {
      const got = await git(p.repoPath, ["fetch", "origin", `${p.branch}:${p.branch}`]);
      if (!got.ok && !(await git(p.repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${p.branch}`])).ok) throw new Error(`couldn't fetch ${p.branch} from origin: ${got.err.split("\n")[0]}`);
    }
    const branchExists = p.branch ? (await git(p.repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${p.branch}`])).ok : false;
    const args = branchExists
      ? ["worktree", "add", r.cwd, p.branch!]
      : ["worktree", "add", r.cwd, "-b", p.branch!, p.baseBranch ?? "HEAD"];
    const res = await git(p.repoPath, args);
    if (!res.ok) throw new Error(`git worktree add failed: ${res.err}`);
  }
}

export function realpathOr(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
