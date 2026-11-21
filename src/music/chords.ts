import type {
  ChordId,
  ChordInversion,
  DiatonicChordId,
  HalfDimNaming,
  InversionNotation,
  PitchClass,
  ScaleDegree,
  SecondaryDominantId,
  SecondarySeventhId,
  SecondaryTriadId,
  SessionSettings,
  SeventhId,
  TriadId,
} from '../types/settings';

export interface MajorKeyInfo {
  pitchClass: PitchClass;
  shortName: string;
  displayName: string;
  spokenName: string;
}

export const MAJOR_KEYS: readonly MajorKeyInfo[] = [
  { pitchClass: 0, shortName: 'C', displayName: 'C Major', spokenName: 'C' },
  { pitchClass: 1, shortName: 'D♭', displayName: 'D♭ Major', spokenName: 'D flat' },
  { pitchClass: 2, shortName: 'D', displayName: 'D Major', spokenName: 'D' },
  { pitchClass: 3, shortName: 'E♭', displayName: 'E♭ Major', spokenName: 'E flat' },
  { pitchClass: 4, shortName: 'E', displayName: 'E Major', spokenName: 'E' },
  { pitchClass: 5, shortName: 'F', displayName: 'F Major', spokenName: 'F' },
  { pitchClass: 6, shortName: 'F♯', displayName: 'F♯ Major', spokenName: 'F sharp' },
  { pitchClass: 7, shortName: 'G', displayName: 'G Major', spokenName: 'G' },
  { pitchClass: 8, shortName: 'A♭', displayName: 'A♭ Major', spokenName: 'A flat' },
  { pitchClass: 9, shortName: 'A', displayName: 'A Major', spokenName: 'A' },
  { pitchClass: 10, shortName: 'B♭', displayName: 'B♭ Major', spokenName: 'B flat' },
  { pitchClass: 11, shortName: 'B', displayName: 'B Major', spokenName: 'B' },
] as const;

export function getMajorKeyInfo(pitchClass: PitchClass): MajorKeyInfo {
  return MAJOR_KEYS[pitchClass];
}

export function getSpokenKeyPhrase(pitchClass: PitchClass): string {
  return `Key of ${getMajorKeyInfo(pitchClass).spokenName} major`;
}

export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;

export function getMajorScalePitchClasses(key: PitchClass): Set<number> {
  return new Set(MAJOR_SCALE_INTERVALS.map((interval) => (key + interval) % 12));
}

export function getScaleDegreePitchClass(
  key: PitchClass,
  degree: ScaleDegree,
): PitchClass {
  return ((key + MAJOR_SCALE_INTERVALS[degree - 1]) % 12) as PitchClass;
}

export const TRIAD_IDS: readonly TriadId[] = [
  'I',
  'ii',
  'iii',
  'IV',
  'V',
  'vi',
  'viio',
];

export const SEVENTH_IDS: readonly SeventhId[] = [
  'Imaj7',
  'ii7',
  'iii7',
  'IVmaj7',
  'V7',
  'vi7',
  'viihalfdim7',
];

export const DIATONIC_CHORD_IDS: readonly DiatonicChordId[] = [
  ...TRIAD_IDS,
  ...SEVENTH_IDS,
];

export const SECONDARY_TRIAD_IDS: readonly SecondaryTriadId[] = [
  'V/ii',
  'V/iii',
  'V/V',
  'V/vi',
];

export const SECONDARY_SEVENTH_IDS: readonly SecondarySeventhId[] = [
  'V7/ii',
  'V7/iii',
  'V7/IV',
  'V7/V',
  'V7/vi',
];

export const ALL_SECONDARY_DOMINANT_IDS: readonly SecondaryDominantId[] = [
  ...SECONDARY_TRIAD_IDS,
  ...SECONDARY_SEVENTH_IDS,
];

const SECONDARY_DOMINANT_SET = new Set<string>(ALL_SECONDARY_DOMINANT_IDS);

