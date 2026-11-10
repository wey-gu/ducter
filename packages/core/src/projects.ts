// Projects the user adds by hand (D186): "pick a folder, it becomes a project with its name".
// A project is a folder the user works in (a git repo or not) on the home's computer; its name
// is the folder's, and every task in that folder belongs to it. Inferred projects (a task's
// repo) need nothing here; this file only remembers the ones added before any task ran there,
// so On hand can show them and the New task card can offer them. Kept in <dataDir>/projects.json
// (user data like settings, not an event); removing one never touches its tasks.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { Place, ProjectView } from "@ducter/protocol";
import { realGit, repoTop, type GitRun } from "./newtask.ts";

export interface Projects {
  list(): ProjectView[];
  /** Adds a folder (or brings it back to the front); the project as it is now. */
  add(path: string): Promise<{ ok: true; project: ProjectView } | { ok: false; reason: "not_found" | "failed"; message: string }>;
  /** The added project whose folder holds this place, if any. */
  of(place: Place): ProjectView | undefined;
}

const expand = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const pathOf = (p: Place) => (p.kind === "repo" ? p.repoPath : p.kind === "folder" ? p.path : "");

export function createProjects(opts: { dataDir: string; git?: GitRun; now?: () => number; onChange?: () => void }): Projects {
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
    async add(raw) {
      const dir = resolve(expand(String(raw ?? "").trim()));
      if (!raw || !existsSync(dir) || !statSync(dir).isDirectory()) return { ok: false, reason: "not_found", message: `There's no folder at ${raw}.` };
      const top = await repoTop(dir, git);
      // A folder inside a repo is that repo: tasks work on the repo, in a worktree.
      const place: Place = top ? { kind: "repo", device: "local", repoPath: top } : { kind: "folder", device: "local", path: dir };
      const key = pathOf(place);
      const prev = items.find((p) => pathOf(p.place) === key);
      const project: ProjectView = { name: prev?.name ?? basename(key), place, addedAt: new Date(now()).toISOString() };
      items = [project, ...items.filter((p) => p !== prev)];
      try {
        save();
      } catch (err) {
        return { ok: false, reason: "failed", message: (err as Error).message };
      }
      opts.onChange?.();
      return { ok: true, project };
    },
    of(place) {
      const p = pathOf(place);
      if (!p) return undefined;
      return items.find((x) => {
        const root = pathOf(x.place);
        return (place.device || "local") === (x.place.device || "local") && (p === root || p.startsWith(root + "/"));
      });
    },
  };
}
