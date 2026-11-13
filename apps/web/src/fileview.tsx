// D239: a file a task showed opens inside Ducter, never as a link to the home. The card's sheet
// of paper grows out of it (a shared element; a fade under reduced motion) and is read in the
// viewer that suits the file: a Markdown report as a document, a CSV as a table, text and source
// with their colours and line numbers, an SVG as a picture, a video playing; anything else says
// plainly that it can't be shown here and offers Save a copy. D241: a PDF's pages are drawn by
// pdf.js (fileview-pdf.tsx); ⌘F / Ctrl+F (or the head's magnifier) finds in a text, a report or a
// table, every match marked and the current one centred. The bytes come through this
// client's own fetch (the same keyed path the pictures use), the first FILE_VIEW_BYTES of a text,
// cut at a whole line; Save a copy takes the whole file to this device (the share sheet on a
// phone, a download elsewhere), never by sending the person to the home's address.
import { EXT_OF, FILE_VIEW_BYTES, FILE_VIEW_ROWS, fileView, parseTable, sizeWords, tableSep, viewText, type MediaRef } from "@ducter/protocol";
import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { hlLines } from "./hl.ts";
import { markdownDoc } from "./markdown-doc.ts";
import { findAll, rangeOf, textMap } from "./fileview-find.ts";
import { PdfBody } from "./fileview-pdf.tsx";
import { mediaFetch, mediaUrl } from "./media-fresh.ts";
import { title } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const handheld = () => typeof navigator !== "undefined" && /iPhone|iPad|Android/.test(navigator.userAgent);

/** Opens a file in the viewer, growing out of the card it was opened from. */
export function openFile(m: MediaRef, el?: HTMLElement) {
  A.fileView = { ref: m, ...(el ? { from: el.getBoundingClientRect() } : {}) };
  A.changed();
}

/** What a file is called when it is saved. */
export function fileName(m: MediaRef): string {
  return m.name ?? `ducter-${m.id.slice(0, 8)}.${EXT_OF[m.type] ?? "bin"}`;
}

/** The literal kind a person reads in the header: MD, CSV, PDF. */
const kindWord = (m: MediaRef) => (fileName(m).split(".").pop() ?? "").toUpperCase().slice(0, 5);

/** The first `limit` bytes of a file (all of it when it is smaller), and its whole size. */
async function readHead(m: MediaRef, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const res = await mediaFetch(m, { signal });
  if (!res.ok || !res.body) throw new Error(String(res.status));
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    while (n < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(n, limit));
  let at = 0;
  for (const p of parts) {
    const take = Math.min(p.length, out.length - at);
    out.set(p.subarray(0, take), at);
    at += take;
    if (at >= out.length) break;
  }
  return out;
}

/** Save a copy: the whole file onto this device. A phone's share sheet (Save to Files, AirDrop, an app), else a download. */
export async function saveCopy(m: MediaRef) {
  try {
    const blob = await (await mediaFetch(m)).blob();
    const name = fileName(m);
    const file = new File([blob], name, { type: m.type });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (handheld() && typeof nav.share === "function" && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        return void (await nav.share({ files: [file] }));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  } catch {
    A.toast(t("file.failed"));
  }
}

type Loaded = { state: "loading" } | { state: "failed" } | { state: "ready"; text?: string; cut?: boolean; pic?: string };

function useFile(m: MediaRef, again: number): Loaded {
  const kind = fileView(m);
  const own = kind === "video" || kind === "none" || kind === "pdf";
  const [got, setGot] = useState<Loaded>({ state: own ? "ready" : "loading" });
  useEffect(() => {
    if (own) return;
    const ac = new AbortController();
    let pic: string | undefined;
    setGot({ state: "loading" });
    (async () => {
      try {
        if (kind === "picture") {
          const b = await (await mediaFetch(m, { signal: ac.signal })).blob();
          pic = URL.createObjectURL(b);
          return setGot({ state: "ready", pic });
        }
        const bytes = await readHead(m, FILE_VIEW_BYTES, ac.signal);
        setGot({ state: "ready", ...viewText(bytes, m.bytes) });
      } catch {
        if (!ac.signal.aborted) setGot({ state: "failed" });
      }
    })();
    return () => {
      ac.abort();
      if (pic) URL.revokeObjectURL(pic);
    };
  }, [m.id, again]);
  return got;
}

// ---------- the drawn marks ----------

const Cross = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

const Lens = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="8.6" cy="8.6" r="5" />
    <path d="M12.4 12.4l4.2 4.2" />
  </svg>
);

const Chevron = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d={up ? "M5.5 12.5L10 8l4.5 4.5" : "M5.5 7.5L10 12l4.5-4.5"} />
  </svg>
);

