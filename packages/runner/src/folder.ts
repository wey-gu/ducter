// D130: a folder place that isn't a git repo (Documents, Downloads, a folder of invoices).
// Before a task first writes there, Ducter keeps a copy of the folder: an APFS clone on macOS or
// a reflink on Linux (near-zero space and time), a plain copy only when the folder is small. The
// task works in the folder itself, so results show at once; what it changed is counted against
// the copy (added, changed, removed, moved or renamed: matched by content), and 改回去 / Undo
// all changes puts the folder back exactly as the copy has it, checked by hash. The copy is kept
// 7 days after the task finished, or until 就这样 / Keep the changes frees it.
//
// A folder that can't be copied cheaply (in iCloud Drive, Dropbox, Google Drive or OneDrive; on
// a network or external drive; too big for a plain copy) is not copied: the task asks first.
//
// Layout: <root>/<taskId>/meta.json, copy/ (the folder as it was), end.json (what the folder
// looked like when the task last finished: an undo after someone else changed it asks first).
import { copyFileSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, statfsSync, symlinkSync, unlinkSync, utimesSync, chmodSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import type { FolderChange, FolderChanges, FolderSummary, UndoConfirm } from "@ducter/protocol";

export const KEEP_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
/** How many entries a folder may hold before it is not worth walking (and copying) at all. */
export const FILE_CAP = Number(process.env.DUCTER_SNAPSHOT_MAX_FILES || 100_000);
/** A plain (not cloned) copy is made only up to this size. */
export const COPY_CAP_BYTES = Number(process.env.DUCTER_SNAPSHOT_COPY_MAX_MB || 256) * 1024 * 1024;
const LIST_CAP = 500;
/** Finder's own files: never counted as a change, never removed or put back. */
const IGNORED = new Set([".DS_Store", "Icon\r", ".localized"]);

export type Method = "clone" | "reflink" | "copy";
/** Why a folder can't be copied cheaply: the task asks before it writes. */
export type CantKeep = "cloud" | "network" | "external" | "too_big" | "missing" | "copy_failed" | "holds_ducter";

export interface SnapshotMeta {
  v: 1;
  taskId: string;
  folder: string;
  takenAt: string;
  method: Method;
  state: "open" | "kept" | "undone" | "expired";
  finishedAt?: string;
  expiresAt?: string;
}

// ---------- the tree ----------

export interface Entry {
  t: "f" | "d" | "l";
  size: number;
  mtime: number; // ms
  mode: number;
  target?: string; // a link's target
}
export type Tree = Map<string, Entry>;

/** Every entry under root ("a/b.pdf"), links not followed; undefined past `cap` entries. */
export function walk(root: string, cap = FILE_CAP): Tree | undefined {
  const out: Tree = new Map();
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(rel ? join(root, rel) : root);
    } catch {
      continue; // unreadable: left as it is
    }
    for (const name of names) {
      if (IGNORED.has(name)) continue;
      const r = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = lstatSync(join(root, r));
      } catch {
        continue;
      }
      const e: Entry = { t: st.isDirectory() ? "d" : st.isSymbolicLink() ? "l" : "f", size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, mode: st.mode & 0o7777 };
      if (e.t === "l") e.target = safe(() => readlinkSync(join(root, r)));
      out.set(r, e);
      if (out.size > cap) return undefined;
      if (e.t === "d") stack.push(r);
    }
  }
  return out;
}

const safe = <T>(f: () => T): T | undefined => {
  try {
    return f();
  } catch {
    return undefined;
  }
};

export async function hashFile(path: string): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) h.update(chunk);
  return h.digest("hex");
}

/** Same bytes? Size and modification time equal is taken as the same (the copy keeps times). */
async function sameFile(a: string, ea: Entry, b: string, eb: Entry, hashes?: Map<string, string>): Promise<boolean> {
  if (ea.size !== eb.size) return false;
  if (Math.abs(ea.mtime - eb.mtime) < 1) return true;
  const ha = hashes?.get(a) ?? (await hashFile(a));
  const hb = hashes?.get(b) ?? (await hashFile(b));
  hashes?.set(a, ha);
  hashes?.set(b, hb);
  return ha === hb;
}