export function isSecondaryDominantId(id: ChordId): id is SecondaryDominantId {
  return SECONDARY_DOMINANT_SET.has(id);
}

export const ALL_CHORD_IDS: readonly ChordId[] = [
  ...DIATONIC_CHORD_IDS,
  ...ALL_SECONDARY_DOMINANT_IDS,
];

export interface ChordDefinition {
  id: ChordId;
  category: 'triad' | 'seventh' | 'secondary-triad' | 'secondary-seventh';
  symbol: string;
  rootOffset: number;
  intervals: readonly number[];
  upperIntervals: readonly [number, number, number];
  spokenLabel: string;
  estimatedSyllables: number;
  spokenQualityLabel?: string;
  estimatedQualitySyllables?: number;
  /** Target triad and seventh chord that a secondary dominant resolves to. */
  resolvesTo?: readonly [TriadId, SeventhId];
}

export const CHORD_DEFS: Record<ChordId, ChordDefinition> = {
  I: {
    id: 'I',
    category: 'triad',
    symbol: 'I',
    rootOffset: 0,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'One',
    estimatedSyllables: 1,
    spokenQualityLabel: 'One major',
    estimatedQualitySyllables: 3,
  },
  ii: {
    id: 'ii',
    category: 'triad',
    symbol: 'ii',
    rootOffset: 2,
    intervals: [0, 3, 7],
    upperIntervals: [0, 3, 7],
    spokenLabel: 'Two',
    estimatedSyllables: 1,
    spokenQualityLabel: 'Two minor',
    estimatedQualitySyllables: 3,
  },
  iii: {
    id: 'iii',
    category: 'triad',
    symbol: 'iii',
    rootOffset: 4,
    intervals: [0, 3, 7],
    upperIntervals: [0, 3, 7],
    spokenLabel: 'Three',
    estimatedSyllables: 1,
    spokenQualityLabel: 'Three minor',
    estimatedQualitySyllables: 3,
  },
  IV: {
    id: 'IV',
    category: 'triad',
    symbol: 'IV',
    rootOffset: 5,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'Four',
    estimatedSyllables: 1,
    spokenQualityLabel: 'Four major',
    estimatedQualitySyllables: 3,
  },
  V: {
    id: 'V',
    category: 'triad',
    symbol: 'V',
    rootOffset: 7,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'Five',
    estimatedSyllables: 1,
    spokenQualityLabel: 'Five major',
    estimatedQualitySyllables: 3,
  },
  vi: {
    id: 'vi',
    category: 'triad',
    symbol: 'vi',
    rootOffset: 9,
    intervals: [0, 3, 7],
    upperIntervals: [0, 3, 7],
    spokenLabel: 'Six',
    estimatedSyllables: 1,
    spokenQualityLabel: 'Six minor',
    estimatedQualitySyllables: 3,
  },
  viio: {
    id: 'viio',
    category: 'triad',
    symbol: 'vii°',
    rootOffset: 11,
    intervals: [0, 3, 6],
    upperIntervals: [0, 3, 6],
    spokenLabel: 'Seven',
    estimatedSyllables: 2,
    spokenQualityLabel: 'Seven diminished',
    estimatedQualitySyllables: 5,
  },
  Imaj7: {
    id: 'Imaj7',
    category: 'seventh',
    symbol: 'Imaj7',
    rootOffset: 0,
    intervals: [0, 4, 7, 11],
    upperIntervals: [4, 7, 11],
    spokenLabel: 'One major seven',
    estimatedSyllables: 5,
  },
  ii7: {
    id: 'ii7',
    category: 'seventh',
    symbol: 'ii7',
    rootOffset: 2,
    intervals: [0, 3, 7, 10],
    upperIntervals: [3, 7, 10],
    spokenLabel: 'Two minor seven',
    estimatedSyllables: 5,
  },
  iii7: {
    id: 'iii7',
    category: 'seventh',
    symbol: 'iii7',
    rootOffset: 4,
    intervals: [0, 3, 7, 10],
    upperIntervals: [3, 7, 10],
    spokenLabel: 'Three minor seven',
    estimatedSyllables: 5,
  },
  IVmaj7: {
    id: 'IVmaj7',
    category: 'seventh',
    symbol: 'IVmaj7',
    rootOffset: 5,
    intervals: [0, 4, 7, 11],
    upperIntervals: [4, 7, 11],
    spokenLabel: 'Four major seven',
    estimatedSyllables: 5,
  },
  V7: {
    id: 'V7',
    category: 'seventh',
    symbol: 'V7',
    rootOffset: 7,
    intervals: [0, 4, 7, 10],
    upperIntervals: [4, 7, 10],
    spokenLabel: 'Five seven',
    estimatedSyllables: 3,
  },
  vi7: {
    id: 'vi7',
    category: 'seventh',
    symbol: 'vi7',
    rootOffset: 9,
    intervals: [0, 3, 7, 10],
    upperIntervals: [3, 7, 10],
    spokenLabel: 'Six minor seven',
    estimatedSyllables: 5,
  },
  viihalfdim7: {
    id: 'viihalfdim7',
    category: 'seventh',
    symbol: 'viiø7',
    rootOffset: 11,
    intervals: [0, 3, 6, 10],
    upperIntervals: [3, 6, 10],
    spokenLabel: 'Seven half diminished',
    estimatedSyllables: 6,
  },
  'V/ii': {
    id: 'V/ii',
    category: 'secondary-triad',
    symbol: 'V/ii',
    rootOffset: 9,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'Five of two',
    estimatedSyllables: 3,
    resolvesTo: ['ii', 'ii7'],
  },
  'V/iii': {
    id: 'V/iii',
    category: 'secondary-triad',
    symbol: 'V/iii',
    rootOffset: 11,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'Five of three',
    estimatedSyllables: 3,
    resolvesTo: ['iii', 'iii7'],
  },
  'V/V': {
    id: 'V/V',
    category: 'secondary-triad',
    symbol: 'V/V',
    rootOffset: 2,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'Five of five',
    estimatedSyllables: 3,
    resolvesTo: ['V', 'V7'],
  },
  'V/vi': {
    id: 'V/vi',
    category: 'secondary-triad',
    symbol: 'V/vi',
    rootOffset: 4,
    intervals: [0, 4, 7],
    upperIntervals: [0, 4, 7],
    spokenLabel: 'Five of six',
    estimatedSyllables: 3,
    resolvesTo: ['vi', 'vi7'],
  },
  'V7/ii': {
    id: 'V7/ii',
    category: 'secondary-seventh',
    symbol: 'V7/ii',
    rootOffset: 9,
    intervals: [0, 4, 7, 10],
    upperIntervals: [4, 7, 10],
    spokenLabel: 'Five seven of two',
    estimatedSyllables: 5,
    resolvesTo: ['ii', 'ii7'],
  },
  'V7/iii': {
    id: 'V7/iii',
    category: 'secondary-seventh',
    symbol: 'V7/iii',
    rootOffset: 11,
    intervals: [0, 4, 7, 10],
    upperIntervals: [4, 7, 10],
    spokenLabel: 'Five seven of three',
    estimatedSyllables: 5,
    resolvesTo: ['iii', 'iii7'],
  },
  'V7/IV': {
    id: 'V7/IV',
    category: 'secondary-seventh',
    symbol: 'V7/IV',
    rootOffset: 0,
    intervals: [0, 4, 7, 10],
    upperIntervals: [4, 7, 10],
    spokenLabel: 'Five seven of four',
    estimatedSyllables: 5,
    resolvesTo: ['IV', 'IVmaj7'],
  },
  'V7/V': {
    id: 'V7/V',
    category: 'secondary-seventh',
    symbol: 'V7/V',
    rootOffset: 2,
    intervals: [0, 4, 7, 10],
    upperIntervals: [4, 7, 10],
    spokenLabel: 'Five seven of five',
    estimatedSyllables: 5,
    resolvesTo: ['V', 'V7'],
  },
  'V7/vi': {
    id: 'V7/vi',
    category: 'secondary-seventh',
    symbol: 'V7/vi',
    rootOffset: 4,
    intervals: [0, 4, 7, 10],
    upperIntervals: [4, 7, 10],
    spokenLabel: 'Five seven of six',
    estimatedSyllables: 5,
    resolvesTo: ['vi', 'vi7'],
  },
};

