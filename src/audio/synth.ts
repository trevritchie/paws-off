import type { ScheduledNote } from '../music/arrangement';
import { midiToFreq } from '../music/voicing';
import type {
  AmbienceMode,
  AudioOutputProfile,
  ResolvedOutputProfile,
  TimbreId,
} from '../types/settings';
import { ChoirSampleBank } from './choirSamples';
import { buildInstrumentVoice } from './instruments';
import {
  computeVoicePan,
  createVoiceSharedResources,
  type VoiceSharedResources,
} from './instruments/types';
import {
  detectOutputProfile,
  MasterOutputChain,
  resolveAutoOutputProfile,
} from './mastering';
import { AMBIENCE_CONFIGS, createAmbienceImpulseResponse } from './reverb';
import { AcousticSampleBank, isAcousticSampleTimbre } from './sampleBank';
import { chordSliderToGain, melodySliderToGain, voiceSliderToGain } from './volume';

export interface ChordVoiceHandle {
  release(atTime: number, customFadeSec?: number): void;
}

export interface SynthEngine {
  ensureContext(): Promise<void>;
  getCurrentTime(): number;
  getContextState(): string;
  playChord(
    notes: readonly ScheduledNote[],
    startTime: number,
    timbre: TimbreId,
  ): ChordVoiceHandle;
  releaseAll(fadeSec?: number): void;
  setDucked(ducked: boolean, atTime?: number, timeConstantSec?: number): void;
  setChordVolume(volume: number): void;
  setMelodyVolume(volume: number): void;
  setVoiceVolume(volume: number): void;
  setAmbience(mode: AmbienceMode): void;
  setOutputProfile?(profile: AudioOutputProfile): void;
  preloadTimbre?(timbre: TimbreId): Promise<void>;
  onStateChange(cb: (state: string) => void): () => void;
  dispose(): void;
}

interface InternalVoiceEntry {
  release: (atTime: number, customFadeSec?: number) => void;
}

export const VOICE_POCKET_FREQ_HZ = 1600;
export const VOICE_POCKET_Q = 0.85;
export const VOICE_POCKET_CUT_DB = -7.5;
export const DUCKED_CHORD_BUS_GAIN = 0.78;
export const MELODY_COUNT_SCALE = 0.58;

export class PolySynth implements SynthEngine {
  private ctx: AudioContext | null = null;
  private chordBus: GainNode | null = null;
  private chordLevelGain: GainNode | null = null;
  private melodyBus: GainNode | null = null;
  private melodyLevelGain: GainNode | null = null;
  private voicePocketEq: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private voiceBus: GainNode | null = null;
  private masterChain: MasterOutputChain | null = null;
  private sharedResources: VoiceSharedResources | null = null;
  private choirBank = new ChoirSampleBank();
  private sampleBank = new AcousticSampleBank();
  private irCache = new Map<'warm-room' | 'lush-hall', AudioBuffer>();
  private graphNodes: AudioNode[] = [];

  private activeVoices = new Set<InternalVoiceEntry>();
  private stateListeners = new Set<(state: string) => void>();
  private isDucked = false;
  private chordVolume = 0.75;
  private melodyVolume = 0.75;
  private voiceVolume = 0.65;
  private ambience: AmbienceMode = 'warm-room';
  private outputProfile: AudioOutputProfile = 'auto';
  private resolvedOutputProfile: ResolvedOutputProfile = 'phone-speaker';
  private stateChangeBound: (() => void) | null = null;
  private deviceChangeBound: (() => void) | null = null;

  private resolveSyncProfile(ctx: AudioContext): ResolvedOutputProfile {
    if (this.outputProfile !== 'auto') {
      return this.outputProfile;
    }
    const latency = (ctx as AudioContext & { outputLatency?: number })
      .outputLatency;
    return resolveAutoOutputProfile({ outputLatency: latency });
  }

  private resolveAndApplyOutputProfile(ctx: AudioContext): void {
    const syncResolved = this.resolveSyncProfile(ctx);
    this.resolvedOutputProfile = syncResolved;
    this.masterChain?.setProfile(syncResolved, ctx.currentTime);

    if (this.outputProfile === 'auto') {
      void detectOutputProfile(ctx).then((asyncResolved) => {
        if (this.ctx !== ctx || this.outputProfile !== 'auto') return;
        this.resolvedOutputProfile = asyncResolved;
        this.masterChain?.setProfile(asyncResolved, ctx.currentTime);
      });
    }
  }

