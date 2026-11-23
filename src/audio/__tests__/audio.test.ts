import { describe, expect, it, vi } from 'vitest';
import { AudioBufferAnnouncer } from '../../engine/audioAnnouncer';
import { PocketManager } from '../../engine/pocketManager';
import {
  MAJOR_KEYS,
  ALL_CHORD_IDS,
  getMaxInversionForChord,
  getSpokenChordPhrase,
  getSpokenKeyPhrase,
} from '../../music/chords';
import {
  type AudioOutputProfile,
  type InversionNotation,
  LEGACY_SETTINGS_STORAGE_KEY,
  loadSettings,
  type ResolvedOutputProfile,
  sanitizeSettings,
  saveSettings,
} from '../../types/settings';
import {
  CHOIR_ANCHOR_MIDIS,
  ChoirSampleBank,
  findNearestChoirAnchor,
  getChoirSampleUrl,
} from '../choirSamples';
import { formatDroneNoteName, pitchClassToDroneMidi } from '../drone';
import { INSTRUMENT_PRESETS } from '../instruments';
import { computeVoicePan } from '../instruments/types';
import {
  createBassExciterCurve,
  createTransparentSoftClipCurve,
  detectOutputProfileInfo,
  formatAutoOutputHint,
  MasterOutputChain,
  OUTPUT_PROFILE_CONFIGS,
  resolveAutoOutputInfo,
  resolveAutoOutputProfile,
} from '../mastering';
import { AMBIENCE_CONFIGS, createAmbienceImpulseResponse } from '../reverb';
import {
  ACOUSTIC_PACK_CONFIGS,
  AcousticSampleBank,
  findNearestAnchor,
  getAcousticSampleUrl,
} from '../sampleBank';
import { createSilentWavBuffer } from '../silentKeepAlive';
import {
  DUCKED_CHORD_BUS_GAIN,
  MELODY_COUNT_SCALE,
  PolySynth,
  VOICE_POCKET_CUT_DB,
  VOICE_POCKET_FREQ_HZ,
} from '../synth';
import {
  ALL_VOICE_CLIP_TEXTS,
  getVoiceClipUrl,
  getVoiceClipUrlsForPhrase,
} from '../voiceClips';
import {
  chordSliderToGain,
  droneSliderToGain,
  melodySliderToGain,
  voiceSliderToGain,
} from '../volume';

describe('voiceClips mapping', () => {
  it('maps every key, chord, and inversion spoken phrase to an mp3 URL', () => {
    expect(ALL_VOICE_CLIP_TEXTS).toHaveLength(73);
    for (const phrase of ALL_VOICE_CLIP_TEXTS) {
      const url = getVoiceClipUrl(phrase);
      expect(url).toMatch(/voice\/.*\.mp3(\?v=\d+)?$/);
    }

    for (const key of MAJOR_KEYS) {
      expect(getVoiceClipUrl(getSpokenKeyPhrase(key.pitchClass))).not.toBeNull();
    }

    for (const id of ALL_CHORD_IDS) {
      for (const announceTriadQuality of [false, true]) {
        const p1 = getSpokenChordPhrase(
          id,
          'half-diminished',
          announceTriadQuality,
        );
        const p2 = getSpokenChordPhrase(
          id,
          'minor-seven-flat-five',
          announceTriadQuality,
        );
        expect(getVoiceClipUrl(p1.text)).not.toBeNull();
        expect(getVoiceClipUrl(p2.text)).not.toBeNull();
      }
    }

    // 2-clip resolution for inverted chords across all styles
    expect(getVoiceClipUrlsForPhrase('One first inversion')).toEqual([
      getVoiceClipUrl('One'),
      getVoiceClipUrl('first inversion'),
    ]);
    expect(getVoiceClipUrlsForPhrase('Five seven third inversion')).toEqual([
      getVoiceClipUrl('Five seven'),
      getVoiceClipUrl('third inversion'),
    ]);
    expect(getVoiceClipUrlsForPhrase('One third in bass')).toEqual([
      getVoiceClipUrl('One'),
      getVoiceClipUrl('third in bass'),
    ]);
    expect(getVoiceClipUrlsForPhrase('Five over degree seven')).toEqual([
      getVoiceClipUrl('Five'),
      getVoiceClipUrl('over degree seven'),
    ]);
    expect(getVoiceClipUrlsForPhrase('Five of five over degree sharp four')).toEqual([
      getVoiceClipUrl('Five of five'),
      getVoiceClipUrl('over degree sharp four'),
    ]);
    expect(
      getVoiceClipUrlsForPhrase('Five seven of four over degree flat seven'),
    ).toEqual([
      getVoiceClipUrl('Five seven of four'),
      getVoiceClipUrl('over degree flat seven'),
    ]);
    expect(getVoiceClipUrlsForPhrase('Five over ti')).toEqual([
      getVoiceClipUrl('Five'),
      getVoiceClipUrl('over ti'),
    ]);
    expect(getVoiceClipUrlsForPhrase('Five of five over fi')).toEqual([
      getVoiceClipUrl('Five of five'),
      getVoiceClipUrl('over fi'),
    ]);
    expect(getVoiceClipUrlsForPhrase('Five seven of four over te')).toEqual([
      getVoiceClipUrl('Five seven of four'),
      getVoiceClipUrl('over te'),
    ]);

    // Exhaustive check: every chord x valid inversion x notation style resolves
    const notations: readonly InversionNotation[] = [
      'inversion-name',
      'figured-bass',
      'bass-tone',
      'scale-degree',
      'solfege',
    ];
    for (const id of ALL_CHORD_IDS) {
      const maxInv = getMaxInversionForChord(id);
      for (let inv = 0 as 0 | 1 | 2 | 3; inv <= maxInv; inv++) {
        for (const notation of notations) {
          const phrase = getSpokenChordPhrase(
            id,
            'half-diminished',
            false,
            inv,
            notation,
          );
          const urls = getVoiceClipUrlsForPhrase(phrase.text);
          expect(urls).not.toBeNull();
          expect(urls).toHaveLength(inv === 0 ? 1 : 2);
        }
      }
    }
  });
});

describe('SilentKeepAlive WAV buffer', () => {
  it('creates a 44.1kHz 16-bit mono PCM WAV with zero endpoints and non-zero interior samples', () => {
    const buf = createSilentWavBuffer();
    const view = new DataView(buf);

    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    expect(riff).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);

    const numSamples = 44100 * 2;
    expect(buf.byteLength).toBe(44 + numSamples * 2);

    // Loop boundaries must be strictly zero so looping never clicks.
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(44 + (numSamples - 1) * 2, true)).toBe(0);

    // Interior contains +/-1 LSB so mobile pipelines remain active.
    let nonZeroCount = 0;
    for (let i = 0; i < numSamples; i++) {
      if (view.getInt16(44 + i * 2, true) !== 0) {
        nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBeGreaterThan(1000);
  });
});

