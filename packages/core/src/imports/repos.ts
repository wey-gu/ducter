// D670 (the author, 2026-11-28): plugin repositories as sources.
//
// A plugin repository is a git repository with an `index.json` at its root: the plugins it
// carries, each at a pinned commit and content hash. Ducter knows one official repository
// (OFFICIAL_PLUGINS_URL) and the person may add their own. The official index *is* the reviewed
// list now: a plugin listed there at that exact version, commit and hash is **Ducter 查过这个版本
// / Ducter checked this version**; anything else is **没有人替你检查过 / Nobody has checked it
// for you**. The old in-tree `plugins.json` is gone.
//
// Nothing here runs a reader. `look` clones a source into `<dataDir>/plugin-sources/<id>` (at
// most hourly) and reads its index; `install` clones afresh, checks out the index's commit,
// verifies the plugin folder's content hash against the index, and only then copies it into
// Ducter's plugin ledger. A source that can't be reached keeps its last good index for the
// reviewed list, so being offline never turns a checked version into an unchecked one.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { isVersion } from "@ducter/protocol/src/version.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { iconDataUrl } from "./icon.ts";
import {
  OFFICIAL_PLUGINS_URL,
  OFFICIAL_SOURCE_ID,
  contentHash,
  gitRunner,
  looksGit,
  readManifest,
  type CuratedEntry,
  type GitExec,
  type PluginAnswer,
  type PluginRuntime,
  type PluginUse,
} from "./plugins.ts";
import { expandDeclaredPath } from "./sandbox.ts";

export const REPOSITORIES_FILE = "import-repositories.json";
export const REPOSITORIES_LEDGER_FORMAT = "ducter-import-repositories/1";
export const PLUGINS_INDEX = "index.json";
export const PLUGINS_INDEX_FORMAT = "ducter-plugins/1";
const OFFICIAL_CACHE = "official-index.json";
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const COMMIT_RE = /^[0-9a-f]{7,64}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;

export interface RepositorySource {
  id: string;
  url: string;
  official: boolean;
  addedAt?: string;
}

export interface IndexEntry {
  id: string;
  /** The plugin folder inside the repository. */
  path: string;
  version: string;
  commit: string;
  hash: string;
  app: string;
  /** The app icon inside the plugin folder; `app.icon` in its manifest is the fallback. */
  icon?: string;
}

export interface LookedRepository {
  source: RepositorySource;
  /** Where its index was read; absent when it could not be reached. */
  root?: string;
  entries: IndexEntry[];
  state: "ready" | "failed";
  problem?: "not_found" | "bad_index" | "git_failed";
  detail?: string;
}

export interface AvailablePlugin {
  id: string;
  app: string;
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
  uses: PluginUse[];
  online: boolean;
  detected: boolean;
  reviewed: boolean;
  icon?: string;
}

export interface RepositoriesView {
  repositories: {
    id: string;
    url: string;
    official: boolean;
    state: "looking" | "ready" | "failed";
    problem?: string;
    plugins?: number;
  }[];
  available: AvailablePlugin[];
}

export interface RepositoryOptions {
  dataDir: string;
  plugins: PluginRuntime;
  now?: () => number;
  git?: GitExec;
  /** The official repository; tests and demos point it at a local fixture. */
  officialUrl?: string;
  /** How long a source's index is reused. */
  lookMs?: number;
  path?: string;
}

export interface RepositoryRuntime {
  list(): RepositorySource[];
  get(id: string): RepositorySource | undefined;
  add(url: string): { ok: boolean; id?: string; url?: string; error?: string; detail?: string };
  remove(id: string): { ok: boolean; error?: string };
  look(force?: boolean): Promise<RepositoriesView>;
  /** What is known now, without going online. */
  snapshot(): RepositoriesView;
  available(): AvailablePlugin[];
  onChange(fn: () => void): () => void;
  install(sourceId: string, id: string): Promise<PluginAnswer>;
  /** Move an installed repository plugin to what its source lists now. */
  update(id: string): Promise<PluginAnswer>;
  sourceOf(id: string | undefined): RepositorySource | undefined;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function sourceIdFor(url: string): string {
  return `src-${createHash("sha256").update(url).digest("hex").slice(0, 10)}`;
}

/**
 * A repository's short name for a row: `owner/repo` from a git address, else the last path part.
 * The full URL stays in the tooltip and the row's ⋯.
 */
export function repoShortName(url: string): string {
  const u = url.trim();
  const scp = /^[^@\s]+@([^:\s]+):(.+?)(?:\.git)?\/?$/.exec(u);
  if (scp) return scp[2]!.replace(/\/+$/, "") || u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "file:") {
      const parts = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
      return parts.at(-1) || u;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.slice(-2).join("/").replace(/\.git$/, "") || u;
  } catch {
    const parts = u.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || u;
  }
}

