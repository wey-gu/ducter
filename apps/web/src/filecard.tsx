// D286: a file in the conversation, drawn as the thing it is. A card is a clay sheet: its badge (a
// little page whose band is the family's colour and says the extension: PDF, TS, DOCX), its name,
// its size and what else is known (pages, length), and Open; above that, where the file has one, a
// glimpse of it: a PDF's first page on white paper, code's first lines in its colours, a table's
// first rows, a video's frame with its length, a sound's waveform that plays right in the card.
// Each glimpse is made once, only when the card comes near the screen, and kept by the file's id.
import { docGlimpse, durationWords, fileBadge, fileFamily, fileView, pagesRef, parseTable, sizeWords, tableSep, viewText, type FileFamily, type MediaRef } from "@ducter/protocol";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Facts } from "./controls.tsx";
import { hlLines } from "./hl.ts";
import { mediaFetch, mediaUrl } from "./media-fresh.ts";
import { openFile, readHead } from "./fileview.tsx";
import { pdfFirstPage, type FirstPage } from "./fileview-pdf.tsx";
import type { Pic } from "./media-up.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- the badge ----------

/** The family's mark on the upper half of the badge's page (a 32 × 40 box). */
function Mark({ fam }: { fam: FileFamily }) {
  switch (fam) {
    case "pdf":
      return <path d="M10 11h12v6H10zM10 21h12" />;
    case "code":
      return <path d="M13 11.5l-3.5 4 3.5 4M19 11.5l3.5 4-3.5 4" />;
    case "doc":
      return <path d="M10 11h12M10 15.5h12M10 20h8" />;
    case "text":
      return <path d="M10 11.5h12M10 16h12M10 20.5h7" />;
    case "sheet":
      return <path d="M10 10.5h12v11H10zM10 14.2h12M10 17.8h12M15 10.5v11" />;
    case "slides":
      return <path d="M9.5 11h13v8h-13zM16 19v3.2M13.5 22.2h5" />;
    case "archive":
      return <path d="M16 7.5v2M16 11.5v2M16 15.5v2M14.5 19.5h3v3h-3z" />;
    case "audio":
      return <path d="M10.5 14.5v3M13.5 11.5v9M16.5 13v6M19.5 10.5v11M22.5 14v4" />;
    case "video":
      return <path d="M13.5 11.2v9.6l8-4.8z" />;
    case "picture":
      return <path d="M9.5 21l4.5-5 3 3 2.2-2.2 3.3 4.2M19 12.2a1.2 1.2 0 1 0 0.01 0" />;
    default:
      return <path d="M16 15.5h0.01" stroke-width="2.4" />;
  }
}

/** A file's badge (D286): a small page, its band in the family's colour holding the extension. */
export function FileBadge({ m, size = 36 }: { m: Pick<MediaRef, "type" | "name">; size?: number }) {
  const fam = fileFamily(m);
  const ext = fileBadge(m);
  return (
    <svg class={`fbadge fam-${fam}`} viewBox="0 0 32 40" width={size} height={size * 1.25} aria-hidden="true">
      <path class="pg" d="M7 2.5h13.5L28 10v25.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-31a2 2 0 0 1 2-2z" />
      <path class="fold" d="M20.5 2.5V8a2 2 0 0 0 2 2H28" />
      <g class="mk" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <Mark fam={fam} />
      </g>
      <path class="band" d="M5 26.5h23v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      {ext && (
        <text class="ext" x="16.5" y="34.3" text-anchor="middle" font-size={ext.length > 3 ? 6.4 : 7.6}>
          {ext}
        </text>
      )}
    </svg>
  );
}

// ---------- glimpses, made once ----------

type Glimpse =
  | { kind: "pdf"; page: FirstPage }
  | { kind: "code"; lines: string[] }
  | { kind: "doc"; title: string; lines: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "audio"; peaks: number[]; seconds: number; url: string }
  | { kind: "none" };

const glimpses = new Map<string, Promise<Glimpse>>();
/** Glimpses already made: a card shown again (the sent message replacing its pending one) draws at once. */
const made = new Map<string, Glimpse>();

/** Where a card's bytes come from: the home (a ref) or, while it goes up, this device's own file. */
type Source = { id: string; m: Pick<MediaRef, "type" | "name" | "bytes">; head(limit: number): Promise<Uint8Array>; all(): Promise<ArrayBuffer> };

