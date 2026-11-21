# Paws Off Architecture

This document describes the module boundaries, audio signal routing, music generation pipeline, hands-free session loop, and mobile/pocket reliability mechanisms of **Paws Off**.

---

## 1. Layered Module Boundaries

Dependencies flow strictly downward in an acyclic graph:

```text
src/types/settings.ts
  -> src/music/*
  -> src/audio/*
  -> src/engine/*
  -> src/hooks/useEarTrainer.ts
  -> src/components/* + src/App.tsx
```

`src/types/settings.ts` must remain free of runtime imports from `src/audio/` so that music, audio, engine, and UI layers can all import `SessionSettings` without circular dependencies.

---

## 2. Hands-Free Session State Machine (`src/engine/sessionController.ts`)

`SessionController` runs the continuous ear-training loop across these phases:

```text
idle
  -> orienting_voice      (announces key, e.g. "Key of C")
  -> orienting_cadence    (plays I - IV - V - I cadence, melody muted)
  -> inter_phase_pause
  -> question_playing     (plays progression + optional melody)
  -> repeat_pause         (optional repeats when questionRepeats > 1)
  -> pre_answer_pause     (thinking time before reveal)
  -> answer_revealing     (speaks chord names, optional chords behind speech, melody muted)
  -> post_answer_pause
  -> post_answer_replay   (optional replay of question + melody after reveal)
  -> next_question_pause  (loops to question_playing, or orienting_voice on key rotation)
```

Key behavioral safeguards:
- **Epoch guard:** Every `stop()`, `skip()`, `replay()`, or session restart increments an internal `epoch` counter. Any pending timer or asynchronous speech callback captures the current `epoch` and aborts immediately if it no longer matches.
- **Hybrid Answer Reveal:** Paces spoken chord names against chord bar duration (`answerRevealBpm`), supports optional chords playing softly behind speech (`playChordsDuringReveal`), and avoids overlapping speech with cadence/question playback.
- **Melody gating:** Melody plays during `question_playing`, repeats, and `post_answer_replay`, and is muted during `orienting_cadence` and `answer_revealing` so orientation and spoken answers stay clear.
- **Idle previews:** While `idle`, toggling a chord or adjusting melody settings can trigger short non-looping chord or progression previews without entering the session loop.

---

## 3. Music Theory, SATB Voicing & Melody Pipeline (`src/music/`)

- **Chord Catalog (`src/music/chords.ts`):**
  - 23 chords total: 7 diatonic triads (`I`..`viio`), 7 diatonic sevenths (`Imaj7`..`viiø7`), 4 secondary dominant triads (`V/ii`, `V/iii`, `V/V`, `V/vi`), and 5 secondary dominant sevenths (`V7/ii`, `V7/iii`, `V7/IV`, `V7/V`, `V7/vi`). `V/IV` triad is omitted because its pitch classes are identical to tonic `I`.
  - 5 inversion display and spoken modes: `inversion-name`, `figured-bass`, `bass-tone`, `scale-degree`, and `solfege`.
  - Exposes `getChordAvailableTensionOffsets` and `getChordScalePitchClasses` for melody generation.
- **Progression & Inversion Generator (`src/music/generator.ts`):**
  - Weighted progression selection supporting strict or free secondary dominant resolution (`resolveSecondaryDominants`).
  - `generateProgressionWithInversions` and `assignProgressionInversions` apply global inversion defaults plus per-chord overrides, supporting both musical and random inversion selection.
- **4-Voice SATB Voicer (`src/music/voicing.ts`):**
  - `RootBassVoiceLedStrategy` uses Viterbi dynamic programming across SATB voices.
  - Enforces bass bounds `[E2, G3]`, classical doubling rules (doubles bass on `6/4` and `viio6`; avoids doubling the leading tone on `V6` and `V6/x`), and penalizes minor-2nd inner-voice clashes and parallel 5ths/8ves.
  - When melody is enabled, constrains upper chord range (`{ maxUpperMidi: 72, upperCenterTarget: 63 }`) to leave clear headroom for the top-line melody.
- **Counterpoint Melody Generator (`src/music/melody.ts`):**
  - Generates 2-4 note lyrical bar rhythms and runs a stochastic counterpoint beam search (`beamWidth = 24`).
  - Supports `Chord tones only` vs. `Allow tensions`: strong beats target chord tones (or non-avoid tensions, excluding `b9` avoid notes); weak beats favor stepwise passing/neighbor motion, leap recovery, and separation above the highest chord voice.
- **Arrangement & Panning (`src/music/arrangement.ts`, `src/music/panning.ts`):**
  - `WarmBlockArrangement` emits `ScheduledNote` events tagged with `role: 'bass' | 'harmony' | 'melody'`, plus optional per-note `timbre`, `pan`, and choir `vowel`.
  - Stereo panning supports `left-to-right`, `satb`, and voice-led `random`.

---

## 4. Web Audio Signal Graph (`src/audio/synth.ts`, `src/audio/mastering.ts`, `src/audio/instruments/`)

```text
Chord voices  --> chordBus  --> chordLevelGain  --> warmthFilter --> presenceShelf --+
                                                                                     v
Melody voices --> melodyBus --> melodyLevelGain ---------------------------------> voicePocketEq
                                                                                     |
                   +-----------------------------------------------------------------+
                   v
       [ dryGain & reverbHpf (180 Hz) -> convolver -> wetGain ] --> masterInput
                                                                       ^
Voice clips   --> voiceBus --> voicePresenceEq ------------------------+
Tonic drone   --> ChromaticDrone --------------------------------------+
                                                                       |
                                                                       v
   masterInput --> [ subHpf (105/30 Hz) || 4x bassExciter (140-440 Hz) ] --> tonalSum
               --> presenceEq --> airShelf --> loudnessDrive --> glueCompressor
               --> 4x softClipper --> safetyLimiter (-1.8 dB, 20:1) --> outputTrim (0.89) --> destination
```