/** A local folder (an author's checkout or a test fixture) is read where it is; no clone. */
function localRoot(url: string): string | undefined {
  // A file:// URL is still a git source: cloning it checks out the index's pinned commit, which a
  // plain folder read cannot. A bare path is an author's folder, read where it is.
  if (looksGit(url)) return undefined;
  const p = resolve(url);
  return existsSync(p) && statSync(p).isDirectory() ? p : undefined;
}

function readIndex(root: string): { entries: IndexEntry[]; problem?: "not_found" | "bad_index"; detail?: string } {
  const file = join(root, PLUGINS_INDEX);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { entries: [], problem: "not_found", detail: `no readable ${PLUGINS_INDEX}` };
  }
  if (!isObj(raw) || raw.format !== PLUGINS_INDEX_FORMAT || !Array.isArray(raw.plugins)) {
    return { entries: [], problem: "bad_index", detail: `format must be ${PLUGINS_INDEX_FORMAT}` };
  }
  const entries: IndexEntry[] = [];
  const seen = new Set<string>();
  for (const p of raw.plugins) {
    if (!isObj(p)) continue;
    const id = str(p.id);
    const path = str(p.path);
    const version = str(p.version);
    const commit = str(p.commit);
    const hash = str(p.hash);
    const app = str(p.app);
    const icon = str(p.icon);
    if (!ID_RE.test(id) || seen.has(id)) continue;
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes("..")) continue;
    if (!isVersion(version) || !COMMIT_RE.test(commit) || !HASH_RE.test(hash) || !app) continue;
    if (icon && (isAbsolute(icon) || icon.split(/[\\/]/).includes(".."))) continue;
    seen.add(id);
    entries.push({ id, path, version, commit, hash, app, ...(icon ? { icon } : {}) });
  }
  return { entries };
}

function loadLedger(dataDir: string): RepositorySource[] {
  try {
    const file = join(dataDir, REPOSITORIES_FILE);
    if (!existsSync(file)) return [];
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!isObj(raw) || !Array.isArray(raw.repositories)) return [];
    const out: RepositorySource[] = [];
    for (const r of raw.repositories) {
      if (!isObj(r)) continue;
      const id = str(r.id);
      const url = str(r.url);
      if (!ID_RE.test(id) || !url || id === OFFICIAL_SOURCE_ID) continue;
      out.push({ id, url, official: false, ...(str(r.addedAt) ? { addedAt: str(r.addedAt) } : {}) });
    }
    return out;
  } catch {
    return [];
  }
}

function saveLedger(dataDir: string, repos: RepositorySource[]): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, REPOSITORIES_FILE);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ format: REPOSITORIES_LEDGER_FORMAT, repositories: repos }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

function officialCacheFile(dataDir: string): string {
  return join(dataDir, OFFICIAL_CACHE);
}

function loadOfficialCache(dataDir: string): CuratedEntry[] {
  try {
    const raw = JSON.parse(readFileSync(officialCacheFile(dataDir), "utf8")) as unknown;
    if (!isObj(raw) || !Array.isArray(raw.entries)) return [];
    const out: CuratedEntry[] = [];
    for (const e of raw.entries) {
      if (!isObj(e)) continue;
      const id = str(e.id);
      const repo = str(e.repo);
      const version = str(e.version);
      const commit = str(e.commit);
      const hash = str(e.hash);
      if (!ID_RE.test(id) || !repo || !isVersion(version) || !COMMIT_RE.test(commit) || !HASH_RE.test(hash)) continue;
      out.push({ id, repo, version, commit, hash });
    }
    return out;
  } catch {
    return [];
  }
}

