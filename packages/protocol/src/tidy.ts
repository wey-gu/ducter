// D514: 整理工作副本 / Tidying working copies. A repo task works in a git worktree Ducter made
// (D204: <Ducter folder>/worktrees/<repo>/<slug>). Once the work is finished and nobody can need
// that folder, Ducter removes it by itself with `git worktree remove` (never --force, never rm -rf):
// the branch and anything pushed stay, and 接着做 / Continue adds the worktree back from the branch.
//
// One pure function decides, from facts: the task's (the home's) and the copy's (read on the
// computer that holds it, right before anything goes). It keeps a copy that matters, and says why:
//
//   - not_ours       a path Ducter didn't record making (the person's own folders, anyone else's)
//   - live           the task is working, waiting, needs the person, queued, or a turn or a start is under way
//   - waiting        a wait of the task's own is armed
//   - looking_after  a Keep (D511) holds the task, on or paused
//   - pr_open        a PR the task owns (D483, D508) is still open
//   - pinned         the person starred the task (D285) or said to keep its working copy
//   - shared         another task that is kept works in the same folder
//   - mid_operation  git is busy in it: a rebase, merge, cherry-pick or bisect halfway, or its index locked
//   - other_branch   it is on another branch than the task's now
//   - uncommitted    files changed or untracked in it, files marked so status hides their changes,
//                    or a repository inside an ignored folder (a removal deletes ignored files)
//   - unpushed       commits that are in no remote branch and not in its base
//   - cant_tell      git couldn't say (an older worker, a broken repo): kept, never guessed
//   - away           its computer isn't connected now
//   - recent         finished less than TIDY_FINISHED_MS ago, or dropped less than TIDY_DROPPED_MS ago
//
// The windows (decided from the Log on hel, 2026-11-24: of 17 tasks taken up again after they
// finished, 16 were within 6 hours and the last after 52 hours; none later):
//   - finished (done, done · checking, failed, superseded): 3 days idle;
//   - dropped: 7 days, Ducter's one Undo window (D142's folder copy keeps 7 days too).
// A merge Ducter does tidies at once (product-model "Archive and disk"): the work is in the base.

import type { Attention, Residency } from "./index.ts";
import { words, fill, type LangTag } from "./lang.ts";

export const TIDY_FINISHED_MS = 3 * 24 * 3600_000;
export const TIDY_DROPPED_MS = 7 * 24 * 3600_000;

export type TidyKeep = "not_ours" | "live" | "waiting" | "looking_after" | "pr_open" | "pinned" | "shared" | "mid_operation" | "other_branch" | "uncommitted" | "unpushed" | "cant_tell" | "away" | "recent";
/** What the home knows holds a task's copy beyond its own state (core's tidyHold). */
export type TidyHold = Extract<TidyKeep, "waiting" | "looking_after" | "pr_open" | "pinned">;
export type TidyWhy = "merged" | "finished" | "dropped";

/** The copy as the computer that holds it reads it (integrate.ts copyFacts). */
export interface CopyFacts {
  /** Under a worktrees folder Ducter made (worktreesRootOf). */
  ours: boolean;
  exists: boolean;
  /** Files changed or untracked (`git status --porcelain`). */
  dirty: number;
  /** Commits on its branch in no remote branch and not in its base; null: git couldn't tell. */
  unpushed: number | null;
  /** A rebase, merge, cherry-pick, revert or bisect is halfway, or the index is locked. */
  busy?: boolean;
  /** HEAD is on this branch, not the task's. */
  otherBranch?: string;
  /** Its size on disk (bytes), for the line that says what was freed. */
  bytes?: number;
}

export interface TaskTidyFacts {
  attention: Attention;
  residency: Residency;
  /** When it last changed (the card's updatedAt). */
  idleSince: string;
  /** A turn or a start is under way in the runner. */
  busy?: boolean;
  hold?: TidyHold;
}

export type TidyVerdict = { tidy: true; why: TidyWhy } | { tidy: false; keep: TidyKeep; until?: string };

const FINISHED = new Set<Attention>(["done", "done_claimed", "failed", "superseded"]);

export interface TidyWindows {
  finishedMs: number;
  droppedMs: number;
}
export const TIDY_WINDOWS: TidyWindows = { finishedMs: TIDY_FINISHED_MS, droppedMs: TIDY_DROPPED_MS };

/** The task's side alone: whether its copy could go now, before git is asked anything. A warm
 *  session (idle, its process up) is closed by the tidy; a turn or a start under way never is. */
export function taskVerdict(t: TaskTidyFacts, nowMs: number, w: TidyWindows = TIDY_WINDOWS): TidyVerdict {
  if (t.busy || !(FINISHED.has(t.attention) || t.attention === "dropped") || t.residency === "provisioning" || t.residency === "hot") return { tidy: false, keep: "live" };
  if (t.hold) return { tidy: false, keep: t.hold };
  const window = t.attention === "dropped" ? w.droppedMs : w.finishedMs;
  const since = Date.parse(t.idleSince);
  if (!Number.isFinite(since)) return { tidy: false, keep: "cant_tell" };
  if (nowMs - since < window) return { tidy: false, keep: "recent", until: new Date(since + window).toISOString() };
  return { tidy: true, why: t.attention === "dropped" ? "dropped" : "finished" };
}