- **30 Timbres across 4 Categories (`Keys`, `Strings`, `Winds`, `Synths`):** 14 pure Web Audio synths (`velvet-pad`, `felt-piano`, `warm-rhodes`, `soft-vibes`, `wurlitzer`, `juno-poly`, `jazz-organ`, `glass-celesta`, `lofi-tape`, `harpsichord`, `kalimba`, `analog-brass`, `retro-8bit`, `shimmer-pad`), 1 sampled+formant choir (`satb-choir`), and 15 sampled acoustic instruments (`grand-piano`, `warm-strings`, `chamber-cello`, `french-horn`, `concert-harp`, `nylon-guitar`, `clean-guitar`, `harmonium`, `pipe-organ`, `marimba`, `woodwind-choir`, `steel-guitar`, `pizzicato-strings`, `warm-sax`, `warm-trombone`).
- **Output Profiles (`AudioOutputProfile`):** Defaults to `'auto'` (best-effort resolution via Bluetooth `outputLatency`, exposed `audiooutput` labels, and mobile form factor without mic permission prompts), with manual override in **Advanced settings** between `'phone-speaker'` (105 Hz cone-protection high-pass, `4x` missing-fundamental bass exciter, +1.2 dB presence / +2.2 dB voice clarity, +4.5 dB loudness drive) and `'headphones'` (30 Hz extension, flat studio EQ, +3.2 dB drive). Both route through a `4x` transparent linear-to-tanh soft-clipper (`0.78..0.92`) and 20:1 brickwall safety limiter (`-1.0 dBFS` trim).
- **Studio Ambience (`src/audio/reverb.ts`):** `createAmbienceImpulseResponse` synthesizes stereo-decorrelated impulse responses with discrete multi-tap early reflections (`12-52 ms` Warm Room, `24-76 ms` Lush Hall), progressive HF air damping, and an upstream `180 Hz` reverb high-pass filter.
- **Independent Harmony/Melody Scaling:** `PolySynth.playChord` computes `chordCountScale` from chord voice count separately from `MELODY_COUNT_SCALE` (`0.58`) so enabling melody never ducks chord accompaniment, and `melodyBus` bypasses `warmthFilter` to cut cleanly above the harmony.
- **Clean Early Cancellation:** `scheduleSingleNote` separates natural note-end release from explicit `releaseAll()` cancellation so stopping or skipping mid-phrase never leaves future scheduled notes playing ghost audio.

---

## 5. Voice Announcements & Pocket Reliability (`src/engine/`)

- **Voice Routing (`hybridAnnouncer.ts`, `audioAnnouncer.ts`, `speech.ts`):**
  - `HybridVoiceAnnouncer` defaults to `'recorded'` (`AudioBufferAnnouncer`) using 73 pre-rendered MP3s in `public/voice/` (`VOICE_CLIPS_VERSION = '10'`), falling back to `WebSpeechAnnouncer` (`'speech-synthesis'`) if offline or uncached.
  - Inverted chord phrases chain 2 clips (`[baseUrl, suffixUrl]`) with `CHAIN_OVERLAP_SEC = 0.19` for natural spoken cadence.
- **Background & Lock-Screen Stability:**
  - `workerTimer.ts` + `timerWorker.ts` run a 25 ms Web Worker lookahead clock so browser tab throttling does not stall transitions.
  - `PocketManager` (`pocketManager.ts`) integrates Media Session API lock-screen controls (`play`, `pause`, `stop`, `previoustrack`, `nexttrack`), Screen Wake Lock (re-acquired on `visibilitychange`), and `SilentKeepAlive` (`silentKeepAlive.ts`) to keep mobile audio sessions active in a pocket.

---

## 6. Persistence & Settings Migrations (`src/types/settings.ts`)

- Settings persist to `localStorage` under `paws-off:settings:v2` and pass through `sanitizeSettings` on load to clamp numeric bounds, drop unknown chord IDs, and fill newly added defaults.
- `volumeCalibrationVersion` (`VOLUME_CALIBRATION_VERSION = 2`) handles one-time mix migrations.
- `RECOMMENDED_MELODY_TIMBRE` / `getRecommendedMelodyTimbre` automatically pairs a contrasting melody sound whenever the user switches the chord sound, while preserving manual melody timbre overrides.

---

## 7. Key Architectural Decisions

- **Pre-rendered `AvaNeural` MP3s + 2-clip chaining over Web Speech alone:** Eliminates mobile TTS latency/voice inconsistency and scales to all 23 chords x 5 inversion modes using 73 clips instead of hundreds of combinatorial recordings.
- **`64k` mono MP3 samples + Web Audio stereo panning:** Keeps per-instrument bundles small (~140-260 KB) for fast mobile decoding while letting `StereoPannerNode` shape SATB width dynamically.
- **`RECOMMENDED_MELODY_TIMBRE` in `settings.ts`:** Avoids importing `src/audio/` from `src/types/`, keeping the module dependency graph strictly acyclic.
- **`V/IV` triad omitted:** In major keys, `V/IV` is pitch-class identical to tonic `I`, whereas `V7/IV` introduces the distinctive `b7` (`fa` -> `mi`) and is included.