export function sourceOf(m: MediaRef): Source {
  return {
    id: m.id,
    m,
    head: (limit) => readHead(m, limit, new AbortController().signal),
    all: () => mediaFetch(m).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))),
  };
}

export function sourceOfPic(p: Pic): Source {
  return {
    id: p.key,
    m: { type: p.file.type || "application/octet-stream", name: p.name, bytes: p.file.size },
    head: async (limit) => new Uint8Array(await p.file.slice(0, limit).arrayBuffer()),
    all: () => p.file.arrayBuffer(),
  };
}

/** Glimpses keep by the ref's id once a file lands: the one made from this device's copy carries over. */
export function aliasGlimpse(from: string, to: string) {
  const g = glimpses.get(from);
  if (g && !glimpses.has(to)) glimpses.set(to, g);
  const d = made.get(from);
  if (d && !made.has(to)) made.set(to, d);
}

/** What a family shows above the card, if anything. */
export function glimpseKind(m: Pick<MediaRef, "type" | "name">): Glimpse["kind"] | "video" {
  const fam = fileFamily(m);
  if (fam === "pdf") return "pdf";
  if (fam === "audio") return "audio";
  if (fam === "video") return "video";
  if (fam === "sheet" && fileView({ type: m.type, name: m.name }) === "table") return "table";
  // D567: a Markdown file shows its rendered start (a title, a line or two), never its marks.
  if (fileView({ type: m.type, name: m.name }) === "markdown") return "doc";
  if ((fam === "code" || fam === "text") && fileView({ type: m.type, name: m.name }) !== "none") return "code";
  return "none";
}

const GLIMPSE_LINES = 7;
const AUDIO_MAX = 12 * 1024 * 1024;
const PEAKS = 44;

function makeGlimpse(src: Source, width: number): Promise<Glimpse> {
  let g = glimpses.get(src.id);
  if (g) return g;
  g = (async (): Promise<Glimpse> => {
    const kind = glimpseKind(src.m);
    try {
      if (kind === "pdf") {
        const page = await pdfFirstPage(src.id, src.all, width);
        return page ? { kind: "pdf", page } : { kind: "none" };
      }
      if (kind === "code" || kind === "table" || kind === "doc") {
        const bytes = await src.head(4096);
        const { text } = viewText(bytes, src.m.bytes);
        if (kind === "doc") {
          const d = docGlimpse(text);
          return d.title || d.lines.length ? { kind: "doc", ...d } : { kind: "none" };
        }
        if (kind === "table") return { kind: "table", rows: parseTable(text, tableSep(src.m.name), 5).rows.map((r) => r.slice(0, 4)) };
        const name = src.m.name ?? (src.m.type === "application/json" ? "x.json" : "x.txt");
        const lines = text.split("\n").slice(0, GLIMPSE_LINES).join("\n");
        return { kind: "code", lines: hlLines(lines, name).map((l) => l.replace(/\t/g, "  ")) };
      }
      if (kind === "audio" && src.m.bytes <= AUDIO_MAX) {
        const buf = await src.all();
        const url = URL.createObjectURL(new Blob([buf], { type: src.m.type }));
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audio = await ctx.decodeAudioData(buf.slice(0));
        const ch = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(ch.length / PEAKS));
        const peaks: number[] = [];
        for (let i = 0; i < PEAKS; i++) {
          let m = 0;
          for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 16) m = Math.max(m, Math.abs(ch[j]!));
          peaks.push(m);
        }
        const top = Math.max(0.05, ...peaks);
        return { kind: "audio", peaks: peaks.map((p) => Math.max(0.12, p / top)), seconds: audio.duration, url };
      }
    } catch {}
    return { kind: "none" };
  })().then((x) => (made.set(src.id, x), x));
  glimpses.set(src.id, g);
  return g;
}

/** Calls back once the element comes within a screen of view. */
function useNear(ref: { current: Element | null }): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") return void setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return near;
}

function useGlimpse(src: Source | undefined, box: { current: Element | null }): Glimpse | undefined {
  const near = useNear(box);
  const [g, setG] = useState<Glimpse | undefined>(() => (src ? made.get(src.id) : undefined));
  useEffect(() => {
    if (!src) return;
    const done = made.get(src.id);
    if (done) return void setG(done);
    if (!near) return;
    let gone = false;
    void makeGlimpse(src, 352).then((x) => !gone && setG(x));
    return () => {
      gone = true;
    };
  }, [src?.id, near]);
  return g;
}

