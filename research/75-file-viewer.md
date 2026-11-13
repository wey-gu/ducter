# 75. Opening a file a task made: what Ducter did, what T3 Code does

> 2026-11-13 · Feeds D239, D241 (§5) · Trigger: the author tapped **打开** on a task's
> `investigation.md · 5 KB` card in the Mac app and got a page on his home server (hel) in the
> browser: "让我点开一个文件居然是 hel 上的链接 … 应该能在 ducter 里合理设计 ui 查看".

Tags: VERIFIED (read in the code or run here), DOCUMENTED (a project's own docs or comments),
INFERRED (reasoned, not run).

## 1. What Open did, per client

**Mac** (`apps/desktop/internal/views/media.go` `fileCard`, before D239): Open called
`a.Media.OpenURL(a.Media.Home().URL(ref.Path() + "&dl=1"))`, which `mediahands.go` hands to
`mygo.Shell.OpenExternal`, the default browser. `Home()` is the client's target: the home's
HTTP base derived from its WebSocket address (`media.HTTPBase`). For a home on a server that is
the server's own address. The URL is `https://<home>/media/<sha256>?k=<key>&dl=1`. VERIFIED.

**Phone and web** (`apps/web/src/media.tsx` `FileCard`): an `<a href="…/media/<id>?k=<key>&dl=1"
target="_blank" download>`. Same origin as the app, so `download` applies in a desktop browser;
in a phone's browser or the iOS shell's web view it opens a new tab or nothing useful. VERIFIED
(code); the per-browser outcome INFERRED.

**What the home answered** (`packages/core/src/media.ts` `serve`): every non-picture got
`content-disposition: inline` even with `&dl=1` (the ternary said `attachment` only for
pictures), under `content-security-policy: default-src 'none'; … sandbox` and `nosniff`. So the
browser showed a Markdown file as a bare page of raw text at the home's address, rather than
downloading it. VERIFIED (code; fixed by D239 and covered by a test).

| Kind | Mac, before | Phone/web, before |
|---|---|---|
| `.md`, `.txt`, `.csv`, `.json`, `.html` | browser tab at the home's address, raw text (HTML sandboxed, inert) | new tab, raw text |
| `.pdf` | the browser's PDF viewer, or blocked: Chromium won't run its PDF plugin in a sandboxed document (see §3) | same |
| `.zip`, `.docx`, `.xlsx`, `.pptx`, video | a download or a bare tab | same |
| `.ts`, `.go`, `.sh`, `.log` | could not arrive at all: `sniffFile` refused any name outside `FILE_TYPES` | same |

## 2. What leaked

- **The device token: no.** `Home.Token` goes only in the `Authorization` header of uploads;
  `URL()` and `Fetch` carry none. VERIFIED.
- **The file's key: yes.** `k` is an HMAC of the file's id with the home's own secret
  (`media/.key`). It opens that one file, never expires, and can't be revoked short of rotating the
  secret (which breaks every picture in the Log). Opening the link in a browser put it in browser
  history, and in synced history (Safari iCloud, Chrome sync) on the person's other devices,
  together with the home's address. Anyone who can read that history and reach the home can fetch
  that file. Scope: one file per link, no other access. VERIFIED (code). A bug: D239 fixes it by
  never navigating to the link. The `<img src>` fetches pictures already use are a different
  case: they don't enter history.
- **Not fixed by D239:** keys don't expire. T3 Code's signed asset URLs carry an `expiresAt`
  (§3). Expiring keys would need clients to refresh refs held in the Log. Recorded in todo.

## 3. T3 Code (clone `pingdotgg/t3code` at `6d35d09`, 2026-11-11, read only, not run)

- **Files open in the app.** A right-side panel (`apps/web/src/components/files/`) with a viewer
  per kind: rendered Markdown through the chat's own renderer, front matter masked
  (`FileMarkdownPreview.tsx`); CSV/TSV as a virtual table (`DelimitedTablePreview` →
  `LargeTextViewer` → `VirtualTablePreview`); large text in a worker, with a first screen
  (16 KB) shown at once; PDF through `pdfjs-dist` 6.4 (`PdfViewer.tsx`: zoom, find, page
  layout); Office files unzipped and drawn (`officeArchive.ts`, 1.4 k lines); fonts, audio,
  video, Mermaid, notebooks; a hex view for binaries. VERIFIED (source).
- **Rendered and source.** One toggle per file: "Show markdown source" / "Show rendered
  markdown", the same for tables, HTML and Mermaid (`AttachmentFilePreview.tsx`). VERIFIED.
- **Bounded reads.** `readBoundedDocument` streams the body and stops at a limit; text previews
  ask for a `Range` up to `FILE_TEXT_PREVIEW_MAX_BYTES`. VERIFIED.
- **Assets.** Signed URLs under `/api/assets` with an `expiresAt` in the signed payload
  (`apps/server/src/assets/AssetAccess.ts`, `AssetSigner.ts`). VERIFIED.
- **PDF and HTML frames.** HTML runs in a sandboxed frame with an opaque origin; a PDF frame is
  left unsandboxed with the comment "Chromium's PDF plugin requires an unsandboxed frame; src is
  an exact-file asset grant" (`BrowserDocumentFrame.tsx`). DOCUMENTED (their comment). It means a
  PDF served under Ducter's `sandbox` CSP won't render in Chromium's viewer; drawing PDFs needs
  pdf.js (about 1 MB of worker and fonts) or a native view. INFERRED for Ducter.
- **Where T3 Code differs from Ducter's case.** Its files are a developer's working copy, beside
  the thread, for someone who knows what a file is. Ducter's are a task's result handed to a
  person in a messaging app, usually a report, and the reader may be a fresh user. A
  resizable side panel would be the wrong shape there. A sheet that grows out of the card, read
  and closed, fits the conversation's zoom level. The opened task's workbench (D214) already
  gives the developer the working-copy view.

## 4. What Ducter already has to reuse

- The picture viewer (D206): shared-element growth from the tile, reduced-motion fade, Save,
  Copy, **来自 {task}**. Its interaction shape carries over. Its dark lightbox doesn't: a
  document is read on paper.
- The workbench's file view (D214): `hl.ts` (one pass per line, plain past 300 KB), the
  `.code.view` lines with numbers, MyGo's editor on the Mac. It reads the *live working copy*
  through `wb` frames, while a shown file is a *snapshot* in the home's media store that
  outlives the working copy, a worker going offline and a cleaned-up worktree. So the viewer
  reuses the workbench's renderers, not its data path. VERIFIED.
- Markdown: the web's message renderer is Markdown-lite (no tables, quotes or heading levels), so
  documents need a fuller renderer that shares its escaped inline pass. The Mac's MyGo
  `markdown.View` already does GFM tables, task lists and highlighted code. VERIFIED.
- PDF on the Mac: MyGo has no PDF view (only `Page.PrintToPDF`). Opening a local copy with
  `Shell.OpenPath` gives Preview, the Mac's own reader, with no address involved. VERIFIED (API).

## 5. Addendum for D241 (2026-11-13): drawing a PDF, and where keys go

- **The Mac can draw PDFs natively without MyGo.** MyGo 0.8.3 has no PDF view (`pdf.go` only
  prints a page to PDF; `pdf_text*.go` fixes a printed PDF's text). The app already depends on
  `ebitengine/purego` 0.11.1 (through MyGo), whose `RegisterLibFunc` takes C structs by value on
  darwin. Core Graphics' C API (`CGPDFDocumentCreateWithProvider`, `CGPDFPageGetBoxRect`,
  `CGPDFPageGetDrawingTransform`, `CGContextDrawPDFPage` into a `CGBitmapContext`) draws a page
  into RGBA rows top down. VERIFIED: `apps/desktop/internal/media/pdf_test.go` draws a two-page
  PDF (A4, and Letter turned a quarter) and reads its pixels; a rendered report in
  `.shots/d241/`.
- **pdf.js on the web.** `pdfjs-dist` 4.10.38 ships `build/pdf.min.mjs` (344 KB) and
  `build/pdf.worker.min.mjs` (1.3 MB); `isEvalSupported: false` keeps it inside the page's CSP
  (`script-src 'self'`, `worker-src 'self'`). Without its CMaps and standard fonts, a PDF that
  names a CJK font it doesn't embed draws boxes (DOCUMENTED, pdf.js's options); PDFs printed by a
  browser or an office suite embed theirs (INFERRED). VERIFIED in Chromium: research/75 printed to
  PDF, drawn at 1280 and 390 px.
