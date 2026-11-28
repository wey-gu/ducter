// D668/D670 (research/246 §3.5, §3.6, §3.9): the plugin a person can add to 导入 / Import.
//
// A plugin is a folder with `ducter-plugin.json`: a reader that prints `ducter-import/1`. It is
// installed at a pinned commit (git/repository) or at the content it had (a folder for authors),
// and the content hash is checked again before every run. Nothing is executed at install or update
// time: the manifest is read, the files are copied, and the reader only ever runs inside the
// sandbox (sandbox.ts). Ducter's official plugin repository is the reviewed list now: a version
// listed there at its pinned commit and content hash is **Ducter 查过这个版本 / Ducter checked this
// version**; anything else is **没有人替你检查过 / Nobody has checked it for you**.
//
// The Log is never touched here: `run` returns a stream, and the import service (service.ts) is
// the only writer. A plugin can't claim to be Lody, the person or a task: the host stamps its
// source record with this manifest's app and id before validating (D651's rule).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { DUCTER_VERSION, compareVersions, isVersion } from "@ducter/protocol/src/version.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { iconPathOk } from "./icon.ts";
import { pluginArgv, pluginTempDir, removePluginTempDir, resolveUse, runSandboxed, sandboxAvailable, type PluginUseRun, type SandboxResult } from "./sandbox.ts";
import { readInstalledLedger, writeInstalledKind, type InstalledRecord } from "../plugins/ledger.ts";

export const PLUGIN_FORMAT = "ducter-plugin/1";
export const PLUGIN_KIND = "importer";
export const PLUGIN_FILE = "ducter-plugin.json";
export const PLUGINS_LEDGER = "import-plugins.json";
/** The one repository Ducter itself reviews: its index is the curated list (D670). */
export const OFFICIAL_SOURCE_ID = "official";
export const OFFICIAL_PLUGINS_URL = "https://github.com/wey-gu/ducter-plugins";
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
/** What one plugin may declare; keeps a card readable and a profile small. */
const READS_MAX = 64;
const RUN_MAX = 16;
const USES_MAX = 8;

export interface PluginName {
  en: string;
  zh?: string;
}

export interface PluginAuthor {
  name: string;
  url?: string;
}

/**
 * A command the reader itself starts. `online` is the one way a reader may reach the network
 * through a command the person already has (`lody`), and only for this plugin's run (D670).
 */
export interface PluginUse {
  command: string;
  online: boolean;
  why: PluginName;
}

export interface PluginManifest {
  format: typeof PLUGIN_FORMAT;
  id: string;
  kind: typeof PLUGIN_KIND;
  version: string;
  name: PluginName;
  app: { name: string; icon?: string };
  author: PluginAuthor;
  emits: "ducter-import/1";
  run: string[];
  reads: string[];
  starts: string[];
  uses: PluginUse[];
  /** True when a use is online: the run gets outbound network for that reason alone. */
  online: boolean;
  /** Kept for older manifests (`network: false`); true only when a use is online. */
  network: boolean;
  detect: string[];
  ducter: string;
}

export interface CuratedEntry {
  id: string;
  repo: string;
  /** The commit Ducter checked. A different commit is "nobody has checked it". */
  commit?: string;
  /** A git-less install (a folder) is checked by content hash instead. */
  hash?: string;
  version?: string;
  app?: string;
}

export interface PluginRecord {
  id: string;
  /** git: a URL; folder: the author's folder loaded in place; repo: a copy from a repository index. */
  kind: "git" | "folder" | "repo";
  dir: string;
  /** The git URL (or repository folder) it came from, without the `#ref`. */
  source?: string;
  ref?: string;
  commit?: string;
  hash: string;
  version: string;
  app: string;
  name?: string;
  author?: string;
  installedAt: string;
  /** D670: the repository source it was installed from, and whether that is Ducter's own. */
  repoId?: string;
  official?: boolean;
  /** The declaration this version was installed with, so a widening is measured against it. */
  reads?: string[];
  run?: string[];
  starts?: string[];
  uses?: PluginUse[];
  online?: boolean;
  /** What the person said yes to, exactly as the manifest wrote it. */
  consent?: { reads: string[]; online?: boolean; at: string };
  checkedAt?: string;
  latest?: { commit?: string; hash?: string; version?: string };
}

export interface PluginEntry {
  record: PluginRecord;
  manifest?: PluginManifest;
  /** broken (manifest invalid), needs_newer (host range), hash_mismatch (set at run time). */
  problem?: "broken" | "needs_newer" | "hash_mismatch";
  detail?: string;
  curated?: CuratedEntry;
  reviewed: boolean;
  update?: { commit?: string; hash?: string; version?: string };
}

