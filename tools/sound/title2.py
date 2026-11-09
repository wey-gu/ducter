#!/usr/bin/env python3
"""The title moment's sound, from real instruments (D87, second pass).

title.py (pure oscillators) is kept as the reference it replaces: it read as
thin and synthetic. This one builds three variants from recorded acoustic
samples (CC0 VSCO 2 CE, University of Iowa MIS) in a real room (the OpenAIR
impulse response of St George's Episcopal Church, public domain). Credits and
licenses: tools/sound/SOURCES.md. The samples are data, fetched by fetch.sh,
and never go into git.

    python tools/sound/title2.py SRC_DIR OUT_DIR [--app APP_SOUND_DIR] [--plots]

SRC_DIR is what fetch.sh filled (probe.py's pitches.json is made on demand).
OUT_DIR gets, per variant v in a b c: title-v.wav (48 kHz / 24-bit master),
title-v.stems.json (measurements) and, with --plots, PNGs. With --app it also
writes the app's title-v.wav (48 kHz / 16-bit, TPDF dither). build.sh does the
AAC encodes and the ebur128 loudness report.

The picture this follows (design/onboarding.md, "The title moment"):

    0.00-0.30  silence (hard zero)
    0.40-3.40  the dawn: the swell rises and opens (filter + level automation)
    3.50       the eyes begin to open
    3.55       the tone: one clear struck note, and the harmony resolves under it
    4.20-5.40  the name settles; one softer answering note (A: 4.80, B: 4.90,
               C: 5.00) and the chord blooms
    6.10       "Press any key"; the chord is letting go
    8.40-9.40  everything fades to true zero; file ends at 9.60 s (cap 9.8 s)

All three are in D major and all resolve a held tension onto D on the 3.55 s
beat, each a different way (original progressions, no quoted material):

    A  felt piano + strings     IV(add9) -> V(sus4) -> I     tone F#5 piano+glock
    B  glass + breath pad       vi7 -> IV(add9) -> I(add9)   tone A5 crotale+glock
    C  bowed vibes + low organ  over a D pedal: G -> Dsus4 -> D (the G falls to
                                F# on the beat: a true 4-3 suspension)   tone F#5 vibes

Levels: stems are balanced by ear-free numbers (band levels printed per
variant), then the master chain: bus EQ (HP 30 Hz, -2.5 dB at 300 Hz, air shelf
+2 dB above 9 kHz) -> St George's convolution (pre-delay, band-limited wet) ->
gentle RMS compression (ratio 1.6, ~2 dB) -> integrated loudness to -20 LUFS
(BS.1770, own meter; ffmpeg ebur128 cross-checks) -> true-peak limiter at
-1 dBTP (4x oversampled) -> fades to true zero.
"""

import argparse
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d

SR = 48000
DUR = 9.60
TONE_T = 3.55
TARGET_LUFS = -20.0
CEILING_DBTP = -1.0
N = int(SR * DUR)
HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- utilities


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-12))


def undb(g):
    return 10 ** (g / 20)


def smooth(x):
    x = np.clip(x, 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def env(points, n, t0=0.0):
    """Piecewise raised-cosine envelope through (time, level) points, sampled
    for n samples starting at absolute time t0."""
    assert all(a < b for (a, _), (b, _) in zip(points, points[1:])), f"envelope times must rise: {points}"
    t = t0 + np.arange(n) / SR
    out = np.full(n, points[0][1], dtype=float)
    for (a, va), (b, vb) in zip(points, points[1:]):
        m = (t >= a) & (t < b)
        out[m] = va + (vb - va) * smooth((t[m] - a) / (b - a))
    out[t >= points[-1][0]] = points[-1][1]
    return out


def resample(x, ratio):
    """Resample x (frames, ch) so that len_out = len_in * ratio."""
    fr = Fraction(ratio).limit_denominator(1200)
    return signal.resample_poly(x, fr.numerator, fr.denominator, axis=0)


# RBJ biquads -> second-order sections
def _sos(b, a):
    b = np.asarray(b, float) / a[0]
    a = np.asarray(a, float) / a[0]
    return np.concatenate([b, a])[None, :]


def hp(f, q=0.707):
    w = 2 * np.pi * f / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    return _sos([(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al])


def lp(f, q=0.707):
    w = 2 * np.pi * f / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    return _sos([(1 - c) / 2, 1 - c, (1 - c) / 2], [1 + al, -2 * c, 1 - al])


def peak(f, g, q=1.0):
    A = 10 ** (g / 40)
    w = 2 * np.pi * f / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    return _sos([1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A])


def shelf(f, g, high=True, s=0.8):
    A = 10 ** (g / 40)
    w = 2 * np.pi * f / SR
    c, sn = np.cos(w), np.sin(w)
    al = sn / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    k = 2 * np.sqrt(A) * al
    if high:
        b = [A * ((A + 1) + (A - 1) * c + k), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - k)]
        a = [(A + 1) - (A - 1) * c + k, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - k]
    else:
        b = [A * ((A + 1) - (A - 1) * c + k), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - k)]
        a = [(A + 1) + (A - 1) * c + k, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - k]
    return _sos(b, a)


