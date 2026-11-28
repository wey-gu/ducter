// D655 (research/246 §3.10, §3.11, §4.2): Settings › 导入 / Import and the offer.
//
// One source on this computer: Lody, read through the person's own signed-in `lody` command by
// the in-tree reader (lody.ts). This module keeps the small state that is not the Log: whether the
// consent card was accepted (once per source), whether the one line in Past tasks was shown and
// left alone (it fades), whether the person said 先不 (it waits for them to mention the app), and
// the look at what the source holds. The conversations themselves are written only by
// `importInto`; a removal records `import_removed` and the registry hides those tasks from Past
// tasks, search and the partner until the source is brought in again.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, ImportAnswer, ImportSourceId, ImportSourceRow, ImportsView } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { importInto } from "./service.ts";
import { detectLody, lodyRunner, lookLody, readLody, type LodyExec, type LodyLook } from "./lody.ts";

export const IMPORTS_FILE = "imports.json";
/** One source in phase 2: the app's own name, untranslated. */
export const IMPORT_SOURCE_APP: Record<ImportSourceId, string> = { lody: "Lody" };
const APP = IMPORT_SOURCE_APP;
/** A look at the index is reused this long (the pane's own visit, Past tasks' offer). */
const LOOK_MS = 60_000;
/** The offer is one quiet line that fades on its own (D453): a day after it was first drawn. */
const OFFER_MS = 24 * 3_600_000;

interface StoredSource {
  consented?: boolean;
  consentedAt?: string;
  /** When the offer line was first drawn (it does not come back after that day). */
  offeredAt?: string;
  /** 先不: no offer until the person mentions the app. */
  declinedAt?: string;
  /** The last time the person mentioned Lody (clears 先不). */
  mentionedAt?: string;
}

interface Stored {
  sources: Partial<Record<ImportSourceId, StoredSource>>;
}

export interface ImportSourcesDeps {
  log: LogStore;
  tasks: TaskRegistry;
  dataDir: string;
  /** The partner imported tasks belong to (the default, as `ducter up` runs). */
  persona?: string;
  now?: () => number;
  /** The person's zone, for the days the row says. */
  zone?: () => string | undefined;
  /** A `lody` runner; absent: the person's own PATH (`DUCTER_LODY_BIN` overrides in tests). */
  run?: LodyExec;
  /** A look's cache lifetime, injected in tests. */
  lookMs?: number;
}

export interface ImportSources {
  view(): ImportsView;
  /** Looks at the source's index now (no conversation is read); cached for a minute. */
  look(force?: boolean): Promise<void>;
  consent(id: ImportSourceId): void;
  /** 带进来: yes on the consent card, then the run. */
  accept(id: ImportSourceId): Promise<ImportAnswer>;
  run(id: ImportSourceId): Promise<ImportAnswer>;
  /** 删掉这个来源: hide what it brought in, never silently. */
  remove(id: ImportSourceId): ImportAnswer;
  /** The offer line was drawn (it fades from then on). */
  offerSeen(id: ImportSourceId): void;
  /** 先不: it waits for the person to mention the app. */
  offerDecline(id: ImportSourceId): void;
  /** The person mentioned Lody: 先不 is forgotten, so the offer may come once more. */
  mention(): void;
  /** What the partner may say once, when the person mentions Lody and nothing was brought in. */
  offerLine(): { app: string; total?: number } | undefined;
  onChange(fn: () => void): () => void;
}

const day = (iso: string, zone: string | undefined): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

