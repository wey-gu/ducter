// D206: pictures in the conversation and in a task (design/media.md).
//
// Sending: a picture is made ready on the phone itself (scaled to 2048 px on its long edge,
// re-encoded so nothing of its EXIF, the location included, leaves the phone; HEIC turns into
// JPEG on the way), with a 720 px tile rendition and a ~16 px preview, then uploaded the moment
// it is picked, so Send is instant. Words are never lost: a message whose picture didn't go up
// waits with its words and the picture, and Retry sends both.
//
// Showing: one picture at its own shape, 2–4 in a grid, 5–9 in rows, more as "+n" (gridLayout,
// the same on the Mac); space kept from the known size, a blurred preview clearing into the
// picture. The viewer grows out of the tile, pinches and double-taps to zoom, swipes through every
// picture of the conversation (or the task) with the next one peeking in, and down to close.
//
// D286: nothing blinks or jumps. A picture sent from this device shows its own copy in the bubble
// (never loading a second time), the pictures fly from the tray into their bubble, the ring fills,
// ticks and lets go with a small settle, and every motion is on the motion tokens and still under
// reduced motion.
import { gridLayout, isImage, isImageType, type MediaRef } from "@ducter/protocol";
import { mediaFetch, mediaUrl, refreshKeys } from "./media-fresh.ts";
import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { spoken } from "./format.ts";
import { title } from "./store.ts";
import { picturesIn, viewerKey } from "./media-keys.ts";
import { decode, draw, flights, localOf, type Pic, type ViewCtx } from "./media-up.ts";
import { aliasGlimpse, FileBadge, FileCard } from "./filecard.tsx";
import { MemKeep } from "./mem-keep.tsx";

export { picturesIn, viewerKey };
export { FileCard };
export { prepare, upload, type Pic, type Prepared, type ViewCtx, type ViewerState } from "./media-up.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export const url = (path: string) => new URL(path, A.base).href;

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A motion token in milliseconds (`--t-med` → 320). */
function ms(token: string, fallback: number): number {
  if (typeof getComputedStyle === "undefined") return fallback;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token));
  return Number.isFinite(v) ? v : fallback;
}
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"; // --ease
const SETTLE = "cubic-bezier(0.34, 1.3, 0.64, 1)"; // --spring, softened: a landing, not a bounce

/** Pictures already drawn once on this device: shown again (a re-render, the sent message
 *  replacing its pending one), they are simply there, never fading in a second time. */
const drawn = new Set<string>();

// ---------- the progress ring ----------

/** A thin ring while a picture goes up; once it lands, it closes, ticks and lets go (D286). */
function Ring({ f, done }: { f: number; done?: boolean }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg class={`ring${done ? " done" : ""}`} viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r={r} />
      <circle class="arc" cx="18" cy="18" r={r} style={{ strokeDasharray: `${c}`, strokeDashoffset: `${done ? 0 : c * (1 - Math.max(0.08, f))}` }} />
      {done && <path class="tick" d="M12.2 18.4l3.9 3.9 7.7-8" pathLength={1} />}
    </svg>
  );
}

/** The drawn mark of something that didn't go: a circling arrow (D286). */
function RetryMark() {
  return (
    <svg class="retry-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18.6 9.2A7 7 0 1 0 19 14" />
      <path d="M19.2 4.6v4.8h-4.8" />
    </svg>
  );
}

/** True for a moment after a picture going up lands: the ring ticks, the tile settles. */
function useLanded(p: Pic | undefined): boolean {
  const was = useRef(p?.state);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const before = was.current;
    was.current = p?.state;
    if (p?.state === "done" && (before === "uploading" || before === "preparing")) {
      setLanded(true);
      const id = setTimeout(() => setLanded(false), reduced() ? 400 : 900);
      return () => clearTimeout(id);
    }
  }, [p?.state]);
  return landed;
}

// ---------- tiles ----------

/** What a tile shows: a picture the home holds, or one still on its way up. */
export type Shown = { ref: MediaRef; pic?: undefined } | { pic: Pic; ref?: undefined };

const sizeOf = (s: Shown) => (s.ref ? { w: s.ref.w, h: s.ref.h } : { w: s.pic!.w, h: s.pic!.h });

/** The picture a tile draws: this device's own copy when it sent it, else the home's tile rendition. */
function tileSrc(s: Shown, alone: boolean): string {
  if (s.pic) return s.pic.local;
  const r = s.ref!;
  return localOf.get(r.id) ?? mediaUrl(alone ? r : (r.thumb ?? r));
}

