# 55. Pictures in and out: OAR's image input, Codex's generated images, images on the home

> 2026-11-11 · For D206 (design/media.md). Sources: the installed `@botiverse/oar` 0.95.1
> (`node_modules`, read only), codex-cli 0.167.1 on this Mac and one of the user's own Codex
> session records (read only, nothing copied), Bun 1.3.1, the iPhone and Android shells in this repo.

## 1. Handing a picture to an agent (OAR)

- **DOCUMENTED + VERIFIED.** `InputOptions.images: InputImage[]` (`{path, mediaType?}`) rides on
  `prompt`, `steer`, `queue` and `deliver` (`contracts/session.d.ts`, `input.d.ts`). The file is
  read when the input is delivered; the request record keeps the paths, never the bytes
  (`shared/input-images.js`: png, jpeg, gif, webp by extension or `mediaType`; anything else, or a
  runtime without image input, is refused `unsupported` and nothing is delivered).
- **VERIFIED (source).** `capabilities.images` per runtime: claude, codex, pi (RPC), cursor, grok
  true; dsh, qwen, qoder, pi-durable false. In Ducter's harness set only DeepSeek Harness can't see
  pictures.
- **VERIFIED (live, haiku, eval `picture-question-zh`).** A partner on Claude Code given a webp
  through `images` described it ("3D 风格的卡通笔记本电脑，奶油色机身…"). The first try failed
  because the eval's session wrapper dropped the third `send` argument; fixed.
- A path is "on the machine the runtime runs on": a task on a worker gets the bytes over its
  socket and writes them there (`<worker dataDir>/media-in/<sha>.<ext>`).

## 2. Where Codex puts a picture it generates

- **VERIFIED (a real session record of the user's, codex-cli 0.16x, read only).** An image
  generation is an item `{type: "Extension", kind: "image_gen.generation", savedPath:
  "$CODEX_HOME/generated_images/<thread id>/<item id>.png", revisedPrompt, result: <base64>}`, and
  the tool output the model reads says "Generated images are saved to <dir> as <path>". So the
  model knows the path and can name it in `report_to_main.show`.
- **VERIFIED (listing).** `~/.codex/generated_images/` holds one folder per thread with PNGs.
- **VERIFIED (source).** Ducter's clean setup turned `features.image_generation` off for every
  Codex session, tasks included (the brief that started D206 assumed tasks kept it). D206 keeps it
  on for tasks (`nativeTools`) and off for the partner.
- Not done: a paid run to watch a task generate end to end (the path and the record shape are
  verified; the hop through `show` is covered by tests with a file in that folder).

## 3. Making pictures smaller without an image library on the home

- **VERIFIED.** Bun 1.3.1 has no image decode or resize. `sharp` is native (libvips) and doesn't
  survive `bun build --compile` without shipping its `.node`; pure-JS codecs (jpeg-js, pngjs,
  WASM squoosh) are slow on 12 MP photos and add megabytes.
- **Chosen:** every sender already has a canvas (browser, WKWebView, Android WebView) or Go's
  `image/*` (the Mac app): it scales to 2048 px, re-encodes (dropping EXIF, location included),
  makes the 720 px tile and a ~16 px preview. The home stores bytes and reads type and size from
  the header (PNG IHDR, JPEG SOFn with the EXIF orientation, GIF, WebP VP8/VP8L/VP8X).
- **INFERRED.** Safari before 17 encodes no WebP from a canvas; the client falls back to JPEG for
  the tile. HEIC decodes in Safari (iOS) through `createImageBitmap` or an `<img>`; not in Chromium.

## 4. The phone shells

- **DOCUMENTED (Apple).** WKWebView shows its own menu for `<input type=file accept=image/*>`
  (Photo Library, Take Photo, Choose File) with no delegate code; the camera needs
  `NSCameraUsageDescription` (present for the QR scan), the library
  `NSPhotoLibraryUsageDescription`, and the share sheet's Save Image
  `NSPhotoLibraryAddUsageDescription` (without it the app is terminated). **INFERRED** for this
  app until tried on a device.
- **DOCUMENTED (Android).** A WebView shows no chooser unless `WebChromeClient.onShowFileChooser`
  opens one; the camera through `ACTION_IMAGE_CAPTURE` needs a `FileProvider` URI, and an app that
  declares `CAMERA` must hold it for the capture intent. WebView has no Web Share, so Save goes
  through the WebView's `DownloadListener`. **VERIFIED:** it compiles (`gradlew
  :app:compileDebugKotlin`); **INFERRED** on a device.

## Implications for Ducter

1. Pictures go to agents as files through OAR, never as text; one capability flag decides.
2. A task shows what it made with `show`; Codex's generated images are inside the allowed folders.
3. The home never touches pixels: senders make the renditions; the store is content-addressed.
4. The phones need a few plist keys and, on Android, a chooser and a download listener.

**Summary.** Images in: OAR `images`, verified live. Images out of Codex: `savedPath` under
`$CODEX_HOME/generated_images`, verified from a real record. No image library on the home.
