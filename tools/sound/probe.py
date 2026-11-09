#!/usr/bin/env python3
"""Measures the pitch of every sample in a sources dir (see fetch.sh) and writes
SRC_DIR/pitches.json, which title2.py uses to pick and tune samples. Sample
libraries name octaves differently (VSCO's strings sit an octave below scientific
pitch, for one), so the generator trusts this measurement, not file names.

    python tools/sound/probe.py SRC_DIR

Needs numpy, scipy, soundfile (see build.sh for the scratch venv).
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def mono(path):
    x, sr = sf.read(str(path), always_2d=True, dtype="float64")
    return x.mean(axis=1), sr


def onset(x, sr):
    """Where the note starts: the first point where a 2 ms envelope rises
    within 20 dB of its peak, then back to the foot of that rise (the last
    point, at most 40 ms earlier, still 40 dB under the peak or at a local
    minimum). Robust to the noise and handling sounds before quiet notes."""
    n = max(1, int(sr * 0.002))
    e = np.sqrt(np.convolve(x * x, np.ones(n) / n, mode="same"))
    pk = e.max()
    i = int(np.argmax(e > pk * 10 ** (-20 / 20)))
    lo = max(0, i - int(0.04 * sr))
    seg = e[lo : i + 1]
    below = np.flatnonzero(seg < pk * 10 ** (-40 / 20))
    j = lo + int(below[-1]) if len(below) else lo + int(np.argmin(seg))
    return j


def f0(x, sr, start, fmin=30.0, fmax=4500.0):
    """Fundamental from a 1 s window after the attack: normalized
    autocorrelation (YIN-like difference function), refined by parabola."""
    a = start + int(0.25 * sr)
    seg = x[a : a + int(1.0 * sr)]
    if len(seg) < sr * 0.3:
        seg = x[start : start + int(0.6 * sr)]
    seg = seg - seg.mean()
    n = len(seg)
    spec = np.fft.rfft(seg, 2 * n)
    ac = np.fft.irfft(spec * np.conj(spec))[:n]
    # cumulative-mean-normalized difference (YIN)
    energy = np.cumsum(seg[::-1] ** 2)[::-1]
    d = energy[0] + energy - 2 * ac
    d[0] = 1
    cm = d * np.arange(n) / np.maximum(np.cumsum(d), 1e-12)
    lo, hi = int(sr / fmax), int(sr / fmin)
    c = cm[lo:hi]
    idx = np.where(c < 0.15)[0]
    if len(idx):
        i = idx[0]
        while i + 1 < len(c) and c[i + 1] < c[i]:
            i += 1
    else:
        i = int(np.argmin(c))
    i += lo
    if 1 <= i < n - 1:
        y0, y1, y2 = cm[i - 1], cm[i], cm[i + 1]
        den = y0 - 2 * y1 + y2
        i = i + (0.5 * (y0 - y2) / den if den else 0)
    return sr / i


def spectral_peak(x, sr, start):
    """For bells: the strongest partial in the first 0.5 s after the strike."""
    seg = x[start + int(0.02 * sr) : start + int(0.5 * sr)]
    w = np.hanning(len(seg))
    s = np.abs(np.fft.rfft(seg * w, 8 * len(seg)))
    f = np.fft.rfftfreq(8 * len(seg), 1 / sr)
    s[f < 200] = 0
    return float(f[np.argmax(s)])


def midi(f):
    return 69 + 12 * np.log2(f / 440.0) if f > 0 else float("nan")


NOTE = {"C": 0, "Db": 1, "C#": 1, "D": 2, "Eb": 3, "D#": 3, "E": 4, "F": 5, "Gb": 6, "F#": 6,
        "G": 7, "Ab": 8, "G#": 8, "A": 9, "Bb": 10, "A#": 10, "B": 11}
# VSCO names these an octave below scientific pitch (checked by measurement)
OCTAVE_UP = ("vsco/cello", "vsco/viola", "vsco/violin", "vsco/bass", "vsco/flute", "vsco/glock")


def nominal(rel):
    """The pitch a file's name (or position) claims, in midi."""
    name = Path(rel).name
    if rel.startswith("iowa/vibbow-notes/"):
        base = {"C3B3": 48, "C4B4": 60, "C5B5": 72}[name.split(".")[2]]
        return base + int(name.split(".")[3])
    if rel.startswith("vsco/organ/"):
        n = int(name.split("_")[2])
        return n - 86 if "Man3" in name else n - 28
    if rel.startswith("vsco/upright/"):
        i = int(name.split("_")[3][:3])
        return 108 if i == 44 else 21 + 2 * i
    import re
    toks = re.findall(r"(?:^|[._])([A-G](?:b|#)?)(-?\d)(?=[._])", name)
    if not toks:
        return None
    n, o = toks[-1]
    m = 12 * (int(o) + 1) + NOTE[n]
    return m + 12 if rel.startswith(OCTAVE_UP) else m


def main():
    src = Path(sys.argv[1])
    out = {}
    for p in sorted(src.rglob("*")):
        if p.suffix.lower() not in (".wav", ".aif", ".aiff") or "/ir/" in str(p) or "iowa/vibbow/" in str(p):
            continue
        rel = str(p.relative_to(src))
        x, sr = mono(p)
        o = onset(x, sr)
        bell = any(k in rel for k in ("crotale", "bells", "glock"))
        f = spectral_peak(x, sr, o) if bell else f0(x, sr, o)
        nom = nominal(rel)
        meas = float(midi(f)) if f > 0 else float("nan")
        # trust the name for the octave and note; the measurement for the tuning
        use = meas if nom is not None and abs(meas - nom) < 0.6 else (nom if nom is not None else meas)
        out[rel] = {
            "nominal": nom,
            "measured": round(meas, 3) if meas == meas else None,
            "sr": sr,
            "onset_s": round(o / sr, 4),
            "f0": round(float(f), 3),
            "midi": round(float(use), 3),
            "dur_s": round(len(x) / sr, 3),
            "peak_dbfs": round(float(20 * np.log10(np.abs(x).max() + 1e-12)), 2),
        }
        print(f"{rel:62s} nominal {nom}  measured {meas:7.2f}  used {use:7.2f}  onset {o/sr:.3f}s")
    (src / "pitches.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
