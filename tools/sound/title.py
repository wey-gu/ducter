#!/usr/bin/env python3
"""The title moment's sound (D87): an original swell and one clear tone.

Synthesized from nothing but numpy, so anyone can read, change and
re-render it. No samples, no melody: one warm chord that opens, and one
glassy tone on the beat Ducter opens its eyes.

    python3 tools/sound/title.py OUT_DIR

writes OUT_DIR/title.wav (48 kHz, 16-bit stereo, the master), and with
--plots also a waveform and a spectrogram as PNGs (numpy + zlib only).
scripts/sound-title.sh turns the master into the app's Ogg Vorbis
(apps/desktop/internal/theme/sound/title.ogg) and the prototype's AAC.

Timeline (seconds; the picture follows the same clock, see
design/onboarding.md, "The title moment"):

    0.00-0.35  silence (the window settles; nothing under -60 dBFS)
    0.35-3.40  the swell: D-A-E-A (Dsus2, open), low-pass opening 140 -> 950 Hz
    3.40       F#3 enters under the bell: sus2 -> D major, the "oh, it's you"
    3.55       the tone: A5 with glass partials, eyes open
    5.20       the chord starts to let go; reverb carries it
    9.40       silence

Levels: peak -14 dBFS (sample peak, checked 4x oversampled), the bell
about 4 dB above the pad at its strike.
"""

import struct
import sys
import zlib
from pathlib import Path

import numpy as np

SR = 48000
DUR = 9.6
PEAK_DBFS = -14.0
RNG = np.random.default_rng(87)  # D87: the same render every time

t = np.arange(int(SR * DUR)) / SR


