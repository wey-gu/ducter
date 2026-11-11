#!/bin/sh
# Builds Ducter.app and a disk image to hand to a friend (macOS only).
#
#   scripts/make-app.sh             # dist/Ducter.app and dist/Ducter-<version>-<arch>.dmg
#   scripts/make-app.sh OUTDIR
#
# Needs Bun and Go on this Mac; the friend needs neither. Nothing outside OUTDIR changes.
#
# Signing:
#   - With a Developer ID Application identity (DUCTER_SIGN_IDENTITY, a name or SHA-1; by
#     default the "Developer ID Application: Nowledge Labs, LLC" one in the keychain, if any),
#     every Mach-O is signed inside out with the hardened runtime and a secure timestamp, the
#     app is notarized and stapled, and so is the disk image. The friend just opens it.
#   - Notarization credentials, the first set that is complete wins:
#       DUCTER_NOTARY_PROFILE                          a `notarytool store-credentials` profile
#       APPLE_NOTARY_KEY_ID + APPLE_NOTARY_ISSUER_ID + APPLE_NOTARY_KEY_PATH   (an App Store Connect API key;
#         APPLE_API_KEY + APPLE_API_ISSUER also work, key from ~/.appstoreconnect/private_keys)
#       APPLE_ID + APPLE_PASSWORD (or APPLE_APP_SPECIFIC_PASSWORD) + APPLE_TEAM_ID  (an Apple ID with an
#         app-specific password, e.g. sourced from a private env file first)
#     Signed but none of these: the build is signed, not notarized, and says so.
#     DUCTER_REQUIRE_NOTARIZATION=1 makes that an error.
#   - No identity (or DUCTER_SIGN_IDENTITY=-): signed ad hoc (codesign -s -), and the friend
#     needs the Open Anyway steps in design/build-and-run.md, "Give Ducter to a friend".
#
# Inside the app:
#   Contents/MacOS/Ducter          the desktop app (apps/desktop)
#   Contents/Helpers/ducter        the ducter CLI (packages/cli), which the app runs as
#                                  `ducter up --no-desktop` (a LaunchAgent; see design/build-and-run.md "The app")
#   Contents/Resources/AppIcon.icns
#
# For a local updater test only (design/release/README.md, "Testing an update"):
#   DUCTER_BUNDLE_ID   another bundle id (its LaunchAgent, dev.env and updates are its own)
#   DUCTER_VERSION     the app's version instead of packages/cli/package.json's
set -eu

[ "$(uname)" = Darwin ] || { echo "make-app.sh builds a macOS app; run it on a Mac." >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

NAME=Ducter
# Reverse DNS of nowledge.co, like co.nowledge.con and co.nowledge.mem.desktop.
ID="${DUCTER_BUNDLE_ID:-co.nowledge.ducter}"
VERSION="${DUCTER_VERSION:-$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$ROOT/packages/cli/package.json" | head -1)}"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
ARCH="$(uname -m)"
MIN_MACOS=12.0

# Separate folders: on a case-insensitive disk "ducter" and "Ducter" are one file.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ducter-app.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "1/5 ducter (the CLI)"
command -v bun >/dev/null 2>&1 || { echo "Bun is needed: curl -fsSL https://bun.sh/install | bash" >&2; exit 1; }
(cd "$ROOT" && { bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null; })
sh "$ROOT/packages/cli/build.sh" "$WORK/cli/ducter"

say "2/5 the desktop app"
command -v go >/dev/null 2>&1 || { echo "Go is needed: brew install go" >&2; exit 1; }
(cd "$ROOT/apps/desktop" && go build -trimpath \
  -ldflags "-s -w -X github.com/egoist/mygo.production=1 -X main.version=$VERSION -X main.commit=$COMMIT" \
  -o "$WORK/app/$NAME" .)

say "3/5 the icon"
(cd "$ROOT/apps/desktop" && go run ./cmd/appicon -in "$ROOT/design/art/assets/alpha/ducter_idle.png" -out "$WORK/icon-1024.png")
SET="$WORK/AppIcon.iconset"
mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$WORK/icon-1024.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" "$WORK/icon-1024.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$WORK/AppIcon.icns"
cp "$WORK/icon-1024.png" "$OUT/AppIcon-1024.png"

