#!/usr/bin/env python3
"""Synthesize the AgapAI signature notification chime (stdlib only).

A warm, friendly three-note rising motif that mirrors the haptic "tap-tap-thrum"
signature: two short bell taps and a longer confirming note. Bell-like tones
(fundamental + soft harmonics) with an exponential decay, 44.1kHz 16-bit mono.
Kept well under iOS's 30s limit (~1.4s total).
"""
import math
import struct
import wave

SR = 44100
AMP = 0.62  # headroom to avoid clipping when harmonics stack


def bell(freq, dur, decay=8.0):
    """One bell-ish note: fundamental + 2nd/3rd partials under an exp decay."""
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-decay * t)
        s = (
            1.00 * math.sin(2 * math.pi * freq * t)
            + 0.45 * math.sin(2 * math.pi * freq * 2 * t)
            + 0.22 * math.sin(2 * math.pi * freq * 3 * t)
        ) / 1.67
        out.append(env * s)
    return out


def mix_at(buf, samples, start_sec):
    """Add `samples` into `buf` starting at start_sec (extends buf as needed)."""
    start = int(SR * start_sec)
    end = start + len(samples)
    if end > len(buf):
        buf.extend([0.0] * (end - len(buf)))
    for i, s in enumerate(samples):
        buf[start + i] += s


# Notes: A5, A5 (short taps), then E6 (longer confirm) — a bright, hopeful lift.
A5, E6 = 880.0, 1318.51
buf = []
mix_at(buf, bell(A5, 0.28, decay=12.0), 0.00)
mix_at(buf, bell(A5, 0.28, decay=12.0), 0.16)
mix_at(buf, bell(E6, 0.90, decay=5.0), 0.34)

# Tail pad so the decay isn't cut off.
buf.extend([0.0] * int(SR * 0.1))

# Normalize to AMP and write 16-bit PCM.
peak = max(1e-6, max(abs(x) for x in buf))
scale = AMP / peak
frames = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, x * scale)) * 32767)) for x in buf)

with wave.open("assets/sounds/agapai.wav", "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(frames)

print(f"wrote assets/sounds/agapai.wav ({len(buf) / SR:.2f}s, {len(frames)} bytes)")
