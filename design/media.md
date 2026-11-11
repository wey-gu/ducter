# Pictures and Files (media)

> Design note for D206 · Principles 5, 6, 7 · Evidence: `research/55` · Screens: `.shots/media/`
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
  row. **加图片 / Add images** opens the phone's own sheet (library, camera, files), the Mac's open
  panel; paste (⌘V, long-press Paste) and drag and drop work on the same three places
  (**松手就加上 / Drop to add** while a drag is over). Up to 10 per message (**一次最多 10 张 / Up to
  10 at a time**); anything but a picture is refused for now (**现在只能发图片 / Only images can be
  sent for now**, phase 2 brings files).
- **Made ready on the device, never on the home.** Scaled to 2048 px on the long edge and
  re-encoded (JPEG ~0.85; a screenshot stays a crisp PNG, a GIF stays moving), which turns it
  upright by its EXIF and drops all of its metadata, location included. HEIC becomes JPEG on the
  way. The device also makes the 720 px tile rendition and a ~16 px preview.
- **Up at once.** The upload starts the moment a picture is picked, with a thin progress ring on
  its thumbnail, so Send is instant. A message waits for its pictures; one that didn't go up
  stays with its words and its picture: **没发出去 · 重试 / Didn't send · Retry**. Words are never
  lost.
- **Wire.** `POST /api/media` (behind the gate, same origin, 25 MB): multipart `file`, `thumb?`,
  `preview?`, `name?` → `{media: MediaRef}`. Frames name ids: `send.media`, `task_send.media`,
  `task_new.media`; the home turns them into refs (an id it doesn't hold is refused: **A picture
  didn't arrive. Send it again.**). Text may be empty when there are pictures.

## The home's store

`<dataDir>/media/<sha256>.<ext>` with `<sha256>.json` (type, pixel size, name, the tile's id, the
preview, the task that made it). Content-addressed: the same picture twice is stored once. The home
**never decodes or re-encodes a picture**: the type and pixel size come from the header (EXIF
orientation honoured), the renditions from the sending device. Why: no image library for Bun is
both pure and fast (a native one, `sharp`, breaks `bun build --compile`), and every sender already
has a canvas. A picture a task shows has no tile rendition; clients scale it.

`MediaRef { id, type, bytes, w?, h?, name?, k, thumb?: {id, k}, preview?, from?: {taskId} }`. The
Log keeps refs, never bytes. **Fetching:** `GET /media/<id>?k=<key>`, before the gate because an
`<img>` sends no token; the key is an HMAC of the id with the home's own secret
(`media/.key`, 0600), so only someone who read the ref through the gate can fetch it and an id
alone proves nothing. Immutable caching; `&dl=1` downloads; files a task showed are served as
downloads under a sandboxing CSP.

## To the models

- **The partner** gets the user's pictures as its runtime's own image input (OAR
  `InputOptions.images`, files on the home), and a line naming them (`[with a picture: picture
  3f2a91c04b7e (1290×2796); you see them with this message]`). Image *generation* stays off for the
  partner (it opens a task for that). An AI that can't see pictures (DeepSeek Harness: OAR
  `capabilities.images` false) gets none, and the line says so; the persona says it in one line.
- **To a task:** `task_open.media` / `task_send.media` name pictures by id; when it names none, the
  pictures of the user's latest message go with the brief. The runner hands them to the agent
  with the first turn (or the message) as its image input; a worker's session gets their bytes.
  An agent that can't see pictures gets the words and a line saying pictures came that it can't
  see. Never bytes in text.
- **谁来做 / Who:** with pictures on the New task card, an agent that can't see them shows **看不了图片
  / Can't see images** (`Candidate.noImages`).

## From tasks to the user

- `report_to_main.show`: paths of what the user should see (at most 6): a screenshot that shows
  the result, a picture it generated, a file it made. Only from the task's working folder, its
  evidence folder (Ducter's browser screenshots) or Codex's generated images
  (`$CODEX_HOME/generated_images/<thread>/<item>.png`, research/55); links resolved first. Read
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
  by side; three as one tall and two stacked; four as 2×2; more than four shows four with **+n**
  on the last. 2 px apart inside one rounded box (radius 18). The box is sized from the ref's
  pixel size before any byte loads; the preview, blurred, fades to the picture.
- **Where:** the user's pictures stand above their words, right-aligned; what a task showed sits
  under the partner's words; in a task, with your lines, the partner's, the brief and each report.
  A file is one line on a card: icon, name, size, **打开 / Open**.
- **The viewer:** a tap grows the picture out of its tile (shared element; a fade under reduced
  motion) onto the theme's paper; pinch and double-tap zoom; swipe through every picture of the
  conversation (or the task); swipe down or Esc shrinks it back into its tile. Bottom bar: **保存
  / Save** (the share sheet on a phone), **分享 / Share** where the device can, **拷贝 / Copy**,
  and **来自 {task} / From {task}** to the task that made it. The Mac: Space opens and closes, ←/→,
  Esc, ⌘C copies, drag out to Finder.
- Tokens only (`--pics-w`, `--pics-h`, `--pic-gap`, `--r-pics`, `--viewer-scrim`, `--pic-dim`,
  `--ring-back`; Mac `Lightbox`, `LightboxInk`, `MediaGap`). No pills, no dots (D69, D73).

## The apps

- **iPhone:** the page's file input shows iOS's own menu (Photo Library, Take Photo, Choose File).
  Info.plist names the camera, the photo library and adding to Photos (Save from the share sheet).
- **Android:** a web view shows no chooser by itself: the app opens Android's picker (several at
  once) with the camera first when the app may use it; Save goes to Downloads.

## Later (design/todo.md)

Phase 2: files and PDFs sent by the user; a share sheet into Ducter (iOS share extension, Android
share intent). Phase 3: video (the model sees ~6 frames), reply to a message, link previews.