say "4/5 $NAME.app"
APP="$OUT/$NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Helpers" "$APP/Contents/Resources"
cp "$WORK/app/$NAME" "$APP/Contents/MacOS/$NAME"
cp "$WORK/cli/ducter" "$APP/Contents/Helpers/ducter"
cp "$WORK/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
printf 'APPL????' >"$APP/Contents/PkgInfo"
cat >"$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>$NAME</string>
	<key>CFBundleDisplayName</key>
	<string>$NAME</string>
	<key>CFBundleIdentifier</key>
	<string>$ID</string>
	<key>CFBundleExecutable</key>
	<string>$NAME</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleShortVersionString</key>
	<string>$VERSION</string>
	<key>CFBundleVersion</key>
	<string>$VERSION+$COMMIT</string>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleLocalizations</key>
	<array>
		<string>en</string>
		<string>zh-Hans</string>
	</array>
	<key>LSMinimumSystemVersion</key>
	<string>$MIN_MACOS</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.productivity</string>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSSupportsAutomaticGraphicsSwitching</key>
	<true/>
	<key>NSHumanReadableCopyright</key>
	<string>Ducter, open source. Runs on your own Mac.</string>
</dict>
</plist>
EOF
plutil -lint "$APP/Contents/Info.plist" >/dev/null

ENT="$ROOT/scripts/macos/ducter-cli.entitlements"
IDENTITY="${DUCTER_SIGN_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null |
  sed -n 's/^ *[0-9]*) \([0-9A-F]\{40\}\) "Developer ID Application: Nowledge Labs, LLC.*/\1/p' | head -1)}"
[ -n "$IDENTITY" ] || IDENTITY=-
if [ "$IDENTITY" = - ]; then
  # Ad hoc: the helper first, then the bundle around it. No identity from any keychain.
  codesign --force --sign - --identifier "$ID.cli" "$APP/Contents/Helpers/ducter"
  codesign --force --sign - --identifier "$ID" "$APP"
  SIGNED="ad-hoc signed"
else
  # Inside out: the helper, then the bundle, which signs Contents/MacOS/Ducter with it.
  # Hardened runtime + timestamp on both. The helper's one entitlement is allow-jit:
  # JavaScriptCore maps MAP_JIT pages, and without it a Bun binary dies with "Ran out of
  # executable memory" once code gets hot (tested with Bun 1.4.4). The CLI loads no native
  # addons, so library validation stays on; the desktop binary needs no entitlements.
  codesign --force --timestamp --options runtime --sign "$IDENTITY" \
    --identifier "$ID.cli" --entitlements "$ENT" "$APP/Contents/Helpers/ducter"
  codesign --force --timestamp --options runtime --sign "$IDENTITY" --identifier "$ID" "$APP"
  SIGNED="signed by $(codesign -dvv "$APP" 2>&1 | sed -n 's/^Authority=Developer ID Application: //p')"
fi
codesign --verify --strict --deep "$APP"
"$APP/Contents/Helpers/ducter" version >/dev/null

# notarize FILE: submit to Apple's notary service and wait. Returns 1 when no credentials.
notarize() {
  if [ -n "${DUCTER_NOTARY_PROFILE:-}" ]; then
    set -- "$1" --keychain-profile "$DUCTER_NOTARY_PROFILE"
  elif [ -n "${APPLE_NOTARY_KEY_ID:-${APPLE_API_KEY:-}}" ] && [ -n "${APPLE_NOTARY_ISSUER_ID:-${APPLE_API_ISSUER:-}}" ]; then
    k="${APPLE_NOTARY_KEY_ID:-$APPLE_API_KEY}"
    set -- "$1" --key "${APPLE_NOTARY_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_$k.p8}" \
      --key-id "$k" --issuer "${APPLE_NOTARY_ISSUER_ID:-$APPLE_API_ISSUER}"
  elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-${APPLE_APP_SPECIFIC_PASSWORD:-}}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    set -- "$1" --apple-id "$APPLE_ID" --password "${APPLE_PASSWORD:-$APPLE_APP_SPECIFIC_PASSWORD}" \
      --team-id "$APPLE_TEAM_ID"
  else
    return 1
  fi
  echo "notarizing $(basename "$1") (a few minutes)"
  xcrun notarytool submit "$@" --wait --timeout 30m >"$WORK/notary.log" 2>&1 || true
  # The upload went through but waiting on Apple dropped (2026-11-11: "The request timed out."
  # while In Progress): wait on the same submission again rather than fail or submit twice.
  sub="$(sed -n 's/^ *id: //p' "$WORK/notary.log" | head -1)"
  file="$1"; shift
  tries=0
  while [ -n "$sub" ] && ! grep -qE 'status: (Accepted|Invalid|Rejected)' "$WORK/notary.log" && [ "$tries" -lt 4 ]; do
    tries=$((tries + 1))
    echo "waiting on Apple again for $sub (try $tries)"
    sleep 20
    xcrun notarytool wait "$sub" "$@" --timeout 30m >>"$WORK/notary.log" 2>&1 || true
  done
  set -- "$file" "$@"
  if ! grep -q 'status: Accepted' "$WORK/notary.log"; then
    cat "$WORK/notary.log" >&2
    sub="$(sed -n 's/^ *id: //p' "$WORK/notary.log" | head -1)"
    [ -z "$sub" ] || echo "Apple's log: xcrun notarytool log $sub <same credentials>" >&2
    exit 1
  fi
}