export function isSeventhChordId(id: ChordId): boolean {
  const cat = CHORD_DEFS[id].category;
  return cat === 'seventh' || cat === 'secondary-seventh';
}

export function getMaxInversionForChord(id: ChordId): 2 | 3 {
  return isSeventhChordId(id) ? 3 : 2;
}

export function getAllowedInversionsForChord(
  chordId: ChordId,
  settings: Pick<
    SessionSettings,
    'triadInversions' | 'seventhInversions' | 'chordInversionOverrides'
  >,
): ChordInversion[] {
  const maxInv = getMaxInversionForChord(chordId);
  const override = settings.chordInversionOverrides[chordId];
  if (override && override.length > 0) {
    const valid = override.filter((inv) => inv >= 0 && inv <= maxInv);
    if (valid.length > 0) return valid;
  }
  const globalPool = isSeventhChordId(chordId)
    ? settings.seventhInversions
    : settings.triadInversions;
  const filtered = globalPool.filter(
    (inv): inv is ChordInversion => inv >= 0 && inv <= maxInv,
  );
  return filtered.length > 0 ? filtered : [0];
}

export function getChordBassOffset(
  chordId: ChordId,
  inversion: ChordInversion,
): PitchClass {
  const def = CHORD_DEFS[chordId];
  const safeInv = Math.min(inversion, def.intervals.length - 1);
  return ((def.rootOffset + (def.intervals[safeInv] ?? 0)) % 12) as PitchClass;
}

