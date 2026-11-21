import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const HARPSICHORD_META: InstrumentPresetMeta = {
  id: 'harpsichord',
  label: 'Harpsichord',
  subtitle: 'Crisp baroque pluck',
  category: 'keys',
  defaultReleaseSec: 0.16,
  rollStepSec: 0.013,
};

export function buildHarpsichordVoice({
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
  const attackSec = 0.004;
  const decayScale = keyTrackDecayScale(note.midi);

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.65;
  const startCutoff = isMelody ? 8200 : isBass ? 3600 : 6800;
  const endCutoff = isMelody ? 3400 : isBass ? 1400 : 2400;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(
    endCutoff,
    t0 + 0.75 * decayScale,
  );

  const mainOsc = ctx.createOscillator();
  if (shared.pluckWave) {
    mainOsc.setPeriodicWave(shared.pluckWave);
  } else {
    mainOsc.type = 'sawtooth';
  }
  mainOsc.frequency.setValueAtTime(freq, t0);
  const mainGain = ctx.createGain();
  mainGain.gain.value = 0.72;
  mainOsc.connect(mainGain);
  mainGain.connect(noteFilter);

  // 4-foot upper octave coupling string
  const octOsc = ctx.createOscillator();
  octOsc.type = 'triangle';
  octOsc.frequency.setValueAtTime(freq * 2, t0);
  const octGain = ctx.createGain();
  const octLevel = isBass ? 0.22 : 0.3;
  octGain.gain.setValueAtTime(octLevel, now);
  octGain.gain.setValueAtTime(octLevel, t0);
  octGain.gain.exponentialRampToValueAtTime(
    0.001,
    t0 + 0.45 * decayScale,
  );
  octOsc.connect(octGain);
  octGain.connect(noteFilter);

  // Crisp quill-on-string pluck transient
  const quillSrc = ctx.createBufferSource();
  quillSrc.buffer = shared.noiseBurstBuffer;
  const quillFilter = ctx.createBiquadFilter();
  quillFilter.type = 'bandpass';
  quillFilter.frequency.setValueAtTime(isBass ? 1600 : 2800, now);
  quillFilter.Q.value = 1.9;
  const quillGain = ctx.createGain();
  quillGain.gain.setValueAtTime(0, now);
  quillGain.gain.setValueAtTime(0, t0);
  quillGain.gain.linearRampToValueAtTime(
    isMelody ? 0.14 : isBass ? 0.07 : 0.11,
    t0 + 0.002,
  );
  quillGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.022);
  quillSrc.connect(quillFilter);
  quillFilter.connect(quillGain);
  quillGain.connect(noteFilter);

  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.98, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.14,
    t0 + attackSec,
    0.42 * decayScale,
  );

  return {
    oscs: [mainOsc, octOsc],
    bufferSources: [quillSrc],
    auxNodes: [noteFilter, mainGain, octGain, quillFilter, quillGain],
    defaultReleaseSec: isMelody ? 0.14 : HARPSICHORD_META.defaultReleaseSec,
  };
}
