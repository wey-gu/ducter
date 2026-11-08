// Integrating a task's branch outside its worktree: merge into the base branch in the user's
// checkout (local, reversible with git) and open a draft PR (push + gh: an outside effect).
// Never forces anything; every refusal says what to do in plain words.
import type { Place } from "@ducter/protocol";
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
    await git(p.repoPath, ["merge", "--abort"]);
    return { ok: false, message: `${p.branch} doesn't merge cleanly into ${base} (conflicts). Nothing changed; ask the task to rebase onto ${base}.` };
  }
  const ref = (await git(p.repoPath, ["rev-parse", "HEAD"])).out;
  return { ok: true, message: `Merged ${p.branch} into ${base}.`, ref };
}

async function run(cmd: string[], cwd: string): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { ok: code === 0, out: out.trim(), err: err.trim() };
  } catch (err) {
    return { ok: false, out: "", err: (err as Error).message };
  }
}

/** Push the task branch and open a draft PR with gh. An outside effect: callers log it. */
export async function openDraftPr(place: Place, opts: { gh?: string } = {}): Promise<ActionResult> {
  const p = repoOf(place);
  if (!p) return { ok: false, message: "This task has no branch to open a PR from." };
  const gh = opts.gh ?? "gh";
  const auth = await run([gh, "auth", "status"], p.repoPath);
  if (!auth.ok) {
    const missing = /ENOENT|not found|No such file/i.test(auth.err);
    return {
      ok: false,
      message: missing
        ? "GitHub CLI isn't installed. Install it (brew install gh), run gh auth login, then try again."
        : "GitHub CLI isn't signed in. Run gh auth login in a terminal, then try again.",
    };
  }
  const remote = await git(p.repoPath, ["remote", "get-url", "origin"]);
  if (!remote.ok) return { ok: false, message: "This repo has no origin remote to push to." };
  const pending = await git(p.worktree!, ["status", "--porcelain", "--untracked-files=no"]);
  if (pending.out) return { ok: false, message: `The task still has uncommitted changes on ${p.branch}. Ask it to commit first.` };
  const pushed = await git(p.worktree!, ["push", "-u", "origin", p.branch!]);
  if (!pushed.ok) return { ok: false, message: `Pushing ${p.branch} failed: ${pushed.err.split("\n")[0]}` };
  const args = [gh, "pr", "create", "--draft", "--fill", "--head", p.branch!]; // title/body from the commits
  if (p.baseBranch) args.push("--base", p.baseBranch);
  const pr = await run(args, p.worktree!);
  if (!pr.ok) return { ok: false, message: `The branch is pushed, but gh couldn't open the PR: ${pr.err.split("\n")[0]}` };
  const url = pr.out.split("\n").find((l) => /^https?:\/\//.test(l.trim()))?.trim() ?? pr.out;
  return { ok: true, message: `Opened a draft PR for ${p.branch}.`, ref: url };
}
