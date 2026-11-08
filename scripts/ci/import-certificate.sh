#!/bin/sh
# CI only: imports the Developer ID Application certificate into a throwaway keychain so
# scripts/make-app.sh can sign with it (same approach as con's scripts/macos/import-certificate.sh).
#
#   APPLE_CERTIFICATE_P12_BASE64   base64 of the exported .p12 (certificate + private key)
#   APPLE_CERTIFICATE_PASSWORD     the .p12 export password
#   APPLE_KEYCHAIN_PASSWORD        optional; a random one is made when unset
#   DUCTER_KEYCHAIN                optional keychain name (default ducter-ci.keychain-db)
#
# Prints the identities it finds; never prints secret values. `--delete` removes the keychain.
set -eu

[ "$(uname)" = Darwin ] || { echo "import-certificate.sh runs on macOS." >&2; exit 1; }
KEYCHAIN="${DUCTER_KEYCHAIN:-ducter-ci.keychain-db}"

if [ "${1:-}" = --delete ]; then
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  echo "deleted $KEYCHAIN"
  exit 0
fi

[ -n "${APPLE_CERTIFICATE_P12_BASE64:-}" ] || { echo "APPLE_CERTIFICATE_P12_BASE64 is not set" >&2; exit 1; }
[ -n "${APPLE_CERTIFICATE_PASSWORD:-}" ] || { echo "APPLE_CERTIFICATE_PASSWORD is not set" >&2; exit 1; }
PASS="${APPLE_KEYCHAIN_PASSWORD:-$(uuidgen)}"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ducter-cert.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
umask 077
printf '%s' "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode >"$TMP/cert.p12"
[ -s "$TMP/cert.p12" ] || { echo "APPLE_CERTIFICATE_P12_BASE64 did not decode to a file" >&2; exit 1; }

security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
security create-keychain -p "$PASS" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$PASS" "$KEYCHAIN"
security import "$TMP/cert.p12" -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/security
# Let codesign use the key without a UI prompt.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASS" "$KEYCHAIN" >/dev/null
# Put it first in the search list (keep the login keychain after it) and make it the default.
# shellcheck disable=SC2046
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
security default-keychain -d user -s "$KEYCHAIN"
security find-identity -v -p codesigning "$KEYCHAIN"
echo "imported the signing identity into $KEYCHAIN"
