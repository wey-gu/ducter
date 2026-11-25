# Pictures and Files (media)

> Design note for D206, D239, D242, D259, D286 and D537 · Principles 5, 6, 7 · Evidence: `research/56`, `research/75` · Screens: `.shots/media/`, `.shots/d286/`
> (D75: never in git)

The author: "要优雅一些，极度顺滑方便用户浏览查看，体验拉满". A partner you message has to see what
you see: the error on your screen, the whiteboard you photographed, the page that looks wrong. And
what it makes for you (a screenshot that shows it works, a picture it drew, a file) comes back as
the thing itself, not as a path.

## Who is in this moment

| Who | Before | After | First time |
|---|---|---|---|
| Heavy multi-agent developer | Describes a screenshot in words, or pastes a path the partner can't open; a task's screenshot is a file path in Details | ⌘V the screenshot into the conversation or straight into the task; the task's own screenshot shows under the partner's line; Space opens it | Nothing to learn: paste, drop or the picture button |
| Consumer who uses Grok bot, dots or Muse | "Can it see pictures?" A messaging app that can't take a photo feels broken | Takes a photo, asks; asks for a drawing and gets the picture back | The picture button sits where every messaging app has it |
| Fresh user | Doesn't know what a task or an agent is | Sends a photo and gets an answer; the picture opens big with a tap, swipes, pinches | A tap on any picture opens it |

North star (D36): 好用 paste, drop, pick, snap, all the same · 顺滑 the picture is up before Send,
nothing jumps while it loads · 赏心悦目 one picture at its own shape, a tidy grid, a viewer that grows
out of the tile · 放心 words are never lost; nothing about where a photo was taken leaves the phone;
only what a task chose to show comes back · 惊喜 "画一张…" gives you the picture.

## Sending

- **Where:** the conversation's composer, an opened task's composer, and the New task card's What
  row. **添加文件或图片 / Add files or pictures** (D273: a drawn paperclip) opens the phone's own sheet (library, camera,
  files), the Mac's open panel (every file); paste (⌘V, long-press Paste; on the Mac, files copied
  in Finder) and drag and drop work on the same three places (**松开即可添加 / Drop to add** while a
  drag is over). Up to 10 per message, pictures and files together (**一次最多 10 个 / Up to 10 at a
  time**). Any file goes (D259, below).
- **Made ready on the device, never on the home.** Scaled to 2048 px on the long edge and
  re-encoded (JPEG ~0.85; a screenshot stays a crisp PNG, a GIF stays moving), which turns it
  upright by its EXIF and drops all of its metadata, location included. HEIC becomes JPEG on the
  way. The device also makes the 720 px tile rendition and a ~16 px preview.
- **Up at once.** The upload starts the moment a picture is picked, with a thin, calm ring on
  its thumbnail (white over a blurred dim), so Send is instant. When it lands the ring closes, ticks
  and lets go (D286). A message waits for its pictures; one that didn't go up stays with its words
  and its picture, a drawn circling arrow over the picture and **重试 / Retry** under the words.
  Words are never lost.
- **Into the bubble (D286).** On Send the tray's pictures fly into their bubble (one shared
  element: the bubble's box from the rect the tray tiles took together) and a file flies from its
  tray tile into its card; when a picture lands, its tile settles (a pebble set down). A picture
  this device sent shows its own copy in the bubble, so nothing loads or fades in a second time.