def smooth(x):
    """0..1 -> 0..1, eased in and out (raised cosine)."""
    x = np.clip(x, 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def env(points):
    """A piecewise envelope through (time, level) points, eased between."""
    out = np.zeros_like(t)
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        m = (t >= t0) & (t < t1)
        out[m] = v0 + (v1 - v0) * smooth((t[m] - t0) / (t1 - t0))
    out[t >= points[-1][0]] = points[-1][1]
    return out


def lowpass_gain(f, cutoff):
    """A 24 dB/octave low-pass's gain at f for a cutoff (arrays)."""
    return 1.0 / (1.0 + (f / cutoff) ** 8) ** 0.5


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# --- the pad: detuned saws, built from their partials, through a low-pass
# that opens with the swell. Additive, so the filter is exact per partial
# and nothing aliases.

cutoff = env([(0, 140), (0.35, 140), (3.4, 950), (5.2, 820), (DUR, 300)])


def saw_voice(f0, detunes_cents, amp, onset, attack, pan):
    """A stack of slightly detuned saws: each partial n at 1/n, faded by
    the time-varying low-pass. Returns (left, right)."""
    left = np.zeros_like(t)
    right = np.zeros_like(t)
    n_max = int(4000 / f0)
    for k, c in enumerate(detunes_cents):
        f = f0 * 2 ** (c / 1200)
        phase0 = RNG.uniform(0, 2 * np.pi)
        # Each detuned copy leans a little left or right: width without a chorus.
        p = np.clip(pan + (k - (len(detunes_cents) - 1) / 2) * 0.22, -1, 1)
        gl, gr = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
        sig = np.zeros_like(t)
        for n in range(1, n_max + 1):
            fn = f * n
            sig += lowpass_gain(fn, cutoff) / n * np.sin(2 * np.pi * fn * t + phase0 * n)
        left += gl * sig
        right += gr * sig
    shape = env([(0, 0), (onset, 0), (onset + attack, 1)])
    return amp * shape * left, amp * shape * right


DET = (-7, -2.5, 2.5, 7)
voices = [
    # (midi, amp, onset, attack, pan)
    (38, 0.50, 0.35, 3.0, -0.10),  # D2, the floor
    (45, 0.34, 0.55, 2.8, 0.15),   # A2
    (52, 0.22, 0.85, 2.5, -0.25),  # E3, the open second (sus2)
    (57, 0.16, 1.20, 2.2, 0.30),   # A3
    (54, 0.20, 3.40, 0.9, 0.05),   # F#3: the chord turns major under the tone
]
padL = np.zeros_like(t)
padR = np.zeros_like(t)
for m, a, on, att, pan in voices:
    l, r = saw_voice(hz(m), DET, a, on, att, pan)
    padL += l
    padR += r

# A sine an octave under the floor, felt more than heard (a laptop drops it).
sub = 0.28 * np.sin(2 * np.pi * hz(26) * t) * env([(0, 0), (0.4, 0), (3.3, 1)])
padL += sub
padR += sub

# The swell rises, holds, and lets go slowly.
pad_amp = env([(0, 0), (0.35, 0), (3.4, 1.0), (5.2, 0.92), (8.6, 0.0)])
padL *= pad_amp
padR *= pad_amp

# --- the tone: one strike, glass-like. Inharmonic partials (a free bar's
# 1 : 2.76 : 5.40 : 8.93, plus a hum an octave under and a near-octave),
# each with its own decay; a 6 ms raised-cosine attack, so no click.

BELL_AT = 3.55
F_BELL = hz(81)  # A5
partials = [
    # (ratio, amp, decay seconds, pan)
    (0.5, 0.20, 3.2, -0.15),
    (1.0, 1.00, 3.6, 0.0),
    (1.0 + 1.6 / 880, 0.55, 3.4, 0.10),  # a slow 1.6 Hz shimmer against the fundamental
    (2.003, 0.30, 2.2, 0.20),
    (2.76, 0.30, 1.5, -0.20),
    (5.40, 0.12, 0.65, 0.25),
    (8.93, 0.05, 0.30, -0.25),
]
tb = np.clip(t - BELL_AT, 0, None)
bell_on = (t >= BELL_AT).astype(float)
attack = smooth(tb / 0.006)
bellL = np.zeros_like(t)
bellR = np.zeros_like(t)
for ratio, a, d, pan in partials:
    f = F_BELL * ratio
    if f > 16000:
        continue
    s = a * np.sin(2 * np.pi * f * tb) * np.exp(-tb / d) * attack * bell_on
    bellL += np.cos((pan + 1) * np.pi / 4) * s
    bellR += np.sin((pan + 1) * np.pi / 4) * s
BELL_GAIN = 1.0
bellL *= BELL_GAIN
bellR *= BELL_GAIN

# --- the room: a long, dark tail, made the simple way: exponentially
# decaying noise per ear (different noise, so it is wide), darker as it
# decays, convolved by FFT.

def impulse(seed, rt60=3.8):
    rng = np.random.default_rng(seed)
    n = int(SR * rt60)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # Darken: a one-pole low-pass whose cutoff falls with time, run in
    # blocks (cheap and smooth enough for a tail).
    out = np.zeros(n)
    y = 0.0
    block = 256
    for i in range(0, n, block):
        fc = 6000 * np.exp(-tt[i] / 1.2) + 500
        a = np.exp(-2 * np.pi * fc / SR)
        seg = noise[i : i + block]
        res = np.empty_like(seg)
        for j, x in enumerate(seg):
            y = (1 - a) * x + a * y
            res[j] = y
        out[i : i + block] = res
    out *= np.exp(-6.91 * tt / rt60)  # -60 dB at rt60
    out *= smooth(tt / 0.02)  # a 20 ms pre-swell, no sharp early reflection
    return out / np.sqrt(np.sum(out**2))


def convolve(x, h):
    n = len(x) + len(h) - 1
    size = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)[: len(x)]
    return y


irL, irR = impulse(1), impulse(2)
dryL, dryR = padL + bellL, padR + bellR
# The bell goes into the room harder than the pad: the tone should bloom.
wetL = convolve(padL * 0.6 + bellL * 1.0, irL)
wetR = convolve(padR * 0.6 + bellR * 1.0, irR)
WET = 0.55
L = 0.75 * dryL + WET * wetL
R = 0.75 * dryR + WET * wetR

# --- edges: hard silence before 0.35 s, a 1.2 s fade to true zero at the end.
edge = env([(0, 0), (0.30, 0), (0.36, 1), (DUR - 1.2, 1), (DUR - 0.02, 0)])
L *= edge
R *= edge

# --- level: sample peak at PEAK_DBFS, checked on a 4x oversampled copy.

