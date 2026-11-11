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

export const MEDIA_LIMITS = {
  /** Pictures (or files) in one message. */
  perMessage: 10,
  /** Files a task shows in one report. */
  perReport: 6,
  /** One upload (a phone sends ≤ 2048 px JPEGs, well under). */
  bytes: 25 * 1024 * 1024,
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

/** A file's size in words a person reads: 820 KB, 3.4 MB. */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
