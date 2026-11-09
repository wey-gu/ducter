#!/bin/sh
# Renders the title sound (D87) from recorded instruments: three produced
# variants (a, b, c; see title2.py) plus the curated music excerpts (m1..;
# see excerpts.py), and writes:
#   $OUT/app/title-<v>.wav                             48 kHz / 16-bit, each a candidate for the app
#   apps/desktop/internal/theme/sound/title.wav        the one the app ships ($TITLE_SOUND, default a)
#   $OUT/title-<v>.wav                                 48 kHz / 24-bit master
#   $OUT/title-<v>.m4a and .mp4 (same bytes)           AAC 256 kbps, for the web prototype
#   $OUT/title-<v>.{waveform,spectrogram}.png, .measure.json, .ebur128.txt
#
#   sh tools/sound/build.sh [SRC_DIR] [OUT_DIR]
#
# SRC_DIR holds the downloaded samples and recordings (fetch.sh fills it from
# manifest.tsv; never in git). OUT_DIR defaults to $DUCTER_SHOTS_DIR/sound,
# else .shots/sound (gitignored, D75). Python deps (numpy, scipy, soundfile)
# go into a scratch venv made with uv in $OUT_DIR/.venv; nothing is installed
# system-wide. title.py, the oscillator-only first pass, stays as a reference
# and is no longer built.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
out=${2:-${DUCTER_SHOTS_DIR:-$root/.shots}/sound}
src=${1:-$out/src}
app=$out/app
mkdir -p "$app"
mkdir -p "$out" "$src"
sh "$root/tools/sound/fetch.sh" "$src"
venv=$out/.venv
if [ ! -x "$venv/bin/python" ]; then
  uv venv -q "$venv"
  VIRTUAL_ENV=$venv uv pip install -q numpy scipy soundfile
fi
"$venv/bin/python" -I -B "$root/tools/sound/title2.py" "$src" "$out" --app "$app" --plots
if [ -f "$root/tools/sound/excerpts.py" ]; then
  "$venv/bin/python" -I -B "$root/tools/sound/excerpts.py" "$src" "$out" --app "$app" --plots
fi
# AAC: Apple's encoder when ffmpeg has it (better at this rate), else ffmpeg's own.
aac=aac
ffmpeg -hide_banner -encoders 2>/dev/null | grep -q aac_at && aac=aac_at
for f in "$out"/title-*.wav; do
  b=${f%.wav}
  ffmpeg -hide_banner -loglevel error -y -i "$f" -c:a "$aac" -b:a 256k "$b.m4a"
  cp "$b.m4a" "$b.mp4"
  ffmpeg -hide_banner -nostats -i "$f" -af ebur128=peak=true -f null - 2>&1 \
    | sed -n '/Summary:/,$p' > "$b.ebur128.txt"
done
ls -l "$app"/title-*.wav "$out"/title-*.wav "$out"/title-*.m4a
for f in "$app"/title-*.wav; do
  n=$(wc -c < "$f")
  [ "$n" -lt 1950000 ] || { echo "$f is $n bytes, over 1,950,000" >&2; exit 1; }
done
# The app ships one: the variant the author picked (D87).
cp "$app/title-${TITLE_SOUND:-a}.wav" "$root/apps/desktop/internal/theme/sound/title.wav"
