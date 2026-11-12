// The abilities the user added or removed on this machine, persisted in <dataDir>/abilities.json.
// Core writes it (the 装上 / 取下 of 你的设备和本事); the runner reads it when a task needs an
// ability (a browser place reads `web`). Absent = never chosen, which keeps the old default.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ABILITIES_FILE = "abilities.json";

export interface AbilitySettings {
  /** 上网 / Browse the web: browser places on this machine. */
  web?: boolean;
  /** D235: 用电脑 / Use the computer: tasks on this Mac may use its apps (cua-driver). Absent = never added (off). */
  computer?: boolean;
}

export function readAbilitySettings(dataDir: string): AbilitySettings {
  const p = join(dataDir, ABILITIES_FILE);
  if (!existsSync(p)) return {};
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return j && typeof j === "object" ? { ...(typeof j.web === "boolean" ? { web: j.web } : {}), ...(typeof j.computer === "boolean" ? { computer: j.computer } : {}) } : {};
  } catch {
    return {};
  }
}

/** Merges patch into the file, atomically (write then rename). Returns what is now saved. */
export function writeAbilitySettings(dataDir: string, patch: AbilitySettings): AbilitySettings {
  const next = { ...readAbilitySettings(dataDir), ...patch };
  const p = join(dataDir, ABILITIES_FILE);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, p);
  return next;
}
