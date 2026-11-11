// D206: making a picture ready and sending it up (no JSX, so app.ts and its tests import it).
// See media.tsx for the whole story.
import { MEDIA_LIMITS, type MediaRef } from "@ducter/protocol";
import { A } from "./app.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

// ---------- making a picture ready ----------

export interface Prepared {
  display: Blob;
  thumb?: Blob;
  preview?: string;
  w: number;
  h: number;
}

/** One picture the user picked, from the moment it is picked until its message is sent. */
export interface Pic {
  key: string;
  name: string;
  /** What the phone shows while it goes up (an object URL of the picture as picked). */
  local: string;
  w: number;
  h: number;
  state: "preparing" | "uploading" | "done" | "failed";
  progress: number;
  file: File;
  prepared?: Prepared;
  ref?: MediaRef;
  error?: string;
}

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

export async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close(): void }> {
  // The browser turns the picture upright by its EXIF (from-image), then the EXIF is gone with the re-encode.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch {
    // Safari before 17 can't make a bitmap of some HEIC pictures; an <img> can.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

export async function draw(src: CanvasImageSource, w: number, h: number, edge: number, type: string, q: number, flat: boolean): Promise<{ blob: Blob; w: number; h: number } | undefined> {
  const s = Math.min(1, edge / Math.max(w, h));
  const c = canvasOf(w * s, h * s);
  const g = c.getContext("2d");
  if (!g) return undefined;
  if (flat) {
    // A JPEG has no transparency: what is see-through lands on white, never on black.
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
  }
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  const blob = await toBlob(c, type, q);
  return blob ? { blob, w: c.width, h: c.height } : undefined;
}

/** The picture as it is sent: ≤ 2048 px, metadata gone; a screenshot stays a crisp PNG, a GIF stays moving. */
export async function prepare(file: File): Promise<Prepared> {
  const img = await decode(file);
  try {
    const { w, h } = img;
    const L = MEDIA_LIMITS;
    let display: Blob;
    let size = { w, h };
    if (file.type === "image/gif" && file.size <= L.bytes) display = file;
    else {
      const lossless = file.type === "image/png" || file.type === "image/webp" && file.size < 1024 * 1024;
      const d = lossless ? await draw(img.src, w, h, L.longEdge, "image/png", 1, false) : await draw(img.src, w, h, L.longEdge, "image/jpeg", 0.85, true);
      if (!d) throw new Error("canvas");
      // A big screenshot as PNG can outgrow a photo: past 6 MB it goes as a JPEG.
      const big = lossless && d.blob.size > 6 * 1024 * 1024 ? await draw(img.src, w, h, L.longEdge, "image/jpeg", 0.9, true) : undefined;
      display = (big ?? d).blob;
      size = { w: (big ?? d).w, h: (big ?? d).h };
    }
    let thumb: Blob | undefined;
    if (Math.max(size.w, size.h) > L.thumbEdge * 1.2) {
      const tw = await draw(img.src, w, h, L.thumbEdge, "image/webp", 0.82, false);
      // Safari before 17 answers PNG for webp: a JPEG tile then.
      thumb = tw && tw.blob.type === "image/webp" ? tw.blob : (await draw(img.src, w, h, L.thumbEdge, "image/jpeg", 0.8, true))?.blob;
    }
    const tiny = canvasOf(...fit(w, h, 16));
    const g = tiny.getContext("2d");
    let preview: string | undefined;
    if (g) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, tiny.width, tiny.height);
      g.drawImage(img.src, 0, 0, tiny.width, tiny.height);
      preview = tiny.toDataURL("image/jpeg", 0.6);
      if (preview.length > L.preview) preview = undefined;
    }
    return { display, ...(thumb ? { thumb } : {}), ...(preview ? { preview } : {}), w: size.w, h: size.h };
  } finally {
    img.close();
  }
}

function fit(w: number, h: number, edge: number): [number, number] {
  const s = edge / Math.max(w, h, 1);
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** Uploads one prepared picture (POST /api/media) with progress; resolves with its ref. */
export function upload(p: Prepared, name: string, onProgress: (f: number) => void): Promise<MediaRef> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", p.display, name);
    if (p.thumb) form.set("thumb", p.thumb, "thumb");
    if (p.preview) form.set("preview", p.preview);
    form.set("name", name);
    const x = new XMLHttpRequest();
    x.open("POST", new URL("api/media", A.base).href);
    const tok = A.api?.token();
    if (tok) x.setRequestHeader("authorization", `Bearer ${tok}`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(0.98, e.loaded / e.total));
    x.onerror = () => reject(new Error(t("media.failed")));
    x.ontimeout = () => reject(new Error(t("media.failed")));
    x.timeout = 120_000;
    x.onload = () => {
      let body: { media?: MediaRef; error?: string } = {};
      try {
        body = JSON.parse(x.responseText);
      } catch {}
      if (x.status === 200 && body.media) return resolve(body.media);
      reject(new Error(x.status === 413 ? t("media.tooBig") : x.status === 415 ? t("media.notImage") : t("media.failed")));
    };
    x.send(form);
  });
}


/** Where a picture was opened: every picture of the conversation, or of one task. */
export type ViewCtx = { kind: "conv" } | { kind: "task"; taskId: string };

export interface ViewerState {
  items: MediaRef[];
  index: number;
  ctx: ViewCtx;
  /** The tile it grew out of (for the way back). */
  from?: DOMRect;
}

