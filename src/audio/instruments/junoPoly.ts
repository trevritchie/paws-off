import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const JUNO_POLY_META: InstrumentPresetMeta = {
  id: 'juno-poly',
  label: 'Juno Poly',
  subtitle: 'Analog stereo synth',
  category: 'synths',
  defaultReleaseSec: 0.44,
  rollStepSec: 0.0,
};

export function buildJunoPolyVoice({
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
  const attackSec = isMelody ? 0.028 : 0.075;
  const velScale = 0.84 + note.velocity * 0.28;

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = isBass ? 0.8 : 1.35;
  const startCutoff = isMelody ? 1900 : isBass ? 750 : 900;
  const peakCutoff =
    (isMelody ? 5600 : isBass ? 1750 : 3600) * velScale;
  const sustainCutoff = isMelody ? 3400 : isBass ? 1050 : 1850;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(peakCutoff, t0 + 0.16);
  noteFilter.frequency.setTargetAtTime(sustainCutoff, t0 + 0.16, 0.55);

  const oscs: OscillatorNode[] = [];
  const auxNodes: AudioNode[] = [noteFilter];
  const spread = voiceIndex % 2 === 0 ? 0.5 : -0.5;

  // Dual softly detuned band-limited analog saws for lush Juno chorus motion
  for (const [detune, level] of [
    [-(4.2 + spread), 0.32],
    [4.2 + spread, 0.32],
  ] as const) {
    const sawOsc = ctx.createOscillator();
    if (shared.warmSawWave) {
      sawOsc.setPeriodicWave(shared.warmSawWave);
    } else {
      sawOsc.type = 'sawtooth';
    }
    sawOsc.frequency.setValueAtTime(freq, t0);
    sawOsc.detune.setValueAtTime(detune, t0);
    const sawGain = ctx.createGain();
    sawGain.gain.value = level;
    sawOsc.connect(sawGain);
    sawGain.connect(noteFilter);
    oscs.push(sawOsc);
    auxNodes.push(sawGain);
  }

  // Chrome Labs Chorus_Strings harmonic shimmer layer
  const chorusOsc = ctx.createOscillator();
  if (shared.chorusStringsWave) {
    chorusOsc.setPeriodicWave(shared.chorusStringsWave);
  } else {
    chorusOsc.type = 'triangle';
  }
  chorusOsc.frequency.setValueAtTime(freq, t0);
  const chorusGain = ctx.createGain();
  chorusGain.gain.value = isBass ? 0.2 : 0.34;
  chorusOsc.connect(chorusGain);
  chorusGain.connect(noteFilter);
  oscs.push(chorusOsc);
  auxNodes.push(chorusGain);

  // Warm triangle fundamental/sub anchor on bass notes
  if (isBass) {
    const subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(freq, t0);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.36;
    subOsc.connect(subGain);
    subGain.connect(noteFilter);
    oscs.push(subOsc);
    auxNodes.push(subGain);
  }

  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.88, t0 + attackSec);
  envGain.gain.setTargetAtTime(peakGain * 0.72, t0 + attackSec, 0.9);

  return {
    oscs,
    bufferSources: [],
    auxNodes,
    defaultReleaseSec: isMelody ? 0.22 : JUNO_POLY_META.defaultReleaseSec,
  };
}