function Tile({ s, style, more, onOpen, alone, corner }: { s: Shown; style: JSX.CSSProperties; more?: number; onOpen?: (el: HTMLElement) => void; alone: boolean; corner: string }) {
  const src = tileSrc(s, alone);
  const [loaded, setLoaded] = useState(() => drawn.has(src));
  const preview = s.ref?.preview ?? s.pic?.prepared?.preview;
  const p = s.pic;
  const busy = p && (p.state === "preparing" || p.state === "uploading");
  const landed = useLanded(p);
  const id = s.ref?.id ?? p?.ref?.id ?? p?.key;
  const shown = () => (drawn.add(src), setLoaded(true));
  return (
    <button
      type="button"
      class={`tile${corner}${loaded ? " in" : ""}${p?.state === "failed" ? " failed" : ""}${landed ? " settle" : ""}`}
      style={style}
      data-media={id}
      aria-label={more ? t("media.more", more) : (s.ref?.name ?? t("media.image"))}
      onClick={(e) => onOpen?.(e.currentTarget.querySelector("img") ?? e.currentTarget)}
    >
      {preview && <span class="ph" style={{ backgroundImage: `url("${preview}")` }} aria-hidden="true" />}
      <img
        src={src}
        alt=""
        decoding="async"
        loading="lazy"
        draggable={false}
        onLoad={shown}
        onError={() => s.ref && void refreshKeys([s.ref.id, ...(s.ref.thumb ? [s.ref.thumb.id] : [])])}
        ref={(el) => {
          if (el?.complete && el.naturalWidth && !loaded) shown();
        }}
      />
      {(busy || landed) && <Ring f={p!.state === "preparing" ? 0 : p!.progress} done={landed} />}
      {p?.state === "failed" && (
        <span class="failed-mark" aria-hidden="true">
          <RetryMark />
        </span>
      )}
      {more ? <span class="more">+{more}</span> : null}
    </button>
  );
}

/** Which of the box's corners a tile holds (they take the box's round; inner ones stay soft). */
function cornerOf(tl: { x: number; y: number; w: number; h: number }, aspect: number): string {
  const e = 1e-6;
  const l = tl.x < e;
  const r = tl.x + tl.w > 1 - e;
  const top = tl.y < e;
  const b = tl.y + tl.h > aspect - e;
  return `${top && l ? " c-tl" : ""}${top && r ? " c-tr" : ""}${b && l ? " c-bl" : ""}${b && r ? " c-br" : ""}`;
}

/**
 * A message's pictures (D206, D286): one at its own shape, 2–4 in a grid, 5–9 in rows, more as
 * "+n" on the last. The box is sized from the pictures' known sizes before any byte loads; sent
 * from the tray, it flies from where the pictures sat into its place.
 */