def filt(x, *sos):
    if not sos:
        return x
    return signal.sosfilt(np.vstack(sos), x, axis=0)


# ------------------------------------------------------------- the samples


class Library:
    """Sample families, each a list of (path, measured midi). Picks the nearest
    recording for a target pitch and retunes it by resampling (with the rate
    conversion to 48 kHz in the same step)."""

    FAMILIES = {
        "cello": "vsco/cello/",
        "viola": "vsco/viola/",
        "violin": "vsco/violin/",
        "bass": "vsco/bass/",
        "flute": "vsco/flute/",
        "organ": "vsco/organ/NT5_Man3Quiet_",
        "pedal": "vsco/organ/NT5_PedalQuiet_",
        "glock": "vsco/glock/",
        "harp": "vsco/harp/",
        "upright": "vsco/upright/",
        "vib": "iowa/vib/",
        "vibbow": "iowa/vibbow-notes/",
        "crotale": "iowa/crotale/",
    }

    def __init__(self, src):
        self.src = Path(src)
        pj = self.src / "pitches.json"
        if not pj.exists() or not (self.src / "iowa/vibbow-notes").exists():
            slice_scales(self.src)
            subprocess.run([sys.executable, str(HERE / "probe.py"), str(self.src)], check=True,
                           stdout=subprocess.DEVNULL)
        self.p = json.loads(pj.read_text())
        self.cache = {}
        self.used = {}

    def pick(self, fam, m):
        pre = self.FAMILIES[fam]
        cands = [(k, v) for k, v in self.p.items() if k.startswith(pre)]
        if not cands:
            raise SystemExit(f"no samples for {fam} ({pre}) in {self.src}")
        k, v = min(cands, key=lambda kv: abs(kv[1]["midi"] - m))
        return k, v

    def note(self, fam, m, cents=0.0, start=0.0, length=None):
        """The note `m` (midi, float ok) from family `fam`, as a stereo array at
        48 kHz beginning at the recording's measured onset (minus 4 ms), plus
        `start` seconds skipped into it."""
        k, v = self.pick(fam, m)
        shift = m - v["midi"] + cents / 100
        if abs(shift) > 4.01:
            print(f"  warn: {fam} {m} from {k} shifted {shift:+.2f} st", file=sys.stderr)
        if k not in self.cache:
            x, sr = sf.read(str(self.src / k), always_2d=True, dtype="float64")
            if x.shape[1] == 1:
                x = np.repeat(x, 2, axis=1)
            x = x[:, :2] - x[:, :2].mean(axis=0)
            x /= np.abs(x).max()  # every recording peak-normalized: gains in the score are relative
            self.cache[k] = (x, sr)
        x, sr = self.cache[k]
        a = max(0, int((v["onset_s"] - 0.004 + start) * sr))
        b = len(x) if length is None else min(len(x), a + int((length + 0.1) * sr))
        seg = x[a:b]
        r = 2 ** (shift / 12)
        y = resample(seg, SR / (sr * r))
        fade = min(len(y), int(0.003 * SR))
        y[:fade] *= np.linspace(0, 1, fade)[:, None]  # no click at the cut
        tail = min(len(y), int(0.08 * SR))
        y[-tail:] *= smooth(np.linspace(1, 0, tail))[:, None]  # nor where the recording ends
        self.used.setdefault(k, set()).add(round(float(m), 2))
        return y


def slice_scales(src):
    """Iowa's bowed vibraphone comes as one chromatic scale per file; cut it
    into single notes (silence between notes) as iowa/vibbow-notes/*.wav."""
    out = src / "iowa/vibbow-notes"
    out.mkdir(parents=True, exist_ok=True)
    for f in sorted((src / "iowa/vibbow").glob("*.aif")):
        x, sr = sf.read(str(f), always_2d=True, dtype="float64")
        m = x.mean(axis=1)
        hop = int(0.05 * sr)
        e = db(np.sqrt(np.convolve(m * m, np.ones(2 * hop) / (2 * hop), mode="same")[::hop]))
        # a note starts where the level climbs 10 dB within half a second
        # (12 notes per file, ~14 s apart: keep the 12 steepest, >= 9 s apart)
        k = int(0.5 / 0.05)
        rise = np.r_[e[k:] - e[:-k], np.zeros(k)]
        starts = []
        for i in np.argsort(-rise):
            if rise[i] < 10:
                break
            if len(starts) < 12 and all(abs(i - j) * 0.05 >= 9 for j in starts):
                starts.append(int(i))
        starts.sort()
        bounds = [s_ * hop for s_ in starts] + [len(x)]
        merged = []
        for i, (a, b) in enumerate(zip(bounds, bounds[1:])):
            a = max(0, a - int(0.3 * sr))
            sf.write(str(out / f"{f.stem}.{i:02d}.wav"), x[a:b], sr, subtype="PCM_24")
            merged.append((a, b))
        print(f"  {f.name}: {len(merged)} notes", file=sys.stderr)