// ---------- what changed ----------

export interface Diff {
  files: FolderChange[];
  counts: Omit<FolderSummary, "undo" | "undoUntil" | "at">;
}

/** What the folder `after` holds that `before` (the copy) didn't, in plain kinds. A removed and
 *  an added file with the same bytes are one move (or a rename, in the same folder). */
export async function diffTrees(beforeRoot: string, afterRoot: string, before?: Tree, after?: Tree): Promise<Diff> {
  const b = before ?? walk(beforeRoot) ?? new Map();
  const a = after ?? walk(afterRoot) ?? new Map();
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const addedDirs: string[] = [];
  const removedDirs: string[] = [];
  const hashes = new Map<string, string>();
  for (const [p, ea] of a) {
    const eb = b.get(p);
    if (!eb || eb.t !== ea.t) {
      (ea.t === "d" ? addedDirs : added).push(p);
      if (eb) (eb.t === "d" ? removedDirs : removed).push(p);
      continue;
    }
    if (ea.t === "f" && !(await sameFile(join(beforeRoot, p), eb, join(afterRoot, p), ea, hashes))) changed.push(p);
    else if (ea.t === "l" && ea.target !== eb.target) changed.push(p);
  }
  for (const [p, eb] of b) if (!a.has(p)) (eb.t === "d" ? removedDirs : removed).push(p);

  // Moves: a removed file and an added one with the same size, then the same hash.
  const moved: { from: string; to: string }[] = [];
  const bySize = new Map<number, string[]>();
  for (const p of removed) {
    const e = b.get(p)!;
    if (e.t !== "f") continue;
    const l = bySize.get(e.size) ?? [];
    l.push(p);
    bySize.set(e.size, l);
  }
  const gone = new Set<string>();
  const came = new Set<string>();
  // Prefer a candidate with the same name (a file moved into a month folder keeps its name).
  for (const p of added.sort()) {
    const e = a.get(p)!;
    if (e.t !== "f") continue;
    const cands = (bySize.get(e.size) ?? []).filter((c) => !gone.has(c));
    cands.sort((x, y) => Number(basename(y) === basename(p)) - Number(basename(x) === basename(p)));
    for (const c of cands) {
      const hc = hashes.get(join(beforeRoot, c)) ?? (await hashFile(join(beforeRoot, c)));
      hashes.set(join(beforeRoot, c), hc);
      const hp = hashes.get(join(afterRoot, p)) ?? (await hashFile(join(afterRoot, p)));
      hashes.set(join(afterRoot, p), hp);
      if (hc === hp) {
        moved.push({ from: c, to: p });
        gone.add(c);
        came.add(p);
        break;
      }
    }
  }
  const files: FolderChange[] = [];
  let renamed = 0;
  for (const m of moved.sort((x, y) => x.to.localeCompare(y.to))) {
    if (dirname(m.from) === dirname(m.to)) renamed++;
    files.push({ kind: "moved", path: m.to, from: m.from });
  }
  // A new folder's own entry, then what's in it.
  for (const p of addedDirs.sort()) files.push({ kind: "added", path: p, dir: true });
  const newFiles = added.filter((p) => !came.has(p)).sort();
  for (const p of newFiles) files.push({ kind: "added", path: p });
  for (const p of changed.sort()) files.push({ kind: "changed", path: p });
  const goneFiles = removed.filter((p) => !gone.has(p)).sort();
  for (const p of goneFiles) files.push({ kind: "removed", path: p });
  // A removed folder is listed only when it isn't inside another removed folder.
  const rd = new Set(removedDirs);
  for (const p of removedDirs.sort()) if (!rd.has(dirname(p))) files.push({ kind: "removed", path: p, dir: true });
  return {
    files,
    counts: { added: newFiles.length, changed: changed.length, removed: goneFiles.length, moved: moved.length - renamed, renamed, folders: addedDirs.length },
  };
}

