import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const WURLITZER_META: InstrumentPresetMeta = {
  id: 'wurlitzer',
  label: 'Wurlitzer EP',
  subtitle: 'Warm vintage reed',
  category: 'keys',
  defaultReleaseSec: 0.24,
  rollStepSec: 0.01,
};

export function buildWurlitzerVoice({
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
  const attackSec = 0.008;
  const decayScale = keyTrackDecayScale(note.midi);
  const velBark = 0.78 + note.velocity * 0.42;

  const reedShaper: AudioNode =
    typeof ctx.createWaveShaper === 'function'
      ? (() => {
          const ws = ctx.createWaveShaper();
          ws.curve = shared.reedBarkCurve;
          ws.oversample = '4x';
          return ws;
        })()
      : (() => {
          const pass = ctx.createGain();
          pass.gain.setValueAtTime(1.0, now);
          return pass;
        })();

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.75;
  const startCutoff =
    (isMelody ? 6400 : isBass ? 2400 : 4800) * velBark;
  const endCutoff = isMelody ? 2800 : isBass ? 1100 : 1750;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(
    endCutoff,
    t0 + 0.9 * decayScale,
  );

  // Classic Wurlitzer 200A ~5.2 Hz vibrato/tremolo pulse
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.setValueAtTime(1.0, now);
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.type = 'sine';
  tremoloLfo.frequency.setValueAtTime(5.1 + (voiceIndex % 3) * 0.12, t0);
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.055;
  tremoloLfo.connect(tremoloDepth);
  tremoloDepth.connect(tremoloGain.gain);

  const oscs: OscillatorNode[] = [tremoloLfo];
  const auxNodes: AudioNode[] = [
    reedShaper,
    noteFilter,
    tremoloGain,
    tremoloDepth,
  ];

  // Chrome Labs Wurlitzer_2 reed wavetable
  const reedOsc = ctx.createOscillator();
  if (shared.wurlitzerWave) {
    reedOsc.setPeriodicWave(shared.wurlitzerWave);
  } else {
    reedOsc.type = 'triangle';
  }
  reedOsc.frequency.setValueAtTime(freq, t0);
  const reedGain = ctx.createGain();
  reedGain.gain.value = 0.62 * velBark;
  reedOsc.connect(reedGain);
  reedGain.connect(reedShaper);
  oscs.push(reedOsc);
  auxNodes.push(reedGain);

  // Solid fundamental sine anchor so pitch center remains crisp on phone speakers
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(freq, t0);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.48;
  bodyOsc.connect(bodyGain);
  bodyGain.connect(reedShaper);
  oscs.push(bodyOsc);
  auxNodes.push(bodyGain);

  reedShaper.connect(noteFilter);
  noteFilter.connect(tremoloGain);
  tremoloGain.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.96, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.46,
    t0 + attackSec,
    0.58 * decayScale,
  );

  return {
    oscs,
    bufferSources: [],
    auxNodes,
    defaultReleaseSec: isMelody ? 0.2 : WURLITZER_META.defaultReleaseSec,
  };
}