# ------------------------------------------------------------------ mixing


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, y, t, gain_db=0.0, pan=0.0, width=1.0, points=None, fx=()):
        """Place y at time t (s). points: envelope (absolute times). pan -1..1
        (constant power), width scales the side signal."""
        a = int(round(t * SR))
        y = filt(y, *fx) if fx else y
        if a < 0:
            y, a = y[-a:], 0
        y = y[: N - a].copy()
        if points is not None and points[-1][1] == 0 and t + len(y) / SR < points[-1][0] - 0.05:
            print(f"  note: recording ends at {t + len(y) / SR:.2f}s, before its envelope ({points[-1][0]}s)",
                  file=sys.stderr)
        if points is not None:
            y *= env(points, len(y), t)[:, None]
        mid = (y[:, 0] + y[:, 1]) / 2
        side = (y[:, 0] - y[:, 1]) / 2 * width
        L, R = mid + side, mid - side
        th = (pan + 1) * np.pi / 4
        g = undb(gain_db)
        self.x[a : a + len(y), 0] += L * np.cos(th) * np.sqrt(2) * g
        self.x[a : a + len(y), 1] += R * np.sin(th) * np.sqrt(2) * g


def dawn(x, t0, t1, lo, hi):
    """The dawn: a low-pass that opens from lo to hi Hz between t0 and t1,
    done as a crossfade over a ladder of fixed filters (no zipper noise)."""
    steps = np.geomspace(lo, hi, 7)
    w = env([(t0, 0.0), (t1, 1.0)], N)  # 0..1 position on the ladder
    pos = w * (len(steps) - 1)
    out = np.zeros_like(x)
    for i, f in enumerate(steps):
        g = np.clip(1 - np.abs(pos - i), 0, 1)
        if g.any():
            out += filt(x, lp(f, 0.6)) * g[:, None]
    return out


def load_ir(src, name, predelay, tail_s):
    x, sr = sf.read(str(Path(src) / "ir" / name), always_2d=True, dtype="float64")
    x = resample(x[:, :2], SR / sr)
    e = np.abs(x).max(axis=1)
    d = int(np.argmax(e > e.max() * undb(-20)))  # the direct sound
    x = x[max(0, d - int(0.001 * SR)) :]
    x = x[: int(tail_s * SR)]
    x *= env([(0, 1.0), (tail_s * 0.7, 1.0), (tail_s, 0.0)], len(x))[:, None]
    x /= np.sqrt((x**2).sum() / 2)
    return np.vstack([np.zeros((int(predelay * SR), 2)), x])


def convolve(x, ir):
    out = np.zeros_like(x)
    for c in range(2):
        out[:, c] = signal.fftconvolve(x[:, c], ir[:, c])[: len(x)]
    return out


def compress(x, thr_db, ratio, att=0.03, rel=0.35):
    lvl = np.sqrt(filt((x**2).mean(axis=1), lp(8.0)).clip(1e-12))
    over = np.maximum(db(lvl) - thr_db, 0)
    gr = -over * (1 - 1 / ratio)
    # attack/release smoothing of the gain
    a_c, r_c = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    g = np.zeros_like(gr)
    s = 0.0
    for i, v in enumerate(gr):  # a few hundred thousand steps; fine
        c = a_c if v < s else r_c
        s = c * s + (1 - c) * v
        g[i] = s
    return undb(g), float(-g.min())


def lufs(x):
    """Integrated loudness, ITU-R BS.1770-4 (K-weighting, 400 ms blocks,
    absolute -70 and relative -10 LU gates)."""
    k = filt(x, shelf(1681.97, 4.0, True, s=1.0), hp(38.13, 0.5))
    n, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([(k[i : i + n] ** 2).mean(axis=0).sum() for i in range(0, len(k) - n, hop)])
    l = -0.691 + 10 * np.log10(np.maximum(ms, 1e-15))
    ms = ms[l > -70]
    if not len(ms):
        return -99.0
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[(-0.691 + 10 * np.log10(ms)) > rel]
    return float(-0.691 + 10 * np.log10(ms.mean()))


def true_peak(x):
    return float(db(np.abs(signal.resample_poly(x, 4, 1, axis=0)).max()))


def limit(x, ceiling_db, look=0.002, rel=0.12):
    """Look-ahead true-peak limiter: gain from the 4x-oversampled peak, held
    over the look-ahead window, released smoothly."""
    c = undb(ceiling_db)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(axis=1)
    pk = up.reshape(-1, 4).max(axis=1)[: len(x)]
    need = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    held = minimum_filter1d(need, 2 * int(look * SR) + 1)
    r_c = np.exp(-1 / (rel * SR))
    g = np.empty_like(held)
    s = 1.0
    for i, v in enumerate(held):
        s = v if v < s else r_c * s + (1 - r_c) * v
        g[i] = s
    return x * g[:, None], float(-db(g.min()))


