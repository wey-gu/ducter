// research/248 phase 1 (D673): the theme runtime. A theme is a `ducter-plugin/2` manifest
// whose `theme.file` is one `ducter-theme/1` token file. It is installed pinned (a git commit or
// a folder's content hash), consented once, and applied by both clients from the one token file.
// Nothing runs, nothing is read from the person's files, nothing goes online.
//
// The active theme is shared on the home (`<dataDir>/theme-state.json`), so the web and the Mac
// agree; `pebble` is the shipped default and is never installed. Missing tokens fall back to
// Pebble's own value (the person's brief), so a half-written theme is still a whole look.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { contrast, contrastPairs, isColor, MODE_KEYS, MOTION_ENTER, MOTION_PRESS, PEBBLE_DEPTH, PEBBLE_MOTION, PEBBLE_SHAPE, PEBBLE_TOKENS, STATE_KEYS, THEME_FILE, THEME_FORMAT, type ThemeContrastPair, type ThemeDepth, type ThemeManifest, type ThemeModeTokens, type ThemeMotion, type ThemeShape, type ThemeTokens } from "@ducter/protocol/src/theme.ts";
import type { PluginManifestV2 } from "@ducter/protocol/src/plugins.ts";
import { contentHash, gitRunner, hostRangeOk, looksGit, splitRef, type CuratedEntry, type GitExec } from "../imports/plugins.ts";
import { INSTALLED_LEDGER, readInstalledLedger, writeInstalledKind, type InstalledRecord } from "./ledger.ts";
import { ManifestError, readManifest } from "./manifest.ts";
import type { ThemeRow, ThemesView } from "@ducter/protocol/src/themes.ts";

const ACTIVE_FILE = "theme-state.json";
const ACTIVE_FORMAT = "ducter-theme-state/1";

export interface ThemeEntry {
  record: InstalledRecord;
  manifest?: PluginManifestV2;
  theme?: ThemeManifest;
  /** broken (manifest or token file invalid), needs_newer (host range). */
  problem?: "broken" | "needs_newer" | "contrast";
  detail?: string;
  reviewed: boolean;
  /** The pairs under their floor, when the theme is installed but fails contrast. */
  contrastFailures?: ThemeContrastPair[];
}

export interface ThemeAnswer {
  ok: boolean;
  id?: string;
  name?: string;
  author?: string;
  version?: string;
  commit?: string;
  hash?: string;
  reviewed?: boolean;
  needsConsent?: boolean;
  error?: string;
  detail?: string;
}

export interface ThemeRuntime {
  list(): ThemeEntry[];
  get(id: string): ThemeEntry | undefined;
  install(input: string): Promise<ThemeAnswer>;
  /** A folder checked out of a repository index, at its pinned commit and hash. */
  installPrepared(input: PreparedThemeInstall): Promise<ThemeAnswer>;
  remove(id: string): { ok: boolean; deletedFolder: boolean; error?: string };
  consent(id: string): void;
  consented(id: string): boolean;
  activeId(): string;
  activate(id: string): void;
  /** The active theme's resolved tokens, or null for Pebble (the clients' own default). */
  activeTokens(): ThemeTokens | null;
  view(): ThemesView;
  setCurated(list: CuratedEntry[]): void;
  onChange(fn: () => void): () => void;
}

export interface PreparedThemeInstall {
  dir: string;
  source: string;
  repoId: string;
  official: boolean;
  commit: string;
  hash: string;
  replace?: boolean;
}

export interface ThemeOptions {
  dataDir: string;
  now?: () => number;
  git?: GitExec;
  hostVersion?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Reads the active theme id (default "pebble"). */
export function readActiveTheme(dataDir: string): string {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, ACTIVE_FILE), "utf8")) as unknown;
    if (isObj(raw) && raw.format === ACTIVE_FORMAT && typeof raw.active === "string") return raw.active;
  } catch {
    /* no file → pebble */
  }
  return "pebble";
}

