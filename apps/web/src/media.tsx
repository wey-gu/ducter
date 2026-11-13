// D206: pictures in the conversation and in a task (design/media.md).
//
// Sending: a picture is made ready on the phone itself (scaled to 2048 px on its long edge,
// re-encoded so nothing of its EXIF, the location included, leaves the phone; HEIC turns into
// JPEG on the way), with a 720 px tile rendition and a ~16 px preview, then uploaded the moment
// it is picked, so Send is instant. Words are never lost: a message whose picture didn't go up
// waits with its words and the picture, and Retry sends both.
//
// Showing: one picture at its own shape, 2–4 in a grid, more as "+n" (gridLayout, the same on
// the Mac); space kept from the known size, a blurred preview fading to the picture. The viewer
// grows out of the tile, pinches and double-taps to zoom, swipes through every picture of the
// conversation (or the task) and down to close.
import { gridLayout, isImage, isImageType, sizeWords, type MediaRef } from "@ducter/protocol";
import { mediaFetch, mediaUrl, refreshKeys } from "./media-fresh.ts";
import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { title } from "./store.ts";
import { picturesIn, viewerKey } from "./media-keys.ts";
import { decode, draw, type Pic, type ViewCtx } from "./media-up.ts";
import { FileGlyph, openFile } from "./fileview.tsx";

export { picturesIn, viewerKey };
export { prepare, upload, type Pic, type Prepared, type ViewCtx, type ViewerState } from "./media-up.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export const url = (path: string) => new URL(path, A.base).href;

// ---------- the progress ring ----------

function Ring({ f }: { f: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg class="ring" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r={r} />
      <circle class="arc" cx="18" cy="18" r={r} style={{ strokeDasharray: `${c}`, strokeDashoffset: `${c * (1 - Math.max(0.08, f))}` }} />
    </svg>
  );
}

// ---------- tiles ----------

/** What a tile shows: a picture the home holds, or one still on its way up. */
export type Shown = { ref: MediaRef; pic?: undefined } | { pic: Pic; ref?: undefined };

const sizeOf = (s: Shown) => (s.ref ? { w: s.ref.w, h: s.ref.h } : { w: s.pic!.w, h: s.pic!.h });

