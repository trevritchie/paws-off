import type { AcousticSampleTimbreId } from '../sampleBank';
import { buildFeltPianoVoice } from './feltPiano';
import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';
import { buildVelvetPadVoice } from './velvetPad';

export const GRAND_PIANO_META: InstrumentPresetMeta = {
  id: 'grand-piano',
  label: 'Grand Piano',
  subtitle: 'Salamander acoustic',
  category: 'keys',
  defaultReleaseSec: 0.34,
  rollStepSec: 0.009,
};

export const WARM_STRINGS_META: InstrumentPresetMeta = {
  id: 'warm-strings',
  label: 'Warm Strings',
  subtitle: 'Bowed ensemble',
  category: 'strings',
  defaultReleaseSec: 0.56,
  rollStepSec: 0.0,
};

export const CHAMBER_CELLO_META: InstrumentPresetMeta = {
  id: 'chamber-cello',
  label: 'Chamber Cello',
  subtitle: 'Rich bowed cello',
  category: 'strings',
  defaultReleaseSec: 0.52,
  rollStepSec: 0.0,
};

export const FRENCH_HORN_META: InstrumentPresetMeta = {
  id: 'french-horn',
  label: 'French Horn',
  subtitle: 'Warm brass choir',
  category: 'winds',
  defaultReleaseSec: 0.48,
  rollStepSec: 0.0,
};

export const CONCERT_HARP_META: InstrumentPresetMeta = {
  id: 'concert-harp',
  label: 'Concert Harp',
  subtitle: 'Plucked acoustic',
  category: 'strings',
  defaultReleaseSec: 0.45,
  rollStepSec: 0.024,
};

export const NYLON_GUITAR_META: InstrumentPresetMeta = {
  id: 'nylon-guitar',
  label: 'Nylon Guitar',
  subtitle: 'Classical acoustic',
  category: 'strings',
  defaultReleaseSec: 0.34,
  rollStepSec: 0.018,
};

export const CLEAN_GUITAR_META: InstrumentPresetMeta = {
  id: 'clean-guitar',
  label: 'Clean Guitar',
  subtitle: 'Warm jazz electric',
  category: 'strings',
  defaultReleaseSec: 0.36,
  rollStepSec: 0.014,
};

export const HARMONIUM_META: InstrumentPresetMeta = {
  id: 'harmonium',
  label: 'Harmonium',
  subtitle: 'Meditative reed organ',
  category: 'keys',
  defaultReleaseSec: 0.48,
  rollStepSec: 0.0,
};

export const PIPE_ORGAN_META: InstrumentPresetMeta = {
  id: 'pipe-organ',
  label: 'Pipe Organ',
  subtitle: 'Warm cathedral',
  category: 'keys',
  defaultReleaseSec: 0.42,
  rollStepSec: 0.0,
};

export const MARIMBA_META: InstrumentPresetMeta = {
  id: 'marimba',
  label: 'Rosewood Marimba',
  subtitle: 'Warm woody mallets',
  category: 'synths',
  defaultReleaseSec: 0.36,
  rollStepSec: 0.011,
};

export const WOODWIND_CHOIR_META: InstrumentPresetMeta = {
  id: 'woodwind-choir',
  label: 'Woodwind Choir',
  subtitle: 'Bassoon, clarinet & flute',
  category: 'winds',
  defaultReleaseSec: 0.44,
  rollStepSec: 0.0,
};

export const STEEL_GUITAR_META: InstrumentPresetMeta = {
  id: 'steel-guitar',
  label: 'Steel Guitar',
  subtitle: 'Bright acoustic folk',
  category: 'strings',
  defaultReleaseSec: 0.34,
  rollStepSec: 0.016,
};

export const PIZZICATO_STRINGS_META: InstrumentPresetMeta = {
  id: 'pizzicato-strings',
  label: 'Pizzicato Strings',
  subtitle: 'Plucked chamber strings',
  category: 'strings',
  defaultReleaseSec: 0.28,
  rollStepSec: 0.008,
};

export const WARM_SAX_META: InstrumentPresetMeta = {
  id: 'warm-sax',
  label: 'Warm Saxophone',
  subtitle: 'Velvet jazz sax',
  category: 'winds',
  defaultReleaseSec: 0.38,
  rollStepSec: 0.0,
};