export interface PluginAnswer {
  ok: boolean;
  id?: string;
  app?: string;
  name?: string;
  author?: string;
  source?: string;
  version?: string;
  commit?: string;
  hash?: string;
  reads?: string[];
  uses?: PluginUse[];
  online?: boolean;
  reviewed?: boolean;
  unreviewed?: boolean;
  /** An unreviewed online reader also owes the second, explicit line on its consent card. */
  needsOnlineConsent?: boolean;
  needsConsent?: boolean;
  widened?: boolean;
  upToDate?: boolean;
  error?: string;
  detail?: string;
}

/**
 * A plugin already checked out of one repository at a pinned commit. repos.ts clones the source,
 * verifies the index's content hash, and hands the folder here; this copies it to
 * `<dataDir>/plugins/<id>` like a git install (D670).
 */
export interface PreparedInstall {
  /** The plugin folder, already at the pinned commit and hash-checked. */
  dir: string;
  /** The repository URL or folder. */
  source: string;
  repoId: string;
  official: boolean;
  commit: string;
  hash: string;
  /** Replace an installed version (an update) instead of refusing. */
  replace?: boolean;
}

export interface PluginRunResult {
  stream: string;
  code: number;
  error?: "sandbox_unavailable" | "plugin_failed" | "needs_newer" | "hash_mismatch" | "broken" | "not_found";
  detail?: string;
  /** What the reader said on stderr (diagnostics, never the stream), cut to 2,000 characters. */
  stderr?: string;
}

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

/** Runs `git` with these arguments. Injected in tests; the default is the person's PATH. */
export type GitExec = (args: string[], o?: { cwd?: string }) => Promise<GitResult>;

export function gitRunner(bin = "git"): GitExec {
  return (args, o = {}) =>
    new Promise((res) => {
      execFile(bin, args, { cwd: o.cwd, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        res({
          code: e ? (typeof e.code === "number" ? e.code : e.killed ? -2 : -1) : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          ...(e && typeof e.code === "string" ? { spawnError: e.code } : {}),
        });
      });
    });
}