- **Wire.** `POST /api/media` (behind the gate, same origin; 25 MB a picture, 50 MB a file): multipart `file`, `thumb?`,
  `preview?`, `name?` → `{media: MediaRef}`. Frames name ids: `send.media`, `task_send.media`,
  `task_new.media`; the home turns them into refs (an id it doesn't hold is refused: **A picture
  didn't arrive. Send it again.**). Text may be empty when there are pictures.

## Files the person sends (D259)

Who: the developer handing over a log, a script, a CSV or a design doc; the consumer forwarding a
PDF or a spreadsheet as in any messaging app; the fresh user who picks Choose File and expects it
to go. A messaging app that refuses a file feels broken; now it simply goes, it is answered from,
and nothing in it can run.

- **As it is.** A picture the device can read is made ready (above); anything else, and a picture
  it can't read (HEIC on the Mac, TIFF in Chrome), goes up unchanged: no canvas, nothing stripped.
- **The tray:** a file is a wider clay tile (128 pt), its badge over its name (two lines), a calm
  bar in its family's colour along its foot while it goes up (D286), Remove and Retry as for a
  picture. Remove is a small clay pebble on the tile's corner; the tile shrinks away. **The
  bubble:** the file card (below), the same bar where **打开 / Open** will be until it lands; then
  the card itself, which opens the file in the viewer (D239).
- **Limit: 50 MB a file** (`MEDIA_LIMITS.file`; pictures stay at 25 MB, they are scaled first).
  Under Cloudflare's 100 MB request cap on a From-anywhere tunnel (D228) and Bun's 128 MB, held in
  memory once while stored. Checked on the device before a byte leaves, and on the home (413 with
  the cap): **这个文件太大了：每个最多 50 MB / That file is too big: up to 50 MB each**.
- **What the home keeps it as** (`sniffSent`): a picture by its bytes; a kind Ducter shows by its
  name and bytes; text when its first 8 KB is UTF-8 with no NUL (a Dockerfile; a `.env` the person
  chose to send); else `application/octet-stream` (`ANY_FILE`, stored as `.bin`): inert bytes,
  served with `nosniff`, the sandboxing CSP and its own name, never run, never a page. Its viewer
  says **这种文件在 Ducter 里不会打开，只原样存着。存一份，用你自己的应用看。 / Ducter never opens this
  kind of file; it keeps it as it is. Save a copy and open it in your own app.**; the Mac offers no
  **在 Mac 上打开** for it (opening can run it).
- **Under its own name** (`named(id)`): `media/named/<id12>/<name>`, a hard link to the stored
  bytes, so an agent reads `季度报告.pdf`, not `<sha>.pdf`.

## The home's store

`<dataDir>/media/<sha256>.<ext>` with `<sha256>.json` (type, pixel size, name, the tile's id, the
preview, the task that made it). Content-addressed: the same picture twice is stored once. The home
**never decodes or re-encodes a picture**: the type and pixel size come from the header (EXIF
orientation honoured), the renditions from the sending device. Why: no image library for Bun is
both pure and fast (a native one, `sharp`, breaks `bun build --compile`), and every sender already
has a canvas. A picture a task shows has no tile rendition; clients scale it.

`MediaRef { id, type, bytes, w?, h?, name?, k, thumb?: {id, k}, preview?, from?: {taskId} }`. The
Log keeps refs, never bytes. **Fetching:** `GET /media/<id>?k=<key>`, before the gate because an
`<img>` sends no token; only someone who read the ref through the gate can fetch it, and an id
alone proves nothing. Immutable caching; `&dl=1` downloads; files a task showed are served as
downloads under a sandboxing CSP.

**Keys expire (D242).** A key is `<exp>.<sig>`: its end in seconds (base 36) and an HMAC of
`<id>.<exp>` with the home's own secret (`media/.key`, 0600). It opens for at least 24 hours,
and every key signed within one 6-hour window ends together, so a URL stays one cache entry that
long (`MEDIA_KEY`).

- **The home signs as it sends.** Every frame to a client passes through `fresh` (ws.ts `send`):
  every ref under a `media` key, and its `thumb`, gets a key made now. What the Log keeps is never
  what a client gets, so old messages, a reconnect, a first screen and a task's history all arrive
  with good keys, and nothing in the Log needs rewriting.
- **A client past its keys asks.** `media_keys {ids}` over its own connection (behind the gate)
  → `media_keys {mediaKeys: {id: k}}` for ids the home holds. The web (and so the iPhone and
  Android apps, which are the web client) fetches through `media-fresh.ts`: the newest key per
  id, a stale one asked about before it is used, a picture that fails asking once a minute at most
  and drawing again when the keys come. The Mac keeps the newest key per id in `protocol`
  (`MediaPath` uses it), keys its picture cache by id, and fetches again what failed when the keys
  come. The answer's field is `mediaKeys`, not `keys` (the saved frame's).
- **Old keys** (a bare HMAC of the id, from before D242) still open for 7 days after the home
  first signs an expiring key (`media/.keys-expire`), so a Mac app not yet updated keeps its
  pictures across the update; then never. A link that leaked into a browser's history stops
  opening within a week of the update, and any new one within a day.
- **Remote and Edge.** The tunnel (D228) and any later relay carry the same `GET` and the same
  WebSocket; nothing about keys changes with the path.

## To the models

