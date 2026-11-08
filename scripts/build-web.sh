#!/bin/sh
# Builds the phone web client with the pinned Bun, so the committed bundle is byte-identical
# to what CI rebuilds. Uses the bun on PATH when it is the pinned version, else npx (npm cache only).
set -eu
cd "$(dirname "$0")/.."
BUN_PIN=1.4.4
if command -v bun >/dev/null 2>&1 && [ "$(bun --version)" = "$BUN_PIN" ]; then BUN=bun; else BUN="npx -y bun@$BUN_PIN"; fi
exec $BUN run apps/web/build.ts
