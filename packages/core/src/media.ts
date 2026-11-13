// D206: the home's media store (design/media.md). Content-addressed: <dataDir>/media/<sha256>.<ext>
// with a small <sha256>.json beside it (type, pixel size, name, the tile rendition, the preview).
//
// The home keeps bytes only; it never decodes or re-encodes a picture. The client that sends a
// picture already scaled it (2048 px long edge, JPEG, EXIF gone) and made the tile rendition and
// the ~16 px preview with its own canvas, so the home needs no image library (none that is pure
// and fast enough exists for Bun, and a native one breaks `bun build --compile`). A picture a task
// shows arrives as it is; its size is read from its header.
//
//   POST /api/media            (behind the gate) multipart: file, thumb?, preview?, name?
//                              → { media: MediaRef }; 413 too big, 415 not a picture
//   GET  /media/<id>?k=<key>   (before the gate: an <img> sends no header) the bytes, immutable
//
// A key is `<exp>.<sig>`, an HMAC of `<id>.<exp>` with the home's own secret (<dataDir>/media/.key,
// 0600): only someone who got the ref through the gate can fetch it, an id alone proves nothing,
// and it stops opening after about a day (D242, MEDIA_KEY). The home signs refs afresh as they
// leave for a client (`fresh`, in ws.ts's send), so what the Log keeps never decides; a client
// past its keys asks for new ones (`keysFor`). A key from before (a bare HMAC of the id) opens for
// MEDIA_KEY.legacyDays after this home's first expiring key (<dataDir>/media/.keys-expire), then never.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { EXT_OF, FILE_TYPES, MEDIA_KEY, MEDIA_LIMITS, TEXT_EXTS, isImageType, type MediaRef } from "@ducter/protocol";

export interface Sniffed {
  type: string;
  w?: number;
  h?: number;
}

const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const be32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** A JPEG's EXIF orientation (1 when none): 5–8 mean the picture stands turned a quarter. */
function jpegOrientation(b: Uint8Array, at: number, len: number): number {
  if (ascii(b, at, 4) !== "Exif") return 1;
  const t = at + 6;
  const le = b[t] === 0x49;
  const u16 = (i: number) => (le ? le16(b, i) : be16(b, i));
  const u32 = (i: number) => (le ? (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0 : be32(b, i));
  const ifd = t + u32(t + 4);
  if (ifd + 2 > at + len) return 1;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > b.length) break;
    if (u16(e) === 0x0112) return u16(e + 8) || 1;
  }
  return 1;
}

/** The type and pixel size of a picture from its first bytes; undefined when it isn't one we show. */
export function sniffImage(b: Uint8Array): Sniffed | undefined {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { type: "image/png", w: be32(b, 16), h: be32(b, 20) };
  if (b.length >= 10 && ascii(b, 0, 3) === "GIF") return { type: "image/gif", w: le16(b, 6), h: le16(b, 8) };
  if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 ") return { type: "image/webp", w: le16(b, 26) & 0x3fff, h: le16(b, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { type: "image/webp", w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { type: "image/webp", w: le24(b, 24) + 1, h: le24(b, 27) + 1 };
    return { type: "image/webp" };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    let orient = 1;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return { type: "image/jpeg" };
      const m = b[i + 1]!;
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
        i += 2;
        continue;
      }
      const len = be16(b, i + 2);
      if (m === 0xe1) orient = jpegOrientation(b, i + 4, len - 2);
      // Start of frame (any SOFn but DHT, JPG and DAC): height, then width.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const h = be16(b, i + 5);
        const w = be16(b, i + 7);
        return orient >= 5 && orient <= 8 ? { type: "image/jpeg", w: h, h: w } : { type: "image/jpeg", w, h };
      }
      i += 2 + len;
    }
    return { type: "image/jpeg" };
  }
  return undefined;
}

/** What a file a task shows is: a picture by its bytes, else a known kind by its name. */
export function sniffFile(b: Uint8Array, name: string): Sniffed | undefined {
  const img = sniffImage(b);
  if (img) return img;
  const ext = extname(name).slice(1).toLowerCase();
  // D239: a report, a log, a script or source is text: kept as text/plain (never run, never a
  // page), its name's extension colouring it in the viewer. Text has no NUL in its first 8 KB.
  if (!FILE_TYPES[ext] && TEXT_EXTS.has(ext)) return b.subarray(0, 8192).includes(0) ? undefined : { type: "text/plain" };
  const t = FILE_TYPES[ext];
  if (!t) return undefined;
  if (t === "application/pdf" && ascii(b, 0, 4) !== "%PDF") return undefined;
  if (t.includes("zip") || t.includes("openxmlformats")) if (!(b[0] === 0x50 && b[1] === 0x4b)) return undefined;
  return { type: t };
}