# ----------------------------------------------------------------- variants


def soft(y, ms=2.5):
    """Round off a hard mallet transient (no click), keeping the strike."""
    n = int(ms / 1000 * SR)
    y = y.copy()
    y[:n] *= smooth(np.linspace(0, 1, n))[:, None]
    return y


def chord(lib, bus, fam, notes, t, points, gain_db, spread=0.6, fx=(), detune=4.0, rng=None, start=0.0):
    """A sustained chord: each note its own recording, spread across the
    stereo field, slightly detuned and staggered so it breathes."""
    for i, m in enumerate(notes):
        pan = spread * (2 * i / max(1, len(notes) - 1) - 1) if len(notes) > 1 else 0.0
        jt = rng.uniform(-0.03, 0.03)
        cents = rng.uniform(-detune, detune)
        y = lib.note(fam, m, cents=cents, start=start)
        bus.add(y, t + jt, gain_db, pan=pan, width=0.8, points=[(p + jt, v) for p, v in points], fx=fx)


def variant_a(lib, rng):
    """A: felt piano + strings. Gadd9 -> Asus4 -> D; tone F#5 (the third
    arriving with the eyes), piano and glock struck together."""
    pad, keys, tone = Bus(), Bus(), Bus()
    sfx = (hp(55), peak(320, -2.0, 0.9), lp(7000))
    # strings: G2 D3 B3 | A2 E3 D4 | D2(bass) D3 F#3 D4 A4, A3 held throughout;
    # the F# above the staff is left to the tone, so the third arrives with it
    chord(lib, pad, "cello", [43, 50], 0.40, [(0.40, 0), (1.90, 1), (2.15, 0.85), (2.55, 0)], -3, fx=sfx, rng=rng)
    chord(lib, pad, "violin", [59], 0.55, [(0.55, 0), (1.95, 0.8), (2.55, 0)], -9, fx=sfx, rng=rng)
    chord(lib, pad, "cello", [45, 52], 2.00, [(2.00, 0), (2.50, 0.9), (3.40, 1.15), (3.80, 0)], -3, fx=sfx, rng=rng)
    chord(lib, pad, "violin", [62], 2.05, [(2.05, 0), (2.60, 0.8), (3.42, 1.0), (3.80, 0)], -9, fx=sfx, rng=rng)
    chord(lib, pad, "viola", [57], 0.45, [(0.45, 0), (2.0, 0.8), (3.4, 1.0), (5.5, 0.9), (8.4, 0)], -6, fx=sfx, rng=rng)
    chord(lib, pad, "cello", [50, 54], 3.38, [(3.38, 0), (3.62, 1.0), (5.6, 0.95), (8.4, 0)], -3, fx=sfx, rng=rng)
    chord(lib, pad, "violin", [62, 69], 3.42, [(3.42, 0), (3.70, 0.85), (5.6, 0.8), (8.3, 0)], -10, fx=sfx, rng=rng)
    chord(lib, pad, "bass", [38], 3.40, [(3.40, 0), (3.75, 1.0), (6.0, 0.9), (8.4, 0)], -4, fx=(hp(32), lp(900)), rng=rng)
    # the sub: the bass an octave down, only below 90 Hz
    sub = lib.note("bass", 26.0, start=0.0)
    pad.add(sub, 3.45, -14, points=[(3.45, 0), (4.0, 1.0), (6.5, 0.8), (8.4, 0)], fx=(hp(24), lp(90), lp(90)))
    # felt piano: VSCO's soft upright (dyn1), hammers softened (8 ms fade-in,
    # low-pass). (Iowa's pp grand was tried and dropped: ~20 dB noise floor.)
    pfx = (hp(40), peak(280, -2.5, 1.0), lp(2600, 0.6), shelf(5000, -4))

    def piano(m, t, g, pan=0.0, f=pfx):
        y = lib.note("upright", m)
        y[: int(0.008 * SR)] *= np.linspace(0, 1, int(0.008 * SR))[:, None]
        keys.add(y, t, g, pan=pan, width=0.7, points=[(t, 1), (min(t + 3.0, 7.0), 1), (8.5, 0)], fx=f)

    piano(43, 0.42, -12, -0.2)   # G2
    piano(55, 0.47, -18, 0.1)   # G3, an octave above, a breath later
    piano(45, 2.02, -13, -0.2)   # A2
    piano(64, 2.70, -20, 0.25)  # E4, the only movement inside the wait
    piano(38, 3.55, -10, -0.15)  # D2 lands with the tone
    piano(57, 3.57, -16, 0.05)  # A3
    # the tone: upright F#5 (brighter: less low-pass) + glock F#5, struck as one
    tfx = (hp(180), peak(320, -3, 1.0), lp(6500, 0.6))
    y = lib.note("upright", 78)
    tone.add(y, TONE_T, -2, pan=0.05, width=0.5, points=[(TONE_T, 1), (8.6, 0)], fx=tfx)
    g = lib.note("glock", 78)
    tone.add(g, TONE_T, -15, pan=0.05, width=0.4, points=[(TONE_T, 1), (8.0, 0)], fx=(hp(900), lp(9000)))
    # the answer, softer: A5 (a rising third: "oh - it's you")
    y = lib.note("upright", 81)
    keys.add(y, 4.80, -14, pan=0.15, width=0.5, points=[(4.8, 1), (8.6, 0)], fx=tfx)
    return dict(pad=pad, keys=keys, tone=tone, tone_midi=78, ir="st_georges_medium.wav", tone_over_bed=4.0,
                predelay=0.028, wet=0.38, dawn=(0.4, 3.4, 500, 9000))