export const WARM_TROMBONE_META: InstrumentPresetMeta = {
  id: 'warm-trombone',
  label: 'Trombone Choir',
  subtitle: 'Rich jazz brass',
  category: 'winds',
  defaultReleaseSec: 0.42,
  rollStepSec: 0.0,
};

interface SampleVoiceProfile {
  attackSec: number;
  gainBoost: number;
  bassCutoffHz: number;
  upperCutoffHz: number;
  defaultReleaseSec: number;
  fallback: 'piano' | 'pad';
}

const SAMPLE_PROFILES: Record<AcousticSampleTimbreId, SampleVoiceProfile> = {
  'grand-piano': {
    attackSec: 0.005,
    gainBoost: 2.25,
    bassCutoffHz: 3200,
    upperCutoffHz: 7400,
    defaultReleaseSec: GRAND_PIANO_META.defaultReleaseSec,
    fallback: 'piano',
  },
  'warm-strings': {
    attackSec: 0.22,
    gainBoost: 2.0,
    bassCutoffHz: 2400,
    upperCutoffHz: 5400,
    defaultReleaseSec: WARM_STRINGS_META.defaultReleaseSec,
    fallback: 'pad',
  },
  'chamber-cello': {
    attackSec: 0.14,
    gainBoost: 2.0,
    bassCutoffHz: 2600,
    upperCutoffHz: 5400,
    defaultReleaseSec: CHAMBER_CELLO_META.defaultReleaseSec,
    fallback: 'pad',
  },
  'french-horn': {
    attackSec: 0.12,
    gainBoost: 2.05,
    bassCutoffHz: 2000,
    upperCutoffHz: 4600,
    defaultReleaseSec: FRENCH_HORN_META.defaultReleaseSec,
    fallback: 'pad',
  },
  'concert-harp': {
    attackSec: 0.004,
    gainBoost: 2.2,
    bassCutoffHz: 3400,
    upperCutoffHz: 7600,
    defaultReleaseSec: CONCERT_HARP_META.defaultReleaseSec,
    fallback: 'piano',
  },
  'nylon-guitar': {
    attackSec: 0.004,
    gainBoost: 2.25,
    bassCutoffHz: 2800,
    upperCutoffHz: 6200,
    defaultReleaseSec: NYLON_GUITAR_META.defaultReleaseSec,
    fallback: 'piano',
  },
  'clean-guitar': {
    attackSec: 0.004,
    gainBoost: 2.2,
    bassCutoffHz: 3000,
    upperCutoffHz: 6400,
    defaultReleaseSec: CLEAN_GUITAR_META.defaultReleaseSec,
    fallback: 'piano',
  },
  harmonium: {
    attackSec: 0.14,
    gainBoost: 1.9,
    bassCutoffHz: 1900,
    upperCutoffHz: 3400,
    defaultReleaseSec: HARMONIUM_META.defaultReleaseSec,
    fallback: 'pad',
  },
  'pipe-organ': {
    attackSec: 0.06,
    gainBoost: 1.95,
    bassCutoffHz: 2200,
    upperCutoffHz: 4200,
    defaultReleaseSec: PIPE_ORGAN_META.defaultReleaseSec,
    fallback: 'pad',
  },
  marimba: {
    attackSec: 0.003,
    gainBoost: 2.2,
    bassCutoffHz: 2800,
    upperCutoffHz: 6200,
    defaultReleaseSec: MARIMBA_META.defaultReleaseSec,
    fallback: 'piano',
  },
  'woodwind-choir': {
    attackSec: 0.11,
    gainBoost: 2.0,
    bassCutoffHz: 2400,
    upperCutoffHz: 5600,
    defaultReleaseSec: WOODWIND_CHOIR_META.defaultReleaseSec,
    fallback: 'pad',
  },
  'steel-guitar': {
    attackSec: 0.004,
    gainBoost: 2.2,
    bassCutoffHz: 3200,
    upperCutoffHz: 7200,
    defaultReleaseSec: STEEL_GUITAR_META.defaultReleaseSec,
    fallback: 'piano',
  },
  'pizzicato-strings': {
    attackSec: 0.004,
    gainBoost: 2.2,
    bassCutoffHz: 2800,
    upperCutoffHz: 6200,
    defaultReleaseSec: PIZZICATO_STRINGS_META.defaultReleaseSec,
    fallback: 'piano',
  },
  'warm-sax': {
    attackSec: 0.09,
    gainBoost: 2.0,
    bassCutoffHz: 2200,
    upperCutoffHz: 4800,
    defaultReleaseSec: WARM_SAX_META.defaultReleaseSec,
    fallback: 'pad',
  },
  'warm-trombone': {
    attackSec: 0.1,
    gainBoost: 2.0,
    bassCutoffHz: 2000,
    upperCutoffHz: 4200,
    defaultReleaseSec: WARM_TROMBONE_META.defaultReleaseSec,
    fallback: 'pad',
  },
};