export function Pictures({ items, side, onOpen }: { items: Shown[]; side: "user" | "partner" | "task"; onOpen?: (s: Shown, el: HTMLElement) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // D286: the tray's pictures gather into the bubble (one shared element: the box, from the
  // rect the tray tiles took together).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || reduced()) return;
    const rs = items.flatMap((s) => (s.pic && flights.has(s.pic.key) ? [flights.get(s.pic.key)!] : []));
    if (!rs.length) return;
    for (const s of items) if (s.pic) flights.delete(s.pic.key);
    const from = { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    const sx = (from.r - from.l) / to.width;
    const sy = (from.b - from.t) / to.height;
    el.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${from.l - to.left}px, ${from.t - to.top}px) scale(${sx}, ${sy})`, opacity: 0.85 },
        { transformOrigin: "0 0", transform: "none", opacity: 1 },
      ],
      { duration: ms("--t-med", 320) + 100, easing: SETTLE },
    );
  }, []);
  if (!items.length) return null;
  const g = gridLayout(items.map(sizeOf));
  const pct = (n: number) => `${n * 100}%`;
  // A single picture fits both the width and the height the bubble allows.
  const style: JSX.CSSProperties = g.single ? { width: `min(var(--pics-w), calc(var(--pics-h) / ${g.aspect.toFixed(4)}))`, aspectRatio: `${(1 / g.aspect).toFixed(4)}` } : { aspectRatio: `${(1 / g.aspect).toFixed(4)}` };
  return (
    <div ref={box} class={`pics on-${side}${g.single ? " one" : ` n${Math.min(items.length, 9)}`}`} style={style}>
      {g.tiles.map((tl) => (
        <Tile
          key={items[tl.i]!.ref?.id ?? items[tl.i]!.pic!.key}
          s={items[tl.i]!}
          alone={g.single}
          more={tl.more}
          corner={g.single ? "" : cornerOf(tl, g.aspect)}
          onOpen={onOpen && ((el) => onOpen(items[tl.i]!, el))}
          style={{ left: pct(tl.x), top: pct(tl.y / g.aspect), width: pct(tl.w), height: pct(tl.h / g.aspect) }}
        />
      ))}
    </div>
  );
}

/** D259: a file of a message still on its way: the same card, a calm bar where Open will be; once up, the card itself. */
function SendingFile({ p }: { p: Pic }) {
  const flight = useRef(flights.get(p.key));
  flights.delete(p.key);
  if (p.ref) {
    aliasGlimpse(p.key, p.ref.id);
    return <FileCard m={p.ref} />;
  }
  return <FileCard pic={p} {...(flight.current ? { flight: flight.current } : {})} />;
}

/** Pictures as tiles, files as cards: everything a message or a report carries. */
export function MediaBlock({ media, pics, side, ctx }: { media?: MediaRef[]; pics?: Pic[]; side: "user" | "partner" | "task"; ctx: ViewCtx }) {
  const shown: Shown[] = [...(media ?? []).filter(isImage).map((ref) => ({ ref })), ...(pics ?? []).filter((p) => p.kind !== "file").map((pic) => ({ pic }))];
  const files = (media ?? []).filter((m) => !isImage(m));
  const sending = (pics ?? []).filter((p) => p.kind === "file");
  if (!shown.length && !files.length && !sending.length) return null;
  return (
    <div class={`media on-${side}`}>
      <Pictures items={shown} side={side} onOpen={(s, el) => s.ref && openViewer(ctx, s.ref, el)} />
      {files.map((m) =>
        side === "user" ? (
          <FileCard key={m.id} m={m} />
        ) : (
          // D566: what Ducter made can be kept in Nowledge Mem: one quiet line under its card.
          <div class="fc-keep" key={m.id}>
            <FileCard m={m} />
            <MemKeep m={m} />
          </div>
        ),
      )}
      {sending.map((p) => (
        <SendingFile key={p.key} p={p} />
      ))}
    </div>
  );
}

// ---------- the tray over the composer ----------

/** One picture or file waiting over the composer: it pops in, goes up under a calm ring (a file:
 *  a bar along its foot), ticks when it lands, and shrinks away when removed. */
function Chosen({ where, p }: { where: string; p: Pic }) {
  const [leaving, setLeaving] = useState(false);
  const landed = useLanded(p);
  const busy = p.state === "preparing" || p.state === "uploading";
  const doc = p.kind === "file";
  const remove = () => {
    if (leaving) return;
    if (reduced()) return A.removePic(where, p.key);
    setLeaving(true);
    setTimeout(() => A.removePic(where, p.key), ms("--t-fast", 120) + 60);
  };
  return (
    <div
      class={`chosen${doc ? " doc" : ""}${p.state === "failed" ? " failed" : ""}${leaving ? " leaving" : ""}${landed ? " landed" : ""}`}
      role="listitem"
      data-key={p.key}
      title={doc ? p.name : undefined}
    >
      {doc ? (
        <span class="doc-face" aria-label={p.name}>
          <FileBadge m={{ type: p.file.type || "application/octet-stream", name: p.name }} size={22} />
          <span class="doc-name">{p.name}</span>
        </span>
      ) : (
        <img src={p.local} alt="" draggable={false} />
      )}
      {!doc && (busy || landed) && <Ring f={p.state === "preparing" ? 0 : p.progress} done={landed} />}
      {doc && busy && (
        <span class="doc-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.04, p.progress)})` }} />
        </span>
      )}
      {p.state === "failed" && (
        <button type="button" class="retry" onClick={() => A.retryPic(where, p.key)} aria-label={t("media.retry")}>
          <RetryMark />
          <span>{t("media.retry")}</span>
        </button>
      )}
      <button type="button" class="x" aria-label={t("media.remove")} onClick={remove}>
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function Tray({ where }: { where: string }) {
  const pics = A.picks.get(where) ?? [];
  if (!pics.length) return null;
  return (
    <div class="tray-pics" role="list">
      {pics.map((p) => (
        <Chosen key={p.key} where={where} p={p} />
      ))}
    </div>
  );
}


