// D654 (research/245 §3.2): one project per repository, derived once in core.
//
// A task's project is its repository: the normalized `origin` (github.com/owner/repo, `git@` and
// `https` alike, `.git` stripped). A folder with no remote is its own project, keyed by the
// computer it is on and its path there. The key is read once per folder per computer and kept; the
// clients read the card's `projectKey`/`projectName` and never derive a project again.
import type { OnHand, Place, ProjectLens, TaskCard } from "@ducter/protocol";
import { basename } from "node:path";
import { normalizeRemote, projectKeyOf, projectShortName, repoRemote, type GitRun } from "@ducter/protocol/src/folder-info.ts";
import type { ProjectMeta, Projects } from "./projects.ts";

/** A project's identity, as the snapshot carries it. remote: the normalized origin, when it has one. */
export interface ProjectIdentity {
  key: string;
  remote?: string;
}

export interface ProjectIdentities {
  /** A place's identity from what is already known (a stamped key, its clone address, a cached
   *  remote, or its computer and path); never blocks. */
  of(place: Place, stamped?: { key?: string; remote?: string }): ProjectIdentity;
  /** Read the folder's remote once, if it isn't known yet; `changed` runs when the answer lands. */
  ensure(place: Place): void;
  /** The identity, reading the folder's remote first when it has to (a task's open). */
  read(place: Place): Promise<ProjectIdentity>;
  /** The snapshot with every card's project key and display name, and the project column's list. */
  decorate(on: OnHand): OnHand;
}

const rawDevOf = (p: Place) => ("device" in p && p.device ? p.device : "local");
const pathOf = (p: Place) => (p.kind === "repo" ? p.repoPath : p.kind === "folder" ? p.path : "");

/** D654: a keyless task's lens: a computer set-up or an errand is 电脑上的事, anything else
 *  with no folder is 不在项目里. The partner's `workKind` and live computer use are the facts. */
export function keylessGroup(card: Pick<TaskCard, "place" | "workKind" | "computing" | "phoning" | "handset">): "computer" | "none" {
  if (card.place.kind === "repo" || card.place.kind === "folder") return "none";
  if (card.workKind === "errand" || card.place.kind === "browser" || card.computing || card.phoning || card.handset) return "computer";
  return "none";
}

/** The person's name for a key's short form: the repository's name; when two repositories share
 *  one, `owner/repo` for both. */
