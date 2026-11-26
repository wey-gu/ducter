// Integrating a task's branch outside its worktree: merge into the base branch in the user's
// checkout (local, reversible with git) and open a draft PR (push + gh: an outside effect).
// Never forces anything; every refusal says what to do in plain words.
import { existsSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BranchChanges, CopyFacts, Place } from "@ducter/protocol";
import { ghEnv } from "@ducter/protocol/src/tool-env.ts";
import { worktreesRootOf } from "@ducter/protocol/src/ducter-folder.ts";
import { git } from "./places.ts";

export interface ActionResult {
  ok: boolean;
  message: string;
  ref?: string; // merge commit or PR URL
}

type RepoPlace = Extract<Place, { kind: "repo" }>;

/** A ref name the model wrote must not read as an option to git or gh (`--receive-pack=…`). */
const asOption = (s: string | undefined) => s != null && s.trimStart().startsWith("-");

function repoOf(place: Place): RepoPlace | undefined {
  if (place.kind !== "repo" || !place.branch || !place.worktree) return undefined;
  return asOption(place.branch) || asOption(place.baseBranch) ? undefined : place;
}

/** Files git lists (tab-indented) under a "would be overwritten" error, at most a few. */
function listedFiles(out: string, after: RegExp): string {
  const lines = out.split("\n");
  const i = lines.findIndex((l) => after.test(l));
  const files = i < 0 ? [] : lines.slice(i + 1).filter((l) => /^\s+\S/.test(l)).map((l) => l.trim());
  const shown = files.slice(0, 3).join(", ");
  return files.length > 3 ? `${shown} and ${files.length - 3} more` : shown;
}

/** What to tell the user when git merge said no: the actual reason, in plain words. */
export function mergeRefusal(out: string, branch: string, base: string, started: boolean): string {
  if (/untracked working tree files would be overwritten/i.test(out)) {
    const f = listedFiles(out, /untracked working tree files would be overwritten/i);
    return `Your checkout of ${base} has files git doesn't track that ${branch} would overwrite${f ? ` (${f})` : ""}. Move or delete them, then try again. Nothing changed.`;
  }
  if (/local changes to the following files would be overwritten/i.test(out)) {
    const f = listedFiles(out, /local changes to the following files would be overwritten/i);
    return `Your checkout of ${base} has uncommitted changes${f ? ` in ${f}` : ""} that the merge would overwrite. Commit or stash them, then try again. Nothing changed.`;
  }
  if (started || /CONFLICT|Automatic merge failed/.test(out))
    return `${branch} doesn't merge cleanly into ${base}: both changed the same lines. Nothing changed; ask the task to rebase onto ${base}.`;
  const first = out.split("\n").map((l) => l.trim()).find((l) => /^(fatal|error):/.test(l)) ?? out.trim().split("\n")[0] ?? "";
  return `git couldn't merge ${branch} into ${base}: ${first.replace(/^(fatal|error):\s*/, "")}. Nothing changed.`;
}

/** What the task branch holds that its base doesn't: commits ahead and uncommitted work in its
 *  worktree. Cheap (two git calls); undefined when it can't tell (no base, no worktree). */
export async function branchChanges(place: Place): Promise<BranchChanges | undefined> {
  const p = repoOf(place);
  if (!p || !p.baseBranch) return undefined;
  const fork = await forkPoint(p.worktree!, p.baseBranch);
  const [ahead, status] = await Promise.all([
    git(p.worktree!, ["rev-list", "--count", fork ? `${fork}..${p.branch}` : `${p.baseBranch}..${p.branch}`]),
    git(p.worktree!, ["status", "--porcelain"]),
  ]);
  if (!ahead.ok || !status.ok) return undefined;
  const commits = Number(ahead.out);
  if (!Number.isFinite(commits)) return undefined;
  return { commits, uncommitted: status.out.length > 0, ...(await diffStat(p.worktree!, p.baseBranch, fork)) };
}

/**
 * D471: where the task's work starts: the merge base with its base branch, or with the base's
 * remote-tracking branch when that is newer. A task that pulled the remote's main into its branch
 * (agents do, to work on fresh code) shares the remote's history with it; against a local main
 * left weeks behind, the old merge base counted every upstream change as the task's own (the
 * author's board read millions of lines). The newer of the two is a descendant of the other.
 */
export async function forkPoint(worktree: string, base: string): Promise<string | undefined> {
  const [local, remote] = await Promise.all([git(worktree, ["merge-base", base, "HEAD"]), git(worktree, ["merge-base", `origin/${base}`, "HEAD"])]);
  const l = local.ok && local.out ? local.out : undefined;
  const r = remote.ok && remote.out ? remote.out : undefined;
  if (!l || !r || l === r) return l ?? r;
  return (await git(worktree, ["merge-base", "--is-ancestor", l, r])).ok ? r : l;
}

