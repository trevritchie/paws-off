import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const ANALOG_BRASS_META: InstrumentPresetMeta = {
  id: 'analog-brass',
  label: 'Analog Brass',
  subtitle: 'Prophet filter swell',
  category: 'synths',
  defaultReleaseSec: 0.32,
  rollStepSec: 0.004,
};

export function buildAnalogBrassVoice({
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
  const attackSec = isMelody ? 0.025 : 0.065;
  const velScale = 0.85 + note.velocity * 0.28;

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = isBass ? 0.9 : 1.5;
  const startCutoff = isMelody ? 1100 : isBass ? 520 : 620;
  const peakCutoff =
    (isMelody ? 5200 : isBass ? 1750 : 3900) * velScale;
  const settleCutoff = isMelody ? 3000 : isBass ? 1100 : 2100;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(peakCutoff, t0 + 0.13);
  noteFilter.frequency.setTargetAtTime(settleCutoff, t0 + 0.13, 0.45);

  const oscs: OscillatorNode[] = [];
  const auxNodes: AudioNode[] = [noteFilter];

  // Center Chrome Labs Brass harmonic wavetable core
  const brassOsc = ctx.createOscillator();
  if (shared.brassWave) {
    brassOsc.setPeriodicWave(shared.brassWave);
  } else {
    brassOsc.type = 'sawtooth';
  }
  brassOsc.frequency.setValueAtTime(freq, t0);
  const brassGain = ctx.createGain();
  brassGain.gain.value = 0.42;
  brassOsc.connect(brassGain);
  brassGain.connect(noteFilter);
  oscs.push(brassOsc);
  auxNodes.push(brassGain);

  // Dual detuned warm analog saws for classic poly-brass width
  const spread = voiceIndex % 2 === 0 ? 0.6 : -0.6;
  for (const detune of [-(5.5 + spread), 5.5 + spread]) {
    const sawOsc = ctx.createOscillator();
    if (shared.warmSawWave) {
      sawOsc.setPeriodicWave(shared.warmSawWave);
    } else {
      sawOsc.type = 'sawtooth';
    }
    sawOsc.frequency.setValueAtTime(freq, t0);
    sawOsc.detune.setValueAtTime(detune, t0);
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.28;
    sawOsc.connect(sawGain);
    sawGain.connect(noteFilter);
    oscs.push(sawOsc);
    auxNodes.push(sawGain);
  }

  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.9, t0 + attackSec);
  envGain.gain.setTargetAtTime(peakGain * 0.72, t0 + attackSec, 0.85);

  return {
    oscs,
    bufferSources: [],
    auxNodes,
    defaultReleaseSec: isMelody ? 0.2 : ANALOG_BRASS_META.defaultReleaseSec,
  };
}
