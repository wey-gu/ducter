// D655/D668/D670 (research/246 §3.10, §3.11, §4.2): Settings › 导入 / Import.
//
// One row per installed reader. A reader comes from a plugin repository: Ducter's official one,
// or one the person added (`ducter plugin source add <git-url>`). The official index is the
// reviewed list; a person's source is **你加的 / Added by you** and, unless the official index
// lists that exact version and hash, **没有人替你检查过 / Nobody has checked it for you**. The
// conversations themselves are written only by `importInto`; a removal records `import_removed`
// and the registry hides those tasks from Past tasks, search and the partner until the source is
// brought in again.
//
// Lody used to be the one built-in source (D655). It is now the official plugin, with the same
// app name ("Lody") and account ("lody"), so a person who already brought Lody in keeps every
// imported task, its thread ids and its messages; importing through the plugin appends only what
// is new.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, ImportAnswer, ImportSourceId, ImportSourceRow, ImportsView } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { iconDataUrl } from "./icon.ts";
import { createPluginRuntime, type GitExec, type PluginEntry, type PluginRuntime } from "./plugins.ts";
import { createRepositories, repoShortName, type RepositoryRuntime } from "./repos.ts";
import { importInto } from "./service.ts";
import { sandboxAvailable } from "./sandbox.ts";

export const IMPORTS_FILE = "imports.json";
/** A look at the repositories is reused this long (the pane's own visit). */
const LOOK_MS = 60_000;

interface StoredSource {
  consented?: boolean;
  consentedAt?: string;
  /** The read list the person said yes to; a widened list asks again (D668). */
  reads?: string[];
  /** The second, explicit line an unreviewed online reader needs. */
  onlineConsented?: boolean;
  /** Kept for the state D655 wrote; the offer itself is retired with the built-in Lody source. */
  offeredAt?: string;
  declinedAt?: string;
  mentionedAt?: string;
}

interface Stored {
  sources: Record<string, StoredSource>;
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
  /** A look's cache lifetime, injected in tests. */
  lookMs?: number;
  /** D668: the added plugins' runtime; default one over this data folder. */
  plugins?: PluginRuntime;
  /** D670: the repositories; default the official source plus the person's ledger. */
  repositories?: RepositoryRuntime;
  /** D673: the theme runtime, so its reviewed list follows the official index too. */
  theme?: import("../plugins/theme.ts").ThemeRuntime;
  /** The official repository URL; tests and demos point it at a local fixture. */
  officialUrl?: string;
  git?: GitExec;
  path?: string;
}

export interface ImportSources {
  view(): ImportsView;
  /** Looks at the repositories now (no conversation is read); cached for a minute. */
  look(force?: boolean): Promise<void>;
  consent(id: ImportSourceId, online?: boolean): void;
  /** 带进来: yes on the consent card, then the run. */
  accept(id: ImportSourceId, online?: boolean): Promise<ImportAnswer>;
  run(id: ImportSourceId): Promise<ImportAnswer>;
  /** 删掉这个来源: hide what it brought in, never silently. */
  remove(id: ImportSourceId): ImportAnswer;
  /** 更新 / Update an added source; a widened read list asks again. */
  update(id: ImportSourceId): Promise<ImportAnswer>;
  /** Install a plugin the sources list (Bring them in opens its consent card next). */
  install(sourceId: string, id: ImportSourceId): Promise<ImportAnswer>;
  /** 加一个插件仓库 / Add a plugin repository. */
  addSource(url: string): { ok: boolean; id?: string; error?: string; detail?: string };
  removeSource(id: string): { ok: boolean; error?: string };
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

  const plugins = d.plugins ?? createPluginRuntime({ dataDir: d.dataDir, now });
  const repositories =
    d.repositories ??
    createRepositories({
      dataDir: d.dataDir,
      plugins,
      now,
      ...(d.officialUrl ? { officialUrl: d.officialUrl } : {}),
      ...(d.git ? { git: d.git } : {}),
      ...(d.path ? { path: d.path } : {}),
      ...(d.theme ? { theme: d.theme } : {}),
    });
  plugins.onChange(changed);
  repositories.onChange(changed);

  let lookedAt = 0;
  let looking: Promise<void> | undefined;
  const running = new Set<string>();

