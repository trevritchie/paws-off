import type { TimbreId } from '../../types/settings';
import { isAcousticSampleTimbre } from '../sampleBank';
import { ANALOG_BRASS_META, buildAnalogBrassVoice } from './analogBrass';
import { buildFeltPianoVoice, FELT_PIANO_META } from './feltPiano';
import { buildGlassCelestaVoice, GLASS_CELESTA_META } from './glassCelesta';
import { buildHarpsichordVoice, HARPSICHORD_META } from './harpsichord';
import { buildJazzOrganVoice, JAZZ_ORGAN_META } from './jazzOrgan';
import { buildJunoPolyVoice, JUNO_POLY_META } from './junoPoly';
import { buildKalimbaVoice, KALIMBA_META } from './kalimba';
import { buildLofiTapeVoice, LOFI_TAPE_META } from './lofiTape';
import { buildRetro8BitVoice, RETRO_8BIT_META } from './retro8Bit';
import {
  buildChamberCelloVoice,
  buildCleanGuitarVoice,
  buildConcertHarpVoice,
  buildFrenchHornVoice,
  buildGrandPianoVoice,
  buildHarmoniumVoice,
  buildMarimbaVoice,
  buildNylonGuitarVoice,
  buildPipeOrganVoice,
  buildPizzicatoStringsVoice,
  buildSteelGuitarVoice,
  buildWarmSaxVoice,
  buildWarmStringsVoice,
  buildWarmTromboneVoice,
  buildWoodwindChoirVoice,
  CHAMBER_CELLO_META,
  CLEAN_GUITAR_META,
  CONCERT_HARP_META,
  FRENCH_HORN_META,
  GRAND_PIANO_META,
  HARMONIUM_META,
  MARIMBA_META,
  NYLON_GUITAR_META,
  PIPE_ORGAN_META,
  PIZZICATO_STRINGS_META,
  STEEL_GUITAR_META,
  WARM_SAX_META,
  WARM_STRINGS_META,
  WARM_TROMBONE_META,
  WOODWIND_CHOIR_META,
} from './sampledVoices';
import { buildSatbChoirVoice, SATB_CHOIR_META } from './satbChoir';
import { buildShimmerPadVoice, SHIMMER_PAD_META } from './shimmerPad';
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
  GRAND_PIANO_META,
  VELVET_PAD_META,
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
  MARIMBA_META,
  WOODWIND_CHOIR_META,
  STEEL_GUITAR_META,
  PIZZICATO_STRINGS_META,
  WARM_SAX_META,
  WARM_TROMBONE_META,
  LOFI_TAPE_META,
  HARPSICHORD_META,
  KALIMBA_META,
  ANALOG_BRASS_META,
  RETRO_8BIT_META,
  SHIMMER_PAD_META,
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
  marimba: MARIMBA_META,
  'woodwind-choir': WOODWIND_CHOIR_META,
  'steel-guitar': STEEL_GUITAR_META,
  'pizzicato-strings': PIZZICATO_STRINGS_META,
  'warm-sax': WARM_SAX_META,
  'warm-trombone': WARM_TROMBONE_META,
  'lofi-tape': LOFI_TAPE_META,
  harpsichord: HARPSICHORD_META,
  kalimba: KALIMBA_META,
  'analog-brass': ANALOG_BRASS_META,
  'retro-8bit': RETRO_8BIT_META,
  'shimmer-pad': SHIMMER_PAD_META,
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
  marimba: buildMarimbaVoice,
  'woodwind-choir': buildWoodwindChoirVoice,
  'steel-guitar': buildSteelGuitarVoice,
  'pizzicato-strings': buildPizzicatoStringsVoice,
  'warm-sax': buildWarmSaxVoice,
  'warm-trombone': buildWarmTromboneVoice,
  'lofi-tape': buildLofiTapeVoice,
  harpsichord: buildHarpsichordVoice,
  kalimba: buildKalimbaVoice,
  'analog-brass': buildAnalogBrassVoice,
  'retro-8bit': buildRetro8BitVoice,
  'shimmer-pad': buildShimmerPadVoice,
};

export function isSampledTimbre(id: TimbreId): boolean {
  return id === 'satb-choir' || isAcousticSampleTimbre(id);
}

export function getInstrumentPreset(id: TimbreId): InstrumentPresetMeta {
  return META_BY_ID[id] ?? GRAND_PIANO_META;
}

export function buildInstrumentVoice(
  id: TimbreId,
  params: VoiceBuildParams,
): BuiltVoiceNodes {
  const builder = BUILDER_BY_ID[id] ?? buildGrandPianoVoice;
  return builder(params);
}
