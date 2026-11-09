#!/usr/bin/env python3
"""The title moment from existing music (the curated alternative to title2.py).

Short excerpts of public-domain / CC0 recordings (Musopen; credits and licenses
in SOURCES.md), each cut so that a cadence's arrival chord lands on the eyes-open
beat at 3.55 s, then mastered like the produced variants: -20 LUFS integrated,
true peak <= -1 dBTP, hard silence to 0.30 s, a raised-cosine fade-in on the
lead-in, the fade to true zero from 8.40 to 9.40 s, file length 9.60 s.

    python tools/sound/excerpts.py SRC_DIR OUT_DIR [--app APP_SOUND_DIR] [--plots]

Each excerpt is a list of segments (source seconds -> output seconds) joined by
equal-power crossfades. Times were found by onset analysis of the recordings
(not by ear: the author should audition them). Arrival chords:

    m1  Chopin, Nocturne in D-flat, Op. 27 No. 2 - the final chord (360.50 s),
        preceded by the closing descent (353.95-356.95 s); the 3.5 s of silence
        between them is cut. A second, softer chord follows at ~7.8 s.
    m2  Schubert, Sonata in A, D 664, II. Andante (D major) - the final cadence:
        penultimate chord at ~280.4 s, the tonic arrival at 282.38 s.
    m3  Chopin, Prelude in F-sharp, Op. 28 No. 13 - the final chord (161.76 s),
        after the two chords before it (~160.1, ~160.6 s).
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import title2 as T  # noqa: E402  (shares the master chain and the meters)

SR = T.SR
N = T.N

EXCERPTS = {
    "m1": dict(
        name="Chopin, Nocturne Op. 27 No. 2 (ending)",
        file="music/chopin-nocturne-op27-2.mp3",
        arrival=360.50,
        segments=[(353.95, 356.95, 0.30), (360.25, 366.40, 3.30)],
    ),
    "m2": dict(
        name="Schubert, Sonata D 664, II. Andante (ending)",
        file="music/schubert-d664-ii-pitman.flac",
        arrival=282.38,
        segments=[(282.38 - 3.25, 282.38 + 6.0, 0.30)],
    ),
    "m3": dict(
        name="Chopin, Prelude Op. 28 No. 13 (ending)",
        file="music/chopin-prelude-op28-13.mp3",
        arrival=161.76,
        segments=[(161.76 - 3.25, 166.70, 0.30)],
    ),
}


def decode(path):
    """Any format -> 48 kHz float stereo, via ffmpeg (mp3/ogg/flac)."""
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2).astype(np.float64)


def assemble(x, segments, xf=0.25):
    out = np.zeros((N, 2))
    for k, (a, b, t) in enumerate(segments):
        seg = x[int(a * SR) : int(b * SR)].copy()
        n = int(xf * SR)
        if k > 0:  # equal-power fade in at the join
            seg[:n] *= np.sin(np.linspace(0, np.pi / 2, n))[:, None]
        if k < len(segments) - 1:
            seg[-n:] *= np.cos(np.linspace(0, np.pi / 2, n))[:, None]
        i = int(round(t * SR))
        seg = seg[: N - i]
        out[i : i + len(seg)] += seg
    return out


def broadband_onset(y, t0=3.35, t1=3.80):
    """Where the arrival starts: the first moment after t0 that the
    200 Hz-high-passed level (5 ms RMS, dB) climbs 8 dB above its median over
    the 250 ms before t0 (or half the rise, if gentler) and its 30 ms average
    stays there for the next 50 ms."""
    h = T.filt(y.mean(axis=1), T.hp(200))
    lvl = lambda s: T.db(np.sqrt(np.convolve(h * h, np.ones(int(s * SR)) / int(s * SR), mode="same")))
    e, slow = lvl(0.005), lvl(0.030)
    base = np.median(e[int((t0 - 0.25) * SR) : int(t0 * SR)])
    # 8 dB, or half the rise when the arrival is gentler than that
    thr = base + max(2.0, min(8.0, 0.5 * (slow[int(t0 * SR) : int(t1 * SR)].max() - base)))
    hold = int(0.05 * SR)
    for i in range(int(t0 * SR), int(t1 * SR)):
        if e[i] > thr and (slow[i + int(0.015 * SR) : i + hold] > thr).all():
            return i / SR
    return float("nan")


def render(src, ex):
    x = decode(Path(src) / ex["file"])
    y = assemble(x, ex["segments"])
    y = T.filt(y, T.hp(30))
    # the lead-in rises out of silence; nothing before 0.30 s
    y *= T.env([(0.0, 0.0), (0.30, 0.0), (1.30, 1.0)], N)[:, None]
    y *= T.undb(T.TARGET_LUFS - T.lufs(y))
    y, lim = T.limit(y, T.CEILING_DBTP - 0.15)
    y[: int(0.30 * SR)] = 0
    y *= T.env([(0, 1.0), (8.40, 1.0), (9.40, 0.0)], N)[:, None]
    y[int(9.40 * SR) :] = 0
    tp = T.true_peak(y)
    if tp > T.CEILING_DBTP:
        y *= T.undb(T.CEILING_DBTP - tp - 0.05)
    on = broadband_onset(y)
    m = dict(
        name=ex["name"],
        lufs_own=round(T.lufs(y), 2),
        true_peak_own_dbtp=round(T.true_peak(y), 2),
        limiter_gr_db=round(lim, 2),
        clipped_samples=int((np.abs(y) >= 0.999).sum()),
        dc=[round(float(v), 7) for v in y.mean(axis=0)],
        first_300ms_peak_dbfs=round(float(T.db(np.abs(y[: int(0.3 * SR)]).max())), 1),
        max_step=round(float(np.abs(np.diff(y, axis=0)).max()), 4),
        arrival_onset_s=round(on, 4),
        arrival_onset_err_ms=round((on - T.TONE_T) * 1000, 1),
        arrival_jump_db=round(T.rms_db(y.mean(axis=1), 3.55, 3.75) - T.rms_db(y.mean(axis=1), 3.2, 3.5), 1),
        segments=ex["segments"],
    )
    return y, m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--app")
    ap.add_argument("--plots", action="store_true")
    ap.add_argument("--only", default=",".join(EXCERPTS))
    a = ap.parse_args()
    out = Path(a.out)
    for v in a.only.split(","):
        y, m = render(a.src, EXCERPTS[v])
        sf.write(str(out / f"title-{v}.wav"), y, SR, subtype="PCM_24")
        if a.app:
            sf.write(str(Path(a.app) / f"title-{v}.wav"), T.to16(y, 87 + int(v[1:])), SR, subtype="PCM_16")
        if a.plots:
            T.plots(y, str(out / f"title-{v}"), m["name"])
        (out / f"title-{v}.measure.json").write_text(json.dumps(m, indent=1))
        print(f"{v} ({m['name']}): arrival {m['arrival_onset_s']:.4f}s ({m['arrival_onset_err_ms']:+.1f} ms), "
              f"jump {m['arrival_jump_db']:+.1f} dB, LUFS {m['lufs_own']}, TP {m['true_peak_own_dbtp']} dBTP, "
              f"first300 {m['first_300ms_peak_dbfs']} dBFS, step {m['max_step']}")


if __name__ == "__main__":
    main()