const CHORD_AVAILABLE_TENSIONS: Record<ChordId, readonly number[]> = {
  I: [2, 9],
  Imaj7: [2, 9],
  ii: [2, 5],
  ii7: [2, 5],
  iii: [5],
  iii7: [5],
  IV: [2, 6, 9],
  IVmaj7: [2, 6, 9],
  V: [2, 9],
  V7: [2, 9],
  vi: [2, 5],
  vi7: [2, 5],
  viio: [5, 8],
  viihalfdim7: [5, 8],
  'V/ii': [2, 8],
  'V7/ii': [2, 8],
  'V/iii': [1, 8],
  'V7/iii': [1, 8],
  'V7/IV': [2, 9],
  'V/V': [2, 9],
  'V7/V': [2, 9],
  'V/vi': [1, 8],
  'V7/vi': [1, 8],
};

/**
 * Available chord-scale tensions in semitones above the chord root,
 * excluding b9 avoid-note clashes while staying diatonic to the parent key.
 */
export function getChordAvailableTensionOffsets(
  chordId: ChordId,
): readonly number[] {
  return CHORD_AVAILABLE_TENSIONS[chordId];
}

const SECONDARY_SCALE_OFFSETS: Partial<Record<ChordId, readonly number[]>> = {
  'V/ii': [1, 2, 4, 5, 7, 9, 11],
  'V7/ii': [1, 2, 4, 5, 7, 9, 11],
  'V/iii': [0, 2, 3, 4, 6, 9, 11],
  'V7/iii': [0, 2, 3, 4, 6, 9, 11],
  'V7/IV': [0, 2, 4, 5, 7, 9, 10],
  'V/V': [0, 2, 4, 6, 7, 9, 11],
  'V7/V': [0, 2, 4, 6, 7, 9, 11],
  'V/vi': [0, 2, 4, 5, 8, 9, 11],
  'V7/vi': [0, 2, 4, 5, 8, 9, 11],
};