function saveActiveTheme(dataDir: string, active: string): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, ACTIVE_FILE);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ format: ACTIVE_FORMAT, active }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Fills a mode with Pebble's values where a token is missing or not a colour. */
function resolveMode(raw: unknown, mode: "light" | "dark"): ThemeModeTokens {
  const o = isObj(raw) ? raw : {};
  const base = PEBBLE_TOKENS[mode];
  const out = { ...base } as ThemeModeTokens;
  for (const k of MODE_KEYS) {
    if (isColor(o[k])) (out as unknown as Record<string, string>)[k] = o[k] as string;
  }
  for (const s of STATE_KEYS) {
    const sv = isObj(o[s]) ? o[s] : {};
    const b = base[s];
    const merged = { ...b };
    if (isColor(sv.dot)) merged.dot = sv.dot as string;
    if (isColor(sv.surface)) merged.surface = sv.surface as string;
    if (isColor(sv.ink)) merged.ink = sv.ink as string;
    out[s] = merged;
  }
  return out;
}

/** Resolves a theme.json document: fills missing tokens from Pebble, keeps valid ones. */
export function resolveTheme(raw: unknown): ThemeManifest {
  if (!isObj(raw) || raw.format !== THEME_FORMAT) throw new ManifestError("bad_theme", `format must be ${THEME_FORMAT}`);
  const name = isObj(raw.name) ? raw.name : {};
  const en = typeof name.en === "string" ? name.en.trim() : "";
  if (!en) throw new ManifestError("bad_theme", "name.en is needed");
  const zh = typeof name.zh === "string" ? name.zh.trim() : "";
  if (!isObj(raw.tokens)) throw new ManifestError("bad_theme", "tokens has a light and a dark paper");

  let motion: ThemeMotion | undefined;
  if (raw.motion !== undefined) {
    if (!isObj(raw.motion)) throw new ManifestError("bad_theme", "motion must be an object");
    const p = (raw.motion as Record<string, unknown>).personality;
    if (p !== "bouncy" && p !== "snappy" && p !== "calm" && p !== "stepped") throw new ManifestError("bad_theme", "motion.personality is bouncy, snappy, calm or stepped");
    const press = (raw.motion as Record<string, unknown>).press;
    const enter = (raw.motion as Record<string, unknown>).enter;
    if (typeof press !== "number" || typeof enter !== "number") throw new ManifestError("bad_theme", "motion.press and motion.enter are milliseconds");
    if (press < MOTION_PRESS.min || press > MOTION_PRESS.max) throw new ManifestError("bad_theme", `motion.press stays within ${MOTION_PRESS.min}–${MOTION_PRESS.max} ms`);
    if (enter < MOTION_ENTER.min || enter > MOTION_ENTER.max) throw new ManifestError("bad_theme", `motion.enter stays within ${MOTION_ENTER.min}–${MOTION_ENTER.max} ms`);
    motion = { personality: p as ThemeMotion["personality"], press, enter };
  }

  let shape: ThemeShape | undefined;
  if (raw.shape !== undefined) {
    if (!isObj(raw.shape)) throw new ManifestError("bad_theme", "shape must be an object");
    const ks = ["radiusSm", "radiusMd", "radiusLg", "radiusXl", "pill"] as const;
    const out = {} as Record<string, number>;
    for (const k of ks) {
      const v = (raw.shape as Record<string, unknown>)[k];
      if (typeof v !== "number" || v <= 0 || v > 999) throw new ManifestError("bad_theme", `shape.${k} is a positive number`);
      out[k] = v;
    }
    shape = out as unknown as ThemeShape;
  }

  let depth: ThemeDepth | undefined;
  if (raw.depth !== undefined) {
    if (raw.depth !== "press" && raw.depth !== "offset" && raw.depth !== "hairline" && raw.depth !== "glow") throw new ManifestError("bad_theme", "depth is press, offset, hairline or glow");
    depth = raw.depth as ThemeDepth;
  }
  let density: "comfortable" | "compact" | undefined;
  if (raw.density !== undefined) {
    if (raw.density !== "comfortable" && raw.density !== "compact") throw new ManifestError("bad_theme", "density is comfortable or compact");
    density = raw.density;
  }

  const nm: { en: string; zh?: string } = { en };
  if (zh) nm.zh = zh;
  return {
    format: THEME_FORMAT,
    name: nm,
    tokens: { light: resolveMode((raw.tokens as Record<string, unknown>).light, "light"), dark: resolveMode((raw.tokens as Record<string, unknown>).dark, "dark") },
    ...(motion ? { motion } : {}),
    ...(shape ? { shape } : {}),
    ...(depth ? { depth } : {}),
    ...(density ? { density } : {}),
  };
}