export function displayNames(entries: { key: string; remote?: string; short: string }[]): Map<string, string> {
  const byShort = new Map<string, number>();
  for (const e of entries) byShort.set(e.short, (byShort.get(e.short) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const e of entries) {
    if (!e.remote) out.set(e.key, e.short);
    else out.set(e.key, (byShort.get(e.short) ?? 0) > 1 ? e.remote.split("/").slice(-2).join("/") : e.short);
  }
  return out;
}

export function createProjectIdentities(opts: {
  projects: Projects;
  /** This home's own git read (a worker's is its own folderInfo, D455). */
  git?: GitRun;
  /** A folder on a worker, read there; "offline" when it is away. */
  remoteFolder?: (device: string, path: string) => Promise<{ remote?: string } | "offline">;
  /** The computer's name, home first. */
  nameOf: (device: string) => string;
  /** One id per computer: the home's own names become "local", a worker's name its id. A place
   *  written by a name and another by the id are one computer, so one project. */
  deviceKey?: (device: string) => string;
  /** Something changed: a newly read remote, so the next snapshot has the true key. */
  changed: () => void;
}): ProjectIdentities {
  const git = opts.git;
  const devOf = (p: Place) => (opts.deviceKey ? opts.deviceKey(rawDevOf(p)) : rawDevOf(p));
  /** place id -> the remote the folder has ("" = none); absent: not read yet. */
  const known = new Map<string, string>();
  const asking = new Set<string>();
  const placeId = (p: Place) => {
    const path = pathOf(p);
    return p.kind === "repo" || p.kind === "folder" ? `${devOf(p)}\u0000${path}` : "";
  };
  const hint = (p: Place): string | undefined => (p.kind === "repo" ? p.clone : undefined);
  const caches = new Map<string, ProjectIdentity>();
  const of = (p: Place, stamped?: { key?: string; remote?: string }): ProjectIdentity => {
    if (p.kind !== "repo" && p.kind !== "folder") return { key: "" };
    const id = placeId(p);
    const cached = caches.get(id);
    if (cached) return cached;
    const read = known.get(id);
    const remote = stamped?.remote ?? hint(p) ?? read ?? "";
    const key = stamped?.key || projectKeyOf(remote || undefined, devOf(p), pathOf(p));
    const out = { key, ...(remote ? { remote: normalizeRemote(remote) } : {}) };
    // A stamped key may be an alias; the projects store resolves it when the column is built. The
    // cache only holds what was read or hinted, never a stamped key (a rename or merge changes it),
    // and never a fallback for a repository whose origin is still being read: the next snapshot
    // must be able to use the true key.
    if (!stamped?.key && (read !== undefined || hint(p) || p.kind === "folder")) caches.set(id, out);
    return out;
  };
  const ensure = (p: Place) => {
    if (p.kind !== "repo") return; // a folder with no remote is keyed by its computer and path
    const id = placeId(p);
    if (!id || known.has(id) || asking.has(id) || hint(p) || p.clone) return;
    asking.add(id);
    const dev = devOf(p);
    const read: Promise<{ remote?: string } | "offline"> =
      dev === "local"
        ? repoRemote(p.repoPath, git).then((r) => (r ? { remote: r } : {}))
        : opts.remoteFolder
          ? opts.remoteFolder(dev, p.repoPath)
          : Promise.resolve({});
    void read
      .then((r) => {
        if (r === "offline") return; // ask again next time; never remember a temporary absence
        known.set(id, r.remote ? normalizeRemote(r.remote) : "");
        opts.changed();
      })
      .catch(() => {
        /* a folder gone or unreadable: the key stays its computer and path */
      })
      .finally(() => asking.delete(id));
  };
  return {
    of,
    ensure,
    async read(place) {
      if (place.kind !== "repo") return of(place);
      const id = placeId(place);
      if (!known.has(id) && !hint(place) && !asking.has(id)) {
        asking.add(id);
        const dev = devOf(place);
        try {
          const r: { remote?: string } | "offline" = dev === "local" ? await repoRemote(place.repoPath, git).then((x) => (x ? { remote: x } : {})) : opts.remoteFolder ? await opts.remoteFolder(dev, place.repoPath) : {};
          if (r !== "offline") known.set(id, r.remote ? normalizeRemote(r.remote) : "");
        } catch {
          /* unreadable: the key stays its computer and path */
        } finally {
          asking.delete(id);
        }
      }
      return of(place);
    },
    decorate(on: OnHand): OnHand {
      const meta: ProjectMeta = opts.projects.meta();
      const canon = (key: string) => opts.projects.canonical(key);
      type Entry = { key: string; remote?: string; short: string; places: Set<string>; needs: boolean; last: number };
      const entries = new Map<string, Entry>();
      const addEntry = (key0: string, remote: string | undefined, short: string, place: Place | undefined) => {
        const key = canon(key0);
        if (!key) return;
        const cur = entries.get(key);
        const e = cur ?? { key, ...(remote ? { remote } : {}), short, places: new Set<string>(), needs: false, last: 0 };
        if (!cur) entries.set(key, e);
        else if (!e.remote && remote) {
          e.remote = remote;
          e.short = short;
        }
        if (place && (place.kind === "repo" || place.kind === "folder")) e.places.add(devOf(place));
      };
      const shortOf = (remote: string | undefined, fallback: string | undefined, place: Place | undefined) =>
        fallback && fallback.trim() ? fallback.trim() : remote ? projectShortName(remote) : basename(pathOf(place ?? { kind: "none" }) || "") || "";

      const tasks = on.tasks.map((card) => {
        const pl = card.place;
        const ident = of(pl, card.projectKey ? { key: card.projectKey } : undefined);
        if (pl.kind === "repo" && !card.projectKey) ensure(pl);
        if (!ident.key) return { ...card, projectKey: undefined, projectName: undefined, projectGroup: keylessGroup(card) };
        addEntry(ident.key, ident.remote, shortOf(ident.remote, card.projectName, pl), pl);
        return { ...card, projectKey: canon(ident.key), projectName: "", projectGroup: undefined };
      });

      // Folders added by hand before their first task are projects too.
      const added = new Map<string, Place>();
      for (const p of on.projects ?? []) {
        const remote = p.remote || undefined;
        const key0 = p.key || projectKeyOf(remote, devOf(p.place), pathOf(p.place));
        const key = canon(key0);
        addEntry(key, remote, shortOf(remote, p.name, p.place), p.place);
        added.set(key, p.place);
      }

      // D185: a routine in a project's folder joins it; its view carries the same key and name.
      const routineIds = on.routines?.map((r) => {
        const place = r.place;
        if (!place || (place.kind !== "repo" && place.kind !== "folder")) return { r, ident: undefined as ProjectIdentity | undefined };
        const ident = of(place, r.projectKey ? { key: r.projectKey } : undefined);
        if (ident.key) addEntry(ident.key, ident.remote, shortOf(ident.remote, r.projectName, place), place);
        return { r, ident };
      });

      // The display name: the person's rename wins; else the repository's short name, `owner/repo`
      // when two repositories share one; a folder's own name.
      const display = displayNames([...entries.values()].map((e) => ({ key: e.key, ...(e.remote ? { remote: e.remote } : {}), short: e.short })));
      const finalName = new Map<string, string>();
      for (const e of entries.values()) finalName.set(e.key, opts.projects.nameFor(e.key, display.get(e.key) ?? e.short));

      // A card merged into another project shows under that project's key and name.
      const named = tasks.map((c) => {
        if (!c.projectKey) return c;
        const key = canon(c.projectKey);
        const name = finalName.get(key) ?? finalName.get(c.projectKey) ?? c.projectName ?? "";
        return key !== c.projectKey || (name && name !== c.projectName) ? { ...c, projectKey: key, projectName: name } : { ...c, projectName: name };
      });
      // D654: the default order is what matters now: something needing the person first,
      // then the most recent activity. A project added by hand with no task yet counts from its add.
      for (const c of named) {
        if (!c.projectKey) continue;
        const e = entries.get(canon(c.projectKey));
        if (!e) continue;
        if (c.attention === "needs_you" || c.attention === "failed") e.needs = true;
        const at = Date.parse(c.updatedAt);
        if (Number.isFinite(at) && at > e.last) e.last = at;
      }
      for (const p of on.projects ?? []) {
        const key = canon(p.key || projectKeyOf(p.remote, devOf(p.place), pathOf(p.place)));
        const e = entries.get(key);
        const at = Date.parse(p.addedAt);
        if (e && Number.isFinite(at) && at > e.last) e.last = at;
      }
      for (const { r, ident } of routineIds ?? []) {
        if (!ident?.key) continue;
        const e = entries.get(canon(ident.key));
        const at = Date.parse(r.createdAt);
        if (e && Number.isFinite(at) && at > e.last) e.last = at;
      }

      const order = new Map(meta.order.map((k, i) => [canon(k), i]));
      const hidden = new Set(meta.hidden.map(canon));
      const pinned = new Set(meta.pinned.map(canon));
      const home = (dev: string) => dev === "local";
      const ranked = [...entries.values()].sort((a, b) => {
        const pa = pinned.has(a.key);
        const pb = pinned.has(b.key);
        if (pa !== pb) return pa ? -1 : 1;
        const oa = order.get(a.key);
        const ob = order.get(b.key);
        if (oa !== undefined || ob !== undefined) {
          if (oa === undefined) return 1;
          if (ob === undefined) return -1;
          if (oa !== ob) return oa - ob;
        }
        if (a.needs !== b.needs) return a.needs ? -1 : 1;
        if (a.last !== b.last) return b.last - a.last;
        return a.key.localeCompare(b.key);
      });
      const projectList: ProjectLens[] = ranked
        .map((e) => {
          const key = canon(e.key);
          const devices = [...e.places].sort((a, b) => Number(home(b)) - Number(home(a))).map((d) => opts.nameOf(d));
          const aliases = Object.entries(meta.aliases)
            .filter(([, into]) => canon(into) === key)
            .map(([k]) => k);
          return {
            key,
            name: finalName.get(key) ?? finalName.get(e.key) ?? e.short,
            ...(devices.length ? { devices } : {}),
            ...(hidden.has(key) ? { hidden: true } : {}),
            ...(pinned.has(key) ? { pinned: true } : {}),
            ...(meta.names[key] ? { renamed: true } : {}),
            ...(order.has(key) ? { order: order.get(key)! } : {}),
            ...(aliases.length ? { aliases } : {}),
            ...(added.has(key) ? { added: true, place: added.get(key)! } : {}),
          };
        })
        .filter((p, i, xs) => xs.findIndex((x) => x.key === p.key) === i);

      const routines = routineIds?.map(({ r, ident }) => {
        if (!ident?.key) return r;
        const key = canon(ident.key);
        const name = finalName.get(key) ?? finalName.get(ident.key) ?? ident.key;
        return { ...r, projectKey: key, projectName: name };
      });

      // A Keep is as much a card as a task: the project of its first task's folder.
      const keeps = on.keeps?.map((k) => {
        const t = named.find((c) => c.projectKey && k.taskIds.includes(c.taskId));
        return t ? { ...k, projectKey: t.projectKey!, projectName: t.projectName ?? "" } : k;
      });
      return { ...on, tasks: named, ...(routines ? { routines } : {}), ...(keeps ? { keeps } : {}), projectList };
    },
  };
}
