# The Android app

Settled (D178, D181, D182; research/51). Built in `apps/android`; how it is built and released
is in `release/android.md`.

## Who, what they feel, how it starts

1. **Who.** All three. The heavy multi-agent developer on a Pixel or a Galaxy Fold who wants the
   same partner the Mac has, in a pocket. The consumer personal-AI user, often on a phone with no
   Google Play (many phones sold in China), who installs apps from a link. The fresh user, who has
   never sideloaded anything and has never heard of a subagent.
2. **What they feel.** Before: a Ducter that lives on a computer, reachable on Android only as a
   browser tab they keep losing; on a foldable, a narrow column with the crease running under the
   words. After: an app with the partner's face on the home screen that opens straight into the
   conversation, lays itself out around the fold like a book, and keeps itself current without a
   store or a second thought (放心: a checksum and the same signature, or nothing changes;
   顺滑: one card, one tap; 惊喜: open the phone like a book and the conversation and On hand
   are its two pages).
3. **How it starts.** From the release page (or a link the website gives): download
   `Ducter-<version>-android.apk`, allow the browser to install it once (Android's own step), open
   it. The connect screen is the iPhone app's: scan the QR code `ducter pair` shows, or paste the
   link, or type the address and code. From then on it opens into the conversation. Nothing to
   learn: the first time an update arrives, one card says what's new in your language; the first
   time you tap **更新**, Android asks once whether Ducter may install its own updates, and the
   card says that in one line.

North star check: 好用 (one tap to update, Back goes up a level), 顺滑 (folding and unfolding never
reloads; the composer rides above the keyboard), 赏心悦目 (the partner on every screen the app
draws, Pebble's clay buttons, a book-like split), 放心 (GitHub's hosts only, SHA-256, same key,
nothing changed on any failure, said plainly), 惊喜 (the fold becomes the spine).

## Shape (D178)

- The page is the product: `<home>/app` in the system WebView, exactly what a browser gets. The
  app adds what a page can't: pairing memory, the QR scanner, insets, the fold, haptics, updates.
- The bridge is the iPhone app's contract (`apps/web/src/native.ts`): `window.ducterNative` and a
  promise-returning `postMessage`, limited to the paired home's origin. Messages: `hello` (the
  page's language and the partner's name), `haptic`, `push.state` / `push.enable` (answer
  `unsupported`), `push.disable`, `update.check`.
- Insets: the app sets the page's `--safe-top/right/bottom/left` itself (WebView versions differ on
  `env(safe-area-inset-*)`); the keyboard shrinks the web view (`interactive-widget=resizes-content`).
- The app's own screens (connect, connecting, can't reach, the update card) are native, because a
  home older than the app serves an older page.
- The home older than the app (D200): after the page's `hello` (and back in the foreground) the app
  asks `<home>/api/me` with the page's token (held in memory only) and, when the home's
  major.minor.patch is lower than its own, shows the update card's form as one line: **{home} 上的
  Ducter 还是 {v}，比这个 App 旧，有些新东西要等它更新。** with **去更新** (the page's
  `#settings=devices`) and **知道了** (held per home and pair of versions). The app's own update
  card speaks first. `HomeVersion` in `Core.kt`, tested beside the iPhone app's same cases.

## Updating itself (D181)

Quiet by default: at most every 6 h, after the page says hello (or 3 s after a page that never
does); only a newer, published release with this app's APK, not put off with **以后再说**, shows a
card. **检查更新** in the icon's long-press menu asks now. Words are the device card's (D148): 有新版本
{v} · 更新 · 在下载 {v}… n% · 在核对 {v}… · 在安装 {v}… · 回来了，现在是 {v} · 没更新成 with the reason
(连不上 GitHub / 校验值对不上 / 这个版本里没有给安卓的文件 / 这份 Ducter 是从别处装的).

## The fold (D182)

| Posture | Fold | Layout |
|---|---|---|
| Folded (cover screen) | none | one column, as on any phone |
| Open flat, held upright | vertical | **book:** conversation left of the fold, On hand / the task right |
| Half-open like a book | vertical, half | book, the same |
| Half-open standing (tabletop) | horizontal, half | conversation above, On hand below |
| Open flat, turned sideways | horizontal, flat | one column (one tall screen) |

The split sits at the fold's exact position from the app (`window.ducterFold`) or the browser's
viewport segments; a hinge's width stays empty; each side needs 320 CSS px (book) or 220 (tabletop),
else the width rule (D176) decides.

## Notifications (D181 (4))

Not in this version; the page says so in Settings. The path chosen next: UnifiedPush, whose
endpoints accept the home's existing Web Push (no new sender; the endpoint allowlist widens), with
an embedded FCM distributor only on phones that have Play services. Trigger and details: `todo.md`.
