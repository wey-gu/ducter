#!/usr/bin/env bash
#
# setup-github-secrets.sh: one-shot uploader for Ducter's release secrets (mirrors Nowledge
# Mem's nowledge-graph/scripts/ci/setup-github-secrets.sh). The author runs it, once, on the Mac
# that holds the signing materials. CI never runs it.
#
# It:
#   - exports the Developer ID Application certificate from the login keychain as a fresh .p12
#     (macOS asks once for the keychain password),
#   - reads the App Store Connect API key from ~/ios_build.rc (APPLE_API_KEY, APPLE_API_ISSUER,
#     APPLE_API_KEY_PATH, the same file Mem uses) and the .p8 file it points to,
#   - pushes each value with `gh secret set`, reading from stdin, so nothing lands on argv or
#     the terminal. The .p12 lives in a 0700 temp dir that is removed on exit.
#
# Usage:
#   scripts/ci/setup-github-secrets.sh                    # repo wey-gu/ducter
#   scripts/ci/setup-github-secrets.sh --repo OWNER/NAME
#   scripts/ci/setup-github-secrets.sh --dry-run          # show the plan, set nothing
#   scripts/ci/setup-github-secrets.sh --skip ios         # desktop secrets only
#   ASC_RC=~/asc_admin.rc scripts/ci/setup-github-secrets.sh
#       # also set a separate key for TestFlight (ASC_*), for when the notary key is not Admin
#
# Overrides (env): IOS_RC, ASC_RC, SIGNING_IDENTITY_SHA, SIGNING_IDENTITY_NAME.
# Idempotent: re-running overwrites the values. See design/release/README.md for what each secret is.

set -euo pipefail

REPO="wey-gu/ducter"
DRY_RUN=false
SKIP_IOS=false

IOS_RC="${IOS_RC:-$HOME/ios_build.rc}"
ASC_RC="${ASC_RC:-}"
SIGNING_IDENTITY_NAME="${SIGNING_IDENTITY_NAME:-Developer ID Application: Nowledge Labs, LLC (JMU55RJW2K)}"
# The SHA-1 to export. Default: the first valid identity with that name. The keychain holds
# several same-named Developer ID certificates; pass SIGNING_IDENTITY_SHA to pick one (Mem's
# script pins the one it uses).
SIGNING_IDENTITY_SHA="${SIGNING_IDENTITY_SHA:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --skip)
      case "$2" in
        ios) SKIP_IOS=true ;;
        *) echo "error: unknown --skip target: $2 (ios)" >&2; exit 2 ;;
      esac
      shift 2 ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "error: unknown arg: $1" >&2; exit 2 ;;
  esac
