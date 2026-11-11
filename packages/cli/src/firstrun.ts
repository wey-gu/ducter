// First-run hints: what the desktop's empty conversation can say about *this* machine, and the
// partner's chosen name. Both live as small JSON files in the data folder, written by `ducter up`
// and read by the client (apps/desktop/internal/hints).
//
// Privacy: repo detection is local and reads folder names and file timestamps only (stat of
// .git/HEAD, .git/index, .git/logs/HEAD). It never opens a file, runs git, or sends anything.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { findRepos, realFs, type FsLike, type RepoHint } from "@ducter/protocol/src/repos.ts";
import { homedir } from "node:os";
import { join } from "node:path";

export const HINTS_FILE = "firstrun.json";
export const PERSONA_FILE = "persona.json";

// D203: the scan is shared with the home's New task places and a worker's `repos` op.
export { findRepos, realFs, REPO_ROOTS, type FsLike, type RepoHint } from "@ducter/protocol/src/repos.ts";

export interface Hints {
  version: 1;
  generatedAt: string;
  repoCount: number;
  repos: RepoHint[]; // most recently touched first, at most `limit`
}

export function buildHints(home = homedir(), fs: FsLike = realFs, now = new Date()): Hints {
  const { count, repos } = findRepos(home, fs);
  return { version: 1, generatedAt: now.toISOString(), repoCount: count, repos };
}

/** Writes atomically, so a client reading at the same moment never sees half a file. */
function writeJson(path: string, v: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, path);
}

export function writeHints(dataDir: string, hints: Hints) {
  writeJson(join(dataDir, HINTS_FILE), hints);
}

// ---------- The partner's name ----------

export interface PersonaFile {
  name?: string; // absent: the user kept the default (or Mem's name)
  askedAt?: string;
}

export function readPersonaFile(dataDir: string): PersonaFile | undefined {
  const p = join(dataDir, PERSONA_FILE);
  if (!existsSync(p)) return undefined;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return typeof j === "object" && j ? j : undefined;
  } catch {
    return undefined;
  }
}

export function writePersonaFile(dataDir: string, f: PersonaFile) {
  writeJson(join(dataDir, PERSONA_FILE), f);
}

/** A name someone typed, made safe to show: one line, no control characters, at most 24 chars. */
export function cleanName(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return [...s].slice(0, 24).join("");
}