- **The partner** gets the user's pictures as its runtime's own image input (OAR
  `InputOptions.images`, files on the home), and a line naming them (`[with a picture: picture
  3f2a91c04b7e (1290×2796); you see them with this message]`). Image *generation* stays off for the
  partner (it opens a task for that). An AI that can't see pictures (DeepSeek Harness: OAR
  `capabilities.images` false) gets none, and the line says so; the persona says it in one line.
- **Files (D259)** are never image input. The partner's line names each: `[with a file: file
  3f2a91c04b7e "季度报告.pdf" (PDF, 2.1 MB) at …/named/3f2a91c04b7e/季度报告.pdf. Read it with your
  file tools when the message needs it (a long one in parts). A task that needs it gets it by id in
  task_open's or task_send's media. Never say a path to the user]` (`filesLine`, `kindWords`). A
  text, Markdown or table of at most 6,000 characters comes whole in the line (`FILE_INLINE_CHARS`);
  a longer one or a PDF the partner reads with its own read-only tool, in parts (Claude Code's Read
  takes PDFs, capped at 8K tokens a read). The persona and tool descriptions are unchanged.
- **To a task:** `task_open.media` / `task_send.media` name pictures and files by id; when it names none, the
  pictures of the user's latest message go with the brief. The runner hands them to the agent
  with the first turn (or the message) as its image input; a worker's session gets their bytes.
  An agent that can't see pictures gets the words and a line saying pictures came that it can't
  see. Never bytes in text. Files (D259): one line in the turn names each, its kind, size and path
  under its own name, and that it is a copy (changes go in the task's own folder); any agent reads
  it with its own tools. On a worker, the bytes go down with the words (`send.files`), the worker
  keeps them in `media-in/files/<id12>/<name>` and the line names its own path.
- **谁来做 / Who:** with pictures on the New task card, an agent that can't see them shows **看不了图片
  / Can't see images** (`Candidate.noImages`).

## From tasks to the user

- `report_to_main.show`: paths of what the user should see (at most 6): a screenshot that shows
  the result, a picture it generated, a file it made. Only from the task's working folder, its
  evidence folder (Ducter's browser screenshots) or Codex's generated images
  (`$CODEX_HOME/generated_images/<thread>/<item>.png`, research/56); links resolved first. Read
  where the task runs, copied into the home's store, carried on the report as `media`. What can't
  be shown is one line back to the task. Nothing the task merely read comes along (proactive
  restraint).
- **The partner relays** them: the media of the reports that woke a turn go under the partner's
  first words in that turn (`ai_msg.media`), once. It also sees them (up to 4), so it can name
  what they are; the persona says to, in a few words, never a path or "see below".

## Drawing

"画一张… / Draw…" is a task with `needs.draw`. Only an agent that makes pictures takes it (Codex,
`image_generation` kept on for tasks; `HarnessInfo.draws`); the others are blocked with **画不了图 /
Can't make pictures**. No such agent anywhere: the open fails and the partner says in one line that
drawing needs Codex signed in on one of their computers. The picture comes back through `show`.

## Showing

- **Layout (`gridLayout`, the same on web, phone and Mac):** one picture at its own shape (clamped
  21:9…1:3), sized to fit both ~70% of the column and a little over a third of the screen; two side
  by side; three as one tall and two stacked; four as 2×2; five to nine in rows (D286,
  `GRID_ROWS`): 2+3, 3+3, a 2:1 banner over 3+3, 2+3+3, 3×3, taking a little more of the column
  (78%), so every picture of a trip shows; more than nine (a message holds ten) shows nine with
  **+n** on the last. 2 px apart inside one rounded box (radius 18); inside it the tiles' own
  corners stay soft (`--r-tile`, 4). The box is sized from the ref's pixel size before any byte
  loads; the preview, blurred, holds the place and the picture clears out of it (blur, a little
  scale, opacity over `--t-med`); a tile drawn once is simply there when shown again. A tile sinks
  a little when pressed.
- **Where:** the user's pictures stand above their words, right-aligned; what a task showed sits
  under the partner's words; in a task, with your lines, the partner's, the brief and each report.
  A file is one line on a card, a clay button: its drawn kind, name, size, **打开 / Open**. A tap
  reads it inside Ducter (below, D239).
- **A link to a file (D356)** in the partner's or a task's words (`/abs/path`, `file://…`,
  `~/…`; `fileLinkPath`) opens the same viewer. The client sends `file_open {id, path, taskId?}`
  (taskId: the task it was tapped in, a hint); the home picks the task whose folders hold the path
  (the hint, the task its `scratch/<id>` or `evidence/<id>` names, then any whose working copy
  holds it), reads it where that task works with D206's `readShown` (its working copy, its own
  scratch and evidence, Codex's pictures; links resolved; never Ducter's data folder but the
  task's own scratch and evidence; 25 MB), keeps it in media (`sent` kinds: any file, inert when
  unknown) and answers with the ref. Until then the sheet shows the name, the path in mono and
  **正在打开… / Opening…**; a refusal is one line (`file.link.{missing,outside,too_big,offline,
  unsupported}`), Retry for offline and failed; Esc or × goes back. The Mac with the Ducter on
  this Mac opens a link to a file here as before (`file://`, `onThisMachine`).
