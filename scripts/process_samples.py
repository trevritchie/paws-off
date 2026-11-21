#!/usr/bin/env python3
"""
Acoustic Instrument & SATB Choir Sample Processing Pipeline for Paws Off.

Documents and reproduces the three offline audio-processing pipelines used to
build all 16 sampled instrument packs (20 FluidR3_GM SATB choir MP3s in
public/choir/ and 164 multi-sample acoustic MP3s across 15 instrument packs in
public/samples/):

1. choir           : FluidR3_GM Ooh/Ahh -> 0.65s crossfade splice (4.8s), register-tilted -18 LUFS
2. remote-acoustic : Salamander / VSCO 2 CE / FluidR3_GM -> struck or 0.65s spliced sustain
3. movemental      : Local tonejs-instruments packs -> adaptive crossfade loop or decaying trim

Usage examples:
    python3 scripts/process_samples.py --verify
    python3 scripts/process_samples.py --list
    python3 scripts/process_samples.py --pack grand-piano
    python3 scripts/process_samples.py --pack chamber-cello --src-root ../Movemental/public/samples
"""

import argparse
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CHOIR_OUT_DIR = REPO_ROOT / "public" / "choir"
SAMPLES_OUT_DIR = REPO_ROOT / "public" / "samples"
DEFAULT_SRC_ROOT = REPO_ROOT.parent / "Movemental" / "public" / "samples"

SR = 44100

STANDARD_10_MIDI_NAMES: list[tuple[int, str]] = [
    (40, "E2"),
    (44, "Ab2"),
    (48, "C3"),
    (52, "E3"),
    (56, "Ab3"),
    (60, "C4"),
    (64, "E4"),
    (68, "Ab4"),
    (72, "C5"),
    (76, "E5"),
]

CHOIR_CONFIG: dict[str, Any] = {
    "id": "satb-choir",
    "pipeline": "choir",
    "sustained": True,
    "target_lufs": -18.0,
    "peak_ceil": 0.92,
    "af": "highpass=f=65,lowpass=f=6800",
    "vowels": [("ooh", "voice_oohs-mp3"), ("ahh", "choir_aahs-mp3")],
    "anchors": STANDARD_10_MIDI_NAMES,
}