def variant_b(lib, rng):
    """B: glass + breath pad. Bm7 -> Gadd9 -> Dadd9; tone A5 on crotale +
    glock, pad of quiet organ flue and non-vibrato flute (a choir-like 'ah'
    shaped with vowel formants)."""
    pad, keys, tone = Bus(), Bus(), Bus()
    vowel = (hp(90), peak(700, 3.0, 1.4), peak(1150, 2.0, 1.6), peak(320, -3, 0.9), lp(5200))
    chord(lib, pad, "organ", [47, 54, 57, 62], 0.40, [(0.40, 0), (1.95, 1.0), (2.30, 0)], -8, fx=vowel, rng=rng)
    chord(lib, pad, "organ", [43, 50, 57, 59], 1.95, [(1.95, 0), (2.35, 0.95), (3.40, 1.1), (3.75, 0)], -8, fx=vowel, rng=rng)
    chord(lib, pad, "organ", [50, 54, 62, 64], 3.40, [(3.40, 0), (3.66, 1.0), (5.8, 0.9), (8.4, 0)], -8, fx=vowel, rng=rng)
    ffx = (hp(200), peak(320, -3, 0.9), lp(6000))
    chord(lib, pad, "flute", [66, 69], 0.70, [(0.70, 0), (2.0, 0.8), (2.35, 0)], -13, fx=ffx, rng=rng, spread=0.8)
    chord(lib, pad, "flute", [67, 71], 2.00, [(2.00, 0), (2.5, 0.8), (3.4, 1.0), (3.75, 0)], -13, fx=ffx, rng=rng, spread=0.8)
    chord(lib, pad, "flute", [66, 73], 3.42, [(3.42, 0), (3.72, 0.9), (5.6, 0.75), (8.0, 0)], -14, fx=ffx, rng=rng, spread=0.8)
    # low end: non-vibrato contrabass B1 -> G1 -> D2 (organ-like), the pedal
    # organ doubling the arrival
    for m, t, pts in ((35, 0.4, [(0.4, 0), (2.0, 1), (2.3, 0)]), (31, 1.95, [(1.95, 0), (2.4, 1), (3.75, 0)]),
                      (38, 3.40, [(3.40, 0), (3.7, 1), (6.0, 0.9), (8.4, 0)])):
        pad.add(lib.note("bass", m), t, -8, points=pts, fx=(hp(28), lp(700), peak(250, -2, 1)))
    pad.add(lib.note("pedal", 38), 3.42, -12, points=[(3.42, 0), (3.8, 1), (6.0, 0.9), (8.4, 0)], fx=(hp(28), lp(600)))
    # glass: a soft harp D2 + D4 (warm floor) + crotale A6 + glock A5 at the tone
    keys.add(lib.note("harp", 38), 3.60, -10, pan=-0.2, points=[(3.56, 1), (8.4, 0)], fx=(hp(40), lp(3000)))
    keys.add(lib.note("harp", 62), 3.68, -18, pan=0.2, points=[(3.58, 1), (8.4, 0)], fx=(hp(60), lp(4000)))
    tone.add(soft(lib.note("glock", 81)), TONE_T, -3, pan=0.0, width=0.4, points=[(TONE_T, 1), (8.6, 0)], fx=(hp(500), lp(3500, 0.6), lp(4200, 0.7)))
    tone.add(soft(lib.note("crotale", 93), 4.0), TONE_T, -22, pan=0.1, width=0.5, points=[(TONE_T, 1), (8.6, 0)], fx=(hp(1500), lp(8000, 0.6)))
    # the answer: glock F#5 (down a third), quieter
    keys.add(soft(lib.note("glock", 78)), 4.90, -13, pan=-0.15, width=0.4, points=[(4.9, 1), (8.6, 0)], fx=(hp(500), lp(9000)))
    return dict(pad=pad, keys=keys, tone=tone, tone_midi=81, ir="st_georges_far.wav", tone_over_bed=4.0,
                predelay=0.035, wet=0.5, dawn=(0.4, 3.4, 450, 10000))


