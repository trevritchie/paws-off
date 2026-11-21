import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const SOFT_VIBES_META: InstrumentPresetMeta = {
  id: 'soft-vibes',
  label: 'Soft Vibes',
  subtitle: 'Pure & resonant',
  defaultReleaseSec: 0.48,
  rollStepSec: 0.012,
};

export function buildSoftVibesVoice({
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
  const attackSec = 0.014;
  const decayScale = keyTrackDecayScale(note.midi);
  const velScale = 0.75 + note.velocity * 0.45;

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.55;
  const cutoff = isMelody ? 7200 : isBass ? 2200 : 4600;
  noteFilter.frequency.setValueAtTime(cutoff, now);
  noteFilter.frequency.setValueAtTime(cutoff, t0);

  // Subtle slow vibraphone motor fan tremolo with per-voice rate variation
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.setValueAtTime(1.0, now);
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.type = 'sine';
  tremoloLfo.frequency.setValueAtTime(2.65 + (voiceIndex % 4) * 0.14, t0);
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.07;
  tremoloLfo.connect(tremoloDepth);
  tremoloDepth.connect(tremoloGain.gain);

  const oscs: OscillatorNode[] = [tremoloLfo];
  const bufferSources: AudioBufferSourceNode[] = [];
  const auxNodes: AudioNode[] = [noteFilter, tremoloGain, tremoloDepth];

  // Pure singing fundamental
  const fundOsc = ctx.createOscillator();
  fundOsc.type = 'sine';
  fundOsc.frequency.setValueAtTime(freq, t0);
  const fundGain = ctx.createGain();
  fundGain.gain.value = 0.88;
  fundOsc.connect(fundGain);
  fundGain.connect(noteFilter);
  oscs.push(fundOsc);
  auxNodes.push(fundGain);

  // Gentle 2x warmth
  const secondOsc = ctx.createOscillator();
  secondOsc.type = 'sine';
  secondOsc.frequency.setValueAtTime(freq * 2, t0);
  const secondGain = ctx.createGain();
  secondGain.gain.setValueAtTime(0.06, now);
  secondGain.gain.setValueAtTime(0.06, t0);
  secondGain.gain.setTargetAtTime(0.01, t0 + attackSec, 0.22 * decayScale);
  secondOsc.connect(secondGain);
  secondGain.connect(noteFilter);
  oscs.push(secondOsc);
  auxNodes.push(secondGain);

  // Authentic vibraphone tuned bar 4th overtone (3.98x) scaled by velocity
  const barOsc = ctx.createOscillator();
  barOsc.type = 'sine';
  barOsc.frequency.setValueAtTime(freq * 3.98, t0);
  const barGain = ctx.createGain();
  const barInit = (isMelody ? 0.14 : isBass ? 0.04 : 0.1) * velScale;
  barGain.gain.setValueAtTime(barInit, now);
  barGain.gain.setValueAtTime(barInit, t0);
  barGain.gain.setTargetAtTime(0.0005, t0 + attackSec, 0.09 * decayScale);
  barOsc.connect(barGain);
  barGain.connect(noteFilter);
  oscs.push(barOsc);
  auxNodes.push(barGain);

  // Soft yarn mallet strike transient
  const malletSrc = ctx.createBufferSource();
  malletSrc.buffer = shared.noiseBurstBuffer;
  const malletFilter = ctx.createBiquadFilter();
  malletFilter.type = 'bandpass';
  malletFilter.frequency.setValueAtTime(900, now);
  malletFilter.Q.value = 2.2;
  const malletGain = ctx.createGain();
  malletGain.gain.setValueAtTime(0, now);
  malletGain.gain.setValueAtTime(0, t0);
  malletGain.gain.linearRampToValueAtTime(
    isMelody ? 0.07 : isBass ? 0.03 : 0.05,
    t0 + 0.004,
  );
  malletGain.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.024);
  malletSrc.connect(malletFilter);
  malletFilter.connect(malletGain);
  malletGain.connect(noteFilter);
  bufferSources.push(malletSrc);
  auxNodes.push(malletFilter, malletGain);

  noteFilter.connect(tremoloGain);
  tremoloGain.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.98, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.42,
    t0 + attackSec,
    1.05 * decayScale,
  );

  return {
    oscs,
    bufferSources,
    auxNodes,
    defaultReleaseSec: isMelody ? 0.3 : SOFT_VIBES_META.defaultReleaseSec,
  };
}
