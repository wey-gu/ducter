// D651/D655 (research/246): bringing another app's past conversations in, read only, through a
// reader that runs where the conversations live. Phase 2: the Lody reader in tree, Settings ›
// 导入 / Import, the consent card, the offer in Past tasks, and removal.
//
// A source is one app on this computer (Lody, through the person's own signed-in `lody` command).
// The home reads the source's index for its state; nothing is read until the person says yes, and
// removal hides what it brought in (never silently: the row says what will be hidden first).

/** The app a source belongs to. Phase 2 has one; the shape allows more without a new pane. */
export type ImportSourceId = "lody";

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
  state: ImportSourceState;
  /** What went wrong, in the home's own words (the row translates the code). */
  problem?: "no_lody" | "signed_out" | "needs_authorization" | "failed";
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
}

/** What Settings › Import and Past tasks read, one frame, kept current on every change. */
export interface ImportsView {
  sources: ImportSourceRow[];
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
  // The person said yes on the consent card: keep the consent, then bring them in now.
  | { t: "import_consent"; id: ImportSourceId }
  // 再带一次 / Bring in again: run a consented source now.
  | { t: "import_run"; id: ImportSourceId }
  // 删掉这个来源 / Remove this source: hide what it brought in (the row asked once, in place).
  | { t: "import_remove"; id: ImportSourceId }
  // The offer in Past tasks: shown (it now fades on its own), 先不 (it waits for a mention), or
  // 带进来 (the same consent card, then the run). Past tasks sends `seen` when it draws the line.
  | { t: "import_offer"; id: ImportSourceId; action: "seen" | "decline" | "begin" };

export type ImportsServerFrame =
  | ({ t: "imports" } & ImportsView)
  // The answer to a consent, a run or a removal: the same ImportAnswer shape the CLI uses, plus what
  // removal hid. The imports frame that follows carries the new rows.
  | { t: "import_answer"; id: ImportSourceId; op: "consent" | "run" | "remove"; ok: boolean; threads?: number; messages?: number; skipped?: number; removed?: number; stopped?: boolean; error?: string };
