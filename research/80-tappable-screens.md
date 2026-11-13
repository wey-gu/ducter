# 80 · A faster, tappable screen for the iOS Simulator and Ducter's phone

Date: 2026-11-13. Question: `research/78` found that Lody streams the iOS Simulator through a
patched Baguette (H.264 over WebRTC, WebSocket fallback, touch, buttons, paste) and Android
emulators the same way with three quality levels. Ducter's own phone (D217, `design/phone-use.md`
§7) shows device-made JPEG at ≤ 6 fps, and the simulator page (D220) is view-only at about 4 fps
(`simctl io screenshot` + `sips`). What would make both faster and the simulator tappable, how
would it travel through Ducter's home, and who may tap?

Sources (read only, nothing third-party run):
- **Baguette** `tddworks/baguette` at `593a1b4` (2026-11-07, v0.2.14): README, CHANGELOG,
  `docs/ARCHITECTURE.md`, `docs/wire.md`, `docs/serve.md`, `docs/features/{stream,device-hub}`,
  `CONTRIBUTING.md`, `Package.swift`, `Package.resolved`, `Sources/Baguette/{Domain/Stream,
  Infrastructure/Stream,Infrastructure/Server/Server.swift}`.
- **Lody** `LodyAI/Lody` at `66c8b96`: `apps/cli/src/ios-simulator/{README.md,
  baguette-manifest.json}`, its patch `swift-websocket-continuous-clock.patch`, and the decision note
  `.agents/notes/implemented/bug-fix/2026-09-29-baguette-runtime-sleep.md`.
- **scrcpy** `Genymobile/scrcpy` at `a60891a` (2026-10-08, server 5.0.1): `README.md`,
  `doc/develop.md`, `doc/video.md`, `LICENSE`.
- **Android emulator gRPC**: `google/android-emulator-container-scripts` at `0aa7b0d`
  (2026-10-05): `js/proto/emulator_controller.proto`, `README.md` (WebRTC section).
- Ducter: `packages/core/src/android/{device,live,clipboard}.ts`,
  `packages/protocol/src/{phone-use,workbench}.ts`, `design/phone-use.md`, D190, D217, D220,
  `research/62` §4, `research/64`.
- This Mac: macOS 15.7.9 (24G830), Xcode 26.3 (17C529), arm64 (`sw_vers`, `xcodebuild -version`).

