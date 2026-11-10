# Releasing the iPhone app (TestFlight)

Facts for CI (`.github/workflows/release.yml`) and for the one-time setup in the Apple
account. The app is `apps/ios`: a native shell (SwiftUI + WKWebView) around the phone client
that the main serves at `/app`, plus APNs notifications through the notification relay (D159,
`design/release/push-relay.md`). Why this shape: `research/32-mobile-app.md`.

## The project

| What | Value |
|---|---|
| Project | `apps/ios/Ducter.xcodeproj` (committed; generated from `apps/ios/project.yml` by `xcodegen`, so CI needs no generator) |
| Scheme | `Ducter` (shared: `Ducter.xcodeproj/xcshareddata/xcschemes/Ducter.xcscheme`) |
| Configurations | `Debug` (simulator, APNs sandbox), `Release` (archive, APNs production) |
| Bundle id | `co.nowledge.ducter.ios` (`DUCTER_BUNDLE_ID` in `apps/ios/Config.xcconfig`); the extension `DucterNotify` is `co.nowledge.ducter.ios.notify` (D159) |
| Team | `JMU55RJW2K` (Nowledge Labs, LLC; `DEVELOPMENT_TEAM` in `Config.xcconfig`) |
| Signing | Automatic (`CODE_SIGN_STYLE = Automatic`) |
| Entitlements | `apps/ios/Ducter/Ducter.entitlements`: `aps-environment = development` (distribution signing rewrites it to `production`) and `keychain-access-groups` `$(AppIdentifierPrefix)$(DUCTER_BUNDLE_ID).shared`; `DucterNotify/DucterNotify.entitlements`: the same keychain group |
| Capabilities the App IDs need | The app: Push Notifications. The extension: none. Keychain sharing within the team needs no capability; no app groups, no iCloud, no associated domains |
| Version | `MARKETING_VERSION` (default `0.1.0`), build `CURRENT_PROJECT_VERSION` (default `1`); override both on the command line |
| Deployment target | iOS 17.0, universal (D176): iPhone in portrait and landscape, iPad in all four orientations with Split View, Slide Over and Stage Manager (`UIRequiresFullScreen` false, one scene); the extension too |
| Icons | The one `AppIcon` 1024 source; Xcode makes every iPhone and iPad size (`AppIcon76x76` for iPad) |
| SDK | Xcode 26 builds and uploads. iPhone Duo shows the app full-screen only from the iOS 27.1 SDK (research/49): CI sets `DUCTER_XCODE=27.1` and `testflight.sh` uses `/Applications/Xcode_27.1.app` when the runner has it, else the default Xcode with a warning |
| Export options | `apps/ios/ExportOptions.plist` (`app-store-connect`, automatic signing, `destination = export`) |
| Encryption | `ITSAppUsesNonExemptEncryption = NO` in Info.plist (no export-compliance question per build). D159's notification encryption uses only CryptoKit, encryption within the Apple OS, which Apple lists as exempt (INFERRED from Apple's export-compliance guidance; confirm if App Store review asks) |
| Local overrides | `apps/ios/Local.xcconfig` (gitignored) for another team or bundle id |

Verified on this Mac (Xcode 26.3): `Debug` builds and runs in the iOS 26.3 simulator. An unsigned
`Release` archive works from the command line, with `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` set by command-line overrides. A signed archive was **not** run:
the App ID doesn't exist yet (see below).