const ID = /^[0-9a-f]{64}$/;
const PREVIEW = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export interface PutOptions {
  name?: string;
  preview?: string;
  thumb?: Uint8Array;
  from?: { taskId: string };
  /** Files besides pictures (a task's report); uploads take pictures only (phase 1). */
  files?: boolean;
}

export class MediaError extends Error {
  constructor(
    public status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

export interface MediaStore {
  dir: string;
  put(bytes: Uint8Array, o?: PutOptions): MediaRef;
  /** A file on this machine (a task's report): copied in. */
  putFile(path: string, o?: Omit<PutOptions, "thumb">): MediaRef;
  get(id: string): MediaRef | undefined;
  /** Refs for ids a client sent; throws on one this home doesn't hold. */
  refs(ids: unknown): MediaRef[];
  /** The file a ref's bytes are in. */
  path(id: string): string | undefined;
  /** A key for id, good for at least MEDIA_KEY.hours from now. */
  key(id: string): string;
  verify(id: string, k: string): boolean;
  /** D242: v with every media ref in it (any `media` list, a ref's `thumb`) carrying a fresh key; v itself when it holds none. */
  fresh<T>(v: T): T;
  /** D242: fresh keys for the ids this home holds (others left out), at most MEDIA_KEY.perAsk. */
  keysFor(ids: unknown): Record<string, string>;
  /** GET /media/<id>?k=: the bytes (undefined for any other path). */
  serve(req: Request): Promise<Response | undefined>;
  /** POST /api/media, after the gate. */
  upload(req: Request): Promise<Response>;
}

interface Meta {
  type: string;
  bytes: number;
  w?: number;
  h?: number;
  name?: string;
  thumb?: string;
  preview?: string;
  from?: { taskId: string };
  at: string;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export interface MediaStoreOptions {
  /** The clock, in ms (tests). */
  now?: () => number;
}

const HOUR = 3600_000;

export function createMediaStore(dataDir: string, opts: MediaStoreOptions = {}): MediaStore {
  const now = opts.now ?? Date.now;
  const dir = join(dataDir, "media");
  let secret: Buffer | undefined;
  const keyOf = () => {
    if (secret) return secret;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const f = join(dir, ".key");
    try {
      secret = readFileSync(f);
      if (secret.length >= 32) return secret;
    } catch {}
    secret = randomBytes(32);
    writeFileSync(f, secret, { mode: 0o600 });
    try {
      chmodSync(f, 0o600);
    } catch {}
    return secret;
  };
  const sig = (msg: string) => createHmac("sha256", keyOf()).update(msg).digest("base64url").slice(0, 22);
  // When this home first signed a key that expires: pre-D242 keys open until legacyDays after it.
  let first: number | undefined;
  const since = () => {
    if (first !== undefined) return first;
    const f = join(dir, ".keys-expire");
    try {
      const n = Number(readFileSync(f, "utf8").trim());
      if (Number.isFinite(n) && n > 0) return (first = n);
    } catch {}
    first = now();
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(f, String(first), { mode: 0o600 });
    } catch {}
    return first;
  };
  // D242: every key signed within one window ends at the same time, at least MEDIA_KEY.hours on.
  const key = (id: string) => {
    const w = MEDIA_KEY.windowHours * HOUR;
    const exp = Math.floor((Math.floor(now() / w) * w + w + MEDIA_KEY.hours * HOUR) / 1000).toString(36);
    since();
    return `${exp}.${sig(`${id}.${exp}`)}`;
  };
  const same = (a: string, b: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const verify = (id: string, k: string) => {
    if (!ID.test(id) || typeof k !== "string" || !k || k.length > 64) return false;
    const dot = k.indexOf(".");
    if (dot < 0) return now() < since() + MEDIA_KEY.legacyDays * 24 * HOUR && same(sig(id), k);
    const exp = k.slice(0, dot);
    if (!/^[0-9a-z]{1,10}$/.test(exp) || parseInt(exp, 36) * 1000 <= now()) return false;
    return same(sig(`${id}.${exp}`), k.slice(dot + 1));
  };
  const isRef = (v: unknown): v is { id: string; k: string } =>
    !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" && ID.test((v as { id: string }).id) && typeof (v as { k?: unknown }).k === "string";
  const freshRef = (r: { id: string; k: string; thumb?: unknown }) => ({ ...r, k: key(r.id), ...(isRef(r.thumb) ? { thumb: { ...r.thumb, k: key(r.thumb.id) } } : {}) });
  /** Walks v; a list under a `media` key (or a lone ref there) is signed afresh. Unchanged parts are shared. */
  const walkFresh = (v: unknown, at: string): unknown => {
    if (!v || typeof v !== "object") return v;
    if (at === "media") {
      if (Array.isArray(v)) return v.map((r) => (isRef(r) ? freshRef(r) : r));
      if (isRef(v)) return freshRef(v);
    }
    if (Array.isArray(v)) {
      let out: unknown[] | undefined;
      v.forEach((x, i) => {
        const y = walkFresh(x, "");
        if (y !== x) (out ??= v.slice())[i] = y;
      });
      return out ?? v;
    }
    let out: Record<string, unknown> | undefined;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!x || typeof x !== "object") continue;
      const y = walkFresh(x, k);
      if (y !== x) (out ??= { ...(v as Record<string, unknown>) })[k] = y;
    }
    return out ?? v;
  };
  const fresh = <T>(v: T): T => walkFresh(v, "") as T;
  const metaPath = (id: string) => join(dir, `${id}.json`);
  const readMeta = (id: string): Meta | undefined => {
    if (!ID.test(id)) return undefined;
    try {
      return JSON.parse(readFileSync(metaPath(id), "utf8")) as Meta;
    } catch {
      return undefined;
    }
  };
  const fileOf = (id: string, type: string) => join(dir, `${id}.${EXT_OF[type] ?? "bin"}`);
  const refOf = (id: string, m: Meta): MediaRef => ({
    id,
    type: m.type,
    bytes: m.bytes,
    ...(m.w && m.h ? { w: m.w, h: m.h } : {}),
    ...(m.name ? { name: m.name } : {}),
    k: key(id),
    ...(m.thumb ? { thumb: { id: m.thumb, k: key(m.thumb) } } : {}),
    ...(m.preview ? { preview: m.preview } : {}),
    ...(m.from ? { from: m.from } : {}),
  });
  const writeAtomic = (p: string, data: Uint8Array | string) => {
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, p);
  };

