// D651/D655 (research/246): bringing another app's past conversations in, read only, through a
// reader that runs where the conversations live. Phase 2: the Lody reader in tree, Settings ›
// 导入 / Import, the consent card, the offer in Past tasks, and removal.
//
// A source is one installed reader. D670: readers come from plugin repositories — Ducter's
// official one, or one the person adds. The home reads a source's index for its state; nothing is
// read until the person says yes, and removal hides what it brought in (never silently: the row
// says what will be hidden first).

/**
 * A source in Settings › 导入 / Import: the built-in `"lody"`, or an added plugin's own id (D668,
 * research/246 §3.6). The wire is a string; the home accepts only ids it knows.
 */
export type ImportSourceId = string;

/** Built in, or added by the person from a git URL or a folder. */
export type ImportSourceKind = "builtin" | "plugin";

/**
 * Whether the source can be read on this computer: ready (lody on PATH and signed in), signed_out
 * (there, not signed in), needs_authorization (an encrypted workspace this computer isn't
 * authorized for), missing (no lody). `problem` carries the same fact for the row's words.
 */
export type ImportSourceState = "looking" | "ready" | "signed_out" | "needs_authorization" | "missing" | "failed";

/** One source's row in Settings › Import and the one line Past tasks may offer. */
export interface ImportSourceRow {
  id: ImportSourceId;
  /** The app's own name, untranslated ("Lody"). */
  app: string;
  /** builtin: shipped with Ducter; plugin: added by the person (D668). */
  kind?: ImportSourceKind;
  state: ImportSourceState;
  /** What went wrong, in the home's own words (the row translates the code). */
  problem?: "no_lody" | "signed_out" | "needs_authorization" | "failed" | "needs_newer" | "sandbox_unavailable" | "hash_mismatch" | "broken" | "plugin_failed";
  /** The encrypted workspaces whose history this computer may not read yet (names). */
  waiting?: string[];
  /** Conversations in the source's index; absent until a look read it. */
  total?: number;
  /** Conversations already brought in and still shown. */
  imported: number;
  /** The day the newest brought-in conversation was last worked on, YYYY-MM-DD. */
  importedDay?: string;
  /** Conversations in the source that Ducter doesn't have yet (index only). */
  fresh?: number;
  /** The oldest brought-in conversation's day, YYYY-MM-DD. */
  oldest?: string;
  /** The consent card was accepted once for this source (again only if the read list widens). */
  consented: boolean;
  /** The source's last run, for the one quiet line where it started. */
  last?: { at: string; threads: number; oldest?: string; skipped: number; stopped?: boolean };
  /** A run is in flight on this home. */
  running?: boolean;
  /** D668: an added source. 你加的 / Added by you, and its repository, in its own elements. */
  added?: boolean;
  /** The repository or folder it came from; the full URL is the tooltip and the ⋯ menu. */
  repo?: string;
  /** D670: whether it came from Ducter's official repository (the row says 官方仓库, never its URL). */
  official?: boolean;
  /** D670: the repository's short name (owner/repo, or a folder name); the full URL is the tooltip. */
  sourceName?: string;
  /** Who made it, in their own name. */
  author?: string;
  /** The literal paths the consent card names, one line each. Absent for the built-in Lody. */
  reads?: string[];
  /** On Ducter's curated list at the pinned commit: Ducter checked this version. */
  reviewed?: boolean;
  /** Outside the curated list: 没有人替你检查过 / Nobody has checked it for you. */
  unreviewed?: boolean;
  /** A newer commit or content is out; one tap applies it (and asks again if it reads more). */
  update?: { version?: string; commit?: string };
  /** D670: the app's own icon, a data URL from its plugin; absent keeps the letter tile. */
  icon?: string;
  /** The declared commands this reader starts, with the literal words its card says. */
  uses?: { command: string; online: boolean; why: { en: string; zh?: string } }[];
  /** It declares an online command, so its run gets outbound network (and its card says so). */
  online?: boolean;
  /** An unreviewed online reader needs the second, explicit line ticked on its card. */
  needsOnlineConsent?: boolean;
}