  /** The last run's ledger (the Log is the truth for what was brought in, not this file). */
  const lastRun = (app: string, account?: string): (Bodies["import_run"] & { at: string }) | undefined => {
    const runs = d.log
      .read({ stream: "system", kinds: ["import_run"], limit: 400 })
      .filter((e) => {
        const b = e.body as Bodies["import_run"];
        return b.app === app && (account === undefined || b.account === account) && b.phase !== "started";
      });
    const e = runs.at(-1);
    return e ? { ...(e.body as Bodies["import_run"]), at: e.ts } : undefined;
  };

  const brought = (app: string, account?: string): { n: number; oldest?: string; day?: string } => {
    const cards = d.tasks.list().filter((c) => c.imported?.app === app && (account === undefined || c.imported?.account === account));
    if (!cards.length) return { n: 0 };
    const sorted = [...cards].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const lr = lastRun(app, account);
    return { n: cards.length, oldest: sorted[0]!.updatedAt, ...(lr ? { day: day(lr.at, zone()) } : { day: day(sorted.at(-1)!.updatedAt, zone()) }) };
  };

  /** An installed plugin's row: its own state, its repository, who made it, what it reads. */
  const pluginRow = (p: PluginEntry): ImportSourceRow => {
    const id = p.record.id;
    const app = p.manifest?.app.name ?? p.record.app;
    const st = of(id);
    const got = brought(app, id);
    const lr = lastRun(app, id);
    const avail = sandboxAvailable();
    const problem: ImportSourceRow["problem"] | undefined = p.problem ?? (!avail.ok ? "sandbox_unavailable" : undefined);
    const reads = p.manifest?.reads ?? st.reads ?? [];
    const online = p.manifest?.online === true;
    const consented = !!st.consented && plugins.consented(id, reads, online);
    const oldest = got.oldest ? day(got.oldest, zone()) : undefined;
    const last = lr && (got.n > 0 || lr.threads === 0) ? { at: lr.at, threads: lr.threads, ...(oldest ? { oldest } : {}), skipped: lr.skipped, ...(lr.phase === "stopped" ? { stopped: true } : {}) } : undefined;
    const repo = (p.record.repoId ? repositories.get(p.record.repoId)?.url : undefined) ?? p.record.source ?? (p.record.kind === "folder" ? p.record.dir : undefined);
    const icon = iconDataUrl(p.record.dir, p.manifest?.app.icon);
    const uses = p.manifest?.uses ?? [];
    return {
      id,
      app,
      kind: "plugin",
      state: problem ? "failed" : "ready",
      ...(problem ? { problem } : {}),
      imported: got.n,
      ...(got.day ? { importedDay: got.day } : {}),
      ...(oldest ? { oldest } : {}),
      consented,
      ...(last ? { last } : {}),
      ...(running.has(id) ? { running: true } : {}),
      added: !p.record.official,
      ...(repo ? { repo } : {}),
      ...(p.record.official ? { official: true } : {}),
      ...(repo ? { sourceName: repoShortName(repo) } : {}),
      ...(p.manifest?.author.name ?? p.record.author ? { author: p.manifest?.author.name ?? p.record.author } : {}),
      ...(reads.length ? { reads } : {}),
      ...(uses.length ? { uses } : {}),
      online,
      ...(online && !p.reviewed ? { needsOnlineConsent: true } : {}),
      reviewed: p.reviewed,
      unreviewed: !p.reviewed,
      ...(icon ? { icon } : {}),
      ...(p.update ? { update: { ...(p.update.version ? { version: p.update.version } : {}), ...(p.update.commit ? { commit: p.update.commit } : {}) } } : {}),
    };
  };

  const view = (): ImportsView => {
    // The first visit starts the look by itself (cheap: the indexes only), so the pane never says
    // "nothing" before anything was looked at.
    if (!lookedAt && !looking) void look().catch(() => undefined);
    const snap = repositories.snapshot();
    return {
      sources: plugins.list().map(pluginRow),
      repositories: snap.repositories,
      available: snap.available,
    };
  };

  const look = async (force = false): Promise<void> => {
    if (looking) return looking;
    if (!force && lookedAt && now() - lookedAt < lookMs) return;
    looking = (async () => {
      try {
        await repositories.look(force);
        // A manually added git plugin still checks its own remote; a repository install's newer
        // version came from the index in the look above.
        await plugins.check().catch(() => undefined);
      } finally {
        lookedAt = now();
        looking = undefined;
        changed();
      }
    })();
    return looking;
  };