Tags: VERIFIED (read in source or measured), DOCUMENTED (the project's docs say so), INFERRED.

---

## 1. Baguette

### 1.1 What it is

- One Swift CLI plus a self-contained web UI: boot, stream at "60 fps", taps, swipes, one- and
  two-finger touches, system edge gestures, hardware buttons, keys, paste, the accessibility tree,
  logs, screenshots, recordings, camera/location/motion/network simulation, deep links, CarPlay
  and Watch screens, plugins. (DOCUMENTED, README)
- **License Apache-2.0** (VERIFIED, `LICENSE`). Lody also uses it unmodified apart from one
  dependency patch (VERIFIED, Lody manifest).
- **Maintenance: very active.** v0.2.0 on 2026-09-22 to v0.2.14 on 2026-11-07: 15 releases in
  seven weeks, CI and coverage badges, a sponsor (AirBuild). (VERIFIED, CHANGELOG headings) Fast
  movement means breaking changes too (0.2.14 has a "Breaking:" line). (VERIFIED)
- Distribution: `brew install baguette`; Apple Silicon with Xcode 26. (DOCUMENTED, README)

### 1.2 How it taps the simulator: Xcode's private frameworks

- Not `simctl` (it has no input, `research/64` §1) and not idb. Baguette loads **CoreSimulator and
  SimulatorKit at run time** with `NSClassFromString` and `dlsym`, found through
  `xcode-select -p`, deliberately not linked so it works wherever Xcode lives. (VERIFIED,
  `Package.swift` comment)
- Why it works on iOS 26 when idb and AXe stopped: iOS 26 changed SimulatorHID's wire format; the
  old 5-argument `IndigoHIDMessageForMouseNSEvent` "silently drops … or crashes `backboardd`".
  Baguette uses Xcode 26's **9-argument** form routed to digitizer target `0x32`, through
  `SimDeviceLegacyHIDClient`; streaming touches and edge gestures build real `IOHIDEvent`s and patch
  bytes the wrapper leaves uninitialised. No code inside the simulator, no
  `DYLD_INSERT_LIBRARIES` for input. (DOCUMENTED, `docs/ARCHITECTURE.md`)
- Frames come from `SimDevice.io`'s framebuffer callback as IOSurfaces, encoded by VideoToolbox
  H.264 or JPEG. (DOCUMENTED, ARCHITECTURE table)
- **Xcode 27's Device Hub** attaches its own HID daemon; the iOS 27 runtime then drops legacy input
  and every gesture acks `ok` while landing nowhere. `baguette boot` / `baguette heal` repair it by
  restarting backboardd and SpringBoard, which **kills running apps** (back in ~4 s); relaunching
  Device Hub breaks it again. (DOCUMENTED, `docs/features/device-hub`)
- Known limits: `key`/`type` US-ASCII only (use `paste`); no Siri; pinch needs two fingers.
  (DOCUMENTED, `docs/wire.md`)

So: **it is private-API work against two Xcode generations that each broke the previous tools**
(INFERRED). Expect another break with each Xcode major; Baguette has fixed each one quickly so far.

### 1.3 Two ways in: a server, or two pipes

- **`baguette serve`**: Hummingbird HTTP + WebSocket on `127.0.0.1:8421`. One WebSocket per stream,
  `/simulators/:udid/stream?format=mjpeg|avcc`, carries frames out and gestures in. (DOCUMENTED,
  `docs/serve.md`) It has **no token**: protection is the loopback bind, a `Host` check against DNS
  rebinding, and an `Origin` / `Sec-Fetch-Site` check against web pages (VERIFIED,
  `Server.isTrustedBrowserRequest`). So a web page cannot drive it, but **any local process on that
  Mac can** — including a task's own shell (INFERRED).
- **`baguette input --udid`**: newline-delimited JSON gestures on stdin, one ack per line on
  stdout; keep one alive per device because startup is ~1.2 s and HID warm-up ~40 ms.
  **`baguette stream --udid --format avcc|mjpeg --fps --scale`**: frames to stdout, retuned by JSON
  lines on stdin (`set_bitrate`, `set_fps`, `set_scale`, `force_idr`, `snapshot`). (DOCUMENTED,
  `docs/wire.md`, `docs/features/stream`)
- The AVCC framing: 4-byte length, a 1-byte tag (`0x01` avcC description, `0x02` keyframe,
  `0x03` delta, `0x04` a JPEG seed so a viewer paints before the first keyframe). It feeds
  WebCodecs' `VideoDecoder.configure` directly. (DOCUMENTED, stream doc)
- Encoder: VideoToolbox real-time, no B-frames, `MaxFrameDelayCount 0`, low-latency rate control,
  a keyframe every 5 s; defaults 60 fps, 8 Mbps, full scale. (VERIFIED, `H264Tuning.swift`,
  `StreamConfig.swift`) **An idle simulator still emits AVCC frames at `--fps`** (the last frame
  re-encoded) so a decoder never stalls; MJPEG skips unchanged frames. (DOCUMENTED)

### 1.4 The crash Lody patched

- Upstream v0.2.0 and v0.2.1 release binaries **abort ~30 s after a viewer connects**, at the
  WebSocket auto-ping's first `Task.sleep(for:)` in `swift-websocket` 1.5.0
  (`WebSocketHandler.swift:227`), with `freed pointer was not the last allocation` in
  `swift_task_dealloc`; the close handshake's sleep crashes the same way. Lody replaced the three
  `Task.sleep(for:)` calls with `ContinuousClock.sleep(until:)` and ships `0.2.1-lody.1`; patched, it
  ran 91–93 s with three pings and a clean exit on macOS 26.6.2 / Xcode 26.6. Lody notes this is
  "heartbeat/cleanup evidence, not a throughput or long-soak claim". (VERIFIED, Lody patch, note and
  manifest)
- Upstream's own view: "Earlier Xcode 26 Swift compilers have async stack-allocation bugs that
  crash `baguette serve`" (#85), so build with **Xcode 26.4.1 or later**. (DOCUMENTED,
  `CONTRIBUTING.md`) Lody saw it with Swift 6.3.3 as well and links Swift issue 86204. (VERIFIED,
  Lody note) Upstream v0.2.14 still pins `swift-websocket` 1.5.0 at the same revision `ca48d46`.
  (VERIFIED, `Package.resolved`) Whether v0.2.14's release binary still crashes is **not known**.
