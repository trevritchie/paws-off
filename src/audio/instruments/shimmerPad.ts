import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const SHIMMER_PAD_META: InstrumentPresetMeta = {
  id: 'shimmer-pad',
  label: 'Shimmer Pad',
  subtitle: 'Airy celestial glass',
  category: 'synths',
  defaultReleaseSec: 0.65,
  rollStepSec: 0.0,
};

export function buildShimmerPadVoice({
  ctx,
  now,
  t0,
  freq,
  peakGain,
  note,
  envGain,
}: VoiceBuildParams): BuiltVoiceNodes {
  const isBass = note.role === 'bass';
  const isMelody = note.role === 'melody';
  const attackSec = isMelody ? 0.06 : 0.26;

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.55;
  const startCutoff = isMelody ? 2200 : isBass ? 750 : 900;
  const bloomCutoff = isMelody ? 6400 : isBass ? 1400 : 4800;
  const settleCutoff = isMelody ? 4600 : isBass ? 1050 : 3200;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(bloomCutoff, t0 + 0.75);
  noteFilter.frequency.setTargetAtTime(settleCutoff, t0 + 0.75, 0.9);

  const oscs: OscillatorNode[] = [];
  const auxNodes: AudioNode[] = [noteFilter];

  // Warm triangle fundamental anchor
  const coreOsc = ctx.createOscillator();
  coreOsc.type = 'triangle';
  coreOsc.frequency.setValueAtTime(freq, t0);
  const coreGain = ctx.createGain();
  coreGain.gain.value = isBass ? 0.78 : 0.56;
  coreOsc.connect(coreGain);
  coreGain.connect(noteFilter);
  oscs.push(coreOsc);
  auxNodes.push(coreGain);

  // Ethereal detuned upper octave halo
  for (const detune of [-3.5, 3.5]) {
    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(freq * 2, t0);
    shimmerOsc.detune.setValueAtTime(detune, t0);
    const shimmerGain = ctx.createGain();
    const targetLevel = isBass ? 0.1 : 0.2;
    shimmerGain.gain.setValueAtTime(0.01, now);
    shimmerGain.gain.setValueAtTime(0.01, t0);
    shimmerGain.gain.linearRampToValueAtTime(targetLevel, t0 + attackSec * 1.35);
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(noteFilter);
    oscs.push(shimmerOsc);
    auxNodes.push(shimmerGain);
  }

  // Soft glassy 12th (3x) overtone on non-bass harmony voices
  if (!isBass) {
    const twelfthOsc = ctx.createOscillator();
    twelfthOsc.type = 'sine';
    twelfthOsc.frequency.setValueAtTime(freq * 3, t0);
    const twelfthGain = ctx.createGain();
    twelfthGain.gain.setValueAtTime(0.005, now);
    twelfthGain.gain.setValueAtTime(0.005, t0);
    twelfthGain.gain.linearRampToValueAtTime(
      isMelody ? 0.08 : 0.055,
      t0 + attackSec * 1.5,
    );
    twelfthOsc.connect(twelfthGain);
    twelfthGain.connect(noteFilter);
    oscs.push(twelfthOsc);
    auxNodes.push(twelfthGain);
  }

  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.86, t0 + attackSec);

  return {
    oscs,
    bufferSources: [],
    auxNodes,
    defaultReleaseSec: isMelody ? 0.28 : SHIMMER_PAD_META.defaultReleaseSec,
  };
}
