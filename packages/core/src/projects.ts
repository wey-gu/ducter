// Projects the user adds by hand (D186): "pick a folder, it becomes a project with its name".
// A project is a folder the user works in (a git repo or not) on the home's computer, or (D197)
// on a computer that does tasks for it (the user's Mac for a home on a server); its name is the
// folder's, and every task in that folder belongs to it. Inferred projects (a task's repo) need
// nothing here; this file only remembers the ones added before any task ran there, so On hand can
// show them and the New task card can offer them. Kept in <dataDir>/projects.json (user data like
// settings, not an event); removing one never touches its tasks.
//
// D654 (research/245 §3.2): the file now also keeps what the person did to a project they
// inferred from a repository: its rename, the keys merged into another (an alias), whether it is
// hidden or pinned, and the drag order. The identity itself (the normalized origin, or a folder's
// computer and path) is derived in core; these are only the person's words about it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Place, ProjectChange, ProjectView } from "@ducter/protocol";
import { folderInfo, normalizeRemote, projectKeyOf, type FolderInfo, type GitRun, realGit } from "@ducter/protocol/src/folder-info.ts";

export type ProjectAddResult = { ok: true; project: ProjectView; info: FolderInfo } | { ok: false; reason: "not_found" | "offline" | "old" | "failed"; message: string };

/** D654: what the person said about project identities, kept on the home so every device sees it. */
export interface ProjectMeta {
  /** Renames by key: the person's name wins over the repository's short name. */
  names: Record<string, string>;
  /** Merge: an alias key belongs to the key it points at (a fork they count as one project). */
  aliases: Record<string, string>;
  /** Projects the person hid; a hidden one with something needing them shows again (the clients check). */
  hidden: string[];
  /** Projects the person pinned: pinned rows first. */
  pinned: string[];
  /** The person's drag order (keys, low first). */
  order: string[];
}

export interface Projects {
  list(): ProjectView[];
  /** Adds a folder (or brings it back to the front); the project as it is now. device: the
   *  computer it is on (absent or "local": the home's own; else a worker, read there, D197). */
  add(path: string, device?: string): Promise<ProjectAddResult>;
  /** The added project whose folder holds this place, if any. */
  of(place: Place): ProjectView | undefined;
  /** D204: this computer's Ducter folder moved: project paths inside it follow (the Log's folder_moved maps tasks too). */
  remap(from: string, to: string, device: string): void;
  /** D654: the person's words about projects (a copy). */
  meta(): ProjectMeta;
  /** D654: follow the merge aliases to the key a project is shown under. */
  canonical(key: string): string;
  /** D654: the name to show for a key: the person's rename, else fallback. */
  nameFor(key: string, fallback: string): string;
  /** D654: one change (rename, merge, unmerge, hide, pin, order); the meta after it. */
  change(c: ProjectChange): { ok: true; meta: ProjectMeta } | { ok: false; error: string };
}

const pathOf = (p: Place) => (p.kind === "repo" ? p.repoPath : p.kind === "folder" ? p.path : "");
const devOf = (p: Place) => ("device" in p && p.device) || "local";
const placeKey = (p: Place): string | undefined => {
  if (p.kind !== "repo" && p.kind !== "folder") return undefined;
  return projectKeyOf(undefined, devOf(p), pathOf(p));
};
const emptyMeta = (): ProjectMeta => ({ names: {}, aliases: {}, hidden: [], pinned: [], order: [] });

