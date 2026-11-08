#!/bin/sh
# Builds Ducter.app and a disk image to hand to a friend (macOS only).
#
#   scripts/make-app.sh             # dist/Ducter.app and dist/Ducter-<version>-<arch>.dmg
#   scripts/make-app.sh OUTDIR
#
# Needs Bun and Go on this Mac; the friend needs neither. The app is signed ad hoc
# (codesign -s -), never with a Developer ID, so the friend opens it the first time with
# right-click > Open (README.md, "Give Ducter to a friend"). Nothing outside OUTDIR changes.
#
# Inside the app:
#   Contents/MacOS/Ducter          the desktop app (apps/desktop)
#   Contents/Helpers/ducter        the ducter CLI (packages/cli), which the app runs as
#                                  `ducter up --no-desktop` for as long as it is open
#   Contents/Resources/AppIcon.icns
set -eu

[ "$(uname)" = Darwin ] || { echo "make-app.sh builds a macOS app; run it on a Mac." >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

NAME=Ducter
ID=dev.ducter.app
VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$ROOT/packages/cli/package.json" | head -1)"
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
  -ldflags "-s -w -X github.com/egoist/mygo.production=1" \
  -o "$WORK/app/$NAME" .)

say "3/5 the icon"
(cd "$ROOT/apps/desktop" && go run ./cmd/appicon -in "$ROOT/docs/art/assets/alpha/ducter_idle.png" -out "$WORK/icon-1024.png")
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
# Ad hoc: the helper first, then the bundle around it. No identity from any keychain.
codesign --force --sign - --identifier "$ID.cli" "$APP/Contents/Helpers/ducter"
codesign --force --sign - --identifier "$ID" "$APP"
codesign --verify --strict --deep "$APP"
"$APP/Contents/Helpers/ducter" version >/dev/null

say "5/5 the disk image"
STAGE="$WORK/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
DMG="$OUT/$NAME-$VERSION-$ARCH.dmg"
rm -f "$DMG"
hdiutil create -quiet -volname "$NAME" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"

printf '\n  %s\n  %s\n  %s (%s)\n' "$APP" "$DMG" "$NAME $VERSION" "$COMMIT, $ARCH, ad-hoc signed"
