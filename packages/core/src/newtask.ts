// 开一个任务 / New task (D128): the user opens a task themselves, from Tasks (the card, ⌘N) or
// the command line (`ducter task`). One path for both: the user's words go to the task as they
// are, as its brief (no partner rewrite); the title is their first sentence, short; the Log
// records task_open with origin "you". Nothing is said in the conversation: the partner reads a
// hidden note ("the user opened this themselves") and reports the result like any task (D124).
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AgentModels, Bodies, Candidate, CloneReason, DucterFolderView, FolderChangeReason, LangTag, NewTaskReason, NewTaskWhen, Place, PlaceChoice, RoutineTrigger, RoutineView, TaskCard } from "@ducter/protocol";
import { ducterFolder, writeChosenFolder } from "@ducter/protocol/src/ducter-folder.ts";
import { moveDucterFolder, underFolder, type FolderMoveResult } from "@ducter/protocol/src/folder-move.ts";
import { cutAtWord, detect, fill, words as wordsIn } from "@ducter/protocol";
import { expandHome, type FolderInfo, type GitRun, realGit, repoBranches, repoRemote, repoTop } from "@ducter/protocol/src/folder-info.ts";
import type { LogStore, Runner, SettingsApi, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { BODY_NOTE_PREFIX, type Loadout } from "./loadout.ts";
import type { Projects } from "./projects.ts";
import type { Routines } from "./routines.ts";
import type { Untils } from "./until.ts";
import { agentModels, agentsOf, MODELS_WAIT_MS, type ModelCatalog } from "./models.ts";
import { listFolders, type BrowseResult, type RepoHint as FoundRepo } from "@ducter/protocol/src/repos.ts";
import type { CloneResult } from "@ducter/protocol/src/clone.ts";
import type { NewFolderResult } from "@ducter/protocol/src/new-folder.ts";
import type { GitLogin, GitLoginState } from "@ducter/protocol/src/git-login.ts";
import type { GhInstaller } from "./gh-install.ts";
import { actingPersona } from "./acting.ts";

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
  /** D395: which clones of a repository that worker has (with probe: whether its git can read it); default: its `clones` op. */
  clones?(device: string, remote: string, probe: boolean, timeoutMs: number): Promise<import("@ducter/protocol/src/clones.ts").ClonesAnswer | "offline" | "old">;
  /** D204: clone a Git address into that worker's Ducter folder, there; "old": too old to. */
  clone?(device: string, address: string, timeoutMs: number): Promise<CloneResult | "offline" | "old">;
  /** D272: make <Ducter folder>/projects/<name> on that worker, there; "old": too old to. */
  newFolder?(device: string, name: string, timeoutMs: number): Promise<NewFolderResult | "offline" | "old">;
  /** D272: that worker's GitHub sign-in, there (git-login.ts); "offline" / "old" as the state. */
  gitLogin?(device: string, action: GitLoginAction, token: string | undefined, timeoutMs: number): Promise<GitLoginState>;
  /** D204: move that worker's Ducter folder (its projects/ and worktrees/) to path, there; the move is done by the worker. */
  moveFolder?(device: string, path: string, timeoutMs: number): Promise<FolderMoveResult | "offline" | "old">;
}

export type GitLoginAction = "status" | "start" | "wait" | "token" | "cancel";

/** D203: how long a computer's reported repos are kept before they are asked again. */
export const REPOS_KEEP_MS = 10 * 60_000;

/** D204: a computer's Ducter folder and the projects in it. */
export interface FolderProjects {
  folder: string;
  repos: FoundRepo[];
  /** Why that folder: env (DUCTER_FOLDER set there) can't be changed from here; chosen is the person's. */
  why?: "env" | "chosen" | "data" | "default" | "fallback";
}

/**
 * D203, D204: each computer's projects (those in its Ducter folder), kept REPOS_KEEP_MS: the
 * home's own from `home`, a worker's from its `repos` op. A read that takes longer than the card
 * waits still lands here for the next card; an away worker has none, an old one says it is old.
 */
export interface FoundRepos {
  get(device: string, waitMs: number): Promise<FoundRepo[]>;
  /** D204: what that computer last said of its Ducter folder (absent: not heard from yet, or away). */
  folder(device: string): { path?: string; old?: true; why?: "env" | "chosen" | "data" | "default" | "fallback" } | undefined;
  /** D204: forget what that computer said (a clone there just added a project). */
  forget(device: string): void;
}