- **The viewer:** a tap grows the picture out of its tile, clipped to the tile's own crop and
  round corners so it is one continuous picture (the tile stays empty while it flies; a fade under
  reduced motion), onto the theme's paper; the tile's rendition shows under the full picture while
  it loads. The pictures sit on a strip: a swipe shows the next one peeking in and lets go into it
  (an end gives a little); ←/→, the side buttons on a wide screen (**上一张 / Previous picture**,
  **下一张 / Next picture**) and a sideways two-finger swipe slide too. Pinch, ⌘/Ctrl and the
  wheel zoom where the fingers or the pointer are (up to 5×); a zoomed picture pans, lets go with
  its speed and comes back inside its edges; a double tap zooms where it was tapped. Swipe down or
  Esc shrinks it back into its tile. Bottom bar: **保存 / Save** (the share sheet on a phone),
  **分享 / Share** where the device can, **拷贝 / Copy**, and **来自「{task}」/ From {task}** to
  the task that made it. The Mac: Space opens and closes, ←/→ (the next picture comes in from that
  side), Esc, ⌘C copies, a pinch, ⌘ and the wheel or a mouse wheel zoom at the pointer, a
  two-finger scroll pans or steps, a double click zooms, drag out to Finder; it grows from the
  tile and shrinks back into it.
- **A file card (D286)** is drawn as the thing it is. Its badge is a little page whose band is
  the family's colour and says the extension (PDF, TS, DOCX, ZIP, M4A, MP4), the family's mark on
  it (`fileFamily`, `fileBadge`: pdf, code, text, doc, sheet, slides, archive, audio, video,
  picture, other). Above its line, a glimpse where the file has one: a PDF's first page on white
  paper (the line adds **{n} 页**), a report's start as it reads (D567: the top of the viewer's paper,
  its title in the heading face, a line or two of its words with every Markdown mark removed, never
  monospace), code's and text's first lines in their colours (fading at the card's edge, never
  "…"), a table's first rows, a video's frame with its length, a sound's waveform that plays in the card (**播放 /
  Play**, **暂停 / Pause**; a tap on the wave seeks). A glimpse is made once, when the card comes
  within a screen, one PDF at a time, and kept by the file's id; one that can't be made leaves the
  card plain. A file on its way makes it from this device's copy. The Mac draws the PDF page and
  the first lines; a video's frame and a waveform are the web's for now.
- **Kept in Nowledge Mem (D566, `made.md`):** under a card Ducter made, one quiet line on the
  card's own left edge, outside it (the whole card opens the file): **存到 Nowledge Mem / Save to
  Nowledge Mem**, saving, **已存进 Nowledge Mem / In Nowledge Mem** and **去看 / Open**, or why not with its
  fix; only while Mem is connected and signed in, only for a file Mem reads. The viewer carries the
  same action in its existing row, before **存一份 / Save a copy** (web `mem-keep.tsx`, Mac
  `memkeep.go`).
- **Sounds (D286):** `.m4a`, `.mp3`, `.wav`, `.aac` are files Ducter knows (`FILE_TYPES`,
  `fileView` "audio", the partner's line says "audio"); the viewer plays one; the Mac offers
  **在 Mac 上打开**.
- Tokens only (`--pics-w`, `--pics-h`, `--pic-gap`, `--r-pics`, `--r-tile`, `--fam-*`, `--fam-on`, `--viewer-scrim`, `--pic-dim`,
  `--ring-back`; Mac `Lightbox`, `LightboxInk`, `MediaGap`, `Family`, `FamilyOn`). No pills, no dots (D69, D73).

## Reading a file (D239, research/75)

Who: the developer reading a task's `investigation.md` or the script it wrote; the consumer
handed "the report"; the fresh user who taps a card and expects to read it. Before, Open sent
the browser to the home's address (a raw page, the file's key in browser history); now the file
is read where it was handed over.

