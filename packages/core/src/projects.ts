// Projects the user adds by hand (D186): "pick a folder, it becomes a project with its name".
// A project is a folder the user works in (a git repo or not) on the home's computer, or (D197)
// on a computer that does tasks for it (the user's Mac for a home on a server); its name is the
// folder's, and every task in that folder belongs to it. Inferred projects (a task's repo) need
// nothing here; this file only remembers the ones added before any task ran there, so On hand can
// show them and the New task card can offer them. Kept in <dataDir>/projects.json (user data like
// settings, not an event); removing one never touches its tasks.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Place, ProjectView } from "@ducter/protocol";
import { folderInfo, type FolderInfo, type GitRun, realGit } from "@ducter/protocol/src/folder-info.ts";

export type ProjectAddResult = { ok: true; project: ProjectView; info: FolderInfo } | { ok: false; reason: "not_found" | "offline" | "old" | "failed"; message: string };

export interface Projects {
  list(): ProjectView[];
  /** Adds a folder (or brings it back to the front); the project as it is now. device: the
   *  computer it is on (absent or "local": the home's own; else a worker, read there, D197). */
  add(path: string, device?: string): Promise<ProjectAddResult>;
  /** The added project whose folder holds this place, if any. */
  of(place: Place): ProjectView | undefined;
}

const pathOf = (p: Place) => (p.kind === "repo" ? p.repoPath : p.kind === "folder" ? p.path : "");
const devOf = (p: Place) => ("device" in p && p.device) || "local";

export function createProjects(opts: {
  dataDir: string;
  git?: GitRun;
  now?: () => number;
  onChange?: () => void;
  /** D197: a folder on a worker, read there; "offline" when it is away. Absent: only the home's own. */
  remote?: (device: string, path: string) => Promise<FolderInfo | "offline">;
}): Projects {
  const file = join(opts.dataDir, "projects.json");
  const git = opts.git ?? realGit;
  const now = opts.now ?? Date.now;
  let items: ProjectView[] = [];
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { projects?: ProjectView[] };
      items = Array.isArray(j.projects) ? j.projects.filter((p) => p && typeof p.name === "string" && p.place && (p.place.kind === "repo" || p.place.kind === "folder")) : [];
    }
  } catch {
    items = [];
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, projects: items }, null, 2));
    renameSync(tmp, file);
  };
  return {
    list: () => items.map((p) => ({ ...p, place: { ...p.place } })),
    async add(raw, device) {
      const path = String(raw ?? "").trim();
      const dev = device && device !== "local" ? device : "local";
      let info: FolderInfo;
      if (!path) return { ok: false, reason: "not_found", message: `There's no folder at ${raw}.` };
      if (dev === "local") info = await folderInfo(path, git);
      else {
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
      const name = prev?.name ?? (info.name || key.split("/").filter(Boolean).pop() || key);
      const project: ProjectView = { name, place, addedAt: new Date(now()).toISOString() };
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
  };
}