REMOTE_ACOUSTIC_PACKS: dict[str, dict[str, Any]] = {
    "grand-piano": {
        "pipeline": "remote-acoustic",
        "kind": "struck",
        "af": "highpass=f=45,lowpass=f=8500",
        "max_dur": 3.8,
        "target_lufs": -17.5,
        "measure_window_sec": 1.4,
        "peak_ceil": 0.90,
        "anchors": [
            (39, "https://tonejs.github.io/audio/salamander/Ds2.mp3"),
            (42, "https://tonejs.github.io/audio/salamander/Fs2.mp3"),
            (45, "https://tonejs.github.io/audio/salamander/A2.mp3"),
            (48, "https://tonejs.github.io/audio/salamander/C3.mp3"),
            (51, "https://tonejs.github.io/audio/salamander/Ds3.mp3"),
            (54, "https://tonejs.github.io/audio/salamander/Fs3.mp3"),
            (57, "https://tonejs.github.io/audio/salamander/A3.mp3"),
            (60, "https://tonejs.github.io/audio/salamander/C4.mp3"),
            (63, "https://tonejs.github.io/audio/salamander/Ds4.mp3"),
            (66, "https://tonejs.github.io/audio/salamander/Fs4.mp3"),
            (69, "https://tonejs.github.io/audio/salamander/A4.mp3"),
            (72, "https://tonejs.github.io/audio/salamander/C5.mp3"),
            (75, "https://tonejs.github.io/audio/salamander/Ds5.mp3"),
            (78, "https://tonejs.github.io/audio/salamander/Fs5.mp3"),
        ],
    },
    "concert-harp": {
        "pipeline": "remote-acoustic",
        "kind": "struck",
        "af": "highpass=f=55,lowpass=f=8200",
        "max_dur": 3.6,
        "target_lufs": -18.0,
        "measure_window_sec": 1.2,
        "peak_ceil": 0.90,
        "anchors": [
            (38, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D2_mf.wav"),
            (41, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F2_mf.wav"),
            (45, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_A2_mf.wav"),
            (48, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_C3_mf.wav"),
            (52, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E3_mf.wav"),
            (55, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G3_mf.wav"),
            (59, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B3_mf.wav"),
            (62, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D4_mf.wav"),
            (65, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F4_mf.wav"),
            (69, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_A4_mf.wav"),
            (72, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_C5_mf.wav"),
            (76, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E5_mf.wav"),
            (79, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G5_mf.wav"),
        ],
    },
    "warm-strings": {
        "pipeline": "remote-acoustic",
        "kind": "sustained",
        "af": "highpass=f=60,lowpass=f=6400",
        "target_lufs": -18.5,
        "peak_ceil": 0.90,
        "anchors": [
            (midi, f"https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/string_ensemble_1-mp3/{name}.mp3")
            for midi, name in STANDARD_10_MIDI_NAMES
        ],
    },
    "pipe-organ": {
        "pipeline": "remote-acoustic",
        "kind": "sustained",
        "af": "highpass=f=50,equalizer=f=240:t=q:w=1.0:g=1.5,lowpass=f=4200",
        "target_lufs": -19.0,
        "peak_ceil": 0.90,
        "anchors": [
            (midi, f"https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/church_organ-mp3/{name}.mp3")
            for midi, name in STANDARD_10_MIDI_NAMES
        ],
    },
    "marimba": {
        "pipeline": "remote-acoustic",
        "kind": "struck",
        "af": "highpass=f=60,lowpass=f=6200",
        "max_dur": 2.2,
        "target_lufs": -18.0,
        "measure_window_sec": 0.7,
        "peak_ceil": 0.90,
        "anchors": [
            (36, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_C2_loud_01.wav"),
            (43, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_G2_loud_01.wav"),
            (47, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_B2_loud_01.wav"),
            (53, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_F3_loud_01.wav"),
            (60, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_C4_loud_01.wav"),
            (67, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_G4_loud_01.wav"),
            (71, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_B4_loud_01.wav"),
            (77, "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Marimba/Marimba_hit_Outrigger_F5_loud_01.wav"),
        ],
    },
    "pizzicato-strings": {
        "pipeline": "remote-acoustic",
        "kind": "struck",
        "af": "highpass=f=60,lowpass=f=6800",
        "max_dur": 1.6,
        "target_lufs": -18.5,
        "measure_window_sec": 0.55,
        "peak_ceil": 0.88,
        "anchors": [
            (midi, f"https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/pizzicato_strings-mp3/{name}.mp3")
            for midi, name in STANDARD_10_MIDI_NAMES
        ],
    },
    "warm-sax": {
        "pipeline": "remote-acoustic",
        "kind": "sustained",
        "af": "highpass=f=55,equalizer=f=2400:t=q:w=1.2:g=-2.0,lowpass=f=5200",
        "target_lufs": -18.8,
        "peak_ceil": 0.88,
        "anchors": [
            (midi, f"https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/tenor_sax-mp3/{name}.mp3")
            for midi, name in STANDARD_10_MIDI_NAMES
        ],
    },
    "warm-trombone": {
        "pipeline": "remote-acoustic",
        "kind": "sustained",
        "af": "highpass=f=50,equalizer=f=300:t=q:w=1.0:g=1.2,lowpass=f=4400",
        "target_lufs": -18.8,
        "peak_ceil": 0.88,
        "anchors": [
            (midi, f"https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trombone-mp3/{name}.mp3")
            for midi, name in STANDARD_10_MIDI_NAMES
        ],
    },
}

MOVEMENTAL_PACKS: dict[str, dict[str, Any]] = {
    "french-horn": {
        "pipeline": "movemental",
        "src_dir": "french-horn",
        "sustained": True,
        "target_lufs": -19.0,
        "peak_ceil": 0.63,
        "af": "highpass=f=50,lowpass=f=5200",
        "anchors": [
            (36, "C2.mp3"),
            (39, "Ds2.mp3"),
            (43, "G2.mp3"),
            (50, "D3.mp3"),
            (53, "F3.mp3"),
            (57, "A3.mp3"),
            (60, "C4.mp3"),
            (74, "D5.mp3"),
            (77, "F5.mp3"),
        ],
    },
    "chamber-cello": {
        "pipeline": "movemental",
        "src_dir": "cello",
        "sustained": True,
        "target_lufs": -19.0,
        "peak_ceil": 0.63,
        "af": "highpass=f=55,lowpass=f=5800",
        "anchors": [
            (40, "E2.mp3"),
            (43, "G2.mp3"),
            (47, "B2.mp3"),
            (50, "D3.mp3"),
            (53, "F3.mp3"),
            (57, "A3.mp3"),
            (60, "C4.mp3"),
            (64, "E4.mp3"),
            (67, "G4.mp3"),
            (71, "B4.mp3"),
            (72, "C5.mp3"),
        ],
    },
    "harmonium": {
        "pipeline": "movemental",
        "src_dir": "harmonium",
        "sustained": True,
        "target_lufs": -19.5,
        "peak_ceil": 0.60,
        "af": "highpass=f=60,equalizer=f=2200:t=q:w=1.2:g=-3.0,lowpass=f=3600",
        "anchors": [
            (40, "E2.mp3"),
            (43, "G2.mp3"),
            (46, "As2.mp3"),
            (49, "Cs3.mp3"),
            (52, "E3.mp3"),
            (55, "G3.mp3"),
            (58, "As3.mp3"),
            (61, "Cs4.mp3"),
            (64, "E4.mp3"),
            (67, "G4.mp3"),
            (70, "As4.mp3"),
            (74, "D5.mp3"),
        ],
    },
    "clean-guitar": {
        "pipeline": "movemental",
        "src_dir": "guitar-electric",
        "sustained": False,
        "max_dur": 3.8,
        "target_lufs": -19.2,
        "peak_ceil": 0.74,
        "af": "highpass=f=65,lowpass=f=6800",
        "anchors": [
            (42, "Fs2.mp3"),
            (45, "A2.mp3"),
            (48, "C3.mp3"),
            (51, "Ds3.mp3"),
            (54, "Fs3.mp3"),
            (57, "A3.mp3"),
            (60, "C4.mp3"),
            (63, "Ds4.mp3"),
            (66, "Fs4.mp3"),
            (69, "A4.mp3"),
            (72, "C5.mp3"),
            (75, "Ds5.mp3"),
            (78, "Fs5.mp3"),
        ],
    },
    "nylon-guitar": {
        "pipeline": "movemental",
        "src_dir": "guitar-nylon",
        "sustained": False,
        "max_dur": 3.4,
        "target_lufs": -19.8,
        "peak_ceil": 0.75,
        "af": "highpass=f=65,lowpass=f=6400",
        "anchors": [
            (40, "E2.mp3"),
            (44, "Gs2.mp3"),
            (47, "B2.mp3"),
            (50, "D3.mp3"),
            (54, "Fs3.mp3"),
            (57, "A3.mp3"),
            (61, "Cs4.mp3"),
            (64, "E4.mp3"),
            (68, "Gs4.mp3"),
            (71, "B4.mp3"),
            (76, "E5.mp3"),
        ],
    },
    "woodwind-choir": {
        "pipeline": "movemental",
        "src_dir": "",
        "sustained": True,
        "target_lufs": -19.0,
        "peak_ceil": 0.64,
        "af": "highpass=f=55,lowpass=f=6400",
        "anchors": [
            (43, "bassoon/G2.mp3"),
            (45, "bassoon/A2.mp3"),
            (48, "bassoon/C3.mp3"),
            (50, "clarinet/D3.mp3"),
            (53, "clarinet/F3.mp3"),
            (58, "clarinet/As3.mp3"),
            (62, "clarinet/D4.mp3"),
            (65, "clarinet/F4.mp3"),
            (70, "clarinet/As4.mp3"),
            (72, "flute/C5.mp3"),
            (76, "flute/E5.mp3"),
        ],
    },
    "steel-guitar": {
        "pipeline": "movemental",
        "src_dir": "guitar-acoustic",
        "sustained": False,
        "max_dur": 3.5,
        "target_lufs": -19.2,
        "peak_ceil": 0.75,
        "af": "highpass=f=65,lowpass=f=7400",
        "anchors": [
            (40, "E2.mp3"),
            (43, "G2.mp3"),
            (46, "As2.mp3"),
            (49, "Cs3.mp3"),
            (52, "E3.mp3"),
            (55, "G3.mp3"),
            (58, "As3.mp3"),
            (61, "Cs4.mp3"),
            (64, "E4.mp3"),
            (67, "G4.mp3"),
            (70, "As4.mp3"),
            (74, "D5.mp3"),
        ],
    },
}

ALL_PACK_IDS: list[str] = [
    "satb-choir",
    *REMOTE_ACOUSTIC_PACKS.keys(),
    *MOVEMENTAL_PACKS.keys(),
]


def biquad(
    x: list[float],
    b0: float,
    b1: float,
    b2: float,
    a1: float,
    a2: float,
) -> list[float]:
    y = [0.0] * len(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, x0 in enumerate(x):
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y[i] = y0
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return y


def k_weight_lufs(samples: list[float]) -> float:
    if not samples:
        return -60.0
    s1 = biquad(
        samples,
        1.5308412300503478,
        -2.6509799951547297,
        1.1690790799215869,
        -1.6636551132560204,
        0.7125954280732254,
    )
    kw = biquad(
        s1,
        1.0,
        -2.0,
        1.0,
        -1.9891696736297957,
        0.9891990357870394,
    )
    ms = sum(s * s for s in kw) / len(kw)
    return -0.691 + 10.0 * math.log10(max(ms, 1e-12))


def active_lufs(samples: list[float]) -> float:
    """Measure active integrated RMS loudness over 50ms frames above -42 dB."""
    win = int(0.05 * SR)
    ms_list: list[float] = []
    for i in range(0, len(samples) - win, win // 2):
        seg = samples[i : i + win]
        ms = sum(s * s for s in seg) / win
        db = -0.691 + 10.0 * math.log10(max(ms, 1e-12))
        if db > -42.0:
            ms_list.append(ms)
    if not ms_list:
        ms_list = [sum(s * s for s in samples) / max(1, len(samples))]
    return -0.691 + 10.0 * math.log10(max(sum(ms_list) / len(ms_list), 1e-12))


def decode_mono(path: str, af: str) -> list[float]:
    cmd = ["ffmpeg", "-v", "error", "-i", path]
    if af:
        cmd += ["-af", af]
    cmd += ["-ar", str(SR), "-ac", "1", "-f", "f32le", "pipe:1"]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, check=True)
    n = len(p.stdout) // 4
    return list(struct.unpack(f"<{n}f", p.stdout))


def encode_mp3(samples: list[float], out_mp3: str, bitrate: str = "64k") -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
            "-c:a", "libmp3lame", "-b:a", bitrate,
            out_mp3,
        ],
        input=struct.pack(f"<{len(samples)}f", *samples),
        check=True,
    )


def apply_cosine_fades(samples: list[float], fade_in_sec: float, fade_out_sec: float) -> list[float]:
    out = list(samples)
    fi = min(int(fade_in_sec * SR), len(out) // 4)
    fo = min(int(fade_out_sec * SR), len(out) // 3)
    for i in range(fi):
        out[i] *= 0.5 * (1.0 - math.cos(math.pi * i / fi))
    for i in range(fo):
        idx = len(out) - fo + i
        out[idx] *= 0.5 * (1.0 + math.cos(math.pi * i / fo))
    return out


# ---------------------------------------------------------------------------
# Pipeline 1 & 2: FluidR3_GM SATB Choir + Remote Acoustic Packs
# ---------------------------------------------------------------------------

def splice_sustained_fixed(samples: list[float], head_start_sec: float) -> list[float]:
    """Splice [head_start..2.75s] into [0.65s..2.85s] with a 0.65s equal-power crossfade."""
    head = samples[int(head_start_sec * SR) : int(2.75 * SR)]
    body = samples[int(0.65 * SR) : int(2.85 * SR)]
    xf = int(0.65 * SR)
    combined = list(head[:-xf])
    for i in range(xf):
        t = i / xf
        combined.append(
            head[len(head) - xf + i] * math.cos(0.5 * math.pi * t)
            + body[i] * math.sin(0.5 * math.pi * t)
        )
    combined.extend(body[xf:])
    return combined


def process_choir_sample(raw_mp3: str, out_mp3: str, midi: int) -> tuple[float, int]:
    s = decode_mono(raw_mp3, CHOIR_CONFIG["af"])
    combined = splice_sustained_fixed(s, head_start_sec=0.08)
    steady = combined[int(0.5 * SR) : int(4.0 * SR)]
    lufs = k_weight_lufs(steady)
    reg_trim_db = -1.2 if midi >= 72 else (-0.5 if midi >= 64 else (0.8 if midi <= 44 else 0.0))
    gain = 10.0 ** (((CHOIR_CONFIG["target_lufs"] + reg_trim_db) - lufs) / 20.0)
    ceil = CHOIR_CONFIG["peak_ceil"]
    out = [max(-ceil, min(ceil, x * gain)) for x in combined]
    out = apply_cosine_fades(out, fade_in_sec=0.025, fade_out_sec=0.060)
    encode_mp3(out, out_mp3, "64k")
    return len(out) / SR, os.path.getsize(out_mp3)


def process_remote_struck(
    raw_path: str,
    out_mp3: str,
    midi: int,
    af: str,
    max_dur_sec: float,
    target_lufs: float,
    measure_window_sec: float,
) -> tuple[float, int]:
    samples = decode_mono(raw_path, af)
    i = 0
    while i < len(samples) and abs(samples[i]) < 0.002:
        i += 1
    s = samples[max(0, i - int(0.004 * SR)) :][: int(max_dur_sec * SR)]
    mw = min(len(s), int(measure_window_sec * SR))
    lufs = k_weight_lufs(s[:mw])
    reg_trim = -1.0 if midi >= 72 else (-0.4 if midi >= 64 else (0.6 if midi <= 44 else 0.0))
    gain = 10.0 ** (((target_lufs + reg_trim) - lufs) / 20.0)
    peak = max((abs(x) for x in s), default=1e-6)
    if peak * gain > 0.90:
        gain = 0.90 / peak
    out = apply_cosine_fades([x * gain for x in s], fade_in_sec=0.003, fade_out_sec=0.260)
    encode_mp3(out, out_mp3, "64k")
    return len(out) / SR, os.path.getsize(out_mp3)


def process_remote_sustained(
    raw_path: str,
    out_mp3: str,
    midi: int,
    af: str,
    target_lufs: float,
) -> tuple[float, int]:
    s = decode_mono(raw_path, af)
    combined = splice_sustained_fixed(s, head_start_sec=0.06)
    steady = combined[int(0.5 * SR) : int(4.0 * SR)]
    lufs = k_weight_lufs(steady)
    reg_trim = -1.2 if midi >= 72 else (-0.5 if midi >= 64 else (0.7 if midi <= 44 else 0.0))
    gain = 10.0 ** (((target_lufs + reg_trim) - lufs) / 20.0)
    peak = max((abs(x) for x in combined), default=1e-6)
    if peak * gain > 0.90:
        gain = 0.90 / peak
    out = apply_cosine_fades([x * gain for x in combined], fade_in_sec=0.025, fade_out_sec=0.060)
    encode_mp3(out, out_mp3, "64k")
    return len(out) / SR, os.path.getsize(out_mp3)


# ---------------------------------------------------------------------------
# Pipeline 3: Local tonejs-instruments / Movemental Packs
# ---------------------------------------------------------------------------

def trim_start_ratio(samples: list[float], thresh_ratio: float = 0.012) -> list[float]:
    peak = max((abs(s) for s in samples), default=0.0)
    if peak < 1e-6:
        return samples
    thresh = peak * thresh_ratio
    first = 0
    while first < len(samples) and abs(samples[first]) < thresh:
        first += 1
    return samples[max(0, first - int(0.004 * SR)) :]


def make_sustained_adaptive(samples: list[float], target_dur: float = 4.22) -> list[float]:
    target_n = int(target_dur * SR)
    win = int(0.05 * SR)
    peak_rms = 0.0
    for i in range(0, min(len(samples), int(2.5 * SR)) - win, win):
        r = math.sqrt(sum(s * s for s in samples[i : i + win]) / win)
        if r > peak_rms:
            peak_rms = r
    body_end = len(samples)
    for i in range(int(0.8 * SR), len(samples) - win, win):
        r = math.sqrt(sum(s * s for s in samples[i : i + win]) / win)
        if r < peak_rms * 0.32:
            body_end = i
            break
    body_end = max(min(len(samples), int(1.6 * SR)), body_end)
    usable = samples[:body_end]

    if len(usable) >= target_n:
        out = usable[:target_n]
    else:
        loop_a = min(int(0.55 * SR), len(usable) // 3)
        loop_b = len(usable) - int(0.08 * SR)
        xfade = min(int(0.35 * SR), (loop_b - loop_a) // 3)
        if xfade < 100 or loop_b - loop_a <= xfade * 2:
            out = usable[:]
        else:
            out = usable[:loop_b]
            while len(out) < target_n:
                tail_start = len(out) - xfade
                for k in range(xfade):
                    theta = (math.pi * 0.5) * (k / xfade)
                    out[tail_start + k] = (
                        out[tail_start + k] * math.cos(theta)
                        + usable[loop_a + k] * math.sin(theta)
                    )
                out.extend(usable[loop_a + xfade : loop_b])
            out = out[:target_n]

    fi = min(int(0.008 * SR), len(out) // 10)
    for i in range(fi):
        out[i] *= 0.5 * (1.0 - math.cos(math.pi * i / fi))
    fo = min(int(0.18 * SR), len(out) // 6)
    for i in range(fo):
        out[len(out) - fo + i] *= 0.5 * (1.0 + math.cos(math.pi * i / fo))
    return out


def make_decaying(samples: list[float], max_dur: float) -> list[float]:
    max_n = int(max_dur * SR)
    out = samples[:max_n] if len(samples) > max_n else samples[:]
    fi = min(int(0.003 * SR), len(out) // 20)
    for i in range(fi):
        out[i] *= 0.5 * (1.0 - math.cos(math.pi * i / fi))
    fo = min(int(0.28 * SR), len(out) // 3)
    for i in range(fo):
        out[len(out) - fo + i] *= 0.5 * (1.0 + math.cos(math.pi * i / fo))
    return out


def build_pack(pack_id: str, src_root: Path) -> None:
    if pack_id == "satb-choir":
        CHOIR_OUT_DIR.mkdir(parents=True, exist_ok=True)
        total_bytes = 0
        with tempfile.TemporaryDirectory() as tmp:
            for vowel, folder in CHOIR_CONFIG["vowels"]:
                for midi, note in CHOIR_CONFIG["anchors"]:
                    url = f"https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/{folder}/{note}.mp3"
                    raw = os.path.join(tmp, f"{vowel}-{midi}-raw.mp3")
                    out = str(CHOIR_OUT_DIR / f"{vowel}-{midi}.mp3")
                    urllib.request.urlretrieve(url, raw)
                    _, sz = process_choir_sample(raw, out, midi)
                    total_bytes += sz
        print(f"OK {pack_id:15s}: 20 samples ({total_bytes // 1024} KB)")
        return

    if pack_id in REMOTE_ACOUSTIC_PACKS:
        cfg = REMOTE_ACOUSTIC_PACKS[pack_id]
        out_dir = SAMPLES_OUT_DIR / pack_id
        out_dir.mkdir(parents=True, exist_ok=True)
        total_bytes = 0
        with tempfile.TemporaryDirectory() as tmp:
            for midi, url in cfg["anchors"]:
                ext = ".wav" if url.endswith(".wav") else ".mp3"
                raw = os.path.join(tmp, f"{pack_id}-{midi}{ext}")
                out = str(out_dir / f"{midi}.mp3")
                urllib.request.urlretrieve(url, raw)
                if cfg["kind"] == "sustained":
                    _, sz = process_remote_sustained(raw, out, midi, cfg["af"], cfg["target_lufs"])
                else:
                    _, sz = process_remote_struck(
                        raw,
                        out,
                        midi,
                        cfg["af"],
                        cfg["max_dur"],
                        cfg["target_lufs"],
                        cfg["measure_window_sec"],
                    )
                total_bytes += sz
        print(f"OK {pack_id:15s}: {len(cfg['anchors']):2d} anchors ({total_bytes // 1024} KB)")
        return

    if pack_id in MOVEMENTAL_PACKS:
        cfg = MOVEMENTAL_PACKS[pack_id]
        pack_src = src_root / cfg["src_dir"] if cfg.get("src_dir") else src_root
        if not pack_src.is_dir():
            raise FileNotFoundError(
                f"Local source folder not found: {pack_src} (pass --src-root PATH)"
            )
        out_dir = SAMPLES_OUT_DIR / pack_id
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        total_bytes = 0
        for midi, fname in cfg["anchors"]:
            src = str(pack_src / fname)
            raw = decode_mono(src, cfg["af"])
            trimmed = trim_start_ratio(raw)
            shaped = (
                make_sustained_adaptive(trimmed)
                if cfg["sustained"]
                else make_decaying(trimmed, cfg["max_dur"])
            )
            cur_lufs = active_lufs(shaped)
            gain = 10.0 ** ((cfg["target_lufs"] - cur_lufs) / 20.0)
            peak = max((abs(s) for s in shaped), default=1e-9)
            if peak * gain > cfg["peak_ceil"]:
                gain = cfg["peak_ceil"] / peak
            norm = [s * gain for s in shaped]
            out_path = str(out_dir / f"{midi}.mp3")
            encode_mp3(norm, out_path, "64k")
            total_bytes += os.path.getsize(out_path)
        print(f"OK {pack_id:15s}: {len(cfg['anchors']):2d} anchors ({total_bytes // 1024} KB)")
        return

    raise ValueError(f"Unknown pack: {pack_id}")


def list_packs() -> int:
    print(
        f"{'satb-choir':15s} pipeline=choir            mode=sustained  anchors=10x2  "
        f"lufs={CHOIR_CONFIG['target_lufs']:5.1f}  af={CHOIR_CONFIG['af']}"
    )
    for pid, cfg in REMOTE_ACOUSTIC_PACKS.items():
        print(
            f"{pid:15s} pipeline={cfg['pipeline']:15s}  mode={cfg['kind']:9s}  "
            f"anchors={len(cfg['anchors']):2d}    lufs={cfg['target_lufs']:5.1f}  af={cfg['af']}"
        )
    for pid, cfg in MOVEMENTAL_PACKS.items():
        mode = "sustained" if cfg["sustained"] else "decaying"
        print(
            f"{pid:15s} pipeline={cfg['pipeline']:15s}  mode={mode:9s}  "
            f"anchors={len(cfg['anchors']):2d}    lufs={cfg['target_lufs']:5.1f}  af={cfg['af']}"
        )
    return 0


def verify_packs() -> int:
    missing: list[str] = []
    choir_count = 0
    for vowel, _ in CHOIR_CONFIG["vowels"]:
        for midi, _ in CHOIR_CONFIG["anchors"]:
            choir_count += 1
            p = CHOIR_OUT_DIR / f"{vowel}-{midi}.mp3"
            if not p.is_file() or p.stat().st_size == 0:
                missing.append(str(p.relative_to(REPO_ROOT)))

    sample_count = 0
    for pid, cfg in {**REMOTE_ACOUSTIC_PACKS, **MOVEMENTAL_PACKS}.items():
        for midi, _ in cfg["anchors"]:
            sample_count += 1
            p = SAMPLES_OUT_DIR / pid / f"{midi}.mp3"
            if not p.is_file() or p.stat().st_size == 0:
                missing.append(str(p.relative_to(REPO_ROOT)))

    print(
        f"Verified {choir_count} choir samples and {sample_count} acoustic samples "
        f"(total {choir_count + sample_count}), missing: {len(missing)}"
    )
    if missing:
        for item in missing:
            print(f"MISSING: {item}", file=sys.stderr)
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify or rebuild Paws Off choir and acoustic multi-sample packs.",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--list", action="store_true", help="List all 16 sampled instrument packs.")
    mode.add_argument("--verify", action="store_true", help="Verify all 184 sample MP3s exist and are non-empty.")
    mode.add_argument(
        "--pack",
        nargs="+",
        choices=ALL_PACK_IDS,
        help="Rebuild one or more sampled instrument packs.",
    )
    parser.add_argument(
        "--src-root",
        type=Path,
        default=DEFAULT_SRC_ROOT,
        help=f"Source folder for local Movemental/tonejs packs (default: {DEFAULT_SRC_ROOT})",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.list:
        return list_packs()
    if args.verify:
        return verify_packs()
    for pack_id in args.pack:
        build_pack(pack_id, args.src_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
