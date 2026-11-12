#!/bin/sh
# Archives the iPhone app (apps/ios), signs it for the App Store and uploads it to TestFlight,
# in one pass, with an App Store Connect API key. Run by release.yml; runs on a Mac too.
#
#   MARKETING_VERSION=0.2.0 BUILD_NUMBER=42.1 \
#   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_API_KEY_BASE64=…  (or ASC_KEY_PATH=…/AuthKey_….p8) \
#   scripts/ci/testflight.sh [IOS_DIR]
#
#   DUCTER_TESTFLIGHT_DRY_RUN=1   archive and ad-hoc sign, then stop: proves the Release build
#                                 compiles and its entitlements resolve, needs no key and touches
#                                 no Apple account.
#   DUCTER_TESTFLIGHT_PUBLIC=0    upload only: don't add it to "Public Beta" or submit it for review.
#
# Signing touches no certificate (D221). The archive is built unsigned and then ad-hoc signed
# ("-", no identity) with each bundle's entitlements resolved from the project, so it carries the
# push and keychain-group entitlements without a signing identity. The export is Xcode's automatic
# signing with the API key (-allowProvisioningUpdates plus -authenticationKey*): it re-signs with
# the team's cloud-managed Apple Distribution certificate and an App Store profile, and with
# destination=upload sends the build to App Store Connect, the path of Organizer's "Distribute App
# > TestFlight". No .p12 or .mobileprovision lives in secrets. Archiving with automatic signing
# instead would make a new Apple Development certificate on every throwaway runner, and Apple
# revokes the oldest when the account fills (the "null null" revocation mail). Cloud-managed
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

ARCHIVE="$WORK/$SCHEME.xcarchive"
APP="$ARCHIVE/Products/Applications/$SCHEME.app"

# Ad-hoc signs every bundle in the archive, innermost first, each with its target's entitlements
# file with $(VAR) references resolved from the build settings. Export re-signs them for the App
# Store and keeps these entitlements (aps-environment becomes "production" there).
adhoc_sign() {
  xcodebuild -showBuildSettings -project "$PROJECT" -alltargets -configuration Release \
    DEVELOPMENT_TEAM="$TEAM" 2>/dev/null >"$WORK/settings.txt"
  find "$APP" -depth \( -name '*.framework' -o -name '*.dylib' -o -name '*.appex' -o -name '*.app' \) |
  while IFS= read -r bundle; do
    name="$(basename "$bundle")"
    # This bundle's target: the settings block whose FULL_PRODUCT_NAME is the bundle's name.
    awk -v want="$name" '
      /^Build settings for / { if (hit) exit; blk = "" }
      { blk = blk $0 "\n" }
      /^ +FULL_PRODUCT_NAME = / { if ($3 == want) hit = 1 }
      END { if (hit) printf "%s", blk }' "$WORK/settings.txt" >"$WORK/target.txt"
    ent="$(sed -n 's/^ *CODE_SIGN_ENTITLEMENTS = //p' "$WORK/target.txt")"
    if [ -z "$ent" ]; then
      codesign --force --sign - --timestamp=none "$bundle"
      continue
    fi
    src="$(sed -n 's/^ *SRCROOT = //p' "$WORK/target.txt")"
    bid="$(sed -n 's/^ *PRODUCT_BUNDLE_IDENTIFIER = //p' "$WORK/target.txt")"
    out="$WORK/$name.entitlements"
    cp "$src/$ent" "$out"
    # $(AppIdentifierPrefix) and $(TeamIdentifierPrefix) come from the profile in a normal build.
    sed -i '' -e "s/\$(AppIdentifierPrefix)/$TEAM./g" -e "s/\$(TeamIdentifierPrefix)/$TEAM./g" "$out"
    for var in $(grep -o '\$([A-Za-z0-9_]*)' "$out" | sort -u | tr -d '$()'); do
      val="$(sed -n "s/^ *$var = //p" "$WORK/target.txt" | head -n 1)"
      [ -n "$val" ] || { echo "entitlements of $name: \$($var) has no value" >&2; exit 1; }
      sed -i '' "s|\$($var)|$val|g" "$out"
    done
    /usr/libexec/PlistBuddy -c "Add :application-identifier string $TEAM.$bid" \
      -c "Add :com.apple.developer.team-identifier string $TEAM" "$out" >/dev/null
    codesign --force --sign - --timestamp=none --generate-entitlement-der --entitlements "$out" "$bundle"
  done
  codesign --verify --deep --strict "$APP"
  codesign -d --entitlements - --xml "$APP" 2>/dev/null | plutil -p - | grep -q aps-environment ||
    { echo "the ad-hoc signed app lost its entitlements" >&2; exit 1; }
}

echo "archiving $SCHEME $MARKETING_VERSION ($BUILD_NUMBER), unsigned"
xcodebuild archive "$@" CODE_SIGNING_ALLOWED=NO -quiet
adhoc_sign
echo "ad-hoc signed with entitlements; no certificate used"

if [ "$DRY" = 1 ]; then
  /usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' -c 'Print CFBundleShortVersionString' \
    -c 'Print CFBundleVersion' "$APP/Info.plist"
  echo "dry run OK: nothing signed for distribution, nothing uploaded"
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
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/export" $AUTH

echo "uploaded $SCHEME $MARKETING_VERSION ($BUILD_NUMBER). App Store Connect processes it for"
echo "TestFlight in about 5-15 minutes; internal testers get it as soon as it is processed."

# The public beta: once processed, into the external group "Public Beta" and submitted for Beta
# App Review (scripts/ci/testflight-beta.ts). A problem there is a warning, never a failed release.
if [ "${DUCTER_TESTFLIGHT_PUBLIC:-1}" = 1 ]; then
  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' \
    "$APP/Info.plist" 2>/dev/null || true)"
  if command -v bun >/dev/null 2>&1 && [ -n "$BUNDLE_ID" ]; then
    ASC_KEY_PATH="$KEY" bun "$ROOT/scripts/ci/testflight-beta.ts" "$BUNDLE_ID" "$MARKETING_VERSION" "$BUILD_NUMBER" || true
  else
    echo "::warning::TestFlight Public Beta: no bun or no bundle id; add the build to Public Beta by hand."
  fi
fi
