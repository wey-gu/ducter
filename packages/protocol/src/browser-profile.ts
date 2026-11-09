// Where a persona's browser profile lives (D47, D151): one profile per persona per device under
// <dataDir>/browser-profiles. Shared by the runner (cua-driver's isolated_named profile) and core
// (Ducter's own browser on a server), so both drivers find the same sign-ins.
import { join } from "node:path";

/** cua-driver profile names allow 1-64 of [A-Za-z0-9_-]. */
export function profileName(persona: string, profile?: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const base = clean(persona) || "persona";
  const extra = profile && profile !== "default" ? clean(profile) : "";
  return (extra ? `${base}_${extra}` : base).slice(0, 64);
}

export function profileRoot(dataDir: string): string {
  return join(dataDir, "browser-profiles");
}
