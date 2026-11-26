// D471: where a task's work starts: the merge base with its base branch, or with the base's
// remote-tracking branch when that is newer. One answer for every place that diffs a task's
// branch against its base (the workbench's Changes and per-file diff, a file's revert, the
// board's and On hand's stats), so no place can count the upstream a stale local base missed.
import { git } from "./places.ts";

/**
 * The task branch's fork point with its base: the newer of the merge base with the local base
 * and with the remote-tracking base. A task that pulled the remote's main into its branch
 * (agents do, to work on fresh code) shares the remote's history with it; against a local main
 * left weeks behind, the old merge base counted every upstream change as the task's own. The
 * newer of the two is a descendant of the other, so `--is-ancestor` tells them apart. undefined
 * when neither base can be read (or HEAD has no history yet).
 */
export async function forkPoint(worktree: string, base: string): Promise<string | undefined> {
  const [local, remote] = await Promise.all([git(worktree, ["merge-base", base, "HEAD"]), git(worktree, ["merge-base", `origin/${base}`, "HEAD"])]);
  const l = local.ok && local.out ? local.out : undefined;
  const r = remote.ok && remote.out ? remote.out : undefined;
  if (!l || !r || l === r) return l ?? r;
  return (await git(worktree, ["merge-base", "--is-ancestor", l, r])).ok ? r : l;
}
