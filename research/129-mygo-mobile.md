# 129 · MyGo 0.10 on phones: one Go UI for the Mac, iPhone and Android?

> 2026-11-18. Public. The author: "mygo 新版本 0.10 支持 iOS Android 了"; then "研究一下，列一个在 issue
> 里；我们可以先 bump mygo，mobile 保存现状". So this report does two things: it records the Mac app's
> bump from MyGo 0.8.3 to 0.10.0 (done on its own branch), and it studies whether the phones should
> move from today's shape (the web client in a SwiftUI shell on iPhone and iPad, the same page in a
> Kotlin shell on Android, D178) to the Mac's Go views. The phones stay as they are; this is the
> evidence for a later decision, filed as an issue for contributors.
>
> Tags: **VERIFIED** checked by me this session (source read at the tag, a build or a run on this
> Mac) · **DOCUMENTED** stated in MyGo's docs or release notes at v0.10.0 · **INFERRED** my
> reasoning. Source: `github.com/egoist/mygo`, cloned fresh at v0.10.0 (released 2026-11-17, one day
> before this report). Machine: Xcode 26.3, iOS 26.3 Simulator (iPhone 17 Pro), Android SDK 36.1 with
> NDK 29, Go 1.27.3. Nothing was installed system-wide: the `mygo` CLI was built from the tag into
> the session's scratch folder. No real phone, signing key or `~/.ducter` was touched. Shots are in
> `.shots/mygo-mobile/` (not in git, D75).
>
> Earlier: research/32 §(a) found no phone target in MyGo 0.8.3 and set the trigger "watch for a
> UIKit backend upstream". That trigger has now fired.

## 1. The Mac bump, 0.8.3 → 0.10.0

**What changed in the API** (DOCUMENTED, the four release notes; VERIFIED against our code):

| Release | Breaking for apps | Hits Ducter? |
|---|---|---|
| 0.9.0 | `sqlite.LibraryPath` and `MYGO_SQLITE_LIBRARY` removed (SQLite loads as a native module) | No. `internal/imessage/chatdb.go` reads chat.db through `/usr/bin/sqlite3`, not MyGo's plugin |
| 0.9.1 | None in the Go API. `mygo build` rejects update URLs with a query; MIME types checked | No (we build with our own scripts) |
| 0.9.2 | None. The single-instance lock is held until the process exits; notarized builds submit twice | No (`RequestSingleInstanceLock` unused; we notarize ourselves) |
| 0.10.0 | None. Behaviour: triple click selects a paragraph; attached popups never taller than the window; `OnDOMReady` fires again for a page from the back/forward cache | Popovers: `PopoverBase` in `views/{contextmeter,ongoing,past,task,taskinfo}.go` now clamp to the window (an improvement). Triple click: the 33 files with `Selectable()` text (bubbles, reports) select a paragraph, as macOS does. We have no web pages using `OnDOMReady` |

**The bump itself** (VERIFIED): `go get github.com/egoist/mygo@v0.10.0` changes only `go.mod` and
`go.sum`. `go build ./...`, `go vet ./...` and `gofmt -l` are clean with **no source change**.
No new indirect dependencies. Desktop builds still need no cgo (DOCUMENTED; our `go build` ran
without it).

**Tests** (VERIFIED): `go test -count=1 ./...` on 0.10.0 is green in every package (0 fail;
`internal/views` 150 s), with `go vet` for darwin and linux and `gofmt` clean, as CI runs them.
Two wall-clock tests (`TestNavMotionFrames`, `TestLongSessionWindowed`) failed in earlier runs
while the machine's load average was 60–460 (five other branches building, this spike's Android
build and emulator beside them). The same two tests were then run twice on each version back to
back (`go test -modfile` with the old `go.mod`): 0.8.3 passed once and failed once
(`TestLongSessionWindowed`, scroll p95 84 ms), 0.10.0 failed once (`TestNavMotionFrames`) and
passed once. So: load, not a regression; the final run on a calmer machine passed both.

**Pictures before and after** (VERIFIED): the conversation, On hand, a task, Settings and Devices,
drawn by the views' tester against the mock hub at 1280×860, the same scratch test on each version
(`.shots/mygo-mobile/bump-before/`, `bump-after/`). Two runs on 0.8.3 are pixel-identical (0 px),
so the comparison is deterministic. 0.8.3 vs 0.10.0: **identical** for the conversation, the task,
Settings and Devices; On hand differs by **3 px** inside the live countdown ring of "47 分钟后按默认"
(it follows the wall clock). Text measurement and layout are unchanged.

