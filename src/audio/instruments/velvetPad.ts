import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const VELVET_PAD_META: InstrumentPresetMeta = {
  id: 'velvet-pad',
  label: 'Velvet Pad',
  subtitle: 'Ambient swell',
  defaultReleaseSec: 0.55,
  rollStepSec: 0.0,
};

export function buildVelvetPadVoice({
  ctx,
  now,
  t0,
  freq,
  peakGain,
  note,
  voiceIndex,
  envGain,
  shared,
}: VoiceBuildParams): BuiltVoiceNodes {
  const isBass = note.role === 'bass';
  const isMelody = note.role === 'melody';
  const attackSec = isMelody ? 0.055 : 0.18;

  // Breathing filter swell: starts warm, opens gently, then settles into velvet
  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.6;
  const startCutoff = isMelody ? 1600 : isBass ? 650 : 780;
  const bloomCutoff = isMelody ? 4400 : isBass ? 1400 : 2200;
  const settleCutoff = isMelody ? 2800 : isBass ? 950 : 1350;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(bloomCutoff, t0 + 0.65);
  noteFilter.frequency.setTargetAtTime(settleCutoff, t0 + 0.65, 0.85);

  const oscs: OscillatorNode[] = [];
  const auxNodes: AudioNode[] = [noteFilter];

  const baseDetune = isBass ? 1.5 : 2.5;
  const voiceSpread = voiceIndex % 2 === 0 ? -0.4 : 0.4;

  // Band-limited warm analog chorus sawtooth layer
  const sawOsc = ctx.createOscillator();
  if (shared.warmSawWave) {
    sawOsc.setPeriodicWave(shared.warmSawWave);
  } else {
    sawOsc.type = 'sawtooth';
  }
  sawOsc.frequency.setValueAtTime(freq, t0);
  sawOsc.detune.setValueAtTime(-(baseDetune + voiceSpread), t0);
  const sawGain = ctx.createGain();
  sawGain.gain.value = isBass ? 0.2 : 0.23;
  sawOsc.connect(sawGain);
  sawGain.connect(noteFilter);
  oscs.push(sawOsc);
  auxNodes.push(sawGain);

  // Center triangle core (firm pitch anchor)
  const triOsc = ctx.createOscillator();
  triOsc.type = 'triangle';
  triOsc.frequency.setValueAtTime(freq, t0);
  const triGain = ctx.createGain();
  triGain.gain.value = 0.58;
  triOsc.connect(triGain);
  triGain.connect(noteFilter);
  oscs.push(triOsc);
  auxNodes.push(triGain);

  // Subtle detuned sine shimmer
  const sineOsc = ctx.createOscillator();
  sineOsc.type = 'sine';
  sineOsc.frequency.setValueAtTime(freq, t0);
  sineOsc.detune.setValueAtTime(baseDetune + voiceSpread, t0);
  const sineGain = ctx.createGain();
  sineGain.gain.value = 0.32;
  sineOsc.connect(sineGain);
  sineGain.connect(noteFilter);
  oscs.push(sineOsc);
  auxNodes.push(sineGain);

  // Subtle airy upper octave on harmony voices
  if (!isBass) {
    const airOsc = ctx.createOscillator();
    airOsc.type = 'sine';
    airOsc.frequency.setValueAtTime(freq * 2, t0);
    const airGain = ctx.createGain();
    airGain.gain.value = 0.09;
    airOsc.connect(airGain);
    airGain.connect(noteFilter);
    oscs.push(airOsc);
    auxNodes.push(airGain);
  }

  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.84, t0 + attackSec);

  return {
    oscs,
    bufferSources: [],
    auxNodes,
    defaultReleaseSec: isMelody ? 0.24 : VELVET_PAD_META.defaultReleaseSec,
  };
}