Universal (D176), verified on this Mac (2026-11-10): Debug builds for iPad Pro 13-inch (M5) and
iPhone 17 Pro Max simulators; the built app and its extension list `UIDeviceFamily` 1 and 2, and
the asset catalog has the iPad icon; the unsigned Release archive (`DUCTER_TESTFLIGHT_DRY_RUN=1
scripts/ci/testflight.sh`) succeeds. Screens in `.shots/ipad/` (the app in iPad Pro 13", iPad mini
and iPhone 17 Pro Max simulators; the page at 18 widths from 320 to 1366 in headless Chromium).
Not verified here: an iPhone Duo simulator and a 27.1 SDK build (Xcode 27.1), the native window in
Split View or Stage Manager (simctl can't size it), and a signed universal upload.

**App Store Connect and iPad.** TestFlight needs nothing new: a universal build installs on iPads
for every tester, internal or public. Only **App Store review** (a public release) needs iPad
screenshots: 13-inch iPad, 2064 × 2752 or 2048 × 2732, in App Store Connect › the app ›
the version › iPad (`.shots/ipad/sim/ipadpro13-*` are the right size). iPhone Duo screenshots are
optional; they add a "Made for iPhone Duo" badge. Once a version with iPad support is on the
App Store, the app can't drop iPad again.

## CI commands

```sh
cd apps/ios
xcodebuild -project Ducter.xcodeproj -scheme Ducter -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$RUNNER_TEMP/Ducter.xcarchive" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_P8" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive

xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/Ducter.xcarchive" \
  -exportOptionsPlist ExportOptions.plist -exportPath "$RUNNER_TEMP/export" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_P8" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID"

xcrun altool --upload-app -f "$RUNNER_TEMP/export/Ducter.ipa" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"   # reads AuthKey_<id>.p8 from ~/.appstoreconnect/private_keys
```

- `CURRENT_PROJECT_VERSION` must go up on every upload (TestFlight refuses a repeated build
  number for one version). Use the run number, or a timestamp.
- With an App Store Connect API key (role **App Manager** or **Admin**), `-allowProvisioningUpdates`
  lets Xcode create the distribution certificate and the App Store profile on the runner. That
  needs the App ID (below) to exist first.
- Alternative to `altool`: set `destination` to `upload` in `ExportOptions.plist`, and the export step uploads.
- The runner needs Xcode 26 or newer (the project was made with 26.3).

## One-time setup in the Apple account (the author does this; nothing was created)

1. **App ID.** developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → +
   → App IDs → App. Set Description to `Ducter iOS`, Bundle ID (Explicit) to `co.nowledge.ducter.ios`, and turn on
   the **Push Notifications** capability.
2. **App record.** App Store Connect → Apps → + → New App. Platform iOS, name `Ducter` (or
   `Ducter – Personal AI` if the name is taken), language English or Simplified Chinese, bundle id
   `co.nowledge.ducter.ios`, SKU `ducter-ios`.
3. **API key for CI.** App Store Connect → Users and Access → Integrations → App Store Connect
   API → Team Keys → +, role App Manager. Put the `.p8`, the Key ID and the Issuer ID into GitHub
   secrets (`ASC_KEY_P8`, `ASC_KEY_ID`, `ASC_ISSUER_ID`).
4. **APNs key.** For the public app this key goes to the notification relay, not to anyone's
   Ducter: `design/release/push-relay.md` (D159). A home needs a key of its own only when the app
   is built under another team (self-deployers, below). Certificates, Identifiers & Profiles → Keys →
   + → Apple Push Notifications service (APNs), environment *Sandbox & Production*. Download
   `AuthKey_<KEYID>.p8` once. For a home of your own, put it in the data dir and write
   `~/.ducter/apns.json`:
   ```json
   {"keyId": "<KEYID>", "teamId": "JMU55RJW2K", "keyFile": "AuthKey_<KEYID>.p8"}
   ```
   Or set `DUCTER_APNS_KEY_ID`, `DUCTER_APNS_TEAM_ID` and `DUCTER_APNS_KEY_FILE`. A home with a
   key sends straight to Apple (encrypted for the phone all the same) and uses the relay only if
   Apple refuses that key.
   **Self-deployers:** APNs only accepts pushes for an app signed by the key's team. Someone
   who builds the app under their own team uses their own bundle id (`Local.xcconfig`), their own
   APNs key on the home, and `DUCTER_PUSH_RELAY = ` (empty) in `Local.xcconfig` so the app doesn't
   register with Nowledge's relay. People who install the TestFlight build need nothing: their
   home sends through the relay.
5. **TestFlight testers.** App Store Connect → the app → TestFlight → Internal Testing → add
   yourself. Internal builds need no review.
6. **Public beta.** An external group named **Public Beta** with a public link
   (https://testflight.apple.com/join/Z4GvWt7t; first build submitted 2026-11-10). After each
   upload `scripts/ci/testflight.sh` runs `scripts/ci/testflight-beta.ts`: it waits (up to 20
   minutes, `TESTFLIGHT_WAIT_MINUTES`) for the build's `processingState` to be `VALID`, adds it to
   that group and submits it for Beta App Review through the App Store Connect API with the same
   key. A missing group, a refused submission or a timeout is a `::warning::`, never a failed
   release; then add the build in App Store Connect › TestFlight by hand.
   `DUCTER_TESTFLIGHT_PUBLIC=0` uploads only. The key needs App Manager or Admin.

## Putting it on a phone before TestFlight

Xcode with the author's Apple ID signed in: open `apps/ios/Ducter.xcodeproj`, select the
connected iPhone, press Run. Automatic signing then **creates** the explicit App ID
`co.nowledge.ducter.ios` (with Push) and a development profile, and it may issue a new
Apple Development certificate. The only development profile on this Mac
(`iOS Team Provisioning Profile: *`) is tied to a revoked certificate, and a wildcard ID can't
carry push anyway. That click is the author's to make.

## Simulator (no signing, no account)

```sh
cd apps/ios && xcodegen generate   # only after editing project.yml
xcodebuild -project Ducter.xcodeproj -scheme Ducter -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build CODE_SIGN_IDENTITY=- build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Ducter.app
xcrun simctl launch booted co.nowledge.ducter.ios -pairLink 'http://<lan-ip>:7777/pair#c=<CODE>'
xcrun simctl push booted co.nowledge.ducter.ios payload.apns   # category DUCTER_DECISION shows Go/Hold/Reply
```

`-pairLink`, `-open 'app#onhand'` and `-orientation landscape` are Debug-only launch arguments.
So is `-appVersion 0.0.99` (D200): a Debug build says project.yml's placeholder version, so it
never says its home is older unless given one; `apps/ios/scripts/check-home-version.sh` checks the
rule itself against the Android app's cases.
`-orientation` turns an iPhone; an iPad, which supports multitasking, refuses to be turned by the
app, so iPad landscape is checked at its widths in a browser. For an iPad, use
`-destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)'`; with a hardware keyboard the
iPad's menu bar and ⌘-hold list show New task (⌘N), the places (⌘1–⌘4), Settings (⌘,) and
Talk to {name} (⌘K).
