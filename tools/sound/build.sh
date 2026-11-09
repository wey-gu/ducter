#!/bin/sh
# Renders the title sound (D87) and encodes it: the app's Ogg Vorbis and an
# AAC copy for the prototype. Intermediates (the WAV master, plots) go to
# $DUCTER_SHOTS_DIR/sound, else .shots/sound (gitignored, D75).
#   sh tools/sound/build.sh
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
out=${DUCTER_SHOTS_DIR:-$root/.shots}/sound
python3 "$root/tools/sound/title.py" "$out" --plots
# ffmpeg's own Vorbis encoder (marked experimental; fine for a soft pad at
# this rate). MyGo's audio/vorbis decodes it.
ffmpeg -hide_banner -loglevel error -y -i "$out/title.wav" -c:a vorbis -strict -2 -b:a 112k \
  "$root/apps/desktop/internal/theme/sound/title.ogg"
ffmpeg -hide_banner -loglevel error -y -i "$out/title.wav" -c:a aac -b:a 128k "$out/title.m4a"
ls -l "$root/apps/desktop/internal/theme/sound/title.ogg" "$out/title.m4a"
