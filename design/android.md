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
- A link out of the page goes to the system (`ACTION_VIEW`): the app that owns an app link (GitHub,
  Docs), else the default browser, both where the person is signed in (D384, as on the iPhone).
  Frames the page holds (the workbench's preview) load in place.
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

Quiet by default: at most every hour (6 h until 0.0.51), after the page says hello (or 3 s after a page that never
does); only a newer, published release with this app's APK, not put off with **以后再说**, shows a
card. **检查更新** in the icon's long-press menu asks now. Words are the device card's (D148): 有新版本
{v} · 更新 · 在下载 {v}… n% · 在核对 {v}… · 在安装 {v}… · 回来了，现在是 {v} · 没更新成 with the reason
(连不上 GitHub / 校验值对不上 / 这个版本里没有给安卓的文件 / 这份 Ducter 是从别处装的).

**A failed download, and asking again (D342).** The author's phone was offered a version, the
download from GitHub broke off, and opening the app again never offered it: the hour was counted
from the check that found it, a step stuck mid-way (a hung connection, Android's dialog left
behind) blocked every quiet check, and the only manual check hid in the icon's long-press menu.
Now:

- The version offered is kept (`update.offered`) until it is installed. While it waits and wasn't
  put off with **以后再说** on the offer, opening the app asks GitHub again at once, and back in
  front after 10 minutes (`UpdatePace` in `Core.kt`, tested). Closing a failure puts nothing off.
- A step that has said nothing for 3 minutes is stuck; the next quiet check starts over, and the
  stuck one can no longer speak or install (each check and download is one run).
- A download that stops short is the connection's fault (连不上), not a wrong checksum.
- The failure card says the version (**没能更新到 {v}**) and why in one sentence: **从 GitHub 下载断了：网络断了，或者这个网络连不上 GitHub。什么都没动。再试一次，或者在浏览器里下载。** with
  **再试一次**, **以后再说**, and, for a broken download or GitHub unreachable, a third full-width
  **在浏览器里下载** that opens `https://ducter.ai/download#android` (the same file; the browser
  resumes and uses its own connection; installing over the app keeps everything). There is no
  mirror off GitHub (the download page says so); the app still downloads only from GitHub's hosts.
- Settings › **这台手机** and this phone's card in **你的设备** show **这个 App** with
  **版本 {v}** and **检查更新** (only inside the Android app; `apps/web/src/app-update.tsx`). It sends
  `update.check`; the app's own card answers (在检查… / 已经是最新的 / 有新版本 {v}).

## Is it a foldable (D317)

Said by the hardware, not the name. The app reports `foldable` in its handset hello, and
`DucterShape/foldable` in its web view's user agent, when the phone has a hinge angle sensor
(`FEATURE_SENSOR_HINGE_ANGLE`) or Jetpack WindowManager has ever reported a `FoldingFeature` on it
(remembered, so a fold shut stays a foldable). A dual screen (Surface Duo) counts: its hinge hides
the screen under it (occlusion full), so its fold always separates. Only then the model name
(`shapeOfModel`: Pixel Fold, Galaxy Z Fold, Find N, Magic V, Mate X, OnePlus Open, vivo X Fold,
MIX Fold, Phantom V Fold, Surface Duo; flips stay phones).

A browser page asks the screen first: more than one viewport segment (`viewport.segments` or the
CSS `horizontal-/vertical-viewport-segments` queries) or `navigator.devicePosture` "folded" is a
foldable, then the model in the user agent, then a screen 600 px or more on both sides (a tablet).
Left open: a Galaxy Z Fold in Chrome with the reduced user agent ("K"), open flat, has one segment
and a "continuous" posture, so it still reads as a tablet (folded, a phone) until it is bent.

The iPhone app says its shape from its screen's size classes (`DucterShape/…`): an iPad is a
tablet; an iPhone regular both ways (iPad-sized) can only be one opened, so a foldable; else a
phone. That is the iPhone Duo's inner screen (research/111); read at launch, a Duo opened folded
says phone until the app is opened again on the inner screen. In Safari an iPhone 600 px or more on
its short side is a foldable. Its fold position waits for iOS 27.1's hinge API (not in the SDK we
build with) and for Safari to turn on viewport segments, which the page already uses (D182).

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

The app reads Android's fold against the web view as it is laid out *now*: when Android reports a
posture and again whenever the web view's size or place changes (D252). Unfolding reports the inner
fold before the web view has grown from the cover screen, so a fold read only then is none, and the
page stayed one column across the crease.

On a book, On hand never takes the whole screen (the book already is On hand beside the
conversation); an opened task can, and stands in the second half with On hand as a rail in the first
(D244, D252).

## Sharing into Ducter (D537)

Ducter is in Android's share sheet (ACTION_SEND and SEND_MULTIPLE for links, words, pictures and any
file). `ShareActivity` is a native bottom sheet over the dimmed app the thing came from, drawn from
Pebble.kt: the partner in its own clay (LOOK_CLAY as a colour matrix) and **发给{name}**, what is going
(a link card, the words, up to 10 pictures in a row, a card per file as D286 draws it), the note with
the keyboard up, **发给** with each partner as a clay chip on its ledge when there are several (starting
on the last one used; never a pill), **发送** first, on the left, then **取消** (ui.md "Buttons"). Nothing leaves the
phone before Send. Pictures are made ready on the phone as D206 does; files go as they are, up to
50 MB. Every share goes first into the app's own outbox (`files/outbox/<clientId>/`), then
`POST /api/media` and `POST /api/share` with the paired token, trying the home's other ways (D293)
when its usual address doesn't answer. What can't go waits with one quiet line and goes the next
time the app comes to the front or the sheet opens. The sending app's name rides as `from`
(`Activity.referrer`). Logic in `Share.kt` (tested in `ShareTest`), network and pictures in
`ShareSend.kt`. The whole design is media.md's "Sharing into Ducter".

## Notifications (D181 (4))

From the home: not in this version; the page says so in Settings. The path chosen next:
UnifiedPush, whose endpoints accept the home's existing Web Push (no new sender; the endpoint
allowlist widens), with an embedded FCM distributor only on phones that have Play services. Trigger
and details: `todo.md`.

The app's own (D246): one channel, **在用这台手机 / Using this phone**, made at launch so Android's
App info lists it; its one notification is the loan's (use-this-phone.md §5), silent and ongoing,
with **停下 / Stop**. `POST_NOTIFICATIONS` is asked once on Android 13+, when 用这台手机 is on
(`Notify.kt`).