export function createFoundRepos(o: { computers?: NewTaskComputers; home?: () => FolderProjects; now?: () => number; keepMs?: number }): FoundRepos {
  const now = o.now ?? Date.now;
  const keep = o.keepMs ?? REPOS_KEEP_MS;
  const kept = new Map<string, { at: number; repos: FoundRepo[]; folder?: string; why?: "env" | "chosen" | "data" | "default" | "fallback"; old?: true }>();
  const asking = new Map<string, Promise<FoundRepo[]>>();
  const ask = (device: string): Promise<FoundRepo[]> => {
    const had = asking.get(device);
    if (had) return had;
    const p = (async () => {
      let got: { repos: FoundRepo[]; folder?: string; why?: "env" | "chosen" | "data" | "default" | "fallback"; old?: true } = { repos: [] };
      try {
        if (isLocal(device)) {
          const h = o.home?.();
          if (h) got = { repos: h.repos, folder: h.folder, ...(h.why ? { why: h.why } : {}) };
        } else {
          const r = await o.computers?.repos?.(device, 15_000);
          if (r === "offline" || !r) return [];
          if (r === "old") got = { repos: [], old: true };
          else {
            // D203's answer was the list itself; D204's says the folder too.
            const list = Array.isArray(r) ? r : Array.isArray(r.repos) ? r.repos : [];
            got = { repos: list.filter((x) => x && typeof x.path === "string" && x.path.startsWith("/")), ...(!Array.isArray(r) && typeof r.folder === "string" ? { folder: r.folder } : {}), ...(!Array.isArray(r) && r.why ? { why: r.why } : {}) };
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
      return k ? { ...(k.folder ? { path: k.folder } : {}), ...(k.why ? { why: k.why } : {}), ...(k.old ? { old: true as const } : {}) } : undefined;
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
  /** D627: true while this home is frozen for a move: no new task starts. */
  held?: () => boolean;
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
  /** D272: make a folder in the home's own Ducter folder (default: none, the card offers no new folder here). */
  newFolderHome?: (name: string) => NewFolderResult;
  /** D272: the home's own GitHub sign-in. */
  gitLoginHome?: GitLogin;
  /** D345: puts gh on the home when it isn't there (the person's 装上 gh). */
  ghInstaller?: GhInstaller;
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

/** D204: what a folder change did (or why not); the clients put it in their own language. */
export type FolderChangeAnswer =
  | { ok: true; device: string; from: string; path: string; projects: number; worktrees: number; repaired: number }
  | { ok: false; device: string; from?: string; reason: FolderChangeReason; tasks?: { taskId: string; title: string }[]; message: string };

/** D204: a task is "running in" a folder while it can still work there (finished ones only keep their copies). */
const RUNNING = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

/** D204: the absolute paths a place works in. */
function placePaths(p: Place | undefined): string[] {
  if (!p) return [];
  if (p.kind === "repo") return [p.repoPath, ...(p.worktree ? [p.worktree] : [])];
  if (p.kind === "folder") return [p.path];
  return [];
}

/**
 * D204 (the person's choice): move a computer's Ducter folder to the path they chose. Refused while
 * a task can still work in it (said which); the move carries projects/ and worktrees/, repairs git's
 * worktree paths, keeps the choice for that computer, and records `folder_moved` on the home so the
 * tasks opened before it still resolve. DUCTER_FOLDER, when set there, wins and can't be changed here.
 */
export async function changeDucterFolder(d: Pick<NewTaskDeps, "tasks" | "dataDir" | "settings" | "log" | "computers" | "projects" | "found">, device: string | undefined, raw: string): Promise<FolderChangeAnswer> {
  const dev = isLocal(device) ? "local" : device!;
  const local = dev === "local";
  const name = local ? (d.computers?.homeName() ?? "this computer") : (d.computers?.nameOf(dev) ?? dev);
  let from = "";
  if (local) {
    const now = ducterFolder({ dataDir: d.dataDir });
    if (now.why === "env") return { ok: false, device: dev, reason: "env", message: "DUCTER_FOLDER is set here, so the Ducter folder can't be changed from Settings." };
    from = now.path;
  } else {
    if (!d.computers?.repos) return { ok: false, device: dev, reason: "old", message: `${name} can't say where its Ducter folder is; update Ducter there first.` };
    const r = await d.computers.repos(dev, 15_000);
    if (r === "offline") return { ok: false, device: dev, reason: "offline", message: `${name} can't be reached right now.` };
    if (r === "old") return { ok: false, device: dev, reason: "old", message: `${name} runs an older Ducter that can't move its folder; update it first.` };
    if (r.why === "env") return { ok: false, device: dev, reason: "env", message: "DUCTER_FOLDER is set on this computer, so its Ducter folder can't be changed from Settings." };
    from = r.folder;
  }
  // No task may be working in the folder (or in a working copy inside it) while it moves.
  const tasks = d.tasks
    .list()
    .filter((c) => RUNNING.has(c.attention) && ((("device" in c.place && c.place.device) || "local") === dev) && placePaths(c.place).some((p) => underFolder(from, p)))
    .map((c) => ({ taskId: c.taskId, title: c.title }));
  if (tasks.length) return { ok: false, device: dev, from, reason: "tasks_running", tasks, message: `${tasks.length === 1 ? "A task is" : `${tasks.length} tasks are`} running in ${from}. Try again when ${tasks.length === 1 ? "it is" : "they are"} done.` };
  let r: FolderMoveResult | "offline" | "old";
  try {
    r = local
      ? await moveDucterFolder({ from, to: String(raw ?? ""), dataDir: d.dataDir })
      : await (d.computers!.moveFolder ? d.computers!.moveFolder(dev, String(raw ?? ""), 5 * 60_000) : Promise.resolve("old" as const));
  } catch (err) {
    return { ok: false, device: dev, from, reason: "failed", message: (err as Error).message };
  }
  if (r === "offline") return { ok: false, device: dev, from, reason: "offline", message: `${name} can't be reached right now.` };
  if (r === "old") return { ok: false, device: dev, from, reason: "old", message: `${name} runs an older Ducter that can't move its folder; update it first.` };
  if (!r.ok) return { ok: false, device: dev, from, reason: r.reason, message: r.message };
  if (local) writeChosenFolder(d.dataDir, r.path);
  d.settings?.setFolder?.(dev, r.path);
  d.projects?.remap(from, r.path, dev);
  d.found?.forget(dev);
  d.log.append({ stream: "channel", origin: "system", kind: "folder_moved", body: { from, to: r.path, device: dev, projects: r.projects, worktrees: r.worktrees } });
  return { ok: true, device: dev, from, path: r.path, projects: r.projects, worktrees: r.worktrees, repaired: r.repaired };
}

/**
 * D272: 在 {computer} 上新建一个文件夹 / New folder on {computer}: that computer makes
 * <Ducter folder>/projects/<name>, then the home adds it as a project there (D186, D197), git or
 * not, and answers the place the card then offers.
 */
export async function newFolderProject(
  d: Pick<NewTaskDeps, "computers" | "newFolderHome">,
  device: string | undefined,
  name: string,
  add: (path: string, device?: string) => Promise<{ ok: true; place: PlaceChoice } | { ok: false; reason?: string; message?: string }>,
): Promise<{ ok: true; place: PlaceChoice; existed?: true } | { ok: false; reason: "invalid" | "offline" | "old" | "failed"; message: string }> {
  let r: NewFolderResult | "offline" | "old";
  const label = isLocal(device) ? (d.computers?.homeName() ?? "") : (d.computers?.nameOf(device!) ?? device!);
  try {
    if (isLocal(device)) {
      if (!d.newFolderHome) return { ok: false, reason: "failed", message: "Folders can't be made here." };
      r = d.newFolderHome(name);
    } else {
      const c = d.computers;
      if (!c?.newFolder || !c.nameOf(device!)) return { ok: false, reason: "failed", message: "That computer isn't one of this home's." };
      r = await c.newFolder(device!, name, 15_000);
    }
  } catch (err) {
    return { ok: false, reason: "failed", message: (err as Error).message };
  }
  if (r === "offline") return { ok: false, reason: "offline", message: `${label} can't be reached right now.` };
  if (r === "old") return { ok: false, reason: "old", message: `${label} runs an older Ducter that can't make folders yet; update it first.` };
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
  const added = await add(r.path, isLocal(device) ? undefined : device);
  if (!added.ok) return { ok: false, reason: added.reason === "offline" ? "offline" : "failed", message: added.message ?? "The folder is there, but it couldn't be added." };
  return { ok: true, place: added.place, ...(r.existed ? { existed: true as const } : {}) };
}

/** D272: how long each step of a GitHub sign-in may take through a worker. */
export const GIT_LOGIN_WAIT_MS: Record<GitLoginAction, number> = { status: 30_000, start: 60_000, wait: 17 * 60_000, token: 60_000, cancel: 30_000 };

/** D272: a GitHub sign-in step on that computer (the home's own, or a worker's, there). */
export async function gitLoginOn(d: Pick<NewTaskDeps, "computers" | "gitLoginHome" | "ghInstaller">, device: string | undefined, action: GitLoginAction, token?: string): Promise<GitLoginState> {
  try {
    if (isLocal(device)) {
      const g = d.gitLoginHome;
      if (!g) return { state: "failed", reason: "failed", message: "GitHub sign-in isn't available here." };
      const s = await (action === "token" ? g.token(token ?? "") : g[action]());
      // D345: no gh on the home: say how it would be put there, so the person can tap for it.
      const plan = s.state === "no_gh" ? d.ghInstaller?.plan() : undefined;
      return plan ? { ...s, install: plan } : s;
    }
    const c = d.computers;
    if (!c?.gitLogin || !c.nameOf(device!)) return { state: "failed", reason: "failed", message: "That computer isn't one of this home's." };
    return await c.gitLogin(device!, action, token, GIT_LOGIN_WAIT_MS[action]);
  } catch (err) {
    return { state: "failed", reason: "failed", message: (err as Error).message };
  }
}

/**
 * D345: 装上 gh / Install gh on the home: the person tapped for it, so it is their Go (principle
 * 18); it is said before (the plan on no_gh), shown while it runs (onState installing, with
 * progress), and logged (tool_install, which Done for you lists). Ends signed_out when gh is
 * there (the sign-in starts next), else failed with why.
 */
export async function ghInstallHome(d: Pick<NewTaskDeps, "ghInstaller" | "gitLoginHome" | "log">, onState: (s: GitLoginState) => void): Promise<GitLoginState> {
  const inst = d.ghInstaller;
  const g = d.gitLoginHome;
  if (!inst || !g) return { state: "failed", reason: "unsupported", message: "Ducter can't put gh on this computer." };
  const before = await g.status();
  if (before.state !== "no_gh") return before;
  const plan = inst.plan();
  if (!plan) return { state: "failed", reason: "unsupported", message: "There's no gh build Ducter can put on this computer." };
  const log = (phase: Bodies["tool_install"]["phase"], extra: Partial<Bodies["tool_install"]> = {}) =>
    d.log.append({ stream: "devices", origin: "system", kind: "tool_install", body: { device: "local", tool: "gh", how: plan.how, where: plan.where, phase, by: "user", ...extra } });
  log("started");
  onState({ state: "installing", install: plan });
  const r = await inst.install((p) => onState({ state: "installing", install: { how: p.how, where: p.where }, ...(p.progress !== undefined ? { progress: p.progress } : {}) }));
  if (!r.ok) {
    log("failed", { how: r.how, where: r.where, detail: r.message });
    return { state: "failed", reason: r.reason, message: r.message, install: { how: r.how, where: r.where } };
  }
  log("done", { how: r.how, where: r.where, ...(r.version ? { version: r.version } : {}) });
  const after = await g.status();
  if (after.state === "no_gh") return { state: "failed", reason: "install", message: "gh was put there, but Ducter still can't run it.", install: { how: r.how, where: r.where } };
  return after;
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
  /** D206: pictures dropped on the What row; they go to the task with the words (not to a routine yet). */
  media?: import("@ducter/protocol").MediaRef[];
  /** D285: 带着它开新任务 / New task from this: the task it carries findings from. */
  from?: string;
  /** D285: the brief when it differs from the words (the words plus what that task found); the title stays the words'. */
  brief?: string;
  /** D391: 从这一步重来 / Redo from here: the step of `from` it redoes, and the commit its code starts from. */
  fromStep?: number;
  fromCommit?: string;
  /** D522: the to-do's number(s) its branch starts with. */
  todo?: string;
  /** D508: a to-do from the person's own apps: its own title is the task's (whole; a source's title is
   *  a name, not the person's sentence), and the person's language is the one it reports in (the
   *  issue's words are not the person's: an English issue told the task English). */
  title?: string;
  language?: LangTag;
}

export type NewTaskResult = { ok: true; card: TaskCard } | { ok: true; routine: RoutineView } | { ok: false; reason: NewTaskReason; message: string };

/** D185: what the task is told first when it starts by waiting (its own wait_for, D112 (4)). */
export function waitFirstBrief(condition: string, words: string, lang: LangTag): string {
  return fill(wordsIn(WAIT_FIRST, lang), { condition, words });
}
const WAIT_FIRST = {
  zh: "先等到：{condition}\n然后：{words}\n\n（等的时候用 wait_for 和一个检查来等，别自己轮询；等到了会叫醒你。）",
  en: "First wait until: {condition}\nThen: {words}\n\n(Wait with wait_for and a check, never by polling yourself; you are woken when it holds.)",
};

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

/** D508: a to-do's own title, whole, up to what a card's two lines hold (columns; Han counts two). */
export const TITLE_MAX = 200;

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
  const cols = (x: string) => [...x].reduce((n, ch) => n + wide(ch), 0);
  if (!CJK.test(head)) {
    // English: back to the last whole word, when there is one past the middle.
    const sp = head.lastIndexOf(" ");
    if (sp > max / 2) head = head.slice(0, sp);
  } else {
    // A Han title has no spaces: cut at the last clause's end (，；：、 or their Latin twins),
    // never inside a phrase; "…后，" says the same thing as "…" with a whole clause before it.
    let at = -1;
    for (const mark of ["，", ",", "；", ";", "：", ":", "、"]) at = Math.max(at, head.lastIndexOf(mark));
    if (at > 0 && cols(head.slice(0, at)) >= max / 2) {
      head = head.slice(0, at);
      head = head.replace(/(?:之后|以后|之前|以前|后|时|则|就|并|且|而)$/u, "");
    }
  }
  return head.replace(/[，,;；:：、\s]+$/, "") + "…";
}

/** The language the task reports in (D292): the partner's setting, else the words themselves, else English. */
export function languageOf(words: string, settings?: SettingsApi): LangTag {
  const l = settings?.get().language;
  if (l && l !== "auto") return l;
  return detect(words)?.lang ?? "en";
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
  if (d.held?.()) {
    return {
      ok: false,
      reason: "failed",
      message: languageOf(words, d.settings).startsWith("zh") ? "Ducter 正在搬到另一台电脑，先不接新任务；搬完再开。" : "Ducter is moving to another computer, so it isn't taking new tasks right now.",
    };
  }
  const runner = d.runner();
  if (!runner) return { ok: false, reason: "failed", message: languageOf(words, d.settings).startsWith("zh") ? "现在开不了任务。" : "Tasks can't run right now." };
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
      // D391: a redo starts from a commit (its sha), not a branch.
      if (baseBranch && b.branches.length && !b.branches.includes(baseBranch) && !/^[0-9a-f]{7,40}$/.test(baseBranch))
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
  const title = (input.title?.trim() ? cutAtWord(input.title, TITLE_MAX) : "") || titleFromWords(words);
  const when = input.when;
  const language = input.language ?? languageOf(words, d.settings);
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
        language,
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
      persona: actingPersona() ?? d.persona.id, // D312: opened from another partner's conversation: it is that partner's
      title,
      brief: when?.kind === "when" ? waitFirstBrief(condition, input.brief ?? words, language) : (input.brief ?? words),
      place,
      project,
      ...(input.harness ? { harness: input.harness, ...(input.model ? { model: input.model } : {}) } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      language,
      origin: "you",
      ...(input.media?.length ? { media: input.media } : {}),
      ...(input.from && input.brief ? { from: input.from } : {}),
      ...(input.from && input.brief && input.fromStep ? { fromStep: input.fromStep, ...(input.fromCommit ? { fromCommit: input.fromCommit } : {}) } : {}),
      ...(input.todo ? { todo: input.todo } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // D207: a folder in Ducter's own data folder (a worker's comes back as its message).
    const reason: NewTaskReason = (err as Error)?.name === "DucterDataError" || /is Ducter's own data folder/.test(message) ? "ducter_data" : /no AI agent can take|can't take this task/i.test(message) ? "no_agent" : /offline|can't reach|not connected/i.test(message) || (err as Error)?.name === "DeviceOfflineError" ? "offline" : "failed";
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
  // A place on a computer this home no longer knows (a name that isn't the home's or a worker's,
  // 2026-11-11: "/Users/weyl" on "Siweis-MacBook-Pro") can't be started there: it isn't offered.
  const known = (c: PlaceChoice) => {
    const dev = c.place.kind === "repo" || c.place.kind === "folder" ? c.place.device : undefined;
    if (isLocal(dev) || !d.computers) return true;
    const ws = d.computers.workers?.(); // away ones too: their places stay listed
    return ws ? ws.some((w) => w.id === dev || w.name === dev) : d.computers.nameOf(dev!) !== undefined;
  };
  const used = [...seen.values()].filter(known).sort((a, b) => (b.usedAt ?? "").localeCompare(a.usedAt ?? ""));
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
    // why only where the person must see it: the env can't be changed here, a chosen path is theirs.
    if (f?.path || f?.old) folders.push({ device: dev, ...(f.path ? { path: f.path } : {}), ...(f.why === "env" || f.why === "chosen" ? { why: f.why } : {}), ...(f.old ? { old: true as const } : {}) });
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
