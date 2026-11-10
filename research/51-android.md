# 51. Ducter on Android: shell, self-update from the release, foldables, push

**Question.** The author wants Android in the next release (0.0.10): the APK on the GitHub Release,
no store, an app that updates itself, and foldables laid out well. What should the app be built
on, how does it update without Play, how does the page learn where the fold is, and can it notify
without making Google a requirement?

Sources: Nowledge Mem's Tauri Android app (closed source; concepts in
`research/private/51-mem-android.md`), Lorca (`egoist/lorca`, shallow clone at
`bf1ab709bc8df470016522578d7ae2df7740cd22`, 2026-10-28, read only), Android and Chrome
documentation, and our own build run in an Android 16 emulator (Pixel 9 Pro Fold profile,
WebView 134.0.6998.135) against the demo core (`apps/web/demo.ts`). Tags: VERIFIED (read in the
files or seen running here), DOCUMENTED (the vendor says so), INFERRED.

## 1. Prior art: two apps from people close to us

| | Nowledge Mem (Tauri) | Lorca (Expo) |
|---|---|---|
| UI | the web front end in a WebView (Tauri v2) [VERIFIED, private notes] | native React Native screens (expo-router, FlashList, Reanimated); no WebView [VERIFIED `mobile/package.json`] |
| Project | generated Android project committed | CNG: `android/` gitignored, `expo prebuild` in a copy at release time [VERIFIED `mobile/.gitignore`, `scripts/release-android.ts`] |
| Build | by hand; no CI [VERIFIED] | CI on a `mobile-v*` tag: Rust core with cargo-ndk, prebuild, `./gradlew :app:assembleRelease`, `aapt2 dump badging` and `apksigner` checks against a pinned certificate SHA-256 [VERIFIED `.github/workflows/release-mobile.yml`, `scripts/release-android.ts`]; `eas.json` exists but CI doesn't use EAS |
| Artifact | universal APK on the community repo's release [VERIFIED] | `lorca-<ver>-android.apk` on a GitHub release created with `--latest=false` (the repo's latest is the CLI's) [VERIFIED] |
| Signing | `keystore.properties`; unsigned without it [VERIFIED] | secrets `ANDROID_KEYSTORE` (base64 PKCS12) + `ANDROID_KEYSTORE_PASSWORD`, written into gradle.properties as `android.injected.signing.*`; `ORG_GRADLE_PROJECT_*` names with dots were dropped by dash and silently produced a debug-signed APK [VERIFIED] |
| versionCode | Tauri's | `major·1e6 + minor·1e3 + patch` [VERIFIED `mobile/app.config.ts`] |
| Self-update | none [VERIFIED] | from GitHub: lists `mobile-v*` tags, reads the release, takes the asset's `digest` (sha256) and size, downloads, checks both, installs through a `PackageInstaller` session with `USER_ACTION_NOT_REQUIRED`; once a day at launch or back in front; Install / Remind Me Later / Skip [VERIFIED `mobile/src/core/updates.ts`, `Updater.kt`] |
| Push | none [VERIFIED] | FCM data messages, end-to-end encrypted, decrypted on the phone; `google-services.json` committed [VERIFIED] |
| Layout | edge-to-edge, no recreate on resize, CSS safe-area variables [VERIFIED] | portrait only; a sidebar from 700 dp; no foldable code [VERIFIED `mobile/src/ui/layout.tsx`] |
| Lessons | debug-signed APKs are refused by MIUI / ColorOS / HarmonyOS / OPPO ("packageInfo is null") [VERIFIED postmortem] | Xiaomi asks to confirm every update; Play Protect may say "App scan recommended" for an unseen APK; Android developer verification [VERIFIED `docs/releasing-mobile.md`] |

What it says for Ducter: Lorca went native because it has no web client; its UI *is* the RN app.
Ducter's client is already one page (`apps/web`) that the iPhone app hosts (D159, D176). Mem shows
the WebView route works and shows what goes wrong without CI checks. Lorca shows the whole
self-update path, end to end, without a store.

## 2. Self-update outside Play

- **Installing.** An app may install packages with `PackageInstaller` sessions if it declares
  `REQUEST_INSTALL_PACKAGES` and the user has allowed it under "Install unknown apps", checked
  with `PackageManager.canRequestPackageInstalls()` and opened with
  `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` [DOCUMENTED, developer.android.com
  PackageInstaller / Settings; VERIFIED here]. From Android 12 a session may ask
  `setRequireUserAction(USER_ACTION_NOT_REQUIRED)` (with `UPDATE_PACKAGES_WITHOUT_USER_ACTION`);
  Android honours it only for an update of an app the installer may update, otherwise it answers
  `STATUS_PENDING_USER_ACTION` with an intent to show [DOCUMENTED]. Here, an app first installed
  by `adb` updated itself with no prompt at all (0.0.9 → 0.0.10, twice) [VERIFIED].