def variant_c(lib, rng):
    """C: bowed vibraphone + low organ. D pedal throughout; above it G/D ->
    Dsus4 -> D: the bowed G4 falls to F#4 exactly on 3.55, when the struck
    vibraphone F#5 rings."""
    pad, keys, tone = Bus(), Bus(), Bus()
    ofx = (hp(30), peak(300, -3, 0.9), lp(3200))
    pad.add(lib.note("bass", 26), 0.40, -8, points=[(0.40, 0), (2.4, 0.8), (3.5, 1.0), (6.0, 0.9), (8.4, 0)], fx=(hp(24), lp(400)))
    pad.add(lib.note("pedal", 38), 0.50, -10, points=[(0.50, 0), (2.4, 0.8), (3.5, 1.0), (6.0, 0.9), (8.4, 0)], fx=(hp(30), lp(600)))
    chord(lib, pad, "organ", [55, 59, 62], 0.55, [(0.55, 0), (2.0, 1.0), (2.35, 0)], -11, fx=ofx, rng=rng)
    chord(lib, pad, "organ", [55, 57, 62], 2.00, [(2.00, 0), (2.4, 0.95), (3.45, 1.05), (3.75, 0)], -11, fx=ofx, rng=rng)
    chord(lib, pad, "organ", [54, 57, 62], 3.40, [(3.40, 0), (3.62, 1.0), (5.8, 0.9), (8.4, 0)], -11, fx=ofx, rng=rng)
    bfx = (hp(150), peak(320, -2, 1.0), lp(7000))
    # bowed vibes: B4 sings over the first chord, then the suspension G4 -> F#4
    for m, t, pts, g in ((71, 0.9, [(0.9, 0), (2.0, 1.0), (2.45, 0)], -8),
                         (67, 1.95, [(1.95, 0), (2.6, 0.9), (3.45, 1.05), (3.66, 0)], -6),
                         (66, 3.50, [(3.50, 0), (3.70, 1.0), (5.5, 0.85), (8.0, 0)], -6),
                         (74, 4.30, [(4.30, 0), (5.2, 0.7), (8.0, 0)], -12)):
        y = lib.note("vibbow", m)
        pad.add(y, t, g, pan=0.15 if m > 70 else -0.1, width=0.6, points=pts, fx=bfx)
    # struck vibes (motor off): F#5 the tone, D3+A3 under it, then D5 answers
    vfx = (hp(120), peak(320, -2, 1), lp(9000))
    tone.add(lib.note("vib", 78), TONE_T, -2, pan=0.05, width=0.5, points=[(TONE_T, 1), (8.6, 0)], fx=vfx)
    keys.add(lib.note("vib", 69), 3.57, -12, pan=-0.2, width=0.5, points=[(3.57, 1), (8.6, 0)], fx=vfx)
    keys.add(lib.note("vib", 74), 5.00, -11, pan=0.2, width=0.5, points=[(5.0, 1), (8.6, 0)], fx=vfx)
    return dict(pad=pad, keys=keys, tone=tone, tone_midi=78, ir="st_georges_medium.wav", tone_over_bed=4.0,
                predelay=0.024, wet=0.42, dawn=(0.4, 3.4, 350, 7500))


VARIANTS = {
    "a": ("felt piano + strings", variant_a),
    "b": ("glass + breath pad", variant_b),
    "c": ("bowed vibraphone + low organ", variant_c),
}

# ------------------------------------------------------------------ master


def band(x, f, octs=1 / 3):
    """Zero-phase band-pass (forward-backward), so measured times are not
    delayed by the filter."""
    lo, hi = f * 2 ** (-octs / 2), f * 2 ** (octs / 2)
    sos = signal.butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfiltfilt(sos, x.mean(axis=1) if x.ndim == 2 else x)


def rms_db(x, t0, t1):
    return float(db(np.sqrt((x[int(t0 * SR) : int(t1 * SR)] ** 2).mean() + 1e-20)))


def onset_in(x, f, t0=3.4, t1=3.9):
    """The tone's measured onset in a mix: find where the tone-band level
    (zero-phase 1/3-octave band, 2 ms RMS, dB) first comes within 6 dB of its
    peak between t0 and t1, then take the instant of steepest rise in the
    60 ms before it: the attack of the struck note."""
    b = band(x, f, 1 / 3)
    n = int(0.002 * SR)
    e = db(np.sqrt(np.convolve(b * b, np.ones(n) / n, mode="same")))
    a0, a1 = int(t0 * SR), int(t1 * SR)
    seg = e[a0:a1]
    near = a0 + int(np.argmax(seg > seg.max() - 6))
    k = int(0.003 * SR)
    lo = near - int(0.06 * SR)
    rise = e[lo + k : near + k] - e[lo - k : near - k]
    return (lo + int(np.argmax(rise))) / SR


