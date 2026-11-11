// The partner's chosen name, kept as a small JSON file in the data folder, written by `ducter up`
// and read by the client (apps/desktop/internal/hints). D204: `ducter up` no longer writes
// first-run repo hints (firstrun.json, a scan of ~/dev, ~/code, …): a computer's projects are the
// ones in its Ducter folder, added or cloned by the user; a stale firstrun.json is removed.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** D204: the old first-run hints file, removed by `ducter up` (nothing reads it). */
export const OLD_HINTS_FILE = "firstrun.json";
export const PERSONA_FILE = "persona.json";

/** Writes atomically, so a client reading at the same moment never sees half a file. */
function writeJson(path: string, v: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, path);
}

/** D204: the first-run hints a Ducter before D204 wrote, gone. */
export function removeOldHints(dataDir: string) {
  try {
    rmSync(join(dataDir, OLD_HINTS_FILE), { force: true });
  } catch {}
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