  private getOrCreateIr(
    ctx: AudioContext,
    mode: Exclude<AmbienceMode, 'dry'>,
  ): AudioBuffer {
    const cached = this.irCache.get(mode);
    if (cached) return cached;
    const ir = createAmbienceImpulseResponse(ctx, mode);
    this.irCache.set(mode, ir);
    return ir;
  }

  private initGraph(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx({ latencyHint: 'playback' });
    this.sharedResources = createVoiceSharedResources(ctx);

    const chordBus = ctx.createGain();
    chordBus.gain.value = this.isDucked ? DUCKED_CHORD_BUS_GAIN : 1.0;

    const chordLevelGain = ctx.createGain();
    chordLevelGain.gain.value = chordSliderToGain(this.chordVolume);

    const melodyBus = ctx.createGain();
    melodyBus.gain.value = 1.0;

    const melodyLevelGain = ctx.createGain();
    melodyLevelGain.gain.value = melodySliderToGain(this.melodyVolume);

    const warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.value = 6500;
    warmthFilter.Q.value = 0.5;

    const presenceShelf = ctx.createBiquadFilter();
    presenceShelf.type = 'highshelf';
    presenceShelf.frequency.value = 1600;
    presenceShelf.gain.value = 1.2;

    // Dynamic midrange pocket EQ engaged during narration so bass and top air
    // remain warm and intact while vocal clarity sits cleanly in the center.
    const voicePocketEq = ctx.createBiquadFilter();
    voicePocketEq.type = 'peaking';
    voicePocketEq.frequency.value = VOICE_POCKET_FREQ_HZ;
    voicePocketEq.Q.value = VOICE_POCKET_Q;
    voicePocketEq.gain.value = this.isDucked ? VOICE_POCKET_CUT_DB : 0;

    const ambCfg = AMBIENCE_CONFIGS[this.ambience];

    const dryGain = ctx.createGain();
    dryGain.gain.value = ambCfg.dryGain;

    const wetGain = ctx.createGain();
    wetGain.gain.value = ambCfg.wetGain;

    const reverbHpf = ctx.createBiquadFilter();
    reverbHpf.type = 'highpass';
    reverbHpf.frequency.value = 180;
    reverbHpf.Q.value = 0.707;

    const convolver = ctx.createConvolver();
    convolver.buffer = this.getOrCreateIr(
      ctx,
      this.ambience === 'dry' ? 'warm-room' : this.ambience,
    );

    const voiceBus = ctx.createGain();
    voiceBus.gain.value = voiceSliderToGain(this.voiceVolume);

    const initialResolved = this.resolveSyncProfile(ctx);
    this.resolvedOutputProfile = initialResolved;
    const masterChain = new MasterOutputChain(ctx, initialResolved);

    chordBus.connect(chordLevelGain);
    chordLevelGain.connect(warmthFilter);
    warmthFilter.connect(presenceShelf);
    presenceShelf.connect(voicePocketEq);
    melodyBus.connect(melodyLevelGain);
    melodyLevelGain.connect(voicePocketEq);
    voicePocketEq.connect(dryGain);
    voicePocketEq.connect(reverbHpf);
    reverbHpf.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(masterChain.input);
    wetGain.connect(masterChain.input);
    voiceBus.connect(masterChain.voicePresenceEq);
    masterChain.output.connect(ctx.destination);

    const onStateChange = () => {
      const state = ctx.state as string;
      if (state === 'running' && this.outputProfile === 'auto') {
        this.resolveAndApplyOutputProfile(ctx);
      }
      for (const listener of this.stateListeners) {
        listener(state);
      }
    };
    ctx.addEventListener('statechange', onStateChange);

    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.addEventListener === 'function'
    ) {
      const onDeviceChange = () => {
        if (this.ctx === ctx && this.outputProfile === 'auto') {
          this.resolveAndApplyOutputProfile(ctx);
        }
      };
      try {
        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
        this.deviceChangeBound = onDeviceChange;
      } catch {
        // Ignore restricted mediaDevices environments.
      }
    }

