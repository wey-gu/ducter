#!/bin/sh
# Prints the release notes for a tag (markdown, to stdout).
#
#   scripts/ci/release-notes.sh v0.1.0
#
# 1. If CHANGELOG.md has a section for the version ("## 0.1.0", "## [0.1.0]" or "## v0.1.0",
#    anything after it on the line is fine), that section is the notes.
# 2. Otherwise: the commit subjects since the previous v* tag (merge commits left out), newest
#    first. Needs the full history (actions/checkout with fetch-depth: 0).
set -eu
TAG="${1:?usage: release-notes.sh TAG}"
VERSION="${TAG#v}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHANGELOG="$ROOT/CHANGELOG.md"

if [ -f "$CHANGELOG" ]; then
  section="$(awk -v v="$VERSION" '
    /^## / {
      if (found) exit
      h = $2; gsub(/[\[\]]/, "", h); sub(/^v/, "", h)
      if (h == v) { found = 1; next }
    }
    found { print }
  ' "$CHANGELOG")"
  if [ -n "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
    printf '%s\n' "$section"
    exit 0
  fi
fi

prev="$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v*' "$TAG^" 2>/dev/null || true)"
if [ -n "$prev" ]; then
  range="$prev..$TAG"
  printf '## Changes since %s\n\n' "$prev"
else
  range="$TAG"
  printf '## Changes\n\n'
fi
git -C "$ROOT" log --no-merges --pretty='- %s (%h)' "$range"