/** D670: a plugin repository the person added (or the official one). */
export interface ImportRepository {
  id: string;
  url: string;
  official: boolean;
  /** looking before the first index read; failed says its index can't be reached. */
  state: "looking" | "ready" | "failed";
  problem?: string;
  /** How many plugins its index lists, once read. */
  plugins?: number;
}

/** D670: one plugin a source lists and the person can bring in. */
export interface ImportAvailable {
  id: string;
  /** The app whose conversations it reads, the name the row shows. */
  app: string;
  /** The plugin's own name (the manifest's en name). */
  name: string;
  version: string;
  commit: string;
  hash: string;
  /** The repository's id. */
  source: string;
  sourceUrl: string;
  /** The short name the row shows (owner/repo, or the folder name); the URL is the tooltip. */
  sourceName: string;
  official: boolean;
  reads: string[];
  uses?: { command: string; online: boolean; why: { en: string; zh?: string } }[];
  online: boolean;
  /** A `detect` path exists on this computer: detected apps come first. */
  detected: boolean;
  /** The official index lists this exact version and hash. */
  reviewed: boolean;
  icon?: string;
}

/** What Settings › Import and Past tasks read, one frame, kept current on every change. */
export interface ImportsView {
  sources: ImportSourceRow[];
  /** D670: every repository Ducter knows, the official one first. */
  repositories?: ImportRepository[];
  /** D670: the quiet Available list under the installed rows, detected apps first. */
  available?: ImportAvailable[];
  /**
   * The one line Past tasks may show under 也在这台电脑上 / Also on this computer, while a source is
   * detected and not brought in yet. Once per source per computer; after 先不 it waits for the person
   * to mention the app again, and it fades if left alone (D453).
   */
  offer?: { id: ImportSourceId; app: string; total?: number };
}

export type ImportsClientFrame =
  // Subscribe; answered with an imports frame and again on every change.
  | { t: "imports" }
  // The person said yes on the consent card: keep the consent, then bring them in now. `online`
  // is the second, explicit line an unreviewed online reader's card makes them tick.
  | { t: "import_consent"; id: ImportSourceId; online?: boolean }
  // D670: 加一个插件仓库 / Add a plugin repository, and remove one the person added.
  | { t: "import_source_add"; url: string }
  | { t: "import_source_remove"; id: string }
  // D670: Bring them in on an Available row: install at the index's pin, then its consent card.
  | { t: "import_install"; source: string; id: ImportSourceId }
  // 再带一次 / Bring in again: run a consented source now.
  | { t: "import_run"; id: ImportSourceId }
  // 删掉这个来源 / Remove this source: hide what it brought in (the row asked once, in place).
  | { t: "import_remove"; id: ImportSourceId }
  // 更新 / Update an added source to the pinned newer commit; a widened read list asks again.
  | { t: "import_update"; id: ImportSourceId }
  // The offer in Past tasks: shown (it now fades on its own), 先不 (it waits for a mention), or
  // 带进来 (the same consent card, then the run). Past tasks sends `seen` when it draws the line.
  | { t: "import_offer"; id: ImportSourceId; action: "seen" | "decline" | "begin" };

export type ImportsServerFrame =
  | ({ t: "imports" } & ImportsView)
  // The answer to a consent, a run or a removal: the same ImportAnswer shape the CLI uses, plus what
  // removal hid. The imports frame that follows carries the new rows.
  | { t: "import_answer"; id: ImportSourceId; op: "consent" | "run" | "remove" | "update" | "install" | "source_add" | "source_remove"; ok: boolean; threads?: number; messages?: number; skipped?: number; removed?: number; stopped?: boolean; error?: string; /** The update widened the read list: show the consent card again. */ needsConsent?: boolean; widened?: boolean; /** The update had nothing to apply. */ upToDate?: boolean; detail?: string; /** source_add: the id of the repository now known. */ sourceId?: string; url?: string };