export interface PluginOptions {
  dataDir: string;
  now?: () => number;
  git?: GitExec;
  /** The sandbox runner, injected in tests. Default: the real Seatbelt/bwrap runner. */
  sandbox?: (run: import("./sandbox.ts").PluginRun) => Promise<SandboxResult>;
  /** Ducter's curated list; default the file shipped beside this module. */
  curated?: CuratedEntry[];
  hostVersion?: string;
  bunPath?: string;
  home?: string;
  platform?: NodeJS.Platform;
  path?: string;
  /** Extra environment for a run (tests and demos: a probe's port, a fake's switch). */
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface PluginRuntime {
  list(): PluginEntry[];
  get(id: string): PluginEntry | undefined;
  curated(): CuratedEntry[];
  install(input: string): Promise<PluginAnswer>;
  /** D670: a folder checked out of a repository index, at its pinned commit and hash. */
  installPrepared(input: PreparedInstall): Promise<PluginAnswer>;
  update(id: string): Promise<PluginAnswer>;
  remove(id: string): { ok: boolean; deletedFolder: boolean; error?: string };
  consent(id: string, reads: string[], online?: boolean): void;
  consented(id: string, reads: string[], online?: boolean): boolean;
  run(id: string): Promise<PluginRunResult>;
  check(force?: boolean): Promise<void>;
  /** The source index says a newer version is out. */
  setLatest(id: string, latest: PluginRecord["latest"]): void;
  /** The official index is the reviewed list. */
  setCurated(list: CuratedEntry[]): void;
  onChange(fn: () => void): () => void;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string" && !!x.trim()) ? v.map((x) => x.trim()) : undefined);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const covers = (said: string[], now: string[]) => now.every((x) => said.includes(x));

/** The host's caret/`>=`/exact range, checked against this build. */
export function hostRangeOk(range: string, version = DUCTER_VERSION): boolean {
  const r = range.trim();
  if (!r) return false;
  if (r === "*") return true;
  if (r.startsWith("^")) {
    const base = partial(r.slice(1));
    if (!base) return false;
    const [vmaj, vmin] = version.split("-")[0]!.split(".").map(Number);
    if (vmaj === undefined || !Number.isFinite(vmaj)) return false;
    if (base.major > 0) return vmaj === base.major && compareVersions(version, base.text) >= 0;
    return vmaj === 0 && vmin === base.minor && compareVersions(version, base.text) >= 0;
  }
  if (r.startsWith(">=")) {
    const base = partial(r.slice(2));
    return !!base && compareVersions(version, base.text) >= 0;
  }
  return isVersion(r) && compareVersions(version, r) === 0;
}


/** `0.1` and `0.1.2` both mean a version; a caret on a partial keeps its own last part fixed. */
function partial(s: string): { major: number; minor: number; text: string } | undefined {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(s.trim());
  if (!m) return undefined;
  const major = Number(m[1]);
  const minor = m[2] === undefined ? 0 : Number(m[2]);
  const patch = m[3] === undefined ? 0 : Number(m[3]);
  return { major, minor, text: `${major}.${minor}.${patch}` };
}

/** Checks one `ducter-plugin.json` and returns only the fields Ducter keeps. */
export function parseManifest(raw: unknown): PluginManifest {
  if (!isObj(raw)) throw new PluginError("bad_manifest", "the manifest must be a JSON object");
  if (raw.format !== PLUGIN_FORMAT) throw new PluginError("bad_manifest", `format must be ${PLUGIN_FORMAT}`);
  if (raw.kind !== PLUGIN_KIND) throw new PluginError("bad_manifest", "only an importer plugin is read now");
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!ID_RE.test(id)) throw new PluginError("bad_manifest", "id must be lower-case letters, digits and -");
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  if (!isVersion(version)) throw new PluginError("bad_manifest", "version must be a version");
  const name = isObj(raw.name) ? raw.name : {};
  const en = typeof name.en === "string" ? name.en.trim() : "";
  if (!en) throw new PluginError("bad_manifest", "name.en is needed");
  const zh = typeof name.zh === "string" ? name.zh.trim() : "";
  const app = isObj(raw.app) ? raw.app : {};
  const appName = typeof app.name === "string" ? app.name.trim() : "";
  if (!appName) throw new PluginError("bad_manifest", "app.name is the app whose conversations it reads");
  const appIcon = typeof app.icon === "string" ? app.icon.trim() : "";
  if (appIcon && !iconPathOk(appIcon)) throw new PluginError("bad_manifest", "app.icon must be a PNG or SVG inside the plugin");
  const author = isObj(raw.author) ? raw.author : {};
  const authorName = typeof author.name === "string" ? author.name.trim() : "";
  if (!authorName) throw new PluginError("bad_manifest", "author.name says who made it");
  const authorUrl = typeof author.url === "string" ? author.url.trim() : "";
  if (raw.emits !== "ducter-import/1") throw new PluginError("bad_manifest", "emits must be ducter-import/1");
  const run = strings(raw.run);
  if (!run?.length || run.length > RUN_MAX) throw new PluginError("bad_manifest", "run names how to start the reader");
  const reads = strings(raw.reads);
  if (!reads?.length || reads.length > READS_MAX) throw new PluginError("bad_manifest", "reads names at least one literal path");
  for (const r of reads) {
    if (r.split(/[\\/]/).includes("..")) throw new PluginError("bad_manifest", "reads cannot contain ..");
  }
  const starts = raw.starts === undefined ? [] : strings(raw.starts);
  if (!starts) throw new PluginError("bad_manifest", "starts is a list of programs");
  // D670: `uses` is the one way a reader starts a command the person already has, and the
  // only way it may go online. `why` is shown literally on the consent card.
  if (raw.uses !== undefined && !Array.isArray(raw.uses)) throw new PluginError("bad_manifest", "uses must be a list");
  const uses: PluginUse[] = [];
  for (const u of Array.isArray(raw.uses) ? raw.uses : []) {
    if (!isObj(u)) throw new PluginError("bad_manifest", "a use must be an object");
    const command = typeof u.command === "string" ? u.command.trim() : "";
    if (!command || command.length > 200 || /[\0\n\r]/.test(command)) throw new PluginError("bad_manifest", "a use names a command");
    if (u.online !== undefined && typeof u.online !== "boolean") throw new PluginError("bad_manifest", "online must be true or false");
    const why = isObj(u.why) ? u.why : {};
    const whyEn = typeof why.en === "string" ? why.en.trim() : "";
    const whyZh = typeof why.zh === "string" ? why.zh.trim() : "";
    if (!whyEn) throw new PluginError("bad_manifest", "a use says why, in words");
    uses.push({ command, online: u.online === true, why: { en: whyEn, ...(whyZh ? { zh: whyZh } : {}) } });
    if (uses.length > USES_MAX) throw new PluginError("bad_manifest", "too many uses");
  }
  const online = uses.some((u) => u.online);
  if (raw.network !== undefined && raw.network !== false && !online) throw new PluginError("bad_manifest", "network must be declared by an online use");
  const detect = raw.detect === undefined ? [] : strings(raw.detect);
  if (!detect) throw new PluginError("bad_manifest", "detect is a list of paths");
  const ducter = typeof raw.ducter === "string" ? raw.ducter.trim() : "";
  if (!ducter) throw new PluginError("bad_manifest", "ducter is the Ducter range it needs");
  return {
    format: PLUGIN_FORMAT,
    id,
    kind: PLUGIN_KIND,
    version,
    name: { en, ...(zh.length > 0 ? { zh } : {}) }, // the manifest's own Chinese name, when it gives one
    app: { name: appName, ...(typeof app.icon === "string" && app.icon.trim() ? { icon: app.icon.trim() } : {}) },
    author: { name: authorName, ...(authorUrl ? { url: authorUrl } : {}) },
    emits: "ducter-import/1",
    run,
    reads,
    starts,
    uses,
    online,
    network: online,
    detect,
    ducter,
  };
}

export class PluginError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Reads and checks a manifest in one folder. */
export function readManifest(dir: string): PluginManifest {
  const file = join(dir, PLUGIN_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new PluginError("bad_manifest", `no readable ${PLUGIN_FILE}`);
  }
  return parseManifest(raw);
}

function walkFiles(dir: string, base = dir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".DS_Store") continue;
    const p = join(dir, e.name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) throw new PluginError("symlink", "a plugin may not contain a symlink");
    if (st.isDirectory()) walkFiles(p, base, out);
    else if (st.isFile()) out.push(relative(base, p));
  }
  return out;
}

