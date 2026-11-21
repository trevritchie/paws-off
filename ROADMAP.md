# Paws Off Roadmap

## Architecture Boundaries

The codebase enforces clean boundaries so music theory, audio rendering, session orchestration, and UI stay decoupled:

| Layer | File / Interface | Current Implementation |
| --- | --- | --- |
| Chord & Theory | `src/music/chords.ts`, `generator.ts` | 23 chords (diatonic triads/7ths + secondary dominants), strict/free resolution, 5 inversion notation modes |
| Voicing & Melody | `src/music/voicing.ts`, `melody.ts` | `RootBassVoiceLedStrategy` (4-voice SATB Viterbi DP) + stochastic counterpoint melody beam search (`Chord tones only` / `Allow tensions`) |
| Arrangement | `src/music/arrangement.ts`, `panning.ts` | `WarmBlockArrangement` (`bass` / `harmony` / `melody` roles) + stereo panning (`left-to-right`, `satb`, `random`) |
| Sound Engine | `src/audio/synth.ts`, `src/audio/mastering.ts`, `src/audio/instruments/` | `PolySynth` with separate `chordBus` & `melodyBus`, 18 timbres (8 synths, `SATB Choir`, 9 sampled acoustic packs), studio ER reverb, and `MasterOutputChain` (`Phone Speaker` / `Headphones`) |
| Voice Output | `src/engine/hybridAnnouncer.ts` | `HybridVoiceAnnouncer` (`AudioBufferAnnouncer` with 73 mastered MP3s + 2-clip chaining, `WebSpeechAnnouncer` fallback) |
| Session Loop | `src/engine/sessionController.ts` | Epoch-guarded state machine + `PocketManager` (Media Session, Wake Lock, `SilentKeepAlive`) + Web Worker clock |

---

## Shipped Milestones

- **Secondary Dominants:** `V/x` and `V7/x` chords with strict resolution mode and progression weighting.
- **4-Voice SATB Inversions & Progressive Disclosure:** Global + per-chord inversion toggles across triads, sevenths, and secondary dominants, with 5 display/spoken modes (`inversion-name`, `figured-bass`, `bass-tone`, `scale-degree`, `solfege`).
- **Pre-Rendered Voice Clips:** 73 broadcast-mastered `en-US-AvaNeural` MP3 clips with 2-clip overlap chaining (`CHAIN_OVERLAP_SEC = 0.19`) and documented offline TTS pipeline (`scripts/generate_voice_clips.py`).
- **14 Timbres & Sample Pipeline:** 4 Web Audio synths, sampled+formant `SATB Choir`, and 9 sampled acoustic instruments processed via `scripts/process_samples.py` and documented in `docs/AUDIO_PIPELINE.md`.
- **Counterpoint Melody Overlay:** Top-line melody (`Melody over chords`) with `Allow tensions`, melody volume slider, and auto-paired contrasting melody timbres with manual override.
- **Studio Mastering & Expanded Synth Lineup (18 Timbres):** Native Web Audio `MasterOutputChain` (`Phone Speaker` and `Headphones` output profiles with sub-bass HPF, `4x` missing-fundamental bass exciter, glue compressor, `4x` transparent soft-clipper, and brickwall safety limiter), multi-tap early-reflection reverb, upgraded synth articulation, and 4 new wavetable instruments (`Wurlitzer EP`, `Juno Poly`, `Jazz Organ`, `Glass Celesta`).

---

## Planned Features

- **Variable Rhythms & Comping Patterns:** Beyond block chords into broken arpeggios, Alberti bass, waltz, bossa nova, and jazz comping.
- **Drum Grooves & Metronome Feel:** Synthesized or sampled drum kit layers (kick, snare, ride, hi-hat) aligned to the Web Audio clock for rhythmic ear training.
- **Minor Keys, Modes & Custom Templates:** Natural/harmonic/melodic minor, diatonic modes, modal interchange, and user-authored progression templates.
- **Native Mobile Shell:** Optional Capacitor wrapper for dedicated iOS/Android background audio session persistence if browser backgrounding proves limiting on specific devices.
