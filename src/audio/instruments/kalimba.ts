import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const KALIMBA_META: InstrumentPresetMeta = {
  id: 'kalimba',
  label: 'Kalimba',
  subtitle: 'Woody thumb piano',
  category: 'synths',
  defaultReleaseSec: 0.36,
  rollStepSec: 0.014,
};

export function buildKalimbaVoice({
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

  // Resonant wooden gourd body peaking around 380 Hz
  const bodyResonance = ctx.createBiquadFilter();
  bodyResonance.type = 'peaking';
  bodyResonance.frequency.setValueAtTime(380, now);
  bodyResonance.Q.value = 1.4;
  bodyResonance.gain.value = 3.0;

  const polishFilter = ctx.createBiquadFilter();
  polishFilter.type = 'lowpass';
  polishFilter.Q.value = 0.55;
  polishFilter.frequency.setValueAtTime(
    isMelody ? 7200 : isBass ? 2200 : 4400,
    now,
  );

  // Pure fundamental tine resonance
  const fundOsc = ctx.createOscillator();
  fundOsc.type = 'sine';
  fundOsc.frequency.setValueAtTime(freq, t0);
  const fundGain = ctx.createGain();
  fundGain.gain.value = 0.9;
  fundOsc.connect(fundGain);
  fundGain.connect(bodyResonance);

  // Subtle warm 2nd harmonic
  const secondOsc = ctx.createOscillator();
  secondOsc.type = 'sine';
  secondOsc.frequency.setValueAtTime(freq * 2, t0);
  const secondGain = ctx.createGain();
  secondGain.gain.setValueAtTime(0.08, now);
  secondGain.gain.setValueAtTime(0.08, t0);
  secondGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14 * decayScale);
  secondOsc.connect(secondGain);
  secondGain.connect(bodyResonance);

  // Characteristic inharmonic steel-tine ping (~5.4x) decaying in 38ms
  const tineOsc = ctx.createOscillator();
  tineOsc.type = 'sine';
  tineOsc.frequency.setValueAtTime(Math.min(12000, freq * 5.4), t0);
  const tineGain = ctx.createGain();
  const tineInit = isMelody ? 0.14 : isBass ? 0.04 : 0.1;
  tineGain.gain.setValueAtTime(tineInit, now);
  tineGain.gain.setValueAtTime(tineInit, t0);
  tineGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.042);
  tineOsc.connect(tineGain);
  tineGain.connect(bodyResonance);

  // Soft thumb pluck click
  const thumbSrc = ctx.createBufferSource();
  thumbSrc.buffer = shared.noiseBurstBuffer;
  const thumbFilter = ctx.createBiquadFilter();
  thumbFilter.type = 'bandpass';
  thumbFilter.frequency.setValueAtTime(1800, now);
  thumbFilter.Q.value = 2.0;
  const thumbGain = ctx.createGain();
  thumbGain.gain.setValueAtTime(0, now);
  thumbGain.gain.setValueAtTime(0, t0);
  thumbGain.gain.linearRampToValueAtTime(
    isMelody ? 0.08 : isBass ? 0.03 : 0.055,
    t0 + 0.002,
  );
  thumbGain.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.018);
  thumbSrc.connect(thumbFilter);
  thumbFilter.connect(thumbGain);
  thumbGain.connect(bodyResonance);

  bodyResonance.connect(polishFilter);
  polishFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 1.02, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.16,
    t0 + attackSec,
    0.52 * decayScale,
  );

  return {
    oscs: [fundOsc, secondOsc, tineOsc],
    bufferSources: [thumbSrc],
    auxNodes: [
      bodyResonance,
      polishFilter,
      fundGain,
      secondGain,
      tineGain,
      thumbFilter,
      thumbGain,
    ],
    defaultReleaseSec: isMelody ? 0.24 : KALIMBA_META.defaultReleaseSec,
  };
}
