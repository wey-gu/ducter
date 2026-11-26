// D-PENDING: the local bundle and receive slice of `ducter move` (D504, design/move.md §5).
//
// `--bundle <file>` writes one encrypted archive of what move.md says goes: a consistent SQLite
// snapshot of the Log and devices.db (the backup API, never a live file), the small JSON files,
// keys.env, the account connections, devices.db and the home's key, the chat apps and their
// cursors, notifications, the Mem identity binding, helpers, what Ducter made, the tunnel, and
// Autofill re-locked under the bundle key (decrypted with this home's key, which never leaves).
// A passphrase (shown once, or read from stdin) is the only way in: the file is AES-256-GCM with a
// key from scrypt, so a copy on a disk or on the wire opens nothing. The running home is only read.
//
// `--receive <file>` checks the passphrase, every file's SHA-256, and the Log's event count and
// last-event hash; refuses a data folder that already has work; imports into a fresh folder with
// 0600 files and 0700 folders; re-locks Autofill with the new home's own key; and writes a
// receiving marker. It cuts nothing over: no pollers, no routines, no network.
//
// Not here (design/move.md §5, todo.md): the freeze, the one-time move code and X25519 between two
// homes, resumable chunks over HTTPS or the worker socket, the Mem/Bridge handover, cut-over,
// rollback, and the app's row.
import { Database } from "bun:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { keySource } from "@ducter/protocol/src/lock-key.ts";
import type { MsgKey } from "./i18n.ts";

export const MAGIC = Buffer.from("DUCTERMOVE1\n", "utf8");
const CIPHER = "aes-256-gcm";
const KDF = "scrypt";
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const CHECK = "ducter-move-check-v1";
const HEADER_MAX = 64 * 1024;
/** An empty receiving home needs this much room besides the files themselves. */
const RECEIVE_HEADROOM = 32 * 1024 * 1024;

/** The passphrase's alphabet: no I, L, O, U, 0 or 1, as pairing codes (D83). */
export const PASSPHRASE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Four groups of four: 16 characters, about 78 bits, then scrypt. */
export function newPassphrase(groups = 4, each = 4): string {
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let i = 0; i < each; i++) s += PASSPHRASE_ALPHABET[randomInt(PASSPHRASE_ALPHABET.length)];
    out.push(s);
  }
  return out.join("-");
}

