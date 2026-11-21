import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const GLASS_CELESTA_META: InstrumentPresetMeta = {
  id: 'glass-celesta',
  label: 'Glass Celesta',
  subtitle: 'Crystalline & bell-like',
  defaultReleaseSec: 0.52,
  rollStepSec: 0.016,
};

export function buildGlassCelestaVoice({
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
  const attackSec = 0.006;
  const decayScale = keyTrackDecayScale(note.midi);
  const velScale = 0.78 + note.velocity * 0.35;

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.5;
  const cutoff = isMelody ? 8600 : isBass ? 2600 : 5800;
  noteFilter.frequency.setValueAtTime(cutoff, now);
  noteFilter.frequency.setValueAtTime(cutoff, t0);

  const oscs: OscillatorNode[] = [];
  const bufferSources: AudioBufferSourceNode[] = [];
  const auxNodes: AudioNode[] = [noteFilter];

  // Chrome Labs Twelve_OpTines crystalline core
  const tineOsc = ctx.createOscillator();
  if (shared.tinesWave) {
    tineOsc.setPeriodicWave(shared.tinesWave);
  } else {
    tineOsc.type = 'sine';
  }
  tineOsc.frequency.setValueAtTime(freq, t0);
  const tineGain = ctx.createGain();
  tineGain.gain.value = 0.52;
  tineOsc.connect(tineGain);
  tineGain.connect(noteFilter);
  oscs.push(tineOsc);
  auxNodes.push(tineGain);

  // Pure sine fundamental body
  const fundOsc = ctx.createOscillator();
  fundOsc.type = 'sine';
  fundOsc.frequency.setValueAtTime(freq, t0);
  const fundGain = ctx.createGain();
  fundGain.gain.value = 0.56;
  fundOsc.connect(fundGain);
  fundGain.connect(noteFilter);
  oscs.push(fundOsc);
  auxNodes.push(fundGain);

  // Decaying modal steel-plate chime partial (~2.756x)
  const chimeOsc = ctx.createOscillator();
  chimeOsc.type = 'sine';
  chimeOsc.frequency.setValueAtTime(freq * 2.756, t0);
  const chimeGain = ctx.createGain();
  const chimeInit = (isMelody ? 0.16 : isBass ? 0.04 : 0.11) * velScale;
  chimeGain.gain.setValueAtTime(chimeInit, now);
  chimeGain.gain.setValueAtTime(chimeInit, t0);
  chimeGain.gain.exponentialRampToValueAtTime(
    0.0004,
    t0 + 0.14 * decayScale,
  );
  chimeOsc.connect(chimeGain);
  chimeGain.connect(noteFilter);
  oscs.push(chimeOsc);
  auxNodes.push(chimeGain);

  // Delicate felt hammer transient
  const feltSrc = ctx.createBufferSource();
  feltSrc.buffer = shared.noiseBurstBuffer;
  const feltFilter = ctx.createBiquadFilter();
  feltFilter.type = 'bandpass';
  feltFilter.frequency.setValueAtTime(Math.min(4200, freq * 3), now);
  feltFilter.Q.value = 1.8;
  const feltGain = ctx.createGain();
  feltGain.gain.setValueAtTime(0, now);
  feltGain.gain.setValueAtTime(0, t0);
  feltGain.gain.linearRampToValueAtTime(
    isMelody ? 0.065 : isBass ? 0.025 : 0.045,
    t0 + 0.003,
  );
  feltGain.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.02);
  feltSrc.connect(feltFilter);
  feltFilter.connect(feltGain);
  feltGain.connect(noteFilter);
  bufferSources.push(feltSrc);
  auxNodes.push(feltFilter, feltGain);

  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.96, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.34,
    t0 + attackSec,
    0.85 * decayScale,
  );

  return {
    oscs,
    bufferSources,
    auxNodes,
    defaultReleaseSec: isMelody ? 0.32 : GLASS_CELESTA_META.defaultReleaseSec,
  };
}