def master(parts, src):
    pad = dawn(parts["pad"].x, *parts["dawn"])
    f = 440 * 2 ** ((parts["tone_midi"] - 69) / 12)
    # leave room for the tone: a narrow -4 dB dip at its pitch in the bed
    room = (peak(f, -4.0, 4.0), peak(2 * f, -2.0, 4.0))
    stems = {"pad": filt(pad, *room), "keys": parts["keys"].x, "tone": parts["tone"].x}
    # the tone's level is set by a number, not by ear: its broadband RMS over
    # the first 150 ms of the strike sits `tone_over_bed` dB above the bed's
    win = (TONE_T, TONE_T + 0.15)
    bed = stems["pad"] + stems["keys"]
    cur = rms_db(stems["tone"].mean(axis=1), *win) - rms_db(bed.mean(axis=1), *win)
    stems["tone"] = stems["tone"] * undb(parts["tone_over_bed"] - cur)
    bus_eq = (hp(30), peak(300, -2.5, 0.8), shelf(9000, 2.0, True))
    ir = load_ir(src, parts["ir"], parts["predelay"], 3.0)
    wet_fx = (hp(220), lp(9000))
    out = {}
    for k, s in stems.items():
        s = filt(s, *bus_eq)
        w = convolve(filt(s, *wet_fx), ir) * parts["wet"]
        out[k] = s * (1 - parts["wet"] * 0.5) + w
    mix = sum(out.values())
    # compressor threshold from the mix's own loud part (~2 dB of reduction)
    lvl = db(np.sqrt(filt((mix**2).mean(axis=1), lp(8.0)).clip(1e-12)))
    thr = float(np.percentile(lvl[int(3.5 * SR) : int(5.5 * SR)], 90)) - 3.5
    cg, gr = compress(mix, thr, 1.6)
    mix_c = mix * cg[:, None]
    norm = TARGET_LUFS - lufs(mix_c)
    y = mix_c * undb(norm)
    y, lim = limit(y, CEILING_DBTP - 0.15)
    # silence and fades: hard zero to 0.30 s, then the fade to true zero
    y[: int(0.30 * SR)] = 0
    y *= env([(0, 1.0), (8.40, 1.0), (9.40, 0.0)], N)[:, None]
    y[int(9.40 * SR) :] = 0
    # loudness again after limiting/fades; nudge (gain only, tiny) if needed
    tp = true_peak(y)
    if tp > CEILING_DBTP:
        y *= undb(CEILING_DBTP - tp - 0.05)
    stem_out = {k: v * cg[:, None] * undb(norm) for k, v in out.items()}
    return y, stem_out, dict(comp_gr_db=round(gr, 2), limiter_gr_db=round(lim, 2))


def measure(y, stems, tone_midi):
    f = 440 * 2 ** ((tone_midi - 69) / 12)
    on = onset_in(y, f)
    on_tone_stem = onset_in(stems["tone"], f)
    bed = stems["pad"] + stems["keys"]
    tb = band(stems["tone"], f)
    bb = band(bed, f)
    win = (TONE_T, TONE_T + 0.15)
    hiband = lambda x: signal.sosfiltfilt(signal.butter(4, 2000, btype="high", fs=SR, output="sos"), x.mean(axis=1))
    m = dict(
        lufs_own=round(lufs(y), 2),
        true_peak_own_dbtp=round(true_peak(y), 2),
        sample_peak_dbfs=round(float(db(np.abs(y).max())), 2),
        clipped_samples=int((np.abs(y) >= 0.999).sum()),
        dc=[round(float(v), 7) for v in y.mean(axis=0)],
        first_300ms_peak_dbfs=round(float(db(np.abs(y[: int(0.3 * SR)]).max())), 1),
        last_200ms_peak_dbfs=round(float(db(np.abs(y[-int(0.2 * SR) :]).max())), 1),
        max_step=round(float(np.abs(np.diff(y, axis=0)).max()), 4),
        max_step_at_s=round(float(np.abs(np.diff(y, axis=0)).max(axis=1).argmax() / SR), 4),
        # a click is broadband: its trace is energy above 14 kHz, where these
        # instruments (low-passed) have almost none
        above_14k_peak_dbfs=round(float(db(np.abs(signal.sosfiltfilt(signal.butter(6, 14000, btype="high", fs=SR, output="sos"), y, axis=0)).max())), 1),
        tone_hz=round(f, 2),
        tone_onset_mix_s=round(on, 4),
        tone_onset_stem_s=round(on_tone_stem, 4),
        tone_onset_err_ms=round((on - TONE_T) * 1000, 1),
        pad_band_db=round(rms_db(band(stems["pad"], f), *win), 1),
        keys_band_db=round(rms_db(band(stems["keys"], f), *win), 1),
        tone_band_tone_db=round(rms_db(tb, *win), 1),
        tone_band_bed_db=round(rms_db(bb, *win), 1),
        tone_over_bed_in_band_db=round(rms_db(tb, *win) - rms_db(bb, *win), 1),
        tone_over_bed_broadband_db=round(rms_db(stems["tone"].mean(axis=1), *win) - rms_db(bed.mean(axis=1), *win), 1),
        keys_vs_pad_db_0_to_3s=round(rms_db(stems["keys"].mean(axis=1), 0.4, 3.4) - rms_db(stems["pad"].mean(axis=1), 0.4, 3.4), 1),
        tone_over_bed_above_2k_db=round(rms_db(hiband(stems["tone"]), *win) - rms_db(hiband(bed), *win), 1),
        mix_band_jump_db=round(rms_db(band(y, f), *win) - rms_db(band(y, f), TONE_T - 0.2, TONE_T - 0.02), 1),
    )
    return m