export function createProjects(opts: {
  dataDir: string;
  git?: GitRun;
  now?: () => number;
  onChange?: () => void;
  /** D197: a folder on a worker, read there; "offline" when it is away. Absent: only the home's own. */
  remote?: (device: string, path: string) => Promise<FolderInfo | "offline">;
  /** D455: the home's own folder may be added (its DUCTER_FOLDER_ROOTS, when set). Absent: any. */
  allowed?: (path: string) => boolean;
}): Projects {
  const file = join(opts.dataDir, "projects.json");
  const git = opts.git ?? realGit;
  const now = opts.now ?? Date.now;
  let items: ProjectView[] = [];
  let meta = emptyMeta();
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { projects?: ProjectView[]; names?: Record<string, string>; aliases?: Record<string, string>; hidden?: string[]; pinned?: string[]; order?: string[] };
      items = Array.isArray(j.projects) ? j.projects.filter((p) => p && typeof p.name === "string" && p.place && (p.place.kind === "repo" || p.place.kind === "folder")) : [];
      const strings = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && !!v) : []);
      const rec = (x: unknown) => (x && typeof x === "object" ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, v]) => typeof v === "string" && !!v)) as Record<string, string> : {});
      meta = { names: rec(j.names), aliases: rec(j.aliases), hidden: strings(j.hidden), pinned: strings(j.pinned), order: strings(j.order) };
    }
  } catch {
    items = [];
    meta = emptyMeta();
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 2, projects: items, names: meta.names, aliases: meta.aliases, hidden: meta.hidden, pinned: meta.pinned, order: meta.order }, null, 2));
    renameSync(tmp, file);
  };
  const canonical = (key: string): string => {
    let k = key;
    const seen = new Set<string>();
    while (meta.aliases[k] && !seen.has(k)) {
      seen.add(k);
      k = meta.aliases[k]!;
    }
    return k;
  };
  const nameFor = (key: string, fallback: string) => meta.names[canonical(key)] ?? meta.names[key] ?? fallback;
  return {
    list: () => items.map((p) => ({ ...p, place: { ...p.place } })),
    meta() {
      return { names: { ...meta.names }, aliases: { ...meta.aliases }, hidden: [...meta.hidden], pinned: [...meta.pinned], order: [...meta.order] };
    },
    canonical,
    nameFor,
    change(c) {
      const key = "key" in c && typeof c.key === "string" ? c.key.trim() : "";
      const dedupe = (xs: string[]) => [...new Set(xs.filter(Boolean))];
      switch (c.act) {
        case "rename": {
          if (!key) return { ok: false, error: "Which project? Say its key." };
          const canon = canonical(key);
          const name = typeof c.name === "string" ? c.name.trim() : "";
          if (name) meta.names[canon] = name;
          else delete meta.names[canon];
          break;
        }
        case "merge": {
          const into = c.act === "merge" && typeof c.into === "string" ? c.into.trim() : "";
          if (!key || !into) return { ok: false, error: "Merge needs the project and where it goes." };
          const canonInto = canonical(into);
          const canonKey = canonical(key);
          if (canonInto === canonKey) return { ok: false, error: "That is already the same project." };
          // A fork is one project: every key pointing at the merged one now points at the target.
          for (const [k, v] of Object.entries(meta.aliases)) if (canonical(v) === canonKey) meta.aliases[k] = canonInto;
          meta.aliases[canonKey] = canonInto;
          meta.hidden = meta.hidden.filter((k) => canonical(k) !== canonKey);
          meta.pinned = meta.pinned.filter((k) => canonical(k) !== canonKey);
          break;
        }
        case "unmerge": {
          if (!key) return { ok: false, error: "Which project?" };
          delete meta.aliases[key];
          break;
        }
        case "hide": {
          if (!key) return { ok: false, error: "Which project?" };
          const canon = canonical(key);
          meta.hidden = c.hidden ? dedupe([...meta.hidden, canon]) : meta.hidden.filter((k) => canonical(k) !== canon);
          break;
        }
        case "pin": {
          if (!key) return { ok: false, error: "Which project?" };
          const canon = canonical(key);
          meta.pinned = c.pinned ? dedupe([...meta.pinned, canon]) : meta.pinned.filter((k) => canonical(k) !== canon);
          break;
        }
        case "order": {
          meta.order = dedupe((Array.isArray(c.keys) ? c.keys : []).map((k) => (typeof k === "string" ? k.trim() : "")).filter(Boolean));
          break;
        }
        default:
          return { ok: false, error: "Unknown project change." };
      }
      try {
        save();
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      opts.onChange?.();
      return { ok: true, meta: { names: { ...meta.names }, aliases: { ...meta.aliases }, hidden: [...meta.hidden], pinned: [...meta.pinned], order: [...meta.order] } };
    },
    async add(raw, device) {
      const path = String(raw ?? "").trim();
      const dev = device && device !== "local" ? device : "local";
      let info: FolderInfo;
      if (!path) return { ok: false, reason: "not_found", message: `There's no folder at ${raw}.` };
      if (dev === "local") {
        // D455: a home that set DUCTER_FOLDER_ROOTS adds folders only inside them.
        if (opts.allowed && !opts.allowed(path)) return { ok: false, reason: "not_found", message: `${raw} is outside the folders this computer allows.` };
        info = await folderInfo(path, git);
      } else {
        if (!opts.remote) return { ok: false, reason: "failed", message: "Folders on other computers can't be added here." };
        try {
          const r = await opts.remote(dev, path);
          if (r === "offline") return { ok: false, reason: "offline", message: "That computer can't be reached right now." };
          info = r;
        } catch (err) {
          // D204: a worker whose Ducter is too old to read its folders: the clients say to update it.
          return { ok: false, reason: (err as { old?: boolean }).old ? "old" : "failed", message: (err as Error).message };
        }
      }
      if (!info?.exists || !info.root) return { ok: false, reason: "not_found", message: `There's no folder at ${raw}.` };
      // A folder inside a repo is that repo: tasks work on the repo, in a worktree.
      const place: Place = info.kind === "repo" ? { kind: "repo", device: dev, repoPath: info.root } : { kind: "folder", device: dev, path: info.root };
      const key = pathOf(place);
      const prev = items.find((p) => pathOf(p.place) === key && devOf(p.place) === dev);
      // D455: the same repo (one origin) already a project on another computer: this copy joins
      // it under that name, so On hand shows one project that lives on two computers.
      const remote = info.remote ? normalizeRemote(info.remote) : undefined;
      const twin = remote ? items.find((p) => p !== prev && (p.remote === remote || p.key === remote) && devOf(p.place) !== dev) : undefined;
      const name = prev?.name ?? twin?.name ?? (info.name || key.split("/").filter(Boolean).pop() || key);
      const projectKey = info.kind === "repo" ? projectKeyOf(remote, dev, info.root) : placeKey(place);
      const project: ProjectView = { name, place, addedAt: new Date(now()).toISOString(), ...(remote ? { remote } : {}), ...(projectKey ? { key: projectKey } : {}) };
      items = [project, ...items.filter((p) => p !== prev)];
      try {
        save();
      } catch (err) {
        return { ok: false, reason: "failed", message: (err as Error).message };
      }
      opts.onChange?.();
      return { ok: true, project, info };
    },
    of(place) {
      const p = pathOf(place);
      if (!p) return undefined;
      return items.find((x) => {
        const root = pathOf(x.place);
        return devOf(place) === devOf(x.place) && (p === root || p.startsWith(root + "/"));
      });
    },
    remap(from, to, device) {
      const dev = device === "local" ? "local" : device;
      const move = (p: string) => (p === from || p.startsWith(from + "/") ? to + p.slice(from.length) : p);
      let touched = false;
      const next = items.map((x) => {
        if (devOf(x.place) !== dev) return x;
        const path = pathOf(x.place);
        const moved = move(path);
        if (moved === path) return x;
        touched = true;
        const place: Place =
          x.place.kind === "repo" ? { ...x.place, repoPath: moved } : x.place.kind === "folder" ? { ...x.place, path: moved } : x.place;
        return { ...x, place };
      });
      if (!touched) return;
      items = next;
      try {
        save();
        opts.onChange?.();
      } catch {
        /* the move itself stands; the next open repairs the list */
      }
    },
  };
}