/** The attach mark (D273): a paperclip of three legs, tilted, at the composer's 1.8 stroke. It
 *  reads "attach" for any file; the picture mark stays where it means a picture. */
export function AttachMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path transform="rotate(40 12 12)" d="M8.4 17.6V7.4a3.6 3.6 0 0 1 7.2 0v10.4a1.8 1.8 0 0 1-3.6 0V9.4" />
    </svg>
  );
}

/** The composer's 添加文件或图片 / Add files or pictures button (D273: the attach mark): the
 *  phone's own sheet (library, camera, files), any kind of file (D259). */
export function AddPictures({ where }: { where: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" class="btn text icon add-pic" aria-label={t("media.add")} title={t("media.add")} onClick={() => input.current?.click()}>
        <AttachMark />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const el = e.currentTarget;
          if (el.files?.length) A.addFiles(where, [...el.files]);
          el.value = "";
        }}
      />
    </>
  );
}

/** Paste and drop onto an area add pictures to `where` (the conversation, a task, the New task card). */
export function useDropPaste(ref: { current: HTMLElement | null }, where: string) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) (depth = 0), setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && (e.preventDefault(), (e.dataTransfer!.dropEffect = "copy"));
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      A.addFiles(where, [...(e.dataTransfer?.files ?? [])]);
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      A.addFiles(where, files);
    };
    el.addEventListener("dragenter", enter);
    el.addEventListener("dragleave", leave);
    el.addEventListener("dragover", overFn);
    el.addEventListener("drop", drop);
    el.addEventListener("paste", paste);
    return () => {
      el.removeEventListener("dragenter", enter);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("dragover", overFn);
      el.removeEventListener("drop", drop);
      el.removeEventListener("paste", paste);
    };
  }, [where]);
  return over;
}


export function DropHint({ on }: { on: boolean }) {
  return on ? (
    <div class="drop-hint" aria-hidden="true">
      <span class="dh-in">
        <AttachMark size={30} />
        <span>{t("media.drop")}</span>
      </span>
    </div>
  ) : null;
}

// ---------- the viewer ----------

function picturesOf(ctx: ViewCtx): MediaRef[] {
  const out: MediaRef[] = [];
  const seen = new Set<string>();
  const add = (ms?: MediaRef[]) => {
    for (const m of ms ?? []) if (isImage(m) && !seen.has(m.id)) seen.add(m.id), out.push(m);
  };
  if (ctx.kind === "conv") for (const e of A.S.channel) add(e.user?.media ?? e.ai?.media);
  else {
    const task = A.S.tasks.get(ctx.taskId);
    for (const ev of task?.events ?? []) add((ev.body as { media?: MediaRef[] }).media);
  }
  return out;
}

export function openViewer(ctx: ViewCtx, m: MediaRef, el?: HTMLElement) {
  let items = picturesOf(ctx);
  if (!items.some((x) => x.id === m.id)) items = [m];
  A.viewer = { items, index: Math.max(0, items.findIndex((x) => x.id === m.id)), ctx, ...(el ? { from: el.getBoundingClientRect() } : {}) };
  A.changed();
}

/** The rect a picture of w × h takes when it fits the stage. */
function fitRect(w: number, h: number, stage: DOMRect): { x: number; y: number; w: number; h: number } {
  const s = Math.min(stage.width / Math.max(1, w), stage.height / Math.max(1, h), 1.6);
  const fw = w * s;
  const fh = h * s;
  return { x: stage.left + (stage.width - fw) / 2, y: stage.top + (stage.height - fh) / 2, w: fw, h: fh };
}

/**
 * The pose that lays a fitted picture exactly over a tile (D286): moved and scaled to cover it, and
 * clipped to the tile's own crop with the tile's round corners, so opening and closing are one
 * continuous picture, never a square swapped for a cropped one.
 */
function tilePose(tile: DOMRect, f: { x: number; y: number; w: number; h: number }, radius: number): { transform: string; clipPath: string } {
  const s = Math.max(tile.width / f.w, tile.height / f.h);
  const ix = Math.max(0, (1 - tile.width / (f.w * s)) / 2) * 100;
  const iy = Math.max(0, (1 - tile.height / (f.h * s)) / 2) * 100;
  const dx = tile.left + tile.width / 2 - (f.x + f.w / 2);
  const dy = tile.top + tile.height / 2 - (f.y + f.h / 2);
  return { transform: `translate(${dx}px, ${dy}px) scale(${s})`, clipPath: `inset(${iy}% ${ix}% round ${radius / s}px)` };
}

