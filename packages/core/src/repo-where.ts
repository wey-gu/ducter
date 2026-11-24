// D395: where a task on a repository works, decided by code from the repository itself (its
// remote: owner/name, a GitHub address, a to-do's `where`), never from a path a model guessed.
// One resolver for every way a repository task starts: the partner's task_open, a to-do handed
// over from On hand, a hand-over of several (D385), and 再试一次 on a task that couldn't start.
//
// The order (D385's, generalized):
//   1. a computer the person named in words (or the place's own device when the partner set one);
//   2. a where-rule (a rule with a computer whose words match the work, D89/D372); then (D507)
//      the computer New tasks start names, when it is awake and has a copy or its git can read it;
//   3. a computer that has a clone of it: the one that can build first (a Mac, then a worker, then
//      a bare server home), then the most recently touched copy;
//   4. no clone anywhere: clone it, on the best computer whose own git can read it (its gh sign-in
//      or credentials), into that computer's Ducter folder;
//   5. no computer can read it: no place: the caller asks the person once, with the choice.
// A place the caller gave is kept when it is that repository on that computer (it exists, is a
// git repository, and its origin is the repository); a given path that isn't is replaced.
// D476: the person's word on where the work runs (only there, never there) holds in every step:
// a computer they excluded is never asked, picked, offered or cloned on.
import { basename } from "node:path";
import { harnessName, type CantStart, type Place, type RuleView, type TaskCard } from "@ducter/protocol";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { remoteKey, type ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import { originOf, type RepoHint } from "@ducter/protocol/src/repos.ts";
import type { PlacesPort, PreflightResult } from "@ducter/protocol/src/internal.ts";
import { allowedBy, boundFrom, boundWords, isBound, mergeBound, movableTo, type Bound } from "./bound.ts";

/** owner/name for words ("github.com/nowledge-co/mem" → "nowledge-co/mem"). */
const shortRemote = (r: string) => remoteKey(r).replace(/^github\.com\//, "") || r;
import { ruleFor } from "./rules.ts";

export type RepoPlace = Extract<Place, { kind: "repo" }>;

export interface WhereComputer {
  /** "local" for the home, else the worker's device id. */
  id: string;
  name: string;
  home: boolean;
  /** D476: other names the person calls it (its host name: "hel"). */
  aliases?: string[];
  /** D476: its platform ("darwin", "linux"), for "mac" or "服务器" when only one fits. */
  os?: string;
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
  /** D507: the computer New tasks start names ("local" or a worker's id), when the person set one. */
  prefer?(): string | undefined;
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
  /** D476: the person's word on where it runs: an excluded computer is never asked or picked; "only" is the named one. */
  bound?: Bound;
}

export type RepoWhere =
  | {
      ok: true;
      /** given: the caller's place checked out; named / rule / prefer (D507) / found: a clone there; clone: cloned there first. */
      how: "given" | "named" | "rule" | "prefer" | "found" | "clone";
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
      // D476: a computer the person excluded is never asked or picked; "only" is the named one.
      const all = d.computers();
      const comps = a.bound ? all.filter((c) => allowedBy(a.bound, c.home ? "local" : c.id)) : all;
      const only = a.bound?.only ? all.find((c) => (c.home ? "local" : c.id) === a.bound!.only) : undefined;
      if (a.bound && !comps.length) return { ok: false, why: "no_access", message: `The user ruled out every computer of this home for this work (${boundWords(a.bound, (id) => all.find((c) => (c.home ? "local" : c.id) === id)?.name ?? id)}).`, asked: [] };
      const byId = (x: string | undefined) => {
        if (!x) return undefined;
        const l = x.trim().toLowerCase();
        if (l === "local") return comps.find((c) => c.home);
        return comps.find((c) => c.id.toLowerCase() === l || c.name.toLowerCase() === l);
      };
      const given = a.given?.kind === "repo" && typeof a.given.repoPath === "string" && a.given.repoPath && allowedBy(a.bound, a.given.device || "local") ? a.given : undefined;
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
      const named = only ?? byId(a.named) ?? (given && given.device && given.device !== "local" ? byId(given.device) : undefined);
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
        // D477: a computer named (by the person's recorded word, or the partner's place.device) can't
        // read it: never a quiet move to another computer's copy (hel, 2026-11-22). The facts go back.
        if (named) {
          const copies = [...new Set(have.map((x) => x.c.name))];
          return { ok: false, why: "no_access", message: `${pinned.name} has no copy of ${shortRemote(want)} and its own git sign-in can't read it${copies.length ? `; ${copies.join(", ")} ${copies.length > 1 ? "have" : "has"} a copy` : ""}${only ? `, and the user said to do this work only on ${pinned.name}` : ""}.`, repo, asked: [pinned.name] };
        }
        // A where-rule's computer can't read it: one that has it, if any, is still better than none.
      }
      // D507: New tasks start names a computer: its copy there, else a clone there when its own git
      // can read it. Asleep, away or unable to read it: the copies elsewhere decide, as before.
      const preferred = pinned ? undefined : byId(d.prefer?.());
      if (preferred?.online) {
        const there = best(haveOn(preferred));
        if (there) return { ok: true, how: "prefer", place: placeAt(preferred, there.h, a.given), computer: preferred.name, repo, ...also(preferred) };
        const p = await ask(preferred, want, true);
        if (p !== "offline" && p !== "old" && p.canRead === true) return { ok: true, how: "clone", place: clonePlace(preferred, want, a.given), computer: preferred.name, repo, ...also(preferred) };
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
    busy: "没能开始：{computer} 上 {what} 的仓库一直被另一个 git 占着",
    agent: "没能开始：{what} 没能在 {computer} 上启动",
    not_installed: "没能开始：{computer} 上还没装 {what}",
    signed_out: "没能开始：{what} 在 {computer} 上还没登录",
    old: "没能开始：{computer} 上的 Ducter 版本太旧，还用不了 {what}",
    away: "没能开始：{computer} 连不上了",
    other: "没能开始：{what} 在 {computer} 上一开始就出了错",
    other_bare: "没能开始：开始的时候出了问题",
    cloning: "{what} 的代码还没在哪台电脑上，我先在 {computer} 上拉一份。",
    cloningHere: "{computer} 上还没有 {what} 的代码，我先在那里拉一份。",
  },
  en: {
    no_repo: "Couldn't start: {computer} has no copy of {what}",
    no_folder: "Couldn't start: {computer} has no folder {what}",
    clone_failed: "Couldn't start: {what} couldn't be cloned onto {computer}",
    busy: "Couldn't start: another git kept {what}'s repository busy on {computer}",
    agent: "Couldn't start: {what} didn't start on {computer}",
    not_installed: "Couldn't start: {what} isn't installed on {computer}",
    signed_out: "Couldn't start: {what} isn't signed in on {computer}",
    old: "Couldn't start: Ducter on {computer} is too old for {what}",
    away: "Couldn't start: {computer} can't be reached",
    other: "Couldn't start: {what} hit an error as it started on {computer}",
    other_bare: "Couldn't start: something went wrong as it started",
    cloning: "{what}'s code isn't on any of your computers yet, so I'm cloning it on {computer} first.",
    cloningHere: "{computer} doesn't have {what}'s code yet, so I'm cloning it there first.",
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
  /** D472: what a folder on that computer is (whether it is there), for a folder task's pre-flight. */
  folder?(device: string, path: string, ms: number): Promise<FolderInfo | "offline">;
  /** D476, D477: the person's word on where, as recorded on the task (its task_open's bound), when it has one. */
  boundKept?(taskId: string): Bound | undefined;
}

const lang2 = (l: string | undefined): "zh" | "en" => (l && l.toLowerCase().startsWith("zh") ? "zh" : "en");

export function createPlaces(d: PlacesDeps): PlacesPort {
  const nameOf = (dev: string | undefined) => {
    const cs = d.computers();
    const c = !dev || dev === "local" ? cs.find((x) => x.home) : cs.find((x) => x.id === dev || x.name === dev);
    return c?.name ?? dev ?? "";
  };
  const isHere = (x: WhereComputer, dev: string) => (dev === "local" ? x.home : x.id === dev);
  /** A computer's bound id: "local" for the home. */
  const idOf = (x: WhereComputer) => (x.home ? "local" : x.id);
  const findComputer = (dev: string | undefined) => {
    const cs = d.computers();
    if (!dev || dev.toLowerCase() === "local") return cs.find((x) => x.home);
    const l = dev.toLowerCase();
    return cs.find((x) => x.id.toLowerCase() === l || x.name.toLowerCase() === l || (x.aliases ?? []).some((a) => a.toLowerCase() === l));
  };
  /** D477: the person's word on where a task's work runs, as the partner recorded it on the task. */
  const boundOf = (taskId: string): Bound | undefined => {
    const b = d.boundKept?.(taskId);
    return isBound(b) ? b : undefined;
  };
  const said = (b: Bound) => boundWords(b, (id) => nameOf(id));
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
      // D476: the person's word on where it runs: their words now, the task's own, and the work this
      // one carries on (a rethink's task opened again keeps what the person said for it).
      // D477: the person's word on where it runs, as the partner recorded it (task_open's `where`, by
      // computer name), merged with the word of the task this one replaces. No code reads it from the
      // words; a name that is no computer here goes back to the partner.
      const rec = boundFrom(a.where, d.computers());
      if ("unknown" in rec) return { ok: false, error: `Not opened: ${rec.unknown.map((n) => `"${n}"`).join(", ")} ${rec.unknown.length > 1 ? "are" : "is"} not a computer of this home. Its computers: ${d.computers().map((c) => c.name).join(", ")}. Call task_open again with where naming them as written there.` };
      const merged = mergeBound(a.replaces ? boundOf(a.replaces) : undefined, rec.bound);
      const b = isBound(merged) ? merged : undefined;
      const kept = <T extends PreflightResult>(r: T): T => (r.ok && b ? { ...r, bound: b } : r);
      const cloneSaid = (r: { how: string; repo: string; computer: string; also?: string[] }) =>
        r.how === "clone" ? line(lang2(d.lang()), r.also?.length || b ? "cloningHere" : "cloning", { what: r.repo, computer: r.computer }) : undefined;
      // A place on a computer the person ruled out is refused before anything opens.
      const pdev = "device" in place && place.device ? place.device : undefined;
      const pc = pdev ? findComputer(pdev) : undefined;
      if (b && pc && !allowedBy(b, idOf(pc))) {
        const to = b.only ? nameOf(b.only) : "";
        return { ok: false, error: `Not opened: the user said this work runs ${said(b)}, so it can't open on ${pc.name}. Open it again ${to ? `on ${to} (place.device "${to}")` : "on a computer they allow"}, with the repository as place {"kind":"repo","remote":"owner/name"} when its folder isn't there (Ducter clones it there first). Never on ${pc.name}. Only if it truly can't be done there, tell the user why in one short line.` };
      }
      // D472: a folder is looked for on its computer before the task exists (hel, 2026-11-22: a task
      // opened in /root/dev/mem, which wasn't there, failed at once and the person had to ask why).
      if (place.kind === "folder" && d.folder) {
        const c = pc ?? findComputer(undefined);
        const info = c ? await d.folder(c.id, place.path, 4_000).catch(() => "offline" as const) : "offline";
        if (info !== "offline" && !info.exists) {
          const name = c!.name;
          // D477: the repository the partner recorded (place.remote, a to-do): the code isn't on this
          // computer yet, so it is fetched there first, a step of the work, never a failure. Which
          // repository a folder name means is never guessed here: the partner judges it from the
          // words and [devices] (the code on each computer, with origins).
          if (remote && allowedBy(b, idOf(c!))) {
            const r = await d.where.resolve({ remote, named: c!.id, ...(b ? { bound: b } : {}), texts: a.texts });
            if (r.ok) {
              const s = cloneSaid(r);
              return kept({ ok: true, place: r.place, how: r.how, computer: r.computer, repo: r.repo, ...(s ? { said: s } : {}) });
            }
            return { ok: false, error: `Not opened: ${name} has no folder ${place.path}, and ${r.message}` };
          }
          return {
            ok: false,
            error: `Not opened: ${name} has no folder ${place.path}. Never guess another path. If the user's words and [devices] (the code on each computer, with its origin) tell you which repository this is, open it with place {"kind":"repo","remote":"owner/name","device":"${name}"}: Ducter clones it there first. If not, ask the user in one short line which folder or repository it is; open no task yet.`,
          };
        }
      }
      if (!onRepo) return kept({ ok: true, place });
      // D477: the computer is the person's recorded word, else the one the partner chose by name in
      // place.device ("local" is the schema's old default token, not a choice).
      const namedId = b?.only ?? b?.named;
      const named = namedId ? findComputer(namedId) : pdev && pdev.toLowerCase() !== "local" ? pc : undefined;
      const r = await d.where.resolve({ ...(remote ? { remote } : {}), ...(named ? { named: named.id } : {}), given: place, texts: a.texts, ...(b ? { bound: b } : {}) });
      // D477: no copy anywhere and nothing says where: making a new copy somewhere is a choice, and
      // it is the partner's (the person's words, the agents in [devices]), never the best-builder rule.
      const online = d.computers().filter((c) => c.online);
      if (r.ok && r.how === "clone" && !named && online.length > 1)
        return { ok: false, error: `Not opened yet: no computer has ${r.repo} yet, so it is cloned where the work will run. Call task_open again with place.device: one of ${online.map((c) => c.name).join(", ")}, where the user's words put it (with none, the one whose agents fit the work; the home is ${online.find((c) => c.home)?.name ?? "local"}). Say nothing about this.` };
      if (r.ok) {
        const s = cloneSaid(r);
        return kept({ ok: true, place: r.place, how: r.how, computer: r.computer, repo: r.repo, ...(s ? { said: s } : {}) });
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
        error: `Not opened: ${r.message} If the user's words allow a computer that has a copy, open it there (place.device). Otherwise ask the user once, in one short line with the choice: sign in to GitHub on one of their computers (Settings, that computer's card: 登录 GitHub / Sign in to GitHub) so Ducter can clone it there, or say where its code is. Open no task until they answer.${path ? ` (${path} was not it.)` : ""}`,
      };
    },
    async cantStart(taskId, p) {
      const c = d.tasks.get(taskId);
      const o = d.opened(taskId);
      const lang = lang2(o?.language ?? d.lang());
      const computer = nameOf(p.device);
      const remote = remoteOfTask(c, o ? [o.title, o.brief] : []);
      // D415: the agent's own name when it is the agent that didn't start; a repository's name for a
      // lock (the lock's own path is never the card's word); else the repository or the folder.
      const repoOf = c?.place.kind === "repo" ? basename(c.place.repoPath) : "";
      const agentWhy = p.why === "agent" || p.why === "not_installed" || p.why === "signed_out" || p.why === "old" || p.why === "other";
      // D472: a folder that isn't there may still be a repository Ducter knows by its name (a project's origin).
      // D476: from every project and task place Ducter knows, and the task's own words ("Nowledge Mem").
      const folderName = basename(p.path) || "";
      const repo = remote;
      const what = agentWhy ? harnessName(c?.harness ?? "") : repo ? repoName(repo) : p.why === "busy" ? repoOf || "this" : folderName || p.path || repoOf;
      const cant: CantStart = { why: p.why, computer, what, device: p.device, ...(c?.harness ? { harness: c.harness } : {}), ...(p.path && p.why !== "busy" ? { path: p.path } : {}) };
      if (p.why === "busy" && p.path.endsWith(".lock")) cant.clearLock = true;
      const here = d.computers().find((x) => isHere(x, p.device));
      // D476: a computer the person ruled out is never offered, and nothing is cloned onto it.
      const b = boundOf(taskId);
      const offer = (dev: string) => allowedBy(b, dev);
      if (repo && (p.why === "no_repo" || p.why === "no_folder" || p.why === "other" || p.why === "clone_failed")) {
        const r = await d.where.resolve({ remote: repo, ...(b ? { bound: b } : {}) }).catch(() => undefined);
        if (r?.ok && r.how !== "clone" && !isHere(d.computers().find((x) => x.id === r.place.device) ?? ({ id: r.place.device, home: false } as WhereComputer), p.device) && offer(r.place.device)) cant.elsewhere = { device: r.place.device, name: r.computer };
        if ((p.why === "no_repo" || p.why === "no_folder" || p.why === "other") && here?.online && offer(p.device)) cant.cloneHere = true;
      }
      // D472: the task's own words name another computer than the one it went to (an agent picked
      // for that computer's sign-in moved it): 在 {that computer} 上做 is its fix.
      const meantId = b?.only ?? b?.named;
      const meant = meantId ? findComputer(meantId) : undefined;
      if (!cant.elsewhere && meant && !isHere(meant, p.device) && p.why !== "busy" && offer(idOf(meant))) cant.elsewhere = { device: meant.id, name: meant.name };
      // D476: it went to a computer the person ruled out: the one they allow is the fix, never an offer elsewhere.
      if (cant.elsewhere && !offer(cant.elsewhere.device)) delete cant.elsewhere;
      // D472: or a folder already on that computer, chosen there (D455's sheet), and it starts in it.
      if ((p.why === "no_folder" || p.why === "no_repo") && here?.online) cant.pickHere = true;
      const lk = p.why === "other" && (!computer || !what) ? "other_bare" : p.why;
      return { ...cant, line: line(lang, lk, { computer, what }) };
    },
    async replan(taskId, how, by = "person") {
      const c = d.tasks.get(taskId);
      if (!c) return { ok: false, message: "No such task." };
      const o = d.opened(taskId);
      const fromWords = remoteOfTask(c, o ? [o.title, o.brief] : []);
      // D477: the repository is what the task recorded (its clone, its to-do, an owner/name in its words), never a folder name matched by code.
      const remote = fromWords;
      const dev = c.place.kind === "repo" || c.place.kind === "folder" ? c.place.device || "local" : "local";
      const keep = c.place.kind === "repo" && c.place.baseBranch ? { baseBranch: c.place.baseBranch } : {};
      // D476: the person's word on where it runs. Ducter's own mends hold to it (never off a computer
      // they named, never onto one they ruled out); the person's own tap on a card is a new word.
      let b = boundOf(taskId);
      const target = how.action === "start_at" && how.device ? findComputer(how.device) : undefined;
      if (by === "ducter") {
        if (target && !movableTo(b, idOf(target))) return { ok: false, message: `The user said this work runs ${said(b!)}; Ducter doesn't move it to ${target.name} by itself.` };
        if (how.action === "clone_here" && !allowedBy(b, dev)) return { ok: false, message: `The user said this work runs ${said(b!)}; nothing is cloned onto ${nameOf(dev)} for it.` };
      } else if (target && b) b = { ...b, ...(b.only && b.only !== idOf(target) ? { only: idOf(target) } : {}), not: (b.not ?? []).filter((x) => x !== idOf(target)) };
      // D415: 清掉旧的再试 is 再试一次 in the same place (the runner clears the lock before its first try).
      if (how.action === "clear_lock") how = { action: "reopen" };
      if (how.action === "clone_here") {
        if (!remote) return { ok: false, message: "Ducter doesn't know which repository this is, so it can't clone it." };
        const here = d.computers().find((x) => isHere(x, dev));
        if (!here) return { ok: false, message: "That computer isn't one of this home's any more." };
        return { ok: true, place: { ...clonePlace(here, remoteKey(remote)), ...keep } };
      }
      if (!remote) {
        if (c.place.kind !== "repo") return { ok: true, place: c.place };
        const r = await d.where.resolve({ given: { kind: "repo", device: dev, repoPath: c.place.repoPath }, ...(b ? { bound: b } : {}) });
        return r.ok ? { ok: true, place: { ...r.place, ...keep } } : { ok: false, message: r.message };
      }
      // Asked again, fresh: what the computers said before is what failed.
      d.where.forget();
      const given = c.place.kind === "repo" && how.action === "reopen" && !c.place.clone ? { given: { kind: "repo" as const, device: dev, repoPath: c.place.repoPath, ...keep } } : {};
      // D476: Ducter's own reopen stays on the computer the person named.
      const stay = by === "ducter" && how.action === "reopen" && b && !b.only && b.named ? { named: b.named } : {};
      const r = await d.where.resolve({ remote, ...(how.action === "start_at" && how.device ? { named: how.device } : stay), ...given, ...(b ? { bound: b } : {}) });
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, place: { ...r.place, ...keep } };
    },
    boundOf,
    nameOf: (dev) => nameOf(dev),
  };
  return api;
}
