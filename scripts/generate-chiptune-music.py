#!/usr/bin/env python3
"""Deprecated. Welcome / win / lose beds now come from scripts/generate-game-music.py.

This chiptune generator used to write:
  public/assets/audio/dungeon/music-menu.opus
  public/assets/audio/dungeon/music-win.opus
  public/assets/audio/dungeon/music-lose.opus
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

# A440 equal temperament
NOTE_HZ = {
    "rest": 0.0,
    "A1": 55.00,
    "B1": 61.74,
    "C2": 65.41,
    "D2": 73.42,
    "E2": 82.41,
    "F2": 87.31,
    "G2": 98.00,
    "A2": 110.00,
    "B2": 123.47,
    "C3": 130.81,
    "D3": 146.83,
    "E3": 164.81,
    "F3": 174.61,
    "G3": 196.00,
    "A3": 220.00,
    "B3": 246.94,
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "F4": 349.23,
    "G4": 392.00,
    "A4": 440.00,
    "B4": 493.88,
    "C5": 523.25,
    "D5": 587.33,
    "E5": 659.25,
    "F5": 698.46,
    "G5": 783.99,
    "A5": 880.00,
}


def find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path:
        return path
    candidates = [
        Path(r"D:\Portables\!codecs\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError("ffmpeg not found on PATH")


def square(freq: float, t: np.ndarray, duty: float = 0.25) -> np.ndarray:
    if freq <= 0:
        return np.zeros_like(t)
    phase = (t * freq) % 1.0
    return np.where(phase < duty, 1.0, -1.0).astype(np.float64)


def triangle(freq: float, t: np.ndarray) -> np.ndarray:
    if freq <= 0:
        return np.zeros_like(t)
    phase = (t * freq) % 1.0
    return (2.0 * np.abs(2.0 * phase - 1.0) - 1.0).astype(np.float64)


def soft_noise(n: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    raw = rng.uniform(-1.0, 1.0, n)
    # crude 1-pole lowpass for soft dust, not harsh white noise
    out = np.zeros(n, dtype=np.float64)
    prev = 0.0
    for i, sample in enumerate(raw):
        prev = prev * 0.92 + sample * 0.08
        out[i] = prev
    return out


def adsr(n: int, attack: float, decay: float, sustain: float, release: float, sr: int) -> np.ndarray:
    a = max(1, int(attack * sr))
    d = max(1, int(decay * sr))
    r = max(1, int(release * sr))
    s = max(0, n - a - d - r)
    if a + d + r > n:
        # shrink for very short notes
        scale = n / float(a + d + r)
        a = max(1, int(a * scale))
        d = max(1, int(d * scale))
        r = max(1, n - a - d)
        s = 0
    env = np.concatenate(
        [
            np.linspace(0.0, 1.0, a, endpoint=False),
            np.linspace(1.0, sustain, d, endpoint=False),
            np.full(s, sustain, dtype=np.float64),
            np.linspace(sustain, 0.0, r, endpoint=True),
        ]
    )
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return env[:n]


def render_notes(
    pattern: list[tuple[str, float]],
    bpm: float,
    *,
    wave: str = "square",
    duty: float = 0.25,
    gain: float = 0.12,
    attack: float = 0.01,
    decay: float = 0.05,
    sustain: float = 0.55,
    release: float = 0.08,
    sr: int = SAMPLE_RATE,
) -> np.ndarray:
    """pattern: list of (note_name, beats)."""
    beat = 60.0 / bpm
    total_beats = sum(beats for _, beats in pattern)
    total_samples = int(round(total_beats * beat * sr))
    buf = np.zeros(total_samples, dtype=np.float64)
    cursor = 0
    for name, beats in pattern:
        n = int(round(beats * beat * sr))
        if n <= 0:
            continue
        t = np.arange(n, dtype=np.float64) / sr
        freq = NOTE_HZ.get(name, 0.0)
        if wave == "triangle":
            tone = triangle(freq, t)
        else:
            tone = square(freq, t, duty=duty)
        env = adsr(n, attack, decay, sustain, release, sr)
        end = min(cursor + n, total_samples)
        slice_n = end - cursor
        if slice_n > 0:
            buf[cursor:end] += tone[:slice_n] * env[:slice_n] * gain
        cursor += n
    return buf


def pad_to(buf: np.ndarray, n: int) -> np.ndarray:
    if len(buf) >= n:
        return buf[:n]
    return np.pad(buf, (0, n - len(buf)))


def mix_tracks(*tracks: np.ndarray) -> np.ndarray:
    n = max(len(t) for t in tracks)
    out = np.zeros(n, dtype=np.float64)
    for track in tracks:
        out[: len(track)] += track
    return out


def soft_clip(buf: np.ndarray, ceiling: float = 0.9) -> np.ndarray:
    # gentle tanh limiting so peaks stay soft
    peak = np.max(np.abs(buf)) + 1e-9
    scaled = buf / peak * min(1.0, ceiling / 0.95)
    return np.tanh(scaled * 1.15) * 0.92


def lowpass_simple(buf: np.ndarray, alpha: float = 0.18) -> np.ndarray:
    out = np.zeros_like(buf)
    prev = 0.0
    for i, sample in enumerate(buf):
        prev = prev * (1.0 - alpha) + sample * alpha
        out[i] = prev
    return out


def crossfade_loop(buf: np.ndarray, fade_ms: float = 40.0, sr: int = SAMPLE_RATE) -> np.ndarray:
    fade = max(1, int(sr * fade_ms / 1000.0))
    if len(buf) < fade * 2:
        return buf
    out = buf.copy()
    ramp = np.linspace(0.0, 1.0, fade)
    head = out[:fade].copy()
    tail = out[-fade:].copy()
    out[:fade] = head * ramp + tail * (1.0 - ramp)
    out[-fade:] = tail * (1.0 - ramp) + head * ramp
    return out


def build_menu(sr: int = SAMPLE_RATE) -> np.ndarray:
    """Dark welcome loop: sparse minor pulse, soft square lead, distant dust."""
    bpm = 72.0
    # 16 bars of 4/4 → seamless dark menu bed
    bars = 16
    beats = bars * 4

    # Bass ostinato: root-fifth sway in A minor
    bass_cell = [
        ("A1", 1.0),
        ("rest", 0.5),
        ("A1", 0.5),
        ("E2", 1.0),
        ("rest", 0.5),
        ("C2", 0.5),
    ]
    bass_pat: list[tuple[str, float]] = []
    while sum(b for _, b in bass_pat) < beats:
        bass_pat.extend(bass_cell)
    bass_pat = trim_pattern(bass_pat, beats)
    bass = render_notes(
        bass_pat,
        bpm,
        wave="triangle",
        gain=0.16,
        attack=0.01,
        decay=0.12,
        sustain=0.45,
        release=0.14,
        sr=sr,
    )

    # Soft pulse chords (root + third), very low duty / gain
    chord_pat: list[tuple[str, float]] = []
    chord_cycle = [
        ("A2", 2.0),
        ("C3", 2.0),
        ("E2", 2.0),
        ("A2", 2.0),
        ("F2", 2.0),
        ("A2", 2.0),
        ("E2", 2.0),
        ("G2", 2.0),
    ]
    while sum(b for _, b in chord_pat) < beats:
        chord_pat.extend(chord_cycle)
    chord_pat = trim_pattern(chord_pat, beats)
    pads = render_notes(
        chord_pat,
        bpm,
        wave="square",
        duty=0.125,
        gain=0.045,
        attack=0.08,
        decay=0.2,
        sustain=0.35,
        release=0.25,
        sr=sr,
    )

    # Sparse lead motif, leaves silence between phrases
    lead_phrase = [
        ("rest", 2.0),
        ("A3", 1.0),
        ("C4", 0.5),
        ("E4", 0.5),
        ("D4", 1.0),
        ("C4", 1.0),
        ("rest", 1.0),
        ("E3", 0.5),
        ("A3", 0.5),
        ("B3", 1.0),
        ("C4", 1.0),
        ("rest", 2.0),
        ("G3", 1.0),
        ("A3", 1.5),
        ("rest", 1.5),
        ("E4", 0.5),
        ("D4", 0.5),
        ("C4", 1.0),
        ("A3", 2.0),
        ("rest", 2.0),
    ]
    lead_pat: list[tuple[str, float]] = []
    while sum(b for _, b in lead_pat) < beats:
        lead_pat.extend(lead_phrase)
    lead_pat = trim_pattern(lead_pat, beats)
    lead = render_notes(
        lead_pat,
        bpm,
        wave="square",
        duty=0.25,
        gain=0.07,
        attack=0.02,
        decay=0.08,
        sustain=0.4,
        release=0.18,
        sr=sr,
    )

    # High counter-melody, quieter, only every other cycle
    echo_phrase = [
        ("rest", 8.0),
        ("E4", 0.5),
        ("rest", 0.5),
        ("C4", 0.5),
        ("rest", 0.5),
        ("A3", 1.0),
        ("rest", 5.0),
    ]
    echo_pat: list[tuple[str, float]] = []
    while sum(b for _, b in echo_pat) < beats:
        echo_pat.extend(echo_phrase)
    echo_pat = trim_pattern(echo_pat, beats)
    echo = render_notes(
        echo_pat,
        bpm,
        wave="square",
        duty=0.125,
        gain=0.035,
        attack=0.01,
        decay=0.05,
        sustain=0.25,
        release=0.2,
        sr=sr,
    )

    n = max(len(bass), len(pads), len(lead), len(echo))
    dust = soft_noise(n, seed=11) * 0.012
    mixed = mix_tracks(
        pad_to(bass, n),
        pad_to(pads, n),
        pad_to(lead, n),
        pad_to(echo, n),
        dust,
    )
    mixed = lowpass_simple(mixed, alpha=0.22)
    mixed = soft_clip(mixed, ceiling=0.72)
    return crossfade_loop(mixed, fade_ms=60.0, sr=sr)


def build_win(sr: int = SAMPLE_RATE) -> np.ndarray:
    """Quiet triumph: major lift, still 8-bit, not carnival-loud."""
    bpm = 96.0
    bars = 8
    beats = bars * 4

    bass_cell = [
        ("C2", 1.0),
        ("rest", 0.5),
        ("G2", 0.5),
        ("A1", 1.0),
        ("rest", 0.5),
        ("E2", 0.5),
        ("F2", 1.0),
        ("rest", 0.5),
        ("C2", 0.5),
        ("G2", 1.0),
        ("rest", 0.5),
        ("D2", 0.5),
    ]
    bass_pat: list[tuple[str, float]] = []
    while sum(b for _, b in bass_pat) < beats:
        bass_pat.extend(bass_cell)
    bass_pat = trim_pattern(bass_pat, beats)
    bass = render_notes(
        bass_pat,
        bpm,
        wave="triangle",
        gain=0.15,
        attack=0.01,
        decay=0.1,
        sustain=0.5,
        release=0.12,
        sr=sr,
    )

    arpeggio = [
        ("C4", 0.5),
        ("E4", 0.5),
        ("G4", 0.5),
        ("C5", 0.5),
        ("G4", 0.5),
        ("E4", 0.5),
        ("C4", 0.5),
        ("rest", 0.5),
        ("A3", 0.5),
        ("C4", 0.5),
        ("E4", 0.5),
        ("A4", 0.5),
        ("E4", 0.5),
        ("C4", 0.5),
        ("A3", 0.5),
        ("rest", 0.5),
        ("F3", 0.5),
        ("A3", 0.5),
        ("C4", 0.5),
        ("F4", 0.5),
        ("C4", 0.5),
        ("A3", 0.5),
        ("F3", 0.5),
        ("rest", 0.5),
        ("G3", 0.5),
        ("B3", 0.5),
        ("D4", 0.5),
        ("G4", 0.5),
        ("D4", 0.5),
        ("B3", 0.5),
        ("G3", 0.5),
        ("rest", 0.5),
    ]
    arp_pat: list[tuple[str, float]] = []
    while sum(b for _, b in arp_pat) < beats:
        arp_pat.extend(arpeggio)
    arp_pat = trim_pattern(arp_pat, beats)
    arp = render_notes(
        arp_pat,
        bpm,
        wave="square",
        duty=0.25,
        gain=0.055,
        attack=0.008,
        decay=0.04,
        sustain=0.3,
        release=0.08,
        sr=sr,
    )

    lead_phrase = [
        ("E4", 1.0),
        ("G4", 1.0),
        ("A4", 1.5),
        ("G4", 0.5),
        ("E4", 1.0),
        ("C4", 1.0),
        ("D4", 1.0),
        ("E4", 1.0),
        ("F4", 1.5),
        ("E4", 0.5),
        ("D4", 1.0),
        ("C4", 1.0),
        ("G4", 2.0),
        ("rest", 1.0),
        ("E4", 1.0),
    ]
    lead_pat: list[tuple[str, float]] = []
    while sum(b for _, b in lead_pat) < beats:
        lead_pat.extend(lead_phrase)
    lead_pat = trim_pattern(lead_pat, beats)
    lead = render_notes(
        lead_pat,
        bpm,
        wave="square",
        duty=0.5,
        gain=0.08,
        attack=0.015,
        decay=0.07,
        sustain=0.45,
        release=0.16,
        sr=sr,
    )

    n = max(len(bass), len(arp), len(lead))
    dust = soft_noise(n, seed=22) * 0.008
    mixed = mix_tracks(pad_to(bass, n), pad_to(arp, n), pad_to(lead, n), dust)
    mixed = lowpass_simple(mixed, alpha=0.26)
    mixed = soft_clip(mixed, ceiling=0.78)
    return crossfade_loop(mixed, fade_ms=50.0, sr=sr)


def build_lose(sr: int = SAMPLE_RATE) -> np.ndarray:
    """Hollow defeat: descending minor fragments, empty space."""
    bpm = 58.0
    bars = 8
    beats = bars * 4

    bass_cell = [
        ("A1", 2.0),
        ("rest", 1.0),
        ("E2", 1.0),
        ("F2", 2.0),
        ("rest", 1.0),
        ("D2", 1.0),
    ]
    bass_pat: list[tuple[str, float]] = []
    while sum(b for _, b in bass_pat) < beats:
        bass_pat.extend(bass_cell)
    bass_pat = trim_pattern(bass_pat, beats)
    bass = render_notes(
        bass_pat,
        bpm,
        wave="triangle",
        gain=0.17,
        attack=0.02,
        decay=0.18,
        sustain=0.4,
        release=0.22,
        sr=sr,
    )

    lead_phrase = [
        ("E4", 1.5),
        ("D4", 0.5),
        ("C4", 1.0),
        ("A3", 2.0),
        ("rest", 1.0),
        ("G3", 1.0),
        ("A3", 1.5),
        ("B3", 0.5),
        ("C4", 1.0),
        ("A3", 2.0),
        ("rest", 2.0),
        ("E3", 2.0),
        ("F3", 1.0),
        ("E3", 1.0),
        ("D3", 2.0),
        ("rest", 2.0),
    ]
    lead_pat: list[tuple[str, float]] = []
    while sum(b for _, b in lead_pat) < beats:
        lead_pat.extend(lead_phrase)
    lead_pat = trim_pattern(lead_pat, beats)
    lead = render_notes(
        lead_pat,
        bpm,
        wave="square",
        duty=0.125,
        gain=0.06,
        attack=0.03,
        decay=0.12,
        sustain=0.35,
        release=0.28,
        sr=sr,
    )

    # Distant cold fifths
    pad_pat = [
        ("A2", 4.0),
        ("E2", 4.0),
        ("F2", 4.0),
        ("E2", 4.0),
        ("A2", 4.0),
        ("C3", 4.0),
        ("B2", 4.0),
        ("A2", 4.0),
    ]
    pad_pat = trim_pattern(pad_pat, beats)
    pads = render_notes(
        pad_pat,
        bpm,
        wave="square",
        duty=0.125,
        gain=0.03,
        attack=0.2,
        decay=0.3,
        sustain=0.25,
        release=0.4,
        sr=sr,
    )

    n = max(len(bass), len(lead), len(pads))
    dust = soft_noise(n, seed=33) * 0.015
    mixed = mix_tracks(pad_to(bass, n), pad_to(lead, n), pad_to(pads, n), dust)
    mixed = lowpass_simple(mixed, alpha=0.16)
    mixed = soft_clip(mixed, ceiling=0.7)
    return crossfade_loop(mixed, fade_ms=80.0, sr=sr)


def trim_pattern(pattern: list[tuple[str, float]], beats: float) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    total = 0.0
    for name, b in pattern:
        if total >= beats:
            break
        take = min(b, beats - total)
        if take > 0:
            out.append((name, take))
            total += take
    return out


def write_wav(path: Path, mono: np.ndarray, sr: int = SAMPLE_RATE) -> None:
    # mild stereo width from delayed side (chiptune still mono-ish)
    delay = int(sr * 0.012)
    left = mono
    right = np.concatenate([np.zeros(delay), mono[:-delay]]) if delay < len(mono) else mono
    stereo = np.stack([left, right], axis=1)
    peak = np.max(np.abs(stereo)) + 1e-9
    stereo = stereo / peak * 0.85
    pcm = np.clip(stereo * 32767.0, -32768, 32767).astype(np.int16)
    wavfile.write(str(path), sr, pcm)


def encode_opus(
    ffmpeg: str,
    wav_path: Path,
    opus_path: Path,
    *,
    target_lufs: float,
    bitrate: str = "96k",
) -> None:
    # Match dungeon pack: loudnorm + soft limiter, stereo, 48 kHz Opus.
    af = f"loudnorm=I={target_lufs}:TP=-2:LRA=8,alimiter=limit=0.5:level=0"
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        str(wav_path),
        "-map",
        "0:a:0",
        "-vn",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-af",
        af,
        "-c:a",
        "libopus",
        "-b:a",
        bitrate,
        str(opus_path),
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT,
        help="Directory for music-*.opus files",
    )
    parser.add_argument("--keep-wav", action="store_true", help="Keep intermediate WAV files")
    args = parser.parse_args()

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()

    tracks = [
        ("music-menu", build_menu, -30.0, "96k"),
        ("music-win", build_win, -27.0, "96k"),
        ("music-lose", build_lose, -28.0, "96k"),
    ]

    with tempfile.TemporaryDirectory(prefix="chiptune-") as tmp:
        tmp_path = Path(tmp)
        for name, builder, lufs, bitrate in tracks:
            print(f"Rendering {name}…")
            audio = builder(SAMPLE_RATE)
            wav_path = tmp_path / f"{name}.wav"
            write_wav(wav_path, audio, SAMPLE_RATE)
            if args.keep_wav:
                keep = out_dir / f"{name}.wav"
                keep.write_bytes(wav_path.read_bytes())
                print(f"  kept {keep}")
            opus_path = out_dir / f"{name}.opus"
            encode_opus(ffmpeg, wav_path, opus_path, target_lufs=lufs, bitrate=bitrate)
            size_kb = opus_path.stat().st_size / 1024.0
            duration = len(audio) / SAMPLE_RATE
            print(f"  wrote {opus_path} ({size_kb:.1f} KiB, ~{duration:.1f}s)")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
