// D206: pictures and files in the conversation and in a task (design/media.md).
//
// Media is content-addressed on the home: <dataDir>/media/<sha256>.<ext>, uploaded once over
// HTTP (POST /api/media) and referenced by id everywhere else. The Log records refs, never
// bytes. A ref carries everything a client needs to lay it out before a byte arrives (its
// pixel size and a ~16 px preview), and the key that lets an <img> fetch it without a header
// (GET /media/<id>?k=<key>; a key is an HMAC of the id with the home's own secret).

/** The image types every client shows and every agent that sees images reads. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** File types a task may show besides images (one-line file cards); anything else is refused. */
export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  svg: "image/svg+xml",
  zip: "application/zip",
  mp4: "video/mp4",
  mov: "video/quicktime",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * D239: text a task may show besides the kinds above, kept as text/plain (served as text, never
 * run, never rendered): reports, logs, scripts and source. Its name keeps the extension, which
 * picks the colours in the viewer. Never .env or a key file: what looks like a secret stays home.
 */
export const TEXT_EXTS: ReadonlySet<string> = new Set([
  "log", "diff", "patch", "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "go", "py", "rb", "rs", "swift", "kt", "kts", "java",
  "c", "h", "cc", "cpp", "hpp", "m", "cs", "css", "scss", "less", "vue", "svelte", "xml", "yml", "yaml", "toml", "ini", "sh", "bash",
  "zsh", "fish", "sql", "mdx", "markdown", "jsonc", "tsv", "rst", "tex", "graphql", "proto",
]);

export const MEDIA_LIMITS = {
  /** Pictures (or files) in one message. */
  perMessage: 10,
  /** Files a task shows in one report. */
  perReport: 6,
  /** One upload (a phone sends ≤ 2048 px JPEGs, well under). */
  bytes: 25 * 1024 * 1024,
  /** D255: a video (a recording of a lent phone's screen, ≤ 8 minutes at ~1.5 Mbit/s). */
  video: 100 * 1024 * 1024,
  /** A tiny preview, as a data: URL. */
  preview: 4096,
  /** The long edge a phone or the Mac scales a picture down to before sending. */
  longEdge: 2048,
  /** The long edge of the thumbnail rendition a client makes for tiles. */
  thumbEdge: 720,
} as const;

/** One picture or file, as a message, a report or a task's line carries it. */
export interface MediaRef {
  /** sha256 of the bytes, hex. */
  id: string;
  /** Media type, read from the bytes (never the uploader's word). */
  type: string;
  bytes: number;
  /** Pixel size (images). */
  w?: number;
  h?: number;
  /** A file's name (file cards, Save). */
  name?: string;
  /** The URL key: GET /media/<id>?k=<k>. */
  k: string;
  /** A smaller rendition for tiles (≤ 720 px long edge), when the sender made one. */
  thumb?: { id: string; k: string };
  /** A ~16 px preview as a data: URL, shown blurred until the picture loads. */
  preview?: string;
  /** The task that made it (a report's media): the viewer's 来自 {task} / From {task}. */
  from?: { taskId: string };
}

export function isImageType(t: string | undefined): t is ImageType {
  return !!t && (IMAGE_TYPES as readonly string[]).includes(t);
}

export function isImage(m: Pick<MediaRef, "type">): boolean {
  return isImageType(m.type);
}

export const EXT_OF: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  ...Object.fromEntries(Object.entries(FILE_TYPES).map(([e, t]) => [t, e])),
};

/**
 * D242: a media key expires. `k` is `<exp>.<sig>`: exp in seconds since the epoch, base 36, and an
 * HMAC of `<id>.<exp>` with the home's secret. The home signs every ref afresh as it leaves for a
 * client (the Log keeps ids; a key in it is never what a client gets), each good for a day and
 * the same through one window of hours (so a URL stays one cache entry for that long). A client
 * holding one past its time asks again over its own connection (`media_keys`). Keys from before
 * (a bare HMAC of the id, no expiry) still open for `legacyDays` after the home first signs this
 * way, then never.
 */
export const MEDIA_KEY = {
  /** At least this long a key opens. */
  hours: 24,
  /** Keys signed within one such window are the same (and end together). */
  windowHours: 6,
  /** A pre-D242 key keeps working this long after the home's first expiring key. */
  legacyDays: 7,
  /** Ids one media_keys frame may ask for. */
  perAsk: 200,
} as const;

/** When a key stops opening, in ms since the epoch; undefined for a key that names no time (pre-D242). */
export function keyExpires(k: string): number | undefined {
  const dot = k.indexOf(".");
  if (dot <= 0) return undefined;
  const s = parseInt(k.slice(0, dot), 36);
  return Number.isFinite(s) ? s * 1000 : undefined;
}

/** True when a key is past its time, or will be within `marginMs`. */
export function keyStale(k: string, now: number, marginMs = 60_000): boolean {
  const e = keyExpires(k);
  return e !== undefined && e - marginMs <= now;
}

/** The path a ref is served at, relative to the home's origin. */
export function mediaPath(m: { id: string; k: string }): string {
  return `media/${m.id}?k=${m.k}`;
}

/** The tile rendition when there is one, else the picture itself. */
export function thumbPath(m: MediaRef): string {
  return mediaPath(m.thumb ?? m);
}

/** A short form of an id for an agent to name a picture by (12 hex). */
export function shortId(id: string): string {
  return id.slice(0, 12);
}