/** D128: files, lines added and removed since the branch left its base, committed or not
 *  (tracked files; a new file counts once it is added). Two more git calls; {} on failure. */
export async function diffStat(worktree: string, base: string, fork?: string): Promise<{ files?: number; adds?: number; dels?: number }> {
  const from = fork ?? (await forkPoint(worktree, base));
  if (!from) return {};
  const d = await git(worktree, ["diff", "--shortstat", from]);
  return d.ok ? parseShortstat(d.out) : {};
}

/** " 3 files changed, 42 insertions(+), 7 deletions(-)" → { files: 3, adds: 42, dels: 7 }; "" → zeros. */
export function parseShortstat(out: string): { files: number; adds: number; dels: number } {
  const n = (re: RegExp) => Number(out.match(re)?.[1] ?? 0);
  return { files: n(/(\d+) files? changed/), adds: n(/(\d+) insertions?\(\+\)/), dels: n(/(\d+) deletions?\(-\)/) };
}

/** Merge the task branch into its base branch in the user's own checkout. */
export async function mergeTaskBranch(place: Place): Promise<ActionResult> {
  const p = repoOf(place);
  if (!p) return { ok: false, message: "This task has no branch to merge." };
  const base = p.baseBranch;
  if (!base) return { ok: false, message: `I don't know which branch ${p.branch} should go into. Merge it by hand: git merge ${p.branch}` };
  const pending = await git(p.worktree!, ["status", "--porcelain", "--untracked-files=no"]);
  if (pending.ok && pending.out) return { ok: false, message: `The task still has uncommitted changes on ${p.branch}. Ask it to commit first.` };
  const head = await git(p.repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!head.ok) return { ok: false, message: `${p.repoPath} is not a git checkout any more.` };
  if (head.out !== base) return { ok: false, message: `Your checkout is on ${head.out}, not ${base}. Switch to ${base} (git switch ${base}) and try again.` };
  const dirty = await git(p.repoPath, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty.out) return { ok: false, message: `Your checkout of ${base} has uncommitted changes. Commit or stash them, then try again.` };
  const ahead = await git(p.repoPath, ["rev-list", "--count", `${base}..${p.branch}`]);
  if (ahead.ok && ahead.out === "0") return { ok: false, message: `${p.branch} has nothing that ${base} doesn't already have.` };
  const merged = await git(p.repoPath, ["merge", "--no-ff", "--no-edit", p.branch!]);
  if (!merged.ok) {
    // Only a merge that started (conflicts) leaves something to abort; git refuses the others
    // before touching anything.
    const started = (await git(p.repoPath, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])).ok;
    if (started) await git(p.repoPath, ["merge", "--abort"]);
    return { ok: false, message: mergeRefusal(merged.out + "\n" + merged.err, p.branch!, base, started) };
  }
  const ref = (await git(p.repoPath, ["rev-parse", "HEAD"])).out;
  return { ok: true, message: `Merged ${p.branch} into ${base}.`, ref };
}