/** The pairs under their floor, in both modes; empty when the theme passes. */
export function contrastFailures(tokens: ThemeTokens): ThemeContrastPair[] {
  const out: ThemeContrastPair[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const p of contrastPairs(tokens[mode])) {
      if (contrast(p.fg, p.bg) < p.min) out.push({ ...p, name: `${mode}: ${p.name}` });
    }
  }
  return out;
}

/** Reads and resolves a plugin's theme.json, returning the resolved document. */
export function readTheme(dir: string): ThemeManifest {
  const file = join(dir, THEME_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new ManifestError("bad_theme", `no readable ${THEME_FILE}`);
  }
  return resolveTheme(raw);
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true, mode: 0o700 });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".DS_Store") continue;
    const from = join(src, e.name);
    const to = join(dst, e.name);
    const st = lstatSync(from);
    if (st.isSymbolicLink()) throw new ManifestError("symlink", "a plugin may not contain a symlink");
    if (st.isDirectory()) copyTree(from, to);
    else if (st.isFile()) {
      copyFileSync(from, to);
      chmodSync(to, st.mode & 0o777);
    }
  }
}

export function createThemeRuntime(o: ThemeOptions): ThemeRuntime {
  const now = o.now ?? Date.now;
  const git = o.git ?? gitRunner();
  const hostVersion = o.hostVersion ?? DUCTER_VERSION;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* a listener never stops an install */
      }
    }
  };
  let curatedList: CuratedEntry[] = [];

  const themeRecords = () => {
    const all = readInstalledLedger(o.dataDir);
    const out: Record<string, InstalledRecord> = {};
    for (const [id, r] of Object.entries(all)) if (r.pluginKind === "theme") out[id] = r;
    return out;
  };

  const curatedFor = (id: string) => curatedList.find((c) => c.id === id);

  const entryOf = (record: InstalledRecord): ThemeEntry => {
    let manifest: PluginManifestV2 | undefined;
    let theme: ThemeManifest | undefined;
    let problem: ThemeEntry["problem"];
    let detail: string | undefined;
    try {
      const r = readManifest(record.dir);
      if (!r.v2 || r.v2.kind !== "theme") throw new ManifestError("bad_manifest", "a theme plugin is kind theme");
      manifest = r.v2;
      if (!hostRangeOk(manifest.ducter, hostVersion)) {
        problem = "needs_newer";
        detail = manifest.ducter;
      }
      theme = readTheme(record.dir);
    } catch (e) {
      problem = "broken";
      detail = (e as Error).message;
    }
    const c = curatedFor(record.id);
    const reviewed =
      !!c &&
      (!c.version || c.version === record.version) &&
      (!c.commit || !record.commit || c.commit === record.commit) &&
      (c.hash ? c.hash === record.hash : true);
    const failures = theme && !problem ? contrastFailures(theme.tokens) : [];
    return {
      record,
      ...(manifest ? { manifest } : {}),
      ...(theme ? { theme } : {}),
      ...(problem ? { problem } : {}),
      ...(detail ? { detail } : {}),
      ...(failures.length ? { contrastFailures: failures } : {}),
      reviewed,
    };
  };

  const list = () => Object.values(themeRecords()).map(entryOf).sort((a, b) => a.record.id.localeCompare(b.record.id));
  const get = (id: string) => {
    const r = themeRecords()[id];
    return r ? entryOf(r) : undefined;
  };

  const save = (records: Record<string, InstalledRecord>) => writeInstalledKind(o.dataDir, "theme", records);

  async function cloneAt(url: string, ref: string | undefined, dest: string): Promise<{ commit: string }> {
    const r = await git(["clone", "--quiet", url, dest]);
    if (r.code !== 0) throw new ManifestError("git_failed", r.stderr.trim() || "git clone failed");
    if (ref) {
      const co = await git(["checkout", "--quiet", "--detach", ref], { cwd: dest });
      if (co.code !== 0) throw new ManifestError("git_failed", co.stderr.trim() || `git checkout ${ref} failed`);
    }
    const head = await git(["rev-parse", "HEAD"], { cwd: dest });
    if (head.code !== 0 || !head.stdout.trim()) throw new ManifestError("git_failed", head.stderr.trim() || "git rev-parse failed");
    return { commit: head.stdout.trim() };
  }

  function idCollision(id: string): boolean {
    const all = readInstalledLedger(o.dataDir);
    return id in all;
  }

  function recordFor(dir: string, manifest: PluginManifestV2, extra: Partial<InstalledRecord>): InstalledRecord {
    return {
      id: manifest.id,
      pluginKind: "theme",
      dir,
      hash: contentHash(dir),
      version: manifest.version,
      installedAt: new Date(now()).toISOString(),
      themeName: manifest.name,
      author: manifest.author.name,
      ...extra,
    };
  }

  async function install(input: string): Promise<ThemeAnswer> {
    const raw = input.trim();
    if (!raw) return { ok: false, error: "not_found" };
    const local = !looksGit(raw) && existsSync(resolve(raw));
    const { url, ref } = looksGit(raw) ? splitRef(raw) : { url: raw, ref: undefined };
    if (ref?.startsWith("-")) return { ok: false, error: "bad_ref" };
    let staging: string | undefined;
    try {
      let manifest: PluginManifestV2;
      let dir: string;
      let kind: "git" | "folder";
      let commit: string | undefined;
      if (local) {
        kind = "folder";
        dir = resolve(url);
        if (!statSync(dir).isDirectory()) throw new ManifestError("not_found", "not a folder");
        const r = readManifest(dir);
        if (!r.v2 || r.v2.kind !== "theme") throw new ManifestError("bad_manifest", "only a theme plugin installs here");
        manifest = r.v2;
        if (idCollision(manifest.id)) throw new ManifestError("already_installed", "already installed");
        readTheme(dir);
        if (contrastFailures(readTheme(dir).tokens).length) throw new ManifestError("contrast", "the theme fails contrast");
      } else if (looksGit(raw)) {
        kind = "git";
        mkdirSync(o.dataDir, { recursive: true, mode: 0o700 });
        staging = mkdtempSync(join(o.dataDir, "theme-clone-"));
        const cloned = await cloneAt(url, ref, staging);
        commit = cloned.commit;
        const r = readManifest(staging);
        if (!r.v2 || r.v2.kind !== "theme") throw new ManifestError("bad_manifest", "only a theme plugin installs here");
        manifest = r.v2;
        if (idCollision(manifest.id)) throw new ManifestError("already_installed", "already installed");
        if (contrastFailures(readTheme(staging).tokens).length) throw new ManifestError("contrast", "the theme fails contrast");
        dir = join(o.dataDir, "plugins", manifest.id);
        mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
        copyTree(staging, dir);
      } else {
        return { ok: false, error: "not_found" };
      }
      const record = recordFor(dir, manifest, { kind, ...(kind === "git" ? { source: url, ...(ref ? { ref } : {}), commit } : {}) });
      const records = themeRecords();
      records[record.id] = record;
      save(records);
      changed();
      const e = entryOf(record);
      return { ok: true, id: record.id, name: manifest.name.en, author: manifest.author.name, version: record.version, commit: record.commit, hash: record.hash, reviewed: e.reviewed, needsConsent: true };
    } catch (err) {
      const p = err as ManifestError;
      return { ok: false, error: p.code || "failed", detail: p.message };
    } finally {
      if (staging) rmSync(staging, { recursive: true, force: true });
    }
  }

  async function installPrepared(input: PreparedThemeInstall): Promise<ThemeAnswer> {
    let manifest: PluginManifestV2;
    try {
      const r = readManifest(input.dir);
      if (!r.v2 || r.v2.kind !== "theme") throw new ManifestError("bad_manifest", "only a theme plugin installs here");
      manifest = r.v2;
      if (contentHash(input.dir) !== input.hash) throw new ManifestError("hash_mismatch", "the index's hash and the checked-out files disagree");
      if (contrastFailures(readTheme(input.dir).tokens).length) throw new ManifestError("contrast", "the theme fails contrast");
    } catch (err) {
      return { ok: false, error: (err as ManifestError).code || "bad_manifest", detail: (err as Error).message };
    }
    const existing = themeRecords()[manifest.id];
    if (existing && !input.replace) return { ok: false, error: "already_installed" };
    const dir = join(o.dataDir, "plugins", manifest.id);
    try {
      mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      copyTree(input.dir, dir);
    } catch (err) {
      return { ok: false, error: "install_failed", detail: (err as Error).message };
    }
    const record = recordFor(dir, manifest, { kind: "repo", source: input.source, repoId: input.repoId, official: input.official, commit: input.commit, ...(existing?.consented ? { consented: true, consentedAt: existing.consentedAt } : {}) });
    const records = themeRecords();
    records[record.id] = record;
    save(records);
    changed();
    const e = entryOf(record);
    return { ok: true, id: record.id, name: manifest.name.en, author: manifest.author.name, version: record.version, commit: record.commit, hash: record.hash, reviewed: e.reviewed, needsConsent: !existing?.consented };
  }

  function remove(id: string): { ok: boolean; deletedFolder: boolean; error?: string } {
    const records = themeRecords();
    const record = records[id];
    if (!record) return { ok: false, deletedFolder: false, error: "not_found" };
    let deletedFolder = false;
    if ((record.kind === "git" || record.kind === "repo") && record.dir.startsWith(join(o.dataDir, "plugins") + "/")) {
      try {
        rmSync(record.dir, { recursive: true, force: true });
        deletedFolder = true;
      } catch {
        return { ok: false, deletedFolder: false, error: "remove_failed" };
      }
    }
    delete records[id];
    save(records);
    if (readActiveTheme(o.dataDir) === id) saveActiveTheme(o.dataDir, "pebble");
    changed();
    return { ok: true, deletedFolder };
  }

  return {
    list,
    get,
    install,
    installPrepared,
    remove,
    consent(id) {
      const records = themeRecords();
      const record = records[id];
      if (!record) return;
      record.consented = true;
      record.consentedAt = new Date(now()).toISOString();
      save(records);
      changed();
    },
    consented(id) {
      return !!themeRecords()[id]?.consented;
    },
    activeId() {
      return readActiveTheme(o.dataDir);
    },
    activate(id) {
      saveActiveTheme(o.dataDir, id);
      changed();
    },
    activeTokens() {
      const id = readActiveTheme(o.dataDir);
      if (id === "pebble") return null;
      const e = get(id);
      return e?.theme?.tokens ?? null;
    },
    view(): ThemesView {
      const active = readActiveTheme(o.dataDir);
      const themes: ThemeRow[] = list().map((e) => ({
        id: e.record.id,
        name: e.manifest?.name ?? e.record.themeName ?? { en: e.record.id },
        ...(e.record.author ? { author: e.record.author } : {}),
        version: e.record.version,
        consented: !!e.record.consented,
        active: e.record.id === active,
        reviewed: e.reviewed,
        unreviewed: !e.reviewed,
        ...(e.problem ? { problem: e.problem } : {}),
        ...(e.detail ? { detail: e.detail } : {}),
        ...(e.theme ? { theme: e.theme } : {}),
      }));
      return { active, themes };
    },
    setCurated(list) {
      curatedList = list.map((c) => ({ ...c }));
      changed();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The ledger file the theme runtime shares with the importer (the one installed ledger). */
export { INSTALLED_LEDGER, readInstalledLedger };