function taskTitle(id: string): string {
  const task = A.S.tasks.get(id);
  return task ? title(task).trim() : "";
}

/** The space between one picture and the next in the strip. */
const SLIDE_GAP = 24;
const MAX_ZOOM = 5;

/** A picture of the strip: the full one over its tile rendition (or the preview) while it comes. */
function Slide({ m, stage, k, current, imgRef, z, pull, still }: { m: MediaRef; stage?: DOMRect; k: number; current: boolean; imgRef?: { current: HTMLImageElement | null }; z: { s: number; x: number; y: number }; pull: number; still: boolean }) {
  const f = stage ? fitRect(m.w ?? 1, m.h ?? 1, stage) : undefined;
  const under = localOf.get(m.id) ?? (m.thumb ? mediaUrl(m.thumb) : undefined);
  const bg = [under && `url("${under}")`, m.preview && `url("${m.preview}")`].filter(Boolean).join(", ");
  const W = stage?.width ?? innerWidth;
  return (
    <div class="v-slide" style={{ transform: `translateX(${k * (W + SLIDE_GAP)}px)` }} aria-hidden={!current}>
      <img
        key={m.id}
        ref={imgRef}
        src={mediaUrl(m)}
        onError={() => void refreshKeys([m.id])}
        alt={m.name ?? t("media.image")}
        draggable={false}
        decoding="async"
        style={{
          ...(f ? { width: `${f.w}px`, height: `${f.h}px` } : {}),
          ...(bg ? { backgroundImage: bg } : {}),
          ...(current ? { transform: `translate(${z.x}px, ${z.y + pull}px) scale(${z.s * (pull > 0 ? Math.max(0.72, 1 - pull / 900) : 1)})` } : {}),
          transition: still ? "none" : undefined,
        }}
      />
    </div>
  );
}