/** The content hash a plugin is pinned to: every file's path and bytes, sorted. */
export function contentHash(dir: string): string {
  const files = walkFiles(dir).sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f.split(/[\\/]/).join("/"));
    h.update("\0");
    h.update(readFileSync(join(dir, f)));
    h.update("\0");
  }
  return h.digest("hex");
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true, mode: 0o700 });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".DS_Store") continue;
    const from = join(src, e.name);
    const to = join(dst, e.name);
    const st = lstatSync(from);
    if (st.isSymbolicLink()) throw new PluginError("symlink", "a plugin may not contain a symlink");
    if (st.isDirectory()) copyTree(from, to);
    else if (st.isFile()) {
      copyFileSync(from, to);
      chmodSync(to, st.mode & 0o777);
    }
  }
}

function loadLedger(dataDir: string): Record<string, PluginRecord> {
  // One installed ledger (D673): importers and themes share `plugins.json`; the old
  // importer file is migrated in once by readInstalledLedger and left in place.
  const out: Record<string, PluginRecord> = {};
  for (const [id, r] of Object.entries(readInstalledLedger(dataDir))) {
    if (r.pluginKind === "theme") continue;
    // `ducter move` carries <dataDir>/plugins: an install's recorded path follows the folder.
    if ((r.kind === "git" || r.kind === "repo") && !existsSync(r.dir)) {
      const moved = join(dataDir, "plugins", id);
      if (existsSync(moved)) r.dir = moved;
    }
    out[id] = r as unknown as PluginRecord;
  }
  return out;
}

function saveLedger(dataDir: string, plugins: Record<string, PluginRecord>): void {
  writeInstalledKind(dataDir, "importer", plugins as unknown as Record<string, InstalledRecord>);
}

/**
 * The reviewed list used to be shipped as `plugins.json`; D670 replaces it with the official
 * repository's index, loaded by repos.ts. A test or a demo may still pass one explicitly.
 */
export function curatedEntries(): CuratedEntry[] {
  return [];
}

/** `https://host/repo#ref` → the URL and the ref; a local path is not split. */
export function splitRef(input: string): { url: string; ref?: string } {
  const at = input.lastIndexOf("#");
  if (at < 0) return { url: input };
  const url = input.slice(0, at);
  const ref = input.slice(at + 1).trim();
  return { url, ...(ref ? { ref } : {}) };
}

const looksGit = (s: string) => /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/.test(s);