// ---------- can it be copied cheaply? ----------

export interface MountInfo {
  point: string;
  type: string;
}

/** The mount holding `path` (longest mount point that prefixes it). */
export function mountOf(path: string, table: MountInfo[]): MountInfo | undefined {
  let best: MountInfo | undefined;
  for (const m of table) {
    const p = m.point.endsWith("/") ? m.point : m.point + "/";
    if ((path + "/").startsWith(p) && (!best || m.point.length > best.point.length)) best = m;
  }
  return best;
}

/** The mount table: `mount` on macOS ("/dev/disk3s5 on /System/Volumes/Data (apfs, local, …)"), /proc/self/mounts on Linux. */
export function readMounts(platform = process.platform): MountInfo[] {
  try {
    if (platform === "linux") {
      return readFileSync("/proc/self/mounts", "utf8")
        .split("\n")
        .map((l) => l.split(" "))
        .filter((f) => f.length >= 3)
        .map((f) => ({ point: f[1]!.replace(/\\040/g, " "), type: f[2]! }));
    }
    const out = Bun.spawnSync(["/sbin/mount"], { stdout: "pipe", stderr: "ignore" }).stdout.toString();
    const rows: MountInfo[] = [];
    for (const l of out.split("\n")) {
      const m = l.match(/^.+? on (.+) \(([^,)]+)/);
      if (m) rows.push({ point: m[1]!, type: m[2]! });
    }
    return rows;
  } catch {
    return [];
  }
}

const NETWORK = new Set(["smbfs", "nfs", "nfs4", "afpfs", "webdav", "cifs", "smb3", "fuse.sshfs", "sshfs", "macfuse", "osxfuse", "fuse.rclone", "9p"]);
const REFLINK = new Set(["btrfs", "xfs", "bcachefs"]);

/** A cloud-synced folder by where it lives: iCloud Drive, ~/Library/CloudStorage (Dropbox, Google
 *  Drive, OneDrive, Box), the older sync folders in the home folder, or iCloud's Desktop &
 *  Documents (an xattr on the folder). Its files may be placeholders, and a sync can undo an undo. */
export function cloudOf(path: string, o: { home?: string; xattrs?: (dir: string) => string[] } = {}): string | undefined {
  const home = o.home ?? homedir();
  if (path.includes("/Library/Mobile Documents/")) return "iCloud Drive";
  const cs = path.match(/\/Library\/CloudStorage\/([^/]+)/);
  if (cs) {
    const n = cs[1]!;
    return /^GoogleDrive/i.test(n) ? "Google Drive" : /^OneDrive/i.test(n) ? "OneDrive" : /^Dropbox/i.test(n) ? "Dropbox" : /^Box/i.test(n) ? "Box" : n.split("-")[0];
  }
  const xattrs = o.xattrs ?? (process.platform === "darwin" ? listXattrs : () => []);
  for (let d = path; d.length > 1; d = dirname(d)) {
    const name = basename(d);
    if (dirname(d) === home && /^(Dropbox|Google Drive|OneDrive.*|Box|Box Sync|iCloud Drive|Nutstore|坚果云)$/i.test(name)) return name;
    if (existsSync(join(d, ".dropbox")) || existsSync(join(d, ".dropbox.cache"))) return "Dropbox";
    if (d === home || d.length < home.length) break;
    if (xattrs(d).some((x) => /^com\.apple\.(icloud|file-?provider|fileprovider)/i.test(x))) return "iCloud Drive";
  }
  return undefined;
}