// ---------- The grid (the same rules on the web, the phone and the Mac) ----------

/** One tile of a message's pictures, in a 0..1 box over the grid's width (y in widths too). */
export interface Tile {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** "+n" on the last tile when more pictures follow than show. */
  more?: number;
}

export interface GridLayout {
  tiles: Tile[];
  /** The grid's height over its width. */
  aspect: number;
  /** One picture: its own shape (the grid is the picture). */
  single: boolean;
}

/** How tall a single picture may stand, over its width (a longer screenshot is cut to this). A
 *  single picture keeps its shape: clients size it to fit both the width and the height they allow. */
export const SINGLE_MAX_ASPECT = 3;
/** How wide a single picture may lie (a panorama keeps at least this much height). */
export const SINGLE_MIN_ASPECT = 9 / 21;

/**
 * The tiles of n pictures (D206): one at its own aspect ratio (clamped to 21:9…1:3); two side by
 * side; three as one tall and two stacked; four as 2×2; more than four shows the first four with
 * "+n" on the last. Gaps are the client's (a token); this gives proportions only.
 */
export function gridLayout(sizes: { w?: number; h?: number }[]): GridLayout {
  const n = sizes.length;
  if (n === 0) return { tiles: [], aspect: 0, single: false };
  if (n === 1) {
    const s = sizes[0]!;
    const a = s.w && s.h ? s.h / s.w : 3 / 4;
    const aspect = Math.min(SINGLE_MAX_ASPECT, Math.max(SINGLE_MIN_ASPECT, a));
    return { tiles: [{ i: 0, x: 0, y: 0, w: 1, h: aspect }], aspect, single: true };
  }
  if (n === 2) {
    const aspect = 1 / 2;
    return {
      tiles: [
        { i: 0, x: 0, y: 0, w: 0.5, h: aspect },
        { i: 1, x: 0.5, y: 0, w: 0.5, h: aspect },
      ],
      aspect,
      single: false,
    };
  }
  if (n === 3) {
    const aspect = 2 / 3;
    return {
      tiles: [
        { i: 0, x: 0, y: 0, w: 2 / 3, h: aspect },
        { i: 1, x: 2 / 3, y: 0, w: 1 / 3, h: aspect / 2 },
        { i: 2, x: 2 / 3, y: aspect / 2, w: 1 / 3, h: aspect / 2 },
      ],
      aspect,
      single: false,
    };
  }
  const aspect = 1;
  const tiles: Tile[] = [0, 1, 2, 3].map((i) => ({ i, x: (i % 2) / 2, y: Math.floor(i / 2) / 2, w: 0.5, h: 0.5 }));
  if (n > 4) tiles[3]!.more = n - 4;
  return { tiles, aspect, single: false };
}

// ---------- The file viewer (D239) ----------

/** How a file a task showed opens inside Ducter. */
export type FileView = "markdown" | "table" | "text" | "picture" | "video" | "pdf" | "none";

/** The text the viewer reads of a file: more is cut at a line, and Save a copy has all of it. */
export const FILE_VIEW_BYTES = 1024 * 1024;
/** Rows a table (CSV) shows before the rest is left to Save a copy. */
export const FILE_VIEW_ROWS = 2000;

const extOf = (name?: string) => {
  const n = (name ?? "").toLowerCase();
  return n.includes(".") ? n.split(".").pop()! : "";
};

/** Which viewer a file opens in: rendered Markdown, a table, coloured text, a picture, a video, a PDF's pages (D242), or none (Office, zip). */
export function fileView(m: { type: string; name?: string }): FileView {
  const ext = extOf(m.name);
  if (m.type === "text/markdown" || (m.type === "text/plain" && (ext === "markdown" || ext === "mdx"))) return "markdown";
  if (m.type === "text/csv" || (m.type === "text/plain" && ext === "tsv")) return "table";
  if (m.type === "text/plain" || m.type === "application/json" || m.type === "text/html") return "text";
  if (m.type === "image/svg+xml" || isImageType(m.type)) return "picture";
  if (m.type.startsWith("video/")) return "video";
  if (m.type === "application/pdf") return "pdf";
  return "none";
}

/** The column separator of a table file: a tab for .tsv, else a comma. */
export const tableSep = (name?: string) => (extOf(name) === "tsv" ? "\t" : ",");

/**
 * The text of a file's first bytes, cut at the last whole line when the file is longer than what
 * was read (a UTF-8 character or a line never shows half).
 */
export function viewText(bytes: Uint8Array, total: number): { text: string; cut: boolean } {
  const cut = total > bytes.length;
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (cut) {
    const nl = text.lastIndexOf("\n");
    text = nl > 0 ? text.slice(0, nl) : text.replace(/�+$/, "");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text: text.replace(/\r\n?/g, "\n"), cut };
}

/** Rows of CSV (or TSV): quotes, doubled quotes and line breaks inside quotes; at most `max` rows. */
export function parseTable(text: string, sep = ",", max = FILE_VIEW_ROWS): { rows: string[][]; more: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") q = true;
    else if (ch === sep) row.push(cell), (cell = "");
    else if (ch === "\n") {
      row.push(cell), (cell = "");
      rows.push(row), (row = []);
      if (rows.length > max) return { rows: rows.slice(0, max), more: true };
    } else cell += ch;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows.length > max ? { rows: rows.slice(0, max), more: true } : { rows, more: false };
}

/** A file's size in words a person reads: 820 KB, 3.4 MB. */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