  const consent = (id: ImportSourceId, online = false) => {
    const p = plugins.get(id);
    const reads = p?.manifest?.reads;
    if (!p || !reads) return;
    plugins.consent(id, reads, online);
    const st = of(id);
    st.reads = [...reads];
    st.consented = true;
    st.consentedAt = new Date(now()).toISOString();
    st.onlineConsented = online;
    save();
    changed();
  };

  const doRun = async (id: ImportSourceId): Promise<ImportAnswer> => {
    if (running.has(id)) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "already_running" };
    if (!of(id).consented) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_consented" };
    const p = plugins.get(id);
    if (!p) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_found" };
    const reads = p.manifest?.reads ?? [];
    const online = p.manifest?.online === true;
    // The consent is for this exact read list and, for an online reader, for going online.
    if (!plugins.consented(id, reads, online)) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_consented" };
    // An unreviewed online reader needs the second, explicit line ticked.
    if (online && !p.reviewed && !of(id).onlineConsented) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_consented" };
    if (!p.manifest) return { ok: false, threads: 0, messages: 0, skipped: 0, error: p.problem ?? "broken" };
    running.add(id);
    changed();
    try {
      const r = await plugins.run(id);
      if (r.error) return { ok: false, threads: 0, messages: 0, skipped: 0, error: r.error };
      if (!r.stream.trim()) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "plugin_failed" };
      // The host stamps the source: a plugin never claims to be Lody, the person or a task.
      return await importInto(
        {
          log: d.log,
          tasks: d.tasks,
          ...(d.persona ? { persona: d.persona } : {}),
          now,
          stamp: { app: p.manifest.app.name, account: id, reader: id, readerVersion: p.manifest.version },
        },
        r.stream,
      );
    } catch (err) {
      return { ok: false, threads: 0, messages: 0, skipped: 0, error: (err as Error).message || "failed" };
    } finally {
      running.delete(id);
      changed();
    }
  };

  const remove = (id: ImportSourceId): ImportAnswer => {
    const p = plugins.get(id);
    if (!p) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_found" };
    const app = p.manifest?.app.name ?? p.record.app;
    const n = d.tasks.list().filter((c) => c.imported?.app === app && c.imported?.account === id).length;
    d.log.append({ stream: "system", origin: "import", kind: "import_removed", body: { app, at: new Date(now()).toISOString(), threads: n } });
    const gone = plugins.remove(id);
    if (!gone.ok) return { ok: false, threads: 0, messages: 0, skipped: 0, error: gone.error ?? "remove_failed" };
    delete stored.sources[id];
    save();
    changed();
    return { ok: true, threads: 0, messages: 0, skipped: 0 };
  };

  return {
    view,
    look,
    consent,
    accept: async (id, online = false) => {
      consent(id, online);
      return doRun(id);
    },
    run: doRun,
    remove,
    install: async (sourceId, id) => {
      const r = await repositories.install(sourceId, id);
      changed();
      return {
        ok: r.ok,
        threads: 0,
        messages: 0,
        skipped: 0,
        ...(r.error ? { error: r.error } : {}),
        ...(r.ok ? { needsConsent: true } : {}),
      };
    },
    addSource: (url) => {
      const r = repositories.add(url);
      changed();
      return r;
    },
    removeSource: (id) => {
      const r = repositories.remove(id);
      changed();
      return r;
    },
    update: async (id) => {
      const p = plugins.get(id);
      if (!p) return { ok: false, threads: 0, messages: 0, skipped: 0, error: "not_found" };
      const r = p.record.kind === "repo" ? await repositories.update(id) : await plugins.update(id);
      if (r.needsConsent) {
        const st = of(id);
        delete st.consented;
        delete st.consentedAt;
        delete st.onlineConsented;
        save();
      }
      changed();
      return {
        ok: r.ok,
        threads: 0,
        messages: 0,
        skipped: 0,
        ...(r.error ? { error: r.error } : {}),
        ...(r.needsConsent ? { needsConsent: true } : {}),
        ...(r.widened ? { widened: true } : {}),
        ...(r.upToDate ? { upToDate: true } : {}),
      };
    },
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
        delete st.declinedAt;
        delete st.offeredAt;
      }
      save();
      changed();
    },
    offerLine() {
      // D670: the built-in Lody row is gone; the available list is the one offer now.
      return undefined;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