/**
 * 7-note pitch-class scale for stepwise passing tones over a chord, swapping
 * any diatonic tone altered by a secondary dominant's chromatic pitches.
 */
export function getChordScalePitchClasses(
  chordId: ChordId,
  key: PitchClass,
): Set<number> {
  const customOffsets = SECONDARY_SCALE_OFFSETS[chordId];
  if (!customOffsets) {
    return getMajorScalePitchClasses(key);
  }
  return new Set(customOffsets.map((offset) => (key + offset) % 12));
}

export function getChordBassPitchClass(
  chordId: ChordId,
  inversion: ChordInversion,
  key: PitchClass,
): PitchClass {
  return ((key + getChordBassOffset(chordId, inversion)) % 12) as PitchClass;
}

const BASS_SCALE_INFO: Record<
  PitchClass,
  {
    degreeDisplay: string;
    degreeSpoken: string;
    degreeSyllables: number;
    solfegeDisplay: string;
    solfegeSpoken: string;
    solfegeSyllables: number;
  }
> = {
  0: {
    degreeDisplay: '1',
    degreeSpoken: 'over degree one',
    degreeSyllables: 5,
    solfegeDisplay: 'Do',
    solfegeSpoken: 'over do',
    solfegeSyllables: 3,
  },
  1: {
    degreeDisplay: '♯1',
    degreeSpoken: 'over degree sharp one',
    degreeSyllables: 6,
    solfegeDisplay: 'Di',
    solfegeSpoken: 'over di',
    solfegeSyllables: 3,
  },
  2: {
    degreeDisplay: '2',
    degreeSpoken: 'over degree two',
    degreeSyllables: 5,
    solfegeDisplay: 'Re',
    solfegeSpoken: 'over re',
    solfegeSyllables: 3,
  },
  3: {
    degreeDisplay: '♯2',
    degreeSpoken: 'over degree sharp two',
    degreeSyllables: 6,
    solfegeDisplay: 'Ri',
    solfegeSpoken: 'over ri',
    solfegeSyllables: 3,
  },
  4: {
    degreeDisplay: '3',
    degreeSpoken: 'over degree three',
    degreeSyllables: 5,
    solfegeDisplay: 'Mi',
    solfegeSpoken: 'over mi',
    solfegeSyllables: 3,
  },
  5: {
    degreeDisplay: '4',
    degreeSpoken: 'over degree four',
    degreeSyllables: 5,
    solfegeDisplay: 'Fa',
    solfegeSpoken: 'over fa',
    solfegeSyllables: 3,
  },
  6: {
    degreeDisplay: '♯4',
    degreeSpoken: 'over degree sharp four',
    degreeSyllables: 6,
    solfegeDisplay: 'Fi',
    solfegeSpoken: 'over fi',
    solfegeSyllables: 3,
  },
  7: {
    degreeDisplay: '5',
    degreeSpoken: 'over degree five',
    degreeSyllables: 5,
    solfegeDisplay: 'Sol',
    solfegeSpoken: 'over sol',
    solfegeSyllables: 3,
  },
  8: {
    degreeDisplay: '♯5',
    degreeSpoken: 'over degree sharp five',
    degreeSyllables: 6,
    solfegeDisplay: 'Si',
    solfegeSpoken: 'over si',
    solfegeSyllables: 3,
  },
  9: {
    degreeDisplay: '6',
    degreeSpoken: 'over degree six',
    degreeSyllables: 5,
    solfegeDisplay: 'La',
    solfegeSpoken: 'over la',
    solfegeSyllables: 3,
  },
  10: {
    degreeDisplay: '♭7',
    degreeSpoken: 'over degree flat seven',
    degreeSyllables: 7,
    solfegeDisplay: 'Te',
    solfegeSpoken: 'over te',
    solfegeSyllables: 3,
  },
  11: {
    degreeDisplay: '7',
    degreeSpoken: 'over degree seven',
    degreeSyllables: 6,
    solfegeDisplay: 'Ti',
    solfegeSpoken: 'over ti',
    solfegeSyllables: 3,
  },
};