Worth adopting later, not in the bump (DOCUMENTED): `ListState.MoveAnimation` (rows glide when
On hand's list changes), `ui/netimage` (avatars and pictures with a disk cache), the editor's
`ScrollMargin` and `DiffState.ScrollPastEnd`/`Focus()` for the workbench's diff, 12% faster layout,
and `mygo.KeepState` under `mygo dev`.

## 2. How MyGo builds for phones

(DOCUMENTED, `docs/mobile/*.md`; VERIFIED where a build ran.)

- **One app, one CLI.** `mygo dev -platform ios|android` runs on a simulator, emulator or device
  with a ~2 s reload of Go changes; `mygo build -platform ios` signs an `.ipa`, `-platform
  android` makes an `.apk` and `.aab`; `mygo publish` uploads to App Store Connect (`altool`, an
  API key) or Google Play (a service account). `mygo doctor` lists what's missing.
- **No Xcode project, no gomobile.** iOS: Go is linked as a c-archive with Xcode's clang (cgo is
  required on iOS), the CLI compiles a small Swift host, the asset catalog and the privacy
  manifest, and signs it. Android: Go is a shared library per ABI linked by the NDK's clang, Gradle
  builds a generated host (Kotlin), JDK 17 (issue #1984: `doctor` accepts a newer JDK that Gradle
  then refuses).
- **Rendering.** Native UI draws with the GPU: **Metal on iOS, OpenGL ES on Android**; web
  windows use WKWebView / Android WebView. The same `ui` package and views as the Mac.
- **Phone shape.** The last window shown fills the screen; native UI lays out inside the safe
  area, the system bars, the cutout and the keyboard; `mygo.NewTabs` gives the system's tab bar,
  `Window.Push` a stack with the system's navigation bar; a `ui.Router` can be the system stack
  (`SystemStack`) with UIKit's edge swipe and Android's predictive back.
- **Native code.** Swift and Kotlin through "native modules" (a Go interface implemented in each)
  or JSON plugins (`mygo-plugin.json`), compiled into the host by the CLI.

## 3. What works on a phone (DOCUMENTED unless marked)

| Need | MyGo 0.10 | Notes |
|---|---|---|
| Text input, IME, autocorrect, autofill | Yes; **VERIFIED** typing with Gboard's suggestions on Android | System keyboard through a `TextInputClient`, composition included; `Keyboard`, `ReturnKey`, `Autofill`; selection handles and the system edit menu |
| Scrolling, flings, overscroll | Yes; **VERIFIED** a fling on Android | UIKit-like bounce, Android stretch; pull to refresh; tap the status bar to top |
| Gestures | Yes | Long press (with haptic tick), pinch and rotate, edge swipe back, predictive back |
| Safe areas, keyboard avoidance | Yes; **VERIFIED** (safe area on both, the keyboard on Android) | Native UI lays out inside bars, cutout and keyboard |
| Dark mode | Yes; **VERIFIED** on iOS | The spike followed the Simulator's switch live, Pebble's dark tokens and all |
| Dynamic Type | Yes (release notes) | Not tried |
| VoiceOver / TalkBack | Yes | Our views already set roles and labels for the Mac's VoiceOver; not tried on a phone |
| Images | Yes | `ui.Image`, SVG, and `ui/netimage` with memory and disk caches |
| Push notifications | Plugin `push` (APNs, Firebase) | **No notification service extension**: Ducter's D159 push is end-to-end encrypted and decrypted on the phone by `DucterNotify`, an app extension. MyGo can't embed or sign an `.appex` (open issue #1991) |
| Live Activities / widgets | No | Same gap: `DucterLive` is a widget extension (D306) |
| Background | Plugin `background` (BGTaskScheduler, WorkManager); `ios.backgroundModes` | Lifecycle: suspend/resume events, `OnSaveState` |
| Deep links | Yes | `urlSchemes`, associated domains, Android App Links, `App.OnOpenURL` |
| Share sheet | Yes | `mygo.Share` (text, a link, files) |
| Camera, photos | Plugins `camera`, `imagepicker` | `Dialog.Open` is the document picker |
| QR scanning | INFERRED: through `camera` plus a decoder in Go | No barcode plugin |
| Speech (hold to talk, read aloud) | **No plugin** | Would be a native module in Swift (Speech, AVSpeechSynthesizer) and Kotlin (SpeechRecognizer, TextToSpeech): what `Voice.swift` and `Voice.kt` already do |
| Haptics, biometrics, keychain | Yes | `mygo.Haptics`, plugin `biometrics`, secrets in the Keychain / Android keystore |
| Android self-update (D181) | No | "the updater (stores update apps)": the APK download, check and install session are ours to write as a Kotlin module |
| Android accessibility service, calls, recording (D238, D278, D255) | No | Each would be a Kotlin native module with its manifest entries; `application` snippets in `mygo-plugin.json` allow services |
| Foldables (D182, D317) | Partly | Android "splits the screen by itself"; no hinge or posture API. INFERRED: the fold work would be a module |
| iPad | Yes | `ios.multipleWindows`, `OwnScene` |
| Testing | Yes | `Tester.FingerDown/Move/Up`, `SetInsets`, `ui/golden`; `plugins/automation` drives a running app on a simulator |

**Size and speed.** (Android numbers are in §4.)

- VERIFIED: the spike's iOS Simulator app (all of Ducter's Mac views, the fonts and the clay art
  the views embed, the mock hub) is **35.1 MB**, one 36.7 MB executable. The first build took
  6 min 55 s on a machine at load ~400; a rebuild after a Go change, 23 s. Today's iPhone shell
  is small because the page comes from the home. INFERRED: a device `.ipa` would be smaller than
  the simulator binary after stripping, but of the same order: most of it is our embedded art.