NOTARIZED=no
if [ "$IDENTITY" != - ]; then
  ditto -c -k --keepParent "$APP" "$WORK/$NAME.zip"
  if notarize "$WORK/$NAME.zip"; then
    xcrun stapler staple -q "$APP"
    NOTARIZED=yes
  elif [ "${DUCTER_REQUIRE_NOTARIZATION:-0}" = 1 ]; then
    echo "No notarization credentials (see the top of $0)." >&2; exit 1
  else
    echo "No notarization credentials: signed but not notarized (see the top of $0)." >&2
  fi
fi

say "5/5 the disk image"
# A laid-out window, without Finder or a GUI session (CI builds it too): the app on its little
# island on the left, a clay arrow, Applications on the right (tools/art/dmg_background.py).
# The image is made read-write, mounted out of sight, given its .DS_Store
# (scripts/macos/dmg-layout.ts) and the app icon as its own, then compressed.
STAGE="$WORK/dmg"
mkdir -p "$STAGE/.background"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
# One TIFF with both resolutions: Finder picks the @2x one on a Retina screen.
tiffutil -cathidpicheck "$ROOT/scripts/macos/dmg/background.png" "$ROOT/scripts/macos/dmg/background@2x.png" \
  -out "$STAGE/.background/background.tiff" >/dev/null 2>&1
cp "$WORK/AppIcon.icns" "$STAGE/.VolumeIcon.icns"
DMG="$OUT/$NAME-$VERSION-$ARCH.dmg"
RW="$WORK/rw.dmg"
rm -f "$DMG"
hdiutil create -quiet -volname "$NAME" -srcfolder "$STAGE" -fs HFS+ -format UDRW -ov "$RW"
MNT="$WORK/mnt"
mkdir -p "$MNT"
hdiutil attach -quiet -nobrowse -noautoopen -readwrite -mountpoint "$MNT" "$RW"
detach() { hdiutil detach -quiet "$MNT" 2>/dev/null || hdiutil detach -quiet -force "$MNT"; }
if ! bun "$ROOT/scripts/macos/dmg-layout.ts" "$MNT" "$NAME" "$NAME.app"; then detach; exit 1; fi
# The volume shows the app icon: the root folder's Finder info has kHasCustomIcon (0x0400).
xattr -wx com.apple.FinderInfo 0000000000000000040000000000000000000000000000000000000000000000 "$MNT"
detach
hdiutil convert -quiet "$RW" -format UDZO -imagekey zlib-level=9 -o "$DMG"
if [ "$IDENTITY" != - ]; then
  codesign --force --timestamp --sign "$IDENTITY" --identifier "$ID.dmg" "$DMG"
  if [ "$NOTARIZED" = yes ]; then
    notarize "$DMG"
    xcrun stapler staple -q "$DMG"
    # Gatekeeper's own verdicts, as a friend's Mac would give them.
    spctl -a -vv "$APP"
    spctl -a -t open --context context:primary-signature -v "$DMG"
    xcrun stapler validate -q "$APP" && xcrun stapler validate -q "$DMG"
    SIGNED="$SIGNED, notarized"
  fi
fi

printf '\n  %s\n  %s\n  %s (%s)\n' "$APP" "$DMG" "$NAME $VERSION" "$COMMIT, $ARCH, $SIGNED"
