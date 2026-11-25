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
  // D286: a voice memo or a song plays in its card and in the viewer.
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
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
  /** One picture, or a file a task shows (a phone sends ≤ 2048 px JPEGs, well under). */
  bytes: 25 * 1024 * 1024,
  /**
   * D259: one file a person sends (anything but a picture). Under Cloudflare's 100 MB request cap
   * on a From-anywhere tunnel (D228) and Bun's 128 MB body cap with room to spare, and held in
   * memory once on the home while it is stored.
   */
  file: 50 * 1024 * 1024,
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
  /**
   * D439: the same document as pages (a PDF of this Office file the task showed with it, same
   * name): the card's glimpse and the viewer draw these; Save keeps the file itself.
   */
  pages?: { id: string; k: string; bytes: number; n?: number };
}

export function isImageType(t: string | undefined): t is ImageType {
  return !!t && (IMAGE_TYPES as readonly string[]).includes(t);
}

export function isImage(m: Pick<MediaRef, "type">): boolean {
  return isImageType(m.type);
}

/** D259: what a file a person sent is stored as when it is no kind Ducter knows: inert bytes, never run, served as a download. */
export const ANY_FILE = "application/octet-stream";

export const EXT_OF: Record<string, string> = {
  [ANY_FILE]: "bin",
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

/** D286: the rows of 5 to 9 pictures, top to bottom: how many sit side by side in each row. */
export const GRID_ROWS: Record<number, number[]> = { 5: [2, 3], 6: [3, 3], 7: [1, 3, 3], 8: [2, 3, 3], 9: [3, 3, 3] };
/** D286: the most tiles a message shows; more shows "+n" on the last (a message holds at most 10). */
export const GRID_MAX = 9;

/** How tall a row of k pictures stands, over the grid's width: one alone is a 2:1 banner, else squares. */
const rowH = (k: number) => (k === 1 ? 1 / 2 : 1 / k);

/**
 * The tiles of n pictures (D206, D286): one at its own aspect ratio (clamped to 21:9…1:3); two side
 * by side; three as one tall and two stacked; four as 2×2; five to nine in rows (GRID_ROWS: 2+3,
 * 3+3, a banner over 3+3, 2+3+3, 3×3), so every picture of a trip shows; more than nine shows nine
 * with "+n" on the last. Gaps are the client's (a token); this gives proportions only.
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
  if (n === 4) {
    const tiles: Tile[] = [0, 1, 2, 3].map((i) => ({ i, x: (i % 2) / 2, y: Math.floor(i / 2) / 2, w: 0.5, h: 0.5 }));
    return { tiles, aspect: 1, single: false };
  }
  const rows = GRID_ROWS[Math.min(n, GRID_MAX)]!;
  const tiles: Tile[] = [];
  let y = 0;
  for (const k of rows) {
    const h = rowH(k);
    for (let j = 0; j < k; j++) tiles.push({ i: tiles.length, x: j / k, y, w: 1 / k, h });
    y += h;
  }
  if (n > GRID_MAX) tiles[tiles.length - 1]!.more = n - GRID_MAX;
  return { tiles, aspect: y, single: false };
}

// ---------- The file viewer (D239) ----------

/** How a file a task showed opens inside Ducter. */
export type FileView = "markdown" | "table" | "text" | "picture" | "video" | "audio" | "pdf" | "none";

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
  if (m.type.startsWith("audio/")) return "audio";
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

/**
 * D567: the words of a Markdown mark removed: a link or a picture as its words, code, emphasis and
 * tags as their text, escapes undone, runs of space as one. `DocPlain` in the Mac's protocol.
 */
export function docPlain(s: string): string {
  return s
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1")
    .replace(/<(https?:[^>\s]+)>/g, "$1")
    .replace(/<\/?[A-Za-z][^>\n]*>/g, "")
    .replace(/`+([^`\n]+?)`+/g, "$1")
    .replace(/\*\*|__|~~/g, "")
    .replace(/(^|[\s(（「“])[*_]([^*_\s](?:[^*_\n]*[^*_\s])?)[*_]([\s.,;:!?，。；：！？)）」”]|$)/g, "$1$2$3")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many characters a glimpse keeps of a line. */
const DOC_GLIMPSE_CHARS = 200;

/**
 * D567: the rendered start of a Markdown file for its card: its title (the first heading, when the
 * document starts with one) and its first lines of text with every mark removed (never `#`, `**`,
 * `---`, a table or a fence). Front matter, rules, tables, code, comments and blank lines are
 * passed over; a list item or a quote is its words. `DocGlimpse` in the Mac's protocol.
 */