- **Never a link.** The client fetches the bytes itself through the same keyed path an `<img>`
  uses (`GET /media/<id>?k=`), and nothing navigates to it. `&dl=1` is a download for every kind.
- **The sheet:** the theme's paper over the dimmed page (`--scrim`; the picture viewer's dark
  lightbox is for pictures). Wide: up to 48 rem, the text at a reading measure inside. Phone: the
  whole screen; pulling the head down closes it. Head: the file's drawn mark on a sunken tile
  (lines for a document, a grid for a table), name, **{KIND} · {size} · {n} 行**, **看原文 /
  看排版** for Markdown and tables, ×. Foot: **来自「{task}」**, **拷贝** (the text), **存一份 / Save a
  copy**. Esc, ×, or the scrim closes.
- **By kind** (`fileView` in `@ducter/protocol`, `MediaRef.FileView` on the Mac): Markdown as a
  document (`apps/web/src/markdown-doc.ts`: every heading level, tables, quotes, task and nested
  lists, front matter shown quietly, fenced code coloured by `hl.ts`; pictures in it show their
  words, since its relative paths point at a folder the viewer doesn't have; the Mac: MyGo's
  `markdown.View`); CSV/TSV as a table (header row stays, numbers on the right; the Mac draws it
  as a Markdown table); text, JSON, HTML source and code with line numbers and colours (the web:
  the workbench's `.code.view` and `hl.ts`, drawn in 300-line blocks with `content-visibility`;
  the Mac: MyGo's editor, read only); the web: an SVG as a picture, a video playing. Anything
  else (Office, zip) says **这种文件在 Ducter 里还打不开** with Save a copy; the Mac adds **在 Mac
  上打开**, a copy in the user's own temporary folder (0600) opened by `Shell.OpenPath`.
- **A PDF's pages (D242).** One under the other, each a sheet of white paper (`--pdf-page`,
  `PDFPage`: printed matter stays white in every theme) on the sunken ground at the reading width;
  the head says **{n} 页 / {n} pages**. The web draws with pdf.js (Mozilla, Apache-2.0, 4.10.38:
  `app/pdf.js` and its worker `app/pdf.worker.js`, copied as they ship, about 1.7 MB, loaded only
  when a PDF opens; no eval), from the bytes it fetched: the browser's own reader can't be used,
  since files are served under a sandboxing CSP and Chromium's reader won't run in a sandboxed
  document. The Mac draws with Core Graphics (the engine Preview draws with), called through
  purego as the app reaches the system elsewhere, without cgo: MyGo has no PDF view. A page is
  drawn as it comes within about a screen of view and let go once it leaves (an
  IntersectionObserver on the web, `InViewMargin` on the Mac), so a long PDF holds a few bitmaps,
  never all of them; pages are drawn at twice their width in points (devicePixelRatio, at most 2,
  on the web). A PDF that can't be drawn (locked, broken) says **这个 PDF 在这里画不出来。存一份，
  用你自己的应用看。** (the Mac: **…可以用这台 Mac 上的应用看，或者存一份。** with 在 Mac 上打开).
- **Find (D242).** ⌘F / Ctrl+F, or the head's drawn magnifier (**查找 / Find**), in a text, a
  report or a table: a field pressed into the head (**在这个文件里找 / Find in this file**), **{i} /
  {n}** (**{i} of {n}**) or **没找到 / No matches**, **上一个 / Previous** and **下一个 / Next**
  (drawn chevrons; Enter and ⌘G go on, ⇧ back); Esc closes the field first, then the file. Every
  match is marked in the highlight's colours, the current one in the accent, and scrolled to
  (across too, in a long line of code). Case is set aside; nothing spans two lines; at most 5000
  are marked (`findAll`, `FindAll`). The web marks with the CSS Custom Highlight API (where a
  browser lacks it, the current match is selected); the Mac marks the editor's text
  (`TextBackgrounds`) and selects the current one. MyGo's Markdown view has no ranges to mark, so
  on the Mac a report or a table is found in its text (the source toggle steps aside while
  finding, and closing Find lays it out again). A PDF has no find yet.
- **The Mac's read-only views (D242).** The code view has no current line (no caret to stand on);
  a report's code blocks carry Ducter's own **拷贝 / Copy** (**已拷贝**), not MyGo's "Copy code", in
  the file viewer and the conversation alike.