describe('PocketManager lock-screen Media Session metadata', () => {
  it('publishes metadata with synchronous inline data-URL artwork (no background network fetch when locked)', () => {
    const fakeMediaSession = {
      metadata: null as {
        title?: string;
        artist?: string;
        album?: string;
        artwork?: Array<{ src: string; sizes?: string; type?: string }>;
      } | null,
      playbackState: 'none',
      setActionHandler: vi.fn(),
    };

    class MockMediaMetadata {
      title?: string;
      artist?: string;
      album?: string;
      artwork?: Array<{ src: string; sizes?: string; type?: string }>;
      constructor(init: {
        title?: string;
        artist?: string;
        album?: string;
        artwork?: Array<{ src: string; sizes?: string; type?: string }>;
      }) {
        Object.assign(this, init);
      }
    }

    const origMediaSession = Object.getOwnPropertyDescriptor(
      navigator,
      'mediaSession',
    );
    const origMediaMetadata = (globalThis as Record<string, unknown>)
      .MediaMetadata;
    const origCreateElement = document.createElement.bind(document);
    const canvasSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 256,
            height: 256,
            getContext: () => ({
              fillStyle: '',
              strokeStyle: '',
              lineWidth: 1,
              lineCap: 'round',
              lineJoin: 'round',
              fillRect: vi.fn(),
              strokeRect: vi.fn(),
              save: vi.fn(),
              restore: vi.fn(),
              translate: vi.fn(),
              scale: vi.fn(),
              beginPath: vi.fn(),
              ellipse: vi.fn(),
              arc: vi.fn(),
              fill: vi.fn(),
              stroke: vi.fn(),
            }),
            toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
          } as unknown as HTMLCanvasElement;
        }
        return origCreateElement(tagName);
      });

    Object.defineProperty(navigator, 'mediaSession', {
      value: fakeMediaSession,
      configurable: true,
    });
    (globalThis as Record<string, unknown>).MediaMetadata = MockMediaMetadata;

    try {
      const pocket = new PocketManager();
      pocket.updateMetadata({
        title: 'Q1 Answer: I – IV – V',
        artist: 'Paws Off',
        album: 'C Major · 120 BPM',
      });

      expect(fakeMediaSession.metadata).not.toBeNull();
      expect(fakeMediaSession.metadata!.title).toBe('Q1 Answer: I – IV – V');
      expect(fakeMediaSession.metadata!.artist).toBe('Paws Off');
      expect(fakeMediaSession.metadata!.album).toBe('C Major · 120 BPM');
      expect(fakeMediaSession.metadata!.artwork).toHaveLength(1);
      expect(fakeMediaSession.metadata!.artwork![0].src).toMatch(
        /^data:image\/png;base64,/,
      );
      pocket.dispose();
    } finally {
      canvasSpy.mockRestore();
      if (origMediaSession) {
        Object.defineProperty(navigator, 'mediaSession', origMediaSession);
      } else {
        delete (navigator as unknown as Record<string, unknown>).mediaSession;
      }
      (globalThis as Record<string, unknown>).MediaMetadata = origMediaMetadata;
    }
  });
});