- **The crash is in the WebSocket server only.** `baguette input` and `baguette stream` don't use
  `swift-websocket` (VERIFIED: `import Hummingbird*` appears only under
  `Infrastructure/Server/` and in `WebSocketFrameSink.swift`; `InputCommand.swift` and
  `StreamCommand.swift` don't import it, and the auto-ping loop runs only inside a WebSocket
  connection). The library is still linked into the binary. Using the two pipes avoids the crash, the patched build, and Lody-style
  self-hosting of a binary. (INFERRED from the above)

### 1.5 macOS and Xcode support

- README badges: macOS 15+, Xcode 26; `Package.swift`: `.macOS(.v15)`; but `CONTRIBUTING.md` says
  the build "compiles for `arm64e-apple-macos26.0`". These disagree. (VERIFIED, both texts) Lody's
  checks were on macOS 26.6.2. (VERIFIED)
- **The author's Mac is macOS 15.7.9 with Xcode 26.3**, below upstream's 26.4.1 build floor and
  possibly below the binary's deployment target. (VERIFIED for the Mac; INFERRED for the effect)
  The first step of any slice is to measure a Homebrew binary here: does it launch, does a tap land
  on an iOS 26.x simulator, how many fps at what CPU.

---

## 2. Android options for Ducter's own phone

Ducter's phone is the Android emulator it installs (D217). Today: frames by `screencap -j` (about
80 ms, JPEG), ≤ 6/s, one in flight until acked, base64 inside a JSON `phone_frame` message; taps by
`adb shell input tap` / `input swipe` (a new shell per gesture). (VERIFIED, `live.ts`,
`device.ts`, `protocol/src/phone-use.ts`)

| | scrcpy server | Emulator gRPC `streamScreenshot` + `sendTouch` | Emulator WebRTC (`Rtc` service) | `adb screenrecord` |
|---|---|---|---|---|
| Frames | H.264 (or H.265/AV1) from `MediaCodec`, only when the surface changes, with `KEY_REPEAT_PREVIOUS_FRAME_AFTER` (DOCUMENTED, `develop.md`) | Raw RGB888/RGBA8888 or PNG per new frame; "can produce a significant amount of data", PNG "CPU-intensive"; MMAP for local use (DOCUMENTED, proto comments) | WebRTC media straight from the emulator, signalled over gRPC (DOCUMENTED, container-scripts README) | H.264 to a file or stdout, 3-minute limit per run (DOCUMENTED, Android docs from memory) |
| Input | Its own control socket, `InputManager.injectInputEvent` (hidden API): touch, keys, text, scroll, clipboard both ways (DOCUMENTED) | `sendTouch`, `sendMouse`, `sendKey`, `injectWheel`, `streamInputEvent` (DOCUMENTED, proto) | Through the same gRPC | none |
| Numbers | "30~120 fps, depending on the device", "35~70 ms" latency (DOCUMENTED, README) | not documented | not documented | not real time |
| License | Apache-2.0 (VERIFIED) | the emulator's own; Ducter already calls it (`setClipboard`, VERIFIED `clipboard.ts`) | Apache-2.0 samples (VERIFIED) | platform tool |
| Fits Ducter's path | H.264 over the home's WebSocket; works on a worker Mac via `phone_dev` (INFERRED) | Raw frames are too big to cross the home; would need re-encoding on the Mac (INFERRED) | Needs UDP from client to that Mac, bypassing the home, its pairing and Edge (INFERRED) | No |
| Also works for | the person's own Android phone (D238) and real devices (API 21+, DOCUMENTED) | emulator only | emulator only | — |

Notes:
- scrcpy's protocol "must be considered internal … may (and will) change"; a client must run the
  matching server version. Its server is a jar pushed with adb and run with `app_process`; a
  "standalone server" mode with `raw_stream=true` gives a bare H.264 stream on a socket.
  (DOCUMENTED, `develop.md`) Pinning one server version, like the SDK pins (D217 §2), handles this.
- The emulator gRPC's `sendTouch` is the cheap win **for input alone**: one unary call over the
  HTTP/2 connection Ducter already opens, instead of an `adb shell` per gesture. (INFERRED; not
  measured)

---

## 3. How it travels: home ↔ client

Ducter's live views go **client ↔ home WebSocket ↔ (worker socket) ↔ the computer with the
screen**, through the same pairing, the Edge/remote path (`research/67`) and the phone web client
in WKWebView. (VERIFIED for the phone, `design/phone-use.md` §7, §10)