done

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { printf "\n${BLUE}==>${NC} %s\n" "$*"; }
ok()   { printf "    ${GREEN}OK${NC} %s\n" "$*"; }
warn() { printf "    ${YELLOW}warn${NC} %s\n" "$*"; }
fail() { printf "${RED}error:${NC} %s\n" "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "Run this on the Mac with the signing keychain (it uses 'security export')."
command -v gh >/dev/null      || fail "GitHub CLI 'gh' is required: brew install gh"
command -v openssl >/dev/null || fail "openssl is required."
gh auth status >/dev/null 2>&1 || fail "gh is not signed in: gh auth login"

WORKDIR="$(mktemp -d -t ducter-ci-secrets.XXXXXX)"
chmod 700 "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT INT TERM
umask 077

# push_secret NAME [DESCRIPTION] < value
push_secret() {
  local name="$1" desc="${2:-}"
  if $DRY_RUN; then
    cat >/dev/null
    ok "would set $name${desc:+  ($desc)}"
    return 0
  fi
  gh secret set "$name" --repo "$REPO" >/dev/null || fail "failed to set $name"
  ok "set $name${desc:+  ($desc)}"
}

# rc_get KEY FILE: the value of KEY after sourcing FILE in a subshell (quotes handled by sh).
rc_get() {
  local key="$1" file="$2" val
  [[ -f "$file" ]] || return 1
  # shellcheck disable=SC1090
  val="$(set -a; . "$file" >/dev/null 2>&1; printf '%s' "${!key:-}")"
  [[ -n "$val" ]] || return 1
  printf '%s' "$val"
}

# narrow_p12 IN INPASS SHA1 OUT OUTPASS: a .p12 holding only the identity whose certificate has
# that SHA-1 (`security export -t identities` exports every identity in the keychain).
narrow_p12() {
  local in="$1" inpass="$2" sha="$3" out="$4" outpass="$5" ossl=/usr/bin/openssl d f fp pub cert="" key=""
  [[ -x "$ossl" ]] || ossl=openssl
  d="$(mktemp -d "$WORKDIR/narrow.XXXXXX")"
  "$ossl" pkcs12 -in "$in" -passin "pass:$inpass" -nodes -out "$d/all.pem" 2>/dev/null ||
    "$ossl" pkcs12 -legacy -in "$in" -passin "pass:$inpass" -nodes -out "$d/all.pem" 2>/dev/null || return 1
  awk -v d="$d" '
    /-----BEGIN CERTIFICATE-----/ { c++; f = d "/cert" c ".pem" }
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/ { k++; f = d "/key" k ".pem" }
    f { print > f }
    /-----END / { if (f) close(f); f = "" }' "$d/all.pem"
  sha="$(printf '%s' "$sha" | tr a-f A-F)"
  for f in "$d"/cert*.pem; do
    fp="$("$ossl" x509 -in "$f" -noout -fingerprint -sha1 | sed 's/.*=//; s/://g' | tr a-f A-F)"
    [[ "$fp" == "$sha" ]] && { cert="$f"; break; }
  done
  [[ -n "$cert" ]] || return 1
  pub="$("$ossl" x509 -in "$cert" -noout -pubkey)"
  for f in "$d"/key*.pem; do
    [[ "$("$ossl" pkey -in "$f" -pubout 2>/dev/null)" == "$pub" ]] && { key="$f"; break; }
  done
  [[ -n "$key" ]] || return 1
  # SHA1-3DES keeps the file importable by every macOS `security import`.
  "$ossl" pkcs12 -export -inkey "$key" -in "$cert" -out "$out" -passout "pass:$outpass" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 >/dev/null 2>&1 || return 1
  rm -rf "$d"
}

# expand_home PATH: a leading ~ in a value read from an rc file.
# shellcheck disable=SC2088
expand_home() { local p="$1"; [[ "$p" == "~/"* ]] && p="$HOME/${p#\~/}"; printf '%s' "$p"; }

echo
echo "  Target repo: $REPO"
echo "  Dry run:     $DRY_RUN"
echo "  Skip iOS:    $SKIP_IOS"

# ---------------------------------------------------------------------------
# 1. Developer ID Application certificate (the Mac app and its disk image)
# ---------------------------------------------------------------------------
step "Developer ID certificate"
if [[ -z "$SIGNING_IDENTITY_SHA" ]]; then
  SIGNING_IDENTITY_SHA="$(security find-identity -v -p codesigning 2>/dev/null |
    awk -v n="\"$SIGNING_IDENTITY_NAME\"" 'index($0, n) { print $2; exit }')"
fi
[[ -n "$SIGNING_IDENTITY_SHA" ]] || fail "No valid identity named '$SIGNING_IDENTITY_NAME'. List them: security find-identity -v -p codesigning"
security find-identity -v -p codesigning 2>/dev/null | grep -q "$SIGNING_IDENTITY_SHA" ||
  fail "Identity $SIGNING_IDENTITY_SHA is not a valid code-signing identity in your keychains."
ok "identity: $SIGNING_IDENTITY_NAME (${SIGNING_IDENTITY_SHA:0:8}…)"

P12_PASS="$(openssl rand -base64 24)"
P12_FILE="$WORKDIR/developer-id.p12"
if $DRY_RUN; then
  ok "would export the identity as a .p12 (skipped in a dry run: no keychain prompt)"
  printf x | push_secret APPLE_CERTIFICATE_P12_BASE64 "base64 of the Developer ID .p12"