function buildAcousticSampleVoice(
  id: AcousticSampleTimbreId,
  params: VoiceBuildParams,
): BuiltVoiceNodes {
  const profile = SAMPLE_PROFILES[id];
  const sample = params.sampleBank?.getSample(id, params.note.midi) ?? null;

  if (!sample) {
    return profile.fallback === 'pad'
      ? buildVelvetPadVoice(params)
      : buildFeltPianoVoice(params);
  }

  const { ctx, now, t0, peakGain, note, envGain } = params;
  const isBass = note.role === 'bass';
  const isMelody = note.role === 'melody';

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.setValueAtTime(sample.playbackRate, now);

  if (sample.sustained) {
    src.loop = true;
    src.loopStart = Math.min(0.8, Math.max(0.2, sample.buffer.duration * 0.2));
    src.loopEnd = Math.max(src.loopStart + 0.5, sample.buffer.duration - 0.35);
  }

  const cutoffHz = isMelody
    ? Math.min(11000, profile.upperCutoffHz * 1.45)
    : isBass
      ? profile.bassCutoffHz
      : profile.upperCutoffHz;
  const attackSec = isMelody
    ? Math.min(profile.attackSec, 0.045)
    : profile.attackSec;
  const defaultReleaseSec = isMelody
    ? Math.min(profile.defaultReleaseSec, 0.22)
    : profile.defaultReleaseSec;

  const polishFilter = ctx.createBiquadFilter();
  polishFilter.type = 'lowpass';
  polishFilter.frequency.setValueAtTime(cutoffHz, now);
  polishFilter.Q.value = 0.5;

  src.connect(polishFilter);
  polishFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(
    peakGain * profile.gainBoost,
    t0 + attackSec,
  );

  return {
    oscs: [],
    bufferSources: [src],
    auxNodes: [polishFilter],
    defaultReleaseSec,
  };
}

export function buildGrandPianoVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('grand-piano', params);
}

export function buildWarmStringsVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('warm-strings', params);
}

export function buildChamberCelloVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('chamber-cello', params);
}

export function buildFrenchHornVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('french-horn', params);
}

export function buildConcertHarpVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('concert-harp', params);
}

export function buildNylonGuitarVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('nylon-guitar', params);
}

export function buildCleanGuitarVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('clean-guitar', params);
}

export function buildHarmoniumVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('harmonium', params);
}

export function buildPipeOrganVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('pipe-organ', params);
}

export function buildMarimbaVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('marimba', params);
}

export function buildWoodwindChoirVoice(
  params: VoiceBuildParams,
): BuiltVoiceNodes {
  return buildAcousticSampleVoice('woodwind-choir', params);
}

export function buildSteelGuitarVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('steel-guitar', params);
}

export function buildPizzicatoStringsVoice(
  params: VoiceBuildParams,
): BuiltVoiceNodes {
  return buildAcousticSampleVoice('pizzicato-strings', params);
}

export function buildWarmSaxVoice(params: VoiceBuildParams): BuiltVoiceNodes {
  return buildAcousticSampleVoice('warm-sax', params);
}

export function buildWarmTromboneVoice(
  params: VoiceBuildParams,
): BuiltVoiceNodes {
  return buildAcousticSampleVoice('warm-trombone', params);
}
