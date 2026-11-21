import type { TimbreId } from '../../types/settings';
import { isAcousticSampleTimbre } from '../sampleBank';
import { buildFeltPianoVoice, FELT_PIANO_META } from './feltPiano';
import { buildGlassCelestaVoice, GLASS_CELESTA_META } from './glassCelesta';
import { buildJazzOrganVoice, JAZZ_ORGAN_META } from './jazzOrgan';
import { buildJunoPolyVoice, JUNO_POLY_META } from './junoPoly';
import {
  buildChamberCelloVoice,
  buildCleanGuitarVoice,
  buildConcertHarpVoice,
  buildFrenchHornVoice,
  buildGrandPianoVoice,
  buildHarmoniumVoice,
  buildNylonGuitarVoice,
  buildPipeOrganVoice,
  buildWarmStringsVoice,
  CHAMBER_CELLO_META,
  CLEAN_GUITAR_META,
  CONCERT_HARP_META,
  FRENCH_HORN_META,
  GRAND_PIANO_META,
  HARMONIUM_META,
  NYLON_GUITAR_META,
  PIPE_ORGAN_META,
  WARM_STRINGS_META,
} from './sampledVoices';
import { buildSatbChoirVoice, SATB_CHOIR_META } from './satbChoir';
import { buildSoftVibesVoice, SOFT_VIBES_META } from './softVibes';
import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  InstrumentVoiceBuilder,
  VoiceBuildParams,
} from './types';
import { buildVelvetPadVoice, VELVET_PAD_META } from './velvetPad';
import { buildWarmRhodesVoice, WARM_RHODES_META } from './warmRhodes';
import { buildWurlitzerVoice, WURLITZER_META } from './wurlitzer';

export const INSTRUMENT_PRESETS: readonly InstrumentPresetMeta[] = [
  VELVET_PAD_META,
  GRAND_PIANO_META,
  WARM_STRINGS_META,
  CHAMBER_CELLO_META,
  SATB_CHOIR_META,
  FRENCH_HORN_META,
  CONCERT_HARP_META,
  NYLON_GUITAR_META,
  CLEAN_GUITAR_META,
  HARMONIUM_META,
  PIPE_ORGAN_META,
  FELT_PIANO_META,
  WARM_RHODES_META,
  SOFT_VIBES_META,
  WURLITZER_META,
  JUNO_POLY_META,
  JAZZ_ORGAN_META,
  GLASS_CELESTA_META,
];

const META_BY_ID: Record<TimbreId, InstrumentPresetMeta> = {
  'velvet-pad': VELVET_PAD_META,
  'grand-piano': GRAND_PIANO_META,
  'warm-strings': WARM_STRINGS_META,
  'chamber-cello': CHAMBER_CELLO_META,
  'satb-choir': SATB_CHOIR_META,
  'french-horn': FRENCH_HORN_META,
  'concert-harp': CONCERT_HARP_META,
  'nylon-guitar': NYLON_GUITAR_META,
  'clean-guitar': CLEAN_GUITAR_META,
  harmonium: HARMONIUM_META,
  'pipe-organ': PIPE_ORGAN_META,
  'felt-piano': FELT_PIANO_META,
  'warm-rhodes': WARM_RHODES_META,
  'soft-vibes': SOFT_VIBES_META,
  wurlitzer: WURLITZER_META,
  'juno-poly': JUNO_POLY_META,
  'jazz-organ': JAZZ_ORGAN_META,
  'glass-celesta': GLASS_CELESTA_META,
};

const BUILDER_BY_ID: Record<TimbreId, InstrumentVoiceBuilder> = {
  'velvet-pad': buildVelvetPadVoice,
  'grand-piano': buildGrandPianoVoice,
  'warm-strings': buildWarmStringsVoice,
  'chamber-cello': buildChamberCelloVoice,
  'satb-choir': buildSatbChoirVoice,
  'french-horn': buildFrenchHornVoice,
  'concert-harp': buildConcertHarpVoice,
  'nylon-guitar': buildNylonGuitarVoice,
  'clean-guitar': buildCleanGuitarVoice,
  harmonium: buildHarmoniumVoice,
  'pipe-organ': buildPipeOrganVoice,
  'felt-piano': buildFeltPianoVoice,
  'warm-rhodes': buildWarmRhodesVoice,
  'soft-vibes': buildSoftVibesVoice,
  wurlitzer: buildWurlitzerVoice,
  'juno-poly': buildJunoPolyVoice,
  'jazz-organ': buildJazzOrganVoice,
  'glass-celesta': buildGlassCelestaVoice,
};

export function isSampledTimbre(id: TimbreId): boolean {
  return id === 'satb-choir' || isAcousticSampleTimbre(id);
}

export function getInstrumentPreset(id: TimbreId): InstrumentPresetMeta {
  return META_BY_ID[id] ?? VELVET_PAD_META;
}

export function buildInstrumentVoice(
  id: TimbreId,
  params: VoiceBuildParams,
): BuiltVoiceNodes {
  const builder = BUILDER_BY_ID[id] ?? buildVelvetPadVoice;
  return builder(params);
}
