# 32 · A native phone app: MyGo, a shell around the web client, or Expo

Question (2026-11-09): can Ducter have a real phone app now, one you install and that does push
properly, while sharing as much as possible with the desktop (MyGo, Go) and the phone web
client (`apps/web`, Preact)? Inputs: D20 (MyGo native UI), the roadmap ("native mobile via
Expo later"), and open question 1.3 (Preact for phone web).

## (a) MyGo on phones

Source read: `github.com/egoist/mygo@v0.8.3` in the Go module cache (the version
`apps/desktop` pins).

- **No iOS or Android target.** VERIFIED. The backends are `backend_darwin.go` →
  `internal/darwin` (AppKit: `NSApplication`, `NSApplicationDelegate`), plus `linux`, `windows`,
  `js`, and `backend_other.go` → `internal/unsupported`. `GOOS=ios` satisfies the `darwin`
  build tag, but it would load AppKit classes that don't exist on iOS. Nothing in the README,
  the docs or the examples mentions iOS, Android, gomobile or UIKit.
- **Browsers via WebAssembly.** VERIFIED (`docs/architecture.md` "Browsers (internal/web)",
  `internal/web/surface.go`). Native UI is compiled with `GOOS=js GOARCH=wasm` and drawn on a
  WebGL 2 canvas. It handles touch, and it uses a hidden textarea so the iOS keyboard and input
  methods work, with a comment about iOS's synthetic mouse events. So MyGo's native UI *could*
  run inside a WKWebView on a phone. But it's a desktop toolkit on a canvas. You get no iOS text
  selection, no native scrolling physics or accessibility tree, and no push, notifications or
  safe-area APIs for a phone (the browser backend "reports errUnsupported or does nothing" for
  desktop APIs). INFERRED: it would feel less native than the Preact client, which uses real DOM
  text, scrolling and inputs.
- Verdict: not today. Watch for a UIKit backend upstream (trigger in `docs/todo.md`).

## (b) A native shell around `apps/web`

- **Web Push on iOS works only from a Home Screen web app** (16.4+, research 21). It shows no
  action buttons: tap only (D52 Q11). It's also unreliable after the PWA is evicted. A native app
  gets **APNs**: delivery while the app is killed, **actionable notifications** (Go, Hold, and
  Reply typed into the notification itself), Face ID before acting on a locked phone, a real
  Home Screen icon, and haptics. VERIFIED in this branch, in the simulator: real APNs
  registration returned a sandbox device token. The main stored it. `xcrun simctl push` with
  the exact payload core builds showed the banner with the clay icon. A tap opened the decision
  sheet.
- **Capacitor vs a small Swift shell.** Capacitor brings an npm toolchain, a CLI, its own
  project layout and plugins (push via Firebase or its own APNs plugin) for what is about 790
  lines of Swift here (incl. the connect screen and theme): WKWebView, a bridge with a reply (`WKScriptMessageHandlerWithReply`),
  `UNUserNotificationCenter`, Keychain and a QR scanner (`DataScannerViewController`). We chose
  the plain Swift shell: no dependencies, it builds with `xcodebuild`, and XcodeGen keeps the
  project small (DOCUMENTED: Capacitor docs; INFERRED: effort).
- **Reuse: 100% of the product UI.** The page *is* `apps/web`, served by the main. An app update
  isn't needed for UI changes, because the page updates with the main. What the app adds goes
  through `apps/web/src/native.ts` (no-ops in a browser).
- **Server side:** `packages/core/src/apns.ts`: an ES256 provider token from a `.p8`, HTTP/2 via
  `node:http2` (VERIFIED against `api.sandbox.push.apple.com`: 403 `InvalidProviderToken` for a
  fake token, so the transport works under Bun 1.3). Subscriptions are `apns:<token>` next to
  the Web Push ones, under the same policy (hold, coalescing, quiet hours).
- **Pitfalls found** (VERIFIED):
  - `NSAllowsArbitraryLoads` is ignored when `NSAllowsLocalNetworking` sits next to it, and
    http to a LAN address then fails with -1022. Use the one key alone.
  - Handing SwiftUI the WKWebView itself as the representable's view let a torn-down host
    detach it.
  - The web client subscribed to changes in `useEffect`. A fast local socket delivered welcome
    and the replay before the effect ran, which left the screen on "正在连上…" for good, in the
    app and in principle in any fast browser. Fixed in `main.tsx` by catching up once after
    subscribing.
- **Feel.** Edge swipe-back works through the page's own history entries. There is no white
  flash: the loading screen shows the clay character on Pebble. Taps get haptics. The Pebble
  tokens are the same in SwiftUI. The keyboard and safe areas come from the page
  (`viewport-fit=cover`, `interactive-widget`).

## (c) Expo / React Native from scratch

- It shares nothing with Preact or Go, so every screen is rebuilt (conversation, decisions,
  手头, task, sheets, i18n) and kept in step with the web forever. Push would go through
  Expo's push service (a third party in the path) or a custom APNs/FCM setup anyway. You'd get
  a better native feel in lists and gestures, but not today (INFERRED: weeks).
- Android: the same shell pattern works (an Android WebView, plus FCM), when there's demand.

## Rubric

| | Feels native | Push on iOS | Installable today | Reuse | Risk |
|---|---|---|---|---|---|
| MyGo (wasm in a WebView) | low (canvas) | no API | no | Go UI code, desktop-shaped | high |
| **Swift shell + apps/web** | good (real DOM, native chrome, haptics, actionable push) | **APNs, Go/Hold/Reply** | **yes** (sim now, device after one signing click) | **all of the phone UI** | low |
| Capacitor + apps/web | same | plugin | yes | same | npm toolchain |
| Expo / RN | best lists and gestures | yes (Expo or custom) | no | none | high, slow |

## Push for other people's Ducters

APNs accepts a push only from a key in the team that signs the app. A TestFlight or App Store
build signed by Nowledge Labs can therefore be notified only by mains that hold a Nowledge APNs
key. That's fine for the author. For everyone else there are two ways: build the app under your
own team (`Local.xcconfig`, plus your own key), or a small relay run by Nowledge that holds the
key and forwards pushes, with end-to-end encrypted payloads. That would be a new
trusted component, so it goes through the change loop first (open question; not decided).

## Implications for Ducter

- Recommend the Swift shell (`apps/ios`) as the phone app, with `apps/web` as its UI: it's the
  Expo line in the roadmap, done without Expo. D20 still holds for the desktop. Open question
  1.3 (Preact for phone web) is confirmed: the same Preact client is now also the app's UI.
- New user-facing words are the app's connect screen and "Apple push key" (`notify.app.nokey`).
  These need glossary rows.
- Next: the signing click or App ID (`docs/release-ios.md`), TestFlight via CI, and the push
  relay question for non-author users.

## Summary

MyGo has no phone backend (AppKit only; its wasm target draws a desktop toolkit on a canvas).
Expo would rebuild everything. A ~790-line Swift shell around the existing phone client gives
APNs with Go/Hold/Reply on the notification, a real icon, haptics and 100% UI reuse. It runs in
the simulator against a real main, and it needs one App ID with Push to go on a phone or
TestFlight.