    this.ctx = ctx;
    this.chordBus = chordBus;
    this.chordLevelGain = chordLevelGain;
    this.melodyBus = melodyBus;
    this.melodyLevelGain = melodyLevelGain;
    this.voicePocketEq = voicePocketEq;
    this.dryGain = dryGain;
    this.wetGain = wetGain;
    this.convolver = convolver;
    this.voiceBus = voiceBus;
    this.masterChain = masterChain;
    this.graphNodes = [
      chordBus,
      chordLevelGain,
      melodyBus,
      melodyLevelGain,
      warmthFilter,
      presenceShelf,
      voicePocketEq,
      dryGain,
      wetGain,
      reverbHpf,
      convolver,
      voiceBus,
      ...masterChain.nodes,
    ];
    this.stateChangeBound = onStateChange;

    if (this.outputProfile === 'auto') {
      this.resolveAndApplyOutputProfile(ctx);
    }

    return ctx;
  }

  async ensureContext(): Promise<void> {
    const ctx = this.initGraph();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // Browsers may reject if called outside gesture; handled on state checks.
      }
    }
    if (this.outputProfile === 'auto') {
      this.resolveAndApplyOutputProfile(ctx);
    }
  }

  getAudioContext(): AudioContext | null {
    return this.ctx ?? this.initGraph();
  }

  getCompressorInput(): AudioNode | null {
    if (!this.ctx) this.initGraph();
    return this.masterChain?.input ?? null;
  }

  getVoiceInput(): AudioNode | null {
    if (!this.ctx) this.initGraph();
    return this.voiceBus;
  }

  getCurrentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  getContextState(): string {
    return this.ctx ? (this.ctx.state as string) : 'suspended';
  }

  onStateChange(cb: (state: string) => void): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  setDucked(ducked: boolean, atTime?: number, timeConstantSec = 0.08): void {
    this.isDucked = ducked;
    if (!this.ctx || !this.chordBus) return;
    const t = Math.max(this.ctx.currentTime, atTime ?? this.ctx.currentTime);
    const tau = Math.max(0.004, timeConstantSec);
    this.chordBus.gain.setTargetAtTime(
      ducked ? DUCKED_CHORD_BUS_GAIN : 1.0,
      t,
      tau,
    );
    if (this.voicePocketEq) {
      this.voicePocketEq.gain.setTargetAtTime(
        ducked ? VOICE_POCKET_CUT_DB : 0,
        t,
        tau,
      );
    }
  }

  setChordVolume(volume: number): void {
    this.chordVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.chordLevelGain) return;
    this.chordLevelGain.gain.setTargetAtTime(
      chordSliderToGain(this.chordVolume),
      this.ctx.currentTime,
      0.04,
    );
  }

  setMelodyVolume(volume: number): void {
    this.melodyVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.melodyLevelGain) return;
    this.melodyLevelGain.gain.setTargetAtTime(
      melodySliderToGain(this.melodyVolume),
      this.ctx.currentTime,
      0.04,
    );
  }

  setVoiceVolume(volume: number): void {
    this.voiceVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.voiceBus) return;
    this.voiceBus.gain.setTargetAtTime(
      voiceSliderToGain(this.voiceVolume),
      this.ctx.currentTime,
      0.04,
    );
  }

  setAmbience(mode: AmbienceMode): void {
    this.ambience = mode;
    if (!this.ctx || !this.dryGain || !this.wetGain || !this.convolver) return;

    const now = this.ctx.currentTime;
    const cfg = AMBIENCE_CONFIGS[mode];
    this.dryGain.gain.setTargetAtTime(cfg.dryGain, now, 0.04);

    if (mode === 'dry') {
      this.wetGain.gain.setTargetAtTime(0, now, 0.04);
      return;
    }

    const nextIr = this.getOrCreateIr(this.ctx, mode);
    if (this.convolver.buffer !== nextIr) {
      this.convolver.buffer = nextIr;
    }
    this.wetGain.gain.setTargetAtTime(cfg.wetGain, now, 0.05);
  }

  setOutputProfile(profile: AudioOutputProfile): void {
    this.outputProfile = profile;
    if (!this.ctx || !this.masterChain) return;
    this.resolveAndApplyOutputProfile(this.ctx);
  }

  getResolvedOutputProfile(): ResolvedOutputProfile {
    return this.resolvedOutputProfile;
  }

  async preloadTimbre(timbre: TimbreId): Promise<void> {
    if (timbre === 'satb-choir') {
      const ctx = this.initGraph();
      if (!ctx) return;
      await this.choirBank.preload(ctx);
      return;
    }
    if (isAcousticSampleTimbre(timbre)) {
      const ctx = this.initGraph();
      if (!ctx) return;
      await this.sampleBank.preload(ctx, timbre);
    }
  }

  playChord(
    notes: readonly ScheduledNote[],
    startTime: number,
    timbre: TimbreId,
  ): ChordVoiceHandle {
    const ctx = this.initGraph();
    if (!ctx || !this.chordBus || !this.sharedResources) {
      return { release: () => {} };
    }
    const chordDestination = this.chordBus;
    const melodyDestination = this.melodyBus ?? this.chordBus;
    const shared = this.sharedResources;

    const baseStart = Math.max(ctx.currentTime + 0.005, startTime);
    const chordNoteCount = notes.filter((n) => n.role !== 'melody').length;
    const chordCountScale = 1 / Math.sqrt(Math.max(1, chordNoteCount));
    const noteReleases: ((atTime: number, customFadeSec?: number) => void)[] = [];

    notes.forEach((note, index) => {
      const isMelody = note.role === 'melody';
      const pan = note.pan ?? computeVoicePan(index, notes.length, note.role);
      const releaseFn = this.scheduleSingleNote(
        ctx,
        isMelody ? melodyDestination : chordDestination,
        note,
        index,
        baseStart,
        isMelody ? MELODY_COUNT_SCALE : chordCountScale,
        note.timbre ?? timbre,
        pan,
        shared,
      );
      noteReleases.push(releaseFn);
    });

    let released = false;
    const entry: InternalVoiceEntry = {
      release: (atTime: number, customFadeSec?: number) => {
        if (released) return;
        released = true;
        this.activeVoices.delete(entry);
        for (const fn of noteReleases) {
          fn(atTime, customFadeSec);
        }
      },
    };
    this.activeVoices.add(entry);

    return {
      release: (atTime: number, customFadeSec?: number) => {
        entry.release(atTime, customFadeSec);
      },
    };
  }

  private scheduleSingleNote(
    ctx: AudioContext,
    destination: AudioNode,
    note: ScheduledNote,
    voiceIndex: number,
    chordStart: number,
    countScale: number,
    timbre: TimbreId,
    pan: number,
    shared: VoiceSharedResources,
  ): (atTime: number, customFadeSec?: number) => void {
    const now = ctx.currentTime;
    const t0 = Math.max(now + 0.004, chordStart + note.offsetSec);
    const freq = midiToFreq(note.midi);
    const peakGain = note.velocity * countScale * 0.44;

    // Dual-gain architecture: envGain handles attack/decay undisturbed while
    // releaseGain stays strictly at 1.0 until linear fade-out to zero.
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0, now);
    envGain.gain.setValueAtTime(0, t0);

    const releaseGain = ctx.createGain();
    releaseGain.gain.setValueAtTime(1.0, now);

    const built = buildInstrumentVoice(timbre, {
      ctx,
      now,
      t0,
      freq,
      peakGain,
      note,
      voiceIndex,
      envGain,
      shared,
      choirBank: this.choirBank,
      sampleBank: this.sampleBank,
    });

    envGain.connect(releaseGain);

    const extraNodes: AudioNode[] = [envGain, releaseGain];
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);
      releaseGain.connect(panner);
      panner.connect(destination);
      extraNodes.push(panner);
    } else {
      releaseGain.connect(destination);
    }

    const cleanup = () => {
      for (const osc of built.oscs) {
        try {
          osc.disconnect();
        } catch {
          // Ignore already-disconnected nodes.
        }
      }
      for (const src of built.bufferSources) {
        try {
          src.disconnect();
        } catch {
          // Ignore
        }
      }
      for (const node of [...built.auxNodes, ...extraNodes]) {
        try {
          node.disconnect();
        } catch {
          // Ignore
        }
      }
    };

    const cleanupDriver = built.oscs[0] ?? built.bufferSources[0];
    if (cleanupDriver) {
      cleanupDriver.onended = cleanup;
    }

    for (const osc of built.oscs) {
      osc.start(t0);
    }
    for (const src of built.bufferSources) {
      src.start(t0);
    }

    const stopSourcesAt = (when: number) => {
      for (const osc of built.oscs) {
        try {
          osc.stop(when);
        } catch {
          // Ignore if oscillator has not started or already stopped.
        }
      }
      for (const src of built.bufferSources) {
        try {
          src.stop(when);
        } catch {
          // Noise burst normally finishes on its own in 50ms.
        }
      }
    };

    const natReleaseStart =
      note.durationSec !== null ? t0 + note.durationSec : null;
    if (natReleaseStart !== null) {
      releaseGain.gain.setValueAtTime(1.0, natReleaseStart);
      releaseGain.gain.linearRampToValueAtTime(
        0,
        natReleaseStart + built.defaultReleaseSec,
      );
      stopSourcesAt(natReleaseStart + built.defaultReleaseSec + 0.04);
    }

    let forcedReleased = false;
    const triggerRelease = (atTime: number, customFadeSec?: number) => {
      if (forcedReleased) return;
      forcedReleased = true;

      const fadeSec = customFadeSec ?? built.defaultReleaseSec;
      const nowNow = ctx.currentTime;
      const reqTime = Math.max(atTime, nowNow);

      // Cancel pending future notes cleanly before onset so zero ghost notes sound.
      if (reqTime < t0) {
        releaseGain.gain.cancelScheduledValues?.(nowNow);
        envGain.gain.cancelScheduledValues?.(nowNow);
        releaseGain.gain.setValueAtTime(0, nowNow);
        stopSourcesAt(t0 + 0.005);
        return;
      }

      const releaseStart = Math.max(reqTime, t0 + 0.015);
      if (natReleaseStart !== null && releaseStart >= natReleaseStart + built.defaultReleaseSec) {
        return;
      }

      const startLevel =
        natReleaseStart !== null && releaseStart > natReleaseStart
          ? Math.max(
              0,
              1 - (releaseStart - natReleaseStart) / Math.max(0.001, built.defaultReleaseSec),
            )
          : 1.0;

      releaseGain.gain.cancelScheduledValues?.(releaseStart);
      releaseGain.gain.setValueAtTime(startLevel, releaseStart);
      releaseGain.gain.linearRampToValueAtTime(0, releaseStart + fadeSec);
      stopSourcesAt(releaseStart + fadeSec + 0.04);
    };

    return triggerRelease;
  }

  releaseAll(fadeSec = 0.06): void {
    const now = this.getCurrentTime();
    for (const entry of Array.from(this.activeVoices)) {
      entry.release(now, fadeSec);
    }
    this.activeVoices.clear();
  }

  dispose(): void {
    this.releaseAll(0.02);
    if (this.ctx && this.stateChangeBound) {
      this.ctx.removeEventListener('statechange', this.stateChangeBound);
    }
    this.stateChangeBound = null;
    if (
      this.deviceChangeBound &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.removeEventListener === 'function'
    ) {
      try {
        navigator.mediaDevices.removeEventListener(
          'devicechange',
          this.deviceChangeBound,
        );
      } catch {
        // Ignore
      }
    }
    this.deviceChangeBound = null;
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => {});
    }
    for (const node of this.graphNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore already-disconnected nodes.
      }
    }
    this.graphNodes = [];
    this.irCache.clear();
    this.choirBank.clear();
    this.sampleBank.clear();
    this.sharedResources = null;
    this.ctx = null;
    this.chordBus = null;
    this.chordLevelGain = null;
    this.melodyBus = null;
    this.melodyLevelGain = null;
    this.voicePocketEq = null;
    this.dryGain = null;
    this.wetGain = null;
    this.convolver = null;
    this.voiceBus = null;
    this.masterChain?.dispose();
    this.masterChain = null;
  }
}