const INVERSION_NAME_SHORT: Record<1 | 2 | 3, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
};

const BASS_TONE_SHORT: Record<1 | 2 | 3, string> = {
  1: '3rd in bass',
  2: '5th in bass',
  3: '7th in bass',
};

const TRIAD_FIGURES: Record<1 | 2, string> = {
  1: '⁶',
  2: '⁶₄',
};

const SEVENTH_FIGURES: Record<1 | 2 | 3, string> = {
  1: '⁶₅',
  2: '⁴₃',
  3: '⁴₂',
};

export interface FormattedChordDisplay {
  primary: string;
  secondary?: string;
  inline: string;
}

export function formatChordDisplay(
  chordId: ChordId,
  inversion: ChordInversion,
  notation: InversionNotation = 'inversion-name',
): FormattedChordDisplay {
  const def = CHORD_DEFS[chordId];
  const isSeventh = isSeventhChordId(chordId);
  const maxInv = isSeventh ? 3 : 2;
  const inv = Math.min(inversion, maxInv) as ChordInversion;

  if (inv === 0) {
    return { primary: def.symbol, inline: def.symbol };
  }

  if (notation === 'inversion-name') {
    const label = INVERSION_NAME_SHORT[inv as 1 | 2 | 3];
    return {
      primary: def.symbol,
      secondary: label,
      inline: `${def.symbol} (${label})`,
    };
  }

  if (notation === 'bass-tone') {
    const label = BASS_TONE_SHORT[inv as 1 | 2 | 3];
    return {
      primary: def.symbol,
      secondary: label,
      inline: `${def.symbol} (${label})`,
    };
  }

  if (notation === 'scale-degree') {
    const info = BASS_SCALE_INFO[getChordBassOffset(chordId, inv)];
    const label = `over ${info.degreeDisplay}`;
    return {
      primary: def.symbol,
      secondary: label,
      inline: `${def.symbol} (${label})`,
    };
  }

  if (notation === 'solfege') {
    const info = BASS_SCALE_INFO[getChordBassOffset(chordId, inv)];
    const label = `over ${info.solfegeDisplay}`;
    return {
      primary: def.symbol,
      secondary: label,
      inline: `${def.symbol} (${label})`,
    };
  }

  // Figured bass notation
  const fig = isSeventh
    ? SEVENTH_FIGURES[inv as 1 | 2 | 3]
    : TRIAD_FIGURES[inv as 1 | 2];

  if (def.symbol.includes('/')) {
    const [head, tail] = def.symbol.split('/');
    const baseHead = isSeventh && head.endsWith('7') ? head.slice(0, -1) : head;
    const figured = `${baseHead}${fig}/${tail}`;
    return { primary: figured, inline: figured };
  }

  const baseSymbol =
    isSeventh && def.symbol.endsWith('7') ? def.symbol.slice(0, -1) : def.symbol;
  const figured = `${baseSymbol}${fig}`;
  return { primary: figured, inline: figured };
}

const INVERSION_NAME_SPOKEN: Record<
  1 | 2 | 3,
  { text: string; syllables: number }
> = {
  1: { text: 'first inversion', syllables: 4 },
  2: { text: 'second inversion', syllables: 5 },
  3: { text: 'third inversion', syllables: 4 },
};

const BASS_TONE_SPOKEN: Record<1 | 2 | 3, { text: string; syllables: number }> =
  {
    1: { text: 'third in bass', syllables: 3 },
    2: { text: 'fifth in bass', syllables: 3 },
    3: { text: 'seventh in bass', syllables: 4 },
  };

const CHROMATIC_PITCH_CLASSES: readonly PitchClass[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
];

