import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const WARM_RHODES_META: InstrumentPresetMeta = {
  id: 'warm-rhodes',
  label: 'Warm Rhodes',
  subtitle: 'Vintage shimmer',
  defaultReleaseSec: 0.26,
  rollStepSec: 0.01,
};

export function buildWarmRhodesVoice({
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
  const attackSec = 0.012;
  const decayScale = keyTrackDecayScale(note.midi);
  const velScale = 0.75 + note.velocity * 0.45;

  const shaper = ctx.createWaveShaper();
  shaper.curve = shared.warmTubeCurve;
  shaper.oversample = '4x';

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.65;
  const startCutoff =
    (isMelody ? 6200 : isBass ? 2000 : 4200) * (0.86 + note.velocity * 0.24);
  const endCutoff = isMelody ? 3200 : isBass ? 1100 : 2000;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(
    endCutoff,
    t0 + 1.3 * decayScale,
  );

  // Subtle vintage suitcase tremolo with slight per-voice organic shimmer
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.setValueAtTime(1.0, now);
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.type = 'sine';
  tremoloLfo.frequency.setValueAtTime(2.0 + (voiceIndex % 3) * 0.18, t0);
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.05;
  tremoloLfo.connect(tremoloDepth);
  tremoloDepth.connect(tremoloGain.gain);

  // 2-op FM bell tine (modulator at 2x decaying cleanly into warm Rhodes sustain)
  const carrierOsc = ctx.createOscillator();
  carrierOsc.type = 'sine';
  carrierOsc.frequency.setValueAtTime(freq, t0);

  const modOsc = ctx.createOscillator();
  modOsc.type = 'sine';
  modOsc.frequency.setValueAtTime(freq * 2, t0);

  const modGain = ctx.createGain();
  const initialFmDepth =
    freq * (isMelody ? 0.56 : isBass ? 0.2 : 0.42) * velScale;
  modGain.gain.setValueAtTime(initialFmDepth, now);
  modGain.gain.setValueAtTime(initialFmDepth, t0);
  modGain.gain.setTargetAtTime(freq * 0.04, t0 + attackSec, 0.14 * decayScale);

  modOsc.connect(modGain);
  modGain.connect(carrierOsc.frequency);

  const carrierGain = ctx.createGain();
  carrierGain.gain.value = 0.58;
  carrierOsc.connect(carrierGain);
  carrierGain.connect(shaper);

  // Clean fundamental anchor
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(freq, t0);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.5;
  bodyOsc.connect(bodyGain);
  bodyGain.connect(shaper);

  shaper.connect(noteFilter);
  noteFilter.connect(tremoloGain);
  tremoloGain.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.58,
    t0 + attackSec,
    0.65 * decayScale,
  );

  return {
    oscs: [carrierOsc, modOsc, bodyOsc, tremoloLfo],
    bufferSources: [],
    auxNodes: [
      shaper,
      noteFilter,
      tremoloGain,
      tremoloDepth,
      modGain,
      carrierGain,
      bodyGain,
    ],
    defaultReleaseSec: isMelody ? 0.22 : WARM_RHODES_META.defaultReleaseSec,
  };
}
