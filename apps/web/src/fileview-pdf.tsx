// D241: a PDF's pages drawn inside the viewer, by pdf.js (Mozilla) from the bytes this client
// fetched. The page can't use the browser's own PDF reader: the home serves files under a
// sandboxing CSP, and Chromium's reader won't run in a sandboxed document (research/75). pdf.js
// loads only when a PDF opens (app/pdf.js, its worker app/pdf.worker.js; no eval). Pages are
// drawn as they come near the screen and let go once they are well away from it, so a long PDF
// holds only a few canvases at once.
import type { MediaRef } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { mediaFetch } from "./media-fresh.ts";

// pdf.js's own types aren't bundled: only what is used here.
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel(): void };
  cleanup(): void;
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
interface PdfLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: object): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}

let lib: Promise<PdfLib> | undefined;
const loadLib = () =>
  (lib ??= (import(/* the page's own file; never bundled */ new URL("app/pdf.js", A.base).href) as Promise<PdfLib>).then((l) => {
    l.GlobalWorkerOptions.workerSrc = new URL("app/pdf.worker.js", A.base).href;
    return l;
  }));

/** Pages kept drawn: those within this much of the screen (in screens). */
const NEAR = "150% 0px";

export function PdfBody({ m, onPages, onFail }: { m: MediaRef; onPages: (n: number) => void; onFail: () => void }) {
  const [doc, setDoc] = useState<PdfDoc>();
  const [aspect, setAspect] = useState(1.294); // A4 until the first page says
  const [near, setNear] = useState<Set<number>>(() => new Set([1, 2]));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    let d: PdfDoc | undefined;
    (async () => {
      try {
        const [l, bytes] = await Promise.all([loadLib(), mediaFetch(m).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))]);
        d = await l.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableAutoFetch: true, enableXfa: false }).promise;
        if (gone) return void d.destroy();
        const first = (await d.getPage(1)).getViewport({ scale: 1 });
        setAspect(first.height / first.width);
        setDoc(d);
        onPages(d.numPages);
      } catch {
        if (!gone) onFail();
      }
    })();
    return () => {
      gone = true;
      void d?.destroy();
    };
  }, [m.id]);

  // Which pages are near the screen: drawn; the others are let go.
  useEffect(() => {
    const el = box.current;
    if (!doc || !el) return;
    const io = new IntersectionObserver(
      (es) =>
        setNear((s) => {
          const n = new Set(s);
          for (const e of es) {
            const k = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) n.add(k);
            else n.delete(k);
          }
          return n;
        }),
      { root: el.closest(".fv-body"), rootMargin: NEAR },
    );
    el.querySelectorAll(".fv-page").forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [doc]);

  if (!doc) return <p class="fv-note quiet">{A.L.t("file.loading")}</p>;
  return (
    <div class="fv-pdf" ref={box}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPageView key={i} doc={doc} n={i + 1} aspect={aspect} on={near.has(i + 1)} />
      ))}
    </div>
  );
}

function PdfPageView({ doc, n, aspect, on }: { doc: PdfDoc; n: number; aspect: number; on: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(aspect);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = holder.current;
    if (!on || !el) return;
    let task: { cancel(): void } | undefined;
    let page: PdfPage | undefined;
    let gone = false;
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        page = await doc.getPage(n);
        if (gone) return;
        const one = page.getViewport({ scale: 1 });
        setRatio(one.height / one.width);
        const dpr = Math.min(2, devicePixelRatio || 1);
        const scale = (el.clientWidth * dpr) / one.width;
        const vp = page.getViewport({ scale });
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const t = page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp });
        task = t;
        await t.promise;
        if (gone) return;
        el.replaceChildren(canvas);
        setDrawn(true);
      } catch {}
    })();
    return () => {
      gone = true;
      task?.cancel();
      page?.cleanup();
      // Let the pixels go: a page far from the screen holds none.
      canvas.width = canvas.height = 0;
      el.replaceChildren();
      setDrawn(false);
    };
  }, [on, doc, n]);
  return <div class={`fv-page${drawn ? " in" : ""}`} data-page={n} role="img" aria-label={A.L.t("file.page", n)} style={{ aspectRatio: `1 / ${ratio}` }} ref={holder} />;
}
