// Environment port (system.md): resolve a task's Place into a working directory.
//   repo   -> git worktree at <dataDir>/worktrees/<taskId> on branch ducter/<slug>
//   folder -> the folder as given
//   none   -> scratch dir <dataDir>/scratch/<taskId>
import { mkdirSync, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Place } from "@ducter/protocol";

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function slugify(title: string, max = 40): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "task";
}

export async function git(cwd: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const p = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { ok: code === 0, out: out.trim(), err: err.trim() };
}

export interface ResolvedPlace {
  place: Place; // with resolved fields filled in (worktree, branch, baseBranch, absolute paths)
  cwd: string;
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
      if (p.worktree) {
        const wt = resolve(expandHome(p.worktree));
        return { place: { ...p, repoPath, worktree: wt }, cwd: wt };
      }
      const worktree = join(dataDir, "worktrees", taskId);
      let branch = p.branch ?? `ducter/${slugify(title)}`;
      if (!p.branch && existsSync(repoPath)) {
        const taken = await git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
        if (taken.ok) branch = `${branch}-${taskId}`;
      }
      let baseBranch = p.baseBranch;
      if (!baseBranch && existsSync(repoPath)) {
        const head = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
        baseBranch = head.ok && head.out !== "HEAD" ? head.out : undefined;
      }
      return { place: { ...p, repoPath, worktree, branch, baseBranch }, cwd: worktree };
    }
    case "browser":
      throw new Error("browser places are not supported by the runner yet (W5)");
  }
}

/** Create the directory / worktree. Throws with git's message on failure. */
export async function provisionPlace(r: ResolvedPlace): Promise<void> {
  const p = r.place;
  if (p.kind === "none") {
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