- **Wide content (D567).** A report's table is as wide as its words need (each column up to 22 em,
  a naming column 13), out past the reading measure to the sheet's whole width, centred on the
  words; wider still it scrolls sideways on its own (the Mac: the system's scroller), never the
  page, and its edges fade where more is out of view. A first column that names the rows (more than
  two columns, its cells words, not numbers) stays while the rest scroll, a ledge at its edge once
  something is under it. Code blocks break out and fade the same way. A table file fills the sheet:
  header row and naming column stay, each column as wide as its first 200 rows (4 to 32
  characters), numbers on the right; the Mac builds only the rows in view (`csvTable`; a report's
  tables are `mdTableBlock`, MyGo's Markdown `Block` hook, in the file viewer only).
- **铺满 / Fill the window (D567).** The head's drawn button (tooltip **铺满（⌘Return）**, **还原大小** once
  filled), ⌘Return / Ctrl+Enter, or a double click on the title: the sheet takes the window, 16 pt in
  from its edges, and gives it back. Remembered per kind of file on this device (web
  `localStorage`, the Mac's local prefs), so a report opens filled once the person chose it. A phone's
  sheet is already the whole screen: no button.
- **Bounded:** 1 MB of a text (`FILE_VIEW_BYTES`), read as a stream and stopped there, cut at a
  whole line, said at the foot; 2000 table rows. Copy of a cut file fetches all of it first.
- **Save a copy** writes on this device: Downloads on the Mac (**已存到「下载」**), the share sheet
  on a phone (Save to Files, AirDrop, an app), a download from the bytes in a desktop browser.
- **Motion:** the sheet grows out of the card (its box to the sheet's, 320 ms, `--ease`) and
  shrinks back into it when the card is on screen; a fade under reduced motion. The Mac starts
  the panel's pose at the card's centre and width (MyGo poses scale evenly).
- **What may arrive** (`report_to_main.show`): besides `FILE_TYPES`, text and source by name
  (`TEXT_EXTS`: `.ts`, `.go`, `.sh`, `.log`, `.yaml`, …) as `text/plain` when its first 8 KB has
  no NUL; never `.env`.
- **Not the workbench's file view.** The workbench (D214) reads the live working copy; a shown
  file is a snapshot in the home's store that outlives it (a worker offline, a worktree cleaned
  up). The viewer shares its renderers, not its data path.

## Sharing into Ducter (D537)

A user: 「手机端期待可以有个分享、附言的功能，和 grokbot 一样」. Something seen in another app (a page in
Safari, a photo, a post in X or WeChat, a PDF in Files) goes to the partner without saving it first
or switching apps: Share, **Ducter**, a line, Send.

| Who | Before | After | First time |
|---|---|---|---|
| Heavy multi-agent developer | Copies a PR's link, opens Ducter, pastes, types what to do | Share from GitHub or Safari, 「看下这个 PR 的 CI」, Send; the partner starts the task | Ducter is already in the share sheet's row of apps |
| Consumer who uses Grok's app | Grok takes a share with a line; Ducter didn't | The same gesture: Share, a line, Send; its answer is in the conversation | The sheet is the same shape as Grok's: what you share, a line, Send |
| Fresh user | Doesn't know a phone app can take things from another | Shares a photo of a letter with 「记一下，下周提醒我」 | Nothing to learn: Share is in every app |

North star (D36): 好用 one sheet, the keyboard up, Send · 顺滑 no app switch, a tick and it's gone ·
赏心悦目 the partner's own figure and clay, the link and the file drawn as themselves · 放心 nothing
leaves before Send, no location leaves at all, a share that can't go waits and says so · 惊喜 the
partner answers what it is, even with no note.

- **The sheet.** **发给{name} / Send to {name}** with the partner's figure in its own clay (D497); what
  is going on one clay card: a link as its title over its site (the page's title when the app gave
  one), shared words (six lines), pictures (one at its own shape, several as a row of tiles), each
  file as the conversation's file card (badge, name, size, a PDF's **{n} 页 / {n} pages**); the note
  **想让{name}做什么？（可以不写）/ What should {name} do with it? (optional)**, focused; **发给 / To**
  with each partner as a clay chip when there are several (D513), starting on the one the last share
  went to; **取消 / Cancel** and the one primary **发送 / Send**. Sending: **在发… / Sending…**, then
  **发给{name}了 / Sent to {name}** with a tick and a success haptic, and the sheet closes.
- **What it takes:** one link, words, up to 10 pictures and files (**一次最多 10 个，先发前 10 个 / Up to
  10 at a time: sending the first 10.**); a file over 50 MB is left out (**这个文件太大了：每个最多 50
  MB，先不发它。**). Words that are one link alone are that link; a post's words that repeat its link
  keep only what they add; one short line beside a link is its title.
- **Ready on the phone, as Sending above:** pictures upright, at most 2048 px, re-encoded with no
  metadata (location, camera, lens all gone: checked on the stored file); files as they are.
- **The pairing is the app's.** iPhone: the token from the keychain group the app and its extensions
  share (D159); the home's address, ways, key and the partners from the app group
  `group.<app id>`, which the app writes whenever the page tells it something new. The share goes to
  the best of the home's ways that proves it is the home (D293). Android: the app's own store.
- **The wire.** `POST /api/media` for each picture or file, then `POST /api/share {clientId, note,
  partner?, media?, url?, title?, text?, from?}` (behind the gate) → `{ok, seq, partner}`. The home
  makes one `user_msg` (`shareMessage`): `text` is the note, a blank line, then the link under its
  title or the shared words; `via: "share"`; `shared: {at, from?, link?}`, `at` where the shared thing
  begins. So every client and chat app shows it as it is, with no new bubble. The clientId appends
  once. A partner that is gone falls back to the default. `GET /api/me` lists the partners for the
  picker.
- **To the partner** (`renderShared`): `[user shared a link from Safari to you with their phone's share
  sheet; their note, their own words] 帮我总结`, the thing fenced in `<shared>` as data, never
  instructions or approval; a link is a page it hasn't read (rule 1: a look-up task when the note
  needs it). No note: one short line saying what it looks like and offering the obvious thing (a
  summary, keeping it, a reminder), starting nothing. The history line says it was shared.