function saveOfficialCache(dataDir: string, entries: CuratedEntry[]): void {
  try {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const file = officialCacheFile(dataDir);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ format: "ducter-official-index/1", entries }, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    /* the cache is a convenience; the live index is the truth */
  }
}

export function createRepositories(o: RepositoryOptions): RepositoryRuntime {
  const now = o.now ?? Date.now;
  const git = o.git ?? gitRunner(whichNow("git") ?? "git");
  const officialUrl = (o.officialUrl ?? OFFICIAL_PLUGINS_URL).trim();
  const lookMs = o.lookMs ?? 3_600_000;
  const home = process.env.HOME ?? homedir();
  const path = o.path ?? process.env.PATH ?? "";

  let repos = loadLedger(o.dataDir);
  const listeners = new Set<() => void>();
  // The plugin runtime's reviewed list starts from the last good official index, so a restart
  // (or an offline one) doesn't relabel a checked version as unchecked.
  o.plugins.setCurated(loadOfficialCache(o.dataDir));

  const all = (): RepositorySource[] => [{ id: OFFICIAL_SOURCE_ID, url: officialUrl, official: true }, ...repos];
  const get = (id: string) => all().find((r) => r.id === id);
  let looked: Map<string, { at: number; repo: LookedRepository }> = new Map();
  let flushing: Promise<RepositoriesView> | undefined;

  const clamp = (s: string) => s.replace(/\s+/g, " ").trim();

  function save(): void {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* a listener never stops a look */
      }
    }
  }

  async function lookOne(source: RepositorySource, force: boolean): Promise<LookedRepository> {
    const cached = looked.get(source.id);
    if (!force && cached && now() - cached.at < lookMs) return cached.repo;
    const local = localRoot(source.url);
    if (local) {
      const idx = readIndex(local);
      const repo: LookedRepository = {
        source,
        root: local,
        entries: idx.entries,
        state: idx.problem ? "failed" : "ready",
        ...(idx.problem ? { problem: idx.problem } : {}),
        ...(idx.detail ? { detail: idx.detail } : {}),
      };
      looked.set(source.id, { at: now(), repo });
      return repo;
    }
    // A git source: a shallow clone at HEAD is enough to read the index (and its icons). The
    // pinned commits are checked out only for an install, in a fresh staging folder.
    const cacheDir = join(o.dataDir, "plugin-sources", source.id);
    let failure: string | undefined;
    if (force && existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
    if (!existsSync(cacheDir)) {
      mkdirSync(join(o.dataDir, "plugin-sources"), { recursive: true, mode: 0o700 });
      const r = await git(["clone", "--quiet", "--depth", "1", source.url, cacheDir]);
      if (r.code !== 0) {
        failure = clamp(r.stderr || r.stdout || "git clone failed");
        rmSync(cacheDir, { recursive: true, force: true });
      }
    }
    if (failure) {
      const repo: LookedRepository = { source, entries: [], state: "failed", problem: "git_failed", detail: failure };
      looked.set(source.id, { at: now(), repo });
      return repo;
    }
    const idx = readIndex(cacheDir);
    const repo: LookedRepository = {
      source,
      root: cacheDir,
      entries: idx.entries,
      state: idx.problem ? "failed" : "ready",
      ...(idx.problem ? { problem: idx.problem } : {}),
      ...(idx.detail ? { detail: idx.detail } : {}),
    };
    looked.set(source.id, { at: now(), repo });
    return repo;
  }

  function curatedOf(repo: LookedRepository): CuratedEntry[] {
    return repo.entries.map((e) => ({ id: e.id, repo: repo.source.url, version: e.version, commit: e.commit, hash: e.hash }));
  }

  /** Every entry the sources list, before installed plugins are filtered out. */
  function rawAvailable(): { source: RepositorySource; repo: LookedRepository; entry: IndexEntry }[] {
    const out: { source: RepositorySource; repo: LookedRepository; entry: IndexEntry }[] = [];
    for (const source of all()) {
      const l = looked.get(source.id);
      if (!l || l.repo.state !== "ready" || !l.repo.root) continue;
      for (const entry of l.repo.entries) out.push({ source, repo: l.repo, entry });
    }
    return out;
  }

  function curatedMap(): Map<string, CuratedEntry> {
    const official = looked.get(OFFICIAL_SOURCE_ID)?.repo;
    const cache = official?.state === "ready" ? curatedOf(official) : loadOfficialCache(o.dataDir);
    return new Map(cache.map((c) => [c.id, c]));
  }

  function availableNow(): AvailablePlugin[] {
    const installed = new Set(o.plugins.list().map((p) => p.record.id));
    const official = curatedMap();
    const out: AvailablePlugin[] = [];
    const seen = new Set<string>();
    for (const { source, repo, entry } of rawAvailable()) {
      if (seen.has(entry.id) || installed.has(entry.id) || !repo.root) continue;
      const dir = join(repo.root, entry.path);
      let manifest;
      try {
        manifest = readManifest(dir);
      } catch {
        // An index entry whose folder is unreadable is not offered: it would fail at install.
        continue;
      }
      if (manifest.id !== entry.id || manifest.version !== entry.version) continue;
      const detected = manifest.detect.some((p) => {
        try {
          return existsSync(expandDeclaredPath(p, { dir, home }));
        } catch {
          return false;
        }
      });
      const c = official.get(entry.id);
      const reviewed = source.official || (!!c && c.version === entry.version && c.hash === entry.hash);
      const icon = iconDataUrl(dir, entry.icon) ?? iconDataUrl(dir, manifest.app.icon);
      seen.add(entry.id);
      out.push({
        id: entry.id,
        app: entry.app,
        name: manifest.name.en,
        version: entry.version,
        commit: entry.commit,
        hash: entry.hash,
        source: source.id,
        sourceUrl: source.url,
        sourceName: repoShortName(source.url),
        official: source.official,
        reads: [...manifest.reads],
        uses: manifest.uses,
        online: manifest.online,
        detected,
        reviewed,
        ...(icon ? { icon } : {}),
      });
    }
    return out.sort((a, b) => Number(b.detected) - Number(a.detected) || a.app.localeCompare(b.app));
  }

  function view(): RepositoriesView {
    const sources = all();
    return {
      repositories: sources.map((s) => {
        const l = looked.get(s.id);
        return {
          id: s.id,
          url: s.url,
          official: s.official,
          state: l ? l.repo.state : "looking",
          ...(l?.repo.problem ? { problem: l.repo.problem } : {}),
          ...(l ? { plugins: l.repo.entries.length } : {}),
        };
      }),
      available: availableNow(),
    };
  }

  /** After a look: what each repository-installed plugin's source lists now. */
  function refreshLatest(): void {
    for (const p of o.plugins.list()) {
      if (p.record.kind !== "repo" || !p.record.repoId) continue;
      const entry = rawAvailable().find((x) => x.source.id === p.record.repoId && x.entry.id === p.record.id)?.entry;
      if (!entry) continue;
      const moved = entry.version !== p.record.version || entry.hash !== p.record.hash || (!!entry.commit && entry.commit !== p.record.commit);
      o.plugins.setLatest(p.record.id, moved ? { version: entry.version, commit: entry.commit, hash: entry.hash } : undefined);
    }
  }

  async function look(force = false): Promise<RepositoriesView> {
    if (flushing) return flushing;
    flushing = (async () => {
      for (const source of all()) await lookOne(source, force);
      const official = looked.get(OFFICIAL_SOURCE_ID)?.repo;
      if (official?.state === "ready") {
        const entries = curatedOf(official);
        o.plugins.setCurated(entries);
        saveOfficialCache(o.dataDir, entries);
      }
      refreshLatest();
      save();
      flushing = undefined;
      return view();
    })().catch((err) => {
      flushing = undefined;
      throw err;
    });
    return flushing;
  }

  function add(url: string): { ok: boolean; id?: string; url?: string; error?: string; detail?: string } {
    const u = url.trim();
    if (!u || u.length > 2000 || /[\0\n\r]/.test(u)) return { ok: false, error: "bad_url" };
    if (u === officialUrl) return { ok: false, error: "official_source", detail: "Ducter's official repository is always here" };
    if (!looksGit(u) && !localRoot(u)) return { ok: false, error: "not_found", detail: "not a git URL or a folder" };
    if (all().some((r) => r.url === u)) return { ok: false, error: "already_added" };
    const id = sourceIdFor(u);
    if (repos.some((r) => r.id === id)) return { ok: false, error: "already_added" };
    repos = [...repos, { id, url: u, official: false, addedAt: new Date(now()).toISOString() }];
    saveLedger(o.dataDir, repos);
    save();
    return { ok: true, id, url: u };
  }

  function remove(id: string): { ok: boolean; error?: string } {
    if (id === OFFICIAL_SOURCE_ID) return { ok: false, error: "official_source" };
    if (!repos.some((r) => r.id === id)) return { ok: false, error: "not_found" };
    repos = repos.filter((r) => r.id !== id);
    saveLedger(o.dataDir, repos);
    looked.delete(id);
    for (const p of o.plugins.list()) if (p.record.repoId === id) o.plugins.setLatest(p.record.id, undefined);
    try {
      rmSync(join(o.dataDir, "plugin-sources", id), { recursive: true, force: true });
    } catch {
      /* a cache folder is not worth failing a removal over */
    }
    save();
    return { ok: true };
  }

  /** A fresh checkout of one entry, at the index's commit, with its hash checked. */
  async function checkout(source: RepositorySource, entry: IndexEntry): Promise<{ dir?: string; staging?: string; error?: string; detail?: string }> {
    const local = localRoot(source.url);
    const staging = mkdtempSync(join(o.dataDir, "repo-install-"));
    try {
      if (local) {
        cpSync(local, staging, { recursive: true });
      } else {
        const r = await git(["clone", "--quiet", source.url, staging]);
        if (r.code !== 0) return { staging, error: "git_failed", detail: clamp(r.stderr || r.stdout) };
        const co = await git(["checkout", "--quiet", "--detach", entry.commit], { cwd: staging });
        if (co.code !== 0) return { staging, error: "git_failed", detail: clamp(co.stderr || co.stdout) };
      }
      const dir = join(staging, entry.path);
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return { staging, error: "not_found", detail: `no ${entry.path}` };
      const hash = contentHash(dir);
      if (hash !== entry.hash) return { staging, error: "hash_mismatch", detail: "the index's hash and the checked-out files disagree" };
      return { dir, staging };
    } catch (err) {
      return { staging, error: "install_failed", detail: (err as Error).message };
    }
  }

  async function installEntry(source: RepositorySource, entry: IndexEntry, replace: boolean): Promise<PluginAnswer> {
    const got = await checkout(source, entry);
    try {
      if (!got.dir) return { ok: false, error: got.error ?? "install_failed", ...(got.detail ? { detail: got.detail } : {}) };
      return await o.plugins.installPrepared({
        dir: got.dir,
        source: source.url,
        repoId: source.id,
        official: source.official,
        commit: entry.commit,
        hash: entry.hash,
        replace,
      });
    } finally {
      if (got.staging) rmSync(got.staging, { recursive: true, force: true });
    }
  }

  async function install(sourceId: string, id: string): Promise<PluginAnswer> {
    const source = get(sourceId);
    if (!source) return { ok: false, error: "not_found" };
    let l = looked.get(sourceId)?.repo;
    if (!l || l.state !== "ready") l = await lookOne(source, true);
    const entry = l.entries.find((e) => e.id === id);
    if (!entry) return { ok: false, error: "not_found" };
    return installEntry(source, entry, false);
  }

  async function update(id: string): Promise<PluginAnswer> {
    const p = o.plugins.get(id);
    if (!p) return { ok: false, error: "not_found" };
    if (p.record.kind !== "repo" || !p.record.repoId) return { ok: false, error: "update_failed", detail: "not installed from a repository" };
    const source = get(p.record.repoId);
    if (!source) return { ok: false, error: "not_found" };
    const l = await lookOne(source, true);
    const entry = l.entries.find((e) => e.id === id);
    if (!entry) return { ok: false, error: "not_found", detail: "its repository doesn't list it any more" };
    if (entry.version === p.record.version && entry.hash === p.record.hash && entry.commit === p.record.commit) return { ok: true, upToDate: true };
    return installEntry(source, entry, true);
  }

  return {
    list: all,
    get,
    add,
    remove,
    look,
    snapshot: view,
    available: availableNow,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    install,
    update,
    sourceOf: (id) => (id ? get(id) : undefined),
  };
}