- **Signature continuity.** Android installs an update over an app only when the same key signed
  both; otherwise the install fails (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, a session status of
  `STATUS_FAILURE_CONFLICT` / `INCOMPATIBLE`) [DOCUMENTED]. So the release key is forever: a
  lost key means every user uninstalls and reinstalls (losing the pairing); a debug-signed release
  can never be updated by the real one. The app checks the downloaded APK's package, versionCode
  and signing certificate against itself before handing it over (`getPackageArchiveInfo` with
  `GET_SIGNING_CERTIFICATES`) and says plainly when they differ [VERIFIED code path, tested
  only with matching keys].
- **Where from.** Ducter cuts one release per version for everything (`release.yml`), and
  `releases/latest` is that release, so the app reads `api.github.com/repos/wey-gu/ducter/releases/latest`
  as the home does (D148) and takes `Ducter-<version>-android.apk`; GitHub's asset `digest`
  (`sha256:…`) is the sum, else the release's `SHA256SUMS.txt` [DOCUMENTED GitHub REST
  "release assets" `digest`; Lorca relies on it, VERIFIED]. Downloads only from github.com,
  api.github.com and *.githubusercontent.com over https, redirects checked hop by hop.
- **Developer verification.** From 2026-09-30 certified Android devices in Brazil, Indonesia,
  Singapore and Thailand block normal installs of apps whose developer has not registered with
  Google, also outside Play; global in 2027; an "advanced flow" (developer mode, restart, a
  24-hour wait) remains for unverified apps [DOCUMENTED,
  [developer.android.com/developer-verification](https://developer.android.com/developer-verification/guides),
  [The Hacker News, 2026-06](https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html)].
  Registering `co.nowledge.ducter.android` with the release certificate's SHA-256 is a one-time
  task for the author (Lorca's runbook says the same) [INFERRED that it applies to us; it applies
  to any app installed on a certified device in those regions].
- **Chinese ROMs.** Xiaomi asks for confirmation on every update even with
  `USER_ACTION_NOT_REQUIRED`; ROMs refuse debug-signed APKs [VERIFIED in Lorca's and Mem's docs;
  not tried here].

## 3. Shell technology

| Candidate | For | Against |
|---|---|---|
| **Kotlin + Android WebView (thin shell)** | same shape as `apps/ios`: the page is the product, the app adds only bridge, pairing, insets, fold, update; one small Gradle project, no JS toolchain in the build; 2.9 MB release APK [VERIFIED] | a second native codebase to keep (≈1,100 lines with tests) |
| Expo / React Native | Lorca proves the release + self-update path | duplicates the web client natively, or wraps a WebView in RN (react-native-webview) and adds Metro, prebuild and a JS runtime for nothing the page lacks; Lorca's reasons (no web client) don't apply |
| Tauri v2 | Mem uses it; WebView too | Rust + NDK toolchain for a shell with no Rust in it; a generated project to re-check after every regeneration (Mem's postmortem); its updater is desktop-only [VERIFIED Mem disables it on mobile] |
| Trusted Web Activity | Chrome's full engine, Web Push through Chrome | needs Chrome (absent on many Chinese phones), Digital Asset Links on every user's own home origin, and no bridge (no fold from the app, no in-app update UI); the app would be a launcher for a browser tab |
| Plain PWA in Chrome | works today, Web Push through Chrome | no app to update, no foldable help beyond the page, the user installs it per home |

## 4. Foldables in a WebView

- **What Android says.** Jetpack WindowManager reports a `FoldingFeature` with bounds (window
  pixels), `orientation` (VERTICAL / HORIZONTAL), `state` (FLAT / HALF_OPENED), `isSeparating`,
  `occlusionType` [DOCUMENTED]. On the emulator's Pixel 9 Pro Fold: unfolded flat, a vertical
  fold at 1038 px of 2076 (state FLAT, not separating); `adb emu posture 2` gives HALF_OPENED;
  `adb emu rotate` then a horizontal fold (tabletop); `adb emu fold` the 1080 × 2424 cover
  screen, where no feature is reported; the activity was not recreated by any of it (it declares
  the size changes) [VERIFIED].
- **What the page can see by itself.** Chrome 138 shipped the Viewport Segments API
  (`window.viewport.segments`, CSS `env(viewport-segment-*)`) for foldables on Android
  [DOCUMENTED, [Chrome blog](https://developer.chrome.com/blog/viewport-segments-api-shipped),
  [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/pxWV6Es3T0Q)]. In the
  emulator's WebView 134 `window.viewport` is absent [VERIFIED]; whether a WebView ≥ 138 fills
  it inside an app is not known [INFERRED: possible, untested]. So the app tells the page:
  `window.ducterFold = {axis, state, start, end, separating, occluding}` in CSS px, and a
  `ducterfold` event; the page also reads `window.viewport.segments` when no app says anything
  (Chrome on a foldable).
- **Insets.** The app draws edge to edge and sets the page's own `--safe-*` variables from
  `WindowInsets` (bars, cutout) itself; the keyboard shrinks the web view, so the composer sits
  right above it [VERIFIED, `.shots/android/07-keyboard.png`]. WebView support for
  `env(safe-area-inset-*)` varies by version [INFERRED from the change history; not relied on].
- **Densities.** The emulator's WebView reports `devicePixelRatio` 2.4375; the fold at 1038 px is
  426 CSS px, and the page split there exactly [VERIFIED].

## 5. Notifications without Google as a requirement

- **WebView has no Web Push.** In the app's WebView `PushManager` and `Notification` are absent
  [VERIFIED; over http also no service worker]. Android WebView doesn't implement the
  Notifications API [DOCUMENTED, MDN compatibility tables].
- **FCM** needs Google Play services on the phone and a Firebase project; Lorca ships
  `google-services.json` and an FCM service [VERIFIED]. Many phones sold in China have no Play
  services [DOCUMENTED widely; INFERRED share].
- **UnifiedPush**: the app registers with a distributor app (e.g. ntfy) or an embedded FCM
  distributor where Play services exist, and gets an endpoint URL to which a server POSTs
  Web Push requests [DOCUMENTED, [unifiedpush.org](https://unifiedpush.org/developers/implementations/)].
  Since the home already sends standard Web Push (VAPID, aes128gcm, `packages/core/src/push.ts`),
  an endpoint plus p256dh/auth keys from the phone would need no new sender, only a wider
  endpoint allowlist (`isPushEndpoint` today accepts FCM, Mozilla, Apple and Windows hosts, to
  keep the home from POSTing near itself) [VERIFIED code]. The connector's Web Push key handling
  is [INFERRED from its docs' summary; not built or tried].
- **Polling** with a foreground service costs battery and shows a permanent notification; not a
  product.
- **Today, without the app:** Chrome on Android gets Web Push from the home as it is (D59;
  `docs/phone.md` says Go / Hold work there).

## 6. Icon

The iPhone icon is full-bleed; an adaptive icon's mask shows the middle 72 of 108 dp, which cut
off the partner's notebook. The Android icon is the same art set back to 74% over its own paper
gradient (`.shots/android/icon-round-preview.png`) [VERIFIED].

## 7. Verified end to end here (2026-11-10)

Android 16 emulator, Pixel 9 Pro Fold profile, scratch AVD, demo core on scratch state:

- Pairing from a link: the page paired as **Android phone · Ducter** and opened the conversation
  (`02-paired-unfolded.png`).
- Unfolded flat and half-open (book): the conversation left of the fold, On hand right
  (`02`, `04-book-half.png`); tabletop: the conversation above, On hand below (`05-tabletop.png`);
  flat and turned (a tall screen with a fold across): one column (`06-flat-landscape.png`);
  folded, the cover screen: one column, same page, nothing reloaded (`03-folded-cover.png`).
- The connect screen on a book: the partner on one side, the form on the other
  (`01-connect-book.png`); dark mode follows the system (`15-dark-book.png`).
- Self-update against a fake "latest release" (a local server shaped like GitHub's answer): the
  card **有新版本 0.0.10** with the release's zh lines, in the half past the fold
  (`08-update-offer.png`); the one-time "Install unknown apps" switch (`09`, `10`); Android
  installed 0.0.10 over 0.0.9 without a prompt; the next launch said **回来了，现在是 0.0.10**
  (`13-back-on-new.png`).
- Not verified: a real device, a Chinese ROM, a release-key update (only debug-key to debug-key;
  the release signing path was built once with a throwaway key, then deleted), the QR scanner with
  a real camera, `STATUS_PENDING_USER_ACTION` on a phone that asks.

## Implications for Ducter

1. A thin Kotlin + WebView shell like the iPhone app (D178), not Expo or Tauri: the page stays the
   product; nothing native duplicates it.
2. One release, one APK, `Ducter-<version>-android.apk` beside the DMG; the app updates itself
   from `releases/latest` with the asset's SHA-256, the size, and a same-key check (D181). The
   release key is created once, kept forever, its SHA-256 pinned in CI.
3. The fold splits the panes (D182): book left/right, tabletop top/bottom, at the fold's exact
   position, from the app's `window.ducterFold` or the browser's viewport segments.
4. Notifications in the app wait; UnifiedPush over the home's existing Web Push is the path that
   needs no Google and no new sender; Chrome on Android keeps working meanwhile.
5. Owed by the author: the release keystore and its four secrets, the certificate variable, and
   Android developer verification for the package before 2027 (now, for the four countries).

**Summary.** Lorca proves an APK-on-GitHub self-updater; Mem proves a WebView shell and what an
unchecked signing path costs. Ducter takes the iPhone app's shape on Android: a WebView shell,
updating itself from the one GitHub release with a checksum and a same-key check, telling the page
where the fold is so the panes meet at it. Verified in a foldable emulator; notifications deferred
with a Google-free path named.