def true_peak(x):
    n = len(x)
    X = np.fft.rfft(x)
    up = np.fft.irfft(np.concatenate([X, np.zeros(3 * n // 2)]), 4 * n) * 4
    return float(np.max(np.abs(up)))


target = 10 ** (PEAK_DBFS / 20)
peak = max(true_peak(L), true_peak(R))
L *= target / peak
R *= target / peak


def dbfs(x):
    return 20 * np.log10(max(float(np.max(np.abs(x))), 1e-12))


def rms_db(x):
    return 20 * np.log10(max(float(np.sqrt(np.mean(x**2))), 1e-12))


def report():
    mono = (L + R) / 2
    print(f"length {DUR:.2f} s, {SR} Hz, stereo")
    print(f"peak {max(dbfs(L), dbfs(R)):.1f} dBFS (true peak target {PEAK_DBFS})")
    print(f"first 300 ms peak {dbfs(mono[: int(0.3 * SR)]):.1f} dBFS")
    print(f"last 50 ms peak {dbfs(mono[-int(0.05 * SR):]):.1f} dBFS")
    for a, b in [(0.3, 1.0), (1.0, 2.0), (2.0, 3.0), (3.0, 3.5), (3.5, 3.6), (3.6, 4.5), (4.5, 6.0), (6.0, 8.0), (8.0, 9.6)]:
        seg = mono[int(a * SR) : int(b * SR)]
        print(f"  {a:4.1f}-{b:4.1f} s  rms {rms_db(seg):6.1f} dBFS  peak {dbfs(seg):6.1f}")
    # Clicks: the largest sample-to-sample jump, against the signal's peak.
    jump = float(np.max(np.abs(np.diff(mono))))
    print(f"largest step {20*np.log10(jump):.1f} dBFS (a click would sit near the peak)")
    # DC.
    print(f"DC {float(np.mean(mono)):.2e}")


def write_wav(path, left, right):
    data = np.stack([left, right], axis=1)
    pcm = np.clip(np.round(data * 32767), -32768, 32767).astype("<i2").tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, SR, SR * 4, 4, 16))
        f.write(b"data" + struct.pack("<I", len(pcm)) + pcm)


# --- plots without matplotlib: a grey PNG writer.

def write_png(path, rgb):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[y].astype(np.uint8).tobytes() for y in range(h))

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def plots(out):
    mono = (L + R) / 2
    W, H = 1200, 300
    # Waveform: min/max per column, with -14 and -20 dBFS lines and 1 s ticks.
    img = np.full((H, W, 3), 250, np.uint8)
    cols = np.array_split(mono, W)
    for x, c in enumerate(cols):
        lo, hi = float(c.min()), float(c.max())
        y0 = int(H / 2 - hi / 0.25 * (H / 2))
        y1 = int(H / 2 - lo / 0.25 * (H / 2))
        img[max(0, y0) : min(H, y1 + 1), x] = (60, 45, 35)
    for db, col in [(-14, (220, 90, 40)), (-20, (180, 180, 180))]:
        v = 10 ** (db / 20)
        for s in (1, -1):
            y = int(H / 2 - s * v / 0.25 * (H / 2))
            img[y, :] = col
    for sec in range(int(DUR) + 1):
        img[:, min(W - 1, int(sec / DUR * W))] = (200, 200, 220)
    img[:, int(BELL_AT / DUR * W)] = (40, 120, 200)
    write_png(out / "title-waveform.png", img)

    # Spectrogram: 2048-point frames, log frequency 40 Hz-12 kHz, -90..-10 dB.
    n, hop = 4096, 480
    win = np.hanning(n)
    frames = [mono[i : i + n] * win for i in range(0, len(mono) - n, hop)]
    S = np.abs(np.fft.rfft(np.array(frames), axis=1)) / (n / 4)
    S = 20 * np.log10(S + 1e-9)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    H2 = 360
    rows = np.geomspace(40, 12000, H2)[::-1]
    idx = np.searchsorted(freqs, rows)
    spec = S[:, idx].T  # H2 x frames
    v = np.clip((spec + 90) / 80, 0, 1)
    img2 = np.zeros((H2, spec.shape[1], 3), np.uint8)
    img2[..., 0] = (255 * v ** 0.8).astype(np.uint8)
    img2[..., 1] = (200 * v ** 1.6).astype(np.uint8)
    img2[..., 2] = (90 * v ** 3).astype(np.uint8)
    for f in (100, 1000, 10000):
        y = int(np.searchsorted(-rows, -f))
        img2[min(H2 - 1, y), :] = (80, 80, 120)
    write_png(out / "title-spectrogram.png", img2)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = Path(args[0] if args else ".")
    out.mkdir(parents=True, exist_ok=True)
    write_wav(out / "title.wav", L, R)
    report()
    if "--plots" in sys.argv:
        plots(out)
        print(f"plots in {out}")
