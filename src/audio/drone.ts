import { getMajorKeyInfo } from '../music/chords';
import { midiToFreq } from '../music/voicing';
import type { DroneOctave, PitchClass } from '../types/settings';
import type { PolySynth } from './synth';
import { droneSliderToGain } from './volume';

export interface DroneEngine {
  start(pitch: PitchClass, volume: number, octave?: DroneOctave): void;
  stop(): void;
  setPitch(pitch: PitchClass, octave?: DroneOctave): void;
  setVolume(volume: number): void;
  dispose(): void;
}

interface DroneLayer {
  oscs: OscillatorNode[];
  lfo: OscillatorNode;
  nodes: AudioNode[];
  layerGain: GainNode;
  fadeOut: (fadeSec: number) => void;
}

/**
 * Maps pitch class + octave offset (-1..+2) across a musical 4-octave range:
 *   -1: [A1 (33), G#2 (44)] deep bass pedal below chord roots
 *    0: [A2 (45), G#3 (56)] warm cello foundation (default)
 *   +1: [A3 (57), G#4 (68)] warm mid pedal
 *   +2: [A4 (69), G#5 (80)] pure singing pedal above upper chord voices
 */
export function pitchClassToDroneMidi(
  pitch: PitchClass,
  octave: DroneOctave = 0,
): number {
  const base = 45 + ((pitch - 9 + 12) % 12);
  return base + octave * 12;
}

export function formatDroneNoteName(
  pitch: PitchClass,
  octave: DroneOctave = 0,
): string {
  const midi = pitchClassToDroneMidi(pitch, octave);
  const scientificOctave = Math.floor(midi / 12) - 1;
  return `${getMajorKeyInfo(pitch).shortName}${scientificOctave}`;
}

function getOctaveGainScale(octave: DroneOctave): number {
  switch (octave) {
    case -1:
      return 1.15;
    case 0:
      return 1.0;
    case 1:
      return 0.78;
    case 2:
      return 0.58;
  }
}

export class ChromaticDrone implements DroneEngine {
  private synth: PolySynth;
  private masterGain: GainNode | null = null;
  private activeLayer: DroneLayer | null = null;
  private running = false;
  private currentPitch: PitchClass = 0;
  private currentOctave: DroneOctave = 0;
  private currentVolume = 0.5;

  constructor(synth: PolySynth) {
    this.synth = synth;
  }

