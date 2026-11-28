// research/248 phase 1 (D673): the `ducter-plugin/2` manifest — one manifest for every kind,
// a closed permission vocabulary the host turns into literal consent lines. v1 (`ducter-plugin/1`,
// D668/D670's importer) is still read forever; a v2 manifest has one `kind` and only that kind's
// object. Phase 1 reads `importer` and `theme`; `ui`, `connector` and `source` are reserved and
// refused with a clear message.

/** The manifest formats. v1 is D668/D670's importer, kept forever. */
export const PLUGIN_FORMAT_V1 = "ducter-plugin/1";
export const PLUGIN_FORMAT_V2 = "ducter-plugin/2";
/** The manifest file at a plugin's root. */
export const PLUGIN_FILE = "ducter-plugin.json";

/** The kinds one manifest names. Phase 1 reads importer and theme; the rest are reserved. */
export type PluginKind = "importer" | "theme" | "ui" | "connector" | "source";

/** The kinds phase 1 actually loads. */
export const ACTIVE_KINDS: readonly PluginKind[] = ["importer", "theme"];
/** The kinds a v2 manifest may name but phase 1 refuses (they are owed a later phase). */
export const RESERVED_KINDS: readonly PluginKind[] = ["ui", "connector", "source"];

export interface PluginName {
  en: string;
  zh?: string;
}

export interface PluginAuthor {
  name: string;
  url?: string;
}

/** The closed permission vocabulary. Only an importer may carry any; a theme's is all empty. */
export interface PluginPermissions {
  files?: { read: string[] };
  exec?: string[];
  network?: string[];
}

/** The v2 importer object (D668's reader, re-expressed: `files.read` is `reads`). */
export interface ImporterObject {
  run: string[];
  emits: string;
  starts: string[];
  detect: string[];
}

/** The v2 theme object: one token file, nothing else. */
export interface ThemeObject {
  file: string;
}

/** A `ducter-plugin/2` manifest. Exactly one kind object, named for `kind`. */
export interface PluginManifestV2 {
  format: typeof PLUGIN_FORMAT_V2;
  id: string;
  kind: PluginKind;
  version: string;
  name: PluginName;
  /** One line, ≤ 140 characters, both languages for the curated list. */
  summary?: PluginName;
  icon?: string;
  author: PluginAuthor;
  license?: string;
  repo?: string;
  /** The host range (caret/`>=`/exact), checked against this build. */
  ducter: string;
  importer?: ImporterObject;
  theme?: ThemeObject;
  permissions: PluginPermissions;
}