export function docGlimpse(text: string, max = 3): { title: string; lines: string[] } {
  const ls = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  if (ls[0]?.trim() === "---") {
    const end = ls.findIndex((l, k) => k > 0 && (l.trim() === "---" || l.trim() === "..."));
    if (end > 0) i = end + 1;
  }
  let title = "";
  const lines: string[] = [];
  const cut = (s: string) => ([...s].length > DOC_GLIMPSE_CHARS ? [...s].slice(0, DOC_GLIMPSE_CHARS).join("") : s);
  const add = (s: string, heading: boolean) => {
    const p = cut(docPlain(s));
    if (!p) return;
    if (heading && !title && !lines.length) title = p;
    else lines.push(p);
  };
  let fence = "";
  for (; i < ls.length && lines.length < max; i++) {
    const t = ls[i]!.trim();
    if (fence) {
      if (t.startsWith(fence)) fence = "";
      continue;
    }
    if (/^(`{3,}|~{3,})/.test(t)) {
      fence = t.slice(0, 3);
      continue;
    }
    if (!t || /^([-*_])(\s*\1){2,}$/.test(t) || t.startsWith("|") || t.startsWith("<!--") || /^\[[^\]]+\]:\s/.test(t)) continue;
    const h = /^#{1,6}\s+(.*?)\s*#*$/.exec(t);
    if (h) {
      add(h[1]!, true);
      continue;
    }
    // A line underlined with === or --- is a heading (setext).
    const next = ls[i + 1]?.trim() ?? "";
    if (/^(=+|-+)$/.test(next)) {
      add(t, true);
      i++;
      continue;
    }
    add(t.replace(/^(>\s?)+/, "").replace(/^([-*+]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s+/, ""), false);
  }
  return { title, lines };
}

/**
 * D259: a file's kind in words an agent reads ("Markdown", "PDF", "Word document"), from its type
 * and name: the line that names a file the user sent says what it is before anything opens it.
 */
export function kindWords(m: { type: string; name?: string }): string {
  const ext = extOf(m.name);
  const office: Record<string, string> = { docx: "Word document", doc: "Word document", xlsx: "spreadsheet", xls: "spreadsheet", pptx: "slide deck", ppt: "slide deck", key: "Keynote deck", pages: "Pages document", numbers: "Numbers spreadsheet" };
  if (office[ext]) return office[ext]!;
  switch (fileView(m)) {
    case "markdown":
      return "Markdown";
    case "table":
      return ext === "tsv" ? "table (TSV)" : "table (CSV)";
    case "pdf":
      return "PDF";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "picture":
      return m.type === "image/svg+xml" ? "SVG picture" : "picture";
    case "text":
      return m.type === "application/json" ? "JSON" : m.type === "text/html" ? "HTML source" : ext && ext !== "txt" ? `text (.${ext})` : "text";
  }
  if (m.type === "application/zip" || ext === "zip") return "zip archive";
  return ext ? `.${ext} file` : "file";
}

/**
 * D286: the family a file card is drawn as: its badge's colour and mark, and which preview it
 * shows (a PDF's first page, code's first lines, a video's frame, a sound's waveform). By name
 * first (a .ts is code even as text/plain), then by type.
 */
export type FileFamily = "pdf" | "code" | "text" | "doc" | "sheet" | "slides" | "archive" | "audio" | "video" | "picture" | "other";

const FAMILY_EXT: Record<string, FileFamily> = {
  pdf: "pdf",
  md: "text", markdown: "text", mdx: "text", txt: "text", log: "text", rst: "text", tex: "text",
  doc: "doc", docx: "doc", pages: "doc", rtf: "doc", odt: "doc",
  csv: "sheet", tsv: "sheet", xls: "sheet", xlsx: "sheet", numbers: "sheet", ods: "sheet",
  ppt: "slides", pptx: "slides", key: "slides", odp: "slides",
  zip: "archive", tar: "archive", gz: "archive", tgz: "archive", bz2: "archive", xz: "archive", "7z": "archive", rar: "archive", dmg: "archive",
};

export function fileFamily(m: { type: string; name?: string }): FileFamily {
  const ext = extOf(m.name);
  const byExt = FAMILY_EXT[ext];
  if (byExt) return byExt;
  if (m.type === "application/pdf") return "pdf";
  if (m.type.startsWith("audio/")) return "audio";
  if (m.type.startsWith("video/")) return "video";
  if (m.type.startsWith("image/")) return "picture";
  if (m.type === "text/markdown") return "text";
  if (m.type === "text/csv") return "sheet";
  if (m.type === "application/zip") return "archive";
  if (m.type.startsWith("text/") || m.type === "application/json" || TEXT_EXTS.has(ext)) return "code";
  return "other";
}

/**
 * D566: a file worth keeping in the person's Nowledge Mem, by what Mem reads (research/231): its
 * documents, sheets, slides, PDFs, Markdown and text, and code a developer may want found again.
 * Pictures, sounds, videos and archives Mem would store but not read: no offer.
 */
export function memKeeps(m: { type: string; name?: string }): boolean {
  const f = fileFamily(m);
  return f === "pdf" || f === "text" || f === "doc" || f === "sheet" || f === "slides" || f === "code";
}

/**
 * D566: what 做好的文件也存进 Nowledge Mem / Also keep files I make in Nowledge Mem keeps by itself:
 * reports and documents only (a PDF, a document, a sheet, slides, Markdown or plain text), never a
 * log, code, a picture or anything else a task shows along the way.
 */
export function memAutoKeeps(m: { type: string; name?: string }): boolean {
  const f = fileFamily(m);
  if (f === "text") return extOf(m.name) !== "log";
  return f === "pdf" || f === "doc" || f === "sheet" || f === "slides";
}

/**
 * D566: names a file of secrets goes by (keys, credentials, env files): never kept in Mem, on a
 * tap or by itself, whatever is inside (the text check is the home's, the shared detector).
 */
export function secretFileName(name: string | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return /(^|\.)env(\.|$)|\.(pem|key|p12|pfx|keychain|kdbx|gpg)$|^id_(rsa|ed25519|ecdsa|dsa)|credentials|secrets?\.|passwords?\.|\.netrc$|\.npmrc$|\.pgpass$/.test(n);
}

/** D286: the few letters on a file's badge: its extension as a person knows it (PDF, TS, DOCX), at most 4. */
export function fileBadge(m: { type: string; name?: string }): string {
  const ext = extOf(m.name);
  if (ext && ext.length <= 4) return ext.toUpperCase();
  return (EXT_OF[m.type] ?? ext ?? "").toUpperCase().slice(0, 4);
}

/** D286: a sound's or a video's length as a person reads it: 0:07, 3:25, 1:02:09. */
export function durationWords(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** A file's size in words a person reads: 820 KB, 3.4 MB. */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// ---------- a link to a file on the home (D356) ----------

/**
 * Why the home didn't open a linked file (D356): it is gone, outside the task's own folders,
 * over the limit, on a computer that can't be reached, or no such thing here.
 */
export type FileOpenError = "missing" | "outside" | "too_big" | "offline" | "unsupported" | "failed";

/**
 * D356: the path a link in a task's or the partner's words points at, when it names a file
 * rather than a page: `/abs/path`, `file:///abs/path` or `~/path` (percent-escapes decoded, a
 * `#fragment` or `?query` dropped). undefined for a web address, a mail link, `#a-heading` or a
 * relative name.
 */
export function fileLinkPath(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  let s = href.trim();
  if (!s || s.length > 4096) return undefined;
  if (/^file:/i.test(s)) {
    s = s.replace(/^file:(\/\/(localhost)?)?/i, "");
    if (!s.startsWith("/")) return undefined;
  } else if (!s.startsWith("/") && !s.startsWith("~/")) return undefined;
  if (s.startsWith("//")) return undefined; // a protocol-relative web address
  s = s.replace(/[?#].*$/, "");
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (s.includes("\0") || s === "/" || s === "~/") return undefined;
  return s;
}

/** The name a linked file goes by before the home answers (its last path segment). */
export const fileLinkName = (path: string): string => path.replace(/\/+$/, "").split("/").pop() || path;
