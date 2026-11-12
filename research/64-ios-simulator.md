# 64: An iOS Simulator in the opened task, with nothing to install

Asked (2026-11-12): the author, with a T3 Code screenshot (a thread with a live iPhone simulator in
its right pane and a tool rail: home, rotate, appearance, text size, screenshot), wants the opened
task's workbench to show a booted iOS Simulator for iOS work, "taps only through a route you verify
works without third-party installs".

Tags: VERIFIED (run here, or read in source at path), DOCUMENTED (Apple's own `simctl help`),
INFERRED. T3 Code was read only (shallow clone `pingdotgg/t3code` `6d35d090`, 2026-11-11), never run.

Machine: MacBook Pro, Apple M-series, macOS 15.7.9, Xcode 26.3 (17C529), iOS 26.3 runtime,
iPhone 16e simulator (1170 × 2532 px), booted with `simctl boot` (no Simulator.app window).

## 1. What `simctl` gives, and what it doesn't

| Need | Route | Status |
|---|---|---|
| Booted devices | `xcrun simctl list devices booted -j`: udid, name, deviceTypeIdentifier, runtime key | VERIFIED |
| A frame | `simctl io <udid> screenshot --type=jpeg -` (stdout) | VERIFIED: 173–184 ms warm, 373 ms first; 352 KB at full size |
| A small frame | the same, then `sips -Z 780 -s formatOptions 55` | VERIFIED: +66–83 ms, 35 KB at 360 × 780 |
| A screenshot to keep | `simctl io <udid> screenshot --type=png -` | VERIFIED: ~440 ms, 526 KB, full resolution |
| Dark / light | `simctl ui <udid> appearance [light\|dark]`, read with no argument | DOCUMENTED, VERIFIED |
| Text size | `simctl ui <udid> content_size <category>` (extra-small … accessibility-extra-extra-extra-large), read with no argument | DOCUMENTED, VERIFIED |
| Home | `simctl launch <udid> com.apple.springboard` brings the home screen forward; the app that was in front keeps running (Settings' pid unchanged in `simctl spawn <udid> launchctl list`) | VERIFIED |
| Open a link | `simctl openurl <udid> <url>` | DOCUMENTED |
| Rotate | none in `simctl`; T3 Code also returns "unsupported" for iOS (`apps/server/src/device/DeviceActions.ts`, `case "setOrientation"`) | VERIFIED absent |
| Taps, swipes, typing | none in `simctl` (`io` has only enumerate, poll, recordVideo, screenshot). Every tool that taps a simulator (idb, AXe, serve-sim) loads Xcode's private CoreSimulator / SimulatorKit frameworks and sends Indigo HID messages. Posting CGEvents into Simulator.app needs Accessibility permission and a visible Simulator window | VERIFIED absent in simctl; INFERRED for the rest |
| A moving picture | `simctl io recordVideo` writes a QuickTime file (hevc/h264) until SIGINT; streamable only with a decoder in between | DOCUMENTED |

So, with only Xcode: a live view at about 3–4 frames a second (≈250 ms a frame, 35 KB each,
≈100 KB/s), appearance, text size, Home, open a link, and a full screenshot. Not taps.

## 2. How T3 Code does it

VERIFIED in `docs/internals/devices.md`: the Device panel runs two npm tools it installs into its
own home after a consent step, pinned: **expo-device-hub** (streams; serve-sim loads private
CoreSimulator frameworks through a native addon, so it runs as a supervised child) and
**agent-device** (drives: taps and gestures, for agents and the panel). Frames are MJPEG through
an authenticated proxy (the hub binds loopback; serve-sim's exec route is never proxied).
Settings (appearance, text size, contrast, location, permissions, open URL, launch) run `simctl`
itself, one typed action per control (`DeviceActions.ts`). Text size has four steps: small,
default (`large`), large (`extra-extra-large`), extra large (`accessibility-large`).

## Implications for Ducter

1. Ship the simulator in the workbench as **a live view plus the controls simctl has**: Home,
   dark/light, text size (T3's four steps), open a link, and a screenshot into the task's
   composer as a picture (D206). Frames by polling `simctl io screenshot` on the task's computer
   through the workbench's `wb` ops, so a worker Mac serves its own simulator with no new plumbing.
2. **No taps yet**, said plainly in the view. Taps need either a consented install like T3's
   (serve-sim / agent-device) or Ducter's own helper against Xcode's private frameworks; both are
   a decision of their own (todo, with the trigger).
3. **No rotate**: nothing reliable exists.
4. Show it only when it is relevant: a booted simulator on the task's computer and either the
   task touched a simulator (its output names `simctl`, `xcodebuild … Simulator`, a simulator's
   udid) or its working copy is an app project (`*.xcodeproj`, `*.xcworkspace`, an `ios/` folder).

Summary: Xcode alone gives a ~4 fps view (≈250 ms, 35 KB a frame), appearance, text size, Home
(launch SpringBoard, verified), open URL and full screenshots; no taps and no rotation. T3 Code
taps through npm tools that load private CoreSimulator frameworks after a consent step.
