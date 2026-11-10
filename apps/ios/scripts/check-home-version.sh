#!/bin/sh
# D200: the iPhone app's "the home is older than this app" rule (apps/ios/Ducter/HomeVersion.swift),
# compiled with a tiny checker and run against the same cases as the Android app's HomeVersionTest.
# macOS only; needs no device, simulator or network.
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${TMPDIR:-/tmp}/ducter-home-version.$$"
trap 'rm -f "$OUT"' EXIT
swiftc -O -o "$OUT" "$ROOT/apps/ios/Ducter/HomeVersion.swift" "$ROOT/apps/ios/scripts/home-version/main.swift"
"$OUT"
