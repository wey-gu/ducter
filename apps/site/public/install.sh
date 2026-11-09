#!/bin/sh
# Install Ducter: https://ducter.ai
#
#   curl -fsSL https://ducter.ai/install.sh | sh
#   curl -fsSL https://ducter.ai/install.sh | sh -s -- --service   # Linux: also run it as a service
#
# Mac (Apple silicon): downloads the signed app from the latest GitHub release, checks its
# SHA-256 and its notarization, and puts Ducter.app in /Applications.
# Linux (x64, arm64): downloads the `ducter` bundle, checks its SHA-256, and runs the bundle's own
# install.sh (it puts `ducter` in ~/.local/bin); arguments after `sh -s --` go to that script.
#
#   DUCTER_VERSION=0.0.1   install that version instead of the latest release
#
# Internal, for testing this script (design/release/README.md):
#   DUCTER_DOWNLOAD_BASE   where the release files are (e.g. file:///tmp/mirror); needs DUCTER_VERSION
#   DUCTER_APP_DIR         install Ducter.app here instead of /Applications
#   DUCTER_NO_OPEN=1       don't open the app afterwards
#
# The asset names below must match .github/workflows/release.yml (scripts/install-sh.test.ts checks it).
set -eu

REPO="wey-gu/ducter"

say() { printf '%s\n' "$*"; }
fail() { printf 'Ducter install: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is needed. $2"; }

fetch() { # url file
  curl -fsSL --retry 2 -o "$2" "$1" ||
    fail "couldn't download $1. Is Ducter $VERSION released? See https://github.com/$REPO/releases"
}

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

verify() { # dir asset
  want="$(grep "  $2\$" "$1/SHA256SUMS.txt" | cut -d' ' -f1)"
  [ -n "$want" ] || fail "SHA256SUMS.txt doesn't list $2."
  [ "$(sha256 "$1/$2")" = "$want" ] || fail "$2 doesn't match its checksum. Nothing was installed; try again."
  say "  Checksum OK"
}

latest() {
  v="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null |
    sed -n 's/^ *"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)" || true
  if [ -z "$v" ]; then # no API (rate limit): the release page redirects to .../tag/vX
    v="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null |
      sed -n 's#.*/releases/tag/v\{0,1\}\([^/]*\)$#\1#p')" || true
  fi
  [ -n "$v" ] || fail "couldn't find the latest release at https://github.com/$REPO/releases"
  printf '%s' "$v"
}