// ---------- the glimpses, drawn ----------

function PdfGlimpse({ g }: { g?: Glimpse }) {
  const page = g?.kind === "pdf" ? g.page : undefined;
  // A landscape page (a deck's slide) is shown whole; a portrait page shows its top, as paper does.
  const [wide, setWide] = useState(false);
  return (
    <div class={`fc-pv pdf${wide ? " wide" : ""}`}>
      {page ? (
        <img class="fc-page" src={page.url} alt="" draggable={false} onLoad={(e) => setWide(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)} />
      ) : (
        <span class="fc-page blank" />
      )}
    </div>
  );
}

function CodeGlimpse({ g }: { g?: Glimpse }) {
  const lines = g?.kind === "code" ? g.lines : undefined;
  return (
    <div class="fc-pv code" aria-hidden="true">
      {lines ? (
        <pre class="in">
          {lines.map((h, i) => (
            <span key={i} class="cl" dangerouslySetInnerHTML={{ __html: h || " " }} />
          ))}
        </pre>
      ) : (
        <pre>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} class="cl ghost" style={{ width: `${[72, 54, 86, 40, 64][i]}%` }} />
          ))}
        </pre>
      )}
    </div>
  );
}

/** D567: a report's start as it reads: its title in the heading face, a line or two of its words. */
function DocGlimpse({ g }: { g?: Glimpse }) {
  const d = g?.kind === "doc" ? g : undefined;
  return (
    <div class="fc-pv doc" aria-hidden="true">
      <div class={`fc-sheet${d ? " in" : ""}`}>
        {d ? (
          <>
            {d.title && <span class="fc-dt">{d.title}</span>}
            {d.lines.map((l, i) => (
              <span key={i} class="fc-dl">
                {l}
              </span>
            ))}
          </>
        ) : (
          <>
            <span class="fc-dt ghost" />
            {[88, 64].map((w, i) => (
              <span key={i} class="fc-dl ghost" style={{ width: `${w}%` }} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TableGlimpse({ g }: { g?: Glimpse }) {
  const rows = g?.kind === "table" ? g.rows : undefined;
  return (
    <div class="fc-pv table" aria-hidden="true">
      {rows && (
        <table class="in">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} class={i === 0 ? "head" : undefined}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VideoGlimpse({ m, onLength }: { m: MediaRef; onLength: (s: number) => void }) {
  const [ready, setReady] = useState(false);
  const [len, setLen] = useState<number>();
  return (
    <div class={`fc-pv video${ready ? " in" : ""}`}>
      <video
        src={`${mediaUrl(m)}#t=0.6`}
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => setReady(true)}
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget as HTMLVideoElement).duration;
          if (Number.isFinite(d)) setLen(d), onLength(d);
        }}
      />
      <span class="play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M9 6.8v10.4l8.4-5.2z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        </svg>
      </span>
      {len !== undefined && <span class="len">{durationWords(len)}</span>}
    </div>
  );
}

/** A sound plays right in its card: the waveform fills as it plays, a tap on it seeks. */
function AudioGlimpse({ g }: { g?: Glimpse }) {
  const a = g?.kind === "audio" ? g : undefined;
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  useEffect(() => () => el.current?.pause(), []);
  const toggle = (e: Event) => {
    e.stopPropagation();
    if (!a) return;
    if (!el.current) {
      const au = new Audio(a.url);
      au.ontimeupdate = () => setAt(au.currentTime / Math.max(0.01, a.seconds));
      au.onended = () => (setPlaying(false), setAt(0));
      el.current = au;
    }
    if (playing) el.current.pause(), setPlaying(false);
    else void el.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const seek = (e: JSX.TargetedMouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (!el.current) toggle(e as unknown as Event);
    if (el.current) el.current.currentTime = f * a.seconds;
    setAt(f);
  };
  const peaks = a?.peaks ?? Array.from({ length: PEAKS }, (_, i) => 0.18 + 0.12 * Math.abs(Math.sin(i * 0.7)));
  return (
    <div class={`fc-pv audio${a ? " in" : ""}${playing ? " playing" : ""}`}>
      <button type="button" class="pp" aria-label={t(playing ? "media.pause" : "media.play")} disabled={!a} onClick={toggle}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
          {playing ? <path d="M8 6.5h2.6v11H8zM13.4 6.5H16v11h-2.6z" /> : <path d="M8.5 6.4v11.2l9-5.6z" />}
        </svg>
      </button>
      <span class="wave" onClick={seek} aria-hidden="true">
        {peaks.map((p, i) => (
          <i key={i} class={i / peaks.length < at ? "on" : undefined} style={{ height: `${Math.round(p * 100)}%`, transitionDelay: reduced() ? undefined : `${i * 6}ms` }} />
        ))}
      </span>
      <span class="len">{a ? durationWords(playing || at ? at * a.seconds : a.seconds) : ""}</span>
    </div>
  );
}

// ---------- the card ----------

/** The facts under a file's name: its size, and its pages or length once known, each apart (D291). */
function facts(m: Pick<MediaRef, "bytes">, g: Glimpse | undefined, len?: number): string[] {
  const parts = [sizeWords(m.bytes)];
  if (g?.kind === "pdf") parts.push(t("file.pages", g.page.pages));
  if (g?.kind === "audio") parts.push(durationWords(g.seconds));
  if (len !== undefined) parts.push(durationWords(len));
  return parts;
}

/**
 * A file in a message or a report (D239, D286): the whole card opens it inside Ducter (the viewer
 * grows out of it), never a link to the home. `pic`: a file of the person's own message still on
 * its way (the ring where Open will be; its glimpse made from this device's copy).
 */
export function FileCard({ m, pic, flight }: { m?: MediaRef; pic?: Pic; flight?: DOMRect }) {
  const box = useRef<HTMLDivElement>(null);
  const src = m ? sourceOf(m) : pic ? sourceOfPic(pic) : undefined;
  const meta: Pick<MediaRef, "type" | "name" | "bytes"> = m ?? src!.m;
  // D439: an Office file shown with its PDF: the glimpse is its first page, the facts its pages.
  const pages = m ? pagesRef(m) : undefined;
  const want = pages ? "pdf" : glimpseKind(meta);
  const g = useGlimpse(want === "none" || want === "video" ? undefined : pages ? sourceOf(pages as MediaRef) : src, box);
  // A glimpse that couldn't be made (a locked PDF, a sound this browser can't read) leaves the card plain.
  const kind = g?.kind === "none" ? "none" : want;
  const [len, setLen] = useState<number>();
  const name = meta.name ?? t("media.file");
  const sending = !m && pic;
  const failed = pic?.state === "failed";

  // D286: a file sent from the tray flies from where it sat into its place.
  useEffect(() => {
    const el = box.current;
    if (!el || !flight || reduced()) return;
    const to = el.getBoundingClientRect();
    el.animate([{ transform: `translate(${flight.left - to.left}px, ${flight.top - to.top}px)`, opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" });
  }, []);

  const open = () => m && openFile(m, box.current ?? undefined);
  return (
    <div
      ref={box}
      class={`filecard fam-${fileFamily(meta)}${kind !== "none" ? ` has-pv pv-${kind}` : ""}${sending ? " sending" : ""}${failed ? " failed" : ""}`}
      data-file={m?.id ?? pic?.key}
      role={m ? "button" : undefined}
      tabIndex={m ? 0 : undefined}
      aria-label={m ? t("media.fileOpen", name) : name}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), open())}
    >
      {kind === "pdf" && <PdfGlimpse g={g} />}
      {kind === "code" && <CodeGlimpse g={g} />}
      {kind === "doc" && <DocGlimpse g={g} />}
      {kind === "table" && <TableGlimpse g={g} />}
      {kind === "video" && m && <VideoGlimpse m={m} onLength={setLen} />}
      {kind === "audio" && <AudioGlimpse g={g} />}
      <span class="fc-row">
        <FileBadge m={meta} />
        <span class="fc-meta">
          <span class="fn" title={meta.name}>
            {name}
          </span>
          {failed ? <span class="fs">{t("media.failed")}</span> : <Facts class="fs" items={facts(meta, g, len)} />}
        </span>
        {sending ? (
          failed ? null : (
            <span class="fc-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.max(0.04, pic!.progress)})` }} />
            </span>
          )
        ) : (
          <span class="fc-open" aria-hidden="true">
            {t("media.open")}
          </span>
        )}
      </span>
    </div>
  );
}