export function Viewer() {
  const v = A.viewer;
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  // The strip's sideways pull (a swipe, or the slide to the next) and the pull down to close.
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);
  const index = v?.index ?? 0;
  const m = v?.items[index];
  const sliding = useRef(false);
  const inertia = useRef(0);

  const stageRect = () => stage.current?.getBoundingClientRect();
  const close = () => {
    if (!v || closing) return;
    cancelAnimationFrame(inertia.current);
    const done = () => {
      // Every tile shows again, whatever was held empty for a flight.
      document.querySelectorAll<HTMLElement>("[data-media] img").forEach((i) => i.style.visibility && (i.style.visibility = ""));
      A.viewer = undefined;
      setClosing(false);
      setZ({ s: 1, x: 0, y: 0 });
      setDrag({ x: 0, y: 0 });
      A.changed();
    };
    const el = img.current;
    const tile = m && document.querySelector<HTMLElement>(`.scroll [data-media="${m.id}"], .turns [data-media="${m.id}"], .work [data-media="${m.id}"]`);
    const to = tile?.getBoundingClientRect();
    const st = stageRect();
    setClosing(true);
    if (!el || reduced() || !to || !st || to.bottom < 0 || to.top > innerHeight || !m) return void setTimeout(done, reduced() ? 0 : ms("--t-fast", 120) + 60);
    // Back into its tile: the picture as it is now (zoomed, pulled) to the tile's crop.
    const f = fitRect(m.w ?? 1, m.h ?? 1, st);
    const now = getComputedStyle(el).transform;
    const pose = tilePose(to, f, 18);
    // The tile waits empty while its picture comes home (one picture, never two).
    const back = tile!.querySelector<HTMLElement>("img");
    if (back) back.style.visibility = "hidden";
    el.animate([{ transform: now === "none" ? "none" : now, clipPath: "inset(0% 0% round 0px)" }, pose], { duration: ms("--t-med", 320) - 60, easing: EASE, fill: "forwards" }).onfinish = () => {
      if (back) back.style.visibility = "";
      done();
    };
  };
  const go = (i: number) => {
    if (!v) return;
    v.index = Math.max(0, Math.min(v.items.length - 1, i));
    v.from = undefined;
    setZ({ s: 1, x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
    A.changed();
  };
  /** D286: slide to the next (d = 1) or the previous picture: the strip moves, then the index. */
  const slide = (d: number) => {
    if (!v || sliding.current) return;
    const to = index + d;
    if (to < 0 || to >= v.items.length) {
      // At an end: a small give, and back.
      if (reduced()) return;
      setAnim(true);
      setDrag({ x: -d * 28, y: 0 });
      setTimeout(() => setDrag({ x: 0, y: 0 }), ms("--t-fast", 120) + 30);
      return;
    }
    if (reduced()) return go(to);
    const W = stageRect()?.width ?? innerWidth;
    sliding.current = true;
    setAnim(true);
    setDrag({ x: -d * (W + SLIDE_GAP), y: 0 });
    setTimeout(() => {
      sliding.current = false;
      setAnim(false);
      go(to);
    }, ms("--t-med", 320) - 40);
  };

  // Grows out of the tile it was opened from (a shared element, clipped to the tile's crop and
  // its round corners), unless motion is reduced.
  useLayoutEffect(() => {
    const el = img.current;
    const st = stageRect();
    if (!v?.from || !el || !st || !m || reduced()) return;
    const f = fitRect(m.w ?? v.from.width, m.h ?? v.from.height, st);
    const from = tilePose(v.from, f, 18);
    // The tile it left stays empty while it grows (one picture, never two).
    const left = document.querySelector<HTMLElement>(`.scroll [data-media="${m.id}"] img, .turns [data-media="${m.id}"] img, .work [data-media="${m.id}"] img`);
    if (left) left.style.visibility = "hidden";
    el.animate([from, { transform: "none", clipPath: "inset(0% 0% round 0px)" }], { duration: ms("--t-med", 320), easing: EASE }).onfinish = () => left && (left.style.visibility = "");
    v.from = undefined;
  }, [v?.from, m?.id]);

  // Laid out from the stage's size: once it is known, and again when the window changes.
  useEffect(() => {
    setTick((n) => n + 1);
    const r = () => setTick((n) => n + 1);
    addEventListener("resize", r);
    return () => (removeEventListener("resize", r), cancelAnimationFrame(inertia.current));
  }, []);

  useEffect(() => {
    if (!v) return;
    const k = (e: KeyboardEvent) => {
      const r = viewerKey(e.key, { index, count: v.items.length });
      if (!r) return;
      e.preventDefault();
      if (r === "close") close();
      else slide(r.index > index ? 1 : -1);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });

  // Pinch, double-tap, swipe sideways, swipe down, pan with a fling: one set of pointers.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ d: number; s: number; cx: number; cy: number; x: number; y: number; px: number; py: number; t: number } | null>(null);
  const vel = useRef({ x: 0, y: 0, t: 0, lx: 0, ly: 0 });
  const lastTap = useRef(0);
  const wheelX = useRef({ sum: 0, t: 0 });
  if (!v || !m) return null;
  const st = stage.current?.getBoundingClientRect();
  const W = st?.width ?? innerWidth;
  const fitted = st ? fitRect(m.w ?? 1, m.h ?? 1, st) : undefined;

  /** How far a picture at scale s may pan before its edge leaves the stage's. */
  const bounds = (s: number) => ({ x: Math.max(0, ((fitted?.w ?? W) * s - W) / 2), y: Math.max(0, ((fitted?.h ?? 0) * s - (st?.height ?? 0)) / 2) });
  const clamp = (o: { s: number; x: number; y: number }) => {
    const b = bounds(o.s);
    return { s: o.s, x: Math.max(-b.x, Math.min(b.x, o.x)), y: Math.max(-b.y, Math.min(b.y, o.y)) };
  };
  /** Past the edge, a pan gives way like a rubber band. */
  const give = (v0: number, b: number) => (v0 > b ? b + (v0 - b) * 0.35 : v0 < -b ? -b + (v0 + b) * 0.35 : v0);
  /** Zoom to s keeping the point (px, py) of the stage under the finger or the pointer. */
  const zoomAt = (o: { s: number; x: number; y: number }, s: number, px: number, py: number) => {
    const cx = px - ((st?.left ?? 0) + W / 2);
    const cy = py - ((st?.top ?? 0) + (st?.height ?? 0) / 2);
    const k = s / o.s;
    return s <= 1.001 ? { s: 1, x: 0, y: 0 } : { s, x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k };
  };
  const fling = (vx: number, vy: number) => {
    cancelAnimationFrame(inertia.current);
    let x = vx * 16;
    let y = vy * 16;
    const step = () => {
      x *= 0.92;
      y *= 0.92;
      let stop = Math.abs(x) < 0.4 && Math.abs(y) < 0.4;
      setZ((o) => {
        const n = clamp({ s: o.s, x: o.x + x, y: o.y + y });
        if (n.x !== o.x + x) x = 0;
        if (n.y !== o.y + y) y = 0;
        return n;
      });
      if (!stop) inertia.current = requestAnimationFrame(step);
    };
    inertia.current = requestAnimationFrame(step);
  };

  const onDown = (e: PointerEvent) => {
    cancelAnimationFrame(inertia.current);
    if (sliding.current) return;
    setAnim(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const cx = p.reduce((a, b) => a + b.x, 0) / p.length;
    const cy = p.reduce((a, b) => a + b.y, 0) / p.length;
    const d = p.length > 1 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0;
    start.current = { d, s: z.s, cx, cy, x: z.x, y: z.y, px: e.clientX, py: e.clientY, t: Date.now() };
    vel.current = { x: 0, y: 0, t: performance.now(), lx: e.clientX, ly: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !start.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const s0 = start.current;
    const now = performance.now();
    const dt = Math.max(1, now - vel.current.t);
    vel.current = { x: (e.clientX - vel.current.lx) / dt, y: (e.clientY - vel.current.ly) / dt, t: now, lx: e.clientX, ly: e.clientY };
    if (p.length > 1 && s0.d) {
      const d = Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
      const s = Math.max(1, Math.min(MAX_ZOOM, (s0.s * d) / s0.d));
      setZ(zoomAt({ s: s0.s, x: s0.x, y: s0.y }, s, s0.cx, s0.cy));
      return;
    }
    const dx = e.clientX - s0.px;
    const dy = e.clientY - s0.py;
    if (z.s > 1.01) {
      const b = bounds(z.s);
      return setZ({ s: z.s, x: give(s0.x + dx, b.x), y: give(s0.y + dy, b.y) });
    }
    // At fit: sideways pulls the strip (the next picture peeks in; an end gives a little), down closes.
    if (Math.abs(dy) > Math.abs(dx) && dy > 0) return setDrag({ x: 0, y: dy });
    const end = (dx > 0 && index === 0) || (dx < 0 && index === v.items.length - 1);
    setDrag({ x: end ? dx * 0.3 : dx, y: 0 });
  };
  const onUp = (e: PointerEvent) => {
    const s0 = start.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size) return;
    start.current = null;
    if (!s0) return;
    const moved = Math.hypot(e.clientX - s0.px, e.clientY - s0.py);
    const quick = Date.now() - s0.t < 250;
    if (moved < 8 && quick) {
      // A double tap zooms in where it was tapped, or back to fit.
      if (Date.now() - lastTap.current < 300) {
        lastTap.current = 0;
        setAnim(true);
        setZ(z.s > 1.01 ? { s: 1, x: 0, y: 0 } : clamp(zoomAt(z, 2.5, e.clientX, e.clientY)));
        return;
      }
      lastTap.current = Date.now();
      return;
    }
    if (z.s > 1.01) {
      // A pan lets go with its speed, and comes back inside the edges.
      const c = clamp(z);
      if (c.x !== z.x || c.y !== z.y) return setAnim(true), setZ(c);
      if (!reduced() && performance.now() - vel.current.t < 80) fling(vel.current.x, vel.current.y);
      return;
    }
    const fast = quick && moved > 40;
    if (drag.y > 110 || (fast && drag.y > 40)) return close();
    setAnim(true);
    if ((drag.x < -W * 0.18 || (fast && drag.x < -40)) && index < v.items.length - 1) return slide(1);
    if ((drag.x > W * 0.18 || (fast && drag.x > 40)) && index > 0) return slide(-1);
    setDrag({ x: 0, y: 0 });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelAnimationFrame(inertia.current);
    setAnim(false);
    if (e.ctrlKey || e.metaKey) {
      // A trackpad pinch (or ⌘ and the wheel): zoom where the pointer is.
      const s = Math.max(1, Math.min(MAX_ZOOM, z.s * Math.exp(-e.deltaY / 100)));
      return setZ(clamp(zoomAt(z, s, e.clientX, e.clientY)));
    }
    if (z.s > 1.01) return setZ(clamp({ s: z.s, x: z.x - e.deltaX, y: z.y - e.deltaY }));
    // At fit, a sideways two-finger swipe steps through the pictures.
    const now = Date.now();
    if (now - wheelX.current.t > 400) wheelX.current.sum = 0;
    wheelX.current.t = now;
    wheelX.current.sum += e.deltaX;
    if (Math.abs(wheelX.current.sum) > 80 && !sliding.current) {
      const d = wheelX.current.sum > 0 ? 1 : -1;
      wheelX.current.sum = -1e6 * d; // one step per swipe
      slide(d);
    }
  };

  const full = mediaUrl(m);
  const name = m.name ?? `ducter-${m.id.slice(0, 8)}.${m.type.split("/")[1] === "jpeg" ? "jpg" : m.type.split("/")[1]}`;
  const fileOf = async () => {
    const b = await (await mediaFetch(m)).blob();
    return new File([b], name, { type: m.type });
  };
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  const canShare = typeof nav.share === "function";
  const save = async () => {
    // On a phone the share sheet is where Save Image lives; elsewhere a download.
    if (canShare && /iPhone|iPad|Android/.test(navigator.userAgent)) {
      try {
        const f = await fileOf();
        if (!nav.canShare || nav.canShare({ files: [f] })) return void (await nav.share({ files: [f] }));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = `${full}&dl=1`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const share = async () => {
    try {
      const f = await fileOf();
      await nav.share(nav.canShare?.({ files: [f] }) === false ? { url: full } : { files: [f] });
    } catch (err) {
      if ((err as Error).name !== "AbortError") A.toast(t("media.failed"));
    }
  };
  const copy = async () => {
    try {
      // Clipboards take PNG everywhere; anything else is drawn to PNG first.
      const blob = (async () => {
        const b = await (await mediaFetch(m)).blob();
        if (b.type === "image/png") return b;
        const d = await decode(b);
        try {
          return (await draw(d.src, d.w, d.h, 8192, "image/png", 1, false))!.blob;
        } finally {
          d.close();
        }
      })();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      A.toast(t("media.copy.failed"));
    }
  };
  const from = m.from?.taskId;
  const ttl = from ? taskTitle(from) : "";
  const dim = Math.max(0, 1 - Math.abs(drag.y) / 420);
  const still = !anim || !!start.current;
  const near = [-1, 0, 1].flatMap((k) => (v.items[index + k] ? [{ k, r: v.items[index + k]! }] : []));
  return (
    <div class={`viewer${closing ? " closing" : ""}${z.s > 1.01 ? " zoomed" : ""}`} role="dialog" aria-modal="true" aria-label={t("media.viewer", index + 1, v.items.length)}>
      <div class="scrim" style={{ opacity: dim }} onClick={close} />
      <div class="v-top" style={{ opacity: dim }}>
        <button type="button" class="btn text icon" aria-label={t("media.close")} onClick={close}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        {v.items.length > 1 && <span class="count">{t("media.count", index + 1, v.items.length)}</span>}
      </div>
      <div
        class="stage"
        ref={stage}
        onPointerDown={onDown as any}
        onPointerMove={onMove as any}
        onPointerUp={onUp as any}
        onPointerCancel={onUp as any}
        onWheel={onWheel as any}
        onClick={(e) => (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("v-slide")) && z.s <= 1.01 && Math.abs(drag.x) < 4 && close()}
      >
        <div class={`v-strip${still ? " still" : ""}`} style={{ transform: `translateX(${drag.x}px)` }}>
          {near.map(({ k, r }) => (
            <Slide key={r.id} m={r} k={k} stage={st} current={k === 0} {...(k === 0 ? { imgRef: img } : {})} z={z} pull={k === 0 ? drag.y : 0} still={still} />
          ))}
        </div>
      </div>
      {v.items.length > 1 && (
        <>
          <button type="button" class="v-step prev" style={{ opacity: dim }} aria-label={t("media.prev")} disabled={index === 0} onClick={() => slide(-1)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button type="button" class="v-step next" style={{ opacity: dim }} aria-label={t("media.next")} disabled={index === v.items.length - 1} onClick={() => slide(1)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </>
      )}
      <div class="v-bar" style={{ opacity: dim }}>
        {from && (
          <button type="button" class="from" onClick={() => ((A.viewer = undefined), A.go({ name: "task", id: from }))}>
            {t("media.from", ttl || t("media.task"))}
          </button>
        )}
        <span class="grow" />
        <button type="button" class="btn text" onClick={save}>
          {t("media.save")}
        </button>
        {canShare && (
          <button type="button" class="btn text" onClick={share}>
            {t("media.share")}
          </button>
        )}
        {typeof ClipboardItem !== "undefined" && (
          <button type="button" class={`btn text${copied ? " done" : ""}`} onClick={copy}>
            {copied ? t("media.copied") : t("media.copy")}
          </button>
        )}
      </div>
    </div>
  );
}

export { isImageType };
