import {
  keyTrackDecayScale,
  type BuiltVoiceNodes,
  type InstrumentPresetMeta,
  type VoiceBuildParams,
} from './types';

export const LOFI_TAPE_META: InstrumentPresetMeta = {
  id: 'lofi-tape',
  label: 'Lo-Fi Tape Keys',
  subtitle: 'Cozy warm flutter',
  category: 'keys',
  defaultReleaseSec: 0.34,
  rollStepSec: 0.012,
};

export function buildLofiTapeVoice({
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
  const attackSec = 0.018;
  const decayScale = keyTrackDecayScale(note.midi);

  const tapeShaper: AudioNode =
    typeof ctx.createWaveShaper === 'function'
      ? (() => {
          const ws = ctx.createWaveShaper();
          ws.curve = shared.warmTubeCurve;
          ws.oversample = '4x';
          return ws;
        })()
      : (() => {
          const pass = ctx.createGain();
          pass.gain.value = 1.0;
          return pass;
        })();

  const noteFilter = ctx.createBiquadFilter();
  noteFilter.type = 'lowpass';
  noteFilter.Q.value = 0.7;
  const startCutoff = isMelody ? 3800 : isBass ? 1600 : 2600;
  const endCutoff = isMelody ? 2100 : isBass ? 900 : 1350;
  noteFilter.frequency.setValueAtTime(startCutoff, now);
  noteFilter.frequency.setValueAtTime(startCutoff, t0);
  noteFilter.frequency.exponentialRampToValueAtTime(
    endCutoff,
    t0 + 1.2 * decayScale,
  );

  // Dual-LFO analog tape wow (0.38 Hz) + flutter (2.2 Hz) pitch drift
  const wowLfo = ctx.createOscillator();
  wowLfo.type = 'sine';
  wowLfo.frequency.setValueAtTime(0.36 + (voiceIndex % 3) * 0.04, t0);
  const wowDepth = ctx.createGain();
  wowDepth.gain.value = isBass ? 2.5 : 4.5;
  wowLfo.connect(wowDepth);

  const flutterLfo = ctx.createOscillator();
  flutterLfo.type = 'sine';
  flutterLfo.frequency.setValueAtTime(2.15 + (voiceIndex % 2) * 0.2, t0);
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = isBass ? 1.0 : 1.8;
  flutterLfo.connect(flutterDepth);

  const mainOsc = ctx.createOscillator();
  if (shared.feltPeriodicWave) {
    mainOsc.setPeriodicWave(shared.feltPeriodicWave);
  } else {
    mainOsc.type = 'triangle';
  }
  mainOsc.frequency.setValueAtTime(freq, t0);
  wowDepth.connect(mainOsc.detune);
  flutterDepth.connect(mainOsc.detune);
  const mainGain = ctx.createGain();
  mainGain.gain.value = 0.62;
  mainOsc.connect(mainGain);
  mainGain.connect(tapeShaper);

  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(freq, t0);
  wowDepth.connect(bodyOsc.detune);
  flutterDepth.connect(bodyOsc.detune);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.44;
  bodyOsc.connect(bodyGain);
  bodyGain.connect(tapeShaper);

  tapeShaper.connect(noteFilter);
  noteFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.96, t0 + attackSec);
  envGain.gain.setTargetAtTime(
    peakGain * 0.5,
    t0 + attackSec,
    0.8 * decayScale,
  );

  return {
    oscs: [mainOsc, bodyOsc, wowLfo, flutterLfo],
    bufferSources: [],
    auxNodes: [tapeShaper, noteFilter, wowDepth, flutterDepth, mainGain, bodyGain],
    defaultReleaseSec: isMelody ? 0.25 : LOFI_TAPE_META.defaultReleaseSec,
  };
}
