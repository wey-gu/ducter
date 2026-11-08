#!/bin/sh
# Installs Ducter on this Mac or Linux server: the `ducter` binary, plus the desktop app when Go
# is present (Mac only).
#
#   scripts/install.sh                      # build from this checkout, install to ~/.local/bin
#   scripts/install.sh --prefix /opt/ducter # install to /opt/ducter/bin
#   scripts/install.sh --from DIR           # install prebuilt binaries from DIR (no build tools needed)
#   scripts/install.sh --bundle DIR         # build a folder you can hand to a friend:
#                                           #   DIR/ducter, DIR/ducter-desktop, DIR/install.sh
#   scripts/install.sh --linux DIR          # build Linux bundles DIR/linux-arm64 and DIR/linux-x64
#                                           #   (copy one to the server, run its install.sh there)
#   scripts/install.sh --service            # Linux: also run Ducter as a systemd user service
#
# What it touches: only $PREFIX/bin/ducter and $PREFIX/bin/ducter-desktop (and, with --service,
# ~/.config/systemd/user/ducter.service). It never edits your shell profile; if $PREFIX/bin isn't
# on PATH it prints the line to add.
set -eu

PREFIX="${DUCTER_PREFIX:-$HOME/.local}"
FROM=""
BUNDLE=""
LINUX=""
SERVICE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --from) FROM="$2"; shift 2 ;;
    --from=*) FROM="${1#*=}"; shift ;;
    --bundle) BUNDLE="$2"; shift 2 ;;
    --bundle=*) BUNDLE="${1#*=}"; shift ;;
    --linux) LINUX="$2"; shift 2 ;;
    --linux=*) LINUX="${1#*=}"; shift ;;
    --service) SERVICE=1; shift ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

HERE="$(cd "$(dirname "$0")" && pwd)"
# When this script sits inside a bundle (next to the binaries), install from there.
if [ -z "$FROM" ] && [ -z "$BUNDLE" ] && [ -x "$HERE/ducter" ]; then FROM="$HERE"; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ducter-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

DUCTER_SRC=""
DESKTOP_SRC=""

if [ -n "$LINUX" ]; then
  ROOT="$(cd "$HERE/.." && pwd)"
  (cd "$ROOT" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null)
  for arch in arm64 x64; do
    step "Building ducter for linux-$arch"
    mkdir -p "$LINUX/linux-$arch"
    DUCTER_TARGET="bun-linux-$arch" sh "$ROOT/packages/cli/build.sh" "$LINUX/linux-$arch/ducter"
    cp "$0" "$LINUX/linux-$arch/install.sh"
    chmod +x "$LINUX/linux-$arch/install.sh"
  done
  say ""
  say "Copy the folder for your server's CPU (uname -m: aarch64 -> linux-arm64, x86_64 -> linux-x64):"
  say "  scp -r $LINUX/linux-x64 you@server:ducter && ssh you@server 'sh ducter/install.sh --service'"
  exit 0
fi

if [ -n "$FROM" ]; then
  [ -x "$FROM/ducter" ] || { say "No ducter binary in $FROM"; exit 1; }
  DUCTER_SRC="$FROM/ducter"
  [ -x "$FROM/ducter-desktop" ] && DESKTOP_SRC="$FROM/ducter-desktop"
else
  ROOT="$(cd "$HERE/.." && pwd)"
  [ -f "$ROOT/packages/cli/build.sh" ] || { say "Run this from a Ducter checkout, or pass --from DIR."; exit 1; }

  step "Building the ducter binary"
  if ! command -v bun >/dev/null 2>&1; then
    say "Bun is needed to build Ducter. Install it with:"
    say "  curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
  (cd "$ROOT" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null)
  sh "$ROOT/packages/cli/build.sh" "$WORK/ducter"
  DUCTER_SRC="$WORK/ducter"

  step "Building the desktop app"
  if [ "$(uname)" != "Darwin" ]; then
    say "Skipped: the desktop app is for the Mac. Connect to this server from it with: ducter pair"
  elif command -v go >/dev/null 2>&1; then
    (cd "$ROOT/apps/desktop" && go build -o "$WORK/ducter-desktop" .)
    DESKTOP_SRC="$WORK/ducter-desktop"
    say "built ducter-desktop"
  else
    say "Skipped: Go isn't installed. Ducter still runs; to add the desktop app later:"
    say "  brew install go && scripts/install.sh"
  fi
fi

if [ -n "$BUNDLE" ]; then
  step "Writing a bundle to $BUNDLE"
  mkdir -p "$BUNDLE"
  cp "$DUCTER_SRC" "$BUNDLE/ducter"
  [ -n "$DESKTOP_SRC" ] && cp "$DESKTOP_SRC" "$BUNDLE/ducter-desktop"
  cp "$0" "$BUNDLE/install.sh"
  chmod +x "$BUNDLE/install.sh"
  say "Done. Hand over the folder; on their Mac: sh install.sh"
  exit 0
fi

BIN="$PREFIX/bin"
step "Installing to $BIN"
mkdir -p "$BIN"
install -m 0755 "$DUCTER_SRC" "$BIN/ducter"
say "installed $BIN/ducter"
if [ -n "$DESKTOP_SRC" ]; then
  install -m 0755 "$DESKTOP_SRC" "$BIN/ducter-desktop"
  say "installed $BIN/ducter-desktop"
fi
# Copies that arrived by AirDrop or a browser carry a quarantine flag; clear it on our two files only.
if [ "$(uname)" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  for f in "$BIN/ducter" "$BIN/ducter-desktop"; do
    [ -e "$f" ] && xattr -d com.apple.quarantine "$f" 2>/dev/null && say "cleared the download quarantine flag on $f"
  done
fi

case ":$PATH:" in
  *":$BIN:"*) ON_PATH=1 ;;
  *) ON_PATH=0 ;;
esac

if [ "$SERVICE" = 1 ]; then
  if [ "$(uname)" = "Linux" ]; then
    step "Running Ducter as a service"
    exec "$BIN/ducter" service install
  fi
  say "--service is for Linux servers; on a Mac, ducter up keeps it running."
fi

step "Next"
if [ "$ON_PATH" = 0 ]; then
  say "$BIN is not on your PATH. This script did not change your shell profile."
  say "To add it yourself (zsh):"
  say "  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.zshrc && exec zsh"
  say "Or run it by full path: $BIN/ducter up"
  say ""
fi
say "  ducter doctor   # checks this Mac and says how to fix anything missing"
say "  ducter up       # starts your partner and opens the desktop app"
