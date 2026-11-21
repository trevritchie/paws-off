import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const JAZZ_ORGAN_META: InstrumentPresetMeta = {
  id: 'jazz-organ',
  label: 'Jazz Organ',
  subtitle: 'Warm B3 drawbars',
  defaultReleaseSec: 0.18,
  rollStepSec: 0.004,
};

export function buildJazzOrganVoice({
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

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.55;
  const cutoff = isMelody ? 6400 : isBass ? 2400 : 4200;
  noteFilter.frequency.setValueAtTime(cutoff, now);
  noteFilter.frequency.setValueAtTime(cutoff, t0);

  // Slow warm Leslie-style amplitude modulation
  const rotaryGain = ctx.createGain();
  rotaryGain.gain.setValueAtTime(1.0, now);
  const rotaryLfo = ctx.createOscillator();
  rotaryLfo.type = 'sine';
  rotaryLfo.frequency.setValueAtTime(1.55 + (voiceIndex % 3) * 0.1, t0);
  const rotaryDepth = ctx.createGain();
  rotaryDepth.gain.value = 0.045;
  rotaryLfo.connect(rotaryDepth);
  rotaryDepth.connect(rotaryGain.gain);

  const oscs: OscillatorNode[] = [rotaryLfo];
  const auxNodes: AudioNode[] = [noteFilter, rotaryGain, rotaryDepth];

  // Dual subtly detuned Chrome Labs Organ_2 drawbar oscillators
  for (const detune of [-1.4, 1.4]) {
    const drawbarOsc = ctx.createOscillator();
    if (shared.organWave) {
      drawbarOsc.setPeriodicWave(shared.organWave);
    } else {
      drawbarOsc.type = 'triangle';
    }
    drawbarOsc.frequency.setValueAtTime(freq, t0);
    drawbarOsc.detune.setValueAtTime(detune, t0);
    const drawbarGain = ctx.createGain();
    drawbarGain.gain.value = 0.44;
    drawbarOsc.connect(drawbarGain);
    drawbarGain.connect(noteFilter);
    oscs.push(drawbarOsc);
    auxNodes.push(drawbarGain);
  }

  // Hammond-style 3rd-harmonic percussive key-click (35ms transient)
  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'sine';
  clickOsc.frequency.setValueAtTime(freq * 3, t0);
  const clickGain = ctx.createGain();
  const clickLevel = isMelody ? 0.14 : isBass ? 0.05 : 0.1;
  clickGain.gain.setValueAtTime(0, now);
  clickGain.gain.setValueAtTime(0, t0);
  clickGain.gain.linearRampToValueAtTime(clickLevel, t0 + 0.004);
  clickGain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.038);
  clickOsc.connect(clickGain);
  clickGain.connect(noteFilter);
  oscs.push(clickOsc);
  auxNodes.push(clickGain);

  noteFilter.connect(rotaryGain);
  rotaryGain.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.88, t0 + attackSec);

  return {
    oscs,
    bufferSources: [],
    auxNodes,
    defaultReleaseSec: isMelody ? 0.16 : JAZZ_ORGAN_META.defaultReleaseSec,
  };
}