async function run(cmd: string[], cwd: string): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    // D102: gh gets git's environment and its own GH_* settings and token, never Ducter's keys.
    const proc = Bun.spawn(cmd, { cwd, env: ghEnv(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { ok: code === 0, out: out.trim(), err: err.trim() };
  } catch (err) {
    return { ok: false, out: "", err: (err as Error).message };
  }
}

/** Push the task branch and open a draft PR with gh. An outside effect: callers log it. */
/**
 * D157 (E3): before a repo task moves to another computer, its branch goes to origin. Only
 * committed work moves; uncommitted changes stop the move (the task commits first).
 */
export async function pushForMove(place: Place): Promise<ActionResult> {
  const p = repoOf(place);
  if (!p) return { ok: false, message: "This task has no branch to move." };
  const remote = await git(p.repoPath, ["remote", "get-url", "origin"]);
  if (!remote.ok) return { ok: false, message: "This repo has no origin remote, so its branch can't move to another computer." };
  const pending = await git(p.worktree!, ["status", "--porcelain", "--untracked-files=no"]);
  if (pending.out) return { ok: false, message: `The task has uncommitted changes on ${p.branch}. Ask it to commit first, then move it.` };
  const pushed = await git(p.worktree!, ["push", "-u", "origin", p.branch!]);
  if (!pushed.ok) return { ok: false, message: `Pushing ${p.branch} failed: ${pushed.err.split("\n")[0]}` };
  const host = /github\.com/i.test(remote.out) ? "GitHub" : /gitlab/i.test(remote.out) ? "GitLab" : "origin";
  return { ok: true, message: `Pushed ${p.branch} to ${host}.`, ref: p.branch };
}

/** D596: a PR opened under the person's standing go: the task's own title and body, ready for review (not a draft). */
export interface PrOptions {
  title?: string;
  body?: string;
  ready?: boolean;
}

export async function openDraftPr(place: Place, opts: { gh?: string } & PrOptions = {}): Promise<ActionResult> {
  const p = repoOf(place);
  if (!p) return { ok: false, message: "This task has no branch to open a PR from." };
  const gh = opts.gh ?? "gh";
  const auth = await run([gh, "auth", "status"], p.repoPath);
  if (!auth.ok) {
    const missing = /ENOENT|not found|No such file/i.test(auth.err);
    return {
      ok: false,
      message: missing
        ? "GitHub CLI isn't installed on this computer. Install it (macOS: brew install gh; Ubuntu: sudo apt install gh), run ducter git login here, then try again."
        : "This computer isn't signed in to GitHub. Run ducter git login here, or Sign in to GitHub when you clone in New task, then try again.",
    };
  }
  const remote = await git(p.repoPath, ["remote", "get-url", "origin"]);
  if (!remote.ok) return { ok: false, message: "This repo has no origin remote to push to." };
  // D596: only the task's own branch: never its base, never the remote's default branch.
  const head = await git(p.repoPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const defaultBranch = head.ok ? head.out.trim().replace(/^origin\//, "") : undefined;
  if (p.branch === p.baseBranch || (defaultBranch && p.branch === defaultBranch)) return { ok: false, message: `${p.branch} is the repository's own branch, not this task's: nothing was pushed.` };
  const pending = await git(p.worktree!, ["status", "--porcelain", "--untracked-files=no"]);
  if (pending.out) return { ok: false, message: `The task still has uncommitted changes on ${p.branch}. Ask it to commit first.` };
  // Never --force: a push the remote refuses stays refused, and the message says why.
  const pushed = await git(p.worktree!, ["push", "-u", "origin", p.branch!]);
  if (!pushed.ok) return { ok: false, message: `Pushing ${p.branch} failed: ${pushed.err.split("\n")[0]}` };
  const title = opts.title?.trim().slice(0, 200);
  const args = [gh, "pr", "create", ...(opts.ready ? [] : ["--draft"]), ...(title ? ["--title", title, "--body", opts.body?.trim().slice(0, 8000) || title] : ["--fill"]), "--head", p.branch!]; // else title/body from the commits
  if (p.baseBranch) args.push("--base", p.baseBranch);
  const pr = await run(args, p.worktree!);
  if (!pr.ok) return { ok: false, message: `The branch is pushed, but gh couldn't open the PR: ${pr.err.split("\n")[0]}` };
  const url = pr.out.split("\n").find((l) => /^https?:\/\//.test(l.trim()))?.trim() ?? pr.out;
  return { ok: true, message: `Opened a ${opts.ready ? "" : "draft "}PR for ${p.branch}.`, ref: url };
}

/**
 * After a merge the task is archived (product-model "Archive and disk"): its worktree is removed
 * and its branch kept, so a follow-up adds the worktree back from the branch. Only a worktree
 * Ducter made (D204: under <Ducter folder>/worktrees, or <dataDir>/worktrees for tasks from
 * before; at any depth, D198's <repo>/<slug> too) is removed, never with --force: uncommitted or
 * untracked files keep it, and the message says so. ok with removed false: nothing to remove.
 */
export async function archiveWorktree(place: Place, dataDir: string, o: { unstarted?: boolean } = {}): Promise<ActionResult & { removed: boolean; bytes?: number; gone?: boolean }> {
  const p = repoOf(place);
  if (!p) return { ok: true, removed: false, message: "No worktree to remove." };
  const wt = resolve(p.worktree!);
  const root = worktreesRootOf(wt, dataDir);
  if (!root) return { ok: true, removed: false, message: `Kept ${wt}: Ducter didn't make that worktree.` };
  if (!existsSync(wt)) {
    // D514: the folder went by other hands; only its own record in the repository goes (never a
    // repository-wide prune: the person's other worktree records are theirs, D415).
    const cleared = await dropRecord(p.repoPath, wt);
    return { ok: true, removed: false, ...(cleared ? { gone: true } : {}), message: cleared ? "The worktree was already gone; its record is cleared." : "The worktree was already gone." };
  }
  const status = await git(wt, ["status", "--porcelain"]);
  if (!status.ok) return { ok: false, removed: false, message: `Kept the worktree ${wt}: git couldn't read it (${status.err.split("\n")[0]}).` };
  if (status.out) {
    const n = status.out.split("\n").filter(Boolean).length;
    return { ok: false, removed: false, message: `Kept the worktree ${wt}: it has ${n} uncommitted or untracked file${n === 1 ? "" : "s"}. ${p.branch} stays.` };
  }
  // D514: what git status doesn't show but a removal would lose, and a copy git is busy in.
  const g = await copyGuards(wt, p.branch!);
  if (g.busy) return { ok: false, removed: false, message: `Kept the worktree ${wt}: ${g.busy}.` };
  if (g.otherBranch) return { ok: false, removed: false, message: `Kept the worktree ${wt}: it is on ${g.otherBranch} now, not ${p.branch}.` };
  if (g.hidden) return { ok: false, removed: false, message: `Kept the worktree ${wt}: ${g.hidden} file${g.hidden === 1 ? " is" : "s are"} marked so git status doesn't show changes to ${g.hidden === 1 ? "it" : "them"}, or a repository sits in an ignored folder.` };
  // D514: commits that are nowhere else (no remote has them, its base doesn't hold them) keep it:
  // the branch would still hold them, but the copy is where the person would look for them.
  const ahead = await unpushedCommits(wt, p.branch!, p.baseBranch);
  if (ahead === null) return { ok: false, removed: false, message: `Kept the worktree ${wt}: git couldn't say whether its commits are pushed.` };
  if (ahead > 0) return { ok: false, removed: false, message: `Kept the worktree ${wt}: it has ${ahead} commit${ahead === 1 ? "" : "s"} not pushed anywhere and not in ${p.baseBranch ?? "its base"}. ${p.branch} stays.` };
  const bytes = await sizeOnDisk(wt);
  const removed = await git(p.repoPath, ["worktree", "remove", wt]);
  if (!removed.ok) return { ok: false, removed: false, message: `Kept the worktree ${wt}: ${removed.err.split("\n")[0]}` };
  // D198: <worktrees>/<repo>/<slug>: the repo's folder goes once it holds nothing.
  const parent = dirname(wt);
  if (parent !== root) {
    try {
      if (readdirSync(parent).length === 0) rmdirSync(parent);
    } catch {}
  }
  // Never briefed: the branch Ducter made for it goes while it is still where its base is (no
  // commit of its own; `-d` refuses anything else).
  if (o.unstarted && p.branch?.startsWith("ducter/") && p.baseBranch) {
    const [tip, base] = await Promise.all([git(p.repoPath, ["rev-parse", `refs/heads/${p.branch}`]), git(p.repoPath, ["rev-parse", `refs/heads/${p.baseBranch}`])]);
    if (tip.ok && base.ok && tip.out === base.out && (await git(p.repoPath, ["branch", "-d", p.branch])).ok) return { ok: true, removed: true, bytes, message: `Removed the worktree and ${p.branch}.` };
  }
  return { ok: true, removed: true, bytes, message: `Removed the worktree; ${p.branch} stays.` };
}

/**
 * D514: commits in the copy (its HEAD and its branch) that are in no remote-tracking branch and
 * not in its base (local or origin's). null: git couldn't tell (then the copy stays).
 */
export async function unpushedCommits(wt: string, branch: string, base?: string): Promise<number | null> {
  const has = async (ref: string) => (await git(wt, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).ok;
  const tips = ["HEAD", ...((await has(`refs/heads/${branch}`)) ? [`refs/heads/${branch}`] : [])];
  const bases: string[] = [];
  if (base && !asOption(base)) for (const b of [`refs/heads/${base}`, `refs/remotes/origin/${base}`]) if (await has(b)) bases.push(b);
  const r = await git(wt, ["rev-list", "--count", ...tips, "--not", "--remotes", ...bases]);
  if (!r.ok) return null;
  const n = Number(r.out.trim());
  return Number.isFinite(n) ? n : null;
}

/** A folder's size on disk in bytes (`du -sk`), undefined when it can't be read. */
export async function sizeOnDisk(path: string): Promise<number | undefined> {
  try {
    const p = Bun.spawn(["du", "-sk", path], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    const k = Number(out.trim().split(/\s+/)[0]);
    return Number.isFinite(k) ? k * 1024 : undefined;
  } catch {
    return undefined;
  }
}

/** Is `wt` one of the repository's own worktree records? */
async function recorded(repoPath: string, wt: string): Promise<boolean> {
  const list = await git(repoPath, ["worktree", "list", "--porcelain"]);
  if (!list.ok) return false;
  return list.out.split("\n").some((l) => l.startsWith("worktree ") && resolve(l.slice(9)) === wt);
}

/** D514: the record of one of Ducter's worktrees whose folder is gone, and only that one. */
async function dropRecord(repoPath: string, wt: string): Promise<boolean> {
  if (!existsSync(repoPath) || !(await recorded(repoPath, wt))) return false;
  if ((await git(repoPath, ["worktree", "remove", wt])).ok) return true;
  // git checks a copy is clean before it removes it, which a missing folder can't answer; with
  // nothing on disk there is nothing to lose, so the record alone goes.
  return !existsSync(wt) && (await git(repoPath, ["worktree", "remove", "--force", wt])).ok;
}

/**
 * D514: what the computer that holds a copy says of it, right before a tidy decides: Ducter's or
 * not, there or not, files changed, commits nowhere else, its size. Read-only.
 */
export async function copyFacts(place: Place, dataDir: string): Promise<CopyFacts | undefined> {
  const p = repoOf(place);
  if (!p) return undefined;
  const wt = resolve(p.worktree!);
  if (!worktreesRootOf(wt, dataDir)) return { ours: false, exists: existsSync(wt), dirty: 0, unpushed: 0 };
  if (!existsSync(wt)) return { ours: true, exists: false, dirty: 0, unpushed: 0 };
  const status = await git(wt, ["status", "--porcelain"]);
  if (!status.ok) return { ours: true, exists: true, dirty: 0, unpushed: null };
  const g = await copyGuards(wt, p.branch!);
  const dirty = status.out.split("\n").filter(Boolean).length + g.hidden;
  const unpushed = await unpushedCommits(wt, p.branch!, p.baseBranch);
  const bytes = await sizeOnDisk(wt);
  return { ours: true, exists: true, dirty, unpushed, ...(g.busy ? { busy: true } : {}), ...(g.otherBranch ? { otherBranch: g.otherBranch } : {}), ...(bytes !== undefined ? { bytes } : {}) };
}

/**
 * D514: what `git status` doesn't say but `git worktree remove` would lose, and a copy git is busy
 * in. busy: a rebase, merge, cherry-pick, revert or bisect halfway (its progress and any autostash
 * live only there), or the index locked. otherBranch: HEAD is on another branch than the task's (its
 * Continue would come back on the task's). hidden: files marked assume-unchanged or skip-worktree
 * (status never reports their changes; a sparse checkout's own marks don't count), and
 * repositories inside ignored folders (removal deletes ignored files without asking).
 */
export async function copyGuards(wt: string, branch: string): Promise<{ busy?: string; otherBranch?: string; hidden: number }> {
  const paths = await git(wt, ["rev-parse", "--git-path", "rebase-merge", "--git-path", "rebase-apply", "--git-path", "MERGE_HEAD", "--git-path", "MERGE_AUTOSTASH", "--git-path", "CHERRY_PICK_HEAD", "--git-path", "REVERT_HEAD", "--git-path", "BISECT_LOG", "--git-path", "index.lock"]);
  if (!paths.ok) return { busy: "git couldn't read it", hidden: 0 };
  const states = paths.out.split("\n").filter(Boolean).map((s) => resolve(wt, s));
  const lock = states.pop();
  if (states.some((s) => existsSync(s))) return { busy: "a rebase, merge or bisect is halfway there", hidden: 0 };
  if (lock && existsSync(lock)) return { busy: "its git index is locked", hidden: 0 };
  const head = await git(wt, ["symbolic-ref", "--quiet", "HEAD"]);
  const on = head.ok ? head.out.replace(/^refs\/heads\//, "") : "";
  const otherBranch = on && on !== branch ? on : undefined;
  const sparse = (await git(wt, ["config", "--bool", "core.sparseCheckout"])).out === "true";
  const flagged = await git(wt, ["ls-files", "-v"]);
  // Lowercase tags are assume-unchanged; "S" is skip-worktree.
  let hidden = flagged.ok ? flagged.out.split("\n").filter((l) => /^[a-z] /.test(l) || (!sparse && /^S /.test(l))).length : 0;
  const ignored = await git(wt, ["status", "--porcelain", "--ignored=matching"]);
  if (ignored.ok)
    for (const l of ignored.out.split("\n")) {
      if (!l.startsWith("!! ")) continue;
      const rel = l.slice(3).replace(/^"|"$/g, "");
      if (rel.endsWith("/") && existsSync(join(wt, rel, ".git"))) hidden++;
    }
  return { ...(otherBranch ? { otherBranch } : {}), hidden };
}