- VERIFIED: cold launch in the Simulator to the full conversation, with frames from the in-process
  mock, in **under 1 s** (a shot at 1 s already shows it). No measurement on a device.
- Known issues filed the day after release (open): iOS frames wait on the main thread for a
  drawable, so **panning stutters and sometimes freezes for a second** (#2002); the display link
  stays at 120 Hz (#2004, battery).

**Maturity.** The phone backend landed in one change (#940, 632 files, +54,942 lines) and shipped in
0.10.0 on 2026-11-17. MyGo itself is two months old (created 2026-09-26, ~6,500 stars, 50 open
issues), released several times a week, with a fast maintainer. No app in its showcase ships on a
phone yet (INFERRED from the dates). The API around native code already moved once in 0.10.0
(#1985: `mygo.NativeLibrary` and a plugin's `native` block are gone).

## 4. The spike: Ducter's Mac views on an iPhone and an Android phone

A scratch `cmd/mobilespike` (not committed): the Mac's `views.App` against the in-process mock hub
over a loopback WebSocket, in one `mygo.NewWindow`, no change to any view.

**iOS Simulator** (VERIFIED, iPhone 17 Pro, iOS 26.3; shots `ios-*.png`):

- It built and ran with **zero changes to the views**: the conversation, On hand, a task, Settings
  and Devices, in Ducter's fonts, clay buttons and art, light and dark, inside the safe area.
- Where it shows a Mac app on a phone: the conversation's header squeezes the status counts to
  "2…  在…"; On hand drops to one column but its counts truncate; **the task page's bar
  overlaps** (breadcrumb and branch drawn over each other, the places control cut off at the
  right edge); **Settings keeps the Mac's two panes** at 402 pt, the right pane a column one
  character wide; Devices says "这台 Mac". Every view was designed for 760 pt and up (the Mac
  window's minimum).
- Not tried (no finger driver in the time): the keyboard rising over the composer, IME, scrolling
  by finger, VoiceOver.

**Android emulator** (VERIFIED, API 36.1 "Medium Phone", arm64, headless; shots `android-*.png`):

- It built (`mygo build -platform android/arm64`): **`.apk` 36.4 MB, `.aab` 22.9 MB**. The first
  build took 19 min, nearly all of it Gradle fetching dependencies over a slow link; a rebuild
  after a Go change took **7.5 s**.
- `am start -W` reports **1.65–1.81 s** to the first frame (emulator under load; `Displayed …
  +1s504ms` in logcat), conversation included.
- **Touch works on the Mac's views as they are**: taps on the places control opened On hand,
  Settings and Devices; a swipe scrolled On hand with a fling; a tap on a card opened its task;
  Android's Back went from the task back to On hand.
- **The keyboard works**: tapping the composer raised Gboard and the composer moved above it;
  typed text appeared with Gboard's live suggestions. Chinese input (Pinyin composition) was not
  tried.
- **A pitfall found**: our `theme.LoadFonts()` runs in `main` before `mygo.App.Run`. On Android
  the host isn't up yet, so every `ui.RegisterFont` failed with "android does not support this"
  and the views drew in Roboto/Noto. Calling it inside `WhenReady` fixed it (Ducter's own faces,
  Resource Han Rounded included). iOS didn't show the error (its host starts first). INFERRED: a
  phone build would move font registration into `WhenReady`.
- The same layout problems as on iOS (the task bar overlapping itself, two-pane Settings).
- Not tried: VoiceOver/TalkBack, dark mode on Android, a real device. The emulator's own
  `system_server` and launcher went "not responding" twice under the machine's load; not the app.

What the spike shows (INFERRED): the toolkit is real and the views port mechanically, but a phone
is a different layout, not a smaller window. Every page would need a compact layout (one pane,
the system's navigation, bottom sheets), which is the work the web client already did once for
phones (D184, D290, D254).

## 5. Comparison: one Go UI vs today's shape

Today: **Mac** = Go views on MyGo (native UI). **iPhone/iPad** = SwiftUI shell + the home's page
(`apps/web`, Preact) in WKWebView, with native extras (push decryption extension, Live Activity,
speech, the connect/QR screens, D200's version line). **Android** = Kotlin shell + the same page,
with native extras (self-update, foldable, use this phone, calls, recording, the glance
notification). **Browsers** = the same page.

| | Today | One Go UI (Mac + iOS + Android on MyGo) |
|---|---|---|
| Views to write per feature | Two: Go (Mac) and the web page (every phone and browser) | Two still: Go (Mac + phones) and the web page (browsers, and anyone without the app). INFERRED: the web client can't go away while "open the home in a browser" is a way in |
| Parity Mac ↔ phone | By hand, two codebases | Same code, but separate compact layouts: shared logic and components, not shared screens |
| Native feel | Web page in a web view: DOM text, real scrolling, but a page | GPU-drawn native UI with system gestures, keyboard and accessibility per the docs; the iOS panning stall (#2002) is today's evidence against |
| Updates | The page updates with the home; the shell rarely changes | Every UI change is an app release through TestFlight / the Play Store / our APK updater; an app newer or older than its home is the normal case (D200's lesson, much larger) |
| Phone-only features | Swift and Kotlin in the shells | Swift and Kotlin as native modules; nothing is saved, and extensions (push decryption, Live Activity) are not possible yet |
| Offline / start | Needs the home to serve the page; native screens for connect and can't-reach | Starts in under a second with no page load; could show the last state offline |
| Toolchain | Xcode project (xcodegen), Gradle, bun | One CLI, Go plus generated hosts; cgo on iOS |
| Risk | Known and shipped | A one-day-old backend, a moving native API, one maintainer |

**What we'd gain:** one Go codebase for the Mac and the apps' views and state (the store, the
client, the protocol mirror, i18n); a phone app that starts instantly and doesn't depend on the
home serving a page of the right version; native text and gestures without fighting WebKit (the
iOS sheet bug of research/123, `navigator.clipboard` over http in D254).

**What we'd lose or have to rebuild:** the phones' share of the web client (still needed for
browsers); the Android shell's self-update (D181, D342), foldable work (D182, D317), use this
phone (D238), calls (D278) and recording (D255) as Kotlin modules; the iOS push decryption
extension (D159) and Live Activities (D306) until MyGo can embed extensions; the phones' tie of
UI version to the home's version.

## Implications for Ducter

1. **Take the Mac bump now.** No API change touches us, the build is clean without a source edit,
   and 0.9–0.10 bring faster layout and the popover clamp. Keep it a separate commit so it can be
   reverted alone.
2. **Keep the phones as they are** (the author's call). The decisive gaps are not the toolkit but
   the product: app extensions for D159's encrypted push and D306's Live Activity, the Android
   features already shipped as Kotlin, and a UI that would then update only through stores.
3. **Re-open the question at measurable gates**, each a cheap spike, not a migration:
   - **Gate A (toolkit):** MyGo can embed and sign app extensions (#1991 closed), the iOS panning
     stall is fixed (#2002), and two more MyGo releases pass without breaking the native-module API.
   - **Gate B (fit):** a compact layout of the conversation and one opened task, built with MyGo's
     phone widgets beside the Mac's, scrolls at 60 fps p95 on a real iPhone and a mid-range
     Android (`MYGO_FRAME_STATS`), types Chinese with the system IME without a dropped character,
     and reads right under VoiceOver and TalkBack.
   - **Gate C (product):** a reason the web page can't meet: offline start, a feature the web view
     blocks, or measured launch-to-conversation time (today's shell vs the Go app on the same
     phone).
   Only if all three hold: a decision (Dn) on moving one platform first, Android or iPad, behind a
   separate app id, with the web client kept for browsers.
4. **Use the toolkit's testing either way.** `ui/golden` and `Tester.FingerDown` would firm up the
   Mac views' shots now, independent of phones.

## Summary

MyGo 0.10.0 (one day old) runs the same Go app on iOS (Metal) and Android (OpenGL ES) with a CLI
that builds, signs and publishes without an Xcode project. The Mac bump from 0.8.3 needs no source
change. Ducter's Mac views ran unchanged in the iOS Simulator (under a second, light and dark) and on an
Android emulator (taps, a fling, Back and the keyboard all worked; fonts must register in
`WhenReady` there), but laid out for a 760-pt window; a phone would need compact layouts anyway. App extensions
(encrypted push, Live Activity), speech and Android's self-update are not provided, the iOS
backend has a known panning stall, and its native API is still moving. Recommendation: bump the
Mac now, keep the phones on the web client in native shells, and revisit at gates A–C.