describe('AudioBufferAnnouncer', () => {
  function createMockHost() {
    let createdSource: {
      buffer: AudioBuffer | null;
      playbackRate: { setValueAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
    } | null = null;

    const createdSources: Array<{
      buffer: AudioBuffer | null;
      playbackRate: { setValueAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
    }> = [];

    const gainNode = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const fakeBuffer = { duration: 0.9 } as AudioBuffer;
    const ctx = {
      currentTime: 10,
      state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
      decodeAudioData: vi.fn().mockResolvedValue(fakeBuffer),
      createBufferSource: vi.fn(() => {
        createdSource = {
          buffer: null,
          playbackRate: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        createdSources.push(createdSource);
        return createdSource;
      }),
      createGain: vi.fn(() => gainNode),
    } as unknown as AudioContext;

    const voiceInput = {} as AudioNode;
    return {
      host: {
        getAudioContext: () => ctx,
        getVoiceInput: () => voiceInput,
      },
      ctx,
      getSource: () => createdSource,
      getSources: () => createdSources,
    };
  }

  it('fetches, decodes, plays with playbackRate, and invokes onStart/onEnd', async () => {
    const { host, getSource } = createMockHost();
    const fakeBytes = new ArrayBuffer(16);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeBytes,
    }) as unknown as typeof fetch;

    const announcer = new AudioBufferAnnouncer(host, fetcher);
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const played = await announcer.trySpeak('Key of C major', {
      rate: 1.15,
      voiceURI: null,
      estimatedSyllables: 6,
      onStart,
      onEnd,
    });

    expect(played).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    const src = getSource()!;
    expect(src.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.15, 10);
    expect(src.start).toHaveBeenCalledTimes(1);

    // Exact buffer duration now drives duration estimation
    expect(
      announcer.estimateDurationSec(6, 1.0, 'Key of C major'),
    ).toBeCloseTo(0.9, 5);

    src.onended?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('prevents onEnd from firing after cancel()', async () => {
    const { host, getSource } = createMockHost();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as unknown as typeof fetch;

    const announcer = new AudioBufferAnnouncer(host, fetcher);
    const onEnd = vi.fn();

    await announcer.trySpeak('One', {
      rate: 1.0,
      voiceURI: null,
      estimatedSyllables: 1,
      onEnd,
    });

    const src = getSource()!;
    announcer.cancel();
    src.onended?.();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('chains 2 clips seamlessly for inverted phrases and cancels both sources cleanly', async () => {
    const { host, getSources } = createMockHost();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(12),
    }) as unknown as typeof fetch;

    const announcer = new AudioBufferAnnouncer(host, fetcher);
    const onEnd = vi.fn();

    const played = await announcer.trySpeak('Five seven third inversion', {
      rate: 1.0,
      voiceURI: null,
      estimatedSyllables: 7,
      onEnd,
    });
    expect(played).toBe(true);
    const sources = getSources();
    expect(sources).toHaveLength(2);
    expect(sources[0].start).toHaveBeenCalledWith(10.008);
    // 10.008 + (0.9 - 0.19) = 10.718
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(10.718, 3);
    expect(
      announcer.estimateDurationSec(7, 1.0, 'Five seven third inversion'),
    ).toBeCloseTo(1.61, 3);

    sources[0].onended?.();
    expect(onEnd).not.toHaveBeenCalled();
    sources[1].onended?.();
    expect(onEnd).toHaveBeenCalledTimes(1);

    // Cancel clears chained sources
    const onEndCancelled = vi.fn();
    await announcer.trySpeak('One third in bass', {
      rate: 1.0,
      voiceURI: null,
      estimatedSyllables: 4,
      onEnd: onEndCancelled,
    });
    announcer.cancel();
    const nextSources = getSources().slice(2);
    expect(nextSources[0].stop).toHaveBeenCalled();
    expect(nextSources[1].stop).toHaveBeenCalled();
    nextSources[1].onended?.();
    expect(onEndCancelled).not.toHaveBeenCalled();
  });
});

describe('perceptual volume calibration', () => {
  it('maps 0 to exact silence and places default sweet spots cleanly in the middle of each slider', () => {
    expect(chordSliderToGain(0)).toBe(0);
    expect(voiceSliderToGain(0)).toBe(0);
    expect(droneSliderToGain(0)).toBe(0);

    // Chords 75% ~= 0.98, Voice 65% ~= 0.24, Drone 50% ~= 0.08
    expect(chordSliderToGain(0.75)).toBeCloseTo(0.98, 1);
    expect(voiceSliderToGain(0.65)).toBeCloseTo(0.24, 2);
    expect(droneSliderToGain(0.5)).toBeCloseTo(0.08, 2);

    // Strictly monotonic with useful headroom up to 100%
    expect(voiceSliderToGain(1.0)).toBeGreaterThan(voiceSliderToGain(0.65) * 2);
    expect(chordSliderToGain(1.0)).toBeGreaterThan(chordSliderToGain(0.75) * 1.5);
  });
});

describe('meditative instruments & ambience', () => {
  it('exposes all 30 instrument presets (Grand Piano default, 16 real-sample acoustics, and 14 pure Web Audio synths)', () => {
    expect(INSTRUMENT_PRESETS).toHaveLength(30);
    const ids = INSTRUMENT_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      'grand-piano',
      'velvet-pad',
      'warm-strings',
      'chamber-cello',
      'satb-choir',
      'french-horn',
      'concert-harp',
      'nylon-guitar',
      'clean-guitar',
      'harmonium',
      'pipe-organ',
      'felt-piano',
      'warm-rhodes',
      'soft-vibes',
      'wurlitzer',
      'juno-poly',
      'jazz-organ',
      'glass-celesta',
      'marimba',
      'woodwind-choir',
      'steel-guitar',
      'pizzicato-strings',
      'warm-sax',
      'warm-trombone',
      'lofi-tape',
      'harpsichord',
      'kalimba',
      'analog-brass',
      'retro-8bit',
      'shimmer-pad',
    ]);
    for (const preset of INSTRUMENT_PRESETS) {
      expect(['keys', 'strings', 'winds', 'synths']).toContain(preset.category);
      expect(preset.defaultReleaseSec).toBeGreaterThan(0);
      expect(preset.rollStepSec).toBeGreaterThanOrEqual(0);
    }
  });

  it('lazy-loads acoustic sample packs on demand and maps every note in E2..G5 cleanly', async () => {
    const maxAllowedShift: Record<string, number> = {
      'french-horn': 7,
      'chamber-cello': 4,
      marimba: 3,
      'woodwind-choir': 3,
    };
    for (const [id, cfg] of Object.entries(ACOUSTIC_PACK_CONFIGS)) {
      const limit = maxAllowedShift[id] ?? 2;
      for (let midi = 40; midi <= 76; midi++) {
        const { anchorMidi, playbackRate } = findNearestAnchor(
          cfg.anchors,
          midi,
        );
        expect(Math.abs(midi - anchorMidi)).toBeLessThanOrEqual(limit);
        expect(playbackRate).toBeCloseTo(
          Math.pow(2, (midi - anchorMidi) / 12),
          6,
        );
      }
      expect(
        getAcousticSampleUrl(
          id as keyof typeof ACOUSTIC_PACK_CONFIGS,
          cfg.anchors[0],
        ),
      ).toMatch(new RegExp(`samples/${id}/${cfg.anchors[0]}\\.mp3\\?v=\\d+$`));
    }

    const fakeBuf = { duration: 3.8 } as AudioBuffer;
    const fakeCtx = {
      decodeAudioData: vi.fn().mockResolvedValue(fakeBuf),
    } as unknown as AudioContext;
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    }) as unknown as typeof fetch;

    const bank = new AcousticSampleBank(fetcher);
    expect(bank.isPackLoaded('grand-piano')).toBe(false);
    await bank.preload(fakeCtx, 'grand-piano');
    expect(bank.isPackLoaded('grand-piano')).toBe(true);
    expect(bank.isPackLoaded('concert-harp')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(
      ACOUSTIC_PACK_CONFIGS['grand-piano'].anchors.length,
    );

    const note = bank.getSample('grand-piano', 61);
    expect(note).not.toBeNull();
    expect(note!.buffer).toBe(fakeBuf);
    expect(note!.sustained).toBe(false);
  });

  it('maps any chord MIDI note in E2..G5 to the nearest choir anchor within +/-2 semitones and decodes Ooh/Ahh samples', async () => {
    expect(CHOIR_ANCHOR_MIDIS).toHaveLength(10);
    for (let midi = 40; midi <= 76; midi++) {
      const { anchorMidi, playbackRate } = findNearestChoirAnchor(midi);
      expect(Math.abs(midi - anchorMidi)).toBeLessThanOrEqual(2);
      expect(playbackRate).toBeCloseTo(Math.pow(2, (midi - anchorMidi) / 12), 6);
    }
    expect(getChoirSampleUrl('ooh', 60)).toMatch(/choir\/ooh-60\.mp3\?v=\d+$/);
    expect(getChoirSampleUrl('ahh', 40)).toMatch(/choir\/ahh-40\.mp3\?v=\d+$/);

    const fakeBuf = { duration: 4.22 } as AudioBuffer;
    const fakeCtx = {
      decodeAudioData: vi.fn().mockResolvedValue(fakeBuf),
    } as unknown as AudioContext;
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    }) as unknown as typeof fetch;

    const bank = new ChoirSampleBank(fetcher);
    await bank.preload(fakeCtx);
    expect(bank.isLoaded()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(20);

    const sample = bank.getSample('ahh', 62); // D4 -> nearest anchor C4 (60) or E4 (64), +2/-2 semitones
    expect(sample).not.toBeNull();
    expect(sample!.buffer).toBe(fakeBuf);
    expect(Math.abs(Math.log2(sample!.playbackRate) * 12)).toBeLessThanOrEqual(2.001);
  });

  it('centers bass pan and spreads upper voices symmetrically inside [-0.3, 0.3]', () => {
    expect(Math.abs(computeVoicePan(0, 4, 'bass'))).toBeLessThanOrEqual(0.05);
    const upperPans = [
      computeVoicePan(1, 4, 'harmony'),
      computeVoicePan(2, 4, 'harmony'),
      computeVoicePan(3, 4, 'harmony'),
    ];
    for (const pan of upperPans) {
      expect(pan).toBeGreaterThanOrEqual(-0.3);
      expect(pan).toBeLessThanOrEqual(0.3);
    }
    expect(upperPans[0]).toBeLessThan(0);
    expect(upperPans[2]).toBeGreaterThan(0);
  });

  it('builds pre-delayed damped stereo impulse responses for Warm Room and Lush Hall', () => {
    const fakeCtx = {
      sampleRate: 44100,
      createBuffer: (_ch: number, len: number) => {
        const ch0 = new Float32Array(len);
        const ch1 = new Float32Array(len);
        return {
          length: len,
          numberOfChannels: 2,
          getChannelData: (c: number) => (c === 0 ? ch0 : ch1),
        } as unknown as AudioBuffer;
      },
    } as unknown as BaseAudioContext;

    expect(AMBIENCE_CONFIGS.dry.wetGain).toBe(0);

    for (const mode of ['warm-room', 'lush-hall'] as const) {
      const ir = createAmbienceImpulseResponse(fakeCtx, mode);
      const left = ir.getChannelData(0);
      const right = ir.getChannelData(1);
      // Pre-delay starts strictly silent
      expect(left[0]).toBe(0);
      expect(right[0]).toBe(0);
      // Tail has bounded non-zero energy
      const peak = left.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThanOrEqual(0.5);
    }
  });

  it('defaults fresh settings to grand-piano + warm-room, 80% mix, final replay ON, length 4 (max 8), and force-resets legacy v1 storage', () => {
    const fresh = sanitizeSettings(null);
    expect(fresh.timbre).toBe('grand-piano');
    expect(fresh.melodyTimbre).toBe('grand-piano');
    expect(fresh.ambience).toBe('warm-room');
    expect(fresh.voicePanning).toBe(true);
    expect(fresh.voicePanningMode).toBe('satb');
    expect(fresh.announceTriadQuality).toBe(false);
    expect(fresh.playChordsBehindAnswer).toBe(true);
    expect(fresh.playFinalReplayAfterAnswer).toBe(true);
    expect(fresh.progressionLength).toBe(4);
    expect(fresh.bpm).toBe(120);
    expect(fresh.chordVolume).toBe(0.8);
    expect(fresh.voiceVolume).toBe(0.8);

    // Legacy v1 storage is discarded and cleared in favor of fresh v2 defaults
    window.localStorage.clear();
    window.localStorage.setItem(
      LEGACY_SETTINGS_STORAGE_KEY,
      JSON.stringify({ timbre: 'felt-piano', chordVolume: 0.5, bpm: 90 }),
    );
    const migrated = loadSettings();
    expect(migrated.timbre).toBe('grand-piano');
    expect(migrated.chordVolume).toBe(0.8);
    expect(migrated.bpm).toBe(120);
    expect(window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)).toBeNull();

    // New v2 settings persist normally after reset
    saveSettings({ ...migrated, bpm: 96, timbre: 'felt-piano' });
    const reloaded = loadSettings();
    expect(reloaded.bpm).toBe(96);
    expect(reloaded.timbre).toBe('felt-piano');
    window.localStorage.clear();

    expect(sanitizeSettings({ bpm: 40 }).bpm).toBe(60);
    expect(sanitizeSettings({ bpm: 240 }).bpm).toBe(240);
    expect(sanitizeSettings({ bpm: 300 }).bpm).toBe(240);

    expect(sanitizeSettings({ announceTriadQuality: true }).announceTriadQuality).toBe(true);
    expect(sanitizeSettings({ progressionLength: 8 }).progressionLength).toBe(8);
    expect(sanitizeSettings({ progressionLength: 1 }).progressionLength).toBe(2);
    expect(sanitizeSettings({ progressionLength: 12 }).progressionLength).toBe(8);

    // Removed legacy classic timbres fall back cleanly to grand-piano default
    expect(sanitizeSettings({ timbre: 'electric-piano' }).timbre).toBe(
      'grand-piano',
    );
    expect(sanitizeSettings({ timbre: 'soft-pad' }).timbre).toBe('grand-piano');
    expect(sanitizeSettings({ ambience: 'lush-hall' }).ambience).toBe(
      'lush-hall',
    );
    expect(sanitizeSettings({ droneOctave: 2 }).droneOctave).toBe(2);
    expect(sanitizeSettings({ droneOctave: -5 }).droneOctave).toBe(-1);
    expect(sanitizeSettings({ droneOctave: 9 }).droneOctave).toBe(2);

    // Inversion settings defaults, clamping, and override sanitization
    expect(fresh.triadInversions).toEqual([0]);
    expect(fresh.seventhInversions).toEqual([0]);
    expect(fresh.chordInversionOverrides).toEqual({});
    expect(fresh.inversionNotation).toBe('inversion-name');
    expect(fresh.musicalInversionLeading).toBe(true);

    const customInv = sanitizeSettings({
      triadInversions: [2, 0, 99, 2],
      seventhInversions: [3, 1, -1],
      chordInversionOverrides: {
        I: [1, 3, 2],
        V7: [3, 0],
        invalid: [1],
        V: [],
      },
      inversionNotation: 'bass-tone',
      musicalInversionLeading: false,
    });
    expect(customInv.triadInversions).toEqual([0, 2]);
    expect(customInv.seventhInversions).toEqual([1, 3]);
    expect(customInv.chordInversionOverrides).toEqual({
      I: [1, 2],
      V7: [0, 3],
    });
    expect(customInv.inversionNotation).toBe('bass-tone');
    expect(sanitizeSettings({ inversionNotation: 'scale-degree' }).inversionNotation).toBe(
      'scale-degree',
    );
    expect(sanitizeSettings({ inversionNotation: 'solfege' }).inversionNotation).toBe(
      'solfege',
    );
    expect(customInv.musicalInversionLeading).toBe(false);
  });

  it('maps drone octave offsets cleanly from deep bass (-1) to high soprano pedal (+2)', () => {
    // C (0): -1 = C2 (36), 0 = C3 (48), +1 = C4 (60), +2 = C5 (72)
    expect(pitchClassToDroneMidi(0, -1)).toBe(36);
    expect(pitchClassToDroneMidi(0, 0)).toBe(48);
    expect(pitchClassToDroneMidi(0, 1)).toBe(60);
    expect(pitchClassToDroneMidi(0, 2)).toBe(72);

    expect(formatDroneNoteName(0, -1)).toBe('C2');
    expect(formatDroneNoteName(0, 2)).toBe('C5');
    // G (7): +2 = G5 (79), clearly above E5 (76) upper chord ceiling
    expect(pitchClassToDroneMidi(7, 2)).toBe(79);
    expect(formatDroneNoteName(7, 2)).toBe('G5');
  });

  it('uses midrange EQ pocket carving with gentle broadband cushion when ducking', async () => {
    const createdFilters: Array<{
      type: string;
      frequency: { value: number };
      Q: { value: number };
      gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
    }> = [];
    const createdGains: Array<{
      gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
    }> = [];

    const makeParam = (initial = 0) => ({
      value: initial,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });

    class MockAudioContext {
      currentTime = 2.0;
      sampleRate = 44100;
      state = 'running';
      destination = {};
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createGain = vi.fn(() => {
        const node = {
          gain: makeParam(1),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdGains.push(node);
        return node;
      });
      createBiquadFilter = vi.fn(() => {
        const node = {
          type: 'lowpass',
          frequency: makeParam(350),
          Q: makeParam(1),
          gain: makeParam(0),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdFilters.push(node);
        return node;
      });
      createConvolver = vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createDynamicsCompressor = vi.fn(() => ({
        threshold: makeParam(-6),
        knee: makeParam(12),
        ratio: makeParam(3),
        attack: makeParam(0.008),
        release: makeParam(0.18),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBuffer = vi.fn((ch: number, len: number) => {
        const channels = Array.from({ length: ch }, () => new Float32Array(len));
        return {
          length: len,
          numberOfChannels: ch,
          getChannelData: (c: number) => channels[c],
        };
      });
    }

    const originalAudioContext = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
      writable: true,
    });

    try {
      const synth = new PolySynth();
      await synth.ensureContext();

      const pocketFilter = createdFilters.find((f) => f.type === 'peaking');
      expect(pocketFilter).toBeDefined();
      expect(pocketFilter!.frequency.value).toBe(VOICE_POCKET_FREQ_HZ);
      expect(pocketFilter!.gain.value).toBe(0);

      const chordBus = createdGains[0];
      synth.setDucked(true, 2.0);
      expect(chordBus.gain.setTargetAtTime).toHaveBeenCalledWith(
        DUCKED_CHORD_BUS_GAIN,
        2.0,
        0.08,
      );
      expect(pocketFilter!.gain.setTargetAtTime).toHaveBeenCalledWith(
        VOICE_POCKET_CUT_DB,
        2.0,
        0.08,
      );

      synth.setDucked(false, 4.0);
      expect(chordBus.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, 4.0, 0.08);
      expect(pocketFilter!.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        4.0,
        0.08,
      );

      synth.setDucked(false, 6.0, 0.006);
      expect(chordBus.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, 6.0, 0.006);
      expect(pocketFilter!.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        6.0,
        0.006,
      );

      synth.dispose();
    } finally {
      Object.defineProperty(window, 'AudioContext', {
        value: originalAudioContext,
        configurable: true,
        writable: true,
      });
    }
  });

  it('validates melody settings, scales melody gain, shapes melody voices, and cancels future melody notes cleanly on releaseAll', async () => {
    expect(melodySliderToGain(0)).toBe(0);
    expect(melodySliderToGain(0.75)).toBeCloseTo(0.98, 1);

    const fresh = sanitizeSettings({});
    expect(fresh.melodyEnabled).toBe(false);
    expect(fresh.melodyAllowTensions).toBe(false);
    expect(fresh.melodyVolume).toBe(0.5);
    expect(fresh.melodyTimbre).toBe('grand-piano');

    // Missing melodyTimbre matches sanitized chord timbre by default
    const paired = sanitizeSettings({ timbre: 'warm-rhodes' });
    expect(paired.melodyTimbre).toBe('warm-rhodes');

    const custom = sanitizeSettings({
      timbre: 'grand-piano',
      melodyEnabled: true,
      melodyAllowTensions: true,
      melodyVolume: 2.5,
      melodyTimbre: 'concert-harp',
    });
    expect(custom.melodyEnabled).toBe(true);
    expect(custom.melodyAllowTensions).toBe(true);
    expect(custom.melodyVolume).toBe(1);
    expect(custom.melodyTimbre).toBe('concert-harp');
    expect(MELODY_COUNT_SCALE).toBeCloseTo(0.58, 2);

    const createdGains: Array<{
      gain: {
        value: number;
        setValueAtTime: ReturnType<typeof vi.fn>;
        setTargetAtTime: ReturnType<typeof vi.fn>;
        linearRampToValueAtTime: ReturnType<typeof vi.fn>;
        cancelScheduledValues: ReturnType<typeof vi.fn>;
      };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    const createdFilters: Array<{
      type: string;
      frequency: {
        value: number;
        setValueAtTime: ReturnType<typeof vi.fn>;
      };
      Q: { value: number };
      gain: { value: number };
    }> = [];
    const createdPanners: Array<{
      pan: { setValueAtTime: ReturnType<typeof vi.fn> };
    }> = [];
    const createdOscs: Array<{
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];

    const makeParam = (initial = 0) => ({
      value: initial,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });

    class MockPolyContext {
      currentTime = 2.0;
      sampleRate = 44100;
      state = 'running';
      destination = {};
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createPeriodicWave = vi.fn(() => ({}));
      createWaveShaper = vi.fn(() => ({
        curve: null,
        oversample: 'none',
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createGain = vi.fn(() => {
        const node = {
          gain: makeParam(1),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdGains.push(node);
        return node;
      });
      createBiquadFilter = vi.fn(() => {
        const node = {
          type: 'lowpass',
          frequency: makeParam(350),
          Q: makeParam(1),
          gain: makeParam(0),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdFilters.push(node);
        return node;
      });
      createStereoPanner = vi.fn(() => {
        const node = {
          pan: makeParam(0),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdPanners.push(node);
        return node;
      });
      createOscillator = vi.fn(() => {
        const node = {
          type: 'sine',
          frequency: makeParam(440),
          detune: makeParam(0),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          connect: vi.fn(),
          setPeriodicWave: vi.fn(),
          onended: null as (() => void) | null,
        };
        createdOscs.push(node);
        return node;
      });
      createBufferSource = vi.fn(() => ({
        buffer: null,
        playbackRate: makeParam(1),
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        onended: null as (() => void) | null,
      }));
      createConvolver = vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createDynamicsCompressor = vi.fn(() => ({
        threshold: makeParam(-6),
        knee: makeParam(12),
        ratio: makeParam(3),
        attack: makeParam(0.008),
        release: makeParam(0.18),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBuffer = vi.fn((ch: number, len: number) => {
        const channels = Array.from({ length: ch }, () => new Float32Array(len));
        return {
          length: len,
          numberOfChannels: ch,
          getChannelData: (c: number) => channels[c],
        };
      });
    }

    const originalAudioContext = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: MockPolyContext,
      configurable: true,
      writable: true,
    });

    try {
      const synth = new PolySynth();
      await synth.ensureContext();
      synth.setMelodyVolume(0.5);

      const melodyLevelGain = createdGains[3];
      expect(melodyLevelGain.gain.setTargetAtTime).toHaveBeenCalledWith(
        melodySliderToGain(0.5),
        2.0,
        0.04,
      );

      // Play a chord with a future melody note scheduled on velvet-pad -> faster 55ms attack & brighter filter
      const oscCountBefore = createdOscs.length;
      const gainCountBefore = createdGains.length;
      const filterCountBefore = createdFilters.length;
      const pannerCountBefore = createdPanners.length;

      synth.playChord(
        [
          {
            midi: 48,
            offsetSec: 0,
            durationSec: 1.5,
            velocity: 0.68,
            role: 'bass',
            pan: -0.25,
          },
          {
            midi: 76,
            offsetSec: 0.6,
            durationSec: 0.5,
            velocity: 0.92,
            role: 'melody',
            timbre: 'velvet-pad',
            pan: 0,
          },
        ],
        2.0,
        'velvet-pad',
      );

      // Melody panner stays centered (0); melody filter opens brighter (1600 -> 4400)
      const notePanners = createdPanners.slice(pannerCountBefore);
      expect(notePanners[0].pan.setValueAtTime).toHaveBeenCalledWith(-0.25, 2.0);
      expect(notePanners[1].pan.setValueAtTime).toHaveBeenCalledWith(0, 2.0);

      const noteFilters = createdFilters.slice(filterCountBefore);
      expect(noteFilters[0].frequency.setValueAtTime).toHaveBeenCalledWith(650, 2.0);
      expect(noteFilters[1].frequency.setValueAtTime).toHaveBeenCalledWith(1600, 2.0);

      // Melody velvet-pad attack is crisp 55ms instead of slow 180ms swell
      const newGains = createdGains.slice(gainCountBefore);
      // Bass envGain ramps to peak at t0 + 0.18; Melody envGain ramps at t0 + 0.055
      const melodyEnvGain = newGains.find((g) =>
        g.gain.linearRampToValueAtTime.mock.calls.some(
          (call) => Math.abs((call[1] as number) - (2.605 + 0.055)) < 0.01,
        ),
      );
      expect(melodyEnvGain).toBeDefined();

      // Cancel while future melody note has NOT started yet (reqTime 2.0 < t0 2.6)
      const melodyReleaseGain = newGains[newGains.indexOf(melodyEnvGain!) + 1];
      synth.releaseAll();
      expect(melodyReleaseGain.gain.cancelScheduledValues).toHaveBeenCalledWith(2.0);
      expect(melodyReleaseGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 2.0);
      expect(createdOscs.slice(oscCountBefore).length).toBeGreaterThan(0);

      synth.dispose();
    } finally {
      Object.defineProperty(window, 'AudioContext', {
        value: originalAudioContext,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe('mastering chain, studio reverb & expanded wavetable synths', () => {
  it('generates a strictly linear-to-tanh transparent soft-clip curve and DC-free asymmetric bass exciter curve', () => {
    const clipCurve = createTransparentSoftClipCurve(0.78, 0.92, 2049);
    expect(clipCurve).toHaveLength(2049);
    const mid = 1024;
    expect(clipCurve[mid]).toBeCloseTo(0, 6);

    for (let i = 0; i < clipCurve.length; i++) {
      const x = (i * 2) / (clipCurve.length - 1) - 1;
      const y = clipCurve[i];
      expect(Math.abs(y)).toBeLessThanOrEqual(0.92 + 1e-6);
      if (Math.abs(x) <= 0.78) {
        expect(y).toBeCloseTo(x, 5);
      }
      // Odd symmetry & monotonicity
      expect(clipCurve[clipCurve.length - 1 - i]).toBeCloseTo(-y, 5);
      if (i > 0) {
        expect(y).toBeGreaterThanOrEqual(clipCurve[i - 1]);
      }
    }

    const exciterCurve = createBassExciterCurve(1.85, 0.22, 1025);
    expect(exciterCurve).toHaveLength(1025);
    // Exact zero at x=0 (no DC offset)
    expect(exciterCurve[512]).toBeCloseTo(0, 6);
    // Asymmetric response generates both even (2nd) and odd (3rd) harmonics
    const posQuarter = exciterCurve[512 + 256]; // x = +0.5
    const negQuarter = exciterCurve[512 - 256]; // x = -0.5
    expect(Math.abs(posQuarter + negQuarter)).toBeGreaterThan(0.01);
    for (let i = 0; i < exciterCurve.length; i++) {
      expect(Math.abs(exciterCurve[i])).toBeLessThanOrEqual(1.0 + 1e-6);
    }
  });

  it('wires MasterOutputChain with 4x shapers and switches Phone Speaker / Headphones smoothly', () => {
    const makeParam = (initial = 0) => ({
      value: initial,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });

    const filters: Array<{
      type: string;
      frequency: ReturnType<typeof makeParam>;
      Q: ReturnType<typeof makeParam>;
      gain: ReturnType<typeof makeParam>;
    }> = [];
    const shapers: Array<{
      curve: Float32Array | null;
      oversample: string;
    }> = [];
    const compressors: Array<{
      threshold: ReturnType<typeof makeParam>;
      knee: ReturnType<typeof makeParam>;
      ratio: ReturnType<typeof makeParam>;
      attack: ReturnType<typeof makeParam>;
      release: ReturnType<typeof makeParam>;
    }> = [];

    const mockCtx = {
      currentTime: 5.0,
      createGain: vi.fn(() => ({
        gain: makeParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createBiquadFilter: vi.fn(() => {
        const node = {
          type: 'lowpass',
          frequency: makeParam(350),
          Q: makeParam(1),
          gain: makeParam(0),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        filters.push(node);
        return node;
      }),
      createWaveShaper: vi.fn(() => {
        const node = {
          curve: null as Float32Array | null,
          oversample: 'none',
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        shapers.push(node);
        return node;
      }),
      createDynamicsCompressor: vi.fn(() => {
        const node = {
          threshold: makeParam(-6),
          knee: makeParam(12),
          ratio: makeParam(3),
          attack: makeParam(0.008),
          release: makeParam(0.18),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        compressors.push(node);
        return node;
      }),
    } as unknown as AudioContext;

    const chain = new MasterOutputChain(mockCtx, 'phone-speaker');
    expect(shapers).toHaveLength(2);
    expect(shapers[0].oversample).toBe('4x');
    expect(shapers[1].oversample).toBe('4x');
    expect(compressors).toHaveLength(2);
    // Safety brickwall limiter + -1.0 dBFS output trim
    expect(compressors[1].threshold.value).toBe(-1.8);
    expect(compressors[1].ratio.value).toBe(20);
    expect(compressors[1].knee.value).toBe(0);
    expect(chain.output.gain.value).toBe(0.89);
    // Sub-bass HPF starts at Phone Speaker 105 Hz
    const subHpf = filters[1];
    expect(subHpf.frequency.value).toBe(
      OUTPUT_PROFILE_CONFIGS['phone-speaker'].subHpfHz,
    );

    chain.setProfile('headphones' as ResolvedOutputProfile, 5.5);
    expect(subHpf.frequency.setTargetAtTime).toHaveBeenCalledWith(30, 5.5, 0.03);
    expect(chain.voicePresenceEq.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      5.5,
      0.03,
    );

    chain.setProfile('phone-speaker', 6.0);
    expect(subHpf.frequency.setTargetAtTime).toHaveBeenCalledWith(105, 6.0, 0.03);
    expect(chain.voicePresenceEq.gain.setTargetAtTime).toHaveBeenCalledWith(
      2.2,
      6.0,
      0.03,
    );

    chain.dispose();
  });

  it('resolves Auto output profile for CarPlay, AirPods, iPhone speaker, Android, and desktop, plus formatted hints', async () => {
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
        coarsePointer: true,
        outputLatency: 0.02,
      }),
    ).toEqual({
      profile: 'phone-speaker',
      reason: 'mobile-default',
      outputLatencyMs: 20,
      deviceLabel: null,
    });
    expect(
      resolveAutoOutputProfile({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
        coarsePointer: true,
        outputLatency: 0.02,
      }),
    ).toBe('phone-speaker');

    // Wired CarPlay on iPhone (~50-70 ms AVAudioSession.Port.carAudio) clears 40 ms iOS threshold
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
        coarsePointer: true,
        outputLatency: 0.055,
      }),
    ).toEqual({
      profile: 'headphones',
      reason: 'latency',
      outputLatencyMs: 55,
      deviceLabel: null,
    });

    // iPadOS reports Macintosh UA with maxTouchPoints > 1
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
        coarsePointer: true,
        outputLatency: 0.05,
      }),
    ).toEqual({
      profile: 'headphones',
      reason: 'latency',
      outputLatencyMs: 50,
      deviceLabel: null,
    });
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
        coarsePointer: true,
        outputLatency: 0.02,
      }).profile,
    ).toBe('phone-speaker');

    // Android built-in speaker can report ~65 ms (< 100 ms threshold) -> still Phone Speaker
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
        coarsePointer: true,
        outputLatency: 0.065,
      }).profile,
    ).toBe('phone-speaker');

    // Bluetooth wireless latency (>= 100 ms) switches Android to Headphones profile
    expect(
      resolveAutoOutputProfile({
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
        coarsePointer: true,
        outputLatency: 0.16,
      }),
    ).toBe('headphones');

    // Unmeasured outputLatency (0 or undefined) reports null ms on mobile default
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
        coarsePointer: true,
        outputLatency: 0,
      }),
    ).toEqual({
      profile: 'phone-speaker',
      reason: 'mobile-default',
      outputLatencyMs: null,
      deviceLabel: null,
    });

    // Desktop browser defaults to Headphones full-range tuning
    expect(
      resolveAutoOutputInfo({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        coarsePointer: false,
        isMobileHint: false,
        outputLatency: 0.015,
      }),
    ).toEqual({
      profile: 'headphones',
      reason: 'desktop',
      outputLatencyMs: 15,
      deviceLabel: null,
    });

    // Exposed CarPlay audiooutput label selects Headphones; built-in "iPhone Stereo Speaker" does not
    const origMediaDevices = Object.getOwnPropertyDescriptor(
      navigator,
      'mediaDevices',
    );
    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audiooutput', label: 'Default - CarPlay' },
          ]),
        },
        configurable: true,
      });
      const carPlayInfo = await detectOutputProfileInfo({
        outputLatency: 0.055,
      } as unknown as AudioContext);
      expect(carPlayInfo).toEqual({
        profile: 'headphones',
        reason: 'device-label',
        outputLatencyMs: 55,
        deviceLabel: 'Default - CarPlay',
      });
      expect(formatAutoOutputHint(carPlayInfo)).toBe(
        'Currently using: Headphones (CarPlay)',
      );

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audiooutput', label: 'iPhone Stereo Speaker' },
          ]),
        },
        configurable: true,
      });
      const speakerInfo = await detectOutputProfileInfo({
        outputLatency: 0.02,
      } as unknown as AudioContext);
      expect(speakerInfo.reason).not.toBe('device-label');
    } finally {
      if (origMediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', origMediaDevices);
      } else {
        delete (navigator as unknown as Record<string, unknown>).mediaDevices;
      }
    }

    expect(
      formatAutoOutputHint({
        profile: 'headphones',
        reason: 'latency',
        outputLatencyMs: 55,
        deviceLabel: null,
      }),
    ).toBe('Currently using: Headphones (external output · 55 ms)');
    expect(
      formatAutoOutputHint({
        profile: 'headphones',
        reason: 'desktop',
        outputLatencyMs: 15,
        deviceLabel: null,
      }),
    ).toBe('Currently using: Headphones (desktop)');
    expect(
      formatAutoOutputHint({
        profile: 'phone-speaker',
        reason: 'mobile-default',
        outputLatencyMs: 20,
        deviceLabel: null,
      }),
    ).toBe('Currently using: Phone Speaker (built-in output · 20 ms)');
    expect(
      formatAutoOutputHint({
        profile: 'phone-speaker',
        reason: 'mobile-default',
        outputLatencyMs: null,
        deviceLabel: null,
      }),
    ).toBe(
      'Currently using: Phone Speaker (mobile default · checks when audio plays)',
    );
  });

  it('reactively updates Auto output profile on PolySynth when CarPlay latency settles or route changes and cleans up timers', async () => {
    const makeParam = (initial = 0) => ({
      value: initial,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });
    const createdFilters: Array<{
      type: string;
      frequency: ReturnType<typeof makeParam>;
    }> = [];

    let mockCtxInstance: {
      currentTime: number;
      sampleRate: number;
      state: string;
      outputLatency: number;
      destination: Record<string, never>;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      createWaveShaper: ReturnType<typeof vi.fn>;
      createGain: ReturnType<typeof vi.fn>;
      createBiquadFilter: ReturnType<typeof vi.fn>;
      createConvolver: ReturnType<typeof vi.fn>;
      createDynamicsCompressor: ReturnType<typeof vi.fn>;
      createBuffer: ReturnType<typeof vi.fn>;
    } | null = null;

    class MockReactiveAudioContext {
      currentTime = 1.0;
      sampleRate = 44100;
      state = 'running';
      outputLatency = 0.018;
      destination = {};
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createWaveShaper = vi.fn(() => ({
        curve: null,
        oversample: 'none',
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createGain = vi.fn(() => ({
        gain: makeParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBiquadFilter = vi.fn(() => {
        const node = {
          type: 'lowpass',
          frequency: makeParam(350),
          Q: makeParam(1),
          gain: makeParam(0),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdFilters.push(node);
        return node;
      });
      createConvolver = vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createDynamicsCompressor = vi.fn(() => ({
        threshold: makeParam(-6),
        knee: makeParam(12),
        ratio: makeParam(3),
        attack: makeParam(0.008),
        release: makeParam(0.18),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBuffer = vi.fn((ch: number, len: number) => {
        const channels = Array.from({ length: ch }, () => new Float32Array(len));
        return {
          length: len,
          numberOfChannels: ch,
          getChannelData: (c: number) => channels[c],
        };
      });

      constructor() {
        mockCtxInstance = this;
      }
    }

    const origAudioContext = window.AudioContext;
    const origUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    const origMatchMedia = window.matchMedia;
    const origMediaDevices = Object.getOwnPropertyDescriptor(
      navigator,
      'mediaDevices',
    );

    vi.useFakeTimers();
    Object.defineProperty(window, 'AudioContext', {
      value: MockReactiveAudioContext,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)',
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
    } as MediaQueryList);

    try {
      const synth = new PolySynth();
      const emissions: Array<{ profile: string; reason: string; outputLatencyMs: number | null }> = [];
      synth.onOutputProfileChange((info) => {
        emissions.push({
          profile: info.profile,
          reason: info.reason,
          outputLatencyMs: info.outputLatencyMs,
        });
      });

      await synth.ensureContext();
      expect(synth.getResolvedOutputInfo()).toEqual({
        profile: 'phone-speaker',
        reason: 'mobile-default',
        outputLatencyMs: 18,
        deviceLabel: null,
      });

      // Sub-bass HPF created after warmthFilter + reverbHpf
      const subHpf = createdFilters.find((f) => f.type === 'highpass' && f.frequency.value === 105);
      expect(subHpf).toBeDefined();

      // Simulate WebKit pushing wired CarPlay latency (~55 ms) shortly after playback starts
      mockCtxInstance!.outputLatency = 0.055;
      await vi.advanceTimersByTimeAsync(250);

      expect(synth.getResolvedOutputInfo()).toEqual({
        profile: 'headphones',
        reason: 'latency',
        outputLatencyMs: 55,
        deviceLabel: null,
      });
      expect(subHpf!.frequency.setTargetAtTime).toHaveBeenCalledWith(30, 1.0, 0.03);
      expect(emissions.at(-1)).toEqual({
        profile: 'headphones',
        reason: 'latency',
        outputLatencyMs: 55,
      });

      // Returning to built-in speaker triggers update on visibilitychange
      mockCtxInstance!.outputLatency = 0.018;
      document.dispatchEvent(new Event('visibilitychange'));
      expect(synth.getResolvedOutputInfo()).toEqual({
        profile: 'phone-speaker',
        reason: 'mobile-default',
        outputLatencyMs: 18,
        deviceLabel: null,
      });
      expect(subHpf!.frequency.setTargetAtTime).toHaveBeenCalledWith(105, 1.0, 0.03);

      synth.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, 'AudioContext', {
        value: origAudioContext,
        configurable: true,
        writable: true,
      });
      if (origUserAgent) {
        Object.defineProperty(navigator, 'userAgent', origUserAgent);
      }
      window.matchMedia = origMatchMedia;
      if (origMediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', origMediaDevices);
      } else {
        delete (navigator as unknown as Record<string, unknown>).mediaDevices;
      }
    }
  });

  it('builds stereo-decorrelated early-reflection impulse responses with clean pre-delay', () => {
    const fakeCtx = {
      sampleRate: 44100,
      createBuffer: (_ch: number, len: number) => {
        const ch0 = new Float32Array(len);
        const ch1 = new Float32Array(len);
        return {
          length: len,
          numberOfChannels: 2,
          getChannelData: (c: number) => (c === 0 ? ch0 : ch1),
        } as unknown as AudioBuffer;
      },
    } as unknown as BaseAudioContext;

    const ir = createAmbienceImpulseResponse(fakeCtx, 'warm-room');
    const left = ir.getChannelData(0);
    const right = ir.getChannelData(1);

    // Pre-delay region (first 12ms = 529 samples) starts strictly silent
    expect(left[0]).toBe(0);
    expect(right[0]).toBe(0);
    expect(left[400]).toBe(0);
    expect(right[400]).toBe(0);

    // Early reflection window (12ms..55ms) has clear stereo decorrelated energy
    let diffEnergy = 0;
    for (let i = 529; i < 2400; i++) {
      diffEnergy += Math.abs(left[i] - right[i]);
    }
    expect(diffEnergy).toBeGreaterThan(1.0);
  });

  it('sanitizes outputProfile and renders all 4 new wavetable instruments cleanly', async () => {
    expect(sanitizeSettings({}).outputProfile).toBe('auto');
    expect(sanitizeSettings({ outputProfile: 'phone-speaker' }).outputProfile).toBe(
      'phone-speaker',
    );
    expect(sanitizeSettings({ outputProfile: 'headphones' }).outputProfile).toBe(
      'headphones',
    );
    expect(sanitizeSettings({ outputProfile: 'speaker' as AudioOutputProfile }).outputProfile).toBe(
      'auto',
    );

    for (const id of [
      'wurlitzer',
      'juno-poly',
      'jazz-organ',
      'glass-celesta',
      'marimba',
      'woodwind-choir',
      'steel-guitar',
      'pizzicato-strings',
      'warm-sax',
      'warm-trombone',
      'lofi-tape',
      'harpsichord',
      'kalimba',
      'analog-brass',
      'retro-8bit',
      'shimmer-pad',
    ] as const) {
      expect(sanitizeSettings({ timbre: id }).timbre).toBe(id);
      expect(sanitizeSettings({ timbre: id }).melodyTimbre).toBe(id);
    }

    const makeParam = (initial = 0) => ({
      value: initial,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    });
    const createdOscs: Array<{ start: ReturnType<typeof vi.fn> }> = [];
    const createdShapers: Array<{ oversample: string }> = [];

    class MockNewTimbreContext {
      currentTime = 1.0;
      sampleRate = 44100;
      state = 'running';
      destination = {};
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createPeriodicWave = vi.fn(() => ({}));
      createWaveShaper = vi.fn(() => {
        const node = {
          curve: null,
          oversample: 'none',
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        createdShapers.push(node);
        return node;
      });
      createGain = vi.fn(() => ({
        gain: makeParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBiquadFilter = vi.fn(() => ({
        type: 'lowpass',
        frequency: makeParam(350),
        Q: makeParam(1),
        gain: makeParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createStereoPanner = vi.fn(() => ({
        pan: makeParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createOscillator = vi.fn(() => {
        const node = {
          type: 'sine',
          frequency: makeParam(440),
          detune: makeParam(0),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          connect: vi.fn(),
          setPeriodicWave: vi.fn(),
          onended: null as (() => void) | null,
        };
        createdOscs.push(node);
        return node;
      });
      createBufferSource = vi.fn(() => ({
        buffer: null,
        playbackRate: makeParam(1),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        onended: null as (() => void) | null,
      }));
      createConvolver = vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createDynamicsCompressor = vi.fn(() => ({
        threshold: makeParam(-6),
        knee: makeParam(12),
        ratio: makeParam(3),
        attack: makeParam(0.008),
        release: makeParam(0.18),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBuffer = vi.fn((ch: number, len: number) => {
        const channels = Array.from({ length: ch }, () => new Float32Array(len));
        return {
          length: len,
          numberOfChannels: ch,
          getChannelData: (c: number) => channels[c],
        };
      });
    }

    const originalAudioContext = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: MockNewTimbreContext,
      configurable: true,
      writable: true,
    });

    try {
      const synth = new PolySynth();
      await synth.ensureContext();
      synth.setOutputProfile('headphones');
      synth.setOutputProfile('phone-speaker');

      for (const timbre of [
        'warm-rhodes',
        'wurlitzer',
        'juno-poly',
        'jazz-organ',
        'glass-celesta',
        'lofi-tape',
        'harpsichord',
        'kalimba',
        'analog-brass',
        'retro-8bit',
        'shimmer-pad',
      ] as const) {
        const oscBefore = createdOscs.length;
        const handle = synth.playChord(
          [
            {
              midi: 48,
              offsetSec: 0,
              durationSec: 1.0,
              velocity: 0.78,
              role: 'bass',
            },
            {
              midi: 64,
              offsetSec: 0.01,
              durationSec: 1.0,
              velocity: 0.65,
              role: 'harmony',
            },
            {
              midi: 76,
              offsetSec: 0.05,
              durationSec: 0.5,
              velocity: 0.9,
              role: 'melody',
            },
          ],
          1.0,
          timbre,
        );
        expect(createdOscs.length).toBeGreaterThan(oscBefore);
        handle.release(1.4);
      }

      // Warm Rhodes + Wurlitzer + MasterOutputChain all enforce 4x oversampling on WaveShapers
      expect(createdShapers.length).toBeGreaterThanOrEqual(4);
      for (const shaper of createdShapers) {
        expect(shaper.oversample).toBe('4x');
      }

      synth.dispose();
    } finally {
      Object.defineProperty(window, 'AudioContext', {
        value: originalAudioContext,
        configurable: true,
        writable: true,
      });
    }
  });
});
