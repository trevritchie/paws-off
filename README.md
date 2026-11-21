# Paws Off

A hands-free, pocket-friendly chord progression ear trainer built with React, TypeScript, Tailwind CSS, and the Web Audio API. Designed for listening with your phone in your pocket: hear a tonal orientation cadence, a progression with optional counterpoint melody, a configurable pause to audiated/think, and a spoken answer reveal before moving automatically to the next question.

Live app: https://trevritchie.github.io/paws-off/

## Features

- **23 Chords**: All 7 diatonic triads, all 7 diatonic sevenths, and 9 secondary dominants (`V/x` and `V7/x`, with strict resolution or free mode).
- **4-Voice SATB Inversions**: Viterbi voice-led SATB voicings with global inversion defaults, progressive-disclosure per-chord overrides, and 5 display/spoken notation modes (`Inversion name`, `Figured bass`, `Bass tone`, `Scale degree`, `Solfege`).
- **Counterpoint Melody Overlay**: Optional top-line melody (`Melody over chords`) with `Allow tensions`, a dedicated melody volume slider, and auto-paired melody sounds (with full manual override).
- **18 Sound Presets & Mixing**: 8 pure Web Audio synths (`Velvet Pad`, `Felt Piano`, `Warm Rhodes`, `Soft Vibes`, `Wurlitzer EP`, `Juno Poly`, `Jazz Organ`, `Glass Celesta`), sampled+formant `SATB Choir`, and 9 sampled acoustic instruments (`Grand Piano`, `Warm Strings`, `Chamber Cello`, `French Horn`, `Concert Harp`, `Nylon Guitar`, `Clean Guitar`, `Harmonium`, `Pipe Organ`), plus stereo voice panning, studio early-reflection reverb, and a tonic drone.
- **Mobile-Mastered Playback**: Native Web Audio mastering chain with best-effort `Auto` output detection (and manual `Phone Speaker` / `Headphones` override in Advanced settings) featuring a cone-protection high-pass, psychoacoustic missing-fundamental bass exciter, `4x` soft-clipper, and broadcast lookahead limiter.
- **Zero-Latency Recorded Voice**: 73 pre-rendered, broadcast-mastered voice clips with 2-clip inversion chaining and automatic Web Speech API fallback.
- **Hands-Free & Pocket Ready**: Lock-screen Media Session controls (play, stop, replay, skip), Screen Wake Lock, silent audio keep-alive, and Web Worker lookahead timing.
- **Key Rotation & Tempo Control**: Stay in a fixed key or auto-rotate every N questions, and independently tune question BPM, answer-reveal BPM, thinking time, and repeats.

## Running Locally

```bash
npm install
npm run dev
```

## Testing & Building

```bash
npm test          # Run Vitest unit & component tests (66 tests)
npm run build     # Type-check and build production bundle to dist/
```

## Documentation

- [AGENTS.md](AGENTS.md) - Concise project guide, commands, invariants, and gotchas for coding agents
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Module boundaries, session state machine, SATB/melody pipeline, and Web Audio signal graph
- [docs/AUDIO_PIPELINE.md](docs/AUDIO_PIPELINE.md) - Offline Edge-TTS voice generation, FFmpeg mastering, and acoustic sample processing pipelines
- [ROADMAP.md](ROADMAP.md) - Shipped milestones and planned future features

## Sample & Wavetable Attribution

Acoustic and choir sample packs are derived from CC-BY 3.0 and CC0 1.0 sources (FluidR3_GM, Salamander Grand Piano V3, VSCO 2 CE Harp, and `tonejs-instruments`) and processed offline at 44.1 kHz mono 64k MP3. Pure Web Audio Fourier wavetables for `Wurlitzer EP`, `Juno Poly`, `Jazz Organ`, and `Glass Celesta` are derived from Google Chrome Labs `web-audio-samples` (`Wurlitzer_2`, `Organ_2`, `Chorus_Strings`, `Twelve_OpTines`, Apache License 2.0). See [docs/AUDIO_PIPELINE.md](docs/AUDIO_PIPELINE.md) for the complete source and license matrix.