- **Never lost (the outbox).** One outbox on the web, D543's; the share sheet runs without the page,
  so its outbox lives in the native shell, with D543's rules (a clientId, the home's dedupe, the
  same words). Send puts the share in that outbox first, then sends. The home out of
  reach: **现在连不上你的 Ducter。连上就发出去。/ Can't reach your Ducter right now. Sends when it's back.** (D543's words
  for a message waiting in the page's outbox) and the sheet closes; it goes when the app next comes to the front or a share sheet
  next opens, pictures already up not sent again. A home older than D537: **你的 Ducter 还要更新一下才收得
  了分享，更新后会自动发出去。/ Your Ducter needs an update to take shares. This goes once it's
  updated.** A week old, it is let go; another pairing drops them all. Not paired: the napping
  figure and **先打开 Ducter 连上你的 Ducter，再来分享。/ Open Ducter and connect it first, then share
  again.** with **知道了 / OK** (Android: **打开 Ducter / Open Ducter**).
- **From which app:** Android gives the sending app (`Activity.referrer`), which rides as `from`; iOS
  gives an extension no host app, so an iPhone's share never says.
- **Where it lives:** iPhone `apps/ios/DucterShare` (the extension) and `apps/ios/ShareKit` (the sheet,
  reading what came in, the outbox and sending; the app compiles it too, to empty the outbox and for
  its Debug specimen `-shareSpecimen link|photo|pdf|text|many`); Android `ShareActivity.kt`,
  `Share.kt`, `ShareSend.kt`.

## The apps

- **iPhone:** the page's file input shows iOS's own menu (Photo Library, Take Photo, Choose File).
  Info.plist names the camera, the photo library and adding to Photos (Save from the share sheet).
- **Android:** a web view shows no chooser by itself: the app opens Android's picker (several at
  once) with the camera first when the app may use it; Save goes to Downloads.

## Later (design/todo.md)

Built by D259: files and PDFs sent by the user. Built by D537: a share sheet into Ducter (iOS share
extension, Android share intent). Still phase 2: a PDF as a model's own document input through OAR; PDF text on the
home for an agent with no PDF reader. Phase 3: video (the model sees ~6 frames), reply to a message, link previews.
D239's later, built by D242: PDF pages drawn inside Ducter, expiring media keys, find in a long file. D439: an Office file a task shows with a PDF of the same name reads as its pages (`MediaRef.pages`, `documents.md`). Still later: Office files drawn without one, find in a PDF.