export function createImportSources(d: ImportSourcesDeps): ImportSources {
  const now = d.now ?? Date.now;
  const zone = d.zone ?? (() => undefined);
  const run = d.run ?? lodyRunner();
  const lookMs = d.lookMs ?? LOOK_MS;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* a listener's failure never stops a run */
      }
    }
  };

  const file = join(d.dataDir, IMPORTS_FILE);
  const load = (): Stored => {
    try {
      const v = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Stored) : undefined;
      return v && typeof v === "object" && v.sources && typeof v.sources === "object" ? { sources: v.sources } : { sources: {} };
    } catch {
      return { sources: {} };
    }
  };
  const save = () => {
    try {
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, file);
    } catch {
      /* the state is small; if it can't be written, the Log still holds the conversations */
    }
  };
  let stored = load();
  const of = (id: ImportSourceId): StoredSource => (stored.sources[id] ??= {});

  let detected: { present: boolean; signedIn: boolean; signedOut?: boolean } | undefined;
  let looked: LodyLook | undefined;
  let lookedAt = 0;
  let looking: Promise<void> | undefined;
  let running = false;

  /** The last run's ledger (the Log is the truth for what was brought in, not this file). */
  const lastRun = (app: string): (Bodies["import_run"] & { at: string }) | undefined => {
    const runs = d.log
      .read({ stream: "system", kinds: ["import_run"], limit: 400 })
      .filter((e) => (e.body as Bodies["import_run"]).app === app && (e.body as Bodies["import_run"]).phase !== "started");
    const e = runs.at(-1);
    return e ? { ...(e.body as Bodies["import_run"]), at: e.ts } : undefined;
  };

  const brought = (app: string): { n: number; oldest?: string; day?: string } => {
    const cards = d.tasks.list().filter((c) => c.imported?.app === app);
    if (!cards.length) return { n: 0 };
    const sorted = [...cards].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const lr = lastRun(app);
    return { n: cards.length, oldest: sorted[0]!.updatedAt, ...(lr ? { day: day(lr.at, zone()) } : { day: day(sorted.at(-1)!.updatedAt, zone()) }) };
  };

  const row = (id: ImportSourceId): ImportSourceRow => {
    const app = APP[id];
    const st = of(id);
    const got = brought(app);
    const lr = lastRun(app);
    const state: ImportSourceRow["state"] =
      !looked && !detected
        ? "looking"
        : !detected?.present
          ? "missing"
          : !detected.signedIn
            ? "signed_out"
            : looked && looked.waiting.length && looked.total === 0
              ? "needs_authorization"
              : looked && looked.workspaces.length > 0 && looked.workspaces.every((w) => w.state !== "ready")
                ? "failed"
                : "ready";
    const problem: ImportSourceRow["problem"] = state === "missing" ? "no_lody" : state === "signed_out" ? "signed_out" : state === "needs_authorization" ? "needs_authorization" : state === "failed" ? "failed" : undefined;
    const waiting = looked?.waiting ?? [];
    const total = state === "ready" ? looked?.total : undefined;
    const fresh = total !== undefined && got.n > 0 ? Math.max(0, total - got.n) : undefined;
    const oldest = got.oldest ? day(got.oldest, zone()) : undefined;
    // A removal leaves the run in the Log but hides its tasks: the quiet line would claim
    // conversations that are no longer here, so it goes with them (a run that found nothing stays).
    const last = lr && (got.n > 0 || lr.threads === 0) ? { at: lr.at, threads: lr.threads, ...(oldest ? { oldest } : {}), skipped: lr.skipped, ...(lr.phase === "stopped" ? { stopped: true } : {}) } : undefined;
    return {
      id,
      app,
      state,
      ...(problem ? { problem } : {}),
      ...(waiting.length ? { waiting } : {}),
      ...(total !== undefined ? { total } : {}),
      imported: got.n,
      ...(got.day ? { importedDay: got.day } : {}),
      ...(fresh !== undefined ? { fresh } : {}),
      ...(oldest ? { oldest } : {}),
      consented: !!st.consented,
      ...(last ? { last } : {}),
      ...(running ? { running: true } : {}),
    };
  };

  const offerOf = (r: ImportSourceRow): ImportsView["offer"] => {
    if (r.state !== "ready" || r.consented || r.imported > 0 || !r.total) return undefined;
    const st = of("lody");
    if (st.declinedAt && (!st.mentionedAt || st.mentionedAt <= st.declinedAt)) return undefined;
    if (st.offeredAt && (!st.declinedAt || !st.mentionedAt || st.mentionedAt <= st.declinedAt) && Date.parse(st.offeredAt) + OFFER_MS <= now()) return undefined;
    return { id: r.id, app: r.app, total: r.total };
  };

  const view = (): ImportsView => {
    const sources = (Object.keys(APP) as ImportSourceId[]).map(row);
    // The first visit starts the look by itself (cheap: the index only), so the row never says
    // "no lody" before anything was looked at.
    if (!lookedAt && !looking) void look();
    const offer = offerOf(sources[0]!);
    return { sources, ...(offer ? { offer } : {}) };
  };

  const look = async (force = false): Promise<void> => {
    if (looking) return looking;
    if (!force && lookedAt && now() - lookedAt < lookMs) return;
    looking = (async () => {
      try {
        const l = await lookLody(run);
        detected = { present: l.present, signedIn: l.signedIn, ...(l.signedOut ? { signedOut: true } : {}) };
        looked = l;
      } catch {
        detected = { present: false, signedIn: false };
        looked = undefined;
      } finally {
        lookedAt = now();
        looking = undefined;
        changed();
      }
    })();
    return looking;
  };

  const emptyStream = `{"t":"source","format":"ducter-import/1","app":"Lody","account":"lody","reader":"lody-cli","readerVersion":"1"}\n{"t":"end","threads":0,"messages":0}\n`;

  const consent = (id: ImportSourceId) => {
    const st = of(id);
    st.consented = true;
    st.consentedAt = new Date(now()).toISOString();
    save();
    changed();
  };

  const doRun = async (id: ImportSourceId): Promise<ImportAnswer> => {
    if (running) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "already_running" };
    if (!of(id).consented) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_consented" };
    running = true;
    changed();
    try {
      const r = await readLody(run, { now });
      detected = { present: r.present, signedIn: r.signedIn, ...(r.present && !r.signedIn ? { signedOut: r.signedOut === true } : {}) };
      looked = { present: r.present, signedIn: r.signedIn, total: r.total, waiting: r.waiting, workspaces: r.workspaces };
      lookedAt = now();
      if (!r.present) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "no_lody" };
      if (!r.signedIn) return { ok: false, threads: 0, messages: 0, skipped: 0, error: r.signedOut ? "signed_out" : "failed" };
      if (r.waiting.length && r.total === 0) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "needs_authorization" };
      // A run that finds nothing still records its ledger, so the row and the quiet line are honest.
      const res = await importInto({ log: d.log, tasks: d.tasks, ...(d.persona ? { persona: d.persona } : {}), now }, r.stream || emptyStream);
      return res;
    } catch (err) {
      return { ok: false, threads: 0, messages: 0, skipped: 0, error: (err as Error).message || "failed" };
    } finally {
      running = false;
      changed();
    }
  };

  const remove = (id: ImportSourceId): ImportAnswer => {
    const app = APP[id];
    const n = d.tasks.list().filter((c) => c.imported?.app === app).length;
    d.log.append({ stream: "system", origin: "import", kind: "import_removed", body: { app, at: new Date(now()).toISOString(), threads: n } });
    // Removing the source takes the consent with it; the offer stays spent (once per computer).
    const st = of(id);
    delete st.consented;
    delete st.consentedAt;
    save();
    changed();
    return { ok: true, threads: 0, messages: 0, skipped: 0 };
  };

  return {
    view,
    look,
    consent,
    accept: async (id) => {
      consent(id);
      return doRun(id);
    },
    run: doRun,
    remove,
    offerSeen(id) {
      const st = of(id);
      st.offeredAt ??= new Date(now()).toISOString();
      save();
      changed();
    },
    offerDecline(id) {
      const st = of(id);
      st.declinedAt = new Date(now()).toISOString();
      st.offeredAt ??= st.declinedAt;
      save();
      changed();
    },
    mention() {
      const st = of("lody");
      st.mentionedAt = new Date(now()).toISOString();
      if (st.declinedAt) {
        // 先不 was said; the person brought it up themselves, so the line may come once more.
        delete st.declinedAt;
        delete st.offeredAt;
      }
      save();
      changed();
    },
    offerLine() {
      const r = row("lody");
      if (r.state !== "ready" || r.consented || r.imported > 0) return undefined;
      if (of("lody").declinedAt) return undefined;
      return { app: r.app, ...(r.total ? { total: r.total } : {}) };
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
