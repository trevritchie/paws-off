import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const RETRO_8BIT_META: InstrumentPresetMeta = {
  id: 'retro-8bit',
  label: 'Retro 8-Bit',
  subtitle: 'Crisp pulse & NES bass',
  category: 'synths',
  defaultReleaseSec: 0.14,
  rollStepSec: 0.006,
};

export function buildRetro8BitVoice({
  ctx,
  now,
  t0,
  freq,
  peakGain,
  note,
  envGain,
  shared,
}: VoiceBuildParams): BuiltVoiceNodes {
  const isBass = note.role === 'bass';
  const isMelody = note.role === 'melody';
  const attackSec = 0.008;

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.55;
  const cutoff = isMelody ? 5600 : isBass ? 2200 : 4200;
  noteFilter.frequency.setValueAtTime(cutoff, now);
  noteFilter.frequency.setValueAtTime(cutoff, t0);

  const mainOsc = ctx.createOscillator();
  if (isBass) {
    // Classic NES triangle bass channel
    mainOsc.type = 'triangle';
  } else if (shared.pulse25Wave) {
    mainOsc.setPeriodicWave(shared.pulse25Wave);
  } else {
    mainOsc.type = 'square';
  }
  mainOsc.frequency.setValueAtTime(freq, t0);

  const mainGain = ctx.createGain();
  mainGain.gain.value = isBass ? 0.95 : 0.72;
  mainOsc.connect(mainGain);
  mainGain.connect(noteFilter);
  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.86, t0 + attackSec);
  if (!isBass) {
    envGain.gain.setTargetAtTime(peakGain * 0.62, t0 + attackSec, 0.7);
  }

  return {
    oscs: [mainOsc],
    bufferSources: [],
    auxNodes: [noteFilter, mainGain],
    defaultReleaseSec: isMelody ? 0.12 : RETRO_8BIT_META.defaultReleaseSec,
  };
}
