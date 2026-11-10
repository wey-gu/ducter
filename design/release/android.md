# The Android app: build, sign, release

The app is `apps/android` (D178): Kotlin and the system WebView around the phone client the home
serves at `/app`. It ships as `Ducter-<version>-android.apk` on the one GitHub Release and updates
itself from there (D181). Design: [../android.md](../android.md). Evidence: research/51.

| | |
|---|---|
| Project | `apps/android` (Gradle 8.14.3 wrapper, AGP 8.11, Kotlin 2.0, JDK 17) |
| Application id | `co.nowledge.ducter.android`; debug builds `co.nowledge.ducter.android.dev` (side by side) |
| SDK | minSdk 26 (Android 8), target and compile 36 |
| Version | `packages/cli/package.json` (one version for all of Ducter, D148); versionCode `((major·1000+minor)·1000+patch)·100 + (pre-release n ≤ 98, else 99)`: 0.0.10 → 1099 |
| APK | one universal APK (no native code), about 3 MB |
| Libraries | androidx core, activity, lifecycle, webkit, window; zxing-android-embedded (QR) |

## Build and run locally

```sh
cd apps/android
export ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=<a JDK 17>
./gradlew testDebugUnitTest assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
# Debug builds take a pairing link or a route on launch, as the iPhone app's -pairLink:
adb shell am start -n co.nowledge.ducter.android.dev/co.nowledge.ducter.android.MainActivity \
  --es pairLink "'http://10.0.2.2:7797/pair#c=<CODE>'"      # 10.0.2.2 = the Mac, from the emulator
```

A demo home: `DUCTER_PORT=7797 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts`, and a
code from `DUCTER_DATA_DIR=<scratch> bun packages/cli/src/main.ts pair --port 7797`. The emulator
reaches it as `10.0.2.2`, which the home treats as remote, so it pairs like a phone.

**A foldable:** create an AVD from the `pixel_9_pro_fold` device (in a scratch `ANDROID_AVD_HOME`).
`adb emu fold` / `adb emu unfold`, `adb emu posture 2` (half-open) / `3` (open), `adb emu rotate`
(twice from open, half-open = tabletop). Multiple displays: `adb exec-out screencap -p -d <id>`
with an id from `dumpsys SurfaceFlinger --display-id`. Screens go to `.shots/android/` (D75).

**The page from the inside:** debug builds allow WebView debugging; `adb forward tcp:9333
localabstract:webview_devtools_remote_<pid>` and Chrome DevTools (or a CDP `Runtime.evaluate`)
see `window.ducterNative`, `window.ducterFold` and `data-split`.

### Trying an update locally

1. Build the "new" one: `./gradlew assembleDebug -PducterVersion=0.0.10
   -PducterReleaseApi=http://10.0.2.2:7798/releases/latest` and keep the APK.
2. Serve a fake latest release on `127.0.0.1:7798`: GitHub's JSON shape (`tag_name`, `body` with
   a whats-new block, `assets[]` with `name: Ducter-0.0.10-android.apk`, `size`,
   `digest: sha256:<hex>`, `browser_download_url`) and the APK.
3. Install the "old" one with the same `-PducterReleaseApi` and no version override
   (`adb install -r -d` if a newer one is on the emulator), open it, long-press › **Check for
   updates** (or `am start -a co.nowledge.ducter.CHECK_UPDATE`), tap **Update**.

`ducterReleaseApi` other than GitHub's is honoured only by debug builds; a release build only ever
asks `api.github.com` and downloads only from GitHub's hosts.

## The release key (once)

The key that signs the first public APK must sign every APK after it, forever: Android installs an
update only over an app signed by the same key. Lose it and every phone has to uninstall (and pair
again). Create it once, on the author's Mac, and keep it with the other signing material (and a
second copy offline).

```sh
keytool -genkeypair -keystore ducter-android-release.p12 -storetype PKCS12 \
  -alias ducter -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Ducter, O=Nowledge Labs"
# keytool asks for the password; PKCS12 uses it for the key too.

# The certificate's SHA-256 (for the variable below and for Android developer verification):
keytool -list -v -keystore ducter-android-release.p12 -alias ducter | sed -n 's/.*SHA256: //p'
```

Then, in GitHub (`wey-gu/ducter` › Settings › Secrets and variables › Actions):

| Kind | Name | Value |
|---|---|---|
| Secret | `ANDROID_KEYSTORE_BASE64` | `base64 -i ducter-android-release.p12 \| gh secret set ANDROID_KEYSTORE_BASE64 --repo wey-gu/ducter` |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | the password (`gh secret set ANDROID_KEYSTORE_PASSWORD --repo wey-gu/ducter`, typed at the prompt) |
| Secret | `ANDROID_KEY_ALIAS` | `ducter` |
| Secret | `ANDROID_KEY_PASSWORD` | optional; only when the key's password differs from the keystore's |
| Variable | `ANDROID_CERT_SHA256` | the SHA-256 above (`gh variable set ANDROID_CERT_SHA256 --repo wey-gu/ducter --body <hex>`); colons and case don't matter |

**Android developer verification** (research/51 §2): register `co.nowledge.ducter.android` with
that certificate's SHA-256 in the Android Developer Console. Certified phones in Brazil, Indonesia,
Singapore and Thailand already refuse unregistered apps (since 2026-09-30); everywhere from 2027.

A maintainer may build a signed APK on their own machine with the same four as environment
variables: `DUCTER_ANDROID_KEYSTORE` (a path), `DUCTER_ANDROID_KEYSTORE_PASSWORD`,
`DUCTER_ANDROID_KEY_ALIAS`, `DUCTER_ANDROID_KEY_PASSWORD`. Without them `assembleRelease` refuses
to build: a debug-signed release installs nowhere useful and can never be updated by the real one
(Mem's postmortem, research/51 §1).

## What a tag does (release.yml `android`)

Unit tests, `assembleRelease` signed from the secrets, then checks before upload: package
`co.nowledge.ducter.android`, `versionName` = the tag's version, the certificate is not
`CN=Android Debug` and equals `ANDROID_CERT_SHA256` (warns when the variable is unset). It uploads
`Ducter-<version>-android.apk`; the `release` job lists it in `SHA256SUMS.txt` and adds the
Android line to the notes. With no keystore secret the job warns and the release has no APK; the
apps already out simply find no update.

## How the app updates itself (D181)

At launch and back in front, at most every 6 h: `GET
https://api.github.com/repos/wey-gu/ducter/releases/latest`. Drafts, pre-releases and versions not
newer are ignored. The asset `Ducter-<v>-android.apk`: its `digest` (`sha256:…`), else its line in
`SHA256SUMS.txt`. Download over https from github.com / *.githubusercontent.com only (redirects
checked hop by hop), check SHA-256 and size, then the APK's package, a higher versionCode and the
same signing certificate as the running app; any mismatch deletes it and says why. Install through
a `PackageInstaller` session (`USER_ACTION_NOT_REQUIRED` on Android 12+; some phones, Xiaomi's,
ask anyway). The first time, Android's "Install unknown apps" switch for Ducter. Android closes the
app to replace it; the next launch says **Back, now on {v}**.

**Checked here** (Android 16 emulator, debug key, a fake release; research/51 §7): offer, download,
checksum, signature check, the permission step, a silent install, the "back, now on" line. **Not
yet:** a real phone, a Chinese ROM, an update between two release-key builds, a phone that asks
for confirmation.