/** A sheet with a folded corner; a document's lines on it, or a grid for a table. */
export function FileGlyph({ m, size = 24 }: { m: MediaRef; size?: number }) {
  const k = fileView(m);
  return (
    <svg class="fi" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
      <path d="M6 2.8h8l4.2 4.2v14.2H6z" />
      <path d="M14 2.8V7h4.2" />
      {(k === "markdown" || k === "text") && <path d="M8.8 11.6h6.4M8.8 14.6h6.4M8.8 17.6h3.8" stroke-width="1.4" />}
      {k === "table" && <path d="M8.6 11.2h6.8v6.6H8.6zM8.6 14.5h6.8M12 11.2v6.6" stroke-width="1.3" />}
      {k === "video" && <path d="M10.4 11.4v5.6l4.6-2.8z" stroke-width="1.4" />}
      {k === "picture" && <path d="M8.6 17.4l2.4-2.6 1.7 1.6 1.2-1.1 1.9 2.1" stroke-width="1.4" />}
      {k === "pdf" && <path d="M8.8 11.4h6.4v3.4H8.8zM8.8 17.6h6.4" stroke-width="1.35" />}
    </svg>
  );
}

// ---------- the bodies ----------

/** Text and source with their colours and line numbers; drawn in blocks the browser skips while they are out of view. */
function TextBody({ text, name }: { text: string; name: string }) {
  const html = useMemo(() => hlLines(text, name), [text, name]);
  const blocks: string[][] = [];
  for (let i = 0; i < html.length; i += 300) blocks.push(html.slice(i, i + 300));
  const digits = String(html.length).length;
  return (
    <div class="code view fv-code" role="document" style={{ "--ln-w": `${digits + 1}ch` } as JSX.CSSProperties}>
      {blocks.map((b, k) => (
        <div class="fv-block" key={k} style={{ containIntrinsicSize: `auto ${b.length * 21}px` }}>
          {b.map((h, i) => (
            <div key={i} class="cl">
              <span class="ln" aria-hidden="true">
                {k * 300 + i + 1}
              </span>
              <span class="tx" dangerouslySetInnerHTML={{ __html: h || " " }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TableBody({ text, name }: { text: string; name: string }) {
  const { rows, more } = useMemo(() => parseTable(text, tableSep(name), FILE_VIEW_ROWS), [text, name]);
  const [head, ...body] = rows;
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: cols }, (_, k) => r[k] ?? "");
  const num = (s: string) => /^-?[\d.,]+%?$/.test(s.trim()) && s.trim() !== "";
  // A column of numbers lines up on the right, its heading with it.
  const numCol = Array.from({ length: cols }, (_, k) => body.length > 0 && body.every((r) => !r[k] || num(r[k]!)) && body.some((r) => r[k]));
  return (
    <>
      <div class="fv-table" role="region" aria-label={name} tabIndex={0}>
        <table>
          {head && (
            <thead>
              <tr>
                {pad(head).map((c, k) => (
                  <th key={k} class={numCol[k] ? "num" : undefined}>{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {pad(r).map((c, k) => (
                  <td key={k} class={numCol[k] ? "num" : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && <p class="fv-cut">{t("file.rowsCut", FILE_VIEW_ROWS)}</p>}
    </>
  );
}

function NoneBody({ m, said }: { m: MediaRef; said?: string }) {
  return (
    <div class="fv-none">
      <div class="fv-paper" aria-hidden="true">
        <FileGlyph m={m} size={56} />
        <span class="kind">{kindWord(m)}</span>
      </div>
      <p>{said ?? t("file.none")}</p>
      <button type="button" class="btn primary" onClick={() => void saveCopy(m)}>
        <span class="lbl">{t("file.save")}</span>
      </button>
    </div>
  );
}

// ---------- the viewer ----------

export function FileViewer() {
  const fv = A.fileView;
  const sheet = useRef<HTMLElement>(null);
  const [again, setAgain] = useState(0);
  const [source, setSource] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pages, setPages] = useState(0);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [find, setFind] = useState<{ q: string; at: number } | null>(null);
  const [hits, setHits] = useState(0);
  const findBox = useRef<HTMLInputElement>(null);
  const bodyEl = useRef<HTMLDivElement>(null);
  const m = fv!.ref;
  const kind = fileView(m);
  const got = useFile(m, again);
  const name = fileName(m);

  const close = () => {
    if (closing) return;
    const done = () => ((A.fileView = undefined), A.changed());
    const el = sheet.current;
    const card = document.querySelector<HTMLElement>(`[data-file="${m.id}"]`);
    const to = card?.getBoundingClientRect();
    setClosing(true);
    if (!el || reduced() || !to || to.bottom < 0 || to.top > innerHeight) return void setTimeout(done, reduced() ? 0 : 170);
    const r = el.getBoundingClientRect();
    el.animate(
      [
        { transform: `translateY(${drag}px)`, borderRadius: getComputedStyle(el).borderRadius },
        { transform: `translate(${to.left - r.left}px, ${to.top - r.top}px) scale(${to.width / r.width}, ${to.height / r.height})`, borderRadius: "14px" },
      ],
      { duration: 240, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "forwards" },
    ).onfinish = done;
  };

  // Grows out of the card (a shared element): the sheet starts at the card's box and settles.
  useLayoutEffect(() => {
    const el = sheet.current;
    const from = fv?.from;
    if (!el || !from || reduced()) return;
    const r = el.getBoundingClientRect();
    el.animate(
      [
        { transform: `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${from.width / r.width}, ${from.height / r.height})`, borderRadius: "14px" },
        { transform: "none" },
      ],
      { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    fv!.from = undefined;
  }, []);

  const text0 = got.state === "ready" ? got.text : undefined;
  const findable = text0 != null && (kind === "markdown" || kind === "table" || kind === "text");
  const openFind = () => {
    if (!findable) return;
    setFind((f) => f ?? { q: "", at: 0 });
    requestAnimationFrame(() => (findBox.current?.focus(), findBox.current?.select()));
  };
  const step = (d: number) => setFind((f) => (f && hits ? { ...f, at: (f.at + d + hits) % hits } : f));
  // What the key handler reads now, not as of its last render (two quick Esc presses).
  const finding = useRef(false);
  finding.current = !!find;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "f" && findable) return void (e.preventDefault(), e.stopPropagation(), openFind());
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g" && finding.current) return void (e.preventDefault(), step(e.shiftKey ? -1 : 1));
      // Esc closes the find field first, then the file.
      if (e.key === "Escape" && finding.current) return void (e.preventDefault(), e.stopPropagation(), (finding.current = false), setFind(null));
      if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), close();
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  });

  // Find: every match marked (the CSS Custom Highlight API), the current one centred. Where a
  // browser lacks it, the current match is selected instead.
  useEffect(() => {
    const reg = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
    const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    const clear = () => (reg?.delete("fv-hit"), reg?.delete("fv-now"));
    const root = bodyEl.current;
    if (!find || !find.q || !root) return void (clear(), setHits(0));
    const map = textMap(root);
    const found = findAll(map.text, find.q);
    setHits(found.length);
    if (!found.length) return void clear();
    const at = Math.min(find.at, found.length - 1);
    const ranges = found.map(([a, b]) => rangeOf(map, a, b)).filter((r): r is Range => !!r);
    const now = ranges[at];
    if (reg && H) {
      reg.set("fv-hit", new H(...ranges));
      if (now) reg.set("fv-now", new H(now));
    } else if (now) {
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(now);
    }
    // Centre it: its line (drawn or not yet) first, then the words themselves.
    const line = now?.startContainer.parentElement?.closest<HTMLElement>(".cl, p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote");
    line?.scrollIntoView({ block: "center", behavior: "auto" });
    // A long line of code: across too, to the words.
    const box = now?.getBoundingClientRect();
    const view = root.getBoundingClientRect();
    if (box && box.width && (box.right > view.right - 24 || box.left < view.left + 56)) root.scrollLeft += box.left - view.left - view.width / 3;
    return clear;
  }, [find?.q, find?.at, text0, source]);

  // On a phone the sheet's head pulls down to close it, as the picture viewer swipes down.
  const pull = useRef<{ y: number; t: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    pull.current = { y: e.clientY, t: Date.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => pull.current && setDrag(Math.max(0, e.clientY - pull.current.y));
  const onUp = () => {
    const p = pull.current;
    pull.current = null;
    if (!p) return;
    const fast = Date.now() - p.t < 250 && drag > 40;
    if (drag > 120 || fast) return close();
    setDrag(0);
  };

  const text = text0;
  const lines = text != null ? text.split("\n").length : 0;
  const canToggle = (kind === "markdown" || kind === "table") && text != null;
  const copy = async () => {
    try {
      const all = got.state === "ready" && got.cut ? await (await mediaFetch(m)).text() : text ?? "";
      await navigator.clipboard.writeText(all);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      A.toast(t("media.copy.failed.text"));
    }
  };
  const from = m.from?.taskId;
  const task = from ? A.S.tasks.get(from) : undefined;
  const taskTitle = task ? title(task).trim() : "";
  const meta = [kindWord(m), sizeWords(m.bytes), lines && kind !== "table" ? t("file.lines", lines) : "", pages ? t(pages === 1 ? "file.pages.one" : "file.pages", pages) : ""].filter(Boolean).join(" · ");
  const body =
    got.state === "loading" ? (
      <p class="fv-note quiet">{t("file.loading")}</p>
    ) : got.state === "failed" ? (
      <div class="fv-note">
        <p>{t("file.failed")}</p>
        <button type="button" class="btn secondary sm" onClick={() => setAgain((n) => n + 1)}>
          <span class="lbl">{t("media.retry")}</span>
        </button>
      </div>
    ) : kind === "none" || (kind === "pdf" && pdfFailed) ? (
      <NoneBody m={m} said={kind === "pdf" ? t("file.pdfFailed") : undefined} />
    ) : kind === "pdf" ? (
      <PdfBody m={m} onPages={setPages} onFail={() => setPdfFailed(true)} />
    ) : kind === "video" ? (
      <div class="fv-media">
        <video src={mediaUrl(m)} controls playsInline preload="metadata" />
      </div>
    ) : kind === "picture" ? (
      <div class="fv-media">
        <img src={got.pic} alt={name} draggable={false} />
      </div>
    ) : source || kind === "text" ? (
      <TextBody text={text ?? ""} name={kind === "table" ? "x.csv" : name} />
    ) : kind === "table" ? (
      <TableBody text={text ?? ""} name={name} />
    ) : (
      <Doc text={text ?? ""} />
    );
  return (
    <div class={`fileview${closing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-label={name}>
      <div class="scrim" onClick={close} style={{ opacity: Math.max(0, 1 - drag / 400) }} />
      <article class={`fv-sheet fv-k-${kind}${source ? " fv-src" : ""}`} ref={sheet} style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}>
        <header class="fv-head" onPointerDown={onDown as any} onPointerMove={onMove as any} onPointerUp={onUp} onPointerCancel={onUp}>
          <span class="fv-grab" aria-hidden="true" />
          <FileGlyph m={m} size={26} />
          <div class="fv-title">
            <span class="nm" title={name}>
              {name}
            </span>
            <span class="meta">{meta}</span>
          </div>
          {findable && (
            <button type="button" class="btn text icon fv-lens" aria-label={t("file.find")} aria-pressed={!!find} title={t("file.find.key", /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘F" : "Ctrl+F")} onClick={() => (find ? setFind(null) : openFind())}>
              <Lens />
            </button>
          )}
          {canToggle && (
            <button type="button" class="btn text sm fv-toggle" aria-pressed={source} onClick={() => setSource((s) => !s)}>
              <span class="lbl">{source ? t("file.formatted") : t("file.source")}</span>
            </button>
          )}
          <button type="button" class="btn text icon fv-x" aria-label={t("media.close")} onClick={close}>
            <Cross />
          </button>
        </header>
        {find && (
          <div class="fv-find" role="search">
            <input
              ref={findBox}
              autoFocus
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellcheck={false}
              placeholder={t("file.find.placeholder")}
              aria-label={t("file.find")}
              value={find.q}
              onInput={(e) => setFind({ q: (e.currentTarget as HTMLInputElement).value, at: 0 })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault(), step(e.shiftKey ? -1 : 1);
              }}
            />
            <span class={`fv-count${find.q && !hits ? " none" : ""}`} aria-live="polite">
              {find.q ? (hits ? t("file.find.count", Math.min(find.at, hits - 1) + 1, hits) : t("file.find.none")) : ""}
            </span>
            <button type="button" class="btn text icon sm" aria-label={t("file.find.prev")} disabled={!hits} onClick={() => step(-1)}>
              <Chevron up />
            </button>
            <button type="button" class="btn text icon sm" aria-label={t("file.find.next")} disabled={!hits} onClick={() => step(1)}>
              <Chevron />
            </button>
          </div>
        )}
        <div class="fv-body" ref={bodyEl}>
          {body}
          {got.state === "ready" && got.cut && <p class="fv-cut">{t("file.cut", sizeWords(FILE_VIEW_BYTES))}</p>}
        </div>
        <footer class="fv-bar">
          {from && (
            <button type="button" class="from" onClick={() => ((A.fileView = undefined), A.go({ name: "task", id: from }))}>
              {t("media.from", taskTitle || t("media.task"))}
            </button>
          )}
          <span class="grow" />
          {text != null && (
            <button type="button" class="btn text" onClick={() => void copy()}>
              <span class="lbl">{copied ? t("media.copied") : t("media.copy")}</span>
            </button>
          )}
          {kind !== "none" && !(kind === "pdf" && pdfFailed) && (
            <button type="button" class="btn secondary" onClick={() => void saveCopy(m)}>
              <span class="lbl">{t("file.save")}</span>
            </button>
          )}
        </footer>
      </article>
    </div>
  );
}

function Doc({ text }: { text: string }) {
  const html = useMemo(() => markdownDoc(text), [text]);
  return <div class="fv-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