/** The copy's side: what git says on its computer. A copy that matters is never removed. */
export function copyVerdict(c: CopyFacts | undefined): TidyVerdict | undefined {
  if (!c) return { tidy: false, keep: "cant_tell" };
  if (!c.ours) return { tidy: false, keep: "not_ours" };
  if (!c.exists) return undefined; // nothing there: only its record goes
  if (c.busy) return { tidy: false, keep: "mid_operation" };
  if (c.otherBranch) return { tidy: false, keep: "other_branch" };
  if (c.dirty > 0) return { tidy: false, keep: "uncommitted" };
  if (c.unpushed === null) return { tidy: false, keep: "cant_tell" };
  if (c.unpushed > 0) return { tidy: false, keep: "unpushed" };
  return undefined;
}

/** Both sides: the task first (cheap, on the home), then the copy (git on its computer). */
export function tidyVerdict(t: TaskTidyFacts, c: CopyFacts | undefined, nowMs: number, w: TidyWindows = TIDY_WINDOWS): TidyVerdict {
  const v = taskVerdict(t, nowMs, w);
  if (!v.tidy) return v;
  return copyVerdict(c) ?? v;
}

// ---------- words ----------

const W = {
  zh: {
    line: "整理过 {n} 个用完的工作副本，腾出 {size}",
    lineNone: "还没有要整理的工作副本",
    past: "工作副本已整理，接着做会重新拉一份",
    removed: "整理了这个任务的工作副本（{size}），分支 {branch} 留着；接着做会重新拉一份。",
    removedGone: "这个任务的工作副本已经不在了，记录也清掉了；分支 {branch} 留着。",
    goes: "会整理",
    goesAt: "{when} 起会整理",
    keep: {
      not_ours: "不是 Ducter 建的，不碰",
      live: "任务还在进行",
      waiting: "任务在等",
      looking_after: "看守中",
      pr_open: "PR 还开着",
      pinned: "你标了星或说过留着",
      shared: "另一个任务也在用",
      mid_operation: "有做到一半的 git 操作",
      other_branch: "它换到了别的分支",
      uncommitted: "有没提交的改动",
      unpushed: "有没推送的提交",
      cant_tell: "读不出它的状态，先留着",
      away: "那台电脑现在没连上",
      recent: "刚做完，先留着",
    },
  },
  en: {
    line: "Tidied {n} finished working copies, {size} freed",
    lineNone: "No working copies to tidy yet",
    past: "Its working copy was tidied away; Continue makes a fresh one",
    removed: "Tidied away this task's working copy ({size}); its branch {branch} stays, and Continue makes a fresh one.",
    removedGone: "This task's working copy was already gone; its record is cleared too. Its branch {branch} stays.",
    goes: "Will be tidied",
    goesAt: "Tidied from {when}",
    keep: {
      not_ours: "Ducter didn't make it, so it stays",
      live: "The task is still going",
      waiting: "The task is waiting",
      looking_after: "Being looked after",
      pr_open: "Its PR is still open",
      pinned: "You starred it or asked to keep it",
      shared: "Another task uses it",
      mid_operation: "A git operation is halfway there",
      other_branch: "It's on another branch now",
      uncommitted: "Has uncommitted changes",
      unpushed: "Has commits not pushed",
      cant_tell: "Couldn't read it, so it stays",
      away: "That computer isn't connected",
      recent: "Finished recently, kept a while",
    },
  },
};

export const tidyWords = (lang: LangTag) => words(W, lang);

/** Bytes as people read them: 3.4 GB, 540 MB. */
export function tidySize(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) (v /= 1024), i++;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

/** A computer's quiet line: 整理过 12 个用完的工作副本，腾出 3.4 GB. Empty when nothing was tidied. */
export function tidiedLine(lang: LangTag, t: { count: number; bytes: number } | undefined): string {
  if (!t || t.count <= 0) return "";
  return fill(tidyWords(lang).line, { n: t.count, size: tidySize(t.bytes) });
}

/** One copy as `ducter worktrees` and the plan frame show it. */
export interface TidyRow {
  taskId: string;
  title: string;
  /** "local" for the home, else the worker's id. */
  device: string;
  /** The computer's name, when known. */
  computer?: string;
  path: string;
  branch?: string;
  bytes?: number;
  verdict: TidyVerdict;
}

/** The plan per computer: what goes, what stays and why, and what was tidied so far. */
export interface TidyPlan {
  rows: TidyRow[];
  tidied: Record<string, { count: number; bytes: number }>;
}

/** The Log body of one removal (stream task:<id>): what went, where, how big, and why. */
export interface CopyTidiedBody {
  taskId: string;
  device: string;
  path: string;
  branch?: string;
  bytes: number;
  why: TidyWhy;
  /** The folder was already gone: only its git record was cleared. */
  gone?: boolean;
}
