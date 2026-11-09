#!/bin/sh
# Downloads the title sound's acoustic sources (samples and the impulse response)
# listed in manifest.tsv into SRC_DIR. They are data, not code, and never go into
# git; licenses and credits are in SOURCES.md.
#   sh tools/sound/fetch.sh SRC_DIR
set -eu
here=$(cd "$(dirname "$0")" && pwd)
src=${1:?usage: fetch.sh SRC_DIR}
grep -v '^#' "$here/manifest.tsv" | while IFS="$(printf '\t')" read -r path url; do
  [ -s "$src/$path" ] && continue
  mkdir -p "$(dirname "$src/$path")"
  curl -fsSL --retry 3 -m 300 -o "$src/$path.part" "$url"
  mv "$src/$path.part" "$src/$path"
  echo "got $path"
done
echo "sources in $src"