def write_png(path, rgb):
    import struct, zlib
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[i].astype(np.uint8).tobytes() for i in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


def plots(y, base, title):
    """Waveform (L above, R below, with 3.55 s marked) and a log-frequency
    spectrogram (30 Hz-16 kHz, 90 dB range), numpy + zlib only."""
    W, H = 1600, 360
    img = np.full((H, W, 3), 250, np.uint8)
    cols = np.array_split(np.arange(len(y)), W)
    for c in range(2):
        mid = H // 4 + c * H // 2
        for i, idx in enumerate(cols):
            v = y[idx, c]
            a, b = int(mid - v.max() * H / 4.4), int(mid - v.min() * H / 4.4)
            img[max(0, a) : min(H, b + 1), i] = (60, 70, 90)
        img[mid, :] = (200, 200, 200)
    for t, colr in ((TONE_T, (220, 80, 40)), (0.3, (120, 160, 220))):
        img[:, int(t / DUR * W)] = colr
    write_png(f"{base}.waveform.png", img)
    m = y.mean(axis=1)
    nfft, hop = 4096, 256
    f, tt, S = signal.stft(m, SR, nperseg=nfft, noverlap=nfft - hop, window="hann")
    S = db(np.abs(S) + 1e-9)
    S -= S.max()
    Hs = 480
    fl = np.geomspace(30, 16000, Hs)
    rows = np.searchsorted(f, fl)
    Z = S[rows][::-1]
    Z = np.clip((Z + 90) / 90, 0, 1)
    xi = np.linspace(0, Z.shape[1] - 1, W).astype(int)
    Z = Z[:, xi]
    # a warm ramp: black -> clay -> cream
    r = np.clip(Z * 1.6, 0, 1) * 255
    g = np.clip(Z * 1.3 - 0.25, 0, 1) * 235
    b = np.clip(Z * 1.4 - 0.7, 0, 1) * 220
    img = np.stack([r, g, b], axis=-1).astype(np.uint8)
    img[:, int(TONE_T / DUR * W)] = (90, 160, 255)
    write_png(f"{base}.spectrogram.png", img)


def to16(y, seed):
    """16-bit with TPDF dither; exact zeros stay exact zeros (silence and
    the faded tail are true zero, not dither hiss)."""
    rng = np.random.default_rng(seed)
    d = (rng.random(y.shape) - rng.random(y.shape))
    q = np.round(y * 32767 + d)
    q[np.abs(y) < 1e-9] = 0
    return np.clip(q, -32768, 32767).astype(np.int16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--app")
    ap.add_argument("--plots", action="store_true")
    ap.add_argument("--only", default="abc")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = Library(a.src)
    report = {}
    for v in a.only:
        name, fn = VARIANTS[v]
        rng = np.random.default_rng(87 + ord(v))  # the same render every time
        lib.used = {}
        parts = fn(lib, rng)
        y, stems, chain = master(parts, a.src)
        m = measure(y, stems, parts["tone_midi"])
        m.update(chain, name=name, samples={k: sorted(s) for k, s in lib.used.items()})
        sf.write(str(out / f"title-{v}.wav"), y, SR, subtype="PCM_24")
        if a.app:
            Path(a.app).mkdir(parents=True, exist_ok=True)
            sf.write(str(Path(a.app) / f"title-{v}.wav"), to16(y, 87 + ord(v)), SR, subtype="PCM_16")
        if a.plots:
            plots(y, str(out / f"title-{v}"), name)
        (out / f"title-{v}.measure.json").write_text(json.dumps(m, indent=1))
        report[v] = m
        print(f"{v} ({name}): onset {m['tone_onset_mix_s']:.4f}s ({m['tone_onset_err_ms']:+.1f} ms), "
              f"LUFS {m['lufs_own']}, TP {m['true_peak_own_dbtp']} dBTP, tone/bed in band "
              f"{m['tone_over_bed_in_band_db']:+.1f} dB, >2k {m['tone_over_bed_above_2k_db']:+.1f} dB, "
              f"first300 {m['first_300ms_peak_dbfs']} dBFS, step {m['max_step']}, DC {m['dc']}")
    return report


if __name__ == "__main__":
    main()
