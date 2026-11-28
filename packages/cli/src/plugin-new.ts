// research/248 phase 1 (D673): `ducter plugin new theme <dir>` writes a complete, passing
// theme plugin: a `ducter-plugin/2` manifest and a `theme.json` that fills every token in both
// modes (Pebble's own values, so it passes contrast by construction) with a calm motion. The
// author edits it; `ducter plugin check` is the loop.
//
// The other kinds (`ui`, `importer`, `connector`) are owed later phases and are refused here with
// a clear message.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_FORMAT_V2 } from "@ducter/protocol/src/plugins.ts";
import { PEBBLE_TOKENS, THEME_FORMAT } from "@ducter/protocol/src/theme.ts";

export interface NewResult {
  ok: boolean;
  dir?: string;
  error?: string;
  detail?: string;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Derives a plugin id from a folder name. */
export function idFromDir(dir: string): string {
  const base = dir.split(/[\\/]/).filter(Boolean).at(-1) ?? "my-theme";
  const id = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
  return ID_RE.test(id) ? id : "my-theme";
}

/** Writes a passing theme plugin. `theme` is the only kind phase 1 scaffolds. */
export function newTheme(dir: string): NewResult {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (err) {
    return { ok: false, error: "mkdir_failed", detail: (err as Error).message };
  }
  const id = idFromDir(dir);
  const manifest = {
    format: PLUGIN_FORMAT_V2,
    id,
    kind: "theme",
    version: "0.1.0",
    name: { en: "My theme", zh: "我的主题" },
    summary: { en: "A calm look of my own.", zh: "一套安静的、我自己的外观。" },
    author: { name: "You" },
    ducter: "^0.1",
    theme: { file: "theme.json" },
    permissions: {},
  };
  const theme = {
    format: THEME_FORMAT,
    name: { en: "My theme", zh: "我的主题" },
    tokens: {
      light: PEBBLE_TOKENS.light,
      dark: PEBBLE_TOKENS.dark,
    },
    motion: { personality: "calm", press: 70, enter: 220 },
    density: "comfortable",
  };
  try {
    writeFileSync(join(dir, "ducter-plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    writeFileSync(join(dir, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`, { mode: 0o644 });
  } catch (err) {
    return { ok: false, error: "write_failed", detail: (err as Error).message };
  }
  return { ok: true, dir };
}
