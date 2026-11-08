# Releasing the iPhone app (TestFlight)

Facts for CI (`.github/workflows/release.yml`) and for the one-time setup in the Apple
account. The app is `apps/ios`: a native shell (SwiftUI + WKWebView) around the phone client
that the main serves at `/app`, plus APNs notifications. Why this shape: `research/32-mobile-app.md`.

## The project

| What | Value |
|---|---|
| Project | `apps/ios/Ducter.xcodeproj` (committed; generated from `apps/ios/project.yml` by `xcodegen`, so CI needs no generator) |
| Scheme | `Ducter` (shared: `Ducter.xcodeproj/xcshareddata/xcschemes/Ducter.xcscheme`) |
| Configurations | `Debug` (simulator, APNs sandbox), `Release` (archive, APNs production) |
| Bundle id | `co.nowledge.ducter.ios` (`DUCTER_BUNDLE_ID` in `apps/ios/Config.xcconfig`) |
| Team | `JMU55RJW2K` (Nowledge Labs, LLC; `DEVELOPMENT_TEAM` in `Config.xcconfig`) |
| Signing | Automatic (`CODE_SIGN_STYLE = Automatic`) |
| Entitlements | `apps/ios/Ducter/Ducter.entitlements`: `aps-environment = development`; distribution signing rewrites it to `production` |
| Capabilities the App ID needs | Push Notifications. Nothing else (no app groups, no iCloud, no associated domains) |
| Version | `MARKETING_VERSION` (default `0.1.0`), build `CURRENT_PROJECT_VERSION` (default `1`); override both on the command line |
| Deployment target | iOS 17.0, iPhone only, portrait |
| Export options | `apps/ios/ExportOptions.plist` (`app-store-connect`, automatic signing, `destination = export`) |
| Encryption | `ITSAppUsesNonExemptEncryption = NO` in Info.plist (no export-compliance question per build) |
| Local overrides | `apps/ios/Local.xcconfig` (gitignored) for another team or bundle id |

Verified on this Mac (Xcode 26.3): `Debug` builds and runs in the iOS 26.3 simulator. An unsigned
`Release` archive works from the command line, with `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` set by command-line overrides. A signed archive was **not** run:
the App ID doesn't exist yet (see below).

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
4. **APNs key (for the Ducter main, not for CI).** Certificates, Identifiers & Profiles → Keys →
   + → Apple Push Notifications service (APNs), environment *Sandbox & Production*. Download
   `AuthKey_<KEYID>.p8` once. On the computer Ducter lives on, put it in the data dir and write
   `~/.ducter/apns.json`:
   ```json
   {"keyId": "<KEYID>", "teamId": "JMU55RJW2K", "keyFile": "AuthKey_<KEYID>.p8"}
   ```
   Or set `DUCTER_APNS_KEY_ID`, `DUCTER_APNS_TEAM_ID` and `DUCTER_APNS_KEY_FILE`. Without the key, the app works but
   says the main can't notify it yet.
   **Self-deployers:** APNs only accepts pushes for an app signed by the key's team. Someone
   who builds the app under their own team uses their own bundle id (`Local.xcconfig`) and
   their own APNs key. People who install the TestFlight build need the Nowledge key on their main. That
   is a known limit (see research/32, "Push for other people's Ducters").
5. **TestFlight testers.** App Store Connect → the app → TestFlight → Internal Testing → add
   yourself. Internal builds need no review.

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

`-pairLink` and `-open 'app#onhand'` are Debug-only launch arguments.
