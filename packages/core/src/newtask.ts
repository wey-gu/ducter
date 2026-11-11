// 开一件事 / New task (D128): the user opens a task themselves, from On hand (the card, ⌘N) or
// the command line (`ducter task`). One path for both: the user's words go to the task as they
// are, as its brief (no partner rewrite); the title is their first sentence, short; the Log
// records task_open with origin "you". Nothing is said in the conversation: the partner reads a
// hidden note ("the user opened this themselves") and reports the result like any task (D124).
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AgentModels, Candidate, CloneReason, DucterFolderView, NewTaskReason, NewTaskWhen, Place, PlaceChoice, RoutineTrigger, RoutineView, TaskCard } from "@ducter/protocol";
import { expandHome, type FolderInfo, type GitRun, realGit, repoBranches, repoRemote, repoTop } from "@ducter/protocol/src/folder-info.ts";
import type { LogStore, Runner, SettingsApi, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { BODY_NOTE_PREFIX, type Loadout } from "./loadout.ts";
import type { Projects } from "./projects.ts";
import type { Routines } from "./routines.ts";
import type { Untils } from "./until.ts";
import { agentModels, agentsOf, MODELS_WAIT_MS, type ModelCatalog } from "./models.ts";
import { listFolders, type BrowseResult, type RepoHint as FoundRepo } from "@ducter/protocol/src/repos.ts";
import type { CloneResult } from "@ducter/protocol/src/clone.ts";

// D197: the git reads are shared with a worker's folderInfo op (protocol/src/folder-info.ts).
export { realGit, repoBranches, repoTop, type GitRun };

/** D197: the computers that work for this home, as the New task card needs them. */
export interface NewTaskComputers {
  /** A worker's name by its id (or name); undefined when it isn't one of this home's. */
  nameOf(device: string): string | undefined;
  /** This home's own computer's name. */
  homeName(): string;
  /** A folder on that worker, read there; "offline" when it is away (or too old to answer). */
  folderInfo(device: string, path: string, timeoutMs: number): Promise<FolderInfo | "offline">;
  /** D203: this home's workers, by id (an away one is listed, not online). */
  workers?(): { id: string; name: string; online: boolean }[];
  /** D203, D204: that worker's Ducter folder and the projects in it, read there (absolute paths,
   *  origin and default branch); "offline" when it is away, "old" when its Ducter can't say. */
  repos?(device: string, timeoutMs: number): Promise<FolderProjects | "offline" | "old">;
  /** D203: a folder's subfolders on that worker (找一个文件夹… / Find a folder…); "old": too old to. */
  browse?(device: string, path: string | undefined, timeoutMs: number): Promise<BrowseResult | "offline" | "old">;
  /** D204: clone a Git address into that worker's Ducter folder, there; "old": too old to. */
  clone?(device: string, address: string, timeoutMs: number): Promise<CloneResult | "offline" | "old">;
}

/** D203: how long a computer's reported repos are kept before they are asked again. */
export const REPOS_KEEP_MS = 10 * 60_000;

/** D204: a computer's Ducter folder and the projects in it. */
export interface FolderProjects {
  folder: string;
  repos: FoundRepo[];
}

/**
 * D203, D204: each computer's projects (those in its Ducter folder), kept REPOS_KEEP_MS: the
 * home's own from `home`, a worker's from its `repos` op. A read that takes longer than the card
 * waits still lands here for the next card; an away worker has none, an old one says it is old.
 */
export interface FoundRepos {
  get(device: string, waitMs: number): Promise<FoundRepo[]>;
  /** D204: what that computer last said of its Ducter folder (absent: not heard from yet, or away). */
  folder(device: string): { path?: string; old?: true } | undefined;
  /** D204: forget what that computer said (a clone there just added a project). */
  forget(device: string): void;
}

export function createFoundRepos(o: { computers?: NewTaskComputers; home?: () => FolderProjects; now?: () => number; keepMs?: number }): FoundRepos {
  const now = o.now ?? Date.now;
  const keep = o.keepMs ?? REPOS_KEEP_MS;
  const kept = new Map<string, { at: number; repos: FoundRepo[]; folder?: string; old?: true }>();
  const asking = new Map<string, Promise<FoundRepo[]>>();
  const ask = (device: string): Promise<FoundRepo[]> => {
    const had = asking.get(device);
    if (had) return had;
    const p = (async () => {
      let got: { repos: FoundRepo[]; folder?: string; old?: true } = { repos: [] };
      try {
        if (isLocal(device)) {
          const h = o.home?.();
          if (h) got = { repos: h.repos, folder: h.folder };
        } else {
          const r = await o.computers?.repos?.(device, 15_000);
          if (r === "offline" || !r) return [];
          if (r === "old") got = { repos: [], old: true };
          else {
            // D203's answer was the list itself; D204's says the folder too.
            const list = Array.isArray(r) ? r : Array.isArray(r.repos) ? r.repos : [];
            got = { repos: list.filter((x) => x && typeof x.path === "string" && x.path.startsWith("/")), ...(!Array.isArray(r) && typeof r.folder === "string" ? { folder: r.folder } : {}) };
          }
        }
      } catch {
        return [];
      } finally {
        asking.delete(device);
      }
      kept.set(device, { at: now(), ...got });
      return got.repos;
    })();
    asking.set(device, p);
    return p;
  };
  return {
    async get(device, waitMs) {
      const k = kept.get(device);
      if (k && now() - k.at < keep) return k.repos;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<FoundRepo[]>((r) => (timer = setTimeout(() => r(k?.repos ?? []), waitMs)));
      try {
        return await Promise.race([ask(device), late]);
      } finally {
        clearTimeout(timer);
      }
    },
    folder(device) {
      const k = kept.get(device);
      return k ? { ...(k.folder ? { path: k.folder } : {}), ...(k.old ? { old: true as const } : {}) } : undefined;
    },
    forget(device) {
      kept.delete(device);
    },
  };
}

/** D204: what a worker says when it doesn't know an op: its Ducter is older than this home's. */
export const isOldOp = (err: unknown) => /unknown op/.test(String((err as Error)?.message ?? err));

/** D203: a folder's subfolders on a computer of this home: the home's own, or a worker's (read there). */
export async function browseFolders(
  d: Pick<NewTaskDeps, "computers" | "browseHome">,
  device: string | undefined,
  path: string | undefined,
  ms = 10_000,
): Promise<BrowseResult | { ok: false; reason: "offline" | "old" | "failed"; message: string }> {
  if (isLocal(device)) return (d.browseHome ?? ((p) => listFolders(p)))(path);
  const c = d.computers;
  if (!c?.browse || !c.nameOf(device!)) return { ok: false, reason: "failed", message: "That computer isn't one of this home's." };
  try {
    const r = await c.browse(device!, path, ms);
    if (r === "offline") return { ok: false, reason: "offline", message: "That computer can't be reached right now." };
    if (r === "old") return { ok: false, reason: "old", message: `${c.nameOf(device!)} runs an older Ducter that can't look through its folders yet; update it first.` };
    return r;
  } catch (err) {
    return { ok: false, reason: "failed", message: (err as Error).message };
  }
}

export interface NewTaskDeps {
  log: LogStore;
  tasks: TaskRegistry;
  runner: () => Runner | undefined;
  persona: { id: string };
  dataDir: string;
  loadout?: Loadout;
  settings?: SettingsApi;
  git?: GitRun;
  /** D185: later and repeating starts are routines of the user's own; a loop is an until. */
  routines?: Routines;
  untils?: Untils;
  /** D186: the projects the user added by hand (their names; offered as places). */
  projects?: Projects;
  /** D197: the workers (a repo on one gets its branches from there; a list over two computers names them). */
  computers?: NewTaskComputers;
  /** D202: each agent's models on each computer (the card's Model and Effort rows). */
  models?: ModelCatalog;
  /** D203: each computer's repos (the home's own scan, a worker's report), kept a while. */
  found?: FoundRepos;
  /** D203: the home's own subfolders for 找一个文件夹… (default: this computer's home folder). */
  browseHome?: (path: string | undefined) => BrowseResult;
  /** D204: clone into the home's own Ducter folder (default: none, the card offers no clone here). */
  cloneHome?: (address: string) => Promise<CloneResult>;
}

/** D204: how long a clone may take on a worker before the home stops waiting (its own limit is 10 minutes). */
export const CLONE_WAIT_MS = 11 * 60_000;

/**
 * D204: 从 Git 地址加… / Add from a Git address…: clone on that computer (the home's own, or a
 * worker's, there), then add it as a project there (D186, D197) and answer the place the card
 * then offers. The same origin already there is that project (existed).
 */
export async function cloneProject(
  d: Pick<NewTaskDeps, "computers" | "cloneHome" | "found">,
  device: string | undefined,
  address: string,
  add: (path: string, device?: string) => Promise<{ ok: true; place: PlaceChoice } | { ok: false; reason?: string; message?: string }>,
): Promise<{ ok: true; place: PlaceChoice; existed?: true } | { ok: false; reason: CloneReason; message: string }> {
  let r: CloneResult | "offline" | "old";
  const name = isLocal(device) ? (d.computers?.homeName() ?? "") : (d.computers?.nameOf(device!) ?? device!);
  try {
    if (isLocal(device)) {
      if (!d.cloneHome) return { ok: false, reason: "failed", message: "Projects can't be cloned here." };
      r = await d.cloneHome(address);
    } else {
      const c = d.computers;
      if (!c?.clone || !c.nameOf(device!)) return { ok: false, reason: "failed", message: "That computer isn't one of this home's." };
      r = await c.clone(device!, address, CLONE_WAIT_MS);
    }
  } catch (err) {
    return { ok: false, reason: "failed", message: (err as Error).message };
  }
  if (r === "offline") return { ok: false, reason: "offline", message: `${name} can't be reached right now.` };
  if (r === "old") return { ok: false, reason: "old", message: `${name} runs an older Ducter that can't clone yet; update it first.` };
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
  d.found?.forget(isLocal(device) ? "local" : device!);
  const added = await add(r.path, isLocal(device) ? undefined : device);
  if (!added.ok) return { ok: false, reason: added.reason === "offline" ? "offline" : "failed", message: added.message ?? "The clone is there, but it couldn't be added." };
  return { ok: true, place: added.place, ...(r.existed ? { existed: true as const } : {}) };
}

/** D197: how long the card waits for a worker's branches before it shows the list without them. */
export const WORKER_BRANCHES_MS = 3_000;

export interface NewTaskInput {
  words: string;
  place?: Place;
  harness?: string;
  model?: string;
  /** D202: one of the model's own effort levels (checked where the task runs; dropped with a line if it isn't). */
  effort?: string;
  when?: NewTaskWhen;
}

export type NewTaskResult = { ok: true; card: TaskCard } | { ok: true; routine: RoutineView } | { ok: false; reason: NewTaskReason; message: string };

/** D185: what the task is told first when it starts by waiting (its own wait_for, D112 (4)). */
export function waitFirstBrief(condition: string, words: string, zh: boolean): string {
  return zh
    ? `先等到：${condition}\n然后：${words}\n\n（等的时候用 wait_for 和一个检查来等，别自己轮询；等到了会叫醒你。）`
    : `First wait until: ${condition}\nThen: ${words}\n\n(Wait with wait_for and a check, never by polling yourself; you are woken when it holds.)`;
}

/** D185: a when of the card as a routine's time trigger (at and every), else undefined. */
export function triggerOf(when: NewTaskWhen | undefined): Extract<RoutineTrigger, { kind: "time" }> | undefined {
  if (!when) return undefined;
  if (when.kind === "at") return { kind: "time", every: "once", date: when.date, time: when.time, zone: "world", tz: when.tz };
  if (when.kind === "every")
    return {
      kind: "time",
      every: when.every,
      ...(when.every === "week" ? { days: when.days?.length ? when.days : [1] } : {}),
      ...(when.every === "hours" ? { hours: Math.min(24, Math.max(1, Math.round(when.hours ?? 1))) } : {}),
      time: when.time,
      zone: "personal",
      tz: when.tz,
    };
  return undefined;
}

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

const isLocal = (device: string | undefined) => !device || device === "local";

/** What a task starts from unless the user picks: the branch origin points at, else main or master, else the checkout's own. */
export async function defaultBranch(repoPath: string, run: GitRun = realGit): Promise<string | undefined> {
  return (await repoBranches(repoPath, run)).defaultBranch;
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
  // D186: a project the user added keeps the name they know it by.
  project = d.projects?.of(place)?.name ?? project;
  const title = titleFromWords(words);
  const when = input.when;
  const zh = languageOf(words, d.settings) === "zh";
  // D185: at a time, or every …: a routine of the user's own, active at once.
  const trigger = triggerOf(when);
  if (trigger) {
    if (!d.routines) return { ok: false, reason: "failed", message: "Ducter can't keep a schedule right now." };
    try {
      const routine = d.routines.yours({
        name: title,
        trigger,
        brief: words,
        ...(place.kind !== "none" || place.device ? { place } : {}),
        ...(project ? { project } : {}),
        ...(input.harness ? { harness: input.harness, ...(input.model ? { model: input.model } : {}), ...(input.effort ? { effort: input.effort } : {}) } : {}),
        zh,
      });
      return { ok: true, routine };
    } catch (err) {
      const message = (err as Error).message;
      return { ok: false, reason: /already passed/.test(message) ? "past" : "failed", message };
    }
  }
  const condition = when && (when.kind === "when" || when.kind === "until") ? String(when.condition ?? "").trim() : "";
  if (when && (when.kind === "when" || when.kind === "until") && !condition) return { ok: false, reason: "no_condition", message: "Say what it waits for, or what it keeps going until." };
  if (when?.kind === "until" && !d.untils) return { ok: false, reason: "failed", message: "Ducter can't keep a task going right now." };
  let card: TaskCard;
  try {
    card = await runner.openTask({
      persona: d.persona.id,
      title,
      brief: when?.kind === "when" ? waitFirstBrief(condition, words, zh) : words,
      place,
      project,
      ...(input.harness ? { harness: input.harness, ...(input.model ? { model: input.model } : {}) } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
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
      text: `the user opened this task themselves ("${card.title}"); their own words went to it as its brief, unchanged: ${clipWords(words)}.${when?.kind === "when" ? ` It first waits until: ${clipWords(condition, 200)}.` : when?.kind === "until" ? ` It keeps going until: ${clipWords(condition, 200)}.` : ""} It reports back to you like any task: say its result when it does. After its first report you may give it a better title once (task_retitle).`,
    },
  });
  // D185: keep going until it holds (D113): judged after each of its turns.
  if (when?.kind === "until") {
    try {
      d.untils!.start({ taskId: card.taskId, condition });
    } catch {
      // The task is open with the words; the loop is the part that didn't take. Say nothing more.
    }
  }
  return { ok: true, card: d.tasks.get(card.taskId) ?? card };
}

const clipWords = (s: string, n = 400) => {
  const one = s.replace(/\s+/g, " ").trim();
  return `"${one.length > n ? one.slice(0, n - 1) + "…" : one}"`;
};

/** D197: a folder on a worker, read there within `ms`; undefined when it is away, slow or can't say. */
export async function workerFolder(c: NewTaskComputers | undefined, device: string, path: string, ms: number): Promise<FolderInfo | undefined> {
  if (!c) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)));
  try {
    const r = await Promise.race([c.folderInfo(device, path, ms).catch(() => "offline" as const), late]);
    return r && r !== "offline" ? r : undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the New task card offers: the folders tasks used and the projects added, most recent
 * first, then (D204) the projects in each computer's Ducter folder; each with its default branch
 * and branches. 不用特定的地方 / No
 * particular place is always last. Who could do it: the candidates at `place` (or this machine).
 */
export async function newTaskOptions(d: NewTaskDeps, at?: Place, limit = 12): Promise<{ places: PlaceChoice[]; candidates: Candidate[]; models?: AgentModels[]; ducterFolders?: DucterFolderView[] }> {
  const git = d.git ?? realGit;
  const seen = new Map<string, PlaceChoice>();
  const key = (device: string, path: string) => `${device} ${resolve(expandHome(path))}`;
  const cards = d.tasks.list().filter((c) => c.place.kind === "repo" || c.place.kind === "folder").sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const nameOf = (p: Place, fallback: string) => d.projects?.of(p)?.name ?? fallback;
  for (const c of cards) {
    if (c.place.kind === "repo") {
      const p = c.place;
      const k = key(p.device || "local", p.repoPath);
      const place: Place = { kind: "repo", device: p.device || "local", repoPath: p.repoPath };
      if (!seen.has(k)) seen.set(k, { place, name: nameOf(place, basename(p.repoPath)), usedAt: c.openedAt });
    } else if (c.place.kind === "folder") {
      const p = c.place;
      const k = key(p.device || "local", p.path);
      const place: Place = { kind: "folder", device: p.device || "local", path: p.path };
      if (!seen.has(k)) seen.set(k, { place, name: nameOf(place, basename(p.path)), usedAt: c.openedAt });
    }
  }
  // D186: the projects the user added, by when they were added or last used.
  for (const pr of d.projects?.list() ?? []) {
    const path = pr.place.kind === "repo" ? pr.place.repoPath : pr.place.kind === "folder" ? pr.place.path : "";
    const k = key(pr.place.device || "local", path);
    const had = seen.get(k);
    if (had) {
      had.added = true;
      if (!had.usedAt || pr.addedAt > had.usedAt) had.usedAt = pr.addedAt;
    } else seen.set(k, { place: pr.place, name: pr.name, usedAt: pr.addedAt, added: true });
  }
  const used = [...seen.values()].sort((a, b) => (b.usedAt ?? "").localeCompare(a.usedAt ?? ""));
  const places = used.slice(0, limit);
  // D202: who could do it (every agent on every computer) and their models, read alongside the branches.
  const who = (async () => {
    const candidates = d.loadout ? await d.loadout.candidatesFor({ title: "", place: at }, { every: true }).catch(() => [] as Candidate[]) : [];
    const models = d.models ? await newTaskModels(d.models, candidates).catch(() => undefined) : undefined;
    return { candidates, models };
  })();
  // D203, D204: the projects in each computer's Ducter folder (the home's own, each worker's
  // report), after the ones used or added, most recently touched first; a worker away or slow adds none. Their branches
  // are read only for the one asked about (`at`): a card lists them, a pick reads them.
  const found = d.found ?? foundOf(d);
  const comps = ["local", ...(d.computers?.workers?.() ?? []).filter((w) => w.online).map((w) => w.id)];
  const reported = await Promise.all(comps.map(async (dev) => ({ dev, repos: await found.get(dev, WORKER_BRANCHES_MS).catch(() => [] as FoundRepo[]) })));
  const canon = (dev: string | undefined) => (isLocal(dev) ? "local" : (d.computers?.workers?.().find((w) => w.id === dev || w.name === dev)?.id ?? dev!));
  const listed = new Set(places.map((c) => (c.place.kind === "repo" ? `${canon(c.place.device)} ${resolve(c.place.repoPath)}` : c.place.kind === "folder" ? `${canon(c.place.device)} ${resolve(c.place.path)}` : "")));
  const atKey = at && (at.kind === "repo" || at.kind === "folder") ? `${canon(at.device)} ${resolve(expandHome(at.kind === "repo" ? at.repoPath : at.path))}` : "";
  const extra: PlaceChoice[] = [];
  for (const { dev, repos } of reported)
    for (const r of repos) {
      const path = resolve(expandHome(r.path));
      const k = `${dev} ${path}`;
      if (listed.has(k)) continue;
      listed.add(k);
      const place: Place = { kind: "repo", device: dev, repoPath: path };
      extra.push({ place, name: nameOf(place, r.name || basename(path)), usedAt: r.touchedAt, found: true, ...(r.defaultBranch ? { defaultBranch: r.defaultBranch } : {}), ...(r.remote ? { remote: r.remote } : {}) });
    }
  extra.sort((a, b) => (b.usedAt ?? "").localeCompare(a.usedAt ?? ""));
  const lazy = new Set<PlaceChoice>(extra);
  places.push(...extra);
  await Promise.all(
    places.map(async (c) => {
      if (c.place.kind !== "repo") return;
      if (lazy.has(c) && `${canon(c.place.device)} ${resolve(c.place.repoPath)}` !== atKey) return;
      const p = c.place;
      if (!isLocal(p.device)) {
        // D197: a repo on a worker: its branches from there, briefly; away or slow, none (as before).
        const info = await workerFolder(d.computers, p.device!, p.repoPath, WORKER_BRANCHES_MS);
        if (info?.defaultBranch) c.defaultBranch = info.defaultBranch;
        if (info?.branches?.length) c.branches = info.branches;
        if (info?.remote) c.remote = info.remote;
        return;
      }
      const path = resolve(expandHome(p.repoPath));
      if (!existsSync(path)) return;
      const [b, remote] = await Promise.all([repoBranches(path, git), repoRemote(path, git)]);
      if (b.defaultBranch) c.defaultBranch = b.defaultBranch;
      if (b.branches.length) c.branches = b.branches;
      if (remote) c.remote = remote;
    }),
  );
  // D197: places on more than one computer: each says which (the client puts it after the path).
  const computerOf = (dev: string | undefined) => (isLocal(dev) ? (d.computers?.homeName() ?? "") : (d.computers?.nameOf(dev!) ?? dev!));
  const devOf = (c: PlaceChoice) => (c.place.kind === "repo" || c.place.kind === "folder" ? c.place.device : undefined);
  if (new Set(places.map((c) => computerOf(devOf(c)))).size > 1)
    for (const c of places) {
      const name = computerOf(devOf(c));
      if (name) c.computer = name;
    }
  places.push({ place: { kind: "none" }, name: "" });
  // D204: where each computer's Ducter folder is (the real path), or that it is too old to say.
  const folders: DucterFolderView[] = [];
  for (const dev of comps) {
    const f = found.folder(dev);
    if (f?.path || f?.old) folders.push({ device: dev, ...(f.path ? { path: f.path } : {}), ...(f.old ? { old: true as const } : {}) });
  }
  // D202: who could do it, every agent on every computer (one on another computer than the
  // folder's is offered there, with its own copy of the repo); and each one's models.
  const { candidates, models } = await who;
  return { places, candidates, ...(models?.length ? { models } : {}), ...(folders.length ? { ducterFolders: folders } : {}) };
}

// D203: deps without their own FoundRepos keep one made from their computers (no home scan).
const foundBy = new WeakMap<object, FoundRepos>();
function foundOf(d: NewTaskDeps): FoundRepos {
  let f = foundBy.get(d);
  if (!f) foundBy.set(d, (f = createFoundRepos({ ...(d.computers ? { computers: d.computers } : {}) })));
  return f;
}

/** D202: the Model and Effort rows of every agent the card may offer, read together (at most MODELS_WAIT_MS). */
export async function newTaskModels(catalog: ModelCatalog, candidates: Candidate[], ms = MODELS_WAIT_MS): Promise<AgentModels[]> {
  return Promise.all(agentsOf(candidates).map(async (a) => agentModels(a.harness, a.device, a.model, await catalog.get(a.device ?? "local", a.harness, ms))));
}