/** Case and the hyphens or spaces people add when copying do not matter. */
export function normalizePassphrase(s: string): string {
  return s.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export interface BundleFile {
  path: string;
  size: number;
  sha256: string;
  mode: number;
  /** The bytes were opened with this home's key and are sealed under the bundle key. */
  relock?: "autofill";
}

export interface BundleItem {
  id: string;
  what: string;
  detail?: string;
  key?: MsgKey;
  detailKey?: MsgKey;
  vars?: Record<string, string | number>;
  bytes?: number;
}

export interface BundleNote {
  id: string;
  key: MsgKey;
  vars?: Record<string, string | number>;
}

export interface BundleManifest {
  v: 1;
  createdAt: string;
  from: { computer: string; os: string; partner: string };
  log: { events: number; last: { seq: number; hash: string } };
  files: BundleFile[];
  goes: BundleItem[];
  redo: BundleItem[];
  stays: BundleItem[];
  notes: BundleNote[];
  /** What is deliberately not in the file, named plainly for the screen (D504 §2). */
  notCarried: string[];
}

export type BundleError =
  | "no_home"
  | "exists"
  | "inside"
  | "no_dir"
  | "write"
  | "changed"
  | "no_autofill_key"
  | "autofill_damaged"
  | "bad_file"
  | "not_empty"
  | "wrong_passphrase"
  | "tampered"
  | "no_space"
  | "autofill_key"
  | "passphrase";

export interface BundleWriteInput {
  dataDir: string;
  out: string;
  passphrase: string;
  from: { computer: string; os: string; partner: string };
  goes: BundleItem[];
  redo: BundleItem[];
  stays: BundleItem[];
  notes: BundleNote[];
  /** True only when the plan says the browser profiles go (the same kind of system). */
  includeBrowser: boolean;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  now?: number;
}

export type BundleWriteResult =
  | { ok: true; manifest: BundleManifest; bytes: number; files: number; events: number }
  | { ok: false; error: BundleError; detail?: string; file?: string };

export interface BundleReadInput {
  file: string;
  dataDir: string;
  passphrase: string;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  /** A test seam: bytes free where the data folder will go (else measured). */
  freeBytes?: number;
}

export type BundleReadResult =
  | { ok: true; manifest: BundleManifest; bytes: number; files: number; events: number; relocked: number }
  | { ok: false; error: BundleError; detail?: string; need?: number; free?: number };

interface SrcFile {
  path: string;
  abs?: string;
  data?: Buffer;
  relock?: "autofill";
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const sha256Text = (s: string) => createHash("sha256").update(s).digest("hex");

/** What stays on this computer, or is made again there (D504 §2). */
const NOT_CARRIED = new Set([
  "bin",
  "browser",
  "checks",
  "doctor-data",
  "ducter.db",
  "ducter.db-journal",
  "ducter.db-shm",
  "ducter.db-wal",
  "devices.db",
  "devices.db-journal",
  "devices.db-shm",
  "devices.db-wal",
  "handsets.json",
  "kept-keys",
  "key-grants.json",
  "move-receiving.json",
  "own-phone.json",
  "phone",
  "scratch",
  "saved",
  "task-keys",
  "tools",
  "updates",
  "web-look",
]);

/** Never written from a bundle: the old home's own locks, keys and transients. */
const FORBIDDEN_IN_BUNDLE = new Set(["saved/key", "move-receiving.json"]);

const isTransient = (n: string) =>
  n === ".DS_Store" ||
  n.endsWith(".log") ||
  n.endsWith(".tmp") ||
  n.endsWith(".lock") ||
  n.endsWith(".pid") ||
  n.endsWith(".sock") ||
  n.endsWith(".db-journal") ||
  n.endsWith(".db-wal") ||
  n.endsWith(".db-shm");

/** A data folder is fresh when it has nothing a person made: an empty folder, or only litter. */
export function homeHasWork(dataDir: string): boolean {
  try {
    return readdirSync(dataDir).some((n) => !isTransient(n) && n !== ".DS_Store");
  } catch {
    return false;
  }
}

function hashBytes(b: Buffer): string {
  return sha256(b);
}

async function hashFile(path: string): Promise<{ size: number; sha256: string }> {
  const h = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const b = chunk as Buffer;
    size += b.length;
    h.update(b);
  }
  return { size, sha256: h.digest("hex") };
}

/** The Log's own count and last-event hash, read from a closed snapshot (never a live file). */
export function logFacts(path: string): { events: number; last: { seq: number; hash: string } } {
  const bytes = readFileSync(path);
  // A WAL-mode file with no -wal that is read-only makes SQLite want a -shm; set the header back
  // to rollback in this in-memory copy (only), as move.ts's own openRead does.
  if (bytes.length >= 20 && bytes[18] === 2 && bytes[19] === 2) bytes[18] = bytes[19] = 1;
  const db = Database.deserialize(bytes, true);
  try {
    const events = (db.query("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
    const last = db.query("SELECT seq, kind, body FROM events ORDER BY seq DESC LIMIT 1").get() as
      | { seq: number; kind: string; body: string }
      | undefined;
    return { events, last: last ? { seq: Number(last.seq), hash: sha256Text(`${last.seq}\n${last.kind}\n${last.body}`) } : { seq: 0, hash: "" } };
  } finally {
    db.close();
  }
}

/** The backup API's snapshot of a SQLite file; a running home is only read. */
export function snapshotDb(src: string, dest: string): void {
  if (!existsSync(src)) throw new Error(`no database at ${src}`);
  // Bun exposes node:sqlite's synchronous backup (sqlite3_backup). It needs node:sqlite's own
  // DatabaseSync; bun:sqlite has no backup().
  const { DatabaseSync, backup } = require("node:sqlite") as {
    DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => { exec(sql: string): void; close(): void };
    backup: (db: unknown, path: string) => void;
  };
  const live = existsSync(`${src}-wal`);
  let last: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    let done = false;
    const db = new DatabaseSync(src, live ? { readOnly: true } : {});
    try {
      db.exec("PRAGMA busy_timeout=5000");
      backup(db, dest);
      done = true;
    } catch (e) {
      last = e;
    } finally {
      db.close();
    }
    if (done) {
      // The destination may be a WAL-mode file with the pages still in its own -wal. Fold them in
      // and remove the sidecars, so the one file we hash, encrypt and receive is the whole DB.
      const d = new Database(dest);
      try {
        d.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } finally {
        d.close();
      }
      for (const f of [`${dest}-wal`, `${dest}-shm`, `${dest}-journal`]) rmSync(f, { force: true });
      return;
    }
    if (!live) throw last;
    Bun.sleepSync(100);
  }
  throw last ?? new Error("couldn't snapshot the database");
}

interface Header {
  v: 1;
  kdf: typeof KDF;
  N: number;
  r: number;
  p: number;
  salt: string;
  cipher: typeof CIPHER;
  iv: string;
  check: string;
  createdAt: string;
}

interface ParsedHeader {
  header: Header;
  bytes: Buffer;
  offset: number;
  tag: Buffer;
  size: number;
}

function readHeader(file: string): ParsedHeader | undefined {
  if (!existsSync(file)) return undefined;
  const size = statSync(file).size;
  if (size < MAGIC.length + 4 + 16 + 2) return undefined;
  const fd = openSync(file, "r");
  try {
    const magic = Buffer.alloc(MAGIC.length);
    readSync(fd, magic, 0, MAGIC.length, 0);
    if (!magic.equals(MAGIC)) return undefined;
    const lenBuf = Buffer.alloc(4);
    readSync(fd, lenBuf, 0, 4, MAGIC.length);
    const len = lenBuf.readUInt32BE(0);
    if (len < 2 || len > HEADER_MAX) return undefined;
    const offset = MAGIC.length + 4 + len;
    if (size < offset + 16) return undefined;
    const bytes = Buffer.alloc(len);
    readSync(fd, bytes, 0, len, MAGIC.length + 4);
    let header: Header;
    try {
      header = JSON.parse(bytes.toString("utf8")) as Header;
    } catch {
      return undefined;
    }
    if (header?.v !== 1 || header.kdf !== KDF || header.cipher !== CIPHER) return undefined;
    if (!Number.isFinite(header.N) || header.N < 1 << 10 || header.N > 1 << 20) return undefined;
    if (!Number.isFinite(header.r) || header.r < 1 || header.r > 32) return undefined;
    if (!Number.isFinite(header.p) || header.p < 1 || header.p > 8) return undefined;
    if (typeof header.salt !== "string" || Buffer.from(header.salt, "base64").length < 16) return undefined;
    if (typeof header.iv !== "string" || Buffer.from(header.iv, "base64").length !== 12) return undefined;
    if (typeof header.check !== "string" || typeof header.createdAt !== "string") return undefined;
    const tag = Buffer.alloc(16);
    readSync(fd, tag, 0, 16, size - 16);
    return { header, bytes, offset, tag, size };
  } finally {
    closeSync(fd);
  }
}

function keyOf(passphrase: string, h: Pick<Header, "N" | "r" | "p" | "salt">): Buffer | undefined {
  const p = normalizePassphrase(passphrase);
  if (p.length < 8) return undefined;
  return scryptSync(p, Buffer.from(h.salt, "base64"), 32, { N: h.N, r: h.r, p: h.p, maxmem: SCRYPT.maxmem });
}

const checkOf = (key: Buffer) => createHmac("sha256", key).update(CHECK).digest("hex").slice(0, 16);

function sameCheck(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

function decryptSaved(path: string, key: Buffer): Buffer {
  const f = JSON.parse(readFileSync(path, "utf8")) as { v: 1; iv: string; tag: string; data: string };
  const d = createDecipheriv(CIPHER, key, Buffer.from(f.iv, "base64"));
  d.setAuthTag(Buffer.from(f.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(f.data, "base64")), d.final()]);
}

function encryptSaved(plain: Buffer, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv(CIPHER, key, iv);
  const data = Buffer.concat([c.update(plain), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
}

/** Every regular file under a folder, never a symlink or a socket. */
function walk(root: string, rel = ""): SrcFile[] {
  const out: SrcFile[] = [];
  let names: string[];
  try {
    names = readdirSync(join(root, rel)).sort();
  } catch {
    return out;
  }
  for (const name of names) {
    const r = rel ? join(rel, name) : name;
    const abs = join(root, r);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      out.push(...walk(root, r));
      continue;
    }
    if (!st.isFile() || isTransient(name)) continue;
    out.push({ path: r, abs });
  }
  return out;
}

function collect(dataDir: string, o: { includeBrowser: boolean; platform: NodeJS.Platform; env: Record<string, string | undefined> }, work: string): { files: SrcFile[]; snapshots: SrcFile[] } {
  const files: SrcFile[] = [];
  const snapshots: SrcFile[] = [];
  const savedDir = join(dataDir, "saved");
  const savedKind = existsSync(savedDir) && statSync(savedDir).isDirectory();

  // The two databases: a consistent snapshot through SQLite's own backup API.
  for (const db of ["ducter.db", "devices.db"]) {
    const src = join(dataDir, db);
    if (!existsSync(src)) continue;
    const dest = join(work, db);
    // Only the backup API's snapshot: a live file is never copied.
    snapshotDb(src, dest);
    snapshots.push({ path: db, abs: dest });
  }

  let names: string[] = [];
  try {
    names = readdirSync(dataDir).sort();
  } catch {
    return { files, snapshots };
  }
  for (const name of names) {
    const abs = join(dataDir, name);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink() || isTransient(name)) continue;
    if (NOT_CARRIED.has(name)) {
      if (name === "saved" && savedKind) {
        // Autofill: the saved files are opened with this home's key and sealed inside the bundle;
        // the key itself (saved/key) never leaves, nor do the old encrypted bytes.
        const key = keySource({ dataDir, dir: savedDir, platform: o.platform, env: o.env });
        let old: Buffer | undefined;
        for (const f of readdirSync(savedDir).sort()) {
          if (f === "key") continue;
          const p = join(savedDir, f);
          let fst;
          try {
            fst = lstatSync(p);
          } catch {
            continue;
          }
          if (!fst.isFile()) continue;
          if (f.endsWith(".enc")) {
            old ??= key.get(false);
            if (!old) throw Object.assign(new Error("the Autofill key is missing"), { code: "no_autofill_key" });
            let plain: Buffer;
            try {
              plain = decryptSaved(p, old);
            } catch {
              throw Object.assign(new Error("the saved Autofill file is damaged"), { code: "autofill_damaged" });
            }
            files.push({ path: `saved/${f}`, data: plain, relock: "autofill" });
          } else {
            files.push({ path: `saved/${f}`, abs: p });
          }
        }
      }
      continue;
    }
    if (st.isDirectory()) {
      if (name === "browser-profiles" && !o.includeBrowser) continue;
      files.push(...walk(dataDir, name));
      continue;
    }
    if (!st.isFile()) continue;
    files.push({ path: name, abs });
  }
  return { files, snapshots };
}

function isSafeRel(p: string): boolean {
  if (!p || p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  const parts = p.split("/");
  return parts.every((x) => x && x !== "." && x !== "..") && resolve("/", p).slice(1) === p;
}

/**
 * Write one encrypted bundle. The running home is read only: the databases are snapshotted, and
 * every other file is hashed first, then streamed once into the cipher; a file that changes in
 * between aborts the write (nothing is left behind).
 */
export async function writeBundle(i: BundleWriteInput): Promise<BundleWriteResult> {
  if (!existsSync(join(i.dataDir, "ducter.db"))) return { ok: false, error: "no_home" };
  if (normalizePassphrase(i.passphrase).length < 8) return { ok: false, error: "passphrase" };
  const out = resolve(i.out);
  const parent = dirname(out);
  if (!existsSync(parent)) return { ok: false, error: "no_dir", file: out };
  if (existsSync(out)) return { ok: false, error: "exists", file: out };
  const home = resolve(i.dataDir);
  if (out === home || out.startsWith(home + sep)) return { ok: false, error: "inside", file: out };

  const work = mkdtempSync(join(tmpdir(), "ducter-move-bundle-"));
  // Write a sibling and rename it into place, so a kill mid-write never leaves a half bundle
  // where the person would try to receive it.
  const tmp = `${out}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  let written = false;
  try {
    const { files, snapshots } = collect(i.dataDir, { includeBrowser: i.includeBrowser, platform: i.platform ?? process.platform, env: i.env ?? process.env }, work);
    const all = [...snapshots, ...files];
    const manifestFiles: BundleFile[] = [];
    for (const f of all) {
      const h = f.data ? { size: f.data.length, sha256: hashBytes(f.data) } : await hashFile(f.abs!);
      manifestFiles.push({ path: f.path, size: h.size, sha256: h.sha256, mode: 0o600, ...(f.relock ? { relock: f.relock } : {}) });
    }
    const log = logFacts(join(work, "ducter.db"));
    const manifest: BundleManifest = {
      v: 1,
      createdAt: new Date(i.now ?? Date.now()).toISOString(),
      from: i.from,
      log,
      files: manifestFiles,
      goes: i.goes,
      redo: i.redo,
      stays: i.stays,
      notes: i.notes,
      notCarried: ["browser-profiles when not the same system", "saved/key", "kept-keys", "task-keys", "key-grants.json", "phone", "handsets.json", "own-phone.json", "bin", "browser", "checks", "doctor-data", "scratch", "tools", "updates", "web-look", "logs"],
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(manifestBytes.length, 0);

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const params = { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p };
    const key = keyOf(i.passphrase, { ...params, salt: salt.toString("base64") })!;
    // The header carries the KDF parameters and a short key check (wrong passphrase vs a changed
    // file); it carries no name, no count and no passphrase. AAD binds it to the ciphertext.
    const header: Header = { v: 1, kdf: KDF, ...params, salt: salt.toString("base64"), cipher: CIPHER, iv: iv.toString("base64"), check: checkOf(key), createdAt: manifest.createdAt };
    const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
    const hlen = Buffer.alloc(4);
    hlen.writeUInt32BE(headerBytes.length, 0);

    writeFileSync(tmp, Buffer.concat([MAGIC, hlen, headerBytes]), { flag: "wx", mode: 0o600 });
    const cipher = createCipheriv(CIPHER, key, iv);
    cipher.setAAD(headerBytes);

    async function* body() {
      yield lenBuf;
      yield manifestBytes;
      for (let n = 0; n < all.length; n++) {
        const f = all[n]!;
        const want = manifestFiles[n]!;
        if (f.data) {
          if (hashBytes(f.data) !== want.sha256) throw Object.assign(new Error(`changed: ${f.path}`), { code: "changed", path: f.path });
          yield f.data;
          continue;
        }
        const h = createHash("sha256");
        let size = 0;
        for await (const chunk of createReadStream(f.abs!)) {
          const b = chunk as Buffer;
          size += b.length;
          h.update(b);
          yield b;
        }
        if (size !== want.size || h.digest("hex") !== want.sha256) throw Object.assign(new Error(`changed: ${f.path}`), { code: "changed", path: f.path });
      }
    }

    const tagAdder = new Transform({
      transform(chunk, _enc, cb) {
        cb(null, chunk);
      },
      flush(cb) {
        this.push(cipher.getAuthTag());
        cb();
      },
    });
    await pipeline(Readable.from(body()), cipher, tagAdder, createWriteStream(tmp, { flags: "a" }));
    chmodSync(tmp, 0o600);
    if (existsSync(out)) return { ok: false, error: "exists", file: out };
    renameSync(tmp, out);
    written = true;
    return { ok: true, manifest, bytes: statSync(out).size, files: manifestFiles.length, events: log.events };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "changed") return { ok: false, error: "changed", detail: (e as { path?: string }).path };
    if (code === "no_autofill_key") return { ok: false, error: "no_autofill_key" };
    if (code === "autofill_damaged") return { ok: false, error: "autofill_damaged" };
    if ((e as { code?: string }).code === "EEXIST") return { ok: false, error: "exists", file: out };
    return { ok: false, error: "write", detail: (e as Error).message, file: out };
  } finally {
    rmSync(work, { recursive: true, force: true });
    if (!written) rmSync(tmp, { force: true });
  }
}

/** Read a bundle's manifest without its passphrase (its shape and size are not secret). */
export function readBundleInfo(file: string): { createdAt: string; bytes: number } | undefined {
  const h = readHeader(resolve(file));
  return h ? { createdAt: h.header.createdAt, bytes: h.size } : undefined;
}

function freeBytes(dir: string): number | undefined {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return undefined;
  }
}

/** A small buffered reader over the decrypted stream. */
class Reader {
  private buf = Buffer.alloc(0);
  private done = false;
  constructor(private readonly it: AsyncIterator<Buffer>) {}
  async exact(n: number): Promise<Buffer> {
    while (this.buf.length < n) {
      if (this.done) throw new Error("short");
      const r = await this.it.next();
      if (r.done) {
        this.done = true;
        throw new Error("short");
      }
      this.buf = this.buf.length ? Buffer.concat([this.buf, r.value]) : Buffer.from(r.value);
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  /** After the last file: the stream ends here, and GCM checks its tag. */
  async end(): Promise<void> {
    if (this.buf.length) throw new Error("trailing");
    if (!this.done) {
      const r = await this.it.next();
      if (!r.done) throw new Error("trailing");
      this.done = true;
    }
  }
}

/** Receive one bundle into a fresh data folder. Nothing is renamed into place until every check passes. */
export async function readBundle(i: BundleReadInput): Promise<BundleReadResult> {
  const target = resolve(i.dataDir);
  if (existsSync(target) && !statSync(target).isDirectory()) return { ok: false, error: "not_empty" };
  if (homeHasWork(target)) return { ok: false, error: "not_empty" };
  const file = resolve(i.file);
  let h: ParsedHeader | undefined;
  try {
    h = readHeader(file);
  } catch {
    return { ok: false, error: "bad_file" };
  }
  if (!h) return { ok: false, error: "bad_file" };
  let key: Buffer | undefined;
  try {
    key = keyOf(i.passphrase, h.header);
  } catch {
    return { ok: false, error: "bad_file" };
  }
  if (!key || !sameCheck(checkOf(key), h.header.check)) return { ok: false, error: "wrong_passphrase" };

  const parent = dirname(target);
  try {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
  } catch (e) {
    return { ok: false, error: "write", detail: (e as Error).message };
  }
  const staging = mkdtempSync(join(parent, ".ducter-receive-"));
  chmodSync(staging, 0o700);
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(h.header.iv, "base64"));
    decipher.setAAD(h.bytes);
    decipher.setAuthTag(h.tag);
    const body = createReadStream(file, { start: h.offset, end: h.size - 17 });
    const fed = pipeline(body, decipher);
    const reader = new Reader(decipher[Symbol.asyncIterator]() as AsyncIterator<Buffer>);
    let manifest: BundleManifest;
    try {
      const len = (await reader.exact(4)).readUInt32BE(0);
      if (len < 2 || len > 64 * 1024 * 1024) return { ok: false, error: "tampered" };
      manifest = JSON.parse((await reader.exact(len)).toString("utf8")) as BundleManifest;
      if (
        manifest?.v !== 1 ||
        !Array.isArray(manifest.files) ||
        !Array.isArray(manifest.redo) ||
        !Array.isArray(manifest.stays) ||
        !Array.isArray(manifest.notes) ||
        !manifest.from ||
        typeof manifest.from.computer !== "string" ||
        typeof manifest.from.partner !== "string" ||
        !manifest.log ||
        !manifest.log.last ||
        !Number.isSafeInteger(manifest.log.events) ||
        manifest.log.events < 0 ||
        !Number.isSafeInteger(manifest.log.last.seq) ||
        manifest.log.last.seq < 0 ||
        typeof manifest.log.last.hash !== "string"
      )
        return { ok: false, error: "tampered" };
      const seen = new Set<string>();
      for (const f of manifest.files) {
        if (!isSafeRel(f.path) || seen.has(f.path) || (f.relock === "autofill" && !f.path.startsWith("saved/"))) return { ok: false, error: "tampered" };
        if (FORBIDDEN_IN_BUNDLE.has(f.path) || f.path.startsWith("kept-keys/") || f.path.startsWith("task-keys/")) return { ok: false, error: "tampered" };
        seen.add(f.path);
      }
      if (!seen.has("ducter.db")) return { ok: false, error: "tampered" };
      const need = manifest.files.reduce((n, f) => n + Math.max(0, Number(f.size) || 0), 0) + RECEIVE_HEADROOM;
      const free = i.freeBytes ?? freeBytes(parent);
      if (free !== undefined && free < need) return { ok: false, error: "no_space", need, free };
      // Write each file under the staging folder while the ciphertext is still being authenticated.
      for (const f of manifest.files) {
        if (!Number.isSafeInteger(f.size) || f.size < 0) return { ok: false, error: "tampered" };
        const dest = join(staging, f.path);
        mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
        const hh = createHash("sha256");
        let got = 0;
        const ws = createWriteStream(dest, { flags: "wx", mode: 0o600 });
        try {
          while (got < f.size) {
            const n = Math.min(1024 * 1024, f.size - got);
            const b = await reader.exact(n);
            got += b.length;
            hh.update(b);
            if (!ws.write(b)) await new Promise<void>((r) => ws.once("drain", () => r()));
          }
        } finally {
          await new Promise<void>((r, j) => ws.end((e?: Error | null) => (e ? j(e) : r())));
        }
        chmodSync(dest, 0o600);
        if (got !== f.size || hh.digest("hex") !== f.sha256) return { ok: false, error: "tampered" };
      }
      await reader.end();
    } catch (e) {
      // A wrong tag, a short file and a changed manifest all land here. The passphrase's check has
      // already passed, so this is a damaged or changed bundle.
      return { ok: false, error: "tampered" };
    } finally {
      await fed.catch(() => {});
    }

    // The Log's own count and last-event hash, from the imported snapshot.
    const log = logFacts(join(staging, "ducter.db"));
    if (log.events !== manifest.log.events || log.last.seq !== manifest.log.last.seq || log.last.hash !== manifest.log.last.hash) return { ok: false, error: "tampered" };

    // Autofill: locked again under this computer's own key (the keychain on a Mac, a key file
    // elsewhere), never under the old home's key.
    const relock = manifest.files.filter((f) => f.relock === "autofill");
    if (relock.length) {
      try {
        const savedDir = join(staging, "saved");
        mkdirSync(savedDir, { recursive: true, mode: 0o700 });
        const key = keySource({ dataDir: target, dir: savedDir, platform: i.platform ?? process.platform, env: i.env ?? process.env }).get(true);
        if (!key) return { ok: false, error: "autofill_key" };
        for (const f of relock) {
          const plain = readFileSync(join(staging, f.path));
          writeFileSync(join(staging, f.path), encryptSaved(plain, key), { mode: 0o600 });
          chmodSync(join(staging, f.path), 0o600);
        }
      } catch {
        return { ok: false, error: "autofill_key" };
      }
    }

    // A marker so this folder is visibly "received, not switched over" until the cut-over slice.
    writeFileSync(join(staging, "move-receiving.json"), JSON.stringify({ v: 1, from: manifest.from, at: manifest.createdAt, log: manifest.log }, null, 2) + "\n", { mode: 0o600 });

    if (homeHasWork(target)) return { ok: false, error: "not_empty" };
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    renameSync(staging, target);
    chmodSync(target, 0o700);
    return { ok: true, manifest, bytes: manifest.files.reduce((n, f) => n + f.size, 0), files: manifest.files.length, events: log.events, relocked: relock.length };
  } catch (e) {
    return { ok: false, error: "write", detail: (e as Error).message };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