- **Where media refs leave the home.** Every frame a client gets goes through one `send` in
  `packages/core/src/ws.ts`; refs ride under a `media` key (messages, reports, task lines, a
  task's history), with a `thumb` inside. The upload's answer is the only other place, and it is
  made fresh. Workers get bytes, never keys; push notifications carry no media. VERIFIED (code).
- **A field-name clash.** The Mac decodes every frame into one struct, where `keys` is already the
  saved frame's list, so the answer's field is `mediaKeys`. VERIFIED (the frame-coverage test).

## Implications for Ducter

1. Never navigate to a media URL. Clients fetch bytes themselves (as `<img>` does) and show them.
   Save a copy writes on the device (Downloads on the Mac; the share sheet on a phone; a blob
   download elsewhere).
2. A file opens in a viewer that suits it: Markdown laid out, CSV as a table, text and source with
   colours and line numbers, SVG as a picture (web), video playing (web). Anything else is said
   plainly, with Save a copy, and on the Mac **在 Mac 上打开** from a local copy.
3. Reads are bounded: 1 MB of text, cut at a whole line and said so; 2000 table rows.
4. Text and code should be allowed to arrive at all: `.ts`, `.go`, `.sh`, `.log`… as
   `text/plain` (served as text, never run), never `.env`.
5. `&dl=1` should mean a download for every kind (a one-line fix in `serve`).
6. Later: pdf.js or a native PDF view; expiring media keys; a find bar in long files.

**Summary.** Open sent the person's browser to the home's address with a per-file key that never
expires: not the device token, but a capability that lands in (synced) history. T3 Code reads
every kind in its own panel with bounded reads and expiring signed URLs. D239 opens files inside
Ducter in a sheet that grows out of the card, reusing the workbench's highlighter and MyGo's
Markdown, and keeps PDF rendering and key expiry for later.