install_mac() {
  dmg="Ducter-$VERSION-arm64.dmg"
  dir="${DUCTER_APP_DIR:-/Applications}"
  dest="$dir/Ducter.app"

  say "Downloading Ducter $VERSION for Mac…"
  fetch "$BASE/$dmg" "$TMP/$dmg"
  fetch "$BASE/SHA256SUMS.txt" "$TMP/SHA256SUMS.txt"
  verify "$TMP" "$dmg"

  MNT="$TMP/mnt"
  mkdir -p "$MNT"
  hdiutil attach -nobrowse -readonly -noautoopen -quiet -mountpoint "$MNT" "$TMP/$dmg" ||
    fail "couldn't open $dmg."
  [ -d "$MNT/Ducter.app" ] || fail "$dmg has no Ducter.app."
  if ! spctl -a -vv "$MNT/Ducter.app" 2>"$TMP/spctl" || ! grep -q 'Notarized Developer ID' "$TMP/spctl"; then
    fail "this copy of Ducter isn't signed and notarized by its developer, so it wasn't installed."
  fi
  say "  Signed and notarized"

  sudo=""
  if [ ! -w "$dir" ] || { [ -e "$dest" ] && [ ! -w "$dest" ]; }; then
    say "$dir isn't writable by you, so copying the app there needs your password (sudo, for the copy only)."
    sudo="sudo"
  fi

  # Quit the copy being replaced (only if it runs from $dest), so it isn't swapped out under itself.
  if [ -e "$dest" ] && pgrep -f "$dest/Contents/MacOS/" >/dev/null 2>&1; then
    say "Quitting Ducter to update it…"
    osascript -e 'quit app "Ducter"' >/dev/null 2>&1 || true
    i=0
    while pgrep -f "$dest/Contents/MacOS/" >/dev/null 2>&1 && [ $i -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
  fi

  say "Installing to ${dest}…"
  $sudo rm -rf "$dir/.Ducter.app.new"
  $sudo ditto "$MNT/Ducter.app" "$dir/.Ducter.app.new"
  $sudo rm -rf "$dest"
  $sudo mv "$dir/.Ducter.app.new" "$dest"
  hdiutil detach -quiet "$MNT" 2>/dev/null && MNT=""

  # Ducter kept running in the background from this app: restart it on the new version.
  plist="$HOME/Library/LaunchAgents/co.nowledge.ducter.agent.plist"
  if [ -f "$plist" ] && grep -q "$dest/" "$plist"; then
    launchctl kickstart -k "gui/$(id -u)/co.nowledge.ducter.agent" >/dev/null 2>&1 || true
  fi

  say ""
  say "Ducter $VERSION is installed."
  if [ "${DUCTER_NO_OPEN:-}" = 1 ]; then
    say "Open it from $dir."
  else
    open "$dest" && say "Opening it now. It checks this Mac, then opens the conversation."
  fi
}

install_linux() {
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) fail "Ducter runs on x64 and arm64 Linux; this machine is $(uname -m)." ;;
  esac
  name="ducter-$VERSION-linux-$arch"

  say "Downloading Ducter $VERSION for Linux ($arch)…"
  fetch "$BASE/$name.tar.gz" "$TMP/$name.tar.gz"
  fetch "$BASE/SHA256SUMS.txt" "$TMP/SHA256SUMS.txt"
  verify "$TMP" "$name.tar.gz"
  need tar "Install tar with your package manager."
  tar -xzf "$TMP/$name.tar.gz" -C "$TMP" || fail "couldn't unpack $name.tar.gz."
  [ -f "$TMP/$name/install.sh" ] || fail "$name.tar.gz has no install.sh."

  sh "$TMP/$name/install.sh" "$@" </dev/null
  say ""
  say "Ducter listens on http://127.0.0.1:7777 on this machine only. To reach it from your Mac or"
  say "phone: https://ducter.ai/docs/install#a-linux-server-that-stays-on"
}

main() {
  need curl "Install curl with your package manager, then run this again."
  command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 ||
    fail "shasum or sha256sum is needed to check the download. Install coreutils (or perl's shasum)."

  os="$(uname -s)"
  case "$os" in
    Darwin)
      if [ "$(uname -m)" != arm64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" != 1 ]; then
        fail "the Mac app needs Apple silicon (M1 or later). Intel Macs aren't supported yet."
      fi ;;
    Linux) ;;
    *) fail "Ducter installs on macOS and Linux; this is $os." ;;
  esac

  VERSION="${DUCTER_VERSION:-}"
  VERSION="${VERSION#v}"
  if [ -n "${DUCTER_DOWNLOAD_BASE:-}" ]; then
    [ -n "$VERSION" ] || fail "DUCTER_DOWNLOAD_BASE needs DUCTER_VERSION."
    BASE="${DUCTER_DOWNLOAD_BASE%/}"
  else
    [ -n "$VERSION" ] || VERSION="$(latest)"
    BASE="https://github.com/$REPO/releases/download/v$VERSION"
  fi

  TMP="$(mktemp -d "${TMPDIR:-/tmp}/ducter-install.XXXXXX")"
  MNT=""
  trap 'cleanup' EXIT
  trap 'exit 130' INT TERM

  if [ "$os" = Darwin ]; then install_mac; else install_linux "$@"; fi
}

cleanup() {
  if [ -n "${MNT:-}" ]; then hdiutil detach -quiet -force "$MNT" 2>/dev/null || true; fi
  if [ -n "${TMP:-}" ]; then rm -rf "$TMP"; fi
}

# Everything runs from here, so `curl | sh` has read the whole script before it starts.
main "$@"
