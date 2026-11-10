#!/bin/sh
# The iPhone app opens what the home seals (D159): compiles apps/ios/Shared/PushCrypto.swift with
# a tiny checker and runs it against the vector packages/core/test/push-relay.test.ts also checks.
# macOS only (CryptoKit); needs no device, simulator or network.
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${TMPDIR:-/tmp}/ducter-push-vector.$$"
trap 'rm -f "$OUT"' EXIT
swiftc -O -o "$OUT" "$ROOT/apps/ios/Shared/PushCrypto.swift" "$ROOT/apps/ios/scripts/push-vector/main.swift"
"$OUT" "$ROOT/packages/core/test/fixtures/push-vector.json"