function listXattrs(dir: string): string[] {
  try {
    const r = Bun.spawnSync(["/usr/bin/xattr", dir], { stdout: "pipe", stderr: "ignore" });
    return r.stdout.toString().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export type Assessment = { ok: true; method: Method; files: number; bytes: number } | { ok: false; why: CantKeep; detail?: string };

export interface AssessOptions {
  platform?: NodeJS.Platform;
  mounts?: MountInfo[];
  home?: string;
  xattrs?: (dir: string) => string[];
  fileCap?: number;
  copyCap?: number;
}

/** Whether the folder can be copied cheaply into `root` before the task writes, and how. */
export function assess(folder: string, root: string, o: AssessOptions = {}): Assessment {
  const real = safe(() => realpathSync(folder));
  if (!real || !safe(() => statSync(real).isDirectory())) return { ok: false, why: "missing" };
  const cloud = cloudOf(real, o);
  if (cloud) return { ok: false, why: "cloud", detail: cloud };
  // The folder holds Ducter's own data folder (a home folder): a copy would copy itself.
  const rootReal = safe(() => realpathSync(dirname(root))) ?? dirname(root);
  if ((rootReal + "/").startsWith(real + "/")) return { ok: false, why: "holds_ducter" };
  const platform = o.platform ?? process.platform;
  const mounts = o.mounts ?? readMounts(platform);
  const m = mountOf(real, mounts);
  if (m && NETWORK.has(m.type)) return { ok: false, why: "network", detail: m.point };
  const external = !!m && (platform === "darwin" ? m.point.startsWith("/Volumes/") : /^\/(media|run\/media|mnt)\//.test(m.point + "/"));
  if (external) return { ok: false, why: "external", detail: m!.point };
  const tree = walk(real, o.fileCap ?? FILE_CAP);
  if (!tree) return { ok: false, why: "too_big", detail: `more than ${o.fileCap ?? FILE_CAP} files` };
  let bytes = 0;
  for (const e of tree.values()) bytes += e.size;
  mkdirSync(root, { recursive: true });
  const sameDevice = statSync(real).dev === statSync(root).dev;
  const type = m?.type ?? "";
  if (sameDevice && platform === "darwin" && type === "apfs") return { ok: true, method: "clone", files: tree.size, bytes };
  if (sameDevice && platform === "linux" && REFLINK.has(type)) return { ok: true, method: "reflink", files: tree.size, bytes };
  const free = safe(() => {
    const s = statfsSync(root);
    return s.bavail * s.bsize;
  });
  if (bytes <= (o.copyCap ?? COPY_CAP_BYTES) && (free == null || free > bytes * 2)) return { ok: true, method: "copy", files: tree.size, bytes };
  return { ok: false, why: "too_big", detail: `${Math.round(bytes / 1024 / 1024)} MB` };
}

// ---------- the store ----------

export interface FolderStore {
  /** Keep a copy now unless one is open. ok with fresh=false: one was already kept. */
  prepare(taskId: string, folder: string): Promise<{ ok: true; fresh: boolean; method: Method } | { ok: false; why: CantKeep; detail?: string }>;
  meta(taskId: string): SnapshotMeta | undefined;
  /** The task finished (for now): what the folder looks like, and the 7 days start again. */
  finish(taskId: string): void;
  changes(taskId: string, opts?: { files?: boolean }): Promise<FolderChanges | undefined>;
  undo(taskId: string, opts?: { path?: string; force?: boolean }): Promise<{ ok: boolean; message: string; confirm?: UndoConfirm }>;
  keep(taskId: string): { ok: boolean; message: string };
  /** Free the copies whose 7 days are up. Returns the task ids freed. */
  sweep(): string[];
}

export function createFolderStore(o: { root: string; now?: () => number; assess?: AssessOptions }): FolderStore {
  const now = o.now ?? Date.now;
  const dir = (id: string) => join(o.root, id.replace(/[^\w-]/g, "_"));
  const metaPath = (id: string) => join(dir(id), "meta.json");
  const copyPath = (id: string) => join(dir(id), "copy");
  const endPath = (id: string) => join(dir(id), "end.json");
  const iso = (ms: number) => new Date(ms).toISOString();

  const read = (id: string): SnapshotMeta | undefined => safe(() => JSON.parse(readFileSync(metaPath(id), "utf8")) as SnapshotMeta);
  const write = (m: SnapshotMeta) => {
    mkdirSync(dir(m.taskId), { recursive: true });
    const tmp = metaPath(m.taskId) + ".tmp";
    writeFileSync(tmp, JSON.stringify(m, null, 1));
    renameSync(tmp, metaPath(m.taskId));
  };
  const free = (m: SnapshotMeta, state: SnapshotMeta["state"]) => {
    rmSync(copyPath(m.taskId), { recursive: true, force: true });
    rmSync(endPath(m.taskId), { force: true });
    write({ ...m, state });
  };

  async function copyTree(folder: string, dst: string, method: Method): Promise<boolean> {
    const argv =
      method === "clone"
        ? ["cp", "-c", "-R", "-p", folder, dst]
        : method === "reflink"
          ? ["cp", "-a", "--reflink=always", folder, dst]
          : process.platform === "linux"
            ? ["cp", "-a", folder, dst]
            : ["cp", "-R", "-p", folder, dst];
    const p = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe", stdin: "ignore" });
    const code = await p.exited;
    return code === 0;
  }

  const sinceEnd = (id: string, folder: string): UndoConfirm | undefined => {
    const end = safe(() => JSON.parse(readFileSync(endPath(id), "utf8")) as Record<string, [string, number, number]>);
    if (!end) return undefined;
    const cur = walk(folder) ?? new Map();
    const touched = new Set<string>();
    for (const [p, e] of cur) {
      const was = end[p];
      if (!was || was[0] !== e.t || (e.t !== "d" && (was[1] !== e.size || Math.abs(was[2] - e.mtime) >= 1))) touched.add(p);
    }
    for (const p of Object.keys(end)) if (!cur.has(p)) touched.add(p);
    // A file inside a new folder is enough; the folder itself says nothing more.
    const files = [...touched].filter((p) => cur.get(p)?.t !== "d" && end[p]?.[0] !== "d").sort();
    return files.length ? { count: files.length, files: files.slice(0, 5) } : undefined;
  };

  const store: FolderStore = {
    async prepare(taskId, folder) {
      const m = read(taskId);
      if (m?.state === "open" && existsSync(copyPath(taskId))) return { ok: true, fresh: false, method: m.method };
      const a = assess(folder, o.root, o.assess);
      if (!a.ok) return a;
      const real = realpathSync(folder);
      rmSync(dir(taskId), { recursive: true, force: true });
      mkdirSync(dir(taskId), { recursive: true });
      let method = a.method;
      let done = await copyTree(real, copyPath(taskId), method);
      // A clone or reflink that the volume refused after all: a plain copy if it is small.
      if (!done && method !== "copy" && a.bytes <= (o.assess?.copyCap ?? COPY_CAP_BYTES)) {
        rmSync(copyPath(taskId), { recursive: true, force: true });
        method = "copy";
        done = await copyTree(real, copyPath(taskId), method);
      }
      if (!done) {
        rmSync(dir(taskId), { recursive: true, force: true });
        return { ok: false, why: "copy_failed" };
      }
      write({ v: 1, taskId, folder: real, takenAt: iso(now()), method, state: "open" });
      return { ok: true, fresh: true, method };
    },

    meta: read,

    finish(taskId) {
      const m = read(taskId);
      if (!m || m.state !== "open") return;
      const t = now();
      write({ ...m, finishedAt: iso(t), expiresAt: iso(t + KEEP_DAYS * DAY) });
      const tree = walk(m.folder);
      if (tree) {
        const end: Record<string, [string, number, number]> = {};
        for (const [p, e] of tree) end[p] = [e.t, e.size, e.mtime];
        writeFileSync(endPath(taskId), JSON.stringify(end));
      }
    },

    async changes(taskId, opts = {}) {
      const m = read(taskId);
      if (!m) return undefined;
      const at = iso(now());
      const base = { undo: m.state, ...(m.state === "open" && m.expiresAt ? { undoUntil: m.expiresAt } : {}), at } as const;
      if (m.state !== "open" || !existsSync(copyPath(taskId))) {
        // Nothing to count against any more: the summary keeps only what became of it.
        return { added: 0, changed: 0, removed: 0, moved: 0, renamed: 0, folders: 0, ...base, files: [], more: 0 };
      }
      const d = await diffTrees(copyPath(taskId), m.folder);
      const files = opts.files ? d.files.slice(0, LIST_CAP) : [];
      return { ...d.counts, ...base, files, more: opts.files ? Math.max(0, d.files.length - LIST_CAP) : 0 };
    },

    async undo(taskId, opts = {}) {
      const m = read(taskId);
      if (!m) return { ok: false, message: "There's no copy of this folder to go back to." };
      if (m.state === "kept") return { ok: false, message: "You kept these changes, so there's nothing to undo." };
      if (m.state === "undone") return { ok: true, message: "Already undone: the folder is as it was before." };
      if (m.state === "expired" || !existsSync(copyPath(taskId))) return { ok: false, message: "The copy from before is gone (it was kept for 7 days), so this can't be undone any more." };
      if (!existsSync(m.folder)) return { ok: false, message: `The folder isn't there any more (${basename(m.folder)}).` };
      if (opts.path) return restoreOne(m, copyPath(taskId), opts.path);
      if (!opts.force) {
        const c = sinceEnd(taskId, m.folder);
        if (c) {
          const names = c.files.map((f) => basename(f)).join(", ");
          return {
            ok: false,
            confirm: c,
            message: `${c.count} file${c.count === 1 ? " was" : "s were"} changed after the task finished (${names}${c.count > c.files.length ? ", …" : ""}). Undoing puts the folder back to how it was before the task, so ${c.count === 1 ? "that change goes" : "those changes go"} too.`,
          };
        }
      }
      const r = await restoreAll(m.folder, copyPath(taskId));
      if (!r.ok) return { ok: false, message: `Couldn't put everything back: ${r.problem}. The copy is still kept; nothing else was lost.` };
      free(m, "undone");
      return { ok: true, message: `Undone: the folder is exactly as it was before (${r.putBack} put back, ${r.removed} removed).` };
    },

    keep(taskId) {
      const m = read(taskId);
      if (!m) return { ok: false, message: "There's no copy of this folder." };
      if (m.state !== "open") return { ok: true, message: m.state === "kept" ? "Already kept." : "Nothing to keep: the copy is gone." };
      free(m, "kept");
      return { ok: true, message: "Kept the changes; the copy from before is freed." };
    },

    sweep() {
      const freed: string[] = [];
      let ids: string[] = [];
      try {
        ids = readdirSync(o.root);
      } catch {
        return freed;
      }
      for (const id of ids) {
        const m = read(id);
        if (!m || m.state !== "open" || !m.expiresAt) continue;
        if (Date.parse(m.expiresAt) <= now()) {
          free(m, "expired");
          freed.push(m.taskId);
        }
      }
      return freed;
    },
  };
  return store;
}

// ---------- putting it back ----------

const depth = (p: string) => p.split("/").length;

function putFile(src: string, dst: string, e: Entry) {
  mkdirSync(dirname(dst), { recursive: true });
  if (existsSync(dst) || safe(() => lstatSync(dst))) rmSync(dst, { recursive: true, force: true });
  if (e.t === "l") {
    symlinkSync(e.target ?? "", dst);
    return;
  }
  // A clone where the volume can (APFS, reflink), a copy otherwise.
  copyFileSync(src, dst, constants.COPYFILE_FICLONE);
  chmodSync(dst, e.mode);
  utimesSync(dst, new Date(e.mtime), new Date(e.mtime));
}

/** Make `folder` exactly what `copy` holds, then check it: the same entries, the same bytes. */
export async function restoreAll(folder: string, copy: string): Promise<{ ok: boolean; putBack: number; removed: number; problem?: string }> {
  const cur = walk(folder, Number.MAX_SAFE_INTEGER) ?? new Map();
  const base = walk(copy, Number.MAX_SAFE_INTEGER) ?? new Map();
  let removed = 0;
  let putBack = 0;
  const put: string[] = [];
  try {
    // What the task added (or turned into something else) goes, deepest first.
    for (const p of [...cur.keys()].sort((x, y) => depth(y) - depth(x))) {
      const e = cur.get(p)!;
      const b = base.get(p);
      if (b && b.t === e.t) continue;
      if (!safe(() => lstatSync(join(folder, p)))) continue; // inside a folder already removed
      rmSync(join(folder, p), { recursive: true, force: true });
      if (e.t !== "d") removed++;
    }
    // Then everything the copy has, shallowest first.
    for (const p of [...base.keys()].sort((x, y) => depth(x) - depth(y))) {
      const b = base.get(p)!;
      const e = cur.get(p);
      if (b.t === "d") {
        mkdirSync(join(folder, p), { recursive: true });
        chmodSync(join(folder, p), b.mode);
        continue;
      }
      if (e && e.t === b.t && (b.t === "l" ? e.target === b.target : e.size === b.size && Math.abs(e.mtime - b.mtime) < 1)) continue;
      putFile(join(copy, p), join(folder, p), b);
      put.push(p);
      putBack++;
    }
    // Folder times last, deepest first (writing into a folder moves its time).
    for (const p of [...base.keys()].sort((x, y) => depth(y) - depth(x))) {
      const b = base.get(p)!;
      if (b.t === "d") safe(() => utimesSync(join(folder, p), new Date(b.mtime), new Date(b.mtime)));
    }
  } catch (err) {
    return { ok: false, putBack, removed, problem: (err as Error).message };
  }
  // Checked: nothing differs, and every file put back has the copy's bytes.
  const left = await diffTrees(copy, folder);
  if (left.files.length) return { ok: false, putBack, removed, problem: `${left.files.length} entries still differ (${left.files[0]!.path})` };
  for (const p of put) {
    if (base.get(p)!.t !== "f") continue;
    if ((await hashFile(join(copy, p))) !== (await hashFile(join(folder, p)))) return { ok: false, putBack, removed, problem: `${p} doesn't match its copy` };
  }
  return { ok: true, putBack, removed };
}

/** One entry of the list put back as it was: a file gone or changed comes back from the copy; a
 *  new file goes; a moved one goes back where it was. Folders are only undone all at once. */
async function restoreOne(m: SnapshotMeta, copy: string, path: string): Promise<{ ok: boolean; message: string }> {
  const clean = path.replace(/^\/+/, "");
  if (!clean || clean.split("/").includes("..")) return { ok: false, message: "That isn't a file in this folder." };
  const d = await diffTrees(copy, m.folder);
  const c = d.files.find((f) => f.path === clean);
  if (!c) return { ok: true, message: "That file is already as it was." };
  if (c.dir) return { ok: false, message: "A folder goes back only with Undo all changes." };
  const base = walk(copy, Number.MAX_SAFE_INTEGER) ?? new Map();
  const entry = (p: string) => base.get(p);
  try {
    if (c.kind === "added") rmSync(join(m.folder, c.path), { force: true });
    else if (c.kind === "changed" || c.kind === "removed") putFile(join(copy, c.path), join(m.folder, c.path), entry(c.path)!);
    else if (c.kind === "moved" && c.from) {
      putFile(join(copy, c.from), join(m.folder, c.from), entry(c.from)!);
      if (!base.has(c.path)) rmSync(join(m.folder, c.path), { force: true });
    }
  } catch (err) {
    return { ok: false, message: `Couldn't put ${basename(c.path)} back: ${(err as Error).message}` };
  }
  return { ok: true, message: `Put ${basename(c.from ?? c.path)} back as it was.` };
}