  private ensureMasterGain(): {
    ctx: AudioContext;
    masterGain: GainNode;
    target: AudioNode;
  } | null {
    const ctx = this.synth.getAudioContext();
    const target = this.synth.getCompressorInput();
    if (!ctx || !target) return null;

    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.scaledVolume(this.currentVolume);
      this.masterGain.connect(target);
    }
    return { ctx, masterGain: this.masterGain, target };
  }

  private scaledVolume(volume: number): number {
    return droneSliderToGain(volume);
  }

  private spawnLayer(
    ctx: AudioContext,
    masterGain: GainNode,
    pitch: PitchClass,
    octave: DroneOctave,
    fadeInSec: number,
  ): DroneLayer {
    const midi = pitchClassToDroneMidi(pitch, octave);
    const freq = midiToFreq(midi);
    const now = ctx.currentTime;

    // Key-track filter cutoff so high soprano pedals stay silky rather than muffled,
    // while low bass pedals retain warm sub-harmonics without mud.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = Math.min(
      3200,
      Math.max(420, freq * (octave >= 2 ? 2.1 : 3.2)),
    );
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.value = 0.65;

    const targetGain = getOctaveGainScale(octave);
    const layerGain = ctx.createGain();
    layerGain.gain.setValueAtTime(0.0001, now);
    layerGain.gain.linearRampToValueAtTime(targetGain, now + fadeInSec);

    // Subtle slow breathing LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.12, now);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.045 * targetGain;
    lfo.connect(lfoDepth);
    lfoDepth.connect(layerGain.gain);

    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [filter, layerGain, lfoDepth];

    // Fundamental sine
    const fundOsc = ctx.createOscillator();
    fundOsc.type = 'sine';
    fundOsc.frequency.setValueAtTime(freq, now);
    const fundGain = ctx.createGain();
    fundGain.gain.value = octave >= 2 ? 0.88 : octave === 1 ? 0.8 : 0.72;
    fundOsc.connect(fundGain);
    fundGain.connect(filter);
    oscs.push(fundOsc);
    nodes.push(fundGain);

    // Warm triangle body
    const warmOsc = ctx.createOscillator();
    warmOsc.type = 'triangle';
    warmOsc.frequency.setValueAtTime(freq, now);
    const warmGain = ctx.createGain();
    warmGain.gain.value = octave >= 2 ? 0.1 : octave === 1 ? 0.14 : 0.18;
    warmOsc.connect(warmGain);
    warmGain.connect(filter);
    oscs.push(warmOsc);
    nodes.push(warmGain);

    // Upper octave & gentle 5th/3rd harmonics on lower/mid registers so low
    // tonic pedals remain legible on phone speakers without crowding chords.
    if (octave <= 1) {
      const octOsc = ctx.createOscillator();
      octOsc.type = 'sine';
      octOsc.frequency.setValueAtTime(freq * 2, now);
      const octGain = ctx.createGain();
      octGain.gain.value = octave === -1 ? 0.26 : octave === 0 ? 0.19 : 0.08;
      octOsc.connect(octGain);
      octGain.connect(filter);
      oscs.push(octOsc);
      nodes.push(octGain);

      const fifthOsc = ctx.createOscillator();
      fifthOsc.type = 'sine';
      fifthOsc.frequency.setValueAtTime(freq * 1.5, now);
      const fifthGain = ctx.createGain();
      fifthGain.gain.value = octave === 1 ? 0.02 : 0.05;
      fifthOsc.connect(fifthGain);
      fifthGain.connect(filter);
      oscs.push(fifthOsc);
      nodes.push(fifthGain);

      if (octave <= 0) {
        const thirdHarmOsc = ctx.createOscillator();
        thirdHarmOsc.type = 'sine';
        thirdHarmOsc.frequency.setValueAtTime(freq * 3, now);
        const thirdHarmGain = ctx.createGain();
        thirdHarmGain.gain.value = octave === -1 ? 0.045 : 0.025;
        thirdHarmOsc.connect(thirdHarmGain);
        thirdHarmGain.connect(filter);
        oscs.push(thirdHarmOsc);
        nodes.push(thirdHarmGain);
      }
    }

    filter.connect(layerGain);
    layerGain.connect(masterGain);

    const cleanup = () => {
      for (const osc of oscs) {
        try {
          osc.disconnect();
        } catch {
          // Ignore
        }
      }
      try {
        lfo.disconnect();
      } catch {
        // Ignore
      }
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // Ignore
        }
      }
    };

    fundOsc.onended = cleanup;
    for (const osc of oscs) {
      osc.start(now);
    }
    lfo.start(now);

    let faded = false;
    const fadeOut = (fadeSec: number) => {
      if (faded) return;
      faded = true;
      const t = ctx.currentTime;
      layerGain.gain.cancelScheduledValues(t);
      layerGain.gain.setValueAtTime(Math.max(0.0001, layerGain.gain.value), t);
      layerGain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      const stopAt = t + fadeSec + 0.03;
      for (const osc of oscs) {
        try {
          osc.stop(stopAt);
        } catch {
          // Ignore
        }
      }
      try {
        lfo.stop(stopAt);
      } catch {
        // Ignore
      }
    };

    return { oscs, lfo, nodes, layerGain, fadeOut };
  }

  start(
    pitch: PitchClass,
    volume: number,
    octave: DroneOctave = this.currentOctave,
  ): void {
    this.currentPitch = pitch;
    this.currentOctave = octave;
    this.currentVolume = volume;
    const setup = this.ensureMasterGain();
    if (!setup) return;

    const { ctx, masterGain } = setup;
    masterGain.gain.setTargetAtTime(
      this.scaledVolume(volume),
      ctx.currentTime,
      0.04,
    );

    if (this.running && this.activeLayer) {
      this.setPitch(pitch, octave);
      return;
    }

    this.running = true;
    this.activeLayer = this.spawnLayer(ctx, masterGain, pitch, octave, 0.55);
  }

  stop(): void {
    this.running = false;
    if (this.activeLayer) {
      this.activeLayer.fadeOut(0.45);
      this.activeLayer = null;
    }
  }

  setPitch(pitch: PitchClass, octave: DroneOctave = this.currentOctave): void {
    const changed =
      pitch !== this.currentPitch || octave !== this.currentOctave;
    this.currentPitch = pitch;
    this.currentOctave = octave;
    if (!this.running || !changed) return;

    const setup = this.ensureMasterGain();
    if (!setup) return;

    const oldLayer = this.activeLayer;
    this.activeLayer = this.spawnLayer(
      setup.ctx,
      setup.masterGain,
      pitch,
      octave,
      0.35,
    );
    if (oldLayer) {
      oldLayer.fadeOut(0.35);
    }
  }

  setVolume(volume: number): void {
    this.currentVolume = volume;
    const ctx = this.synth.getAudioContext();
    if (!ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(
      this.scaledVolume(volume),
      ctx.currentTime,
      0.05,
    );
  }

  dispose(): void {
    this.stop();
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore
      }
      this.masterGain = null;
    }
  }
}
