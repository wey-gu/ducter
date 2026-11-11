// Resolve where a task works (product-model §3 "Place / 在哪儿做").
// Order: an explicit place from the model (normalized) → a path mentioned in the text →
// a known repo (from earlier tasks) named by its folder name → none.
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import type { Place, TaskCard } from "../../protocol/src/index.ts";

export interface PlaceFs {
  isDir(p: string): boolean;
  isRepo(p: string): boolean;
  home: string;
  /** D207: Ducter's own data (its data folder): never a place, so a path there in the words is passed over. */
  isDucterData?(p: string): boolean;
}

export const realFs: PlaceFs = {
  isDir: (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  isRepo: (p) => existsSync(resolve(p, ".git")),
  home: homedir(),
};

export function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return resolve(home, p.slice(2));
  return p;
}

// ~/x, /abs/x, ./x; stop at whitespace, quotes, CJK and common punctuation.
const PATH_RE = /(?:^|[\s"'`(（「“:：,，])((?:~|\.{1,2})?\/[^\s"'`)）」”,，。;；:：、㐀-鿿]+)/g;

export function findPaths(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PATH_RE)) {
    const p = m[1]!.replace(/[.!?！？]+$/, "");
    if (p.length > 1) out.push(p);
  }
  return out;
}

function placeForPath(raw: string, fs: PlaceFs): Place | null {
  const p = expandHome(raw, fs.home);
  if (fs.isDucterData?.(resolve(p))) return null;
  // Walk up: "~/dev/foo/src/x.test.ts" → repo root ~/dev/foo.
  let cur = p;
  for (let i = 0; i < 8 && cur.length > 1; i++) {
    if (fs.isDir(cur) && fs.isRepo(cur)) return { kind: "repo", device: "local", repoPath: cur };
    const up = resolve(cur, "..");
    if (up === cur) break;
    cur = up;
  }
  if (fs.isDir(p)) return { kind: "folder", device: "local", path: p };
  return null;
}

export function resolvePlace(
  explicit: Place | undefined,
  texts: string[],
  known: TaskCard[],
  fs: PlaceFs = realFs,
): Place {
  // Another device (a worker): its paths are on its disk, so take the place as given; the worker
  // resolves ~ and checks the repo (system.md "Workers").
  const device = (explicit as { device?: string } | undefined)?.device?.trim();
  if (explicit && device && device !== "local") return { ...explicit, device } as Place;
  if (explicit && explicit.kind !== "none") {
    if (explicit.kind === "repo") {
      return { ...explicit, device: explicit.device || "local", repoPath: expandHome(explicit.repoPath, fs.home) };
    }
    if (explicit.kind === "folder") {
      const path = expandHome(explicit.path, fs.home);
      // A folder that is a git repo is a repo place (worktree isolation applies).
      if (fs.isDir(path) && fs.isRepo(path)) return { kind: "repo", device: explicit.device || "local", repoPath: path };
      return { ...explicit, device: explicit.device || "local", path };
    }
    return { ...explicit, device: explicit.device || "local" };
  }
  for (const text of texts) {
    for (const raw of findPaths(text)) {
      const pl = placeForPath(raw, fs);
      if (pl) return pl;
    }
  }
  // Known repos from earlier tasks, matched by folder name as a whole word.
  const repos = new Map<string, string>();
  for (const c of known) if (c.place.kind === "repo") repos.set(basename(c.place.repoPath), c.place.repoPath);
  for (const text of texts) {
    for (const [name, path] of repos) {
      if (name.length < 2) continue;
      const re = new RegExp(`(^|[^A-Za-z0-9_-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_-])`);
      if (re.test(text)) return { kind: "repo", device: "local", repoPath: path };
    }
  }
  return { kind: "none" };
}
