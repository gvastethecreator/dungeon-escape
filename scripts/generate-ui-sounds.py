#!/usr/bin/env python3
"""Generate short UI SFX (clicks / ticks / select) for Dungeon Escape.

Outputs Opus files into public/assets/audio/dungeon/.
Requires: numpy, scipy, ffmpeg.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "public" / "assets" / "audio" / "dungeon"
SAMPLE_RATE = 44100


def find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path:
        return path
    for candidate in (
        Path(r"D:\Portables\!codecs\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
    ):
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError("ffmpeg not found on PATH")


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    a = max(1, int(attack * SAMPLE_RATE))
    r = max(1, int(release * SAMPLE_RATE))
    env[:a] = np.linspace(0.0, 1.0, a, endpoint=False)
    if r < n:
        env[-r:] = np.linspace(1.0, 0.0, r)
    return env


def square(freq: float, t: np.ndarray, duty: float = 0.3) -> np.ndarray:
    return np.where((t * freq) % 1.0 < duty, 1.0, -1.0)


def noise(n: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.uniform(-1.0, 1.0, n)


def soft_clip(x: np.ndarray, amount: float = 0.85) -> np.ndarray:
    peak = np.max(np.abs(x)) + 1e-9
    x = x / peak * amount
    return np.tanh(x * 1.4)


def to_int16(x: np.ndarray) -> np.ndarray:
    x = soft_clip(x)
    return np.clip(x * 32767.0, -32768, 32767).astype(np.int16)


def render(seconds: float) -> tuple[np.ndarray, np.ndarray]:
    n = max(1, int(seconds * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    return t, np.zeros(n, dtype=np.float64)


def lowpass(x: np.ndarray, cutoff_hz: float = 1400.0) -> np.ndarray:
    """One-pole low-pass so UI blips feel duller / more opaque."""
    if len(x) == 0:
        return x
    rc = 1.0 / (2.0 * np.pi * cutoff_hz)
    dt = 1.0 / SAMPLE_RATE
    alpha = dt / (rc + dt)
    y = np.empty_like(x)
    acc = 0.0
    for i, sample in enumerate(x):
        acc = acc + alpha * (sample - acc)
        y[i] = acc
    return y


def dull(x: np.ndarray, cutoff_hz: float = 1400.0, gain: float = 0.72) -> np.ndarray:
    return lowpass(x, cutoff_hz) * gain


def make_click() -> np.ndarray:
    t, out = render(0.1)
    out += square(640, t, 0.32) * 0.28
    out += square(960, t, 0.22) * 0.12
    n = noise(len(t), 11) * envelope(len(t), 0.001, 0.06) * 0.1
    out = dull(out * envelope(len(t), 0.002, 0.08) + n, 1200, 0.7)
    return out


def make_tick() -> np.ndarray:
    t, out = render(0.05)
    out += square(1100, t, 0.28) * 0.22
    out += noise(len(t), 22) * 0.04
    out = dull(out * envelope(len(t), 0.001, 0.035), 1300, 0.65)
    return out


def make_hover() -> np.ndarray:
    t, out = render(0.04)
    out += square(1350, t, 0.2) * 0.12
    out = dull(out * envelope(len(t), 0.0008, 0.03), 1500, 0.55)
    return out


def make_select() -> np.ndarray:
    t, out = render(0.13)
    a = square(560, t, 0.32) * envelope(len(t), 0.002, 0.09) * 0.28
    b = square(820, t, 0.28) * envelope(len(t), 0.002, 0.1) * 0.18
    delay = int(0.04 * SAMPLE_RATE)
    b = np.pad(b, (delay, 0))[: len(t)]
    out = dull(a + b + noise(len(t), 33) * envelope(len(t), 0.001, 0.06) * 0.05, 1100, 0.72)
    return out


def make_back() -> np.ndarray:
    t, out = render(0.11)
    a = square(700, t, 0.3) * envelope(len(t), 0.002, 0.08) * 0.24
    b = square(480, t, 0.32) * envelope(len(t), 0.002, 0.09) * 0.2
    delay = int(0.035 * SAMPLE_RATE)
    b = np.pad(b, (delay, 0))[: len(t)]
    out = dull(a + b, 1050, 0.7)
    return out


def make_toggle() -> np.ndarray:
    t, out = render(0.09)
    out += square(420, t, 0.36) * 0.16
    out += square(780, t, 0.24) * 0.18
    out += noise(len(t), 44) * 0.06
    out = dull(out * envelope(len(t), 0.0015, 0.06), 1150, 0.68)
    return out


def make_deny() -> np.ndarray:
    t, out = render(0.15)
    out += square(180, t, 0.42) * 0.28
    out += square(150, t, 0.48) * 0.18
    out += noise(len(t), 55) * 0.08
    out = dull(out * envelope(len(t), 0.0025, 0.11), 900, 0.7)
    return out


SOUNDS = {
    "ui-click": make_click,
    "ui-tick": make_tick,
    "ui-hover": make_hover,
    "ui-select": make_select,
    "ui-back": make_back,
    "ui-toggle": make_toggle,
    "ui-deny": make_deny,
}


def encode_opus(ffmpeg: str, wav_path: Path, opus_path: Path, target_lufs: float = -32.0) -> None:
    filter_chain = (
        f"loudnorm=I={target_lufs}:TP=-2.0:LRA=7,"
        "alimiter=limit=-2dB:attack=1:release=30"
    )
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(wav_path),
        "-af",
        filter_chain,
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-ac",
        "1",
        "-ar",
        "48000",
        str(opus_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate UI click/tick SFX")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()

    with tempfile.TemporaryDirectory(prefix="de-ui-sfx-") as tmp:
        tmp_path = Path(tmp)
        for name, factory in SOUNDS.items():
            samples = to_int16(factory())
            wav_path = tmp_path / f"{name}.wav"
            opus_path = args.out / f"{name}.opus"
            wavfile.write(wav_path, SAMPLE_RATE, samples)
            encode_opus(ffmpeg, wav_path, opus_path)
            print(f"wrote {opus_path.relative_to(ROOT)} ({opus_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as err:  # noqa: BLE001
        print(err, file=sys.stderr)
        raise SystemExit(1)