else
  # `security export` has no filter: it exports every identity in the login keychain. Narrow
  # that to the one identity, so the secret holds one certificate and one key, nothing else.
  ALL_PASS="$(openssl rand -base64 24)"
  security export -k login.keychain-db -t identities -f pkcs12 -P "$ALL_PASS" -o "$WORKDIR/all.p12" ||
    fail "security export failed (cancelled the keychain prompt?)"
  narrow_p12 "$WORKDIR/all.p12" "$ALL_PASS" "$SIGNING_IDENTITY_SHA" "$P12_FILE" "$P12_PASS" ||
    fail "could not extract identity ${SIGNING_IDENTITY_SHA:0:8}… and its private key from the export"
  rm -f "$WORKDIR/all.p12"
  chmod 600 "$P12_FILE"
  # Round-trip through macOS's own importer, the way CI's scripts/ci/import-certificate.sh reads it.
  PROBE="$WORKDIR/probe.keychain-db"; PROBE_PASS="$(openssl rand -base64 16)"
  security create-keychain -p "$PROBE_PASS" "$PROBE" >/dev/null 2>&1
  if security import "$P12_FILE" -k "$PROBE" -P "$P12_PASS" -A >/dev/null 2>&1; then
    security delete-keychain "$PROBE" >/dev/null 2>&1 || true
    ok ".p12 holds one identity and imports cleanly"
  else
    security delete-keychain "$PROBE" >/dev/null 2>&1 || true
    fail "the narrowed .p12 does not import with its password"
  fi
  base64 -i "$P12_FILE" | tr -d '\n' | push_secret APPLE_CERTIFICATE_P12_BASE64 "base64 of the Developer ID .p12"
fi
printf '%s' "$P12_PASS" | push_secret APPLE_CERTIFICATE_PASSWORD ".p12 export password (fresh, random)"
printf '%s' "$SIGNING_IDENTITY_SHA" | push_secret APPLE_SIGNING_IDENTITY "SHA-1 of the identity, for codesign"
openssl rand -base64 24 | tr -d '\n' | push_secret APPLE_KEYCHAIN_PASSWORD "password of CI's throwaway keychain"

# ---------------------------------------------------------------------------
# 2. App Store Connect API key: notarization (Mac) and, unless ASC_* is set, TestFlight (iOS)
# ---------------------------------------------------------------------------
push_asc_key() { # PREFIX RCFILE LABEL
  local prefix="$1" rc="$2" label="$3" id issuer path
  id="$(rc_get APPLE_API_KEY "$rc")"        || { warn "APPLE_API_KEY missing in $rc"; return 1; }
  issuer="$(rc_get APPLE_API_ISSUER "$rc")" || { warn "APPLE_API_ISSUER missing in $rc"; return 1; }
  path="$(rc_get APPLE_API_KEY_PATH "$rc" || printf '%s' "$HOME/.appstoreconnect/private_keys/AuthKey_$id.p8")"
  path="$(expand_home "$path")"
  [[ -f "$path" ]] || { warn "the .p8 for key ${id:0:4}… is not at $path"; return 1; }
  grep -q 'BEGIN PRIVATE KEY' "$path" || { warn "$path is not a .p8 private key"; return 1; }
  printf '%s' "$id"     | push_secret "${prefix}_KEY_ID" "$label key id"
  printf '%s' "$issuer" | push_secret "${prefix}_ISSUER_ID" "$label issuer UUID"
  base64 -i "$path" | tr -d '\n' | push_secret "${prefix}_API_KEY_BASE64" "$label AuthKey_*.p8, base64"
}

step "App Store Connect API key for notarization (from $IOS_RC)"
push_asc_key APPLE_NOTARY "$IOS_RC" "notary" ||
  fail "Need APPLE_API_KEY, APPLE_API_ISSUER and the .p8 (APPLE_API_KEY_PATH) in $IOS_RC. See design/release/README.md."
ok "this key also signs and uploads TestFlight builds unless ASC_* is set (it then needs the Admin role)"

if ! $SKIP_IOS && [[ -n "$ASC_RC" ]]; then
  step "Separate App Store Connect key for TestFlight (from $ASC_RC)"
  push_asc_key ASC "$ASC_RC" "TestFlight" || fail "ASC_RC=$ASC_RC is incomplete."
fi

step "Done"
echo "    Check: gh secret list --repo $REPO"
echo "    Next:  the checklist at the top of design/release/README.md (App Store Connect app record, first tag)."
echo
