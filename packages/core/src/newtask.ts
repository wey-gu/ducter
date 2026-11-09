// 开一件事 / New task (D128): the user opens a task themselves, from On hand (the card, ⌘N) or
// the command line (`ducter task`). One path for both: the user's words go to the task as they
// are, as its brief (no partner rewrite); the title is their first sentence, short; the Log
// records task_open with origin "you". Nothing is said in the conversation: the partner reads a
// hidden note ("the user opened this themselves") and reports the result like any task (D124).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Candidate, NewTaskReason, Place, PlaceChoice, TaskCard } from "@ducter/protocol";
import type { LogStore, Runner, SettingsApi, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { BODY_NOTE_PREFIX, type Loadout } from "./loadout.ts";

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

export interface NewTaskDeps {
  log: LogStore;
  tasks: TaskRegistry;
  runner: () => Runner | undefined;
  persona: { id: string };
  dataDir: string;
  loadout?: Loadout;
  settings?: SettingsApi;
  git?: GitRun;
}

export interface NewTaskInput {
  words: string;
  place?: Place;
  harness?: string;
  model?: string;
}

export type NewTaskResult = { ok: true; card: TaskCard } | { ok: false; reason: NewTaskReason; message: string };

const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;
const wide = (ch: string) => (CJK.test(ch) ? 2 : 1);

/** About 24 Chinese characters, or 48 letters of English: what fits on a card's one line. */
export const TITLE_WIDTH = 48;

/**
 * A title from the user's words: the first sentence, cut to about 24 characters (a Chinese
 * character counts as two letters). English is cut at a word. The partner may give it a better
 * one once, after the first report (task_retitle).
 */
export function titleFromWords(words: string, max = TITLE_WIDTH): string {
  const text = words.trim().replace(/\s+/g, " ");
  // The first sentence: up to 。！？!? or a full stop followed by a space, or the first line.
  const first = (words.trim().split("\n").find((l) => l.trim()) ?? "").trim().replace(/\s+/g, " ");
  const m = first.match(/^(.+?)([。！？!?]|\.(?=\s|$))/);
  let s = (m ? m[1]! : first || text).trim().replace(/[，,;；:：、\s]+$/, "");
  let w = 0;
  let cut = -1;
  for (let i = 0; i < s.length; i++) {
    w += wide(s[i]!);
    if (w > max) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return s;
  let head = s.slice(0, cut);
  // English: back to the last whole word, when there is one past the middle.
  const sp = head.lastIndexOf(" ");
  if (!CJK.test(head) && sp > max / 2) head = head.slice(0, sp);
  return head.replace(/[，,;；:：、\s]+$/, "") + "…";
}

/** The language the task reports in: the partner's setting, else the words themselves. */
export function languageOf(words: string, settings?: SettingsApi): "zh" | "en" {
  const l = settings?.get().language;
  if (l === "zh" || l === "en") return l;
  return CJK.test(words) ? "zh" : "en";
}

const expandHome = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const isLocal = (device: string | undefined) => !device || device === "local";

/** What a task starts from unless the user picks: the branch origin points at, else main or master, else the checkout's own. */
export async function defaultBranch(repoPath: string, run: GitRun = realGit): Promise<string | undefined> {
  return (await repoBranches(repoPath, run)).defaultBranch;
}

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

/** The top of the git checkout that holds `dir`, or undefined when it isn't in one. */
export async function repoTop(dir: string, git: GitRun = realGit): Promise<string | undefined> {
  const r = await git(resolve(expandHome(dir)), ["rev-parse", "--show-toplevel"]);
  return r.ok && r.out ? r.out : undefined;
}

/** Opens a task with the user's own words. The one path the card and `ducter task` share. */
export async function openYourTask(d: NewTaskDeps, input: NewTaskInput): Promise<NewTaskResult> {
  const git = d.git ?? realGit;
  const words = typeof input.words === "string" ? input.words.trim() : "";
  if (!words) return { ok: false, reason: "empty", message: "Say what the task should do." };
  const runner = d.runner();
  if (!runner) return { ok: false, reason: "failed", message: "Tasks can't run right now." };
  let place: Place = input.place ?? { kind: "none" };
  let project = "";
  if (place.kind === "repo") {
    const device = place.device || "local";
    let repoPath = place.repoPath;
    let baseBranch = place.baseBranch?.trim() || undefined;
    if (isLocal(device)) {
      // On this machine: the checkout's top, and the repo's default branch unless picked.
      const top = await repoTop(repoPath, git);
      if (!top) return { ok: false, reason: "not_repo", message: `${place.repoPath} isn't a git repository.` };
      repoPath = top;
      const b = await repoBranches(top, git);
      if (baseBranch && b.branches.length && !b.branches.includes(baseBranch))
        return { ok: false, reason: "failed", message: `${basename(top)} has no branch called ${baseBranch}.` };
      baseBranch ??= b.defaultBranch;
    }
    place = { kind: "repo", device, repoPath, ...(baseBranch ? { baseBranch } : {}) };
    project = basename(repoPath);
  } else if (place.kind === "folder") {
    project = basename(place.path);
  }
  const title = titleFromWords(words);
  let card: TaskCard;
  try {
    card = await runner.openTask({
      persona: d.persona.id,
      title,
      brief: words,
      place,
      project,
      ...(input.harness ? { harness: input.harness, ...(input.model ? { model: input.model } : {}) } : {}),
      language: languageOf(words, d.settings),
      origin: "you",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason: NewTaskReason = /no AI agent can take|can't take this task/i.test(message) ? "no_agent" : /offline|can't reach|not connected/i.test(message) || (err as Error)?.name === "DeviceOfflineError" ? "offline" : "failed";
    return { ok: false, reason, message: message.replace(/ Tell the user in one line.*$/, "") };
  }
  // For the partner only (clients hide body_ notes, D89): it didn't open this one and must know,
  // so it doesn't open it again and reports its result like any task. Doesn't wake it.
  d.log.append({
    stream: "channel",
    origin: "user",
    kind: "job_status",
    body: {
      jobId: `${BODY_NOTE_PREFIX}${card.taskId}_opened`,
      taskId: card.taskId,
      state: "running",
      text: `the user opened this task themselves ("${card.title}"); their own words went to it as its brief, unchanged: ${clipWords(words)}. It reports back to you like any task: say its result when it does. After its first report you may give it a better title once (task_retitle).`,
    },
  });
  return { ok: true, card: d.tasks.get(card.taskId) ?? card };
}

const clipWords = (s: string, n = 400) => {
  const one = s.replace(/\s+/g, " ").trim();
  return `"${one.length > n ? one.slice(0, n - 1) + "…" : one}"`;
};

interface RepoHint {
  name: string;
  path: string;
  touchedAt: string;
}

/** Repos `ducter up` noticed on this Mac (<dataDir>/firstrun.json), most recently touched first. */
function hintRepos(dataDir: string): RepoHint[] {
  try {
    const p = join(dataDir, "firstrun.json");
    if (!existsSync(p)) return [];
    const j = JSON.parse(readFileSync(p, "utf8")) as { repos?: RepoHint[] };
    return Array.isArray(j.repos) ? j.repos.filter((r) => r && typeof r.path === "string") : [];
  } catch {
    return [];
  }
}

/**
 * What the New task card offers: the repos tasks used, most recent first, then the ones `ducter
 * up` noticed; each on this machine with its default branch and branches. 不用特定的地方 / No
 * particular place is always last. Who could do it: the candidates at `place` (or this machine).
 */
export async function newTaskOptions(d: NewTaskDeps, at?: Place, limit = 12): Promise<{ places: PlaceChoice[]; candidates: Candidate[] }> {
  const git = d.git ?? realGit;
  const seen = new Map<string, PlaceChoice>();
  const key = (device: string, path: string) => `${device} ${resolve(expandHome(path))}`;
  const cards = d.tasks.list().filter((c) => c.place.kind === "repo").sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  for (const c of cards) {
    const p = c.place as Extract<Place, { kind: "repo" }>;
    const k = key(p.device || "local", p.repoPath);
    if (!seen.has(k)) seen.set(k, { place: { kind: "repo", device: p.device || "local", repoPath: p.repoPath }, name: basename(p.repoPath), usedAt: c.openedAt });
  }
  for (const r of hintRepos(d.dataDir)) {
    const k = key("local", r.path);
    if (!seen.has(k)) seen.set(k, { place: { kind: "repo", device: "local", repoPath: resolve(expandHome(r.path)) }, name: r.name || basename(r.path), usedAt: r.touchedAt });
  }
  const places = [...seen.values()].slice(0, limit);
  await Promise.all(
    places.map(async (c) => {
      const p = c.place as Extract<Place, { kind: "repo" }>;
      if (!isLocal(p.device)) return;
      const path = resolve(expandHome(p.repoPath));
      if (!existsSync(path)) return;
      const b = await repoBranches(path, git);
      if (b.defaultBranch) c.defaultBranch = b.defaultBranch;
      if (b.branches.length) c.branches = b.branches;
    }),
  );
  places.push({ place: { kind: "none" }, name: "" });
  const candidates = d.loadout ? await d.loadout.candidatesFor({ title: "", place: at }).catch(() => []) : [];
  return { places, candidates };
}
