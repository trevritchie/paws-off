# AGENTS.md

## Project Overview

**Paws Off** is a hands-free chord progression ear trainer built with React 19, TypeScript 5.8, Vite 6 (`base: '/paws-off/'`), Tailwind CSS v4, Vitest 3 (`jsdom`), and the native Web Audio API.

- Repo: `trevritchie/paws-off`
- Live URL: `https://trevritchie.github.io/paws-off/` (auto-deploys on push to `main` via `.github/workflows/deploy.yml`, Node 22)

## Commands

```bash
npm run dev       # Local Vite dev server
npm test          # Vitest suite (4 suites, 66 tests)
npm run build     # Type-check (tsc -b) + Vite production build
```

Audio asset and style verification:

```bash
python3 scripts/generate_voice_clips.py --verify   # Checks all 73 voice MP3s against src/audio/voiceClips.ts
python3 scripts/process_samples.py --verify        # Checks all 123 choir + acoustic sample MP3s
! grep -rnIP "\xe2\x80\x94" index.html public/ src/ docs/ scripts/ AGENTS.md README.md ROADMAP.md --exclude="*.test.*"
```

## Codebase Map

| Path | Responsibility |
| --- | --- |
| `src/types/settings.ts` | `SessionSettings`, `DEFAULT_SETTINGS`, `sanitizeSettings`, `localStorage` key (`paws-off:settings:v2`), `RECOMMENDED_MELODY_TIMBRE`, `getRecommendedMelodyTimbre` |
| `src/music/` | 23-chord catalog (`chords.ts`), progression & inversion generator (`generator.ts`), 4-voice SATB Viterbi voicer (`voicing.ts`), counterpoint melody generator (`melody.ts`), note scheduler (`arrangement.ts`), stereo panning (`panning.ts`) |
| `src/audio/` | `PolySynth` signal graph & buses (`synth.ts`), `MasterOutputChain` & auto-detection (`mastering.ts`), 18 instrument presets (`instruments/`), asset manifests (`sampleBank.ts`, `choirSamples.ts`, `voiceClips.ts`), `drone.ts`, `reverb.ts`, `volume.ts`, `silentKeepAlive.ts` |
| `src/engine/` | Hands-free session loop (`sessionController.ts`), recorded + Web Speech announcers (`hybridAnnouncer.ts`, `audioAnnouncer.ts`, `speech.ts`), Media Session & Wake Lock (`pocketManager.ts`), Web Worker clock (`workerTimer.ts`, `timerWorker.ts`) |
| `src/hooks/` & `src/components/` | `useEarTrainer.ts`, `PocketStage.tsx`, `TransportBar.tsx`, `ChordSelector.tsx`, `CoreControls.tsx`, `SoundAndMix.tsx`, `AdvancedSettings.tsx`, `SwitchRow.tsx` |
| `scripts/` & `docs/` | Offline TTS & sample mastering scripts. Read `docs/ARCHITECTURE.md` before structural changes and `docs/AUDIO_PIPELINE.md` before modifying voice clips or instrument samples. |

## Key Invariants & Gotchas

- **No em-dashes or emojis:** Never put em-dashes (U+2014) or emojis in `index.html`, `public/`, non-test `src/`, `docs/`, `scripts/`, or repo markdown docs.
- **Keep `settings.ts` acyclic:** `src/types/settings.ts` must not import runtime code from `src/audio/` (that is why `RECOMMENDED_MELODY_TIMBRE` lives in `settings.ts`).
- **Default key mode is `'auto-rotate'`:** Any test asserting fixed-key pitch classes must pass `keyMode: 'fixed'`.
- **Audio mixing & early release:** `PolySynth` routes harmony (`chordBus -> chordLevelGain -> warmthFilter -> presenceShelf -> voicePocketEq`) and melody (`melodyBus -> melodyLevelGain -> voicePocketEq`, bypassing `warmthFilter`) with independent count scaling (`chordCountScale` vs. `MELODY_COUNT_SCALE = 0.58`). `scheduleSingleNote` separates natural duration release from explicit `releaseAll()` cancellation so future scheduled notes emit zero ghost audio.
- **Voice clip changes:** Generate and master strictly via `scripts/generate_voice_clips.py` (`en-US-AvaNeural`, `-12%`, `-3Hz`, `-18.45` Percep LUFS), listen directly to verify pronunciation (watch homographs like musical `"bass"` and phonetic solfege spellings), update both `scripts/generate_voice_clips.py` and `src/audio/voiceClips.ts`, and bump `VOICE_CLIPS_VERSION`.
- **Instrument sample changes:** Process strictly via `scripts/process_samples.py` (`64k` mono `44.1 kHz` MP3) and bump `ACOUSTIC_SAMPLES_VERSION` or `CHOIR_SAMPLES_VERSION`.
- **No nested buttons:** Never nest `<button>` inside `<button>` in collapsible UI drawers (use sibling flex buttons for Reset controls).

## Workflow & Verification

- Before pushing to `main`, run `npm test && npm run build` and the em-dash check (plus `--verify` scripts whenever touching audio assets).
- Pushing to `main` triggers GitHub Actions Pages deploy (`Deploy to GitHub Pages`); verify the workflow finishes green and check HTTP 200 on any new public assets on live Pages.
- Keep `AGENTS.md`, `README.md`, `ROADMAP.md`, and `docs/` updated whenever adding features, instruments, or voice clips.