export function createPluginRuntime(o: PluginOptions): PluginRuntime {
  const now = o.now ?? Date.now;
  const git = o.git ?? gitRunner(whichNow("git") ?? "git");
  const hostVersion = o.hostVersion ?? DUCTER_VERSION;
  const home = o.home ?? process.env.HOME ?? "";
  const timeoutMs = o.timeoutMs ?? 5 * 60_000;
  const day = 3_600_000;
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
  let plugins = loadLedger(o.dataDir);
  /** The CLI may add or remove a reader while this home runs: every public read sees the file. */
  const reload = () => {
    plugins = loadLedger(o.dataDir);
  };

  // D670: the official repository's index is the reviewed list. It is loaded when the
  // repositories are looked at, and cached on disk so an offline start still says what was checked.
  let curatedList: CuratedEntry[] = [...(o.curated ?? [])];
  const curatedFor = (id: string) => curatedList.find((c) => c.id === id);

  const entryOf = (record: PluginRecord): PluginEntry => {
    let manifest: PluginManifest | undefined;
    let problem: PluginEntry["problem"];
    let detail: string | undefined;
    try {
      manifest = readManifest(record.dir);
      if (!hostRangeOk(manifest.ducter, hostVersion)) {
        problem = "needs_newer";
        detail = manifest.ducter;
      }
    } catch (e) {
      problem = "broken";
      detail = (e as Error).message;
    }
    const c = curatedFor(record.id);
    // The official index lists id, version, commit and content hash. A year of work is reviewed
    // only when the exact version and bytes are on it; a folder install has no commit, so its hash
    // is the proof. An older explicit test entry without a hash still matches by commit.
    const reviewed =
      !!c &&
      (!c.version || c.version === record.version) &&
      (!c.commit || !record.commit || c.commit === record.commit) &&
      (c.hash
        ? c.hash === record.hash
        : !!c.commit && record.kind === "git" && c.commit === record.commit);
    const latest = record.latest;
    const update =
      latest && ((latest.commit && latest.commit !== record.commit) || (latest.hash && latest.hash !== record.hash) || (latest.version && latest.version !== record.version))
        ? latest
        : undefined;
    return {
      record,
      ...(manifest ? { manifest } : {}),
      ...(problem ? { problem } : {}),
      ...(detail ? { detail } : {}),
      ...(c ? { curated: c } : {}),
      reviewed,
      ...(update ? { update } : {}),
    };
  };

  const list = () => {
    reload();
    return Object.values(plugins).map(entryOf).sort((a, b) => a.record.id.localeCompare(b.record.id));
  };
  const get = (id: string) => {
    reload();
    return plugins[id] ? entryOf(plugins[id]!) : undefined;
  };

  const answer = (e: PluginEntry, extra: Partial<PluginAnswer> = {}): PluginAnswer => ({
    ok: true,
    id: e.record.id,
    app: e.manifest?.app.name ?? e.record.app,
    name: e.manifest?.name.en ?? e.record.name,
    author: e.manifest?.author.name ?? e.record.author,
    ...(e.record.source ? { source: e.record.source } : {}),
    version: e.record.version,
    ...(e.record.commit ? { commit: e.record.commit } : {}),
    hash: e.record.hash,
    reads: e.manifest?.reads ?? e.record.consent?.reads ?? [],
    uses: e.manifest?.uses ?? [],
    online: e.manifest?.online ?? e.record.online === true,
    reviewed: e.reviewed,
    unreviewed: !e.reviewed,
    ...(e.manifest?.online && !e.reviewed ? { needsOnlineConsent: true } : {}),
    ...extra,
  });

  const save = () => saveLedger(o.dataDir, plugins);

  function checkApp(m: PluginManifest): void {
    const app = m.app.name.toLowerCase();
    for (const r of Object.values(plugins)) {
      if (r.id !== m.id && (r.app.toLowerCase() === app || r.name?.toLowerCase() === m.name.en.toLowerCase())) {
        throw new PluginError("app_taken", `${m.app.name} is already an import source`);
      }
    }
  }

  function installRecord(record: PluginRecord): PluginEntry {
    plugins[record.id] = record;
    save();
    changed();
    return entryOf(record);
  }

  async function cloneAt(url: string, ref: string | undefined, dest: string): Promise<{ commit: string }> {
    const r = await git(["clone", "--quiet", url, dest]);
    if (r.code !== 0) throw new PluginError("git_failed", r.stderr.trim() || "git clone failed");
    if (ref) {
      const co = await git(["checkout", "--quiet", "--detach", ref], { cwd: dest });
      if (co.code !== 0) throw new PluginError("git_failed", co.stderr.trim() || `git checkout ${ref} failed`);
    }
    const head = await git(["rev-parse", "HEAD"], { cwd: dest });
    if (head.code !== 0 || !head.stdout.trim()) throw new PluginError("git_failed", head.stderr.trim() || "git rev-parse failed");
    return { commit: head.stdout.trim() };
  }

  async function install(input: string): Promise<PluginAnswer> {
    reload();
    const raw = input.trim();
    if (!raw) return { ok: false, error: "not_found" };
    const local = !looksGit(raw) && existsSync(resolve(raw));
    const { url, ref } = looksGit(raw) ? splitRef(raw) : { url: raw, ref: undefined };
    if (ref?.startsWith("-")) return { ok: false, error: "bad_ref" };
    let staging: string | undefined;
    try {
      let manifest: PluginManifest;
      let kind: "git" | "folder";
      let dir: string;
      let commit: string | undefined;
      let hash: string;
      if (local) {
        kind = "folder";
        dir = resolve(url);
        if (!statSync(dir).isDirectory()) throw new PluginError("not_found", "not a folder");
        manifest = readManifest(dir);
        hash = contentHash(dir);
        const head = await git(["rev-parse", "HEAD"], { cwd: dir }).catch(() => undefined);
        if (head?.code === 0 && head.stdout.trim()) commit = head.stdout.trim();
      } else if (looksGit(raw)) {
        kind = "git";
        mkdirSync(o.dataDir, { recursive: true, mode: 0o700 });
        staging = mkdtempSync(join(o.dataDir, "plugin-clone-"));
        const cloned = await cloneAt(url, ref, staging);
        commit = cloned.commit;
        manifest = readManifest(staging);
        hash = contentHash(staging);
        if (plugins[manifest.id]) throw new PluginError("already_installed", "already installed");
        checkApp(manifest);
        dir = join(o.dataDir, "plugins", manifest.id);
        mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
        copyTree(staging, dir);
      } else {
        return { ok: false, error: "not_found" };
      }
      if (local) {
        if (plugins[manifest.id]) throw new PluginError("already_installed", "already installed");
        checkApp(manifest);
      }
      const record: PluginRecord = {
        id: manifest.id,
        kind,
        dir,
        ...(kind === "git" ? { source: url, ...(ref ? { ref } : {}), commit } : {}),
        hash,
        version: manifest.version,
        app: manifest.app.name,
        name: manifest.name.en,
        author: manifest.author.name,
        installedAt: new Date(now()).toISOString(),
        reads: [...manifest.reads],
        run: [...manifest.run],
        starts: [...manifest.starts],
        uses: manifest.uses.map((u) => ({ ...u, why: { ...u.why } })),
        online: manifest.online,
      };
      const e = installRecord(record);
      return answer(e, { needsConsent: true });
    } catch (err) {
      const p = err as PluginError;
      return { ok: false, error: p.code || "failed", detail: p.message };
    } finally {
      if (staging) rmSync(staging, { recursive: true, force: true });
    }
  }

  /** Whether a newer manifest asks the person again (a wider read list, a new command, network). */
  function widenedFor(record: PluginRecord | undefined, m: PluginManifest): boolean {
    if (!record) return true;
    const said = record.consent?.reads ?? [];
    if (!covers(said, m.reads)) return true;
    if (!same(record.run ?? [], m.run) || !same(record.starts ?? [], m.starts)) return true;
    if (JSON.stringify(record.uses ?? []) !== JSON.stringify(m.uses)) return true;
    if (m.online && record.consent?.online !== true) return true;
    return false;
  }

  async function installPrepared(input: PreparedInstall): Promise<PluginAnswer> {
    reload();
    let manifest: PluginManifest;
    let hash: string;
    try {
      manifest = readManifest(input.dir);
      hash = contentHash(input.dir);
    } catch (err) {
      return { ok: false, error: (err as PluginError).code || "bad_manifest", detail: (err as Error).message };
    }
    if (hash !== input.hash) return { ok: false, error: "hash_mismatch", detail: "the index's hash and the checked-out files disagree" };
    const existing = plugins[manifest.id];
    if (existing && !input.replace) return { ok: false, error: "already_installed" };
    try {
      checkApp(manifest);
    } catch (err) {
      return { ok: false, error: (err as PluginError).code || "app_taken", detail: (err as Error).message };
    }
    const widened = !!existing && widenedFor(existing, manifest);
    const needsConsent = !existing || widened;
    const dir = join(o.dataDir, "plugins", manifest.id);
    try {
      mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      copyTree(input.dir, dir);
    } catch (err) {
      return { ok: false, error: "install_failed", detail: (err as Error).message };
    }
    const record: PluginRecord = {
      id: manifest.id,
      kind: "repo",
      dir,
      source: input.source,
      repoId: input.repoId,
      official: input.official,
      commit: input.commit,
      hash,
      version: manifest.version,
      app: manifest.app.name,
      name: manifest.name.en,
      author: manifest.author.name,
      installedAt: existing?.installedAt ?? new Date(now()).toISOString(),
      reads: [...manifest.reads],
      run: [...manifest.run],
      starts: [...manifest.starts],
      uses: manifest.uses.map((u) => ({ ...u, why: { ...u.why } })),
      online: manifest.online,
      ...(existing?.consent && !widened ? { consent: existing.consent } : {}),
    };
    const e = installRecord(record);
    return answer(e, { needsConsent, widened });
  }

  /** D670: repos.ts tells the ledger what the source's index now lists. */
  function setLatest(id: string, latest: PluginRecord["latest"]): void {
    reload();
    const record = plugins[id];
    if (!record) return;
    if (latest) record.latest = latest;
    else delete record.latest;
    save();
    changed();
  }

  /** D670: the official index is the reviewed list; a test or demo may set it directly. */
  function setCurated(list: CuratedEntry[]): void {
    curatedList = list.map((c) => ({ ...c }));
    changed();
  }

  async function checkOne(record: PluginRecord): Promise<void> {
    // A repository install's newer version is the source index's entry; repos.ts sets `latest`.
    if (record.kind === "repo") return;
    if (record.kind === "git" && record.source) {
      const r = await git(["ls-remote", record.source, record.ref ?? "HEAD"]).catch(() => undefined);
      if (r?.code === 0) {
        const line = r.stdout.split(/\r?\n/).find((l) => l.trim());
        const commit = line?.trim().split(/\s+/)[0];
        if (commit) {
          record.latest = { commit };
          if (commit === record.commit) delete record.latest;
        }
      }
    } else if (record.kind === "folder") {
      try {
        const hash = contentHash(record.dir);
        if (hash !== record.hash) record.latest = { hash };
        else delete record.latest;
      } catch {
        /* a folder that can't be read is said on its row, not in an update */
      }
    }
    record.checkedAt = new Date(now()).toISOString();
  }

  async function check(force = false): Promise<void> {
    reload();
    let any = false;
    for (const record of Object.values(plugins)) {
      if (!force && record.checkedAt && Date.parse(record.checkedAt) + day > now()) continue;
      await checkOne(record);
      any = true;
    }
    if (any) {
      save();
      changed();
    }
  }

  async function update(id: string): Promise<PluginAnswer> {
    reload();
    const record = plugins[id];
    if (!record) return { ok: false, error: "not_found" };
    // A repository install moves with its repository's index, not with a git remote.
    if (record.kind === "repo") return { ok: false, error: "update_failed", detail: "update it from its repository" };
    const old = entryOf(record);
    let staging: string | undefined;
    try {
      await checkOne(record);
      if (!record.latest) {
        save();
        return answer(old, { upToDate: true });
      }
      let manifest: PluginManifest;
      let hash: string;
      let commit: string | undefined;
      if (record.kind === "git" && record.source) {
        mkdirSync(o.dataDir, { recursive: true, mode: 0o700 });
        staging = mkdtempSync(join(o.dataDir, "plugin-update-"));
        const cloned = await cloneAt(record.source, record.latest.commit ?? record.ref, staging);
        commit = cloned.commit;
        manifest = readManifest(staging);
        if (manifest.id !== record.id) throw new PluginError("bad_manifest", "the update changes the plugin's id");
        checkApp(manifest);
        hash = contentHash(staging);
        rmSync(record.dir, { recursive: true, force: true });
        mkdirSync(dirname(record.dir), { recursive: true, mode: 0o700 });
        renameSync(staging, record.dir);
        staging = undefined;
      } else {
        manifest = readManifest(record.dir);
        hash = contentHash(record.dir);
      }
      const before = record.reads ?? old.manifest?.reads ?? record.consent?.reads ?? [];
      const widened = manifest.reads.some((r) => !before.includes(r)) || !same(manifest.starts, record.starts ?? []) || !same(manifest.run, record.run ?? []);
      record.version = manifest.version;
      record.hash = hash;
      record.app = manifest.app.name;
      record.name = manifest.name.en;
      record.author = manifest.author.name;
      record.reads = [...manifest.reads];
      record.run = [...manifest.run];
      record.starts = [...manifest.starts];
      if (commit) record.commit = commit;
      delete record.latest;
      record.checkedAt = new Date(now()).toISOString();
      if (widened) delete record.consent;
      save();
      changed();
      return answer(entryOf(record), { needsConsent: widened, widened });
    } catch (err) {
      const p = err as PluginError;
      return { ok: false, error: p.code || "update_failed", detail: p.message };
    } finally {
      if (staging) rmSync(staging, { recursive: true, force: true });
    }
  }

  function remove(id: string): { ok: boolean; deletedFolder: boolean; error?: string } {
    reload();
    const record = plugins[id];
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
    delete plugins[id];
    save();
    changed();
    return { ok: true, deletedFolder };
  }

  async function run(id: string): Promise<PluginRunResult> {
    reload();
    const e = get(id);
    if (!e) return { stream: "", code: -1, error: "not_found" };
    if (e.problem) return { stream: "", code: -1, error: e.problem, ...(e.detail ? { detail: e.detail } : {}) };
    const m = e.manifest!;
    const avail = o.sandbox ? { ok: true } : sandboxAvailable(o.platform, o.path);
    if (!avail.ok) return { stream: "", code: -1, error: "sandbox_unavailable", ...(avail.reason ? { detail: avail.reason } : {}) };
    let hash: string;
    try {
      hash = contentHash(e.record.dir);
    } catch (err) {
      return { stream: "", code: -1, error: "broken", detail: (err as Error).message };
    }
    if (hash !== e.record.hash) return { stream: "", code: -1, error: "hash_mismatch" };
    // D670: a use is resolved to the exact program this run may start. A declared command
    // that isn't on this computer fails before the sandbox: the card promised that command.
    const uses: PluginUseRun[] = [];
    for (const u of m.uses) {
      const r = resolveUse(u.command, { dir: e.record.dir, path: o.path ?? process.env.PATH ?? "" });
      if (!r) return { stream: "", code: -1, error: "plugin_failed", detail: `the ${u.command} command isn't on this computer` };
      uses.push({ ...r, online: u.online });
    }
    const useDirs = [...new Set(uses.map((u) => dirname(u.real)))];
    const temp = pluginTempDir(o.dataDir);
    try {
      const runSpec = {
        id,
        dir: e.record.dir,
        argv: pluginArgv(m.run, { dir: e.record.dir, bunPath: o.bunPath, path: o.path }),
        reads: m.reads,
        starts: m.starts.map((s) => pluginArgv([s], { dir: e.record.dir, bunPath: o.bunPath, path: o.path })[0]!).filter(Boolean),
        uses,
        network: m.online,
        tempDir: temp,
        timeoutMs,
        home,
        // A single-binary Ducter is also Bun: with this it runs the reader's script, not itself.
        // The declared commands' own folders lead PATH so the reader can name `lody` as it does.
        env: { ...o.env, BUN_BE_BUN: "1", PATH: [...useDirs, o.path ?? "/usr/local/bin:/usr/bin:/bin"].join(":") },
      };
      const r = o.sandbox ? await o.sandbox(runSpec) : await runSandboxed(runSpec, { platform: o.platform, bunPath: o.bunPath, path: o.path });
      if (r.error) return { stream: r.stdout, code: r.code, error: r.error, ...(r.stderr ? { detail: r.stderr.slice(0, 2000) } : {}) };
      if (r.code !== 0 && !r.stdout.trim()) return { stream: "", code: r.code, error: "plugin_failed", ...(r.stderr ? { detail: r.stderr.slice(0, 2000) } : {}) };
      return { stream: r.stdout, code: r.code, ...(r.code !== 0 ? { detail: r.stderr.slice(0, 2000) } : {}), ...(r.stderr ? { stderr: r.stderr.slice(0, 2000) } : {}) };
    } finally {
      removePluginTempDir(temp);
    }
  }

  return {
    list,
    get,
    curated: () => [...curatedList],
    install,
    installPrepared,
    update,
    remove,
    consent(id, reads, online = false) {
      reload();
      const record = plugins[id];
      if (!record) return;
      record.consent = { reads: [...reads], online, at: new Date(now()).toISOString() };
      save();
      changed();
    },
    consented(id, reads, online = false) {
      reload();
      const record = plugins[id];
      return !!record?.consent && covers(record.consent.reads, reads) && (!online || record.consent.online === true);
    },
    run,
    check,
    setLatest,
    setCurated,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** A row's app name and version are facts of the manifest, never the folder name. */
export function pluginAppName(entry: PluginEntry): string {
  return entry.manifest?.app.name ?? entry.record.app;
}

export { same, covers, looksGit };