- **Keep the home in the middle.** Lody's WebRTC exists because its viewer is on another network
  behind a Quick Tunnel (`research/78` §1). Ducter's clients already reach the home; WebRTC would
  add STUN/TURN and a second trust path that bypasses device pairing. H.264 over the existing
  WebSocket is enough (INFERRED).
- **Binary frames.** H.264 must not be base64 in JSON (+33 % and a JSON parse per frame). A binary
  WebSocket message `[kind][view id][seq][AVCC tag][payload]` is the change (INFERRED).
- **Bandwidth.** JPEG at 6 fps × ~50 KB ≈ 2.4 Mbit/s before base64. H.264 at 30 fps and
  1–2 Mbit/s is *cheaper* and five times smoother (INFERRED from Baguette's knobs, `set_bitrate`;
  measure). Baguette re-encodes an idle screen at `--fps`, so Ducter should **drop `--fps` to ~2 on
  idle** and back up on input, or use scrcpy's change-only frames on Android.
- **Back-pressure.** H.264 deltas can't be skipped: "AVCC WebSockets retain encoded reference frames
  in order and close … if a consumer exceeds the 32 MiB queue". (DOCUMENTED) Ducter's
  one-in-flight ack rule (D190) becomes: on a slow client, drop deltas until the next keyframe and
  ask for one (`force_idr`), keeping the queue bounded (INFERRED).
- **Decoding per client:**
  - web (browsers, the phone web client in the iOS and Android apps): WebCodecs `VideoDecoder`
    into a canvas. WebKit has shipped `VideoDecoder` since Safari 16.4 (DOCUMENTED, MDN compat from
    memory); in WKWebView on the iOS app it is INFERRED and must be checked on a device. Android
    WebView is Chromium (INFERRED supported). Keep the JPEG path as the fallback: Baguette's `0x04`
    seed and `--format mjpeg` already give it.
  - the Mac app (Go, `mygo` + purego): VideoToolbox decode, or `AVSampleBufferDisplayLayer`
    fed AVCC samples. New work (INFERRED).
- **A worker Mac** serves its own simulator and phone (D234, D220 §5): the runner there spawns
  `baguette stream` / `input` and relays bytes in new `wb` / `phone_dev` ops, as today's
  `sim_frame` does. (INFERRED)

---

## 4. Safety: who may tap

- **The person only, through a paired client.** Never a page, never a task by this path. Today's
  rules hold: a task drives Ducter's phone only through its `phone_*` tools and the gate (D217 §6);
  taking the screen is **接手 / 还给它** with the task blind meanwhile (D190).
- **Baguette's server would break this** on its own: any process on the Mac can POST
  `/simulators/<udid>/input` without a token (§1.3). Using **`baguette input` as a child process of
  Ducter's runner**, with stdin held only by Ducter, keeps the only route to the HID pipe inside
  Ducter (INFERRED). A task's own shell could still run `baguette` itself if installed on PATH, but
  that is no more than it can do today with `xcrun simctl` and Xcode; the simulator is the task's
  dev device, not the person's identity (INFERRED).