function Tile({ s, style, more, onOpen, alone }: { s: Shown; style: JSX.CSSProperties; more?: number; onOpen?: (el: HTMLElement) => void; alone: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const src = s.ref ? mediaUrl(alone ? s.ref : (s.ref.thumb ?? s.ref)) : s.pic!.local;
  const preview = s.ref?.preview;
  const p = s.pic;
  const busy = p && (p.state === "preparing" || p.state === "uploading");
  const id = s.ref?.id ?? p?.ref?.id ?? p?.key;
  return (
    <button
      type="button"
      class={`tile${loaded ? " in" : ""}${p?.state === "failed" ? " failed" : ""}`}
      style={style}
      data-media={id}
      aria-label={more ? t("media.more", more) : (s.ref?.name ?? t("media.image"))}
      onClick={(e) => onOpen?.(e.currentTarget.querySelector("img") ?? e.currentTarget)}
    >
      {preview && <span class="ph" style={{ backgroundImage: `url("${preview}")` }} aria-hidden="true" />}
      <img src={src} alt="" decoding="async" loading="lazy" draggable={false} onLoad={() => setLoaded(true)} onError={() => s.ref && void refreshKeys([s.ref.id, ...(s.ref.thumb ? [s.ref.thumb.id] : [])])} ref={(el) => {
          if (el?.complete && el.naturalWidth && !loaded) setLoaded(true);
        }} />
      {busy && <Ring f={p!.state === "preparing" ? 0 : p!.progress} />}
      {more ? <span class="more">+{more}</span> : null}
    </button>
  );
}

/**
 * A message's pictures (D206): one at its own shape, 2–4 in a grid, more as "+n" on the fourth.
 * The box is sized from the pictures' known sizes before any byte loads.
 */
export function Pictures({ items, side, onOpen }: { items: Shown[]; side: "user" | "partner" | "task"; onOpen?: (s: Shown, el: HTMLElement) => void }) {
  if (!items.length) return null;
  const g = gridLayout(items.map(sizeOf));
  const pct = (n: number) => `${n * 100}%`;
  // A single picture fits both the width and the height the bubble allows.
  const box: JSX.CSSProperties = g.single ? { width: `min(var(--pics-w), calc(var(--pics-h) / ${g.aspect.toFixed(4)}))`, aspectRatio: `${(1 / g.aspect).toFixed(4)}` } : { aspectRatio: `${(1 / g.aspect).toFixed(4)}` };
  return (
    <div class={`pics on-${side}${g.single ? " one" : ""}`} style={box}>
      {g.tiles.map((tl) => (
        <Tile
          key={items[tl.i]!.ref?.id ?? items[tl.i]!.pic!.key}
          s={items[tl.i]!}
          alone={g.single}
          more={tl.more}
          onOpen={onOpen && ((el) => onOpen(items[tl.i]!, el))}
          style={{ left: pct(tl.x), top: pct(tl.y / g.aspect), width: pct(tl.w), height: pct(tl.h / g.aspect) }}
        />
      ))}
    </div>
  );
}

/** A file a task showed (not a picture): one line, icon, name, size, Open. D239: the whole card
 *  opens the file inside Ducter (the viewer grows out of it), never a link to the home. */
export function FileCard({ m }: { m: MediaRef }) {
  const name = m.name ?? t("media.file");
  return (
    <button type="button" class="filecard" data-file={m.id} aria-label={t("media.fileOpen", name)} onClick={(e) => openFile(m, e.currentTarget)}>
      <FileGlyph m={m} />
      <span class="fn" title={m.name}>
        {name}
      </span>
      <span class="fs">{sizeWords(m.bytes)}</span>
      <span class="btn text sm" aria-hidden="true">
        {t("media.open")}
      </span>
    </button>
  );
}

/** Pictures as tiles, files as cards: everything a message or a report carries. */
export function MediaBlock({ media, pics, side, ctx }: { media?: MediaRef[]; pics?: Pic[]; side: "user" | "partner" | "task"; ctx: ViewCtx }) {
  const shown: Shown[] = [...(media ?? []).filter(isImage).map((ref) => ({ ref })), ...(pics ?? []).map((pic) => ({ pic }))];
  const files = (media ?? []).filter((m) => !isImage(m));
  if (!shown.length && !files.length) return null;
  return (
    <div class={`media on-${side}`}>
      <Pictures items={shown} side={side} onOpen={(s, el) => s.ref && openViewer(ctx, s.ref, el)} />
      {files.map((m) => (
        <FileCard key={m.id} m={m} />
      ))}
    </div>
  );
}

// ---------- the tray over the composer ----------

export function Tray({ where }: { where: string }) {
  const pics = A.picks.get(where) ?? [];
  if (!pics.length) return null;
  return (
    <div class="tray-pics" role="list">
      {pics.map((p) => (
        <div key={p.key} class={`chosen${p.state === "failed" ? " failed" : ""}`} role="listitem">
          <img src={p.local} alt="" draggable={false} />
          {(p.state === "preparing" || p.state === "uploading") && <Ring f={p.state === "preparing" ? 0 : p.progress} />}
          {p.state === "failed" && (
            <button type="button" class="retry" onClick={() => A.retryPic(where, p.key)} aria-label={t("media.retry")}>
              {t("media.retry")}
            </button>
          )}
          <button type="button" class="x" aria-label={t("media.remove")} onClick={() => A.removePic(where, p.key)}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/** The composer's 加图片 / Add images button: the phone's own sheet (library, camera, files). */
export function AddPictures({ where }: { where: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" class="btn text icon add-pic" aria-label={t("media.add")} title={t("media.add")} onClick={() => input.current?.click()}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3.4" />
          <circle cx="9" cy="10" r="1.7" />
          <path d="M4 17.2l4.8-4.6 3.4 3.1 2.6-2.3 5.2 4.6" />
        </svg>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
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
      const { pics } = picturesIn(files);
      if (!pics.length) return;
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
      <span>{t("media.drop")}</span>
    </div>
  ) : null;
}

// ---------- the viewer ----------

function picturesOf(ctx: ViewCtx): MediaRef[] {
  const out: MediaRef[] = [];
  const add = (ms?: MediaRef[]) => {
    for (const m of ms ?? []) if (isImage(m) && !out.some((o) => o.id === m.id)) out.push(m);
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

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The rect a picture of w × h takes when it fits the stage. */
function fitRect(w: number, h: number, stage: DOMRect): { x: number; y: number; w: number; h: number } {
  const s = Math.min(stage.width / Math.max(1, w), stage.height / Math.max(1, h), 1.6);
  const fw = w * s;
  const fh = h * s;
  return { x: stage.left + (stage.width - fw) / 2, y: stage.top + (stage.height - fh) / 2, w: fw, h: fh };
}


function taskTitle(id: string): string {
  const task = A.S.tasks.get(id);
  return task ? title(task).trim() : "";
}

export function Viewer() {
  const v = A.viewer;
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const index = v?.index ?? 0;
  const m = v?.items[index];

  const close = () => {
    if (!v || closing) return;
    const done = () => ((A.viewer = undefined), setClosing(false), setZ({ s: 1, x: 0, y: 0 }), setDrag({ x: 0, y: 0 }), A.changed());
    const el = img.current;
    const tile = m && document.querySelector<HTMLElement>(`.scroll [data-media="${m.id}"]`);
    const to = tile?.getBoundingClientRect();
    if (!el || reduced() || !to || to.bottom < 0 || to.top > innerHeight) {
      setClosing(true);
      return void setTimeout(done, reduced() ? 0 : 160);
    }
    setClosing(true);
    const r = el.getBoundingClientRect();
    el.animate(
      [{ transform: getComputedStyle(el).transform === "none" ? "none" : getComputedStyle(el).transform }, { transform: `translate(${to.left - r.left + (to.width - r.width) / 2}px, ${to.top - r.top + (to.height - r.height) / 2}px) scale(${Math.max(to.width / r.width, to.height / r.height)})` }],
      { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
    ).onfinish = done;
  };
  const go = (i: number) => {
    if (!v) return;
    v.index = Math.max(0, Math.min(v.items.length - 1, i));
    v.from = undefined;
    setZ({ s: 1, x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
    A.changed();
  };

  // Grows out of the tile it was opened from (a shared element), unless motion is reduced.
  useLayoutEffect(() => {
    const el = img.current;
    const st = stage.current;
    if (!v?.from || !el || !st || !m || reduced()) return;
    const f = fitRect(m.w ?? v.from.width, m.h ?? v.from.height, st.getBoundingClientRect());
    const from = v.from;
    const s = Math.max(from.width / f.w, from.height / f.h);
    el.animate(
      [
        { transform: `translate(${from.left + from.width / 2 - (f.x + f.w / 2)}px, ${from.top + from.height / 2 - (f.y + f.h / 2)}px) scale(${s})`, borderRadius: "18px" },
        { transform: "none", borderRadius: "0px" },
      ],
      { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    v.from = undefined;
  }, [v?.from, m?.id]);

  useEffect(() => {
    if (!v) return;
    const k = (e: KeyboardEvent) => {
      const r = viewerKey(e.key, { index, count: v.items.length });
      if (!r) return;
      e.preventDefault();
      if (r === "close") close();
      else go(r.index);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });

  // Pinch, double-tap, swipe sideways, swipe down: one set of pointers.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ d: number; s: number; cx: number; cy: number; x: number; y: number; px: number; py: number; t: number } | null>(null);
  const lastTap = useRef(0);
  if (!v || !m) return null;
  const st = stage.current?.getBoundingClientRect();
  const W = st?.width ?? innerWidth;

  const onDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const cx = p.reduce((a, b) => a + b.x, 0) / p.length;
    const cy = p.reduce((a, b) => a + b.y, 0) / p.length;
    const d = p.length > 1 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0;
    start.current = { d, s: z.s, cx, cy, x: z.x, y: z.y, px: e.clientX, py: e.clientY, t: Date.now() };
  };
  const onMove = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !start.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const s0 = start.current;
    if (p.length > 1 && s0.d) {
      const d = Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
      const s = Math.max(1, Math.min(4, (s0.s * d) / s0.d));
      setZ({ s, x: s0.x, y: s0.y });
      return;
    }
    const dx = e.clientX - s0.px;
    const dy = e.clientY - s0.py;
    if (z.s > 1.01) return setZ({ s: z.s, x: s0.x + dx, y: s0.y + dy });
    // At fit: sideways moves to the next picture, down closes.
    setDrag(Math.abs(dy) > Math.abs(dx) && dy > 0 ? { x: 0, y: dy } : { x: dx, y: 0 });
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
        if (z.s > 1.01) setZ({ s: 1, x: 0, y: 0 });
        else if (st) setZ({ s: 2.5, x: -(e.clientX - (st.left + st.width / 2)) * 1.5, y: -(e.clientY - (st.top + st.height / 2)) * 1.5 });
        return;
      }
      lastTap.current = Date.now();
      return;
    }
    if (z.s <= 1.01) {
      const fast = quick && moved > 40;
      if (drag.y > 110 || (fast && drag.y > 40)) return close();
      if (drag.x < -W * 0.18 || (fast && drag.x < -40)) {
        if (index < v.items.length - 1) return go(index + 1);
      } else if (drag.x > W * 0.18 || (fast && drag.x > 40)) {
        if (index > 0) return go(index - 1);
      }
      setDrag({ x: 0, y: 0 });
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return; // a trackpad pinch
    e.preventDefault();
    setZ((o) => {
      const s = Math.max(1, Math.min(4, o.s * Math.exp(-e.deltaY / 100)));
      return s === 1 ? { s, x: 0, y: 0 } : { ...o, s };
    });
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
  const title = from ? taskTitle(from) : "";
  const dim = Math.max(0, 1 - Math.abs(drag.y) / 420);
  const fitted = st ? fitRect(m.w ?? 1, m.h ?? 1, st) : undefined;
  return (
    <div class={`viewer${closing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-label={t("media.viewer", index + 1, v.items.length)}>
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
        onClick={(e) => e.target === e.currentTarget && z.s <= 1.01 && close()}
      >
        <img
          key={m.id}
          ref={img}
          src={full}
          onError={() => void refreshKeys([m.id])}
          alt={m.name ?? t("media.image")}
          draggable={false}
          style={{
            ...(fitted ? { width: `${fitted.w}px`, height: `${fitted.h}px` } : {}),
            ...(m.preview ? { backgroundImage: `url("${m.preview}")` } : {}),
            transform: `translate(${z.x + drag.x}px, ${z.y + drag.y}px) scale(${z.s * (drag.y ? Math.max(0.7, 1 - drag.y / 900) : 1)})`,
            transition: start.current ? "none" : undefined,
          }}
        />
      </div>
      <div class="v-bar" style={{ opacity: dim }}>
        {from && (
          <button type="button" class="from" onClick={() => ((A.viewer = undefined), A.go({ name: "task", id: from }))}>
            {t("media.from", title || t("media.task"))}
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
          <button type="button" class="btn text" onClick={copy}>
            {copied ? t("media.copied") : t("media.copy")}
          </button>
        )}
      </div>
    </div>
  );
}

export { isImageType };
