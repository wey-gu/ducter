// D391: where a task on a repository works, decided by code from the repository itself (its
// remote: owner/name, a GitHub address, a to-do's `where`), never from a path a model guessed.
// One resolver for every way a repository task starts: the partner's task_open, a to-do handed
// over from On hand, a hand-over of several (D385), and 再试一次 on a task that couldn't start.
//
// The order (D385's, generalized):
//   1. a computer the person named in words (or the place's own device when the partner set one);
//   2. a where-rule (a rule with a computer whose words match the work, D89/D372);
//   3. a computer that has a clone of it: the one that can build first (a Mac, then a worker, then
//      a bare server home), then the most recently touched copy;
//   4. no clone anywhere: clone it, on the best computer whose own git can read it (its gh sign-in
//      or credentials), into that computer's Ducter folder;
//   5. no computer can read it: no place: the caller asks the person once, with the choice.
// A place the caller gave is kept when it is that repository on that computer (it exists, is a
// git repository, and its origin is the repository); a given path that isn't is replaced.
import { basename } from "node:path";
import type { CantStart, Place, RuleView, TaskCard } from "@ducter/protocol";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { remoteKey, type ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import { originOf, type RepoHint } from "@ducter/protocol/src/repos.ts";
import type { PlacesPort, PreflightResult } from "@ducter/protocol/src/internal.ts";
import { ruleFor } from "./rules.ts";

export type RepoPlace = Extract<Place, { kind: "repo" }>;

export interface WhereComputer {
  /** "local" for the home, else the worker's device id. */
  id: string;
  name: string;
  home: boolean;
  online: boolean;
  /** How well it builds code: 2 a Mac, 1 a worker that isn't a Mac, 0 a server home. */
  build: number;
}

export interface RepoWhereDeps {
  computers(): WhereComputer[];
  /** "Which clones of <remote> do you have" on that computer (with probe: and can your git read it). */
  clones(device: string, remote: string, probe: boolean, ms: number): Promise<ClonesAnswer | "offline" | "old">;
  /** What a folder on that computer is (exists, a repo, its origin). */
  folder(device: string, path: string, ms: number): Promise<FolderInfo | "offline">;
  rules?(): RuleView[];
  now?(): number;
  keepMs?: number;
  askMs?: number;
}

export interface RepoAsk {
  /** The repository: owner/name, a Git address, host/owner/name. */
  remote?: string;
  /** A computer the person named (its name or id). */
  named?: string;
  /** The place the caller had (the partner's, a card's): kept when it checks out. */
  given?: Place;
  /** The work's words (title, brief, the person's words): for a where-rule. */
  texts?: string[];
}

export type RepoWhere =
  | {
      ok: true;
      /** given: the caller's place checked out; named / rule / found: a clone there; clone: cloned there first. */
      how: "given" | "named" | "rule" | "found" | "clone";
      place: RepoPlace;
      /** The computer's name, said to the person. */
      computer: string;
      /** The repository's own name ("mem"). */
      repo: string;
      /** The other computers that have it too. */
      also?: string[];
    }
  | {
      ok: false;
      /** no_repo: the given path isn't a repository and no remote says which; no_access: no computer can read it; away: it is on a computer that is away. */
      why: "no_repo" | "no_access" | "away";
      message: string;
      repo?: string;
      /** The computers that were asked (names). */
      asked: string[];
      /** away: where it is. */
      on?: string;
    };

/** The repository's name, said in words ("nowledge-co/mem" → "mem"). */
export const repoName = (remote: string) => basename(remoteKey(remote) || remote).replace(/\.git$/i, "");

/** The repository a text names: a GitHub address, or owner/name#n (a to-do's ref); undefined when none. */
export function remoteIn(text: string): string | undefined {
  const url = /\bgithub\.com[/:]([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+?)(?:\.git)?(?=[/#?\s)"'`，。]|$)/.exec(text);
  if (url) return `${url[1]}/${url[2]}`;
  const ref = /(?:^|[\s(（「"'`])([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+)#\d+\b/.exec(text);
  if (ref) return `${ref[1]}/${ref[2]}`;
  return undefined;
}

/** A computer named in the person's words, by its name as a whole word ("在 MacBook 上做"). */
export function computerNamed(texts: string[], computers: WhereComputer[]): WhereComputer | undefined {
  const hay = texts.join("\n").toLowerCase();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The longest name first ("MacBook Pro" before "MacBook").
  for (const c of [...computers].sort((a, b) => b.name.length - a.name.length)) {
    const n = c.name.trim().toLowerCase();
    if (n.length < 3) continue;
    if (new RegExp(`(^|[^a-z0-9_-])${esc(n)}($|[^a-z0-9_-])`).test(hay)) return c;
  }
  return undefined;
}

export interface RepoWhereApi {
  resolve(a: RepoAsk): Promise<RepoWhere>;
  /** A place as given, checked where it is: a repository there (with that origin when remote is said). */
  check(place: RepoPlace, remote?: string): Promise<"ok" | "missing" | "not_repo" | "other_remote" | "offline">;
  /** Forget what a computer said (a clone there just made a copy). */
  forget(device?: string): void;
}

/** How long a computer's answer for one repository is kept. */
export const WHERE_KEEP_MS = 10 * 60_000;

export function createRepoWhere(d: RepoWhereDeps): RepoWhereApi {
  const now = d.now ?? Date.now;
  const keep = d.keepMs ?? WHERE_KEEP_MS;
  const askMs = d.askMs ?? 8_000;
  const kept = new Map<string, { at: number; a: ClonesAnswer }>();
  const ask = async (c: WhereComputer, remote: string, probe: boolean): Promise<ClonesAnswer | "offline" | "old"> => {
    const k = `${c.id}\u0000${remote}`;
    const had = kept.get(k);
    if (had && now() - had.at < keep && (!probe || had.a.clones.length || had.a.canRead !== undefined)) return had.a;
    if (!c.online) return "offline";
    const a = await d.clones(c.id, remote, probe, askMs).catch(() => "offline" as const);
    if (a !== "offline" && a !== "old") kept.set(k, { at: now(), a });
    return a;
  };
  const placeAt = (c: WhereComputer, h: RepoHint, given?: Place): RepoPlace => {
    const g = given?.kind === "repo" ? given : undefined;
    return { kind: "repo", device: c.id, repoPath: h.path, ...(g?.baseBranch ? { baseBranch: g.baseBranch } : {}) };
  };
  const best = (xs: { c: WhereComputer; h: RepoHint }[]) =>
    [...xs].sort((a, b) => b.c.build - a.c.build || (b.h.touchedAt ?? "").localeCompare(a.h.touchedAt ?? "") || (a.c.home ? 1 : 0) - (b.c.home ? 1 : 0))[0];

  const api: RepoWhereApi = {
    async check(place, remote) {
      const dev = place.device || "local";
      const info = await d.folder(dev, place.repoPath, askMs).catch(() => "offline" as const);
      if (info === "offline") return "offline";
      if (!info.exists) return "missing";
      if (info.kind !== "repo") return "not_repo";
      const want = remote ? remoteKey(remote) : "";
      if (want && info.remote && info.remote !== want) return "other_remote";
      return "ok";
    },
    forget(device) {
      for (const k of [...kept.keys()]) if (!device || k.startsWith(`${device}\u0000`)) kept.delete(k);
    },
    async resolve(a) {
      const comps = d.computers();
      const byId = (x: string | undefined) => {
        if (!x) return undefined;
        const l = x.trim().toLowerCase();
        if (l === "local") return comps.find((c) => c.home);
        return comps.find((c) => c.id.toLowerCase() === l || c.name.toLowerCase() === l);
      };
      const given = a.given?.kind === "repo" && typeof a.given.repoPath === "string" && a.given.repoPath ? a.given : undefined;
      const want = a.remote ? remoteKey(a.remote) : "";
      const asked = comps.map((c) => c.name);
      // No repository named: only the given place can be checked.
      if (!want) {
        if (!given) return { ok: false, why: "no_repo", message: "No repository was named.", asked };
        const c = byId(given.device) ?? comps.find((x) => x.home)!;
        const r = await api.check(given);
        if (r === "ok" || r === "offline") return { ok: true, how: "given", place: { ...given, device: c.id }, computer: c.name, repo: basename(given.repoPath) };
        return { ok: false, why: "no_repo", message: `${c.name} has no git repository at ${given.repoPath}.`, repo: basename(given.repoPath), asked: [c.name] };
      }
      const repo = repoName(want);
      // 1. A computer named in words (or the place's own device, set because the person named it).
      const named = byId(a.named) ?? (given && given.device && given.device !== "local" ? byId(given.device) : undefined);
      // 2. A where-rule: a rule with a computer whose words match this work.
      const rule = !named && a.texts?.length && d.rules ? ruleFor(d.rules().filter((r) => !!r.device), { title: a.texts[0] ?? "", brief: a.texts.slice(1).join("\n") }) : undefined;
      const ruled = rule?.device ? byId(rule.device) : undefined;
      const pinned = named ?? ruled;
      // The given place, when it is that repository on that computer, stays (its branch, its base).
      if (given) {
        const c = byId(given.device) ?? comps.find((x) => x.home)!;
        if (!pinned || pinned.id === c.id) {
          const r = await api.check({ ...given, device: c.id }, want);
          // A worker that is away right now: the task waits for it there (D157), as it would have.
          if (r === "ok" || (r === "offline" && !c.home)) return { ok: true, how: "given", place: { ...given, device: c.id }, computer: c.name, repo };
        }
      }
      const answers = await Promise.all(comps.map(async (c) => ({ c, a: await ask(c, want, false) })));
      const have = answers.flatMap(({ c, a }) => (a === "offline" || a === "old" ? [] : a.clones.map((h) => ({ c, h }))));
      const haveOn = (c: WhereComputer) => have.filter((x) => x.c.id === c.id);
      const also = (c: WhereComputer) => {
        const o = [...new Set(have.filter((x) => x.c.id !== c.id).map((x) => x.c.name))];
        return o.length ? { also: o } : {};
      };
      if (pinned) {
        const there = best(haveOn(pinned));
        if (there) return { ok: true, how: named ? "named" : "rule", place: placeAt(pinned, there.h, a.given), computer: pinned.name, repo, ...also(pinned) };
        if (!pinned.online) return { ok: false, why: "away", message: `${pinned.name} is away right now.`, repo, asked, on: pinned.name };
        const p = await ask(pinned, want, true);
        if (p !== "offline" && p !== "old" && p.canRead !== false) return { ok: true, how: "clone", place: clonePlace(pinned, want, a.given), computer: pinned.name, repo, ...also(pinned) };
        // The named computer can't read it: one that has it, if any, is still better than none.
      }
      const found = best(have);
      if (found) return { ok: true, how: "found", place: placeAt(found.c, found.h, a.given), computer: found.c.name, repo, ...also(found.c) };
      // 4. No clone anywhere: clone it where git can read it (the best builder first).
      const online = comps.filter((c) => c.online).sort((x, y) => y.build - x.build || (x.home ? 1 : 0) - (y.home ? 1 : 0));
      const probes = await Promise.all(online.map(async (c) => ({ c, a: await ask(c, want, true) })));
      const can = probes.find((p) => p.a !== "offline" && p.a !== "old" && p.a.canRead === true) ?? probes.find((p) => p.a !== "offline" && p.a !== "old" && p.a.canRead === undefined);
      if (can) return { ok: true, how: "clone", place: clonePlace(can.c, want, a.given), computer: can.c.name, repo };
      const away = comps.filter((c) => !c.online).map((c) => c.name);
      return {
        ok: false,
        why: "no_access",
        message: `No computer of this home has ${want.replace(/^github\.com\//, "")} or can read it with its own git sign-in${away.length ? ` (${away.join(", ")} away, not asked)` : ""}.`,
        repo,
        asked: online.map((c) => c.name),
      };
    },
  };
  return api;
}

/** A place that clones the repository on that computer first, into its Ducter folder (runner/src/places.ts). */
function clonePlace(c: WhereComputer, remote: string, given?: Place): RepoPlace {
  const g = given?.kind === "repo" ? given : undefined;
  const address = remote.startsWith("github.com/") ? remote.slice("github.com/".length) : `https://${remote}`;
  return { kind: "repo", device: c.id, repoPath: `~/ducter/projects/${repoName(remote)}`, clone: address, ...(g?.baseBranch ? { baseBranch: g.baseBranch } : {}) };
}

// ---------- the places port (CoreApi.places): task_open's pre-flight, a failed start's fixes ----------

export type { PlacesPort, PreflightResult };

const LINES = {
  zh: {
    no_repo: "没能开始：{computer} 上没有 {what} 的代码",
    no_folder: "没能开始：{computer} 上没有 {what} 这个文件夹",
    clone_failed: "没能开始：{what} 的代码没能拉到 {computer} 上",
    cloning: "{what} 的代码还没在哪台电脑上，我先在 {computer} 上拉一份。",
  },
  en: {
    no_repo: "Couldn't start: {computer} has no copy of {what}",
    no_folder: "Couldn't start: {computer} has no folder {what}",
    clone_failed: "Couldn't start: {what} couldn't be cloned onto {computer}",
    cloning: "{what}'s code isn't on any of your computers yet, so I'm cloning it on {computer} first.",
  },
} as const;
const line = (lang: "zh" | "en", k: keyof (typeof LINES)["zh"], v: Record<string, string>) => LINES[lang][k].replace(/\{(\w+)\}/g, (_, n: string) => v[n] ?? "");

export interface PlacesDeps {
  where: RepoWhereApi;
  computers(): WhereComputer[];
  tasks: { get(id: string): TaskCard | undefined };
  /** The task's own words (its last task_open's title and brief, and its language). */
  opened(taskId: string): { title: string; brief: string; language?: string } | undefined;
  /** The person's language now. */
  lang(): string;
  /** The to-do the partner took this turn (its repository), when it took one. */
  staged?(): { kind: string; where?: string } | undefined;
  /** This computer's files, for the early open's quick look (tests: a fake). */
  fs?: { isDir(p: string): boolean; readText(p: string): string | undefined; home: string };
}

const lang2 = (l: string | undefined): "zh" | "en" => (l && l.toLowerCase().startsWith("zh") ? "zh" : "en");

export function createPlaces(d: PlacesDeps): PlacesPort {
  const nameOf = (dev: string | undefined) => {
    const cs = d.computers();
    const c = !dev || dev === "local" ? cs.find((x) => x.home) : cs.find((x) => x.id === dev || x.name === dev);
    return c?.name ?? dev ?? "";
  };
  const isHere = (x: WhereComputer, dev: string) => (dev === "local" ? x.home : x.id === dev);
  /** The repository a task is on: its clone address, the to-do it is bound to, an address in its words. */
  const remoteOfTask = (c: TaskCard | undefined, words: string[]): string | undefined => {
    if (c?.place.kind === "repo" && c.place.clone) return c.place.clone;
    if (c?.source?.kind === "github" && c.source.where) return c.source.where;
    for (const w of words) {
      const r = remoteIn(w);
      if (r) return r;
    }
    return undefined;
  };
  const api: PlacesPort = {
    quick(place, remote) {
      if (place.kind !== "repo" || (place.device && place.device !== "local") || !d.fs) return false;
      const p = place.repoPath.startsWith("~/") ? `${d.fs.home}/${place.repoPath.slice(2)}` : place.repoPath;
      if (!d.fs.isDir(`${p}/.git`)) return false;
      if (!remote) return true;
      return originOf(d.fs.readText(`${p}/.git/config`)) === remoteKey(remote);
    },
    async preflight(a) {
      const place = a.place;
      const staged = d.staged?.();
      const remote = a.remote ?? (staged?.kind === "github" ? staged.where : undefined) ?? [...a.userTexts, ...a.texts].map(remoteIn).find(Boolean);
      // Only a repository place, or a place-less one whose work is on a named repository (a to-do on it).
      const onRepo = place.kind === "repo" || (place.kind === "none" && !!remote && (!!a.remote || !!staged));
      if (!onRepo) return { ok: true, place };
      const named = computerNamed(a.userTexts, d.computers());
      const r = await d.where.resolve({ ...(remote ? { remote } : {}), ...(named ? { named: named.id } : {}), given: place, texts: a.texts });
      if (r.ok) {
        const said = r.how === "clone" ? line(lang2(d.lang()), "cloning", { what: r.repo, computer: r.computer }) : undefined;
        return { ok: true, place: r.place, how: r.how, computer: r.computer, repo: r.repo, ...(said ? { said } : {}) };
      }
      const path = place.kind === "repo" ? place.repoPath : "";
      if (r.why === "no_repo")
        return {
          ok: false,
          error: `Not opened: ${r.message} Never guess a path. Give the repository instead, place {"kind":"repo","remote":"owner/name"}, and Ducter finds its copy on the user's computers or clones one; if you don't know which repository, ask the user in one short line and open no task yet.`,
        };
      if (r.why === "away") return { ok: false, error: `Not opened: ${r.message} Ask the user in one short line whether to wait for it or do it on another computer; open no task yet.` };
      return {
        ok: false,
        error: `Not opened: ${r.message} Ask the user once, in one short line with the choice: sign in to GitHub on one of their computers (Settings, that computer's card: 登录 GitHub / Sign in to GitHub) so Ducter can clone it there, or say where its code is. Open no task until they answer.${path ? ` (${path} was not it.)` : ""}`,
      };
    },
    async cantStart(taskId, p) {
      const c = d.tasks.get(taskId);
      const o = d.opened(taskId);
      const lang = lang2(o?.language ?? d.lang());
      const computer = nameOf(p.device);
      const remote = remoteOfTask(c, o ? [o.title, o.brief] : []);
      const what = remote ? repoName(remote) : basename(p.path) || p.path;
      const cant: CantStart = { why: p.why, computer, what, ...(p.path ? { path: p.path } : {}) };
      if (remote && p.why !== "no_folder") {
        const r = await d.where.resolve({ remote }).catch(() => undefined);
        if (r?.ok && r.how !== "clone" && !isHere(d.computers().find((x) => x.id === r.place.device) ?? ({ id: r.place.device, home: false } as WhereComputer), p.device)) cant.elsewhere = { device: r.place.device, name: r.computer };
        const here = d.computers().find((x) => isHere(x, p.device));
        if (p.why !== "clone_failed" && here?.online) cant.cloneHere = true;
      }
      return { ...cant, line: line(lang, p.why, { computer, what }) };
    },
    async replan(taskId, how) {
      const c = d.tasks.get(taskId);
      if (!c) return { ok: false, message: "No such task." };
      const o = d.opened(taskId);
      const remote = remoteOfTask(c, o ? [o.title, o.brief] : []);
      const dev = c.place.kind === "repo" || c.place.kind === "folder" ? c.place.device || "local" : "local";
      const keep = c.place.kind === "repo" && c.place.baseBranch ? { baseBranch: c.place.baseBranch } : {};
      if (how.action === "clone_here") {
        if (!remote) return { ok: false, message: "Ducter doesn't know which repository this is, so it can't clone it." };
        const here = d.computers().find((x) => isHere(x, dev));
        if (!here) return { ok: false, message: "That computer isn't one of this home's any more." };
        return { ok: true, place: { ...clonePlace(here, remoteKey(remote)), ...keep } };
      }
      if (!remote) {
        if (c.place.kind !== "repo") return { ok: true, place: c.place };
        const r = await d.where.resolve({ given: { kind: "repo", device: dev, repoPath: c.place.repoPath } });
        return r.ok ? { ok: true, place: { ...r.place, ...keep } } : { ok: false, message: r.message };
      }
      // Asked again, fresh: what the computers said before is what failed.
      d.where.forget();
      const given = c.place.kind === "repo" && how.action === "reopen" && !c.place.clone ? { given: { kind: "repo" as const, device: dev, repoPath: c.place.repoPath, ...keep } } : {};
      const r = await d.where.resolve({ remote, ...(how.action === "start_at" && how.device ? { named: how.device } : {}), ...given });
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, place: { ...r.place, ...keep } };
    },
  };
  return api;
}
