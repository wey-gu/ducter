// research/248 phase 1 (D673): `ducter plugin check <dir> [--json]` for a theme plugin. The
// check is the host's own gate — the same manifest and token validation an install runs — plus the
// contrast floors on both papers. A missing token falls back to Pebble's value (the person's
// brief); a pair under its floor is a failure, not a warning. Exit 0 all pass, 1 a failure, 2 a
// manifest/folder error.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_FILE, PLUGIN_FORMAT_V2, RESERVED_KINDS } from "@ducter/protocol/src/plugins.ts";
import { contrast, contrastPairs, MOTION_ENTER, MOTION_PRESS, THEME_FORMAT } from "@ducter/protocol/src/theme.ts";
import type { ThemeContrastPair, ThemeManifest } from "@ducter/protocol/src/theme.ts";
import { contrastFailures, readTheme } from "@ducter/core/src/plugins/theme.ts";
import { readManifest } from "@ducter/core/src/plugins/manifest.ts";

export interface CheckItem {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface CheckResult {
  ok: boolean;
  exit: number;
  plugin?: { id: string; kind: string; version: string };
  checks: CheckItem[];
  summary: string;
  /** The pairs under their floor, when the theme fails contrast. */
  failures?: ThemeContrastPair[];
}

/** Checks one theme plugin folder. */
export function checkTheme(dir: string): CheckResult {
  const checks: CheckItem[] = [];
  const folderErr = (detail: string): CheckResult => ({
    ok: false,
    exit: 2,
    checks: [{ id: "manifest", ok: false, detail }],
    summary: "nothing was checked: the folder can't be read as a theme plugin",
  });
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return folderErr("not a folder");
    if (!existsSync(join(dir, PLUGIN_FILE))) return folderErr(`no ${PLUGIN_FILE}`);
  } catch (err) {
    return folderErr((err as Error).message);
  }

  // manifest: ducter-plugin/2, kind theme; a reserved kind is refused with a clear message.
  let id = "";
  let version = "";
  let manifestDetail = "";
  try {
    const r = readManifest(dir);
    if (!r.v2) {
      return { ok: false, exit: 2, checks: [{ id: "manifest", ok: false, detail: "a v1 manifest is an importer, not a theme" }], summary: "nothing was checked" };
    }
    id = r.v2.id;
    version = r.v2.version;
    if (r.v2.kind !== "theme") {
      const kind = r.v2.kind;
      const detail = RESERVED_KINDS.includes(kind as never)
        ? `kind "${kind}" is reserved for a later phase; only a theme plugin checks here`
        : `kind "${kind}" is not a theme`;
      return { ok: false, exit: 2, plugin: { id, kind: String(kind), version }, checks: [{ id: "manifest", ok: false, detail }], summary: "nothing was checked" };
    }
    checks.push({ id: "manifest", ok: true, detail: `${PLUGIN_FORMAT_V2} ${id} ${version} theme` });
  } catch (err) {
    manifestDetail = (err as Error).message;
    checks.push({ id: "manifest", ok: false, detail: manifestDetail });
    return { ok: false, exit: 2, checks, summary: "the manifest can't be read" };
  }

  // theme.json: schema, both modes, motion bounds; missing tokens fall back to Pebble.
  let theme: ThemeManifest;
  try {
    theme = readTheme(dir);
    const shape = theme.shape;
    checks.push({ id: "theme", ok: true, detail: `${THEME_FORMAT} light + dark, motion ${theme.motion?.personality ?? "pebble"}${shape ? `, radius ${shape.radiusSm}/${shape.radiusMd}/${shape.radiusLg}` : ""}` });
  } catch (err) {
    checks.push({ id: "theme", ok: false, detail: (err as Error).message });
    return { ok: false, exit: 1, plugin: { id, kind: "theme", version }, checks, summary: "the token file can't be read" };
  }

  // contrast: the pairs both clients use, in both modes.
  const failures = contrastFailures(theme.tokens);
  if (failures.length) {
    checks.push({ id: "contrast", ok: false, detail: `${failures.length} pair(s) under their floor` });
    return { ok: false, exit: 1, plugin: { id, kind: "theme", version }, checks, summary: `${failures.length} thing(s) to fix`, failures };
  }
  checks.push({ id: "contrast", ok: true, detail: `${contrastPairs(theme.tokens.light).length + contrastPairs(theme.tokens.dark).length} pairs, both modes, all at or above their floor` });

  return { ok: true, exit: 0, plugin: { id, kind: "theme", version }, checks, summary: "0 things to fix" };
}

/** Re-exports for the CLI's own tests. */
export { contrast, MOTION_ENTER, MOTION_PRESS, readTheme };