export function getInversionSuffixPhrases(
  notation: InversionNotation,
): readonly string[] {
  if (notation === 'bass-tone') {
    return [
      BASS_TONE_SPOKEN[1].text,
      BASS_TONE_SPOKEN[2].text,
      BASS_TONE_SPOKEN[3].text,
    ];
  }
  if (notation === 'scale-degree') {
    return CHROMATIC_PITCH_CLASSES.map(
      (pc) => BASS_SCALE_INFO[pc].degreeSpoken,
    );
  }
  if (notation === 'solfege') {
    return CHROMATIC_PITCH_CLASSES.map(
      (pc) => BASS_SCALE_INFO[pc].solfegeSpoken,
    );
  }
  return [
    INVERSION_NAME_SPOKEN[1].text,
    INVERSION_NAME_SPOKEN[2].text,
    INVERSION_NAME_SPOKEN[3].text,
  ];
}

export function getSpokenChordPhrase(
  chordId: ChordId,
  halfDimNaming: HalfDimNaming,
  announceTriadQuality = false,
  inversion: ChordInversion = 0,
  inversionNotation: InversionNotation = 'inversion-name',
): { text: string; estimatedSyllables: number } {
  let baseText: string;
  let baseSyllables: number;

  if (chordId === 'viihalfdim7' && halfDimNaming === 'minor-seven-flat-five') {
    baseText = 'Seven minor seven flat five';
    baseSyllables = 8;
  } else {
    const def = CHORD_DEFS[chordId];
    if (announceTriadQuality && def.spokenQualityLabel) {
      baseText = def.spokenQualityLabel;
      baseSyllables = def.estimatedQualitySyllables ?? def.estimatedSyllables;
    } else {
      baseText = def.spokenLabel;
      baseSyllables = def.estimatedSyllables;
    }
  }

  const maxInv = getMaxInversionForChord(chordId);
  const inv = Math.min(inversion, maxInv) as ChordInversion;
  if (inv === 0) {
    return {
      text: baseText,
      estimatedSyllables: baseSyllables,
    };
  }

  let suffixText: string;
  let suffixSyllables: number;

  if (inversionNotation === 'bass-tone') {
    const entry = BASS_TONE_SPOKEN[inv as 1 | 2 | 3];
    suffixText = entry.text;
    suffixSyllables = entry.syllables;
  } else if (inversionNotation === 'scale-degree') {
    const info = BASS_SCALE_INFO[getChordBassOffset(chordId, inv)];
    suffixText = info.degreeSpoken;
    suffixSyllables = info.degreeSyllables;
  } else if (inversionNotation === 'solfege') {
    const info = BASS_SCALE_INFO[getChordBassOffset(chordId, inv)];
    suffixText = info.solfegeSpoken;
    suffixSyllables = info.solfegeSyllables;
  } else {
    const entry = INVERSION_NAME_SPOKEN[inv as 1 | 2 | 3];
    suffixText = entry.text;
    suffixSyllables = entry.syllables;
  }

  return {
    text: `${baseText} ${suffixText}`,
    estimatedSyllables: baseSyllables + suffixSyllables,
  };
}

export interface ChordPreset {
  id: string;
  label: string;
  chords: readonly DiatonicChordId[];
}

export const CHORD_PRESETS: readonly ChordPreset[] = [
  { id: 'essential', label: 'Essential', chords: ['I', 'IV', 'V', 'vi'] },
  { id: 'all-triads', label: 'All Triads', chords: TRIAD_IDS },
  { id: 'all-sevenths', label: 'All Sevenths', chords: SEVENTH_IDS },
  { id: 'all', label: 'All 14', chords: DIATONIC_CHORD_IDS },
];

export interface SecondaryDominantPreset {
  id: string;
  label: string;
  chords: readonly SecondaryDominantId[];
}

export const SECONDARY_DOMINANT_PRESETS: readonly SecondaryDominantPreset[] = [
  { id: 'sec-triads', label: 'All Triads', chords: SECONDARY_TRIAD_IDS },
  { id: 'sec-sevenths', label: 'All 7ths', chords: SECONDARY_SEVENTH_IDS },
  { id: 'sec-all', label: 'All 9', chords: ALL_SECONDARY_DOMINANT_IDS },
];
