// D391: which copies of one repository this computer has. The home asks every computer
// "which clones of <remote> do you have?" (its own, and a worker's `clones` op, runner/src/
// worker-host.ts) before a task on that repository exists, so a to-do on nowledge-co/mem starts
// in the MacBook's ~/dev/mem instead of a path the partner guessed on a server.
//
// What is looked at: the Ducter folder's projects, then the folders people usually keep code in
// (~/dev, ~/code, ~/src, ~/projects, ~/work, ~/repos, ~/git, ~/github, ~/Developer, ~/workspace,
// ~/Documents/GitHub, ~/go/src/<host>/<owner>), two levels deep (~/dev/mem and ~/dev/nowledge-co/
// mem), and the home folder's own top level. Only `.git/config`'s origin is read, never a file of
// the project, and only the copies whose origin IS the asked repository are sent back: the rest of
// what is on the disk never leaves the computer (D204's privacy, kept for an exact question).
//
// And, asked with `probe`, whether this computer's git can read that repository at all
// (`git ls-remote`, its own sign-in, no prompt, 15 s), so Ducter clones it where it can.
import { join } from "node:path";
import { normalizeRemote } from "./folder-info.ts";
import { defaultBranchOf, originOf, realFs, type FsLike, type RepoHint } from "./repos.ts";
import { parseGitAddress, realGitSpawn, type GitSpawn } from "./clone.ts";
import { ghEnv } from "./tool-env.ts";

/** Where people keep code, under their home folder (the first level and the one under it). */
export const CODE_DIRS = ["dev", "code", "src", "projects", "work", "repos", "git", "github", "Developer", "workspace", "workspaces", "Projects", "Code", "Documents/GitHub", "Documents/code"];

/** At most this many folders are looked into per answer (a huge ~/dev stays cheap). */
export const CLONES_SCAN_MAX = 4000;
export const PROBE_MS = 15_000;

export interface ClonesAnswer {
  /** The copies of the asked repository here, most recently touched first (absolute paths). */
  clones: RepoHint[];
  /** With probe: this computer's git can read the repository (undefined: not asked, or couldn't say). */
  canRead?: boolean;
}

/** The host/owner/repo a remote names (`owner/repo` is GitHub's); "" when it names none. */
export function remoteKey(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  if (/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]+$/.test(s)) return `github.com/${s.replace(/\.git$/i, "")}`.toLowerCase();
  const a = parseGitAddress(s);
  return a.ok ? a.remote : normalizeRemote(s).split("/").length >= 3 ? normalizeRemote(s) : "";
}

/** D391: the copies of `remote` on this computer (see the header for where it looks). */
export function clonesOf(remote: string, home: string, ducterProjects: string | undefined, fs: FsLike = realFs, max = CLONES_SCAN_MAX): RepoHint[] {
  const want = remoteKey(remote);
  if (!want) return [];
  const seen = new Set<string>();
  const out: (RepoHint & { t: number })[] = [];
  let budget = max;
  const look = (p: string, depth: number) => {
    if (budget-- <= 0 || seen.has(p)) return;
    seen.add(p);
    if (!fs.isDir(p)) return;
    const git = join(p, ".git");
    if (fs.isDir(git)) {
      const origin = originOf(fs.readText?.(join(git, "config")));
      if (origin === want) {
        const t = Math.max(fs.mtime(join(git, "HEAD")), fs.mtime(join(git, "index")), fs.mtime(join(git, "logs", "HEAD")));
        const def = defaultBranchOf(git, fs);
        out.push({ name: p.split("/").pop()!, path: fs.real(p), touchedAt: new Date(t || 0).toISOString(), remote: origin, ...(def ? { defaultBranch: def } : {}), t });
      }
      return; // a repository's own folders are never looked into
    }
    if (depth <= 0) return;
    for (const name of fs.readdir(p)) {
      if (name.startsWith(".") || name === "node_modules" || name === "Library") continue;
      look(join(p, name), depth - 1);
    }
  };
  if (ducterProjects) look(ducterProjects, 1);
  for (const d of CODE_DIRS) look(join(home, d), 2);
  // ~/go/src/github.com/owner/repo: Go's own layout.
  const [host, owner] = want.split("/");
  if (host && owner) look(join(home, "go", "src", host, owner), 1);
  // ~/mem: a project right in the home folder.
  for (const name of fs.readdir(home)) if (!name.startsWith(".") && !CODE_DIRS.includes(name)) look(join(home, name), 0);
  const byPath = new Map<string, RepoHint & { t: number }>();
  for (const r of out) if (!byPath.has(r.path)) byPath.set(r.path, r);
  return [...byPath.values()].sort((a, b) => b.t - a.t).map(({ t: _t, ...r }) => r);
}

/** D391: this computer's git can read `remote` (its own sign-in, no prompt); undefined when it couldn't say (no git). */
export async function canReadRemote(remote: string, o: { spawn?: GitSpawn; env?: Record<string, string | undefined>; timeoutMs?: number } = {}): Promise<boolean | undefined> {
  const key = remoteKey(remote);
  const a = parseGitAddress(key.startsWith("github.com/") ? key.slice("github.com/".length) : remote);
  if (!a.ok) return false;
  const env: Record<string, string> = {
    ...ghEnv(o.env),
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "https:ssh",
    ...((o.env ?? process.env).GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: "ssh -o BatchMode=yes" }),
  };
  try {
    const r = await (o.spawn ?? realGitSpawn)(["ls-remote", "--quiet", "--", a.url, "HEAD"], { env, timeoutMs: o.timeoutMs ?? PROBE_MS });
    if (r.timedOut) return undefined;
    return r.code === 0;
  } catch {
    return undefined;
  }
}

/** D391: the answer a computer gives to "which clones of <remote> do you have" (the home's own, a worker's op). */
export async function answerClones(a: { remote?: unknown; probe?: unknown }, o: { home: string; ducterProjects?: string; fs?: FsLike; spawn?: GitSpawn }): Promise<ClonesAnswer> {
  const remote = typeof a.remote === "string" ? a.remote.slice(0, 300) : "";
  const clones = remote ? clonesOf(remote, o.home, o.ducterProjects, o.fs ?? realFs) : [];
  if (a.probe !== true || clones.length) return { clones };
  const canRead = await canReadRemote(remote, o.spawn ? { spawn: o.spawn } : {});
  return { clones, ...(canRead !== undefined ? { canRead } : {}) };
}
