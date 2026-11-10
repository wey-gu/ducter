#!/bin/sh
# Archives the iPhone app (apps/ios), signs it for the App Store and uploads it to TestFlight,
# in one pass, with an App Store Connect API key. Run by release.yml; runs on a Mac too.
#
#   MARKETING_VERSION=0.2.0 BUILD_NUMBER=42.1 \
#   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_API_KEY_BASE64=…  (or ASC_KEY_PATH=…/AuthKey_….p8) \
#   scripts/ci/testflight.sh [IOS_DIR]
#
#   DUCTER_TESTFLIGHT_DRY_RUN=1   archive unsigned and stop: proves the Release build compiles,
#                                 needs no key and touches no Apple account.
#   DUCTER_TESTFLIGHT_PUBLIC=0    upload only: don't add it to "Public Beta" or submit it for review.
#
# Signing is Xcode's automatic signing with the API key (-allowProvisioningUpdates plus
# -authenticationKey*): Xcode registers the App ID and its Push capability if needed, makes a
# cloud-managed Apple Distribution certificate and an App Store profile, and the export with
# destination=upload sends the build to App Store Connect, the same path as Organizer's
# "Distribute App > TestFlight". No .p12 or .mobileprovision lives in secrets. Cloud-managed
# certificates need the key's role to be Admin (design/release/README.md).
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS="${1:-$ROOT/apps/ios}"
IOS="$(cd "$IOS" && pwd)"
TEAM="${APPLE_TEAM_ID:-JMU55RJW2K}"
SCHEME="${IOS_SCHEME:-Ducter}"
MARKETING_VERSION="${MARKETING_VERSION:?MARKETING_VERSION (e.g. 0.2.0) is required}"
BUILD_NUMBER="${BUILD_NUMBER:?BUILD_NUMBER (e.g. 42 or 42.1) is required}"
DRY="${DUCTER_TESTFLIGHT_DRY_RUN:-0}"
WORK="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ducter-ios.$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

case "$MARKETING_VERSION" in
  *[!0-9.]*|"") echo "MARKETING_VERSION must be digits and dots (got $MARKETING_VERSION)" >&2; exit 1 ;;
esac

# The project is generated from project.yml (xcodegen) unless it is committed.
if [ ! -d "$IOS/$SCHEME.xcodeproj" ]; then
  command -v xcodegen >/dev/null 2>&1 || brew install xcodegen
  (cd "$IOS" && xcodegen generate --quiet)
fi
PROJECT="$IOS/$SCHEME.xcodeproj"

# D176: iPhone Duo shows an app full-screen only when it is built with the iOS 27.1 SDK or later
# (older SDKs run letterboxed there). DUCTER_XCODE=27.1 picks /Applications/Xcode_27.1.app when
# the runner has it; a DEVELOPER_DIR set by the caller wins; otherwise the runner's default.
if [ -z "${DEVELOPER_DIR:-}" ] && [ -n "${DUCTER_XCODE:-}" ]; then
  if [ -d "/Applications/Xcode_$DUCTER_XCODE.app" ]; then
    export DEVELOPER_DIR="/Applications/Xcode_$DUCTER_XCODE.app/Contents/Developer"
  else
    echo "::warning::Xcode $DUCTER_XCODE isn't on this runner; building with the default Xcode."
  fi
fi
xcodebuild -version
SDK="$(xcrun --sdk iphoneos --show-sdk-version 2>/dev/null || echo 0)"
case "$SDK" in
  2[0-6].*|27.0*) echo "::warning::iOS SDK $SDK: iPhone Duo will show the app letterboxed until it is built with the iOS 27.1 SDK or later (design/release/ios.md)." ;;
esac

set -- -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$WORK/$SCHEME.xcarchive" \
  MARKETING_VERSION="$MARKETING_VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  DEVELOPMENT_TEAM="$TEAM"

if [ "$DRY" = 1 ]; then
  echo "dry run: unsigned archive of $SCHEME $MARKETING_VERSION ($BUILD_NUMBER)"
  xcodebuild archive "$@" CODE_SIGNING_ALLOWED=NO -quiet
  plist="$WORK/$SCHEME.xcarchive/Products/Applications/$SCHEME.app/Info.plist"
  /usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' -c 'Print CFBundleShortVersionString' \
    -c 'Print CFBundleVersion' "$plist"
  echo "dry run OK: nothing signed, nothing uploaded"
  exit 0
fi

: "${ASC_KEY_ID:?ASC_KEY_ID is required}" "${ASC_ISSUER_ID:?ASC_ISSUER_ID is required}"
KEY="${ASC_KEY_PATH:-}"
if [ -z "$KEY" ]; then
  : "${ASC_API_KEY_BASE64:?ASC_API_KEY_BASE64 or ASC_KEY_PATH is required}"
  KEY="$WORK/AuthKey_$ASC_KEY_ID.p8"
  (umask 077; printf '%s' "$ASC_API_KEY_BASE64" | base64 --decode >"$KEY")
fi
grep -q 'BEGIN PRIVATE KEY' "$KEY" || { echo "the App Store Connect key is not a .p8 private key" >&2; exit 1; }
AUTH="-allowProvisioningUpdates -authenticationKeyPath $KEY -authenticationKeyID $ASC_KEY_ID -authenticationKeyIssuerID $ASC_ISSUER_ID"

# Each run's automatic signing makes a Development certificate the throwaway runner then loses;
# clear the ones past runs left before the account fills up (scripts/ci/prune-dev-certs.ts).
ASC_KEY_PATH="$KEY" bun "$ROOT/scripts/ci/prune-dev-certs.ts" || true

echo "archiving $SCHEME $MARKETING_VERSION ($BUILD_NUMBER)"
# shellcheck disable=SC2086
xcodebuild archive "$@" CODE_SIGN_STYLE=Automatic $AUTH -quiet

cat >"$WORK/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>upload</string>
	<key>teamID</key>
	<string>$TEAM</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
	<key>uploadSymbols</key>
	<true/>
</dict>
</plist>
EOF

echo "signing for the App Store and uploading to App Store Connect"
# shellcheck disable=SC2086
xcodebuild -exportArchive -archivePath "$WORK/$SCHEME.xcarchive" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/export" $AUTH

echo "uploaded $SCHEME $MARKETING_VERSION ($BUILD_NUMBER). App Store Connect processes it for"
echo "TestFlight in about 5-15 minutes; internal testers get it as soon as it is processed."

# The public beta: once processed, into the external group "Public Beta" and submitted for Beta
# App Review (scripts/ci/testflight-beta.ts). A problem there is a warning, never a failed release.
if [ "${DUCTER_TESTFLIGHT_PUBLIC:-1}" = 1 ]; then
  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' \
    "$WORK/$SCHEME.xcarchive/Products/Applications/$SCHEME.app/Info.plist" 2>/dev/null || true)"
  if command -v bun >/dev/null 2>&1 && [ -n "$BUNDLE_ID" ]; then
    ASC_KEY_PATH="$KEY" bun "$ROOT/scripts/ci/testflight-beta.ts" "$BUNDLE_ID" "$MARKETING_VERSION" "$BUILD_NUMBER" || true
  else
    echo "::warning::TestFlight Public Beta: no bun or no bundle id; add the build to Public Beta by hand."
  fi
fi
