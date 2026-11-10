# 49. The iPhone app on iPad and on iPhone Duo

2026-11-10. Why the TestFlight build didn't run as a real app on iPad or on "iPhone Duo", what
each needs, and what was checked. Feeds D176.

## The question

The author: "TestFlight app 不支持 iPad 和 iPhone duo，你能支持一下么". The app (`apps/ios`) was built
with `TARGETED_DEVICE_FAMILY = 1` (iPhone only) and portrait only (`design/release/ios.md`).

## What "iPhone Duo" is

- **Apple's first foldable iPhone, announced September 2026.** DOCUMENTED: Apple Newsroom
  "Apple unveils iPhone Duo" (apple.com/newsroom/2026/09/apple-unveils-iphone-duo/), product pages
  at apple.com/iphone-duo, and a developer hub "Get ready for iPhone Duo"
  (developer.apple.com/iphone-duo/). A closed outer display and an open, nearly square inner one.
- Display sizes in points are not on the pages read. Third-party reports give a 7.6" inner panel
  of 1878 × 2670 px and a 5.4" outer one (INFERRED, unconfirmed; earlier leaks disagree). The
  width audit below uses an estimated 626 × 890 pt for the inner display, which falls in the
  one-column band either way.

## What each device needs (DOCUMENTED)

**iPad** (Apple's long-standing multitasking requirements): the app lists the iPad family, supports
all four orientations, does not set `UIRequiresFullScreen`, and has a launch screen. Then Split
View, Slide Over and Stage Manager size its window freely. Multiple windows need
`UIApplicationSupportsMultipleScenes`, which is optional.

**iPhone Duo** (developer.apple.com/iphone-duo/prepare/, and the "iPhone Duo Group Lab" summary,
developer.apple.com/forums/thread/847644):
- "Apps built with the iOS 27 SDK and later resize dynamically on iPhone Duo." With the iOS 26 SDK
  or earlier the app "appears centered with empty space when open, and to the left of the status
  bar and camera when closed". The iOS 27 SDK fills most of the inner display but avoids the
  status bar on the right edge; **the iOS 27.1 SDK or later fills the full display**, with
  toolbars and tab bars "vertically below the status bar".
- The outer display is compact width in portrait; the inner display is regular × regular. "With
  iPhone Duo and resizable iPhone Mirroring, an iPhone app can have any combination of size
  classes." Lay out from available space; never from idiom, orientation or a device size.
- "iPhone Duo honors UIRequiresFullScreen", but Apple asks apps to remove it. The inner display
  "doesn't honor your supported interface orientations" (the forum thread is inconsistent on this).
- Each instance is its own UIScene, as on iPad; multiple scenes are not required.
- Web content: "use responsive web design principles … rather than detect the device type".
  Viewport Segments and Device Posture are behind Safari feature flags in iOS 27.1.
- Testing: the iPhone Duo simulator ships with **Xcode 27.1**; the resizable simulator and iPhone
  Mirroring on macOS 27 approximate it.
- App Store: iPhone Duo screenshots in App Store Connect earn a "Made for iPhone Duo" badge; they
  are optional.

## What this Mac and CI have (VERIFIED)

- This Mac: Xcode 26.3 (iOS 26.3 SDK and simulator runtime), no Xcode 27, so **no iPhone Duo
  simulator here** and no 27.1 build. iPad and large-iPhone simulators are available.
- CI: `release.yml`'s `ios` job and `ios.yml` run on `macos-26` with the image's default Xcode.
  Whether that image carries Xcode 27.1 today was not checked (INFERRED: GitHub adds new Xcodes to
  its images within weeks of release).

## What was checked

- `xcodegen` + `xcodebuild` for iPad Pro 13" (M5) and iPhone 17 Pro Max simulators, and an unsigned
  Release archive (`scripts/ci/testflight.sh` dry run): all succeed. The built app lists
  `UIDeviceFamily = [1, 2]` (the extension too) and has iPad icons (`AppIcon76x76`) generated from
  the one 1024 source.
- WKWebView on iPad asks for desktop pages by default (iPadOS's desktop-class browsing): the user
  agent says Macintosh, so the client named an iPad "Browser · Ducter" with platform macOS.
  VERIFIED in `deviceName`; fixed by `preferredContentMode = .mobile` in the app and, for Safari on
  iPad, "a Mac with a touch screen is an iPad" (`navigator.maxTouchPoints > 1`).
- Width audit of the web client in headless Chromium at 18 sizes from 320 to 1366 (phones, iPad
  Split View thirds/halves/two-thirds, iPad mini to 13" in both orientations, the estimated Duo
  inner display), four routes each: no horizontal overflow, nothing off-screen. Shots in
  `.shots/ipad/web/`.
- The app in scratch simulators (iPad Pro 13", iPad mini, iPhone 17 Pro Max) against the demo core,
  portrait and landscape: `.shots/ipad/sim/`. Split View and Stage Manager can't be driven with
  `simctl` alone (no window), so the native window at those sizes is not shot; the page at those
  widths is the Chromium audit.

## Not verified

- A build with the iOS 27.1 SDK and a run on the iPhone Duo simulator (needs Xcode 27.1).
- Hardware-keyboard menu commands reaching the page (needs keyboard input to a simulator window).
- A signed universal upload to TestFlight (runs at the next release).

## Implications for Ducter

1. One universal app: iPhone and iPad, every orientation, one scene, no full-screen requirement.
2. The web client lays itself out from the width it has, never the device: one column below
   1000 CSS px (covers Split View, 11" upright and both Duo displays), two panes above.
3. iPhone Duo is mostly an SDK question: build with Xcode 27.1 when CI has it.
4. iPad screenshots are needed only for App Store review, not for TestFlight; Duo screenshots are
   optional (a badge).

## Summary

The app was iPhone-only and portrait-only. iPad needs the device family, all orientations and no
`UIRequiresFullScreen`; iPhone Duo needs a build with the iOS 27.1 SDK and a layout driven by
available space. The web client already scaled; it now uses two panes on wide screens and names an
iPad as an iPad.
