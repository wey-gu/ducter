// 在 {computer} 上新建一个文件夹 / New folder on {computer} (D272): a project needs no git. The
// computer that does the work makes `<Ducter folder>/projects/<name>` (D204's folder) and the home
// adds it as a project (D186), a plain folder that tasks work in as D142 lets them (a copy from
// before, put back on undo). One function for the home and a worker (runner/src/worker-host.ts).
//
// Safety: only the name comes from a client, checked here (again on the worker): one folder name,
// never a path: no slash or backslash, no `.`/`..`, not hidden, no control characters, at most 80
// characters. Nothing outside the Ducter folder's `projects/` is ever made.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ensureDucterFolder, type DucterFolderOpts } from "./ducter-folder.ts";

export type NewFolderResult =
  | { ok: true; path: string; name: string; existed?: true }
  | { ok: false; reason: "invalid" | "failed"; message: string };

/** A folder name a person typed, checked: trimmed, or undefined when it can't be one folder's name. */
export function folderName(raw: unknown): string | undefined {
  const s = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
  if (!s || s.length > 80) return undefined;
  if (s === "." || s === ".." || s.startsWith(".")) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[/\\\x00-\x1f\x7f]/.test(s) || /[:*?"<>|]/.test(s)) return undefined;
  return s;
}

/**
 * D272: make `<Ducter folder>/projects/<name>` on this computer. A folder of that name already
 * there is simply that project (`existed`); a file of that name is refused.
 */
export function newProjectFolder(name: unknown, o: DucterFolderOpts = {}): NewFolderResult {
  const n = folderName(name);
  if (!n) return { ok: false, reason: "invalid", message: "A folder name is one name: no slashes, not starting with a dot, at most 80 characters." };
  try {
    const projects = join(ensureDucterFolder(o), "projects");
    const path = join(projects, n);
    if (existsSync(path)) {
      if (!statSync(path).isDirectory()) return { ok: false, reason: "failed", message: `${path} is a file, not a folder.` };
      return { ok: true, path, name: n, existed: true };
    }
    mkdirSync(path, { recursive: true });
    return { ok: true, path, name: n };
  } catch (err) {
    return { ok: false, reason: "failed", message: (err as Error).message };
  }
}
