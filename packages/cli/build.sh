#!/bin/sh
# Builds the single `ducter` binary with `bun build --compile`.
#   sh packages/cli/build.sh [outfile]          # default: packages/cli/dist/ducter
#   DUCTER_TARGET=bun-linux-x64 sh packages/cli/build.sh dist/ducter-linux-x64
# Bun is pinned to 1.4.4 (research/18: older Bun can't load parts of OAR). If the bun on PATH
# isn't that version, the pinned one is fetched with npx into npm's cache (nothing global).
set -eu
cd "$(dirname "$0")"

BUN_PIN=1.4.4
if [ -n "${DUCTER_BUN:-}" ]; then
  BUN="$DUCTER_BUN"
elif command -v bun >/dev/null 2>&1 && [ "$(bun --version)" = "$BUN_PIN" ]; then
  BUN=bun
else
  BUN="npx -y bun@$BUN_PIN"
fi

OUT="${1:-dist/ducter}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
mkdir -p "$(dirname "$OUT")"

# shellcheck disable=SC2086
$BUN build --compile src/main.ts --outfile "$OUT" \
  --define "DUCTER_COMMIT=\"$COMMIT\"" \
  ${DUCTER_TARGET:+--target=$DUCTER_TARGET}

echo "built $(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT") ($COMMIT)"