- **The simulator is not the gate's business** the way Ducter's phone is: it holds the app being
  built, not the person's accounts. So a tap on the simulator needs no Go; the consent is the
  install (Xcode's private frameworks, a third-party binary), shown once on the computer's card like
  the phone's sheet (D217 §3) (INFERRED; needs a Dn).
- Input checks at the home: coordinates in the view's points, clamped; gesture types from a fixed
  list; text only through `paste`; no `siri`, no `heal` from a client (heal kills apps) (INFERRED).

---

## 5. Recommendations

### 5.1 iOS Simulator: Baguette's two pipes, behind a consent sheet

**Recommendation:** adopt Baguette, but **not `baguette serve`**. Ducter's runner keeps one
`baguette input --udid` (gestures, paste) and one `baguette stream --udid --format avcc` per shown
simulator, relays frames as binary WebSocket messages through the home, and decodes with WebCodecs
on the web, JPEG fallback otherwise. *Tradeoff:* a fast-moving private-API dependency that each
Xcode major may break (Xcode 27's Device Hub already did once). *Alternative:* keep D220's
view-only `simctl` frames and add only Baguette's `stream` (faster frames, no taps), which removes
the input risk but leaves the todo open.

Minimal first slice:
1. Measure on the author's Mac (macOS 15.7.9, Xcode 26.3) and on a macOS 26 Mac: a Homebrew
   `baguette` launches, a tap lands, `stream --format avcc --fps 30` CPU and bitrate, latency
   tap→pixel. If it does not run on macOS 15 / Xcode 26.3, the slice is gated on macOS 26 and says
   so on the card.
2. A one-time install sheet on the computer's card (**让我能点模拟器 / Let me tap the simulator**:
   what it installs, Apache-2.0 by name, that it uses Xcode's own private parts and may stop working
   after an Xcode update), installing a pinned version by SHA-256 into `<dataDir>`, never PATH.
3. The D220 Phone page: taps, swipes, Home, the keyboard through `paste`; frames unchanged
   (`simctl` JPEG) in this slice so the input path ships alone.
4. Then frames: AVCC through the home with idle fps drop and keyframe-on-resume, web first.

### 5.2 Ducter's Android phone: emulator gRPC input now, scrcpy video next

**Recommendation:** (a) move taps and swipes from `adb shell input` to the emulator's gRPC
`sendTouch` / `sendKey` on the connection Ducter already opens for the clipboard; (b) then replace
`screencap -j` with a pinned **scrcpy server** (H.264, change-only frames) relayed the same way as
the simulator's AVCC, with D217's JPEG path kept as the fallback. One binary-frame protocol and one
decoder serve both screens. *Tradeoff:* scrcpy's protocol is internal and versioned with its server,
so the version is pinned and checked like the SDK. *Alternative:* the emulator's own WebRTC, which
gives video without a jar but bypasses the home (UDP to the Mac) and so is wrong for Edge and
pairing.

Minimal first slice: `sendTouch` for taps/swipes on the home and through a worker's `phone_dev`
(measure gesture latency before/after); no frame change yet.

### 5.3 Shared

- One **binary live-frame message** in `packages/protocol` for both screens (AVCC tags reused), plus
  a `keyframe` request and a quality hint (Lody's Saver / Balanced / Clear map to scale + bitrate).
- No frames out of sight, as today; idle fps low; JPEG fallback always available.

## Implications for Ducter

1. **Baguette is the only working way to tap an iOS 26 simulator from outside**, Apache-2.0 and
   very actively maintained, but built on Xcode private frameworks that iOS 26 and Xcode 27 each
   broke; plan for breakage per Xcode major.
2. **Lody's crash is avoidable rather than patchable**: it lives in `baguette serve`'s WebSocket
   library. Ducter should drive `baguette input` and `baguette stream` as child processes, which
   also removes the token-less localhost server that any process could tap through.
3. **Support is uncertain on the author's Mac** (macOS 15.7.9, Xcode 26.3 versus a 26.4.1 build
   floor and a macOS 26 target in the build notes): measure before deciding.
4. **The home stays in the middle**: H.264 over the existing WebSocket, as binary messages, with
   WebCodecs on the web and VideoToolbox on the Mac; no WebRTC.
5. **Android's quickest gain is input** (emulator gRPC `sendTouch` instead of an adb shell per
   tap); video next through a pinned scrcpy server (Apache-2.0, 35–70 ms documented).
6. **Who taps stays the person's**: tasks keep their gated tools; the simulator's consent is the
   install; a tap on Ducter's phone keeps D190's turns and D217's gate. Needs one Dn covering the
   simulator install, the binary frame path and the Android input change.

## Summary

Baguette (Apache-2.0, v0.2.14, 15 releases since September) taps iOS 26 simulators by loading
Xcode's private CoreSimulator/SimulatorKit and sending the new 9-argument Indigo HID messages; it
streams VideoToolbox H.264 (low-latency, default 60 fps/8 Mbps) or JPEG. Lody's crash is the
`swift-websocket` auto-ping `Task.sleep` abort ~30 s into a `baguette serve` connection, which
Lody patched; Ducter can sidestep it by using `baguette input` and `baguette stream` over pipes,
which also avoids a token-less localhost server. Xcode 27's Device Hub silently breaks input until
healed, and the author's macOS 15.7.9 / Xcode 26.3 may be below its floor, so step one is a
measurement. For Android, the emulator's gRPC `sendTouch` is an immediate input win, and a pinned
scrcpy server (H.264, 35–70 ms documented) the frame path; emulator WebRTC would bypass the home.
Both screens should share one binary H.264 frame message through the home, with JPEG fallback and
the person as the only one who taps.
