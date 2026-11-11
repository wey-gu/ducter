// What a folder is, read on the computer it lives on (D186, D197): the home reads its own; a
// worker answers the home's `folderInfo` op (runner/src/worker-host.ts) for a folder on it, so a
// home on a server can add a folder on the user's Mac and offer its branches. One round of git
// calls, run together; nothing is written.
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

/** `git -C cwd …`: ok and the trimmed stdout. Injected in tests. */
export type GitRun = (cwd: string, args: string[]) => Promise<{ ok: boolean; out: string }>;

export const realGit: GitRun = async (cwd, args) => {
  try {
    const p = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    return { ok: code === 0, out: out.trim() };
  } catch {
    return { ok: false, out: "" };
  }
};

/** ~ and ~/… as this computer's home folder. */
export const expandHome = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

/** A repo's local branches, most recently committed first (at most 30), and its default one. One round of calls, run together. */
export async function repoBranches(repoPath: string, run: GitRun = realGit): Promise<{ defaultBranch?: string; branches: string[] }> {
  const [origin, refs, head] = await Promise.all([
    run(repoPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
    run(repoPath, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads"]),
    run(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);
  const all = refs.ok ? refs.out.split("\n").filter(Boolean) : [];
  const fromOrigin = origin.ok ? origin.out.replace(/^origin\//, "") : "";
  const cur = head.ok && head.out !== "HEAD" ? head.out : "";
  const def = [fromOrigin, "main", "master"].find((b) => b && all.includes(b)) ?? (cur || undefined);
  return { ...(def ? { defaultBranch: def } : {}), branches: all.slice(0, 30) };
}

/**
 * D202: a git remote URL in one form, so two clones of one repo on two computers match:
 * host/owner/repo, lowercased, without scheme, user, port, `.git` or trailing slash
 * (git@github.com:a/b.git, https://github.com/a/b and ssh://git@github.com:22/a/b are one).
 */
export function normalizeRemote(url: string): string {
  let u = url.trim();
  if (!u) return "";
  const scp = /^([^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(u); // git@host:owner/repo
  if (scp && !/^[a-z]+:\/\//i.test(u)) u = `${scp[2]}/${scp[3]}`;
  else u = u.replace(/^[a-z+]+:\/\//i, "").replace(/^[^@/]+@/, "").replace(/^([^/:]+):\d+(?=\/)/, "$1");
  return u.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
}

/** D202: the repo's origin, normalized (normalizeRemote); undefined without one. */
export async function repoRemote(repoPath: string, run: GitRun = realGit): Promise<string | undefined> {
  const r = await run(repoPath, ["remote", "get-url", "origin"]);
  const n = r.ok ? normalizeRemote(r.out.split("\n")[0] ?? "") : "";
  return n || undefined;
}

/** The top of the git checkout that holds `dir`, or undefined when it isn't in one. */
export async function repoTop(dir: string, git: GitRun = realGit): Promise<string | undefined> {
  const r = await git(resolve(expandHome(dir)), ["rev-parse", "--show-toplevel"]);
  return r.ok && r.out ? r.out : undefined;
}

/** A folder as the computer it is on sees it. root: the repo's top when the folder is inside a
 *  repo (a folder inside a repo adds the repo, D186), else the folder itself. */
export interface FolderInfo {
  exists: boolean;
  kind?: "repo" | "folder";
  root?: string;
  name?: string;
  defaultBranch?: string;
  branches?: string[];
  /** D202: the repo's origin, normalized. */
  remote?: string;
}

/** What the folder at `path` is here: missing, a plain folder, or a repo with its branches. */
export async function folderInfo(path: string, git: GitRun = realGit): Promise<FolderInfo> {
  const raw = String(path ?? "").trim();
  if (!raw) return { exists: false };
  const dir = resolve(expandHome(raw));
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return { exists: false };
  } catch {
    return { exists: false };
  }
  const top = await repoTop(dir, git);
  if (!top) return { exists: true, kind: "folder", root: dir, name: basename(dir) };
  const [b, remote] = await Promise.all([repoBranches(top, git), repoRemote(top, git)]);
  return { exists: true, kind: "repo", root: top, name: basename(top), ...(b.defaultBranch ? { defaultBranch: b.defaultBranch } : {}), ...(b.branches.length ? { branches: b.branches } : {}), ...(remote ? { remote } : {}) };
}