  /** Stores the bytes once; a second copy of the same bytes keeps the first's meta, adding what it lacked. */
  function store(bytes: Uint8Array, s: Sniffed, extra: Partial<Meta>): string {
    // D255: a video (a recording of a lent phone's screen) may be larger than a picture.
    if (bytes.length > (s.type.startsWith("video/") ? MEDIA_LIMITS.video : MEDIA_LIMITS.bytes)) throw new MediaError(413, "too big");
    const id = createHash("sha256").update(bytes).digest("hex");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const prior = readMeta(id);
    const f = fileOf(id, s.type);
    if (!prior || !existsSync(f)) writeAtomic(f, bytes);
    const meta: Meta = {
      ...(prior ?? { type: s.type, bytes: bytes.length, ...(s.w && s.h ? { w: s.w, h: s.h } : {}), at: new Date().toISOString() }),
    };
    for (const k of ["name", "thumb", "preview", "from"] as const) if (extra[k] && !meta[k]) (meta as any)[k] = extra[k];
    if (!prior || JSON.stringify(prior) !== JSON.stringify(meta)) writeAtomic(metaPath(id), JSON.stringify(meta));
    return id;
  }

  function put(bytes: Uint8Array, o: PutOptions = {}): MediaRef {
    const name = o.name ? basename(o.name).slice(0, 120) : undefined;
    const s = o.files ? sniffFile(bytes, name ?? "") : sniffImage(bytes);
    if (!s) throw new MediaError(415, o.files ? "not a picture or a file Ducter shows" : "not a picture");
    let thumb: string | undefined;
    if (o.thumb && o.thumb.length && isImageType(s.type)) {
      const ts = sniffImage(o.thumb);
      if (ts) thumb = store(o.thumb, ts, {});
    }
    const preview = o.preview && o.preview.length <= MEDIA_LIMITS.preview && PREVIEW.test(o.preview) ? o.preview : undefined;
    const id = store(bytes, s, { ...(name ? { name } : {}), ...(thumb ? { thumb } : {}), ...(preview ? { preview } : {}), ...(o.from ? { from: o.from } : {}) });
    return refOf(id, readMeta(id)!);
  }

