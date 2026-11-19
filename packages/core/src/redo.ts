// D390: 从这一步重来 / Redo from here (design/sessions.md). A task's steps (its brief, then each
// later message to it, with what came of it and the code as it stood when each began), and a new
// task that redoes one of them: what led up to that step as its brief, its code from the last
// commit the task made before that step (else where it began), the same or another agent. The
// original is never touched. No harness forks its code (research/155): the commit is Ducter's.
import type { LangTag, PastForkInput, PastStep, Place, TaskCard } from "@ducter/protocol";
import type { GitRun } from "@ducter/protocol/src/folder-info.ts";
import { realGit } from "@ducter/protocol/src/folder-info.ts";
import type { TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { Past } from "./past.ts";
import type { NewTaskInput, NewTaskResult } from "./newtask.ts";

export interface RedoDeps {
  past: Past;
  tasks: TaskRegistry;
  open: (i: NewTaskInput) => Promise<NewTaskResult>;
  lang: (words: string) => LangTag;
  git?: GitRun;
}

export interface Redo {
  /** Its steps, each with the commit its code stood at; its last report; whether it works in a repo. */
  steps(taskId: string): Promise<{ steps: PastStep[]; report?: string; repo: boolean; elsewhere?: boolean }>;
  fork(input: PastForkInput): Promise<{ ok: true; card: TaskCard; step: number } | { ok: false; step: number; message: string }>;
}

/** The commits a task made on its branch (newest first), on the home only (a worker's are not read here). */
async function commitsOf(c: TaskCard, git: GitRun): Promise<{ sha: string; at: number }[]> {
  const p = c.place;
  if (p.kind !== "repo" || !p.branch || (p.device && p.device !== "local")) return [];
  const r = await git(p.repoPath, ["log", "--format=%H%x09%cI", "-n", "300", p.branch, "--"]);
  if (!r.ok) return [];
  const opened = Date.parse(c.openedAt);
  return r.out
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((x) => x.length === 2 && /^[0-9a-f]{40}$/.test(x[0]!))
    .map(([sha, at]) => ({ sha: sha!, at: Date.parse(at!) }))
    .filter((x) => x.at >= opened);
}

export function createRedo(d: RedoDeps): Redo {
  const git = d.git ?? realGit;
  const withCommits = async (c: TaskCard) => {
    const steps = d.past.steps(c.taskId);
    const commits = await commitsOf(c, git);
    for (const s of steps) {
      // The code as it stood when this step began: the newest of its commits before it.
      const before = commits.find((x) => x.at < Date.parse(s.at));
      if (before) s.commit = before.sha.slice(0, 7);
    }
    return { steps, commits };
  };
  return {
    async steps(taskId) {
      const c = d.tasks.get(taskId);
      if (!c) return { steps: [], repo: false };
      const { steps } = await withCommits(c);
      const report = d.past.report(taskId);
      const elsewhere = c.place.kind === "repo" && !!c.place.device && c.place.device !== "local";
      return { steps, ...(report ? { report } : {}), repo: c.place.kind === "repo", ...(elsewhere ? { elsewhere: true } : {}) };
    },
    async fork(input) {
      const c = d.tasks.get(input.taskId);
      if (!c) return { ok: false, step: input.step ?? 0, message: "I can't find that task." };
      const { steps, commits } = await withCommits(c);
      if (!steps.length) return { ok: false, step: 0, message: "That task has no steps to redo yet." };
      const n = Math.min(steps.length, Math.max(1, Math.round(Number(input.step) || steps.length)));
      const step = steps[n - 1]!;
      const words = (typeof input.words === "string" && input.words.trim()) || step.text;
      const full = commits.find((x) => x.at < Date.parse(step.at));
      let place: Place = c.place;
      if (c.place.kind === "repo") {
        // A new branch off that commit (else where the task began); the original's worktree is never used.
        const base = full?.sha ?? c.place.baseBranch;
        place = { kind: "repo", device: c.place.device, repoPath: c.place.repoPath, ...(base ? { baseBranch: base } : {}), ...(c.place.hasRemote !== undefined ? { hasRemote: c.place.hasRemote } : {}) };
      }
      const harness = typeof input.harness === "string" && input.harness ? input.harness : c.harness;
      const model = typeof input.model === "string" && input.model ? input.model : harness === c.harness ? c.model : undefined;
      const lang = d.lang(words);
      const brief = d.past.forkBrief(c.taskId, n, words, lang, full ? { sha: full.sha.slice(0, 7), at: new Date(full.at).toISOString().slice(0, 16).replace("T", " ") } : undefined);
      const r = await d.open({ words, place, harness, ...(model ? { model } : {}), from: c.taskId, brief, fromStep: n, ...(full ? { fromCommit: full.sha } : {}) });
      if (!r.ok) return { ok: false, step: n, message: r.message };
      if (!("card" in r)) return { ok: false, step: n, message: "It opened as a routine, not a task." };
      return { ok: true, card: r.card, step: n };
    },
  };
}
