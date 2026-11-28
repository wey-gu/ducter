// research/248 phase 1 (D673): the one installed ledger. Every installed plugin — an
// importer (D668/D670) or a theme — lives in one `plugins.json`, keyed by id. The old importer
// ledger (`import-plugins.json`) is read once and copied in, and left untouched so a downgrade
// still finds its readers.
//
// Both runtimes read the whole file and write back only their own kind's records, so a theme and
// an importer never clobber each other. An id is unique across kinds.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The one ledger of installed plugins. */
export const INSTALLED_LEDGER = "plugins.json";
/** The pre-248 importer ledger, migrated once and left in place. */
export const LEGACY_IMPORT_LEDGER = "import-plugins.json";
export const INSTALLED_LEDGER_FORMAT = "ducter-plugins-installed/2";

/** A plugin's kind in the ledger. */
export type InstalledKind = "importer" | "theme";

/**
 * One installed plugin. The importer's fields (D668/D670) and the theme's share the record; the
 * `kind` on the record is the install origin for importers (`git`/`folder`/`repo`), so the kind
 * of plugin is `pluginKind`.
 */
export interface InstalledRecord {
  id: string;
  pluginKind: InstalledKind;
  dir: string;
  /** git: a URL; folder: the author's folder in place; repo: a copy from a repository index. */
  kind?: "git" | "folder" | "repo";
  source?: string;
  ref?: string;
  commit?: string;
  hash: string;
  version: string;
  installedAt: string;
  repoId?: string;
  official?: boolean;
  // importer
  app?: string;
  name?: string;
  author?: string;
  reads?: string[];
  run?: string[];
  starts?: string[];
  uses?: unknown[];
  online?: boolean;
  consent?: { reads: string[]; online?: boolean; at: string };
  checkedAt?: string;
  latest?: { commit?: string; hash?: string; version?: string };
  // theme
  /** The theme's own names, both languages. */
  themeName?: { en: string; zh?: string };
  /** The person said yes to this look once; switching back to it doesn't ask again. */
  consented?: boolean;
  consentedAt?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Reads the one ledger, migrating the old importer ledger in once. Never throws. */
export function readInstalledLedger(dataDir: string): Record<string, InstalledRecord> {
  const file = join(dataDir, INSTALLED_LEDGER);
  const legacy = join(dataDir, LEGACY_IMPORT_LEDGER);
  // Migrate once: copy the old importer ledger into the one ledger, marking each record an importer.
  if (!existsSync(file) && existsSync(legacy)) {
    try {
      const raw = JSON.parse(readFileSync(legacy, "utf8")) as unknown;
      if (isObj(raw) && isObj(raw.plugins)) {
        const plugins: Record<string, InstalledRecord> = {};
        for (const [id, v] of Object.entries(raw.plugins)) {
          if (!isObj(v) || typeof v.dir !== "string" || typeof v.hash !== "string" || typeof v.version !== "string") continue;
          plugins[id] = { ...v, pluginKind: "importer" } as unknown as InstalledRecord;
        }
        writeLedgerFile(dataDir, plugins);
      }
    } catch {
      /* a broken legacy ledger is simply not migrated; the rows say so */
    }
  }
  try {
    const raw = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as unknown) : undefined;
    if (!isObj(raw) || !isObj(raw.plugins)) return {};
    const out: Record<string, InstalledRecord> = {};
    for (const [id, v] of Object.entries(raw.plugins)) {
      if (!isObj(v) || typeof v.dir !== "string" || typeof v.hash !== "string" || typeof v.version !== "string") continue;
      const r = { ...v } as unknown as InstalledRecord;
      if (r.pluginKind !== "theme") r.pluginKind = "importer";
      out[id] = r;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLedgerFile(dataDir: string, plugins: Record<string, InstalledRecord>): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, INSTALLED_LEDGER);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ format: INSTALLED_LEDGER_FORMAT, plugins }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * Replaces one kind's records and leaves the other kind's as they are. `records` is keyed by id;
 * every record is written with its `pluginKind` set. Both runtimes call this, so a theme install
 * never drops an importer and vice versa.
 */
export function writeInstalledKind(dataDir: string, kind: InstalledKind, records: Record<string, InstalledRecord>): void {
  const all = readInstalledLedger(dataDir);
  for (const [id, r] of Object.entries(records)) {
    all[id] = { ...r, pluginKind: kind };
  }
  for (const [id, r] of Object.entries(all)) {
    if (r.pluginKind === kind && !(id in records)) delete all[id];
  }
  writeLedgerFile(dataDir, all);
}