  return {
    dir,
    put,
    putFile(path, o = {}) {
      const st = statSync(path);
      if (!st.isFile()) throw new MediaError(400, "not a file");
      if (st.size > (/\.(mp4|mov)$/i.test(path) ? MEDIA_LIMITS.video : MEDIA_LIMITS.bytes)) throw new MediaError(413, "too big");
      return put(new Uint8Array(readFileSync(path)), { ...o, name: o.name ?? basename(path) });
    },
    get(id) {
      const m = readMeta(id);
      return m ? refOf(id, m) : undefined;
    },
    refs(ids) {
      if (ids === undefined || ids === null) return [];
      if (!Array.isArray(ids)) throw new Error("media must be a list of ids");
      const out: MediaRef[] = [];
      for (const id of ids.slice(0, MEDIA_LIMITS.perMessage)) {
        const m = typeof id === "string" ? readMeta(id) : undefined;
        if (!m) throw new Error("A picture didn't arrive. Send it again.");
        if (!out.some((r) => r.id === id)) out.push(refOf(id, m));
      }
      return out;
    },
    path(id) {
      const m = readMeta(id);
      if (!m) return undefined;
      const f = fileOf(id, m.type);
      return existsSync(f) ? f : undefined;
    },
    key,
    verify,
    fresh,
    keysFor(ids) {
      const out: Record<string, string> = {};
      if (!Array.isArray(ids)) return out;
      for (const id of ids.slice(0, MEDIA_KEY.perAsk)) if (typeof id === "string" && ID.test(id) && existsSync(metaPath(id))) out[id] = key(id);
      return out;
    },
    async serve(req) {
      if (req.method !== "GET" && req.method !== "HEAD") return;
      const url = new URL(req.url);
      const m = /^\/media\/([0-9a-f]{64})$/.exec(url.pathname);
      if (!m) return;
      const id = m[1]!;
      const meta = readMeta(id);
      // Nothing says whether a picture is here to someone without its key.
      if (!meta || !verify(id, url.searchParams.get("k") ?? "")) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
      const f = fileOf(id, meta.type);
      if (!existsSync(f)) return new Response("not found", { status: 404 });
      const headers: Record<string, string> = {
        "content-type": meta.type,
        // The bytes behind an id never change.
        "cache-control": "private, max-age=31536000, immutable",
        etag: `"${id.slice(0, 32)}"`,
        "x-content-type-options": "nosniff",
        // A file a task showed opens as a download, never as a page of this origin.
        "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      };
      // &dl=1 is a download whatever the kind (D239: it said "inline" for every file that wasn't a
      // picture, so a report opened as a bare page of the home's address).
      const dl = url.searchParams.get("dl") === "1";
      if (dl || !isImageType(meta.type)) headers["content-disposition"] = `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(meta.name ?? `${id.slice(0, 12)}.${EXT_OF[meta.type] ?? "bin"}`)}`;
      if (req.headers.get("if-none-match") === headers.etag) return new Response(null, { status: 304, headers });
      return new Response(Bun.file(f), { headers });
    },
    async upload(req) {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MEDIA_LIMITS.bytes * 1.3) return json(413, { error: "too big" });
      let form: Awaited<ReturnType<Request["formData"]>>;
      try {
        form = await req.formData();
      } catch {
        return json(400, { error: "expected multipart form data" });
      }
      const file = form.get("file");
      if (!file || typeof file === "string") return json(400, { error: "no file" });
      const thumb = form.get("thumb");
      const preview = form.get("preview");
      const name = form.get("name");
      try {
        const ref = put(new Uint8Array(await file.arrayBuffer()), {
          ...(typeof name === "string" && name ? { name } : file.name && file.name !== "blob" ? { name: file.name } : {}),
          ...(thumb && typeof thumb !== "string" ? { thumb: new Uint8Array(await thumb.arrayBuffer()) } : {}),
          ...(typeof preview === "string" ? { preview } : {}),
        });
        return json(200, { media: ref });
      } catch (err) {
        if (err instanceof MediaError) return json(err.status, { error: err.message });
        throw err;
      }
    },
  };
}
